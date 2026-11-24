'use client'
import { useEffect, useRef, useState } from 'react'

/*
 * Language switcher in the site nav. Shows the current language's icon (uploaded in the back office) and code;
 * the menu lists every enabled language. Picking one remembers it (cookie `oc_locale`, read by "/") and opens the same
 * section in that language. Hidden when only one language is enabled.
 */
export type SwitcherLang = { code: string; nativeName: string; iconUrl: string | null }

function Flag({ l }: { l: SwitcherLang }) {
  return l.iconUrl ? <img className="lang-flag" src={l.iconUrl} alt="" /> : <span className="lang-flag lang-flag-code" aria-hidden="true">{l.code.slice(0, 2)}</span>
}

export function LanguageSwitcher({ languages, current, label }: { languages: SwitcherLang[]; current: string; label: string }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const items = useRef<(HTMLAnchorElement | null)[]>([])

  useEffect(() => {
    if (!open) return
    const out = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.current?.focus() }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const list = items.current.filter(Boolean) as HTMLAnchorElement[]
        const i = list.indexOf(document.activeElement as HTMLAnchorElement)
        list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus()
      }
    }
    document.addEventListener('pointerdown', out)
    document.addEventListener('keydown', key, true)
    const cur = languages.findIndex((l) => l.code === current)
    setTimeout(() => items.current[Math.max(0, cur)]?.focus(), 30)
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', key, true) }
  }, [open, current, languages])

  if (languages.length < 2) return null
  const cur = languages.find((l) => l.code === current) || languages[0]

  function pick(e: React.MouseEvent, code: string) {
    e.preventDefault()
    try { document.cookie = `oc_locale=${code}; path=/; max-age=${365 * 86400}; samesite=lax` } catch {}
    setOpen(false)
    if (code !== current) window.location.href = '/' + code + window.location.hash
  }

  return (
    <div className={'lang' + (open ? ' open' : '')} ref={box}>
      <button ref={btn} type="button" className="lang-btn" aria-haspopup="true" aria-expanded={open} aria-label={`${label}: ${cur.nativeName}`} onClick={() => setOpen((o) => !o)}>
        <Flag l={cur} />
        <span className="lang-code">{cur.code}</span>
        <svg className="lang-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <div className="lang-menu" role="menu" aria-label={label}>
        {languages.map((l, i) => (
          <a
            key={l.code}
            ref={(el) => { items.current[i] = el }}
            href={'/' + l.code}
            hrefLang={l.code}
            lang={l.code}
            role="menuitemradio"
            aria-checked={l.code === cur.code}
            tabIndex={open ? 0 : -1}
            className="lang-item"
            onClick={(e) => pick(e, l.code)}
          >
            <Flag l={l} />
            <span className="lang-name">{l.nativeName}</span>
            <span className="lang-code">{l.code}</span>
            {l.code === cur.code && <svg className="lang-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>}
          </a>
        ))}
      </div>
    </div>
  )
}
