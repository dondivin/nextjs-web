/* CLI: pnpm seed [--force-strings] · pnpm seed --restore --yes (replace the data with seed-data/snapshot) */
import { getPayload } from 'payload'
import config from '@payload-config'
import { seed } from './seed'
import { restoreSnapshot } from './snapshot'

process.env.OC_AUTO_SEED = 'false' // this command seeds itself; skip the automatic seed on init

const has = (f: string) => process.argv.includes(f)

async function main() {
  const payload = await getPayload({ config })
  if (has('--restore')) {
    if (!has('--yes')) throw new Error('This REPLACES the data of this database with seed-data/snapshot. Run again with: pnpm seed --restore --yes')
    await restoreSnapshot(payload, { replace: true, log: (m) => console.log(m) })
  }
  await seed(payload, { forceStrings: has('--force-strings') })
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
