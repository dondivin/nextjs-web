import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import type { Payload } from 'payload'
import { hasRole } from '../access'
import { getDictionary, getLanguages } from '../i18n/data'
import type { Member, User } from '../payload-types'
import { isGradient, randomGradient } from './gradient'
import { findPair, pmMembers, pmRoom, relationsOf, relView, pairKey } from './pm'
import { joinedGroups, lockWire, mediaPolicy, roomMedia } from './media-policy'
import { groupIdOf, groupRoom, memberUids, participantUids, roomAccess, roomsFor, setMembership, setRoomAdmin, teamCreatorOf } from './groups'
import { AvatarError, dropMedia, prepareChatImage, prepareSticker, storeAvatar } from './avatar'
import { shredRoom } from './crypto'
import { pushForMessage, pushPublicKey } from './push'
import { broadcast, hub, peersList, setPresence, type Viewer } from './hub'
import {
  agentInfo, cached, chatConfig, imagesFor, isObjectId, mutedMap, permsOf, STAFF_PERMS, type Perms, myReports, profilesFor, reportCounts, threadsFor, toWire, type ChatConfig,
} from './data'

/** Thrown by actions; `message` is already in the visitor's language and is shown as a toast. */
export class ChatError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

export type Ctx = { payload: Payload; viewer: Viewer; member: Member | null; staff: User | null; perms: Perms; t: (k: string, v?: Record<string, string | number>) => string; cookie?: string }

const REACTIONS = new Set(['goal', 'fire', 'laugh', 'clap', 'wow'])
const ROOM_RE = /^(lounge|support|(sup|pm|g):[a-f0-9]{24}|[a-f0-9]{24})$/i

/* ---------- who is asking ---------- */
export async function dictionary(payload: Payload, locale: string) {
  return cached('dict:' + locale, 60_000, async () => {
    const langs = await getLanguages()
    const def = langs.find((l) => l.isDefault)?.code || 'en'
    return getDictionary(langs.some((l) => l.code === locale) ? locale : def, def)
  })
}

export async function context(payload: Payload, headers: Headers, locale: string): Promise<Ctx> {
  const dict = await dictionary(payload, locale)
  const t = (k: string, v?: Record<string, string | number>) => (dict[k] || k).replace(/\{(\w+)\}/g, (m, n) => (v && v[n] != null ? String(v[n]) : m))
  type Authed = (Member & { collection: 'members' }) | (User & { collection: 'users' }) | null
  let user: Authed = null
  try {
    user = (await payload.auth({ headers })).user as Authed
  } catch {}
  const cookie = headers.get('cookie') || undefined   // (forwarding a picture fetches it as this person)
  if (user?.collection === 'users' && hasRole(user, 'moderator')) return { payload, t, viewer: { kind: 'staff', uid: String(user.id) }, member: null, staff: user, perms: STAFF_PERMS, cookie }
  if (user?.collection === 'members') return { payload, t, viewer: { kind: 'member', uid: String(user.id) }, member: user, staff: null, perms: await permsOf(payload, user.memberRole), cookie }
  return { payload, t, viewer: { kind: 'anon', uid: null }, member: null, staff: null, perms: { ...STAFF_PERMS, createGroups: false, createChannels: false, maxRooms: 0, sendPictures: false, privateChats: false } }
}

function isMuted(m: Member | null) {
  if (!m) return false
  if (m.status === 'banned') return true
  return m.status === 'muted' && (!m.mutedUntil || Date.parse(m.mutedUntil) > Date.now())
}

/* ---------- first event of every stream: everything the chat needs to draw ---------- */
/** Messages per page: what a conversation gets when the chat connects, and each "older" page (scrolling up). */
export const PAGE = 40
/** The newest PAGE messages of one stored room (optionally before a time), newest last. */
async function latest(payload: Payload, room: string, before?: number) {
  const where = { and: [{ room: { equals: room } }, { deleted: { not_equals: true } }, ...(before ? [{ createdAt: { less_than: new Date(before).toISOString() } }] : [])] }
  const res = await payload.find({ collection: 'chat-messages', where: where as never, sort: '-createdAt', limit: PAGE + 1, depth: 0, overrideAccess: true })
  return { docs: res.docs.slice(0, PAGE).reverse(), more: res.docs.length > PAGE }
}

export async function snapshot(ctx: Ctx, connId: string) {
  const { payload, viewer, member, staff } = ctx
  // the lounge and every match room: each its own latest page (a busy lounge can't push a match room's history out)
  const matchIds = (await payload.find({ collection: 'matches', where: { active: { equals: true } }, pagination: false, depth: 0, overrideAccess: true, select: {} })).docs.map((d) => String(d.id))
  const pages = await Promise.all(['lounge', ...matchIds].map((r) => latest(payload, r)))
  const roomDocs = pages.flatMap((pg) => pg.docs).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  const roomImgs = await imagesFor(payload, roomDocs)
  const policy = await mediaPolicy(payload), myGroups = await joinedGroups(payload, viewer.kind === 'member' ? viewer.uid : null)
  const messages = roomDocs.map((d) => lockWire(toWire(d, roomImgs), viewer, policy, myGroups))
  let myDm: ReturnType<typeof toWire>[] = []
  if (member) {
    const dm = await payload.find({ collection: 'chat-messages', where: { and: [{ room: { equals: 'dm:' + member.id } }, { deleted: { not_equals: true } }] }, sort: '-createdAt', limit: PAGE, depth: 0, overrideAccess: true })
    const dmImgs = await imagesFor(payload, dm.docs)
    myDm = dm.docs.map((d) => toWire(d, dmImgs)).reverse()
  }
  const [muted, agent, threads, reports, mine] = await Promise.all([
    mutedMap(payload),
    agentInfo(payload),
    staff ? threadsFor(payload) : Promise.resolve(undefined),
    staff ? reportCounts(payload) : Promise.resolve(undefined),
    member ? myReports(payload, String(member.id)) : Promise.resolve([]),
  ])
  // member-to-member private chats: requests, accepted chats (+ their latest messages), people they blocked
  let pms: Awaited<ReturnType<typeof relationsOf>> = []
  const pmMsgs: Record<string, ReturnType<typeof toWire>[]> = {}
  if (member) {
    pms = await relationsOf(payload, String(member.id))
    const open = pms.filter((r) => r.status === 'accepted').slice(0, 40)
    await Promise.all(open.map(async (r) => {
      const res = await payload.find({ collection: 'chat-messages', where: { and: [{ room: { equals: pmRoom(String(member.id), r.uid) } }, { deleted: { not_equals: true } }] }, sort: '-createdAt', limit: PAGE, depth: 0, overrideAccess: true })
      const media = await imagesFor(payload, res.docs)
      pmMsgs[r.uid] = res.docs.map((d) => toWire(d, media)).reverse()
    }))
  }
  const receipts = await receiptsFor(ctx)
  const { groups, gMsgs } = await groupsWithMessages(ctx, [])
  const ids = [...messages, ...myDm, ...Object.values(pmMsgs).flat(), ...Object.values(gMsgs).flat()].flatMap((m) => [m.by, m.reply?.by])
  ids.push(...pms.map((r) => r.uid))
  if (threads) ids.push(...Object.keys(threads))
  const peers = peersList()
  ids.push(...peers.map((p) => p.by))
  if (viewer.uid) ids.push(viewer.uid)
  const profiles = await profilesFor(payload, ids)
  const name = member?.displayName || (staff ? profiles[String(staff.id)]?.name : null) || null
  return {
    conn: connId,
    uid: viewer.uid,
    staff: viewer.kind === 'staff',
    canPost: viewer.kind === 'staff' || (!!member && member.status !== 'banned'),
    canEdit: viewer.kind === 'staff',
    me: viewer.uid ? { name, email: member?.email || staff?.email || null, ...(member ? { pmPolicy: member.pmPolicy || 'request' } : {}) } : null,
    rulesAccepted: viewer.kind === 'staff' || !!member?.rulesAcceptedAt,
    messages,
    myDm,
    perms: ctx.perms,
    pms,
    pmMsgs,
    groups,
    gMsgs,
    threads,
    agent,
    muted,
    reports,
    myReports: mine,
    receipts,
    profiles,
    peers,
  }
}

/* ---------- message rules (same checks as the browser; the server is the one that counts) ---------- */
const norm = (s: string) =>
  s.toLowerCase().replace(/[0@]/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/[5$]/g, 's').replace(/7/g, 't').replace(/[^a-z]/g, '')

function checkText(ctx: Ctx, cfg: ChatConfig, text: string): string | null {
  const { t } = ctx
  const staff = ctx.viewer.kind === 'staff'
  if (text.length > cfg.maxLength) return t('chat.err.tooLong', { n: cfg.maxLength })
  if (staff) return null // the partner team may share links, codes and contact details
  if (/(https?:\/\/|www\.|t\.me\/|wa\.me\/|\b[a-z0-9-]{2,}\.(com|net|org|io|bet|xyz|me|co|ly|app|link|site|online|info|biz|tv|gg)\b)/i.test(text)) return t('rule.links')
  const upper = text.toUpperCase()
  if (/(promo\s*-?\s*code|promocode|bonus\s*code|ref(erral)?\s*(code|link)|invite\s*(code|link)|use\s*(my|this)\s*code|code\s*[:=])/i.test(text) && !cfg.promoCodes.some((c) => upper.includes(c.toUpperCase()))) return t('rule.codes')
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text)) return t('rule.emails')
  if (/(\+?\d[\d\s().-]{7,}\d)/.test(text) && text.replace(/\D/g, '').length >= 8) return t('rule.phones')
  if (/(fixed\s*-?\s*match|sure\s*(odds|win|tips?)|guaranteed\s*(win|odds|profit)|vip\s*tips?|send\s*(me\s*)?money|mobile\s*money|inbox\s*me|dm\s*me|whatsapp\s*me|telegram\s*me)/i.test(text)) return t('rule.scams')
  const n = norm(text)
  for (const w of cfg.banned) {
    const b = String(w).toLowerCase().replace(/[^a-z]/g, '')
    if (b && n.includes(b)) return t('rule.language')
  }
  const letters = text.replace(/[^A-Za-z]/g, '')
  if (letters.length >= 12 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.7) return t('rule.caps')
  if (/(.)\1{9,}/.test(text)) return t('rule.spam')
  return null
}

