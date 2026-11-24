import type { ArrayField } from 'payload'

/**
 * A text value per language, for content written in the back office (partner bonus text, chat rules, …).
 * Stored as [{ locale: 'en', value: '…' }, …]. Languages are dynamic, so this does not use Payload's static localization.
 */
export function localizedText(name: string, label: string, opts: { textarea?: boolean; required?: boolean; description?: string } = {}): ArrayField {
  return {
    name,
    label,
    type: 'array',
    labels: { singular: 'Translation', plural: 'Translations' },
    admin: { description: opts.description || 'One row per language (use the language code, e.g. en, fr).', initCollapsed: false },
    fields: [
      {
        type: 'row',
        fields: [
          { name: 'locale', type: 'text', required: true, admin: { width: '20%', placeholder: 'en' } },
          opts.textarea
            ? { name: 'value', type: 'textarea', required: opts.required ?? false, admin: { width: '80%' } }
            : { name: 'value', type: 'text', required: opts.required ?? false, admin: { width: '80%' } },
        ],
      },
    ],
  }
}

export type LocalizedValue = { locale?: string | null; value?: string | null }[] | null | undefined

/** Picks the value for `locale`, then the default language, then the first non-empty value. */
export function pickLocalized(list: LocalizedValue, locale: string, fallback: string): string {
  const rows = (list || []).filter((r) => r && r.value)
  return (rows.find((r) => r.locale === locale) || rows.find((r) => r.locale === fallback) || rows[0])?.value || ''
}
