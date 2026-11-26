import type { Payload } from 'payload'
import { pickLocalized } from '../fields/localizedText'

/** Platform brand (logo, share image, search description) from Site settings. Server only. */
export type Brand = { siteName: string; logoUrl: string | null; logoId: string | null; iconUrl: string | null; iconId: string | null; shareUrl: string | null; shareId: string | null; night: string; navy: string; blue: string }

/** Changes whenever the tab icon would change: added to the icon links so browsers and search engines fetch the new one. */
export const iconVersion = (b: Pick<Brand, 'iconId' | 'logoId' | 'night'>) => (b.iconId || b.logoId || 'default') + '-' + b.night.replace('#', '')

const urlOf = (x: unknown) => (x && typeof x === 'object' && 'url' in x ? ((x as { url?: string | null }).url || null) : null)
const idOf = (x: unknown) => (x && typeof x === 'object' && 'id' in x ? String((x as { id: unknown }).id) : x ? String(x) : null)

export async function getBrand(payload: Payload): Promise<Brand> {
  const site = await payload.findGlobal({ slug: 'site-settings', depth: 2 })
  const dp = site.defaultPartner && typeof site.defaultPartner === 'object' ? site.defaultPartner : null
  return {
    siteName: site.siteName || 'OddsClub',
    logoUrl: urlOf(site.logo),
    logoId: idOf(site.logo),
    iconUrl: urlOf(site.icon),
    iconId: idOf(site.icon),
    shareUrl: urlOf(site.shareImage),
    shareId: idOf(site.shareImage),
    night: dp?.colors?.night || '#081A30',
    navy: dp?.colors?.navy || '#0D2747',
    blue: dp?.colors?.blue || '#2F6FE0',
  }
}

export async function seoDescription(payload: Payload, locale: string, def: string, fallback: string) {
  const site = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
  return pickLocalized(site.seoDescription, locale, def) || fallback
}

/** Absolute base URL of the site (needed for share images, sitemap, structured data). Set NEXT_PUBLIC_SERVER_URL in production. */
export const siteUrl = () => (process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000').replace(/\/+$/, '')

/**
 * The site's public address for links in page metadata (link previews, canonical…): NEXT_PUBLIC_SERVER_URL, or else the
 * address the visitor / crawler actually used (the host the hosting's proxy passes on) — never a localhost address on a
 * real server even if the variable was forgotten.
 */
export async function publicOrigin(): Promise<string> {
  const env = (process.env.NEXT_PUBLIC_SERVER_URL || '').replace(/\/+$/, '')
  if (env) return env
  try {
    const { headers } = await import('next/headers')
    const h = await headers()
    const host = h.get('x-forwarded-host') || h.get('host')
    if (host) return `${(h.get('x-forwarded-proto') || (/^(localhost|127\.)/.test(host) ? 'http' : 'https')).split(',')[0]}://${host}`
  } catch {}
  return siteUrl()
}
