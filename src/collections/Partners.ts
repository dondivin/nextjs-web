import type { CollectionConfig, Field } from 'payload'
import { anyone, roles } from '../access'

const hex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? true : 'Use a 6-digit hex colour like #2F5480')
const https = (v: unknown) => (!v || (typeof v === 'string' && /^https:\/\//.test(v)) ? true : 'Links must start with https://')
const color = (name: string, label: string, description: string): Field => ({ name, label, type: 'text', required: true, validate: hex, admin: { width: '33%', description } })

/** Betting partners. Each one re-themes the whole site and the 3D phone when selected. */
export const Partners: CollectionConfig = {
  slug: 'partners',
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'slug', 'active', 'order', 'promoCode'], group: 'Content' },
  defaultSort: 'order',
  access: { read: anyone, create: roles('editor'), update: roles('editor'), delete: roles('owner') },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'name', type: 'text', required: true, admin: { width: '40%', description: 'As shown in the switcher and on the phone, e.g. 1xBet' } },
        { name: 'slug', type: 'text', required: true, unique: true, index: true, admin: { width: '30%', description: 'Lowercase id used in links (#b-slug)' },
          validate: (v: unknown) => (typeof v === 'string' && /^[a-z0-9-]+$/.test(v) ? true : 'Lowercase letters, numbers and dashes only') },
        { name: 'order', type: 'number', defaultValue: 0, admin: { width: '15%' } },
        { name: 'active', type: 'checkbox', defaultValue: true, admin: { width: '15%' } },
      ],
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Offer',
          fields: [
            { name: 'promoCode', type: 'text', admin: { description: 'The promo code visitors copy' } },
            { type: 'row', fields: [
              { name: 'signupUrl', type: 'text', validate: https, admin: { width: '50%', description: 'Affiliate sign-up link (https://…)' } },
              { name: 'termsUrl', type: 'text', validate: https, admin: { width: '50%', description: 'Bonus terms link (optional)' } },
            ] },
            {
              name: 'texts',
              label: 'Texts per language',
              type: 'array',
              labels: { singular: 'Language', plural: 'Languages' },
              fields: [
                { type: 'row', fields: [
                  { name: 'locale', type: 'text', required: true, admin: { width: '15%', placeholder: 'en' } },
                  { name: 'bonus', type: 'text', admin: { width: '45%', description: 'Welcome bonus, e.g. 100% up to €130' } },
                  { name: 'payments', type: 'text', admin: { width: '40%', description: 'Payment methods, e.g. mobile money, cards' } },
                ] },
              ],
            },
            { name: 'logo', type: 'upload', relationTo: 'media', admin: { description: 'Optional. Only use a logo you have permission to use.' } },
          ],
        },
        {
          label: 'Theme colours',
          description: 'Colours copied from the partner’s own site. They recolour the whole page and the 3D phone.',
          fields: [
            {
              name: 'colors',
              type: 'group',
              fields: [
                { type: 'row', fields: [
                  color('night', 'Page background', 'Darkest background'),
                  color('navy', 'Surface', 'Main surfaces'),
                  color('navy2', 'Surface 2', 'Raised surfaces, phone back'),
                ] },
                { type: 'row', fields: [
                  color('panel', 'Panel', 'Cards'),
                  color('blue', 'Accent', 'Gradients, phone camera plate'),
                  color('sky', 'Highlight', 'Light accent, phone rim light'),
                ] },
                { type: 'row', fields: [
                  color('cta', 'Primary button', 'Main buttons and the partner pill'),
                  color('ink', 'Primary button text', 'Text on primary buttons'),
                  color('odds', 'Odds text', 'Numbers on odds buttons'),
                ] },
                { type: 'row', fields: [
                  color('oddBg', 'Odds background', 'Odds buttons'),
                  color('tint', 'Light section', 'Light section background'),
                  color('deep', 'Deep', 'Footer and deep areas'),
                ] },
                { type: 'row', fields: [
                  color('mute', 'Muted text', 'Secondary text'),
                  color('nav', 'Menu bar', 'Top bar and partner switcher'),
                ] },
              ],
            },
          ],
        },
      ],
    },
  ],
}
