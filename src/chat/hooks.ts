import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'
import { broadcast, dropUid, hub, toStaff, toUid, type Client } from './hub'
import { pmMembers, relView } from './pm'
import { groupIdOf, memberUids, roomVisibility } from './groups'
import { lockWire, mediaPolicy, type MediaPolicy } from './media-policy'
import { activeMatches, clearChatCache, imagesFor, type WireMsg, mutedMap, myReports, profilesFor, reportCounts, toWire } from './data'

/*
 * Payload hooks → live chat. Whatever changes a message, member, report or match (the chat API, the custom back office,
 * or the raw /cms editor) goes through these hooks, so every open chat updates without a reload.
 * Hooks never throw: a failed broadcast must not fail the database write.
 */

const nobodyListening = () => hub.clients.size === 0
const relKey = (x: unknown) => (x && typeof x === 'object' && 'id' in x ? String((x as { id: unknown }).id) : x ? String(x) : '')

/** Staff changed their chat name or avatar in the back office → update open chats. */
export const onStaffChange: CollectionAfterChangeHook = async ({ doc, previousDoc, req, operation }) => {
  if (nobodyListening() || operation !== 'update') return doc
  if (doc.name === previousDoc?.name && doc.chatGradient === previousDoc?.chatGradient && relKey(doc.chatAvatar) === relKey(previousDoc?.chatAvatar)) return doc
  try {
    broadcast({ type: 'profiles', profiles: await profilesFor(req.payload, [String(doc.id)], req) })
  } catch (e) {
    req.payload.logger.error({ err: e, msg: '[chat] staff profile broadcast failed' })
  }
  return doc
}

/** Broadcast a message so that each client receives the version it may see (lockWire), grouped to send each variant once. */
function sendEach(base: Record<string, unknown>, m: WireMsg, policy: MediaPolicy, to: (c: Client) => boolean, groupsOf: (c: Client) => Set<string>) {
  const variants = new Map<string, WireMsg>()
  for (const c of hub.clients.values()) {
    if (!to(c)) continue
    const w = lockWire(m, c.viewer, policy, groupsOf(c)), key = JSON.stringify([w.locked, w.nosave, !!w.image, !!w.voice])
    if (!variants.has(key)) variants.set(key, w)
    try { c.send({ ...base, type: 'msg', m: variants.get(key) }) } catch { /* closed */ }
  }
}

export const onMessageChange: CollectionAfterChangeHook = async ({ doc, req, operation }) => {
  if (nobodyListening()) return doc
  try {
    const m = toWire(doc, await imagesFor(req.payload, [doc], req))
    const gid = groupIdOf(m.room)
    if (gid) {
      const room = await req.payload.findByID({ collection: 'chat-rooms', id: gid, depth: 0, overrideAccess: true, disableErrors: true, req })
      if (!room) return doc
      const profiles = operation === 'create' ? await profilesFor(req.payload, [m.by, m.reply?.by], req) : undefined
      // open rooms are readable by everyone; the others only by their members and the team
      const members = new Set(await memberUids(req.payload, gid, req)), { vis, preview } = roomVisibility(room)
      // non-members get it live only where they may read it: "read before joining" on, and the room visible to them
      const guestReads = (c: { viewer: { uid?: string | null } }) => preview && (vis === 'public' || (vis === 'members' && !!c.viewer.uid))
      const policy = await mediaPolicy(req.payload)
      // every client gets the message as they may see it (media locked / no saving per the room's rule)
      sendEach({ type: 'msg', profiles }, m, policy, (c) => toStaff(c) || (!!c.viewer.uid && members.has(c.viewer.uid)) || guestReads(c), (c) => (!!c.viewer.uid && members.has(c.viewer.uid) ? new Set([gid]) : new Set()))
      return doc
    }
    const pair = pmMembers(m.room)
    if (m.room.startsWith('pm:')) {
      if (pair) broadcast({ type: 'msg', m, profiles: operation === 'create' ? await profilesFor(req.payload, [m.by, m.reply?.by], req) : undefined }, (c) => !!c.viewer.uid && pair.includes(c.viewer.uid))
      return doc
    }
    const dmMember = m.room.startsWith('dm:') ? m.room.slice(3) : null
    const profiles = operation === 'create' ? await profilesFor(req.payload, [m.by, m.reply?.by], req) : undefined
    // direct chats only go to that member and to staff; room messages go to everyone (media per the lounge's rule)
    if (dmMember) broadcast({ type: 'msg', m, profiles }, (c) => toStaff(c) || c.viewer.uid === dmMember)
    else sendEach({ type: 'msg', profiles }, m, await mediaPolicy(req.payload), () => true, () => new Set())
    if (dmMember && operation === 'create') {
      const member = await req.payload.findByID({ collection: 'members', id: dmMember, depth: 0, overrideAccess: true, disableErrors: true, req })
      broadcast(
        { type: 'thread', uid: dmMember, info: { lastTs: m.ts, lastText: m.text.slice(0, 140), photo: !m.text && !!m.image, lastBy: m.by, lastSeen: member?.lastSeenAt ? Date.parse(member.lastSeenAt) : 0 }, profiles: await profilesFor(req.payload, [dmMember], req) },
        toStaff,
      )
    }
  } catch (e) {
    req.payload.logger.error({ err: e, msg: '[chat] message broadcast failed' })
  }
  return doc
}

