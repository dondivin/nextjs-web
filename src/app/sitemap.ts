import type { MetadataRoute } from 'next'
import { getLanguages } from '@/i18n/data'
import { siteUrl } from '@/lib/brand'

export const dynamic = 'force-dynamic'

/** /sitemap.xml — one entry per enabled language, each listing its translations (hreflang). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl()
  const languages = await getLanguages()
  const alternates = Object.fromEntries(languages.map((l) => [l.code, `${base}/${l.code}`]))
  return languages.map((l) => ({
    url: `${base}/${l.code}`,
    lastModified: new Date(),
    changeFrequency: 'hourly',
    priority: l.isDefault ? 1 : 0.8,
    alternates: { languages: alternates },
  }))
}