/* ---------- guards ---------- */
function needPoster(ctx: Ctx) {
  if (ctx.viewer.kind === 'staff') return
  if (!ctx.member) throw new ChatError(ctx.t('chat.signInToJoin'), 401)
  if (ctx.member.status === 'banned') throw new ChatError(ctx.t('chat.gate.readOnly'), 403)
  if (isMuted(ctx.member)) throw new ChatError(ctx.t('chat.mutedToast'), 403)
  if (!ctx.member.rulesAcceptedAt) throw new ChatError(ctx.t('chat.gate.rules'), 403)
}
function needStaff(ctx: Ctx) {
  if (ctx.viewer.kind !== 'staff') throw new ChatError(ctx.t('chat.err.notAllowed'), 403)
}
/** Can this viewer see that message? (direct chats: only the member and staff) */
function canSee(ctx: Ctx, room: string) {
  const pair = pmMembers(room)
  if (pair) return !!ctx.viewer.uid && pair.includes(ctx.viewer.uid) // private chats: only the two members
  if (room.startsWith('pm:')) return false
  if (!room.startsWith('dm:')) return true
  return ctx.viewer.kind === 'staff' || room.slice(3) === ctx.viewer.uid
}
async function loadMessage(ctx: Ctx, id: unknown) {
  if (!isObjectId(id)) throw new ChatError(ctx.t('chat.quoteGone'), 404)
  const doc = await ctx.payload.findByID({ collection: 'chat-messages', id, depth: 0, overrideAccess: true, disableErrors: true })
  if (!doc || doc.deleted || !canSee(ctx, String(doc.room))) throw new ChatError(ctx.t('chat.quoteGone'), 404)
  const gid = groupIdOf(String(doc.room))
  if (gid && !(await roomAccess(ctx.payload, ctx.viewer, gid))?.canRead) throw new ChatError(ctx.t('chat.quoteGone'), 404)
  return doc
}

/* ---------- actions ---------- */
type Body = Record<string, unknown>
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '')

/** Checks shared by text and picture messages: who may post, where it goes, slow mode, the quoted message. */
async function prepareSend(ctx: Ctx, b: Body, text: string, opts: { batch?: string; skipSlow?: boolean } = {}) {
  needPoster(ctx)
  const cfg = await chatConfig(ctx.payload)
  if (text) {
    const problem = checkText(ctx, cfg, text)
    if (problem) throw new ChatError(problem)
  }

  // where does it go?
  let room: string
  const dmTo = b.dmTo ? str(b.dmTo, 40) : null
  const pmTo = b.pmTo ? str(b.pmTo, 40) : null
  if (pmTo) {
    // member → member: only inside an accepted private chat
    if (ctx.viewer.kind !== 'member' || !isObjectId(pmTo)) throw new ChatError(ctx.t('chat.err.notAllowed'), 403)
    const pair = await findPair(ctx.payload, ctx.viewer.uid as string, pmTo)
    if (!pair || pair.status !== 'accepted') throw new ChatError(ctx.t('pm.err.notAccepted'), 403)
    room = pmRoom(ctx.viewer.uid as string, pmTo)
  } else if (b.room && groupIdOf(str(b.room, 40))) {
    const gid = groupIdOf(str(b.room, 40)) as string
    const acc = await roomAccess(ctx.payload, ctx.viewer, gid)
    if (!acc) throw new ChatError(ctx.t('chat.err.notAllowed'), 404)
    if (!acc.canPost) throw new ChatError(acc.room.kind === 'channel' && acc.status === 'member' ? ctx.t(acc.room.owner ? 'groups.err.channelOwned' : 'groups.err.channel') : ctx.t('groups.err.join'), 403)
    room = groupRoom(gid)
  } else if (dmTo) {
    if (ctx.viewer.kind === 'member' && dmTo !== ctx.viewer.uid) throw new ChatError(ctx.t('chat.err.notAllowed'), 403)
    if (ctx.viewer.kind === 'staff') {
      if (!isObjectId(dmTo)) throw new ChatError(ctx.t('chat.err.notAllowed'), 400)
      const m = await ctx.payload.findByID({ collection: 'members', id: dmTo, depth: 0, overrideAccess: true, disableErrors: true })
      if (!m) throw new ChatError(ctx.t('chat.err.notAllowed'), 404)
    }
    room = 'dm:' + dmTo
  } else {
    room = str(b.room, 40) || 'lounge'
    if (room === 'lounge' && cfg.loungeTeamOnly && ctx.viewer.kind !== 'staff') throw new ChatError(ctx.t('chat.err.loungeTeam'), 403)
    if (room !== 'lounge') {
      if (!isObjectId(room)) throw new ChatError(ctx.t('chat.err.notAllowed'))
      const match = await ctx.payload.findByID({ collection: 'matches', id: room, depth: 0, overrideAccess: true, disableErrors: true })
      if (!match || !match.active) throw new ChatError(ctx.t('chat.err.notAllowed'), 404)
    }
  }

  // slow mode (members only)
  const uid = ctx.viewer.uid as string
  if (ctx.viewer.kind === 'member' && cfg.slowMs && !room.startsWith('dm:') && !room.startsWith('pm:')) {   // shared rooms only
    // several photos picked together (an album, like WhatsApp) count as one post: the 2nd…10th photo of the same batch, in
    // the same room, within 3 minutes of the first, skip the wait
    const bt = opts.batch ? hub.batches?.get(uid) : undefined
    const inBatch = !!bt && bt.id === opts.batch && bt.room === room && bt.n < ALBUM_MAX && Date.now() - bt.at < 180_000
    const wait = (hub.lastPost.get(uid) || 0) + cfg.slowMs - Date.now()
    if (wait > 0 && !inBatch && !opts.skipSlow) throw new ChatError(ctx.t('rule.slow', { s: Math.ceil(wait / 1000) }), 429)
  }

  // reply: always quote the stored message, never what the browser claims
  let reply: { msgId: string; author?: string; by: string | null; text: string; kind?: 'photo' | 'voice'; thumb?: string; dur?: number } | undefined
  const r = (typeof b.reply === 'string' ? JSON.parse(b.reply || 'null') : b.reply) as Body | null
  if (r && r.id) {
    const q = await loadMessage(ctx, r.id)
    const w = toWire(q)
    reply = { msgId: w.id, by: w.by, text: (w.text || '').slice(0, 140), ...(q.author ? { author: String(q.author) } : {}) }
    // replying to a picture / voice message: remember what it was, so the quote can show a thumbnail or the length
    const imgId = q.image && typeof q.image === 'object' ? String((q.image as { id: string }).id) : q.image ? String(q.image) : null
    const voiceId = q.voice && typeof q.voice === 'object' ? String((q.voice as { id: string }).id) : q.voice ? String(q.voice) : null
    if (imgId) { const im = await ctx.payload.findByID({ collection: 'chat-images', id: imgId, depth: 0, overrideAccess: true, disableErrors: true }); reply.kind = 'photo'; if (im?.thumb) reply.thumb = im.thumb }
    else if (voiceId) { const v = await ctx.payload.findByID({ collection: 'chat-voice', id: voiceId, depth: 0, overrideAccess: true, disableErrors: true }); reply.kind = 'voice'; if (v?.duration) reply.dur = Number(v.duration) }
  }
  return { room, reply, uid }
}

async function createMessage(ctx: Ctx, b: Body, p: Awaited<ReturnType<typeof prepareSend>>, text: string, image?: string, voice?: string, extra: { forwarded?: boolean } = {}) {
  hub.lastPost.set(p.uid, Date.now())
  const doc = await ctx.payload.create({
    collection: 'chat-messages',
    overrideAccess: true,
    data: {
      room: p.room,
      text,
      image,
      voice,
      isMod: ctx.viewer.kind === 'staff',
      ...(extra.forwarded ? { forwarded: true } : {}),
      clientId: str(b.clientId, 40) || undefined,
      ...(ctx.viewer.kind === 'staff' ? { staffAuthor: p.uid } : { author: p.uid }),
      ...(p.reply ? { reply: p.reply } : {}),
    },
  })
  if (ctx.viewer.kind === 'staff') touchStaff(ctx).catch(() => {})
  // notifications for whoever should hear about it and isn't looking (runs in the background)
  pushForMessage(ctx.payload, {
    id: String(doc.id), room: p.room, text, kind: image ? 'photo' : voice ? 'voice' : 'text', replyTo: p.reply?.by || null,
    authorKind: ctx.viewer.kind === 'staff' ? 'staff' : 'member', authorUid: p.uid,
    authorName: (ctx.member?.displayName || ctx.staff?.name || ctx.t('push.team')).slice(0, 40),
  })
  return { id: String(doc.id) }
}

export async function send(ctx: Ctx, b: Body) {
  const text = str(b.text, 5000).trim()
  if (!text) throw new ChatError(ctx.t('chat.sendFailed'))
  const p = await prepareSend(ctx, b, text)
  return createMessage(ctx, b, p, text)
}

/**
 * A picture (+ optional caption), multipart: file, room | dmTo, text, clientId, reply (JSON).
 * Members: only in their own direct chat with the team. Staff: everywhere.
 */
