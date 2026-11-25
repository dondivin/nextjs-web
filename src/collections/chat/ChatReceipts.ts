import type { CollectionConfig } from 'payload'
import { hasRole } from '../../access'

/**
 * Delivery / read receipts for one-to-one chats (member ↔ member 'pm:<a>_<b>', member ↔ team 'dm:<memberId>').
 * One document per (room, reader): how far that reader's devices have RECEIVED (delivered) and SEEN (read) the conversation,
 * as message timestamps. reader = a member id, or 'team' (any team member counts for the team side of a direct chat).
 * Written by the chat (action 'receipt'); the other side sees ✓✓ grey (delivered) / ✓✓ blue (read) on its messages.
 */
export const ChatReceipts: CollectionConfig = {
  slug: 'chat-receipts',
  admin: { group: 'Chat', defaultColumns: ['room', 'reader', 'delivered', 'read'], hidden: ({ user }) => !hasRole(user as never, 'owner') },
  access: {
    read: ({ req }) => hasRole(req.user as never, 'moderator'),
    create: () => false, update: () => false,
    delete: ({ req }) => hasRole(req.user as never, 'owner'),
  },
  fields: [
    { name: 'key', type: 'text', required: true, unique: true, index: true },   // '<room>|<reader>'
    { name: 'room', type: 'text', required: true, index: true },
    { name: 'reader', type: 'text', required: true, index: true },
    { name: 'delivered', type: 'number', defaultValue: 0 },   // ms timestamp of the newest message received
    { name: 'read', type: 'number', defaultValue: 0 },        // ms timestamp of the newest message seen
  ],
}
