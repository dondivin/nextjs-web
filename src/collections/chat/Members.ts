import type { CollectionConfig } from 'payload'
import { hasRole } from '../../access'

/** Chat accounts for site visitors (separate from back-office `users`). */
export const Members: CollectionConfig = {
  slug: 'members',
  admin: { useAsTitle: 'displayName', defaultColumns: ['displayName', 'email', 'role', 'status', 'lastSeenAt'], group: 'Chat' },
  auth: { tokenExpiration: 60 * 60 * 24 * 30, cookies: { sameSite: 'Lax' } },
  access: {
    read: ({ req }) => hasRole(req.user as never, 'moderator') || (req.user?.collection === 'members' ? { id: { equals: req.user.id } } : false),
    create: () => true, // public sign-up
    update: ({ req }) => hasRole(req.user as never, 'moderator') || (req.user?.collection === 'members' ? { id: { equals: req.user.id } } : false),
    delete: ({ req }) => hasRole(req.user as never, 'moderator'),
  },
  fields: [
    { name: 'displayName', type: 'text', required: true, maxLength: 40 },
    { name: 'color', type: 'text', admin: { description: 'Avatar colour (hex). Picked automatically on sign-up.' } },
    { name: 'avatar', type: 'upload', relationTo: 'media' },
    {
      name: 'role', type: 'select', defaultValue: 'fan', saveToJWT: true,
      options: [{ label: 'Fan', value: 'fan' }, { label: 'Partner team (agent)', value: 'agent' }, { label: 'Moderator', value: 'moderator' }],
      access: { update: ({ req }) => hasRole(req.user as never, 'moderator') },
    },
    {
      name: 'status', type: 'select', defaultValue: 'active', index: true,
      options: [{ label: 'Active', value: 'active' }, { label: 'Muted', value: 'muted' }, { label: 'Banned', value: 'banned' }],
      access: { update: ({ req }) => hasRole(req.user as never, 'moderator') },
    },
    { name: 'mutedUntil', type: 'date', access: { update: ({ req }) => hasRole(req.user as never, 'moderator') } },
    { name: 'moderationNote', type: 'textarea', access: { read: ({ req }) => hasRole(req.user as never, 'moderator'), update: ({ req }) => hasRole(req.user as never, 'moderator') } },
    { name: 'rulesAcceptedAt', type: 'date' },
    { name: 'lastSeenAt', type: 'date', index: true },
  ],
}
