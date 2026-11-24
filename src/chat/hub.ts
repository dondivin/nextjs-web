/**
 * In-process realtime hub for the site chat.
 * Every open chat stream (SSE connection, one per browser tab) is a client here. Payload hooks and the chat API
 * publish events through this hub; it keeps the presence list (who is online, in which room, typing).
 *
 * State lives on globalThis so every Next.js route bundle and the Payload hooks share the same instance.
 * Single server process only. For several instances, swap broadcast() for a Redis pub/sub fan-out.
 */
export type ViewerKind = 'anon' | 'member' | 'staff'
export type Viewer = { kind: ViewerKind; uid: string | null }
export type Presence = { room: string | null; typing: boolean }
export type ChatEvent = { type: string; [k: string]: unknown }
export type Client = { id: string; viewer: Viewer; presence: Presence; send: (e: ChatEvent) => void }

type Hub = {
  clients: Map<string, Client>
  peersTimer: ReturnType<typeof setTimeout> | null
  lastPost: Map<string, number> // uid → time of the last message (slow mode)
}

const g = globalThis as unknown as { __ocChatHub?: Hub }
export const hub: Hub = g.__ocChatHub || (g.__ocChatHub = { clients: new Map(), peersTimer: null, lastPost: new Map() })

export function broadcast(event: ChatEvent, filter?: (c: Client) => boolean) {
  for (const c of hub.clients.values()) {
    if (filter && !filter(c)) continue
    c.send(event)
  }
}

export const toStaff = (c: Client) => c.viewer.kind === 'staff'
export const toUid = (uid: string) => (c: Client) => c.viewer.uid === uid

export function peersList() {
  return [...hub.clients.values()].map((c) => ({
    c: c.id,
    by: c.viewer.uid,
    presence: { room: c.presence.room, typing: c.presence.typing, uid: c.viewer.uid },
  }))
}

/** Presence changes are batched (250 ms) so a burst of typing updates sends one peers event. */
export function schedulePeers() {
  if (hub.peersTimer) return
  hub.peersTimer = setTimeout(() => {
    hub.peersTimer = null
    broadcast({ type: 'peers', peers: peersList() })
  }, 250)
}

export function addClient(c: Client) {
  hub.clients.set(c.id, c)
  schedulePeers()
}

export function removeClient(id: string) {
  if (hub.clients.delete(id)) schedulePeers()
}

export function setPresence(id: string, uid: string | null, p: Partial<Presence>) {
  const c = hub.clients.get(id)
  if (!c || c.viewer.uid !== uid) return false
  if (p.room !== undefined) c.presence.room = p.room
  if (p.typing !== undefined) c.presence.typing = p.typing
  schedulePeers()
  return true
}
