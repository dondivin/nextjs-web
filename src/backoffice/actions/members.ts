'use server'
import { randomInt } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { actionUser, payloadClient, run } from '@/backoffice/lib/server'
import { dropMedia } from '@/chat/avatar'
import { chatConfig } from '@/chat/data'
import { shredRoom } from '@/chat/crypto'

/* Member accounts (people who signed up in the site chat), managed from Members → a member. Moderators and owners. */

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.'-]{0,22}[\p{L}\p{N}]$/u   // same rule as sign-up (src/chat/service.ts)
const done = (id?: string) => { revalidatePath('/admin/members'); revalidatePath('/admin/moderation'); if (id) revalidatePath('/admin/members/' + id) }

/** Username, e-mail and the private moderation note. */
export async function saveMemberDetails(id: string, input: { name: string; email: string; note: string }) {
  return run(async () => {
    await actionUser('moderator')
    const payload = await payloadClient()
    const name = String(input.name || '').trim().replace(/\s+/g, ' ')
    const email = String(input.email || '').trim().toLowerCase()
    if (!NAME_RE.test(name)) throw new Error('Usernames are 2 to 24 letters or numbers (spaces, _ . \' - allowed inside).')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid e-mail address.')
    const key = name.toLowerCase()
    const taken = await payload.find({ collection: 'members', where: { and: [{ nameKey: { equals: key } }, { id: { not_equals: id } }] }, limit: 1, depth: 0, overrideAccess: true })
    if (taken.docs.length) throw new Error('Another member already uses that username.')
    const staff = await payload.find({ collection: 'users', pagination: false, depth: 0, overrideAccess: true, select: { name: true } })
    const cfg = await chatConfig(payload)
    if ([cfg.agentName, ...staff.docs.map((u) => u.name)].filter(Boolean).some((n) => String(n).trim().toLowerCase() === key)) throw new Error('That name belongs to the team.')
    const mail = await payload.find({ collection: 'members', where: { and: [{ email: { equals: email } }, { id: { not_equals: id } }] }, limit: 1, depth: 0, overrideAccess: true })
    if (mail.docs.length) throw new Error('Another account already uses that e-mail address.')
    await payload.update({ collection: 'members', id, data: { displayName: name, email, moderationNote: String(input.note || '').slice(0, 2000) }, overrideAccess: true })
    done(id)
  })
}

/** A new temporary password, shown once to the moderator to pass on (the member can change it later). */
export async function setTemporaryPassword(id: string) {
  return run(async () => {
    await actionUser('moderator')
    const payload = await payloadClient()
    const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const part = () => Array.from({ length: 4 }, () => abc[randomInt(abc.length)]).join('')
    const password = `${part()}-${part()}-${part()}`
    await payload.update({ collection: 'members', id, data: { password, loginAttempts: 0, lockUntil: null } as never, overrideAccess: true })
    // any open "forgot password" request is settled by this
    await payload.update({ collection: 'password-resets', where: { and: [{ member: { equals: id } }, { status: { in: ['pending', 'approved'] } }] }, data: { status: 'done' } as never, overrideAccess: true }).catch(() => {})
    done(id)
    return password
  })
}

/**
 * Delete an account. Their memberships, chat requests, read receipts and reset requests go; rooms they owned become team rooms.
 * Messages are kept (shown as "Deleted account") unless `deleteMessages`.
 */
export async function deleteMemberAccount(id: string, deleteMessages: boolean) {
  return run(async () => {
    await actionUser('moderator')
    const payload = await payloadClient()
    const m = await payload.findByID({ collection: 'members', id, depth: 0, overrideAccess: true })
    if (deleteMessages) {
      await payload.delete({ collection: 'chat-messages', where: { author: { equals: id } }, overrideAccess: true })
      await payload.delete({ collection: 'chat-messages', where: { room: { equals: 'dm:' + id } }, overrideAccess: true })   // their help chat with the team
      await shredRoom(payload, 'dm:' + id)   // and its conversation key
    }
    await payload.delete({ collection: 'chat-room-members', where: { member: { equals: id } }, overrideAccess: true })
    await payload.delete({ collection: 'chat-requests', where: { or: [{ from: { equals: id } }, { to: { equals: id } }] }, overrideAccess: true })
    await payload.delete({ collection: 'password-resets', where: { member: { equals: id } }, overrideAccess: true })
    await payload.delete({ collection: 'chat-receipts', where: { or: [{ reader: { equals: id } }, { room: { like: id } }] }, overrideAccess: true })
    await payload.update({ collection: 'chat-rooms', where: { owner: { equals: id } }, data: { owner: null }, overrideAccess: true })
    await payload.delete({ collection: 'members', id, overrideAccess: true })
    if (m.avatar) await dropMedia(payload, m.avatar)
    done()
  })
}
