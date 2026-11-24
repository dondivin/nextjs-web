'use server'
import { revalidatePath } from 'next/cache'
import { actionUser, payloadClient, run } from '@/backoffice/lib/server'

const MUTE: Record<string, number | null> = { '1h': 3600e3, '24h': 86400e3, '7d': 7 * 86400e3, forever: null }

async function deleteMessageInternal(id: string, by: string) {
  const payload = await payloadClient()
  await payload.update({ collection: 'chat-messages', id, data: { deleted: true, deletedBy: by, deletedAt: new Date().toISOString() } })
}

async function muteMember(id: string, duration: string) {
  const payload = await payloadClient()
  const ms = MUTE[duration]
  await payload.update({ collection: 'members', id, data: { status: 'muted', mutedUntil: ms ? new Date(Date.now() + ms).toISOString() : null } })
}

/** Resolve a report: optionally delete the message and mute or ban the author. */
export async function resolveReport(reportId: string, opts: { deleteMessage?: boolean; mute?: string | null; ban?: boolean; dismiss?: boolean }) {
  return run(async () => {
    const user = await actionUser('moderator')
    const payload = await payloadClient()
    const report = await payload.findByID({ collection: 'chat-reports', id: reportId, depth: 0 })
    const messageId = typeof report.message === 'object' ? report.message?.id : report.message
    const authorId = typeof report.messageAuthor === 'object' ? report.messageAuthor?.id : report.messageAuthor
    if (!opts.dismiss) {
      if (opts.deleteMessage && messageId) await deleteMessageInternal(String(messageId), user.email)
      if (opts.ban && authorId) await payload.update({ collection: 'members', id: authorId, data: { status: 'banned' } })
      else if (opts.mute && authorId) await muteMember(String(authorId), opts.mute)
    }
    // close every open report about the same message
    const same = await payload.find({ collection: 'chat-reports', where: { and: [{ message: { equals: messageId } }, { status: { equals: 'open' } }] }, pagination: false, depth: 0 })
    for (const r of same.docs) {
      await payload.update({ collection: 'chat-reports', id: r.id, data: { status: opts.dismiss ? 'dismissed' : 'actioned', handledBy: user.id, handledAt: new Date().toISOString() } })
    }
    revalidatePath('/admin', 'layout')
  })
}

export async function setMessageDeleted(id: string, deleted: boolean) {
  return run(async () => {
    const user = await actionUser('moderator')
    const payload = await payloadClient()
    await payload.update({ collection: 'chat-messages', id, data: deleted ? { deleted: true, deletedBy: user.email, deletedAt: new Date().toISOString() } : { deleted: false, deletedBy: null, deletedAt: null } })
    revalidatePath('/admin/moderation')
  })
}

export async function setMemberStatus(id: string, status: 'active' | 'muted' | 'banned', duration?: string) {
  return run(async () => {
    await actionUser('moderator')
    const payload = await payloadClient()
    if (status === 'muted') await muteMember(id, duration || '24h')
    else await payload.update({ collection: 'members', id, data: { status, mutedUntil: null } })
    revalidatePath('/admin/moderation')
  })
}

export async function setMemberRole(id: string, role: 'fan' | 'agent' | 'moderator') {
  return run(async () => {
    await actionUser('moderator')
    const payload = await payloadClient()
    await payload.update({ collection: 'members', id, data: { role } })
    revalidatePath('/admin/moderation')
  })
}
