import { notFound } from 'next/navigation'
import Site from '@/site/Site'
import { LanguageSwitcher } from '@/site/LanguageSwitcher'
import { loadSite, payloadClient } from '@/i18n/data'
import { getBrand, siteUrl } from '@/lib/brand'

/**
 * The public site for one language. `/[locale]` renders it normally; `/[locale]/chat[/<room>]` renders the same page with the
 * chat already open (it is a page of its own: own address, refresh-safe, browser Back returns to the site).
 */
export async function renderSite(locale: string, chat?: { room: string | null }) {
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
      <Site cfg={data.cfg} initial={data.initial} extras={data.extras} languageSwitcher={switcher} logoUrl={brand.logoUrl} hero={brand.hero} chat={chat} />
    </>
  )
}
