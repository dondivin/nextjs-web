import { encryptedField } from '../../chat/crypto'
import type { CollectionConfig } from 'payload'
import { hasRole } from '../../access'
import { onReportChange } from '../../chat/hooks'

export const REPORT_REASONS = [
  { label: 'Spam', value: 'spam' },
  { label: 'Abuse / harassment', value: 'abuse' },
  { label: 'Scam / paid tips', value: 'scam' },
  { label: 'Other promo code', value: 'promo' },
  { label: 'Other', value: 'other' },
]

/** One document per report. Moderators work through the queue in the back office. */
export const ChatReports: CollectionConfig = {
  slug: 'chat-reports',
  admin: { defaultColumns: ['messageText', 'reason', 'status', 'createdAt'], group: 'Chat' },
  defaultSort: '-createdAt',
  hooks: { afterChange: [onReportChange] },
  access: {
    read: ({ req }) => hasRole(req.user as never, 'moderator') || (req.user?.collection === 'members' ? { reporter: { equals: req.user.id } } : false),
    create: ({ req }) => hasRole(req.user as never, 'moderator') || req.user?.collection === 'members',
    update: ({ req }) => hasRole(req.user as never, 'moderator'),
    delete: ({ req }) => hasRole(req.user as never, 'moderator'),
  },
  fields: [
    { name: 'message', type: 'relationship', relationTo: 'chat-messages', required: true, index: true },
    { name: 'messageText', type: 'text', hooks: encryptedField((d) => d.room as string) as never, admin: { description: 'Snapshot of the text when it was reported (encrypted with the conversation’s key)' } },
    { name: 'messageAuthor', type: 'relationship', relationTo: 'members', index: true },
    { name: 'room', type: 'text', index: true },
    { name: 'reporter', type: 'relationship', relationTo: 'members' },
    { name: 'reason', type: 'select', defaultValue: 'other', options: REPORT_REASONS },
    { name: 'note', type: 'textarea' },
    {
      name: 'status', type: 'select', defaultValue: 'open', index: true,
      options: [{ label: 'Open', value: 'open' }, { label: 'Dismissed', value: 'dismissed' }, { label: 'Action taken', value: 'actioned' }],
    },
    { name: 'handledBy', type: 'relationship', relationTo: 'users' },
    { name: 'handledAt', type: 'date' },
  ],
}
