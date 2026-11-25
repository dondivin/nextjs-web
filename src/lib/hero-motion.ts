/**
 * How the first-screen picture changes when the site switches TO a partner (each partner has its own settings).
 * Stored on `partners.heroMotion`; the engine receives the resolved values (`EnginePartner.motion`).
 */
export const HERO_STYLES = [
  { value: 'slide', label: 'Slide', hint: 'Comes in from the side the partner is on (or the way the phone was dragged)' },
  { value: 'rise', label: 'Rise', hint: 'Comes up from below, like when the page opens' },
  { value: 'fade', label: 'Fade', hint: 'Crossfade, no movement' },
] as const
export const HERO_EASINGS = [
  { value: 'soft', label: 'Soft', hint: 'Glides in and slows down gently', css: 'cubic-bezier(.22,.61,.36,1)' },
  { value: 'smooth', label: 'Smooth', hint: 'Speeds up, then slows down evenly', css: 'cubic-bezier(.45,0,.55,1)' },
  { value: 'expressive', label: 'Expressive', hint: 'Quick start, long settle (the page-opening curve)', css: 'cubic-bezier(.16,1,.3,1)' },
  { value: 'linear', label: 'Linear', hint: 'Constant speed', css: 'linear' },
] as const
export type HeroStyle = (typeof HERO_STYLES)[number]['value']
export type HeroEasing = (typeof HERO_EASINGS)[number]['value']
export type HeroMotionSettings = { style: HeroStyle; enterMs: number; exitMs: number; delayMs: number; distance: number; easing: HeroEasing }
export const HERO_MOTION_DEFAULT: HeroMotionSettings = { style: 'slide', enterMs: 1600, exitMs: 900, delayMs: 180, distance: 140, easing: 'soft' }
export const HERO_LIMITS = { enterMs: [200, 5000], exitMs: [100, 4000], delayMs: [0, 2000], distance: [0, 400] } as const

/** Stored value (possibly partial / missing on older partners) → complete settings. */
export function heroMotionOf(v: unknown): HeroMotionSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const num = (k: keyof typeof HERO_LIMITS) => {
    const n = Number(o[k]); const [lo, hi] = HERO_LIMITS[k]
    return Number.isFinite(n) && o[k] !== null && o[k] !== '' ? Math.min(hi, Math.max(lo, Math.round(n))) : HERO_MOTION_DEFAULT[k]
  }
  return {
    style: HERO_STYLES.some((s) => s.value === o.style) ? (o.style as HeroStyle) : HERO_MOTION_DEFAULT.style,
    easing: HERO_EASINGS.some((s) => s.value === o.easing) ? (o.easing as HeroEasing) : HERO_MOTION_DEFAULT.easing,
    enterMs: num('enterMs'), exitMs: num('exitMs'), delayMs: num('delayMs'), distance: num('distance'),
  }
}
/** What the engine (and the back-office preview) plays. */
export type HeroMotion = { style: HeroStyle; inMs: number; outMs: number; delay: number; dx: number; ease: string; outEase: string }
export function heroMotionPlay(s: HeroMotionSettings): HeroMotion {
  const ease = HERO_EASINGS.find((e) => e.value === s.easing)?.css || HERO_EASINGS[0].css
  return { style: s.style, inMs: s.enterMs, outMs: s.exitMs, delay: s.delayMs, dx: s.distance, ease, outEase: s.easing === 'linear' ? 'linear' : 'cubic-bezier(.45,0,.55,1)' }
}
