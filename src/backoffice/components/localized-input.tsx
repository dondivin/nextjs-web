'use client'
import { Input } from '@/backoffice/components/ui/input'
import { Textarea } from '@/backoffice/components/ui/textarea'
import type { Localized } from '@/backoffice/lib/forms'
import type { Lang } from '@/backoffice/lib/localized'

export type { Lang } from '@/backoffice/lib/localized'

/** One field per site language for a text that is written in the back office (stored as [{ locale, value }]). */
export function LocalizedInput({ value, onChange, languages, textarea, label, placeholder }: {
  value: Localized
  onChange: (v: Localized) => void
  languages: Lang[]
  textarea?: boolean
  label: string
  placeholder?: string
}) {
  const get = (code: string) => value.find((r) => r.locale === code)?.value || ''
  const set = (code: string, v: string) => {
    const others = value.filter((r) => r.locale !== code)
    onChange([...others, { locale: code, value: v }])
  }
  return (
    <div className="grid gap-2">
      {languages.map((l) => {
        const id = `${label}-${l.code}`.replace(/\s+/g, '-').toLowerCase()
        const missing = !get(l.code).trim()
        return (
          <div key={l.code} className="grid grid-cols-[3.25rem_1fr] items-start gap-2">
            <label htmlFor={id} className="mt-2 flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground" title={l.name}>
              {l.code}{missing && <span className="size-1.5 rounded-full bg-warning" aria-label="missing" />}
            </label>
            {textarea
              ? <Textarea id={id} rows={2} value={get(l.code)} placeholder={placeholder} aria-label={`${label} (${l.name})`} onChange={(e) => set(l.code, e.target.value)} />
              : <Input id={id} value={get(l.code)} placeholder={placeholder} aria-label={`${label} (${l.name})`} onChange={(e) => set(l.code, e.target.value)} />}
          </div>
        )
      })}
    </div>
  )
}
