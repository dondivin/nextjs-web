import type { CollectionConfig } from 'payload'
import { hasRole } from '../../access'
import { mediaReadWhere } from '../../chat/media-policy'

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
    // who may download the file: the room's own people, and for shared rooms its media rule (src/chat/media-policy.ts)
    read: async ({ req }) => mediaReadWhere(req.payload, req.user as { collection?: string; id?: string | number } | null, hasRole(req.user as never, 'moderator')),
    create: () => false,
    update: ({ req }) => hasRole(req.user as never, 'moderator'),
    delete: ({ req }) => hasRole(req.user as never, 'moderator'),
  },
  upload: { mimeTypes: ['image/webp', 'image/jpeg', 'image/png'] },
  fields: [
    { name: 'room', type: 'text', required: true, index: true },
    { name: 'thumb', type: 'text', admin: { readOnly: true, description: 'Tiny blurred preview (data URL, ~1 KB) shown before the picture is downloaded' } },
  ],
}
