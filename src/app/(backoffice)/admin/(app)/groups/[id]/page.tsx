import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireUser, payloadClient } from '@/backoffice/lib/server'
import { GroupEditor, type GroupMemberRow } from '@/backoffice/views/group-editor'

export const metadata: Metadata = { title: 'Edit group' }
export const dynamic = 'force-dynamic'

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser('moderator')
  const { id } = await params
  const payload = await payloadClient()
  const room = await payload.findByID({ collection: 'chat-rooms', id, depth: 1 }).catch(() => null)
  if (!room) notFound()
  const ms = await payload.find({ collection: 'chat-room-members', where: { room: { equals: id } }, sort: '-updatedAt', pagination: false, depth: 1 })
  const members: GroupMemberRow[] = ms.docs.map((m) => {
    const mem = m.member && typeof m.member === 'object' ? m.member : null
    return { id: mem ? String(mem.id) : String(m.member), name: mem?.displayName || 'Deleted account', gradient: mem?.avatarGradient || null, status: m.status as GroupMemberRow['status'], since: m.updatedAt, lastSeen: mem?.lastSeenAt || null, admin: !!m.admin, owner: !!mem && !!room.owner && typeof room.owner === 'object' && String(room.owner.id) === String(mem.id) }
  })
  return (
    <GroupEditor
      id={String(room.id)}
      updatedAt={room.updatedAt}
      gradient={room.gradient || null}
      owner={room.owner && typeof room.owner === 'object' ? room.owner.displayName : null}
      members={members}
      initial={{ name: room.name, description: room.description || '', rules: room.rules || '', kind: (room.kind || 'group') as 'group' | 'channel', join: (room.join || 'open') as 'open' | 'request' | 'invite', autoAdd: !!room.autoAdd, active: room.active !== false, order: room.order ?? 0 }}
    />
  )
}
