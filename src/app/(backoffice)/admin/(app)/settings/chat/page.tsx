import type { Metadata } from 'next'
import { requireUser, payloadClient } from '@/backoffice/lib/server'
import { ChatSettingsView } from '@/backoffice/views/chat-settings'
import { fillLanguages } from '@/backoffice/lib/localized'
import { mediaUsage } from '@/chat/cleanup'

export const metadata: Metadata = { title: 'Chat settings' }
export const dynamic = 'force-dynamic'

export default async function ChatSettingsPage() {
  await requireUser('moderator')
  const payload = await payloadClient()
  const [chat, langs] = await Promise.all([
    payload.findGlobal({ slug: 'chat-settings', depth: 0 }),
    payload.find({ collection: 'languages', sort: 'order', pagination: false, depth: 0 }),
  ])
  const languages = langs.docs.map((l) => ({ code: l.code, name: l.nativeName || l.name, isDefault: !!l.isDefault }))
  return (
    <ChatSettingsView
      languages={languages}
      updatedAt={chat.updatedAt || null}
      usage={await mediaUsage(payload)}
      initial={{
        slowModeSeconds: chat.slowModeSeconds ?? 0,
        maxLength: chat.maxLength ?? 400,
        voiceMaxSeconds: chat.voiceMaxSeconds ?? 120,
        mediaRetentionDays: chat.mediaRetentionDays ?? 0,
        pmPictures: chat.privateChats?.pictures === true,
        pmVoice: chat.privateChats?.voice !== false,
        pmForward: chat.privateChats?.forward !== false,
        rules: (chat.rules || []).map((r) => ({ icon: r.icon || 'shield', title: fillLanguages(r.title, languages), body: fillLanguages(r.body, languages) })),
        bannedWords: (chat.bannedWords || []).map((w) => w.word).filter(Boolean).join('\n'),
      }}
    />
  )
}
