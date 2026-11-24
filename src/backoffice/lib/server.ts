import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { User } from '@/payload-types'
import { hasRole, type Role } from '@/access'

export async function payloadClient() {
  return getPayload({ config })
}

/** The signed-in back-office user (collection `users`), or null. */
export async function getBackofficeUser(): Promise<User | null> {
  const payload = await payloadClient()
  const { user } = await payload.auth({ headers: await headers() })
  if (!user || user.collection !== 'users') return null
  return user as User
}

/** For pages: sends visitors to the login page, and users without the role to the dashboard. */
export async function requireUser(...roles: Role[]): Promise<User> {
  const user = await getBackofficeUser()
  if (!user) redirect('/admin/login')
  if (roles.length && !hasRole({ ...user, collection: 'users' }, ...roles)) redirect('/admin?denied=1')
  return user
}

/** For server actions: throws instead of redirecting. */
export async function actionUser(...roles: Role[]): Promise<User> {
  const user = await getBackofficeUser()
  if (!user) throw new Error('Your session has expired. Sign in again.')
  if (roles.length && !hasRole({ ...user, collection: 'users' }, ...roles)) throw new Error('You don’t have permission to do that.')
  return user
}

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Something went wrong' }
  }
}