const ALBUM_MAX = 10   // photos picked and sent together
export async function sendImage(ctx: Ctx, form: FormData) {
  const b: Body = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string'))
  const text = str(b.text, 5000).trim()
  const batch = /^[\w-]{4,40}$/.test(String(b.batch || '')) ? String(b.batch) : undefined
  const p = await prepareSend(ctx, b, text, { batch })
  // members: their chat with the team always; private chats when Chat settings → Private chats → Pictures is on; shared rooms with the role right
  if (ctx.viewer.kind !== 'staff' && p.room !== 'dm:' + ctx.viewer.uid) {
    const ok = p.room.startsWith('pm:') ? (await chatConfig(ctx.payload)).pmPictures : ctx.perms.sendPictures
    if (!ok) throw new ChatError(ctx.t(p.room.startsWith('pm:') ? 'chat.err.pmPicturesOff' : 'chat.err.imagesDmOnly'), 403)
  }
  if (roomMedia(await mediaPolicy(ctx.payload), p.room)?.view === 'none') throw new ChatError(ctx.t('chat.err.mediaOff'), 403)   // text-only room
  const file = form.get('file')
  let data: Buffer, thumb = ''
  try {
    if (!(file instanceof File)) throw new AvatarError('missing')
    ;({ data, thumb } = await prepareChatImage(file)) // Payload reads width / height from the file
  } catch (e) {
    if (e instanceof AvatarError) throw new ChatError(ctx.t(e.message === 'tooBig' ? 'chat.err.imageTooBig' : 'auth.err.photoType'))
    throw e
  }
  const img = await ctx.payload.create({
    collection: 'chat-images',
    overrideAccess: true,
    data: { room: p.room, thumb },
    file: { data, mimetype: 'image/webp', name: `chat-${randomBytes(12).toString('hex')}.webp`, size: data.length },
  })
  if (batch && ctx.viewer.uid) {
    const map = (hub.batches ||= new Map()), cur = map.get(ctx.viewer.uid)
    if (cur && cur.id === batch && cur.room === p.room) cur.n++
    else map.set(ctx.viewer.uid, { id: batch, room: p.room, n: 1, at: Date.now() })
  }
  return createMessage(ctx, b, p, text, String(img.id))
}

const VOICE_TYPES: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3' }
export const VOICE_MAX_BYTES = 4 * 1024 * 1024
/**
 * A voice message (multipart: file + duration + peaks, plus the usual room / dmTo / pmTo / reply / clientId).
 * Allowed: the team; a member in their chat with the team or in a private chat; in shared rooms members need the role right
 * "Send pictures & voice messages" — the same rule as pictures.
 */
export async function sendVoice(ctx: Ctx, form: FormData) {
  const b: Body = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string'))
  const p = await prepareSend(ctx, b, '')
  const shared = !p.room.startsWith('dm:') && !p.room.startsWith('pm:')
  if (ctx.viewer.kind !== 'staff' && shared && !ctx.perms.sendPictures) throw new ChatError(ctx.t('chat.err.voiceNotHere'), 403)
  if (ctx.viewer.kind !== 'staff' && p.room.startsWith('pm:') && !(await chatConfig(ctx.payload)).pmVoice) throw new ChatError(ctx.t('chat.err.pmVoiceOff'), 403)   // Chat settings → Private chats
  if (roomMedia(await mediaPolicy(ctx.payload), p.room)?.view === 'none') throw new ChatError(ctx.t('chat.err.mediaOff'), 403)   // text-only room
  const file = form.get('file')
  const type = file instanceof File ? String(file.type || '').split(';')[0].trim().toLowerCase() : ''
  if (!(file instanceof File) || !file.size || !VOICE_TYPES[type]) throw new ChatError(ctx.t('chat.err.voiceType'))
  if (file.size > VOICE_MAX_BYTES) throw new ChatError(ctx.t('chat.err.voiceTooLong'))
  const cfg = await ctx.payload.findGlobal({ slug: 'chat-settings', depth: 0 })
  const max = Number(cfg.voiceMaxSeconds) || 120
  const dur = Math.max(0, Math.min(600, Number(b.duration) || 0))
  if (dur < 0.5) throw new ChatError(ctx.t('chat.err.voiceShort'))
  if (dur > max + 3) throw new ChatError(ctx.t('chat.err.voiceTooLong'))
  let peaks: number[] = []
  try { const a = JSON.parse(String(b.peaks || '[]')); if (Array.isArray(a)) peaks = a.slice(0, 64).map((x) => Math.max(0, Math.min(100, Math.round(Number(x) || 0)))) } catch { /* no waveform */ }
  const data = Buffer.from(await file.arrayBuffer())
  const voice = await ctx.payload.create({
    collection: 'chat-voice', overrideAccess: true,
    data: { room: p.room, duration: Math.round(dur * 10) / 10, peaks },
    file: { data, mimetype: type, name: `voice-${randomBytes(12).toString('hex')}.${VOICE_TYPES[type]}`, size: data.length },
  })
  return createMessage(ctx, b, p, '', undefined, String(voice.id))
}

export async function react(ctx: Ctx, b: Body) {
  needPoster(ctx)
  const key = str(b.key, 20)
  if (!REACTIONS.has(key)) throw new ChatError(ctx.t('chat.reactionFailed'))
  const doc = await loadMessage(ctx, b.id)
  const uid = ctx.viewer.uid as string
  const rx = (doc.reactions && typeof doc.reactions === 'object' ? { ...(doc.reactions as Record<string, Record<string, boolean>>) } : {}) as Record<string, Record<string, boolean>>
  // one reaction per person per message (like WhatsApp): a new one replaces the previous one
  if (b.on) for (const k of Object.keys(rx)) if (k !== key && rx[k] && rx[k][uid]) { const o = { ...rx[k] }; delete o[uid]; rx[k] = o }
  const set = { ...(rx[key] || {}) }
  if (b.on) set[uid] = true
  else delete set[uid]
  rx[key] = set
  await ctx.payload.update({ collection: 'chat-messages', id: doc.id, data: { reactions: rx }, overrideAccess: true })
  return {}
}

export async function report(ctx: Ctx, b: Body) {
  if (!ctx.member) throw new ChatError(ctx.t('chat.signInToJoin'), 401)
  const doc = await loadMessage(ctx, b.id)
  const dup = await ctx.payload.count({ collection: 'chat-reports', where: { and: [{ message: { equals: doc.id } }, { reporter: { equals: ctx.member.id } }] }, overrideAccess: true })
  if (dup.totalDocs) return {}
  await ctx.payload.create({
    collection: 'chat-reports',
    overrideAccess: true,
    data: { message: doc.id, messageText: String(doc.text).slice(0, 500), messageAuthor: doc.author || undefined, room: String(doc.room), reporter: ctx.member.id, reason: 'other', status: 'open' },
  })
  return {}
}

export async function remove(ctx: Ctx, b: Body) {
  const doc = await loadMessage(ctx, b.id)
  const own = ctx.viewer.kind === 'member' && String(doc.author || '') === ctx.viewer.uid
  if (!own) needStaff(ctx)
  await ctx.payload.update({
    collection: 'chat-messages',
    id: doc.id,
    overrideAccess: true,
    data: { deleted: true, deletedBy: ctx.staff ? ctx.staff.email : 'author', deletedAt: new Date().toISOString() },
  })
  return {}
}

export async function mute(ctx: Ctx, b: Body) {
  needStaff(ctx)
  const id = str(b.uid, 40)
  if (!isObjectId(id)) throw new ChatError(ctx.t('chat.muteFailed'))
  await ctx.payload.update({ collection: 'members', id, overrideAccess: true, data: b.on ? { status: 'muted', mutedUntil: null } : { status: 'active', mutedUntil: null } })
  return {}
}

export async function acceptRules(ctx: Ctx) {
  if (!ctx.member) return {}
  if (!ctx.member.rulesAcceptedAt) await ctx.payload.update({ collection: 'members', id: ctx.member.id, overrideAccess: true, data: { rulesAcceptedAt: new Date().toISOString() } })
  return {}
}

export async function presence(ctx: Ctx, b: Body) {
  const room = b.room == null ? null : str(b.room, 40)
  setPresence(str(b.conn, 60), ctx.viewer.uid, { room: room && ROOM_RE.test(room) ? room : null, typing: !!b.typing })
  return {}
}

async function touchStaff(ctx: Ctx) {
  if (!ctx.staff) return
  await ctx.payload.update({ collection: 'users', id: ctx.staff.id, overrideAccess: true, data: { chatLastSeenAt: new Date().toISOString() } })
  broadcast({ type: 'agent', agent: await agentInfo(ctx.payload) })
}

export async function seen(ctx: Ctx) {
  if (ctx.member) await ctx.payload.update({ collection: 'members', id: ctx.member.id, overrideAccess: true, data: { lastSeenAt: new Date().toISOString() } })
  else await touchStaff(ctx)
  return {}
}

/** Staff: the messages of one member's direct chat. */
export async function thread(ctx: Ctx, b: Body) {
  needStaff(ctx)
  const uid = str(b.uid, 40)
  if (!isObjectId(uid)) throw new ChatError(ctx.t('chat.err.notAllowed'))
  const res = await ctx.payload.find({ collection: 'chat-messages', where: { and: [{ room: { equals: 'dm:' + uid } }, { deleted: { not_equals: true } }] }, sort: '-createdAt', limit: PAGE, depth: 0, overrideAccess: true })
  const imgs = await imagesFor(ctx.payload, res.docs)
  const list = res.docs.map((d) => toWire(d, imgs)).reverse()
  return { list, profiles: await profilesFor(ctx.payload, [uid, ...list.map((m) => m.by)]) }
}

/**
 * Older messages of one conversation (scrolling up): the PAGE messages before `before` (ms), newest last, + whether there
 * are more. Same rights as reading it live: a group only if the viewer may read it, a private chat only between its two
 * members, the help chat only for its member / the team; media locked per the room's rule like everywhere else.
 */
export async function history(ctx: Ctx, b: Body) {
  const room = str(b.room, 60), before = Math.floor(Number(b.before) || 0), uid = ctx.viewer.uid
  if (!before) throw new ChatError(ctx.t('chat.err.notAllowed'))
  let stored: string | null = null, lock = false
  const gid = groupIdOf(room)
  if (room === 'support') { if (ctx.viewer.kind === 'member' && uid) stored = 'dm:' + uid }
  else if (room.startsWith('sup:')) { if (ctx.viewer.kind === 'staff' && isObjectId(room.slice(4))) stored = 'dm:' + room.slice(4) }
  else if (room.startsWith('pm:')) {
    const other = room.slice(3)
    if (ctx.viewer.kind === 'member' && uid && isObjectId(other)) { const pair = await findPair(ctx.payload, uid, other); if (pair && pair.status === 'accepted') stored = pmRoom(uid, other) }
  }
  else if (gid) { const acc = await roomAccess(ctx.payload, ctx.viewer, gid); if (acc && acc.canRead) { stored = room; lock = true } }
  else if (room === 'lounge' || /^[a-f0-9]{24}$/i.test(room)) { stored = room; lock = true }   // the lounge, a match room
  if (!stored) throw new ChatError(ctx.t('chat.err.notAllowed'), 403)
  const { docs, more } = await latest(ctx.payload, stored, before)
  const imgs = await imagesFor(ctx.payload, docs)
  let list = docs.map((d) => toWire(d, imgs))
  if (lock) { const policy = await mediaPolicy(ctx.payload), mine = await joinedGroups(ctx.payload, ctx.viewer.kind === 'member' ? uid || null : null); list = list.map((w) => lockWire(w, ctx.viewer, policy, mine)) }
  return { list, more, profiles: await profilesFor(ctx.payload, list.flatMap((m) => [m.by, m.reply?.by])) }
}

