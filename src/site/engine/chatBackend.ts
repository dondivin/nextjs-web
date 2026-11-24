// @ts-nocheck
/*
 * Chat backend adapter used by the engine. The engine only talks to this object.
 * Phase 1a: no live backend yet → reports "unavailable" so the chat shows its gate message (same as the
 * prototype when opened outside claude.ai). Phase 1b replaces this with the real API + SSE implementation.
 */
import type { EngineConfig } from './types'

export function createChatBackend(cfg: EngineConfig, h) {
  const no = () => Promise.reject(new Error(h.S('chat.gate.unavailable')))
  return {
    connect() { h.unavailable() },
    profiles: async () => ({}),
    send: no, react: no, report: no, mute: no, remove: no, acceptRules: no,
    presence() {}, touchSeen() {}, watchThread() {}, openSignIn() {},
    addOptimistic() {}, dropOptimistic() {},
  }
}
