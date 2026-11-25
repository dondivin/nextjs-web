import { roomVisibility } from '@/chat/groups'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireUser, payloadClient } from '@/backoffice/lib/server'
import { GroupEditor, type GroupMemberRow } from '@/backoffice/views/group-editor'
import { siteUrl } from '@/lib/brand'

export const metadata: Metadata = { title: 'Edit group' }
export const dynamic = 'force-dynamic'

/** the room's visibility settings for the form (older rooms: derived from "join", as the chat does) */
function roomVisibilityForm(room: Parameters<typeof roomVisibility>[0]) { const v = roomVisibility(room); return { visibility: v.vis, preview: v.preview } }

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
  const lang = await payload.find({ collection: 'languages', where: { isDefault: { equals: true } }, limit: 1, depth: 0 })
  return (
    <GroupEditor
      inviteBase={`${siteUrl()}/${lang.docs[0]?.code || 'en'}/chat/join-`}
      inviteToken={room.inviteToken || null}
      id={String(room.id)}
      updatedAt={room.updatedAt}
      gradient={room.gradient || null}
      photo={room.photo && typeof room.photo === 'object' ? room.photo.url || null : null}
      owner={room.owner && typeof room.owner === 'object' ? room.owner.displayName : room.createdBy && typeof room.createdBy === 'object' && room.createdBy.name ? `${room.createdBy.name} (team)` : null}
      members={members}
      initial={{ name: room.name, description: room.description || '', rules: room.rules || '', kind: (room.kind || 'group') as 'group' | 'channel', join: (room.join || 'open') as 'open' | 'request' | 'invite', ...roomVisibilityForm(room), autoAdd: !!room.autoAdd, active: room.active !== false, order: room.order ?? 0, mediaView: (room.mediaView || 'everyone') as 'everyone', mediaSave: room.mediaSave !== false }}
    />
  )
}
