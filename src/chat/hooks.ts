import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'
import { broadcast, hub, toStaff, toUid } from './hub'
import { activeMatches, imagesFor, mutedMap, myReports, profilesFor, reportCounts, toWire } from './data'

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

export const onMessageChange: CollectionAfterChangeHook = async ({ doc, req, operation }) => {
  if (nobodyListening()) return doc
  try {
    const m = toWire(doc, await imagesFor(req.payload, [doc], req))
    const dmMember = m.room.startsWith('dm:') ? m.room.slice(3) : null
    const profiles = operation === 'create' ? await profilesFor(req.payload, [m.by, m.reply?.by], req) : undefined
    // direct chats only go to that member and to staff; room messages go to everyone
    broadcast({ type: 'msg', m, profiles }, dmMember ? (c) => toStaff(c) || c.viewer.uid === dmMember : undefined)
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
    if (doc.displayName !== previousDoc?.displayName || doc.avatarGradient !== previousDoc?.avatarGradient || relKey(doc.avatar) !== relKey(previousDoc?.avatar)) {
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
