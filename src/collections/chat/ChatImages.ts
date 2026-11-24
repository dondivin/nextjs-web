import type { CollectionConfig, Where } from 'payload'
import { hasRole } from '../../access'

/**
 * Pictures sent in the chat. Kept apart from `media` (public files) because direct-chat pictures can be private
 * (deposit screenshots…): the file URL (/api/chat-images/file/<name>) checks the same rule as the message —
 * room pictures for everyone, a direct chat's pictures only for that member and the team.
 * Created by the chat API only (resized + cleaned with sharp first).
 */
export const ChatImages: CollectionConfig = {
  slug: 'chat-images',
  admin: { group: 'Chat', defaultColumns: ['filename', 'room', 'createdAt'] },
  defaultSort: '-createdAt',
  access: {
    read: ({ req }) => {
      const u = req.user as { collection?: string; id?: string | number } | null
      if (hasRole(u as never, 'moderator')) return true
      const rooms: Where = { room: { not_like: 'dm:' } }
      if (u?.collection === 'members') return { or: [rooms, { room: { equals: 'dm:' + u.id } }] }
      return rooms
    },
    create: () => false,
    update: ({ req }) => hasRole(req.user as never, 'moderator'),
    delete: ({ req }) => hasRole(req.user as never, 'moderator'),
  },
  upload: { mimeTypes: ['image/webp', 'image/jpeg', 'image/png'] },
  fields: [
    { name: 'room', type: 'text', required: true, index: true },
  ],
}
