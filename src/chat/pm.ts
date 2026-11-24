import type { Payload, PayloadRequest } from 'payload'
import { isObjectId } from './data'

/*
 * Fan-to-fan private chats (consent first). Stored room id: 'pm:<idA>_<idB>' (ids sorted).
 * The browser calls the same chat 'pm:<otherMemberId>'.
 */
export const pairKey = (a: string, b: string) => [a, b].sort().join('_')
export const pmRoom = (a: string, b: string) => 'pm:' + pairKey(a, b)
/** The two member ids of a 'pm:' room, or null. */
export function pmMembers(room: string): [string, string] | null {
  if (!room.startsWith('pm:')) return null
  const [a, b] = room.slice(3).split('_')
  return isObjectId(a) && isObjectId(b) ? [a, b] : null
}

/** How viewer `me` sees the relation with `other`. */
export type PmStatus = 'none' | 'pending-out' | 'pending-in' | 'accepted' | 'blocked'
export type PmRel = { uid: string; status: PmStatus; id?: string; note?: string; at?: number; lastSeen?: number }

const relId = (x: unknown) => (x && typeof x === 'object' && 'id' in x ? String((x as { id: unknown }).id) : x ? String(x) : '')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function relView(doc: any, me: string): PmRel | null {
  const from = relId(doc.from), to = relId(doc.to)
  const other = from === me ? to : from
  const at = Date.parse(doc.updatedAt || doc.createdAt) || 0
  switch (doc.status) {
    case 'pending': return { uid: other, status: from === me ? 'pending-out' : 'pending-in', id: String(doc.id), note: from === me ? undefined : doc.note || undefined, at }
    case 'accepted': return { uid: other, status: 'accepted', id: String(doc.id), at }
    // only the person who blocked sees it; the other side just sees nothing
    case 'blocked': return relId(doc.blockedBy) === me ? { uid: other, status: 'blocked', id: String(doc.id), at } : null
    default: return null // declined: invisible to both
  }
}

/** Every relation of a member (requests both ways, accepted chats, people they blocked) with the partner's last-seen time. */
export async function relationsOf(payload: Payload, me: string, req?: PayloadRequest): Promise<PmRel[]> {
  const res = await payload.find({
    collection: 'chat-requests',
    where: { or: [{ from: { equals: me } }, { to: { equals: me } }] },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const rels = res.docs.map((d) => relView(d, me)).filter((r): r is PmRel => !!r)
  const ids = rels.map((r) => r.uid)
  if (ids.length) {
    const ms = await payload.find({ collection: 'members', where: { id: { in: ids } }, pagination: false, depth: 0, overrideAccess: true, select: { lastSeenAt: true }, req })
    const seen = new Map(ms.docs.map((m) => [String(m.id), m.lastSeenAt ? Date.parse(m.lastSeenAt) : 0]))
    for (const r of rels) r.lastSeen = seen.get(r.uid) || 0
  }
  return rels
}

export async function findPair(payload: Payload, a: string, b: string) {
  const res = await payload.find({ collection: 'chat-requests', where: { pairKey: { equals: pairKey(a, b) } }, limit: 1, depth: 0, overrideAccess: true })
  return res.docs[0] || null
}
