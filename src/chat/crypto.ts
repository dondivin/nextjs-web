import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { Payload } from 'payload'

/*
 * Encryption of message texts at rest — envelope encryption:
 *
 *   CHAT_MASTER_KEY (server environment, never in the database)
 *     └─ locks one random 256-bit key per conversation   → collection `chat-keys` (only the locked form is stored)
 *          └─ encrypts that conversation's texts           → messages, reply quotes, report snapshots, request notes
 *
 * AES-256-GCM everywhere (a fresh random IV per value; the tag detects any change). Each text is bound to its conversation
 * (additional data "msg:<room>"), so a ciphertext copied into another conversation can't be read there.
 * Stored form of a text:  enc:v2:<keyFingerprint>:<iv>.<tag>.<ciphertext>   (base64url)
 * Anything not starting with "enc:" is an old plain text and is returned as it is, so the switch-over is seamless.
 *
 * Rooms are the stored room names: 'lounge', a match id, 'g:<room id>', 'pm:<a>_<b>', 'dm:<member id>'.
 * Changing the master key: CHAT_MASTER_KEY = the new one, CHAT_MASTER_KEY_OLD = the previous one, then
 * `pnpm chat:crypto --rotate` re-locks the conversation keys (messages are not touched).
 */

const PREFIX = 'enc:v2:'
export const LOCKED_TEXT = '🔒 This message can’t be read (encryption key missing).'

type Master = { key: Buffer; id: string }
const fingerprint = (k: Buffer) => createHash('sha256').update(k).digest('hex').slice(0, 8)
function parseKey(v: string | undefined): Buffer | null {
  if (!v) return null
  const b = Buffer.from(v.trim(), 'base64')
  return b.length === 32 ? b : null
}
let warned = false
/** The current master key and the previous one (while rotating). */
export function masterKeys(): { current: Master | null; old: Master | null } {
  const c = parseKey(process.env.CHAT_MASTER_KEY), o = parseKey(process.env.CHAT_MASTER_KEY_OLD)
  if (!c && !warned) { warned = true; console.warn('[chat] CHAT_MASTER_KEY is missing or not 32 bytes (base64): message texts are stored UNENCRYPTED.') }
  return { current: c ? { key: c, id: fingerprint(c) } : null, old: o ? { key: o, id: fingerprint(o) } : null }
}
export const encryptionOn = () => !!masterKeys().current

const b64 = (b: Buffer) => b.toString('base64url')
const unb64 = (s: string) => Buffer.from(s, 'base64url')
function seal(key: Buffer, plain: Buffer, aad: string) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv)
  c.setAAD(Buffer.from(aad))
  const ct = Buffer.concat([c.update(plain), c.final()])
  return b64(iv) + '.' + b64(c.getAuthTag()) + '.' + b64(ct)
}
function open(key: Buffer, packed: string, aad: string) {
  const [iv, tag, ct] = packed.split('.')
  const d = createDecipheriv('aes-256-gcm', key, unb64(iv))
  d.setAAD(Buffer.from(aad)); d.setAuthTag(unb64(tag))
  return Buffer.concat([d.update(unb64(ct)), d.final()])
}

/* ---------- conversation keys ---------- */
const cache = new Map<string, Buffer>()          // room → plain conversation key (server memory only)
const pending = new Map<string, Promise<Buffer | null>>()
const wrapAad = (room: string) => 'chatkey:' + room

/** Lock a conversation key with a master key (stored form "<masterId>:<packed>"). */
export function wrapKey(k: Buffer, room: string, m: Master) { return m.id + ':' + seal(m.key, k, wrapAad(room)) }
/** Unlock a stored conversation key with whichever master key locked it (current or old). */
export function unwrapKey(stored: string, room: string): Buffer | null {
  const { current, old } = masterKeys()
  const [id, packed] = [stored.slice(0, stored.indexOf(':')), stored.slice(stored.indexOf(':') + 1)]
  const m = current && current.id === id ? current : old && old.id === id ? old : null
  if (!m) return null
  try { return open(m.key, packed, wrapAad(room)) } catch { return null }
}

