/*
 * Notifications of new messages when the chat isn't on screen (Web Push).
 *
 * A signed-in person turns them on in the chat; their browser gives a subscription (endpoint + keys) that is stored in
 * `push-subscriptions`. When a message is saved, `pushForMessage` works out who should hear about it, skips anyone who is
 * looking at that conversation right now, and sends each of their devices a small encrypted message through the
 * browser's push service. The service worker (public/sw.js) shows it and opens the conversation on tap.
 *
 * Who is notified:
 *  - private chat → the other person
 *  - help chat → a member's message goes to every team account that turned notifications on; a team reply goes to the member
 *  - group / channel → its members, unless they muted that group
 *  - a reply to your message, anywhere (also the lounge and match rooms) → you
 * The lounge and match rooms otherwise never notify (too busy).
 *
 * Needs VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (see docs/NOTIFICATIONS.md). Without them nothing is sent and the chat hides
 * the "Turn on notifications" button.
 */
import { createRequire } from 'module'
import type { Payload } from 'payload'
import { hasRole } from '../access'
import { siteUrl } from '../lib/brand'
import { isObjectId } from './data'
import { groupIdOf, memberUids } from './groups'
import { hub } from './hub'
import { pmMembers } from './pm'

export type PushKind = 'member' | 'staff'
type Target = { kind: PushKind; uid: string; room: string; reply?: boolean }   // room: the conversation as that person's chat names it

/* `web-push` is loaded when first needed (not imported at the top): if the package is missing, notifications are just
   off — the chat keeps working. */
type WebPush = {
  setVapidDetails: (subject: string, pub: string, priv: string) => void
  sendNotification: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string, opts?: { TTL?: number; urgency?: string }) => Promise<unknown>
}
let webpush: WebPush | null = null
function loadLib(): WebPush | null {
  if (webpush) return webpush
  try { webpush = createRequire(import.meta.url)('web-push') as WebPush } catch { console.error('[push] the "web-push" package is not installed (pnpm add web-push): notifications are off'); webpush = null }
  return webpush
}

let ready: boolean | null = null
/** The public half of the VAPID key pair (the browser needs it to subscribe), or null when notifications aren't set up. */
export function pushPublicKey(): string | null {
  return setup() ? (process.env.VAPID_PUBLIC_KEY as string) : null
}
function setup() {
  if (ready !== null) return ready
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return (ready = false)
  const lib = loadLib(); if (!lib) return (ready = false)
  // who runs this server, for the push services (must be an https:// address or a mailto:)
  const site = siteUrl()
  const subject = process.env.VAPID_SUBJECT || (site.startsWith('https://') ? site : 'mailto:noreply@' + (new URL(site).hostname || 'localhost'))
  try { lib.setVapidDetails(subject, pub, priv); ready = true } catch (e) { console.error('[push] VAPID keys rejected: ' + (e as Error).message); ready = false }
  return ready
}

const dicts = new Map<string, { at: number; d: Record<string, string> }>()
async function dict(locale: string) {
  const c = dicts.get(locale); if (c && Date.now() - c.at < 60_000) return c.d
  const { getDictionary, getLanguages } = await import('../i18n/data')   // (loaded here: that module imports this one)
  const langs = await getLanguages(), def = langs.find((l) => l.isDefault)?.code || 'en'
  const d = await getDictionary(langs.some((l) => l.code === locale) ? locale : def, def)
  dicts.set(locale, { at: Date.now(), d }); return d
}
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, n) => (v[n] != null ? v[n] : m))

/** someone has this conversation open and on screen right now (any tab): no notification for them */
function watching(uid: string, room: string) {
  for (const c of hub.clients.values()) if (c.viewer.uid === uid && c.presence.room === room) return true
  return false
}

/** the conversation's address in the chat, for the notification's tap */
function chatPath(locale: string, room: string, uid: string) {
  const base = '/' + locale + '/chat'
  if (room === 'support') return base + '/team-' + uid
  return base + '/' + encodeURIComponent(room.replace(/^(sup|pm|g):/, '$1-'))
}

type Msg = { room: string; authorKind: 'member' | 'staff'; authorUid: string; authorName: string; text: string; kind: 'text' | 'photo' | 'voice'; replyTo?: string | null; id: string }

/** Called after a message is saved. Never throws, never slows the sender down. */
export function pushForMessage(payload: Payload, m: Msg) {
  if (!setup()) return
  run(payload, m).catch((e) => console.error('[push] ' + (e as Error).message))
}

