import type { CollectionConfig } from 'payload'
import { hasRole } from '../../access'

/**
 * "Forgot password" requests from chat members. There is no email service, so the team approves requests in the back office:
 * the member's browser holds a secret (only its SHA-256 hash is stored here); once a moderator approves, that browser — and only
 * that one — can set a new password. Requests are created by the chat API only.
 */
export const PasswordResets: CollectionConfig = {
  slug: 'password-resets',
  admin: { useAsTitle: 'email', defaultColumns: ['email', 'member', 'status', 'createdAt'], group: 'Chat' },
  defaultSort: '-createdAt',
  access: {
    read: ({ req }) => hasRole(req.user as never, 'owner') || (hasRole(req.user as never, 'moderator') ? { kind: { not_equals: 'staff' } } : false),
    create: () => false,
    update: ({ req }) => hasRole(req.user as never, 'owner') || (hasRole(req.user as never, 'moderator') ? { kind: { not_equals: 'staff' } } : false),
    delete: ({ req }) => hasRole(req.user as never, 'owner') || (hasRole(req.user as never, 'moderator') ? { kind: { not_equals: 'staff' } } : false),
  },
  fields: [
    {
      name: 'kind', type: 'select', defaultValue: 'member', index: true,
      options: [{ label: 'Chat member', value: 'member' }, { label: 'Back-office account (team)', value: 'staff' }],
      admin: { description: 'Team account requests can only be approved by an owner' },
    },
    { name: 'email', type: 'text', required: true, index: true },
    { name: 'member', type: 'relationship', relationTo: 'members', admin: { description: 'Empty when no account uses this email' } },
    { name: 'user', type: 'relationship', relationTo: 'users', admin: { description: 'Team account (kind = staff)' } },
    { name: 'note', type: 'textarea', admin: { description: 'Message from the person asking' } },
    {
      name: 'status', type: 'select', defaultValue: 'pending', index: true,
      options: [
        { label: 'Waiting for the team', value: 'pending' },
        { label: 'Approved (member can set a new password)', value: 'approved' },
        { label: 'Declined', value: 'denied' },
        { label: 'Password changed', value: 'done' },
        { label: 'Expired / replaced', value: 'expired' },
      ],
    },
    { name: 'tokenHash', type: 'text', required: true, access: { read: () => false, update: () => false }, admin: { hidden: true } },
    { name: 'decidedBy', type: 'relationship', relationTo: 'users' },
    { name: 'decidedAt', type: 'date' },
    { name: 'expiresAt', type: 'date', required: true },
  ],
}
