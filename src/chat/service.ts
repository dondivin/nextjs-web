import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import type { Payload } from 'payload'
import { hasRole } from '../access'
import { getDictionary, getLanguages } from '../i18n/data'
import type { Member, User } from '../payload-types'
import { isGradient, randomGradient } from './gradient'
import { AvatarError, dropMedia, prepareChatImage, storeAvatar } from './avatar'
import { broadcast, hub, peersList, setPresence, type Viewer } from './hub'
import {
  agentInfo, cached, chatConfig, imagesFor, isObjectId, mutedMap, myReports, profilesFor, reportCounts, threadsFor, toWire, type ChatConfig,
} from './data'

/** Thrown by actions; `message` is already in the visitor's language and is shown as a toast. */
export class ChatError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

export type Ctx = { payload: Payload; viewer: Viewer; member: Member | null; staff: User | null; t: (k: string, v?: Record<string, string | number>) => string }

const REACTIONS = new Set(['goal', 'fire', 'laugh', 'clap', 'wow'])
const ROOM_RE = /^(lounge|support|sup:[a-f0-9]{24}|[a-f0-9]{24})$/i

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
  if (user?.collection === 'users' && hasRole(user, 'moderator')) return { payload, t, viewer: { kind: 'staff', uid: String(user.id) }, member: null, staff: user }
  if (user?.collection === 'members') return { payload, t, viewer: { kind: 'member', uid: String(user.id) }, member: user, staff: null }
  return { payload, t, viewer: { kind: 'anon', uid: null }, member: null, staff: null }
}

function isMuted(m: Member | null) {
  if (!m) return false
  if (m.status === 'banned') return true
  return m.status === 'muted' && (!m.mutedUntil || Date.parse(m.mutedUntil) > Date.now())
}

/* ---------- first event of every stream: everything the chat needs to draw ---------- */
export async function snapshot(ctx: Ctx, connId: string) {
  const { payload, viewer, member, staff } = ctx
  const roomMsgs = await payload.find({
    collection: 'chat-messages',
    where: { and: [{ deleted: { not_equals: true } }, { room: { not_like: 'dm:' } }] },
    sort: '-createdAt',
    limit: 400,
    depth: 0,
    overrideAccess: true,
  })
  const roomImgs = await imagesFor(payload, roomMsgs.docs)
  const messages = roomMsgs.docs.map((d) => toWire(d, roomImgs)).reverse()
  let myDm: ReturnType<typeof toWire>[] = []
  if (member) {
    const dm = await payload.find({ collection: 'chat-messages', where: { and: [{ room: { equals: 'dm:' + member.id } }, { deleted: { not_equals: true } }] }, sort: '-createdAt', limit: 300, depth: 0, overrideAccess: true })
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
  const ids = [...messages, ...myDm].flatMap((m) => [m.by, m.reply?.by])
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
    me: viewer.uid ? { name, email: member?.email || staff?.email || null } : null,
    rulesAccepted: viewer.kind === 'staff' || !!member?.rulesAcceptedAt,
    messages,
    myDm,
    threads,
    agent,
    muted,
    reports,
    myReports: mine,
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
  if (!room.startsWith('dm:')) return true
  return ctx.viewer.kind === 'staff' || room.slice(3) === ctx.viewer.uid
}
async function loadMessage(ctx: Ctx, id: unknown) {
  if (!isObjectId(id)) throw new ChatError(ctx.t('chat.quoteGone'), 404)
  const doc = await ctx.payload.findByID({ collection: 'chat-messages', id, depth: 0, overrideAccess: true, disableErrors: true })
  if (!doc || doc.deleted || !canSee(ctx, String(doc.room))) throw new ChatError(ctx.t('chat.quoteGone'), 404)
  return doc
}

/* ---------- actions ---------- */
type Body = Record<string, unknown>
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '')

/** Checks shared by text and picture messages: who may post, where it goes, slow mode, the quoted message. */
async function prepareSend(ctx: Ctx, b: Body, text: string) {
  needPoster(ctx)
  const cfg = await chatConfig(ctx.payload)
  if (text) {
    const problem = checkText(ctx, cfg, text)
    if (problem) throw new ChatError(problem)
  }

  // where does it go?
  let room: string
  const dmTo = b.dmTo ? str(b.dmTo, 40) : null
  if (dmTo) {
    if (ctx.viewer.kind === 'member' && dmTo !== ctx.viewer.uid) throw new ChatError(ctx.t('chat.err.notAllowed'), 403)
    if (ctx.viewer.kind === 'staff') {
      if (!isObjectId(dmTo)) throw new ChatError(ctx.t('chat.err.notAllowed'), 400)
      const m = await ctx.payload.findByID({ collection: 'members', id: dmTo, depth: 0, overrideAccess: true, disableErrors: true })
      if (!m) throw new ChatError(ctx.t('chat.err.notAllowed'), 404)
    }
    room = 'dm:' + dmTo
  } else {
    room = str(b.room, 40) || 'lounge'
    if (room !== 'lounge') {
      if (!isObjectId(room)) throw new ChatError(ctx.t('chat.err.notAllowed'))
      const match = await ctx.payload.findByID({ collection: 'matches', id: room, depth: 0, overrideAccess: true, disableErrors: true })
      if (!match || !match.active) throw new ChatError(ctx.t('chat.err.notAllowed'), 404)
    }
  }

  // slow mode (members only)
  const uid = ctx.viewer.uid as string
  if (ctx.viewer.kind === 'member' && cfg.slowMs) {
    const wait = (hub.lastPost.get(uid) || 0) + cfg.slowMs - Date.now()
    if (wait > 0) throw new ChatError(ctx.t('rule.slow', { s: Math.ceil(wait / 1000) }), 429)
  }

  // reply: always quote the stored message, never what the browser claims
  let reply: { id: string; author?: string; by: string | null; text: string } | undefined
  const r = (typeof b.reply === 'string' ? JSON.parse(b.reply || 'null') : b.reply) as Body | null
  if (r && r.id) {
    const q = await loadMessage(ctx, r.id)
    const w = toWire(q)
    reply = { id: w.id, by: w.by, text: (w.text || (q.image ? ctx.t('chat.photo') : '')).slice(0, 140), ...(q.author ? { author: String(q.author) } : {}) }
  }
  return { room, reply, uid }
}

