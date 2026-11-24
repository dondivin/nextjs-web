/**
 * Avatar gradients, shared by the browser (sign-up picker) and the server (default + validation).
 * Stored as a plain CSS value in one strict format, so it can be used directly as `background` and can't carry anything else:
 *   linear-gradient(135deg, #RRGGBB, #RRGGBB)
 */
export const GRADIENT_RE = /^linear-gradient\((\d{1,3})deg, (#[0-9a-f]{6}), (#[0-9a-f]{6})\)$/i

function hsl2hex(h: number, s: number, l: number) {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, '0')
  return '#' + f(0) + f(8) + f(4)
}

/** A random, readable gradient (two neighbouring hues, white initials stay legible). */
export function randomGradient(rand: () => number = Math.random) {
  const h1 = Math.floor(rand() * 360)
  const h2 = (h1 + 35 + Math.floor(rand() * 55)) % 360
  const angle = [120, 135, 150, 160][Math.floor(rand() * 4)]
  return `linear-gradient(${angle}deg, ${hsl2hex(h1, 72 + rand() * 12, 52 + rand() * 6)}, ${hsl2hex(h2, 72 + rand() * 12, 40 + rand() * 6)})`
}

export const isGradient = (v: unknown): v is string => typeof v === 'string' && GRADIENT_RE.test(v)

/** First colour of the gradient: used where one solid colour is needed (the name above a message). */
export function gradientColor(g: string | null | undefined) {
  const m = g ? GRADIENT_RE.exec(g) : null
  return m ? m[2] : undefined
}
