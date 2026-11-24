import type { Payload, PayloadRequest } from 'payload'
import type { EngineMatch } from '../site/engine/types'
import { gradientColor } from './gradient'

/** A chat message as the browser receives it. `room` is the stored room ('lounge', a match id or 'dm:<memberId>'). */
export type WireMsg = {
  id: string
  by: string | null
  text: string
  ts: number
  room: string
  reply: { id: string; by: string | null; text: string } | null
  reactions: Record<string, Record<string, boolean>>
  image?: ChatImage
  mod?: boolean
  deleted?: boolean
  clientId?: string
}
export type ChatImage = { url: string; w: number; h: number }
export type Profile = { name: string; color?: string; gradient?: string; avatarUrl?: string; staff?: boolean }

const relId = (x: unknown): string | null =>
  x && typeof x === 'object' && 'id' in x ? String((x as { id: unknown }).id) : x ? String(x) : null

export const isObjectId = (s: unknown): s is string => typeof s === 'string' && /^[a-f0-9]{24}$/i.test(s)

/** id → picture info for the messages that carry one (one query for the whole list). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function imagesFor(payload: Payload, docs: any[], req?: PayloadRequest): Promise<Map<string, ChatImage>> {
  const ids = [...new Set(docs.map((d) => relId(d.image)).filter(isObjectId))]
  const out = new Map<string, ChatImage>()
  if (!ids.length) return out
  const res = await payload.find({ collection: 'chat-images', where: { id: { in: ids } }, pagination: false, depth: 0, overrideAccess: true, req })
  for (const i of res.docs) if (i.url) out.set(String(i.id), { url: i.url, w: i.width || 0, h: i.height || 0 })
  return out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toWire(doc: any, images?: Map<string, ChatImage>): WireMsg {
  const imgId = relId(doc.image)
  const image = imgId && images ? images.get(imgId) : undefined
  const reply = doc.reply && doc.reply.id ? { id: String(doc.reply.id), by: doc.reply.by || relId(doc.reply.author), text: String(doc.reply.text || '') } : null
  return {
    id: String(doc.id),
    by: relId(doc.author) || relId(doc.staffAuthor),
    text: String(doc.text || ''),
    ts: Date.parse(doc.createdAt) || Date.now(),
    room: String(doc.room || 'lounge'),
    reply,
    reactions: doc.reactions && typeof doc.reactions === 'object' ? doc.reactions : {},
    image,
    mod: doc.isMod ? true : undefined,
    deleted: doc.deleted ? true : undefined,
    clientId: doc.clientId || undefined,
  }
}

/* ---------- small TTL caches (settings change rarely; hooks clear them when needed) ---------- */
const g = globalThis as unknown as { __ocChatCache?: Map<string, { at: number; v: unknown }> }
const cache = g.__ocChatCache || (g.__ocChatCache = new Map())
/** Forget cached values (after the back office saves settings). No key = everything. */
export function clearChatCache(key?: string) {
  if (key) cache.delete(key)
  else cache.clear()
}

export async function cached<T>(key: string, ms: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ms) return hit.v as T
  const v = await fn()
  cache.set(key, { at: Date.now(), v })
  return v
}

export type ChatConfig = { slowMs: number; maxLength: number; banned: string[]; promoCodes: string[]; agentName: string }
export function chatConfig(payload: Payload): Promise<ChatConfig> {
  return cached('config', 30_000, async () => {
    const [chat, site, partners] = await Promise.all([
      payload.findGlobal({ slug: 'chat-settings', depth: 0 }),
      payload.findGlobal({ slug: 'site-settings', depth: 0 }),
      payload.find({ collection: 'partners', pagination: false, depth: 0, select: { promoCode: true } }),
    ])
    return {
      slowMs: Math.max(0, Number(chat.slowModeSeconds ?? 5)) * 1000,
      maxLength: Number(chat.maxLength ?? 400),
      banned: (chat.bannedWords || []).map((w) => w.word).filter(Boolean),
      promoCodes: partners.docs.map((p) => p.promoCode).filter((c): c is string => !!c),
      agentName: site.agentName || '',
    }
  })
}

/** Public profile of each chat id (fans = members, staff = back-office users). Unknown ids are left out. */
export async function profilesFor(payload: Payload, ids: (string | null | undefined)[], req?: PayloadRequest): Promise<Record<string, Profile>> {
  const want = [...new Set(ids.filter(isObjectId))]
  const out: Record<string, Profile> = {}
  if (!want.length) return out
  const [members, staff, cfg] = await Promise.all([
    payload.find({ collection: 'members', where: { id: { in: want } }, pagination: false, depth: 1, overrideAccess: true, req }),
    payload.find({ collection: 'users', where: { id: { in: want } }, pagination: false, depth: 1, overrideAccess: true, req }),
    chatConfig(payload),
  ])
  for (const m of members.docs) {
    const av = m.avatar && typeof m.avatar === 'object' ? m.avatar.url : null
    out[String(m.id)] = { name: m.displayName, color: m.color || undefined, gradient: m.avatarGradient || undefined, avatarUrl: av || undefined }
  }
  for (const u of staff.docs) {
    const av = u.chatAvatar && typeof u.chatAvatar === 'object' ? u.chatAvatar.url : null
    out[String(u.id)] = { name: u.name || cfg.agentName || 'OddsClub team', staff: true, gradient: u.chatGradient || undefined, color: gradientColor(u.chatGradient), avatarUrl: av || undefined }
  }
  return out
}