export async function profiles(ctx: Ctx, b: Body) {
  const ids = Array.isArray(b.ids) ? b.ids.slice(0, 200) : []
  return { profiles: await profilesFor(ctx.payload, ids as string[]) }
}

/* ---------- accounts (members) ---------- */
const COLORS = ['#E5484D', '#F76B15', '#FFB224', '#46A758', '#12A594', '#0090FF', '#3E63DD', '#8E4EC6', '#D6409F', '#AD7F58']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.'-]{0,22}[\p{L}\p{N}]$/u

/** Username rules: 2–24 letters/numbers (spaces, _ . ' - inside), allowed words, not used by another member or by the team. */
async function checkName(ctx: Ctx, raw: unknown, exceptMember?: string) {
  const name = str(raw, 100).trim().replace(/\s+/g, ' ')
  if (!NAME_RE.test(name)) throw new ChatError(ctx.t('auth.err.username'))
  const cfg = await chatConfig(ctx.payload)
  if (checkText({ ...ctx, viewer: { kind: 'member', uid: null } }, cfg, name)) throw new ChatError(ctx.t('auth.err.nameNotAllowed'))
  const key = name.toLowerCase()
  const taken = await ctx.payload.find({ collection: 'members', where: { nameKey: { equals: key } }, limit: 1, depth: 0, overrideAccess: true, select: {} })
  if (taken.docs.length && String(taken.docs[0].id) !== exceptMember) throw new ChatError(ctx.t('auth.err.nameTaken'), 409)
  // nobody may look like the partner team
  const staff = await ctx.payload.find({ collection: 'users', pagination: false, depth: 0, overrideAccess: true, select: { name: true } })
  const reserved = [cfg.agentName, ...staff.docs.map((u) => u.name)].filter(Boolean).map((n) => String(n).trim().toLowerCase())
  if (reserved.includes(key)) throw new ChatError(ctx.t('auth.err.nameTaken'), 409)
  return name
}

export async function signUp(ctx: Ctx, b: Body) {
  const email = str(b.email, 200).trim().toLowerCase()
  const password = str(b.password, 200)
  const displayName = await checkName(ctx, b.name)
  if (!EMAIL_RE.test(email)) throw new ChatError(ctx.t('auth.err.email'))
  if (password.length < 8) throw new ChatError(ctx.t('auth.err.password'))
  const taken = await ctx.payload.count({ collection: 'members', where: { email: { equals: email } }, overrideAccess: true })
  if (taken.totalDocs) throw new ChatError(ctx.t('auth.err.emailTaken'), 409)
  await ctx.payload.create({
    collection: 'members',
    overrideAccess: false, // public sign-up: field access keeps role / status at their defaults
    // no gradient picked → a random one, straight away
    data: { displayName, email, password, avatarGradient: isGradient(b.gradient) ? b.gradient : randomGradient() },
  })
  const created = await ctx.payload.find({ collection: 'members', where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true })
  if (created.docs[0]) await autoJoin(ctx.payload, String(created.docs[0].id))
  return logIn(ctx, { email, password })
}

/** A member edits their own name / gradient (the photo goes through uploadAvatar). */
export async function updateProfile(ctx: Ctx, b: Body) {
  if (!ctx.member) throw new ChatError(ctx.t('chat.signInToJoin'), 401)
  const data: Partial<Member> = {}
  if (b.name !== undefined) data.displayName = await checkName(ctx, b.name, String(ctx.member.id))
  if (b.gradient !== undefined) {
    if (!isGradient(b.gradient)) throw new ChatError(ctx.t('auth.err.generic'))
    data.avatarGradient = b.gradient
  }
  if (b.removePhoto && ctx.member.avatar) {
    data.avatar = null
    await ctx.payload.update({ collection: 'members', id: ctx.member.id, data, overrideAccess: true })
    await dropMedia(ctx.payload, ctx.member.avatar)
    return {}
  }
  if (Object.keys(data).length) await ctx.payload.update({ collection: 'members', id: ctx.member.id, data, overrideAccess: true })
  return {}
}

/** Profile photo upload (multipart, field "file"). */
export async function uploadAvatar(ctx: Ctx, file: File | null) {
  if (!ctx.member) throw new ChatError(ctx.t('chat.signInToJoin'), 401)
  let id
  try {
    id = await storeAvatar(ctx.payload, file as File, String(ctx.member.id))
  } catch (e) {
    if (e instanceof AvatarError) throw new ChatError(ctx.t(e.message === 'tooBig' ? 'auth.err.photoTooBig' : 'auth.err.photoType'))
    throw e
  }
  const old = ctx.member.avatar
  await ctx.payload.update({ collection: 'members', id: ctx.member.id, data: { avatar: id }, overrideAccess: true })
  if (old) await dropMedia(ctx.payload, old)
  const p = await profilesFor(ctx.payload, [String(ctx.member.id)])
  return { avatarUrl: p[String(ctx.member.id)]?.avatarUrl || null }
}

export async function logIn(ctx: Ctx, b: Body) {
  const email = str(b.email, 200).trim().toLowerCase()
  const password = str(b.password, 200)
  if (!email || !password) throw new ChatError(ctx.t('auth.err.invalid'), 401)
  try {
    const res = await ctx.payload.login({ collection: 'members', data: { email, password } })
    if (!res.token) throw new Error('no token')
    return { token: res.token, name: (res.user as Member).displayName }
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    if (name === 'LockedAuth') throw new ChatError(ctx.t('auth.err.locked'), 429)
    throw new ChatError(ctx.t('auth.err.invalid'), 401)
  }
}


/* ---------- forgot password (approved by the team in the back office, no email needed) ---------- */
const RESET_TTL = 7 * 86400e3 // a request can wait 7 days for the team
const APPROVED_TTL = 2 * 86400e3 // after approval the member has 48 h to pick a new password
const sha = (t: string) => createHash('sha256').update(t).digest('hex')

export async function forgot(ctx: Ctx, b: Body) {
  const email = str(b.email, 200).trim().toLowerCase()
  if (!EMAIL_RE.test(email)) throw new ChatError(ctx.t('auth.err.email'))
  const p = ctx.payload
  const today = await p.count({ collection: 'password-resets', where: { and: [{ kind: { not_equals: 'staff' } }, { email: { equals: email } }, { createdAt: { greater_than: new Date(Date.now() - 86400e3).toISOString() } }] }, overrideAccess: true })
  if (today.totalDocs >= 3) throw new ChatError(ctx.t('auth.err.tooManyRequests'), 429)
  const member = await p.find({ collection: 'members', where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true })
  // an older open request for the same email is replaced by this one
  await p.update({ collection: 'password-resets', where: { and: [{ kind: { not_equals: 'staff' } }, { email: { equals: email } }, { status: { in: ['pending', 'approved'] } }] }, data: { status: 'expired' }, overrideAccess: true })
  const token = randomBytes(32).toString('base64url')
  // same answer whether or not the email has an account (no account lookups from the outside); the team sees the difference
  const doc = await p.create({
    collection: 'password-resets',
    overrideAccess: true,
    data: { kind: 'member', email, member: member.docs[0]?.id, note: str(b.note, 500).trim() || undefined, status: 'pending', tokenHash: sha(token), expiresAt: new Date(Date.now() + RESET_TTL).toISOString() },
  })
  return { id: String(doc.id), token }
}

async function loadReset(ctx: Ctx, b: Body) {
  const id = str(b.id, 40), token = str(b.token, 100)
  if (!isObjectId(id) || !token) throw new ChatError(ctx.t('auth.err.resetInvalid'), 404)
  const doc = await ctx.payload.findByID({ collection: 'password-resets', id, depth: 0, overrideAccess: true, showHiddenFields: true, disableErrors: true })
  const a = Buffer.from(sha(token)), h = Buffer.from(String(doc?.tokenHash || ''))
  if (!doc || doc.kind === 'staff' || a.length !== h.length || !timingSafeEqual(a, h)) throw new ChatError(ctx.t('auth.err.resetInvalid'), 404)
  type St = 'pending' | 'approved' | 'denied' | 'done' | 'expired'
  let status = (doc.status || 'pending') as St
  const expired = status === 'pending' ? Date.parse(doc.expiresAt) < Date.now() : status === 'approved' ? Date.parse(doc.decidedAt || '') + APPROVED_TTL < Date.now() : false
  if (expired || (status === 'approved' && !doc.member)) {
    status = 'expired'
    await ctx.payload.update({ collection: 'password-resets', id, data: { status }, overrideAccess: true })
  }
  return { doc, status }
}

/** The member's browser asks how its request is going: pending | approved | denied | done | expired. */
export async function resetStatus(ctx: Ctx, b: Body) {
  const { doc, status } = await loadReset(ctx, b)
  return { status, email: doc.email }
}

/** Approved request → set the new password, unlock the account and sign in. */
export async function resetPassword(ctx: Ctx, b: Body) {
  const { doc, status } = await loadReset(ctx, b)
  if (status !== 'approved' || !doc.member) throw new ChatError(ctx.t('auth.err.resetInvalid'), 403)
  const password = str(b.password, 200)
  if (password.length < 8) throw new ChatError(ctx.t('auth.err.password'))
  const memberId = typeof doc.member === 'object' ? doc.member.id : doc.member
  const m = await ctx.payload.update({ collection: 'members', id: memberId, data: { password }, overrideAccess: true })
  try {
    await ctx.payload.unlock({ collection: 'members', data: { email: m.email } as never, overrideAccess: true })
  } catch {}
  await ctx.payload.update({ collection: 'password-resets', id: doc.id, data: { status: 'done' }, overrideAccess: true })
  return logIn(ctx, { email: m.email, password })
}

