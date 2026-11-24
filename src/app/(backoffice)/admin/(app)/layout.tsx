import { requireUser, payloadClient } from '@/backoffice/lib/server'
import { AppShell } from '@/backoffice/views/app-shell'

export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const payload = await payloadClient()
  const [reports, partners] = await Promise.all([
    payload.count({ collection: 'chat-reports', where: { status: { equals: 'open' } } }),
    payload.find({ collection: 'partners', sort: 'order', pagination: false, depth: 0, select: { name: true, slug: true } }),
  ])
  return (
    <AppShell
      user={{ name: user.name || '', email: user.email, roles: user.roles || [] }}
      openReports={reports.totalDocs}
      partners={partners.docs.map((p) => ({ id: String(p.id), name: p.name }))}
    >
      {children}
    </AppShell>
  )
}
