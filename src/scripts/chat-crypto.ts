/*
 * Message-text encryption at rest (see src/chat/crypto.ts). Run from the project folder (needs .env):
 *
 *   pnpm chat:crypto                     status: how many texts are plain / encrypted, how many conversation keys
 *   pnpm chat:crypto --encrypt --dry-run what --encrypt would change (nothing is written)
 *   pnpm chat:crypto --encrypt           encrypt every plain text (messages, reply quotes, report snapshots, request notes)
 *   pnpm chat:crypto --decrypt           turn everything back into plain text (e.g. before removing the feature)
 *   pnpm chat:crypto --rotate            new master key: CHAT_MASTER_KEY = new, CHAT_MASTER_KEY_OLD = previous one;
 *                                        re-locks the conversation keys only (messages are not touched)
 *
 * Writes go straight to the database (no hooks: nothing is re-broadcast, "updated at" is kept). Safe to run again:
 * encrypted texts are skipped when encrypting, plain ones when decrypting.
 */
const has = (f: string) => process.argv.includes(f)
const MODE = has('--encrypt') ? 'encrypt' : has('--decrypt') ? 'decrypt' : has('--rotate') ? 'rotate' : 'status'
const DRY = has('--dry-run')

const run = async () => {
  const { getPayload } = await import('payload')
  const { default: config } = await import('../payload.config')
  const c = await import('../chat/crypto')
  const payload = await getPayload({ config })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (payload.db as any).collections as Record<string, any>
  const { current, old } = c.masterKeys()
  if (MODE !== 'status' && MODE !== 'decrypt' && !current) throw new Error('CHAT_MASTER_KEY is missing or not 32 bytes (base64).')

  // where texts live: collection, text field paths, how to find the conversation of a document
  const SPOTS = [
    { col: 'chat-messages', fields: ['text', 'reply.text'], room: (d: any) => d.room },
    { col: 'chat-reports', fields: ['messageText'], room: (d: any) => d.room },
    { col: 'chat-requests', fields: ['note'], room: (d: any) => (d.pairKey ? 'pm:' + d.pairKey : null) },
  ]
  const get = (d: any, path: string) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), d)

  if (MODE === 'rotate') {
    if (!old) throw new Error('Set CHAT_MASTER_KEY_OLD to the previous master key first.')
    const keys = await db['chat-keys'].find({}).lean()
    let n = 0, bad = 0
    for (const k of keys) {
      const key = c.unwrapKey(String(k.wrapped), k.room)
      if (!key) { bad++; continue }
      if (String(k.wrapped).startsWith(current!.id + ':')) continue
      if (!DRY) await db['chat-keys'].updateOne({ _id: k._id }, { $set: { wrapped: c.wrapKey(key, k.room, current!), kv: current!.id } })
      n++
    }
    c.forgetKeys()
    console.log(`${DRY ? '[dry run] would re-lock' : 'Re-locked'} ${n} conversation keys with the new master key${bad ? `; ${bad} could not be opened with either key` : ''}.`)
    return
  }

  let plain = 0, enc = 0, changed = 0, failed = 0
  for (const s of SPOTS) {
    const cursor = db[s.col].find({}).cursor()
    for await (const d of cursor) {
      const set: Record<string, unknown> = {}
      for (const f of s.fields) {
        const v = get(d, f)
        if (typeof v !== 'string' || !v) continue
        if (c.isEncrypted(v)) enc++; else plain++
        if (MODE === 'encrypt' && !c.isEncrypted(v)) {
          const room = s.room(d); if (!room) { failed++; continue }
          set[f] = DRY ? v : await c.encryptText(payload, room, v)   // a dry run writes nothing (not even keys)
        } else if (MODE === 'decrypt' && c.isEncrypted(v)) {
          const out = await c.decryptText(payload, s.room(d), v)
          if (out === c.LOCKED_TEXT) { failed++; continue }
          set[f] = out
        }
      }
      if (Object.keys(set).length) { changed++; if (!DRY) await db[s.col].updateOne({ _id: d._id }, { $set: set }, { timestamps: false }) }
    }
  }
  const keys = await db['chat-keys'].countDocuments({})
  if (MODE === 'status') console.log(`Texts: ${enc} encrypted, ${plain} plain. Conversation keys: ${keys}. Master key: ${current ? 'set (' + current.id + ')' : 'MISSING'}${old ? ', old one set (' + old.id + ')' : ''}.`)
  else console.log(`${DRY ? '[dry run] would change' : 'Changed'} ${changed} documents (${MODE}). Before: ${enc} encrypted, ${plain} plain texts.${failed ? ` ${failed} could not be ${MODE}ed.` : ''} Conversation keys now: ${keys}.`)
}
run().then(() => process.exit(0), (e) => { console.error(e.message || e); process.exit(1) })

export {}   // a module (own scope)
