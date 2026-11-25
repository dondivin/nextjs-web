import type { CollectionConfig } from 'payload'
import { anyone, roles } from '../access'

/** Chat wallpapers people can pick (theme sheet → Wallpaper). Managed in the back office → Wallpapers. */
export const Wallpapers: CollectionConfig = {
  slug: 'wallpapers',
  admin: { group: 'Chat', useAsTitle: 'name', defaultColumns: ['name', 'mode', 'active', 'order'] },
  defaultSort: 'order',
  access: { read: anyone, create: roles('moderator'), update: roles('moderator'), delete: roles('moderator') },
  fields: [
    { name: 'name', type: 'text', required: true, maxLength: 40 },
    { name: 'image', type: 'upload', relationTo: 'media', required: true },
    {
      name: 'mode', type: 'select', defaultValue: 'cover', required: true,
      options: [{ label: 'Photo (fills the background)', value: 'cover' }, { label: 'Pattern (repeats)', value: 'tile' }],
    },
    { name: 'dim', type: 'number', defaultValue: 20, min: 0, max: 70, admin: { description: 'Darken / lighten it with the theme’s background colour (%) so messages stay readable' } },
    { name: 'active', type: 'checkbox', defaultValue: true, admin: { description: 'Offered in the chat' } },
    { name: 'order', type: 'number', defaultValue: 0 },
  ],
}
