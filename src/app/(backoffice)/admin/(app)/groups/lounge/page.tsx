import type { Metadata } from 'next'
import { requireUser, payloadClient } from '@/backoffice/lib/server'
import { fillLanguages } from '@/backoffice/lib/localized'
import { LoungeEditor } from '@/backoffice/views/lounge-editor'

export const metadata: Metadata = { title: 'Community lounge' }
export const dynamic = 'force-dynamic'

/** The chat's built-in main room (not a chat-rooms document): its texts and who can post live on Chat settings → lounge. */
export default async function LoungePage() {
  await requireUser('moderator')
  const payload = await payloadClient()
  const [chat, langs, tr, msgs] = await Promise.all([
    payload.findGlobal({ slug: 'chat-settings', depth: 0 }),
    payload.find({ collection: 'languages', sort: 'order', pagination: false, depth: 0 }),
    payload.find({ collection: 'translations', where: { key: { in: ['chat.title', 'chat.lounge', 'chat.loungeSub', 'lounge.info'] } }, pagination: false, depth: 0 }),
    payload.count({ collection: 'chat-messages', where: { room: { equals: 'lounge' } } }),
  ])
  const languages = langs.docs.map((l) => ({ code: l.code, name: l.nativeName || l.name, isDefault: !!l.isDefault }))
  // the default wording per language (used when a field is left empty) — shown as placeholders
  const defaults: Record<string, Record<string, string>> = {}
  for (const d of tr.docs) for (const v of d.values || []) if (v.locale && v.value) (defaults[d.key] ||= {})[v.locale] = v.value
  const l = chat.lounge || {}
  return (
    <LoungeEditor
      languages={languages}
      defaults={defaults}
      messages={msgs.totalDocs}
      updatedAt={chat.updatedAt || null}
      initial={{
        chatTitle: fillLanguages(l.chatTitle, languages),
        name: fillLanguages(l.name, languages),
        subtitle: fillLanguages(l.subtitle, languages),
        description: fillLanguages(l.description, languages),
        postBy: l.postBy === 'team' ? 'team' : 'everyone',
        mediaView: (['everyone', 'members', 'team', 'none'].includes(String(l.mediaView)) ? l.mediaView : 'everyone') as 'everyone',
        mediaSave: l.mediaSave !== false,
      }}
    />
  )
}
