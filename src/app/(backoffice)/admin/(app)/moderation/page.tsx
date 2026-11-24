import type { Metadata } from 'next'
import { requireUser, payloadClient } from '@/backoffice/lib/server'
import { ModerationView, type ModReport, type ModMessage, type ModMember } from '@/backoffice/views/moderation'

export const metadata: Metadata = { title: 'Moderation' }
export const dynamic = 'force-dynamic'

type Rel = string | { id: string; displayName?: string; status?: string | null } | null | undefined
const relId = (r: Rel) => (r && typeof r === 'object' ? String(r.id) : r ? String(r) : null)
const relName = (r: Rel) => (r && typeof r === 'object' ? r.displayName || 'Fan' : 'Deleted member')

export default async function ModerationPage() {
  await requireUser('moderator')
  const payload = await payloadClient()
  const [reports, messages, members, matches] = await Promise.all([
    payload.find({ collection: 'chat-reports', where: { status: { equals: 'open' } }, sort: '-createdAt', limit: 500, depth: 1 }),
    payload.find({ collection: 'chat-messages', sort: '-createdAt', limit: 300, depth: 1 }),
    payload.find({ collection: 'members', sort: '-createdAt', limit: 1000, depth: 0 }),
    payload.find({ collection: 'matches', pagination: false, depth: 0, select: { home: true, away: true } }),
  ])
  const matchTitle = new Map(matches.docs.map((m) => [String(m.id), `${m.home} v ${m.away}`]))
  const memberName = new Map(members.docs.map((m) => [String(m.id), m.displayName]))
  const roomTitle = (room?: string | null) => {
    if (!room || room === 'lounge') return 'Community lounge'
    if (room.startsWith('dm:')) return 'Direct chat · ' + (memberName.get(room.slice(3)) || 'member')
    return matchTitle.get(room) || 'Event room'
  }

  // one row per reported message, with how many people reported it
  const byMessage = new Map<string, ModReport>()
  for (const r of reports.docs) {
    const mid = relId(r.message as Rel) || String(r.id)
    const prev = byMessage.get(mid)
    if (prev) { prev.count++; if (r.reason && !prev.reasons.includes(r.reason)) prev.reasons.push(r.reason); continue }
    const author = r.messageAuthor as Rel
    byMessage.set(mid, {
      id: String(r.id),
      messageId: mid,
      text: r.messageText || (typeof r.message === 'object' && r.message ? r.message.text : '') || '',
      room: roomTitle(r.room),
      authorId: relId(author),
      authorName: relName(author),
      authorStatus: (author && typeof author === 'object' ? author.status : null) || 'active',
      reporterName: relName(r.reporter as Rel),
      reasons: r.reason ? [r.reason] : [],
      count: 1,
      createdAt: r.createdAt,
    })
  }

  const msgs: ModMessage[] = messages.docs.map((m) => ({
    id: String(m.id),
    text: m.text,
    room: roomTitle(m.room),
    authorId: relId(m.author as Rel),
    authorName: relName(m.author as Rel),
    deleted: !!m.deleted,
    deletedBy: m.deletedBy || null,
    isMod: !!m.isMod,
    createdAt: m.createdAt,
  }))

  const mems: ModMember[] = members.docs.map((m) => ({
    id: String(m.id),
    name: m.displayName,
    email: m.email,
    role: (m.role || 'fan') as ModMember['role'],
    status: (m.status || 'active') as ModMember['status'],
    mutedUntil: m.mutedUntil || null,
    lastSeenAt: m.lastSeenAt || null,
    createdAt: m.createdAt,
  }))

  return <ModerationView reports={[...byMessage.values()]} messages={msgs} members={mems} />
}
