import type { Metadata } from 'next'
import { requireUser, payloadClient } from '@/backoffice/lib/server'
import { WallpapersView } from '@/backoffice/views/wallpapers'

export const metadata: Metadata = { title: 'Wallpapers' }
export const dynamic = 'force-dynamic'

export default async function WallpapersPage() {
  await requireUser('moderator')
  const payload = await payloadClient()
  const res = await payload.find({ collection: 'wallpapers', sort: 'order', pagination: false, depth: 1 })
  return (
    <WallpapersView
      rows={res.docs.map((d) => ({
        id: String(d.id), name: d.name, active: d.active !== false, mode: (d.mode === 'tile' ? 'tile' : 'cover') as 'cover' | 'tile', dim: typeof d.dim === 'number' ? d.dim : 20,
        url: d.image && typeof d.image === 'object' ? d.image.url || '' : '',
      }))}
    />
  )
}
