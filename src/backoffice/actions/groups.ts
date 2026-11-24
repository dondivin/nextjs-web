'use server'
import { revalidatePath } from 'next/cache'
import { actionUser, payloadClient, run } from '@/backoffice/lib/server'
import { groupSchema, type GroupForm } from '@/backoffice/lib/forms'
import { setMembership, setRoomAdmin } from '@/chat/groups'

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