/** The conversation's key: from memory, else from `chat-keys`; created (and stored locked) when `create` and missing. */
export async function roomKey(payload: Payload, room: string, create: boolean): Promise<Buffer | null> {
  const hit = cache.get(room)
  if (hit) return hit
  const k = room + (create ? '|c' : '')
  if (pending.has(k)) return pending.get(k) as Promise<Buffer | null>
  const p = (async () => {
    const found = await payload.find({ collection: 'chat-keys', where: { room: { equals: room } }, limit: 1, depth: 0, overrideAccess: true })
    const doc = found.docs[0]
    if (doc) { const key = unwrapKey(String(doc.wrapped), room); if (key) cache.set(room, key); return key }
    const m = masterKeys().current
    if (!create || !m) return null
    const key = randomBytes(32)
    try {
      await payload.create({ collection: 'chat-keys', data: { room, wrapped: wrapKey(key, room, m), kv: m.id }, overrideAccess: true })
    } catch {
      // created at the same moment by another request: use that one
      const again = await payload.find({ collection: 'chat-keys', where: { room: { equals: room } }, limit: 1, depth: 0, overrideAccess: true })
      const k2 = again.docs[0] ? unwrapKey(String(again.docs[0].wrapped), room) : null
      if (k2) cache.set(room, k2)
      return k2
    }
    cache.set(room, key)
    return key
  })()
  pending.set(k, p)
  try { return await p } finally { pending.delete(k) }
}
/** Forget cached keys (after a master-key rotation or a shred). */
export function forgetKeys(room?: string) { if (room) cache.delete(room); else cache.clear() }

/** Erase a conversation's key: its encrypted texts become unreadable for good (deleted room / account). */
export async function shredRoom(payload: Payload, room: string) {
  forgetKeys(room)
  await payload.delete({ collection: 'chat-keys', where: { room: { equals: room } }, overrideAccess: true }).catch(() => {})
}

/* ---------- texts ---------- */
export const isEncrypted = (v: unknown): v is string => typeof v === 'string' && v.startsWith(PREFIX)

/** Encrypt a text for this conversation (left as it is when empty, already encrypted, or no master key is set). */
export async function encryptText(payload: Payload, room: string | null | undefined, plain: unknown): Promise<unknown> {
  if (typeof plain !== 'string' || !plain || isEncrypted(plain) || !room) return plain
  const key = await roomKey(payload, room, true)
  if (!key) return plain
  return PREFIX + fingerprint(key) + ':' + seal(key, Buffer.from(plain, 'utf8'), 'msg:' + room)
}

/** Decrypt a text of this conversation (plain texts pass through; unreadable ones become a short notice). */
export async function decryptText(payload: Payload, room: string | null | undefined, value: unknown): Promise<unknown> {
  if (!isEncrypted(value)) return value
  if (!room) return LOCKED_TEXT
  const key = await roomKey(payload, room, false)
  if (!key) return LOCKED_TEXT
  const rest = value.slice(PREFIX.length), packed = rest.slice(rest.indexOf(':') + 1)
  try { return open(key, packed, 'msg:' + room).toString('utf8') } catch { return LOCKED_TEXT }
}

/* ---------- field hooks (texts are encrypted just before saving, decrypted just after reading) ---------- */
type HookArgs = { value?: unknown; data?: Record<string, unknown>; originalDoc?: Record<string, unknown>; req: { payload: Payload } }
/** `roomOf` finds the conversation from the document (new data first, then the stored document). */
export function encryptedField(roomOf: (doc: Record<string, unknown>) => string | null | undefined) {
  const pick = (a: HookArgs) => roomOf({ ...(a.originalDoc || {}), ...(a.data || {}) })
  return {
    beforeChange: [async (a: HookArgs) => encryptText(a.req.payload, pick(a), a.value)],
    afterRead: [async (a: HookArgs) => decryptText(a.req.payload, pick(a), a.value)],
  }
}
