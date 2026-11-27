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
    // invite link: /<locale>/chat/join-<token> joins the room (also invite-only ones). Empty = no link. Reset = new token.
    { name: 'inviteToken', type: 'text', index: true, admin: { readOnly: true, description: 'Invite link token (managed from the room page / the chat)' } },
    // pictures & voice messages in this room (see src/chat/media-policy.ts)
    { name: 'mediaView', type: 'select', defaultValue: 'everyone', options: [{ label: 'Everyone', value: 'everyone' }, { label: 'Members only', value: 'members' }, { label: 'The team only', value: 'team' }, { label: 'Nobody (text only)', value: 'none' }], admin: { description: 'Who can see pictures and voice messages (members = people who joined). The team always can.' } },
    { name: 'allowForward', type: 'checkbox', defaultValue: true, admin: { description: 'Its messages can be forwarded to other chats' } },
    { name: 'mediaSave', type: 'checkbox', defaultValue: true, admin: { description: 'Allow saving them (screenshots can never be prevented)' } },
    { name: 'name', type: 'text', required: true, maxLength: 60 },
    { name: 'description', type: 'textarea', maxLength: 300 },
    { name: 'rules', type: 'textarea', maxLength: 1000, admin: { description: 'Room rules, shown at the top of the room (on top of the site’s house rules)' } },
    { name: 'kind', type: 'select', required: true, defaultValue: 'group', options: [{ label: 'Group (everyone posts)', value: 'group' }, { label: 'Channel (only the team posts)', value: 'channel' }] },
    {
      name: 'join', type: 'select', required: true, defaultValue: 'open',
      options: [{ label: 'Open — anyone can join', value: 'open' }, { label: 'Request to join — the team approves', value: 'request' }, { label: 'Invite only — hidden', value: 'invite' }],
    },
    // who sees the room in the chat (empty on rooms made before this setting: derived from "join" — invite → hidden, else public)
    {
      name: 'visibility', type: 'select',
      options: [{ label: 'Everyone — also visitors who are not signed in', value: 'public' }, { label: 'Signed-in members only', value: 'members' }, { label: 'Hidden — only its members (and people invited)', value: 'hidden' }],
    },
    // people who see it but haven't joined can read the messages (empty on older rooms: on for "open" rooms)
    { name: 'preview', type: 'checkbox', admin: { description: 'Non-members who can see the room can read it before joining' } },
    { name: 'autoAdd', type: 'checkbox', defaultValue: false, admin: { description: 'Add every new account automatically' } },
    { name: 'gradient', type: 'text', admin: { description: 'Room picture colours' } },
    { name: 'photo', type: 'upload', relationTo: 'media', admin: { description: 'Room picture (square, shown instead of the colours)' } },
    { name: 'active', type: 'checkbox', defaultValue: true, admin: { description: 'Off = archived: hidden from the chat, messages kept' } },
    { name: 'order', type: 'number', defaultValue: 0 },
    { name: 'createdBy', type: 'relationship', relationTo: 'users', admin: { readOnly: true, description: 'Team account that created it' } },
    { name: 'owner', type: 'relationship', relationTo: 'members', index: true, admin: { description: 'Member who created it from the chat (manages it there). Empty = a team room.' } },
  ],
}
