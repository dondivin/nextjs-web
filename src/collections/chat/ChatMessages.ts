import type { CollectionConfig, Where } from 'payload'
import { hasRole } from '../../access'

/**
 * Chat messages. `room` is 'lounge', a match id, or 'dm:<memberId>' for a member's direct chat with the partner team.
 * Posting goes through the chat API (rules + slow mode are checked there); the back office uses this collection for moderation.
 */
export const ChatMessages: CollectionConfig = {
  slug: 'chat-messages',
  admin: { useAsTitle: 'text', defaultColumns: ['text', 'room', 'author', 'deleted', 'createdAt'], group: 'Chat' },
  defaultSort: '-createdAt',
  access: {
    read: ({ req }) => {
      if (hasRole(req.user as never, 'moderator')) return true
      // public: non-deleted room messages; direct chats are only served through the chat API
      const w: Where = { and: [{ deleted: { not_equals: true } }, { room: { not_like: 'dm:' } }] }
      return w
    },
    create: ({ req }) => hasRole(req.user as never, 'moderator'),
    update: ({ req }) => hasRole(req.user as never, 'moderator'),
    delete: ({ req }) => hasRole(req.user as never, 'moderator'),
  },
  fields: [
    { name: 'room', type: 'text', required: true, index: true },
    { name: 'author', type: 'relationship', relationTo: 'members', index: true },
    { name: 'text', type: 'textarea', required: true, maxLength: 2000 },
    { name: 'isMod', type: 'checkbox', defaultValue: false },
    {
      name: 'reply', type: 'group',
      fields: [
        { name: 'id', type: 'text' },
        { name: 'author', type: 'relationship', relationTo: 'members' },
        { name: 'text', type: 'text' },
      ],
    },
    { name: 'reactions', type: 'json', admin: { description: '{ reactionKey: { memberId: true } }' } },
    { name: 'deleted', type: 'checkbox', defaultValue: false, index: true },
    { name: 'deletedBy', type: 'text', admin: { readOnly: true } },
    { name: 'deletedAt', type: 'date', admin: { readOnly: true } },
  ],
}
