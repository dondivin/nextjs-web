import type { CollectionConfig } from 'payload'
import { hasRole } from '../../access'
import { onRoomMemberChange } from '../../chat/hooks'

/**
 * Who is in which group / channel. One document per (room, member) — `key` = '<roomId>_<memberId>'.
 * status: member | requested (asked to join, waiting for the team) | invited (the team invited them, waiting for the member)
 */
export const ChatRoomMembers: CollectionConfig = {
  slug: 'chat-room-members',
  admin: { group: 'Chat', defaultColumns: ['room', 'member', 'status', 'updatedAt'] },
  defaultSort: '-updatedAt',
  hooks: { afterChange: [onRoomMemberChange], afterDelete: [onRoomMemberChange] },
  access: {
    read: ({ req }) => hasRole(req.user as never, 'moderator'),
    create: ({ req }) => hasRole(req.user as never, 'moderator'),
    update: ({ req }) => hasRole(req.user as never, 'moderator'),
    delete: ({ req }) => hasRole(req.user as never, 'moderator'),
  },
  fields: [
    { name: 'key', type: 'text', required: true, unique: true, index: true, admin: { readOnly: true } },
    { name: 'room', type: 'relationship', relationTo: 'chat-rooms', required: true, index: true },
    { name: 'member', type: 'relationship', relationTo: 'members', required: true, index: true },
    {
      name: 'status', type: 'select', required: true, defaultValue: 'member', index: true,
      options: [{ label: 'Member', value: 'member' }, { label: 'Asked to join', value: 'requested' }, { label: 'Invited', value: 'invited' }],
    },
    { name: 'admin', type: 'checkbox', defaultValue: false, admin: { description: 'Room admin: manages the room from the chat (and posts in a channel)' } },
  ],
}
