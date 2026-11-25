import type { CollectionConfig } from 'payload'
import { hasRole } from '../../access'
import { mediaReadWhere } from '../../chat/media-policy'

/**
 * Voice messages sent in the chat (recorded in the browser: WebM/Opus or MP4/AAC, at most a few minutes).
 * Same privacy as chat pictures: the file URL checks the message's room — shared rooms for everyone, a member's chat with the
 * team only for that member and the team, a private chat only for its two members. Created by the chat API only.
 */
export const ChatVoice: CollectionConfig = {
  slug: 'chat-voice',
  labels: { singular: 'Voice message', plural: 'Voice messages' },
  admin: { group: 'Chat', defaultColumns: ['filename', 'room', 'duration', 'createdAt'] },
  defaultSort: '-createdAt',
  access: {
    // who may download the file: the room's own people, and for shared rooms its media rule (src/chat/media-policy.ts)
    read: async ({ req }) => mediaReadWhere(req.payload, req.user as { collection?: string; id?: string | number } | null, hasRole(req.user as never, 'moderator')),
    create: () => false,
    update: ({ req }) => hasRole(req.user as never, 'moderator'),
    delete: ({ req }) => hasRole(req.user as never, 'moderator'),
  },
  // audio-only WebM / MP4 files are often detected as video/* from their contents
  upload: { mimeTypes: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/x-m4a', 'video/webm', 'video/mp4'] },
  fields: [
    { name: 'room', type: 'text', required: true, index: true },
    { name: 'duration', type: 'number', admin: { description: 'Seconds' } },
    { name: 'peaks', type: 'json', admin: { description: 'Waveform: 40 levels 0–100, measured while recording' } },
  ],
}
