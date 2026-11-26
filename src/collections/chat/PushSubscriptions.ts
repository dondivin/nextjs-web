import type { CollectionConfig } from 'payload'

/**
 * Devices that asked for notifications of new messages (Web Push): one row per browser / phone. Written and read only
 * by the server (src/chat/push.ts); a row is removed when the person turns notifications off, signs out on that device,
 * or the browser tells us the subscription is gone.
 */
export const PushSubscriptions: CollectionConfig = {
  slug: 'push-subscriptions',
  admin: { hidden: true },
  access: { read: () => false, create: () => false, update: () => false, delete: () => false },
  fields: [
    { name: 'kind', type: 'select', required: true, index: true, options: [{ label: 'Member', value: 'member' }, { label: 'Team', value: 'staff' }] },
    { name: 'uid', type: 'text', required: true, index: true },
    { name: 'endpoint', type: 'text', required: true, unique: true, index: true },
    { name: 'p256dh', type: 'text', required: true },
    { name: 'auth', type: 'text', required: true },
    { name: 'locale', type: 'text' },
  ],
}
