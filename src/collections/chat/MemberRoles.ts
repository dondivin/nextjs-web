import type { CollectionConfig } from 'payload'
import { anyone, hasRole } from '../../access'
import { onRolesChange } from '../../chat/hooks'

/**
 * Roles for chat members (made in the back office → Member roles). Each role is a set of rights; every member has one role
 * (none set = the default role). Back-office accounts (users) have their own roles; the team can do everything in the chat.
 */
export const MemberRoles: CollectionConfig = {
  slug: 'member-roles',
  admin: { useAsTitle: 'name', group: 'Chat', defaultColumns: ['name', 'isDefault', 'createGroups', 'createChannels', 'order'] },
  defaultSort: 'order',
  hooks: {
    afterChange: [
      // only one default role
      async ({ doc, req, context }) => {
        if (doc.isDefault && !context.skipDefault) {
          const others = await req.payload.find({ collection: 'member-roles', where: { and: [{ isDefault: { equals: true } }, { id: { not_equals: doc.id } }] }, limit: 50, depth: 0, overrideAccess: true, req })
          for (const o of others.docs) await req.payload.update({ collection: 'member-roles', id: o.id, data: { isDefault: false }, context: { skipDefault: true }, overrideAccess: true, req })
        }
        return doc
      },
      onRolesChange,
    ],
    afterDelete: [onRolesChange],
  },
  access: {
    read: anyone,
    create: ({ req }) => hasRole(req.user as never, 'moderator'),
    update: ({ req }) => hasRole(req.user as never, 'moderator'),
    delete: ({ req }) => hasRole(req.user as never, 'moderator'),
  },
  fields: [
    { name: 'name', type: 'text', required: true, maxLength: 30 },
    { name: 'description', type: 'text', maxLength: 140 },
    { name: 'color', type: 'text', defaultValue: '#3E63DD', admin: { description: 'Badge colour (hex)' } },
    { name: 'isDefault', type: 'checkbox', defaultValue: false, admin: { description: 'Given to every new account (and to members without a role)' } },
    { name: 'order', type: 'number', defaultValue: 0 },
    // rights
    { name: 'createGroups', type: 'checkbox', defaultValue: false },
    { name: 'createChannels', type: 'checkbox', defaultValue: false },
    { name: 'maxRooms', type: 'number', defaultValue: 3, min: 0, max: 100, admin: { description: 'How many groups/channels one member may own' } },
    { name: 'sendPictures', type: 'checkbox', defaultValue: false, admin: { description: 'Pictures in rooms and groups (everyone can send pictures to the partner team)' } },
    { name: 'privateChats', type: 'checkbox', defaultValue: true, admin: { description: 'Send chat requests to other members' } },
    { name: 'showBadge', type: 'checkbox', defaultValue: false, admin: { description: 'Show the role name next to their name in the chat' } },
  ],
}
