import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { renderSite } from '@/site/render-site'
import { loadSite, payloadClient } from '@/i18n/data'
import { seoDescription } from '@/lib/brand'
import { siteMetadata } from '@/lib/site-metadata'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params
  const data = await loadSite(locale)
  if (!data) return {}
  const s = data.cfg.strings
  const payload = await payloadClient()
  const description = await seoDescription(payload, locale, data.defaultLocale, plainText(`${s['hero.headline.1'] || ''} ${s['hero.headline.2'] || ''} ${s['hero.intro'] || ''}`))
  const title = data.cfg.siteName
  const meta = await siteMetadata(payload, { title, description, path: '/' + locale, siteName: title, locale, altLocales: data.languages.filter((l) => l.code !== locale).map((l) => l.code) })
  return {
    ...meta,
    alternates: {
      canonical: '/' + locale,
      languages: { ...Object.fromEntries(data.languages.map((l) => [l.code, '/' + l.code])), 'x-default': '/' },
    },
  }
}

/** Markup like **bold** / {placeholders} removed, for plain-text descriptions. */
function plainText(v: string) {
  return v.replace(/\*\*|__/g, '').replace(/\{\w+\}/g, '').replace(/\s+/g, ' ').trim().slice(0, 300)
}

export default async function Page({ params }: Params) {
  const { locale } = await params
  return renderSite(locale)
}