async function run(payload: Payload, m: Msg) {
  const targets: Target[] = []
  const add = (t: Target) => { if (t.uid && !(t.kind === m.authorKind && t.uid === m.authorUid) && !targets.some((x) => x.kind === t.kind && x.uid === t.uid)) targets.push(t) }
  let title = m.authorName, groupName = ''
  const gid = groupIdOf(m.room)

  if (m.room.startsWith('pm:')) {
    const pair = pmMembers(m.room)
    if (pair) for (const u of pair) add({ kind: 'member', uid: u, room: 'pm:' + m.authorUid })
  } else if (m.room.startsWith('dm:')) {
    const member = m.room.slice(3)
    if (m.authorKind === 'staff') add({ kind: 'member', uid: member, room: 'support' })
    else {
      // the team: every team account with notifications on (team accounts are few)
      const subs = await payload.find({ collection: 'push-subscriptions', where: { kind: { equals: 'staff' } }, pagination: false, depth: 0, overrideAccess: true, select: { uid: true } })
      const uids = [...new Set(subs.docs.map((s) => String(s.uid)))]
      if (uids.length) {
        const users = await payload.find({ collection: 'users', where: { id: { in: uids } }, pagination: false, depth: 0, overrideAccess: true, select: { roles: true } })
        for (const u of users.docs) if (hasRole({ ...u, collection: 'users' } as never, 'moderator')) add({ kind: 'staff', uid: String(u.id), room: 'sup:' + member })
      }
    }
  } else if (gid) {
    const room = await payload.findByID({ collection: 'chat-rooms', id: gid, depth: 0, overrideAccess: true, disableErrors: true, select: { name: true, active: true } })
    if (!room || room.active === false) return
    groupName = String(room.name || '')
    for (const u of await memberUids(payload, gid)) add({ kind: 'member', uid: u, room: m.room })
  }
  // a reply to your message, in any room
  if (m.replyTo && isObjectId(m.replyTo)) {
    const browserRoom = m.room.startsWith('dm:') || m.room.startsWith('pm:') ? null : m.room   // (private ones are covered above)
    if (browserRoom) {
      const isMember = await payload.count({ collection: 'members', where: { id: { equals: m.replyTo } }, overrideAccess: true })
      const t: Target = { kind: isMember.totalDocs ? 'member' : 'staff', uid: m.replyTo, room: browserRoom, reply: true }
      const existing = targets.find((x) => x.kind === t.kind && x.uid === t.uid)
      if (existing) existing.reply = true; else add(t)
    }
  }
  const who = targets.filter((t) => !watching(t.uid, t.room))
  if (!who.length) return

  // their settings (text on the lock screen, muted groups) and devices
  const prefs = new Map<string, { preview: boolean; muted: string[] }>()
  for (const kind of ['member', 'staff'] as const) {
    const ids = who.filter((t) => t.kind === kind).map((t) => t.uid)
    if (!ids.length) continue
    const res = await payload.find({ collection: kind === 'member' ? 'members' : 'users', where: { id: { in: ids } }, pagination: false, depth: 0, overrideAccess: true, select: { pushPreview: true, pushMuted: true } })
    for (const d of res.docs as { id: string | number; pushPreview?: boolean | null; pushMuted?: unknown }[]) prefs.set(kind + ':' + d.id, { preview: d.pushPreview !== false, muted: Array.isArray(d.pushMuted) ? (d.pushMuted as string[]) : [] })
  }
  const subs = await payload.find({ collection: 'push-subscriptions', where: { uid: { in: who.map((t) => t.uid) } }, pagination: false, depth: 0, overrideAccess: true })
  const icon = '/brand/icon/192'
  await Promise.all(subs.docs.map(async (s) => {
    const t = who.find((x) => x.uid === String(s.uid) && x.kind === s.kind); if (!t) return
    const pref = prefs.get(t.kind + ':' + t.uid) || { preview: true, muted: [] }
    if (gid && !t.reply && pref.muted.includes(m.room)) return   // muted group (a reply to them still gets through)
    const locale = s.locale || 'en', d = await dict(locale)
    const what = m.kind === 'photo' ? (d['push.photo'] || '📷 Photo') : m.kind === 'voice' ? (d['push.voice'] || '🎤 Voice message') : m.text
    const said = m.kind === 'text' ? m.text : what + (m.text ? ' · ' + m.text : '')
    let head = title, body = said
    if (t.reply && !gid && !m.room.startsWith('pm:') && !m.room.startsWith('dm:')) head = fill(d['push.replied'] || '{name} replied to you', { name: m.authorName })
    else if (gid) { head = groupName; body = m.authorName + ': ' + said }
    else if (t.kind === 'staff' && m.room.startsWith('dm:')) head = fill(d['push.helpFrom'] || 'Help chat · {name}', { name: m.authorName })
    if (!pref.preview) body = d['push.hidden'] || 'New message'
    const data = { title: head.slice(0, 80), body: body.slice(0, 180), tag: t.room, url: chatPath(locale, t.room, t.uid), icon, ts: Date.now(), id: m.id }
    try {
      await (webpush as WebPush).sendNotification({ endpoint: String(s.endpoint), keys: { p256dh: String(s.p256dh), auth: String(s.auth) } }, JSON.stringify(data), { TTL: 24 * 3600, urgency: 'high' })
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      // the browser dropped this subscription (uninstalled, notifications turned off, expired): forget it
      if (code === 404 || code === 410) await payload.delete({ collection: 'push-subscriptions', id: s.id, overrideAccess: true }).catch(() => {})
      else console.error('[push] send failed (' + (code || 'network') + ')')
    }
  }))
}
