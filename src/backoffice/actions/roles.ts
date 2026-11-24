'use server'
import { revalidatePath } from 'next/cache'
import { actionUser, payloadClient, run } from '@/backoffice/lib/server'
import { roleSchema, type RoleForm } from '@/backoffice/lib/forms'

export async function saveRole(id: string | null, input: RoleForm) {
  return run(async () => {
    await actionUser('moderator')
    const data = roleSchema.parse(input)
    const payload = await payloadClient()
    if (id && !data.isDefault) {
      const cur = await payload.findByID({ collection: 'member-roles', id, depth: 0 })
      if (cur.isDefault) throw new Error('One role must stay the default. Make another role the default instead.')
    }
    const doc = id ? await payload.update({ collection: 'member-roles', id, data }) : await payload.create({ collection: 'member-roles', data })
    revalidatePath('/admin', 'layout')
    return String(doc.id)
  })
}

/** Delete a role; its members fall back to the default role. */
export async function deleteRole(id: string) {
  return run(async () => {
    await actionUser('moderator')
    const payload = await payloadClient()
    const role = await payload.findByID({ collection: 'member-roles', id, depth: 0 })
    if (role.isDefault) throw new Error('The default role can’t be deleted. Make another role the default first.')
    const users = await payload.find({ collection: 'members', where: { memberRole: { equals: id } }, pagination: false, depth: 0, select: {}, overrideAccess: true })
    for (const m of users.docs) await payload.update({ collection: 'members', id: m.id, data: { memberRole: null }, overrideAccess: true })
    await payload.delete({ collection: 'member-roles', id })
    revalidatePath('/admin', 'layout')
    return users.docs.length
  })
}
