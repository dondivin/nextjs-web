/* CLI: pnpm seed [--force-strings] */
import { getPayload } from 'payload'
import config from '@payload-config'
import { seed } from './seed'

process.env.OC_AUTO_SEED = 'false' // this command seeds itself; skip the automatic seed on init

getPayload({ config })
  .then((payload) => seed(payload, { forceStrings: process.argv.includes('--force-strings') }))
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
