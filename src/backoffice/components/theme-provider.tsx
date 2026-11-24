'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

/*
 * Light / dark / system theme for the back office (replaces next-themes, whose provider renders a <script> from a client
 * component — React 19.2 warns about that). The anti-flash script below is rendered by the server layout in <head>;
 * this provider only applies changes. Same storage key as before ('theme'), so saved choices are kept.
 */
export type Theme = 'light' | 'dark' | 'system'
import { THEME_KEY as KEY } from '@/backoffice/lib/theme-script'


type Ctx = { theme: Theme; resolvedTheme: 'light' | 'dark'; setTheme: (t: Theme) => void }
const ThemeContext = createContext<Ctx>({ theme: 'system', resolvedTheme: 'light', setTheme: () => {} })

const systemDark = () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches

function apply(resolved: 'light' | 'dark') {
  const el = document.documentElement
  // switch instantly: no colour transitions while the theme changes
  const css = document.createElement('style')
  css.appendChild(document.createTextNode('*,*::before,*::after{transition:none!important}'))
  document.head.appendChild(css)
  el.classList.toggle('dark', resolved === 'dark')
  el.style.colorScheme = resolved
  void window.getComputedStyle(document.body).opacity
  setTimeout(() => css.remove(), 1)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system')
  const [sysDark, setSysDark] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY)
      if (saved === 'light' || saved === 'dark' || saved === 'system') setThemeState(saved)
    } catch {}
    setSysDark(systemDark())
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = (e: MediaQueryListEvent) => setSysDark(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const resolvedTheme: 'light' | 'dark' = theme === 'system' ? (sysDark ? 'dark' : 'light') : theme
  useEffect(() => { apply(resolvedTheme) }, [resolvedTheme])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    try { localStorage.setItem(KEY, t) } catch {}
  }, [])

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
