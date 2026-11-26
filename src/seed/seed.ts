/*
 * Seed: loads the prototype's content into MongoDB.
 * Runs automatically when the server starts (payload.config.ts → onInit), and manually with `pnpm seed`.
 * Safe to run again: it only ADDS what is missing (it never overwrites text edited in the back office).
 * `pnpm seed --force-strings` overwrites every translation value with the built-in ones.
 */
import type { Payload } from 'payload'
import { en, fr, contextFor } from '../i18n/strings'
import { databaseIsEmpty, restoreSnapshot, snapshotExists } from './snapshot'

const PARTNERS = [
  { name: '1xBet', slug: '1xbet', order: 1, colors: { night: '#264165', navy: '#2F5480', navy2: '#3A69A1', panel: '#2F5480', blue: '#3A69A1', sky: '#D6DEE7', cta: '#88AB45', ink: '#FFFFFF', odds: '#264165', oddBg: '#E9EDF1', tint: '#D6DEE7', deep: '#1E3452', mute: '#B9CBE0', nav: '#2F5480' } },
  { name: '888STARZ', slug: '888starz', order: 2, colors: { night: '#262626', navy: '#2B2B2B', navy2: '#3D3D3D', panel: '#343434', blue: '#8C1B11', sky: '#EA3323', cta: '#CF2C1E', ink: '#FFFFFF', odds: '#262626', oddBg: '#EDEDED', tint: '#EFEFEF', deep: '#1C1C1C', mute: '#B5B5B5', nav: '#8C1B11' } },
  { name: 'Melbet', slug: 'melbet', order: 3, colors: { night: '#1A1A1A', navy: '#212121', navy2: '#2E2E2E', panel: '#2E2E2E', blue: '#3B3B3B', sky: '#F4BB41', cta: '#F4BB41', ink: '#212121', odds: '#212121', oddBg: '#F6F6F6', tint: '#DEDEDE', deep: '#121212', mute: '#B6B6B6', nav: '#212121' } },
  { name: 'Betwinner', slug: 'betwinner', order: 4, colors: { night: '#254D3A', navy: '#32644C', navy2: '#418161', panel: '#32644C', blue: '#418161', sky: '#B4E15D', cta: '#F7CF47', ink: '#212121', odds: '#254D3A', oddBg: '#EAF1EE', tint: '#D8E7E1', deep: '#1B3A2C', mute: '#B5D0C3', nav: '#32644C' } },
]

