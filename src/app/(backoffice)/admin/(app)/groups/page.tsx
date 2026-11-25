import type { Metadata } from 'next'
import { requireUser, payloadClient } from '@/backoffice/lib/server'
import { GroupsView, type GroupRow } from '@/backoffice/views/groups'
import { roomVisibility } from '@/chat/groups'

export const metadata: Metadata = { title: 'Groups & channels' }
export const dynamic = 'force-dynamic'

export default async function GroupsPage() {
  await requireUser('moderator')
  const payload = await payloadClient()
  const [rooms, ms, chat, loungeMsgs] = await Promise.all([
    payload.find({ collection: 'chat-rooms', sort: 'order', pagination: false, depth: 1 }),
    payload.find({ collection: 'chat-room-members', pagination: false, depth: 0, select: { room: true, status: true } }),
    payload.findGlobal({ slug: 'chat-settings', depth: 0 }),
    payload.count({ collection: 'chat-messages', where: { room: { equals: 'lounge' } } }),
  ])
  const count = (id: string, st: string) => ms.docs.filter((m) => String(typeof m.room === 'object' ? m.room.id : m.room) === id && m.status === st).length
  const rows: GroupRow[] = rooms.docs.map((r) => ({
    id: String(r.id), name: r.name, description: r.description || '', kind: (r.kind || 'group') as GroupRow['kind'], join: (r.join || 'open') as GroupRow['join'],
    visibility: roomVisibility(r).vis, preview: roomVisibility(r).preview, autoAdd: !!r.autoAdd, active: r.active !== false, gradient: r.gradient || null, photo: r.photo && typeof r.photo === 'object' ? r.photo.url || null : null, order: r.order ?? 0,
    owner: r.owner && typeof r.owner === 'object' ? r.owner.displayName : null,
    members: count(String(r.id), 'member') + (!r.owner && r.createdBy ? 1 : 0) /* a team-made room: its creator counts, as in the chat */, requests: count(String(r.id), 'requested'), invited: count(String(r.id), 'invited'),
  }))
  const tr = await payload.find({ collection: 'translations', where: { key: { equals: 'chat.lounge' } }, limit: 1, depth: 0 })
  const lang = await payload.find({ collection: 'languages', where: { isDefault: { equals: true } }, limit: 1, depth: 0 })
  const def = lang.docs[0]?.code || 'en'
  const pickDef = (rows: { locale?: string | null; value?: string | null }[] | null | undefined) => (rows || []).find((r) => r.locale === def && r.value)?.value
  const loungeName = pickDef(chat.lounge?.name) || pickDef(tr.docs[0]?.values) || 'Community lounge'
  return <GroupsView rows={rows} lounge={{ name: loungeName, teamOnly: chat.lounge?.postBy === 'team', messages: loungeMsgs.totalDocs }} />
}
