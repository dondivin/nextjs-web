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
  const st = { messages: [], myDm: [], dms: {}, watching: {}, threads: {}, pms: {}, pm: {}, peers: [], groups: [], g: {} }
  // groups = rooms made by the team that this viewer sees; g[id] = messages of the ones they can read
  // pms[uid] = relation with that fan ({status, note, at, lastSeen}); pm[uid] = messages of our private chat
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
    else if (room.indexOf('pm:') === 0) room = 'pm:' + pmOther(room)
    return { id: w.id, by: w.by, text: w.text, ts: w.ts, room, reply: w.reply || null, reactions: w.reactions || {}, image: w.image || undefined, mod: w.mod || undefined, clientId: w.clientId }
  }
  // the other fan of a stored private room 'pm:<a>_<b>'
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
        info = { uid: d.uid, canPost: d.canPost, canEdit: d.canEdit, me: d.me, profiles: learn(d.profiles), rulesAccepted: d.rulesAccepted, perms: d.perms || {} }
        st.messages = (d.messages || []).map(view); st.myDm = (d.myDm || []).map(view)
        const watched = Object.keys(st.watching); st.dms = {}; st.watching = {}
        st.threads = d.threads || {}
        h.ready(info)
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
      case 'groups': refreshGroups(); if (rs.open && rs.id) loadMembers(); break
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

  /* ---------- groups & channels ---------- */
  function applyGroups(list, msgs, fresh) {
    const before = {}; st.groups.forEach((g) => { before[g.id] = g.status })
    st.groups = list
    if (fresh) st.g = {}
    for (const id in msgs) { st.g[id] = msgs[id].map(view); h.groupMsgs(id, st.g[id].slice()) }
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

  /* ---------- people: who's online, chat requests, search, person card ----------
     Fans need the other fan's consent before a private chat opens (request → accept). Staff message any fan directly. */
  const P = (id) => document.getElementById(id)
  let cardUid = null, searchTimer = 0, searchSeq = 0, results = null
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
      h.toast(d.status === 'accepted' ? S('pm.acceptedToast', { name: nameOfUid(uid) }) : S('pm.sent', { name: nameOfUid(uid) }), true)
      closeCard()
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
        acts.appendChild(btn(S('pm.block'), 'ppl-btn text', () => { if (window.confirm(S('pm.blockConfirm', { name: nameOfUid(r.uid) }))) respond(r.uid, 'block') }))
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
    // search results
    const sr = P('pplSearch'), ul = P('pplResults'); sr.hidden = !searching; ul.textContent = ''
    if (searching) {
      if (!results.length) { const li = document.createElement('li'); li.className = 'ppl-empty'; li.textContent = S('people.noResults'); ul.appendChild(li) }
      results.forEach((p) => {
        const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button'; b.className = 'ppl-row-item'
        b.appendChild(avatar(p.uid, 36)); const nm = document.createElement('span'); nm.textContent = p.name || nameOfUid(p.uid); b.appendChild(nm)
        const rel = st.pms[p.uid]; if (rel) { const tag = document.createElement('em'); tag.textContent = S('pm.status.' + rel.status); b.appendChild(tag) }
        if (onlineUids().includes(p.uid)) { const d = document.createElement('i'); d.className = 'on'; b.appendChild(d) }
        b.onclick = () => openCard(p.uid); li.appendChild(b); ul.appendChild(li)
      })
    }
    box.hidden = !incoming.length && P('pplOnline').hidden && !searching
  }
  // the room search box also finds people (signed-in viewers, 2+ letters)
  const search = P('roomSearch')
  if (search) search.addEventListener('input', () => {
    clearTimeout(searchTimer)
    const q = search.value.trim()
    if (q.length < 2 || !me.uid) { results = null; renderPeople(); return }
    const seq = ++searchSeq
    searchTimer = setTimeout(() => post('people', { q }).then((d) => { if (seq !== searchSeq) return; h.profiles(learn(d.profiles || {})); results = d.people || []; renderPeople() }, () => {}), 280)
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
    if (status === 'none') {
      noteRow.hidden = false; note.value = ''
      say(S('pm.consentHint', { name: p.name || nameOfUid(uid) }))
      secondary(S('auth.notNow'), closeCard); primary(S('pm.send'), () => request(uid, note.value.trim()))
    } else if (status === 'pending-out') {
      say(S('pm.sent', { name: p.name || nameOfUid(uid) })); secondary(S('pm.cancel'), () => respond(uid, 'cancel')); primary(S('auth.done'), closeCard)
    } else if (status === 'pending-in') {
      say(rel.note ? '“' + rel.note + '”' : S('people.wantsToChat'))
      tertiary(S('pm.block'), () => { if (window.confirm(S('pm.blockConfirm', { name: p.name || nameOfUid(uid) }))) { respond(uid, 'block'); closeCard() } })
      secondary(S('pm.decline'), () => { respond(uid, 'decline'); closeCard() }); primary(S('pm.accept'), () => respond(uid, 'accept'))
    } else if (status === 'accepted') {
      tertiary(S('pm.block'), () => { if (window.confirm(S('pm.blockConfirm', { name: p.name || nameOfUid(uid) }))) { respond(uid, 'block'); closeCard() } })
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
    rs.open = true; rs.id = id || null; rs.tab = g && g.requests ? 'members' : 'settings'; rs.members = null; rs.results = null; rs.q = ''; rs.err = ''; rs.busy = false
    rs.data = g ? { name: g.name, description: g.description || '', rules: g.rules || '', kind: g.kind, join: g.join }
      : { name: '', description: '', rules: '', kind: perms().createGroups || me.staff ? 'group' : 'channel', join: 'open' }
    rs.lastFocus = document.activeElement
    renderRoomSheet()
    P('rsBody').scrollTop = 0
    const w = P('roomSheet'); w.classList.add('open'); w.setAttribute('aria-hidden', 'false')
    if (rs.id) loadMembers()
    setTimeout(() => { const f = P('rsName') || P('rsInvite'); if (f) f.focus({ preventScroll: true }) }, 60)
  }
  function closeRoomSheet() {
    const w = P('roomSheet'); if (!w || !rs.open) return
    rs.open = false; clearTimeout(rsSearchTimer)
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
    body.textContent = ''
    const head = mk('div', 'rs-head')
    const title = mk('h3', null, rs.id ? d.name || g.name : S('rooms.newTitle')); title.id = 'rsTitle'; head.appendChild(title)
    head.appendChild(mk('p', null, rs.id ? (g.isOwner ? S('rooms.youOwn') : me.staff && !g.owned ? S('rooms.teamRoom') : S('rooms.youAdmin')) : S('rooms.newIntro', { n: me.staff ? '∞' : perms().maxRooms })))
    body.appendChild(head)
    if (rs.id) {
      const tabs = mk('div', 'rs-tabs'); tabs.setAttribute('role', 'tablist')
      ;[['settings', S('rooms.tabSettings')], ['members', S('rooms.tabMembers')]].forEach(([k, l]) => {
        const b = mk('button', null, l); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(rs.tab === k))
        if (k === 'members' && g.requests) { const c = mk('i', null, String(g.requests)); b.appendChild(c) }
        b.onclick = () => { if (rs.tab !== k) { rs.tab = k; rs.err = ''; renderRoomSheet(); P('rsBody').scrollTop = 0 } }
        tabs.appendChild(b)
      })
      body.appendChild(tabs)
    }
    if (rs.tab === 'members' && rs.id) renderMembersTab(body, g)
    else renderSettingsTab(body, g)
  }
  function renderSettingsTab(body, g) {
    const d = rs.data
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
    const save = mk('button', 'btn btn-primary', rs.busy ? '…' : g ? S('rooms.save') : S('rooms.create')); save.type = 'submit'; save.disabled = rs.busy
    acts.appendChild(save); f.appendChild(acts)
    f.onsubmit = (e) => { e.preventDefault(); saveRoom() }
    body.appendChild(f)
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
    if (!window.confirm(S(mode === 'delete' ? 'rooms.deleteConfirm' : 'rooms.archiveConfirm', { name: g.name }))) return
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
  function renderMembersTab(body, g) {
    const wrap = mk('div', 'rs-members')
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
    const section = (title, list, row) => {
      if (!list.length) return
      const h4 = mk('div', 'ppl-h', title); const c = mk('b', null, String(list.length)); h4.appendChild(c); wrap.appendChild(h4)
      const ul = mk('ul', 'rs-list'); list.forEach((m) => ul.appendChild(row(m))); wrap.appendChild(ul)
    }
    const person = (m) => {
      const li = mk('li', 'rs-row'); li.appendChild(avatar(m.uid, 34))
      const nm = mk('span', 'rs-name', nameOfUid(m.uid))
      if (m.owner) nm.appendChild(mk('em', 'rs-tag', S('rooms.owner'))); else if (m.admin) nm.appendChild(mk('em', 'rs-tag', S('rooms.coadmin')))
      li.appendChild(nm); return li
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
        if (canAdmin || !m.admin) li.appendChild(btn(S('rooms.remove'), 'ppl-btn text', () => { if (window.confirm(S('rooms.removeConfirm', { name: nameOfUid(m.uid) }))) memberAction(m.uid, 'remove') }))
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
  if (P('roomSheet')) {
    P('roomSheet').addEventListener('click', function (e) { if (e.target === this) closeRoomSheet() })
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && rs.open) { e.stopImmediatePropagation(); closeRoomSheet() } }, true)
  }
  if (P('newRoom')) P('newRoom').addEventListener('click', () => openRoomSheet(null))

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
    pmRespond: (uid, action) => respond(uid, action),
    groupJoin: (id) => post('group-join', { id }).then((d) => { refreshGroups(); return d }),
    groupLeave: (id) => post('group-leave', { id }).then((d) => { refreshGroups(); return d }),
    openSignIn,
    manageRoom: (id) => openRoomSheet(id),
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
