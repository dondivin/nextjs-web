import type { CollectionConfig } from 'payload'
import { hasRole } from '../access'

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
    beforeChange: [
      // the very first account becomes the owner
      async ({ data, operation, req }) => {
        if (operation === 'create') {
          const existing = await req.payload.count({ collection: 'users', req })
          if (existing.totalDocs === 0) data.roles = ['owner']
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'name', type: 'text' },
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
