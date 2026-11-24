import type { CollectionConfig } from 'payload'
import { anyone, roles } from '../access'

export const Languages: CollectionConfig = {
  slug: 'languages',
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'code', 'enabled', 'isDefault', 'order'], group: 'Translations', description: 'Languages offered in the site language switcher. Add one, then translate its texts in Translations.' },
  defaultSort: 'order',
  access: { read: anyone, create: roles('editor', 'translator'), update: roles('editor', 'translator'), delete: roles('owner') },
  hooks: {
    afterChange: [
      // only one default language
      async ({ doc, req, context }) => {
        if (doc.isDefault && !context.skipDefault) {
          const others = await req.payload.find({ collection: 'languages', where: { and: [{ isDefault: { equals: true } }, { id: { not_equals: doc.id } }] }, limit: 100, req })
          for (const o of others.docs) await req.payload.update({ collection: 'languages', id: o.id, data: { isDefault: false }, context: { skipDefault: true }, req })
        }
        return doc
      },
    ],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'code', type: 'text', required: true, unique: true, index: true, admin: { width: '25%', description: 'Short code used in the address, e.g. en, fr, sw, pt-br' },
          validate: (v: unknown) => (typeof v === 'string' && /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(v) ? true : 'Use a lowercase code like en, fr or pt-br') },
        { name: 'name', type: 'text', required: true, admin: { width: '35%', description: 'Name in English, e.g. French' } },
        { name: 'nativeName', type: 'text', required: true, admin: { width: '40%', description: 'Name as shown in the switcher, e.g. Français' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'dir', type: 'select', defaultValue: 'ltr', options: [{ label: 'Left to right', value: 'ltr' }, { label: 'Right to left', value: 'rtl' }], admin: { width: '30%' } },
        { name: 'order', type: 'number', defaultValue: 0, admin: { width: '20%' } },
        { name: 'enabled', type: 'checkbox', defaultValue: true, admin: { width: '25%' } },
        { name: 'isDefault', type: 'checkbox', defaultValue: false, admin: { width: '25%', description: 'Used when a text has no translation' } },
      ],
    },
    { name: 'icon', type: 'upload', relationTo: 'media', admin: { description: 'Icon shown in the language switcher (e.g. a flag). Upload it from Translations → Languages.' } },
  ],
}
