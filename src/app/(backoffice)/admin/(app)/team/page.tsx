import type { Metadata } from 'next'
import { requireUser, payloadClient } from '@/backoffice/lib/server'
import { TeamView, type TeamRow } from '@/backoffice/views/team'

export const metadata: Metadata = { title: 'Team accounts' }
export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  const me = await requireUser()
  const payload = await payloadClient()
  const res = await payload.find({ collection: 'users', sort: 'createdAt', pagination: false, depth: 0 })
  const mainId = res.docs[0] ? String(res.docs[0].id) : null // the oldest account = main admin
  const rows: TeamRow[] = res.docs.map((u) => ({
    id: String(u.id),
    name: u.name || '',
    email: u.email,
    roles: (u.roles || []) as TeamRow['roles'],
    createdAt: u.createdAt,
    chatSeen: u.chatLastSeenAt || null,
    main: String(u.id) === mainId,
    me: String(u.id) === String(me.id),
  }))
  return <TeamView rows={rows} canManage={(me.roles || []).includes('owner')} />
}
