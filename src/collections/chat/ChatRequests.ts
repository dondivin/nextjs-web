import type { CollectionConfig } from 'payload'
import { hasRole } from '../../access'
import { onRequestChange, onRequestDelete } from '../../chat/hooks'

/**
 * Fan-to-fan private chats need consent: `from` asks, `to` accepts (or declines / blocks). One document per pair
 * (pairKey = the two member ids sorted), reused when a request is sent again. Messages of an accepted pair live in
 * chat-messages with room 'pm:<pairKey>' and are only ever sent to those two members. Created by the chat API only.
 */
export const ChatRequests: CollectionConfig = {
  slug: 'chat-requests',
  admin: { group: 'Chat', defaultColumns: ['from', 'to', 'status', 'updatedAt'] },
  defaultSort: '-updatedAt',
  hooks: { afterChange: [onRequestChange], afterDelete: [onRequestDelete] },
  access: {
    read: ({ req }) => hasRole(req.user as never, 'moderator'),
    create: () => false,
    update: ({ req }) => hasRole(req.user as never, 'moderator'),
    delete: ({ req }) => hasRole(req.user as never, 'moderator'),
  },
  fields: [
    { name: 'pairKey', type: 'text', required: true, unique: true, index: true, admin: { readOnly: true } },
    { name: 'from', type: 'relationship', relationTo: 'members', required: true, index: true },
    { name: 'to', type: 'relationship', relationTo: 'members', required: true, index: true },
    {
      name: 'status', type: 'select', required: true, defaultValue: 'pending', index: true,
      options: [
        { label: 'Waiting for an answer', value: 'pending' },
        { label: 'Accepted (they can chat)', value: 'accepted' },
        { label: 'Declined', value: 'declined' },
        { label: 'Blocked', value: 'blocked' },
      ],
    },
    { name: 'blockedBy', type: 'relationship', relationTo: 'members' },
    { name: 'note', type: 'text', maxLength: 140, admin: { description: 'Short message sent with the request' } },
    { name: 'respondedAt', type: 'date' },
  ],
}
