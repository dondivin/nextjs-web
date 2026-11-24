import { getPayload } from 'payload'
import config from '/Users/dondivin/Documents/divin/new/prod/oddsclub/src/payload.config'
const payload = await getPayload({ config })
const mode = process.argv[2]
if (mode === 'setup') {
  const role = await payload.create({ collection: 'member-roles', data: { name: 'Test Creator', color: '#D6409F', createGroups: true, createChannels: true, maxRooms: 2, sendPictures: true, privateChats: true, showBadge: true, order: 9 } })
  const a = await payload.find({ collection: 'members', where: { email: { equals: 'chat-test-ra@example.com' } } })
  await payload.update({ collection: 'members', id: a.docs[0].id, data: { memberRole: role.id } })
  console.log('role', role.id, 'member', a.docs[0].id)
} else {
  const ms = await payload.find({ collection: 'members', where: { email: { like: 'chat-test-' } }, pagination: false })
  const ids = ms.docs.map((m) => String(m.id))
  const rooms = await payload.find({ collection: 'chat-rooms', where: { or: [{ owner: { in: ids } }, { name: { like: 'Test' } }] }, pagination: false })
  for (const r of rooms.docs) {
    await payload.delete({ collection: 'chat-room-members', where: { room: { equals: r.id } } , overrideAccess: true})
    await payload.delete({ collection: 'chat-messages', where: { room: { equals: 'g:' + r.id } }, overrideAccess: true })
    await payload.delete({ collection: 'chat-rooms', id: r.id, overrideAccess: true })
  }
  await payload.delete({ collection: 'chat-room-members', where: { member: { in: ids } }, overrideAccess: true })
  await payload.delete({ collection: 'chat-messages', where: { author: { in: ids } }, overrideAccess: true }).catch(() => {})
  for (const id of ids) await payload.delete({ collection: 'members', id, overrideAccess: true })
  await payload.delete({ collection: 'member-roles', where: { name: { equals: 'Test Creator' } }, overrideAccess: true })
  console.log('cleaned', ids.length, 'members', rooms.docs.length, 'rooms')
}
process.exit(0)
