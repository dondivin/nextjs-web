'use server'
import { revalidatePath } from 'next/cache'
import { actionUser, payloadClient, run } from '@/backoffice/lib/server'
import { groupSchema, loungeSchema, type GroupForm, type LoungeForm } from '@/backoffice/lib/forms'
import { clearChatCache } from '@/chat/data'
import { setMembership, setRoomAdmin } from '@/chat/groups'
import { AvatarError, dropMedia, storeAvatar } from '@/chat/avatar'
import { isGradient } from '@/chat/gradient'
import { shredRoom } from '@/chat/crypto'

const done = (id?: string) => { revalidatePath('/admin/groups'); if (id) revalidatePath('/admin/groups/' + id) }

export async function saveGroup(id: string | null, input: GroupForm) {
  return run(async () => {
    const me = await actionUser('moderator')
    const data = groupSchema.parse(input)
    const payload = await payloadClient()
    const doc = id
      ? await payload.update({ collection: 'chat-rooms', id, data })
      : await payload.create({ collection: 'chat-rooms', data: { ...data, createdBy: me.id } })
    done(String(doc.id))
    return String(doc.id)
  })
}

/** Deletes the room, its memberships and its messages. (To keep the history, switch it off instead.) */
export async function deleteGroup(id: string) {
  return run(async () => {
    await actionUser('moderator')
    const payload = await payloadClient()
    await payload.delete({ collection: 'chat-room-members', where: { room: { equals: id } }, overrideAccess: true })
    await payload.delete({ collection: 'chat-messages', where: { room: { equals: 'g:' + id } }, overrideAccess: true })
    await shredRoom(payload, 'g:' + id)   // the room's conversation key goes too
    await payload.delete({ collection: 'chat-rooms', id })
    done()
  })
}

/** Make every existing account a member (for "auto-add" rooms created after people signed up). */
export async function addAllMembers(id: string) {
  return run(async () => {
    await actionUser('moderator')
    const payload = await payloadClient()
    const all = await payload.find({ collection: 'members', where: { status: { not_equals: 'banned' } }, pagination: false, depth: 0, select: {}, overrideAccess: true })
    for (const m of all.docs) await setMembership(payload, id, String(m.id), 'member')
    done(id)
    return all.docs.length
  })
}

/** invite (they accept in the chat) · accept / decline a request · remove a member or cancel an invite. */
export async function setGroupMember(roomId: string, memberId: string, action: 'invite' | 'accept' | 'decline' | 'remove' | 'add' | 'admin' | 'unadmin') {
  return run(async () => {
    await actionUser('moderator')
    const payload = await payloadClient()
    if (action === 'admin' || action === 'unadmin') { await setRoomAdmin(payload, roomId, memberId, action === 'admin'); done(roomId); return }
    const status = action === 'invite' ? 'invited' : action === 'accept' || action === 'add' ? 'member' : null
    await setMembership(payload, roomId, memberId, status)
    done(roomId)
  })
}

/** Username search for the invite box. */
export async function findMembers(q: string) {
  return run(async () => {
    await actionUser('moderator')
    const key = String(q || '').trim().toLowerCase()
    if (key.length < 2) return []
    const payload = await payloadClient()
    const res = await payload.find({ collection: 'members', where: { and: [{ nameKey: { like: key } }, { status: { not_equals: 'banned' } }] }, limit: 12, depth: 0, overrideAccess: true, select: { displayName: true, avatarGradient: true } })
    return res.docs.map((m) => ({ id: String(m.id), name: m.displayName, gradient: m.avatarGradient || null }))
  })
}

/** The built-in Community lounge: texts per language + who can post (stored on Chat settings → lounge). */
export async function saveLounge(input: LoungeForm) {
  return run(async () => {
    await actionUser('moderator')
    const d = loungeSchema.parse(input)
    const clean = (rows: LoungeForm['name']) => rows.map((r) => ({ locale: r.locale, value: r.value.trim() })).filter((r) => r.value)
    const payload = await payloadClient()
    await payload.updateGlobal({ slug: 'chat-settings', data: { lounge: { chatTitle: clean(d.chatTitle), name: clean(d.name), subtitle: clean(d.subtitle), description: clean(d.description), postBy: d.postBy, mediaView: d.mediaView, mediaSave: d.mediaSave } } })
    // open chats reload so the picture / voice rule applies at once (they reconnect on this event)
    const { broadcast } = await import('@/chat/hub'); broadcast({ type: 'rolesChanged' })
    clearChatCache()
    revalidatePath('/', 'layout')
    done('lounge')
  })
}

/** The room's invite link token: get (creates one) · reset (new link, the old one stops working) · off (no link). */
export async function groupInviteLink(id: string, action: 'get' | 'reset' | 'off') {
  return run(async () => {
    await actionUser('moderator')
    const payload = await payloadClient()
    const room = await payload.findByID({ collection: 'chat-rooms', id, depth: 0 })
    let token = room.inviteToken || null
    if (action === 'off') token = null
    else if (action === 'reset' || !token) token = (await import('node:crypto')).randomBytes(9).toString('base64url')
    if (token !== (room.inviteToken || null)) await payload.update({ collection: 'chat-rooms', id, data: { inviteToken: token } })
    done(id)
    return token
  })
}

/** The room's picture: a photo (form field "file", square-cropped) or, with "remove", back to its colours. */
export async function groupPhoto(id: string, fd: FormData) {
  return run(async () => {
    await actionUser('moderator')
    const payload = await payloadClient()
    const room = await payload.findByID({ collection: 'chat-rooms', id, depth: 0 })
    const old = room.photo
    if (fd.get('remove')) await payload.update({ collection: 'chat-rooms', id, data: { photo: null } })
    else {
      const f = fd.get('file')
      let mid
      try { mid = await storeAvatar(payload, f instanceof File ? f : (null as unknown as File), 'room-' + id) }
      catch (e) { if (e instanceof AvatarError) throw new Error(e.message === 'tooBig' ? 'That picture is too big (5 MB at most).' : 'Use a JPEG, PNG or WebP picture.'); throw e }
      await payload.update({ collection: 'chat-rooms', id, data: { photo: mid } })
    }
    if (old) await dropMedia(payload, old)
    clearChatCache('groups'); done(id)
  })
}

/** The room's colours (shown when it has no photo). */
export async function groupColor(id: string, gradient: string) {
  return run(async () => {
    await actionUser('moderator')
    if (!isGradient(gradient)) throw new Error('Pick one of the colours.')
    const payload = await payloadClient()
    await payload.update({ collection: 'chat-rooms', id, data: { gradient } })
    clearChatCache('groups'); done(id)
  })
}
