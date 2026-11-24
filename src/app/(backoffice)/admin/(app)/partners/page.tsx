import type { Metadata } from 'next'
import { requireUser, payloadClient } from '@/backoffice/lib/server'
import { PartnersList, type PartnerCard } from '@/backoffice/views/partners-list'

export const metadata: Metadata = { title: 'Partners' }
export const dynamic = 'force-dynamic'

export default async function PartnersPage() {
  await requireUser('editor')
  const payload = await payloadClient()
  const [res, site] = await Promise.all([
    payload.find({ collection: 'partners', sort: 'order', pagination: false, depth: 0 }),
    payload.findGlobal({ slug: 'site-settings', depth: 0 }),
  ])
  const def = typeof site.defaultPartner === 'object' && site.defaultPartner ? String(site.defaultPartner.id) : site.defaultPartner ? String(site.defaultPartner) : null
  const partners: PartnerCard[] = res.docs.map((p) => ({
    id: String(p.id), name: p.name, slug: p.slug, active: !!p.active, order: p.order || 0, promoCode: p.promoCode || '',
    signupUrl: p.signupUrl || '', colors: p.colors as PartnerCard['colors'], isDefault: def === String(p.id), languages: (p.texts || []).map((t) => t.locale),
  }))
  return <PartnersList partners={partners} />
}