async function createMessage(ctx: Ctx, b: Body, p: Awaited<ReturnType<typeof prepareSend>>, text: string, image?: string) {
  hub.lastPost.set(p.uid, Date.now())
  const doc = await ctx.payload.create({
    collection: 'chat-messages',
    overrideAccess: true,
    data: {
      room: p.room,
      text,
      image,
      isMod: ctx.viewer.kind === 'staff',
      clientId: str(b.clientId, 40) || undefined,
      ...(ctx.viewer.kind === 'staff' ? { staffAuthor: p.uid } : { author: p.uid }),
      ...(p.reply ? { reply: p.reply } : {}),
    },
  })
  if (ctx.viewer.kind === 'staff') touchStaff(ctx).catch(() => {})
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
 * Fans: only in their own direct chat with the team. Staff: everywhere.
 */
export async function sendImage(ctx: Ctx, form: FormData) {
  const b: Body = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string'))
  const text = str(b.text, 5000).trim()
  const p = await prepareSend(ctx, b, text)
  if (ctx.viewer.kind !== 'staff' && p.room !== 'dm:' + ctx.viewer.uid) throw new ChatError(ctx.t('chat.err.imagesDmOnly'), 403)
  const file = form.get('file')
  let data: Buffer
  try {
    if (!(file instanceof File)) throw new AvatarError('missing')
    ;({ data } = await prepareChatImage(file)) // Payload reads width / height from the file
  } catch (e) {
    if (e instanceof AvatarError) throw new ChatError(ctx.t(e.message === 'tooBig' ? 'chat.err.imageTooBig' : 'auth.err.photoType'))
    throw e
  }
  const img = await ctx.payload.create({
    collection: 'chat-images',
    overrideAccess: true,
    data: { room: p.room },
    file: { data, mimetype: 'image/webp', name: `chat-${randomBytes(12).toString('hex')}.webp`, size: data.length },
  })
  return createMessage(ctx, b, p, text, String(img.id))
}

export async function react(ctx: Ctx, b: Body) {
  needPoster(ctx)
  const key = str(b.key, 20)
  if (!REACTIONS.has(key)) throw new ChatError(ctx.t('chat.reactionFailed'))
  const doc = await loadMessage(ctx, b.id)
  const uid = ctx.viewer.uid as string
  const rx = (doc.reactions && typeof doc.reactions === 'object' ? { ...(doc.reactions as Record<string, Record<string, boolean>>) } : {}) as Record<string, Record<string, boolean>>
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
  const res = await ctx.payload.find({ collection: 'chat-messages', where: { and: [{ room: { equals: 'dm:' + uid } }, { deleted: { not_equals: true } }] }, sort: '-createdAt', limit: 300, depth: 0, overrideAccess: true })
  const imgs = await imagesFor(ctx.payload, res.docs)
  const list = res.docs.map((d) => toWire(d, imgs)).reverse()
  return { list, profiles: await profilesFor(ctx.payload, [uid, ...list.map((m) => m.by)]) }
}

export async function profiles(ctx: Ctx, b: Body) {
  const ids = Array.isArray(b.ids) ? b.ids.slice(0, 200) : []
  return { profiles: await profilesFor(ctx.payload, ids as string[]) }
}

/* ---------- accounts (fans) ---------- */
const COLORS = ['#E5484D', '#F76B15', '#FFB224', '#46A758', '#12A594', '#0090FF', '#3E63DD', '#8E4EC6', '#D6409F', '#AD7F58']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.'-]{0,22}[\p{L}\p{N}]$/u

/** Username rules: 2–24 letters/numbers (spaces, _ . ' - inside), allowed words, not used by another fan or by the team. */
async function checkName(ctx: Ctx, raw: unknown, exceptMember?: string) {
  const name = str(raw, 100).trim().replace(/\s+/g, ' ')
  if (!NAME_RE.test(name)) throw new ChatError(ctx.t('auth.err.username'))
  const cfg = await chatConfig(ctx.payload)
  if (checkText({ ...ctx, viewer: { kind: 'member', uid: null } }, cfg, name)) throw new ChatError(ctx.t('auth.err.nameNotAllowed'))
  const key = name.toLowerCase()
  const fan = await ctx.payload.find({ collection: 'members', where: { nameKey: { equals: key } }, limit: 1, depth: 0, overrideAccess: true, select: {} })
  if (fan.docs.length && String(fan.docs[0].id) !== exceptMember) throw new ChatError(ctx.t('auth.err.nameTaken'), 409)
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
  return logIn(ctx, { email, password })
}

/** A fan edits their own name / gradient (the photo goes through uploadAvatar). */
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
const APPROVED_TTL = 2 * 86400e3 // after approval the fan has 48 h to pick a new password
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

/** The fan's browser asks how its request is going: pending | approved | denied | done | expired. */
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
