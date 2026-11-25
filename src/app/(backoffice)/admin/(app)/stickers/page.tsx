import type { Metadata } from 'next'
import { requireUser, payloadClient } from '@/backoffice/lib/server'
import { StickersView } from '@/backoffice/views/stickers'

export const metadata: Metadata = { title: 'Stickers' }
export const dynamic = 'force-dynamic'

export default async function StickersPage() {
  await requireUser('moderator')
  const payload = await payloadClient()
  const res = await payload.find({ collection: 'stickers', sort: 'order', pagination: false, depth: 1 })
  return (
    <StickersView
      rows={res.docs.map((d) => ({ id: String(d.id), name: d.name, active: d.active !== false, url: d.image && typeof d.image === 'object' ? d.image.url || '' : '' }))}
    />
  )
}
