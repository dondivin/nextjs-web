import type { CollectionConfig } from 'payload'
import { anyone, roles } from '../access'
import { onMatchesChange } from '../chat/hooks'

export { SPORT_OPTIONS } from '../lib/options'
import { SPORT_OPTIONS } from '../lib/options'

/** Matches on the board. Each match also gets its own chat room. */
export const Matches: CollectionConfig = {
  slug: 'matches',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'sport', 'status', 'startsAt', 'order', 'active'], group: 'Content' },
  defaultSort: 'order',
  access: { read: anyone, create: roles('editor', 'moderator'), update: roles('editor', 'moderator'), delete: roles('editor', 'moderator') },
  hooks: {
    beforeChange: [({ data }) => { data.title = `${data.home || '?'} v ${data.away || '?'}`; return data }],
    afterChange: [onMatchesChange],
    afterDelete: [onMatchesChange],
  },
  fields: [
    { name: 'title', type: 'text', admin: { hidden: true } },
    { type: 'row', fields: [
      { name: 'sport', type: 'select', required: true, defaultValue: 'football', options: SPORT_OPTIONS, admin: { width: '25%' } },
      { name: 'league', type: 'text', admin: { width: '45%' } },
      { name: 'order', type: 'number', defaultValue: 0, admin: { width: '15%' } },
      { name: 'active', type: 'checkbox', defaultValue: true, admin: { width: '15%' } },
    ] },
    { type: 'row', fields: [
      { name: 'home', type: 'text', required: true, admin: { width: '50%' } },
      { name: 'away', type: 'text', required: true, admin: { width: '50%' } },
    ] },
    { type: 'row', fields: [
      { name: 'status', type: 'select', required: true, defaultValue: 'upcoming', options: [{ label: 'Upcoming', value: 'upcoming' }, { label: 'Live', value: 'live' }, { label: 'Full time', value: 'ft' }], admin: { width: '25%' } },
      { name: 'startsAt', type: 'date', admin: { width: '35%', date: { pickerAppearance: 'dayAndTime' } } },
      { name: 'minute', type: 'number', admin: { width: '15%', condition: (_, s) => s?.status === 'live' } },
      { name: 'scoreHome', type: 'number', admin: { width: '12%', condition: (_, s) => s?.status !== 'upcoming' } },
      { name: 'scoreAway', type: 'number', admin: { width: '13%', condition: (_, s) => s?.status !== 'upcoming' } },
    ] },
    { type: 'row', fields: [
      { name: 'oddsHome', type: 'number', admin: { width: '33%', step: 0.01, description: '1' } },
      { name: 'oddsDraw', type: 'number', admin: { width: '33%', step: 0.01, description: 'X — leave empty for sports without a draw' } },
      { name: 'oddsAway', type: 'number', admin: { width: '34%', step: 0.01, description: '2' } },
    ] },
  ],
}
