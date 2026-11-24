// @ts-nocheck
/*
 * OddsClub site engine — faithful port of design/prototype/oddsclub-prototype.html (script section).
 * Kept close to the prototype on purpose (same functions, same order) so behaviour stays identical.
 * Differences from the prototype:
 *   - libraries come from npm (gsap, ScrollTrigger, Draggable, lenis, motion, dayjs, floating-ui, three)
 *   - every user-facing string goes through S('key', vars) → translations from the database
 *   - partners, matches, settings and chat rules come from `cfg` (rendered by the server from Payload)
 *   - the claude.ai capability boot (db/user/room) is replaced by `backend` (see engine/chatBackend.ts)
 * TODO(phase 2+): split into typed modules; remove ts-nocheck.
 */
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Draggable } from 'gsap/Draggable'
import Lenis from 'lenis'
import { animate as motionAnimate } from 'motion'
import dayjs from 'dayjs'
import 'dayjs/locale/fr'
import { computePosition, offset as fuOffset, shift as fuShift, flip as fuFlip } from '@floating-ui/dom'
import * as THREE from 'three'
import type { EngineConfig } from './types'
import { createChatBackend } from './chatBackend'

export function startEngine(cfg: EngineConfig) {
  if (typeof window === 'undefined') return
  if (window.__oddsclubStarted) return
  window.__oddsclubStarted = true

  /* ---------- strings ---------- */
  function S(k, v) {
    var s = cfg.strings && cfg.strings[k] != null ? String(cfg.strings[k]) : k
    if (v) s = s.replace(/\{(\w+)\}/g, function (m, n) { return v[n] != null ? String(v[n]) : m })
    return s
  }
  try { dayjs.locale(cfg.locale) } catch (e) {}

var REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var G = gsap, HAS_ST = true;
G.registerPlugin(ScrollTrigger, Draggable);
document.body.classList.add('ready');
if (G && !REDUCE){ G.set('.headline .ln span', {transition:'none'}); G.fromTo('.headline .ln span', {yPercent:105, y:0}, {yPercent:0, y:0, duration:1.3, ease:'expo.out', stagger:.12, delay:.1}); }
// Lenis: smooth page scrolling, kept in sync with ScrollTrigger
var lenis = !REDUCE ? new Lenis({lerp:.1, smoothWheel:true}) : null;
if (lenis){
  lenis.on('scroll', ScrollTrigger.update); G.ticker.add(function(t){ lenis.raf(t * 1000); }); G.ticker.lagSmoothing(0);
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a || document.body.classList.contains('chat-open')) return;
    var h = a.getAttribute('href'); if (!h || h === '#' || /^#chat/.test(h)) return;
    var t = document.querySelector(h); if (!t) return; e.preventDefault(); lenis.scrollTo(t, {duration:1.2});
  });
}
function $(id){ return document.getElementById(id); }
function el(tag, cls, text){ var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function svg(path){ var s = document.createElementNS('http://www.w3.org/2000/svg','svg'); s.setAttribute('viewBox','0 0 24 24'); s.setAttribute('class','icon'); s.setAttribute('aria-hidden','true'); s.innerHTML = path; return s; }
var ICON = {check:'<path d="M5 12l5 5 9-10"/>', clock:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2 2"/>'};

var LIVE = {matches: [], messages: [], profiles: {}, dirty: true, me: null};
var CHAT = {db:null, user:null, room:null, uid:null, canPost:false, canEdit:false, active:'lounge', replyTo:null, lastSend:0, typingTimer:0, peers:[], pending:{}, renderToken:0, unseenBelow:0};

/* ---------- Scroll state for the 3D phone ---------- */
var hero = document.querySelector('.hero'), feat = $('features');
var callouts = Array.prototype.slice.call(document.querySelectorAll('.callout')), dots = Array.prototype.slice.call(document.querySelectorAll('.dots i'));
var S2 = {pA:0, pB:0, pC:0, feature:-1, prevFeature:-1, inFeat:false, local:0};
function featureLocal(f){ if (f < 0) return 0; return Math.max(0, Math.min(1, (S2.pB * 4.4 - f) / (f === 3 ? 1.4 : 1))); }
var progEls = [];
function paintProgress(f){
  S2.local = featureLocal(f);
  var els = f >= 0 ? [dots[f], callouts.filter(function(c){ return +c.dataset.i === f; })[0]].filter(Boolean).map(function(e){ return e.classList && e.classList.contains('callout') ? e.querySelector('.rule') : e; }).filter(Boolean) : [];
  progEls.forEach(function(e){ if (els.indexOf(e) < 0) e.style.setProperty('--p', '0'); });
  els.forEach(function(e){ e.style.setProperty('--p', S2.local.toFixed(4)); });
  progEls = els;
}
function applyFeature(){
  var f = S2.inFeat && S2.pC < 1 ? Math.min(3, Math.floor(S2.pB * 4.4)) : -1;
  paintProgress(f);
  if (f !== S2.feature){ S2.feature = f;
    callouts.forEach(function(c){ var i = +c.dataset.i; c.classList.toggle('on', i === f); c.classList.toggle('seen', f >= 0 && i < f); });
    dots.forEach(function(d, i){ d.classList.toggle('on', i === f); });
    animateCallouts(f, S2.prevFeature);
    S2.prevFeature = f;
    if (window.onFeatureChange) window.onFeatureChange(f); }
}
function isNarrow(){ return window.innerWidth <= 860; }
function animateCallouts(f, prev, instant){
  feat.classList.add('gsap-callouts');
  var narrow = isNarrow();
  callouts.forEach(function(c){
    var i = +c.dataset.i, parts = c.querySelectorAll('.ic, h3, p'), rule = c.querySelector('.rule');
    var alpha = i === f ? 1 : (narrow ? 0 : (f >= 0 && i < f ? 0.38 : 0.12));
    G.killTweensOf([c, parts, rule]);
    if (instant || REDUCE){ G.set(c, {autoAlpha:alpha, y:0}); G.set(parts, {opacity:1, y:0}); G.set(rule, {width: i === f ? 90 : 0}); return; }
    if (i === f){
      G.set(c, {autoAlpha:1});
      G.fromTo(parts, {opacity:0, y:26}, {opacity:1, y:0, duration:.7, ease:'power3.out', stagger:.08, delay: narrow && prev >= 0 ? .22 : 0});
      G.fromTo(rule, {width:0}, {width:90, duration:.8, ease:'expo.out', delay:(narrow && prev >= 0 ? .22 : 0) + .25});
    } else if (narrow && i === prev){
      G.to(parts, {opacity:0, y:-18, duration:.28, ease:'power2.in', stagger:.04});
      G.to(rule, {width:0, duration:.25, ease:'power2.in'});
      G.set(c, {autoAlpha:0, delay:.4});
    } else {
      G.to(c, {autoAlpha:alpha, duration:.55, ease:'power2.out'});
      G.set(parts, {opacity:1, y:0}); G.to(rule, {width:0, duration:.35, ease:'power2.out'});
    }
  });
}
animateCallouts(-1, -1, true); window.addEventListener('resize', function(){ animateCallouts(S2.feature, S2.feature, true); });
ScrollTrigger.create({trigger:hero, start:'top top', end:'bottom top', onUpdate:function(st){ S2.pA = st.progress; }});
ScrollTrigger.create({trigger:feat, start:'top 15%', end:'bottom bottom', onToggle:function(st){ S2.inFeat = st.isActive || st.progress >= 1; applyFeature(); }, onUpdate:function(st){ S2.inFeat = true; }});
ScrollTrigger.create({trigger:feat, start:'top top', end:'bottom bottom', onUpdate:function(st){ S2.pB = st.progress; applyFeature(); }});
ScrollTrigger.create({trigger:feat, start:'bottom bottom', end:function(){ return '+=' + window.innerHeight * 0.8; }, onUpdate:function(st){ S2.pC = st.progress; applyFeature(); }});
ScrollTrigger.create({start:40, end:'max', onToggle:function(st){ navState(); }, onUpdate:navState});
function navState(){ var r = feat.getBoundingClientRect(), light = r.top < 60 && r.bottom > 60; document.body.classList.toggle('scrolled', window.scrollY > 40 && !light); document.body.classList.toggle('on-light', light); }
navState(); ScrollTrigger.addEventListener('refresh', navState); window.addEventListener('load', function(){ setTimeout(navState, 50); }); setTimeout(navState, 300);

/* ---------- Back to top: appears once you start scrolling, ring shows progress ---------- */
(function(){
  var btn = $('toTop'), prog = $('toTopProg'), C = 2 * Math.PI * 25;
  function update(){ var y = window.scrollY, max = document.documentElement.scrollHeight - window.innerHeight;
    btn.classList.toggle('show', y > 300); prog.style.strokeDashoffset = C * (1 - (max > 0 ? Math.min(1, y / max) : 0)); }
  if (lenis) lenis.on('scroll', update); window.addEventListener('scroll', update, {passive:true}); update();
  btn.addEventListener('click', function(){
    if (!REDUCE) G.fromTo(btn, {scale:.85}, {scale:1, duration:.6, ease:'elastic.out(1, .5)', clearProps:'transform'});
    if (lenis) lenis.scrollTo(0, {duration:1.6}); else window.scrollTo({top:0, behavior: REDUCE ? 'auto' : 'smooth'});
  });
})();
/* ---------- Helpers ---------- */
function initials(n){ return String(n || '?').split(/\s+/).filter(Boolean).slice(0,2).map(function(w){ return w[0]; }).join('').toUpperCase(); }
function teamColor(n){ var h = 0, s = String(n || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return 'hsl(' + h + ',58%,44%)'; }
function fmtOdd(v){ var n = Number(v); return isFinite(n) && n > 0 ? n.toFixed(2) : '–'; }
function hhmm(ts){ return dayjs(ts).format('HH:mm'); }
function dayLabel(ts){ var d = dayjs(ts), n = dayjs(); if (d.isSame(n, 'day')) return S('time.today'); if (d.isSame(n.subtract(1, 'day'), 'day')) return S('time.yesterday'); return d.format(d.isSame(n, 'year') ? 'D MMMM' : 'D MMMM YYYY'); }
function isTodayLabel(l){ return l === S('time.today'); }
function listTime(ts){ if (!ts) return ''; var l = dayLabel(ts); return isTodayLabel(l) ? hhmm(ts) : l; }
function kickoffLabel(iso){ if (!iso) return ''; var d = dayjs(iso); if (!d.isValid()) return String(iso); return d.isSame(dayjs(), 'day') ? d.format('HH:mm') : d.format('D MMM HH:mm'); }
function store(k, v){ try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch(e){ return null; } }
var lastSeen = store('ps_seen') || {};

/* ================= Matches board ================= */
var prevOdds = {}, editing = null;
var SPORT_ICONS = {
  football:'<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z"/>',
  basketball:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.6 5.6c3 3 3 9.8 0 12.8M18.4 5.6c-3 3-3 9.8 0 12.8"/>',
  tennis:'<circle cx="12" cy="12" r="9"/><path d="M5.5 5.5c3.5 3.5 3.5 9.5 0 13M18.5 5.5c-3.5 3.5-3.5 9.5 0 13"/>',
  esports:'<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v3M5.5 12.5h3M15 12h.01M18 13h.01"/>',
  hockey:'<path d="M4 4l6 12h7"/><path d="M20 4l-6 12"/><ellipse cx="12" cy="19" rx="3" ry="1.3"/>',
  volleyball:'<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 9 9 9 0 0 0 7.8 4.5M12 12a9 9 0 0 1-7.8 4.5M12 12c3.5-2 8.5-1.5 9 0"/>',
  other:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'
};
var SPORTS = {}; Object.keys(SPORT_ICONS).forEach(function(k){ SPORTS[k] = {label: S('sport.' + k), p: SPORT_ICONS[k]}; });
function sportOf(m){ return SPORTS[m.sport] ? m.sport : (m.sport ? 'other' : 'football'); }
var BOARD = {sport:'all'};
function renderSportTabs(){
  var box = $('sportTabs'); box.textContent = ''; var counts = {};
  LIVE.matches.forEach(function(m){ var k = sportOf(m); counts[k] = (counts[k] || 0) + 1; });
  var keys = Object.keys(SPORTS).filter(function(k){ return counts[k]; });
  if (BOARD.sport !== 'all' && !counts[BOARD.sport]) BOARD.sport = 'all';
  [['all',S('board.allSports'),null,LIVE.matches.length]].concat(keys.map(function(k){ return [k, SPORTS[k].label, SPORTS[k].p, counts[k]]; })).forEach(function(t){
    var b = el('button', 'stab'); b.type = 'button'; b.setAttribute('aria-pressed', BOARD.sport === t[0] ? 'true' : 'false');
    if (t[2]) b.appendChild(svg(t[2])); b.appendChild(document.createTextNode(t[1])); b.appendChild(el('i', null, String(t[3])));
    b.onclick = function(){ BOARD.sport = t[0]; renderSportTabs(); renderMatches(); }; box.appendChild(b); });
}
var SITE = {bookmaker:'', promo:'', bonus:'', payments:'', signupUrl:'', termsUrl:'', agentName: cfg.agentName || ''};
/* Partners: each one re-themes the whole site. Colours and texts are managed in the back office (Partners). */
var BRANDS = (cfg.partners || []).map(function(p){ return {id:p.id, name:p.name, c:p.c}; });
var BRAND_DATA = {}; (cfg.partners || []).forEach(function(p){ var o = {}; ['promo','bonus','payments','signupUrl','termsUrl'].forEach(function(k){ if (typeof p[k] === 'string' && p[k]) o[k] = p[k].slice(0, 300); }); BRAND_DATA[p.id] = o; });
var CUR_BRAND = null;
function brandById(id){ for (var i = 0; i < BRANDS.length; i++) if (BRANDS[i].id === id) return BRANDS[i]; return null; }
function brandVars(c){ return {'--night':c.night, '--navy':c.navy, '--navy-2':c.navy2, '--panel':c.panel, '--blue':c.blue, '--sky':c.sky, '--green':c.cta, '--green-ink':c.ink, '--yellow':c.odds, '--odd-bg':c.oddBg, '--tint':c.tint, '--deep':c.deep, '--mute':c.mute, '--nav-bg':c.nav}; }
function brandFields(b){ return Object.assign({promo:S('partner.placeholder.promo', {name: b.name.toUpperCase()}), bonus:S('partner.placeholder.bonus', {name: b.name}), payments:S('partner.placeholder.payments'), signupUrl:'', termsUrl:''}, BRAND_DATA[b.id] || {}); }
function movePartnerPill(btn, instant){
  var pill = $('pPill'); if (!pill || !btn) return;
  var x = btn.offsetLeft, w = btn.offsetWidth;
  if (instant || REDUCE){ G.set(pill, {x:x, width:w}); return; }
  var cx = G.getProperty(pill, 'x'), cw = pill.offsetWidth, right = x > cx;
  G.killTweensOf(pill);
  G.timeline().to(pill, {x: right ? cx : x, width: right ? (x + w - cx) : (cx + cw - x), duration:.2, ease:'power2.in'})
              .to(pill, {x:x, width:w, duration:.6, ease:'elastic.out(1, .75)'});
}
function setBrand(id, opts){
  opts = opts || {}; if (!BRANDS.length) return; var b = brandById(id) || BRANDS[0], first = !CUR_BRAND;
  if (!first && b === CUR_BRAND && !opts.force) return;
  CUR_BRAND = b; var f = brandFields(b);
  SITE.bookmaker = b.name; SITE.promo = f.promo; SITE.bonus = f.bonus; SITE.payments = f.payments; SITE.signupUrl = f.signupUrl; SITE.termsUrl = f.termsUrl;
  var vars = brandVars(b.c), root = document.documentElement;
  if (!first && !REDUCE) G.to(root, Object.assign({duration:.9, ease:'power2.inOut', overwrite:true}, vars));
  else for (var k in vars) root.style.setProperty(k, vars[k]);
  applySite();
  document.querySelectorAll('.p-btn').forEach(function(x){ x.setAttribute('aria-pressed', x.dataset.id === b.id ? 'true' : 'false'); });
  var active = document.querySelector('.p-btn[data-id="' + b.id + '"]'); movePartnerPill(active, first);
  if (active){ var box = $('partners'), left = active.offsetLeft - box.clientWidth / 2 + active.offsetWidth / 2; try { box.scrollTo({left: Math.max(0, left), behavior: (first || REDUCE) ? 'auto' : 'smooth'}); } catch(e){ box.scrollLeft = left; } }
  var word = $('pWord');
  if (word){ if (!first && !REDUCE){ G.timeline().to(word, {yPercent:40, opacity:0, duration:.25, ease:'power2.in'}).add(function(){ word.textContent = b.name; }).fromTo(word, {yPercent:-40, opacity:0}, {yPercent:0, opacity:1, duration:.6, ease:'expo.out'}); } else word.textContent = b.name; }
  if (!first && !REDUCE) G.fromTo('.js-code, .js-bookmaker, .js-bonus', {opacity:0, y:6}, {opacity:1, y:0, duration:.5, stagger:.015, ease:'power2.out', clearProps:'transform'});
  if (window.phoneBrand) window.phoneBrand(b, first);
  store('ps_brand', b.id);
  if (!opts.fromHash && !first && !document.body.classList.contains('chat-open')){ try { history.replaceState(null, '', '#b-' + b.id); } catch(e){} }
}
(function(){
  var box = $('partners');
  BRANDS.forEach(function(b){ var bt = el('button', 'p-btn', b.name); bt.type = 'button'; bt.dataset.id = b.id; bt.setAttribute('aria-pressed', 'false'); bt.onclick = function(){ setBrand(b.id); }; box.appendChild(bt); });
  box.addEventListener('keydown', function(e){ if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; var i = BRANDS.indexOf(CUR_BRAND), n = BRANDS.length; i = (i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n; setBrand(BRANDS[i].id); var nb = box.querySelector('.p-btn[data-id="' + BRANDS[i].id + '"]'); if (nb) nb.focus(); e.preventDefault(); });
  window.addEventListener('resize', function(){ movePartnerPill(document.querySelector('.p-btn[aria-pressed="true"]'), true); });
  if (window.ResizeObserver) new ResizeObserver(function(){ movePartnerPill(document.querySelector('.p-btn[aria-pressed="true"]'), true); }).observe(box);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ movePartnerPill(document.querySelector('.p-btn[aria-pressed="true"]'), true); });
})();
function brandFromHash(){ var m = /^#b-([a-z0-9-]+)$/.exec(location.hash); return m && brandById(m[1]) ? m[1] : null; }
window.addEventListener('hashchange', function(){ var id = brandFromHash(); if (id) setBrand(id, {fromHash:true}); });
function safeUrl(u){ return typeof u === 'string' && /^https:\/\//.test(u) ? u : ''; }
function applySite(){
  document.querySelectorAll('.js-bookmaker').forEach(function(e){ e.textContent = SITE.bookmaker; });
  document.querySelectorAll('.js-code').forEach(function(e){ e.textContent = SITE.promo; });
  document.querySelectorAll('.js-bonus').forEach(function(e){ e.textContent = SITE.bonus; });
  document.querySelectorAll('.js-pay').forEach(function(e){ e.textContent = SITE.payments; });
  var su = safeUrl(SITE.signupUrl), tu = safeUrl(SITE.termsUrl);
  document.querySelectorAll('.js-signup').forEach(function(a){ if (su){ a.href = su; a.target = '_blank'; a.rel = 'noopener sponsored'; } else { a.href = '#join'; a.removeAttribute('target'); } });
  document.querySelectorAll('.js-terms').forEach(function(a){ a.hidden = !tu; if (tu){ a.href = tu; a.target = '_blank'; a.rel = 'noopener'; } });
  LIVE.dirty = true;
}
document.addEventListener('click', function(e){
  var b = e.target.closest && e.target.closest('[data-copy-code]'); if (!b) return;
  var code = SITE.promo;
  try { navigator.clipboard.writeText(code).then(function(){ toast(S('toast.codeCopied', {code: code}), true); }, function(){ selectCode(b); }); } catch(err){ selectCode(b); }
});
function selectCode(b){ var t = b.querySelector('.js-code') || document.querySelector('.cc-code'); try { var r = document.createRange(); r.selectNodeContents(t); var s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch(e){} toast(S('toast.selectCode')); }
setBrand(brandFromHash() || store('ps_brand') || cfg.defaultPartner || (BRANDS[0] && BRANDS[0].id), {fromHash:true});
function statusLabel(m){ if (m.status === 'live') return {cls:'live', text: m.minute ? m.minute + "'" : S('match.live')}; if (m.status === 'ft') return {cls:'ft', text:S('match.fullTime')}; return {cls:'', text: m.kickoff || S('match.upcoming')}; }
function teamEl(name, away){ var t = el('div', 'team' + (away ? ' away' : '')), b = el('span', 'badge', initials(name)); b.style.background = teamColor(name); var n = el('span', null, name || S('match.tbc')); if (away){ t.appendChild(n); t.appendChild(b); } else { t.appendChild(b); t.appendChild(n); } return t; }
function renderMatches(){
  var box = $('matches'); box.textContent = '';
  var list = LIVE.matches.filter(function(m){ return BOARD.sport === 'all' || sportOf(m) === BOARD.sport; });
  if (!list.length){ box.appendChild(el('div', 'empty', S('board.emptyEvents'))); return; }
  list.forEach(function(m){
    var card = el('article', 'match'), top = el('div', 'm-top'), st = statusLabel(m), s = el('span', 'm-status ' + st.cls);
    var lg = el('span', 'lg'); lg.appendChild(svg(SPORTS[sportOf(m)].p)); lg.appendChild(el('span', null, (m.league || SPORTS[sportOf(m)].label))); top.appendChild(lg);
    if (st.cls === 'live'){ var d = el('span', 'live-dot'); d.setAttribute('aria-hidden','true'); s.appendChild(d); }
    s.appendChild(document.createTextNode(st.text)); top.appendChild(s); card.appendChild(top);
    var teams = el('div', 'm-teams'), has = m.status === 'live' || m.status === 'ft';
    teams.appendChild(teamEl(m.home));
    var sc = el('div', 'score' + (has ? '' : ' pending'), has ? (Number(m.hs)||0) + ' – ' + (Number(m.as)||0) : S('match.vs'));
    teams.appendChild(sc); teams.appendChild(teamEl(m.away, true)); card.appendChild(teams);
    var two = !(Number(m.ox) > 0), odds = el('div', 'odds' + (two ? ' two' : ''));
    (two ? [['1','o1'],['2','o2']] : [['1','o1'],['X','ox'],['2','o2']]).forEach(function(o){
      var cell = el('div', 'odd'); cell.appendChild(el('small', null, o[0]));
      var v = el('b', null, fmtOdd(m[o[1]])), key = m.id + o[1], before = prevOdds[key], now = Number(m[o[1]]);
      if (before != null && now !== before){ v.className = now > before ? 'up' : 'down'; v.textContent = (now > before ? '▲ ' : '▼ ') + fmtOdd(now); }
      prevOdds[key] = now; cell.appendChild(v); odds.appendChild(cell); });
    card.appendChild(odds);
    var a = el('div', 'm-actions'), chat = el('a', 'btn-text');
    chat.href = '#chat-' + m.id; chat.appendChild(svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'));
    var n = LIVE.messages.filter(function(x){ return x.room === m.id; }).length;
    chat.appendChild(document.createTextNode(n ? S('board.eventChatCount', {n: n}) : S('board.eventChat'))); a.appendChild(chat);
    card.appendChild(a);
    box.appendChild(card);
  });
}
function updateTicker(){
  var live = LIVE.matches.filter(function(m){ return m.status === 'live'; });
  $('tickerText').textContent = live.length
    ? S('ticker.live', {home: live[0].home, away: live[0].away, hs: live[0].hs || 0, as: live[0].as || 0}) + (live[0].minute ? ' · ' + live[0].minute + "'" : '')
    : (LIVE.matches.length ? S('ticker.count', {n: LIVE.matches.length}) : S('ticker.empty'));
}

/* ================= Messenger ================= */
/* ---------- Springs come from Motion (motion.dev); this only adapts its animate() to the chat's needs ---------- */
function SpringValue(v, response, damping, eps){ this.v = v; this.t = v; this.vel = 0; this.eps = eps || 0.05; this.cbs = []; this.anim = null; this.config(response || .5, damping || .85); }
SpringValue.prototype.config = function(response, damping){ this.stiffness = Math.pow(2 * Math.PI / response, 2); this.damping = 4 * Math.PI * damping / response; return this; };
SpringValue.prototype.on = function(f){ this.cbs.push(f); return this; };
SpringValue.prototype.emit = function(){ for (var i = 0; i < this.cbs.length; i++) this.cbs[i](this.v); };
SpringValue.prototype.set = function(v){ if (this.anim){ this.anim.stop(); this.anim = null; } this.v = this.t = v; this.vel = 0; this.emit(); return this; };
SpringValue.prototype.to = function(t, done){
  var self = this; this.t = t;
  if (REDUCE){ this.set(t); if (done) done(); return this; }
  if (this.anim) this.anim.stop();
  var last = performance.now();
  this.anim = motionAnimate(this.v, t, {type:'spring', stiffness:this.stiffness, damping:this.damping, mass:1, velocity:this.vel, restDelta:this.eps, restSpeed:this.eps * 4,
    onUpdate:function(x){ var now = performance.now(), dt = (now - last) / 1000; if (dt > 0) self.vel = (x - self.v) / dt; last = now; self.v = x; self.emit(); },
    onComplete:function(){ self.anim = null; self.v = t; self.vel = 0; self.emit(); if (done) done(); }});
  return this;
};
function Spring(v, response, damping, eps){ return new SpringValue(v, response, damping, eps); }
/* A pill whose two edges are separate springs: the leading edge moves first, so it stretches like liquid. */
function LiquidPill(pill, axis){
  var a = Spring(0, .45, .85, .1), b = Spring(0, .45, .85, .1), ready = false;
  function draw(){ var len = Math.max(0, b.v - a.v);
    if (axis === 'x'){ pill.style.transform = 'translateX(' + a.v + 'px)'; pill.style.width = len + 'px'; }
    else { pill.style.transform = 'translateY(' + a.v + 'px)'; pill.style.height = len + 'px'; } }
  a.on(draw); b.on(draw);
  return {
    move: function(start, end, show){
      pill.style.opacity = show ? 1 : 0;
      if (!ready || !show){ a.set(start); b.set(end); ready = show; return; }
      if (start > a.t){ b.config(.28, .74); a.config(.5, .88); } else { a.config(.28, .74); b.config(.5, .88); }
      a.to(start); b.to(end);
    }
  };
}

var REACTS = [['goal','⚽'],['fire','🔥'],['laugh','😂'],['clap','👏'],['wow','😮']];
var RULE_ICONS = {
  age:'<circle cx="12" cy="12" r="9"/><path d="M8 9v6M11 9h3v3h-3v3h3"/>',
  heart:'<path d="M12 21c-5-3-8-6.5-8-10a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 3.5-3 7-8 10z"/>',
  nolink:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/><path d="M4 4l16 16"/>',
  shield:'<path d="M12 3l8 4v5c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V7z"/><path d="M9 9l6 6M15 9l-6 6"/>',
  tag:'<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/><path d="M4 20L20 4"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  ball:'<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z"/>'
};
var RULES = ((cfg.chat && cfg.chat.rules) || []).map(function(r){ return [r.title, r.body, RULE_ICONS[r.icon] || RULE_ICONS.shield]; });
var SLOW_MS = Math.max(0, Number(cfg.chat && cfg.chat.slowSeconds) || 0) * 1000;
var MAXLEN = Number(cfg.chat && cfg.chat.maxLength) || 400;
var UI = {filter:'all', rows:new Map(), roomEls:new Map(), days:new Map(), renderedRoom:null, newBefore:null, newEl:null, emptyEl:null, typingEl:null, skels:null,
          mod:{muted:{}}, reports:{}, reported:{}, myReports:{}, accepted:false, slowUntil:0, lastText:'', lastTextAt:0, loaded:false, hdrRoom:null};
var segPill = LiquidPill($('segPill'), 'x'), roomPill = LiquidPill($('roomPill'), 'y');
var wallPush = Spring(0, .5, .9, .2).on(function(v){ $('wallIn').style.transform = Math.abs(v) < .2 ? '' : 'translateY(' + v.toFixed(2) + 'px)'; });

var DM = {agent:{uid:null, lastSeen:0}, mine:[], threads:{}, msgs:{}, subs:{}};
function agentName(){ var p = DM.agent.uid && LIVE.profiles[DM.agent.uid]; return (p && p.name) || SITE.agentName || S('chat.agentDefault'); }
function threadOrder(){ return Object.keys(DM.threads).sort(function(a, b){ return (DM.threads[b].lastTs || 0) - (DM.threads[a].lastTs || 0); }); }
function isDmRoom(id){ return id === 'support' || String(id).indexOf('sup:') === 0; }
function isOnline(uid){ return !!uid && viewers().some(function(p){ return !p.isMe && peerId(p) === uid; }); }
function lastSeenOf(uid){ if (uid && uid === DM.agent.uid) return DM.agent.lastSeen || 0; var t = DM.threads[uid]; return (t && Number(t.lastSeen)) || 0; }
function seenText(ts){ if (!ts) return ''; var l = dayLabel(ts); return S('chat.lastSeen', {day: isTodayLabel(l) ? S('time.todayLower') : (l === S('time.yesterday') ? S('time.yesterdayLower') : l), time: hhmm(ts)}); }
function openRoom(id){ if (/^[A-Za-z0-9-]+$/.test(id)) location.hash = 'chat-' + id; else { CHAT.pendingRoom = id; if (location.hash === '#chat-dm') route(); else location.hash = 'chat-dm'; } }
function rooms(){ var list = [];
  if (CHAT.db && CHAT.uid){
    if (CHAT.canEdit) threadOrder().forEach(function(uid){ list.push({id:'sup:' + uid, dm:true, uid:uid, title:nameOf(uid)}); });
    else list.push({id:'support', dm:true, agent:true, uid:DM.agent.uid, title:agentName()});
  }
  list.push({id:'lounge', title:S('chat.lounge'), lounge:true}); LIVE.matches.forEach(function(m){ list.push({id:m.id, title:S('chat.matchTitle', {home: m.home, away: m.away}), match:m}); }); return list; }
function roomById(id){ return rooms().filter(function(r){ return r.id === id; })[0] || rooms()[0]; }
function viewers(){ return CHAT.peers.filter(function(p){ return p.kind === 'viewer'; }); }
function online(roomId){ return viewers().filter(function(p){ return roomId ? (p.presence && p.presence.room === roomId) : true; }).length; }
function peerId(p){ return p.by || (p.presence && p.presence.uid) || null; }
function onlineSet(){ var s = {}; viewers().forEach(function(p){ var id = peerId(p); if (id) s[id] = true; }); return s; }
function typersIn(roomId){ return viewers().filter(function(p){ if (p.isMe || !p.presence || !p.presence.typing) return false; var r = p.presence.room;
  if (roomId === 'support') return r === 'sup:' + CHAT.uid;
  if (String(roomId).indexOf('sup:') === 0) return r === 'support' && peerId(p) === roomId.slice(4);
  return r === roomId; }); }
async function names(ids){ ids = ids.filter(function(x, i, a){ return x && a.indexOf(x) === i && !LIVE.profiles[x]; }); if (!ids.length || !CHAT.user) return; try { var ps = await CHAT.user.profiles(ids); for (var k in ps) LIVE.profiles[k] = ps[k]; } catch(e){} }
function nameOf(id){ if (id && id === CHAT.uid) return S('chat.you'); var p = LIVE.profiles[id]; if (p && p.name) return p.name; if (id && id === DM.agent.uid) return agentName(); return S('chat.fan'); }
function roomMsgs(id){ if (id === 'support') return DM.mine; if (String(id).indexOf('sup:') === 0) return DM.msgs[id.slice(4)] || []; return LIVE.messages.filter(function(m){ return (m.room || 'lounge') === id; }); }

var toastTimer = 0;
function toast(msg, ok){ var t = $('toast'); $('toastText').textContent = msg; t.classList.toggle('ok', !!ok); t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function(){ t.classList.remove('show'); }, 2800); }

function personAvatar(uid, showOnline, agent){
  var av = el('div', 'r-av person' + (agent && !uid ? ' agent' : '')); av.setAttribute('aria-hidden', 'true');
  var p = uid && LIVE.profiles[uid];
  if (p && p.avatarUrl){ var img = document.createElement('img'); img.alt = ''; img.src = p.avatarUrl; av.appendChild(img); }
  else if (agent && !uid) av.appendChild(svg('<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/><path d="M19 20a3 3 0 0 1-3 2h-3"/>'));
  else { var i = el('span', 'ini', initials(agent ? agentName() : nameOf(uid))); i.style.background = (p && p.color) || teamColor(uid || 'x'); av.appendChild(i); }
  if (showOnline && isOnline(uid)) av.appendChild(el('span', 'on'));
  return av;
}
function roomAvatar(r, showOnline){
  if (r.dm) return personAvatar(r.uid, showOnline, r.agent);
  var av = el('div', 'r-av ' + (r.lounge ? 'lounge' : 'pair')); av.setAttribute('aria-hidden', 'true');
  if (r.lounge) av.appendChild(svg('<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5M15 14.5c2.8 0 5 1.6 5 4.5"/>'));
  else [r.match.home, r.match.away].forEach(function(n){ var b = el('span', 'badge', initials(n)); b.style.background = teamColor(n); av.appendChild(b); });
  if (showOnline && online(r.id) > 1) av.appendChild(el('span', 'on'));
  return av;
}

/* ---------- Filter control ---------- */
function placeSegPill(){ var b = document.querySelector('#seg button[aria-pressed="true"]'); if (b && b.offsetWidth) segPill.move(b.offsetLeft, b.offsetLeft + b.offsetWidth, true); }
document.querySelectorAll('#seg button').forEach(function(c){ c.onclick = function(){ UI.filter = c.dataset.f; document.querySelectorAll('#seg button').forEach(function(x){ x.setAttribute('aria-pressed', x === c ? 'true' : 'false'); }); placeSegPill(); renderRooms(); }; });
$('roomSearch').addEventListener('input', renderRooms);

/* ---------- Room list (keyed; the selection pill glides between rooms) ---------- */
function renderRooms(){
  var q = $('roomSearch').value.trim().toLowerCase(), ul = $('rooms');
  var list = rooms().filter(function(r){
    if (q && r.title.toLowerCase().indexOf(q) < 0) return false;
    if (UI.filter === 'live') return r.lounge || (r.match && r.match.status === 'live');
    if (UI.filter === 'upcoming') return r.lounge || (r.match && r.match.status === 'upcoming');
    return true; });
  var keep = new Set([$('roomPill')]);
  list.forEach(function(r, i){
    var li = UI.roomEls.get(r.id);
    if (!li){ li = el('li'); var b = el('button', 'room'); b.type = 'button'; b.onclick = function(){ openRoom(r.id); }; li.appendChild(b); UI.roomEls.set(r.id, li); }
    keep.add(li); fillRoom(li.firstChild, r);
    if (ul.children[i + 1] !== li) ul.insertBefore(li, ul.children[i + 1] || null);
  });
  Array.prototype.slice.call(ul.children).forEach(function(c){ if (!keep.has(c)) c.remove(); });
  placeRoomPill();
}
function placeRoomPill(){
  var li = UI.roomEls.get(CHAT.active), show = !!(li && li.isConnected && isOpen() && window.innerWidth > 820);
  if (li && li.isConnected) roomPill.move(li.offsetTop, li.offsetTop + li.offsetHeight, show); else roomPill.move(0, 0, false);
}
function fillRoom(b, r){
  var msgs = roomMsgs(r.id), last = msgs[msgs.length - 1];
  var unread = msgs.filter(function(m){ return m.ts > (lastSeen[r.id] || 0) && m.by !== CHAT.uid; }).length;
  if (!last && r.dm && r.uid && DM.threads[r.uid] && DM.threads[r.uid].lastTs){ var th = DM.threads[r.uid]; last = {id:'t' + th.lastTs, text:String(th.lastText || ''), ts:Number(th.lastTs), by:th.lastBy}; if (last.ts > (lastSeen[r.id] || 0) && last.by !== CHAT.uid) unread = 1; }
  var typ = typersIn(r.id), current = r.id === CHAT.active && isOpen();
  var sig = [r.title, last && last.id, last && last.text, unread, typ.length, r.dm ? isOnline(r.uid) : online(r.id) > 0, r.dm && LIVE.profiles[r.uid] && LIVE.profiles[r.uid].avatarUrl, r.match && [r.match.status, r.match.hs, r.match.as, r.match.kickoff], current, last && nameOf(last.by)].join('|');
  if (b._sig === sig) return; b._sig = sig;
  b.textContent = ''; if (current) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
  b.appendChild(roomAvatar(r, true));
  var main = el('div', 'r-main'), t = el('div', 'r-title'); t.appendChild(el('span', null, r.title));
  if (r.agent) t.appendChild(el('span', 'r-tag', S('chat.partnerTag')));
  if (r.match && r.match.status === 'live'){ t.appendChild(el('span', 'r-live', S('chat.liveTag'))); t.appendChild(el('span', 'r-score', (r.match.hs||0) + '–' + (r.match.as||0))); }
  main.appendChild(t);
  var prev = typ.length ? (typ.length === 1 ? S('chat.isTyping', {name: nameOf(peerId(typ[0]))}) : S('chat.peopleTyping', {n: typ.length}))
    : last ? (last.by === CHAT.uid ? S('chat.lastByYou', {text: last.text}) : (r.dm ? last.text : S('chat.lastBy', {name: nameOf(last.by), text: last.text}))) : r.dm ? (r.agent ? S('chat.agentHint') : S('chat.noMessages')) : (r.lounge ? S('chat.loungeHint') : (r.match.status === 'upcoming' ? S('chat.starts', {time: r.match.kickoff || S('chat.soon')}) : (r.match.league || S('chat.eventRoom'))));
  main.appendChild(el('div', 'r-last' + (typ.length ? ' typing' : ''), prev)); b.appendChild(main);
  var side = el('div', 'r-side'); side.appendChild(el('span', 'r-time', last ? listTime(last.ts) : ''));
  if (unread && !current) side.appendChild(el('span', 'unread', unread > 99 ? '99+' : String(unread)));
  b.appendChild(side);
  b.setAttribute('aria-label', unread ? S('chat.roomUnreadAria', {title: r.title, n: unread}) : r.title);
}

/* ---------- Header (updated in place, never rebuilt mid-view) ---------- */
function renderHeader(){
  var r = roomById(CHAT.active), on = r.dm && isOnline(r.uid);
  var key = r.id + '|' + r.title + '|' + on + '|' + (r.dm && LIVE.profiles[r.uid] ? LIVE.profiles[r.uid].avatarUrl : '');
  if (UI.hdrRoom !== key){ var av = $('cAvatar'); av.textContent = ''; av.appendChild(roomAvatar(r, true)); $('cTitle').textContent = r.title; UI.hdrRoom = key; }
  var sub = $('cSub'), typ = typersIn(CHAT.active), text = '', cls = '', dot = false;
  if (typ.length){ cls = 'typing'; text = r.dm ? S('chat.typingShort') : (typ.length === 1 ? S('chat.isTyping', {name: nameOf(peerId(typ[0]))}) : S('chat.peopleAreTyping', {n: typ.length})); }
  else if (r.dm){
    if (on){ cls = 'on'; text = S('chat.online'); }
    else { text = seenText(lastSeenOf(r.uid)) || (r.agent ? S('chat.agentSub') : S('chat.fan')); }
  } else {
    var here = viewers().filter(function(p){ return !p.isMe && p.presence && p.presence.room === CHAT.active; });
    var ids = here.map(peerId).filter(function(x, i, a){ return x && a.indexOf(x) === i; });
    if (ids.length){ dot = true; var nm = ids.slice(0, 2).map(nameOf); text = ids.length > 2 ? S('chat.hereMore', {names: nm.join(', '), n: ids.length - 2}) : S('chat.hereList', {names: nm.join(', ')}); }
    else text = r.match ? S('chat.groupSub', {league: r.match.league || S('chat.eventRoom')}) : S('chat.loungeSub');
  }
  sub.className = cls; sub.textContent = '';
  if (dot){ var d = el('span', 'c-sub-dot'); d.setAttribute('aria-hidden', 'true'); sub.appendChild(d); }
  sub.appendChild(document.createTextNode(text));
  var sc = $('cScore');
  if (r.match){ var m = r.match, k2 = [m.status, m.hs, m.as, m.minute, m.kickoff].join('|');
    if (sc._key !== k2){ sc._key = k2; sc.textContent = ''; var pl = el('div', 'scorepill');
      if (m.status === 'live'){ var ld = el('span', 'live-dot'); ld.setAttribute('aria-hidden','true'); pl.appendChild(ld); pl.appendChild(el('span', 's', (m.hs||0) + ' – ' + (m.as||0))); if (m.minute) pl.appendChild(el('span', null, m.minute + "'")); }
      else if (m.status === 'ft'){ pl.appendChild(el('span', 's', (m.hs||0) + ' – ' + (m.as||0))); pl.appendChild(el('span', null, S('match.ftShort'))); }
      else pl.appendChild(el('span', null, S('chat.starts', {time: m.kickoff || S('chat.soon')})));
      sc.appendChild(pl); } }
  else if (sc._key){ sc._key = ''; sc.textContent = ''; }
}
/* ---------- Conversation ---------- */
function buildRow(m){
  var row = el('div', 'row'); row.dataset.id = m.id;
  var av = el('div', 'av'), img = document.createElement('img'); img.alt = ''; av.appendChild(img); row._av = av; row._img = img;
  var bw = el('div', 'bwrap'), b = el('div', 'bubble'); b.tabIndex = 0;
  var sw = el('span', 'swipe-ic'); sw.appendChild(svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v3"/>')); b.appendChild(sw);
  row._name = el('div', 'b-name'); row._quote = el('div', 'b-quote'); row._text = el('div', 'b-text'); row._meta = el('span', 'b-meta');
  [row._name, row._quote, row._text].forEach(function(x){ b.appendChild(x); });
  row._reacts = el('div', 'reacts');
  var acts = el('div', 'acts glass'); acts.setAttribute('role', 'toolbar'); acts.setAttribute('aria-label', S('chat.actionsAria'));
  REACTS.forEach(function(rx){ var bt = el('button', 'emo', rx[1]); bt.type = 'button'; bt.setAttribute('aria-label', S('chat.reactAria', {name: S('react.' + rx[0])})); bt.onclick = function(e){ e.stopPropagation(); toggleReact(row._m, rx[0]); }; acts.appendChild(bt); });
  acts.appendChild(el('span', 'sep'));
  var rp = el('button'); rp.type = 'button'; rp.setAttribute('aria-label', S('chat.reply')); rp.appendChild(svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v3"/>')); rp.onclick = function(e){ e.stopPropagation(); startReply(row._m); }; acts.appendChild(rp);
  var mo = el('button'); mo.type = 'button'; mo.setAttribute('aria-label', S('chat.moreActions')); mo.appendChild(svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>')); mo.onclick = function(e){ e.stopPropagation(); openCtx(row); }; acts.appendChild(mo);
  bw.appendChild(acts); bw.appendChild(b); bw.appendChild(row._reacts);
  row.appendChild(av); row.appendChild(bw); row._bubble = b;
  b.addEventListener('contextmenu', function(e){ e.preventDefault(); openCtx(row); });
  b.addEventListener('dblclick', function(){ startReply(row._m); });
  b.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openCtx(row); } });
  row._quote.addEventListener('click', function(e){ e.stopPropagation(); var q = row._m.reply; if (!q) return; var t = UI.rows.get(q.id); if (!t){ toast(S('chat.quoteGone')); return; }
    t.scrollIntoView({block:'center', behavior: REDUCE ? 'auto' : 'smooth'}); t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash'); });
  // touch: press-and-hold opens the menu, swipe right replies (spring back)
  var sx = 0, sy = 0, drag = false, swiping = false, holdTimer = 0, sp = Spring(0, .42, .72, .3).on(function(v){ b.style.translate = Math.abs(v) < .3 ? '' : v.toFixed(1) + 'px 0'; sw.style.opacity = Math.min(1, v / 50); sw.style.transform = 'scale(' + (0.5 + Math.min(.5, v / 100)) + ')'; });
  b.addEventListener('pointerdown', function(e){ if (e.pointerType === 'mouse') return; sx = e.clientX; sy = e.clientY; drag = true; swiping = false; b.classList.add('pressing');
    holdTimer = setTimeout(function(){ if (drag && !swiping){ drag = false; b.classList.remove('pressing'); if (navigator.vibrate) try { navigator.vibrate(8); } catch(e2){} openCtx(row); } }, 420); });
  b.addEventListener('pointermove', function(e){ if (!drag) return; var dx = e.clientX - sx, dy = e.clientY - sy;
    if (!swiping && (Math.abs(dx) > 8 || Math.abs(dy) > 8)){ clearTimeout(holdTimer); b.classList.remove('pressing'); if (Math.abs(dx) > Math.abs(dy) && dx > 0) swiping = true; else { drag = false; return; } }
    if (swiping){ var x = Math.max(0, dx); sp.set(x * 0.7 / (1 + x / 260)); } });
  function end(){ clearTimeout(holdTimer); b.classList.remove('pressing'); if (!drag) return; drag = false; if (swiping && sp.v > 46) startReply(row._m); swiping = false; sp.to(0); }
  b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end);
  return row;
}
function fillRow(row, m, f){
  row._m = m;
  var mine = m.by && m.by === CHAT.uid, on = f.online[m.by], flat = CHAT.theme === 'discord', dm = isDmRoom(CHAT.active);
  row.classList.toggle('out', !!mine); row.classList.toggle('in', !mine); row.classList.toggle('gap', f.first); row.classList.toggle('tail', f.tail);
  var rx = m.reactions || {}, rsig = REACTS.map(function(r){ var o = rx[r[0]] || {}; return Object.keys(o).filter(function(k){ return o[k]; }).sort().join(','); }).join('|');
  var sig = [CHAT.theme, dm, m.text, mine, f.first, f.tail, !!on, nameOf(m.by), !!CHAT.pending[m.id], m.reply && m.reply.id, rsig, UI.reports[m.id] || 0, m.mod].join('§');
  if (row._sig === sig) return; row._sig = sig;
  row._av.className = 'av' + ((flat ? f.first : f.tail) ? '' : ' hide'); row._av.hidden = (!!mine || dm) && !flat;
  var p = LIVE.profiles[m.by], ini = row._av.querySelector('.ini');
  if (p && p.avatarUrl){ if (row._img.getAttribute('src') !== p.avatarUrl) row._img.src = p.avatarUrl; row._img.hidden = false; if (ini) ini.remove(); }
  else { row._img.hidden = true; if (!ini){ ini = el('span', 'ini'); row._av.insertBefore(ini, row._img); } ini.textContent = initials(mine && LIVE.me && LIVE.me.name ? LIVE.me.name : nameOf(m.by)); ini.style.background = (p && p.color) || teamColor(m.by || 'fan'); }
  var dot = row._av.querySelector('.on'); if (on && !dot) row._av.appendChild(el('span', 'on')); if (!on && dot) dot.remove();
  row._name.hidden = (mine && !flat) || (dm && !flat) || !f.first; row._name.textContent = '';
  if (!row._name.hidden){ row._name.appendChild(el('span', null, mine ? (flat ? ((LIVE.me && LIVE.me.name) || S('chat.you')) : S('chat.you')) : nameOf(m.by))); row._name.style.color = mine && flat ? '' : ((p && p.color) || 'var(--c-accent)'); if (m.mod) row._name.appendChild(el('span', 'mod', S('chat.modTag'))); }
  row._quote.hidden = !(m.reply && m.reply.id); row._quote.textContent = '';
  if (!row._quote.hidden){ row._quote.appendChild(el('b', null, nameOf(m.reply.by))); row._quote.appendChild(el('span', null, String(m.reply.text || '').slice(0, 140))); }
  row._text.textContent = m.text; row._text.appendChild(row._meta);
  row._meta.textContent = ''; row._meta.appendChild(document.createTextNode(hhmm(m.ts)));
  if (CHAT.canEdit && UI.reports[m.id]){ var fl = svg('<path d="M5 21V4h11l-2 4 2 4H5"/>'); fl.classList.add('flag'); fl.setAttribute('role','img'); fl.removeAttribute('aria-hidden'); fl.setAttribute('aria-label', S('chat.reportsAria', {n: UI.reports[m.id]})); row._meta.appendChild(fl); }
  if (mine){ var pend = !!CHAT.pending[m.id], ic = svg(pend ? ICON.clock : ICON.check); ic.setAttribute('role','img'); ic.removeAttribute('aria-hidden'); ic.setAttribute('aria-label', pend ? S('chat.sending') : S('chat.sent')); row._meta.appendChild(ic); }
  row._reacts.textContent = '';
  REACTS.forEach(function(r){ var o = rx[r[0]] || {}, who = Object.keys(o).filter(function(k){ return o[k]; }); if (!who.length) return;
    var bt = el('button', 'react' + (who.indexOf(CHAT.uid) >= 0 ? ' mine' : '')); bt.type = 'button';
    bt.appendChild(el('span', null, r[1])); bt.appendChild(el('span', null, String(who.length)));
    bt.setAttribute('aria-label', S(who.indexOf(CHAT.uid) >= 0 ? 'chat.reactionsAriaMine' : 'chat.reactionsAria', {n: who.length, name: S('react.' + r[0])}));
    bt.onclick = function(e){ e.stopPropagation(); toggleReact(m, r[0]); }; row._reacts.appendChild(bt); });
  row._reacts.hidden = !row._reacts.childNodes.length;
}
function dayEl(label){ var d = UI.days.get(label); if (!d){ d = el('div', 'day', label); UI.days.set(label, d); } return d; }
function emptyEl(){ if (!UI.emptyEl){ var e = el('div', 'c-empty glass');
  e.innerHTML = '<svg class="ball" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/></svg>';
  e.appendChild(el('b', null, S('chat.emptyTitle'))); e.appendChild(el('span', null, S('chat.emptyBody'))); UI.emptyEl = e; } return UI.emptyEl; }
function typingEl(typ){
  if (!UI.typingEl){ var r = el('div', 'row in tail typingrow enter'); var av = el('div', 'av'); var ini = el('span', 'ini'); av.appendChild(ini); r.appendChild(av);
    var bw = el('div', 'bwrap'), b = el('div', 'bubble'), d = el('div', 'dots3'); d.innerHTML = '<i></i><i></i><i></i>'; b.appendChild(d); bw.appendChild(b); r.appendChild(bw); r.setAttribute('aria-label', S('chat.someoneTyping')); UI.typingEl = r; }
  var id = peerId(typ[0]), p = LIVE.profiles[id], ini2 = UI.typingEl.querySelector('.ini'); ini2.textContent = initials(nameOf(id)); ini2.style.background = (p && p.color) || teamColor(id || 'fan');
  return UI.typingEl;
}
var renderToken = 0;
async function renderConvo(mode){
  var token = ++renderToken, wall = $('wall'), inner = $('wallIn'), roomChanged = UI.renderedRoom !== CHAT.active;
  var msgs = roomMsgs(CHAT.active);
  await names(msgs.map(function(m){ return m.by; }).concat(msgs.map(function(m){ return m.reply && m.reply.by; })).concat(viewers().map(peerId)));
  if (token !== renderToken) return;
  if (roomChanged){
    inner.textContent = ''; UI.rows.clear(); UI.days.clear(); UI.renderedRoom = CHAT.active; UI.typingEl = null; wallPush.set(0);
    var seen = lastSeen[CHAT.active] || 0, firstNew = msgs.filter(function(m){ return m.ts > seen && m.by !== CHAT.uid; })[0];
    UI.newBefore = seen && firstNew ? firstNew.id : null; UI.newEl = null; CHAT.unseenBelow = 0;
  }
  var initial = roomChanged || !inner.querySelector('.row:not(.typingrow)');
  var atBottom = wall.scrollHeight - wall.scrollTop - wall.clientHeight < 80, oldH = inner.offsetHeight;
  var desired = [];
  if (!UI.loaded && CHAT.db){ if (!UI.skels){ UI.skels = []; for (var s = 0; s < 5; s++){ var sk = el('div', 'skel'); sk.style.width = (40 + (s * 37) % 45) + '%'; sk.style.alignSelf = s % 2 ? 'flex-end' : 'flex-start'; UI.skels.push(sk); } } desired = desired.concat(UI.skels); }
  else if (!msgs.length) desired.push(emptyEl());
  var online = onlineSet(), lastDay = '', added = 0;
  msgs.forEach(function(m, i){
    var day = dayLabel(m.ts); if (day !== lastDay){ desired.push(dayEl(day)); lastDay = day; }
    if (m.id === UI.newBefore){ if (!UI.newEl) UI.newEl = el('div', 'newline', S('chat.newMessages')); desired.push(UI.newEl); }
    var prev = msgs[i - 1], next = msgs[i + 1];
    var first = !prev || prev.by !== m.by || m.ts - prev.ts > 300000 || dayLabel(prev.ts) !== day || m.id === UI.newBefore;
    var tail = !next || next.by !== m.by || next.ts - m.ts > 300000 || dayLabel(next.ts) !== day || next.id === UI.newBefore;
    var row = UI.rows.get(m.id);
    if (!row){ row = buildRow(m); UI.rows.set(m.id, row); if (!initial){ row.classList.add('enter'); added++; } }
    fillRow(row, m, {first:first, tail:tail, online:online});
    desired.push(row);
  });
  var typ = typersIn(CHAT.active); if (typ.length && UI.loaded) desired.push(typingEl(typ));
  var keep = new Set(desired);
  UI.rows.forEach(function(row, id){ if (!keep.has(row)){ UI.rows.delete(id); row.remove(); } });
  Array.prototype.slice.call(inner.children).forEach(function(c){ if (!keep.has(c)) c.remove(); });
  var ref = inner.firstChild;
  desired.forEach(function(node){ if (node === ref) ref = ref.nextSibling; else inner.insertBefore(node, ref); });
  // scroll without jumps: keep the view pinned to the bottom and let the content glide up on a spring
  if (initial){
    if (UI.newEl && UI.newEl.isConnected) UI.newEl.scrollIntoView({block:'center'}); else wall.scrollTop = wall.scrollHeight;
    markSeen();
  } else if (atBottom || mode === 'mine'){
    var delta = inner.offsetHeight - oldH;
    wall.scrollTop = wall.scrollHeight;
    if (delta && !REDUCE){ wallPush.set(wallPush.v + delta); wallPush.to(0); }
    CHAT.unseenBelow = 0; markSeen();
  } else if (added) CHAT.unseenBelow += added;
  updateJump();
}
function markSeen(){ if (!isOpen()) return; var msgs = roomMsgs(CHAT.active), l = msgs[msgs.length - 1]; if (l && (lastSeen[CHAT.active] || 0) < l.ts){ lastSeen[CHAT.active] = l.ts; store('ps_seen', lastSeen); renderRooms(); } }
function updateJump(){ var w = $('wall'), far = w.scrollHeight - w.scrollTop - w.clientHeight > 220; $('jump').classList.toggle('show', far); var c = $('jumpCount'); c.hidden = !(far && CHAT.unseenBelow); c.textContent = CHAT.unseenBelow; }
$('wall').addEventListener('scroll', function(){ var w = this; if (w.scrollHeight - w.scrollTop - w.clientHeight < 60){ CHAT.unseenBelow = 0; markSeen(); } updateJump(); }, {passive:true});
$('jump').onclick = function(){ var w = $('wall'); w.scrollTo({top: w.scrollHeight, behavior: REDUCE ? 'auto' : 'smooth'}); };

/* ---------- iOS-style context menu: the message lifts, reactions above, actions below ---------- */
var CTX = {row:null, clone:null, lift:null};
function openCtx(row){
  if (CTX.row) closeCtx(true);
  var m = row._m, mine = m.by === CHAT.uid, b = row._bubble, r = b.getBoundingClientRect(), ctx = $('ctx'), W = window.innerWidth, H = window.innerHeight;
  var clone = b.cloneNode(true); clone.classList.add('ctx-bubble', mine ? 'out' : 'in'); clone.classList.remove('pressing'); clone.removeAttribute('tabindex');
  clone.style.left = r.left + 'px'; clone.style.top = r.top + 'px'; clone.style.width = r.width + 'px'; clone.style.transformOrigin = mine ? 'right center' : 'left center';
  ctx.insertBefore(clone, $('ctxReact')); b.classList.add('lifted-src');
  // reactions
  var rbar = $('ctxReact'); rbar.textContent = '';
  REACTS.forEach(function(rx, i){ var on = m.reactions && m.reactions[rx[0]] && m.reactions[rx[0]][CHAT.uid];
    var bt = el('button', on ? 'mine' : '', rx[1]); bt.type = 'button'; bt.setAttribute('aria-label', S('chat.reactAria', {name: S('react.' + rx[0])})); bt.style.transitionDelay = (40 + i * 30) + 'ms';
    bt.onclick = function(){ toggleReact(m, rx[0]); closeCtx(); }; rbar.appendChild(bt); });
  // actions
  var menu = $('ctxMenu'); menu.textContent = '';
  function item(label, path, fn, danger){ var bt = el('button', danger ? 'danger' : ''); bt.type = 'button'; bt.setAttribute('role', 'menuitem'); bt.appendChild(el('span', null, label)); bt.appendChild(svg(path)); bt.onclick = function(){ closeCtx(); fn(); }; menu.appendChild(bt); }
  item(S('chat.reply'), '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v3"/>', function(){ startReply(m); });
  item(S('chat.copy'), '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>', function(){
    try { navigator.clipboard.writeText(m.text).then(function(){ toast(S('chat.copied'), true); }, function(){ toast(S('chat.copyBlocked')); }); } catch(e){ toast(S('chat.copyBlocked')); } });
  if (!mine && CHAT.canPost) item(UI.reported[m.id] ? S('chat.reported') : S('chat.report'), '<path d="M5 21V4h11l-2 4 2 4H5"/>', function(){ report(m); });
  if (CHAT.canEdit && !mine && m.by) item(UI.mod.muted[m.by] ? S('chat.unmute', {name: nameOf(m.by)}) : S('chat.mute', {name: nameOf(m.by)}), '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/>', function(){ setMuted(m.by, !UI.mod.muted[m.by]); }, true);
  if (CHAT.canEdit || (mine && CHAT.canPost)) item(S('chat.delete'), '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', function(){ backend.remove(m).then(function(){ toast(S('chat.deleted'), true); }, function(){ toast(S('chat.deleteFailed')); }); }, true);
  ctx.classList.add('open'); ctx.setAttribute('aria-hidden', 'false');
  // fit everything on screen: move the lifted bubble so reactions fit above and the menu below
  var rh = 56, mh = menu.offsetHeight, gap = 10, top = r.top, maxTop = H - mh - gap * 2 - r.height - 20, minTop = rh + gap + 20 + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0);
  top = Math.max(minTop, Math.min(maxTop, top));
  var lift = Spring(0, .45, .78, .002).on(function(v){ clone.style.transform = 'translateY(' + ((top - r.top) * v).toFixed(1) + 'px) scale(' + (1 + .04 * v).toFixed(4) + ')'; });
  lift.to(1); CTX.row = row; CTX.clone = clone; CTX.lift = lift; CTX.top = top; CTX.r = r;
  var rw = rbar.offsetWidth, mw = menu.offsetWidth, side = mine ? 'right' : 'left';
  var lx = mine ? Math.min(W - 12 - rw, r.right - rw) : Math.max(12, r.left), mx = mine ? Math.min(W - 12 - mw, r.right - mw) : Math.max(12, Math.min(r.left, W - 12 - mw));
  rbar.style.left = Math.max(12, lx) + 'px'; rbar.style.top = (top - rh - gap) + 'px'; rbar.style.transformOrigin = 'bottom ' + side;
  menu.style.left = Math.max(12, mx) + 'px'; menu.style.top = (top + r.height + gap + 4) + 'px'; menu.style.transformOrigin = 'top ' + side;
  var ref = {getBoundingClientRect:function(){ return {x:r.left, y:top, left:r.left, top:top, right:r.right, bottom:top + r.height, width:r.width, height:r.height}; }};
  computePosition(ref, rbar, {strategy:'fixed', placement: mine ? 'top-end' : 'top-start', middleware:[fuOffset(10), fuShift({padding:12})]}).then(function(pos){ rbar.style.left = pos.x + 'px'; rbar.style.top = pos.y + 'px'; });
  computePosition(ref, menu, {strategy:'fixed', placement: mine ? 'bottom-end' : 'bottom-start', middleware:[fuOffset(12), fuFlip(), fuShift({padding:12})]}).then(function(pos){ menu.style.left = pos.x + 'px'; menu.style.top = pos.y + 'px'; menu.style.transformOrigin = (pos.placement.indexOf('top') === 0 ? 'bottom ' : 'top ') + side; });
  setTimeout(function(){ var f = rbar.querySelector('button'); if (f) f.focus({preventScroll:true}); }, 60);
}
function closeCtx(instant){
  var ctx = $('ctx'); if (!CTX.row) return; var row = CTX.row, clone = CTX.clone;
  ctx.classList.remove('open'); ctx.setAttribute('aria-hidden', 'true');
  var finish = function(){ if (clone.isConnected) clone.remove(); row._bubble.classList.remove('lifted-src'); };
  CTX.row = null;
  if (instant || REDUCE) finish(); else CTX.lift.to(0, finish);
}
$('ctxBg').addEventListener('click', function(){ closeCtx(); });
function needsRules(){ if (!CHAT.canPost){ toast(CHAT.uid ? S('chat.cannotPost') : S('chat.signInToJoin')); return true; }
  if (UI.mod.muted[CHAT.uid]){ toast(S('chat.mutedToast')); return true; }
  if (!UI.accepted){ openRules(); return true; } return false; }
function toggleReact(m, key){
  if (!m || needsRules()) return;
  var cur = m.reactions && m.reactions[key] && m.reactions[key][CHAT.uid];
  backend.react(m, key, !cur).catch(function(){ toast(S('chat.reactionFailed')); });
}
function report(m){
  if (UI.reported[m.id]){ toast(S('chat.alreadyReported')); return; }
  backend.report(m).then(function(){ UI.reported[m.id] = true; toast(S('chat.reportedToast'), true); }, function(){ toast(S('chat.reportFailed')); });
}
function setMuted(id, on){
  backend.mute(id, on).then(function(){ toast(on ? S('chat.mutedUser', {name: nameOf(id)}) : S('chat.unmutedUser', {name: nameOf(id)}), true); }, function(){ toast(S('chat.muteFailed')); });
}
function startReply(m){
  if (!m || needsRules()) return;
  CHAT.replyTo = {id:m.id, by:m.by || null, text:String(m.text).slice(0,140)};
  $('replyWho').textContent = S('chat.replyingTo', {name: nameOf(m.by)}); $('replyText').textContent = m.text; $('replyWrap').classList.add('show'); $('msgInput').focus({preventScroll:true});
}
function clearReply(){ CHAT.replyTo = null; $('replyWrap').classList.remove('show'); }
$('replyClose').onclick = clearReply;

/* ---------- Rules: checked before a message is sent (the server checks again) ---------- */
var BAD = ((cfg.chat && cfg.chat.bannedWords) || []).map(function(w){ return String(w).toLowerCase().replace(/[^a-z]/g, ''); }).filter(Boolean);
function norm(s){ return s.toLowerCase().replace(/[0@]/g,'o').replace(/[1!|]/g,'i').replace(/3/g,'e').replace(/4/g,'a').replace(/[5$]/g,'s').replace(/7/g,'t').replace(/[^a-z]/g,''); }
function checkMessage(text){
  if (UI.mod.muted[CHAT.uid]) return S('rule.muted');
  if (Date.now() < UI.slowUntil) return S('rule.slow', {s: Math.ceil((UI.slowUntil - Date.now()) / 1000)});
  if (/(https?:\/\/|www\.|t\.me\/|wa\.me\/|\b[a-z0-9-]{2,}\.(com|net|org|io|bet|xyz|me|co|ly|app|link|site|online|info|biz|tv|gg)\b)/i.test(text)) return S('rule.links');
  if (!CHAT.canEdit && /(promo\s*-?\s*code|promocode|bonus\s*code|ref(erral)?\s*(code|link)|invite\s*(code|link)|use\s*(my|this)\s*code|code\s*[:=])/i.test(text) && text.toUpperCase().indexOf(String(SITE.promo).toUpperCase()) < 0) return S('rule.codes');
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text)) return S('rule.emails');
  if (/(\+?\d[\d\s().-]{7,}\d)/.test(text) && text.replace(/\D/g,'').length >= 8) return S('rule.phones');
  if (/(fixed\s*-?\s*match|sure\s*(odds|win|tips?)|guaranteed\s*(win|odds|profit)|vip\s*tips?|send\s*(me\s*)?money|mobile\s*money|inbox\s*me|dm\s*me|whatsapp\s*me|telegram\s*me)/i.test(text)) return S('rule.scams');
  var n = norm(text); for (var i = 0; i < BAD.length; i++) if (n.indexOf(BAD[i]) >= 0) return S('rule.language');
  var letters = text.replace(/[^A-Za-z]/g, ''); if (letters.length >= 12 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.7) return S('rule.caps');
  if (/(.)\1{9,}/.test(text)) return S('rule.spam');
  if (text.toLowerCase() === UI.lastText && Date.now() - UI.lastTextAt < 120000) return S('rule.repeat');
  return null;
}

/* ---------- Composer ---------- */
function setPresence(){ if (!CHAT.db) return; backend.presence({room: isOpen() ? CHAT.active : null, typing: isOpen() && !!$('msgInput').value.trim()}); }
function refreshSend(){ var v = $('msgInput').value.trim(); $('composer').classList.toggle('has-text', !!v || Date.now() < UI.slowUntil); $('sendBtn').disabled = !v || Date.now() < UI.slowUntil; }
$('msgInput').setAttribute('maxlength', String(MAXLEN));
$('msgInput').addEventListener('input', function(){
  var t = this, h0 = t.offsetHeight; t.style.height = 'auto'; var h1 = Math.min(140, t.scrollHeight); t.style.height = h0 + 'px'; void t.offsetHeight; t.style.height = h1 + 'px';
  var c = $('counter'), n = t.value.length; c.textContent = n + '/' + MAXLEN; c.classList.toggle('show', n > MAXLEN * 0.75); c.classList.toggle('warn', n > MAXLEN * 0.95);
  refreshSend(); setPresence();
  clearTimeout(CHAT.typingTimer); CHAT.typingTimer = setTimeout(function(){ if (CHAT.db) backend.presence({typing:false}); }, 4000);
});
$('msgInput').addEventListener('keydown', function(e){ if (e.key === 'Enter' && !e.shiftKey && !e.isComposing){ e.preventDefault(); $('composer').requestSubmit(); } });
function startSlow(){
  if (!SLOW_MS) return;
  UI.slowUntil = Date.now() + SLOW_MS; var ring = $('slowRing'), num = $('slowNum'), ic = $('sendIc');
  num.hidden = false; ic.style.visibility = 'hidden';
  (function tick(){ var left = UI.slowUntil - Date.now();
    if (left <= 0){ ring.style.strokeDashoffset = 145; num.hidden = true; ic.style.visibility = ''; refreshSend(); return; }
    ring.style.strokeDashoffset = 145 * (1 - left / SLOW_MS); num.textContent = Math.ceil(left / 1000); refreshSend(); requestAnimationFrame(tick); })();
}
$('composer').addEventListener('submit', async function(e){
  e.preventDefault(); var input = $('msgInput'), text = input.value.trim().slice(0, MAXLEN);
  if (!text || !CHAT.db) return; if (needsRules()) return;
  var problem = checkMessage(text);
  if (problem){ var c = $('composer'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); toast(problem); return; }
  var dmTo = CHAT.active === 'support' ? CHAT.uid : (String(CHAT.active).indexOf('sup:') === 0 ? CHAT.active.slice(4) : null);
  var clientId = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  var doc = {clientId: clientId, text: text, room: dmTo ? null : CHAT.active, dmTo: dmTo, reply: CHAT.replyTo || null};
  UI.lastText = text.toLowerCase(); UI.lastTextAt = Date.now();
  input.value = ''; input.style.height = ''; $('counter').classList.remove('show'); clearReply(); startSlow();
  backend.presence({typing:false});
  CHAT.pending[clientId] = true;
  backend.addOptimistic({id: clientId, by: CHAT.uid, text: text, ts: Date.now(), room: dmTo ? (dmTo === CHAT.uid ? 'support' : 'sup:' + dmTo) : CHAT.active, reply: doc.reply, mod: CHAT.canEdit || undefined}, dmTo);
  renderConvo('mine');
  try { await backend.send(doc); delete CHAT.pending[clientId]; renderConvo('mine'); }
  catch(err){ delete CHAT.pending[clientId]; backend.dropOptimistic(clientId, dmTo); input.value = text; UI.slowUntil = 0; renderConvo();
    toast(err && err.message ? err.message : S('chat.sendFailed'));
    refreshSend(); }
});
function applyComposer(){
  var gate = $('gate'), gt = $('gateText'), gb = $('gateBtn'), comp = $('composer'), msg = null, showBtn = false, btnLabel = S('chat.readRules'), btnAction = openRules;
  if (!CHAT.db) msg = S('chat.gate.unavailable');
  else if (!CHAT.uid){ msg = S('chat.gate.signIn'); showBtn = true; btnLabel = S('chat.signIn'); btnAction = function(){ backend.openSignIn(); }; }
  else if (!CHAT.canPost) msg = S('chat.gate.readOnly');
  else if (UI.mod.muted[CHAT.uid]) msg = S('chat.gate.muted');
  else if (!UI.accepted){ msg = S('chat.gate.rules'); showBtn = true; }
  comp.hidden = !!msg; gate.hidden = !msg; gb.hidden = !showBtn; gb.textContent = btnLabel; gb.onclick = btnAction;
  if (msg){ gt.textContent = msg; clearReply(); }
}

/* ---------- Rules sheet ---------- */
(function(){ var ul = $('rulesList'); RULES.forEach(function(r, i){ var li = el('li'); li.style.animationDelay = (80 + i * 45) + 'ms'; var ic = el('span', 'ri'); ic.appendChild(svg(r[2])); li.appendChild(ic);
  var d = el('div'); d.appendChild(el('b', null, r[0])); d.appendChild(el('span', null, r[1])); li.appendChild(d); ul.appendChild(li); }); })();
var lastFocus = null;
function openRules(){
  var w = $('rulesSheet'); lastFocus = document.activeElement;
  var needAccept = CHAT.canPost && !UI.accepted;
  $('agreeRow').hidden = !needAccept; $('rulesAccept').hidden = !needAccept; $('agree').checked = false; $('rulesAccept').disabled = true;
  $('rulesClose').textContent = needAccept ? S('rules.notNow') : S('rules.gotIt');
  w.classList.add('open'); w.setAttribute('aria-hidden', 'false');
  setTimeout(function(){ (needAccept ? $('agree') : $('rulesClose')).focus({preventScroll:true}); }, 60);
}
function closeRules(){ var w = $('rulesSheet'); w.classList.remove('open'); w.setAttribute('aria-hidden', 'true'); if (lastFocus && lastFocus.focus) lastFocus.focus({preventScroll:true}); }
$('agree').onchange = function(){ $('rulesAccept').disabled = !this.checked; };
$('rulesClose').onclick = closeRules;
$('rulesSheet').addEventListener('click', function(e){ if (e.target === this) closeRules(); });
$('pinned').onclick = openRules; $('rulesLink').onclick = openRules;
$('rulesAccept').onclick = function(){
  UI.accepted = true; store('ps_rules_' + CHAT.uid, Date.now());
  if (CHAT.db && CHAT.uid) backend.acceptRules().catch(function(){});
  closeRules(); applyComposer(); toast(S('chat.welcome'), true); setTimeout(function(){ $('msgInput').focus({preventScroll:true}); }, 300);
};

/* ---------- Liquid open / close: the chat grows out of the button you tapped ---------- */
var MORPH = {src:null, busy:false};
document.addEventListener('click', function(e){ var a = e.target.closest && e.target.closest('a[href^="#chat"]'); if (a && !isOpen()) MORPH.src = a.getBoundingClientRect(); }, true);
function rectOf(r){ return {x:r.left, y:r.top, w:r.width, h:r.height, rad:Math.min(r.height / 2, 28)}; }
function morph(from, to, onShow, onDone){
  var blob = $('liquid'); blob.style.setProperty('--liquid-bg', getComputedStyle($('messenger')).getPropertyValue('--c-side').trim() || '#0D2747'); blob.hidden = false; blob.classList.remove('fade');
  var grow = to.w * to.h > from.w * from.h;
  var x = Spring(from.x, .5, .84, .5), y = Spring(from.y, .5, .84, .5), w = Spring(from.w, grow ? .44 : .36, grow ? .72 : .9, .5), h = Spring(from.h, grow ? .58 : .32, grow ? .8 : .92, .5), rad = Spring(from.rad, .5, 1, .3);
  var shown = false;
  function draw(){ blob.style.transform = 'translate(' + x.v.toFixed(1) + 'px,' + y.v.toFixed(1) + 'px)'; blob.style.width = Math.max(0, w.v).toFixed(1) + 'px'; blob.style.height = Math.max(0, h.v).toFixed(1) + 'px'; blob.style.borderRadius = rad.v.toFixed(1) + 'px';
    var p = Math.min(1, Math.abs(h.v - from.h) / Math.max(1, Math.abs(to.h - from.h)));
    if (!shown && p > (grow ? .78 : .2)){ shown = true; if (onShow) onShow(); } }
  [x, y, w, h, rad].forEach(function(s){ s.on(draw); }); draw();
  x.to(to.x); y.to(to.y); w.to(to.w); rad.to(to.rad); h.to(to.h, function(){ blob.classList.add('fade'); setTimeout(function(){ blob.hidden = true; if (onDone) onDone(); }, 220); });
}
function isOpen(){ return $('messenger').classList.contains('open'); }
function showMessenger(){ var m = $('messenger'); m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); markSeen(); renderRooms(); setPresence(); setTimeout(function(){ placeSegPill(); placeRoomPill(); }, 30); }
function route(){
  var h = location.hash.replace(/^#/, ''), m = $('messenger');
  if (h === 'chat' || h.indexOf('chat-') === 0){
    var id = h.slice(5); if (id === 'dm') id = CHAT.pendingRoom || ''; var wasOpen = isOpen(), valid = id && rooms().some(function(r){ return r.id === id; });
    if (valid && String(id).indexOf('sup:') === 0) ensureThread(id.slice(4));
    if (valid){ CHAT.active = id; m.classList.add('in-convo'); } else { m.classList.remove('in-convo'); CHAT.active = CHAT.active || 'lounge'; }
    if (!wasOpen){
      var sbw = window.innerWidth - document.documentElement.clientWidth; if (sbw > 0) document.documentElement.style.paddingRight = sbw + 'px';
      document.documentElement.classList.add('chat-open'); document.body.classList.add('chat-open'); if (lenis) lenis.stop();
      var src = MORPH.src ? rectOf(MORPH.src) : {x: window.innerWidth / 2 - 80, y: window.innerHeight - 90, w: 160, h: 52, rad: 26}; MORPH.src = null;
      if (REDUCE) showMessenger(); else morph(src, {x:0, y:0, w:window.innerWidth, h:window.innerHeight, rad:0}, showMessenger);
    }
    clearReply(); closeCtx(true); renderRooms(); renderHeader(); renderConvo(); setPresence(); placeRoomPill();
    if (window.innerWidth > 820 && valid) setTimeout(function(){ if (!$('composer').hidden) $('msgInput').focus({preventScroll:true}); }, wasOpen ? 50 : 650);
  } else if (isOpen()){
    closeCtx(true); var target = document.querySelector('.nav a[href^="#chat"]') || document.querySelector('a[href^="#chat"]');
    var r = target && target.getBoundingClientRect(), to = r && r.width ? rectOf(r) : {x: window.innerWidth / 2 - 80, y: window.innerHeight - 90, w: 160, h: 52, rad: 26};
    m.classList.remove('open', 'in-convo'); m.setAttribute('aria-hidden', 'true');
    var done = function(){ document.documentElement.classList.remove('chat-open'); document.body.classList.remove('chat-open'); document.documentElement.style.paddingRight = ''; if (lenis) lenis.start(); };
    if (REDUCE) done(); else morph({x:0, y:0, w:window.innerWidth, h:window.innerHeight, rad:0}, to, null, done);
    setPresence(); renderRooms();
  }
}
window.addEventListener('hashchange', route);
window.addEventListener('resize', function(){ placeSegPill(); placeRoomPill(); });
$('backBtn').onclick = function(){ location.hash = 'chat'; };
document.addEventListener('keydown', function(e){
  if (e.key !== 'Escape') return;
  if (CTX.row){ closeCtx(); return; }
  if ($('rulesSheet').classList.contains('open')){ closeRules(); return; }
  if (isOpen()){ if ($('replyWrap').classList.contains('show')) clearReply(); else location.hash = 'matchday'; }
});

/* ---------- Chat themes (per viewer; only the chat changes) ---------- */
var THEMES = ['oddsclub','whatsapp','whatsapp-dark','telegram','imessage','messenger','discord','signal'].map(function(id){ return [id, S('theme.' + id + '.name'), S('theme.' + id + '.desc')]; });
CHAT.theme = (function(){ var t = store('ps_chat_theme'); return THEMES.some(function(x){ return x[0] === t; }) ? t : 'oddsclub'; })();
function setThemeAttr(id){ ['messenger','ctx','rulesSheet','themeSheet'].forEach(function(k){ var e = $(k); if (e) e.setAttribute('data-ct', id); }); }
function applyTheme(id, animate){
  if (id === CHAT.theme && !animate) { setThemeAttr(id); return; }
  var run = function(){ CHAT.theme = id; setThemeAttr(id); store('ps_chat_theme', id);
    document.querySelectorAll('.tcard').forEach(function(c){ c.setAttribute('aria-pressed', c.dataset.id === id ? 'true' : 'false'); });
    UI.rows.forEach(function(r){ r._sig = null; }); if (isOpen()) renderConvo(); };
  if (animate && !REDUCE && document.startViewTransition){ try { document.startViewTransition(run); return; } catch(e){} }
  run();
}
(function(){
  var list = $('themeList');
  THEMES.forEach(function(t, i){
    var b = el('button', 'tcard'); b.type = 'button'; b.dataset.id = t[0]; b.setAttribute('data-ct', t[0]); b.setAttribute('aria-pressed', t[0] === CHAT.theme ? 'true' : 'false');
    b.style.animationDelay = (i * 35) + 'ms';
    var pv = el('div', 'tprev'); pv.setAttribute('aria-hidden', 'true');
    pv.innerHTML = '<div class="th"><i></i><s></s></div><div class="tb"><span class="bi"></span><span class="bo"></span><span class="bi" style="width:44%"></span></div><div class="tf"></div>';
    b.appendChild(pv);
    var nm = el('div', 'tname'); var lbl = el('span'); lbl.appendChild(el('b', null, t[1])); lbl.appendChild(document.createElement('br')); var d = el('small', null, t[2]); d.style.opacity = '.65'; d.style.fontWeight = '500'; lbl.appendChild(d); nm.appendChild(lbl);
    var ck = el('span', 'tcheck'); ck.appendChild(svg('<path d="M5 12l5 5 9-10"/>')); nm.appendChild(ck); b.appendChild(nm);
    b.onclick = function(){ applyTheme(t[0], true); };
    list.appendChild(b);
  });
})();
var themeFocus = null;
function openThemes(){ themeFocus = document.activeElement; var w = $('themeSheet'); w.classList.add('open'); w.setAttribute('aria-hidden', 'false'); setTimeout(function(){ var c = w.querySelector('.tcard[aria-pressed="true"]'); if (c) c.focus({preventScroll:true}); }, 60); }
function closeThemes(){ var w = $('themeSheet'); w.classList.remove('open'); w.setAttribute('aria-hidden', 'true'); if (themeFocus && themeFocus.focus) themeFocus.focus({preventScroll:true}); }
document.querySelectorAll('[data-open-themes]').forEach(function(b){ b.onclick = openThemes; });
$('themeDone').onclick = closeThemes;
$('themeSheet').addEventListener('click', function(e){ if (e.target === this) closeThemes(); });
document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && $('themeSheet').classList.contains('open')){ e.stopImmediatePropagation(); closeThemes(); } }, true);
applyTheme(CHAT.theme, false);

