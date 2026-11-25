'use server'
import { revalidatePath } from 'next/cache'
import { actionUser, payloadClient, run } from '@/backoffice/lib/server'
import { AvatarError, dropMedia, storeWallpaper } from '@/chat/avatar'

const done = () => { revalidatePath('/admin/wallpapers'); revalidatePath('/', 'layout') }
type Mode = 'cover' | 'tile'

/** Upload one wallpaper (form fields "file" + "mode"); the name comes from the file name. */
export async function uploadWallpaper(fd: FormData) {
  return run(async () => {
    await actionUser('moderator')
    const payload = await payloadClient()
    const f = fd.get('file')
    if (!(f instanceof File) || !f.size) throw new Error('Choose a picture.')
    const mode: Mode = fd.get('mode') === 'tile' ? 'tile' : 'cover'
    const name = f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 40) || 'Wallpaper'
    let id: string | number
    try { ({ id } = await storeWallpaper(payload, f, name, mode)) } catch (e) { if (e instanceof AvatarError) throw new Error(`Couldn’t use “${f.name}” (a JPEG, PNG or WebP under 8 MB works).`); throw e }
    const last = await payload.find({ collection: 'wallpapers', sort: '-order', limit: 1, depth: 0 })
    await payload.create({ collection: 'wallpapers', data: { name, image: id, mode, dim: mode === 'tile' ? 0 : 20, active: true, order: (last.docs[0]?.order ?? 0) + 1 } })
    done()
  })
}

export async function updateWallpaper(id: string, data: { name?: string; active?: boolean; mode?: Mode; dim?: number }) {
  return run(async () => {
    await actionUser('moderator')
    const payload = await payloadClient()
    const patch: Record<string, unknown> = {}
    if (data.name !== undefined) { const n = String(data.name).trim().slice(0, 40); if (!n) throw new Error('Give it a name.'); patch.name = n }
    if (data.active !== undefined) patch.active = !!data.active
    if (data.mode !== undefined) patch.mode = data.mode === 'tile' ? 'tile' : 'cover'
    if (data.dim !== undefined) patch.dim = Math.max(0, Math.min(70, Math.round(Number(data.dim) || 0)))
    await payload.update({ collection: 'wallpapers', id, data: patch })
    done()
  })
}

/** Move a wallpaper one place earlier (-1) or later (+1). */
export async function moveWallpaper(id: string, dir: -1 | 1) {
  return run(async () => {
    await actionUser('moderator')
    const payload = await payloadClient()
    const all = (await payload.find({ collection: 'wallpapers', sort: 'order', pagination: false, depth: 0 })).docs
    const i = all.findIndex((d) => String(d.id) === id), j = i + dir
    if (i < 0 || j < 0 || j >= all.length) return
    const [a] = all.splice(i, 1); all.splice(j, 0, a)
    for (let k = 0; k < all.length; k++) if (all[k].order !== k) await payload.update({ collection: 'wallpapers', id: all[k].id, data: { order: k } })
    done()
  })
}

export async function deleteWallpaper(id: string) {
  return run(async () => {
    await actionUser('moderator')
    const payload = await payloadClient()
    const d = await payload.findByID({ collection: 'wallpapers', id, depth: 0 })
    await payload.delete({ collection: 'wallpapers', id })
    if (d.image) await dropMedia(payload, d.image)
    done()
  })
}
