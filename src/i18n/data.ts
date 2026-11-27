import { getPayload } from 'payload'
import config from '@payload-config'
import { en } from './strings'
import { pickLocalized } from '../fields/localizedText'
import { toEngineMatch } from '../chat/data'
import { pushPublicKey } from '../chat/push'
import type { EngineConfig, EngineMatch, EnginePartner } from '../site/engine/types'
import { heroMotionOf, heroMotionPlay } from '@/lib/hero-motion'

export type Language = { code: string; name: string; nativeName: string; dir: 'ltr' | 'rtl'; isDefault: boolean; iconUrl: string | null }

export async function payloadClient() {
  return getPayload({ config })
}

/** Enabled languages, default first. */
export async function getLanguages(): Promise<Language[]> {
  const payload = await payloadClient()
  const res = await payload.find({ collection: 'languages', where: { enabled: { equals: true } }, sort: 'order', pagination: false, depth: 1 })
  const list = res.docs.map((d) => ({ code: d.code, name: d.name, nativeName: d.nativeName, dir: (d.dir || 'ltr') as 'ltr' | 'rtl', isDefault: !!d.isDefault, iconUrl: d.icon && typeof d.icon === 'object' ? d.icon.url || null : null }))
  if (!list.length) return [{ code: 'en', name: 'English', nativeName: 'English', dir: 'ltr', isDefault: true, iconUrl: null }]
  return list.sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
}

/** All UI strings for a locale: requested language → default language → built-in English → key. */
export async function getDictionary(locale: string, defaultLocale: string): Promise<Record<string, string>> {
  const payload = await payloadClient()
  const res = await payload.find({ collection: 'translations', pagination: false, depth: 0, select: { key: true, values: true } })
  const out: Record<string, string> = { ...en }
  for (const d of res.docs) {
    const vals = (d.values || []) as { locale?: string | null; value?: string | null }[]
    const hit = vals.find((v) => v.locale === locale && v.value) || vals.find((v) => v.locale === defaultLocale && v.value)
    if (hit?.value) out[d.key] = hit.value
  }
  return out
}

