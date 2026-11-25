import { z } from 'zod'
import { HERO_LIMITS } from '@/lib/hero-motion'

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour')
const url = z.string().refine((v) => !v || /^https:\/\//.test(v), 'Links must start with https://')

function ms(k: 'enterMs' | 'exitMs' | 'delayMs', label: string) {
  const [lo, hi] = HERO_LIMITS[k], msg = `${label}: ${lo / 1000} to ${hi / 1000} s`
  return z.number({ error: 'Enter a number' }).int().min(lo, msg).max(hi, msg)
}

export const COLOR_FIELDS = [
  { key: 'night', label: 'Page background', hint: 'Darkest background' },
  { key: 'navy', label: 'Surface', hint: 'Main surfaces, chat wall' },
  { key: 'navy2', label: 'Surface 2', hint: 'Raised surfaces, phone back' },
  { key: 'panel', label: 'Panel', hint: 'Cards on the phone' },
  { key: 'blue', label: 'Accent', hint: 'Gradients, camera plate' },
  { key: 'sky', label: 'Highlight', hint: 'Light accent, rim light' },
  { key: 'cta', label: 'Primary button', hint: 'Buttons and partner pill' },
  { key: 'ink', label: 'Primary button text', hint: 'Text on primary buttons' },
  { key: 'odds', label: 'Odds text', hint: 'Numbers on odds buttons' },
  { key: 'oddBg', label: 'Odds background', hint: 'Odds buttons' },
  { key: 'tint', label: 'Light section', hint: 'Light feature section' },
  { key: 'deep', label: 'Deep', hint: 'Footer and deep areas' },
  { key: 'mute', label: 'Muted text', hint: 'Secondary text' },
  { key: 'nav', label: 'Menu bar', hint: 'Top bar and switcher' },
] as const
export type ColorKey = (typeof COLOR_FIELDS)[number]['key']

export const partnerSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(40),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and dashes only'),
  order: z.number().int(),
  active: z.boolean(),
  promoCode: z.string().max(60),
  signupUrl: url,
  termsUrl: url,
  texts: z.array(z.object({ locale: z.string(), bonus: z.string().max(120), payments: z.string().max(160) })),
  colors: z.object(Object.fromEntries(COLOR_FIELDS.map((f) => [f.key, hex])) as Record<ColorKey, typeof hex>),
  heroMotion: z.object({
    style: z.enum(['slide', 'rise', 'fade']),
    easing: z.enum(['soft', 'smooth', 'expressive', 'linear']),
    enterMs: ms('enterMs', 'Arrival'),
    exitMs: ms('exitMs', 'Leaving'),
    delayMs: ms('delayMs', 'Delay'),
    distance: z.number({ error: 'Enter a number' }).int().min(HERO_LIMITS.distance[0], `${HERO_LIMITS.distance[0]} to ${HERO_LIMITS.distance[1]} px`).max(HERO_LIMITS.distance[1], `${HERO_LIMITS.distance[0]} to ${HERO_LIMITS.distance[1]} px`),
  }),
})
export type PartnerForm = z.infer<typeof partnerSchema>

/** WCAG contrast ratio between two hex colours. */
export function contrast(a: string, b: string) {
  const lum = (h: string) => {
    const n = parseInt(h.slice(1), 16)
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) })
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(a) || !/^#[0-9a-fA-F]{6}$/.test(b)) return 21
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
