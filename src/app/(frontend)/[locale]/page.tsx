import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Site from '@/site/Site'
import { loadSite } from '@/i18n/data'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params
  const data = await loadSite(locale)
  if (!data) return {}
  const s = data.cfg.strings
  return {
    title: data.cfg.siteName,
    description: `${s['hero.headline.1'] || ''} ${s['hero.headline.2'] || ''}`.trim(),
    alternates: { languages: Object.fromEntries(data.languages.map((l) => [l.code, '/' + l.code])) },
  }
}

export default async function Page({ params }: Params) {
  const { locale } = await params
  const data = await loadSite(locale)
  if (!data) notFound()
  return <Site cfg={data.cfg} initial={data.initial} extras={data.extras} />
}