/** Members who can't post right now (muted or banned) → { memberId: true }. */
export async function mutedMap(payload: Payload, req?: PayloadRequest): Promise<Record<string, true>> {
  const res = await payload.find({
    collection: 'members',
    where: { status: { in: ['muted', 'banned'] } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { status: true, mutedUntil: true },
    req,
  })
  const now = Date.now()
  const out: Record<string, true> = {}
  for (const m of res.docs) {
    if (m.status === 'muted' && m.mutedUntil && Date.parse(m.mutedUntil) < now) continue // mute expired
    out[String(m.id)] = true
  }
  return out
}

/** Open report count per message (for staff). */
export async function reportCounts(payload: Payload, req?: PayloadRequest): Promise<Record<string, number>> {
  const res = await payload.find({ collection: 'chat-reports', where: { status: { equals: 'open' } }, pagination: false, depth: 0, overrideAccess: true, select: { message: true }, req })
  const out: Record<string, number> = {}
  for (const r of res.docs) {
    const id = relId(r.message)
    if (id) out[id] = (out[id] || 0) + 1
  }
  return out
}

/** Message ids this member already reported. */
export async function myReports(payload: Payload, memberId: string, req?: PayloadRequest): Promise<string[]> {
  const res = await payload.find({ collection: 'chat-reports', where: { reporter: { equals: memberId } }, pagination: false, depth: 0, overrideAccess: true, select: { message: true }, req })
  return res.docs.map((r) => relId(r.message)).filter((x): x is string => !!x)
}

export type ThreadInfo = { lastTs: number; lastText: string; lastBy: string | null; lastSeen: number; photo?: boolean }

/** Direct chats with the partner team, one per member (for staff). Built from the latest DM messages. */
export async function threadsFor(payload: Payload): Promise<Record<string, ThreadInfo>> {
  const res = await payload.find({
    collection: 'chat-messages',
    where: { and: [{ room: { like: 'dm:' } }, { deleted: { not_equals: true } }] },
    sort: '-createdAt',
    limit: 2000,
    depth: 0,
    overrideAccess: true,
  })
  const out: Record<string, ThreadInfo> = {}
  for (const d of res.docs) {
    const uid = String(d.room).slice(3)
    if (!isObjectId(uid) || out[uid]) continue
    const w = toWire(d)
    out[uid] = { lastTs: w.ts, lastText: w.text.slice(0, 140), lastBy: w.by, lastSeen: 0, photo: !w.text && !!relId(d.image) }
  }
  const ids = Object.keys(out)
  if (ids.length) {
    const ms = await payload.find({ collection: 'members', where: { id: { in: ids } }, pagination: false, depth: 0, overrideAccess: true, select: { lastSeenAt: true } })
    for (const m of ms.docs) if (out[String(m.id)]) out[String(m.id)].lastSeen = m.lastSeenAt ? Date.parse(m.lastSeenAt) : 0
  }
  return out
}

/** The staff member fans see in their direct chat: whoever from the team was in the chat most recently. */
export async function agentInfo(payload: Payload) {
  const res = await payload.find({
    collection: 'users',
    where: { and: [{ chatLastSeenAt: { exists: true } }, { roles: { in: ['owner', 'moderator'] } }] },
    sort: '-chatLastSeenAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const u = res.docs[0]
  if (!u) return null
  const p = await profilesFor(payload, [String(u.id)])
  return { uid: String(u.id), lastSeen: u.chatLastSeenAt ? Date.parse(u.chatLastSeenAt) : 0, profile: p[String(u.id)] }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toEngineMatch(m: any): EngineMatch {
  return {
    id: String(m.id),
    sport: m.sport,
    league: m.league || undefined,
    home: m.home,
    away: m.away,
    status: m.status,
    minute: m.minute ?? null,
    hs: m.scoreHome ?? null,
    as: m.scoreAway ?? null,
    o1: m.oddsHome ?? null,
    ox: m.oddsDraw ?? null,
    o2: m.oddsAway ?? null,
    startsAt: m.startsAt || null,
  }
}

export async function activeMatches(payload: Payload, req?: PayloadRequest): Promise<EngineMatch[]> {
  const res = await payload.find({ collection: 'matches', where: { active: { equals: true } }, sort: 'order', pagination: false, depth: 0, overrideAccess: true, req })
  return res.docs.map(toEngineMatch)
}
