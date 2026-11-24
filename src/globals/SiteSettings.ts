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
  ],
}