/* ---------- people: search, chat requests (member → member, consent first) ---------- */
const PM_PENDING_MAX = 10 // open requests a member may have waiting at once
const PM_DAY_MAX = 20 // requests a member may send per 24 h
const PM_RETRY_MS = 7 * 86400e3 // after a decline, wait a week before asking the same person again

/** Find members by username (signed-in viewers only). */
export async function people(ctx: Ctx, b: Body) {
  if (!ctx.viewer.uid) throw new ChatError(ctx.t('chat.signInToJoin'), 401)
  const q = str(b.q, 40).trim().toLowerCase()
  if (q.length < 2) return { people: [] }
  const res = await ctx.payload.find({
    collection: 'members',
    where: { and: [{ nameKey: { like: q } }, { status: { not_equals: 'banned' } }, { id: { not_equals: ctx.viewer.uid } }] },
    limit: 20,
    depth: 0,
    overrideAccess: true,
    select: { displayName: true },
  })
  const ids = res.docs.map((m) => String(m.id))
  const profs = await profilesFor(ctx.payload, ids)
  return { people: ids.map((uid) => ({ uid, ...profs[uid] })), profiles: profs }
}

export async function chatRequest(ctx: Ctx, b: Body) {
  needPoster(ctx)
  if (ctx.viewer.kind !== 'member') throw new ChatError(ctx.t('pm.err.staff'), 403)
  if (!ctx.perms.privateChats) throw new ChatError(ctx.t('roles.err.noPrivateChats'), 403)
  const me = ctx.viewer.uid as string
  const to = str(b.to, 40)
  if (!isObjectId(to) || to === me) throw new ChatError(ctx.t('chat.err.notAllowed'))
  const target = await ctx.payload.findByID({ collection: 'members', id: to, depth: 0, overrideAccess: true, disableErrors: true })
  if (!target || target.status === 'banned') throw new ChatError(ctx.t('pm.err.unavailable'), 404)
  const note = str(b.note, 140).trim()
  if (note) {
    const problem = checkText(ctx, await chatConfig(ctx.payload), note)
    if (problem) throw new ChatError(problem)
  }
  const pair = await findPair(ctx.payload, me, to)
  if (pair) {
    if (pair.status === 'accepted') return { status: 'accepted' }
    if (pair.status === 'blocked') throw new ChatError(ctx.t('pm.err.unavailable'), 403)
    if (pair.status === 'pending') {
      // they already asked me: asking back = accepting
      if (String(pair.to) === me) { await ctx.payload.update({ collection: 'chat-requests', id: pair.id, data: { status: 'accepted', respondedAt: new Date().toISOString() }, overrideAccess: true }); return { status: 'accepted' } }
      return { status: 'pending-out' }
    }
    if (pair.status === 'declined' && String(pair.from) === me && Date.parse(pair.respondedAt || pair.updatedAt) + PM_RETRY_MS > Date.now()) throw new ChatError(ctx.t('pm.err.tooSoon'), 429)
  }
  const [open, today] = await Promise.all([
    ctx.payload.count({ collection: 'chat-requests', where: { and: [{ from: { equals: me } }, { status: { equals: 'pending' } }] }, overrideAccess: true }),
    ctx.payload.count({ collection: 'chat-requests', where: { and: [{ from: { equals: me } }, { updatedAt: { greater_than: new Date(Date.now() - 86400e3).toISOString() } }] }, overrideAccess: true }),
  ])
  if (open.totalDocs >= PM_PENDING_MAX || today.totalDocs >= PM_DAY_MAX) throw new ChatError(ctx.t('pm.err.tooMany'), 429)
  // what they chose (in the chat): ask first → a request · anyone → the chat opens at once · nobody → no new private chats
  const policy = target.pmPolicy || 'request'
  if (policy === 'nobody') throw new ChatError(ctx.t('pm.err.closed'), 403)
  const direct = policy === 'everyone'
  const data = { from: me, to, status: (direct ? 'accepted' : 'pending') as 'accepted' | 'pending', note: note || null, blockedBy: null, respondedAt: direct ? new Date().toISOString() : null }
  if (pair) await ctx.payload.update({ collection: 'chat-requests', id: pair.id, data, overrideAccess: true })
  else await ctx.payload.create({ collection: 'chat-requests', data: { ...data, pairKey: pairKey(me, to) }, overrideAccess: true })
  return { status: direct ? 'accepted' : 'pending-out' }
}

/** accept | decline | block (incoming request or an open chat) | cancel (my own request) | unblock. */
export async function chatRespond(ctx: Ctx, b: Body) {
  if (ctx.viewer.kind !== 'member') throw new ChatError(ctx.t('chat.err.notAllowed'), 403)
  const me = ctx.viewer.uid as string
  const other = str(b.uid, 40)
  const action = str(b.action, 10)
  if (!isObjectId(other)) throw new ChatError(ctx.t('chat.err.notAllowed'))
  const pair = await findPair(ctx.payload, me, other)
  if (!pair) throw new ChatError(ctx.t('pm.err.gone'), 404)
  const incoming = String(pair.to) === me
  const now = new Date().toISOString()
  const set = (data: Record<string, unknown>) => ctx.payload.update({ collection: 'chat-requests', id: pair.id, data, overrideAccess: true })
  if (action === 'accept' && pair.status === 'pending' && incoming) await set({ status: 'accepted', respondedAt: now })
  else if (action === 'decline' && pair.status === 'pending' && incoming) await set({ status: 'declined', respondedAt: now })
  else if (action === 'cancel' && pair.status === 'pending' && !incoming) await ctx.payload.delete({ collection: 'chat-requests', id: pair.id, overrideAccess: true })
  else if (action === 'block' && pair.status !== 'blocked') await set({ status: 'blocked', blockedBy: me, respondedAt: now })
  else if (action === 'unblock' && pair.status === 'blocked' && String(pair.blockedBy) === me) await ctx.payload.delete({ collection: 'chat-requests', id: pair.id, overrideAccess: true })
  else throw new ChatError(ctx.t('pm.err.gone'), 409)
  return {}
}

export { relView }

/* ---------- groups & channels ---------- */
/** Rooms this viewer sees + recent messages of the ones they can read (skipping rooms the browser already has). */
async function groupsWithMessages(ctx: Ctx, have: string[]) {
  const groups = await roomsFor(ctx.payload, ctx.viewer)
  const policy = await mediaPolicy(ctx.payload), mine = new Set(groups.filter((g) => g.status === 'member').map((g) => g.id))
  const gMsgs: Record<string, ReturnType<typeof toWire>[]> = {}
  await Promise.all(groups.filter((g) => g.canRead && !have.includes(g.id)).slice(0, 30).map(async (g) => {
    const res = await ctx.payload.find({ collection: 'chat-messages', where: { and: [{ room: { equals: groupRoom(g.id) } }, { deleted: { not_equals: true } }] }, sort: '-createdAt', limit: PAGE, depth: 0, overrideAccess: true })
    const imgs = await imagesFor(ctx.payload, res.docs)
    gMsgs[g.id] = res.docs.map((d) => lockWire(toWire(d, imgs), ctx.viewer, policy, mine)).reverse()
  }))
  return { groups, gMsgs }
}

/** The browser asks again after a 'groups' event (a room or a membership changed). */
export async function groups(ctx: Ctx, b: Body) {
  const have = Array.isArray(b.have) ? (b.have as unknown[]).map(String).slice(0, 200) : []
  const r = await groupsWithMessages(ctx, have)
  const ids = Object.values(r.gMsgs).flat().flatMap((m) => [m.by, m.reply?.by])
  return { ...r, profiles: await profilesFor(ctx.payload, ids) }
}

/** join: open → member · request → asks the team · invited → accepts the invite. */
export async function groupJoin(ctx: Ctx, b: Body) {
  needPoster(ctx)
  if (ctx.viewer.kind !== 'member') return {}
  const acc = await roomAccess(ctx.payload, ctx.viewer, str(b.id, 40))
  if (!acc) throw new ChatError(ctx.t('chat.err.notAllowed'), 404)
  if (acc.status === 'member') return { status: 'member' }
  const next = acc.room.join === 'open' || acc.status === 'invited' ? 'member' : acc.room.join === 'request' ? 'requested' : null
  if (!next) throw new ChatError(ctx.t('groups.err.inviteOnly'), 403)
  await setMembership(ctx.payload, String(acc.room.id), ctx.viewer.uid as string, next)
  return { status: next }
}

/** leave the room / cancel my request / decline an invite. */
export async function groupLeave(ctx: Ctx, b: Body) {
  if (ctx.viewer.kind !== 'member') return {}
  const id = str(b.id, 40)
  if (!isObjectId(id)) throw new ChatError(ctx.t('chat.err.notAllowed'))
  await setMembership(ctx.payload, id, ctx.viewer.uid as string, null)
  return {}
}

/** Add a new account to every room with "auto-add new members". */
export async function autoJoin(payload: Payload, memberId: string) {
  const rooms = await payload.find({ collection: 'chat-rooms', where: { and: [{ autoAdd: { equals: true } }, { active: { equals: true } }] }, pagination: false, depth: 0, overrideAccess: true })
  for (const r of rooms.docs) await setMembership(payload, String(r.id), memberId, 'member')
}

