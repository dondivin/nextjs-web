import type { GlobalConfig } from 'payload'
import { anyone, roles } from '../access'
import { localizedText } from '../fields/localizedText'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Site settings',
  admin: { group: 'Settings' },
  access: { read: anyone, update: roles('editor') },
  fields: [
    { type: 'row', fields: [
      { name: 'siteName', type: 'text', required: true, defaultValue: 'OddsClub', admin: { width: '50%' } },
      { name: 'defaultPartner', type: 'relationship', relationTo: 'partners', admin: { width: '50%', description: 'Partner shown to first-time visitors' } },
    ] },
    { name: 'agentName', type: 'text', admin: { description: 'Name visitors see in the direct chat with your team' } },
    localizedText('helpline', 'Gambling helpline', { description: 'Shown in the footer’s responsible-gambling note, per language.' }),
    localizedText('companyLine', 'Company / licence line', { description: 'Footer line with company and licence details, per language.' }),
    // brand + search (managed in the back office: Site settings → Brand & search)
    { name: 'logo', type: 'upload', relationTo: 'media', admin: { description: 'Square logo (stored as 512×512 PNG). Used in the nav, chat, back office, browser tab, home-screen icon and search engines.' } },
    { name: 'shareImage', type: 'upload', relationTo: 'media', admin: { description: 'Optional 1200×630 image for link previews (WhatsApp, Facebook, X…). Without it one is made from the logo.' } },
    localizedText('seoDescription', 'Search description', { textarea: true, description: 'What search engines show under the site name, per language (about 150 characters).' }),
  ],
}