function ensureThread(uid){ backend.watchThread(uid); }
function touchSeen(){ if (CHAT.db && CHAT.uid) backend.touchSeen(); }
document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'hidden') touchSeen(); });
window.addEventListener('pagehide', touchSeen);

/* ================= Data + chat backend ================= */
LIVE.matches = (cfg.matches || []).map(function(m){ var o = Object.assign({}, m); o.kickoff = kickoffLabel(m.startsAt); return o; });
renderSportTabs(); renderMatches(); updateTicker(); LIVE.dirty = true;
function refreshChat(mode){ renderRooms(); if (isOpen()){ renderHeader(); renderConvo(mode); } }
function updateLounge(){
  var n = online(null), msgs = LIVE.messages.length;
  var info = CHAT.db ? S('lounge.online', {n: n}) : S('lounge.info');
  $('loungeInfo').textContent = msgs ? S('lounge.withMessages', {info: info, n: msgs}) : info;
  $('sideOnline').textContent = CHAT.db ? S('chat.onlineCount', {n: n}) : S('chat.liveLabel');
}
var backend = createChatBackend(cfg, {
  S: S,
  ready: function(info){
    CHAT.db = true; CHAT.user = backend; CHAT.uid = info.uid || null; CHAT.canPost = !!info.canPost; CHAT.canEdit = !!info.canEdit; LIVE.me = info.me || null;
    if (info.profiles) Object.assign(LIVE.profiles, info.profiles);
    UI.accepted = !!(info.rulesAccepted || (CHAT.uid && store('ps_rules_' + CHAT.uid)));
    applyComposer(); updateLounge(); refreshChat();
  },
  unavailable: function(){ CHAT.db = null; UI.loaded = true; applyComposer(); updateLounge(); refreshChat(); },
  profiles: function(p){ Object.assign(LIVE.profiles, p); refreshChat(); },
  messages: function(list, mode){ var firstLoad = !UI.loaded; UI.loaded = true; LIVE.messages = list; if (isOpen()) renderConvo(firstLoad ? undefined : mode); renderRooms(); renderMatches(); updateLounge(); LIVE.dirty = true; },
  myDm: function(list, mode){ DM.mine = list; refreshChat(CHAT.active === 'support' ? mode : undefined); },
  dm: function(uid, list, mode){ DM.msgs[uid] = list; refreshChat(CHAT.active === 'sup:' + uid ? mode : undefined); },
  threads: function(t){ DM.threads = t || {}; refreshChat(); if (String(CHAT.active).indexOf('sup:') === 0) ensureThread(CHAT.active.slice(4)); },
  agent: function(a){ DM.agent.uid = (a && a.uid) || null; DM.agent.lastSeen = Number(a && a.lastSeen) || 0; if (a && a.profile && a.uid) LIVE.profiles[a.uid] = a.profile; refreshChat(); },
  mod: function(muted){ UI.mod.muted = muted || {}; applyComposer(); if (isOpen()) renderConvo(); },
  myReports: function(ids){ (ids || []).forEach(function(id){ UI.reported[id] = true; }); },
  reports: function(counts){ UI.reports = counts || {}; if (isOpen()) renderConvo(); },
  matches: function(list){ LIVE.matches = list.map(function(m){ var o = Object.assign({}, m); o.kickoff = kickoffLabel(m.startsAt); return o; });
    renderSportTabs(); renderMatches(); updateTicker(); renderRooms(); if (isOpen()) renderHeader(); LIVE.dirty = true;
    if (/^#chat-/.test(location.hash) && location.hash !== '#chat-dm' && UI.renderedRoom !== location.hash.slice(6)) route(); },
  peers: function(peers){ CHAT.peers = peers || []; updateLounge(); clearTimeout(window.__ocPeerT); window.__ocPeerT = setTimeout(function(){ renderRooms(); if (isOpen()){ renderHeader(); renderConvo(); } }, 120); },
  toast: function(msg, ok){ toast(msg, ok); }
});
applyComposer(); updateLounge();
backend.connect();
route();

/* ================= 3D phone ================= */
(function(){
  var canvas = $('phone3d'), renderer;
  // three r150+ changed colour management and light units; these two settings keep the prototype's (r128) look
  THREE.ColorManagement.enabled = false;
  var LIGHT_K = Math.PI;
  try { renderer = new THREE.WebGLRenderer({canvas:canvas, antialias:true, alpha:true}); }
  catch(e){ document.documentElement.classList.add('no-gl'); canvas.style.display = 'none'; return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.setClearColor(0x000000, 0);
  var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100); camera.position.set(0, 0, 12);

  var pmrem = new THREE.PMREMGenerator(renderer), env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(20,20,20), new THREE.MeshBasicMaterial({color:0x12233d, side:THREE.BackSide})));
  function panel(w,h,c,x,y,z,ry,rx){ var m = new THREE.Mesh(new THREE.PlaneGeometry(w,h), new THREE.MeshBasicMaterial({color:c, side:THREE.DoubleSide})); m.position.set(x,y,z); m.rotation.set(rx||0, ry||0, 0); env.add(m); }
  panel(10,3,0xffffff,0,8,2,0,Math.PI/2); panel(3,8,0x7CC242,-8,0,2,Math.PI/2); panel(3,8,0x4C9BFF,8,0,2,-Math.PI/2); panel(8,2,0xffffff,0,-2,9,0);
  scene.environment = pmrem.fromScene(env, 0.04).texture;
  scene.add(new THREE.AmbientLight(0xffffff, 0.25 * LIGHT_K));
  var key = new THREE.DirectionalLight(0xffffff, 1.2 * LIGHT_K); key.position.set(-4,5,6); scene.add(key);
  var rimA = new THREE.DirectionalLight(0x4C9BFF, 1.6 * LIGHT_K); rimA.position.set(6,2,-4); scene.add(rimA);
  var rimB = new THREE.DirectionalLight(0x7CC242, 1.0 * LIGHT_K); rimB.position.set(-6,-3,-3); scene.add(rimB);

  function rrShape(w,h,r){ var s = new THREE.Shape(), x = -w/2, y = -h/2; s.moveTo(x+r,y); s.lineTo(x+w-r,y); s.quadraticCurveTo(x+w,y,x+w,y+r); s.lineTo(x+w,y+h-r); s.quadraticCurveTo(x+w,y+h,x+w-r,y+h); s.lineTo(x+r,y+h); s.quadraticCurveTo(x,y+h,x,y+h-r); s.lineTo(x,y+r); s.quadraticCurveTo(x,y,x+r,y); return s; }
  function planarUV(geo,w,h){ var p = geo.attributes.position, uv = new Float32Array(p.count*2); for (var i=0;i<p.count;i++){ uv[i*2]=p.getX(i)/w+0.5; uv[i*2+1]=p.getY(i)/h+0.5; } geo.setAttribute('uv', new THREE.BufferAttribute(uv,2)); return geo; }
  var W = 1.44, Hh = 3.04, R = 0.24, DEPTH = 0.14, BT = 0.05, BS = 0.05, FRONT = DEPTH/2 + BT;
  var phone = new THREE.Group(), spin = new THREE.Group(); spin.add(phone); scene.add(spin);
  var bodyGeo = new THREE.ExtrudeGeometry(rrShape(W,Hh,R), {depth:DEPTH, bevelEnabled:true, bevelThickness:BT, bevelSize:BS, bevelSegments:6, curveSegments:24}); bodyGeo.translate(0,0,-DEPTH/2);
  var frameMat = new THREE.MeshPhysicalMaterial({color:0x8a96a8, metalness:1, roughness:0.28, clearcoat:0.3});
  phone.add(new THREE.Mesh(bodyGeo, frameMat));
  var front = new THREE.Mesh(new THREE.ShapeGeometry(rrShape(W+0.06,Hh+0.06,R+0.02),24), new THREE.MeshPhysicalMaterial({color:0x050707, roughness:0.08, clearcoat:1, clearcoatRoughness:0.05})); front.position.z = FRONT+0.002; phone.add(front);
  var SW = W-0.1, SH = Hh-0.1, sc = document.createElement('canvas'); sc.width = 640; sc.height = Math.round(640*SH/SW);
  var tex = new THREE.CanvasTexture(sc); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  var screen = new THREE.Mesh(planarUV(new THREE.ShapeGeometry(rrShape(SW,SH,R-0.05),24),SW,SH), new THREE.MeshBasicMaterial({map:tex, toneMapped:false})); screen.position.z = FRONT+0.004; phone.add(screen);
  var sheen = new THREE.Mesh(new THREE.ShapeGeometry(rrShape(SW,SH,R-0.05),24), new THREE.MeshPhysicalMaterial({color:0xffffff, transparent:true, opacity:0.05, roughness:0.05, clearcoat:1})); sheen.position.z = FRONT+0.006; phone.add(sheen);
  var back = new THREE.Mesh(new THREE.ShapeGeometry(rrShape(W+0.06,Hh+0.06,R+0.02),24), new THREE.MeshPhysicalMaterial({color:0x123A6E, metalness:0.25, roughness:0.35, clearcoat:0.8, clearcoatRoughness:0.25}));
  back.position.z = -FRONT-0.002; back.rotation.y = Math.PI; phone.add(back);
  var plate = new THREE.Mesh(new THREE.ExtrudeGeometry(rrShape(0.62,0.66,0.16), {depth:0.03, bevelEnabled:true, bevelThickness:0.02, bevelSize:0.02, bevelSegments:4, curveSegments:16}), new THREE.MeshPhysicalMaterial({color:0x1A4C8C, metalness:0.3, roughness:0.2, clearcoat:1}));
  plate.position.set(0.33,1.0,-FRONT-0.005); plate.rotation.y = Math.PI; phone.add(plate);
  var ringMat = new THREE.MeshPhysicalMaterial({color:0xc4cedb, metalness:1, roughness:0.2}), lensMat = new THREE.MeshPhysicalMaterial({color:0x020404, roughness:0.05, clearcoat:1});
  [[0.18,1.15],[0.18,0.85],[0.47,1.0]].forEach(function(p){ var ring = new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.115,0.07,40), ringMat); ring.rotation.x = Math.PI/2; ring.position.set(p[0],p[1],-FRONT-0.07); phone.add(ring);
    var lens = new THREE.Mesh(new THREE.CircleGeometry(0.08,40), lensMat); lens.position.set(p[0],p[1],-FRONT-0.106); lens.rotation.y = Math.PI; phone.add(lens); });
  var flash = new THREE.Mesh(new THREE.CircleGeometry(0.035,24), new THREE.MeshBasicMaterial({color:0xFFF1D6})); flash.position.set(0.47,1.22,-FRONT-0.041); flash.rotation.y = Math.PI; phone.add(flash);
  var logo = new THREE.Mesh(new THREE.RingGeometry(0.1,0.16,48), new THREE.MeshPhysicalMaterial({color:0x7CC242, metalness:0.5, roughness:0.25})); logo.position.set(0,0,-FRONT-0.004); logo.rotation.y = Math.PI; phone.add(logo);
  [[W/2+BS+0.01,0.7,0.42],[-W/2-BS-0.01,0.95,0.22],[-W/2-BS-0.01,0.55,0.36],[-W/2-BS-0.01,0.12,0.36]].forEach(function(b){ var m = new THREE.Mesh(new THREE.BoxGeometry(0.03,b[2],0.07), frameMat); m.position.set(b[0],b[1],0); phone.add(m); });

  var C = {bg:'#081A30', card:'#10305A', line:'#1D4170', light:'#F2F7FF', mute:'#9DB3CF', blue:'#1F6FE0', green:'#7CC242', ink:'#0B1F05', yellow:'#FFC93C', live:'#FF4D4D', wall:'#0A2140', bin:'#14385F', bout:'#1F5FB8'};
  var g = sc.getContext('2d'), X = sc.width, Y = sc.height;
  function rr(x,y,w,h,r){ g.beginPath(); g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r); g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath(); }
  function txt(s,x,y,size,w,c,al){ g.font = (w||600)+' '+size+'px Manrope, "Segoe UI", sans-serif'; g.fillStyle = c; g.textAlign = al||'left'; g.fillText(s,x,y); }
  function disp(s,x,y,size,c,al){ g.font = size+'px Anton, Impact, sans-serif'; g.fillStyle = c; g.textAlign = al||'left'; g.fillText(String(s).toUpperCase(),x,y); }
  function fit(s,max,size,w){ g.font = (w||700)+' '+size+'px Manrope, sans-serif'; s = String(s||''); while (s.length > 3 && g.measureText(s).width > max) s = s.slice(0,-2); return s; }
  function badge(n,x,y,r){ g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fillStyle = teamColor(n); g.fill(); txt(initials(n), x, y+r*0.35, r*0.9, 800, '#fff', 'center'); }
  function status(){ txt('9:41',54,62,26,700,C.light); rr(X/2-90,24,180,52,26); g.fillStyle='#000'; g.fill(); for (var i=0;i<4;i++){ g.fillStyle=C.light; g.fillRect(X-150+i*10,56-i*5,6,8+i*5); } rr(X-96,42,46,22,6); g.strokeStyle=C.light; g.lineWidth=2.5; g.stroke(); g.fillStyle=C.light; g.fillRect(X-92,46,32,14); }
  function header(t,s){ g.fillStyle = C.bg; g.fillRect(0,0,X,Y); status(); disp(t,48,174,64,C.light); if (s) txt(s,48,222,26,700,C.mute); }
  // the selected partner's name as a big wordmark at the top of the app
  var BA = {t:1}, phoneName = null;                       // the name on the phone only changes while its back faces you
  function eo(x){ x = Math.max(0, Math.min(1, x)); return 1 - Math.pow(1 - x, 3); }
  function brandHead(sub){
    g.fillStyle = C.bg; g.fillRect(0,0,X,Y); status();
    var nm = String(phoneName || SITE.bookmaker || '').toUpperCase(), sz = 176; g.font = sz + 'px Anton, Impact, sans-serif';
    while (sz > 60 && g.measureText(nm).width > X - 92){ sz -= 4; g.font = sz + 'px Anton, Impact, sans-serif'; }
    var base = 104 + Math.round(sz * 0.9), t = BA.t;
    if (t >= 1) disp(nm, 46, base, sz, C.light);
    else {
      // letters rise out of a mask one after another
      g.save(); g.beginPath(); g.rect(30, base - sz * 1.02, X - 60, sz * 1.1); g.clip();
      g.font = sz + 'px Anton, Impact, sans-serif'; g.textAlign = 'left'; g.fillStyle = C.light;
      var x = 46, n = nm.length;
      for (var i = 0; i < n; i++){ var ch = nm[i], w = g.measureText(nm.slice(0, i + 1)).width - g.measureText(nm.slice(0, i)).width;
        var p = eo((t - i * (0.45 / Math.max(1, n))) / 0.55); g.globalAlpha = Math.min(1, p * 1.4); g.fillText(ch, x, base + (1 - p) * sz * 1.05); x += w; }
      g.restore(); g.globalAlpha = 1;
    }
    var bw = 96 * eo((t - 0.35) / 0.65); if (bw > 1){ rr(48, base + 22, bw, 11, 5.5); g.fillStyle = C.green; g.fill(); }
    if (sub){ g.globalAlpha = eo((t - 0.45) / 0.55); txt(sub, 162 - (1 - g.globalAlpha) * 24, base + 36, 26, 700, C.mute); g.globalAlpha = 1; }
    return base + 74;
  }
  function revealBrand(delay){ if (REDUCE){ BA.t = 1; return; } G.killTweensOf(BA); BA.t = 0;
    G.to(BA, {t:1, duration:1.05, delay:delay || 0, ease:'none', onUpdate:function(){ if (shown === 0 || shown === 2) showScreen(shown, true); }, onComplete:function(){ showScreen(shown, true); }}); }
  var TABS = [S('phone.tab.live'), S('phone.tab.odds'), S('phone.tab.chat'), S('phone.tab.promo')];
  function tabbar(a){ var y = Y-150; rr(36,y,X-72,104,26); g.fillStyle = C.card; g.fill(); TABS.forEach(function(l,i){ var x = 36+(X-72)*(i+0.5)/4; if (i===a){ rr(x-62,y+18,124,68,18); g.fillStyle=C.green; g.fill(); txt(l,x,y+62,24,800,C.ink,'center'); } else txt(l,x,y+62,24,700,C.mute,'center'); }); rr(X/2-80,Y-26,160,8,4); g.fillStyle=C.light; g.fill(); }
  function matches(){ return LIVE.matches.length ? LIVE.matches : [{home:S('phone.home'), away:S('phone.away'), status:'upcoming', kickoff:S('phone.soon'), league:S('phone.matchday')}]; }
  var screens = [
    function live(){ var cy = brandHead(S('phone.liveSub')); var ms = matches(), m = ms.filter(function(x){ return x.status === 'live'; })[0] || ms[0];
      cy = Math.min(cy, 380); rr(36,cy,X-72,350,30); var gr = g.createLinearGradient(0,cy,0,cy+350); gr.addColorStop(0,C.blue); gr.addColorStop(1,C.card); g.fillStyle = gr; g.fill();
      g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2; g.beginPath(); g.arc(X/2,cy+175,100,0,Math.PI*2); g.stroke(); g.beginPath(); g.moveTo(X/2,cy); g.lineTo(X/2,cy+350); g.stroke();
      var isLive = m.status === 'live'; rr(X/2-95,cy+22,190,50,14); g.fillStyle = isLive ? C.live : 'rgba(0,0,0,.3)'; g.fill();
      txt(isLive ? S('phone.liveBadge') + ' ' + (m.minute ? m.minute + "'" : '') : (m.status === 'ft' ? S('phone.fullTime') : String(m.kickoff||S('phone.soonUpper'))), X/2, cy+56, 26, 800, '#fff', 'center');
      badge(m.home,138,cy+165,58); badge(m.away,X-138,cy+165,58);
      disp((m.status==='upcoming'||!m.status) ? S('match.vs') : (Number(m.hs)||0)+' - '+(Number(m.as)||0), X/2, cy+205, 108, C.light, 'center');
      txt(fit(m.home,210,30,800),138,cy+266,30,800,C.light,'center'); txt(fit(m.away,210,30,800),X-138,cy+266,30,800,C.light,'center');
      txt(fit(SPORTS[sportOf(m)].label + ' · ' + (m.league||''),500,24,700),X/2,cy+318,24,700,'rgba(255,255,255,.8)','center');
      var y = cy + 400; txt(S('phone.alsoToday'),44,y,30,800,C.light); y += 24;
      ms.filter(function(x){ return x !== m; }).slice(0,3).forEach(function(o){
        rr(36,y,X-72,118,22); g.fillStyle = C.card; g.fill();
        badge(o.home,80,y+38,20); txt(fit(o.home,300,27,700),112,y+47,27,700,C.light);
        badge(o.away,80,y+84,20); txt(fit(o.away,300,27,700),112,y+93,27,700,C.light);
        var s2 = (o.status==='live'||o.status==='ft') ? (Number(o.hs)||0)+' - '+(Number(o.as)||0) : String(o.kickoff||'');
        txt(s2,X-60,y+58,32,800,o.status==='live' ? C.green : C.light,'right'); txt(SPORTS[sportOf(o)].label.toUpperCase(),X-60,y+92,18,800,C.mute,'right');
        y += 132; });
      tabbar(0); },
    function bonus(){ header(S('phone.bonusTitle'), SITE.bookmaker);
      rr(36,250,X-72,520,34); var gr = g.createLinearGradient(0,250,X,770); gr.addColorStop(0,'#1F6FE0'); gr.addColorStop(1,'#123E85'); g.fillStyle = gr; g.fill();
      g.beginPath(); g.arc(36,560,22,0,Math.PI*2); g.arc(X-36,560,22,0,Math.PI*2); g.fillStyle = C.bg; g.fill();
      txt(S('phone.promoCode'), 76, 320, 22, 800, '#D7E6FF');
      var code = String(SITE.promo); var size = 92; g.font = size + 'px Anton, Impact, sans-serif'; while (size > 40 && g.measureText(code.toUpperCase()).width > X - 160){ size -= 4; g.font = size + 'px Anton, Impact, sans-serif'; }
      disp(code, 76, 320 + size + 10, size, C.light);
      rr(76, 470, 220, 66, 14); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3; g.stroke(); txt(S('phone.copyCode'), 186, 512, 22, 800, C.light, 'center');
      g.setLineDash([10,10]); g.beginPath(); g.moveTo(76,600); g.lineTo(X-76,600); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3; g.stroke(); g.setLineDash([]);
      txt(S('phone.welcomeBonus'), 76, 650, 22, 700, '#D7E6FF'); txt(fit(SITE.bonus, X-160, 32, 800), 76, 696, 32, 800, C.light);
      rr(36, 800, X-72, 96, 18); g.fillStyle = C.green; g.fill(); txt(S('phone.signUp'), X/2, 858, 28, 800, C.ink, 'center');
      txt(S('phone.terms'), X/2, 940, 20, 600, C.mute, 'center');
      tabbar(3); },
    function odds(){ var y = Math.min(brandHead(S('phone.oddsSub')), 380);
      matches().slice(0,4).forEach(function(m){ rr(36,y,X-72,196,24); g.fillStyle = C.card; g.fill(); txt(fit(S('chat.matchTitle', {home: m.home, away: m.away}),X-160,24,800),66,y+50,24,800,C.light);
        txt(m.status==='live' ? S('match.live') : (m.kickoff||''), X-66, y+50, 20, 800, m.status==='live' ? C.live : C.mute, 'right');
        var two = !(Number(m.ox) > 0), cols = two ? [['1','o1'],['2','o2']] : [['1','o1'],['X','ox'],['2','o2']], bw = (X-72-60-12*(cols.length-1))/cols.length; cols.forEach(function(o,i){ var bx = 66+i*(bw+12); rr(bx,y+80,bw,88,14); g.fillStyle = C.oddBg || C.bg; g.fill(); txt(o[0],bx+22,y+134,22,700,C.yellow); txt(fmtOdd(m[o[1]]),bx+bw-22,y+136,30,800,C.yellow,'right'); });
        y += 214; }); tabbar(1); },
    function chatS(){ g.fillStyle = C.wall; g.fillRect(0,0,X,Y); status();
      rr(0,88,X,110,0); g.fillStyle = C.card; g.fill(); g.beginPath(); g.arc(84,143,34,0,Math.PI*2); g.fillStyle = C.green; g.fill();
      txt(S('chat.lounge'),134,138,26,800,C.light); txt(online(null) ? S('chat.onlineCount', {n: online(null)}) : S('phone.fanChat'),134,172,20,600,C.mute);
      var list = LIVE.messages.filter(function(m){ return m.room === 'lounge'; }).slice(-6), y = 236, bottom = Y - 180;
      if (!list.length){ rr(X/2-200,y+40,400,80,20); g.fillStyle = 'rgba(16,48,90,.9)'; g.fill(); txt(S('chat.noMessages'), X/2, y+90, 24, 700, C.mute, 'center'); }
      var blocks = [];
      list.forEach(function(m){ var mine = m.by && m.by === CHAT.uid, words = String(m.text).split(/\s+/), lines = [], cur = ''; g.font = '600 24px Manrope, sans-serif';
        words.forEach(function(w){ var t = cur ? cur+' '+w : w; if (g.measureText(t).width > 380){ if (cur) lines.push(cur); cur = w; } else cur = t; }); if (cur) lines.push(cur); lines = lines.slice(0,3);
        blocks.push({m:m, mine:mine, lines:lines, h: (mine ? 30 : 60) + lines.length*32 + 24}); });
      var total = blocks.reduce(function(a,b){ return a + b.h + 14; }, 0); while (total > bottom - y && blocks.length > 1){ total -= blocks[0].h + 14; blocks.shift(); }
      blocks.forEach(function(b){ var w = 440, x = b.mine ? X-30-w : 30; rr(x,y,w,b.h,22); g.fillStyle = b.mine ? C.bout : C.bin; g.fill();
        var ty = y + 40; if (!b.mine){ txt(fit(nameOf(b.m.by),300,18,800), x+22, y+34, 18, 800, C.green); ty = y + 68; }
        b.lines.forEach(function(l,i){ txt(l, x+22, ty+i*32, 24, 600, C.light); }); txt(hhmm(b.m.ts), x+w-20, y+b.h-14, 16, 600, 'rgba(242,247,255,.6)', 'right'); y += b.h + 14; });
      rr(24,Y-150,X-120,84,42); g.fillStyle = C.card; g.fill(); txt(S('chat.placeholder'),62,Y-98,24,600,C.mute); g.beginPath(); g.arc(X-58,Y-108,38,0,Math.PI*2); g.fillStyle = C.green; g.fill();
      g.beginPath(); g.moveTo(X-74,Y-108); g.lineTo(X-40,Y-124); g.lineTo(X-52,Y-90); g.closePath(); g.fillStyle = C.ink; g.fill();
      rr(X/2-80,Y-26,160,8,4); g.fillStyle=C.light; g.fill(); },
    function safe(){ header(S('phone.safeTitle'), S('phone.safeSub')); g.beginPath(); g.arc(X/2,420,120,0,Math.PI*2); g.strokeStyle = C.green; g.lineWidth = 10; g.stroke(); disp('18+',X/2,460,110,C.green,'center');
      [[S('phone.safe1.title'),S('phone.safe1.body')],[S('phone.safe2.title'),S('phone.safe2.body')],[S('phone.safe3.title'),S('phone.safe3.body')]].forEach(function(t,i){ var y = 600 + i*136; rr(36,y,X-72,120,22); g.fillStyle = C.card; g.fill(); txt(t[0],72,y+54,26,800,C.light); txt(t[1],72,y+92,20,600,C.mute);
        g.beginPath(); g.arc(X-90,y+60,22,0,Math.PI*2); g.strokeStyle = C.green; g.lineWidth = 5; g.stroke(); }); tabbar(-1); }
  ];
  var shown = -1; function showScreen(i, force){ if (i === shown && !force) return; shown = i; screens[i](); tex.needsUpdate = true; }
  showScreen(0, true); if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ showScreen(shown, true); });

  var size = {w:1,h:1}, mobile = false;
  // phones and portrait tablets use the stacked layout (same query as the CSS)
  var MQ = window.matchMedia ? window.matchMedia('(max-width:760px), (max-width:1100px) and (orientation:portrait)') : null;
  function resize(){ var de = document.documentElement; size.w = de.clientWidth || window.innerWidth; size.h = window.innerHeight || de.clientHeight; mobile = MQ ? MQ.matches : size.w < 761; renderer.setSize(size.w,size.h,false); camera.aspect = size.w/size.h; camera.updateProjectionMatrix(); }
  resize(); window.addEventListener('resize', resize);
  var mouse = {x:0,y:0}; window.addEventListener('pointermove', function(e){ mouse.x = e.clientX/size.w*2-1; mouse.y = -(e.clientY/size.h*2-1); }, {passive:true});
  function slotPose(){ var dz = document.getElementById('dragZone'), upp = 2 * camera.position.z * Math.tan(camera.fov * Math.PI / 360) / size.h;
    if (!dz || !dz.offsetHeight) return {x:0,y:0.85,rx:0.08,ry:-0.3,rz:0.06,s:0.86};
    var r = dz.getBoundingClientRect(), top = r.top + (window.scrollY || 0), hgt = Math.max(200, dz.offsetHeight - 50), cy = top + hgt / 2;
    var s = Math.min(hgt * upp / (Hh + 0.12), size.w * 0.6 * upp / W);
    return {x:0, y:(size.h / 2 - cy) * upp, rx:0.08, ry:-0.3, rz:0.06, s:s}; }
  function poseA(){ return mobile ? slotPose() : {x:0,y:-0.15,rx:0.14,ry:-0.45,rz:0.1,s:1.2}; }
  function poseB(){ return mobile ? {x:0,y:0.4,rx:0.05,ry:0,rz:0,s:0.78} : {x:0,y:-0.35,rx:0.06,ry:0,rz:0,s:1.0}; }
  var P = Object.assign({}, poseA());                       // scroll pose (GSAP, scrubbed)
  var O = {iy:0, iry:0, is:1, lean:0, leanX:0, flip:0, mx:0, my:0, ey:0, erx:0, es:1, drag:0, sa:0};   // sa = scroll-driven feature spin   // intro, lean, flip, pointer, exit
  var tls = [];
  function buildScroll(){
    tls.forEach(function(t){ if (t.scrollTrigger) t.scrollTrigger.kill(); t.kill(); }); tls = [];
    var A = poseA(), B = poseB(); G.set(P, A);
    var midRx = (A.rx + B.rx) / 2 + 0.5, midY = (A.y + B.y) / 2 - 0.4, midRz = (A.rz + B.rz) / 2 - 0.25;
    // one phone, one continuous move: it stays on screen and spins from the hero into the features section
    // (text scrolls over it, like on desktop). Phones use the stacked hero slot as the start pose.
    var t1 = G.timeline({scrollTrigger:{trigger:hero, start:'top top', end:'bottom top', scrub:1}, defaults:{ease:'sine.inOut'}});
    t1.to(P, {x:B.x, s:B.s, ry:B.ry + Math.PI * 2, duration:1, ease:'power2.inOut'}, 0)
      .to(P, {rx:midRx, y:midY, rz:midRz, duration:.5}, 0).to(P, {rx:B.rx, y:B.y, rz:B.rz, duration:.5}, .5);
    var t2 = G.timeline({scrollTrigger:{trigger:feat, start:'bottom bottom', end:function(){ return '+=' + window.innerHeight * 0.8; }, scrub:1}});
    t2.fromTo(O, {ey:0, erx:0, es:1}, {ey:7, erx:-0.7, es:0.75, ease:'power2.in'});
    tls.push(t1, t2);
  }
  var lastH = 0;
  var lastW = -1; function relayout(force){ var de = document.documentElement, w = de.clientWidth || window.innerWidth, h = window.innerHeight; if (force !== true && w === lastW && Math.abs(h - size.h) < 2) return; lastW = w; var was = mobile; resize(); if (was !== mobile || mobile){ lastH = size.h; buildScroll(); } ScrollTrigger.refresh(); }
  var roT; if (window.ResizeObserver) new ResizeObserver(function(){ clearTimeout(roT); roT = setTimeout(relayout, 60); }).observe(document.documentElement);
  if (MQ && MQ.addEventListener) MQ.addEventListener('change', function(){ relayout(true); });
  buildScroll(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ if (mobile){ buildScroll(); ScrollTrigger.refresh(); } }); lastH = size.h; window.addEventListener('resize', function(){ var was = mobile; resize(); if (was !== mobile || (mobile && Math.abs(size.h - lastH) > 120)){ lastH = size.h; buildScroll(); } ScrollTrigger.refresh(); });
  // intro: the phone drops in spinning
  if (!REDUCE) G.from(O, {iy:6, iry:-Math.PI * 2, is:0.75, duration:2, ease:'expo.out', delay:.1});
  // pointer tilt, smoothed by GSAP
  var qx = G.quickTo(O, 'mx', {duration:.9, ease:'power3'}), qy = G.quickTo(O, 'my', {duration:.9, ease:'power3'});
  window.addEventListener('pointermove', function(){ if (!REDUCE){ qx(mouse.x); qy(mouse.y); } }, {passive:true});
  // features: lean toward the active callout and flip to its screen
  var lastF = -1;
  // Features: the rotation is driven by the scroll itself. Each feature keeps the phone facing you for the first
  // part of its scroll range, then the phone turns a full 360° as you keep scrolling; the screen swaps while its back
  // faces you, so the next screen arrives exactly as the next callout appears. Scroll back and it turns back.
  var FACE = 0.42;   // share of each feature's scroll range where the phone just faces you
  function spinPart(f, local){ if (REDUCE || f < 0 || f >= 3) return 0; var x = Math.max(0, Math.min(1, (local - FACE) / (1 - FACE))); return x * x * (3 - 2 * x); }
  var FEAT_SCREENS = [1, 2, 3, 4];
  window.onFeatureChange = function(f){
    G.to(O, {lean: (f >= 0 && !mobile) ? (f % 2 === 0 ? -0.38 : 0.38) : 0, leanX: f >= 0 ? 0.04 : 0, duration:.9, ease:'power3.out'});
    if (REDUCE && f >= 0) showScreen(FEAT_SCREENS[f], true);
  };
  var t0 = performance.now(), lastDraw = 0, flipping = false, settling = false;
  window.__phoneFlipping = function(v){ flipping = v; };
  function frame(){
    if (document.body.classList.contains('chat-open')) return;
    var now = performance.now(), t = (now - t0) / 1000;
    if (S2.feature < 0){
      if (S2.pA < 0.5 && shown !== 0 && Math.abs(Math.sin(O.flip / 2)) < 0.01) showScreen(0);
      else if (S2.pA >= 0.5 && S2.pC <= 0 && shown === 0) showScreen(1);
    }
    if (LIVE.dirty && now - lastDraw > 500){ LIVE.dirty = false; lastDraw = now; showScreen(shown, true); }
    if (!flipping && !settling && !document.querySelector('.drag-zone.grabbing')){
      var turnW = Math.PI * 2, restW = Math.round(O.flip / turnW) * turnW;
      if (Math.abs(O.flip - restW) > 0.003 && !G.isTweening(O)){ settling = true; G.to(O, {flip:restW, duration:.8, ease:'power3.out', onComplete:function(){ settling = false; }, onInterrupt:function(){ settling = false; }}); }
    }
    // scroll-driven feature spin (smoothed a little on top of Lenis)
    var TURN = Math.PI * 2, f = S2.feature;
    var saTarget = f >= 0 ? (f + spinPart(f, S2.local)) * TURN : (S2.pC > 0 || S2.pB > 0.5 ? 3 * TURN : 0);
    O.sa += (saTarget - O.sa) * 0.2; if (Math.abs(saTarget - O.sa) < 1e-4) O.sa = saTarget;
    if (f >= 0 && !REDUCE){ var si = FEAT_SCREENS[Math.max(0, Math.min(3, Math.round(O.sa / TURN)))]; if (si !== shown) showScreen(si, true); }
    var idle = REDUCE ? 0 : 1, exitK = 1 - Math.min(1, O.ey / 7);
    spin.position.set(P.x, P.y + O.iy + O.ey + Math.sin(t * 1.3) * 0.06 * idle, 0);
    var spinK = Math.sin(O.sa % TURN / 2);   // 0 when facing, 1 at the half turn
    spin.rotation.set(P.rx + O.leanX + O.erx - O.my * 0.12 * exitK - spinK * 0.12, P.ry + O.iry + O.lean + O.flip + O.drag + O.sa + O.mx * 0.22 * exitK, P.rz + Math.sin(t * 0.9) * 0.02 * idle);
    spin.scale.setScalar(P.s * O.is * O.es * (1 + Math.abs(spinK) * 0.06));
    var gone = S2.pC >= 1; canvas.style.visibility = gone ? 'hidden' : 'visible';
    if (!gone) renderer.render(scene, camera);
  }
  function setPalette(c){ C.bg = c.night; C.card = c.panel; C.line = c.navy2; C.blue = c.blue; C.green = c.cta; C.ink = c.ink; C.yellow = c.odds; C.oddBg = c.oddBg; C.wall = c.navy; C.bin = c.navy2; C.bout = c.blue; }
  var brandMats = [[back.material, 'navy2'], [plate.material, 'blue'], [logo.material, 'cta'], [rimA, 'sky'], [rimB, 'cta']];
  window.phoneBrand = function(b, instant){
    var to = brandMats.map(function(m){ return new THREE.Color(b.c[m[1]]); });
    if (instant || REDUCE){ phoneName = b.name; brandMats.forEach(function(m, i){ m[0].color.copy(to[i]); }); setPalette(b.c); showScreen(shown, true); return; }
    var from = brandMats.map(function(m){ return m[0].color.clone(); }), k = {t:0}, dir = window.__flipDir || 1, fromDrag = window.__flipFrom != null;
    var start = fromDrag ? window.__flipFrom : O.flip, swapped = false; window.__flipDir = 1; window.__flipFrom = null;
    var target = (Math.round(start / (Math.PI * 2)) + dir) * Math.PI * 2; while (dir * (target - O.flip) < 0.4) target += dir * Math.PI * 2;
    var remaining = Math.abs(target - O.flip), dur = fromDrag ? Math.max(.45, Math.min(1.1, remaining / (Math.PI * 2) * 1.1)) : 1.15;
    G.to(k, {t:1, duration:dur, ease:fromDrag ? 'power2.out' : 'power2.inOut', onUpdate:function(){ brandMats.forEach(function(m, i){ m[0].color.copy(from[i]).lerp(to[i], k.t); }); }});
    function swapNow(){ swapped = true; phoneName = b.name; setPalette(b.c); BA.t = 0; showScreen(shown, true); revealBrand(dur * 0.22); }
    if (fromDrag && Math.cos(O.flip) < 0) swapNow();
    if (window.__phoneFlipping) window.__phoneFlipping(true);
    G.to(O, {flip: target, duration:dur, ease: fromDrag ? 'power2.out' : 'power3.inOut', overwrite:'auto', onComplete:function(){ if (window.__phoneFlipping) window.__phoneFlipping(false); if (!swapped) swapNow(); }, onInterrupt:function(){ if (window.__phoneFlipping) window.__phoneFlipping(false); if (!swapped) swapNow(); }, onUpdate:function(){ if (!swapped && Math.cos(O.flip) < 0) swapNow(); }});
  };
  if (CUR_BRAND) window.phoneBrand(CUR_BRAND, true);
  window.__phoneO = O;
  G.ticker.add(frame);
})();
  // drag the phone: it follows your finger; let go past the threshold and it spins into the next partner
  (function(){
    var O = window.__phoneO || {drag:0};
    var zone = $('dragZone'), hint = $('dragHint'); if (!zone || !BRANDS.length) return;
    var K = 0.011, TH = 70;
    function step(dir){ var i = BRANDS.indexOf(CUR_BRAND), n = BRANDS.length; return BRANDS[(i + dir + n) % n].id; }
    function press(){ zone.classList.add('grabbing'); G.killTweensOf(O, 'drag,flip'); if (hint) hint.classList.add('gone'); }
    function move(dx){ O.drag = (dx * K) / (1 + Math.abs(dx) / 600); }
    function release(dx){
      zone.classList.remove('grabbing');
      if (Math.abs(dx) > TH){ var dir = O.drag < 0 ? -1 : 1; G.killTweensOf(O, 'flip'); var base = O.flip; O.flip = base + O.drag; O.drag = 0;
        window.__flipDir = dir; window.__flipFrom = base; setBrand(step(dx < 0 ? 1 : -1)); }
      else { var turn = Math.PI * 2, total = O.flip + O.drag, rest = Math.round(total / turn) * turn; O.flip = total; O.drag = 0;
        G.to(O, {flip: rest, duration:1.2, ease:'elastic.out(1, .45)'}); }
    }
    var proxy = document.createElement('div');
    Draggable.create(proxy, {trigger:zone, type:'x', lockAxis:true, allowNativeTouchScrolling:true, zIndexBoost:false,
      onPress:press, onDrag:function(){ move(this.x); }, onRelease:function(){ var dx = this.x; G.set(proxy, {x:0}); this.update(); release(dx); }});
  })();
}
