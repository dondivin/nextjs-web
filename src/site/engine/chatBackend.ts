// @ts-nocheck
/*
 * Chat backend adapter used by the engine. The engine only talks to this object (see `createChatBackend(cfg, h)` in engine.ts).
 *
 * Live data comes from one Server-Sent Events stream (GET /chat-api/stream); actions are JSON POSTs (/chat-api/<action>).
 * The first stream event (`hello`) carries everything; later events are deltas that this adapter folds into full lists,
 * because the engine's hooks (h.messages, h.myDm, h.dm …) always take the whole list.
 *
 * Rooms: the server stores direct chats as 'dm:<memberId>'. The engine calls a fan's own direct chat 'support'
 * and, for staff, each fan's chat 'sup:<memberId>'. view() translates.
 *
 * Also owns the sign-in / sign-up / account sheet (#authSheet) and the account button in the chat sidebar (#chatAccount).
 */
import type { EngineConfig } from './types'
import { randomGradient } from '../../chat/gradient'

export function createChatBackend(cfg: EngineConfig, h) {
  const base = cfg.apiBase || '/chat-api'
  const S = h.S
  let es = null, conn = null, helloAt = 0, failTimer = 0, retryTimer = 0
  let me = { uid: null, staff: false }, info = null
  const st = { messages: [], myDm: [], dms: {}, watching: {}, threads: {} }
  const known = {} // every profile seen so far (id → {name, gradient, avatarUrl, …})
  const learn = (p) => { if (p) Object.assign(known, p); return p }
  const pres = { room: null, typing: false }, sent = { conn: null, room: undefined, typing: undefined }

  /* ---------- helpers ---------- */
  async function post(action, body) {
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
    return { id: w.id, by: w.by, text: w.text, ts: w.ts, room, reply: w.reply || null, reactions: w.reactions || {}, image: w.image || undefined, mod: w.mod || undefined, clientId: w.clientId }
  }
  // which list a stored room belongs to: ['messages'] | ['myDm'] | ['dm', uid]
  function slot(room) {
    if (room.indexOf('dm:') !== 0) return ['messages']
    const uid = room.slice(3)
    return me.staff ? ['dm', uid] : uid === me.uid ? ['myDm'] : null
  }
  function getList(s) { return s[0] === 'dm' ? (st.dms[s[1]] = st.dms[s[1]] || []) : st[s[0]] }
  function emit(s, mode) {
    if (s[0] === 'messages') h.messages(st.messages.slice(), mode)
    else if (s[0] === 'myDm') h.myDm(st.myDm.slice(), mode)
    else h.dm(s[1], (st.dms[s[1]] || []).slice(), mode)
  }
  function upsert(list, m) {
    let i = list.findIndex((x) => x.id === m.id || (m.clientId && x.id === m.clientId))
    if (i >= 0) { list[i] = m; return false }
    list.push(m)
    if (list.length > 1 && list[list.length - 2].ts > m.ts) list.sort((a, b) => a.ts - b.ts)
    if (list.length > 500) list.splice(0, list.length - 500)
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
        info = { uid: d.uid, canPost: d.canPost, canEdit: d.canEdit, me: d.me, profiles: learn(d.profiles), rulesAccepted: d.rulesAccepted }
        st.messages = (d.messages || []).map(view); st.myDm = (d.myDm || []).map(view)
        const watched = Object.keys(st.watching); st.dms = {}; st.watching = {}
        st.threads = d.threads || {}
        h.ready(info)
        h.mod(d.muted || {}); h.myReports(d.myReports || []); h.reports(d.reports || {})
        h.agent(d.agent)
        if (me.staff) h.threads(Object.assign({}, st.threads))
        h.messages(st.messages.slice())
        if (me.uid && !me.staff) h.myDm(st.myDm.slice())
        h.peers(peers(d.peers))
        watched.forEach(watchThread)
        sent.conn = null; flushPresence()
        accountButton(); remindReset()
        break
      }
      case 'msg': {
        const s = slot(d.m.room); if (!s) return
        if (d.profiles && Object.keys(d.profiles).length) h.profiles(learn(d.profiles))
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
      case 'peers': h.peers(peers(d.peers)); break
      case 'error': h.unavailable(); break
    }
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
  function watchThread(uid) {
    if (!uid || st.watching[uid]) return
    st.watching[uid] = true
    post('thread', { uid }).then((d) => {
      if (d.profiles) h.profiles(d.profiles)
      st.dms[uid] = (d.list || []).map(view); emit(['dm', uid])
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
  function accountButton() { const b = $('chatAccount'); if (b) b.hidden = !me.uid }
  const show = (id, on) => { const e = $(id); if (e) e.hidden = !on }
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
    $('authIntro').textContent = tt[1]; show('authIntro', !!tt[1])
    show('authForm', form); show('authAccount', mode === 'account'); show('authNotice', mode === 'notice')
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
  function focusFirst() {
    const f = mode === 'profile' ? $('authName') : mode === 'account' ? $('authDone') : mode === 'notice' ? $('authNoticePrimary') : mode === 'signup' ? $('authName') : mode === 'newpass' ? $('authPassword') : $('authEmail')
    if (f) f.focus({ preventScroll: true })
  }
  function setMode(m, n) { mode = m; notice = n || null; if (m === 'signup' || m === 'profile') resetPick(); renderAuth(); focusFirst() }
  function openAuth(m, n) {
    mode = m; notice = n || null; lastFocus = document.activeElement
    if (m === 'signup' || m === 'profile') resetPick()
    if (m === 'profile') $('authName').value = (info && info.me && info.me.name) || ''
    renderAuth()
    const w = $('authSheet'); w.classList.add('open'); w.setAttribute('aria-hidden', 'false')
    setTimeout(focusFirst, 60)
  }
  function closeAuth() {
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
  async function openSignIn() {
    // a reset request from this browser takes priority over the normal sign-in
    const st = getReset() ? await checkReset(false) : null
    if (st === 'approved') openAuth('newpass')
    else if (st === 'pending') openAuth('notice', 'waiting')
    else if (st === 'denied' || st === 'expired') openAuth('notice', st)
    else openAuth('signin')
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
        // the account exists now: add the photo (if it fails, the gradient stays and the fan can try again from "Edit profile")
        if (file) { try { await uploadPhoto(file) } catch (x) { h.toast(x.message) } }
        reconnect()
      } catch (err) {
        showError(err.message)
      } finally { btn.disabled = false }
    })
    $('authSignOut').onclick = async () => {
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

  /* ---------- the interface the engine uses ---------- */
  return {
    connect,
    profiles: (ids) => post('profiles', { ids }).then((d) => d.profiles || {}),
    send: (doc) => post('send', doc),
    async sendImage(doc, file) {
      const fd = new FormData()
      fd.append('file', file)
      if (doc.text) fd.append('text', doc.text)
      if (doc.room) fd.append('room', doc.room)
      if (doc.dmTo) fd.append('dmTo', doc.dmTo)
      if (doc.clientId) fd.append('clientId', doc.clientId)
      if (doc.reply) fd.append('reply', JSON.stringify(doc.reply))
      let r, d = {}
      try {
        r = await fetch(base + '/image', { method: 'POST', credentials: 'same-origin', headers: { 'x-oc-locale': cfg.locale }, body: fd })
        d = await r.json().catch(() => ({}))
      } catch (e) { throw new Error(S('chat.sendFailed')) }
      if (!r.ok || d.error) throw new Error(d.error || S('chat.sendFailed'))
      return d
    },
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
    openSignIn,
    addOptimistic(m, dmTo) {
      const s = dmTo ? (me.staff ? ['dm', dmTo] : ['myDm']) : ['messages']
      upsert(getList(s), m); emit(s, 'mine')
    },
    dropOptimistic(clientId, dmTo) {
      const s = dmTo ? (me.staff ? ['dm', dmTo] : ['myDm']) : ['messages'], list = getList(s)
      const i = list.findIndex((x) => x.id === clientId); if (i >= 0) { list.splice(i, 1); emit(s) }
    },
  }
}
