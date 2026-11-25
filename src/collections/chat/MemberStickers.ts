import type { CollectionConfig } from 'payload'
import { hasRole } from '../../access'

/**
 * Personal stickers: a picture someone turned into a sticker in the chat's photo editor ("+" in the sticker tray). Saved on
 * their account, visible only to them (and the team) — the file URL checks the owner. Stickers for everyone are the
 * `stickers` collection (back office → Stickers). owner = the member id (or a team account id).
 */
export const MemberStickers: CollectionConfig = {
  slug: 'member-stickers',
  labels: { singular: 'Personal sticker', plural: 'Personal stickers' },
  admin: { group: 'Chat', defaultColumns: ['filename', 'owner', 'createdAt'] },
  defaultSort: '-createdAt',
  access: {
    read: ({ req }) => {
      const u = req.user as { collection?: string; id?: string | number } | null
      if (hasRole(u as never, 'moderator')) return true
      return u?.id ? { owner: { equals: String(u.id) } } : false
    },
    create: () => false,
    update: () => false,
    delete: ({ req }) => hasRole(req.user as never, 'moderator'),
  },
  upload: { mimeTypes: ['image/webp'] },
  fields: [{ name: 'owner', type: 'text', required: true, index: true }],
}