export const onMemberChange: CollectionAfterChangeHook = async ({ doc, previousDoc, req, operation }) => {
  if (nobodyListening() || operation !== 'update') return doc
  try {
    const id = String(doc.id)
    const modChanged = doc.status !== previousDoc?.status || doc.mutedUntil !== previousDoc?.mutedUntil
    if (modChanged) {
      broadcast({ type: 'mod', muted: await mutedMap(req.payload, req) })
      // the member's own tabs: refresh what they are allowed to do
      broadcast({ type: 'access', canPost: doc.status !== 'banned' }, toUid(id))
    }
    const roleChanged = relKey(doc.memberRole) !== relKey(previousDoc?.memberRole)
    if (roleChanged) broadcast({ type: 'rolesChanged' }, toUid(id)) // their chat reloads its rights
    if (roleChanged || doc.displayName !== previousDoc?.displayName || doc.avatarGradient !== previousDoc?.avatarGradient || relKey(doc.avatar) !== relKey(previousDoc?.avatar)) {
      broadcast({ type: 'profiles', profiles: await profilesFor(req.payload, [id], req) })
    }
  } catch (e) {
    req.payload.logger.error({ err: e, msg: '[chat] member broadcast failed' })
  }
  return doc
}

export const onReportChange: CollectionAfterChangeHook = async ({ doc, req }) => {
  if (nobodyListening()) return doc
  try {
    broadcast({ type: 'reports', counts: await reportCounts(req.payload, req) }, toStaff)
    const reporter = doc.reporter && typeof doc.reporter === 'object' ? String(doc.reporter.id) : doc.reporter ? String(doc.reporter) : null
    if (reporter) broadcast({ type: 'myReports', ids: await myReports(req.payload, reporter, req) }, toUid(reporter))
  } catch (e) {
    req.payload.logger.error({ err: e, msg: '[chat] report broadcast failed' })
  }
  return doc
}

export const onMatchesChange: CollectionAfterChangeHook & CollectionAfterDeleteHook = async ({ doc, req }) => {
  if (nobodyListening()) return doc
  try {
    broadcast({ type: 'matches', matches: await activeMatches(req.payload, req) })
  } catch (e) {
    req.payload.logger.error({ err: e, msg: '[chat] matches broadcast failed' })
  }
  return doc
}

/** A chat request changed → each of the two members gets their own view of it (declined / blocked stay invisible to the other side). */
export const onRequestChange: CollectionAfterChangeHook = async ({ doc, req }) => {
  if (nobodyListening()) return doc
  try {
    const from = typeof doc.from === 'object' ? String(doc.from.id) : String(doc.from)
    const to = typeof doc.to === 'object' ? String(doc.to.id) : String(doc.to)
    const profiles = await profilesFor(req.payload, [from, to], req)
    for (const [me, other] of [[from, to], [to, from]]) {
      broadcast({ type: 'pm', uid: other, rel: relView(doc, me) || { uid: other, status: 'none' }, profiles }, toUid(me))
    }
  } catch (e) {
    req.payload.logger.error({ err: e, msg: '[chat] request broadcast failed' })
  }
  return doc
}

/** A request was deleted (cancelled / unblocked) → both members: no relation any more. */
export const onRequestDelete: CollectionAfterDeleteHook = async ({ doc }) => {
  if (nobodyListening()) return doc
  const from = typeof doc.from === 'object' ? String(doc.from.id) : String(doc.from)
  const to = typeof doc.to === 'object' ? String(doc.to.id) : String(doc.to)
  broadcast({ type: 'pm', uid: to, rel: { uid: to, status: 'none' } }, toUid(from))
  broadcast({ type: 'pm', uid: from, rel: { uid: from, status: 'none' } }, toUid(to))
  return doc
}

/** A group / channel or a membership changed → every open chat refreshes its room list (cheap: one small request each). */
let groupsTimer: ReturnType<typeof setTimeout> | null = null
function announceGroups() {
  if (groupsTimer) return
  groupsTimer = setTimeout(() => { groupsTimer = null; broadcast({ type: 'groups' }) }, 200)
}
export const onRoomChange: CollectionAfterChangeHook & CollectionAfterDeleteHook = async ({ doc }) => {
  clearChatCache('media')   // a room's picture / voice rule may have changed
  if (!nobodyListening()) announceGroups()
  return doc
}
export const onRoomMemberChange: CollectionAfterChangeHook & CollectionAfterDeleteHook = async ({ doc }) => {
  if (!nobodyListening()) announceGroups()
  return doc
}

/** An account was deleted → close its live connections (otherwise it would still look "online"). */
export const onMemberDelete: CollectionAfterDeleteHook = async ({ doc }) => {
  dropUid(String(doc.id))
  return doc
}

/** A member role changed → forget cached rights; every open chat refreshes (rights, badges). */
export const onRolesChange: CollectionAfterChangeHook & CollectionAfterDeleteHook = async ({ doc }) => {
  const g = globalThis as unknown as { __ocChatCache?: Map<string, unknown> }
  g.__ocChatCache?.delete('roles')
  if (!nobodyListening()) broadcast({ type: 'rolesChanged' })
  return doc
}
