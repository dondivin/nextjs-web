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
      { name: 'slowModeSeconds', type: 'number', defaultValue: 5, min: 0, max: 120, admin: { width: '50%', description: 'Seconds a member must wait between messages (0 = off)' } },
      { name: 'maxLength', type: 'number', defaultValue: 400, min: 50, max: 2000, admin: { width: '50%', description: 'Maximum characters per message' } },
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
      name: 'bannedWords',
      label: 'Banned words',
      type: 'array',
      admin: { description: 'Messages containing these (also with l33t spelling like 1d10t) are blocked.' },
      fields: [{ name: 'word', type: 'text', required: true }],
    },
  ],
}
