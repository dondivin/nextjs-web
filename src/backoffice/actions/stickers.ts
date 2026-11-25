'use server'
import { revalidatePath } from 'next/cache'
import { actionUser, payloadClient, run } from '@/backoffice/lib/server'
import { AvatarError, dropMedia, storeSticker } from '@/chat/avatar'

const done = () => { revalidatePath('/admin/stickers'); revalidatePath('/', 'layout') }

/** Upload one or more stickers (form field "files"); the name comes from the file name. */
export async function uploadStickers(fd: FormData) {
  return run(async () => {
    await actionUser('moderator')
    const payload = await payloadClient()
    const files = fd.getAll('files').filter((f): f is File => f instanceof File && f.size > 0).slice(0, 30)
    if (!files.length) throw new Error('Choose at least one picture.')
    const last = await payload.find({ collection: 'stickers', sort: '-order', limit: 1, depth: 0 })
    let order = (last.docs[0]?.order ?? 0) + 1, added = 0
    const failed: string[] = []
    for (const f of files) {
      const name = f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 40) || 'Sticker'
      try {
        const { id } = await storeSticker(payload, f, name)
        await payload.create({ collection: 'stickers', data: { name, image: id, active: true, order: order++ } })
        added++
      } catch (e) {
        if (e instanceof AvatarError) failed.push(f.name)
        else throw e
      }
    }
    done()
    return { added, failed }
  })
}

export async function updateSticker(id: string, data: { name?: string; active?: boolean }) {
  return run(async () => {
    await actionUser('moderator')
    const payload = await payloadClient()
    const name = data.name !== undefined ? String(data.name).trim().slice(0, 40) : undefined
    if (name !== undefined && !name) throw new Error('Give it a name.')
    await payload.update({ collection: 'stickers', id, data: { ...(name !== undefined ? { name } : {}), ...(data.active !== undefined ? { active: !!data.active } : {}) } })
    done()
  })
}

/** Move a sticker one place earlier (-1) or later (+1) in the tray. */
export async function moveSticker(id: string, dir: -1 | 1) {
  return run(async () => {
    await actionUser('moderator')
    const payload = await payloadClient()
    const all = (await payload.find({ collection: 'stickers', sort: 'order', pagination: false, depth: 0 })).docs
    const i = all.findIndex((d) => String(d.id) === id), j = i + dir
    if (i < 0 || j < 0 || j >= all.length) return
    const [a] = all.splice(i, 1); all.splice(j, 0, a)
    for (let k = 0; k < all.length; k++) if (all[k].order !== k) await payload.update({ collection: 'stickers', id: all[k].id, data: { order: k } })
    done()
  })
}

export async function deleteSticker(id: string) {
  return run(async () => {
    await actionUser('moderator')
    const payload = await payloadClient()
    const d = await payload.findByID({ collection: 'stickers', id, depth: 0 })
    await payload.delete({ collection: 'stickers', id })
    if (d.image) await dropMedia(payload, d.image)
    done()
  })
}
