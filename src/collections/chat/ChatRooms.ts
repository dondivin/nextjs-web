import type { CollectionConfig } from 'payload'
import { hasRole } from '../../access'
import { onRoomChange } from '../../chat/hooks'
import { isGradient, randomGradient } from '../../chat/gradient'

/**
 * Groups and channels, created by the team (back office → Groups & channels).
 * kind:  group (every member posts) | channel (only the team posts; members read and react)
 * join:  open (anyone reads; one tap to join and post) | request (visible; the team accepts requests) | invite (hidden; invited people only)
 * autoAdd: every new account becomes a member automatically.
 * Messages live in chat-messages with room 'g:<id>'.
 */
export const ChatRooms: CollectionConfig = {
  slug: 'chat-rooms',
  admin: { useAsTitle: 'name', group: 'Chat', defaultColumns: ['name', 'kind', 'join', 'active', 'order'] },
  defaultSort: 'order',
  hooks: {
    beforeChange: [({ data, originalDoc }) => {
      if (data.gradient !== undefined && !isGradient(data.gradient)) data.gradient = null
      if (!data.gradient && !originalDoc?.gradient) data.gradient = randomGradient()
      return data
    }],
    afterChange: [onRoomChange],
    afterDelete: [onRoomChange],
  },
  access: {
    read: ({ req }) => hasRole(req.user as never, 'moderator'), // the chat API decides who sees what
    create: ({ req }) => hasRole(req.user as never, 'moderator'),
    update: ({ req }) => hasRole(req.user as never, 'moderator'),
    delete: ({ req }) => hasRole(req.user as never, 'moderator'),
  },
  fields: [
    { name: 'name', type: 'text', required: true, maxLength: 60 },
    { name: 'description', type: 'textarea', maxLength: 300 },
    { name: 'rules', type: 'textarea', maxLength: 1000, admin: { description: 'Room rules, shown at the top of the room (on top of the site’s house rules)' } },
    { name: 'kind', type: 'select', required: true, defaultValue: 'group', options: [{ label: 'Group (everyone posts)', value: 'group' }, { label: 'Channel (only the team posts)', value: 'channel' }] },
    {
      name: 'join', type: 'select', required: true, defaultValue: 'open',
      options: [{ label: 'Open — anyone can join', value: 'open' }, { label: 'Request to join — the team approves', value: 'request' }, { label: 'Invite only — hidden', value: 'invite' }],
    },
    { name: 'autoAdd', type: 'checkbox', defaultValue: false, admin: { description: 'Add every new account automatically' } },
    { name: 'gradient', type: 'text', admin: { description: 'Room picture colours' } },
    { name: 'active', type: 'checkbox', defaultValue: true, admin: { description: 'Off = archived: hidden from the chat, messages kept' } },
    { name: 'order', type: 'number', defaultValue: 0 },
    { name: 'createdBy', type: 'relationship', relationTo: 'users', admin: { readOnly: true, description: 'Team account that created it' } },
    { name: 'owner', type: 'relationship', relationTo: 'members', index: true, admin: { description: 'Member who created it from the chat (manages it there). Empty = a team room.' } },
  ],
}
