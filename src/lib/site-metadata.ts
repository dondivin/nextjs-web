import type { Metadata } from 'next'
import { getBrand, iconVersion, publicOrigin } from './brand'
import type { Payload } from 'payload'

/**
 * Everything a page needs for link previews (WhatsApp, Telegram, Facebook, X…) and browser icons, so every page —
 * home, chat, a group's link, an invite link — shows the logo and a proper card, never a bare link.
 */
export async function siteMetadata(payload: Payload, o: {
  title: string; description: string; path: string; siteName: string; locale: string; altLocales?: string[]
  image?: { url: string; width?: number; height?: number } | null   // e.g. a group's picture; default: the site's preview image
  index?: boolean
}): Promise<Metadata> {
  const brand = await getBrand(payload), v = iconVersion(brand) + (brand.shareId ? '-' + brand.shareId : '')
  const image = o.image || { url: '/brand/og?v=' + v, width: 1200, height: 630 }
  return {
    metadataBase: new URL(await publicOrigin()),
    title: o.title,
    description: o.description,
    applicationName: o.siteName,
    openGraph: {
      type: 'website', siteName: o.siteName, title: o.title, description: o.description, url: o.path, locale: o.locale,
      ...(o.altLocales?.length ? { alternateLocale: o.altLocales } : {}),
      images: [{ url: image.url, ...(image.width ? { width: image.width } : {}), ...(image.height ? { height: image.height } : {}), alt: o.title }],
    },
    twitter: { card: o.image ? 'summary' : 'summary_large_image', title: o.title, description: o.description, images: [image.url] },
    icons: {
      icon: [{ url: '/brand/icon/32?v=' + iconVersion(brand), sizes: '32x32', type: 'image/png' }, { url: '/brand/icon/192?v=' + iconVersion(brand), sizes: '192x192', type: 'image/png' }],
      apple: [{ url: '/brand/icon/180?v=' + iconVersion(brand), sizes: '180x180', type: 'image/png' }],
    },
    manifest: '/manifest.webmanifest',
    // iPhone: "Add to Home Screen" opens the site like an app — full screen, no address bar
    appleWebApp: { capable: true, title: o.siteName, statusBarStyle: 'black' },
    robots: { index: o.index !== false, follow: true },
    other: { 'theme-color': brand.night },
  }
}
