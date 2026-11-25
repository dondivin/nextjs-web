import type { CollectionConfig } from 'payload'

/**
 * One key per conversation, used to encrypt its message texts (see src/chat/crypto.ts). Only the LOCKED form is stored:
 * it can be opened only with CHAT_MASTER_KEY from the server's environment. Never readable through the API or the admin.
 */
export const ChatKeys: CollectionConfig = {
  slug: 'chat-keys',
  admin: { hidden: true },
  access: { read: () => false, create: () => false, update: () => false, delete: () => false },
  fields: [
    { name: 'room', type: 'text', required: true, unique: true, index: true },
    { name: 'wrapped', type: 'text', required: true },   // "<master key fingerprint>:<iv>.<tag>.<locked key>"
    { name: 'kv', type: 'text', admin: { description: 'Fingerprint of the master key that locked it' } },
  ],
}
