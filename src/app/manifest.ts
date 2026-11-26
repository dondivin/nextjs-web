import type { MetadataRoute } from 'next'
import { brandContext, } from '@/lib/brand-images'
import { iconVersion } from '@/lib/brand'

export const dynamic = 'force-dynamic'

/**
 * /manifest.webmanifest — lets phones add the site to the home screen as an app: it then opens full screen, with no
 * address bar (the only way to hide it on iPhone, where a page can't go full screen by itself). Name, colours and icons
 * come from the back office (site name, logo / tab icon, theme).
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const brand = await brandContext(), v = iconVersion(brand)
  return {
    name: brand.siteName,
    short_name: brand.siteName.slice(0, 12),
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: brand.night,
    theme_color: brand.night,
    icons: [
      { src: '/brand/icon/192?v=' + v, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon/512?v=' + v, sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
}
