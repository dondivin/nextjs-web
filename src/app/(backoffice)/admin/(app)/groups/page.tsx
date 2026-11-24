import type { Metadata } from 'next'
import { requireUser, payloadClient } from '@/backoffice/lib/server'
import { GroupsView, type GroupRow } from '@/backoffice/views/groups'

export const metadata: Metadata = { title: 'Groups & channels' }
export const dynamic = 'force-dynamic'

export default async function GroupsPage() {
  await requireUser('moderator')
  const payload = await payloadClient()
  const [rooms, ms] = await Promise.all([
    payload.find({ collection: 'chat-rooms', sort: 'order', pagination: false, depth: 1 }),
    payload.find({ collection: 'chat-room-members', pagination: false, depth: 0, select: { room: true, status: true } }),
  ])
  const count = (id: string, st: string) => ms.docs.filter((m) => String(typeof m.room === 'object' ? m.room.id : m.room) === id && m.status === st).length
  const rows: GroupRow[] = rooms.docs.map((r) => ({
    id: String(r.id), name: r.name, description: r.description || '', kind: (r.kind || 'group') as GroupRow['kind'], join: (r.join || 'open') as GroupRow['join'],
    autoAdd: !!r.autoAdd, active: r.active !== false, gradient: r.gradient || null, order: r.order ?? 0,
    owner: r.owner && typeof r.owner === 'object' ? r.owner.displayName : null,
    members: count(String(r.id), 'member'), requests: count(String(r.id), 'requested'), invited: count(String(r.id), 'invited'),
  }))
  return <GroupsView rows={rows} />
}
