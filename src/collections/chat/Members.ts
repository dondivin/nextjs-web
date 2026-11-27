import type { CollectionConfig } from 'payload'
import { hasRole } from '../../access'
import { onMemberChange, onMemberDelete } from '../../chat/hooks'
import { gradientColor, isGradient, randomGradient } from '../../chat/gradient'

// role / status / mute fields can only be set by back-office moderators (also on create: the public sign-up must not pick its own role)
const modOnly = ({ req }: { req: { user?: unknown } }) => hasRole(req.user as never, 'moderator')

/** Chat accounts for site visitors (separate from back-office `users`). */
export const Members: CollectionConfig = {
  slug: 'members',
  admin: { useAsTitle: 'displayName', defaultColumns: ['displayName', 'email', 'role', 'status', 'lastSeenAt'], group: 'Chat' },
  auth: { tokenExpiration: 60 * 60 * 24 * 30, cookies: { sameSite: 'Lax' }, maxLoginAttempts: 8, lockTime: 10 * 60 * 1000 },
  hooks: {
    beforeChange: [
      ({ data, originalDoc }) => {
        // every member always has an avatar gradient (used when there is no photo) and a lowercase name key (unique usernames)
        if (data.avatarGradient !== undefined && !isGradient(data.avatarGradient)) data.avatarGradient = null
        if (!data.avatarGradient && !originalDoc?.avatarGradient) data.avatarGradient = randomGradient()
        const g = data.avatarGradient || originalDoc?.avatarGradient
        if (g) data.color = gradientColor(g)
        if (typeof data.displayName === 'string') {
          data.displayName = data.displayName.trim().replace(/\s+/g, ' ')
          data.nameKey = data.displayName.toLowerCase()
        }
        return data
      },
    ],
    afterChange: [onMemberChange],
    afterDelete: [onMemberDelete],
  },
  access: {
    read: ({ req }) => hasRole(req.user as never, 'moderator') || (req.user?.collection === 'members' ? { id: { equals: req.user.id } } : false),
    create: () => true, // public sign-up
    update: ({ req }) => hasRole(req.user as never, 'moderator') || (req.user?.collection === 'members' ? { id: { equals: req.user.id } } : false),
    delete: ({ req }) => hasRole(req.user as never, 'moderator'),
  },
  fields: [
    { name: 'displayName', type: 'text', required: true, maxLength: 40 },
    { name: 'nameKey', type: 'text', unique: true, index: true, admin: { hidden: true }, access: { read: modOnly } },
    { name: 'avatar', type: 'upload', relationTo: 'media', admin: { description: 'Profile photo. When empty, the gradient is used.' } },
    { name: 'avatarGradient', type: 'text', admin: { description: 'CSS gradient used when there is no photo, e.g. linear-gradient(135deg, #FF7A18, #AF002D). Picked at random on sign-up.' } },
    { name: 'color', type: 'text', admin: { readOnly: true, description: 'Name colour in the chat (first colour of the gradient, set automatically)' } },
    {
      name: 'memberRole', type: 'relationship', relationTo: 'member-roles', index: true,
      admin: { description: 'What this member may do in the chat (empty = the default role)' },
      access: { create: modOnly, update: modOnly },
    },
    {
      name: 'status', type: 'select', defaultValue: 'active', index: true,
      options: [{ label: 'Active', value: 'active' }, { label: 'Muted', value: 'muted' }, { label: 'Banned', value: 'banned' }],
      access: { create: modOnly, update: modOnly },
    },
    { name: 'mutedUntil', type: 'date', access: { create: modOnly, update: modOnly } },
    { name: 'moderationNote', type: 'textarea', access: { read: modOnly, create: modOnly, update: modOnly } },
    { name: 'rulesAcceptedAt', type: 'date' },
    { name: 'lastSeenAt', type: 'date', index: true },
    // notifications of new messages (set from the chat): show the message text on the lock screen · muted groups
    // who may start a private chat with this member (set by them in the chat): ask first (a request) · anyone (opens at once) · nobody
    { name: 'pmPolicy', type: 'select', defaultValue: 'request', options: [{ label: 'Ask first (request)', value: 'request' }, { label: 'Anyone can message', value: 'everyone' }, { label: 'Nobody', value: 'nobody' }], admin: { description: 'Who can start a private chat with this member (they choose it in the chat)' } },
    { name: 'pushPreview', type: 'checkbox', defaultValue: true, admin: { hidden: true } },
    { name: 'pushMuted', type: 'json', admin: { hidden: true } },
  ],
}
