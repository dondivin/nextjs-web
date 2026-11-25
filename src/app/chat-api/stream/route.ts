import { getPayload } from 'payload'
import config from '@payload-config'
import { addClient, removeClient, type ChatEvent } from '@/chat/hub'
import { context, snapshot } from '@/chat/service'
import { scheduleMediaCleanup } from '@/chat/cleanup'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /chat-api/stream?locale=en — the live chat feed (Server-Sent Events), one per open tab.
 * First event: `hello` (everything the chat needs); then `msg`, `peers`, `mod`, `reports`, `thread`, `matches`, …
 * Events published while the hello is being built are queued, so nothing is missed between the two.
 */
export async function GET(req: Request) {
  const payload = await getPayload({ config })
  scheduleMediaCleanup(payload)   // once per server process: deletes old chat media if Chat settings ask for it
  const locale = new URL(req.url).searchParams.get('locale') || 'en'
  const ctx = await context(payload, req.headers, locale)
  const id = crypto.randomUUID()
  const enc = new TextEncoder()
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let closed = false

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(enc.encode(chunk))
        } catch {
          cleanup()
        }
      }
      const cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        removeClient(id)
        try {
          controller.close()
        } catch {}
      }
      req.signal.addEventListener('abort', cleanup)

      let queue: ChatEvent[] | null = []
      const send = (e: ChatEvent) => (queue ? queue.push(e) : write(`data: ${JSON.stringify(e)}\n\n`))
      addClient({ id, viewer: ctx.viewer, presence: { room: null, typing: false }, send, close: cleanup })
      try {
        const hello = await snapshot(ctx, id)
        write(`retry: 3000\ndata: ${JSON.stringify({ type: 'hello', ...hello })}\n\n`)
        const pending = queue
        queue = null
        pending.forEach(send)
      } catch (e) {
        payload.logger.error({ err: e, msg: '[chat] stream hello failed' })
        write(`data: ${JSON.stringify({ type: 'error' })}\n\n`)
        cleanup()
        return
      }
      heartbeat = setInterval(() => write(': ping\n\n'), 20_000)
    },
    cancel() {
      closed = true
      clearInterval(heartbeat)
      removeClient(id)
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  })
}
