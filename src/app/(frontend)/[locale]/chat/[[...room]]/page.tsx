import type { Metadata } from 'next'
import { loadSite, payloadClient } from '@/i18n/data'
import { renderSite } from '@/site/render-site'
import { siteMetadata } from '@/lib/site-metadata'
import { roomVisibility } from '@/chat/groups'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ locale: string; room?: string[] }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, room } = await params
  const data = await loadSite(locale)
  if (!data) return {}
  const s = data.cfg.strings, siteName = data.cfg.siteName
  const payload = await payloadClient()
  const slug = room?.[0] ? decodeURIComponent(room[0]) : ''
  let title = `${s['chat.title'] || 'Chat'} · ${siteName}`
  let description = s['lounge.info'] || ''
  let image: { url: string; width?: number; height?: number } | null = null

  // a group's link (g-<id>) or an invite link (join-<token>): show that group, like a WhatsApp group link —
  // but only when the group is public; a hidden / members-only group never reveals its name or picture
  try {
    const m = /^g-([0-9a-f]{24})$/i.exec(slug), j = /^join-([\w-]{6,})$/.exec(slug)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let doc: any = null
    if (m) doc = await payload.findByID({ collection: 'chat-rooms', id: m[1], depth: 1, overrideAccess: true, disableErrors: true })
    else if (j) doc = (await payload.find({ collection: 'chat-rooms', where: { inviteToken: { equals: j[1] } }, limit: 1, depth: 1, overrideAccess: true })).docs[0] || null
    if (doc && doc.active !== false && (j || roomVisibility(doc).vis === 'public')) {
      title = `${doc.name} · ${siteName}`
      if (doc.description) description = String(doc.description).slice(0, 200)
      const photo = doc.photo && typeof doc.photo === 'object' ? doc.photo : null
      // served as JPEG by /brand/room/<id> (an invite link passes its token: the room may be hidden)
      if (photo?.url) image = { url: `/brand/room/${doc.id}?v=${photo.id}` + (j ? '&t=' + encodeURIComponent(j[1]) : ''), width: 600, height: 600 }
    }
  } catch { /* fall back to the community card */ }

  // conversations change all the time and some are private: keep chat pages out of search results
  return siteMetadata(payload, { title, description, path: '/' + locale + '/chat' + (slug ? '/' + encodeURIComponent(slug) : ''), siteName, locale, image, index: false })
}

/** /<locale>/chat (room list) and /<locale>/chat/<room> (lounge, a match id, g-<id>, pm-<id>, sup-<id>, support). */
export default async function ChatPage({ params }: Params) {
  const { locale, room } = await params
  return renderSite(locale, { room: room?.[0] ? decodeURIComponent(room[0]) : null })
}
