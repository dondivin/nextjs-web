import type { Metadata } from 'next'
import { requireUser, payloadClient } from '@/backoffice/lib/server'
import { MembersView, type MemberRow } from '@/backoffice/views/members'
import { hub } from '@/chat/hub'

export const metadata: Metadata = { title: 'Members' }
export const dynamic = 'force-dynamic'

const idOf = (x: unknown) => (x && typeof x === 'object' && 'id' in x ? String((x as { id: unknown }).id) : x ? String(x) : '')

/** Every account registered in the site chat. */
export default async function MembersPage() {
  await requireUser('moderator')
  const payload = await payloadClient()
  const [members, roles, msgs] = await Promise.all([
    payload.find({ collection: 'members', sort: '-createdAt', pagination: false, depth: 1, overrideAccess: true }),
    payload.find({ collection: 'member-roles', sort: 'order', pagination: false, depth: 0, select: { name: true, isDefault: true, color: true } }),
    payload.find({ collection: 'chat-messages', where: { and: [{ author: { exists: true } }, { deleted: { not_equals: true } }] }, pagination: false, depth: 0, select: { author: true } }),
  ])
  const count = new Map<string, number>()
  for (const m of msgs.docs) { const a = idOf(m.author); if (a) count.set(a, (count.get(a) || 0) + 1) }
  const online = new Set([...hub.clients.values()].map((c) => c.viewer.uid).filter(Boolean) as string[])
  const rows: MemberRow[] = members.docs.map((m) => ({
    id: String(m.id), name: m.displayName, email: m.email,
    avatarUrl: m.avatar && typeof m.avatar === 'object' ? m.avatar.url || null : null, gradient: m.avatarGradient || null,
    roleId: m.memberRole ? idOf(m.memberRole) : null, status: (m.status || 'active') as MemberRow['status'], mutedUntil: m.mutedUntil || null,
    messages: count.get(String(m.id)) || 0, online: online.has(String(m.id)), lastSeenAt: m.lastSeenAt || null, createdAt: m.createdAt,
  }))
  return <MembersView rows={rows} roles={roles.docs.map((r) => ({ id: String(r.id), name: r.name, isDefault: !!r.isDefault, color: r.color || null }))} />
}
