import type { Localized } from '@/backoffice/lib/forms'

/** Shared by server pages and client forms (no 'use client' here). */
export type Lang = { code: string; name: string; isDefault?: boolean }

/** Every language present (empty when missing), default language first. */
export function fillLanguages(rows: { locale?: string | null; value?: string | null }[] | null | undefined, languages: Lang[]): Localized {
  const list = (rows || []).map((r) => ({ locale: String(r.locale || ''), value: String(r.value || '') })).filter((r) => r.locale)
  for (const l of languages) if (!list.some((r) => r.locale === l.code)) list.push({ locale: l.code, value: '' })
  return list
}
