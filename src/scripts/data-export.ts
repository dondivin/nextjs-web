/*
 * pnpm data:export — save the whole database into seed-data/snapshot (see src/seed/snapshot.ts).
 * On the new machine / database: put the folder there (it is git-ignored) and run `pnpm seed`.
 */
const run = async () => {
  process.env.OC_AUTO_SEED = 'false'
  const { getPayload } = await import('payload')
  const { default: config } = await import('../payload.config')
  const { exportSnapshot, SNAPSHOT_DIR } = await import('../seed/snapshot')
  const payload = await getPayload({ config })
  const m = await exportSnapshot(payload)
  const total = Object.values(m.collections).reduce((a, b) => a + b, 0)
  console.log(`Saved ${total} documents from ${Object.keys(m.collections).length} collections of "${m.database}" into ${SNAPSHOT_DIR}`)
  console.log(Object.entries(m.collections).map(([k, v]) => `  ${k}: ${v}`).join('\n'))
  console.log(`Message texts are encrypted with master key ${m.masterKey || '(none)'} — the new server needs the same CHAT_MASTER_KEY.`)
}
run().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })

export {}   // a module (own scope)
