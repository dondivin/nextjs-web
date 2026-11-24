import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import path from 'path'
import { buildConfig, type Plugin } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Languages } from './collections/Languages'
import { Translations } from './collections/Translations'
import { Partners } from './collections/Partners'
import { Matches } from './collections/Matches'
import { SiteSettings } from './globals/SiteSettings'
import { ChatSettings } from './globals/ChatSettings'
import { Members } from './collections/chat/Members'
import { ChatMessages } from './collections/chat/ChatMessages'
import { ChatReports } from './collections/chat/ChatReports'
import { seed } from './seed/seed'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Backblaze B2 (S3-compatible). Enabled when the B2_* variables are set; otherwise uploads stay on local disk (dev).
const plugins: Plugin[] = []
if (process.env.B2_BUCKET && process.env.B2_KEY_ID && process.env.B2_APP_KEY && process.env.B2_ENDPOINT) {
  plugins.push(
    s3Storage({
      collections: { media: true },
      bucket: process.env.B2_BUCKET,
      config: {
        endpoint: process.env.B2_ENDPOINT, // e.g. https://s3.eu-central-003.backblazeb2.com
        region: process.env.B2_REGION || 'us-east-1',
        forcePathStyle: true,
        credentials: { accessKeyId: process.env.B2_KEY_ID, secretAccessKey: process.env.B2_APP_KEY },
        // B2 does not support the newer default S3 checksum headers
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      },
    }),
  )
}

export default buildConfig({
  serverURL: process.env.NEXT_PUBLIC_SERVER_URL || '',
  // Payload's built-in admin moved to /cms (raw data editor for the owner). The OddsClub back office lives at /admin.
  routes: { admin: '/cms' },
  admin: {
    user: Users.slug,
    meta: { titleSuffix: ' · OddsClub admin' },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, Partners, Matches, Languages, Translations, Members, ChatMessages, ChatReports],
  globals: [SiteSettings, ChatSettings],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: mongooseAdapter({
    url: process.env.DATABASE_URL || '',
  }),
  sharp,
  plugins,
  // fill an empty database with the prototype content (partners + themes, languages, all texts, matches, chat rules)
  onInit: async (payload) => {
    if (process.env.OC_AUTO_SEED === 'false') return
    try {
      await seed(payload)
    } catch (e) {
      payload.logger.error({ err: e, msg: '[seed] failed' })
    }
  },
})
