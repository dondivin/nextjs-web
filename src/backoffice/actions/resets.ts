'use server'
import { revalidatePath } from 'next/cache'
import { actionUser, payloadClient, run } from '@/backoffice/lib/server'

/** Approve or decline a fan's "forgot password" request. Approving lets the fan's own browser set a new password (48 h). */
export async function decideReset(id: string, decision: 'approve' | 'deny') {
  return run(async () => {
    const user = await actionUser('moderator')
    const payload = await payloadClient()
    const doc = await payload.findByID({ collection: 'password-resets', id, depth: 0, overrideAccess: true })
    const staff = doc.kind === 'staff'
    // a moderator must never be able to hand someone else a team (or owner) account
    if (staff && !(user.roles || []).includes('owner')) throw new Error('Only an owner can handle password resets for team accounts.')
    if (staff && decision === 'approve' && String(typeof doc.user === 'object' ? doc.user?.id : doc.user) === String(user.id)) throw new Error('Another owner has to approve a reset of your own account.')
    if (staff && decision === 'approve') {
      const main = await payload.find({ collection: 'users', sort: 'createdAt', limit: 1, depth: 0, overrideAccess: true, select: {} })
      if (main.docs[0] && String(typeof doc.user === 'object' ? doc.user?.id : doc.user) === String(main.docs[0].id)) throw new Error('This is the main admin account. It can only be reset on the server (pnpm admin:reset-password). Decline this request.')
    }
    if (doc.status !== 'pending') throw new Error('This request was already handled.')
    if (decision === 'approve' && !(staff ? doc.user : doc.member)) throw new Error('No account uses this email, so there is nothing to reset. Decline it instead.')
    await payload.update({
      overrideAccess: true,
      collection: 'password-resets',
      id,
      data: { status: decision === 'approve' ? 'approved' : 'denied', decidedBy: user.id, decidedAt: new Date().toISOString() },
    })
    revalidatePath('/admin', 'layout')
  })
}