/* ---------- rooms made by members (rights come from their role) ---------- */
const JOINS = ['open', 'request', 'invite']
async function adminOf(ctx: Ctx, id: unknown, ownerOnly = false) {
  const acc = await roomAccess(ctx.payload, ctx.viewer, str(id, 40))
  if (!acc || !(ownerOnly ? acc.isOwner || ctx.viewer.kind === 'staff' : acc.isAdmin)) throw new ChatError(ctx.t('chat.err.notAllowed'), 403)
  return acc
}
async function roomFields(ctx: Ctx, b: Body, kindAllowed: (k: string) => boolean) {
  const cfg = await chatConfig(ctx.payload)
  const name = str(b.name, 100).trim().replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > 60) throw new ChatError(ctx.t('rooms.err.name'))
  for (const t of [name, str(b.description, 300), str(b.rules, 1000)]) { const bad = t && checkText(ctx, cfg, t); if (bad) throw new ChatError(bad) }
  const kind = b.kind === 'channel' ? 'channel' : 'group'
  if (!kindAllowed(kind)) throw new ChatError(ctx.t('rooms.err.kind'), 403)
  const join = JOINS.includes(String(b.join)) ? String(b.join) : 'open'
  const visibility = b.visibility === 'members' || b.visibility === 'hidden' ? b.visibility : 'public'
  const gradient = isGradient(b.gradient) ? { gradient: b.gradient } : {}
  return { name, description: str(b.description, 300).trim(), rules: str(b.rules, 1000).trim(), kind: kind as 'group' | 'channel', join: join as 'open' | 'request' | 'invite', visibility: visibility as 'public' | 'members' | 'hidden', preview: b.preview === true || b.preview === 'true', allowForward: !(b.forward === false || b.forward === 'false'), ...gradient }   // (forwarding: on unless turned off)
}

export async function roomCreate(ctx: Ctx, b: Body) {
  needPoster(ctx)
  const p = ctx.perms
  if (!p.createGroups && !p.createChannels) throw new ChatError(ctx.t('rooms.err.noRight'), 403)
  const data = await roomFields(ctx, b, (k) => (k === 'channel' ? p.createChannels : p.createGroups))
  let owner: string | undefined
  if (ctx.viewer.kind === 'member') {
    owner = ctx.viewer.uid as string
    const owned = await ctx.payload.count({ collection: 'chat-rooms', where: { and: [{ owner: { equals: owner } }, { active: { equals: true } }] }, overrideAccess: true })
    if (owned.totalDocs >= p.maxRooms) throw new ChatError(ctx.t('rooms.err.max', { n: p.maxRooms }), 429)
  }
  const room = await ctx.payload.create({
    collection: 'chat-rooms', overrideAccess: true,
    data: { ...data, autoAdd: false, active: true, order: 100, ...(owner ? { owner } : { createdBy: ctx.staff?.id }) },
  })
  if (owner) { await setMembership(ctx.payload, String(room.id), owner, 'member'); await setRoomAdmin(ctx.payload, String(room.id), owner, true) }
  return { id: String(room.id) }
}

export async function roomUpdate(ctx: Ctx, b: Body) {
  const acc = await adminOf(ctx, b.id)
  const p = ctx.perms, staff = ctx.viewer.kind === 'staff'
  // changing group ↔ channel needs the right for the new kind
  const data = await roomFields(ctx, b, (k) => staff || k === acc.room.kind || (k === 'channel' ? p.createChannels : p.createGroups))
  await ctx.payload.update({ collection: 'chat-rooms', id: acc.room.id, data, overrideAccess: true })
  return {}
}

/** archive (hidden, history kept) or delete (room + members + messages). Owner (or the team) only. */
export async function roomRemove(ctx: Ctx, b: Body) {
  const acc = await adminOf(ctx, b.id, true)
  const id = String(acc.room.id)
  if (b.mode === 'delete') {
    await ctx.payload.delete({ collection: 'chat-room-members', where: { room: { equals: id } }, overrideAccess: true })
    await ctx.payload.delete({ collection: 'chat-messages', where: { room: { equals: groupRoom(id) } }, overrideAccess: true })
    await shredRoom(ctx.payload, groupRoom(id))   // its conversation key goes too: nothing of it can ever be read again
    await ctx.payload.delete({ collection: 'chat-rooms', id, overrideAccess: true })
  } else await ctx.payload.update({ collection: 'chat-rooms', id, data: { active: false }, overrideAccess: true })
  return {}
}

/** Members of a room, for its admins (members, waiting, invited; who is admin; who owns it). */
export async function roomMembers(ctx: Ctx, b: Body) {
  const acc = await adminOf(ctx, b.id)
  const res = await ctx.payload.find({ collection: 'chat-room-members', where: { room: { equals: acc.room.id } }, sort: '-updatedAt', pagination: false, depth: 0, overrideAccess: true })
  const owner = acc.room.owner ? String(typeof acc.room.owner === 'object' ? acc.room.owner.id : acc.room.owner) : null
  const list: { uid: string; status: string; admin: boolean; owner: boolean; team?: boolean }[] = res.docs.map((d) => ({ uid: String(d.member), status: d.status, admin: !!d.admin, owner: String(d.member) === owner }))
  // a room made by the team: its creator (a back-office account) is shown as the owner, first in the list
  const creator = teamCreatorOf(acc.room)
  const profiles = await profilesFor(ctx.payload, [...list.map((x) => x.uid), ...(creator ? [creator] : [])])
  if (creator && profiles[creator]) list.unshift({ uid: creator, status: 'member', admin: true, owner: true, team: true })
  return { list, owner: owner || creator, profiles }
}

/**
 * Group info for anyone who may see the room (members, people invited, and — for open / ask-to-join rooms — anyone):
 * name, description, rules, how to join, and the members with their role. Pending requests / invites stay admin-only.
 */
export async function roomInfo(ctx: Ctx, b: Body) {
  const acc = await roomAccess(ctx.payload, ctx.viewer, str(b.id, 40))
  if (!acc) throw new ChatError(ctx.t('chat.err.notAllowed'), 404)
  const r = acc.room, id = String(r.id)
  const owner = r.owner ? String(typeof r.owner === 'object' ? r.owner.id : r.owner) : null, creator = teamCreatorOf(r)
  const res = await ctx.payload.find({ collection: 'chat-room-members', where: { and: [{ room: { equals: id } }, { status: { equals: 'member' } }] }, sort: 'createdAt', pagination: false, depth: 0, overrideAccess: true })
  type Row = { uid: string; role: 'owner' | 'admin' | 'member'; team?: boolean }
  const list: Row[] = res.docs.map((d) => { const uid = String(d.member); return { uid, role: uid === owner ? 'owner' : d.admin ? 'admin' : 'member' } })
  const profiles = await profilesFor(ctx.payload, [...list.map((x) => x.uid), ...(creator ? [creator] : [])])
  if (creator && profiles[creator]) list.unshift({ uid: creator, role: 'owner', team: true })
  const rank = { owner: 0, admin: 1, member: 2 }
  list.sort((a, c) => rank[a.role] - rank[c.role])
  return {
    id, name: r.name, description: r.description || '', rules: r.rules || '', kind: r.kind || 'group', join: r.join || 'open',
    createdAt: r.createdAt, members: list.filter((x) => profiles[x.uid]), profiles,
  }
}

/** The room's picture (owner / admins / the team): a photo (multipart "file", square-cropped), or "remove" = back to its colours. */
export async function roomPhoto(ctx: Ctx, form: FormData) {
  const acc = await adminOf(ctx, String(form.get('id') || ''))
  const id = String(acc.room.id), old = acc.room.photo
  if (form.get('remove')) {
    await ctx.payload.update({ collection: 'chat-rooms', id, data: { photo: null }, overrideAccess: true })
    if (old) await dropMedia(ctx.payload, old)
    return { photo: null }
  }
  const file = form.get('file')
  let mid
  try { mid = await storeAvatar(ctx.payload, file instanceof File ? file : (null as unknown as File), 'room-' + id) }
  catch (e) { if (e instanceof AvatarError) throw new ChatError(ctx.t(e.message === 'tooBig' ? 'auth.err.photoTooBig' : 'auth.err.photoType')); throw e }
  await ctx.payload.update({ collection: 'chat-rooms', id, data: { photo: mid }, overrideAccess: true })
  if (old) await dropMedia(ctx.payload, old)
  const m = await ctx.payload.findByID({ collection: 'media', id: mid, depth: 0, overrideAccess: true })
  return { photo: m.url || null }
}

/** The room's colours (shown when it has no photo). */
export async function roomColor(ctx: Ctx, b: Body) {
  const acc = await adminOf(ctx, b.id)
  if (!isGradient(b.gradient)) throw new ChatError(ctx.t('chat.err.notAllowed'))
  await ctx.payload.update({ collection: 'chat-rooms', id: acc.room.id, data: { gradient: b.gradient }, overrideAccess: true })
  return {}
}

/** invite · accept · decline · remove · admin · unadmin (admin rights: owner / the team only). */
export async function roomMember(ctx: Ctx, b: Body) {
  const action = str(b.action, 12), uid = str(b.uid, 40)
  const acc = await adminOf(ctx, b.id, action === 'admin' || action === 'unadmin')
  if (!isObjectId(uid)) throw new ChatError(ctx.t('chat.err.notAllowed'))
  const id = String(acc.room.id), owner = acc.room.owner ? String(typeof acc.room.owner === 'object' ? acc.room.owner.id : acc.room.owner) : null
  if (uid === owner && action !== 'invite') throw new ChatError(ctx.t('rooms.err.owner'), 403)
  if (action === 'invite') {
    const target = await ctx.payload.findByID({ collection: 'members', id: uid, depth: 0, overrideAccess: true, disableErrors: true })
    if (!target || target.status === 'banned') throw new ChatError(ctx.t('pm.err.unavailable'), 404)
    const cur = (await roomAccess(ctx.payload, { kind: 'member', uid }, id))?.status
    if (cur !== 'member') await setMembership(ctx.payload, id, uid, cur === 'requested' ? 'member' : 'invited')
  } else if (action === 'accept') await setMembership(ctx.payload, id, uid, 'member')
  else if (action === 'decline' || action === 'remove') await setMembership(ctx.payload, id, uid, null)
  else if (action === 'admin' || action === 'unadmin') { if (!(await setRoomAdmin(ctx.payload, id, uid, action === 'admin'))) throw new ChatError(ctx.t('rooms.err.notMember')) }
  else throw new ChatError(ctx.t('chat.err.notAllowed'))
  return {}
}

