import type { Metadata } from 'next'
import { requireUser } from '@/backoffice/lib/server'
import { AccountView } from '@/backoffice/views/account'

export const metadata: Metadata = { title: 'My account' }
export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const me = await requireUser()
  return <AccountView name={me.name || ''} email={me.email} roles={me.roles || []} canChat={(me.roles || []).some((r) => r === 'owner' || r === 'moderator')} />
}
