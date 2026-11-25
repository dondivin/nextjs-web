'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { HeroMotionSettings } from '@/lib/hero-motion'
import { playHeroSwitch } from './hero-switch-play'

/**
 * Drives a back-office preview of the partner switch: replays automatically (~0.3 s after the last change) whenever the
 * settings or the picture change, can loop, and remembers the chosen direction. Attach the three refs to the stage, the
 * previous partner's person and this partner's person.
 */
export function useHeroSwitch(settings: HeroMotionSettings, heroUrl: string | null) {
  const stage = useRef<HTMLDivElement>(null), oldEl = useRef<HTMLDivElement>(null), newEl = useRef<HTMLDivElement>(null)
  const [from, setFrom] = useState<1 | -1>(1)
  const [loop, setLoop] = useState(false)
  const key = JSON.stringify(settings) + '|' + (heroUrl || '')
  const lastKey = useRef(key)
  const play = useCallback((dir?: 1 | -1) => {
    if (!stage.current || !oldEl.current || !newEl.current) return 0
    if (dir) setFrom(dir)
    return playHeroSwitch(stage.current.clientWidth, oldEl.current, newEl.current, settings, dir || from)
  }, [settings, from])
  // replay when a setting changes (not on first render)
  useEffect(() => {
    if (lastKey.current === key) return
    lastKey.current = key
    const t = setTimeout(() => play(), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  // loop: replay after each run, alternating sides for "slide"
  useEffect(() => {
    if (!loop) return
    let alive = true, timer = 0 as unknown as ReturnType<typeof setTimeout>, dir: 1 | -1 = from
    const run = () => { if (!alive) return; const ms = play(dir); dir = dir === 1 ? -1 : 1; timer = setTimeout(run, ms + 1200) }
    run()
    return () => { alive = false; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loop, key])
  return { stage, oldEl, newEl, from, play, loop, setLoop }
}
