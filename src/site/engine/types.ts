import type { HeroMotion } from '../../lib/hero-motion'
export type PartnerColors = {
  night: string; navy: string; navy2: string; panel: string; blue: string; sky: string; cta: string
  ink: string; odds: string; oddBg: string; tint: string; deep: string; mute: string; nav: string
}
export type EnginePartner = {
  id: string; name: string; c: PartnerColors
  promo?: string; bonus?: string; payments?: string; signupUrl?: string; termsUrl?: string
  hero?: HeroPicture | null // this partner's first-screen picture (none = no picture)
  motion?: HeroMotion // how the picture changes when the site switches to this partner
}
export type HeroPicture = { url: string; w: number; h: number }
export type EngineMatch = {
  id: string; sport: string; league?: string; home: string; away: string
  status: 'upcoming' | 'live' | 'ft'; minute?: number | null; hs?: number | null; as?: number | null
  o1?: number | null; ox?: number | null; o2?: number | null; startsAt?: string | null
}
export type EngineRule = { icon: string; title: string; body: string }
export type EngineConfig = {
  locale: string
  strings: Record<string, string>
  partners: EnginePartner[]
  defaultPartner?: string
  matches: EngineMatch[]
  siteName: string
  agentName?: string
  chat: { slowSeconds: number; maxLength: number; bannedWords: string[]; rules: EngineRule[]; loungeTeamOnly?: boolean; voiceMax?: number; loungeMedia?: { view: string; save: boolean }; pushKey?: string | null; pmPictures?: boolean; pmVoice?: boolean }
  apiBase: string
  stickers?: { name: string; url: string }[]   // our own stickers for the photo editor
  wallpapers?: { id: string; name: string; url: string; mode: 'cover' | 'tile'; dim: number }[]   // chat wallpapers (back office → Wallpapers)
}
