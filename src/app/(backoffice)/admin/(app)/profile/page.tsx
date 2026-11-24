import type { Metadata } from 'next'
import { requireUser, payloadClient } from '@/backoffice/lib/server'
import { ChatProfileView } from '@/backoffice/views/chat-profile'

export const metadata: Metadata = { title: 'Chat profile' }
export const dynamic = 'force-dynamic'

export default async function ChatProfilePage() {
  const user = await requireUser('moderator')
  const payload = await payloadClient()
  const [me, site] = await Promise.all([
    payload.findByID({ collection: 'users', id: user.id, depth: 1 }),
    payload.findGlobal({ slug: 'site-settings', depth: 0 }),
  ])
  const photo = me.chatAvatar && typeof me.chatAvatar === 'object' ? me.chatAvatar.url || null : null
  return <ChatProfileView name={me.name || ''} gradient={me.chatGradient || null} photo={photo} fallbackName={site.agentName || 'OddsClub team'} />
}