/* ---------- delivery / read receipts (one-to-one chats only) ---------- */
type Receipt = { room: string; reader: string; delivered: number; read: number }
const asReceipt = (d: { room: string; reader: string; delivered?: number | null; read?: number | null }): Receipt => ({ room: d.room, reader: d.reader, delivered: d.delivered || 0, read: d.read || 0 })

/** The stored room and the reader name for a browser room id, or null when it is not a one-to-one chat of this viewer. */
async function receiptTarget(ctx: Ctx, room: string): Promise<{ room: string; reader: string; other: string[]; group?: string } | null> {
  const uid = ctx.viewer.uid
  if (!uid) return null
  // groups & channels: only their members leave receipts (not visitors of an open group, not the team)
  const gid = groupIdOf(room)
  if (gid) {
    const acc = await roomAccess(ctx.payload, ctx.viewer, gid)
    if (!acc) return null
    // members; and the team account that made a team room (it is part of it). Other team accounts don't count.
    const inIt = ctx.viewer.kind === 'member' ? acc.status === 'member' : teamCreatorOf(acc.room) === uid
    return inIt ? { room, reader: uid, other: [], group: gid } : null
  }
  if (ctx.viewer.kind === 'member') {
    if (room === 'support') return { room: 'dm:' + uid, reader: uid, other: ['team'] }
    if (room.startsWith('pm:') && isObjectId(room.slice(3)) && room.slice(3) !== uid) return { room: pmRoom(uid, room.slice(3)), reader: uid, other: [room.slice(3)] }
    return null
  }
  if (ctx.viewer.kind === 'staff' && room.startsWith('sup:') && isObjectId(room.slice(4))) return { room: 'dm:' + room.slice(4), reader: 'team', other: [room.slice(4)] }
  return null
}

/** What the OTHER side has received / seen in this viewer's one-to-one chats (for the ticks on their own messages). */
async function receiptsFor(ctx: Ctx): Promise<Receipt[]> {
  const uid = ctx.viewer.uid
  if (!uid) return []
  const where = ctx.viewer.kind === 'staff'
    ? { and: [{ room: { like: 'dm:' } }, { reader: { not_equals: 'team' } }] }
    : { or: [{ and: [{ room: { equals: 'dm:' + uid } }, { reader: { equals: 'team' } }] }, { and: [{ room: { like: uid } }, { room: { like: 'pm:' } }, { reader: { not_equals: uid } }] }] }
  const res = await ctx.payload.find({ collection: 'chat-receipts', where: where as never, sort: '-updatedAt', limit: 500, depth: 0, overrideAccess: true })
  const out = res.docs.map(asReceipt)
  // groups & channels this viewer belongs to (the team: all of them): the current members' positions
  const rooms = await ctx.payload.find({ collection: 'chat-rooms', where: { active: { equals: true } }, pagination: false, depth: 0, overrideAccess: true, select: { name: true } })
  for (const r of rooms.docs) {
    const gid = String(r.id), members = await participantUids(ctx.payload, gid)
    if (ctx.viewer.kind !== 'staff' && !members.includes(uid)) continue
    const g = await ctx.payload.find({ collection: 'chat-receipts', where: { and: [{ room: { equals: groupRoom(gid) } }, { reader: { in: members.filter((m) => m !== uid) } }] }, pagination: false, depth: 0, overrideAccess: true })
    out.push(...g.docs.map(asReceipt))
  }
  return out
}

/**
 * The viewer's device RECEIVED (kind 'delivered') or SAW (kind 'read') a one-to-one chat up to message time `ts`.
 * Batched: { items: [{ room, kind, ts }] }. Positions only move forward; read implies delivered. The other side is told live.
 */
export async function receipt(ctx: Ctx, b: Body) {
  const items = Array.isArray(b.items) ? (b.items as Body[]).slice(0, 50) : [b]
  const now = Date.now() + 5000
  for (const it of items) {
    const kind = it.kind === 'read' ? 'read' : 'delivered', ts = Math.min(now, Math.floor(Number(it.ts) || 0))
    const t = await receiptTarget(ctx, str(it.room, 40))
    if (!t || ts <= 0) continue
    if (t.room.startsWith('pm:')) { const pair = await findPair(ctx.payload, ctx.viewer.uid as string, t.other[0]); if (!pair || pair.status !== 'accepted') continue }
    const key = t.room + '|' + t.reader
    const found = await ctx.payload.find({ collection: 'chat-receipts', where: { key: { equals: key } }, limit: 1, depth: 0, overrideAccess: true })
    const cur = found.docs[0]
    const delivered = Math.max(cur?.delivered || 0, ts), read = kind === 'read' ? Math.max(cur?.read || 0, ts) : cur?.read || 0
    if (cur && delivered === (cur.delivered || 0) && read === (cur.read || 0)) continue
    const doc = cur
      ? await ctx.payload.update({ collection: 'chat-receipts', id: cur.id, data: { delivered, read }, overrideAccess: true })
      : await ctx.payload.create({ collection: 'chat-receipts', data: { key, room: t.room, reader: t.reader, delivered, read }, overrideAccess: true })
    const ev = { type: 'receipt' as const, receipt: asReceipt(doc as never) }
    // tell the other side (the two members of a private chat; the member + the team for a direct chat; a group's members + the team)
    if (t.group) { const ms = new Set(await participantUids(ctx.payload, t.group)); broadcast(ev as never, (c) => c.viewer.kind === 'staff' || (!!c.viewer.uid && ms.has(c.viewer.uid))) }
    else if (t.room.startsWith('pm:')) broadcast(ev as never, (c) => c.viewer.uid === t.other[0])
    else if (t.reader === 'team') broadcast(ev as never, (c) => c.viewer.uid === t.other[0])
    else broadcast(ev as never, (c) => c.viewer.kind === 'staff')
  }
  return {}
}

/* ---------- personal stickers (only their owner sees them; stickers for everyone: back office → Stickers) ---------- */
const MAX_OWN_STICKERS = 60
const needUid = (ctx: Ctx) => { if (!ctx.viewer.uid) throw new ChatError(ctx.t('chat.signInToJoin'), 401); return ctx.viewer.uid }
export async function myStickers(ctx: Ctx) {
  const uid = needUid(ctx)
  const res = await ctx.payload.find({ collection: 'member-stickers', where: { owner: { equals: uid } }, sort: '-createdAt', limit: MAX_OWN_STICKERS, depth: 0, overrideAccess: true })
  return { stickers: res.docs.filter((d) => d.url).map((d) => ({ id: String(d.id), url: d.url as string })) }
}
export async function addSticker(ctx: Ctx, form: FormData) {
  const uid = needUid(ctx)
  const n = await ctx.payload.count({ collection: 'member-stickers', where: { owner: { equals: uid } }, overrideAccess: true })
  if (n.totalDocs >= MAX_OWN_STICKERS) throw new ChatError(ctx.t('pe.err.tooManyStickers', { n: MAX_OWN_STICKERS }), 429)
  const file = form.get('file')
  let data: Buffer
  try {
    if (!(file instanceof File)) throw new AvatarError('missing')
    ;({ data } = await prepareSticker(file))
  } catch (e) {
    if (e instanceof AvatarError) throw new ChatError(ctx.t(e.message === 'tooBig' ? 'chat.err.imageTooBig' : 'auth.err.photoType'))
    throw e
  }
  const doc = await ctx.payload.create({ collection: 'member-stickers', overrideAccess: true, data: { owner: uid }, file: { data, mimetype: 'image/webp', name: `my-sticker-${randomBytes(10).toString('hex')}.webp`, size: data.length } })
  return { sticker: { id: String(doc.id), url: doc.url as string } }
}
export async function removeSticker(ctx: Ctx, b: Body) {
  const uid = needUid(ctx), id = str(b.id, 40)
  if (!isObjectId(id)) throw new ChatError(ctx.t('chat.err.notAllowed'))
  const d = await ctx.payload.findByID({ collection: 'member-stickers', id, depth: 0, overrideAccess: true, disableErrors: true })
  if (!d || d.owner !== uid) throw new ChatError(ctx.t('chat.err.notAllowed'), 403)
  await ctx.payload.delete({ collection: 'member-stickers', id, overrideAccess: true })
  return {}
}

/* ---------- invite links for groups & channels: /<locale>/chat/join-<token> ---------- */
const newInviteToken = () => randomBytes(9).toString('base64url')
/** Owners / co-admins / the team: the room's invite link token (action peek · get (creates) · reset = new link, old one stops · off = no link). */
export async function roomInvite(ctx: Ctx, b: Body) {
  const acc = await adminOf(ctx, b.id)
  const action = str(b.action, 8) || 'get'
  let token = (acc.room as { inviteToken?: string | null }).inviteToken || null
  if (action === 'peek') return { token }   // just look (the members tab), never create
  if (action === 'off') token = null
  else if (action === 'reset' || !token) token = newInviteToken()
  if (token !== ((acc.room as { inviteToken?: string | null }).inviteToken || null)) await ctx.payload.update({ collection: 'chat-rooms', id: acc.room.id, data: { inviteToken: token }, overrideAccess: true })
  return { token }
}
/** Join a group / channel with its invite link (signed-in members). */
export async function roomJoinLink(ctx: Ctx, b: Body) {
  if (ctx.viewer.kind === 'staff') { /* the team reads every room already */ }
  else if (ctx.viewer.kind !== 'member') throw new ChatError(ctx.t('chat.signInToJoin'), 401)
  const token = str(b.token, 40)
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) throw new ChatError(ctx.t('rooms.err.badLink'), 404)
  const found = await ctx.payload.find({ collection: 'chat-rooms', where: { and: [{ inviteToken: { equals: token } }, { active: { equals: true } }] }, limit: 1, depth: 0, overrideAccess: true })
  const room = found.docs[0]
  if (!room) throw new ChatError(ctx.t('rooms.err.badLink'), 404)
  if (ctx.viewer.kind === 'member') {
    if (ctx.member?.status === 'banned') throw new ChatError(ctx.t('chat.gate.readOnly'), 403)
    await setMembership(ctx.payload, String(room.id), ctx.viewer.uid as string, 'member')
  }
  return { id: String(room.id), name: room.name }
}

