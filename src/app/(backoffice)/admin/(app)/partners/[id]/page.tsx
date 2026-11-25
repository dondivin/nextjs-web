import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireUser, payloadClient } from '@/backoffice/lib/server'
import { hasRole } from '@/access'
import { PartnerEditor } from '@/backoffice/views/partner-editor'
import type { PartnerForm } from '@/backoffice/lib/partner-schema'
import { heroMotionOf } from '@/lib/hero-motion'

export const metadata: Metadata = { title: 'Edit partner' }
export const dynamic = 'force-dynamic'

export default async function PartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser('editor')
  const { id } = await params
  const payload = await payloadClient()
  const p = await payload.findByID({ collection: 'partners', id, depth: 1 }).catch(() => null)
  if (!p) notFound()
  const urlOf = (x: unknown) => (x && typeof x === 'object' && 'url' in x ? ((x as { url?: string | null }).url || null) : null)
  const langs = await payload.find({ collection: 'languages', sort: 'order', pagination: false, depth: 0 })
  const texts = (p.texts || []) as { locale: string; bonus?: string | null; payments?: string | null }[]
  const initial: PartnerForm = {
    name: p.name, slug: p.slug, order: p.order || 0, active: !!p.active, promoCode: p.promoCode || '', signupUrl: p.signupUrl || '', termsUrl: p.termsUrl || '',
    texts: langs.docs.map((l) => { const t = texts.find((x) => x.locale === l.code); return { locale: l.code, bonus: t?.bonus || '', payments: t?.payments || '' } }),
    colors: p.colors as PartnerForm['colors'],
    heroMotion: heroMotionOf(p.heroMotion),
  }
  return (
    <PartnerEditor
      id={String(p.id)}
      initial={initial}
      languages={langs.docs.map((l) => ({ code: l.code, name: l.nativeName }))}
      canDelete={hasRole({ ...user, collection: 'users' }, 'owner')}
      updatedAt={p.updatedAt}
      heroUrl={urlOf(p.heroImage)}
    />
  )
}
