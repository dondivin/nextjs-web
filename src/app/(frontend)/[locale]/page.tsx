import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Site from '@/site/Site'
import { LanguageSwitcher } from '@/site/LanguageSwitcher'
import { loadSite, payloadClient } from '@/i18n/data'
import { getBrand, seoDescription, siteUrl } from '@/lib/brand'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params
  const data = await loadSite(locale)
  if (!data) return {}
  const s = data.cfg.strings
  const payload = await payloadClient()
  const brand = await getBrand(payload)
  const description = await seoDescription(payload, locale, data.defaultLocale, plainText(`${s['hero.headline.1'] || ''} ${s['hero.headline.2'] || ''} ${s['hero.intro'] || ''}`))
  const title = data.cfg.siteName
  return {
    metadataBase: new URL(siteUrl()),
    title,
    description,
    applicationName: title,
    alternates: {
      canonical: '/' + locale,
      languages: { ...Object.fromEntries(data.languages.map((l) => [l.code, '/' + l.code])), 'x-default': '/' },
    },
    openGraph: {
      type: 'website',
      siteName: title,
      title,
      description,
      url: '/' + locale,
      locale,
      alternateLocale: data.languages.filter((l) => l.code !== locale).map((l) => l.code),
      images: [{ url: '/brand/og', width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['/brand/og'] },
    icons: {
      icon: [{ url: '/brand/icon/32', sizes: '32x32', type: 'image/png' }, { url: '/brand/icon/192', sizes: '192x192', type: 'image/png' }],
      apple: [{ url: '/brand/icon/180', sizes: '180x180', type: 'image/png' }],
    },
    robots: { index: true, follow: true },
    other: { 'theme-color': brand.night },
  }
}

/** Markup like **bold** / {placeholders} removed, for plain-text descriptions. */
function plainText(v: string) {
  return v.replace(/\*\*|__/g, '').replace(/\{\w+\}/g, '').replace(/\s+/g, ' ').trim().slice(0, 300)
}

export default async function Page({ params }: Params) {
  const { locale } = await params
  const data = await loadSite(locale)
  if (!data) notFound()
  const switcher = (
    <LanguageSwitcher
      current={locale}
      label={data.cfg.strings['nav.language'] || 'Language'}
      languages={data.languages.map((l) => ({ code: l.code, nativeName: l.nativeName, iconUrl: l.iconUrl }))}
    />
  )
  const brand = await getBrand(await payloadClient())
  const base = siteUrl()
  // structured data: lets search engines show the site name and logo
  const jsonLd = [
    { '@context': 'https://schema.org', '@type': 'Organization', name: data.cfg.siteName, url: base, logo: base + '/brand/icon/512' },
    { '@context': 'https://schema.org', '@type': 'WebSite', name: data.cfg.siteName, url: base + '/' + locale, inLanguage: locale },
  ]
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <Site cfg={data.cfg} initial={data.initial} extras={data.extras} languageSwitcher={switcher} logoUrl={brand.logoUrl} />
    </>
  )
}