/* ---------- notifications (Web Push, see src/chat/push.ts) ---------- */
function pushOwner(ctx: Ctx) {
  if (!ctx.viewer.uid || ctx.viewer.kind === 'anon') throw new ChatError(ctx.t('chat.signInToJoin'), 401)
  return { kind: ctx.viewer.kind as 'member' | 'staff', uid: ctx.viewer.uid }
}
/** This device wants notifications: keep its subscription (one row per device; a device that changed account moves over). */
export async function pushSubscribe(ctx: Ctx, b: Body) {
  const o = pushOwner(ctx)
  if (!pushPublicKey()) throw new ChatError(ctx.t('push.err.off'), 503)
  const sub = (b.sub || {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  const endpoint = str(sub.endpoint, 1000), p256dh = str(sub.keys?.p256dh, 200), auth = str(sub.keys?.auth, 100)
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) throw new ChatError(ctx.t('push.err.failed'))
  const locale = str(b.locale, 10) || 'en'
  const found = await ctx.payload.find({ collection: 'push-subscriptions', where: { endpoint: { equals: endpoint } }, limit: 1, depth: 0, overrideAccess: true })
  const data = { kind: o.kind, uid: o.uid, endpoint, p256dh, auth, locale }
  if (found.docs[0]) await ctx.payload.update({ collection: 'push-subscriptions', id: found.docs[0].id, data, overrideAccess: true })
  else await ctx.payload.create({ collection: 'push-subscriptions', data, overrideAccess: true })
  return {}
}
/** This device stops (turned off, or signing out): forget it. */
export async function pushUnsubscribe(ctx: Ctx, b: Body) {
  const endpoint = str(b.endpoint, 1000)
  if (endpoint) await ctx.payload.delete({ collection: 'push-subscriptions', where: { endpoint: { equals: endpoint } }, overrideAccess: true })
  return {}
}
/** Read / change my notification settings: message text on the lock screen, muted groups. */
export async function pushPrefs(ctx: Ctx, b: Body) {
  const o = pushOwner(ctx), collection = o.kind === 'member' ? 'members' : 'users'
  const me = (await ctx.payload.findByID({ collection, id: o.uid, depth: 0, overrideAccess: true, select: { pushPreview: true, pushMuted: true } })) as { pushPreview?: boolean | null; pushMuted?: unknown }
  let preview = me.pushPreview !== false, muted = Array.isArray(me.pushMuted) ? (me.pushMuted as string[]).filter((r) => typeof r === 'string') : []
  let changed = false
  if (typeof b.preview === 'boolean') { preview = b.preview; changed = true }
  const mute = b.mute as { room?: unknown; on?: unknown } | undefined
  if (mute && typeof mute.room === 'string' && groupIdOf(mute.room)) {
    muted = muted.filter((r) => r !== mute.room); if (mute.on) muted.push(mute.room)
    muted = muted.slice(-200); changed = true
  }
  if (changed) await ctx.payload.update({ collection, id: o.uid, data: { pushPreview: preview, pushMuted: muted }, overrideAccess: true })
  return { preview, muted }
}

/* ---------- forwarding ---------- */
const FORWARD_MAX = 5
/** A chat as the browser names it → the fields a send takes ('pm:<uid>' → pmTo, 'support' → my chat with the team…). */
function targetBody(ctx: Ctx, to: string): Body {
  if (to.startsWith('pm:')) return { pmTo: to.slice(3) }
  if (to === 'support') return { dmTo: ctx.viewer.uid }
  if (to.startsWith('sup:')) return { dmTo: to.slice(4) }
  return { room: to }
}
/** Fetch a chat file as the person forwarding it (the file's own access rule applies). */
async function fileBytes(ctx: Ctx, url: string) {
  const r = await fetch(new URL(url, `http://127.0.0.1:${process.env.PORT || 3000}`), { headers: ctx.cookie ? { cookie: ctx.cookie } : {}, signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new ChatError(ctx.t('fwd.err.media'))
  return Buffer.from(await r.arrayBuffer())
}
/**
 * Forward one message to up to 5 chats: a copy of its text / picture / voice message, marked "Forwarded". The chat it comes
 * from must allow it (Chat settings → Private chats → Forwarding; each group / channel's "Forwarding"; the team always
 * can), and each target follows the usual rules (who may post there, pictures / voice there, banned content). One
 * forward counts as one message for slow mode. Answers { sent, failed: [{ to, error }] }.
 */
export async function forward(ctx: Ctx, b: Body) {
  needPoster(ctx)
  const src = await loadMessage(ctx, b.id)   // a message this person can see
  const room = String(src.room), gid = groupIdOf(room), cfg = await chatConfig(ctx.payload)
  if (ctx.viewer.kind !== 'staff') {
    const allowed = room.startsWith('pm:') ? cfg.pmForward
      : gid ? (await ctx.payload.findByID({ collection: 'chat-rooms', id: gid, depth: 0, overrideAccess: true, disableErrors: true, select: { allowForward: true } }))?.allowForward !== false
      : true
    if (!allowed) throw new ChatError(ctx.t('fwd.err.notAllowed'), 403)
  }
  // its picture / voice message: only when this person may see it, and saving isn't turned off there
  const imgs = await imagesFor(ctx.payload, [src])
  const w = lockWire(toWire(src, imgs), ctx.viewer, await mediaPolicy(ctx.payload), await joinedGroups(ctx.payload, ctx.viewer.kind === 'member' ? ctx.viewer.uid : null))
  if (w.locked || w.expired) throw new ChatError(ctx.t('fwd.err.media'), 403)
  if ((w.image || w.voice) && w.nosave && ctx.viewer.kind !== 'staff') throw new ChatError(ctx.t('fwd.err.noSave'), 403)
  const text = String(src.text || ''), kind: 'photo' | 'voice' | null = w.image ? 'photo' : w.voice ? 'voice' : null
  if (!text && !kind) throw new ChatError(ctx.t('chat.quoteGone'), 404)
  const targets = (Array.isArray(b.to) ? b.to : []).filter((x): x is string => typeof x === 'string' && ROOM_RE.test(x))
  const list = [...new Set(targets)].slice(0, FORWARD_MAX)
  if (!list.length) throw new ChatError(ctx.t('fwd.err.none'))
  // the file, once
  let file: { data: Buffer; mimetype: string; name: string; thumb?: string; duration?: number; peaks?: number[] } | null = null
  if (w.image) {
    const id = String(typeof src.image === 'object' && src.image ? (src.image as { id: string }).id : src.image)
    const im = await ctx.payload.findByID({ collection: 'chat-images', id, depth: 0, overrideAccess: true })
    file = { data: await fileBytes(ctx, w.image.url), mimetype: 'image/webp', name: `chat-${randomBytes(12).toString('hex')}.webp`, thumb: im.thumb || '' }
  } else if (w.voice) {
    const id = String(typeof src.voice === 'object' && src.voice ? (src.voice as { id: string }).id : src.voice)
    const v = await ctx.payload.findByID({ collection: 'chat-voice', id, depth: 0, overrideAccess: true })
    const mt = String(v.mimeType || 'audio/webm'), ext = VOICE_TYPES[mt] || 'webm'
    file = { data: await fileBytes(ctx, w.voice.url), mimetype: mt, name: `voice-${randomBytes(12).toString('hex')}.${ext}`, duration: Number(v.duration) || 0, peaks: Array.isArray(v.peaks) ? (v.peaks as number[]) : [] }
  }
  let sent = 0
  const failed: { to: string; error: string }[] = []
  for (const to of list) {
    try {
      const tb = targetBody(ctx, to)
      const p = await prepareSend(ctx, tb, text, { skipSlow: sent > 0 })   // (slow mode: the forward counts once)
      let imageId: string | undefined, voiceId: string | undefined
      if (file && ctx.viewer.kind !== 'staff' && p.room !== 'dm:' + ctx.viewer.uid) {
        // pictures / voice there, like sending them yourself
        const pm = p.room.startsWith('pm:')
        const ok = kind === 'photo' ? (pm ? cfg.pmPictures : ctx.perms.sendPictures) : (pm ? cfg.pmVoice : ctx.perms.sendPictures)
        if (!ok) throw new ChatError(ctx.t(kind === 'photo' ? (pm ? 'chat.err.pmPicturesOff' : 'chat.err.imagesDmOnly') : (pm ? 'chat.err.pmVoiceOff' : 'chat.err.voiceNotHere')), 403)
      }
      if (file && roomMedia(await mediaPolicy(ctx.payload), p.room)?.view === 'none') throw new ChatError(ctx.t('chat.err.mediaOff'), 403)
      if (file && kind === 'photo') imageId = String((await ctx.payload.create({ collection: 'chat-images', overrideAccess: true, data: { room: p.room, thumb: file.thumb }, file: { data: file.data, mimetype: file.mimetype, name: file.name, size: file.data.length } })).id)
      if (file && kind === 'voice') voiceId = String((await ctx.payload.create({ collection: 'chat-voice', overrideAccess: true, data: { room: p.room, duration: file.duration, peaks: file.peaks }, file: { data: file.data, mimetype: file.mimetype, name: file.name, size: file.data.length } })).id)
      await createMessage(ctx, tb, p, text, imageId, voiceId, { forwarded: true })
      sent++
    } catch (e) {
      failed.push({ to, error: e instanceof ChatError ? e.message : ctx.t('chat.sendFailed') })
    }
  }
  return { sent, failed }
}

/* ---------- who may start a private chat with me ---------- */
const PM_POLICIES = ['request', 'everyone', 'nobody'] as const
/** Ask first (a request, the default) · anyone (the chat opens at once) · nobody (no new private chats; current ones stay). */
export async function pmPolicy(ctx: Ctx, b: Body) {
  if (ctx.viewer.kind !== 'member' || !ctx.viewer.uid) throw new ChatError(ctx.t('chat.err.notAllowed'), 403)
  const policy = PM_POLICIES.find((p) => p === b.policy)
  if (!policy) throw new ChatError(ctx.t('chat.err.notAllowed'))
  await ctx.payload.update({ collection: 'members', id: ctx.viewer.uid, data: { pmPolicy: policy }, overrideAccess: true })
  return { policy }
}
