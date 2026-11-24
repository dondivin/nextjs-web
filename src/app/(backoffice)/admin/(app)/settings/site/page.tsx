import type { Metadata } from 'next'
import { requireUser, payloadClient } from '@/backoffice/lib/server'
import { SiteSettingsView } from '@/backoffice/views/site-settings'
import { fillLanguages } from '@/backoffice/lib/localized'
import { getBrand, siteUrl } from '@/lib/brand'

export const metadata: Metadata = { title: 'Site settings' }
export const dynamic = 'force-dynamic'

export default async function SiteSettingsPage() {
  await requireUser('editor')
  const payload = await payloadClient()
  const [site, partners, langs] = await Promise.all([
    payload.findGlobal({ slug: 'site-settings', depth: 0 }),
    payload.find({ collection: 'partners', sort: 'order', pagination: false, depth: 0, select: { name: true, active: true } }),
    payload.find({ collection: 'languages', sort: 'order', pagination: false, depth: 0 }),
  ])
  const brand = await getBrand(payload)
  const languages = langs.docs.map((l) => ({ code: l.code, name: l.nativeName || l.name, isDefault: !!l.isDefault }))
  const dp = site.defaultPartner
  return (
    <SiteSettingsView
      languages={languages}
      partners={partners.docs.map((p) => ({ id: String(p.id), name: p.name, active: !!p.active }))}
      updatedAt={site.updatedAt || null}
      brand={{ logoUrl: brand.logoUrl, shareUrl: brand.shareUrl, heroUrl: brand.hero?.url || null, siteUrl: siteUrl() }}
      initial={{
        siteName: site.siteName || 'OddsClub',
        defaultPartner: dp ? String(typeof dp === 'object' ? dp.id : dp) : null,
        agentName: site.agentName || '',
        helpline: fillLanguages(site.helpline, languages),
        companyLine: fillLanguages(site.companyLine, languages),
        seoDescription: fillLanguages(site.seoDescription, languages),
      }}
    />
  )
}
