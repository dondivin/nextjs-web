import { APIError, type CollectionConfig, type PayloadRequest } from 'payload'
import { hasRole } from '../access'
import { isGradient, randomGradient } from '../chat/gradient'
import { onStaffChange } from '../chat/hooks'

/**
 * The MAIN ADMIN = the first back-office account ever created (the oldest one). It can only be recovered from the server
 * (`pnpm admin:reset-password`), so it is protected: nobody can delete it or take its owner role away, and only the main
 * admin themself can change its email or password. The server command passes `context.mainAdminRecovery`.
 */
export async function mainAdminId(req: PayloadRequest): Promise<string | null> {
  const r = await req.payload.find({ collection: 'users', sort: 'createdAt', limit: 1, depth: 0, overrideAccess: true, req, select: {} })
  return r.docs[0] ? String(r.docs[0].id) : null
}
const deny = (msg: string) => new APIError(msg, 403, null, true)

/** Back-office accounts. Roles: owner (everything), editor (content), translator (languages + translations), moderator (matches + chat). */
export const Users: CollectionConfig = {
  slug: 'users',
  admin: { useAsTitle: 'email', defaultColumns: ['email', 'name', 'roles'], group: 'Admin' },
  auth: true,
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => hasRole(req.user as never, 'owner'),
    update: ({ req, id }) => hasRole(req.user as never, 'owner') || (!!req.user && req.user.id === id),
    delete: ({ req }) => hasRole(req.user as never, 'owner'),
  },
  hooks: {
    beforeValidate: [
      // runs before Payload applies a new password
      async ({ data, operation, originalDoc, req }) => {
        if (operation !== 'update' || !originalDoc || !data) return data
        if (String(originalDoc.id) !== (await mainAdminId(req))) return data
        if (Array.isArray(data.roles) && !data.roles.includes('owner')) throw deny('The main admin account always stays an owner.')
        const sensitive = !!data.password || (typeof data.email === 'string' && data.email.toLowerCase() !== String(originalDoc.email).toLowerCase())
        if (!sensitive) return data
        const actor = req.user && (req.user as { collection?: string }).collection === 'users' ? String(req.user.id) : null
        const self = actor === String(originalDoc.id)
        if (!self && !req.context?.mainAdminRecovery) throw deny('Only the main admin can change this account’s email or password. (Recovery: pnpm admin:reset-password on the server.)')
        return data
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        if (String(id) === (await mainAdminId(req))) throw deny('The main admin account can’t be deleted.')
      },
    ],
    beforeChange: [
      // the very first account becomes the owner
      async ({ data, operation, req }) => {
        if (operation === 'create') {
          const existing = await req.payload.count({ collection: 'users', req })
          if (existing.totalDocs === 0) data.roles = ['owner']
        }
        return data
      },
      ({ data, originalDoc }) => {
        if (data.chatGradient !== undefined && !isGradient(data.chatGradient)) data.chatGradient = null
        if (!data.chatGradient && !originalDoc?.chatGradient) data.chatGradient = randomGradient()
        return data
      },
    ],
    afterChange: [onStaffChange],
  },
  fields: [
    { name: 'name', type: 'text', admin: { description: 'Shown in the site chat when you post as staff' } },
    { name: 'chatLastSeenAt', type: 'date', admin: { hidden: true } },
    { name: 'chatAvatar', type: 'upload', relationTo: 'media', admin: { description: 'Your photo in the site chat (optional)' } },
    { name: 'chatGradient', type: 'text', admin: { description: 'Avatar gradient used when there is no photo' } },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      saveToJWT: true,
      defaultValue: ['editor'],
      options: [
        { label: 'Owner', value: 'owner' },
        { label: 'Editor', value: 'editor' },
        { label: 'Translator', value: 'translator' },
        { label: 'Moderator', value: 'moderator' },
      ],
      access: { update: ({ req }) => hasRole(req.user as never, 'owner') },
    },
  ],
}
