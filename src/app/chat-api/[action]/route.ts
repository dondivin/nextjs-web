import { getPayload } from 'payload'
import { generateExpiredPayloadCookie, generatePayloadCookie } from 'payload/shared'
import config from '@payload-config'
import * as chat from '@/chat/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Handler = (ctx: chat.Ctx, body: Record<string, unknown>) => Promise<Record<string, unknown>>
const ACTIONS: Record<string, Handler> = {
  send: chat.send,
  react: chat.react,
  report: chat.report,
  remove: chat.remove,
  mute: chat.mute,
  rules: chat.acceptRules,
  presence: chat.presence,
  seen: chat.seen,
  receipt: chat.receipt,
  stickers: chat.myStickers,
  'sticker-remove': chat.removeSticker,
  thread: chat.thread,
  profiles: chat.profiles,
  forgot: chat.forgot,
  'reset-status': chat.resetStatus,
  profile: chat.updateProfile,
  people: chat.people,
  'chat-request': chat.chatRequest,
  'chat-respond': chat.chatRespond,
  groups: chat.groups,
  'group-join': chat.groupJoin,
  'group-leave': chat.groupLeave,
  'room-create': chat.roomCreate,
  'room-update': chat.roomUpdate,
  'room-remove': chat.roomRemove,
  'room-members': chat.roomMembers,
  'room-info': chat.roomInfo,
  history: chat.history,
  'room-color': chat.roomColor,
  'room-member': chat.roomMember,
  'room-invite': chat.roomInvite,
  'join-link': chat.roomJoinLink,
  'push-subscribe': chat.pushSubscribe,
  'push-unsubscribe': chat.pushUnsubscribe,
  'push-prefs': chat.pushPrefs,
}

/**
 * POST /chat-api/<action> with a JSON body. Answers { ok: true, ... } or { error: "<message in the visitor's language>" }.
 * Only JSON is accepted, so other sites can't post here with a plain HTML form (the session cookie is SameSite=Lax as well).
 */
export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params
  // multipart uploads (profile photo, chat picture). Same-origin only (cross-site requests don't carry the Lax session cookie anyway).
  if (action === 'avatar' || action === 'image' || action === 'voice' || action === 'sticker' || action === 'room-photo') {
    const origin = req.headers.get('origin')
    if (origin && new URL(origin).host !== req.headers.get('host')) return json({ error: 'Forbidden' }, 403)
    const payload = await getPayload({ config })
    const ctx = await chat.context(payload, req.headers, String(req.headers.get('x-oc-locale') || 'en'))
    try {
      const form = await req.formData()
      if (action === 'image') return json({ ok: true, ...(await chat.sendImage(ctx, form)) })
      if (action === 'voice') return json({ ok: true, ...(await chat.sendVoice(ctx, form)) })
      if (action === 'sticker') return json({ ok: true, ...(await chat.addSticker(ctx, form)) })
      if (action === 'room-photo') return json({ ok: true, ...(await chat.roomPhoto(ctx, form)) })
      const file = form.get('file')
      return json({ ok: true, ...(await chat.uploadAvatar(ctx, file instanceof File ? file : null)) })
    } catch (e) {
      if (e instanceof chat.ChatError) return json({ error: e.message }, e.status)
      payload.logger.error({ err: e, msg: '[chat] ' + action + ' upload failed' })
      return json({ error: ctx.t(action === 'voice' ? 'chat.err.voiceType' : 'auth.err.photoType') }, 400)   // (an audio file isn't "a photo")
    }
  }
  if (!(req.headers.get('content-type') || '').includes('application/json')) return json({ error: 'Unsupported content type' }, 415)
  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) || {}
  } catch {
    return json({ error: 'Bad request' }, 400)
  }
  const payload = await getPayload({ config })
  const ctx = await chat.context(payload, req.headers, String(req.headers.get('x-oc-locale') || 'en'))
  try {
    if (action === 'signup' || action === 'login' || action === 'reset') {
      const r = action === 'signup' ? await chat.signUp(ctx, body) : action === 'reset' ? await chat.resetPassword(ctx, body) : await chat.logIn(ctx, body)
      return json({ ok: true, name: r.name }, 200, sessionCookie(payload, r.token as string))
    }
    if (action === 'logout') return json({ ok: true }, 200, expiredCookie(payload))
    const fn = ACTIONS[action]
    if (!fn) return json({ error: 'Not found' }, 404)
    return json({ ok: true, ...(await fn(ctx, body)) })
  } catch (e) {
    if (e instanceof chat.ChatError) return json({ error: e.message }, e.status)
    payload.logger.error({ err: e, msg: `[chat] ${action} failed` })
    return json({ error: ctx.t('auth.err.generic') }, 500)
  }
}

function json(data: unknown, status = 200, cookie?: string) {
  const headers = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' })
  if (cookie) headers.append('set-cookie', cookie)
  return new Response(JSON.stringify(data), { status, headers })
}

type P = Awaited<ReturnType<typeof getPayload>>
function sessionCookie(payload: P, token: string) {
  return generatePayloadCookie({ collectionAuthConfig: payload.collections.members.config.auth, cookiePrefix: payload.config.cookiePrefix, token }) as string
}
function expiredCookie(payload: P) {
  return generateExpiredPayloadCookie({ collectionAuthConfig: payload.collections.members.config.auth, cookiePrefix: payload.config.cookiePrefix }) as string
}
