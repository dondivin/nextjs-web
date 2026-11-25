import type { Payload, Where } from 'payload'
import { cached, clearChatCache, isObjectId, type WireMsg } from './data'
import type { Viewer } from './hub'

/*
 * Who may see the pictures / voice messages of a room, and whether they may be saved.
 *   lounge + match rooms → Chat settings → lounge.mediaView / lounge.mediaSave (Groups & channels → Community lounge)
 *   groups & channels    → chat-rooms.mediaView / mediaSave (each room's page)
 *   private chats, chats with the team → always their own people, saving allowed
 * view: everyone · members (lounge: signed-in accounts; group: people who joined it) · team · none (text only: no media at all)
 * The team always sees everything (moderation). Enforced on the server: people who may not see a file get a locked placeholder
 * instead of its address, and the file URL itself refuses them. "No saving" only hides Save / blocks right-click & long-press
 * saving: what is on someone's screen can always be screenshotted.
 */
export type MediaView = 'everyone' | 'members' | 'team' | 'none'
export type RoomMedia = { view: MediaView; save: boolean }
export type MediaPolicy = { lounge: RoomMedia; groups: Record<string, RoomMedia> }
export const MEDIA_VIEWS: MediaView[] = ['everyone', 'members', 'team', 'none']
const asView = (v: unknown): MediaView => (MEDIA_VIEWS.includes(v as MediaView) ? (v as MediaView) : 'everyone')

export function mediaPolicy(payload: Payload): Promise<MediaPolicy> {
  return cached('media', 30_000, async () => {
    const [chat, rooms] = await Promise.all([
      payload.findGlobal({ slug: 'chat-settings', depth: 0 }),
      payload.find({ collection: 'chat-rooms', pagination: false, depth: 0, overrideAccess: true, select: { mediaView: true, mediaSave: true } }),
    ])
    const groups: Record<string, RoomMedia> = {}
    for (const r of rooms.docs) groups[String(r.id)] = { view: asView(r.mediaView), save: r.mediaSave !== false }
    return { lounge: { view: asView(chat.lounge?.mediaView), save: chat.lounge?.mediaSave !== false }, groups }
  })
}
export const forgetMediaPolicy = () => clearChatCache('media')

/** The rule for a stored room ('lounge', a match id, 'g:<id>'); null for private rooms (dm / pm: always their own people). */
export function roomMedia(policy: MediaPolicy, room: string): RoomMedia | null {
  if (room.startsWith('dm:') || room.startsWith('pm:')) return null
  if (room.startsWith('g:')) return policy.groups[room.slice(2)] || { view: 'everyone', save: true }
  return policy.lounge
}

/** Why this viewer can't see a room's media, or null when they can. inGroup = they joined that group. */
export function mediaLock(viewer: Viewer, room: string, rm: RoomMedia | null, inGroup: boolean): null | 'signin' | 'group' | 'team' | 'none' {
  if (!rm || viewer.kind === 'staff') return null
  if (rm.view === 'none') return 'none'
  if (rm.view === 'team') return 'team'
  if (rm.view === 'members') {
    if (room.startsWith('g:')) return inGroup ? null : 'group'
    return viewer.kind === 'member' ? null : 'signin'
  }
  return null
}

/** The groups this member has joined (for the 'members' rule of groups). */
export async function joinedGroups(payload: Payload, uid: string | null): Promise<Set<string>> {
  if (!uid) return new Set()
  const res = await payload.find({ collection: 'chat-room-members', where: { and: [{ member: { equals: uid } }, { status: { equals: 'member' } }] }, pagination: false, depth: 0, overrideAccess: true, select: { room: true } })
  return new Set(res.docs.map((d) => String(typeof d.room === 'object' && d.room ? (d.room as { id: string }).id : d.room)))
}

/** A message as this viewer may receive it: media replaced by a lock when they may not see it; nosave when saving is off. */
export function lockWire(w: WireMsg, viewer: Viewer, policy: MediaPolicy, groups: Set<string>): WireMsg {
  const rm = roomMedia(policy, w.room)
  if (!rm) return w
  let out = w
  if (w.image || w.voice) {
    const lock = mediaLock(viewer, w.room, rm, w.room.startsWith('g:') && groups.has(w.room.slice(2)))
    if (lock) out = { ...w, image: undefined, voice: undefined, locked: { kind: w.image ? 'photo' : 'voice', why: lock } }
  }
  if (!rm.save && viewer.kind !== 'staff' && (out.image || out.voice)) out = { ...out, nosave: true }
  if (out.reply?.thumb && mediaLock(viewer, w.room, rm, w.room.startsWith('g:') && groups.has(w.room.slice(2)))) out = { ...out, reply: { ...out.reply, thumb: undefined } }
  return out
}

/** File access (chat-images / chat-voice): the rooms whose files this user may download. */
export async function mediaReadWhere(payload: Payload, user: { collection?: string; id?: string | number } | null, isStaff: boolean): Promise<Where | boolean> {
  if (isStaff) return true
  const policy = await mediaPolicy(payload)
  const uid = user?.collection === 'members' && user.id ? String(user.id) : null
  const viewer: Viewer = uid ? { kind: 'member', uid } : { kind: 'anon', uid: null }
  const groups = await joinedGroups(payload, uid)
  const or: Where[] = []
  if (uid) or.push({ room: { equals: 'dm:' + uid } }, { and: [{ room: { like: 'pm:' } }, { room: { like: uid } }] })
  if (!mediaLock(viewer, 'lounge', policy.lounge, false)) or.push({ and: [{ room: { not_like: 'dm:' } }, { room: { not_like: 'pm:' } }, { room: { not_like: 'g:' } }] })
  const okGroups = Object.keys(policy.groups).filter((id) => isObjectId(id) && !mediaLock(viewer, 'g:' + id, policy.groups[id], groups.has(id)))
  if (okGroups.length) or.push({ room: { in: okGroups.map((id) => 'g:' + id) } })
  return or.length ? { or } : false
}