/** Everything the public page needs, or null when the locale is not an enabled language. */
export async function loadSite(locale: string) {
  const languages = await getLanguages()
  const language = languages.find((l) => l.code === locale)
  if (!language) return null
  const def = languages.find((l) => l.isDefault)?.code || languages[0].code
  const payload = await payloadClient()
  const [strings, partnersRes, matchesRes, site, chat, stickerRes, wallRes] = await Promise.all([
    getDictionary(locale, def),
    payload.find({ collection: 'partners', where: { active: { equals: true } }, sort: 'order', pagination: false, depth: 1 }),
    payload.find({ collection: 'matches', where: { active: { equals: true } }, sort: 'order', pagination: false, depth: 0 }),
    payload.findGlobal({ slug: 'site-settings', depth: 1 }),
    payload.findGlobal({ slug: 'chat-settings', depth: 0 }),
    payload.find({ collection: 'stickers', where: { active: { equals: true } }, sort: 'order', pagination: false, depth: 1 }),
    payload.find({ collection: 'wallpapers', where: { active: { equals: true } }, sort: 'order', pagination: false, depth: 1 }),
  ])

  // Community lounge texts from Chat settings (Groups & channels → Community lounge): a text written for this language
  // replaces the default wording; otherwise the translation stays
  const lounge = chat.lounge || {}
  const own = (v: { locale?: string | null; value?: string | null }[] | null | undefined) => (v || []).find((r) => r.locale === locale && r.value?.trim())?.value?.trim()
  const ln = own(lounge.name), ls = own(lounge.subtitle), ld = own(lounge.description), ct = own(lounge.chatTitle)
  if (ct) strings['chat.title'] = ct
  if (ln) strings['chat.lounge'] = ln
  if (ls) strings['chat.loungeSub'] = ls
  else if (lounge.postBy === 'team') strings['chat.loungeSub'] = strings['chat.loungeSubTeam'] || strings['chat.loungeSub']
  if (ld) { strings['lounge.info'] = ld; strings['chat.loungeHint'] = ld }

  const partners: EnginePartner[] = partnersRes.docs.map((p) => {
    const texts = (p.texts || []) as { locale: string; bonus?: string | null; payments?: string | null }[]
    const row = texts.find((t) => t.locale === locale) || texts.find((t) => t.locale === def) || texts[0]
    const c = p.colors
    return {
      id: p.slug,
      name: p.name,
      c: { night: c.night, navy: c.navy, navy2: c.navy2, panel: c.panel, blue: c.blue, sky: c.sky, cta: c.cta, ink: c.ink, odds: c.odds, oddBg: c.oddBg, tint: c.tint, deep: c.deep, mute: c.mute, nav: c.nav },
      promo: p.promoCode || undefined,
      bonus: row?.bonus || undefined,
      payments: row?.payments || undefined,
      signupUrl: p.signupUrl || undefined,
      termsUrl: p.termsUrl || undefined,
      hero: p.heroImage && typeof p.heroImage === 'object' && p.heroImage.url ? { url: p.heroImage.url, w: p.heroImage.width || 0, h: p.heroImage.height || 0 } : null,
      motion: heroMotionPlay(heroMotionOf(p.heroMotion)),
    }
  })

  const matches: EngineMatch[] = matchesRes.docs.map(toEngineMatch)

  const defaultPartnerDoc = site.defaultPartner && typeof site.defaultPartner === 'object' ? site.defaultPartner : null
  const defaultPartner = defaultPartnerDoc?.slug || partners[0]?.id
  const first = partners.find((p) => p.id === defaultPartner) || partners[0]
  const sub = (k: string, v: Record<string, string>) => (strings[k] || k).replace(/\{(\w+)\}/g, (m, n) => v[n] ?? m)

  const cfg: EngineConfig = {
    locale,
    strings,
    partners,
    defaultPartner,
    matches,
    siteName: site.siteName || 'OddsClub',
    agentName: site.agentName || undefined,
    chat: {
      slowSeconds: chat.slowModeSeconds ?? 0,
      voiceMax: chat.voiceMaxSeconds ?? 120,
      maxLength: chat.maxLength ?? 400,
      bannedWords: (chat.bannedWords || []).map((w) => w.word).filter(Boolean),
      rules: (chat.rules || []).map((r) => ({ icon: r.icon, title: pickLocalized(r.title, locale, def), body: pickLocalized(r.body, locale, def) })),
      loungeTeamOnly: chat.lounge?.postBy === 'team',
      loungeMedia: { view: chat.lounge?.mediaView || 'everyone', save: chat.lounge?.mediaSave !== false },
      pmPictures: chat.privateChats?.pictures === true,   // private chats between members (Chat settings → Private chats)
      pmVoice: chat.privateChats?.voice !== false,
      pmForward: chat.privateChats?.forward !== false,
      // notifications of new messages (src/chat/push.ts): the public VAPID key
      pushKey: pushPublicKey(),   // (null when the keys or the web-push package are missing: the chat doesn't offer it)
    },
    apiBase: '/chat-api',
    // our own stickers for the photo editor (back office → Stickers)
    stickers: stickerRes.docs.filter((d) => d.image && typeof d.image === 'object' && d.image.url).map((d) => ({ name: d.name, url: (d.image as { url: string }).url })),
    // chat wallpapers (back office → Wallpapers)
    wallpapers: wallRes.docs.filter((d) => d.image && typeof d.image === 'object' && d.image.url).map((d) => ({ id: String(d.id), name: d.name, url: (d.image as { url: string }).url, mode: (d.mode === 'tile' ? 'tile' : 'cover') as 'cover' | 'tile', dim: typeof d.dim === 'number' ? d.dim : 20 })),
  }

  const initial = first
    ? {
        bookmaker: first.name,
        promo: first.promo || sub('partner.placeholder.promo', { name: first.name.toUpperCase() }),
        bonus: first.bonus || sub('partner.placeholder.bonus', { name: first.name }),
        payments: first.payments || sub('partner.placeholder.payments', {}),
      }
    : { bookmaker: '', promo: '', bonus: '', payments: '' }

  const extras = {
    helpline: pickLocalized(site.helpline, locale, def) || '[LOCAL GAMBLING HELPLINE]',
    company: pickLocalized(site.companyLine, locale, def) || '[COMPANY / LICENCE DETAILS]',
    year: new Date().getFullYear(),
  }

  return { cfg, initial, extras, languages, language, defaultLocale: def }
}
