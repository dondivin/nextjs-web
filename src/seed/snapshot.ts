/*
 * Full database snapshot: every collection of the database (content, settings, accounts, chat history, encryption keys)
 * saved as MongoDB Extended JSON, so ids, dates and relations come back exactly as they were.
 *
 *   pnpm data:export            → seed-data/snapshot/<collection>.json + manifest.json   (git-ignored: personal data)
 *   pnpm seed                   → on an EMPTY database, restores that snapshot (else the usual "add missing texts")
 *   pnpm seed --restore --yes   → restores it even if the database has data, REPLACING those collections
 *
 * Files (images, wallpapers, stickers, chat pictures / voice) are NOT in the snapshot: they stay on Cloudflare R2 and
 * the database only points at them — the new server must use the same R2 settings.
 * Encrypted message texts are copied as they are: the new server needs the same CHAT_MASTER_KEY (checked on restore).
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Payload } from 'payload'
import { masterKeys } from '../chat/crypto'

export const SNAPSHOT_DIR = path.resolve(process.cwd(), process.env.OC_SNAPSHOT_DIR || 'seed-data/snapshot')
// temporary / per-session bookkeeping that must not travel
const SKIP = new Set(['payload-locked-documents', 'payload-kvs'])

type Manifest = { createdAt: string; database: string; masterKey: string | null; collections: Record<string, number> }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const conn = (payload: Payload) => (payload.db as any).connection
const ejson = (payload: Payload) => conn(payload).base.mongo.BSON.EJSON as { stringify: (v: unknown, o?: object) => string; parse: (s: string, o?: object) => unknown }

export const snapshotExists = (dir = SNAPSHOT_DIR) => fs.existsSync(path.join(dir, 'manifest.json'))
export function readManifest(dir = SNAPSHOT_DIR): Manifest | null {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) } catch { return null }
}

/** Save every collection of the database into `dir` (the previous snapshot is kept as "<dir>-previous"). */
export async function exportSnapshot(payload: Payload, dir = SNAPSHOT_DIR) {
  const db = conn(payload).db, EJSON = ejson(payload)
  const tmp = dir + '-tmp'
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true })
  const counts: Record<string, number> = {}
  for (const c of (await db.listCollections().toArray()).map((x: { name: string }) => x.name).sort()) {
    if (SKIP.has(c) || c.startsWith('system.')) continue
    // one document per line: big collections stay readable and diff-friendly
    const out = fs.createWriteStream(path.join(tmp, c + '.json'))
    let n = 0
    for await (const doc of db.collection(c).find({}).sort({ _id: 1 })) { out.write(EJSON.stringify(doc, { relaxed: false }) + '\n'); n++ }
    await new Promise<void>((ok, ko) => out.end((e?: Error | null) => (e ? ko(e) : ok())))
    counts[c] = n
  }
  const m: Manifest = { createdAt: new Date().toISOString(), database: db.databaseName, masterKey: masterKeys().current?.id || null, collections: counts }
  fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(m, null, 2) + '\n')
  // swap in atomically-ish: keep the previous snapshot one step back
  if (fs.existsSync(dir)) { fs.rmSync(dir + '-previous', { recursive: true, force: true }); fs.renameSync(dir, dir + '-previous') }
  fs.renameSync(tmp, dir)
  return m
}

/** Is the database empty (nothing a fresh install would lose)? */
export async function databaseIsEmpty(payload: Payload) {
  const db = conn(payload).db
  for (const c of ['users', 'partners', 'translations', 'members', 'chat-messages']) if (await db.collection(c).countDocuments({}, { limit: 1 })) return false
  return true
}

/** Load the snapshot into the database. Without `replace`, stops if a collection already has data. */
export async function restoreSnapshot(payload: Payload, opts: { dir?: string; replace?: boolean; log?: (m: string) => void } = {}) {
  const dir = opts.dir || SNAPSHOT_DIR, log = opts.log || ((m: string) => payload.logger.info('[restore] ' + m))
  const m = readManifest(dir)
  if (!m) throw new Error(`No snapshot in ${dir} (run pnpm data:export on the source machine first).`)
  const db = conn(payload).db, EJSON = ejson(payload)
  // encrypted texts need the same master key
  const here = masterKeys().current?.id || null
  if ((m.collections['chat-keys'] || 0) > 0 && m.masterKey && m.masterKey !== here)
    throw new Error(`The snapshot's messages are encrypted with master key ${m.masterKey}, but this server has ${here || 'no key'}. Set the same CHAT_MASTER_KEY (see docs/ENCRYPTION.md) and run again.`)
  const names = Object.keys(m.collections)
  if (!opts.replace) {
    const busy: string[] = []
    for (const c of names) if (m.collections[c] && (await db.collection(c).countDocuments({}, { limit: 1 }))) busy.push(c)
    if (busy.length) throw new Error(`The database already has data in: ${busy.join(', ')}. Use "pnpm seed --restore --yes" to replace it.`)
  }
  let total = 0
  for (const c of names) {
    const file = path.join(dir, c + '.json')
    if (!fs.existsSync(file)) continue
    if (opts.replace) await db.collection(c).deleteMany({})
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
    for (let i = 0; i < lines.length; i += 1000) {
      const docs = lines.slice(i, i + 1000).map((l) => EJSON.parse(l, { relaxed: false }))
      if (docs.length) await db.collection(c).insertMany(docs as never[], { ordered: false })
    }
    total += lines.length
  }
  log(`restored ${total} documents in ${names.length} collections from the snapshot of ${m.createdAt} (database "${m.database}")`)
  return { total, manifest: m }
}
