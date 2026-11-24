import type { CollectionConfig } from 'payload'
import { anyone, roles } from '../access'

/** Every piece of fixed site text (buttons, headings, chat labels…). One document per key, one row per language. */
export const Translations: CollectionConfig = {
  slug: 'translations',
  admin: {
    useAsTitle: 'key',
    defaultColumns: ['key', 'namespace', 'updatedAt'],
    listSearchableFields: ['key'],
    group: 'Translations',
    description: 'Text markup: **bold**, __highlight__, and {placeholders} which are filled in automatically — keep placeholders exactly as they are.',
    pagination: { defaultLimit: 50 },
  },
  defaultSort: 'key',
  access: { read: anyone, create: roles('editor', 'translator'), update: roles('editor', 'translator'), delete: roles('owner') },
  hooks: {
    beforeChange: [({ data }) => { if (data.key) data.namespace = String(data.key).split('.')[0]; return data }],
  },
  fields: [
    { name: 'key', type: 'text', required: true, unique: true, index: true, admin: { description: 'Code name used by the site, e.g. hero.headline.1. Do not rename existing keys.' } },
    { name: 'namespace', type: 'text', index: true, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'context', type: 'textarea', admin: { description: 'Where this text appears (help for translators)', position: 'sidebar' } },
    {
      name: 'values',
      type: 'array',
      labels: { singular: 'Language', plural: 'Languages' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'locale', type: 'text', required: true, admin: { width: '15%' } },
            { name: 'value', type: 'textarea', admin: { width: '85%', rows: 2 } },
          ],
        },
      ],
    },
  ],
}
