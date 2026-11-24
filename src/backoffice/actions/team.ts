'use server'
import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { generatePayloadCookie } from 'payload/shared'
import { actionUser, payloadClient, run } from '@/backoffice/lib/server'
import { accountSchema, newMemberSchema, roleEnum, type AccountForm, type NewMemberForm } from '@/backoffice/lib/forms'

type Role = 'owner' | 'editor' | 'translator' | 'moderator'
const tempPassword = () => randomBytes(12).toString('base64url')

/* ---------- team accounts (owners only) ---------- */

/** New back-office account. Returns a temporary password, shown once, to hand over privately. */
export async function createTeamMember(input: NewMemberForm) {
  return run(async () => {
    const me = await actionUser('owner')
    const d = newMemberSchema.parse(input)
    const payload = await payloadClient()
    const taken = await payload.count({ collection: 'users', where: { email: { equals: d.email } } })
    if (taken.totalDocs) throw new Error('A team account with this email already exists.')
    const password = tempPassword()
    await payload.create({ collection: 'users', user: me, overrideAccess: true, data: { name: d.name, email: d.email, roles: d.roles as Role[], password } })
    revalidatePath('/admin/team')
    return { password }
  })
}

export async function setTeamRoles(id: string, roles: string[]) {
  return run(async () => {
    const me = await actionUser('owner')
    if (String(me.id) === String(id)) throw new Error('You can’t change your own roles. Ask another owner.')
    const parsed = roleEnum.array().min(1, 'Pick at least one role').parse(roles)
    const payload = await payloadClient()
    await payload.update({ collection: 'users', id, user: me, overrideAccess: true, data: { roles: parsed } })
    revalidatePath('/admin/team')
  })
}

export async function deleteTeamMember(id: string) {
  return run(async () => {
    const me = await actionUser('owner')
    if (String(me.id) === String(id)) throw new Error('You can’t delete your own account.')
    const payload = await payloadClient()
    await payload.delete({ collection: 'users', id, user: me, overrideAccess: true }) // the main admin is protected by the collection
    revalidatePath('/admin/team')
  })
}

/* ---------- your own account ---------- */
export async function saveMyAccount(input: AccountForm) {
  return run(async () => {
    const me = await actionUser()
    const d = accountSchema.parse(input)
    const payload = await payloadClient()
    const emailChanged = d.email !== me.email.toLowerCase()
    const sensitive = emailChanged || !!d.newPassword
    if (sensitive) {
      if (!d.currentPassword) throw new Error('Enter your current password to change your email or password.')
      try {
        await payload.login({ collection: 'users', data: { email: me.email, password: d.currentPassword } })
      } catch {
        throw new Error('Your current password is incorrect.')
      }
      if (emailChanged) {
        const taken = await payload.count({ collection: 'users', where: { and: [{ email: { equals: d.email } }, { id: { not_equals: me.id } }] } })
        if (taken.totalDocs) throw new Error('Another team account already uses that email.')
      }
    }
    await payload.update({
      collection: 'users',
      id: me.id,
      user: me,
      overrideAccess: true,
      data: { name: d.name, ...(emailChanged ? { email: d.email } : {}), ...(d.newPassword ? { password: d.newPassword } : {}) },
    })
    // a new email / password ends the old session: sign in again with the new details
    if (sensitive) {
      const res = await payload.login({ collection: 'users', data: { email: d.email, password: d.newPassword || d.currentPassword } })
      if (res.token) {
        const c = generatePayloadCookie({ collectionAuthConfig: payload.collections.users.config.auth, cookiePrefix: payload.config.cookiePrefix, token: res.token, returnCookieAsObject: true }) as unknown as { name: string; value: string; expires?: string; httpOnly?: boolean; path?: string; sameSite?: string; secure?: boolean; domain?: string }
        ;(await cookies()).set(c.name, c.value, { path: c.path || '/', httpOnly: c.httpOnly ?? true, sameSite: String(c.sameSite || 'lax').toLowerCase() as 'lax', secure: c.secure, expires: c.expires ? new Date(c.expires) : undefined, domain: c.domain })
      }
    }
    revalidatePath('/admin', 'layout')
  })
}
