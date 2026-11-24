import type { Payload } from 'payload'
import { pickLocalized } from '../fields/localizedText'

/** Platform brand (logo, share image, search description) from Site settings. Server only. */
export type Brand = { siteName: string; logoUrl: string | null; logoId: string | null; shareUrl: string | null; shareId: string | null; night: string; navy: string; blue: string; hero: { url: string; w: number; h: number } | null }

const urlOf = (x: unknown) => (x && typeof x === 'object' && 'url' in x ? ((x as { url?: string | null }).url || null) : null)
const idOf = (x: unknown) => (x && typeof x === 'object' && 'id' in x ? String((x as { id: unknown }).id) : x ? String(x) : null)

export async function getBrand(payload: Payload): Promise<Brand> {
  const site = await payload.findGlobal({ slug: 'site-settings', depth: 2 })
  const dp = site.defaultPartner && typeof site.defaultPartner === 'object' ? site.defaultPartner : null
  return {
    siteName: site.siteName || 'OddsClub',
    logoUrl: urlOf(site.logo),
    logoId: idOf(site.logo),
    shareUrl: urlOf(site.shareImage),
    shareId: idOf(site.shareImage),
    night: dp?.colors?.night || '#081A30',
    navy: dp?.colors?.navy || '#0D2747',
    blue: dp?.colors?.blue || '#2F6FE0',
    hero: site.heroImage && typeof site.heroImage === 'object' && site.heroImage.url ? { url: site.heroImage.url, w: site.heroImage.width || 0, h: site.heroImage.height || 0 } : null,
  }
}

export async function seoDescription(payload: Payload, locale: string, def: string, fallback: string) {
  const site = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
  return pickLocalized(site.seoDescription, locale, def) || fallback
}

/** Absolute base URL of the site (needed for share images, sitemap, structured data). Set NEXT_PUBLIC_SERVER_URL in production. */
export const siteUrl = () => (process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000').replace(/\/+$/, '')