function today(h: number, m: number) {
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

const RULES = [
  { icon: 'age', en: ['18+ only', 'This chat is for adults. Betting talk is for people aged 18 and over.'], fr: ['18+ uniquement', 'Ce chat est réservé aux adultes. Les discussions sur les paris sont réservées aux 18 ans et plus.'] },
  { icon: 'heart', en: ['Respect everyone', 'No insults, hate, threats or harassment. Banter about teams is fine, abuse of people is not.'], fr: ['Respectez tout le monde', 'Pas d’insultes, de haine, de menaces ni de harcèlement. Chambrer les équipes, oui ; attaquer les personnes, non.'] },
  { icon: 'nolink', en: ['No links or contact details', 'Links, phone numbers and email addresses are blocked to stop scams.'], fr: ['Pas de liens ni de coordonnées', 'Les liens, numéros de téléphone et adresses e-mail sont bloqués pour éviter les arnaques.'] },
  { icon: 'shield', en: ['No paid tips or "fixed matches"', 'Selling tips, fixed-match offers and money requests are removed and the sender is muted.'], fr: ['Pas de pronos payants ni de « matchs truqués »', 'La vente de pronos, les offres de matchs truqués et les demandes d’argent sont supprimées et l’auteur est rendu muet.'] },
  { icon: 'tag', en: ['No other promo codes or referral links', 'Only the official code on this page may be shared. Other codes and invite links are removed.'], fr: ['Pas d’autres codes promo ni liens de parrainage', 'Seul le code officiel de cette page peut être partagé. Les autres codes et liens d’invitation sont supprimés.'] },
  { icon: 'clock', en: ['No spam', 'Slow mode is on: one message every 5 seconds. No repeats and no ALL CAPS.'], fr: ['Pas de spam', 'Le mode lent est activé : un message toutes les 5 secondes. Pas de répétitions ni de MAJUSCULES.'] },
  { icon: 'ball', en: ['Keep it on topic', 'Use each event room for that event and the lounge for everything else.'], fr: ['Restez dans le sujet', 'Utilisez chaque salon de match pour ce match et le salon de la communauté pour le reste.'] },
]

const BANNED = ['fuck','fuk','shit','bitch','cunt','asshole','bastard','dickhead','wanker','motherf','nigg','fagg','retard','whore','slut','idiot','moron','stupid','kys','killyourself','pute','merde','connard','salope','encule']

export async function seed(payload: Payload, opts: { forceStrings?: boolean } = {}) {
  const forceStrings = !!opts.forceStrings
  const log = (m: string) => payload.logger.info('[seed] ' + m)

  // a fresh, empty database + a snapshot of a real one (pnpm data:export) → bring that data back first;
  // the rest of the seed then only adds texts that newer code needs
  if (snapshotExists()) {
    if (await databaseIsEmpty(payload)) await restoreSnapshot(payload, { log })
    else log(`the database "${(payload.db as unknown as { connection: { db: { databaseName: string } } }).connection.db.databaseName}" already has data, so the snapshot was not restored (nothing to do). To replace its data with the snapshot: pnpm seed --restore --yes`)
  }

  // languages
  for (const l of [
    { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' as const, order: 1, enabled: true, isDefault: true },
    { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr' as const, order: 2, enabled: true, isDefault: false },
  ]) {
    const found = await payload.find({ collection: 'languages', where: { code: { equals: l.code } }, limit: 1 })
    if (!found.docs.length) { await payload.create({ collection: 'languages', data: l }); log('language ' + l.code) }
  }

  // translations (add missing keys / missing languages; never overwrite edits unless --force-strings)
  const existing = await payload.find({ collection: 'translations', pagination: false, depth: 0 })
  const byKey = new Map(existing.docs.map((d) => [d.key, d]))
  let created = 0, updated = 0
  for (const key of Object.keys(en)) {
    const want: Record<string, string> = { en: en[key] }
    if (fr[key]) want.fr = fr[key]
    const doc = byKey.get(key)
    if (!doc) {
      await payload.create({ collection: 'translations', data: { key, context: contextFor(key), values: Object.entries(want).map(([locale, value]) => ({ locale, value })) } })
      created++
      continue
    }
    const values = ((doc.values || []) as { locale: string; value?: string | null }[]).map((v) => ({ locale: v.locale, value: v.value || '' }))
    let changed = false
    for (const [locale, value] of Object.entries(want)) {
      const row = values.find((v) => v.locale === locale)
      if (!row) { values.push({ locale, value }); changed = true }
      else if (forceStrings && row.value !== value) { row.value = value; changed = true }
    }
    if (changed) { await payload.update({ collection: 'translations', id: doc.id, data: { values } }); updated++ }
  }
  log(`translations: ${created} created, ${updated} updated`)

  // partners
  const partnerIds: Record<string, string | number> = {}
  for (const p of PARTNERS) {
    const found = await payload.find({ collection: 'partners', where: { slug: { equals: p.slug } }, limit: 1 })
    if (found.docs.length) { partnerIds[p.slug] = found.docs[0].id; continue }
    const doc = await payload.create({ collection: 'partners', data: { ...p, active: true, texts: [] } })
    partnerIds[p.slug] = doc.id
    log('partner ' + p.name)
  }

  // matches: none are seeded (no sample data) — the team adds real matches in the back office (/admin/matches)

  // member roles: the default one (a setting, not sample data) — more roles are made in the back office (/admin/roles)
  const rc = await payload.count({ collection: 'member-roles', overrideAccess: true })
  if (!rc.totalDocs) {
    await payload.create({ collection: 'member-roles', overrideAccess: true, data: { name: 'Member', description: 'Everyone, by default', color: '#3E63DD', isDefault: true, order: 0, createGroups: false, createChannels: false, maxRooms: 0, sendPictures: false, privateChats: true, showBadge: false } })
    log('member role: Member (default)')
  }

  // site settings
  const site = await payload.findGlobal({ slug: 'site-settings' })
  if (!site.defaultPartner) {
    await payload.updateGlobal({ slug: 'site-settings', data: { siteName: site.siteName || 'OddsClub', defaultPartner: partnerIds['1xbet'] as string, agentName: site.agentName || 'OddsClub team' } })
    log('site settings')
  }

  // chat settings
  const chat = await payload.findGlobal({ slug: 'chat-settings' })
  if (!chat.rules || !chat.rules.length) {
    await payload.updateGlobal({
      slug: 'chat-settings',
      data: {
        slowModeSeconds: chat.slowModeSeconds ?? 0,
        maxLength: chat.maxLength ?? 400,
        rules: RULES.map((r) => ({
          icon: r.icon as 'age',
          title: [{ locale: 'en', value: r.en[0] }, { locale: 'fr', value: r.fr[0] }],
          body: [{ locale: 'en', value: r.en[1] }, { locale: 'fr', value: r.fr[1] }],
        })),
        bannedWords: (chat.bannedWords && chat.bannedWords.length ? chat.bannedWords : BANNED.map((word) => ({ word }))),
      },
    })
    log('chat settings')
  }

  log('done')
}
