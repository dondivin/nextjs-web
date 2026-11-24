import type { Access, FieldAccess } from 'payload'

export type Role = 'owner' | 'editor' | 'translator' | 'moderator'

type MaybeUser = { collection?: string; roles?: Role[] | null } | null | undefined

/** True when the request comes from a back-office user (collection `users`) with one of the roles. Owners pass every check. */
export function hasRole(user: MaybeUser, ...roles: Role[]): boolean {
  if (!user || user.collection !== 'users') return false
  const r = user.roles || []
  return r.includes('owner') || roles.some((x) => r.includes(x))
}

export const anyone: Access = () => true
export const backOffice: Access = ({ req }) => !!req.user && (req.user as MaybeUser)?.collection === 'users'
export const roles =
  (...rs: Role[]): Access =>
  ({ req }) =>
    hasRole(req.user as MaybeUser, ...rs)
export const fieldRoles =
  (...rs: Role[]): FieldAccess =>
  ({ req }) =>
    hasRole(req.user as MaybeUser, ...rs)
