import type { Metadata } from 'next'
import { requireUser, payloadClient } from '@/backoffice/lib/server'
import { ResetsView, type ResetRow } from '@/backoffice/views/resets'

export const metadata: Metadata = { title: 'Password resets' }
export const dynamic = 'force-dynamic'

export default async function ResetsPage() {
  const me = await requireUser('moderator')
  const owner = (me.roles || []).includes('owner')
  const payload = await payloadClient()
  // team-account requests are for owners only
  const mainRes = await payload.find({ collection: 'users', sort: 'createdAt', limit: 1, depth: 0, select: {} })
  const mainId = mainRes.docs[0] ? String(mainRes.docs[0].id) : null
  const res = await payload.find({ collection: 'password-resets', sort: '-createdAt', limit: 300, depth: 1, where: owner ? {} : { kind: { not_equals: 'staff' } } })

  // a little context per account, to help decide whether the request is genuine
  const memberIds = [...new Set(res.docs.map((d) => (d.member && typeof d.member === 'object' ? String(d.member.id) : null)).filter((x): x is string => !!x))]
  const counts = new Map<string, number>()
  await Promise.all(memberIds.map(async (id) => counts.set(id, (await payload.count({ collection: 'chat-messages', where: { author: { equals: id } } })).totalDocs)))

  const rows: ResetRow[] = res.docs.map((d) => {
    const m = d.member && typeof d.member === 'object' ? d.member : null
    const u = d.user && typeof d.user === 'object' ? d.user : null
    const by = d.decidedBy && typeof d.decidedBy === 'object' ? d.decidedBy.name || d.decidedBy.email : null
    const pendingExpired = d.status === 'pending' && Date.parse(d.expiresAt) < Date.now()
    return {
      id: String(d.id),
      kind: d.kind === 'staff' ? 'staff' : 'member',
      staff: u ? { id: String(u.id), name: u.name || u.email, roles: u.roles || [], self: String(u.id) === String(me.id), main: String(u.id) === mainId } : null,
      email: d.email,
      note: d.note || '',
      status: pendingExpired ? 'expired' : (d.status || 'pending'),
      createdAt: d.createdAt,
      decidedAt: d.decidedAt || null,
      decidedBy: by,
      member: m
        ? { id: String(m.id), name: m.displayName, status: m.status || 'active', joined: m.createdAt, lastSeen: m.lastSeenAt || null, messages: counts.get(String(m.id)) || 0 }
        : null,
    }
  })
  return <ResetsView rows={rows} canApproveStaff={owner} />
}
