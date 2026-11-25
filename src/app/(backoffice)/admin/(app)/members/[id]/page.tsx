import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireUser, payloadClient } from '@/backoffice/lib/server'
import { MemberDetail, type MemberDetailData } from '@/backoffice/views/member-detail'
import { hub } from '@/chat/hub'

export const metadata: Metadata = { title: 'Member' }
export const dynamic = 'force-dynamic'

const idOf = (x: unknown) => (x && typeof x === 'object' && 'id' in x ? String((x as { id: unknown }).id) : x ? String(x) : '')

/** One member account: details, role, status, rooms, private chats and recent messages. */
export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser('moderator')
  const { id } = await params
  const payload = await payloadClient()
  const m = await payload.findByID({ collection: 'members', id, depth: 1, overrideAccess: true, disableErrors: true })
  if (!m) notFound()
  const [roles, msgCount, recent, rooms, owned, requests, reports, resets, matches] = await Promise.all([
    payload.find({ collection: 'member-roles', sort: 'order', pagination: false, depth: 0 }),
    payload.count({ collection: 'chat-messages', where: { and: [{ author: { equals: id } }, { deleted: { not_equals: true } }] } }),
    payload.find({ collection: 'chat-messages', where: { author: { equals: id } }, sort: '-createdAt', limit: 30, depth: 0 }),
    payload.find({ collection: 'chat-room-members', where: { member: { equals: id } }, pagination: false, depth: 1 }),
    payload.find({ collection: 'chat-rooms', where: { owner: { equals: id } }, pagination: false, depth: 0, select: { name: true, kind: true, active: true } }),
    payload.find({ collection: 'chat-requests', where: { or: [{ from: { equals: id } }, { to: { equals: id } }] }, pagination: false, depth: 1 }),
    payload.count({ collection: 'chat-reports', where: { messageAuthor: { equals: id } } }),
    payload.count({ collection: 'password-resets', where: { and: [{ member: { equals: id } }, { status: { in: ['pending', 'approved'] } }] } }),
    payload.find({ collection: 'matches', pagination: false, depth: 0, select: { home: true, away: true } }),
  ])
  const groupNames = new Map<string, string>()
  for (const r of rooms.docs) if (r.room && typeof r.room === 'object') groupNames.set(String(r.room.id), r.room.name)
  const matchTitle = new Map(matches.docs.map((x) => [String(x.id), `${x.home} v ${x.away}`]))
  const roomTitle = (room?: string | null) => {
    if (!room || room === 'lounge') return 'Community lounge'
    if (room.startsWith('dm:')) return 'Direct chat with the team'
    if (room.startsWith('g:')) return 'Group · ' + (groupNames.get(room.slice(2)) || 'group')
    if (room.startsWith('pm:')) return 'Private chat'
    return matchTitle.get(room) || 'Event room'
  }
  const data: MemberDetailData = {
    id: String(m.id), name: m.displayName, email: m.email, note: m.moderationNote || '',
    avatarUrl: m.avatar && typeof m.avatar === 'object' ? m.avatar.url || null : null, gradient: m.avatarGradient || null,
    roleId: m.memberRole ? idOf(m.memberRole) : null, status: (m.status || 'active') as MemberDetailData['status'], mutedUntil: m.mutedUntil || null,
    online: [...hub.clients.values()].some((c) => c.viewer.uid === String(m.id)),
    lastSeenAt: m.lastSeenAt || null, createdAt: m.createdAt, rulesAcceptedAt: m.rulesAcceptedAt || null,
    messages: msgCount.totalDocs, reports: reports.totalDocs, openResets: resets.totalDocs,
    recent: recent.docs.map((x) => ({ id: String(x.id), text: x.text || (x.image ? '(photo)' : ''), room: roomTitle(x.room), deleted: !!x.deleted, createdAt: x.createdAt })),
    rooms: rooms.docs.filter((r) => r.room && typeof r.room === 'object').map((r) => {
      const room = r.room as { id: string; name: string; kind?: string | null; active?: boolean | null }
      return { id: String(room.id), name: room.name, kind: (room.kind || 'group') as 'group' | 'channel', status: r.status as 'member' | 'requested' | 'invited', admin: !!r.admin, owner: owned.docs.some((o) => String(o.id) === String(room.id)), active: room.active !== false }
    }),
    owned: owned.docs.length,
    chats: requests.docs.map((q) => {
      const mine = idOf(q.from) === String(m.id), other = (mine ? q.to : q.from) as { id: string; displayName?: string } | string
      return { id: String(q.id), with: typeof other === 'object' ? other.displayName || 'Member' : 'Deleted account', withId: idOf(other), status: q.status as string, outgoing: mine }
    }),
  }
  return <MemberDetail m={data} roles={roles.docs.map((r) => ({ id: String(r.id), name: r.name, isDefault: !!r.isDefault, color: r.color || null, createGroups: !!r.createGroups, createChannels: !!r.createChannels, sendPictures: !!r.sendPictures, privateChats: !!r.privateChats }))} />
}
