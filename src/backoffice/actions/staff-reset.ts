'use server'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { generatePayloadCookie } from 'payload/shared'
import { payloadClient, run } from '@/backoffice/lib/server'

/*
 * "Forgot your password?" for back-office accounts (no email service): the request goes to the Password resets page,
 * an OWNER approves it, then the browser that asked (it keeps a secret; only its hash is stored) sets a new password.
 * These actions are public (the person is signed out), so they reveal nothing about which emails have an account.
 */
const RESET_TTL = 7 * 86400e3
const APPROVED_TTL = 2 * 86400e3
const sha = (t: string) => createHash('sha256').update(t).digest('hex')
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
type Status = 'pending' | 'approved' | 'denied' | 'done' | 'expired'

export async function requestStaffReset(emailRaw: string, noteRaw: string) {
  return run(async () => {
    const email = String(emailRaw || '').trim().toLowerCase().slice(0, 200)
    if (!EMAIL_RE.test(email)) throw new Error('Enter a valid email address.')
    const payload = await payloadClient()
    const since = new Date(Date.now() - 86400e3).toISOString()
    const today = await payload.count({ collection: 'password-resets', where: { and: [{ kind: { equals: 'staff' } }, { email: { equals: email } }, { createdAt: { greater_than: since } }] }, overrideAccess: true })
    if (today.totalDocs >= 3) throw new Error('Too many requests for this email today. Try again tomorrow, or ask an owner.')
    const user = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true })
    await payload.update({ collection: 'password-resets', where: { and: [{ kind: { equals: 'staff' } }, { email: { equals: email } }, { status: { in: ['pending', 'approved'] } }] }, data: { status: 'expired' }, overrideAccess: true })
    const token = randomBytes(32).toString('base64url')
    const doc = await payload.create({
      collection: 'password-resets',
      overrideAccess: true,
      data: { kind: 'staff', email, user: user.docs[0]?.id, note: String(noteRaw || '').trim().slice(0, 500) || undefined, status: 'pending', tokenHash: sha(token), expiresAt: new Date(Date.now() + RESET_TTL).toISOString() },
    })
    return { id: String(doc.id), token, email }
  })
}

async function load(id: string, token: string) {
  const payload = await payloadClient()
  if (!/^[a-f0-9]{24}$/i.test(String(id)) || !token) throw new Error('This request is no longer valid. Send a new one.')
  const doc = await payload.findByID({ collection: 'password-resets', id, depth: 0, overrideAccess: true, showHiddenFields: true, disableErrors: true })
  const a = Buffer.from(sha(String(token))), h = Buffer.from(String(doc?.tokenHash || ''))
  if (!doc || doc.kind !== 'staff' || a.length !== h.length || !timingSafeEqual(a, h)) throw new Error('This request is no longer valid. Send a new one.')
  let status = (doc.status || 'pending') as Status
  const expired = status === 'pending' ? Date.parse(doc.expiresAt) < Date.now() : status === 'approved' ? Date.parse(doc.decidedAt || '') + APPROVED_TTL < Date.now() : false
  if (expired || (status === 'approved' && !doc.user)) {
    status = 'expired'
    await payload.update({ collection: 'password-resets', id, data: { status }, overrideAccess: true })
  }
  return { payload, doc, status }
}

export async function staffResetStatus(id: string, token: string) {
  return run(async () => (await load(id, token)).status)
}

export async function completeStaffReset(id: string, token: string, password: string) {
  return run(async () => {
    const { payload, doc, status } = await load(id, token)
    if (status !== 'approved' || !doc.user) throw new Error('This request isn’t approved (or no longer valid).')
    if (String(password || '').length < 8) throw new Error('Use at least 8 characters.')
    const userId = typeof doc.user === 'object' ? doc.user.id : doc.user
    const u = await payload.update({ collection: 'users', id: userId, data: { password: String(password) }, overrideAccess: true })
    try {
      await payload.unlock({ collection: 'users', data: { email: u.email } as never, overrideAccess: true })
    } catch {}
    await payload.update({ collection: 'password-resets', id: doc.id, data: { status: 'done' }, overrideAccess: true })
    // sign in straight away
    const res = await payload.login({ collection: 'users', data: { email: u.email, password: String(password) } })
    if (res.token) {
      const c = generatePayloadCookie({ collectionAuthConfig: payload.collections.users.config.auth, cookiePrefix: payload.config.cookiePrefix, token: res.token, returnCookieAsObject: true }) as unknown as { name: string; value: string; expires?: string; httpOnly?: boolean; path?: string; sameSite?: 'lax' | 'strict' | 'none'; secure?: boolean; domain?: string }
      ;(await cookies()).set(c.name, c.value, { path: c.path || '/', httpOnly: c.httpOnly ?? true, sameSite: (String(c.sameSite || 'lax').toLowerCase() as 'lax'), secure: c.secure, expires: c.expires ? new Date(c.expires) : undefined, domain: c.domain })
    }
  })
}
