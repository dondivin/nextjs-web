import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/brand'

/** /robots.txt — the public site is indexable; the back office, raw editor and APIs are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/cms', '/api/', '/chat-api/'] }],
    sitemap: siteUrl() + '/sitemap.xml',
    host: siteUrl(),
  }
}
