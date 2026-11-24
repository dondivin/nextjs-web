'use server'
import { AvatarError, dropMedia, storeLanguageIcon } from '@/chat/avatar'
import { revalidatePath } from 'next/cache'
import { actionUser, payloadClient, run } from '@/backoffice/lib/server'

type Row = { locale: string; value?: string | null }

export async function saveTranslation(id: string, locale: string, value: string) {
  return run(async () => {
    await actionUser('editor', 'translator')
    const payload = await payloadClient()
    const doc = await payload.findByID({ collection: 'translations', id, depth: 0 })
    const values = ((doc.values || []) as Row[]).map((v) => ({ locale: v.locale, value: v.value || '' }))
    const row = values.find((v) => v.locale === locale)
    if (row) row.value = value
    else values.push({ locale, value })
    await payload.update({ collection: 'translations', id, data: { values } })
  })
}

/** Bulk import: rows of { key, values: { en: '…', fr: '…' } }. Empty cells are ignored. Unknown keys are skipped. */
export async function importTranslations(rows: { key: string; values: Record<string, string> }[]) {
  return run(async () => {
    await actionUser('editor', 'translator')
    const payload = await payloadClient()
    const all = await payload.find({ collection: 'translations', pagination: false, depth: 0 })
    const byKey = new Map(all.docs.map((d) => [d.key, d]))
    let updated = 0, skipped = 0
    for (const r of rows) {
      const doc = byKey.get(r.key)
      if (!doc) { skipped++; continue }
      const values = ((doc.values || []) as Row[]).map((v) => ({ locale: v.locale, value: v.value || '' }))
      let changed = false
      for (const [locale, value] of Object.entries(r.values)) {
        if (!value) continue
        const row = values.find((v) => v.locale === locale)
        if (row && row.value === value) continue
        if (row) row.value = value
        else values.push({ locale, value })
        changed = true
      }
      if (changed) { await payload.update({ collection: 'translations', id: doc.id, data: { values } }); updated++ }
    }
    revalidatePath('/admin/translations')
    return { updated, skipped }
  })
}

export async function addLanguage(data: { code: string; name: string; nativeName: string; dir: 'ltr' | 'rtl' }) {
  return run(async () => {
    await actionUser('editor', 'translator')
    const payload = await payloadClient()
    const code = data.code.trim().toLowerCase()
    if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(code)) throw new Error('Use a language code like sw, pt or pt-br')
    const exists = await payload.find({ collection: 'languages', where: { code: { equals: code } }, limit: 1 })
    if (exists.docs.length) throw new Error('That language already exists')
    const count = await payload.count({ collection: 'languages' })
    const doc = await payload.create({ collection: 'languages', data: { code, name: data.name.trim(), nativeName: data.nativeName.trim(), dir: data.dir, enabled: false, isDefault: false, order: count.totalDocs + 1 } })
    revalidatePath('/admin/translations')
    return String(doc.id)
  })
}

export async function updateLanguage(id: string, data: { enabled?: boolean; isDefault?: boolean }) {
  return run(async () => {
    await actionUser('editor', 'translator')
    const payload = await payloadClient()
    if (data.isDefault) data.enabled = true
    await payload.update({ collection: 'languages', id, data })
    revalidatePath('/admin/translations')
  })
}

/** Upload (FormData "icon") or remove (no file) the icon shown in the site's language switcher. */
export async function setLanguageIcon(id: string, fd: FormData | null) {
  return run(async () => {
    await actionUser('editor', 'translator')
    const payload = await payloadClient()
    const lang = await payload.findByID({ collection: 'languages', id, depth: 0 })
    const file = fd?.get('icon')
    let icon: string | number | null = null
    if (file instanceof File && file.size > 0) {
      try {
        icon = await storeLanguageIcon(payload, file, lang.code)
      } catch (e) {
        if (e instanceof AvatarError) throw new Error(e.message === 'tooBig' ? 'That icon is over 2 MB.' : 'That file can’t be used as an icon. Try SVG, PNG or JPG.')
        throw e
      }
    }
    await payload.update({ collection: 'languages', id, data: { icon } })
    if (lang.icon) await dropMedia(payload, lang.icon)
    revalidatePath('/admin/translations')
  })
}
