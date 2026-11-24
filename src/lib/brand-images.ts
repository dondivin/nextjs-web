import sharp from 'sharp'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getBrand, type Brand } from './brand'

/*
 * Images derived from the platform logo (browser tab icon, home-screen icon, link-preview image).
 * Rendered on demand with sharp and cached in memory per logo; without a logo the default lightning mark is used.
 */
const g = globalThis as unknown as { __ocBrandImg?: Map<string, Buffer> }
const cache = g.__ocBrandImg || (g.__ocBrandImg = new Map())

const defaultMark = (blue: string) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${blue}"/><g transform="translate(96 96) scale(13.33)" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3L5 14h6l-1 7 8-11h-6z"/></g></svg>`)

async function load(url: string, base: string) {
  const r = await fetch(new URL(url, base), { cache: 'no-store' })
  if (!r.ok) throw new Error('logo fetch ' + r.status)
  return Buffer.from(await r.arrayBuffer())
}

export async function brandContext(): Promise<Brand> {
  const payload = await getPayload({ config })
  return getBrand(payload)
}

/** Square icon. `solid` = no transparency (Apple home-screen icons). */
export async function brandIcon(brand: Brand, size: number, base: string, solid = false) {
  const key = `icon:${brand.logoId || 'default:' + brand.blue}:${size}:${solid}`
  const hit = cache.get(key)
  if (hit) return hit
  const src = brand.logoUrl ? await load(brand.logoUrl, base) : defaultMark(brand.blue)
  let img = sharp(src, { density: 300 }).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  if (solid) img = img.flatten({ background: brand.logoUrl ? '#ffffff' : brand.blue })
  const out = await img.png().toBuffer()
  cache.set(key, out)
  return out
}

/** 1200×630 link-preview image: the uploaded share image, or the logo on the site's background. */
export async function brandShareImage(brand: Brand, base: string) {
  const key = `og:${brand.shareId || ''}:${brand.logoId || 'default'}:${brand.night}:${brand.navy}`
  const hit = cache.get(key)
  if (hit) return hit
  let out: Buffer
  if (brand.shareUrl) out = await load(brand.shareUrl, base)
  else {
    const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><radialGradient id="g" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="${brand.navy}"/><stop offset="1" stop-color="${brand.night}"/></radialGradient></defs><rect width="1200" height="630" fill="url(#g)"/></svg>`)
    const logo = await brandIcon(brand, 300, base)
    out = await sharp(bg).composite([{ input: logo, top: 165, left: 450 }]).jpeg({ quality: 88, mozjpeg: true }).toBuffer()
  }
  cache.set(key, out)
  return out
}

export const imageHeaders = (type: string) => ({ 'content-type': type, 'cache-control': 'public, max-age=3600, stale-while-revalidate=86400' })
