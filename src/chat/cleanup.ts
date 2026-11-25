import type { Payload, Where } from 'payload'

/*
 * Media clean-up: chat pictures and voice messages older than Chat settings → "Delete pictures and voice messages after N
 * days" are removed from storage (R2). Their messages stay, marked `mediaExpired` ('photo' | 'voice'), so the chat shows
 * "Photo expired" / "Voice message expired". 0 days = keep forever (the default).
 * Runs in the server process: a minute after start, then every 6 hours (one VPS, one process); also on demand from the back office.
 */
const EVERY_MS = 6 * 3600e3
const g = globalThis as unknown as { __ocMediaCleanup?: { timer: ReturnType<typeof setInterval> | null; running: boolean } }
const state = g.__ocMediaCleanup || (g.__ocMediaCleanup = { timer: null, running: false })

export type CleanupResult = { days: number; pictures: number; voices: number; freedBytes: number }

export async function runMediaCleanup(payload: Payload, opts: { days?: number; rooms?: string[] } = {}): Promise<CleanupResult> {   // rooms: limit to these (tests)
  const cfg = await payload.findGlobal({ slug: 'chat-settings', depth: 0 })
  const days = opts.days ?? (Number(cfg.mediaRetentionDays) || 0)
  const out: CleanupResult = { days, pictures: 0, voices: 0, freedBytes: 0 }
  if (!days || days <= 0 || state.running) return out
  state.running = true
  try {
    const cutoff = new Date(Date.now() - days * 86400e3).toISOString()
    for (const [collection, field, kind] of [['chat-images', 'image', 'photo'], ['chat-voice', 'voice', 'voice']] as const) {
      // in batches, oldest first
      for (;;) {
        const where: Where = opts.rooms ? { and: [{ createdAt: { less_than: cutoff } }, { room: { in: opts.rooms } }] } : { createdAt: { less_than: cutoff } }
        const old = await payload.find({ collection, where, sort: 'createdAt', limit: 100, depth: 0, overrideAccess: true })
        if (!old.docs.length) break
        for (const f of old.docs) {
          const id = String(f.id)
          const msgs = await payload.find({ collection: 'chat-messages', where: { [field]: { equals: id } }, pagination: false, depth: 0, overrideAccess: true, select: { room: true } })
          for (const m of msgs.docs) await payload.update({ collection: 'chat-messages', id: m.id, data: { [field]: null, mediaExpired: kind } as never, overrideAccess: true })
          await payload.delete({ collection, id, overrideAccess: true })   // the storage plugin deletes the file from R2
          out.freedBytes += Number(f.filesize) || 0
          if (kind === 'photo') out.pictures++
          else out.voices++
        }
        if (old.docs.length < 100) break
      }
    }
    if (out.pictures || out.voices) payload.logger.info(`[chat] media clean-up (${days} days): ${out.pictures} pictures, ${out.voices} voice messages, ${Math.round(out.freedBytes / 1024)} KB freed`)
  } finally {
    state.running = false
  }
  return out
}

/** Start the background timer once per server process (called when the chat stream is used). */
export function scheduleMediaCleanup(payload: Payload) {
  if (state.timer) return
  const tick = () => { runMediaCleanup(payload).catch((e) => payload.logger.error({ err: e, msg: '[chat] media clean-up failed' })) }
  state.timer = setInterval(tick, EVERY_MS)
  setTimeout(tick, 60e3)
}

/** What is stored now (for the back office). */
export async function mediaUsage(payload: Payload) {
  const sum = async (collection: 'chat-images' | 'chat-voice') => {
    const res = await payload.find({ collection, pagination: false, depth: 0, overrideAccess: true, select: { filesize: true, createdAt: true } as never })
    const docs = res.docs as { filesize?: number | null; createdAt: string }[]
    return { count: docs.length, bytes: docs.reduce((t, d) => t + (Number(d.filesize) || 0), 0), oldest: docs.reduce((o: string | null, d) => (!o || d.createdAt < o ? d.createdAt : o), null) }
  }
  return { pictures: await sum('chat-images'), voices: await sum('chat-voice') }
}
