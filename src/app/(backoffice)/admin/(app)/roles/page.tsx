import type { Metadata } from 'next'
import { requireUser, payloadClient } from '@/backoffice/lib/server'
import { RolesView, type RoleRow } from '@/backoffice/views/roles'

export const metadata: Metadata = { title: 'Member roles' }
export const dynamic = 'force-dynamic'

export default async function RolesPage() {
  await requireUser('moderator')
  const payload = await payloadClient()
  const [roles, members] = await Promise.all([
    payload.find({ collection: 'member-roles', sort: 'order', pagination: false, depth: 0 }),
    payload.find({ collection: 'members', pagination: false, depth: 0, select: { memberRole: true }, overrideAccess: true }),
  ])
  const def = roles.docs.find((r) => r.isDefault)
  const count = (id: string) => members.docs.filter((m) => (m.memberRole ? String(m.memberRole) : def ? String(def.id) : '') === id).length
  const rows: RoleRow[] = roles.docs.map((r) => ({
    id: String(r.id), members: count(String(r.id)),
    name: r.name, description: r.description || '', color: r.color || '#3E63DD', isDefault: !!r.isDefault, order: r.order ?? 0,
    createGroups: !!r.createGroups, createChannels: !!r.createChannels, maxRooms: r.maxRooms ?? 3, sendPictures: !!r.sendPictures, privateChats: r.privateChats !== false, showBadge: !!r.showBadge,
  }))
  return <RolesView rows={rows} />
}
