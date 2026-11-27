import { encryptedField } from '../../chat/crypto'
import type { CollectionConfig, Where } from 'payload'
import { hasRole } from '../../access'
import { onMessageChange } from '../../chat/hooks'

/**
 * Chat messages. `room` is 'lounge', a match id, or 'dm:<memberId>' for a member's direct chat with the partner team.
 * Posting goes through the chat API (rules + slow mode are checked there); the back office uses this collection for moderation.
 */
export const ChatMessages: CollectionConfig = {
  slug: 'chat-messages',
  admin: { useAsTitle: 'text', defaultColumns: ['text', 'room', 'author', 'deleted', 'createdAt'], group: 'Chat' },
  defaultSort: '-createdAt',
  hooks: { afterChange: [onMessageChange] },
  access: {
    read: ({ req }) => {
      if (hasRole(req.user as never, 'moderator')) return true
      // public: non-deleted room messages; direct chats are only served through the chat API
      const w: Where = { and: [{ deleted: { not_equals: true } }, { room: { not_like: 'dm:' } }, { room: { not_like: 'pm:' } }, { room: { not_like: 'g:' } }] }
      return w
    },
    create: ({ req }) => hasRole(req.user as never, 'moderator'),
    update: ({ req }) => hasRole(req.user as never, 'moderator'),
    delete: ({ req }) => hasRole(req.user as never, 'moderator'),
  },
  fields: [
    { name: 'room', type: 'text', required: true, index: true },
    { name: 'author', type: 'relationship', relationTo: 'members', index: true, admin: { description: 'Member who wrote it (empty for team messages)' } },
    { name: 'staffAuthor', type: 'relationship', relationTo: 'users', index: true, admin: { description: 'Back-office staff member who wrote it' } },
    { name: 'clientId', type: 'text', admin: { hidden: true } },
    // encrypted at rest with this conversation's key (src/chat/crypto.ts); the real length limit is checked on the plain
    // text before saving (chat settings), the stored one is longer
    { name: 'text', type: 'textarea', maxLength: 12000, hooks: encryptedField((d) => d.room as string) as never, admin: { description: 'Can be empty when the message is a picture' } },
    { name: 'image', type: 'upload', relationTo: 'chat-images' },
    { name: 'voice', type: 'upload', relationTo: 'chat-voice' },
    { name: 'mediaExpired', type: 'select', options: ['photo', 'voice'], admin: { description: 'Its picture / voice message was removed by the media clean-up (Chat settings)' } },
    { name: 'isMod', type: 'checkbox', defaultValue: false },
    { name: 'forwarded', type: 'checkbox', defaultValue: false, admin: { description: 'A copy of a message forwarded from another chat' } },
    {
      name: 'reply', type: 'group',
      fields: [
        // the quoted message's id ('id' is reserved by Payload inside a group and was silently dropped → quotes never showed)
        { name: 'msgId', type: 'text' },
        { name: 'kind', type: 'select', options: ['photo', 'voice'], admin: { description: 'What was quoted, when it was a picture / voice message' } },
        { name: 'thumb', type: 'text', admin: { description: 'Tiny preview of a quoted picture (data URL)' } },
        { name: 'dur', type: 'number', admin: { description: 'Length of a quoted voice message (s)' } },
        { name: 'author', type: 'relationship', relationTo: 'members' },
        { name: 'by', type: 'text', admin: { description: 'Chat id of the quoted author (member or team)' } },
        { name: 'text', type: 'text', hooks: encryptedField((d) => d.room as string) as never },   // the quoted text, encrypted like the message
      ],
    },
    { name: 'reactions', type: 'json', admin: { description: '{ reactionKey: { memberId: true } }' } },
    { name: 'deleted', type: 'checkbox', defaultValue: false, index: true },
    { name: 'deletedBy', type: 'text', admin: { readOnly: true } },
    { name: 'deletedAt', type: 'date', admin: { readOnly: true } },
  ],
}
