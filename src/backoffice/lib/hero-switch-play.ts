import { heroMotionPlay, type HeroMotionSettings } from '@/lib/hero-motion'

/**
 * Plays the partner-switch animation of the first-screen picture inside a back-office preview: `oldEl` (the previous partner's
 * person) leaves, `newEl` (this partner's) arrives. Same keyframes as the site (src/site/engine/engine.ts → swapHero), with
 * distances scaled from a 1440 px wide screen to the preview's width. Returns the total duration in ms.
 */
export function playHeroSwitch(stageWidth: number, oldEl: HTMLElement, newEl: HTMLElement, settings: HeroMotionSettings, from: 1 | -1) {
  const M = heroMotionPlay(settings), k = stageWidth / 1440
  const t = (entering: boolean) => {
    const d = (entering ? M.dx : -Math.round(M.dx * 0.8)) * k
    return M.style === 'rise' ? `translateY(${(entering ? M.dx : M.dx * 0.6) * k}px)` : M.style === 'fade' ? 'none' : `translateX(${from * d}px)`
  }
  oldEl.getAnimations().forEach((a) => a.cancel()); newEl.getAnimations().forEach((a) => a.cancel())
  oldEl.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: t(false) }], { duration: M.outMs, easing: M.outEase, fill: 'both' })
  newEl.animate([{ opacity: 0, transform: t(true), offset: 0 }, { opacity: 1, offset: M.style === 'fade' ? 1 : 0.85 }, { opacity: 1, transform: 'none', offset: 1 }], { duration: M.inMs, easing: M.ease, delay: M.delay, fill: 'both' })
  return Math.max(M.outMs, M.delay + M.inMs)
}
