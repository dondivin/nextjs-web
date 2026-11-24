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
import { PasswordResets } from './collections/chat/PasswordResets'
import { ChatImages } from './collections/chat/ChatImages'
import { ChatRequests } from './collections/chat/ChatRequests'
import { ChatRooms } from './collections/chat/ChatRooms'
import { ChatRoomMembers } from './collections/chat/ChatRoomMembers'
import { MemberRoles } from './collections/chat/MemberRoles'
import { seed } from './seed/seed'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Cloudflare R2 (S3-compatible) for uploads (chat avatars, partner logos…). Enabled when the R2_* variables are set;
// otherwise uploads stay on local disk in ./media (development).
// R2_PUBLIC_URL (optional): the bucket's public domain (custom domain or r2.dev). When set, files are served straight from
// Cloudflare's CDN; without it they are streamed through the site at /api/media/file/<name>.
const plugins: Plugin[] = []
const r2Public = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '')
if (process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY) {
  plugins.push(
    s3Storage({
      collections: {
        media: r2Public
          ? { disablePayloadAccessControl: true, generateFileURL: ({ filename, prefix }) => `${r2Public}/${prefix ? prefix + '/' : ''}${filename}` }
          : true,
        // chat pictures are never public: always served through Payload so the access rule (direct chats) is checked
        'chat-images': true,
      },
      bucket: process.env.R2_BUCKET,
      config: {
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        region: 'auto',
        credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
        // only send checksums when an operation needs them (safe default for S3-compatible stores)
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
  collections: [Users, Media, Partners, Matches, Languages, Translations, Members, ChatMessages, ChatReports, PasswordResets, ChatImages, ChatRequests, ChatRooms, ChatRoomMembers, MemberRoles],
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
