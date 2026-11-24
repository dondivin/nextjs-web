'use server'
import { revalidatePath } from 'next/cache'
import { actionUser, payloadClient, run } from '@/backoffice/lib/server'
import { isGradient, randomGradient } from '@/chat/gradient'
import { AvatarError, dropMedia, storeAvatar } from '@/chat/avatar'

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.'-]{0,22}[\p{L}\p{N}]$/u

/** Staff: your name and avatar in the site chat (photo or gradient). */
export async function saveChatProfile(fd: FormData) {
  return run(async () => {
    const user = await actionUser('moderator')
    const payload = await payloadClient()
    const name = String(fd.get('name') || '').trim().replace(/\s+/g, ' ')
    if (!NAME_RE.test(name)) throw new Error('Use 2 to 24 letters or numbers (spaces, dots, dashes and _ are fine inside).')
    // don't take a fan's username or another team member's name
    const key = name.toLowerCase()
    const fan = await payload.count({ collection: 'members', where: { nameKey: { equals: key } }, overrideAccess: true })
    if (fan.totalDocs) throw new Error('A fan already uses that name in the chat. Pick another one.')
    const staff = await payload.find({ collection: 'users', pagination: false, depth: 0, select: { name: true } })
    if (staff.docs.some((u) => String(u.id) !== String(user.id) && (u.name || '').trim().toLowerCase() === key)) throw new Error('Another team member already uses that name.')

    const gradient = String(fd.get('gradient') || '')
    const data: Record<string, unknown> = { name, chatGradient: isGradient(gradient) ? gradient : user.chatGradient || randomGradient() }
    const file = fd.get('photo')
    const old = user.chatAvatar
    let replaced = false
    if (file instanceof File && file.size > 0) {
      try {
        data.chatAvatar = await storeAvatar(payload, file, 'staff-' + user.id)
        replaced = true
      } catch (e) {
        if (e instanceof AvatarError) throw new Error(e.message === 'tooBig' ? 'That photo is over 5 MB.' : 'That file can’t be used as a photo. Try a JPG or PNG.')
        throw e
      }
    } else if (fd.get('removePhoto') === '1') {
      data.chatAvatar = null
      replaced = true
    }
    await payload.update({ collection: 'users', id: user.id, data, overrideAccess: true })
    if (replaced && old) await dropMedia(payload, old)
    revalidatePath('/admin', 'layout')
  })
}

/** Moderation: take down a fan's profile photo (their gradient is shown instead). */
export async function removeMemberPhoto(id: string) {
  return run(async () => {
    await actionUser('moderator')
    const payload = await payloadClient()
    const m = await payload.findByID({ collection: 'members', id, depth: 0, overrideAccess: true })
    if (!m.avatar) return
    await payload.update({ collection: 'members', id, data: { avatar: null }, overrideAccess: true })
    await dropMedia(payload, m.avatar)
    revalidatePath('/admin/moderation')
  })
}
