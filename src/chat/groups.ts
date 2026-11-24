import type { Payload, PayloadRequest } from 'payload'
import { isObjectId } from './data'
import type { Viewer } from './hub'

/*
 * Groups & channels (created by the team). Stored message room: 'g:<roomId>'.
 * Who sees what:
 *   open    → everyone sees and reads it; members (one tap to join) post
 *   request → everyone sees name + description; members read and post; others can ask to join
 *   invite  → only members and invited people see it at all
 *   channel → only the team posts (members read and react); the team can do everything everywhere
 */
export type GroupStatus = 'member' | 'requested' | 'invited' | 'none'
export type GroupView = {
  id: string; name: string; description: string; rules: string; kind: 'group' | 'channel'; join: 'open' | 'request' | 'invite'
  gradient: string | null; members: number; requests?: number; status: GroupStatus; canRead: boolean; canPost: boolean
  isAdmin: boolean; isOwner: boolean; owned: boolean // owned = made by a member (not the team)
}

export const groupRoom = (id: string) => 'g:' + id
export const groupIdOf = (room: string) => (room.startsWith('g:') && isObjectId(room.slice(2)) ? room.slice(2) : null)
const relId = (x: unknown) => (x && typeof x === 'object' && 'id' in x ? String((x as { id: unknown }).id) : x ? String(x) : '')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rules(room: any, viewer: Viewer, status: GroupStatus, admin: boolean) {
  const staff = viewer.kind === 'staff'
  const isOwner = !!viewer.uid && relId(room.owner) === viewer.uid
  const isAdmin = staff || isOwner || (status === 'member' && admin)   // admins manage the room and post in a channel
  return {
    visible: staff || isOwner || room.join !== 'invite' || status === 'member' || status === 'invited',
    canRead: staff || isOwner || room.join === 'open' || status === 'member',
    canPost: staff || isOwner || (status === 'member' && (room.kind !== 'channel' || admin)),
    isAdmin, isOwner,
  }
}

/** Every active room this viewer can see, with their membership and what they may do. */
export async function roomsFor(payload: Payload, viewer: Viewer, req?: PayloadRequest): Promise<GroupView[]> {
  const rooms = await payload.find({ collection: 'chat-rooms', where: { active: { equals: true } }, sort: 'order', pagination: false, depth: 0, overrideAccess: true, req })
  if (!rooms.docs.length) return []
  const ids = rooms.docs.map((r) => String(r.id))
  const all = await payload.find({ collection: 'chat-room-members', where: { room: { in: ids } }, pagination: false, depth: 0, overrideAccess: true, select: { room: true, member: true, status: true, admin: true }, req })
  const count: Record<string, number> = {}, requests: Record<string, number> = {}, mine: Record<string, GroupStatus> = {}, adm: Record<string, boolean> = {}
  for (const m of all.docs) {
    const r = relId(m.room)
    if (m.status === 'member') count[r] = (count[r] || 0) + 1
    if (m.status === 'requested') requests[r] = (requests[r] || 0) + 1
    if (viewer.uid && relId(m.member) === viewer.uid) { mine[r] = m.status as GroupStatus; adm[r] = !!m.admin }
  }
  const out: GroupView[] = []
  for (const r of rooms.docs) {
    const id = String(r.id), status = mine[id] || 'none', can = rules(r, viewer, status, !!adm[id])
    if (!can.visible) continue
    out.push({
      id, name: r.name, description: r.description || '', rules: r.rules || '', kind: (r.kind || 'group') as GroupView['kind'], join: (r.join || 'open') as GroupView['join'],
      gradient: r.gradient || null, members: count[id] || 0, ...(can.isAdmin ? { requests: requests[id] || 0 } : {}),
      status, canRead: can.canRead, canPost: can.canPost, isAdmin: can.isAdmin, isOwner: can.isOwner, owned: !!r.owner,
    })
  }
  return out
}

/** One room as seen by one viewer (null when it doesn't exist / is archived / is invisible to them). */
export async function roomAccess(payload: Payload, viewer: Viewer, roomId: string) {
  if (!isObjectId(roomId)) return null
  const room = await payload.findByID({ collection: 'chat-rooms', id: roomId, depth: 0, overrideAccess: true, disableErrors: true })
  if (!room || !room.active) return null
  let status: GroupStatus = 'none', admin = false
  if (viewer.kind === 'member' && viewer.uid) {
    const m = await payload.find({ collection: 'chat-room-members', where: { key: { equals: `${roomId}_${viewer.uid}` } }, limit: 1, depth: 0, overrideAccess: true })
    status = (m.docs[0]?.status as GroupStatus) || 'none'
    admin = !!m.docs[0]?.admin
  }
  const can = rules(room, viewer, status, admin)
  return can.visible ? { room, status, ...can } : null
}

/** Member ids of a room (status member). */
export async function memberUids(payload: Payload, roomId: string, req?: PayloadRequest) {
  const res = await payload.find({ collection: 'chat-room-members', where: { and: [{ room: { equals: roomId } }, { status: { equals: 'member' } }] }, pagination: false, depth: 0, overrideAccess: true, select: { member: true }, req })
  return res.docs.map((d) => relId(d.member))
}

export async function setMembership(payload: Payload, roomId: string, memberId: string, status: GroupStatus | null) {
  const key = `${roomId}_${memberId}`
  const found = await payload.find({ collection: 'chat-room-members', where: { key: { equals: key } }, limit: 1, depth: 0, overrideAccess: true })
  const doc = found.docs[0]
  if (!status || status === 'none') { if (doc) await payload.delete({ collection: 'chat-room-members', id: doc.id, overrideAccess: true }); return }
  if (doc) { if (doc.status !== status) await payload.update({ collection: 'chat-room-members', id: doc.id, data: { status }, overrideAccess: true }); return }
  await payload.create({ collection: 'chat-room-members', data: { key, room: roomId, member: memberId, status }, overrideAccess: true })
}

export async function setRoomAdmin(payload: Payload, roomId: string, memberId: string, admin: boolean) {
  const found = await payload.find({ collection: 'chat-room-members', where: { key: { equals: `${roomId}_${memberId}` } }, limit: 1, depth: 0, overrideAccess: true })
  const doc = found.docs[0]
  if (!doc || doc.status !== 'member') return false
  if (!!doc.admin !== admin) await payload.update({ collection: 'chat-room-members', id: doc.id, data: { admin }, overrideAccess: true })
  return true
}
