import type { GlobalConfig } from 'payload'
import { anyone, roles } from '../access'
import { localizedText } from '../fields/localizedText'

export { RULE_ICONS } from '../lib/options'
import { RULE_ICONS } from '../lib/options'

export const ChatSettings: GlobalConfig = {
  slug: 'chat-settings',
  label: 'Chat settings',
  admin: { group: 'Settings' },
  access: { read: anyone, update: roles('moderator') },
  fields: [
    { type: 'row', fields: [
      { name: 'slowModeSeconds', type: 'number', defaultValue: 0, min: 0, max: 120, admin: { width: '50%', description: 'Seconds a member must wait between messages (0 = off)' } },
      { name: 'maxLength', type: 'number', defaultValue: 400, min: 50, max: 2000, admin: { width: '50%', description: 'Maximum characters per message' } },
    ] },
    { type: 'row', fields: [
      { name: 'voiceMaxSeconds', type: 'number', defaultValue: 120, min: 10, max: 600, admin: { width: '50%', description: 'Longest voice message (seconds)' } },
      { name: 'mediaRetentionDays', type: 'number', defaultValue: 0, min: 0, max: 3650, admin: { width: '50%', description: 'Delete chat pictures and voice messages older than this many days (0 = keep forever). Messages stay, marked as expired.' } },
    ] },
    {
      name: 'rules',
      label: 'House rules',
      type: 'array',
      labels: { singular: 'Rule', plural: 'Rules' },
      admin: { description: 'Shown in the house rules sheet. Members must accept them before posting.' },
      fields: [
        { name: 'icon', type: 'select', required: true, defaultValue: 'shield', options: RULE_ICONS },
        localizedText('title', 'Title'),
        localizedText('body', 'Explanation', { textarea: true }),
      ],
    },
    {
      // private chats between members (the chat with the team always allows both)
      name: 'privateChats',
      type: 'group',
      admin: { description: 'Private chats between members' },
      fields: [
        { name: 'pictures', type: 'checkbox', defaultValue: false, admin: { description: 'Members can send pictures in private chats' } },
        { name: 'voice', type: 'checkbox', defaultValue: true, admin: { description: 'Members can send voice messages in private chats' } },
        { name: 'forward', type: 'checkbox', defaultValue: true, admin: { description: 'Messages of private chats can be forwarded to other chats' } },
      ],
    },
    {
      // the built-in "Community lounge" room (managed in the back office: Groups & channels → Community lounge)
      name: 'lounge',
      type: 'group',
      admin: { description: 'The chat’s main room. Empty texts use the default wording (Translations).' },
      fields: [
        localizedText('chatTitle', 'Chat title (top of the chat and the browser tab)'),
        localizedText('name', 'Name'),
        localizedText('subtitle', 'Subtitle (room header and list)'),
        localizedText('description', 'Description (home page card and room list)', { textarea: true }),
        { name: 'postBy', type: 'select', defaultValue: 'everyone', options: [{ label: 'Everyone', value: 'everyone' }, { label: 'The team only', value: 'team' }] },
        // pictures & voice messages in the lounge and the match rooms (see src/chat/media-policy.ts)
        { name: 'mediaView', type: 'select', defaultValue: 'everyone', options: [{ label: 'Everyone', value: 'everyone' }, { label: 'Members only', value: 'members' }, { label: 'The team only', value: 'team' }, { label: 'Nobody (text only)', value: 'none' }], admin: { description: 'Who can see pictures and voice messages (members = signed-in accounts). The team always can.' } },
        { name: 'mediaSave', type: 'checkbox', defaultValue: true, admin: { description: 'Allow saving them (screenshots can never be prevented)' } },
      ],
    },
    {
      name: 'bannedWords',
      label: 'Banned words',
      type: 'array',
      admin: { description: 'Messages containing these (also with l33t spelling like 1d10t) are blocked.' },
      fields: [{ name: 'word', type: 'text', required: true }],
    },
  ],
}
