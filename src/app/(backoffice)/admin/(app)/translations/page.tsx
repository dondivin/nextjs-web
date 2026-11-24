import type { Metadata } from 'next'
import { requireUser, payloadClient } from '@/backoffice/lib/server'
import { TranslationsView, type TLang, type TRow } from '@/backoffice/views/translations'

export const metadata: Metadata = { title: 'Translations' }
export const dynamic = 'force-dynamic'

export default async function TranslationsPage() {
  await requireUser('editor', 'translator')
  const payload = await payloadClient()
  const [langs, docs] = await Promise.all([
    payload.find({ collection: 'languages', sort: 'order', pagination: false, depth: 0 }),
    payload.find({ collection: 'translations', sort: 'key', pagination: false, depth: 0 }),
  ])
  const languages: TLang[] = langs.docs.map((l) => ({ id: String(l.id), code: l.code, name: l.name, nativeName: l.nativeName, dir: (l.dir || 'ltr') as 'ltr' | 'rtl', enabled: !!l.enabled, isDefault: !!l.isDefault }))
  const rows: TRow[] = docs.docs.map((d) => ({
    id: String(d.id),
    key: d.key,
    namespace: d.namespace || d.key.split('.')[0],
    context: d.context || '',
    values: Object.fromEntries(((d.values || []) as { locale: string; value?: string | null }[]).map((v) => [v.locale, v.value || ''])),
  }))
  return <TranslationsView languages={languages} rows={rows} />
}
