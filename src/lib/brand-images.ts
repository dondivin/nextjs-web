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

/** Trim transparent / empty margins so the artwork fills the icon (a wide logo in a big empty square is unreadable at 16 px). */
async function trimmed(src: Buffer) {
  try { return await sharp(src, { density: 300 }).trim({ threshold: 8 }).png().toBuffer() } catch { return await sharp(src, { density: 300 }).png().toBuffer() }
}

/**
 * Square icon (browser tab, home screen, search results). `solid` = no transparency (Apple home-screen icons).
 * - A dedicated icon (Site settings → Browser tab icon): margins trimmed, used as it is.
 * - Else the logo: margins trimmed, centred on a rounded tile in the site's dark colour, so a white / silver logo shows on
 *   light and dark tabs alike.
 * - Neither: the default mark.
 */
export async function brandIcon(brand: Brand, size: number, base: string, solid = false) {
  const key = `icon2:${brand.iconId || ''}:${brand.logoId || 'default:' + brand.blue}:${brand.night}:${size}:${solid}`
  const hit = cache.get(key)
  if (hit) return hit
  let out: Buffer
  if (brand.iconUrl) {
    let img = sharp(await trimmed(await load(brand.iconUrl, base))).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    if (solid) img = img.flatten({ background: brand.night })
    out = await img.png().toBuffer()
  } else if (brand.logoUrl) {
    const pad = Math.round(size * (size <= 32 ? 0.1 : 0.14)), inner = size - pad * 2
    const logo = await sharp(await trimmed(await load(brand.logoUrl, base))).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    const r = solid ? 0 : Math.round(size * 0.22)   // Apple rounds home-screen icons itself
    const tile = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="${brand.night}"/></svg>`)
    out = await sharp(tile).composite([{ input: logo, top: pad, left: pad }]).png().toBuffer()
  } else {
    let img = sharp(defaultMark(brand.blue), { density: 300 }).resize(size, size)
    if (solid) img = img.flatten({ background: brand.blue })
    out = await img.png().toBuffer()
  }
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
