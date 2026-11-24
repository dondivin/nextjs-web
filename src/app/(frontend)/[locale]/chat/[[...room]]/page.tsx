import type { Metadata } from 'next'
import { loadSite } from '@/i18n/data'
import { renderSite } from '@/site/render-site'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ locale: string; room?: string[] }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params
  const data = await loadSite(locale)
  if (!data) return {}
  return {
    title: `${data.cfg.strings['chat.title'] || 'Chat'} · ${data.cfg.siteName}`,
    // conversations change all the time and some are private: keep chat pages out of search results
    robots: { index: false, follow: true },
  }
}

/** /<locale>/chat (room list) and /<locale>/chat/<room> (lounge, a match id, g-<id>, pm-<id>, sup-<id>, support). */
export default async function ChatPage({ params }: Params) {
  const { locale, room } = await params
  return renderSite(locale, { room: room?.[0] ? decodeURIComponent(room[0]) : null })
}
