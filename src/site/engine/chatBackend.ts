// @ts-nocheck
/*
 * Chat backend adapter used by the engine. The engine only talks to this object (see `createChatBackend(cfg, h)` in engine.ts).
 *
 * Live data comes from one Server-Sent Events stream (GET /chat-api/stream); actions are JSON POSTs (/chat-api/<action>).
 * The first stream event (`hello`) carries everything; later events are deltas that this adapter folds into full lists,
 * because the engine's hooks (h.messages, h.myDm, h.dm …) always take the whole list.
 *
 * Rooms: the server stores direct chats as 'dm:<memberId>'. The engine calls a member's own direct chat 'support'
 * and, for staff, each member's chat 'sup:<memberId>'. view() translates.
 *
 * Also owns the sign-in / sign-up / account sheet (#authSheet) and the account button in the chat sidebar (#chatAccount).
 */
import type { EngineConfig } from './types'
import { randomGradient, ROOM_COLORS } from '../../chat/gradient'

export function createChatBackend(cfg: EngineConfig, h) {
  const base = cfg.apiBase || '/chat-api'
  const S = h.S
  let es = null, conn = null, helloAt = 0, failTimer = 0, retryTimer = 0
  let me = { uid: null, staff: false }, info = null
  const st = { messages: [], myDm: [], dms: {}, watching: {}, threads: {}, pms: {}, pm: {}, peers: [], groups: [], g: {}, rc: {}, grc: {} }
  // grc['g:<id>'][memberId] = {delivered, read}: each other member's position in a group / channel
  // rc[browserRoom] = {delivered, read}: how far the OTHER side of a one-to-one chat has received / seen it (message times)
  // groups = rooms made by the team that this viewer sees; g[id] = messages of the ones they can read
  // pms[uid] = relation with that member ({status, note, at, lastSeen}); pm[uid] = messages of our private chat
  const known = {} // every profile seen so far (id → {name, gradient, avatarUrl, …})
  const learn = (p) => { if (p) Object.assign(known, p); return p }
  const pres = { room: null, typing: false }, sent = { conn: null, room: undefined, typing: undefined }

  /* ---------- helpers ---------- */
  /* A button that asks the server something shows a spinner on itself until the answer comes back (sign in, create an
     account, join, save, report…) — before, it only faded and looked stuck. Done here once for every request: the button
     the person just pressed (or the form they just sent) is the one waiting. Background requests (presence, receipts,
     loading lists…) and sending messages (they have their own sending state) never take a button. */
  let pressed = null, pressedAt = 0
  const remember = (b) => { if (b) { pressed = b; pressedAt = Date.now() } }
  document.addEventListener('click', (e) => remember(e.target && e.target.closest && e.target.closest('button, .btn')), true)
  document.addEventListener('submit', (e) => remember(e.submitter || (e.target && e.target.querySelector && e.target.querySelector('[type="submit"]'))), true)
  const QUIET = new Set(['presence', 'receipt', 'profiles', 'history', 'people', 'groups', 'thread', 'room-info', 'room-members', 'stickers', 'reset-status', 'send', 'react', 'rules'])
  function busyButton(action) {
    const b = pressed
    if (QUIET.has(action) || !b || !b.isConnected || Date.now() - pressedAt > 2000 || b.classList.contains('is-busy') || b.getAttribute('role') === 'switch') return () => {}   // (a switch shows its own state)
    pressed = null
    const wasDisabled = b.disabled
    b.disabled = true; b.setAttribute('aria-busy', 'true')
    const t = setTimeout(() => b.classList.add('is-busy'), 120)   // a quick answer: no spinner flash
    return () => { clearTimeout(t); b.classList.remove('is-busy'); b.removeAttribute('aria-busy'); if (!wasDisabled) b.disabled = false }
  }
  async function post(action, body) {
    const done = busyButton(action)
    try { return await postRaw(action, body) } finally { done() }
  }
  async function postRaw(action, body) {
    let r, d = {}
    try {
      r = await fetch(base + '/' + action, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-oc-locale': cfg.locale }, body: JSON.stringify(body || {}) })
      d = await r.json().catch(() => ({}))
    } catch (e) {
      throw new Error(S('chat.sendFailed'))
    }
    if (!r.ok || d.error) throw new Error(d.error || S('chat.sendFailed'))
    return d
  }
  function view(w) {
    let room = w.room
    if (room.indexOf('dm:') === 0) { const uid = room.slice(3); room = !me.staff && uid === me.uid ? 'support' : 'sup:' + uid }
    else if (room.indexOf('pm:') === 0) room = 'pm:' + pmOther(room)
    return { id: w.id, by: w.by, text: w.text, ts: w.ts, room, reply: w.reply || null, reactions: w.reactions || {}, image: w.image || undefined, voice: w.voice || undefined, expired: w.expired || undefined, locked: w.locked || undefined, nosave: w.nosave || undefined, mod: w.mod || undefined, fwd: w.fwd || undefined, clientId: w.clientId }
  }
  // the other member of a stored private room 'pm:<a>_<b>'
  function pmOther(room) { const [a, b] = room.slice(3).split('_'); return a === me.uid ? b : a }
  // which list a stored room belongs to: ['messages'] | ['myDm'] | ['dm', uid] | ['pm', uid]
  function slot(room) {
    if (room.indexOf('g:') === 0) return ['g', room.slice(2)]
    if (room.indexOf('pm:') === 0) return room.slice(3).split('_').includes(me.uid) ? ['pm', pmOther(room)] : null
    if (room.indexOf('dm:') !== 0) return ['messages']
    const uid = room.slice(3)
    return me.staff ? ['dm', uid] : uid === me.uid ? ['myDm'] : null
  }
  function getList(s) { return s[0] === 'dm' ? (st.dms[s[1]] = st.dms[s[1]] || []) : s[0] === 'pm' ? (st.pm[s[1]] = st.pm[s[1]] || []) : s[0] === 'g' ? (st.g[s[1]] = st.g[s[1]] || []) : st[s[0]] }
  function emit(s, mode) {
    if (s[0] === 'messages') h.messages(st.messages.slice(), mode)
    else if (s[0] === 'myDm') h.myDm(st.myDm.slice(), mode)
    else if (s[0] === 'pm') h.pmMsgs(s[1], (st.pm[s[1]] || []).slice(), mode)
    else if (s[0] === 'g') h.groupMsgs(s[1], (st.g[s[1]] || []).slice(), mode)
    else h.dm(s[1], (st.dms[s[1]] || []).slice(), mode)
  }
  function upsert(list, m) {
    let i = list.findIndex((x) => x.id === m.id || (m.clientId && x.id === m.clientId))
    if (i >= 0) { list[i] = m; return false }
    list.push(m)
    if (list.length > 1 && list[list.length - 2].ts > m.ts) list.sort((a, b) => a.ts - b.ts)
    if (list.length > 3000) list.splice(0, list.length - 3000)   // (older pages loaded by scrolling up stay)
    return true
  }
  function peers(list) { return (list || []).map((p) => ({ kind: 'viewer', by: p.by, isMe: p.c === conn, presence: p.presence })) }

  /* ---------- stream ---------- */
  function connect() {
    clearTimeout(failTimer); clearTimeout(retryTimer)
    if (typeof EventSource === 'undefined') { h.unavailable(); return }
    try { es = new EventSource(base + '/stream?locale=' + encodeURIComponent(cfg.locale)) } catch (e) { h.unavailable(); return }
    // no hello after 12 s: show the "not available" gate (the stream keeps retrying in the background)
    failTimer = setTimeout(() => { if (!helloAt) h.unavailable() }, 12000)
    es.onmessage = (e) => { let d; try { d = JSON.parse(e.data) } catch (x) { return } on(d) }
    es.onerror = () => {
      if (es && es.readyState === 2) { es = null; retryTimer = setTimeout(connect, 4000) } // closed for good → reconnect ourselves
    }
  }
  function reconnect() {
    if (es) es.close()
    es = null; conn = null; helloAt = 0
    connect()
  }

  function on(d) {
    switch (d.type) {
      case 'hello': {
        clearTimeout(failTimer); helloAt = Date.now(); conn = d.conn
        me = { uid: d.uid, staff: !!d.staff }
        info = { uid: d.uid, canPost: d.canPost, canEdit: d.canEdit, me: d.me, profiles: learn(d.profiles), rulesAccepted: d.rulesAccepted, perms: d.perms || {} }
        st.messages = (d.messages || []).map(view); st.myDm = (d.myDm || []).map(view)
        const watched = Object.keys(st.watching); st.dms = {}; st.watching = {}
        st.threads = d.threads || {}
        h.ready(info)
        pushSync().catch(() => {})
        h.mod(d.muted || {}); h.myReports(d.myReports || []); h.reports(d.reports || {})
        h.agent(d.agent)
        if (me.staff) h.threads(Object.assign({}, st.threads))
        h.messages(st.messages.slice())
        if (me.uid && !me.staff) h.myDm(st.myDm.slice())
        st.pms = {}; st.pm = {}
        ;(d.pms || []).forEach((r) => { st.pms[r.uid] = r })
        h.pms(Object.assign({}, st.pms))
        for (const uid in d.pmMsgs || {}) { st.pm[uid] = d.pmMsgs[uid].map(view); h.pmMsgs(uid, st.pm[uid].slice()) }
        applyGroups(d.groups || [], d.gMsgs || {}, true)
        st.rc = {}; st.grc = {}; (d.receipts || []).forEach(applyReceipt); pushReceipts()
        deliveredAll()
        st.peers = d.peers || []
        h.peers(peers(d.peers))
        watched.forEach(watchThread)
        renderPeople()
        sent.conn = null; flushPresence()
        accountButton(); remindReset()
        break
      }
      case 'msg': {
        const s = slot(d.m.room); if (!s) return
        if (d.profiles && Object.keys(d.profiles).length) h.profiles(learn(d.profiles))
        if (!d.m.deleted && d.m.by !== me.uid) gotOne(s, d.m)
        if (s[0] === 'dm' && !st.dms[s[1]]) return // staff: thread not open yet, its list loads on watchThread
        const list = getList(s), m = view(d.m)
        if (d.m.deleted) { const i = list.findIndex((x) => x.id === m.id); if (i < 0) return; list.splice(i, 1); emit(s); return }
        const added = upsert(list, m)
        emit(s, added || m.clientId ? (m.by === me.uid ? 'mine' : 'new') : undefined)
        break
      }
      case 'thread':
        if (d.profiles) h.profiles(d.profiles)
        st.threads[d.uid] = d.info; h.threads(Object.assign({}, st.threads)); break
      case 'profiles': h.profiles(learn(d.profiles || {})); break
      case 'agent': h.agent(d.agent); break
      case 'mod': h.mod(d.muted || {}); break
      case 'access': if (info) { info.canPost = !!d.canPost; h.ready(info) } break
      case 'reports': h.reports(d.counts || {}); break
      case 'myReports': h.myReports(d.ids || []); break
      case 'matches': h.matches(d.matches || []); break
      case 'peers': st.peers = d.peers || []; h.peers(peers(d.peers)); learnPeers(); renderPeople(); break
      case 'receipt': applyReceipt(d.receipt); pushReceipts(); break
      case 'groups': refreshGroups(); if (rs.open && rs.id) loadMembers(); if (gi.open) loadGroupInfo(); break
      case 'rolesChanged': reconnect(); break // our role (or its rights) changed: fresh hello with the new rights and badges
      case 'pm': {
        if (d.profiles) h.profiles(learn(d.profiles))
        const before = st.pms[d.uid] && st.pms[d.uid].status, now = d.rel && d.rel.status
        if (!now || now === 'none') delete st.pms[d.uid]
        else st.pms[d.uid] = Object.assign({}, st.pms[d.uid], d.rel)
        if (now === 'accepted' && !st.pm[d.uid]) { st.pm[d.uid] = []; h.pmMsgs(d.uid, []) }
        h.pms(Object.assign({}, st.pms))
        const who = (known[d.uid] && known[d.uid].name) || h.nameOf(d.uid)
        if (now === 'pending-in' && before !== 'pending-in') h.toast(S('pm.incoming', { name: who }), true)
        if (now === 'accepted' && before === 'pending-out') h.toast(S('pm.acceptedToast', { name: who }), true)
        renderPeople(); if (cardUid === d.uid) renderCard()
        break
      }
      case 'error': h.unavailable(); break
    }
  }

  /* ---------- delivery / read receipts (one-to-one chats: private chats and the direct chat with the team) ----------
     Incoming: the other side's position per room → the engine draws ✓ / ✓✓ / ✓✓ read on our messages.
     Outgoing: this device received a message (delivered) or the conversation was on screen (read, sent by the engine). */
  function rcRoom(stored) {
    if (stored.indexOf('pm:') === 0) return stored.slice(3).split('_').includes(me.uid) ? 'pm:' + pmOther(stored) : null
    if (stored.indexOf('dm:') === 0) { const id = stored.slice(3); return me.staff ? 'sup:' + id : id === me.uid ? 'support' : null }
    return null
  }
  function pushReceipts() { h.receipts(Object.assign({}, st.rc), JSON.parse(JSON.stringify(st.grc))) }
  const isMemberOf = (gid) => { const g = st.groups.find((x) => x.id === gid); return !!(g && (g.status === 'member' || g.isOwner)) }   // the owner of a team-made room has no membership row
  function applyReceipt(r) {
    if (!r || r.reader === me.uid || (me.staff && r.reader === 'team')) return   // our own position: not shown to us
    if (r.room.indexOf('g:') === 0) {   // group / channel: keep every member's position
      const g = (st.grc[r.room] = st.grc[r.room] || {}), cur = g[r.reader] || { delivered: 0, read: 0 }
      g[r.reader] = { delivered: Math.max(cur.delivered, r.delivered || 0, r.read || 0), read: Math.max(cur.read, r.read || 0) }
      return
    }
    const room = rcRoom(r.room); if (!room) return
    const cur = st.rc[room] || { delivered: 0, read: 0 }
    st.rc[room] = { delivered: Math.max(cur.delivered, r.delivered || 0, r.read || 0), read: Math.max(cur.read, r.read || 0) }
  }
  const rcSent = {}, rcQueue = {}
  let rcTimer = 0
  function queueReceipt(room, kind, ts) {
    if (!room || !ts || !me.uid) return
    const k = room + '|' + kind
    if ((rcSent[k] || 0) >= ts || (rcQueue[k] && rcQueue[k].ts >= ts)) return
    rcQueue[k] = { room, kind, ts }
    clearTimeout(rcTimer); rcTimer = setTimeout(flushReceipts, kind === 'read' ? 120 : 350)   // short wait only to bundle several rooms in one request
  }
  function flushReceipts() {
    const items = Object.values(rcQueue); if (!items.length) return
    for (const k in rcQueue) delete rcQueue[k]
    items.forEach((it) => { rcSent[it.room + '|' + it.kind] = Math.max(rcSent[it.room + '|' + it.kind] || 0, it.ts) })
    post('receipt', { items }).catch(() => { items.forEach((it) => { delete rcSent[it.room + '|' + it.kind] }) })
  }
  // a message from the other side reached this device
  function gotOne(s, m) {
    if (s[0] === 'pm') queueReceipt('pm:' + s[1], 'delivered', m.ts)
    else if (s[0] === 'myDm') queueReceipt('support', 'delivered', m.ts)
    else if (s[0] === 'dm' && m.by === s[1]) queueReceipt('sup:' + s[1], 'delivered', m.ts)   // staff: the member wrote
    else if (s[0] === 'g' && isMemberOf(s[1])) queueReceipt('g:' + s[1], 'delivered', m.ts)   // a group we joined
  }
  // after connecting: everything loaded counts as received
  function deliveredAll() {
    const newest = (list, skip) => list.reduce((t, m) => (!skip(m) && m.ts > t ? m.ts : t), 0)
    for (const uid in st.pm) queueReceipt('pm:' + uid, 'delivered', newest(st.pm[uid], (m) => m.by === me.uid))
    if (!me.staff) queueReceipt('support', 'delivered', newest(st.myDm, (m) => m.by === me.uid))
    for (const gid in st.g) if (isMemberOf(gid)) queueReceipt('g:' + gid, 'delivered', newest(st.g[gid], (m) => m.by === me.uid))
  }

  /* ---------- groups & channels ---------- */
  function applyGroups(list, msgs, fresh) {
    const before = {}, mediaBefore = {}; st.groups.forEach((g) => { before[g.id] = g.status; mediaBefore[g.id] = JSON.stringify(g.media || null) })
    // a group's picture / voice rule changed: forget its messages so they load again with the new rule
    let reload = false
    if (!fresh) list.forEach((g) => { if (mediaBefore[g.id] !== undefined && mediaBefore[g.id] !== JSON.stringify(g.media || null) && st.g[g.id] && !msgs[g.id]) { delete st.g[g.id]; reload = true } })
    if (reload) setTimeout(refreshGroups, 0)
    st.groups = list
    if (fresh) st.g = {}
    for (const id in msgs) {
      st.g[id] = msgs[id].map(view); h.groupMsgs(id, st.g[id].slice())
      if (!fresh && isMemberOf(id)) queueReceipt('g:' + id, 'delivered', st.g[id].reduce((t, m) => (m.by !== me.uid && m.ts > t ? m.ts : t), 0))   // a group's messages loaded later (joined, refreshed)
    }
    // rooms this viewer can't read any more: forget their messages
    for (const id of Object.keys(st.g)) { const g = list.find((x) => x.id === id); if (!g || !g.canRead) { delete st.g[id]; h.groupMsgs(id, []) } }
    h.groups(list.slice())
    if (!fresh) list.forEach((g) => {
      if (g.status === 'invited' && before[g.id] !== 'invited') h.toast(S('groups.invitedToast', { name: g.name }), true)
      if (g.status === 'member' && before[g.id] === 'requested') h.toast(S('groups.acceptedToast', { name: g.name }), true)
    })
  }
  let groupsBusy = null, groupsAgain = false
  function refreshGroups() {
    if (groupsBusy) { groupsAgain = true; return groupsBusy }
    groupsBusy = (async () => {
      try {
        const d = await post('groups', { have: Object.keys(st.g) })
        if (d.profiles) h.profiles(learn(d.profiles))
        applyGroups(d.groups || [], d.gMsgs || {}, false)
      } catch (e) {} finally { groupsBusy = null; if (groupsAgain) { groupsAgain = false; refreshGroups() } }
    })()
    return groupsBusy
  }

  /* ---------- presence (merged, de-duplicated, at most ~3 posts a second) ---------- */
  let presTimer = 0
  function flushPresence() {
    clearTimeout(presTimer)
    presTimer = setTimeout(() => {
      if (!conn || (sent.conn === conn && sent.room === pres.room && sent.typing === pres.typing)) return
      sent.conn = conn; sent.room = pres.room; sent.typing = pres.typing
      post('presence', { conn, room: pres.room, typing: pres.typing }).catch(() => { sent.conn = null })
    }, 300)
  }
  setInterval(() => { if (conn && document.visibilityState !== 'hidden') { sent.conn = null; flushPresence() } }, 60000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && conn) { sent.conn = null; flushPresence() } })
  function watchThread(uid) {
    if (!uid || st.watching[uid]) return
    st.watching[uid] = true
    post('thread', { uid }).then((d) => {
      if (d.profiles) h.profiles(d.profiles)
      st.dms[uid] = (d.list || []).map(view); emit(['dm', uid])
      queueReceipt('sup:' + uid, 'delivered', st.dms[uid].reduce((t, m) => (m.by === uid && m.ts > t ? m.ts : t), 0))
    }, () => { delete st.watching[uid] })
  }

  /* ---------- sign in / sign up / forgot password / account sheet ----------
     modes: signin · signup · forgot (send a request to the team) · newpass (request approved: choose a password)
            notice (waiting / declined / expired) · account
     A forgot-password request is remembered in this browser ({id, token, email}); only this browser can finish it. */
  const $ = (id) => document.getElementById(id)
  const RESET_KEY = 'oc_pw_reset'
  const getReset = () => { try { const v = JSON.parse(localStorage.getItem(RESET_KEY) || 'null'); return v && v.id && v.token ? v : null } catch (e) { return null } }
  const setReset = (v) => { try { v ? localStorage.setItem(RESET_KEY, JSON.stringify(v)) : localStorage.removeItem(RESET_KEY) } catch (e) {} }
  let mode = 'signin', notice = null, lastFocus = null, pollTimer = 0
  function accountButton() { const b = $('chatAccount'); if (b) b.hidden = !me.uid; const n = $('newRoom'); if (n) n.hidden = !canCreate() }
  const show = (id, on) => { const e = $(id); if (e) e.hidden = !on }

  /* ---------- notifications of new messages (Web Push; server: src/chat/push.ts, worker: public/sw.js) ----------
     Offered to signed-in people: a card in the room list (once; "Not now" hides it for two weeks) and a switch in the
     account panel (+ "Show message text"). A group can be muted from its info panel. Signing out stops them on this
     device. iPhone: only when the site was added to the Home Screen — the card says how. */
  const PUSH_KEY = (cfg.chat && cfg.chat.pushKey) || null
  const push = { reg: null, sub: null, prefs: null, busy: false }
  const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const INSTALLED = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  const tag = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e }
  function pushSupport() {
    if (!PUSH_KEY) return 'off'                                   // not set up on this server
    const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext
    if (ok) return 'ok'
    return IOS && !INSTALLED ? 'ios-install' : 'no'
  }
  async function pushReg() {
    if (!push.reg) push.reg = await navigator.serviceWorker.register('/sw.js')
    return push.reg
  }
  async function pushCurrent() {
    if (pushSupport() !== 'ok') return null
    try { push.sub = await (await pushReg()).pushManager.getSubscription() } catch (e) { push.sub = null }
    return push.sub
  }
  function keyBytes(b64) {
    const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
    return Uint8Array.from(s, (c) => c.charCodeAt(0))
  }
  /** Turn on, from a tap (the browser only asks for permission after one). */
  async function pushOn() {
    if (Notification.permission === 'denied') throw new Error(S('push.blocked'))
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') throw new Error(S(perm === 'denied' ? 'push.blocked' : 'push.notAllowed'))
    const reg = await pushReg(); await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    // (the browser's own errors are technical English — e.g. private windows can't receive notifications)
    if (!sub) { try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUSH_KEY) }) } catch (e) { console.warn('[push]', e); throw new Error(S('push.err.failed')) } }
    await post('push-subscribe', { sub: sub.toJSON(), locale: cfg.locale })
    push.sub = sub
  }
  async function pushOff() {
    const sub = await pushCurrent()
    if (sub) { try { await postRaw('push-unsubscribe', { endpoint: sub.endpoint }) } catch (e) {} try { await sub.unsubscribe() } catch (e) {} }
    push.sub = null
  }
  async function pushPrefs(change) {
    push.prefs = await (change ? post('push-prefs', change) : postRaw('push-prefs', {}))
    return push.prefs
  }
  /** after connecting: this device's subscription belongs to whoever is signed in now (and stays fresh) */
  async function pushSync() {
    if (!me.uid || pushSupport() !== 'ok' || Notification.permission !== 'granted') return pushCard()
    const sub = await pushCurrent()
    if (sub) { try { await postRaw('push-subscribe', { sub: sub.toJSON(), locale: cfg.locale }) } catch (e) {} }
    pushCard()
  }
  const LATER = 'oc_push_later'
  // "Not now": remembered for two weeks — and for this visit in any case (when the browser can't store it, e.g. private
  // browsing, the card used to come back at the next refresh)
  function later() { if (push.dismissed) return true; try { return Date.now() - Number(localStorage.getItem(LATER) || 0) < 14 * 864e5 } catch (e) { return false } }
  /** the card folds away (height, padding and opacity), then is hidden */
  function foldAway(box) {
    if (box.hidden) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { box.hidden = true; return }
    box.style.height = box.offsetHeight + 'px'; void box.offsetHeight
    box.classList.add('closing'); box.style.height = '0px'
    setTimeout(() => { box.hidden = true; box.classList.remove('closing'); box.style.height = '' }, 320)
  }
  /** the card in the room list: "Get notified of new messages" */
  function pushCard() {
    const box = $('pushCard'); if (!box) return
    const st = pushSupport()
    const show = !!me.uid && !later() && ((st === 'ok' && Notification.permission === 'default' && !push.sub) || st === 'ios-install')
    box.hidden = !show; box.textContent = ''
    if (!show) return
    const ic = tag('span', 'push-ic'); ic.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>'
    const txt = tag('div', 'push-txt'); txt.appendChild(tag('b', null, S('push.cardTitle'))); txt.appendChild(tag('span', null, st === 'ios-install' ? S('push.iosHint') : S('push.cardBody')))
    const acts = tag('div', 'push-acts')
    const no = tag('button', 'btn-text', S('push.later')); no.type = 'button'
    no.onclick = () => { push.dismissed = true; try { localStorage.setItem(LATER, String(Date.now())) } catch (e) {} foldAway(box) }
    acts.appendChild(no)
    if (st === 'ok') {
      const yes = tag('button', 'btn btn-primary btn-sm', S('push.turnOn')); yes.type = 'button'
      // busy from the tap until it's done (the browser's "Allow notifications?" question can stay open a while)
      yes.onclick = () => {
        if (yes.classList.contains('is-busy')) return
        yes.classList.add('is-busy'); yes.setAttribute('aria-busy', 'true'); yes.disabled = true; no.disabled = true
        const done = () => { yes.classList.remove('is-busy'); yes.removeAttribute('aria-busy'); yes.disabled = false; no.disabled = false }
        pushOn().then(() => { done(); push.dismissed = true; foldAway(box); h.toast(S('push.enabled'), true); renderPushBox() }, (e) => { done(); h.toast(e.message); if (Notification.permission === 'denied') foldAway(box) })
      }
      acts.appendChild(yes)
    }
    box.appendChild(ic); box.appendChild(txt); box.appendChild(acts)
  }
  /** the account panel: notifications on / off + "Show message text" */
  function renderPushBox() {
    const box = $('authPush'); if (!box) return
    const st = pushSupport()
    box.hidden = !me.uid || st === 'off'; box.textContent = ''
    if (box.hidden) return
    const head = tag('div', 'push-row')
    const label = tag('div', 'push-txt'); label.appendChild(tag('b', null, S('push.title')))
    head.appendChild(label); box.appendChild(head)
    if (st === 'ios-install') { label.appendChild(tag('span', null, S('push.iosHint'))); return }
    if (st === 'no') { label.appendChild(tag('span', null, S('push.unsupported'))); return }
    if (Notification.permission === 'denied') { label.appendChild(tag('span', null, S('push.blocked'))); return }
    const on = !!push.sub
    label.appendChild(tag('span', null, S(on ? 'push.onHint' : 'push.offHint')))
    const sw = tag('button', 'switch' + (on ? ' on' : '')); sw.type = 'button'; sw.setAttribute('role', 'switch'); sw.setAttribute('aria-checked', on ? 'true' : 'false'); sw.setAttribute('aria-label', S('push.title'))
    sw.onclick = () => { if (push.busy) return; push.busy = true; sw.classList.add('loading'); sw.setAttribute('aria-busy', 'true')   // (pulses while working)
      ;(on ? pushOff() : pushOn().then(() => h.toast(S('push.enabled'), true))).catch((e) => h.toast(e.message)).finally(() => { push.busy = false; renderPushBox(); pushCard() }) }
    head.appendChild(sw)
    if (on) {
      const row = tag('label', 'push-check'), cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !push.prefs || push.prefs.preview !== false
      cb.onchange = () => pushPrefs({ preview: cb.checked }).catch((e) => { h.toast(e.message); cb.checked = !cb.checked })
      row.appendChild(cb); row.appendChild(tag('span', null, S('push.preview'))); box.appendChild(row)
      if (!push.prefs) pushPrefs().then(() => { cb.checked = push.prefs.preview !== false }, () => {})
    }
  }
  /* who may start a private chat with me (account panel; members only): ask first · anyone · nobody */
  function renderPrivacy() {
    const box = $('authPrivacy'); if (!box) return
    box.hidden = !me.uid || me.staff; box.textContent = ''
    if (box.hidden) return
    const cur = (info && info.me && info.me.pmPolicy) || 'request'
    const head = tag('div', 'push-txt'); head.appendChild(tag('b', null, S('pm.policy.title'))); head.appendChild(tag('span', null, S('pm.policy.intro'))); box.appendChild(head)
    const list = tag('div', 'pm-policy-list'); list.setAttribute('role', 'radiogroup'); list.setAttribute('aria-label', S('pm.policy.title'))
    ;['request', 'everyone', 'nobody'].forEach((v) => {
      const b = tag('button', 'pm-opt' + (v === cur ? ' on' : '')); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', v === cur ? 'true' : 'false')
      const dot = tag('span', 'pm-dot'); const t = tag('span', 'pm-opt-txt'); t.appendChild(tag('b', null, S('pm.policy.' + v))); t.appendChild(tag('small', null, S('pm.policy.' + v + 'Hint')))
      b.appendChild(dot); b.appendChild(t)
      b.onclick = () => { if (v === ((info && info.me && info.me.pmPolicy) || 'request')) return
        post('pm-policy', { policy: v }).then(() => { if (info && info.me) info.me.pmPolicy = v; renderPrivacy(); h.toast(S('pm.policy.saved'), true) }, (e) => h.toast(e.message)) }
      list.appendChild(b)
    })
    box.appendChild(list)
  }
  function renderAuth() {
    const r = getReset(), email = (r && r.email) || ''
    const form = ['signin', 'signup', 'forgot', 'newpass', 'profile'].indexOf(mode) >= 0
    const T = {
      signin: [S('auth.signInTitle'), S('auth.signInIntro')], signup: [S('auth.signUpTitle'), S('auth.signUpIntro2')],
      forgot: [S('auth.forgotTitle'), S('auth.forgotIntro')], newpass: [S('auth.reset.newTitle'), S('auth.reset.newIntro', { email })],
      account: [S('auth.accountTitle'), ''], profile: [S('auth.profileTitle'), S('auth.profileIntro')],
    }
    const N = {
      waiting: [S('auth.reset.waitTitle'), S('auth.reset.waitBody', { email }), S('auth.reset.cancel'), S('auth.reset.ok')],
      denied: [S('auth.reset.deniedTitle'), S('auth.reset.deniedBody'), S('auth.reset.again'), S('auth.reset.ok')],
      expired: [S('auth.reset.expiredTitle'), S('auth.reset.expiredBody'), S('auth.reset.again'), S('auth.reset.ok')],
    }
    const tt = mode === 'notice' ? N[notice] : T[mode]
    $('authTitle').textContent = tt[0]
    $('authIntro').textContent = guest && mode === 'signin' ? S('auth.guestIntro') : tt[1]; show('authIntro', !!tt[1])
    // opened by itself when the chat opens: the way out is "Continue as guest"
    $('authCancel').textContent = guest ? S('auth.asGuest') : S('auth.notNow')
    show('authForm', form); show('authAccount', mode === 'account'); show('authNotice', mode === 'notice')
    if (mode === 'account') { renderPushBox(); pushCurrent().then(renderPushBox); renderPrivacy() }
    const named = mode === 'signup' || mode === 'profile'
    show('authNameRow', named); $('authName').required = named; show('authAvatarRow', named)
    show('authEmailRow', mode === 'signin' || mode === 'signup' || mode === 'forgot')
    show('authPwRow', mode === 'signin' || mode === 'signup' || mode === 'newpass')
    $('authPwLabel').textContent = mode === 'newpass' ? S('auth.reset.newPassword') : S('auth.password')
    $('authPassword').setAttribute('autocomplete', mode === 'signin' ? 'current-password' : 'new-password')
    show('authPwHint', mode === 'signup' || mode === 'newpass')
    show('authForgot', mode === 'signin'); show('authNoteRow', mode === 'forgot')
    show('authSwitch', mode !== 'newpass' && mode !== 'profile')
    $('authSubmit').textContent = mode === 'profile' ? S('auth.saveProfile') : mode === 'signup' ? S('auth.submitSignUp') : mode === 'forgot' ? S('auth.submitForgot') : mode === 'newpass' ? S('auth.reset.submit') : S('auth.submitSignIn')
    $('authSwitch').textContent = mode === 'signup' ? S('auth.toSignIn') : mode === 'forgot' ? S('auth.backToSignIn') : S('auth.toSignUp')
    $('authError').textContent = ''; $('authError').hidden = true
    if (mode === 'notice') { $('authNoticeSecondary').textContent = tt[2]; $('authNoticePrimary').textContent = tt[3] }
    if (mode === 'account') {
      $('authWho').textContent = S('auth.signedInAs', { name: (info && info.me && info.me.name) || '' })
      $('authWhoSub').textContent = me.staff ? S('auth.staffNote') : (info && info.me && info.me.email) || ''
      const p = known[me.uid] || {}
      paintAvatar($('authWhoAv'), p.avatarUrl, p.gradient, (info && info.me && info.me.name) || '')
      $('authEdit').textContent = me.staff ? S('auth.editInBackOffice') : S('auth.editProfile')
    }
    if (named) paintPick()
    clearInterval(pollTimer)
    if (mode === 'notice' && notice === 'waiting') pollTimer = setInterval(() => { if (!$('authSheet').classList.contains('open')) return clearInterval(pollTimer); checkReset(true) }, 20000)
  }
  const TOUCH = () => typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches
  function focusFirst() {
    const f = mode === 'profile' ? $('authName') : mode === 'account' ? $('authDone') : mode === 'notice' ? $('authNoticePrimary') : mode === 'signup' ? $('authName') : mode === 'newpass' ? $('authPassword') : $('authEmail')
    if (!f) return
    // phones: focusing a text box pops the keyboard up by itself (and it covered the form) — let the person tap the field;
    // the form itself takes the focus so screen readers still land in it
    if (TOUCH() && /^(INPUT|TEXTAREA)$/.test(f.tagName) && !['checkbox', 'radio', 'button', 'submit'].includes((f as HTMLInputElement).type)) {
      const box = f.closest('.sheet') as HTMLElement | null
      if (box) { if (!box.hasAttribute('tabindex')) box.setAttribute('tabindex', '-1'); box.focus({ preventScroll: true }) }
      return
    }
    f.focus({ preventScroll: true })
  }
  let guest = false   // the sheet opened by itself on opening the chat (not from a "Sign in" button)
  function setMode(m, n) { mode = m; notice = n || null; if (m === 'signup' || m === 'profile') resetPick(); renderAuth(); focusFirst() }
  function openAuth(m, n, asGuest) {
    mode = m; notice = n || null; lastFocus = document.activeElement; guest = !!asGuest
    if (m === 'signup' || m === 'profile') resetPick()
    if (m === 'profile') $('authName').value = (info && info.me && info.me.name) || ''
    renderAuth()
    const w = $('authSheet'); w.classList.add('open'); w.setAttribute('aria-hidden', 'false')
    setTimeout(focusFirst, 60)
  }
  /* password eye: show / hide what was typed. Hidden again whenever the form closes or is sent (never left on screen). The
     tap keeps the focus (and the keyboard) in the field. */
  function pwShow(on) {
    const i = $('authPassword'), b = $('authPwEye'); if (!i || !b) return
    i.type = on ? 'text' : 'password'; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.classList.toggle('on', on)
    const label = S(on ? 'auth.hidePassword' : 'auth.showPassword'); b.setAttribute('aria-label', label); b.title = label
  }
  if ($('authPwEye')) {
    $('authPwEye').addEventListener('pointerdown', (e) => { if (document.activeElement === $('authPassword')) e.preventDefault() })
    $('authPwEye').addEventListener('mousedown', (e) => { if (document.activeElement === $('authPassword')) e.preventDefault() })
    $('authPwEye').addEventListener('click', (e) => { e.preventDefault(); pwShow($('authPassword').type === 'password') })
    $('authForm').addEventListener('submit', () => pwShow(false), true)
  }
  function closeAuth() {
    pwShow(false)
    clearInterval(pollTimer)
    const w = $('authSheet'); w.classList.remove('open'); w.setAttribute('aria-hidden', 'true')
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true })
  }
  function showError(msg) {
    const e = $('authError'); e.textContent = msg; e.hidden = false
    const f = $('authForm'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake')
  }
  /* avatar picker: a photo, or a gradient (random by default, "Shuffle colours" picks another) */
  const pick = { gradient: null, file: null, url: null, removePhoto: false }
  const initials = (n) => String(n || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?'
  function paintAvatar(box, url, gradient, name) {
    if (!box) return
    const img = box.querySelector('img'), ini = box.querySelector('b')
    img.hidden = !url; if (url && img.getAttribute('src') !== url) img.src = url
    ini.hidden = !!url; ini.textContent = initials(name)
    box.style.background = gradient || ''
  }
  function paintPick() {
    paintAvatar($('apPrev'), pick.url, pick.gradient, $('authName').value)
    show('apRemove', !!pick.url)
  }
  function resetPick() {
    if (pick.file && pick.url) URL.revokeObjectURL(pick.url)
    const p = mode === 'profile' ? known[me.uid] || {} : {}
    pick.gradient = p.gradient || randomGradient(); pick.file = null; pick.url = p.avatarUrl || null; pick.removePhoto = false
  }
  async function uploadPhoto(file) {
    const fd = new FormData(); fd.append('file', file)
    const r = await fetch(base + '/avatar', { method: 'POST', credentials: 'same-origin', headers: { 'x-oc-locale': cfg.locale }, body: fd })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || d.error) throw new Error(d.error || S('auth.err.photoType'))
    return d
  }
  /** Ask the server how this browser's reset request is doing. Returns the status (or null when there is none). */
  async function checkReset(inSheet) {
    const r = getReset(); if (!r) return null
    let st
    try { st = (await post('reset-status', { id: r.id, token: r.token })).status } catch (e) { st = 'expired' }
    if (st === 'done') { setReset(null); return null }
    if (inSheet && $('authSheet').classList.contains('open') && mode === 'notice') {
      if (st === 'approved') setMode('newpass')
      else if (st !== notice) setMode('notice', st === 'pending' ? 'waiting' : st)
    }
    return st
  }
  async function openSignIn(asGuest) {
    // a reset request from this browser takes priority over the normal sign-in
    const st = getReset() ? await checkReset(false) : null
    if (st === 'approved') openAuth('newpass')
    else if (st === 'pending') openAuth('notice', 'waiting')
    else if (st === 'denied' || st === 'expired') openAuth('notice', st)
    else openAuth('signin', null, asGuest === true)
  }
  /** Opening the chat signed out: offer to sign in, every time the chat is opened; "Continue as guest" closes it. */
  function promptSignIn() {
    if (me.uid) return
    if (document.querySelector('.sheet-wrap.open')) return   // something else is open already
    openSignIn(true)
  }
  if ($('authSheet')) {
    $('authSwitch').onclick = () => setMode(mode === 'signin' ? 'signup' : 'signin')
    $('authForgot').onclick = () => { const e = $('authEmail').value; setMode('forgot'); $('authEmail').value = e }
    $('authCancel').onclick = closeAuth; $('authDone').onclick = closeAuth
    $('authNoticePrimary').onclick = closeAuth
    $('authNoticeSecondary').onclick = async () => {
      const r = getReset()
      if (notice === 'waiting') { setReset(null); h.toast(S('auth.reset.cancelled'), true); setMode('signin'); if (r) $('authEmail').value = r.email || ''; return }
      setReset(null); setMode('forgot'); if (r) $('authEmail').value = r.email || ''
    }
    $('authSheet').addEventListener('click', function (e) { if (e.target === this) closeAuth() })
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('authSheet').classList.contains('open')) { e.stopImmediatePropagation(); closeAuth() } }, true)
    $('authForm').addEventListener('submit', async (e) => {
      e.preventDefault()
      const btn = $('authSubmit'); if (btn.disabled) return
      btn.disabled = true; $('authError').hidden = true
      try {
        if (mode === 'forgot') {
          const email = $('authEmail').value.trim()
          const d = await post('forgot', { email, note: $('authNote').value })
          setReset({ id: d.id, token: d.token, email, at: Date.now() }); $('authNote').value = ''
          setMode('notice', 'waiting')
          return
        }
        if (mode === 'newpass') {
          const r = getReset()
          const d = await post('reset', { id: r && r.id, token: r && r.token, password: $('authPassword').value })
          setReset(null); $('authPassword').value = ''
          closeAuth(); h.toast(S('auth.reset.done', { name: d.name || '' }), true); reconnect()
          return
        }
        if (mode === 'profile') {
          await post('profile', { name: $('authName').value, gradient: pick.gradient, removePhoto: pick.removePhoto && !pick.file })
          if (pick.file) await uploadPhoto(pick.file)
          closeAuth(); h.toast(S('auth.profileSaved'), true); reconnect()
          return
        }
        const signup = mode === 'signup', file = signup ? pick.file : null
        const d = await post(signup ? 'signup' : 'login', { name: $('authName').value, email: $('authEmail').value, password: $('authPassword').value, gradient: signup ? pick.gradient : undefined })
        $('authPassword').value = ''
        closeAuth(); h.toast(S('auth.welcome', { name: d.name || '' }), true)
        // the account exists now: add the photo (if it fails, the gradient stays and the member can try again from "Edit profile")
        if (file) { try { await uploadPhoto(file) } catch (x) { h.toast(x.message) } }
        reconnect()
      } catch (err) {
        showError(err.message)
      } finally { btn.disabled = false }
    })
    $('authSignOut').onclick = async () => {
      await pushOff().catch(() => {})   // this device stops getting this account's notifications
      try { await post('logout') } catch (e) {}
      closeAuth(); h.toast(S('auth.signedOut'), true); reconnect()
    }
    const acc = $('chatAccount'); if (acc) acc.onclick = () => openAuth('account')
    $('authEdit').onclick = () => { if (me.staff) { window.location.href = '/admin/profile'; return } setMode('profile'); $('authName').value = (info && info.me && info.me.name) || ''; paintPick() }
    $('authName').addEventListener('input', () => { if (!pick.url) paintPick() })
    $('apShuffle').onclick = () => { if (pick.file && pick.url) URL.revokeObjectURL(pick.url); if (pick.url) pick.removePhoto = true; pick.file = null; pick.url = null; pick.gradient = randomGradient(); paintPick() }
    $('apRemove').onclick = () => { if (pick.file && pick.url) URL.revokeObjectURL(pick.url); pick.removePhoto = !pick.file; pick.file = null; pick.url = null; paintPick() }
    $('apUpload').onclick = () => $('apFile').click()
    $('apFile').onchange = function () {
      const f = this.files && this.files[0]; this.value = ''
      if (!f) return
      if (f.size > 5 * 1024 * 1024) { showError(S('auth.err.photoTooBig')); return }
      if (pick.file && pick.url) URL.revokeObjectURL(pick.url)
      pick.file = f; pick.url = URL.createObjectURL(f); pick.removePhoto = false; paintPick()
    }
  }
  // on load: if the team approved this browser's request meanwhile, say so once
  let resetNoticeShown = false
  function remindReset() {
    if (resetNoticeShown || me.uid || !getReset()) return
    resetNoticeShown = true
    checkReset(false).then((st) => { if (st === 'approved') h.toast(S('auth.reset.readyToast'), true) })
  }

  /* ---------- people: who's online, chat requests, search, person card ----------
     Members need the other member's consent before a private chat opens (request → accept). Staff message any member directly. */
  const P = (id) => document.getElementById(id)
  let cardUid = null, searchTimer = 0, searchSeq = 0, results = null, peoplePending = false
  const ini = (n) => String(n || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?'
  const nameOfUid = (uid) => (known[uid] && known[uid].name) || h.nameOf(uid)
  function avatar(uid, size) {
    const p = known[uid] || {}, box = document.createElement('span')
    box.className = 'ppl-av notranslate'; box.setAttribute('translate', 'no'); box.style.width = box.style.height = size + 'px'
    if (p.avatarUrl) { const img = document.createElement('img'); img.alt = ''; img.src = p.avatarUrl; box.appendChild(img) }
    else { box.textContent = ini(p.name); box.style.background = p.gradient || p.color || 'var(--c-accent)'; box.style.fontSize = Math.round(size * 0.36) + 'px' }
    return box
  }
  function onlineUids() {
    const seen = new Set()
    for (const p of st.peers) if (p.by && p.by !== me.uid) seen.add(p.by)
    return [...seen]
  }
  function learnPeers() {
    const missing = onlineUids().filter((u) => !known[u])
    if (missing.length) post('profiles', { ids: missing.slice(0, 100) }).then((d) => { h.profiles(learn(d.profiles || {})); renderPeople() }, () => {})
  }
  function btn(label, cls, fn) { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; b.onclick = (e) => { e.stopPropagation(); fn() }; return b }
  async function respond(uid, action) {
    try {
      await post('chat-respond', { uid, action })
      const name = nameOfUid(uid)
      h.toast(S({ accept: 'pm.acceptedMine', decline: 'pm.declinedMine', block: 'pm.blockedMine', cancel: 'pm.cancelledMine', unblock: 'pm.unblockedMine' }[action] || 'pm.done', { name }), true)
      if (action === 'accept') { closeCard(); setTimeout(() => h.openChatWith(uid), 60) }
    } catch (e) { h.toast(e.message) }
  }
  async function request(uid, note) {
    try {
      const d = await post('chat-request', { to: uid, note })
      closeCard()
      if (d.status === 'accepted') {
        // they accept messages from anyone (or had asked me): the chat exists now — open it and start writing
        if (!st.pms[uid] || st.pms[uid].status !== 'accepted') { st.pms[uid] = Object.assign({}, st.pms[uid], { uid, status: 'accepted', at: Date.now() }); if (!st.pm[uid]) { st.pm[uid] = []; h.pmMsgs(uid, []) } h.pms(Object.assign({}, st.pms)) }
        setTimeout(() => h.openChatWith(uid), 60)
      } else h.toast(S('pm.sent', { name: nameOfUid(uid) }), true)
    } catch (e) { h.toast(e.message) }
  }

  function renderPeople() {
    const box = P('people'); if (!box) return
    // incoming chat requests
    const req = P('pplReq'); req.textContent = ''
    const incoming = Object.values(st.pms).filter((r) => r.status === 'pending-in').sort((a, b) => (b.at || 0) - (a.at || 0))
    if (incoming.length) {
      const hd = document.createElement('div'); hd.className = 'ppl-h'; hd.appendChild(document.createTextNode(S('people.requests'))); const c = document.createElement('b'); c.textContent = String(incoming.length); hd.appendChild(c); req.appendChild(hd)
      incoming.forEach((r) => {
        const card = document.createElement('div'); card.className = 'ppl-req'
        card.appendChild(avatar(r.uid, 40))
        const mid = document.createElement('div'); mid.className = 'ppl-req-main'
        const nm = document.createElement('b'); nm.textContent = nameOfUid(r.uid); mid.appendChild(nm)
        const sub = document.createElement('span'); sub.textContent = r.note ? '“' + r.note + '”' : S('people.wantsToChat'); mid.appendChild(sub)
        const acts = document.createElement('div'); acts.className = 'ppl-req-acts'
        acts.appendChild(btn(S('pm.accept'), 'ppl-btn primary', () => respond(r.uid, 'accept')))
        acts.appendChild(btn(S('pm.decline'), 'ppl-btn', () => respond(r.uid, 'decline')))
        acts.appendChild(btn(S('pm.block'), 'ppl-btn text', () => { h.confirm(S('pm.blockConfirm', { name: nameOfUid(r.uid) }), S('pm.block'), true).then((y) => { if (y) respond(r.uid, 'block') }) }))
        mid.appendChild(acts); card.appendChild(mid); req.appendChild(card)
      })
    }
    // who's online (everyone sees it)
    const searching = !!results
    const ids = onlineUids().sort((a, b) => Number(!!(known[b] && known[b].staff)) - Number(!!(known[a] && known[a].staff)) || nameOfUid(a).localeCompare(nameOfUid(b)))
    const guests = st.peers.filter((p) => !p.by).length
    P('pplOnline').hidden = searching || (!ids.length && !guests)
    P('pplCount').textContent = String(ids.length + guests + (me.uid ? 1 : 0))
    const row = P('pplRow'); row.textContent = ''
    ids.slice(0, 40).forEach((uid) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ppl-item'; b.title = nameOfUid(uid)
      const av = avatar(uid, 46); const dot = document.createElement('i'); dot.className = 'on'; av.appendChild(dot); b.appendChild(av)
      const nm = document.createElement('span'); nm.textContent = nameOfUid(uid).split(' ')[0]; b.appendChild(nm)
      if (known[uid] && known[uid].staff) { const tag = document.createElement('em'); tag.textContent = S('chat.modTag'); b.appendChild(tag) }
      b.onclick = () => openCard(uid); row.appendChild(b)
    })
    if (guests) { const g = document.createElement('span'); g.className = 'ppl-guests'; g.textContent = S('people.guests', { n: guests }); row.appendChild(g) }
    // search results (People section of the search mode): placeholders while looking, nothing when none (the engine then
    // shows "No results" if no chat matched either); people already in a private chat with me show under Chats instead
    const sr = P('pplSearch'), ul = P('pplResults'); ul.textContent = ''
    const shown = searching ? results.filter((p) => !(st.pms[p.uid] && st.pms[p.uid].status === 'accepted')) : []
    sr.hidden = !(peoplePending || shown.length)
    if (peoplePending && !shown.length) for (let i = 0; i < 2; i++) { const li = document.createElement('li'); li.className = 'ppl-skel'; li.setAttribute('aria-hidden', 'true'); li.appendChild(document.createElement('i')); li.appendChild(document.createElement('b')); ul.appendChild(li) }
    if (searching) {
      const q = (P('roomSearch') && P('roomSearch').value.trim()) || ''
      shown.forEach((p) => {
        const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button'; b.className = 'ppl-row-item'
        b.appendChild(avatar(p.uid, 36)); const nm = document.createElement('span'); markName(nm, p.name || nameOfUid(p.uid), q); b.appendChild(nm)
        const rel = st.pms[p.uid]; if (rel) { const tag = document.createElement('em'); tag.textContent = S('pm.status.' + rel.status); b.appendChild(tag) }
        if (onlineUids().includes(p.uid)) { const d = document.createElement('i'); d.className = 'on'; b.appendChild(d) }
        b.onclick = () => openCard(p.uid); li.appendChild(b); ul.appendChild(li)
      })
    }
    box.hidden = !incoming.length && P('pplOnline').hidden && sr.hidden
    if (h.searchUpdated) h.searchUpdated()
  }
  /** the name with the searched letters highlighted */
  function markName(node, text, q) {
    const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1
    if (i < 0) { node.textContent = text; return }
    node.appendChild(document.createTextNode(text.slice(0, i))); const m = document.createElement('mark'); m.className = 'hl'; m.textContent = text.slice(i, i + q.length); node.appendChild(m); node.appendChild(document.createTextNode(text.slice(i + q.length)))
  }
  // the room search box also finds people (signed-in viewers, 2+ letters)
  const search = P('roomSearch')
  if (search) search.addEventListener('input', () => {
    clearTimeout(searchTimer)
    const q = search.value.trim()
    if (q.length < 2 || !me.uid) { ++searchSeq; results = null; peoplePending = false; renderPeople(); return }
    const seq = ++searchSeq
    peoplePending = true; renderPeople()
    searchTimer = setTimeout(() => post('people', { q }).then((d) => { if (seq !== searchSeq) return; peoplePending = false; h.profiles(learn(d.profiles || {})); results = d.people || []; renderPeople() }, () => { if (seq !== searchSeq) return; peoplePending = false; results = []; renderPeople() }), 280)
  })

  /* person card (sheet) */
  function openCard(uid) {
    cardUid = uid; renderCard()
    const w = P('personSheet'); w.classList.add('open'); w.setAttribute('aria-hidden', 'false')
    setTimeout(() => { const f = w.querySelector('.ps-actions button'); if (f) f.focus({ preventScroll: true }) }, 60)
  }
  function closeCard() { const w = P('personSheet'); if (!w) return; cardUid = null; w.classList.remove('open'); w.setAttribute('aria-hidden', 'true') }
  function renderCard() {
    if (!cardUid) return
    const uid = cardUid, p = known[uid] || {}, rel = st.pms[uid], online = onlineUids().includes(uid)
    const av = P('psAvatar'); av.textContent = ''; av.appendChild(avatar(uid, 72))
    const pim = av.querySelector('img'), purl = (known[uid] || {}).avatarUrl
    av.classList.toggle('zoomable', !!(pim && purl)); av.onclick = pim && purl ? () => h.viewPhoto(purl, pim) : null
    if (pim && purl) { av.setAttribute('role', 'button'); av.tabIndex = 0; av.setAttribute('aria-label', S('rooms.photoView')); av.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); h.viewPhoto(purl, pim) } } } else { av.removeAttribute('role'); av.removeAttribute('tabindex'); av.onkeydown = null }
    P('psName').textContent = p.name || nameOfUid(uid)
    P('psSub').textContent = p.staff ? S('pm.team') + (online ? ' · ' + S('pm.onlineNow') : '') : online ? S('people.onlineNow') : S('chat.offline')
    const noteRow = P('psNoteRow'), note = P('psNote'), msg = P('psMsg'), acts = P('psActions')
    acts.textContent = ''; noteRow.hidden = true; msg.hidden = true; msg.textContent = ''
    const say = (t) => { msg.textContent = t; msg.hidden = false }
    const primary = (l, f) => acts.appendChild(btn(l, 'btn btn-primary', f))
    const secondary = (l, f) => acts.appendChild(btn(l, 'btn btn-secondary', f))
    const tertiary = (l, f) => acts.appendChild(btn(l, 'btn-text', f))
    if (uid === me.uid) { say(S('pm.you')); secondary(S('auth.done'), closeCard); return }
    if (!me.uid) { say(S('pm.signInToChat', { name: p.name || nameOfUid(uid) })); secondary(S('auth.notNow'), closeCard); primary(S('chat.signIn'), () => { closeCard(); openSignIn() }); return }
    if (me.staff) { if (p.staff) { secondary(S('auth.done'), closeCard) } else { secondary(S('auth.notNow'), closeCard); primary(S('pm.message'), () => { closeCard(); h.openChatWith(uid) }) } return }
    if (p.staff) { secondary(S('auth.notNow'), closeCard); primary(S('pm.messageTeam'), () => { closeCard(); h.openChatWith(uid) }); return }
    const status = rel ? rel.status : 'none'
    if (status === 'none' && p.pm === 'nobody') {
      // they don't take new private chats
      say(S('pm.closedHint', { name: p.name || nameOfUid(uid) })); primary(S('auth.done'), closeCard)
    } else if (status === 'none' && p.pm === 'everyone') {
      // they accept messages from anyone: no request, the chat opens at once
      say(S('pm.openHint', { name: p.name || nameOfUid(uid) }))
      secondary(S('auth.notNow'), closeCard); primary(S('pm.message'), () => request(uid, ''))
    } else if (status === 'none') {
      noteRow.hidden = false; note.value = ''
      say(S('pm.consentHint', { name: p.name || nameOfUid(uid) }))
      secondary(S('auth.notNow'), closeCard); primary(S('pm.send'), () => request(uid, note.value.trim()))
    } else if (status === 'pending-out') {
      say(S('pm.sent', { name: p.name || nameOfUid(uid) })); secondary(S('pm.cancel'), () => respond(uid, 'cancel')); primary(S('auth.done'), closeCard)
    } else if (status === 'pending-in') {
      say(rel.note ? '“' + rel.note + '”' : S('people.wantsToChat'))
      tertiary(S('pm.block'), () => { h.confirm(S('pm.blockConfirm', { name: p.name || nameOfUid(uid) }), S('pm.block'), true).then((y) => { if (y) { respond(uid, 'block'); closeCard() } }) })
      secondary(S('pm.decline'), () => { respond(uid, 'decline'); closeCard() }); primary(S('pm.accept'), () => respond(uid, 'accept'))
    } else if (status === 'accepted') {
      tertiary(S('pm.block'), () => { h.confirm(S('pm.blockConfirm', { name: p.name || nameOfUid(uid) }), S('pm.block'), true).then((y) => { if (y) { respond(uid, 'block'); closeCard() } }) })
      secondary(S('auth.notNow'), closeCard); primary(S('pm.openChat'), () => { closeCard(); h.openChatWith(uid) })
    } else if (status === 'blocked') {
      say(S('pm.blockedGate')); secondary(S('pm.unblock'), () => { respond(uid, 'unblock'); closeCard() }); primary(S('auth.done'), closeCard)
    }
  }
  if (P('personSheet')) {
    P('personSheet').addEventListener('click', function (e) { if (e.target === this) closeCard() })
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && P('personSheet').classList.contains('open')) { e.stopImmediatePropagation(); closeCard() } }, true)
  }

  /* ---------- rooms made from the chat (#roomSheet): create, settings, members ----------
     Rights come from the member's role (info.perms); the team can do everything. The server re-checks every action. */
  const rs = { open: false, id: null, tab: 'settings', data: null, members: null, results: null, q: '', busy: false, err: '', lastFocus: null }
  let rsSearchTimer = 0, rsSeq = 0
  const perms = () => (info && info.perms) || {}
  function canCreate() { const p = perms(); return !!(me.uid && (p.createGroups || p.createChannels)) }
  const groupOf = (id) => st.groups.find((g) => g.id === id) || null
  function kindAllowed(k) {
    const p = perms(), g = rs.id ? groupOf(rs.id) : null
    return me.staff || (g && g.kind === k) || (k === 'channel' ? !!p.createChannels : !!p.createGroups)
  }
  function openRoomSheet(id) {
    const g = id ? groupOf(id) : null
    if (id && !(g && g.isAdmin)) return
    rs.open = true; rs.id = id || null; rs.link = undefined; rs.anim = null; rs.slide = null; rs.tab = g && g.requests ? 'members' : 'settings'; rs.members = null; rs.results = null; rs.q = ''; rs.err = ''; rs.busy = false
    if (P('rsBody')) P('rsBody').textContent = ''   // a fresh sheet: nothing carried over from last time (pill position, scroll)
    rs.data = g ? { name: g.name, description: g.description || '', rules: g.rules || '', kind: g.kind, join: g.join, visibility: g.vis || (g.join === 'invite' ? 'hidden' : 'public'), preview: typeof g.preview === 'boolean' ? g.preview : g.join === 'open', forward: g.forward !== false }
      : { name: '', description: '', rules: '', kind: perms().createGroups || me.staff ? 'group' : 'channel', join: 'open', visibility: 'public', preview: true, forward: true }
    rs.lastFocus = document.activeElement
    renderRoomSheet()
    P('rsBody').scrollTop = 0
    const w = P('roomSheet'); w.classList.add('open'); w.setAttribute('aria-hidden', 'false')
    if (rs.id) loadMembers()
    setTimeout(() => { const f = P('rsName') || P('rsInvite'); if (f) f.focus({ preventScroll: true }) }, 60)
  }
  function closeRoomSheet() {
    const w = P('roomSheet'); if (!w || !rs.open) return
    rs.open = false; clearTimeout(rsSearchTimer); dropDraft()
    w.classList.remove('open'); w.setAttribute('aria-hidden', 'true')
    if (rs.lastFocus && rs.lastFocus.focus) rs.lastFocus.focus({ preventScroll: true })
  }
  async function loadMembers() {
    if (!rs.id) return
    const id = rs.id
    try {
      const d = await post('room-members', { id })
      if (rs.id !== id || !rs.open) return
      learn(d.profiles || {}); h.profiles(d.profiles || {})
      rs.members = d.list || []
    } catch (e) { if (rs.id === id) rs.members = rs.members || [] }
    if (rs.open && rs.tab === 'members') renderRoomSheet()
  }
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e }
  function choice(name, value, current, label, hint, disabled, onPick) {
    const l = mk('label', 'rs-choice' + (disabled ? ' off' : ''))
    const i = document.createElement('input'); i.type = 'radio'; i.name = name; i.value = value; i.checked = current === value; i.disabled = !!disabled
    i.onchange = () => onPick(value)
    l.appendChild(i); const t = mk('span'); t.appendChild(mk('b', null, label)); t.appendChild(mk('small', null, hint)); l.appendChild(t)
    return l
  }
  function renderRoomSheet() {
    const body = P('rsBody'); if (!body) return
    const g = rs.id ? groupOf(rs.id) : null, d = rs.data
    if (rs.id && !g) { closeRoomSheet(); return } // gone (archived / deleted / no longer admin)
    // the sheet redraws on every data change: remember where the tab pill is right now (even mid-slide) and the scroll,
    // so a redraw never replays the pill's slide or jumps the content
    const oldPill = body.querySelector('.rs-pill')
    const prevPill = oldPill ? { x: new DOMMatrix(getComputedStyle(oldPill).transform).m41, w: oldPill.getBoundingClientRect().width } : null
    const prevScroll = body.scrollTop
    let anim_ = false
    body.textContent = ''
    const head = mk('div', 'rs-head')
    const title = mk('h3', null, rs.id ? d.name || g.name : S('rooms.newTitle')); title.id = 'rsTitle'; head.appendChild(title)
    head.appendChild(mk('p', null, rs.id ? (g.isOwner ? S('rooms.youOwn') : me.staff && !g.owned ? S('rooms.teamRoom') : S('rooms.youAdmin')) : me.staff ? S('rooms.newIntroTeam') : S('rooms.newIntro', { n: perms().maxRooms })))   // the team has no room limit
    body.appendChild(head)
    if (rs.id) {
      // tabs: a pill slides from the old tab to the new one; the content slides in from that side
      const tabs = mk('div', 'rs-tabs'); tabs.setAttribute('role', 'tablist')
      const pill = mk('span', 'rs-pill'); tabs.appendChild(pill)
      const order = ['settings', 'members'], btns = {}
      order.forEach((k) => {
        const b = mk('button', null, k === 'settings' ? S('rooms.tabSettings') : S('rooms.tabMembers')); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(rs.tab === k))
        if (k === 'members' && g.requests) { const c = mk('i', null, String(g.requests)); b.appendChild(c) }
        b.onclick = () => { if (rs.tab !== k) { rs.anim = { from: rs.tab, to: k }; rs.tab = k; rs.err = ''; renderRoomSheet(); P('rsBody').scrollTop = 0 } }
        tabs.appendChild(b); btns[k] = b
      })
      body.appendChild(tabs)
      const anim = rs.anim; rs.anim = null; anim_ = !!anim
      const place = (b) => { pill.style.width = b.offsetWidth + 'px'; pill.style.transform = 'translateX(' + (b.offsetLeft - 4) + 'px)' }
      // start where the pill is now (or on the old tab), without a transition; then glide to the selected tab
      pill.style.transition = 'none'
      if (prevPill && prevPill.w) { pill.style.width = prevPill.w + 'px'; pill.style.transform = 'translateX(' + prevPill.x + 'px)' }
      else place(btns[anim && btns[anim.from] ? anim.from : rs.tab])
      void pill.offsetWidth; pill.style.transition = ''
      place(btns[rs.tab])
      // the tab redraws when its data arrives (members, invite link): keep the slide going from where it was, not restart or cut it
      if (anim) rs.slide = { cls: order.indexOf(anim.to) > order.indexOf(anim.from) ? 'from-right' : 'from-left', t: performance.now() }
      var pane = mk('div', 'rs-pane')
      const sl = rs.slide, el = sl ? performance.now() - sl.t : 1e9
      if (sl && el < 340) { pane.classList.add(sl.cls); pane.style.animationDelay = -el + 'ms' } else rs.slide = null
      body.appendChild(pane)
    }
    if (rs.tab === 'members' && rs.id) renderMembersTab(pane || body, g)
    else renderSettingsTab(pane || body, g)
    if (!anim_ && prevScroll) body.scrollTop = prevScroll
  }
  function renderSettingsTab(body, g) {
    const d = rs.data
    if (g) body.appendChild(roomPictureBox(g))   // the room's picture (saved at once)
    const f = mk('form', 'auth-form rs-form'); f.noValidate = true
    const field = (label, input) => { const l = mk('label', 'field'); l.appendChild(mk('span', null, label)); l.appendChild(input); return l }
    const name = document.createElement('input'); name.id = 'rsName'; name.maxLength = 60; name.autocomplete = 'off'; name.placeholder = S('rooms.namePh'); name.value = d.name
    name.oninput = () => { d.name = name.value }
    f.appendChild(field(S('rooms.name'), name))
    const desc = document.createElement('input'); desc.maxLength = 300; desc.autocomplete = 'off'; desc.placeholder = S('rooms.descriptionPh'); desc.value = d.description
    desc.oninput = () => { d.description = desc.value }
    f.appendChild(field(S('rooms.description'), desc))
    const kinds = mk('fieldset', 'rs-set'); kinds.appendChild(mk('legend', null, S('rooms.kind')))
    ;['group', 'channel'].forEach((k) => kinds.appendChild(choice('rsKind', k, d.kind, S('rooms.kind.' + k), S('rooms.kind.' + k + 'Hint'), !kindAllowed(k), (v) => { d.kind = v })))
    f.appendChild(kinds)
    // who sees it · can people read before joining · how they join (three separate choices)
    const viss = mk('fieldset', 'rs-set'); viss.appendChild(mk('legend', null, S('rooms.vis')))
    ;['public', 'members', 'hidden'].forEach((k) => viss.appendChild(choice('rsVis', k, d.visibility, S('rooms.vis.' + k), S('rooms.vis.' + k + 'Hint'), false, (v) => { d.visibility = v; renderRoomSheet() })))
    f.appendChild(viss)
    const pv = mk('label', 'rs-switch' + (d.visibility === 'hidden' ? ' dim' : ''))
    const pvi = document.createElement('input'); pvi.type = 'checkbox'; pvi.checked = !!d.preview; pvi.onchange = () => { d.preview = pvi.checked }
    const pvt = mk('span'); pvt.appendChild(mk('b', null, S('rooms.preview'))); pvt.appendChild(mk('small', null, S(d.visibility === 'hidden' ? 'rooms.previewHiddenHint' : 'rooms.previewHint')))
    pv.appendChild(pvi); pv.appendChild(pvt); f.appendChild(pv)
    // forwarding: members can forward its messages to their other chats (the team always can)
    const fw = mk('label', 'rs-switch')
    const fwi = document.createElement('input'); fwi.type = 'checkbox'; fwi.checked = d.forward !== false; fwi.onchange = () => { d.forward = fwi.checked }
    const fwt = mk('span'); fwt.appendChild(mk('b', null, S('rooms.forward'))); fwt.appendChild(mk('small', null, S('rooms.forwardHint')))
    fw.appendChild(fwi); fw.appendChild(fwt); f.appendChild(fw)
    const joins = mk('fieldset', 'rs-set'); joins.appendChild(mk('legend', null, S('rooms.join')))
    ;['open', 'request', 'invite'].forEach((k) => joins.appendChild(choice('rsJoin', k, d.join, S('rooms.join.' + k), S('rooms.join.' + k + 'Hint'), false, (v) => { d.join = v })))
    f.appendChild(joins)
    const rules = document.createElement('textarea'); rules.maxLength = 1000; rules.rows = 3; rules.placeholder = S('rooms.rulesPh'); rules.value = d.rules
    rules.oninput = () => { d.rules = rules.value }
    f.appendChild(field(S('rooms.rules'), rules))
    const err = mk('p', 'auth-error', rs.err); err.hidden = !rs.err; err.setAttribute('role', 'alert'); f.appendChild(err)
    const acts = mk('div', 'sheet-actions')
    if (g && (g.isOwner || me.staff)) {
      const danger = mk('div', 'rs-danger')
      danger.appendChild(btn(S('rooms.archive'), 'btn-text', () => removeRoom('archive')))
      danger.appendChild(btn(S('rooms.delete'), 'btn-text danger', () => removeRoom('delete')))
      acts.appendChild(danger)
    }
    acts.appendChild(btn(S('rooms.cancel'), 'btn btn-secondary', closeRoomSheet))
    const save = mk('button', 'btn btn-primary' + (rs.busy ? ' is-busy' : ''), g ? S('rooms.save') : S('rooms.create')); save.type = 'submit'; save.disabled = rs.busy; if (rs.busy) save.setAttribute('aria-busy', 'true')
    acts.appendChild(save); f.appendChild(acts)
    f.onsubmit = (e) => { e.preventDefault(); saveRoom() }
    body.appendChild(f)
  }
  /**
   * The room's picture in its settings: a photo or one of the colours. A chosen photo is only a preview ("Not saved yet")
   * until Save — nothing is uploaded for a wrong pick; Cancel drops it. Tap the picture to see it full size.
   */
  function roomPictureBox(g) {
    const draft = rs.picDraft && rs.picDraft.room === g.id ? rs.picDraft : null
    const box = mk('div', 'rs-pic' + (draft ? ' draft' : ''))
    const prev = mk('div', 'rs-pic-av' + (rs.picBusy ? ' busy' : ''))
    const shown = draft ? draft.url : g.photo
    if (shown) {
      const im = document.createElement('img'); im.alt = ''; im.src = shown; prev.appendChild(im)
      prev.classList.add('zoomable'); prev.setAttribute('role', 'button'); prev.tabIndex = 0; prev.setAttribute('aria-label', S('rooms.photoView'))
      const view = () => h.viewPhoto(shown, im)
      prev.onclick = view; prev.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); view() } }
    } else { prev.style.background = g.gradient || ROOM_COLORS[0]; prev.innerHTML = g.kind === 'channel' ? '<svg viewBox="0 0 24 24" class="icon"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/></svg>' : '<svg viewBox="0 0 24 24" class="icon"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5M15 14.5c2.8 0 5 1.6 5 4.5"/></svg>' }
    box.appendChild(prev)
    const side = mk('div', 'rs-pic-side')
    const acts = mk('div', 'rs-pic-acts')
    const file = document.createElement('input'); file.type = 'file'; file.accept = 'image/jpeg,image/png,image/webp,image/gif,image/avif'; file.hidden = true
    file.onchange = () => { const f = file.files && file.files[0]; file.value = ''; if (!f) return; dropDraft(); rs.picDraft = { room: g.id, file: f, url: URL.createObjectURL(f) }; renderRoomSheet() }
    if (draft) {
      side.appendChild(mk('span', 'rs-pic-note', S('rooms.photoPreview')))
      const save = btn(S('rooms.photoSave'), 'ppl-btn primary', () => setPhoto(g, draft.file)); save.disabled = !!rs.picBusy; acts.appendChild(save)
      acts.appendChild(btn(S('rooms.photoOther'), 'ppl-btn', () => file.click()))
      acts.appendChild(btn(S('rooms.cancel'), 'ppl-btn text', () => { dropDraft(); renderRoomSheet() }))
    } else {
      acts.appendChild(btn(g.photo ? S('rooms.photoChange') : S('rooms.photoAdd'), 'ppl-btn', () => file.click()))
      if (g.photo) acts.appendChild(btn(S('rooms.photoRemove'), 'ppl-btn text', () => setPhoto(g, null)))
    }
    acts.appendChild(file); side.appendChild(acts)
    if (!draft) {
      const sw = mk('div', 'rs-swatches'); sw.setAttribute('role', 'radiogroup'); sw.setAttribute('aria-label', S('rooms.colors'))
      ROOM_COLORS.forEach((c) => {
        const b = btn('', 'rs-swatch' + (c === g.gradient ? ' on' : ''), () => setColor(g, c)); b.style.background = c
        b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(c === g.gradient)); b.setAttribute('aria-label', S('rooms.colors')); sw.appendChild(b)
      })
      side.appendChild(sw)
    }
    box.appendChild(side)
    return box
  }
  function dropDraft() { if (rs.picDraft) { URL.revokeObjectURL(rs.picDraft.url); rs.picDraft = null } }
  async function setPhoto(g, file) {
    if (rs.picBusy) return
    rs.picBusy = true; renderRoomSheet()
    const fd = new FormData(); fd.append('id', g.id); if (file) fd.append('file', await shrinkPic(file, 1024)); else fd.append('remove', '1')
    try {
      const r = await fetch(base + '/room-photo', { method: 'POST', credentials: 'same-origin', headers: { 'x-oc-locale': cfg.locale }, body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || d.error) throw new Error(d.error || S('chat.sendFailed'))
      dropDraft(); await refreshGroups(); h.toast(S(file ? 'rooms.photoSaved' : 'rooms.photoRemoved'), true)
    } catch (e) { h.toast(e.message) }
    rs.picBusy = false; if (rs.open) renderRoomSheet()
  }
  async function setColor(g, c) {
    if (c === g.gradient) return
    try { await post('room-color', { id: g.id, gradient: c }); await refreshGroups() } catch (e) { h.toast(e.message) }
    if (rs.open) renderRoomSheet()
  }
  async function saveRoom() {
    if (rs.busy) return
    const d = rs.data, n = d.name.trim()
    if (n.length < 2 || n.length > 60) { rs.err = S('rooms.err.name'); renderRoomSheet(); return }
    rs.busy = true; rs.err = ''; renderRoomSheet()
    try {
      if (rs.id) {
        await post('room-update', { id: rs.id, ...d, name: n })
        await refreshGroups()
        h.toast(S('rooms.saved'), true)
        rs.busy = false; closeRoomSheet()
      } else {
        const r = await post('room-create', { ...d, name: n })
        // wait until the new room is in our list, then open it
        for (let i = 0; i < 10 && !groupOf(r.id); i++) { await refreshGroups(); if (!groupOf(r.id)) await new Promise((ok) => setTimeout(ok, 300)) }
        rs.busy = false; closeRoomSheet()
        h.toast(S('rooms.created', { name: n }), true)
        if (groupOf(r.id)) h.openRoom('g:' + r.id)
      }
    } catch (e) { rs.busy = false; rs.err = e.message; if (rs.open) renderRoomSheet() }
  }
  async function removeRoom(mode) {
    const g = groupOf(rs.id); if (!g) return
    if (!(await h.confirm(S(mode === 'delete' ? 'rooms.deleteConfirm' : 'rooms.archiveConfirm', { name: g.name }), S(mode === 'delete' ? 'rooms.delete' : 'rooms.archive'), true))) return
    try {
      await post('room-remove', { id: g.id, mode })
      closeRoomSheet()
      if (h.activeRoom() === 'g:' + g.id) h.openRoom('lounge')
      await refreshGroups()
      h.toast(S(mode === 'delete' ? 'rooms.deleted' : 'rooms.archived', { name: g.name }), true)
    } catch (e) { rs.err = e.message; renderRoomSheet() }
  }
  async function memberAction(uid, action) {
    const id = rs.id; if (!id) return
    try {
      await post('room-member', { id, uid, action })
      if (action === 'invite') { h.toast(S('rooms.invitedToast', { name: nameOfUid(uid) }), true); rs.q = ''; rs.results = null }
      await loadMembers()
    } catch (e) { h.toast(e.message) }
  }
  function inviteUrl(token) { return location.origin + '/' + cfg.locale + '/chat/join-' + token }
  function inviteAct(action, ok) {
    const id = rs.id
    return post('room-invite', { id, action }).then((d) => { if (rs.id !== id) return; rs.link = d.token || null; if (ok) h.toast(ok, true); renderRoomSheet() }, (e) => h.toast(e.message))
  }
  function renderInviteLink(wrap, g) {
    const box = mk('div', 'rs-link'); box.appendChild(mk('div', 'rs-link-h', S('rooms.inviteLink')))
    if (rs.link === undefined) { box.appendChild(mk('p', 'rs-note', S('rooms.loading'))); inviteAct('peek') }
    else if (!rs.link) {
      box.appendChild(mk('p', 'rs-note', S('rooms.inviteLinkNone')))
      const mkb = btn(S('rooms.inviteLinkCreate'), 'ppl-btn primary', () => inviteAct('get', S('rooms.inviteLinkCreated'))); box.appendChild(mkb)
    } else {
      const url = inviteUrl(rs.link)
      const inp = document.createElement('input'); inp.readOnly = true; inp.value = url; inp.className = 'rs-link-url'; inp.setAttribute('aria-label', S('rooms.inviteLink')); inp.onfocus = () => inp.select()
      box.appendChild(inp)
      const row = mk('div', 'rs-link-acts')
      row.appendChild(btn(S('rooms.copy'), 'ppl-btn primary', () => { try { navigator.clipboard.writeText(url).then(() => h.toast(S('rooms.linkCopied'), true), () => { inp.select() }) } catch (e) { inp.select() } }))
      if (navigator.share) row.appendChild(btn(S('rooms.share'), 'ppl-btn', () => navigator.share({ title: g.name, text: S('rooms.inviteShareText', { name: g.name }), url }).catch(() => {})))
      row.appendChild(btn(S('rooms.inviteLinkReset'), 'ppl-btn text', () => { h.confirm(S('rooms.inviteLinkResetConfirm'), S('rooms.inviteLinkReset')).then((y) => { if (y) inviteAct('reset', S('rooms.inviteLinkResetDone')) }) }))
      row.appendChild(btn(S('rooms.inviteLinkOff'), 'ppl-btn text danger', () => { h.confirm(S('rooms.inviteLinkOffConfirm'), S('rooms.inviteLinkOff'), true).then((y) => { if (y) inviteAct('off', S('rooms.inviteLinkOffDone')) }) }))
      box.appendChild(row)
      box.appendChild(mk('p', 'rs-note', S('rooms.inviteLinkHint')))
    }
    wrap.appendChild(box)
  }
  function renderMembersTab(body, g) {
    const wrap = mk('div', 'rs-members')
    renderInviteLink(wrap, g)
    // invite by username
    const sb = mk('label', 'field rs-invite'); sb.appendChild(mk('span', null, S('rooms.inviteLabel')))
    const q = document.createElement('input'); q.id = 'rsInvite'; q.type = 'search'; q.autocomplete = 'off'; q.placeholder = S('rooms.invitePh'); q.value = rs.q
    q.oninput = () => {
      rs.q = q.value; clearTimeout(rsSearchTimer)
      const term = q.value.trim()
      if (term.length < 2) { rs.results = null; paintResults(); return }
      const seq = ++rsSeq
      rsSearchTimer = setTimeout(() => post('people', { q: term }).then((d) => { if (seq !== rsSeq || !rs.open) return; h.profiles(learn(d.profiles || {})); rs.results = d.people || []; paintResults() }, () => {}), 260)
    }
    sb.appendChild(q); wrap.appendChild(sb)
    const res = mk('ul', 'rs-list rs-results'); wrap.appendChild(res)
    function paintResults() {
      res.textContent = ''; res.hidden = !rs.results
      if (!rs.results) return
      if (!rs.results.length) { res.appendChild(mk('li', 'ppl-empty', S('people.noResults'))); return }
      const have = {}; (rs.members || []).forEach((m) => { have[m.uid] = m.status })
      rs.results.forEach((p) => {
        const li = mk('li', 'rs-row'); li.appendChild(avatar(p.uid, 34))
        li.appendChild(mk('span', 'rs-name', p.name || nameOfUid(p.uid)))
        if (have[p.uid] === 'member') li.appendChild(mk('em', null, S('rooms.alreadyIn')))
        else if (have[p.uid] === 'invited') li.appendChild(mk('em', null, S('rooms.invitedList')))
        else li.appendChild(btn(have[p.uid] === 'requested' ? S('rooms.accept') : S('rooms.invite'), 'ppl-btn primary', () => memberAction(p.uid, have[p.uid] === 'requested' ? 'accept' : 'invite')))
        res.appendChild(li)
      })
    }
    paintResults()
    if (!rs.members) { wrap.appendChild(mk('p', 'rs-note', S('rooms.loading'))); body.appendChild(wrap); return }
    const canAdmin = g.isOwner || me.staff
    rs.more = rs.more || {}
    const section = (title, list, row) => {
      if (!list.length) return
      const h4 = mk('div', 'ppl-h', title); const c = mk('b', null, String(list.length)); h4.appendChild(c); wrap.appendChild(h4)
      const cut = rs.more[title] ? list.length : 10   // long lists: the first 10, then "Show N more"
      const ul = mk('ul', 'rs-list'); list.slice(0, cut).forEach((m) => ul.appendChild(row(m))); wrap.appendChild(ul)
      if (list.length > cut) wrap.appendChild(btn(S('rooms.showMore', { n: list.length - cut }), 'ppl-btn gs-all', () => { rs.more[title] = true; renderRoomSheet() }))
    }
    const person = (m) => {
      const li = mk('li', 'rs-row'); li.appendChild(avatar(m.uid, 34))
      li.appendChild(nameLine(m.uid, [m.owner ? [S('rooms.owner')] : m.admin ? [S('rooms.coadmin')] : null, m.team ? [S('gi.team'), 'rs-tag-team'] : null], m.uid === me.uid ? ' · ' + S('chat.you') : ''))
      return li
    }
    const L = rs.members
    section(S('rooms.waiting'), L.filter((m) => m.status === 'requested'), (m) => {
      const li = person(m)
      li.appendChild(btn(S('rooms.accept'), 'ppl-btn primary', () => memberAction(m.uid, 'accept')))
      li.appendChild(btn(S('rooms.decline'), 'ppl-btn', () => memberAction(m.uid, 'decline')))
      return li
    })
    section(S('rooms.members'), L.filter((m) => m.status === 'member').sort((a, b) => Number(b.owner) - Number(a.owner) || Number(b.admin) - Number(a.admin)), (m) => {
      const li = person(m)
      if (!m.owner && m.uid !== me.uid) {
        if (canAdmin) li.appendChild(btn(m.admin ? S('rooms.unAdmin') : S('rooms.makeAdmin'), 'ppl-btn', () => memberAction(m.uid, m.admin ? 'unadmin' : 'admin')))
        if (canAdmin || !m.admin) li.appendChild(btn(S('rooms.remove'), 'ppl-btn text', () => { h.confirm(S('rooms.removeConfirm', { name: nameOfUid(m.uid) }), S('rooms.remove'), true).then((y) => { if (y) memberAction(m.uid, 'remove') }) }))
      }
      return li
    })
    section(S('rooms.invitedList'), L.filter((m) => m.status === 'invited'), (m) => {
      const li = person(m)
      li.appendChild(btn(S('rooms.cancelInvite'), 'ppl-btn text', () => memberAction(m.uid, 'remove')))
      return li
    })
    if (!L.some((m) => m.status === 'member' && !m.owner) && !L.some((m) => m.status !== 'member')) wrap.appendChild(mk('p', 'rs-note', S('rooms.noMembers')))
    body.appendChild(wrap)
  }
  /** A member's name and their tags on one line: the name shortens with "…", the tags never wrap or stretch. */
  function nameLine(uid, tags, suffix) {
    const nm = mk('span', 'rs-name'); nm.appendChild(mk('span', 'rs-n', nameOfUid(uid) + (suffix || '')))
    tags.filter(Boolean).forEach((t) => nm.appendChild(mk('em', 'rs-tag' + (t[1] ? ' ' + t[1] : ''), t[0])))
    return nm
  }
  const LIST_CUT = 8

  /* ---------- group info (#groupSheet): for anyone who can see the room — about, rules, members and their role ---------- */
  const gi = { open: false, id: null, data: null, av: null, err: '', busy: false, on: {}, lastFocus: null }
  let giSeq = 0
  function openGroupInfo(id, av, on) {
    if (!groupOf(id)) return
    if (rs.open) closeRoomSheet()
    Object.assign(gi, { open: true, id, data: null, q: '', all: false, av: av || null, err: '', busy: false, on: on || {}, lastFocus: document.activeElement })
    renderGroupInfo(); P('gsBody').scrollTop = 0
    const w = P('groupSheet'); w.classList.add('open'); w.setAttribute('aria-hidden', 'false')
    setTimeout(() => { const f = P('gsBody').querySelector('.gs-close'); if (f) f.focus({ preventScroll: true }) }, 60)
    loadGroupInfo()
  }
  function loadGroupInfo() {
    const id = gi.id, seq = ++giSeq
    return post('room-info', { id }).then((d) => {
      if (seq !== giSeq || !gi.open || gi.id !== id) return
      h.profiles(learn(d.profiles || {})); gi.data = d; gi.err = ''; renderGroupInfo()
    }, (e) => { if (seq === giSeq && gi.open) { if (!groupOf(id)) closeGroupInfo(); else { gi.err = e.message; renderGroupInfo() } } })
  }
  function closeGroupInfo() {
    const w = P('groupSheet'); if (!w || !gi.open) return
    gi.open = false; w.classList.remove('open'); w.setAttribute('aria-hidden', 'true')
    if (gi.lastFocus && gi.lastFocus.focus && document.contains(gi.lastFocus)) gi.lastFocus.focus({ preventScroll: true })
  }
  function renderGroupInfo() {
    const body = P('gsBody'); if (!body || !gi.open) return
    const g = groupOf(gi.id); if (!g) { closeGroupInfo(); return }
    const d = gi.data, scroll = body.scrollTop
    body.textContent = ''
    const x = btn('', 'iconbtn gs-close', closeGroupInfo); x.setAttribute('aria-label', S('gi.close'))
    x.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
    body.appendChild(x)
    // who it is: picture, name, kind · members, how people join
    const head = mk('div', 'gs-head')
    if (gi.av) {
      const a = (g.photo ? h.roomAvatar(g.id) : null) || gi.av.cloneNode(true); a.classList.add('gs-av'); head.appendChild(a)
      const im = a.querySelector('img')
      if (im && g.photo) { a.classList.add('zoomable'); a.setAttribute('role', 'button'); a.tabIndex = 0; a.setAttribute('aria-label', S('rooms.photoView')); a.removeAttribute('aria-hidden'); a.onclick = () => h.viewPhoto(g.photo, im); a.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); h.viewPhoto(g.photo, im) } } }
    }
    const t = mk('h3', null, (d && d.name) || g.name); t.id = 'gsTitle'; head.appendChild(t)
    const n = d ? d.members.length : g.members, kind = (d && d.kind) || g.kind
    head.appendChild(mk('p', 'gs-sub', S(n === 1 ? 'groups.sub1' : 'groups.sub', { kind: S('groups.kind.' + kind), n })))
    head.appendChild(mk('span', 'gs-join', S('gi.join.' + ((d && d.join) || g.join))))
    body.appendChild(head)
    // what I can do here
    const acts = mk('div', 'gs-acts')
    const run = (fn, ok, after, label) => () => {
      if (gi.busy) return; gi.busy = label || gi.pressed || true; gi.pressed = null; renderGroupInfo()
      fn().then(() => { gi.busy = false; if (ok) h.toast(ok, true); refreshGroups().then(() => { if (after) after(); else { renderGroupInfo(); loadGroupInfo() } }) },
        (e) => { gi.busy = false; h.toast(e.message); renderGroupInfo() })
    }
    const join = () => post('group-join', { id: g.id }), leave = () => post('group-leave', { id: g.id })
    const add = (label, cls, fn) => { const b = btn(label, 'ppl-btn ' + cls, () => { gi.pressed = label; fn() }); b.disabled = !!gi.busy; if (gi.busy === label) { b.classList.add('is-busy'); b.setAttribute('aria-busy', 'true') } acts.appendChild(b) }
    if (g.status === 'invited') {
      body.appendChild(mk('p', 'gs-invited', S('gi.invited')))
      add(S('groups.join'), 'primary', run(join, S('groups.joined', { name: g.name })))
      add(S('rooms.decline'), '', run(leave, null, closeGroupInfo))
    } else if (g.status === 'requested') add(S('groups.cancelRequest'), '', run(leave))
    else if (g.status !== 'member' && !g.isOwner && me.uid && !me.staff) {
      if (g.join === 'open') add(S('groups.join'), 'primary', run(join, S('groups.joined', { name: g.name })))
      else if (g.join === 'request') add(S('groups.requestJoin'), 'primary', run(join, S('groups.requested')))
    }
    if (g.isAdmin) add(S('gi.manage'), '', () => { const id = g.id; closeGroupInfo(); openRoomSheet(id) })
    // notifications: mute / unmute this group (only once they are on for this device)
    if (g.status === 'member' && push.sub) {
      const room = 'g:' + g.id, muted = !!(push.prefs && push.prefs.muted.includes(room))
      add(S(muted ? 'push.unmuteGroup' : 'push.muteGroup'), '', () => pushPrefs({ mute: { room, on: !muted } }).then(() => { h.toast(S(muted ? 'push.unmuted' : 'push.muted', { name: g.name }), true); renderGroupInfo() }, (e) => h.toast(e.message)))
      if (!push.prefs) pushPrefs().then(() => { if (gi.open) renderGroupInfo() }, () => {})
    }
    if (g.status === 'member' && !g.isOwner && !me.staff) add(S('groups.leave'), 'text danger', () => {
      h.confirm(S('groups.leaveConfirm', { name: g.name }), S('groups.leave'), true).then((y) => { if (y) run(leave, S('groups.left', { name: g.name }), () => { closeGroupInfo(); if (gi.on.left) gi.on.left() })() })
    })
    if (acts.children.length) body.appendChild(acts)
    // about + rules
    const section = (title, text) => { if (!text) return; const sct = mk('section', 'gs-sec'); sct.appendChild(mk('div', 'ppl-h', title)); sct.appendChild(mk('p', 'gs-text', text)); body.appendChild(sct) }
    section(S('gi.about'), d ? d.description : g.description)
    section(S('groups.rulesTitle'), d ? d.rules : g.rules)
    // members with their role
    const sct = mk('section', 'gs-sec gs-members')
    const hd = mk('div', 'ppl-h', S('rooms.members')); if (d) hd.appendChild(mk('b', null, String(d.members.length))); sct.appendChild(hd)
    if (!d) sct.appendChild(mk('p', 'rs-note', gi.err || S('rooms.loading')))
    else {
      // many members: a search box, the first few, then "Show all N members" (only the list redraws while typing)
      const many = d.members.length > LIST_CUT
      if (many) {
        const q = document.createElement('input'); q.type = 'search'; q.className = 'gs-search'; q.placeholder = S('gi.searchMembers'); q.value = gi.q || ''; q.autocomplete = 'off'
        q.setAttribute('aria-label', S('gi.searchMembers')); q.oninput = () => { gi.q = q.value; paint() }
        sct.appendChild(q)
      }
      const ul = mk('ul', 'rs-list'), more = mk('div', 'gs-more'); sct.appendChild(ul); sct.appendChild(more)
      const paint = () => {
        const term = (gi.q || '').trim().toLowerCase()
        const found = term ? d.members.filter((m) => nameOfUid(m.uid).toLowerCase().includes(term)) : d.members
        const shown = term || gi.all || !many ? found : found.slice(0, LIST_CUT)
        ul.textContent = ''; more.textContent = ''
        if (!found.length) ul.appendChild(mk('li', 'ppl-empty', S('gi.noMatch')))
        shown.forEach((m) => {
          const li = mk('li', 'rs-row gs-row'), self = m.uid === me.uid, card = !self && !m.team && !!me.uid
          const inner = card ? btn('', 'gs-person', () => openCard(m.uid)) : mk('div', 'gs-person')
          inner.appendChild(avatar(m.uid, 36))
          inner.appendChild(nameLine(m.uid, [m.role === 'owner' ? [S('rooms.owner')] : m.role === 'admin' ? [S('gi.admin')] : null, m.team ? [S('gi.team'), 'rs-tag-team'] : null], self ? ' · ' + S('chat.you') : ''))
          li.appendChild(inner); ul.appendChild(li)
        })
        if (shown.length < found.length) more.appendChild(btn(S('gi.showAll', { n: found.length }), 'ppl-btn gs-all', () => { gi.all = true; paint() }))
      }
      paint()
    }
    body.appendChild(sct)
    body.scrollTop = scroll
  }
  if (P('groupSheet')) {
    P('groupSheet').addEventListener('click', function (e) { if (e.target === this) closeGroupInfo() })
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && gi.open && !P('personSheet').classList.contains('open')) { e.stopImmediatePropagation(); closeGroupInfo() } }, true)
  }
  if (P('roomSheet')) {
    P('roomSheet').addEventListener('click', function (e) { if (e.target === this) closeRoomSheet() })
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && rs.open) { e.stopImmediatePropagation(); closeRoomSheet() } }, true)
  }
  if (P('newRoom')) P('newRoom').addEventListener('click', () => openRoomSheet(null))

  /** POST a picture / voice note with upload progress (onProg(sent, total)); ctl.abort() cancels (the error has .aborted). */
  function upload(path, fd, onProg, ctl) {
    return new Promise((ok, ko) => {
      const x = new XMLHttpRequest()
      x.open('POST', base + path); x.withCredentials = true; x.setRequestHeader('x-oc-locale', cfg.locale)
      if (onProg && x.upload) x.upload.onprogress = (e) => { if (e.lengthComputable) onProg(e.loaded, e.total) }
      x.onload = () => {
        let d = {}; try { d = JSON.parse(x.responseText || '{}') } catch (e) {}
        if (x.status >= 400 || d.error) ko(new Error(d.error || S('chat.sendFailed'))); else ok(d)
      }
      x.onerror = () => ko(new Error(S('chat.sendFailed')))
      x.onabort = () => { const e = new Error('aborted'); e.aborted = true; ko(e) }
      if (ctl) ctl.abort = () => x.abort()
      x.send(fd)
    })
  }

  /** A picture drawn at most `max` px (WebP, transparency kept) before upload, so big photos aren't refused; the original if it can't be read. */
  async function shrinkPic(file, max) {
    try {
      const url = URL.createObjectURL(file)
      const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url })
      URL.revokeObjectURL(url)
      const w0 = img.naturalWidth || max, h0 = img.naturalHeight || max, k = Math.min(1, max / Math.max(w0, h0))
      if (k === 1 && file.size < 1.5 * 1024 * 1024 && file.type !== 'image/svg+xml') return file
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k))
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      const blob = await new Promise((ok) => c.toBlob(ok, 'image/webp', 0.92))
      return blob ? new File([blob], 'sticker.webp', { type: 'image/webp' }) : file
    } catch (e) { return file }
  }

  /* ---------- older messages, page by page (scrolling up in a conversation) ---------- */
  const PAGE = 40, hist = {}   // browser room id → { busy, done }
  const isPublic = (room) => room === 'lounge' || /^[a-f0-9]{24}$/i.test(room)
  function roomList(room) {   // the list a conversation's messages live in (browser room ids), or null when not loaded
    if (room === 'support') return st.myDm
    if (room.indexOf('pm:') === 0) return st.pm[room.slice(3)] || null
    if (room.indexOf('g:') === 0) return st.g[room.slice(2)] || null
    if (room.indexOf('sup:') === 0) return st.dms[room.slice(4)] || null
    return isPublic(room) ? st.messages.filter((m) => m.room === room) : null
  }
  /** 'more' (older ones exist), 'loading', 'done' (the start of the conversation is here) or null (not loaded yet). */
  function historyState(room) {
    const h = hist[room] || {}, list = roomList(room)
    if (!list) return null
    if (h.busy) return 'loading'
    if (h.done) return 'done'
    return list.filter((m) => !/^c[a-z0-9]+$/.test(m.id)).length >= PAGE ? 'more' : 'done'   // the first page came back short: that's all
  }
  function loadOlder(room) {
    if (historyState(room) !== 'more') return null
    const h = hist[room] = hist[room] || {}, list = roomList(room)
    const before = list.reduce((t, m) => (m.ts < t ? m.ts : t), Infinity)
    h.busy = true
    return post('history', { room, before }).then((d) => {
      h.busy = false; h.done = !d.more
      if (d.profiles) h_profiles(d.profiles)
      const add = (d.list || []).map(view), s = room.indexOf('pm:') === 0 ? ['pm', room.slice(3)] : room.indexOf('g:') === 0 ? ['g', room.slice(2)] : room.indexOf('sup:') === 0 ? ['dm', room.slice(4)] : room === 'support' ? ['myDm'] : ['messages']
      const target = getList(s), have = new Set(target.map((m) => m.id))
      const fresh = add.filter((m) => !have.has(m.id))
      if (fresh.length) { target.unshift(...fresh); target.sort((a, b) => a.ts - b.ts) }
      emit(s, 'older')
      return fresh.length
    }, (e) => { h.busy = false; throw e })
  }
  const h_profiles = (p) => h.profiles(learn(p))

  /* ---------- the interface the engine uses ---------- */
  return {
    connect,
    profiles: (ids) => post('profiles', { ids }).then((d) => d.profiles || {}),
    send: (doc) => post('send', doc),
    async sendImage(doc, file, onProg, ctl) {
      const fd = new FormData()
      fd.append('file', file)
      if (doc.text) fd.append('text', doc.text)
      if (doc.room) fd.append('room', doc.room)
      if (doc.dmTo) fd.append('dmTo', doc.dmTo)
      if (doc.pmTo) fd.append('pmTo', doc.pmTo)   // (never fall back to the lounge for a private chat)
      if (doc.clientId) fd.append('clientId', doc.clientId)
      if (doc.reply) fd.append('reply', JSON.stringify(doc.reply))
      if (doc.batch) fd.append('batch', doc.batch)   // photos picked together: one album for slow mode
      return upload('/image', fd, onProg, ctl)
    },
    /** A voice message: the recording (Blob) + {dur, peaks}; same room fields as a text message. */
    async sendVoice(doc, blob, meta, onProg, ctl) {
      const fd = new FormData()
      const ext = /mp4|aac|m4a/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm'
      fd.append('file', new File([blob], 'voice.' + ext, { type: (blob.type || 'audio/webm').split(';')[0] }))
      fd.append('duration', String(meta.dur || 0)); fd.append('peaks', JSON.stringify(meta.peaks || []))
      if (doc.room) fd.append('room', doc.room)
      if (doc.dmTo) fd.append('dmTo', doc.dmTo)
      if (doc.pmTo) fd.append('pmTo', doc.pmTo)
      if (doc.clientId) fd.append('clientId', doc.clientId)
      if (doc.reply) fd.append('reply', JSON.stringify(doc.reply))
      return upload('/voice', fd, onProg, ctl)
    },
    /* personal stickers: only their owner sees them */
    myStickers: () => post('stickers', {}).then((d) => d.stickers || []),
    /** forward one message to up to 5 chats (browser room ids) → { sent, failed: [{ to, error }] } */
    forward: (id, to) => post('forward', { id, to }),
    /** search mode: are people results on their way, and how many are shown */
    peopleSearch: () => ({ pending: peoplePending, count: results ? results.filter((p) => !(st.pms[p.uid] && st.pms[p.uid].status === 'accepted')).length : 0 }),
    async addSticker(file) {
      const fd = new FormData(); fd.append('file', await shrinkPic(file, 1024))
      let r, d = {}
      try {
        r = await fetch(base + '/sticker', { method: 'POST', credentials: 'same-origin', headers: { 'x-oc-locale': cfg.locale }, body: fd })
        d = await r.json().catch(() => ({}))
      } catch (e) { throw new Error(S('chat.sendFailed')) }
      if (!r.ok || d.error) throw new Error(d.error || S('chat.sendFailed'))
      return d.sticker
    },
    removeSticker: (id) => post('sticker-remove', { id }),
    react: (m, key, on) => post('react', { id: m.id, key, on: !!on }),
    report: (m) => post('report', { id: m.id }),
    mute: (uid, on) => post('mute', { uid, on: !!on }),
    remove: (m) => post('remove', { id: m.id }),
    acceptRules: () => post('rules', {}),
    presence(p) {
      if (p && 'room' in p) pres.room = p.room || null
      if (p && 'typing' in p) pres.typing = !!p.typing
      flushPresence()
    },
    touchSeen() {
      if (!me.uid) return
      // keepalive: still delivered when the tab is closing
      try { fetch(base + '/seen', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {}) } catch (e) {}
    },
    watchThread,
    pmRespond: (uid, action) => respond(uid, action),
    groupJoin: (id) => post('group-join', { id }).then((d) => { refreshGroups(); return d }),
    groupLeave: (id) => post('group-leave', { id }).then((d) => { refreshGroups(); return d }),
    openSignIn,
    promptSignIn,
    manageRoom: (id) => openRoomSheet(id),
    historyState,
    loadOlder,
    groupInfo: (id, av, on) => openGroupInfo(id, av, on),
    openPerson: (uid) => openCard(uid),
    joinLink: (token) => post('join-link', { token }).then((d) => refreshGroups().then(() => d)),
    markRead: (room, ts) => queueReceipt(room, 'read', ts),
    addOptimistic(m, dmTo, pmTo) {
      const s = pmTo ? ['pm', pmTo] : dmTo ? (me.staff ? ['dm', dmTo] : ['myDm']) : ['messages']
      upsert(getList(s), m); emit(s, 'mine')
    },
    dropOptimistic(clientId, dmTo, pmTo) {
      const s = pmTo ? ['pm', pmTo] : dmTo ? (me.staff ? ['dm', dmTo] : ['myDm']) : ['messages'], list = getList(s)
      const i = list.findIndex((x) => x.id === clientId); if (i >= 0) { list.splice(i, 1); emit(s) }
    },
  }
}
