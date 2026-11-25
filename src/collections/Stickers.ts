import type { CollectionConfig } from 'payload'
import { anyone, roles } from '../access'

/** Our own stickers for the chat's picture editor (shown in the tray before the emoji). Managed in the back office → Stickers. */
export const Stickers: CollectionConfig = {
  slug: 'stickers',
  admin: { group: 'Chat', useAsTitle: 'name', defaultColumns: ['name', 'active', 'order'] },
  defaultSort: 'order',
  access: { read: anyone, create: roles('moderator'), update: roles('moderator'), delete: roles('moderator') },
  fields: [
    { name: 'name', type: 'text', required: true, maxLength: 40 },
    { name: 'image', type: 'upload', relationTo: 'media', required: true },
    { name: 'active', type: 'checkbox', defaultValue: true, admin: { description: 'Shown in the sticker tray' } },
    { name: 'order', type: 'number', defaultValue: 0 },
  ],
}
