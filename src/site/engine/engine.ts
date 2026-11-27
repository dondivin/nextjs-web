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
// allowNestedScroll / prevent: the wheel scrolls whatever scrollable box it is over (sheets, chat lists, dropdowns) instead of
// being taken by the page's smooth scroll
var lenis = !REDUCE ? new Lenis({lerp:.1, smoothWheel:true, allowNestedScroll:true, prevent:function(node){ return !!(node.classList && (node.classList.contains('sheet') || node.classList.contains('sheet-wrap'))) || node.id === 'messenger'; }}) : null;
if (lenis){
  lenis.on('scroll', ScrollTrigger.update); G.ticker.add(function(t){ lenis.raf(t * 1000); }); G.ticker.lagSmoothing(0);
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a || document.body.classList.contains('chat-open')) return;
    var h = a.getAttribute('href'); if (!h || h === '#' || /^#chat/.test(h)) return;
    var t = document.querySelector(h); if (!t) return; e.preventDefault(); if (window.__phoneJump) window.__phoneJump(1200); lenis.scrollTo(t, {duration:1.2});
  });
}
function $(id){ return document.getElementById(id); }
// initials, team badges and scores are not words: keep browser translators (Chrome / Google Translate) away from them
var NO_TRANSLATE = /(^|\s)(badge|ini|r-score|s|scorepill)(\s|$)/;
function el(tag, cls, text){ var e = document.createElement(tag); if (cls){ e.className = cls; if (NO_TRANSLATE.test(cls)){ e.setAttribute('translate', 'no'); e.classList.add('notranslate'); } } if (text != null) e.textContent = text; return e; }
function svg(path){ var s = document.createElementNS('http://www.w3.org/2000/svg','svg'); s.setAttribute('viewBox','0 0 24 24'); s.setAttribute('class','icon'); s.setAttribute('aria-hidden','true'); s.innerHTML = path; return s; }
var ICON = {check:'<path d="M5 12l5 5 9-10"/>', check2:'<path d="M2.5 12.5l4.5 4.5 9-10"/><path d="M10.5 16.2l.8.8 9-10"/>', clock:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2 2"/>'};
// one-to-one chats: how far the other side has received / seen it {room: {delivered, read}} (from the chat backend)
var RCPT = {};
// groups & channels: every other member's position {'g:<id>': {memberId: {delivered, read}}}
var RCPTG = {};
/* Status of one of OUR messages in a room: 'pending' (sending) · 'sent' · 'delivered' · 'read'. One-to-one chats: the other side's
   position. Groups & channels: delivered = at least one other member received it, read = every other member saw it.
   Lounge / match rooms: just sent. Used by the conversation and by the room list, so both always agree. */
function tickState(roomId, m){
  if (!m || CHAT.pending[m.id]) return 'pending';
  if (isDmRoom(roomId)){ var rc = RCPT[roomId]; return rc && rc.read >= m.ts ? 'read' : rc && rc.delivered >= m.ts ? 'delivered' : 'sent'; }
  var g = grpOf(roomId);
  if (g){
    var pos = RCPTG[roomId] || {}, others = (g.members || 0) - (g.status === 'member' || g.isOwner ? 1 : 0), seenN = 0, got = false;
    for (var u in pos){ if (u === CHAT.uid) continue; if (pos[u].delivered >= m.ts || pos[u].read >= m.ts) got = true; if (pos[u].read >= m.ts) seenN++; }
    return others > 0 && seenN >= others ? 'read' : got ? 'delivered' : 'sent';
  }
  return 'sent';
}
function tickIcon(state, inGroup){
  var ic = svg(state === 'pending' ? ICON.clock : state === 'read' || state === 'delivered' ? ICON.check2 : ICON.check);
  ic.setAttribute('role', 'img'); ic.removeAttribute('aria-hidden'); if (state === 'read') ic.classList.add('read');
  ic.setAttribute('aria-label', state === 'pending' ? S('chat.sending') : state === 'read' ? S(inGroup ? 'chat.readAll' : 'chat.read') : state === 'delivered' ? S('chat.delivered') : S('chat.sent'));
  return ic;
}

var LIVE = {matches: [], messages: [], profiles: {}, dirty: true, me: null};
var CHAT = {db:null, user:null, room:null, uid:null, canPost:false, canEdit:false, active:'lounge', replyTo:null, lastSend:0, typingTimer:0, peers:[], pending:{}, renderToken:0, unseenBelow:0};

/* ---------- Scroll state for the 3D phone ---------- */
var hero = document.querySelector('.hero'), feat = $('features');
var callouts = Array.prototype.slice.call(document.querySelectorAll('.callout')), dots = Array.prototype.slice.call(document.querySelectorAll('.dots i'));
var S2 = {pA:0, pB:0, pC:0, feature:-1, prevFeature:-1, inFeat:false, local:0};
// the section's scroll is split into 4 features + a short hold at the end (FEAT_UNITS − 4), so the last progress bar fills
// before the section ends instead of crawling to the very bottom
var FEAT_UNITS = 4.08;
/* a programmatic jump (menu link, back to top) is in flight until JUMP.until: the features section doesn't play its
   per-feature animations for every feature it flies past — it fades out, and shows the arrival state once (phone code) */
var JUMP = {until: 0};
function jumpingNow(){ return !REDUCE && performance.now() < JUMP.until; }
/* Phones (same query as the CSS and the 3D phone): the features are NOT pinned. They are 4 blocks stacked down the page,
   each with an empty "slot" at its top where the phone sits. The phone rides with the current block, then glides DOWN to
   the next block's slot while turning once, landing (facing you, new screen) as that block reaches the rest line. */
var FLOW_MQ = window.matchMedia ? window.matchMedia('(max-width:760px), (max-width:1100px) and (orientation:portrait)') : null;
function isFlow(){ return !!(FLOW_MQ && FLOW_MQ.matches); }
var FLOW_R = 0.35;                       // rest line: where the phone's centre sits on screen (share of the viewport height)
var flowCallouts = null, flowSlotH = 0;  // callouts in reading order, slot height (= their padding-top), refreshed on layout
function flowMeasure(){
  flowCallouts = callouts.slice().sort(function(a, b){ return +a.dataset.i - +b.dataset.i; });
  flowSlotH = flowCallouts.length ? (parseFloat(getComputedStyle(flowCallouts[0]).paddingTop) || 0) : 0;
}
function flowEase(t){ var x = Math.max(0, Math.min(1, (t - 0.04) / 0.92)); return x * x * (3 - 2 * x); }   // smoothstep, barely held at the ends: the phone rides up a little, glides down, settles
/** phase before | between | after, the block k we leave, travel progress e (0→1) and the phone's centre on screen (px) */
function flowInfo(){
  if (!flowCallouts) flowMeasure();
  var vh = window.innerHeight, R = vh * FLOW_R, c = flowCallouts.map(function(el){ return el.getBoundingClientRect().top + flowSlotH / 2; }), n = c.length;
  if (!n) return {phase:'after', k:0, e:1, y:R, R:R};
  if (c[0] > R) return {phase:'before', k:0, e:0, y:c[0], R:R};
  if (c[n - 1] <= R) return {phase:'after', k:n - 1, e:0, y:R, R:R};   // last block reached: its turn is done (no extra spin)
  var k = 0; while (k < n - 2 && c[k + 1] <= R) k++;
  var D = c[k + 1] - c[k], t = D > 0 ? (R - c[k]) / D : 1, e = flowEase(t);
  return {phase:'between', k:k, e:e, y:c[k] + D * e, R:R};
}
window.__flowInfo = flowInfo;
function featureLocal(f){ if (f < 0) return 0; return Math.max(0, Math.min(1, S2.pB * FEAT_UNITS - f)); }
var progEls = [];
function paintProgress(f){
  S2.local = isFlow() ? (f >= 0 ? 1 : 0) : featureLocal(f);
  var els = f >= 0 ? [dots[f], callouts.filter(function(c){ return +c.dataset.i === f; })[0]].filter(Boolean).map(function(e){ return e.classList && e.classList.contains('callout') ? e.querySelector('.rule') : e; }).filter(Boolean) : [];
  progEls.forEach(function(e){ if (els.indexOf(e) < 0) e.style.setProperty('--p', '0'); });
  els.forEach(function(e){ e.style.setProperty('--p', S2.local.toFixed(4)); });
  progEls = els;
}
function applyFeature(){
  var f;
  if (isFlow()){ var fi = flowInfo(); f = S2.inFeat && S2.pC < 1 ? Math.min(3, fi.phase === 'between' ? fi.k + (fi.e >= 0.5 ? 1 : 0) : fi.k) : -1; }
  else f = S2.inFeat && S2.pC < 1 ? Math.min(3, Math.floor(S2.pB * FEAT_UNITS)) : -1;
  paintProgress(f);
  if (f !== S2.feature){ S2.feature = f;
    callouts.forEach(function(c){ var i = +c.dataset.i; c.classList.toggle('on', i === f); c.classList.toggle('seen', f >= 0 && i < f); });
    dots.forEach(function(d, i){ d.classList.toggle('on', i === f); });
    if (!jumpingNow()) animateCallouts(f, S2.prevFeature);   // flying past during a jump: no entrance per feature
    S2.prevFeature = f;
    if (window.onFeatureChange) window.onFeatureChange(f); }
}
function isNarrow(){ return window.innerWidth <= 860; }
function animateCallouts(f, prev, instant){
  feat.classList.add('gsap-callouts');
  if (isFlow()){
    callouts.forEach(function(c){
      var i = +c.dataset.i, parts = c.querySelectorAll('.ic, h3, p'), rule = c.querySelector('.rule');
      G.killTweensOf([c, parts, rule]); G.set(c, {autoAlpha:1, y:0});
      if (i === f && !c._seen && !instant && !REDUCE){ c._seen = true; G.fromTo(parts, {opacity:0, y:26}, {opacity:1, y:0, duration:.7, ease:'power3.out', stagger:.08}); }
      else if (!G.isTweening(parts)) G.set(parts, {opacity:1, y:0});
      G.set(rule, {width:90});
    });
    return;
  }
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
navState(); ScrollTrigger.addEventListener('refresh', navState); ScrollTrigger.addEventListener('refresh', flowMeasure); window.addEventListener('load', function(){ setTimeout(navState, 50); }); setTimeout(navState, 300);

/* ---------- Back to top: appears once you start scrolling, ring shows progress ---------- */
(function(){
  var btn = $('toTop'), prog = $('toTopProg'), C = 2 * Math.PI * 25;
  function update(){ var y = window.scrollY, max = document.documentElement.scrollHeight - window.innerHeight;
    btn.classList.toggle('show', y > 300); prog.style.strokeDashoffset = C * (1 - (max > 0 ? Math.min(1, y / max) : 0)); }
  if (lenis) lenis.on('scroll', update); window.addEventListener('scroll', update, {passive:true}); update();
  btn.addEventListener('click', function(){
    if (!REDUCE) G.fromTo(btn, {scale:.85}, {scale:1, duration:.6, ease:'elastic.out(1, .5)', clearProps:'transform'});
    // slower, calmer trip to the top: longer for longer distances (≈1.6 s → 3 s), gentle start and stop
    if (lenis){ var dur = Math.min(3, 1.6 + window.scrollY / 4500); if (window.__phoneJump) window.__phoneJump(dur * 1000);
      lenis.scrollTo(0, {duration:dur, easing:function(t){ return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }}); } else window.scrollTo({top:0, behavior: REDUCE ? 'auto' : 'smooth'});
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
var BRANDS = (cfg.partners || []).map(function(p){ return {id:p.id, name:p.name, c:p.c, hero:p.hero || null, motion:p.motion || null}; });
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
/* the blocks that move when a partner's texts change length (the texts themselves crossfade separately) */
/* A partner's texts (name, code, bonus) change the size of the blocks that hold them. Their SIZE is animated from the old
   to the new one; everything around them is laid out by the browser on every frame, so neighbours (the Claim button next
   to the promo box, the rows under a paragraph…) glide along on their own — nothing can drift or overshoot.
   (Moving the neighbours separately, e.g. with FLIP, fought the centred button row: it re-centred and overshot.) */
var BRAND_SIZED = '.hero-cta .promo, .hero-foot > p:not(.brand-ghost), .steps li, .codecard .cc-code, .codecard .cc-bonus';
// whole sentences that contain the partner's name / bonus: crossfaded as a whole (not only the name)
var BRAND_TEXTS = '.hero-foot > p:not(.brand-ghost), .steps li > div:not(.brand-ghost)';
function brandSizes(){
  var els = Array.prototype.slice.call(document.querySelectorAll(BRAND_SIZED)).filter(function(e){ return e.offsetParent; });
  var before = els.map(function(e){ var r = e.getBoundingClientRect(); return [r.width, r.height]; });
  var terms = Array.prototype.slice.call(document.querySelectorAll('.js-terms')).map(function(e){ return [e, !e.hidden]; });
  // sentences with the partner's name inside re-wrap when the name changes length (words jump between lines): keep a copy
  // of the old sentence exactly where it was and crossfade it into the new one, while the block's height glides
  var ghosts = Array.prototype.slice.call(document.querySelectorAll(BRAND_TEXTS)).filter(function(e){ return e.offsetParent; }).map(function(e){
    var g = e.cloneNode(true), cs = getComputedStyle(e);
    g.removeAttribute('id'); g.setAttribute('aria-hidden', 'true'); g.classList.add('brand-ghost');
    Object.assign(g.style, {position: 'absolute', left: e.offsetLeft + 'px', top: e.offsetTop + 'px', width: e.offsetWidth + 'px', margin: '0', pointerEvents: 'none', textAlign: cs.textAlign});
    return [e, g];
  });
  return function(){   // call after the new texts are in
    ghosts.forEach(function(x){
      var e = x[0], g = x[1]; if (!e.parentNode || !e.offsetParent) return;
      if (g.textContent === e.textContent) return;   // same sentence (e.g. a part without the name): nothing to do
      // next to the sentence (same styles); positioned against the same box its offsets were measured from
      e.parentNode.insertBefore(g, e.nextSibling);
      // an even crossfade (the two always add up to about one fully visible sentence — never a blank moment)
      G.fromTo(g, {opacity: 1}, {opacity: 0, duration: .45, ease: 'sine.inOut', onComplete: function(){ g.remove(); }});
      G.fromTo(e, {opacity: 0}, {opacity: 1, duration: .45, ease: 'sine.inOut', clearProps: 'opacity'});
    });
    els.forEach(function(e, i){
      var r = e.getBoundingClientRect(), w0 = before[i][0], h0 = before[i][1], from = {}, to = {};
      if (Math.abs(r.width - w0) > .5){ from.width = w0; to.width = r.width; }
      if (Math.abs(r.height - h0) > .5){ from.height = h0; to.height = r.height; }
      if (!('width' in to) && !('height' in to)) return;
      from.overflow = 'hidden';
      G.fromTo(e, from, Object.assign(to, {duration: .6, ease: 'power3.inOut', overwrite: 'auto', clearProps: 'width,height,overflow'}));
    });
    // the terms link: opens / closes instead of popping in or out (its neighbours follow, as above)
    terms.forEach(function(t){
      var e = t[0], was = t[1], now = !e.hidden; if (was === now) return;
      if (now){ var w = e.getBoundingClientRect().width; G.fromTo(e, {width: 0, opacity: 0, overflow: 'hidden', whiteSpace: 'nowrap'}, {width: w, opacity: 1, duration: .5, ease: 'power3.out', clearProps: 'width,opacity,overflow,whiteSpace'}); }
      else { e.hidden = false; var w2 = e.getBoundingClientRect().width; G.fromTo(e, {width: w2, opacity: 1, overflow: 'hidden', whiteSpace: 'nowrap'}, {width: 0, opacity: 0, duration: .35, ease: 'power2.in', clearProps: 'width,opacity,overflow,whiteSpace', onComplete: function(){ e.hidden = true; }}); }
    });
  };
}
function setBrand(id, opts){
  opts = opts || {}; if (!BRANDS.length) return; var b = brandById(id) || BRANDS[0], first = !CUR_BRAND, prevBrand = CUR_BRAND;
  if (!first && b === CUR_BRAND && !opts.force) return;
  CUR_BRAND = b; var f = brandFields(b);
  SITE.bookmaker = b.name; SITE.promo = f.promo; SITE.bonus = f.bonus; SITE.payments = f.payments; SITE.signupUrl = f.signupUrl; SITE.termsUrl = f.termsUrl;
  var vars = brandVars(b.c), root = document.documentElement;
  if (!first && !REDUCE) G.to(root, Object.assign({duration:.9, ease:'power2.inOut', overwrite:true}, vars));
  else for (var k in vars) root.style.setProperty(k, vars[k]);
  // the partner's texts change length (name, code, bonus) and some parts show or hide (terms link): record where every
  // block is, apply the new texts, then glide each block from its old place / size to the new one — no jumping
  var resize = !first && !REDUCE ? brandSizes() : null;
  applySite();
  if (resize) resize();
  document.querySelectorAll('.p-btn').forEach(function(x){ x.setAttribute('aria-pressed', x.dataset.id === b.id ? 'true' : 'false'); });
  var active = document.querySelector('.p-btn[data-id="' + b.id + '"]'); movePartnerPill(active, first);
  if (active){ var box = $('partners'), left = active.offsetLeft - box.clientWidth / 2 + active.offsetWidth / 2; try { box.scrollTo({left: Math.max(0, left), behavior: (first || REDUCE) ? 'auto' : 'smooth'}); } catch(e){ box.scrollLeft = left; } }
  var word = $('pWord');
  if (word){ if (!first && !REDUCE){ G.timeline().to(word, {yPercent:40, opacity:0, duration:.25, ease:'power2.in'}).add(function(){ word.textContent = b.name; }).fromTo(word, {yPercent:-40, opacity:0}, {yPercent:0, opacity:1, duration:.6, ease:'expo.out'}); } else word.textContent = b.name; }
  if (!first && !REDUCE) G.fromTo('.js-code, .js-bookmaker, .js-bonus', {opacity:0, y:6}, {opacity:1, y:0, duration:.5, stagger:.015, ease:'power2.out', clearProps:'transform'});
  if (window.phoneBrand) window.phoneBrand(b, first);
  // which side the new picture comes from: given by the caller (arrows / phone drag), else where the partner sits in the switcher
  swapHero(b, first, opts.from || (prevBrand && BRANDS.indexOf(b) < BRANDS.indexOf(prevBrand) ? -1 : 1));
  store('ps_brand', b.id);
  if (!opts.fromHash && !first && !document.body.classList.contains('chat-open')){ try { history.replaceState(null, '', '#b-' + b.id); } catch(e){} }
}
(function(){
  var box = $('partners');
  BRANDS.forEach(function(b){ var bt = el('button', 'p-btn', b.name); bt.type = 'button'; bt.dataset.id = b.id; bt.setAttribute('aria-pressed', 'false'); bt.onclick = function(){ setBrand(b.id); }; box.appendChild(bt); });
  box.addEventListener('keydown', function(e){ if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; var i = BRANDS.indexOf(CUR_BRAND), n = BRANDS.length; i = (i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n; setBrand(BRANDS[i].id, {from: e.key === 'ArrowRight' ? 1 : -1}); var nb = box.querySelector('.p-btn[data-id="' + BRANDS[i].id + '"]'); if (nb) nb.focus(); e.preventDefault(); });
  window.addEventListener('resize', function(){ movePartnerPill(document.querySelector('.p-btn[aria-pressed="true"]'), true); });
  if (window.ResizeObserver) new ResizeObserver(function(){ movePartnerPill(document.querySelector('.p-btn[aria-pressed="true"]'), true); }).observe(box);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ movePartnerPill(document.querySelector('.p-btn[aria-pressed="true"]'), true); });
})();
/* first-screen person picture: each partner's own (a partner without one shows none).
   Switching moves it sideways, following the partner: a partner to the right (or the next one when you drag the phone left)
   comes in from the right while the old person drifts out to the left — and the other way round. Unhurried on purpose:
   the old one leaves over .9 s, the new one glides in over 1.6 s with a soft ease-out, the two overlapping so there's no
   empty moment. The new file is decoded first so it never pops in half-drawn. Reduced motion: plain .6 s crossfade.
   First load (no switch): the page's own opening rise. */
var HERO = {el: document.querySelector('.hero-person'), seq: 0, preloaded: false, out: []};
// defaults; each partner can set its own in the back office (Partners → partner → First screen picture → Switch animation)
var HERO_MOTION = {style:'slide', inMs:1600, outMs:900, delay:180, dx:140, ease:'cubic-bezier(.22,.61,.36,1)', outEase:'cubic-bezier(.45,0,.55,1)'};
function heroFrames(M, from, entering){
  // entering: from the side (slide) / from below (rise) / in place (fade); leaving goes the opposite way, a bit less far
  var d = entering ? M.dx : -Math.round(M.dx * .8);
  var t = M.style === 'rise' ? 'translateY(' + (entering ? M.dx : Math.round(M.dx * .6)) + 'px)' : M.style === 'fade' ? 'none' : 'translateX(' + (from * d) + 'px)';
  return t;
}
function heroOf(b){ return (b && b.hero) || null; }
function heroDecode(url){
  return new Promise(function(ok){
    var pre = new Image(); pre.decoding = 'async'; pre.src = url;
    var done = function(){ ok(); };
    if (pre.decode) pre.decode().then(done, done); else { pre.onload = pre.onerror = done; }
    setTimeout(done, 4000); // never wait forever on a slow network
  });
}
function heroSet(img, h){ if (h.w) img.width = h.w; else img.removeAttribute('width'); if (h.h) img.height = h.h; else img.removeAttribute('height'); img.src = h.url; }
function heroAnim(img, frames, ms, ease, delay){
  var a = img.animate(frames, {duration: ms, easing: ease, delay: delay || 0, fill: 'both'});
  return new Promise(function(ok){ a.onfinish = function(){ ok(a); }; a.oncancel = function(){ ok(null); }; });
}
function swapHero(b, first, from){
  from = from < 0 ? -1 : 1;
  var M = Object.assign({}, HERO_MOTION, (b && b.motion) || {}); if (REDUCE) M.style = 'fade';
  var img = HERO.el; if (!img) return;
  var h = heroOf(b), url = h ? h.url : null, cur = img.hidden ? null : img.getAttribute('src');
  if (url === cur) return;
  var seq = ++HERO.seq;
  if (first){
    // the server rendered another partner's picture: keep it invisible until the right one is loaded, then the normal opening rise
    if (!url){ img.hidden = true; return; }
    img.style.transition = 'none'; img.style.opacity = '0'; img.style.transform = 'translateY(40px)';
    heroSet(img, h); img.hidden = false;
    heroDecode(url).then(function(){ if (seq !== HERO.seq) return; void img.offsetWidth; img.style.transition = ''; img.style.opacity = ''; img.style.transform = ''; });
    return;
  }
  // a quick second switch: drop whatever was still leaving
  HERO.out.forEach(function(o){ if (o.parentNode) o.parentNode.removeChild(o); }); HERO.out = [];
  (url ? heroDecode(url) : Promise.resolve()).then(function(){
    if (seq !== HERO.seq) return;
    var old = cur ? img : null;
    if (old){
      HERO.out.push(old);
      old.getAnimations().forEach(function(a){ a.commitStyles && a.commitStyles(); a.cancel(); });
      old.style.transition = 'none';
      var o0 = getComputedStyle(old).opacity, t0 = getComputedStyle(old).transform; if (!t0 || t0 === 'none') t0 = 'translateX(0)';
      heroAnim(old, [{opacity:o0, transform:t0}, {opacity:0, transform:heroFrames(M, from, false)}], REDUCE ? 600 : M.outMs, REDUCE ? 'ease' : M.outEase).then(function(){
        HERO.out = HERO.out.filter(function(o){ return o !== old; });
        if (url){ if (old.parentNode) old.parentNode.removeChild(old); }
        else { old.hidden = true; old.getAnimations().forEach(function(a){ a.cancel(); }); old.style.opacity = ''; old.style.transform = ''; old.style.transition = ''; }
      });
    }
    if (!url) return;
    var next = old ? img.cloneNode(false) : img;
    if (old){ next.removeAttribute('style'); next.removeAttribute('fetchpriority'); old.parentNode.insertBefore(next, old.nextSibling); }
    next.style.transition = 'none'; next.style.opacity = '0';
    heroSet(next, h); next.hidden = false; HERO.el = next;
    heroAnim(next, [{opacity:0, transform:heroFrames(M, from, true), offset:0}, {opacity:1, offset: M.style === 'fade' ? 1 : .85}, {opacity:1, transform:'none', offset:1}], REDUCE ? 600 : M.inMs, REDUCE ? 'ease' : M.ease, REDUCE ? 0 : old ? M.delay : 0).then(function(a){
      if (seq !== HERO.seq && HERO.el !== next) return;
      // hand over from the animation to the normal style WITHOUT the page's opening fade: Safari took "invisible" (the inline
      // starting value) as the fade's start when both changed at once, so the picture vanished and faded in again. The
      // style is applied (offsetWidth) while transitions are still off — and they stay off: only the first picture fades in.
      next.style.opacity = ''; next.style.transform = ''; if (a) a.cancel(); void next.offsetWidth; next.style.transition = 'none';
    });
  });
}
// warm the other partners' pictures: when someone reaches for the switcher, or anyway once the page has settled
(function(){ var box = $('partners'); if (!box || !HERO.el) return; function warm(){ if (HERO.preloaded) return; HERO.preloaded = true; BRANDS.forEach(function(b){ var h = heroOf(b); if (h){ var i = new Image(); i.decoding = 'async'; i.src = h.url; } }); } box.addEventListener('pointerenter', warm); box.addEventListener('focusin', warm); box.addEventListener('touchstart', warm, {passive:true}); window.addEventListener('load', function(){ setTimeout(function(){ (window.requestIdleCallback || function(f){ setTimeout(f, 1); })(warm); }, 2500); }); })();
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
    chat.href = '/' + cfg.locale + '/chat/' + m.id; chat.appendChild(svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'));
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
          mod:{muted:{}}, pic:null, reports:{}, reported:{}, myReports:{}, accepted:false, slowUntil:0, lastText:'', lastTextAt:0, loaded:false, hdrRoom:null};
var segPill = LiquidPill($('segPill'), 'x'), roomPill = LiquidPill($('roomPill'), 'y');
var wallPush = Spring(0, .5, .9, .2).on(function(v){ $('wallIn').style.transform = Math.abs(v) < .2 ? '' : 'translateY(' + v.toFixed(2) + 'px)'; });

var DM = {agent:{uid:null, lastSeen:0}, mine:[], threads:{}, msgs:{}, subs:{}};
// member-to-member private chats (consent first): PM.rels[uid] = {status: pending-out | pending-in | accepted | blocked, lastSeen}, PM.msgs[uid] = messages
var PM = {rels:{}, msgs:{}};
// groups & channels (made by the team): GR.list = rooms this viewer sees ({id, name, kind, join, status, canRead, canPost, members, rules…}), GR.msgs[id]
var GR = {list:[], msgs:{}};
function grpId(id){ return String(id).indexOf('g:') === 0 ? String(id).slice(2) : null; }
function grpOf(id){ var g = grpId(id); return g ? GR.list.filter(function(x){ return x.id === g; })[0] || null : null; }
function pmUid(id){ return String(id).indexOf('pm:') === 0 ? String(id).slice(3) : null; }
function agentName(){ var p = DM.agent.uid && LIVE.profiles[DM.agent.uid]; return (p && p.name) || SITE.agentName || S('chat.agentDefault'); }
function threadOrder(){ return Object.keys(DM.threads).sort(function(a, b){ return (DM.threads[b].lastTs || 0) - (DM.threads[a].lastTs || 0); }); }
function isDmRoom(id){ return id === 'support' || String(id).indexOf('sup:') === 0 || String(id).indexOf('pm:') === 0; }
function isOnline(uid){ return !!uid && viewers().some(function(p){ return !p.isMe && peerId(p) === uid; }); }
function lastSeenOf(uid){ if (uid && uid === DM.agent.uid) return DM.agent.lastSeen || 0; if (uid && PM.rels[uid]) return Number(PM.rels[uid].lastSeen) || 0; var t = DM.threads[uid]; return (t && Number(t.lastSeen)) || 0; }
function seenText(ts){ if (!ts) return ''; var l = dayLabel(ts); return S('chat.lastSeen', {day: isTodayLabel(l) ? S('time.todayLower') : (l === S('time.yesterday') ? S('time.yesterdayLower') : l), time: hhmm(ts)}); }
function roomHash(id){ return 'chat-' + String(id).replace(/^(sup|pm|g):/, '$1-'); }
function roomFromHash(h){ var id = h.slice(5), m = /^(sup|pm|g)-([a-f0-9]{24})$/i.exec(id); return m ? m[1] + ':' + m[2] : id; }
function openRoom(id){
  // a room opened from the search results: the search is done, and the room takes the search's place in the history
  // (so Back returns to the room list in one step)
  if (SR.on){ var fromSearch = SR.pushed; if (fromSearch) try { var st = Object.assign({}, history.state); delete st.srch; history.replaceState(st, '', location.href); } catch(e){}
    srchExit(false, true); if (fromSearch && isOpen()){ goChat(id, {replace: true}); return; } }
  goChat(id);
}
function rooms(){ var list = [];
  if (CHAT.db && CHAT.uid){
    if (CHAT.canEdit) threadOrder().forEach(function(uid){ list.push({id:'sup:' + uid, dm:true, uid:uid, title:nameOf(uid)}); });
    else {
      list.push({id:'support', dm:true, agent:true, uid:DM.agent.uid, title:agentName()});
      Object.keys(PM.rels).filter(function(u){ var st = PM.rels[u].status; return st === 'accepted' || st === 'pending-out'; })
        .map(function(u){ var ms = PM.msgs[u] || [], last = ms[ms.length - 1]; return {u:u, ts:(last && last.ts) || Number(PM.rels[u].at) || 0}; })
        .sort(function(a, b){ return b.ts - a.ts; })
        .forEach(function(x){ list.push({id:'pm:' + x.u, dm:true, pm:true, uid:x.u, title:nameOf(x.u), pendingOut: PM.rels[x.u].status === 'pending-out'}); });
    }
  }
  list.push({id:'lounge', title:S('chat.lounge'), lounge:true});
  GR.list.forEach(function(g){ list.push({id:'g:' + g.id, group:g, title:g.name}); });
  LIVE.matches.forEach(function(m){ list.push({id:m.id, title:S('chat.matchTitle', {home: m.home, away: m.away}), match:m}); }); return list; }
function roomById(id){ return rooms().filter(function(r){ return r.id === id; })[0] || rooms()[0]; }
function viewers(){ return CHAT.peers.filter(function(p){ return p.kind === 'viewer'; }); }
function online(roomId){ return viewers().filter(function(p){ return roomId ? (p.presence && p.presence.room === roomId) : true; }).length; }
function peerId(p){ return p.by || (p.presence && p.presence.uid) || null; }
function onlineSet(){ var s = {}; viewers().forEach(function(p){ var id = peerId(p); if (id) s[id] = true; }); return s; }
function typersIn(roomId){ return viewers().filter(function(p){ if (p.isMe || !p.presence || !p.presence.typing) return false; var r = p.presence.room;
  if (roomId === 'support') return r === 'sup:' + CHAT.uid;
  if (String(roomId).indexOf('sup:') === 0) return r === 'support' && peerId(p) === roomId.slice(4);
  if (pmUid(roomId)) return r === 'pm:' + CHAT.uid && peerId(p) === pmUid(roomId);
  return r === roomId; }); }
async function names(ids){ ids = ids.filter(function(x, i, a){ return x && a.indexOf(x) === i && !LIVE.profiles[x]; }); if (!ids.length || !CHAT.user) return; try { var ps = await CHAT.user.profiles(ids); for (var k in ps) LIVE.profiles[k] = ps[k]; ids.forEach(function(id){ if (!LIVE.profiles[id]) NAMES.gone[id] = true; }); } catch(e){} }
var NAMES = {asked:{}, gone:{}, timer:0, queue:[]};
function fetchName(id){ if (!id || NAMES.asked[id] || !CHAT.user) return; NAMES.asked[id] = true; NAMES.queue.push(id); clearTimeout(NAMES.timer);
  NAMES.timer = setTimeout(function(){ var q = NAMES.queue; NAMES.queue = []; names(q).then(function(){ refreshChat(); }); }, 60); }
function nameOf(id){ if (id && id === CHAT.uid) return S('chat.you'); var p = LIVE.profiles[id]; if (p && p.name) return p.name; if (id && id === DM.agent.uid) return agentName();
  if (!id) return S('chat.guest'); if (NAMES.gone[id]) return S('chat.deletedUser'); fetchName(id); return '…'; }
/* one line describing a quoted message: its text, or 📷 Photo / 🎤 Voice message · 0:12 (with an icon) */
function quoteLine(box, q){
  box.textContent = '';
  if (q.kind) box.appendChild(svg(q.kind === 'voice' ? '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>' : '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 8"/>'));
  box.appendChild(document.createTextNode(q.text || (q.kind === 'voice' ? S('chat.voice') + (q.dur ? ' · ' + fmtDur(q.dur) : '') : q.kind === 'photo' ? S('chat.photo') : '')));
}
/* Reactions in the chat list, like WhatsApp: the latest one, when it's newer than the last message and it's someone
   reacting to MY message or me reacting (others reacting to others aren't shown); one taken back isn't shown. It never
   counts as unread. */
function lastReaction(msgs, last){
  var best = null, after = last ? last.ts : 0;
  for (var i = msgs.length - 1; i >= 0 && i >= msgs.length - 80; i--){
    var m = msgs[i], x = m.lr;
    if (!x || !x.at || x.at <= after || (best && x.at <= best.at)) continue;
    if (!(m.reactions && m.reactions[x.k] && m.reactions[x.k][x.by])) continue;   // taken back since
    if (x.by !== CHAT.uid && m.by !== CHAT.uid) continue;
    best = {by: x.by, k: x.k, at: x.at, m: m};
  }
  return best;
}
function reactionLine(ev, r){
  var emoji = (REACTS.filter(function(x){ return x[0] === ev.k; })[0] || [0, ''])[1], t = String(msgPreview(ev.m) || '');
  if (t.length > 40) t = t.slice(0, 39).trim() + '…';
  if (ev.by === CHAT.uid) return S('chat.youReacted', {emoji: emoji, text: t});
  return r.dm ? S('chat.reactedDm', {emoji: emoji, text: t}) : S('chat.reacted', {name: nameOf(ev.by), emoji: emoji, text: t});   // (a private chat: the name is already the title)
}
function msgPreview(m){ return (m && (m.text || (m.image || m.expired === 'photo' || (m.locked && m.locked.kind === 'photo') ? S('chat.photo') : m.voice || m.expired === 'voice' || (m.locked && m.locked.kind === 'voice') ? S('chat.voice') + (m.voice && m.voice.dur ? ' · ' + fmtDur(m.voice.dur) : '') : ''))) || ''; }
/* Are this room's messages here yet? (each kind of room loads on its own: the lounge with the first load, a group's
   messages with the group list, a private chat once accepted, a member's help thread when the team opens it) */
function roomReady(id){
  if (!UI.loaded || CHAT.wantRoom) return false;
  if (pmUid(id)){ var rel = PM.rels[pmUid(id)]; return PM.msgs[pmUid(id)] !== undefined || !(rel && rel.status === 'accepted'); }
  if (grpId(id)){ var g = grpOf(id); return GR.msgs[grpId(id)] !== undefined || !(g && g.canRead); }
  if (String(id).indexOf('sup:') === 0) return DM.msgs[id.slice(4)] !== undefined;
  return true;
}
/* placeholder bubbles while a room loads — real rows, so they take the theme's colours and the chosen bubble style */
function skeletonRows(){
  if (UI.skels) return UI.skels;
  var spec = [['in', 58, 2], ['in', 34, 1], ['out', 46, 1], ['out', 64, 2], ['in', 40, 1], ['out', 28, 1], ['in', 52, 2]];
  UI.skels = spec.map(function(x, i){
    var prev = spec[i - 1], next = spec[i + 1];
    var r = el('div', 'row skel-row ' + x[0] + (!prev || prev[0] !== x[0] ? ' gap' : '') + (!next || next[0] !== x[0] ? ' tail' : '')); r.setAttribute('aria-hidden', 'true');
    if (x[0] === 'in'){ var av = el('div', 'av' + (!next || next[0] !== x[0] ? '' : ' hide')); av.appendChild(el('span', 'ini skel-av')); r.appendChild(av); }
    var w = el('div', 'bwrap'); w.style.width = x[1] + '%'; var b = el('div', 'bubble skel-b'); for (var k = 0; k < x[2]; k++){ var ln = el('i'); ln.style.width = (k === x[2] - 1 && x[2] > 1 ? 60 : 92) + '%'; b.appendChild(ln); }
    w.appendChild(b); r.appendChild(w); r.style.animationDelay = (i * 90) + 'ms'; return r;
  });
  return UI.skels;
}
function roomMsgs(id){ if (id === 'support') return DM.mine; if (pmUid(id)) return PM.msgs[pmUid(id)] || []; if (grpId(id)) return GR.msgs[grpId(id)] || []; if (String(id).indexOf('sup:') === 0) return DM.msgs[id.slice(4)] || []; return LIVE.messages.filter(function(m){ return (m.room || 'lounge') === id; }); }

var toastTimer = 0;
function toast(msg, ok){ var t = $('toast'); $('toastText').textContent = msg; t.classList.toggle('ok', !!ok); t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function(){ t.classList.remove('show'); }, 2800); }

function personAvatar(uid, showOnline, agent){
  var av = el('div', 'r-av person' + (agent && !uid ? ' agent' : '')); av.setAttribute('aria-hidden', 'true');
  var p = uid && LIVE.profiles[uid];
  if (p && p.avatarUrl){ var img = document.createElement('img'); img.alt = ''; img.src = p.avatarUrl; av.appendChild(img); }
  else if (agent && !uid) av.appendChild(svg('<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/><path d="M19 20a3 3 0 0 1-3 2h-3"/>'));
  else { var i = el('span', 'ini', initials(agent ? agentName() : nameOf(uid))); i.style.background = (p && (p.gradient || p.color)) || teamColor(uid || 'x'); av.appendChild(i); }
  if (showOnline && isOnline(uid)) av.appendChild(el('span', 'on'));
  return av;
}
function roomAvatar(r, showOnline){
  if (r.dm) return personAvatar(r.uid, showOnline, r.agent);
  if (r.group && r.group.photo){ var gp = el('div', 'r-av person'); gp.setAttribute('aria-hidden', 'true'); var im = document.createElement('img'); im.alt = ''; im.src = r.group.photo; gp.appendChild(im); if (showOnline && online(r.id) > 0) gp.appendChild(el('span', 'on')); return gp; }   // the room's photo
  if (r.group){ var ga = el('div', 'r-av person'); ga.setAttribute('aria-hidden', 'true'); var gi = el('span', 'ini'); gi.style.background = r.group.gradient || 'linear-gradient(135deg,#3E63DD,#8E4EC6)';
    gi.appendChild(svg(r.group.kind === 'channel' ? '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/>' : '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5M15 14.5c2.8 0 5 1.6 5 4.5"/>'));
    ga.appendChild(gi); if (showOnline && online(r.id) > 0) ga.appendChild(el('span', 'on')); return ga; }
  var av = el('div', 'r-av ' + (r.lounge ? 'lounge' : 'pair')); av.setAttribute('aria-hidden', 'true');
  if (r.lounge) av.appendChild(svg('<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5M15 14.5c2.8 0 5 1.6 5 4.5"/>'));
  else [r.match.home, r.match.away].forEach(function(n){ var b = el('span', 'badge', initials(n)); b.style.background = teamColor(n); av.appendChild(b); });
  if (showOnline && online(r.id) > 1) av.appendChild(el('span', 'on'));
  return av;
}

/* ---------- Filter control ---------- */
function placeSegPill(){ var b = document.querySelector('#seg button[aria-pressed="true"]'); if (b && b.offsetWidth) segPill.move(b.offsetLeft, b.offsetLeft + b.offsetWidth, true); }
document.querySelectorAll('#seg button').forEach(function(c){ c.onclick = function(){ UI.filter = c.dataset.f; document.querySelectorAll('#seg button').forEach(function(x){ x.setAttribute('aria-pressed', x === c ? 'true' : 'false'); }); placeSegPill(); renderRooms(); }; });
/* ---------- Search mode (like WhatsApp / Telegram) ----------
   Tapping the search box: the tabs, the notification card and the rules link make way (on phones the list's header
   too), and the results come in sections — Chats (rooms whose name matches, the letters highlighted), then People
   (chatBackend.ts). A clear ✕ in the box, Cancel / Escape / the phone's Back leave it. The keyboard's search key, or
   starting to scroll the results, puts the keyboard away and keeps the results. Nothing found: a clear empty state. */
var SR = {on: false, pushed: false};
function srchQ(){ return $('roomSearch').value.trim(); }
function srchSide(){ return document.querySelector('#messenger .m-side'); }
function srchEnter(){
  if (SR.on) return; SR.on = true; srchSide().classList.add('searching');
  // the phone's Back leaves the search (one step in the history, counted like a chat page)
  try { var st = history.state || {}; history.pushState(Object.assign({}, st, {srch: 1, depth: (st.depth || 0) + 1}), '', location.href); SR.pushed = true; } catch(e){}
  renderRooms();
}
function srchExit(fromBack, keepHistory){
  if (!SR.on) return; SR.on = false;
  var inp = $('roomSearch'); inp.value = ''; inp.blur(); srchSide().classList.remove('searching');
  inp.dispatchEvent(new Event('input'));   // the room list and the people results go back to normal
  if (SR.pushed && !fromBack && !keepHistory){ SR.pushed = false; history.back(); }
  SR.pushed = false;
}
window.addEventListener('popstate', function(){ if (SR.on && !(history.state && history.state.srch)) srchExit(true); });
$('roomSearch').addEventListener('focus', srchEnter);
$('roomSearch').addEventListener('input', function(){ if (!SR.on && srchQ()) srchEnter(); renderRooms(); });
$('roomSearch').addEventListener('keydown', function(e){
  if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); srchExit(); }
  else if (e.key === 'Enter'){ e.preventDefault(); this.blur(); }   // the keyboard's search key: put the keyboard away, keep the results
});
$('searchCancel').addEventListener('click', function(){ srchExit(); });
['pointerdown', 'mousedown'].forEach(function(ev){ $('searchClear').addEventListener(ev, function(e){ e.preventDefault(); }); });   // (the box keeps the focus)
$('searchClear').addEventListener('click', function(){ var i = $('roomSearch'); i.value = ''; i.dispatchEvent(new Event('input')); i.focus({preventScroll: true}); });
// starting to scroll the results puts the keyboard away (the results stay)
(function(){ var y0 = null;
  srchSide().addEventListener('touchstart', function(e){ y0 = SR.on && !e.target.closest('.search-row') ? e.touches[0].clientY : null; }, {passive: true});
  srchSide().addEventListener('touchmove', function(e){ if (y0 !== null && Math.abs(e.touches[0].clientY - y0) > 12 && document.activeElement === $('roomSearch')){ $('roomSearch').blur(); y0 = null; } }, {passive: true});
})();
/** the name with the searched letters highlighted */
function hlName(text, q){
  var span = el('span'); text = String(text || '');
  var i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0){ span.textContent = text; return span; }
  span.appendChild(document.createTextNode(text.slice(0, i))); span.appendChild(el('mark', 'hl', text.slice(i, i + q.length))); span.appendChild(document.createTextNode(text.slice(i + q.length)));
  return span;
}
/** hint before typing, "Chats" heading, empty state — after the rooms or the people results change */
function srchRender(){
  var q = srchQ(), on = SR.on;
  $('searchClear').hidden = !q;
  var hint = $('srchHint'); hint.hidden = !(on && !q); if (!hint.hidden) hint.textContent = S(CHAT.uid ? 'search.hint' : 'search.hintGuest');
  var nRooms = on && q ? $('rooms').querySelectorAll('li:not(.pill)').length : 0;
  $('srchChats').hidden = !(on && q && nRooms);
  var ppl = backend.peopleSearch ? backend.peopleSearch() : {pending: false, count: 0};
  var empty = $('srchEmpty'), none = on && q && !nRooms && !ppl.pending && !ppl.count;
  if (none){
    empty.textContent = '';
    var ic = el('span', 'srch-ic'); ic.appendChild(svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M8.5 8.5l5 5M13.5 8.5l-5 5"/>')); empty.appendChild(ic);
    empty.appendChild(el('b', null, S('search.none', {q: q})));
    empty.appendChild(el('span', null, CHAT.uid && q.length < 2 ? S('search.morePeople') : S('search.noneHint')));
  }
  empty.hidden = !none;
}

/* ---------- Room list (keyed; the selection pill glides between rooms) ---------- */
function renderRooms(){
  var q = $('roomSearch').value.trim().toLowerCase(), ul = $('rooms');
  var list = rooms().filter(function(r){
    if (q && r.title.toLowerCase().indexOf(q) < 0) return false;
    if (SR.on && q) return true;   // searching: all rooms (the tabs are hidden)
    if (UI.filter === 'live') return r.lounge || (r.match && r.match.status === 'live');
    if (UI.filter === 'upcoming') return r.lounge || (r.match && r.match.status === 'upcoming');
    return true; });
  // the priority chats stay on top — the partner (team) chat, then the community lounge; below them the newest activity
  // first: the chat you just wrote / forwarded in (or that just got a message) goes up. Chats without messages keep their
  // order at the end; reactions don't move a chat.
  var rank = function(r){ return r.agent ? 0 : r.lounge ? 1 : 2; };
  list = list.map(function(r, i){ return {r: r, i: i, k: rank(r), t: roomLastTs(r)}; }).sort(function(a, b){ return (a.k - b.k) || (b.t - a.t) || (a.i - b.i); }).map(function(x){ return x.r; });
  // rows that change place glide there (FLIP) instead of jumping
  var before = {}; if (!REDUCE) UI.roomEls.forEach(function(li, id){ if (li.isConnected) before[id] = li.offsetTop; });
  var keep = new Set([$('roomPill')]);
  list.forEach(function(r, i){
    var li = UI.roomEls.get(r.id);
    if (!li){ li = el('li'); var b = el('button', 'room'); b.type = 'button'; b.onclick = function(){ openRoom(r.id); }; li.appendChild(b); UI.roomEls.set(r.id, li); }
    keep.add(li); fillRoom(li.firstChild, r);
    if (ul.children[i + 1] !== li) ul.insertBefore(li, ul.children[i + 1] || null);
  });
  Array.prototype.slice.call(ul.children).forEach(function(c){ if (!keep.has(c)) c.remove(); });
  if (!REDUCE) list.forEach(function(r){ var li = UI.roomEls.get(r.id), was = before[r.id]; if (li == null || was == null) return; var dy = was - li.offsetTop; if (Math.abs(dy) < 2) return;
    li.style.transition = 'none'; li.style.transform = 'translateY(' + dy + 'px)'; void li.offsetWidth; li.style.transition = 'transform .38s cubic-bezier(.2,.8,.2,1)'; li.style.transform = '';
    clearTimeout(li._flip); li._flip = setTimeout(function(){ li.style.transition = ''; }, 420); });
  placeRoomPill(); srchRender();
}
/** when a chat last had a message (0 = none yet) — the list's order */
function roomLastTs(r){
  var ms = roomMsgs(r.id), last = ms[ms.length - 1], t = last ? Number(last.ts) || 0 : 0;
  if (r.dm && r.uid && DM.threads[r.uid] && DM.threads[r.uid].lastTs) t = Math.max(t, Number(DM.threads[r.uid].lastTs) || 0);   // a team thread not loaded yet: its summary
  return t;
}
function placeRoomPill(){
  var li = UI.roomEls.get(CHAT.active), show = !!(li && li.isConnected && viewing() && window.innerWidth > 820);
  if (li && li.isConnected) roomPill.move(li.offsetTop, li.offsetTop + li.offsetHeight, show); else roomPill.move(0, 0, false);
}
function fillRoom(b, r){
  var msgs = roomMsgs(r.id), last = msgs[msgs.length - 1];
  var unread = msgs.filter(function(m){ return m.ts > (lastSeen[r.id] || 0) && m.by !== CHAT.uid; }).length;
  if (!last && r.dm && r.uid && DM.threads[r.uid] && DM.threads[r.uid].lastTs){ var th = DM.threads[r.uid]; last = {id:'t' + th.lastTs, text:String(th.lastText || (th.photo ? S('chat.photo') : th.voice ? S('chat.voice') : '')), ts:Number(th.lastTs), by:th.lastBy}; if (last.ts > (lastSeen[r.id] || 0) && last.by !== CHAT.uid) unread = 1; }
  var typ = typersIn(r.id), current = r.id === CHAT.active && viewing();
  var rev = typ.length ? null : lastReaction(msgs, last);   // a newer reaction than the last message: shown instead (no unread count)
  // our last message: its status, like WhatsApp (also for a team thread whose messages aren't loaded yet: its summary has the time)
  var myTick = !typ.length && !rev && last && last.by === CHAT.uid && last.ts ? tickState(r.id, last) : '';
  var sig = [rev ? [rev.by, rev.k, rev.at, rev.m.id].join(',') : '', myTick, r.title, SR.on ? srchQ() : '', !!r.pendingOut, r.group && [r.group.status, r.group.canRead, r.group.kind, r.group.gradient, r.group.photo, r.group.description].join(','), last && last.id, msgPreview(last), unread, typ.length, r.dm ? isOnline(r.uid) : online(r.id) > 0, r.dm && LIVE.profiles[r.uid] && (LIVE.profiles[r.uid].avatarUrl || LIVE.profiles[r.uid].gradient), r.match && [r.match.status, r.match.hs, r.match.as, r.match.kickoff], current, last && nameOf(last.by)].join('|');
  if (b._sig === sig) return; b._sig = sig;
  b.textContent = ''; if (current) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
  b.appendChild(roomAvatar(r, true));
  var main = el('div', 'r-main'), t = el('div', 'r-title'); t.appendChild(SR.on ? hlName(r.title, srchQ()) : el('span', null, r.title));
  if (r.agent) t.appendChild(el('span', 'r-tag', S('chat.partnerTag')));
  if (r.group && r.group.kind === 'channel') t.appendChild(el('span', 'r-tag', S('groups.channelTag')));
  if (r.match && r.match.status === 'live'){ t.appendChild(el('span', 'r-live', S('chat.liveTag'))); t.appendChild(el('span', 'r-score', (r.match.hs||0) + '–' + (r.match.as||0))); }
  main.appendChild(t);
  if (r.pendingOut){ main.appendChild(el('div', 'r-last', S('pm.waitingShort'))); b.appendChild(main); return; }
  if (r.group && (!r.group.canRead || r.group.status === 'invited')){ var gs = r.group.status;
    main.appendChild(el('div', 'r-last' + (gs === 'invited' ? ' typing' : ''), gs === 'invited' ? S('groups.invitedShort') : gs === 'requested' ? S('groups.requestedShort') : (r.group.description || S('groups.membersOnly')))); b.appendChild(main); return; }
  var prev = typ.length ? (typ.length === 1 ? S('chat.isTyping', {name: nameOf(peerId(typ[0]))}) : S('chat.peopleTyping', {n: typ.length}))
    : rev ? reactionLine(rev, r)
    : (!last && r.group) ? (r.group.description || S(r.group.members === 1 ? 'groups.sub1' : 'groups.sub', {kind: S('groups.kind.' + r.group.kind), n: r.group.members}))
    : last ? (last.by === CHAT.uid ? S('chat.lastByYou', {text: msgPreview(last)}) : (r.dm ? msgPreview(last) : S('chat.lastBy', {name: nameOf(last.by), text: msgPreview(last)}))) : r.dm ? (r.agent ? S('chat.agentHint') : S('chat.noMessages')) : (r.lounge ? S('chat.loungeHint') : (r.match.status === 'upcoming' ? S('chat.starts', {time: r.match.kickoff || S('chat.soon')}) : (r.match.league || S('chat.eventRoom'))));
  var lastEl = el('div', 'r-last' + (typ.length ? ' typing' : '') + (myTick ? ' has-tick' : ''), prev);
  if (myTick) lastEl.insertBefore(tickIcon(myTick, !!r.group), lastEl.firstChild);
  main.appendChild(lastEl); b.appendChild(main);
  var side = el('div', 'r-side'); side.appendChild(el('span', 'r-time', rev ? listTime(rev.at) : last ? listTime(last.ts) : ''));
  if (unread && !current) side.appendChild(el('span', 'unread', unread > 99 ? '99+' : String(unread)));
  b.appendChild(side);
  b.setAttribute('aria-label', unread ? S('chat.roomUnreadAria', {title: r.title, n: unread}) : r.title);
}

/* ---------- Header (updated in place, never rebuilt mid-view) ---------- */
function renderHeader(){
  var r = roomById(CHAT.active), on = r.dm && isOnline(r.uid);
  var key = r.id + '|' + r.title + '|' + on + '|' + (r.dm && LIVE.profiles[r.uid] ? (LIVE.profiles[r.uid].avatarUrl || LIVE.profiles[r.uid].gradient || '') : '') + '|' + (r.group ? (r.group.photo || r.group.gradient || '') : '');
  if (UI.hdrRoom !== key){ var swap = UI.hdrId !== undefined && UI.hdrId !== r.id; UI.hdrId = r.id;
    if (swap && !REDUCE) [ $('cAvatar'), document.querySelector('.c-head .c-title') ].forEach(function(e){ if (!e) return; e.classList.remove('hdr-in'); void e.offsetWidth; e.classList.add('hdr-in'); });   // another room: name and picture slide in
    var av = $('cAvatar'); av.textContent = ''; av.appendChild(roomAvatar(r, true)); $('cTitle').textContent = r.title; UI.hdrRoom = key; }
  // tap the room's name / picture: group info (anyone who can see the group) or the person's card (private chat)
  var info = r.group ? function(){ backend.groupInfo(r.group.id, roomAvatar(r, false), {left: function(){ goChat('', {replace: true}); }}); } : r.pm ? function(){ backend.openPerson(r.uid); } : null;
  [document.querySelector('.c-head .c-title'), $('cAvatar')].forEach(function(e){ if (!e) return; e.onclick = info; e.classList.toggle('tappable', !!info);
    if (info){ e.setAttribute('role', 'button'); e.tabIndex = 0; e.setAttribute('aria-label', r.group ? S('gi.infoAria', {name: r.title}) : r.title); e.onkeydown = function(ev){ if (ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); info(); } }; }
    else { e.removeAttribute('role'); e.removeAttribute('tabindex'); e.removeAttribute('aria-label'); e.onkeydown = null; } });
  var mg = $('cManage'); if (mg){ mg.hidden = !(r.group && r.group.isAdmin); mg.onclick = function(){ backend.manageRoom(r.group.id); }; }
  var lv = $('cLeave'); if (lv){ lv.hidden = !(r.group && r.group.status === 'member' && !CHAT.canEdit && !r.group.isOwner); lv.onclick = function(){ askConfirm(S('groups.leaveConfirm', {name: r.group.name}), S('groups.leave'), true).then(function(y){ if (y) backend.groupLeave(r.group.id).then(function(){ toast(S('groups.left', {name: r.group.name}), true); goChat('', {replace: true}); }, function(e){ toast(e.message); }); }); }; }
  var pin = $('pinned'); if (pin){ if (!pin._orig) pin._orig = pin.lastElementChild.innerHTML; var txt = pin.lastElementChild, rules = r.group && r.group.rules;
    if (rules){ if (pin._room !== r.id){ txt.textContent = ''; txt.appendChild(el('b', null, S('groups.rulesTitle'))); txt.appendChild(document.createTextNode(' · ' + rules)); pin._room = r.id; } }
    else if (pin._room){ txt.innerHTML = pin._orig; pin._room = null; } }
  var blk = $('cBlock'); if (blk){ blk.hidden = !(r.pm && PM.rels[r.uid] && PM.rels[r.uid].status === 'accepted'); blk.onclick = function(){ askConfirm(S('pm.blockConfirm', {name: nameOf(r.uid)}), S('pm.block'), true).then(function(y){ if (y) backend.pmRespond(r.uid, 'block'); }); }; }
  var sub = $('cSub'), typ = typersIn(CHAT.active), text = '', cls = '', dot = false;
  if (typ.length){ cls = 'typing'; text = r.dm ? S('chat.typingShort') : (typ.length === 1 ? S('chat.isTyping', {name: nameOf(peerId(typ[0]))}) : S('chat.peopleAreTyping', {n: typ.length})); }
  else if (r.pendingOut){ text = S('pm.waitingShort'); }
  else if (r.group){ text = S(r.group.members === 1 ? 'groups.sub1' : 'groups.sub', {kind: S('groups.kind.' + r.group.kind), n: r.group.members}); }
  else if (r.dm){
    if (on){ cls = 'on'; text = S('chat.online'); }
    else { text = seenText(lastSeenOf(r.uid)) || (r.agent ? S('chat.agentSub') : S('chat.offline')); }
  } else {
    var here = viewers().filter(function(p){ return !p.isMe && p.presence && p.presence.room === CHAT.active; });
    var ids = here.map(peerId).filter(function(x, i, a){ return x && x !== CHAT.uid && a.indexOf(x) === i; });   // my other tabs aren't 'others'
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
/* ---------- Picture viewer ----------
   Opens from the picture in the bubble: a frame grows from the bubble's exact spot and size to full screen (the crop of the
   bubble opens up into the whole picture) while the background darkens; closing (tap, ✕, Escape, drag down) shrinks it back
   into the bubble. The bubble's copy is hidden meanwhile so it reads as one picture moving. Reduced motion: instant. */
var LB = null;
function lbFit(w, h){
  var vw = window.innerWidth, vh = window.innerHeight, pad = vw < 700 ? 0 : 40, s = Math.min((vw - pad * 2) / w, (vh - pad * 2) / h);
  var W = Math.round(w * s), H = Math.round(h * s);
  return {x: Math.round((vw - W) / 2), y: Math.round((vh - H) / 2), w: W, h: H};
}
function lbPlace(r, radius){ var f = LB._frame; f.style.left = r.x + 'px'; f.style.top = r.y + 'px'; f.style.width = r.w + 'px'; f.style.height = r.h + 'px'; f.style.borderRadius = radius; }
function lbRectOf(elm){ var r = elm.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; }
function lbVisible(elm){ if (!elm || !elm.isConnected) return false; var r = elm.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth; }
/* ---------- Chat media: pictures and voice messages, downloaded on demand and kept in the browser's cache ----------
   Pictures arrive as a tiny blurred preview (inside the message) + a download button with the size; the file is fetched
   once (only when asked, or automatically for our own), stored in Cache Storage ('oc-media-v1') and shown from a local
   blob URL — next time (even after a reload) it appears at once, without the network. Voice messages load on first play. */
var MEDIA = {blobs:{}, loading:{}, cache:null, subs:{}, last:{}, ctl:{}};
/* sending a picture / voice note: {clientId: {k: 0..1, ctl, url (the local copy)}} */
var UPLOADS = {};
/* our own file just sent: the server's copy is the same file → use the local one (and keep it in the cache), no download */
function mediaAdopt(m, url){
  var u = m && m.clientId && UPLOADS[m.clientId], k = mediaKey(url);
  if (!u || !u.url || MEDIA.blobs[k] || /^blob:/.test(url)) return;
  MEDIA.blobs[k] = u.url;
  fetch(u.url).then(function(r){ return mediaStore().then(function(c){ if (c) return c.put(k, r); }); }).catch(function(){});
}
function uploadOf(m){ return m && CHAT.pending[m.id] && UPLOADS[m.id]; }
/* sending: the same filling ring as a download, ✕ inside = cancel the send; "45%" on a picture */
function paintUpload(row, m){
  var u = uploadOf(m), pct = u ? Math.round(u.k * 100) : 0;
  if (row._pic){
    row._pic.classList.toggle('is-uploading', !!(u && m.image));
    if (u && m.image){
      if (!row._up){ row._up = el('span', 'b-up'); row._up._r = progressRing(true); row._up.appendChild(row._up._r); row._up._t = el('span'); row._up.appendChild(row._up._t); row._pic.appendChild(row._up); }
      row._up._r.set(u.k); row._up._t.textContent = pct + '%'; row._pic.classList.toggle('up-done', u.k >= 1); row._pic.setAttribute('aria-label', S('media.uploading', {n: pct}));
    }
  }
  if (row._voice){
    var v = row._voice; v.classList.toggle('uploading', !!(u && m.voice));
    if (u && m.voice){ if (!v._ring){ v._ring = progressRing(false); v._btn.appendChild(v._ring); } v._ring.set(u.k); v._btn.setAttribute('aria-label', S('media.uploading', {n: pct})); }
  }
}
function uploadProgress(clientId, sent, total){
  var u = UPLOADS[clientId]; if (!u) return; u.k = total ? Math.min(1, sent / total) : 0;
  var row = UI.rows.get(clientId); if (row && row._m) paintUpload(row, row._m);
}
function uploadCancel(m){ var u = uploadOf(m); if (!u) return false; if (u.k >= 1) return true; u.cancelled = true; if (u.ctl.abort) u.ctl.abort(); return true; }   // fully sent: only the server's answer is left, too late to cancel (it would come back)
function mediaStore(){ if (!MEDIA.cache) MEDIA.cache = (window.caches && window.isSecureContext) ? caches.open('oc-media-v1').catch(function(){ return null; }) : Promise.resolve(null); return MEDIA.cache; }
function mediaKey(url){ try { return new URL(url, location.href).href; } catch(e){ return url; } }
/** the object URL if this file is already on the device (memory or cache), else null — never uses the network */
function mediaCached(url){
  var k = mediaKey(url); if (MEDIA.blobs[k]) return Promise.resolve(MEDIA.blobs[k]);
  return mediaStore().then(function(c){ return c ? c.match(k) : null; }).then(function(r){ return r ? r.blob() : null; })
    .then(function(b){ return b ? (MEDIA.blobs[k] = MEDIA.blobs[k] || URL.createObjectURL(b)) : null; }).catch(function(){ return null; });
}
/** download once (shared by everyone asking at the same time), keep it in the cache, give an object URL */
/* Download a picture / voice note once (then it lives in the cache). onProg(loaded, total) follows the real bytes as they
   arrive — the ring on the download button fills with them. sizeHint: the size we already know, when the server sends none. */
function mediaFetch(url, onProg, sizeHint){
  var k = mediaKey(url); if (MEDIA.blobs[k]) return Promise.resolve(MEDIA.blobs[k]);
  if (onProg){ (MEDIA.subs[k] = MEDIA.subs[k] || []).push(onProg); if (MEDIA.last[k]) onProg(MEDIA.last[k][0], MEDIA.last[k][1]); }
  if (MEDIA.loading[k]) return MEDIA.loading[k];
  var ctl = window.AbortController ? new AbortController() : null; MEDIA.ctl[k] = ctl;
  var emit = function(a, b){ MEDIA.last[k] = [a, b]; (MEDIA.subs[k] || []).forEach(function(f){ try { f(a, b); } catch (e) {} }); };
  var p = mediaCached(k).then(function(u){ if (u) return u;
    return fetch(k, {credentials:'same-origin', signal: ctl ? ctl.signal : undefined}).then(function(r){
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var type = r.headers.get('content-type') || '', total = Number(r.headers.get('content-length')) || Number(sizeHint) || 0;
      var rd = r.body && r.body.getReader ? r.body.getReader() : null;
      emit(0, total);
      if (!rd){ var copy = r.clone(); mediaStore().then(function(c){ if (c) c.put(k, copy).catch(function(){}); }); return r.blob(); }
      var parts = [], got = 0;
      return (function pump(){ return rd.read().then(function(x){ if (x.done) return; parts.push(x.value); got += x.value.length; emit(got, Math.max(total, got)); return pump(); }); })()
        .then(function(){ var b = new Blob(parts, {type: type}); mediaStore().then(function(c){ if (c) c.put(k, new Response(b, {headers: {'content-type': type}})).catch(function(){}); }); return b; });
    }).then(function(b){ return (MEDIA.blobs[k] = URL.createObjectURL(b)); }); });
  MEDIA.loading[k] = p;
  var done = function(){ delete MEDIA.loading[k]; delete MEDIA.subs[k]; delete MEDIA.last[k]; delete MEDIA.ctl[k]; };
  p.then(done, done);
  return p;
}
function mediaAbort(url){ var c = MEDIA.ctl[mediaKey(url)]; if (c) c.abort(); }
/* A progress ring (fills clockwise from the top) — on the picture's download button and around the voice play button. */
var RING_C = 2 * Math.PI * 10;
function progressRing(withX){
  var r = svg('<circle class="pr-track" cx="12" cy="12" r="10"/><circle class="pr-fill" cx="12" cy="12" r="10"/>' + (withX ? '<path class="pr-x" d="M9 9l6 6M15 9l-6 6"/>' : ''));
  r.classList.add('pr-ring'); var f = r.querySelector('.pr-fill'); f.style.strokeDasharray = RING_C; f.style.strokeDashoffset = RING_C;
  r.set = function(k){ f.style.strokeDashoffset = RING_C * (1 - Math.max(0, Math.min(1, k || 0))); };
  return r;
}
function fmtBytes(n){ n = Number(n) || 0; return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
function fmtDur(s){ s = Math.max(0, Math.round(Number(s) || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
/** keep a picture or voice note on the device: the share sheet on phones (→ "Save image"), a download elsewhere */
function mediaSave(objUrl, name){
  fetch(objUrl).then(function(r){ return r.blob(); }).then(function(b){
    var file = new File([b], name, {type: b.type || 'application/octet-stream'});
    var touch = window.matchMedia && window.matchMedia('(pointer:coarse)').matches;
    if (touch && navigator.canShare && navigator.canShare({files:[file]})) return navigator.share({files:[file]}).catch(function(){});
    var a = document.createElement('a'); a.href = objUrl; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }).catch(function(){ toast(S('media.saveFailed')); });
}

/* A picture bubble: shown at once when it is ours, already on this device, or a local (just picked) file; otherwise the tiny
   blurred preview + "⬇ 240 KB" until someone taps it. */
function picShow(row, m, url){ if (row._m !== m) return; row._picUrl = url; if (row._picImg.getAttribute('src') !== url) row._picImg.src = url; row._pic.classList.remove('is-thumb', 'is-loading'); row._pic.setAttribute('aria-label', S('chat.viewImage')); }
function picIdle(row, im){   // the "⬇ 240 KB" button
  row._pic.classList.remove('is-loading');
  row._picDl.textContent = ''; row._picDl.appendChild(svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>')); if (im.size) row._picDl.appendChild(el('span', null, fmtBytes(im.size)));
  row._pic.setAttribute('aria-label', S('media.downloadPhoto', {size: im.size ? fmtBytes(im.size) : ''}));
}
function picDownload(row, m){
  var im = m.image;
  if (row._pic.classList.contains('is-loading')){ row._picCancelled = true; mediaAbort(im.url); return; }   // tap again: cancel (like WhatsApp)
  row._picCancelled = false; row._pic.classList.add('is-loading');
  var ring = progressRing(true), txt = el('span', null, im.size ? '0 / ' + fmtBytes(im.size) : '0%');
  row._picDl.textContent = ''; row._picDl.appendChild(ring); row._picDl.appendChild(txt);
  var lastPct = -1;
  mediaFetch(im.url, function(got, total){
    if (row._m !== m) return; var k = total ? got / total : 0; ring.set(k);
    txt.textContent = total ? fmtBytes(got) + ' / ' + fmtBytes(total) : fmtBytes(got);
    var pct = Math.round(k * 100); if (pct !== lastPct && pct % 10 === 0){ lastPct = pct; row._pic.setAttribute('aria-label', S('media.downloading', {n: pct})); }
  }, im.size).then(function(u){ if (row._m === m){ ring.set(1); picShow(row, m, u); } }, function(){
    if (row._m !== m) return; var cancelled = row._picCancelled; row._picCancelled = false; picIdle(row, im);
    if (!cancelled) toast(S('media.loadFailed'));
  });
}
function paintPic(row, m, mine){
  var im = m.image, iw = Number(im.w) || 4, ih = Number(im.h) || 3;
  row._pic.style.aspectRatio = iw + ' / ' + ih;
  if (row._picFor === im.url) return; row._picFor = im.url;
  row._picUrl = null; row._pic.classList.remove('is-loading');
  if (!/^blob:/.test(im.url) && MEDIA.loading[mediaKey(im.url)] && !MEDIA.blobs[mediaKey(im.url)]){ row._pic.classList.add('is-thumb'); row._picImg.src = im.thumb || 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; picDownload(row, m); return; }   // redrawn mid-download: keep showing its progress
  if (/^blob:/.test(im.url)){ picShow(row, m, im.url); return; }                     // just sent from this device
  var k = mediaKey(im.url);
  if (MEDIA.blobs[k]){ picShow(row, m, MEDIA.blobs[k]); return; }
  row._pic.classList.add('is-thumb'); row._picImg.src = im.thumb || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  picIdle(row, im);
  mediaCached(im.url).then(function(u){ if (u) picShow(row, m, u); else if (mine) picDownload(row, m); });   // in the cache already? ours? → no button
}
function paintVoice(row, m){
  var v = row._voice, pk = (m.voice.peaks && m.voice.peaks.length ? m.voice.peaks : Array.apply(null, Array(32)).map(function(_, i){ return 30 + 25 * Math.abs(Math.sin(i * 1.7)); }));
  if (v._for !== m.voice.url){ v._for = m.voice.url; v._wave.textContent = ''; v._bars = pk.map(function(h){ var b = el('i'); b.style.height = Math.max(12, Math.min(100, h)) + '%'; v._wave.appendChild(b); return b; });
    // like a picture: not on this device yet → a download button with its size; tapping it shows the progress, then plays
    var url = m.voice.url, k = mediaKey(url), mine = m.by === CHAT.uid;
    voiceNeedDl(row, !(/^blob:/.test(url) || MEDIA.blobs[k] || mine));
    if (!/^blob:/.test(url) && !MEDIA.blobs[k] && !mine) mediaCached(url).then(function(u){ if (u && row._m === m) voiceNeedDl(row, false); });
    if (MEDIA.loading[k] && !MEDIA.blobs[k] && VOICE.loadingRow !== row) voiceDownloadUI(row, m);   // redrawn mid-download
  }
  voiceUI(row);
}

/* Voice player: one at a time. Bars fill as it plays; tap the bars to jump. */
var VOICE = {audio:null, row:null, raf:0};
function voiceUI(row){
  var v = row._voice, m = row._m, dur = (m && m.voice && m.voice.dur) || 0, a = VOICE.audio, mine = VOICE.row === row && a;
  var t = mine ? a.currentTime : 0, k = dur ? Math.min(1, t / dur) : 0;
  v.classList.toggle('playing', !!(mine && !a.paused));
  if (!v.classList.contains('loading')) v._btn.setAttribute('aria-label', mine && !a.paused ? S('voice.pause') : v.classList.contains('need-dl') ? S('media.downloadVoice', {size: m && m.voice && m.voice.size ? fmtBytes(m.voice.size) : ''}) : S('voice.play'));
  v._bars.forEach(function(b, i){ b.classList.toggle('on', (i + 0.5) / v._bars.length <= k); });
  v._time.textContent = fmtDur(mine && (t > 0 || !a.paused) ? t : dur);
}
function voiceNeedDl(row, need){
  var v = row._voice, m = row._m; v.classList.toggle('need-dl', !!need);
  v._size.textContent = need && m && m.voice && m.voice.size ? ' · ' + fmtBytes(m.voice.size) : '';
}
/* the ring around the button fills with the bytes; the button shows ✕ (tap = cancel) */
function voiceDownloadUI(row, m){
  var v = row._voice; v.classList.add('loading');
  if (!v._ring){ v._ring = progressRing(false); v._btn.appendChild(v._ring); } v._ring.set(0);
  v._btn.setAttribute('aria-label', S('media.downloading', {n: 0}));
  var lastPct = 0;
  return mediaFetch(m.voice.url, function(got, total){ if (row._m !== m) return; var k = total ? got / total : 0, pct = Math.floor(k * 10) * 10; v._ring.set(k); v._size.textContent = ' · ' + fmtBytes(got) + ' / ' + fmtBytes(total || got); if (pct !== lastPct){ lastPct = pct; v._btn.setAttribute('aria-label', S('media.downloading', {n: pct})); } }, m.voice.size);
}
/* like WhatsApp: when a voice message ends and the very next message is a voice message too, it plays next */
function nextVoiceRow(row){
  var m = row._m; if (!m) return null;
  var msgs = roomMsgs(CHAT.active), i = msgs.findIndex(function(x){ return x.id === m.id; }), n = i >= 0 ? msgs[i + 1] : null;
  if (!n || !n.voice || n.locked || n.expired || CHAT.pending[n.id]) return null;
  return UI.rows.get(n.id) || null;
}
function voiceStop(){ var r = VOICE.row; VOICE.chain = null; if (VOICE.audio){ VOICE.audio.pause(); } cancelAnimationFrame(VOICE.raf); VOICE.row = null; if (r && r._voice) voiceUI(r); }
function voiceToggle(row, seekK){
  var m = row._m; if (!m || !m.voice) return;
  if (VOICE.row === row && VOICE.audio){ if (seekK != null){ VOICE.audio.currentTime = seekK * (m.voice.dur || VOICE.audio.duration || 0); voiceUI(row); return; } if (VOICE.audio.paused) VOICE.audio.play().catch(function(){}); else VOICE.audio.pause(); voiceUI(row); return; }
  var v = row._voice;
  if (uploadCancel(m)) return;                                                                   // sending: ✕ cancels it
  if (v.classList.contains('loading')){ v._cancelled = true; mediaAbort(m.voice.url); return; }   // tap during the download: cancel
  voiceStop(); v._cancelled = false; VOICE.loadingRow = row;
  (m.voice.url.indexOf('blob:') === 0 ? Promise.resolve(m.voice.url) : voiceDownloadUI(row, m)).then(function(u){
    if (VOICE.loadingRow === row) VOICE.loadingRow = null;
    if (v._ring) v._ring.set(1); v.classList.remove('loading'); voiceNeedDl(row, false); if (row._m !== m) return;
    if (!VOICE.audio){ VOICE.audio = new Audio(); VOICE.audio.preload = 'auto'; VOICE.audio.addEventListener('ended', function(){ var r = VOICE.row; cancelAnimationFrame(VOICE.raf); if (r){ VOICE.audio.currentTime = 0; VOICE.row = null; voiceUI(r); var nx = nextVoiceRow(r); if (nx){ VOICE.chain = nx; setTimeout(function(){ if (VOICE.chain !== nx || VOICE.row) return; VOICE.chain = null; nx.scrollIntoView({block: 'nearest', behavior: REDUCE ? 'auto' : 'smooth'}); voiceToggle(nx); }, 380); } } }); VOICE.audio.addEventListener('pause', function(){ if (VOICE.row) voiceUI(VOICE.row); }); }
    VOICE.row = row; VOICE.audio.src = u;
    VOICE.audio.addEventListener('loadedmetadata', function once(){ VOICE.audio.removeEventListener('loadedmetadata', once); if (seekK != null) VOICE.audio.currentTime = seekK * (m.voice.dur || VOICE.audio.duration || 0); }, {once:true});
    VOICE.audio.play().then(function(){ (function loop(){ if (VOICE.row !== row) return; voiceUI(row); VOICE.raf = requestAnimationFrame(loop); })(); }, function(){ toast(S('voice.cantPlay')); VOICE.row = null; voiceUI(row); });
  }, function(){
    if (VOICE.loadingRow === row) VOICE.loadingRow = null;
    v.classList.remove('loading'); voiceNeedDl(row, v.classList.contains('need-dl')); voiceUI(row);
    if (!v._cancelled) toast(S('media.loadFailed')); v._cancelled = false;
  });
}

function openLightbox(url, thumb, w, h, nosave){
  if (!LB){
    LB = el('div', 'lightbox'); LB.setAttribute('role', 'dialog'); LB.setAttribute('aria-modal', 'true'); LB.setAttribute('aria-label', S('chat.viewImage'));
    LB.appendChild(el('div', 'lb-bg'));
    var fr = el('div', 'lb-frame'), im = document.createElement('img'); im.alt = ''; im.draggable = false; fr.appendChild(im); LB.appendChild(fr); LB._frame = fr; LB._img = im;
    var x = el('button', 'iconbtn lb-close'); x.type = 'button'; x.setAttribute('aria-label', S('chat.closeImage')); x.appendChild(svg('<path d="M6 6l12 12M18 6L6 18"/>')); LB.appendChild(x);
    // keep the picture on the device
    var sv = el('button', 'lb-save'); sv.type = 'button'; sv.appendChild(svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>')); sv.appendChild(el('span', null, S('media.save'))); LB.appendChild(sv);
    LB.addEventListener('contextmenu', function(e){ if (LB.classList.contains('nosave')) e.preventDefault(); });
    sv.addEventListener('click', function(e){ e.stopPropagation(); if (LB._url && !LB.classList.contains('nosave')) mediaSave(LB._url, 'oddsclub-photo-' + new Date().toISOString().slice(0, 10) + '.webp'); });
    x.addEventListener('click', function(e){ e.stopPropagation(); closeLightbox(); });
    LB.addEventListener('click', function(){ if (!LB._dragged) closeLightbox(); LB._dragged = false; });
    document.body.appendChild(LB); if (typeof paintFont === 'function') paintFont(LB);
    window.addEventListener('keydown', function(e){ if (e.key === 'Escape' && LB.classList.contains('open')){ e.stopImmediatePropagation(); closeLightbox(); } }, true);   // window: before any sheet underneath (room settings, group info…)
    window.addEventListener('resize', function(){ if (LB.classList.contains('show') && !LB._closing){ LB._frame.style.transition = 'none'; lbPlace(lbFit(LB._w, LB._h), '0px'); } });
    // drag down (or up) to close
    var sy = 0, dy = 0, dragging = false;
    fr.addEventListener('pointerdown', function(e){ if (LB._closing) return; dragging = true; sy = e.clientY; dy = 0; fr.setPointerCapture(e.pointerId); fr.style.transition = 'none'; });
    fr.addEventListener('pointermove', function(e){ if (!dragging) return; dy = e.clientY - sy; if (Math.abs(dy) > 4) LB._dragged = true;
      fr.style.transform = 'translateY(' + dy + 'px) scale(' + (1 - Math.min(Math.abs(dy) / 1600, .18)) + ')'; LB.style.setProperty('--lb-bg', String(1 - Math.min(Math.abs(dy) / 420, .85))); });
    var end = function(){ if (!dragging) return; dragging = false;
      if (Math.abs(dy) > 110){ var cur = lbRectOf(fr); fr.style.transform = ''; lbPlace(cur, '12px'); void fr.offsetWidth; closeLightbox(); }
      else { fr.style.transition = 'transform .32s cubic-bezier(.2,.9,.3,1.2)'; fr.style.transform = ''; LB.style.removeProperty('--lb-bg'); } };
    fr.addEventListener('pointerup', end); fr.addEventListener('pointercancel', end);
  }
  var fr = LB._frame, start = thumb && lbVisible(thumb) ? lbRectOf(thumb) : null;
  LB._thumb = thumb || null; LB._w = w || (thumb && thumb.naturalWidth) || 4; LB._h = h || (thumb && thumb.naturalHeight) || 3; LB._closing = false; LB._dragged = false;
  LB._radius = thumb ? getComputedStyle(thumb.parentNode).borderRadius || '12px' : '12px';
  LB._img.src = url; LB._url = url; LB.classList.toggle('nosave', !!nosave); LB.style.removeProperty('--lb-bg'); fr.style.transform = ''; fr.style.opacity = '';
  var target = lbFit(LB._w, LB._h);
  fr.style.transition = 'none';
  if (start && !REDUCE){ lbPlace(start, LB._radius); } else { lbPlace(target, '0px'); }   // full size: square corners (they round off only while it travels to/from the bubble)
  LB.classList.add('open'); if (thumb) thumb.style.visibility = 'hidden';
  void fr.offsetWidth;   // apply the start position before animating
  LB.classList.add('show');
  if (start && !REDUCE){ fr.style.transition = 'left .46s cubic-bezier(.2,.85,.25,1), top .46s cubic-bezier(.2,.85,.25,1), width .46s cubic-bezier(.2,.85,.25,1), height .46s cubic-bezier(.2,.85,.25,1), border-radius .46s'; lbPlace(target, '0px'); }
  setTimeout(function(){ LB.querySelector('.lb-close').focus({preventScroll:true}); }, 60);
}
function closeLightbox(){
  if (!LB || !LB.classList.contains('open') || LB._closing) return;
  LB._closing = true;
  var fr = LB._frame, thumb = LB._thumb, back = thumb && lbVisible(thumb) && !REDUCE;
  var finish = function(){ LB.classList.remove('open'); LB._closing = false; fr.style.transition = 'none'; fr.style.transform = ''; fr.style.opacity = ''; LB.style.removeProperty('--lb-bg'); if (thumb) thumb.style.visibility = ''; };
  LB.classList.remove('show'); LB.style.removeProperty('--lb-bg');
  if (REDUCE){ finish(); return; }
  var ease = 'cubic-bezier(.4,0,.2,1)';
  if (back){
    // back into the bubble (re-measured: the chat may have scrolled)
    if (thumb) thumb.style.visibility = 'hidden';
    fr.style.transition = ['left', 'top', 'width', 'height', 'border-radius', 'transform'].map(function(p){ return p + ' .38s ' + ease; }).join(', ');
    fr.style.transform = ''; lbPlace(lbRectOf(thumb), LB._radius);
  } else {
    fr.style.transition = 'transform .28s ' + ease + ', opacity .28s ' + ease; fr.style.transform = 'scale(.92)'; fr.style.opacity = '0';
  }
  setTimeout(finish, back ? 400 : 300);
}
/* ---------- Conversation ---------- */
function buildRow(m){
  var row = el('div', 'row'); row.dataset.id = m.id;
  var av = el('div', 'av'), img = document.createElement('img'); img.alt = ''; av.appendChild(img); row._av = av; row._img = img;
  var bw = el('div', 'bwrap'), b = el('div', 'bubble'); b.tabIndex = 0;
  var sw = el('span', 'swipe-ic'); sw.appendChild(svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v3"/>')); b.appendChild(sw);
  row._name = el('div', 'b-name'); row._fwd = el('div', 'b-fwd'); row._fwd.hidden = true; row._fwd.appendChild(svg('<path d="M14 5l7 7-7 7"/><path d="M21 12H9a6 6 0 0 0-6 6v1"/>')); row._fwd.appendChild(el('span', null, S('fwd.label'))); row._quote = el('div', 'b-quote'); row._text = el('div', 'b-text'); row._meta = el('span', 'b-meta');
  row._pic = el('button', 'b-pic'); row._pic.type = 'button'; row._pic.setAttribute('aria-label', S('chat.viewImage')); row._picImg = document.createElement('img'); row._picImg.alt = ''; row._picImg.loading = 'lazy'; row._pic.appendChild(row._picImg);
  row._picDl = el('span', 'b-pic-dl'); row._pic.appendChild(row._picDl);
  row._pic.addEventListener('click', function(e){ e.stopPropagation(); var m = row._m; if (!m || !m.image) return;
    if (uploadCancel(m)) return;                                                                // sending: ✕ cancels it
    if (row._pic.classList.contains('is-thumb')) picDownload(row, m);                       // preview: download it (once)
    else if (row._picUrl) openLightbox(row._picUrl, row._picImg, m.image.w, m.image.h, !!m.nosave); });   // downloaded: full screen
  // voice message: play / pause · waveform (tap to jump) · time
  row._voice = el('div', 'b-voice'); row._voice.hidden = true;
  var vb = el('button', 'v-play'); vb.type = 'button'; vb.appendChild(svg('<path class="i-play" d="M8 5.5v13l10.5-6.5z"/><path class="i-pause" d="M8 5v14M16 5v14"/><path class="i-dl" d="M12 5v10M8 11l4 4 4-4M7 19h10"/><path class="i-x" d="M8.5 8.5l7 7M15.5 8.5l-7 7"/>')); row._voice.appendChild(vb); row._voice._btn = vb;
  var vw = el('div', 'v-wave'); row._voice.appendChild(vw); row._voice._wave = vw; row._voice._bars = [];
  var vf = el('div', 'v-foot'); row._voice.appendChild(vf); row._voice._foot = vf;
  row._voice._time = el('span', 'v-time'); vf.appendChild(row._voice._time);
  row._voice._size = el('span', 'v-size'); vf.appendChild(row._voice._size);   // "· 12 KB" until it is on this device
  vb.addEventListener('click', function(e){ e.stopPropagation(); voiceToggle(row); });
  vw.addEventListener('click', function(e){ e.stopPropagation(); var r = vw.getBoundingClientRect(); voiceToggle(row, Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))); });
  row._gone = el('div', 'b-gone'); row._gone.hidden = true;   // "Photo expired" / "Voice message expired"
  [row._name, row._fwd, row._quote, row._pic, row._voice, row._gone, row._text].forEach(function(x){ b.appendChild(x); });
  row._reacts = el('div', 'reacts');
  var acts = el('div', 'acts glass'); acts.setAttribute('role', 'toolbar'); acts.setAttribute('aria-label', S('chat.actionsAria'));
  REACTS.forEach(function(rx){ var bt = el('button', 'emo', rx[1]); bt.type = 'button'; bt.setAttribute('aria-label', S('chat.reactAria', {name: S('react.' + rx[0])})); bt.onclick = function(e){ e.stopPropagation(); toggleReact(row._m, rx[0]); }; acts.appendChild(bt); });
  acts.appendChild(el('span', 'sep'));
  var rp = el('button'); rp.type = 'button'; rp.setAttribute('aria-label', S('chat.reply')); rp.appendChild(svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v3"/>')); rp.onclick = function(e){ e.stopPropagation(); startReply(row._m); }; acts.appendChild(rp);
  var mo = el('button'); mo.type = 'button'; mo.setAttribute('aria-label', S('chat.moreActions')); mo.appendChild(svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>')); mo.onclick = function(e){ e.stopPropagation(); openCtx(row); }; acts.appendChild(mo);
  row._acts = acts; bw.appendChild(acts); bw.appendChild(b); bw.appendChild(row._reacts);
  row.appendChild(av); row.appendChild(bw); row._bubble = b;
  b.addEventListener('contextmenu', function(e){ e.preventDefault(); openCtx(row); });
  b.addEventListener('dblclick', function(){ startReply(row._m); });
  b.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openCtx(row); } });
  row._quote.addEventListener('click', function(e){ e.stopPropagation(); var q = row._m.reply; if (!q) return; var t = UI.rows.get(q.id); if (!t){ toast(S('chat.quoteGone')); return; }
    t.scrollIntoView({block:'center', behavior: REDUCE ? 'auto' : 'smooth'}); t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash'); });
  // touch: press-and-hold opens the menu, swipe right replies (spring back)
  var sx = 0, sy = 0, drag = false, swiping = false, holdTimer = 0, sp = Spring(0, .42, .72, .3).on(function(v){ b.style.translate = Math.abs(v) < .3 ? '' : v.toFixed(1) + 'px 0'; var av = Math.abs(v); sw.classList.toggle('from-right', v < 0); sw.style.opacity = Math.min(1, av / 50); sw.style.transform = 'scale(' + (0.5 + Math.min(.5, av / 100)) + ')'; });
  /* swipe to reply, either way (right like WhatsApp, left like Telegram): finger, mouse drag (not from the message's buttons,
     picture or voice player) and the two-finger trackpad swipe (wheel events) */
  var mouse = false, dir = 1, held = false;
  b.addEventListener('pointerdown', function(e){
    mouse = e.pointerType === 'mouse'; held = false;
    if (mouse && (e.button !== 0 || (e.target.closest && e.target.closest('button, a, .v-wave, .b-pic')))) return;
    sx = e.clientX; sy = e.clientY; drag = true; swiping = false;
    if (mouse) return;   // a mouse opens the menu with right-click / "⋯", not by holding
    b.classList.add('pressing');
    holdTimer = setTimeout(function(){ if (drag && !swiping){ drag = false; b.classList.remove('pressing'); if (navigator.vibrate) try { navigator.vibrate(8); } catch(e2){} held = true; openCtx(row); } }, 420); });
  b.addEventListener('pointermove', function(e){ if (!drag) return; var dx = e.clientX - sx, dy = e.clientY - sy;
    if (!swiping && (Math.abs(dx) > 8 || Math.abs(dy) > 8)){ clearTimeout(holdTimer); b.classList.remove('pressing');
      if (Math.abs(dx) > Math.abs(dy)){ swiping = true; dir = dx > 0 ? 1 : -1; if (mouse){ try { b.setPointerCapture(e.pointerId); } catch(e3){} b.classList.add('swiping'); var sel = window.getSelection && window.getSelection(); if (sel) sel.removeAllRanges(); } }
      else { drag = false; return; } }
    if (swiping){ var x = Math.max(0, dx * dir); sp.set(dir * x * 0.7 / (1 + x / 260)); } });
  /* the finger that opened the menu by holding is lifted now: that lift is not a tap on the menu's background (on phones
     the tap the browser makes from it landed on the backdrop and closed the menu at once) */
  function lifted(){ if (held){ held = false; CTX.liftAt = Date.now(); } }
  b.addEventListener('touchend', function(e){ if (held){ lifted(); if (e.cancelable) e.preventDefault(); } });
  function end(e){ if (!e || e.type !== 'pointercancel') lifted(); /* Android cancels the pointer when its own long-press starts: the finger is still down */ clearTimeout(holdTimer); b.classList.remove('pressing', 'swiping'); if (!drag) return; drag = false; if (swiping && Math.abs(sp.v) > 46) startReply(row._m); swiping = false; sp.to(0); }
  b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end);
  // trackpad: a two-finger sideways swipe arrives as horizontal wheel events
  var acc = 0, wheelT = 0, wheelDone = false;
  b.addEventListener('wheel', function(e){
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.2 || CTX.row) return;
    e.preventDefault();   // also stops the browser's "swipe back" page navigation
    clearTimeout(wheelT);
    if (!wheelDone){ acc -= e.deltaX; var x = Math.abs(acc); sp.set((acc < 0 ? -1 : 1) * x * 0.7 / (1 + x / 260)); if (Math.abs(sp.v) > 60){ wheelDone = true; if (navigator.vibrate) try { navigator.vibrate(8); } catch(e4){} startReply(row._m); sp.to(0); } }
    wheelT = setTimeout(function(){ acc = 0; wheelDone = false; sp.to(0); }, 160);   // fingers lifted (and the inertia is over)
  }, {passive:false});
  return row;
}
function fillRow(row, m, f){
  row._m = m;
  var mine = m.by && m.by === CHAT.uid, on = f.online[m.by], flat = CHAT.theme === 'discord', dm = isDmRoom(CHAT.active);
  row.classList.toggle('out', !!mine); row.classList.toggle('in', !mine); row.classList.toggle('gap', f.first); row.classList.toggle('tail', f.tail);
  var rx = m.reactions || {}, rsig = REACTS.map(function(r){ var o = rx[r[0]] || {}; return Object.keys(o).filter(function(k){ return o[k]; }).sort().join(','); }).join('|');
  var grp = !dm && grpOf(CHAT.active), rstate = mine ? tickState(CHAT.active, m) : '';
  row._fwd.hidden = !m.fwd;
  var sig = [!!m.fwd, m.reply && [m.reply.kind, !!m.reply.thumb, m.reply.text].join('|'), rstate, CHAT.theme, dm, m.text, m.image && m.image.url, m.voice && m.voice.url, m.expired, m.locked && m.locked.why, !!m.nosave, mine, f.first, f.tail, !!on, nameOf(m.by), !!CHAT.pending[m.id], m.reply && m.reply.id, rsig, UI.reports[m.id] || 0, m.mod, LIVE.profiles[m.by] && (LIVE.profiles[m.by].avatarUrl || LIVE.profiles[m.by].gradient), LIVE.profiles[m.by] && LIVE.profiles[m.by].badge && LIVE.profiles[m.by].badge.label].join('§');
  if (row._sig === sig) return; row._sig = sig;
  row._av.className = 'av' + ((flat ? f.first : f.tail) ? '' : ' hide'); row._av.hidden = (!!mine || dm) && !flat;
  var p = LIVE.profiles[m.by], ini = row._av.querySelector('.ini');
  if (p && p.avatarUrl){ if (row._img.getAttribute('src') !== p.avatarUrl) row._img.src = p.avatarUrl; row._img.hidden = false; if (ini) ini.remove(); }
  else { row._img.hidden = true; if (!ini){ ini = el('span', 'ini'); row._av.insertBefore(ini, row._img); } ini.textContent = initials(mine && LIVE.me && LIVE.me.name ? LIVE.me.name : nameOf(m.by)); ini.style.background = (p && (p.gradient || p.color)) || teamColor(m.by || 'member'); }
  var dot = row._av.querySelector('.on'); if (on && !dot) row._av.appendChild(el('span', 'on')); if (!on && dot) dot.remove();
  row._name.hidden = (mine && !flat) || (dm && !flat) || !f.first; row._name.textContent = '';
  if (!row._name.hidden){ row._name.appendChild(el('span', null, mine ? (flat ? ((LIVE.me && LIVE.me.name) || S('chat.you')) : S('chat.you')) : nameOf(m.by))); row._name.style.color = mine && flat ? '' : ((p && p.color) || 'var(--c-accent)'); if (m.mod) row._name.appendChild(el('span', 'mod', S('chat.modTag'))); else if (p && p.badge){ var rb = el('span', 'mod role-badge', p.badge.label); rb.style.background = p.badge.color; rb.style.color = '#fff'; row._name.appendChild(rb); } }
  row._quote.hidden = !(m.reply && m.reply.id); row._quote.textContent = '';
  if (!row._quote.hidden){ var qt = el('div', 'q-text'); qt.appendChild(el('b', null, nameOf(m.reply.by))); var ql = el('span'); quoteLine(ql, m.reply); qt.appendChild(ql); row._quote.appendChild(qt);
    if (m.reply.kind === 'photo'){ var qi = el('img', 'q-thumb'); qi.alt = '';
      // sharp when the original picture is already on this device, else its tiny preview
      var orig = roomMsgs(CHAT.active).filter(function(x){ return x.id === m.reply.id; })[0], full = orig && orig.image && (MEDIA.blobs[mediaKey(orig.image.url)] || (/^blob:/.test(orig.image.url) ? orig.image.url : null));
      qi.src = full || m.reply.thumb || 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; row._quote.appendChild(qi); } }
  row._pic.hidden = !m.image; if (m.image){ mediaAdopt(m, m.image.url); paintPic(row, m, mine); }
  row._voice.hidden = !m.voice; if (m.voice){ mediaAdopt(m, m.voice.url); paintVoice(row, m); }
  paintUpload(row, m);
  row._pic.classList.toggle('nosave', !!m.nosave); row._picImg.draggable = !m.nosave;
  if (m.locked){ row._gone.hidden = false; row._gone.textContent = ''; row._gone.classList.add('locked');
    row._gone.appendChild(svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'));
    row._gone.appendChild(el('span', null, S('media.lock.' + m.locked.why, {what: S(m.locked.kind === 'voice' ? 'media.whatVoice' : 'media.whatPhoto')})));
    if (m.locked.why === 'signin'){ var si = el('button', 'b-gone-btn', S('chat.signIn')); si.type = 'button'; si.onclick = function(e){ e.stopPropagation(); backend.openSignIn(); }; row._gone.appendChild(si); } }
  else row._gone.classList.remove('locked');
  if (!m.locked) row._gone.hidden = !m.expired; if (m.expired && !m.locked){ row._gone.textContent = ''; row._gone.appendChild(svg(m.expired === 'voice' ? '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16"/>' : '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 15l5-5 5 5M4 4l16 16"/>')); row._gone.appendChild(el('span', null, S(m.expired === 'voice' ? 'media.voiceExpired' : 'media.photoExpired'))); }
  row._text.textContent = m.text || ''; row._text.classList.toggle('only-meta', !m.text);
  // a voice message without text: time + ticks sit under the waveform (like WhatsApp), no extra line
  var voiceOnly = !!(m.voice && !m.text); row._text.hidden = voiceOnly; (voiceOnly ? row._voice._foot : row._text).appendChild(row._meta);
  row._meta.textContent = ''; row._meta.appendChild(document.createTextNode(hhmm(m.ts)));
  if (CHAT.canEdit && UI.reports[m.id]){ var fl = svg('<path d="M5 21V4h11l-2 4 2 4H5"/>'); fl.classList.add('flag'); fl.setAttribute('role','img'); fl.removeAttribute('aria-hidden'); fl.setAttribute('aria-label', S('chat.reportsAria', {n: UI.reports[m.id]})); row._meta.appendChild(fl); }
  // ticks on our own messages: clock = sending · ✓ = sent · ✓✓ = reached their device · ✓✓ coloured = seen (one-to-one chats)
  if (mine) row._meta.appendChild(tickIcon(rstate, !!grp));
  if (row._acts) row._acts.querySelectorAll('.emo').forEach(function(bt, i){ var o = rx[REACTS[i][0]] || {}; bt.classList.toggle('mine', !!o[CHAT.uid]); });   // our reaction, highlighted like in the menu
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
  e._t = el('b'); e._b = el('span'); e.appendChild(e._t); e.appendChild(e._b); UI.emptyEl = e; }
  var g = grpOf(CHAT.active), locked = g && !g.canRead;
  var quiet = g && !locked && !g.canPost;   // a channel members can't post in
  UI.emptyEl._t.textContent = locked ? S('groups.lockedTitle') : quiet ? S('groups.emptyChannel') : S('chat.emptyTitle');
  UI.emptyEl._b.textContent = locked ? (g.description || S('groups.lockedBody')) : quiet ? (g.description || S('groups.emptyChannelBody')) : S('chat.emptyBody');
  return UI.emptyEl; }
function typingEl(typ){
  if (!UI.typingEl){ var r = el('div', 'row in tail typingrow enter'); var av = el('div', 'av'); var ini = el('span', 'ini'); av.appendChild(ini); r.appendChild(av);
    var bw = el('div', 'bwrap'), b = el('div', 'bubble'), d = el('div', 'dots3'); d.innerHTML = '<i></i><i></i><i></i>'; b.appendChild(d); bw.appendChild(b); r.appendChild(bw); r.setAttribute('aria-label', S('chat.someoneTyping')); UI.typingEl = r; }
  var id = peerId(typ[0]), p = LIVE.profiles[id], ini2 = UI.typingEl.querySelector('.ini'); ini2.textContent = initials(nameOf(id)); ini2.style.background = (p && (p.gradient || p.color)) || teamColor(id || 'member');
  return UI.typingEl;
}
var renderToken = 0;
/* The open one-to-one conversation is on screen (tab visible, chat open, conversation showing on phones): tell the other side
   we have seen it, up to their newest message. */
function markReadActive(msgs){
  var g = grpOf(CHAT.active);   // groups count only for their members
  if (!backend || !backend.markRead || document.hidden || !viewing() || !document.body.classList.contains('chat-open') || !(isDmRoom(CHAT.active) || (g && (g.status === 'member' || g.isOwner)))) return;
  if (window.innerWidth <= 860 && !$('messenger').classList.contains('in-convo')) return;
  var ts = 0; (msgs || roomMsgs(CHAT.active)).forEach(function(m){ if (m.by !== CHAT.uid && !CHAT.pending[m.id] && m.ts > ts) ts = m.ts; });
  if (ts) backend.markRead(CHAT.active, ts);
}
document.addEventListener('visibilitychange', function(){ if (!document.hidden) markReadActive(); });
window.addEventListener('focus', function(){ markReadActive(); });
async function renderConvo(mode){
  var token = ++renderToken, wall = $('wall'), inner = $('wallIn'), roomChanged = UI.renderedRoom !== CHAT.active;
  var msgs = roomMsgs(CHAT.active);
  await names(msgs.map(function(m){ return m.by; }).concat(msgs.map(function(m){ return m.reply && m.reply.by; })).concat(viewers().map(peerId)));
  if (token !== renderToken) return;
  markReadActive(msgs);
  if (roomChanged){
    inner.textContent = ''; UI.rows.clear(); UI.days.clear(); UI.renderedRoom = CHAT.active; UI.typingEl = null; wallPush.set(0);
    var seen = lastSeen[CHAT.active] || 0, firstNew = msgs.filter(function(m){ return m.ts > seen && m.by !== CHAT.uid; })[0];
    UI.newBefore = seen && firstNew ? firstNew.id : null; UI.newEl = null; CHAT.unseenBelow = 0;
  }
  var initial = roomChanged || !inner.querySelector('.row:not(.typingrow):not(.skel-row)');   // placeholders don't count as messages
  var atBottom = wall.scrollHeight - wall.scrollTop - wall.clientHeight < 80, oldH = inner.offsetHeight;
  var fromBottom = wall.scrollHeight - wall.scrollTop;   // older messages added above: keep what's on screen where it is
  var desired = [];
  var ready = roomReady(CHAT.active);
  if (!ready && !UI.unavailable){ desired = desired.concat(skeletonRows()); UI.skelShown = CHAT.active; }   // (also before the live connection is up)   // still loading: placeholder bubbles, not "no messages yet"
  else if (!msgs.length) desired.push(emptyEl());
  var softIn = ready && UI.skelShown === CHAT.active; if (ready) UI.skelShown = null;
  var enterRoom = roomChanged && ready && !softIn;   // switched to a conversation that was already here: it glides in too
  if (roomChanged && !REDUCE){ inner.classList.remove('room-in'); void inner.offsetWidth; inner.classList.add('room-in'); }
  if (ready && msgs.length){ var top = histTop(); if (top) desired.push(top); }   // loading older… / start of the conversation   // just loaded: the messages fade in where the placeholders were
  var online = onlineSet(), lastDay = '', added = 0;
  msgs.forEach(function(m, i){
    var day = dayLabel(m.ts); if (day !== lastDay){ desired.push(dayEl(day)); lastDay = day; }
    if (m.id === UI.newBefore){ if (!UI.newEl) UI.newEl = el('div', 'newline', S('chat.newMessages')); desired.push(UI.newEl); }
    var prev = msgs[i - 1], next = msgs[i + 1];
    var first = !prev || prev.by !== m.by || m.ts - prev.ts > 300000 || dayLabel(prev.ts) !== day || m.id === UI.newBefore;
    var tail = !next || next.by !== m.by || next.ts - m.ts > 300000 || dayLabel(next.ts) !== day || next.id === UI.newBefore;
    var row = UI.rows.get(m.id);
    if (!row && m.clientId && UI.rows.get(m.clientId)){ row = UI.rows.get(m.clientId); UI.rows.delete(m.clientId); UI.rows.set(m.id, row); row.dataset.id = m.id; }   // our pending bubble became the real message: same bubble, no flicker
    if (!row){ row = buildRow(m); UI.rows.set(m.id, row); if (!initial && mode !== 'older'){ row.classList.add('enter'); added++; }
      else if ((softIn || enterRoom) && msgs.length - i <= 14){ row.classList.add('soft-in'); row.style.animationDelay = (14 - (msgs.length - i)) * (enterRoom ? 12 : 18) + 'ms'; } }   /* the last 14 fade in, oldest first */
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
  if (mode === 'older' && !initial){ wall.scrollTop = wall.scrollHeight - fromBottom; }
  else if (initial){
    if (UI.newEl && UI.newEl.isConnected) UI.newEl.scrollIntoView({block:'center'}); else wall.scrollTop = wall.scrollHeight;
    markSeen();
  } else if (atBottom || mode === 'mine'){
    var delta = inner.offsetHeight - oldH;
    wall.scrollTop = wall.scrollHeight;
    if (delta && !REDUCE){ wallPush.set(wallPush.v + delta); wallPush.to(0); }
    CHAT.unseenBelow = 0; markSeen();
  } else if (added) CHAT.unseenBelow += added;
  updateJump();
  if (ready) setTimeout(loadOlderMaybe, 0);   // the first page doesn't fill the screen yet: fetch more
}
/* the row at the top of a conversation: a loader while older messages come, or "start of the conversation" */
function histTop(){
  var st = backend.historyState ? backend.historyState(CHAT.active) : null; if (!st) return null;
  if (!UI.histEl){ UI.histEl = el('div', 'hist-top'); UI.histEl.setAttribute('role', 'status'); }
  if (UI.histEl._st !== st){ UI.histEl._st = st; UI.histEl.className = 'hist-top ' + st; UI.histEl.textContent = '';
    if (st === 'loading' || st === 'more'){ var d = el('span', 'dots3'); d.innerHTML = '<i></i><i></i><i></i>'; UI.histEl.appendChild(d); UI.histEl.setAttribute('aria-label', S('chat.loadingOlder')); }
    else { UI.histEl.appendChild(el('span', null, S('chat.historyStart'))); UI.histEl.removeAttribute('aria-label'); } }
  return UI.histEl;
}
/* near the top (or the page doesn't fill the screen): load the previous page of this conversation */
function loadOlderMaybe(){
  if (!backend.loadOlder || !viewing()) return;
  var w = $('wall'), room = CHAT.active;
  if (w.scrollTop > 400 && w.scrollHeight > w.clientHeight + 40) return;
  var p = backend.loadOlder(room); if (!p) return;
  if (UI.histEl){ UI.histEl._st = null; histTop(); }
  p.then(null, function(){ if (CHAT.active === room) renderConvo('older'); });
}
function markSeen(){ if (!viewing()) return; var msgs = roomMsgs(CHAT.active), l = msgs[msgs.length - 1]; if (l && (lastSeen[CHAT.active] || 0) < l.ts){ lastSeen[CHAT.active] = l.ts; store('ps_seen', lastSeen); renderRooms(); } }
function updateJump(){ var w = $('wall'), far = w.scrollHeight - w.scrollTop - w.clientHeight > 220; $('jump').classList.toggle('show', far); var c = $('jumpCount'); c.hidden = !(far && CHAT.unseenBelow); c.textContent = CHAT.unseenBelow; }
$('wall').addEventListener('scroll', function(){ var w = this; if (w.scrollHeight - w.scrollTop - w.clientHeight < 60){ CHAT.unseenBelow = 0; markSeen(); } updateJump(); if (w.scrollTop < 400) loadOlderMaybe(); }, {passive:true});
$('jump').onclick = function(){ var w = $('wall'); w.scrollTo({top: w.scrollHeight, behavior: REDUCE ? 'auto' : 'smooth'}); };

/* ---------- iOS-style context menu: the message lifts, reactions above, actions below ---------- */
var CTX = {row:null, clone:null, lift:null};
/* Message menu ("⋯", right-click, Enter, press and hold): the message lifts over a blurred background, reactions above,
   actions below. Same actions everywhere. Closes on: outside tap / click, Escape, resize, changing room, any action. */
function ctxItems(menu, m, mine){
  menu.textContent = '';
  function item(label, path, fn, danger){ var bt = el('button', danger ? 'danger' : ''); bt.type = 'button'; bt.setAttribute('role', 'menuitem'); bt.appendChild(el('span', null, label)); bt.appendChild(svg(path)); bt.onclick = function(){ closeCtx(); fn(); }; menu.appendChild(bt); }
  if (CHAT.canPost) item(S('chat.reply'), '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v3"/>', function(){ startReply(m); });
  if (m.text) item(S('chat.copy'), '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>', function(){
    try { navigator.clipboard.writeText(m.text).then(function(){ toast(S('chat.copied'), true); }, function(){ toast(S('chat.copyBlocked')); }); } catch(e){ toast(S('chat.copyBlocked')); } });
  if ((m.image || m.voice) && !m.nosave && !/^blob:/.test((m.image || m.voice).url)) item(S('media.save'), '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', function(){
    var day = new Date(m.ts).toISOString().slice(0, 10), url = (m.image || m.voice).url, ext = m.image ? 'webp' : (/\.(\w+)$/.exec(url) || [0, 'webm'])[1];
    mediaFetch(url).then(function(u){ mediaSave(u, 'oddsclub-' + (m.image ? 'photo' : 'voice') + '-' + day + '.' + ext); }, function(){ toast(S('media.loadFailed')); }); });
  if (canForward(m)) item(S('chat.forward'), '<path d="M14 5l7 7-7 7"/><path d="M21 12H9a6 6 0 0 0-6 6v1"/>', function(){ openForward(m); });
  if (!mine && CHAT.canPost) item(UI.reported[m.id] ? S('chat.reported') : S('chat.report'), '<path d="M5 21V4h11l-2 4 2 4H5"/>', function(){ report(m); });
  if (CHAT.canEdit && !mine && m.by) item(UI.mod.muted[m.by] ? S('chat.unmute', {name: nameOf(m.by)}) : S('chat.mute', {name: nameOf(m.by)}), '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/>', function(){ setMuted(m.by, !UI.mod.muted[m.by]); }, true);
  if (CHAT.canEdit || (mine && CHAT.canPost)) item(S('chat.delete'), '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', function(){ backend.remove(m).then(function(){ toast(S('chat.deleted'), true); }, function(){ toast(S('chat.deleteFailed')); }); }, true);
}
function openCtx(row){
  // the same press can arrive twice (our hold timer + the phone's own long-press event): open once
  if (CTX.row === row && Date.now() - (CTX.at || 0) < 700) return;
  if (CTX.row) closeCtx(true);
  if (CTX.ending){ CTX.ending(); CTX.ending = null; }
  var m = row._m; if (!m) return;
  CTX.at = Date.now();
  var mine = m.by === CHAT.uid, ctx = $('ctx');
  document.body.classList.add('ctx-on');
  /* measure the message at its real size: while held it is still shrinking back from the press (scale .96), and a copy
     made 4% narrower re-wraps its text (the time drops to a new line) and jumps in height */
  var b = row._bubble; b.classList.remove('pressing'); var tr = b.style.transition, tf = b.style.transform;
  b.style.transition = 'none'; b.style.transform = 'none';
  var r = b.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
  b.style.transform = tf; void b.offsetWidth; b.style.transition = tr;
  var clone = b.cloneNode(true); clone.classList.add('ctx-bubble', mine ? 'out' : 'in'); clone.classList.remove('pressing'); clone.removeAttribute('tabindex');
  clone.style.left = r.left + 'px'; clone.style.top = r.top + 'px'; clone.style.width = r.width + 'px'; clone.style.height = r.height + 'px'; clone.style.boxSizing = 'border-box'; clone.style.transformOrigin = mine ? 'right center' : 'left center';
  ctx.insertBefore(clone, $('ctxReact')); b.classList.add('lifted-src');
  // reactions
  var rbar = $('ctxReact'); rbar.textContent = '';
  REACTS.forEach(function(rx, i){ var on = m.reactions && m.reactions[rx[0]] && m.reactions[rx[0]][CHAT.uid];
    var bt = el('button', on ? 'mine' : '', rx[1]); bt.type = 'button'; bt.setAttribute('aria-label', S('chat.reactAria', {name: S('react.' + rx[0])})); bt.style.transitionDelay = (40 + i * 30) + 'ms';
    bt.onclick = function(){ toggleReact(m, rx[0]); closeCtx(); }; rbar.appendChild(bt); });
  // actions (same list as on a computer)
  var menu = $('ctxMenu'); ctxItems(menu, m, mine);
  ctx.classList.remove('closing'); ctx.classList.add('open'); ctx.setAttribute('aria-hidden', 'false');
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
/* Closing is the opening played backwards: the blur fades, reactions and actions shrink away, and the lifted message glides
   back to its exact place and size (its shadow fading) before the real message takes over — no jump. The overlay stays
   visible ('closing') until then; a new menu or an instant close cuts it short. */
function closeCtx(instant){
  var ctx = $('ctx'); if (!CTX.row) return; var row = CTX.row, clone = CTX.clone;
  ctx.classList.remove('open'); ctx.setAttribute('aria-hidden', 'true'); document.body.classList.remove('ctx-on');
  if (!instant && !REDUCE && clone){
    ctx.classList.add('closing'); clone.classList.add('settling');
    var done = false, end = function(){ if (done) return; done = true; clearTimeout(CTX.endTimer); CTX.ending = null;
      // swap back to the real message in the same frame, without its own fade (that caused a blink)
      var b = row._bubble; b.style.transition = 'none'; b.classList.remove('lifted-src'); if (clone.isConnected) clone.remove(); void b.offsetWidth; b.style.transition = '';
      if (!CTX.row) ctx.classList.remove('closing'); };
    CTX.row = null; CTX.endTimer = setTimeout(end, 700);   // safety net
    CTX.lift.to(0, end); CTX.ending = end;
    // swap as soon as the glide is visually home (the spring's last tiny wobbles are invisible)
    (function watch(){ if (done) return; if (Math.abs(CTX.lift.v) < 0.006) end(); else requestAnimationFrame(watch); })();
    return;
  }
  ctx.classList.remove('closing');
  var finish = function(){ var b = row._bubble; b.style.transition = 'none'; b.classList.remove('lifted-src'); if (clone && clone.isConnected) clone.remove(); void b.offsetWidth; b.style.transition = ''; };
  CTX.row = null;
  if (instant || REDUCE) finish(); else CTX.lift.to(0, finish);
}
// lifting the finger after a long press lands on the background: don't treat that as "close"
$('ctxBg').addEventListener('click', function(){ var now = Date.now(); if (now - (CTX.at || 0) < 450 || now - (CTX.liftAt || 0) < 400) return; closeCtx(); });
/* Android: our menu opens after 0.42 s of holding, then the phone's own long-press event (≈0.5–0.65 s, finger still down)
   arrives on whatever is under the finger now — the menu's backdrop or the lifted copy. That is the same press, not a new
   one: never let it close the menu (and never show the phone's menu) */
$('ctx').addEventListener('contextmenu', function(e){ e.preventDefault(); if (e.target === $('ctxBg') && Date.now() - (CTX.at || 0) > 1500 && Date.now() - (CTX.liftAt || 0) > 400) closeCtx(); });
var ctxW = window.innerWidth;
window.addEventListener('resize', function(){ var w = window.innerWidth, changed = w !== ctxW; ctxW = w; if (CTX.row && changed) closeCtx(true); });   // a rotation, not the keyboard / address bar
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
  // what is quoted: its text, and for a picture / voice message its kind + preview / length (the server re-reads all of it)
  var kind = m.image ? 'photo' : m.voice ? 'voice' : null, local = m.image && (MEDIA.blobs[mediaKey(m.image.url)] || (/^blob:/.test(m.image.url) ? m.image.url : null));
  CHAT.replyTo = {id:m.id, by:m.by || null, text:String(m.text || '').slice(0,140), kind:kind, thumb: m.image ? (m.image.thumb || local || null) : null, dur: m.voice ? m.voice.dur : null};
  var rt = $('replyThumb'); rt.hidden = kind !== 'photo'; if (kind === 'photo') rt.src = local || m.image.thumb || '';
  $('replyWho').textContent = S('chat.replyingTo', {name: nameOf(m.by)}); quoteLine($('replyText'), CHAT.replyTo); $('replyWrap').classList.add('show'); $('msgInput').focus({preventScroll:true});
}
function clearReply(){ CHAT.replyTo = null; $('replyWrap').classList.remove('show'); }
/* ✕ on the reply / picture bar: act on the first touch and keep the text box focused (keyboard stays open). Without this the
   tap first blurred the box, the keyboard closed, the page jumped and the tap missed — a second tap was needed. */
function tapKeepFocus(btn, fn){
  var done = 0;
  btn.addEventListener('pointerdown', function(e){ if (e.button > 0) return; e.preventDefault(); done = Date.now(); fn(); });
  btn.addEventListener('mousedown', function(e){ e.preventDefault(); });   // older browsers: no focus change either
  btn.addEventListener('click', function(){ if (Date.now() - done > 600) fn(); });   // keyboard (Enter / Space) and fallbacks
}
tapKeepFocus($('replyClose'), clearReply);

/* ---------- Rules: checked before a message is sent (the server checks again) ---------- */
var BAD = ((cfg.chat && cfg.chat.bannedWords) || []).map(function(w){ return String(w).toLowerCase().replace(/[^a-z]/g, ''); }).filter(Boolean);
function norm(s){ return s.toLowerCase().replace(/[0@]/g,'o').replace(/[1!|]/g,'i').replace(/3/g,'e').replace(/4/g,'a').replace(/[5$]/g,'s').replace(/7/g,'t').replace(/[^a-z]/g,''); }
function checkMessage(text){
  if (CHAT.canEdit) return null;   // the team may share links, codes and contact details, and is never slowed (the server agrees)
  if (UI.mod.muted[CHAT.uid]) return S('rule.muted');
  if (slowApplies() && Date.now() < UI.slowUntil) return S('rule.slow', {s: Math.ceil((UI.slowUntil - Date.now()) / 1000)});
  if (/(https?:\/\/|www\.|t\.me\/|wa\.me\/|\b[a-z0-9-]{2,}\.(com|net|org|io|bet|xyz|me|co|ly|app|link|site|online|info|biz|tv|gg)\b)/i.test(text)) return S('rule.links');
  if (!CHAT.canEdit && /(promo\s*-?\s*code|promocode|bonus\s*code|ref(erral)?\s*(code|link)|invite\s*(code|link)|use\s*(my|this)\s*code|code\s*[:=])/i.test(text) && text.toUpperCase().indexOf(String(SITE.promo).toUpperCase()) < 0) return S('rule.codes');
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text)) return S('rule.emails');
  if (/(\+?\d[\d\s().-]{7,}\d)/.test(text) && text.replace(/\D/g,'').length >= 8) return S('rule.phones');
  if (/(fixed\s*-?\s*match|sure\s*(odds|win|tips?)|guaranteed\s*(win|odds|profit)|vip\s*tips?|send\s*(me\s*)?money|mobile\s*money|inbox\s*me|dm\s*me|whatsapp\s*me|telegram\s*me)/i.test(text)) return S('rule.scams');
  var n = norm(text); for (var i = 0; i < BAD.length; i++) if (n.indexOf(BAD[i]) >= 0) return S('rule.language');
  var letters = text.replace(/[^A-Za-z]/g, ''); if (letters.length >= 12 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.7) return S('rule.caps');
  if (/(.)\1{9,}/.test(text)) return S('rule.spam');
  if (!isDmRoom(CHAT.active) && text.toLowerCase() === UI.lastText && Date.now() - UI.lastTextAt < 120000) return S('rule.repeat');   // shared rooms only
  return null;
}

/* ---------- Composer ---------- */
function setPresence(){ if (!CHAT.db) return; var on = viewing() && !document.hidden; backend.presence({room: on ? CHAT.active : null, typing: on && !!$('msgInput').value.trim()}); }
// a hidden tab isn't "looking at" the conversation (the server then sends notifications for it)
document.addEventListener('visibilitychange', function(){ setPresence(); });
// tapping a notification while the site is open: the service worker asks this tab to open that conversation
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function(e){
  var d = e.data || {}; if (d.type !== 'oc-open' || !d.url) return;
  var u; try { u = new URL(d.url); } catch(x){ return; } if (u.origin !== location.origin) return;
  if (u.pathname.indexOf(CH.base) !== 0){ location.assign(u.href); return; }   // (another language)
  if (location.pathname === u.pathname && isOpen()) return;
  if (!isOpen()){ CH.scroll = window.scrollY || 0; history.pushState({oc: 1, depth: 1, fromSite: true}, '', u.pathname); }
  else history.pushState({oc: 1, depth: ((history.state || {}).depth || 0) + 1, fromSite: !!(history.state || {}).fromSite}, '', u.pathname);
  route();
});
function refreshSend(){ var v = $('msgInput').value.trim() || UI.pic, slow = slowApplies() && Date.now() < UI.slowUntil; $('composer').classList.toggle('has-text', !!v || slow); $('sendBtn').disabled = !v || slow; if ($('micBtn')) updateMic(); }
function roomMediaRule(id){ id = String(id); if (isDmRoom(id)) return null; if (grpId(id)){ var g = grpOf(id); return (g && g.media) || null; } return (cfg.chat && cfg.chat.loungeMedia) || null; }
function mediaOff(){ var r = roomMediaRule(CHAT.active); return !!(r && r.view === 'none'); }   // text-only room: no pictures / voice at all
// private chats between members: Chat settings → Private chats → Pictures (off unless turned on)
function canAttach(){ return !mediaOff() && !!(CHAT.db && CHAT.canPost && (CHAT.canEdit || CHAT.active === 'support' || (pmUid(CHAT.active) ? !!(cfg.chat && cfg.chat.pmPictures) : (CHAT.perms && CHAT.perms.sendPictures)))); }
function updateAttach(){ var ok = canAttach(); $('attachBtn').hidden = !ok; if (!ok) clearPic(); updateMic(); }

/* ---------- Voice messages: record in the browser (MediaRecorder), then send or throw away ----------
   Allowed: the team; a member in their chat with the team and in private chats; in shared rooms members need the role right
   for pictures & voice (the server checks the same). The mic shows while the box is empty. */
var REC = null, VOICE_MAX = Math.max(10, Number(cfg.chat && cfg.chat.voiceMax) || 120);
function canVoice(){
  if (!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) || mediaOff()) return false;
  // private chats between members: Chat settings → Private chats → Voice messages (on unless turned off)
  return !!(CHAT.db && CHAT.canPost && (CHAT.canEdit || CHAT.active === 'support' || (pmUid(CHAT.active) ? !(cfg.chat && cfg.chat.pmVoice === false) : (CHAT.perms && CHAT.perms.sendPictures))));
}
function updateMic(){ var ok = canVoice() && !REC; $('micBtn').hidden = !ok; $('composer').classList.toggle('voice-ok', ok); }
function recMime(){ var c = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm']; for (var i = 0; i < c.length; i++) if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c[i])) return c[i]; return ''; }
/* short UI sounds made on the fly (no files): a rising blip when recording starts, a falling one when it stops / sends,
   a soft low one when it is thrown away */
var SFX = null;
function sfx(kind){
  try {
    if (!SFX) SFX = new (window.AudioContext || window.webkitAudioContext)();
    if (SFX.state === 'suspended') SFX.resume();
    var t = SFX.currentTime, o = SFX.createOscillator(), g = SFX.createGain(), f = kind === 'start' ? [620, 990] : kind === 'stop' ? [880, 520] : [330, 220];
    o.type = 'sine'; o.frequency.setValueAtTime(f[0], t); o.frequency.exponentialRampToValueAtTime(f[1], t + 0.11);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(kind === 'cancel' ? 0.12 : 0.2, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(SFX.destination); o.start(t); o.stop(t + 0.18);
  } catch(e){}
}
function recStart(){
  if (REC || !canVoice()) return;
  var mb = $('micBtn'); mb.classList.remove('pressed'); void mb.offsetWidth; mb.classList.add('pressed');   // squeeze + pop: the tap was taken
  var problem = checkMessage(''); if (problem && UI.mod.muted[CHAT.uid]){ toast(problem); return; }
  if (needsRules()) return;
  navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true}}).then(function(stream){
    var mime = recMime(), mr;
    try { mr = mime ? new MediaRecorder(stream, {mimeType:mime, audioBitsPerSecond:32000}) : new MediaRecorder(stream); } catch(e){ stream.getTracks().forEach(function(t){ t.stop(); }); toast(S('voice.unsupported')); return; }
    var ac = null, an = null, buf = null;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); an = ac.createAnalyser(); an.fftSize = 512; ac.createMediaStreamSource(stream).connect(an); buf = new Uint8Array(an.fftSize); } catch(e){}
    REC = {mr:mr, stream:stream, chunks:[], t0:Date.now(), levels:[], ac:ac, an:an, buf:buf, timer:0, send:false, room:CHAT.active, reply:CHAT.replyTo || null};
    mr.ondataavailable = function(e){ if (e.data && e.data.size) REC && REC.chunks.push(e.data); };
    mr.onstop = recFinish;
    sfx('start'); if (navigator.vibrate) try { navigator.vibrate(12); } catch(e){}
    setTimeout(function(){ if (REC && REC.mr === mr && mr.state === 'inactive'){ REC.t0 = Date.now(); mr.start(250); } }, 170);   // after the blip
    $('composer').classList.add('recording'); var bar = $('recBar'); bar.hidden = false; bar.classList.remove('opening'); void bar.offsetWidth; bar.classList.add('opening'); updateMic();
    // the waveform always spans the whole bar: as many bars as fit (3 px + 2 px gap), flat dots first, the live level
    // comes in from the right and scrolls left (works on a phone and on a wide screen, and when the window is resized)
    var wave = $('recWave'), cap = function(){ return Math.max(12, Math.floor((wave.clientWidth + 2) / 5)); };
    wave.textContent = ''; requestAnimationFrame(function(){ for (var i = 0, n = cap(); i < n; i++){ var d = el('i', 'idle'); wave.appendChild(d); } });
    REC.timer = setInterval(function(){
      if (!REC) return;
      var secs = (Date.now() - REC.t0) / 1000, lvl = 0;
      if (REC.an){ REC.an.getByteTimeDomainData(REC.buf); var sum = 0; for (var i = 0; i < REC.buf.length; i++){ var d = (REC.buf[i] - 128) / 128; sum += d * d; } lvl = Math.min(1, Math.sqrt(sum / REC.buf.length) * 3.2); }
      REC.levels.push(lvl);
      $('recTime').textContent = fmtDur(secs) + (secs > VOICE_MAX - 10 ? ' / ' + fmtDur(VOICE_MAX) : '');
      var b = el('i'); b.style.height = Math.max(10, Math.round(lvl * 100)) + '%'; wave.appendChild(b); var n = cap(); while (wave.childNodes.length > n) wave.removeChild(wave.firstChild); while (wave.childNodes.length < n) wave.insertBefore(el('i', 'idle'), wave.firstChild);
      if (secs >= VOICE_MAX) recStop(true);   // the longest allowed: send it
    }, 100);
  }, function(err){ toast(S(err && err.name === 'NotAllowedError' ? 'voice.micDenied' : 'voice.unsupported')); });
}
function recStop(send){ if (!REC) return; REC.send = !!send; sfx(send ? 'stop' : 'cancel'); clearInterval(REC.timer); try { if (REC.mr.state !== 'inactive') REC.mr.stop(); else recFinish(); } catch(e){ recFinish(); } }
function recFinish(){
  var r = REC; if (!r) return; REC = null;
  r.stream.getTracks().forEach(function(t){ t.stop(); }); if (r.ac) r.ac.close().catch(function(){});
  $('composer').classList.remove('recording'); $('recBar').hidden = true; $('recBar').classList.remove('opening'); $('recWave').textContent = ''; $('recTime').textContent = '0:00'; updateMic();
  var dur = (Date.now() - r.t0) / 1000;
  if (!r.send) return;
  if (dur < 0.8 || !r.chunks.length){ toast(S('voice.tooShort')); return; }
  var blob = new Blob(r.chunks, {type: (r.mr.mimeType || r.chunks[0].type || 'audio/webm')});
  // 40-bar waveform from the levels measured while recording
  var n = 40, L = r.levels.length || 1, peaks = [], mx = Math.max.apply(null, r.levels.concat([0.05]));
  for (var i = 0; i < n; i++){ var a = Math.floor(i * L / n), z = Math.max(a + 1, Math.floor((i + 1) * L / n)), v = 0; for (var j = a; j < z; j++) v = Math.max(v, r.levels[j] || 0); peaks.push(Math.round(Math.max(0.08, v / mx) * 100)); }
  sendVoice(blob, Math.min(dur, VOICE_MAX), peaks, r.room, r.reply);
}
async function sendVoice(blob, dur, peaks, room, reply){
  var dmTo = room === 'support' ? CHAT.uid : (String(room).indexOf('sup:') === 0 ? room.slice(4) : null), pmTo = pmUid(room);
  var clientId = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), local = URL.createObjectURL(blob);
  var doc = {clientId: clientId, text: '', room: dmTo || pmTo ? null : room, dmTo: dmTo, pmTo: pmTo, reply: reply || null};
  if (room === CHAT.active) clearReply();
  CHAT.pending[clientId] = true;
  backend.addOptimistic({id: clientId, by: CHAT.uid, text: '', ts: Date.now(), room: dmTo ? (dmTo === CHAT.uid ? 'support' : 'sup:' + dmTo) : room, reply: doc.reply, mod: CHAT.canEdit || undefined, voice: {url: local, dur: dur, peaks: peaks}}, dmTo, pmTo);
  renderConvo('mine');
  var up = UPLOADS[clientId] = {k: 0, ctl: {}, url: local};
  try { await backend.sendVoice(doc, blob, {dur: dur, peaks: peaks}, function(a, t){ uploadProgress(clientId, a, t); }, up.ctl); delete CHAT.pending[clientId]; renderConvo('mine'); }
  catch(err){ delete CHAT.pending[clientId]; delete UPLOADS[clientId]; backend.dropOptimistic(clientId, dmTo, pmTo); renderConvo(); if (!(err && err.aborted)) toast(err && err.message ? err.message : S('chat.sendFailed')); }
}
$('micBtn').addEventListener('click', recStart);
$('recCancel').addEventListener('click', function(){ recStop(false); });
$('recSend').addEventListener('click', function(){ recStop(true); });
document.addEventListener('visibilitychange', function(){ if (document.hidden && REC) recStop(false); });   // never keep the mic on in the background
function clearPic(){ UI.pic = null; $('picWrap').classList.remove('show'); refreshSend(); }
function picOk(f){
  if (!/^image\//.test(f.type || 'image/')){ toast(S('auth.err.photoType')); return false; }
  if (f.size > 10 * 1024 * 1024){ toast(S('chat.err.imageTooBig')); return false; }
  return true;
}
/* one or several pictures (an album, like WhatsApp): preview + crop / rotate / flip / draw + caption each, then send
   (see the picture editor below). append: add them to the editor that is open ("+" in its strip) */
function setPic(files, append){
  files = [].concat(files || []).filter(Boolean).filter(picOk);
  if (files.length) peOpen(files, append);
}
// a picture the editor can't open (e.g. HEIC outside Safari): send it as it is, like before
function setPicRaw(f){
  var url = URL.createObjectURL(f), probe = new Image();
  probe.onload = function(){ UI.pic = {file:f, url:url, w:probe.naturalWidth, h:probe.naturalHeight}; $('picThumb').src = url; $('picName').textContent = f.name || S('chat.photo');
    $('picWrap').classList.add('show'); refreshSend(); $('msgInput').focus({preventScroll:true}); };
  probe.onerror = function(){ URL.revokeObjectURL(url); toast(S('auth.err.photoType')); };
  probe.src = url;
}

/* ---------- Picture editor (before sending), like WhatsApp / Telegram ----------
   Full screen: the picture, tools (crop with free / square / 4:3 / 16:9 and drag handles · rotate · flip · draw with 6 colours
   and 2 sizes · undo · reset), a caption and Send. Everything is done in the browser on a canvas; the result (JPEG, at most
   2560 px) goes through the normal send (rules, slow mode, upload). Crop and drawing are kept in coordinates of the rotated
   picture (0–1), so rotating / flipping carries them along. */
var PE = null;
var PE_COLORS = ['#FFFFFF', '#111111', '#E5484D', '#FFC53D', '#30A46C', '#3E63DD'];
function peEl(){
  if (PE && PE.root) return PE;
  var r = el('div', 'pe'); r.setAttribute('role', 'dialog'); r.setAttribute('aria-modal', 'true'); r.setAttribute('aria-label', S('pe.title'));
  var top = el('div', 'pe-top'), btn = function(cls, label, path, fn){ var b = el('button', 'pe-btn ' + cls); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; b.appendChild(svg(path)); b.onclick = function(e){ e.stopPropagation(); fn(); }; return b; };
  top.appendChild(btn('pe-close', S('pe.close'), '<path d="M6 6l12 12M18 6L6 18"/>', peClose));
  top.appendChild(el('span', 'pe-title', S('pe.title')));
  var tools = el('div', 'pe-tools');
  var tCrop = btn('', S('pe.crop'), '<path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/>', function(){ peMode(PE.mode === 'crop' ? 'view' : 'crop'); });
  var tRot = btn('', S('pe.rotate'), '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>', function(){ peRotate(); });
  var tFlip = btn('', S('pe.flip'), '<path d="M12 3v18M8 7l-5 5 5 5V7zM16 7l5 5-5 5V7z"/>', function(){ peFlip(); });
  var tDraw = btn('', S('pe.draw'), '<path d="M15 5l4 4L8 20H4v-4z"/><path d="M13 7l4 4"/>', function(){ peMode(PE.mode === 'draw' ? 'view' : 'draw'); });
  var tStick = btn('', S('pe.sticker'), '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>', function(){ peMode(PE.mode === 'sticker' ? 'view' : 'sticker'); });
  var tUndo = btn('', S('pe.undo'), '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>', peUndo);
  var tDel = btn('pe-del-photo', S('pe.removePhoto'), '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>', peRemove);   // several photos: drop this one
  [tCrop, tRot, tFlip, tDraw, tStick, tUndo, tDel].forEach(function(b){ tools.appendChild(b); }); top.appendChild(tools);
  var stage = el('div', 'pe-stage'), cv = document.createElement('canvas'); cv.className = 'pe-cv'; stage.appendChild(cv);
  var box = el('div', 'pe-crop'); ['nw','n','ne','e','se','s','sw','w'].forEach(function(h){ var d = el('span', 'pe-h pe-' + h); d.dataset.h = h; box.appendChild(d); }); stage.appendChild(box);
  // the selected sticker: move it (drag), resize + rotate it (round handle), remove it (✕)
  var sel = el('div', 'pe-sel'); sel.hidden = true; var rz = el('span', 'pe-rz'); rz.setAttribute('aria-label', S('pe.resize')); rz.title = S('pe.resize'); var del = el('button', 'pe-del'); del.type = 'button'; del.setAttribute('aria-label', S('pe.removeSticker')); del.appendChild(svg('<path d="M6 6l12 12M18 6L6 18"/>')); sel.appendChild(rz); sel.appendChild(del); stage.appendChild(sel);
  var sub = el('div', 'pe-sub');
  var aspects = el('div', 'pe-aspects'); [['free', 0], ['square', 1], ['4:3', 4/3], ['16:9', 16/9]].forEach(function(a){ var b = el('button', 'pe-chip', a[0] === 'free' ? S('pe.free') : a[0] === 'square' ? S('pe.square') : a[0]); b.type = 'button'; b.dataset.a = a[1]; b.onclick = function(){ peAspect(a[1]); }; aspects.appendChild(b); });
  var colors = el('div', 'pe-colors'); PE_COLORS.forEach(function(c, i){ var b = el('button', 'pe-color'); b.type = 'button'; b.style.background = c; b.dataset.c = c; b.setAttribute('aria-label', S('pe.color', {n: i + 1})); b.onclick = function(){ PE.color = c; peSubUI(); }; colors.appendChild(b); });
  var sz = el('button', 'pe-chip pe-size'); sz.type = 'button'; sz.onclick = function(){ PE.size = PE.size === 1 ? 2 : 1; peSubUI(); }; colors.appendChild(sz);
  // sticker tray (filled when it opens: peFillTray): My stickers (+ = add a picture, saved on this account, only for me) ·
  // Team stickers (back office → Stickers, for everyone) · Emoji
  var tray = el('div', 'pe-tray');
  var done = el('button', 'pe-chip pe-done', S('pe.done')); done.type = 'button'; done.onclick = function(){ peMode('view'); };
  var reset = el('button', 'pe-chip', S('pe.reset')); reset.type = 'button'; reset.onclick = peReset;
  sub.appendChild(tray); sub.appendChild(aspects); sub.appendChild(colors); sub.appendChild(reset); sub.appendChild(done);
  var bottom = el('form', 'pe-bottom'), cap = document.createElement('input'); cap.type = 'text'; cap.maxLength = MAXLEN; cap.placeholder = S('pe.caption'); cap.setAttribute('aria-label', S('pe.caption')); cap.autocomplete = 'off';
  var send = el('button', 'pe-send'); send.type = 'submit'; send.setAttribute('aria-label', S('pe.send')); send.appendChild(svg('<path d="M12 19V5M6 11l6-6 6 6"/>'));
  bottom.appendChild(cap); bottom.appendChild(send); bottom.onsubmit = function(e){ e.preventDefault(); peSend(); };
  var strip = el('div', 'pe-strip'); strip.setAttribute('role', 'tablist'); strip.setAttribute('aria-label', S('pe.photos'));   // the photos picked together
  [top, stage, sub, strip, bottom].forEach(function(x){ r.appendChild(x); });
  ($('messenger') || document.body).appendChild(r);
  PE = {root:r, cv:cv, stage:stage, box:box, sel:sel, sub:sub, aspects:aspects, colors:colors, size:1, sizeBtn:sz, caption:cap, strip:strip, items:[], cur:-1, tools:{crop:tCrop, draw:tDraw, sticker:tStick, undo:tUndo, del:tDel}};
  peStickerEvents(sel, rz, del);
  // drawing
  /* zoom & move the picture: two fingers pinch / move (any mode but crop), one finger drags it when zoomed (not in
     drawing mode, not on a sticker), double-tap zooms in / out, Ctrl + wheel or a trackpad pinch on a computer */
  PE_ptrs = new Map();
  stage.addEventListener('pointerdown', function(e){
    if (PE.mode === 'crop') return;
    PE_ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (PE_ptrs.size === 2){
      // a stroke the first finger started is dropped (it was the start of a pinch)
      if (PE.stroke){ PE.strokes = PE.strokes.filter(function(k){ return k !== PE.stroke; }); PE.stroke = null; PE.hist.pop(); PE.tools.undo.disabled = !PE.hist.length; }
      PE.pan = null; peZoomStart(); e.stopPropagation(); e.preventDefault();
    }
  }, true);
  stage.addEventListener('pointermove', function(e){
    if (!PE_ptrs.has(e.pointerId)) return; PE_ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (PE.pinch){ peZoomMove(); e.stopPropagation(); }
    else if (PE.pan){ var v = PE.view, dx = e.clientX - PE.pan.x, dy = e.clientY - PE.pan.y; if (Math.abs(dx) + Math.abs(dy) > 4) PE.pan.moved = true;
      PE.zoom.cx = PE.pan.cx - dx / v.fw * PE.crop.w; PE.zoom.cy = PE.pan.cy - dy / v.fh * PE.crop.h; peRender(); }
  }, true);
  var ptrUp = function(e){ PE_ptrs.delete(e.pointerId); if (PE_ptrs.size < 2 && PE.pinch){ PE.pinch = null; PE.pinchEnd = Date.now(); } if (!PE_ptrs.size){ PE.panMoved = !!(PE.pan && PE.pan.moved); PE.pan = null; } };
  stage.addEventListener('pointerup', ptrUp, true); stage.addEventListener('pointercancel', ptrUp, true);
  cv.addEventListener('pointerup', function(e){
    // double-tap (not drawing, not a drag, not right after a pinch): zoom in on that spot / back to the whole picture
    if (PE.mode === 'draw' || PE.mode === 'crop' || PE.selSticker || PE.panMoved || Date.now() - (PE.pinchEnd || 0) < 350) { PE.lastTap = null; return; }
    var now = Date.now(), lt = PE.lastTap;
    if (lt && now - lt.t < 320 && Math.abs(e.clientX - lt.x) < 30 && Math.abs(e.clientY - lt.y) < 30){ PE.lastTap = null; peZoomTo(PE.zoom.z > 1.05 ? 1 : 2.5, e.clientX, e.clientY); }
    else PE.lastTap = {t: now, x: e.clientX, y: e.clientY};
  });
  cv.addEventListener('wheel', function(e){
    if (PE.mode === 'crop' || (PE.selSticker && !e.ctrlKey && !e.metaKey)) return;   // (the wheel resizes a selected sticker)
    if (!e.ctrlKey && !e.metaKey && PE.zoom.z <= 1.001 && e.deltaY > 0) return;
    e.preventDefault(); e.stopImmediatePropagation(); peZoomTo(PE.zoom.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), e.clientX, e.clientY);
  }, {passive: false});
  var zchip = el('button', 'pe-zoomchip'); zchip.type = 'button'; zchip.hidden = true; zchip.setAttribute('aria-label', S('pe.zoomReset')); zchip.title = S('pe.zoomReset');
  zchip.onclick = function(e){ e.stopPropagation(); peZoomTo(1); }; stage.appendChild(zchip); PE.zchip = zchip;
  cv.addEventListener('pointerdown', function(e){ if (PE.mode !== 'draw'){ if (PE.mode !== 'crop'){ peStickerDown(e); if (!PE.selSticker && PE.zoom.z > 1.001){ try { cv.setPointerCapture(e.pointerId); } catch(x){} PE.pan = {x: e.clientX, y: e.clientY, cx: PE.zoom.cx, cy: PE.zoom.cy}; } } return; } e.preventDefault(); cv.setPointerCapture(e.pointerId); pePush(); var p = peToBase(e); PE.stroke = {c:PE.color, s:PE.size, pts:[p]}; PE.strokes.push(PE.stroke); peRender(); });
  cv.addEventListener('pointermove', function(e){ if (!PE.stroke) return; PE.stroke.pts.push(peToBase(e)); peRender(); });
  var stopDraw = function(){ PE.stroke = null; }; cv.addEventListener('pointerup', stopDraw); cv.addEventListener('pointercancel', stopDraw);
  // crop box: drag the box or a handle
  box.addEventListener('pointerdown', function(e){ e.preventDefault(); box.setPointerCapture(e.pointerId); pePush(); PE.drag = {h: e.target.dataset.h || 'move', x: e.clientX, y: e.clientY, c: Object.assign({}, PE.crop)}; });
  box.addEventListener('pointermove', function(e){ if (PE.drag) peCropDrag(e); });
  var stopCrop = function(){ PE.drag = null; }; box.addEventListener('pointerup', stopCrop); box.addEventListener('pointercancel', stopCrop);
  cv.addEventListener('wheel', function(e){ var st = PE.selSticker; if (!st || PE.mode === 'crop' || PE.mode === 'draw') return; e.preventDefault(); if (!PE.wheelPushed){ pePush(); PE.wheelPushed = true; } clearTimeout(PE.wheelT); PE.wheelT = setTimeout(function(){ PE.wheelPushed = false; }, 400); st.s = Math.max(0.05, Math.min(1.2, st.s * (e.deltaY < 0 ? 1.08 : 0.93))); peRender(); }, {passive:false});
  r.addEventListener('keydown', function(e){ if ((e.key === 'Delete' || e.key === 'Backspace') && PE.selSticker && document.activeElement !== PE.caption){ e.preventDefault(); peRemoveSticker(); return; }
    if (e.key === 'Escape'){ e.stopPropagation(); if (PE.mode !== 'view') peMode('view'); else peClose(); } });
  window.addEventListener('resize', function(){ if (PE && PE.open) peRender(); });
  // the stage changes size with the keyboard (the editor follows the visible area): fit the photo again as it moves
  if (window.ResizeObserver) new ResizeObserver(function(){ if (PE && PE.open) peRender(); }).observe(stage);
  return PE;
}
var PE_MAX = 10;   // photos picked and sent together (the server allows the same)
function peLoadImg(file){ return new Promise(function(res){ var url = URL.createObjectURL(file), img = new Image();
  img.onload = function(){ res({file:file, url:url, img:img}); }; img.onerror = function(){ URL.revokeObjectURL(url); res({file:file, bad:true}); }; img.src = url; }); }
function peItem(x, caption, n){ return {fresh:n || 0, file:x.file, url:x.url, img:x.img, rot:0, flip:false, crop:{x:0, y:0, w:1, h:1}, aspect:0, strokes:[], stickers:[], hist:[], caption:caption || ''}; }
/* Every photo keeps its own edits and caption: the editor works on PE's fields, and they are copied to / from the photo's
   item when switching */
function peSave(){ var it = PE.items[PE.cur]; if (!it) return; it.rot = PE.rot; it.flip = PE.flip; it.crop = PE.crop; it.aspect = PE.aspect; it.strokes = PE.strokes; it.stickers = PE.stickers; it.hist = PE.hist; it.caption = PE.caption.value; }
function peLoad(it){ PE.file = it.file; PE.url = it.url; PE.img = it.img; PE.rot = it.rot; PE.flip = it.flip; PE.crop = it.crop; PE.aspect = it.aspect; PE.strokes = it.strokes; PE.stickers = it.stickers; PE.hist = it.hist; PE.selSticker = null; }
function peShow(i, dir){
  var from = PE.cur; if (PE.items[from]) peSave();
  PE.cur = i; var it = PE.items[i]; peLoad(it); PE.caption.value = it.caption; PE.tools.undo.disabled = !PE.hist.length;
  peBase(); peMode('view'); peStrip();
  // switching photos: the next one slides in from the side it is on (and fades), instead of replacing it at once
  var d = dir || (from >= 0 && from !== i ? (i > from ? 1 : -1) : 0);
  if (d && !REDUCE && PE.cv.animate) PE.cv.animate([{opacity: 0, transform: 'translateX(' + (d * 28) + 'px) scale(.98)'}, {opacity: 1, transform: 'none'}], {duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)'});
}
function peStrip(){
  var s = PE.strip, n = PE.items.length; s.textContent = ''; PE.root.classList.toggle('multi', n > 1); PE.tools.del.hidden = n < 2;
  PE.items.forEach(function(it, i){
    var b = el('button', 'pe-thumb' + (i === PE.cur ? ' on' : '') + (it.fresh ? ' fresh' : '')); b.type = 'button'; if (it.fresh){ b.style.animationDelay = (it.fresh - 1) * 40 + 'ms'; it.fresh = 0; }   // new ones pop in, one after the other b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', i === PE.cur ? 'true' : 'false');
    b.setAttribute('aria-label', S('pe.photoN', {n: i + 1, total: n})); var im = el('img'); im.alt = ''; im.src = it.url; b.appendChild(im);
    b.onclick = function(){ if (i !== PE.cur) peShow(i); }; s.appendChild(b); });
  if (n < PE_MAX){ var a = el('button', 'pe-thumb pe-add'); a.type = 'button'; a.setAttribute('aria-label', S('pe.addMore')); a.title = S('pe.addMore'); a.appendChild(svg('<path d="M12 5v14M5 12h14"/>'));
    a.onclick = function(){ PE.adding = true; $('picFile').click(); }; s.appendChild(a); }
  var on = s.querySelector('.on'); if (on && on.scrollIntoView) try { on.scrollIntoView({inline: 'nearest', block: 'nearest'}); } catch(e){}
}
function peRemove(){
  if (!PE || PE.items.length < 2) return;
  var i = PE.cur, last = i >= PE.items.length - 1; URL.revokeObjectURL(PE.items[i].url); PE.items.splice(i, 1); PE.cur = -1; peShow(Math.min(i, PE.items.length - 1), last ? -1 : 1);   // the next one slides in where it was
}
function peOpen(files, append){
  Promise.all(files.map(peLoadImg)).then(function(res){
    var good = res.filter(function(r){ return !r.bad; }), bad = res.length - good.length;
    // a picture the editor can't open (e.g. HEIC outside Safari): alone, send it as it is, like before
    if (!good.length){ if (!append && res.length === 1) setPicRaw(res[0].file); else toast(S('auth.err.photoType')); return; }
    if (bad) toast(S('auth.err.photoType'));
    peEl();
    if (append && PE.open){ var start = PE.items.length; good.slice(0, PE_MAX - start).forEach(function(r, k){ PE.items.push(peItem(r, '', k + 1)); }); peShow(start, 1); return; }
    PE.items.forEach(function(it){ URL.revokeObjectURL(it.url); });
    PE.items = good.slice(0, PE_MAX).map(function(r, i){ return peItem(r, i === 0 ? $('msgInput').value : ''); });
    PE.cur = -1; PE.color = PE.color || PE_COLORS[2]; PE.open = true; PE.root.classList.add('open'); peShow(0);
    // computers: straight to the caption. Phones: no keyboard over the photo — they tap the caption if they want one
    if (!matchMedia('(hover: none) and (pointer: coarse)').matches) setTimeout(function(){ PE.caption.focus({preventScroll:true}); }, 60);
  });
}
/* closing the editor (✕, Back, or after Send) puts the keyboard away: the caption had it open, and the chat behind
   shouldn't pop it up again */
function peClose(){ if (!PE || !PE.open) return; PE.open = false; PE.adding = false; PE.root.classList.remove('open');
  PE.items.forEach(function(it){ URL.revokeObjectURL(it.url); }); PE.items = []; PE.cur = -1; PE.url = null; PE.img = null;
  var a = document.activeElement; if (a && a.blur && a !== document.body) a.blur(); }
/* the picture with rotation / flip applied (at most 2560 px), in its own canvas */
function peBase(){
  peZoomReset();   // (another photo, or turned / flipped: start from the whole picture)
  var im = PE.img, w0 = im.naturalWidth, h0 = im.naturalHeight, k = Math.min(1, 2560 / Math.max(w0, h0)), w = Math.round(w0 * k), h = Math.round(h0 * k), side = PE.rot % 180 !== 0;
  var c = PE.base || document.createElement('canvas'); c.width = side ? h : w; c.height = side ? w : h;
  var x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height);
  x.translate(c.width / 2, c.height / 2); if (PE.flip) x.scale(-1, 1); x.rotate(PE.rot * Math.PI / 180); x.drawImage(im, -w / 2, -h / 2, w, h);
  PE.base = c;
}
function pePush(){ PE.hist.push(JSON.stringify({rot:PE.rot, flip:PE.flip, crop:PE.crop, strokes:PE.strokes, stickers:PE.stickers, aspect:PE.aspect})); if (PE.hist.length > 60) PE.hist.shift(); PE.tools.undo.disabled = false; }
function peUndo(){ var h = PE.hist.pop(); if (!h) return; var o = JSON.parse(h), turned = o.rot !== PE.rot || o.flip !== PE.flip; PE.rot = o.rot; PE.flip = o.flip; PE.crop = o.crop; PE.strokes = o.strokes; PE.stickers = o.stickers || []; PE.selSticker = null; PE.aspect = o.aspect; if (turned) peBase(); PE.tools.undo.disabled = !PE.hist.length; peSubUI(); peRender(); }
function peReset(){ pePush(); PE.rot = 0; PE.flip = false; PE.crop = {x:0, y:0, w:1, h:1}; PE.strokes = []; PE.stickers = []; PE.selSticker = null; PE.aspect = 0; peBase(); peSubUI(); peRender(); }
/* rotate 90° clockwise: crop and drawing turn with the picture */
function peRotate(){
  pePush(); var t = function(p){ return [1 - p[1], p[0]]; }, c = PE.crop;
  PE.crop = {x: 1 - (c.y + c.h), y: c.x, w: c.h, h: c.w};
  PE.strokes.forEach(function(st){ st.pts = st.pts.map(t); });
  PE.stickers.forEach(function(k){ var q = t([k.x, k.y]); k.x = q[0]; k.y = q[1]; k.r += Math.PI / 2; });
  PE.rot = (PE.rot + (PE.flip ? 270 : 90)) % 360; peBase(); peRender();
}
function peFlip(){ pePush(); var c = PE.crop; PE.crop = {x: 1 - (c.x + c.w), y: c.y, w: c.w, h: c.h}; PE.strokes.forEach(function(st){ st.pts = st.pts.map(function(p){ return [1 - p[0], p[1]]; }); }); PE.stickers.forEach(function(k){ k.x = 1 - k.x; k.r = -k.r; }); PE.flip = !PE.flip; peBase(); peRender(); }
function peAspect(a){
  pePush(); PE.aspect = a;
  if (a){ var bw = PE.base.width, bh = PE.base.height, c = PE.crop, cx = c.x + c.w / 2, cy = c.y + c.h / 2, w = c.w, h = (c.w * bw / a) / bh;
    if (h > c.h){ h = c.h; w = (c.h * bh * a) / bw; }
    PE.crop = {x: Math.max(0, Math.min(1 - w, cx - w / 2)), y: Math.max(0, Math.min(1 - h, cy - h / 2)), w: w, h: h}; }
  peSubUI(); peRender();
}
function peMode(m){ if (m === 'crop') peZoomReset(); PE.mode = m; PE.root.dataset.mode = m; PE.tools.crop.classList.toggle('on', m === 'crop'); PE.tools.draw.classList.toggle('on', m === 'draw'); PE.tools.sticker.classList.toggle('on', m === 'sticker'); if (m === 'crop' || m === 'draw') PE.selSticker = null; if (m === 'sticker') peFillTray(); peSubUI(); peRender(); }
function peSubUI(){
  PE.aspects.querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', Number(b.dataset.a) === PE.aspect); });
  PE.colors.querySelectorAll('.pe-color').forEach(function(b){ b.classList.toggle('on', b.dataset.c === PE.color); });
  PE.sizeBtn.textContent = S(PE.size === 1 ? 'pe.thin' : 'pe.thick'); PE.tools.undo.disabled = !PE.hist.length;
}
/* ---- zoom (only in the editor; the chat itself never zooms) ---- */
var PE_ptrs = new Map();
function peZoomReset(){ if (PE) PE.zoom = {z: 1, cx: .5, cy: .5}; }
/** the picture point under a screen point */
function peAt(x, y){ var v = PE.view, r = PE.cv.getBoundingClientRect(); return [v.src.x + (x - r.left) / r.width * v.src.w, v.src.y + (y - r.top) / r.height * v.src.h]; }
/** zoom to z, keeping the picture point under (x, y) where it is (no point: the middle) */
function peZoomTo(z, x, y){
  z = Math.max(1, Math.min(5, z)); var Z = PE.zoom, r = PE.cv.getBoundingClientRect();
  if (x == null){ x = r.left + r.width / 2; y = r.top + r.height / 2; }
  var b = peAt(x, y); Z.z = z; peCenterOn(b, x, y); peRender();
}
/** set the zoom centre so that the picture point b ends up under the screen point (x, y) at the current zoom */
function peCenterOn(b, x, y){
  var st = PE.stage, sr = st.getBoundingClientRect(), W = st.clientWidth, H = st.clientHeight, c = PE.crop, bw = PE.base.width, bh = PE.base.height;
  var k = Math.min((W - 32) / (c.w * bw), (H - 32) / (c.h * bh)), FW = c.w * bw * k * PE.zoom.z, FH = c.h * bh * k * PE.zoom.z;
  var L = (x - sr.left) - (b[0] - c.x) / c.w * FW, T = (y - sr.top) - (b[1] - c.y) / c.h * FH;
  PE.zoom.cx = c.x + (W / 2 - L) / FW * c.w; PE.zoom.cy = c.y + (H / 2 - T) / FH * c.h;
}
function pePair(){ var a = Array.from(PE_ptrs.values()); return {d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2}; }
function peZoomStart(){ var p = pePair(); PE.pinch = {d: p.d, z: PE.zoom.z, b: peAt(p.x, p.y)}; }
function peZoomMove(){
  var p = pePair(), P = PE.pinch;
  // the picture point that was between the fingers stays between them (zoom + move together)
  PE.zoom.z = Math.max(1, Math.min(5, P.z * p.d / P.d)); peCenterOn(P.b, p.x, p.y); peRender();
}
/* where the picture is drawn on screen: the whole picture while cropping, otherwise the cropped part */
function peView(){
  var st = PE.stage, W = st.clientWidth, H = st.clientHeight, bw = PE.base.width, bh = PE.base.height, crop = PE.mode === 'crop';
  var src = crop ? {x:0, y:0, w:1, h:1} : PE.crop, sw = src.w * bw, sh = src.h * bh, k = Math.min((W - 32) / sw, (H - 32) / sh);
  var dw = sw * k, dh = sh * k;
  /* zoomed in (pinch / double-tap), like WhatsApp: the picture itself grows — past its frame, over the whole editor
     screen (behind the toolbars) — and moves with the finger. The canvas covers only the part on screen: `src` is that
     part of the picture, so drawing, stickers and the pointer stay exactly under the finger. */
  var Z = PE.zoom;
  if (!crop && Z && Z.z > 1.001){
    var sr = st.getBoundingClientRect(), rr = PE.root.getBoundingClientRect();
    var A = {l: rr.left - sr.left, t: rr.top - sr.top, r: rr.right - sr.left, b: rr.bottom - sr.top};   // the area it may fill (the whole editor)
    var FW = dw * Z.z, FH = dh * Z.z;
    // the picture point Z.cx / Z.cy sits in the middle of the stage — then no empty space at the edges once it's bigger
    var L = W / 2 - (Z.cx - src.x) / src.w * FW, T = H / 2 - (Z.cy - src.y) / src.h * FH;
    L = FW > A.r - A.l ? Math.min(A.l, Math.max(A.r - FW, L)) : (W - FW) / 2;
    T = FH > A.b - A.t ? Math.min(A.t, Math.max(A.b - FH, T)) : (H - FH) / 2;
    Z.cx = src.x + (W / 2 - L) / FW * src.w; Z.cy = src.y + (H / 2 - T) / FH * src.h;
    var vx = Math.max(L, A.l), vy = Math.max(T, A.t), vw = Math.min(L + FW, A.r) - vx, vh = Math.min(T + FH, A.b) - vy;
    return {src: {x: src.x + (vx - L) / FW * src.w, y: src.y + (vy - T) / FH * src.h, w: vw / FW * src.w, h: vh / FH * src.h}, x: vx, y: vy, w: vw, h: vh, fw: FW, fh: FH, zoomed: true};
  }
  return {src: src, x: (W - dw) / 2, y: (H - dh) / 2, w: dw, h: dh, fw: dw, fh: dh};
}
function peToBase(e){ var v = PE.view, r = PE.cv.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height; return [v.src.x + px * v.src.w, v.src.y + py * v.src.h]; }
function peStrokes(x, src, ox, oy, sw, sh){   // draw the strokes of the 'src' part of the picture into a box (ox, oy, sw × sh)
  var bw = PE.base.width, bh = PE.base.height, unit = Math.max(bw, bh) * (sw / (src.w * bw));
  PE.strokes.forEach(function(st){ if (!st.pts.length) return; x.strokeStyle = st.c; x.lineWidth = unit * (st.s === 2 ? 0.016 : 0.007); x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath();
    st.pts.forEach(function(p, i){ var X = ox + (p[0] - src.x) / src.w * sw, Y = oy + (p[1] - src.y) / src.h * sh; if (i) x.lineTo(X, Y); else x.moveTo(X, Y); });
    if (st.pts.length === 1){ var p0 = st.pts[0], X0 = ox + (p0[0] - src.x) / src.w * sw, Y0 = oy + (p0[1] - src.y) / src.h * sh; x.lineTo(X0 + .01, Y0); } x.stroke(); });
}
/* ---- stickers: {e: emoji | img: picture URL, x, y: centre (0–1 of the rotated picture), s: size (share of its longer side),
   r: rotation (rad)}. Picture stickers keep their own shape inside the square. ---- */
var PE_STICKERS = ['⚽','🏀','🎾','🏈','🏆','🥇','🔥','💯','🎉','🥳','👏','🙌','👍','🙏','💪','😂','😍','😎','🤩','😮','😭','🤑','💰','💸','🎯','⚡','⭐','❤️','✅','🍀'];
var EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif', PE_IMGS = {};
function peStickerImg(url){ var im = PE_IMGS[url]; if (!im){ im = PE_IMGS[url] = new Image(); im.onload = function(){ if (PE && PE.open) peRender(); }; im.src = url; } return im.complete && im.naturalWidth ? im : null; }
function peStickersDraw(x, src, ox, oy, sw, sh){
  var bw = PE.base.width, bh = PE.base.height, k = sw / (src.w * bw), big = Math.max(bw, bh);
  PE.stickers.forEach(function(st){ var px = ox + (st.x - src.x) / src.w * sw, py = oy + (st.y - src.y) / src.h * sh, size = st.s * big * k;
    x.save(); x.translate(px, py); x.rotate(st.r);
    if (st.img){ var im = peStickerImg(st.img); if (im){ var a = im.naturalWidth / im.naturalHeight, w = a >= 1 ? size : size * a, h = a >= 1 ? size / a : size; x.drawImage(im, -w / 2, -h / 2, w, h); } }
    else { x.font = Math.round(size * 0.86) + 'px ' + EMOJI_FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(st.e, 0, size * 0.04); }
    x.restore(); });
}
function peStickerBox(st){   // on screen: centre and side length (px), relative to the stage
  var v = PE.view, bw = PE.base.width, bh = PE.base.height, k = v.w / (v.src.w * bw);
  return {cx: v.x + (st.x - v.src.x) / v.src.w * v.w, cy: v.y + (st.y - v.src.y) / v.src.h * v.h, size: st.s * Math.max(bw, bh) * k};
}
function peSelUI(){
  var sel = PE.sel, st = PE.selSticker; sel.hidden = !st || PE.mode === 'crop' || PE.mode === 'draw'; if (sel.hidden) return;
  var b = peStickerBox(st); sel.style.left = (b.cx - b.size / 2) + 'px'; sel.style.top = (b.cy - b.size / 2) + 'px'; sel.style.width = sel.style.height = b.size + 'px'; sel.style.transform = 'rotate(' + st.r + 'rad)';
}
function peAddSticker(what){ pePush(); var c = PE.crop, st = {e: what.e || null, img: what.img || null, x: c.x + c.w / 2, y: c.y + c.h / 2, s: 0.28 * Math.min(c.w, c.h), r: 0}; PE.stickers.push(st); PE.selSticker = st; peMode('view'); }
function peRemoveSticker(){ var st = PE.selSticker; if (!st) return; pePush(); PE.stickers = PE.stickers.filter(function(k){ return k !== st; }); PE.selSticker = null; peRender(); }
function peStickerAt(e){   // the topmost sticker under the pointer
  var r = PE.stage.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  for (var i = PE.stickers.length - 1; i >= 0; i--){ var st = PE.stickers[i], b = peStickerBox(st), dx = px - b.cx, dy = py - b.cy, c = Math.cos(-st.r), s = Math.sin(-st.r), lx = dx * c - dy * s, ly = dx * s + dy * c; if (Math.abs(lx) <= b.size / 2 && Math.abs(ly) <= b.size / 2) return st; }
  return null;
}
function peStickerDown(e){
  var st = peStickerAt(e); PE.selSticker = st; peRender(); if (!st) return;
  e.preventDefault(); PE.stickers = PE.stickers.filter(function(k){ return k !== st; }).concat([st]);   // the touched one comes to the front
  peStickerMoveStart(e, PE.cv);
}
function peStickerMoveStart(e, target){
  var st = PE.selSticker; pePush(); try { target.setPointerCapture(e.pointerId); } catch(x){}
  var v = PE.view, sx = e.clientX, sy = e.clientY, ox = st.x, oy = st.y;
  var move = function(ev){ st.x = Math.max(0, Math.min(1, ox + (ev.clientX - sx) / v.w * v.src.w)); st.y = Math.max(0, Math.min(1, oy + (ev.clientY - sy) / v.h * v.src.h)); peRender(); };
  var up = function(){ target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); };
  target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
}
var MY_STICKERS = null;   // this account's own stickers [{id, url}], loaded once
function peFillTray(){
  var tray = PE.root.querySelector('.pe-tray'); tray.textContent = '';
  var head = function(t){ tray.appendChild(el('div', 'pe-tray-h', t)); };
  var tile = function(cls, label, content, onPick){ var b = el('button', 'pe-stk ' + cls); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; b.appendChild(content); b.onclick = onPick; tray.appendChild(b); return b; };
  var img = function(url){ var im = document.createElement('img'); im.src = url; im.alt = ''; im.decoding = 'async'; peStickerImg(url); return im; };
  // mine
  head(S('pe.myStickers'));
  var file = document.createElement('input'); file.type = 'file'; file.accept = 'image/png,image/webp,image/gif,image/jpeg,image/svg+xml'; file.hidden = true; tray.appendChild(file);
  var add = tile('pe-stk-add', S('pe.stickerFromDevice'), svg('<path d="M12 5v14M5 12h14"/>'), function(){ file.click(); });
  file.onchange = function(){
    var f = file.files && file.files[0]; file.value = ''; if (!f || !/^image\//.test(f.type)) return;
    if (f.size > 5 * 1024 * 1024){ toast(S('chat.err.imageTooBig')); return; }
    add.classList.add('busy');
    backend.addSticker(f).then(function(st){ add.classList.remove('busy'); MY_STICKERS = [st].concat(MY_STICKERS || []); peAddSticker({img: st.url}); toast(S('pe.stickerSaved'), true); },
      function(err){ add.classList.remove('busy'); toast(err && err.message ? err.message : S('chat.sendFailed')); });
  };
  if (MY_STICKERS === null){ var wait = el('span', 'pe-tray-note', '…'); tray.appendChild(wait);
    backend.myStickers().then(function(list){ MY_STICKERS = list; if (PE && PE.mode === 'sticker') peFillTray(); }, function(){ MY_STICKERS = []; wait.textContent = ''; }); }
  else if (!MY_STICKERS.length) tray.appendChild(el('span', 'pe-tray-note', S('pe.myStickersEmpty')));
  else MY_STICKERS.forEach(function(k){
    var b = tile('pe-stk-img mine', S('pe.addSticker'), img(k.url), function(){ peAddSticker({img: k.url}); });
    var x = el('span', 'pe-stk-x'); x.setAttribute('role', 'button'); x.setAttribute('aria-label', S('pe.deleteMySticker')); x.title = S('pe.deleteMySticker'); x.appendChild(svg('<path d="M6 6l12 12M18 6L6 18"/>'));
    x.onclick = function(e){ e.stopPropagation(); askConfirm(S('pe.deleteMyStickerConfirm'), S('rooms.delete'), true).then(function(y){ if (y) backend.removeSticker(k.id).then(function(){ MY_STICKERS = MY_STICKERS.filter(function(z){ return z.id !== k.id; }); peFillTray(); }, function(){ toast(S('chat.sendFailed')); }); }); };
    b.appendChild(x);
  });
  // team (for everyone)
  if ((cfg.stickers || []).length){ head(S('pe.teamStickers')); cfg.stickers.forEach(function(k){ tile('pe-stk-img', k.name || S('pe.addSticker'), img(k.url), function(){ peAddSticker({img: k.url}); }); }); }
  // emoji
  head(S('pe.emojiStickers'));
  PE_STICKERS.forEach(function(e){ tile('', S('pe.addSticker'), document.createTextNode(e), function(){ peAddSticker({e: e}); }); });
}
function peStickerEvents(sel, rz, del){
  sel.addEventListener('pointerdown', function(e){ if (e.target !== sel) return; e.preventDefault(); peStickerMoveStart(e, sel); });
  del.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
  del.addEventListener('click', function(e){ e.stopPropagation(); peRemoveSticker(); });
  // the round handle: distance from the centre = size, angle = rotation (snaps to straight angles), like WhatsApp / Telegram
  rz.addEventListener('pointerdown', function(e){
    e.preventDefault(); e.stopPropagation(); var st = PE.selSticker; if (!st) return; pePush(); try { rz.setPointerCapture(e.pointerId); } catch(x){}
    var r = PE.stage.getBoundingClientRect(), b = peStickerBox(st), cx = r.left + b.cx, cy = r.top + b.cy;
    var d0 = Math.hypot(e.clientX - cx, e.clientY - cy) || 1, a0 = Math.atan2(e.clientY - cy, e.clientX - cx), s0 = st.s, r0 = st.r;
    var move = function(ev){ var d = Math.hypot(ev.clientX - cx, ev.clientY - cy), a = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      st.s = Math.max(0.05, Math.min(1.2, s0 * d / d0)); var rr = r0 + (a - a0), snap = Math.round(rr / (Math.PI / 2)) * (Math.PI / 2); st.r = Math.abs(rr - snap) < 0.06 ? snap : rr; peRender(); };
    var up = function(){ rz.removeEventListener('pointermove', move); rz.removeEventListener('pointerup', up); rz.removeEventListener('pointercancel', up); };
    rz.addEventListener('pointermove', move); rz.addEventListener('pointerup', up); rz.addEventListener('pointercancel', up);
  });
}

function peRender(){
  if (!PE || !PE.open || !PE.base) return;
  var v = PE.view = peView(), dpr = window.devicePixelRatio || 1, cv = PE.cv, bw = PE.base.width, bh = PE.base.height;
  cv.style.left = v.x + 'px'; cv.style.top = v.y + 'px'; cv.style.width = v.w + 'px'; cv.style.height = v.h + 'px';
  cv.width = Math.round(v.w * dpr); cv.height = Math.round(v.h * dpr);
  var x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, v.w, v.h);
  x.drawImage(PE.base, v.src.x * bw, v.src.y * bh, v.src.w * bw, v.src.h * bh, 0, 0, v.w, v.h);
  peStrokes(x, v.src, 0, 0, v.w, v.h); peStickersDraw(x, v.src, 0, 0, v.w, v.h);
  peSelUI();
  var b = PE.box; b.hidden = PE.mode !== 'crop';
  if (!b.hidden){ var c = PE.crop; b.style.left = (v.x + c.x * v.w) + 'px'; b.style.top = (v.y + c.y * v.h) + 'px'; b.style.width = (c.w * v.w) + 'px'; b.style.height = (c.h * v.h) + 'px'; }
  PE.cv.style.cursor = PE.mode === 'draw' ? 'crosshair' : PE.zoom && PE.zoom.z > 1.001 && PE.mode !== 'crop' ? 'grab' : '';
  PE.root.classList.toggle('zoomed', !!v.zoomed);
  if (PE.zchip){ var zz = PE.zoom ? PE.zoom.z : 1; PE.zchip.hidden = PE.mode === 'crop' || zz <= 1.001; PE.zchip.textContent = zz.toFixed(1) + '×'; }
}
function peCropDrag(e){
  var d = PE.drag, v = PE.view, dx = (e.clientX - d.x) / v.w, dy = (e.clientY - d.y) / v.h, c = Object.assign({}, d.c), MIN = 0.06, h = d.h;
  if (h === 'move'){ c.x = Math.max(0, Math.min(1 - c.w, c.x + dx)); c.y = Math.max(0, Math.min(1 - c.h, c.y + dy)); PE.crop = c; peRender(); return; }
  var L = c.x, T = c.y, R = c.x + c.w, B = c.y + c.h;
  if (h.indexOf('w') >= 0) L = Math.max(0, Math.min(R - MIN, L + dx)); if (h.indexOf('e') >= 0) R = Math.min(1, Math.max(L + MIN, R + dx));
  if (h.indexOf('n') >= 0) T = Math.max(0, Math.min(B - MIN, T + dy)); if (h.indexOf('s') >= 0) B = Math.min(1, Math.max(T + MIN, B + dy));
  if (PE.aspect){   // keep the chosen shape: the height follows the width (or the width follows a pure top/bottom drag)
    var bw = PE.base.width, bh = PE.base.height, wpx = (R - L) * bw, hpx = (B - T) * bh;
    if (h === 'n' || h === 's'){ var nw = hpx * PE.aspect / bw; if (L + nw > 1) nw = 1 - L; R = L + nw; hpx = nw * bw / PE.aspect; if (h === 'n') T = B - hpx / bh; else B = T + hpx / bh; }
    else { var nh = wpx / PE.aspect / bh; if (h.indexOf('n') >= 0){ T = Math.max(0, B - nh); } else { B = Math.min(1, T + nh); } var realH = (B - T) * bh, nw2 = realH * PE.aspect / bw; if (h.indexOf('w') >= 0) L = R - nw2; else R = L + nw2; }
  }
  PE.crop = {x: L, y: T, w: R - L, h: B - T}; peRender();
}
/* the current photo with its edits, drawn at full size (sync) */
function peDrawOut(){
  var bw = PE.base.width, bh = PE.base.height, c = PE.crop, sw = Math.max(1, Math.round(c.w * bw)), sh = Math.max(1, Math.round(c.h * bh));
  var out = document.createElement('canvas'); out.width = sw; out.height = sh; var x = out.getContext('2d');
  x.drawImage(PE.base, c.x * bw, c.y * bh, sw, sh, 0, 0, sw, sh); peStrokes(x, c, 0, 0, sw, sh); peStickersDraw(x, c, 0, 0, sw, sh);
  return out;
}
function peBlob(cv){ return new Promise(function(res){ cv.toBlob(function(b){ res(b); }, 'image/jpeg', 0.92); }); }
function peSend(){
  if (!PE || PE.sending) return;
  peSave();
  var items = PE.items.slice();
  // every photo drawn with its own edits (each one loaded in turn, then the shown one put back)
  var cur = PE.cur, outs = items.map(function(it){ peLoad(it); peBase(); return peDrawOut(); }); peLoad(items[cur]); peBase();
  if (items.length === 1){
    var caption = items[0].caption, out = outs[0];
    PE.sending = true;
    peBlob(out).then(function(blob){ PE.sending = false;
      if (!blob){ toast(S('auth.err.photoType')); return; }
      var file = new File([blob], 'photo.jpg', {type: 'image/jpeg'});
      if (file.size > 10 * 1024 * 1024){ toast(S('chat.err.imageTooBig')); return; }
      UI.pic = {file: file, url: URL.createObjectURL(blob), w: out.width, h: out.height}; $('picThumb').src = UI.pic.url; $('picName').textContent = S('chat.photo');
      peClose(); $('msgInput').value = caption; refreshSend(); $('composer').requestSubmit(); });
    return;
  }
  // several: the same checks as the message box, once for the album and for each caption
  if (!CHAT.db || needsRules()) return;
  var problem = slowApplies() && Date.now() < UI.slowUntil ? S('rule.slow', {s: Math.ceil((UI.slowUntil - Date.now()) / 1000)}) : null, badAt = -1;
  if (!problem) items.some(function(it, i){ var t = it.caption.trim(); var p = t ? checkMessage(t.slice(0, MAXLEN)) : null; if (p){ problem = p; badAt = i; } return !!p; });
  if (problem){ if (badAt >= 0 && badAt !== PE.cur) peShow(badAt); toast(problem); return; }
  PE.sending = true;
  Promise.all(outs.map(peBlob)).then(function(blobs){ PE.sending = false;
    if (blobs.some(function(b){ return !b; })){ toast(S('auth.err.photoType')); return; }
    if (blobs.some(function(b){ return b.size > 10 * 1024 * 1024; })){ toast(S('chat.err.imageTooBig')); return; }
    var list = blobs.map(function(b, i){ return {blob: b, w: outs[i].width, h: outs[i].height, caption: items[i].caption}; });
    peClose(); $('msgInput').value = ''; $('msgInput').style.height = ''; refreshSend();
    sendAlbum(list);
  });
}
/* Photos picked together: they all appear at once (in order), then upload one after the other so they arrive in that order.
   One album = one post for slow mode (the server agrees, by the batch id). A reply goes with the first photo. */
async function sendAlbum(list){
  var room = CHAT.active, dmTo = room === 'support' ? CHAT.uid : (String(room).indexOf('sup:') === 0 ? room.slice(4) : null), pmTo = pmUid(room);
  var batch = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), reply = CHAT.replyTo || null, t0 = Date.now();
  clearReply();
  var jobs = list.map(function(p, i){
    var clientId = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + i, url = URL.createObjectURL(p.blob), text = p.caption.trim().slice(0, MAXLEN);
    var doc = {clientId: clientId, text: text, room: dmTo || pmTo ? null : room, dmTo: dmTo, pmTo: pmTo, reply: i === 0 ? reply : null, batch: batch};
    CHAT.pending[clientId] = true;
    backend.addOptimistic({id: clientId, by: CHAT.uid, text: text, ts: t0 + i, room: dmTo ? (dmTo === CHAT.uid ? 'support' : 'sup:' + dmTo) : room, reply: doc.reply, mod: CHAT.canEdit || undefined, image: {url: url, w: p.w, h: p.h}}, dmTo, pmTo);
    UPLOADS[clientId] = {k: 0, ctl: {}, url: url};
    return {doc: doc, file: new File([p.blob], 'photo.jpg', {type: 'image/jpeg'}), clientId: clientId};
  });
  renderConvo('mine'); startSlow(); backend.presence({typing: false});
  for (var i = 0; i < jobs.length; i++){
    var j = jobs[i];
    var u = UPLOADS[j.clientId];
    if (!u || u.cancelled){ delete CHAT.pending[j.clientId]; delete UPLOADS[j.clientId]; backend.dropOptimistic(j.clientId, dmTo, pmTo); renderConvo(); continue; }   // cancelled (✕) while waiting its turn
    try { await backend.sendImage(j.doc, j.file, (function(id){ return function(a, t){ uploadProgress(id, a, t); }; })(j.clientId), UPLOADS[j.clientId].ctl); delete CHAT.pending[j.clientId]; renderConvo('mine'); }
    catch(err){ delete CHAT.pending[j.clientId]; delete UPLOADS[j.clientId]; backend.dropOptimistic(j.clientId, dmTo, pmTo); renderConvo();
      if (!(err && err.aborted)) toast(err && err.message ? err.message : S('chat.sendFailed')); }
  }
}
$('attachBtn').onclick = function(){ if (needsRules()) return; $('picFile').click(); };
/* Android's photo picker hands over a picture it may still be copying (from the cloud / gallery): the first read could
   fail, so the editor said "can't be used as a photo" — and choosing it again worked. Read the file fully first, with a
   few retries, then open it from the bytes in memory. */
function readPicked(f, tries){
  return f.arrayBuffer().then(function(buf){ if (!buf.byteLength) throw new Error('empty'); return buf; }, function(err){ throw err; })
    .catch(function(err){ if (tries <= 0) throw err; return new Promise(function(r){ setTimeout(r, 350); }).then(function(){ return readPicked(f, tries - 1); }); });
}
function picTypeOf(buf, given){
  if (given && given !== 'application/octet-stream') return given;
  var b = new Uint8Array(buf.slice(0, 12)), hex = Array.prototype.map.call(b, function(x){ return ('0' + x.toString(16)).slice(-2); }).join('');
  if (hex.indexOf('ffd8ff') === 0) return 'image/jpeg'; if (hex.indexOf('89504e47') === 0) return 'image/png'; if (hex.indexOf('47494638') === 0) return 'image/gif';
  if (hex.indexOf('52494646') === 0 && hex.slice(16, 24) === '57454250') return 'image/webp';
  if (hex.slice(8, 16) === '66747970') return /^(68656963|68656978|6d696631|6d736631)/.test(hex.slice(16, 24)) ? 'image/heic' : 'image/avif';
  return given || '';
}
$('picFile').onchange = function(){
  var input = this, files = Array.prototype.slice.call(this.files || []), append = !!(PE && PE.open && PE.adding);
  if (PE) PE.adding = false;
  if (!files.length) return;
  var room = PE_MAX - (append ? PE.items.length : 0);
  if (files.length > room){ toast(S('pe.err.max', {n: PE_MAX})); files = files.slice(0, Math.max(0, room)); }
  Promise.all(files.map(function(f){ return readPicked(f, 4).then(function(buf){ return new File([buf], f.name || 'photo', {type: picTypeOf(buf, f.type) || 'image/jpeg', lastModified: f.lastModified}); }, function(){ return null; }); }))
    .then(function(list){ input.value = ''; if (list.some(function(x){ return !x; })) toast(S('chat.err.picRead')); setPic(list, append); });
};
tapKeepFocus($('picClose'), clearPic);
$('msgInput').setAttribute('maxlength', String(MAXLEN));
$('msgInput').addEventListener('input', function(){
  var t = this, h0 = t.offsetHeight; t.style.height = 'auto'; var h1 = Math.min(140, t.scrollHeight); t.style.height = h0 + 'px'; void t.offsetHeight; t.style.height = h1 + 'px';
  var c = $('counter'), n = t.value.length; c.textContent = n + '/' + MAXLEN; c.classList.toggle('show', n > MAXLEN * 0.75); c.classList.toggle('warn', n > MAXLEN * 0.95);
  refreshSend(); setPresence();
  clearTimeout(CHAT.typingTimer); CHAT.typingTimer = setTimeout(function(){ if (CHAT.db) backend.presence({typing:false}); }, 4000);
});
$('msgInput').addEventListener('keydown', function(e){ if (e.key === 'Enter' && !e.shiftKey && !e.isComposing){ e.preventDefault(); $('composer').requestSubmit(); } });
// slow mode: members only, and only in shared rooms (lounge, match rooms, groups) — never for the team or one-to-one chats
function slowApplies(){ return !!SLOW_MS && !CHAT.canEdit && !isDmRoom(CHAT.active); }
function startSlow(){
  if (!slowApplies()) return;
  UI.slowUntil = Date.now() + SLOW_MS; var ring = $('slowRing'), num = $('slowNum'), ic = $('sendIc');
  num.hidden = false; ic.style.visibility = 'hidden';
  (function tick(){ var left = UI.slowUntil - Date.now();
    if (left <= 0){ ring.style.strokeDashoffset = 145; num.hidden = true; ic.style.visibility = ''; refreshSend(); return; }
    ring.style.strokeDashoffset = 145 * (1 - left / SLOW_MS); num.textContent = Math.ceil(left / 1000); refreshSend(); requestAnimationFrame(tick); })();
}
/* On-screen keyboard. Phones open it OVER the page (Android Chrome, iOS Safari — on iPhone it is see-through). The chat
   (and the photo editor, the pop-up forms) keep covering the whole screen, the keyboard covers their lower part, and only
   what you type in is lifted above it: the message box (with a little space), the caption, a form's buttons. The
   conversation shrinks from the bottom, so the latest messages stay just above the box.
   Values on the page root: --vvt (where the visible area starts), --vvh (its height), --vvfull (the screen height without
   the keyboard), --kb (how much the keyboard covers) + the class kb-open. */
(function(){
  var vv = window.visualViewport; if (!vv) return;
  var m = $('messenger'), root = document.documentElement, raf = 0, base = {w: 0, h: 0};
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(function(ev){ document.addEventListener(ev, function(){ base.h = 0; soon(); }); });   // the screen's height changed: measure again
  document.addEventListener('focusin', function(){ soon(); }); document.addEventListener('focusout', function(){ setTimeout(soon, 50); });
  function sync(){ raf = 0;
    if (vv.scale > 1.01){ ['--vvh', '--vvt', '--vvfull', '--kb'].forEach(function(k){ root.style.removeProperty(k); }); m.classList.remove('kb-open'); root.classList.remove('kb-open'); return; }   // (pinch-zoomed: leave it)
    // keyboard up? The visible area is clearly shorter than the tallest seen at this width while a text box has the focus.
    // (Comparing with the page height alone missed it when the whole page shrinks with the keyboard.)
    var w = window.innerWidth; if (w !== base.w){ base.w = w; base.h = 0; }
    var a = document.activeElement, typing = !!a && (a.tagName === 'TEXTAREA' || a.isContentEditable || (a.tagName === 'INPUT' && /^(text|search|email|password|url|tel|number)$/.test(a.type)));
    var kb = window.innerHeight - vv.height > 120 || (typing && base.h - vv.height > 120);
    if (!kb) base.h = Math.max(base.h, vv.height, window.innerHeight);   // (the full height is learnt while the keyboard is down)
    var full = kb ? Math.max(base.h, vv.height) : vv.height, cover = kb ? Math.max(0, full - vv.height) : 0;
    root.style.setProperty('--vvh', vv.height + 'px'); root.style.setProperty('--vvt', vv.offsetTop + 'px');
    root.style.setProperty('--vvfull', full + 'px'); root.style.setProperty('--kb', cover + 'px');
    m.classList.toggle('kb-open', kb && m.classList.contains('open')); root.classList.toggle('kb-open', kb);
    if (kb && window.scrollY) window.scrollTo(0, 0);   // iOS scrolls the page under the fixed chat to show the box: not needed
  }
  function soon(){ if (!raf) raf = requestAnimationFrame(sync); }
  vv.addEventListener('resize', soon); vv.addEventListener('scroll', soon);
  new MutationObserver(soon).observe(m, {attributes: true, attributeFilter: ['class']});
  // the conversation read to the end stays at the end while its height changes (keyboard up / down, box growing)
  var wall = $('wall'), atEnd = true;
  if (wall){
    wall.addEventListener('scroll', function(){ atEnd = wall.scrollHeight - wall.scrollTop - wall.clientHeight < 40; }, {passive: true});
    if (window.ResizeObserver) new ResizeObserver(function(){ if (atEnd) wall.scrollTop = wall.scrollHeight; }).observe(wall);
  }
})();
/* Send keeps the keyboard open (people often write several messages in a row): tapping the button must not take the focus
   from the text box — the tap still sends */
['pointerdown', 'mousedown'].forEach(function(ev){ $('sendBtn').addEventListener(ev, function(e){ if (document.activeElement === $('msgInput') && !(e.button > 0)) e.preventDefault(); }); });
$('composer').addEventListener('submit', async function(e){
  e.preventDefault(); var input = $('msgInput'), text = input.value.trim().slice(0, MAXLEN);
  var pic = UI.pic;
  if ((!text && !pic) || !CHAT.db) return; if (needsRules()) return;
  var problem = text ? checkMessage(text) : (slowApplies() && Date.now() < UI.slowUntil ? S('rule.slow', {s: Math.ceil((UI.slowUntil - Date.now()) / 1000)}) : null);
  if (problem){ var c = $('composer'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); toast(problem); return; }
  var dmTo = CHAT.active === 'support' ? CHAT.uid : (String(CHAT.active).indexOf('sup:') === 0 ? CHAT.active.slice(4) : null);
  var pmTo = pmUid(CHAT.active);
  var clientId = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  var doc = {clientId: clientId, text: text, room: dmTo || pmTo ? null : CHAT.active, dmTo: dmTo, pmTo: pmTo, reply: CHAT.replyTo || null};
  if (text){ UI.lastText = text.toLowerCase(); UI.lastTextAt = Date.now(); }
  input.value = ''; input.style.height = ''; $('counter').classList.remove('show'); clearReply(); clearPic(); startSlow();
  backend.presence({typing:false});
  CHAT.pending[clientId] = true;
  backend.addOptimistic({id: clientId, by: CHAT.uid, text: text, ts: Date.now(), room: dmTo ? (dmTo === CHAT.uid ? 'support' : 'sup:' + dmTo) : CHAT.active, reply: doc.reply, mod: CHAT.canEdit || undefined, image: pic ? {url: pic.url, w: pic.w, h: pic.h} : undefined}, dmTo, pmTo);
  renderConvo('mine');
  var up = pic ? (UPLOADS[clientId] = {k: 0, ctl: {}, url: pic.url}) : null;
  try { await (pic ? backend.sendImage(doc, pic.file, function(a, t){ uploadProgress(clientId, a, t); }, up.ctl) : backend.send(doc)); delete CHAT.pending[clientId]; renderConvo('mine'); }
  catch(err){ delete CHAT.pending[clientId]; delete UPLOADS[clientId]; backend.dropOptimistic(clientId, dmTo, pmTo); input.value = text; UI.slowUntil = 0; if (pic){ UI.pic = pic; $('picWrap').classList.add('show'); } renderConvo();
    if (!(err && err.aborted)) toast(err && err.message ? err.message : S('chat.sendFailed'));   // cancelled: the picture and text are back in the box
    refreshSend(); }
});
function applyComposer(){
  var gate = $('gate'), gt = $('gateText'), gb = $('gateBtn'), comp = $('composer'), msg = null, showBtn = false, btnLabel = S('chat.readRules'), btnAction = openRules, gb2 = null;
  if (!CHAT.db) msg = S('chat.gate.unavailable');
  else if (!CHAT.uid){ msg = S('chat.gate.signIn'); showBtn = true; btnLabel = S('chat.signIn'); btnAction = function(){ backend.openSignIn(); }; }
  else if (!CHAT.canPost) msg = S('chat.gate.readOnly');
  else if (UI.mod.muted[CHAT.uid]) msg = S('chat.gate.muted');
  else if (!UI.accepted){ msg = S('chat.gate.rules'); showBtn = true; }
  else if (CHAT.active === 'lounge' && cfg.chat && cfg.chat.loungeTeamOnly && !CHAT.canEdit) msg = S('chat.gate.loungeTeam');
  else if (grpOf(CHAT.active) && !grpOf(CHAT.active).canPost){ var gr = grpOf(CHAT.active), gid = gr.id;
    var go = function(fn, ok){ return function(){ fn(gid).then(function(){ if (ok) toast(ok, true); }, function(e){ toast(e.message); }); }; };
    if (gr.status === 'invited'){ msg = S('groups.gate.invited', {name: gr.name}); showBtn = true; btnLabel = S('groups.join'); btnAction = go(backend.groupJoin, S('groups.joined', {name: gr.name}));
      gb2 = {label: S('groups.decline'), action: go(backend.groupLeave)}; }
    else if (gr.status === 'requested'){ msg = S('groups.gate.requested'); showBtn = true; btnLabel = S('groups.cancelRequest'); btnAction = go(backend.groupLeave); }
    else if (gr.status === 'member') msg = S(gr.owned ? 'groups.gate.channelOwned' : 'groups.gate.channel');
    else if (gr.join === 'open'){ msg = S('groups.gate.open', {name: gr.name}); showBtn = true; btnLabel = S('groups.join'); btnAction = go(backend.groupJoin, S('groups.joined', {name: gr.name})); }
    else if (gr.join === 'invite') msg = S('groups.gate.inviteOnly', {name: gr.name});   // visible, but you can't ask: an invite or the link
    else { msg = S('groups.gate.request', {name: gr.name}); showBtn = true; btnLabel = S('groups.requestJoin'); btnAction = go(backend.groupJoin, S('groups.requested')); } }
  else if (pmUid(CHAT.active)){ var rel = PM.rels[pmUid(CHAT.active)];
    if (!rel || rel.status === 'pending-out'){ msg = S('pm.waiting', {name: nameOf(pmUid(CHAT.active))}); showBtn = !!rel; btnLabel = S('pm.cancel'); btnAction = function(){ backend.pmRespond(pmUid(CHAT.active), 'cancel'); }; }
    else if (rel.status === 'blocked') msg = S('pm.blockedGate'); }
  comp.hidden = !!msg; gate.hidden = !msg; updateAttach(); gb.hidden = !showBtn; gb.textContent = btnLabel; gb.onclick = btnAction;
  var g2 = $('gateBtn2'); if (g2){ g2.hidden = !gb2; if (gb2){ g2.textContent = gb2.label; g2.onclick = gb2.action; } }
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

/* ---------- The chat is a page: /<locale>/chat[/<room>] ----------
   Own address for the room list and every room (refresh / share safe), browser Back works like on any site, no opening animation.
   Rooms in the address: lounge, a match id, support, g-<id> (group), pm-<id> (private chat), sup-<id> (team thread, staff). */
var CH = {base: '/' + cfg.locale + '/chat', site: '/' + cfg.locale, scroll: 0, title: cfg.siteName || document.title};
// Next.js sets the page <title> after hydration: set ours now and once more right after
function setTitle(t){ document.title = t; setTimeout(function(){ document.title = t; }, 0); setTimeout(function(){ document.title = t; }, 400); }
/* the member's own help chat has the conversation's id in its address too: /chat/team-<member id> (the team opens the
   same conversation as /chat/sup-<member id>); old /chat/support links still work and switch to it */
function chatPathFor(id){
  if (id === 'support' && CHAT.uid && /^[a-f0-9]{24}$/i.test(CHAT.uid)) return CH.base + '/team-' + CHAT.uid;
  return id ? CH.base + '/' + encodeURIComponent(String(id).replace(/^(sup|pm|g):/, '$1-')) : CH.base;
}
function chatFromPath(){
  var p = location.pathname.replace(/\/+$/, '');
  if (p === CH.base) return {open:true, room:''};
  if (p.indexOf(CH.base + '/') !== 0) return {open:false, room:''};
  var seg = decodeURIComponent(p.slice(CH.base.length + 1)), m = /^(sup|pm|g)-([a-f0-9]{24})$/i.exec(seg);
  var j = /^join-([A-Za-z0-9_-]{8,40})$/.exec(seg);
  if (j){ try { sessionStorage.setItem('oc_join', j[1]); } catch(e){} try { history.replaceState(history.state, '', CH.base); } catch(e){} return {open:true, room:''}; }
  if (/^team-[a-f0-9]{24}$/i.test(seg)) return {open:true, room:'support'};
  return {open:true, room: m ? m[1] + ':' + m[2] : seg};
}
// old #chat… links (bookmarks, earlier versions) → the page address
function fromOldHash(){ var h = location.hash.replace(/^#/, ''); if (h === 'chat' || h.indexOf('chat-') === 0){ var id = h === 'chat' || h === 'chat-dm' ? '' : roomFromHash(h); if (!isOpen()) CH.scroll = window.scrollY || 0; history.replaceState(isOpen() ? history.state : {oc: 1, depth: 1, fromSite: true}, '', chatPathFor(id)); return true; } return false; }
fromOldHash();
window.addEventListener('hashchange', function(){ if (fromOldHash()) route(); });
/** Go to the chat (room list or a room). From the site it's a new page in the history; between rooms too (Back returns). */
function goChat(id, opts){
  opts = opts || {}; var url = chatPathFor(id), st = history.state || {};
  if (location.pathname === url){ route(); return; }
  if (!isOpen()){ CH.scroll = window.scrollY || 0; history.pushState({oc: 1, depth: 1, fromSite: true}, '', url); }
  else if (opts.replace) history.replaceState(st, '', url);
  else history.pushState({oc: 1, depth: (st.depth || 0) + 1, fromSite: !!st.fromSite}, '', url);
  route();
}
/** Back to the site: undo the chat pages when we came from the site (keeps the scroll position), else open the home page. */
function leaveChat(){
  var st = history.state || {};
  if (st.fromSite && st.depth){ history.go(-st.depth); return; }
  CH.scroll = 0; history.pushState(null, '', CH.site); route();
}
function rectOf(r){ return {x:r.left, y:r.top, w:r.width, h:r.height, rad:Math.min(r.height / 2, 28)}; }
function isOpen(){ return $('messenger').classList.contains('open'); }
/* the chat is open and we know nobody is signed in: offer the sign-in sheet once (they can go on as a guest) */
function maybePromptSignIn(){
  if (!UI.ready || CHAT.uid || !CHAT.db || !isOpen() || !backend.promptSignIn) return;
  var join = null; try { join = sessionStorage.getItem('oc_join'); } catch(e){}
  if (join) return;   // an invite link opens the sign-in itself
  if (UI.prompted) return;   // once per opening of the chat (not again on every room change); reset when the chat closes
  UI.prompted = true;
  clearTimeout(UI.promptT); UI.promptT = setTimeout(function(){ if (isOpen() && !CHAT.uid) backend.promptSignIn(); }, 700);
}
/* a conversation is really on screen (not the welcome page shown when none is chosen) */
function viewing(){ var m = $('messenger'); return m.classList.contains('open') && !m.classList.contains('no-room'); }
function siteInert(on){ ['.nav', 'main#top', 'footer', '.to-top'].forEach(function(q){ var e = document.querySelector(q); if (e){ if (on) e.setAttribute('inert', ''); else e.removeAttribute('inert'); } }); }
/* No zoom while the chat is open (like a messaging app): the page settings say so (Android; on iPhone it also stops the
   automatic zoom-in when tapping the message box), the chat's areas don't allow pinch / double-tap zoom (CSS), and
   iPhone Safari's own pinch gesture is cancelled. Everything is back to normal on the site. */
var ZOOM = {meta: document.querySelector('meta[name="viewport"]'), was: null, on: false};
function noZoom(e){ if (ZOOM.on) e.preventDefault(); }
['gesturestart', 'gesturechange'].forEach(function(ev){ document.addEventListener(ev, noZoom, {passive: false}); });
/* the page's own background = the chat's (seen under the see-through iPhone keyboard), set when the chat opens and when
   the theme / wallpaper changes */
function paintBackdrop(){ var c = document.querySelector('#messenger .convo'); if (!c) return; var bg = getComputedStyle(c).backgroundColor; if (bg && bg !== 'rgba(0, 0, 0, 0)') document.documentElement.style.setProperty('--chat-backdrop', bg); }
function lockZoom(on){
  if (on === ZOOM.on) return; ZOOM.on = on;
  var m = ZOOM.meta || (ZOOM.meta = document.querySelector('meta[name="viewport"]')); if (!m) return;
  if (on){ ZOOM.was = m.getAttribute('content'); m.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'); }
  else if (ZOOM.was != null) m.setAttribute('content', ZOOM.was);
}
function showMessenger(){ var m = $('messenger'); m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); markSeen(); renderRooms(); setPresence(); setTimeout(function(){ placeSegPill(); placeRoomPill(); }, 30); }
/* Invite link: join the group / channel, then open it. Not signed in yet: ask to sign in (the token waits in this tab). */
var JOINING = false;
function tryJoinLink(){
  var token = null; try { token = sessionStorage.getItem('oc_join'); } catch(e){}
  if (!token || JOINING || !CHAT.db) return;
  if (!CHAT.uid){ toast(S('rooms.joinSignIn')); backend.openSignIn(); return; }
  JOINING = true;
  backend.joinLink(token).then(function(r){ JOINING = false; try { sessionStorage.removeItem('oc_join'); } catch(e){} toast(S('rooms.joinedByLink', {name: r.name}), true); goChat('g:' + r.id, {replace:true}); },
    function(err){ JOINING = false; try { sessionStorage.removeItem('oc_join'); } catch(e){} toast(err && err.message ? err.message : S('rooms.err.badLink')); });
}
function route(){
  var st = chatFromPath(), m = $('messenger');
  if (st.open){
    var id = st.room;
    // staff: a member's team thread can be opened even before it has messages
    if (CHAT.canEdit && /^sup:[a-f0-9]{24}$/i.test(id) && !DM.threads[id.slice(4)]) DM.threads[id.slice(4)] = {lastTs: Date.now(), lastText: '', lastSeen: 0};
    var wasOpen = isOpen() && document.body.classList.contains('chat-open'), valid = id && rooms().some(function(r){ return r.id === id; });
    // after a refresh the private chats arrive a moment later: remember the room and come back to it
    CHAT.wantRoom = !valid && (/^(sup|pm|g):/.test(id) || id === 'support') && !UI.ready ? id : null;   // (the help chat too: it appears once the account is known)
    if (valid && String(id).indexOf('sup:') === 0) ensureThread(id.slice(4));
    if (valid){ CHAT.active = id; m.classList.add('in-convo'); } else { if (!CHAT.wantRoom) m.classList.remove('in-convo'); CHAT.active = CHAT.active || 'lounge'; }
    m.classList.toggle('no-room', !valid && !CHAT.wantRoom);   // nothing chosen: the welcome page (wide screens), not a room at random
    m.classList.toggle('want-room', !!CHAT.wantRoom);   // after a refresh, until the room arrives: placeholders, not another room
    if (valid && id === 'support' && location.pathname !== chatPathFor('support')) { try { history.replaceState(history.state, '', chatPathFor('support')); } catch(e){} }
    if (!wasOpen){
      document.documentElement.classList.add('chat-open'); document.body.classList.add('chat-open'); if (lenis) lenis.stop();
      siteInert(true); showMessenger(); lockZoom(true); paintBackdrop();
      maybePromptSignIn();
    }
    clearReply(); closeCtx(true); renderRooms(); renderHeader(); renderConvo(); setPresence(); placeRoomPill(); applyComposer();
    setTitle((valid ? roomById(id).title + ' · ' : '') + S('chat.title') + ' · ' + (cfg.siteName || ''));
    if (window.innerWidth > 820 && valid) setTimeout(function(){ if (!$('composer').hidden) $('msgInput').focus({preventScroll:true}); }, 50);
    UI.routed = true;
  } else if (isOpen()){
    UI.routed = true; UI.prompted = false; clearTimeout(UI.promptT);   // back on the site: next time the chat opens, offer sign-in again
    closeCtx(true);
    m.classList.remove('open', 'in-convo'); m.setAttribute('aria-hidden', 'true'); lockZoom(false);
    document.documentElement.classList.remove('chat-open'); document.body.classList.remove('chat-open'); siteInert(false);
    setTitle(CH.title);
    // back where the visitor was on the site
    if (lenis){ lenis.start(); lenis.scrollTo(CH.scroll, {immediate: true}); } else window.scrollTo(0, CH.scroll);
    setPresence(); renderRooms();
  }
}
window.addEventListener('popstate', route);
// links to the chat (nav button, lounge card, match "event chat" buttons…) open the chat page without reloading
document.addEventListener('click', function(e){
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  var a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
  var href = a.getAttribute('href');
  if (a.id === 'chatClose'){ e.preventDefault(); leaveChat(); return; }
  if (href === CH.base || href.indexOf(CH.base + '/') === 0){
    e.preventDefault(); var seg = decodeURIComponent(href.slice(CH.base.length + 1)), mm = /^(sup|pm|g)-([a-f0-9]{24})$/i.exec(seg);
    goChat(href === CH.base ? '' : (mm ? mm[1] + ':' + mm[2] : seg));
  }
});
window.addEventListener('resize', function(){ placeSegPill(); placeRoomPill(); });
$('backBtn').onclick = function(){ var st = history.state || {}; if ((st.depth || 0) > 1) history.back(); else goChat('', {replace: true}); };
document.addEventListener('keydown', function(e){
  if (e.key !== 'Escape') return;
  if (CTX.row){ closeCtx(); return; }
  if ($('rulesSheet').classList.contains('open')){ closeRules(); return; }
  if (isOpen()){ if ($('replyWrap').classList.contains('show')) clearReply(); else leaveChat(); }
});

/* ---------- Chat themes (per viewer; only the chat changes) ---------- */
var THEMES = ['oddsclub','whatsapp','whatsapp-dark','telegram','imessage','messenger','discord','signal'].map(function(id){ return [id, S('theme.' + id + '.name'), S('theme.' + id + '.desc')]; });
CHAT.theme = (function(){ var t = store('ps_chat_theme'); return THEMES.some(function(x){ return x[0] === t; }) ? t : 'oddsclub'; })();
/* bubble style (shape) — chosen after the theme; the colours stay the theme's. Not for Discord (no bubbles there). */
var BUBBLES = ['theme','classic','curl','pill','card','outline','comic','leaf'];
CHAT.bubble = (function(){ var b = store('ps_bubble'); return BUBBLES.indexOf(b) >= 0 ? b : 'theme'; })();
function setBubbleAttr(){ ['messenger','ctx'].forEach(function(k){ var e = $(k); if (e){ e.classList.add('bs-scope'); e.setAttribute('data-bs', CHAT.bubble); } }); }
function applyBubble(id){
  var run = function(){ CHAT.bubble = id; store('ps_bubble', id); setBubbleAttr();
    document.querySelectorAll('.bcard').forEach(function(c){ c.setAttribute('aria-pressed', c.dataset.id === id ? 'true' : 'false'); }); };
  if (!REDUCE && document.startViewTransition){ try { document.startViewTransition(run); return; } catch(e){} }
  run();
}
function renderBubbleCards(){
  var list = $('bubbleList'); if (!list) return; list.textContent = '';
  BUBBLES.forEach(function(id, i){
    var b = el('button', 'tcard bcard'); b.type = 'button'; b.dataset.id = id; b.setAttribute('aria-pressed', id === CHAT.bubble ? 'true' : 'false'); b.style.animationDelay = (i * 35) + 'ms';
    // a tiny chat in the chosen theme's colours, with this shape
    var pv = el('div', 'bprev bs-scope'); pv.setAttribute('aria-hidden', 'true'); pv.setAttribute('data-ct', CHAT.theme); pv.setAttribute('data-bs', id);
    [['in gap', S('bubbles.sample1')], ['in tail', S('bubbles.sample2')], ['out gap tail', S('bubbles.sample3')]].forEach(function(x){ var r = el('div', 'row ' + x[0]), w = el('div', 'bwrap'); w.appendChild(el('div', 'bubble', x[1])); r.appendChild(w); pv.appendChild(r); });
    b.appendChild(pv);
    var nm = el('div', 'tname'), lb = el('span'); lb.appendChild(el('b', null, S('bubble.' + id))); lb.appendChild(el('small', null, S('bubble.' + id + '.desc'))); nm.appendChild(lb); var ck = el('span', 'tcheck'); ck.appendChild(svg('<path d="M5 12l5 5 9-10"/>')); nm.appendChild(ck); b.appendChild(nm);
    b.onclick = function(){ applyBubble(id); };
    list.appendChild(b);
  });
}
function themeStep(n){
  var box = $('themeSteps'); if (!box) return;
  var panes = [$('tsThemes'), $('tsBubbles'), $('tsWalls'), $('tsFonts')], prev = Number(box.getAttribute('data-step')) || 1;
  if (n === 2) renderBubbleCards(); if (n === 3) renderWallCards(); if (n === 4) renderFontCards();
  box.setAttribute('data-step', String(n)); panes.forEach(function(p, i){ p.hidden = i !== n - 1; });
  var cur = panes[n - 1]; cur.classList.remove('ts-in-l', 'ts-in-r'); void box.offsetWidth; cur.classList.add(n >= prev ? 'ts-in-r' : 'ts-in-l');
  box.scrollTop = 0;
  setTimeout(function(){ var c = cur.querySelector('[aria-pressed="true"]'); if (c) c.focus({preventScroll:true}); }, 60);
}
/* ---------- chat wallpaper (per device): "theme" = the theme's own background, "plain" = its colour only, or one of ours
   (back office → Wallpapers). A wallpaper deleted in the back office falls back to the theme's. ---------- */
var WALLS = ['theme', 'plain'].concat((cfg.wallpapers || []).map(function(w){ return w.id; }));
function wallOf(id){ return (cfg.wallpapers || []).filter(function(w){ return w.id === id; })[0] || null; }
CHAT.wall = (function(){ var w = store('ps_wall'); return WALLS.indexOf(w) >= 0 ? w : 'theme'; })();
/* how dark each of our wallpapers is on this device (the slider under the list); default = the back office's value */
var WALL_DIM = (function(){ var d = store('ps_wall_dim'); return d && typeof d === 'object' ? d : {}; })();
function wallDim(id){ var w = wallOf(id); return WALL_DIM[id] != null ? Number(WALL_DIM[id]) : w ? (w.dim || 0) : 0; }
function syncWallDim(){
  var box = $('wallDim'), r = $('wallDimRange'); if (!box) return;
  var w = wallOf(CHAT.wall); box.hidden = !w; if (!w) return;
  r.value = String(wallDim(CHAT.wall)); $('wallDimVal').textContent = r.value + '%';
  r.style.setProperty('--fill', (Number(r.value) / 80 * 100) + '%');
}
function paintWall(elm, id){
  var w = wallOf(id); elm.classList.add('wp-scope'); elm.setAttribute('data-wp', w ? (w.mode === 'tile' ? 'tile' : 'cover') : id);
  if (w){ elm.style.setProperty('--wp-img', 'url("' + w.url + '")'); elm.style.setProperty('--wp-dim', wallDim(id) + '%'); }
  else { elm.style.removeProperty('--wp-img'); elm.style.removeProperty('--wp-dim'); }
}
function setWallAttr(){ var m = $('messenger'); if (m) paintWall(m, CHAT.wall); }
function applyWall(id){
  var run = function(){ CHAT.wall = id; store('ps_wall', id); setWallAttr(); syncWallDim(); document.querySelectorAll('.wcard').forEach(function(c){ c.setAttribute('aria-pressed', c.dataset.id === id ? 'true' : 'false'); }); };
  if (!REDUCE && document.startViewTransition){ try { document.startViewTransition(run); return; } catch(e){} }
  run();
}
function renderWallCards(){
  var list = $('wallList'); if (!list) return; list.textContent = '';
  WALLS.forEach(function(id, i){
    var w = wallOf(id), b = el('button', 'tcard bcard wcard'); b.type = 'button'; b.dataset.id = id; b.setAttribute('aria-pressed', id === CHAT.wall ? 'true' : 'false'); b.style.animationDelay = (i * 35) + 'ms';
    var pv = el('div', 'bprev bs-scope'); pv.setAttribute('aria-hidden', 'true'); pv.setAttribute('data-ct', CHAT.theme); pv.setAttribute('data-bs', CHAT.bubble); paintWall(pv, id);
    [['in gap tail', S('bubbles.sample1')], ['out gap tail', S('bubbles.sample3')]].forEach(function(x){ var r = el('div', 'row ' + x[0]), ww = el('div', 'bwrap'); ww.appendChild(el('div', 'bubble', x[1])); r.appendChild(ww); pv.appendChild(r); });
    b.appendChild(pv);
    var nm = el('div', 'tname'), lb = el('span'); lb.appendChild(el('b', null, w ? w.name : S('wall.' + id))); lb.appendChild(el('small', null, w ? S(w.mode === 'tile' ? 'wall.pattern' : 'wall.photo') : S('wall.' + id + '.desc'))); nm.appendChild(lb);
    var ck = el('span', 'tcheck'); ck.appendChild(svg('<path d="M5 12l5 5 9-10"/>')); nm.appendChild(ck); b.appendChild(nm);
    b.onclick = function(){ applyWall(id); };
    list.appendChild(b);
  });
  syncWallDim();
}
(function(){
  var r = $('wallDimRange'); if (!r) return;
  r.addEventListener('input', function(){   // live: the chat behind the sheet and the chosen card follow the slider
    var id = CHAT.wall; if (!wallOf(id)) return;
    WALL_DIM[id] = Number(r.value); store('ps_wall_dim', WALL_DIM); setWallAttr(); syncWallDim();
    var card = document.querySelector('.wcard[data-id="' + id + '"] .bprev'); if (card) paintWall(card, id);
  });
})();
/* ---------- chat text font (per device): "theme" = the theme's own font, "system" = the device's, or a Google font —
   downloaded only when chosen (the cards' previews only load the few letters they show). Applied to the whole chat:
   messages, lists, headers, the message box, buttons, forms and menus, headings included. ---------- */
var FONTS = [   // [id, CSS stack, display name, Google Fonts family spec] — each one a clearly different style
  ['theme', '', ''],
  ['system', '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif', ''],
  ['inter', '"Inter",system-ui,sans-serif', 'Inter', 'Inter:wght@400;500;600;700;800'],
  ['poppins', '"Poppins",system-ui,sans-serif', 'Poppins', 'Poppins:wght@400;500;600;700;800'],
  ['fredoka', '"Fredoka",system-ui,sans-serif', 'Fredoka', 'Fredoka:wght@400;500;600;700'],
  ['oswald', '"Oswald",system-ui,sans-serif', 'Oswald', 'Oswald:wght@400;500;600;700'],
  ['exo', '"Exo 2",system-ui,sans-serif', 'Exo 2', 'Exo+2:wght@400;500;600;700;800'],
  ['merriweather', '"Merriweather",Georgia,serif', 'Merriweather', 'Merriweather:wght@400;700;900'],
  ['playfair', '"Playfair Display",Georgia,serif', 'Playfair Display', 'Playfair+Display:wght@400;500;600;700;800'],
  ['spacemono', '"Space Mono",ui-monospace,monospace', 'Space Mono', 'Space+Mono:wght@400;700'],
  ['patrick', '"Patrick Hand",system-ui,sans-serif', 'Patrick Hand', 'Patrick+Hand'],
  ['atkinson', '"Atkinson Hyperlegible",system-ui,sans-serif', 'Atkinson', 'Atkinson+Hyperlegible:wght@400;700'],   // (its full name, Atkinson Hyperlegible, is too long for a card)
];
function fontOf(id){ return FONTS.filter(function(f){ return f[0] === id; })[0] || FONTS[0]; }
CHAT.font = (function(){ var f = store('ps_font'); return FONTS.some(function(x){ return x[0] === f; }) ? f : 'theme'; })();
var FONT_LINKS = {};
function fontLink(href){ if (FONT_LINKS[href]) return; var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); FONT_LINKS[href] = l; }
function loadFont(id){ var f = fontOf(id); if (f[3]) fontLink('https://fonts.googleapis.com/css2?family=' + f[3] + '&display=swap'); }
/** the chat's elements that carry the theme (+ the palette menu) get the font as CSS variables */
var FONT_SCOPES = ['messenger', 'ctx', 'rulesSheet', 'themeSheet', 'authSheet', 'personSheet', 'roomSheet', 'confirmSheet', 'groupSheet', 'fwdSheet'];
function paintFont(e){
  var f = fontOf(CHAT.font), vars = ['--font-chat', '--font-title', '--body'];
  if (!f[1]){ vars.forEach(function(k){ e.style.removeProperty(k); }); e.style.removeProperty('--title-weight'); return; }
  vars.forEach(function(k){ e.style.setProperty(k, f[1]); });
  // the OddsClub theme's titles are a tall display font at a light weight: with a text font they need a bolder weight
  if (CHAT.theme === 'oddsclub') e.style.setProperty('--title-weight', '800'); else e.style.removeProperty('--title-weight');
}
function setFontVars(){ FONT_SCOPES.forEach(function(k){ var e = $(k); if (e) paintFont(e); }); [LOOKMENU && LOOKMENU.el, LB, $('toast')].forEach(function(e){ if (e) paintFont(e); }); }   // (+ the palette menu, the photo viewer, the toasts)
function applyFont(id){
  var run = function(){ CHAT.font = id; store('ps_font', id); loadFont(id); setFontVars(); document.querySelectorAll('.fcard').forEach(function(c){ c.setAttribute('aria-pressed', c.dataset.id === id ? 'true' : 'false'); }); };
  if (!REDUCE && document.startViewTransition){ try { document.startViewTransition(run); return; } catch(e){} }
  run();
}
function renderFontCards(){
  var list = $('fontList'); if (!list) return; list.textContent = '';
  var sample = S('bubbles.sample1');
  FONTS.forEach(function(f, i){
    var id = f[0], name = id === 'theme' ? S('fonts.theme') : id === 'system' ? S('fonts.system') : f[2];
    // previews: only the letters shown (a few KB per font)
    if (f[3]) fontLink('https://fonts.googleapis.com/css2?family=' + (f[3].indexOf(':wght@') > 0 ? f[3].replace(/:wght@.*$/, ':wght@400;700') : f[3]) + '&display=swap&text=' + encodeURIComponent('Aa' + name + sample));
    // a card like the other steps: a preview ("Aa" + a sample message, in that font) then its name + style + check
    var b = el('button', 'tcard fcard'); b.type = 'button'; b.dataset.id = id; b.setAttribute('aria-pressed', id === CHAT.font ? 'true' : 'false'); b.style.animationDelay = (i * 30) + 'ms'; b.title = name;
    // the whole card (preview AND its labels) is written in its own font: picking another font doesn't re-wrap the cards
    if (id === 'theme') b.setAttribute('data-ct', CHAT.theme); else b.style.setProperty('--font-chat', f[1]);
    var pv = el('div', 'fprev'); pv.setAttribute('aria-hidden', 'true'); pv.setAttribute('data-ct', CHAT.theme);   // (the theme's colours; "Theme default" also keeps its font)
    if (id !== 'theme') pv.style.setProperty('--font-chat', f[1]);
    pv.appendChild(el('span', 'f-aa', 'Aa')); pv.appendChild(el('span', 'f-sample', sample)); b.appendChild(pv);
    var nm = el('div', 'tname'), lb = el('span'); lb.appendChild(el('b', null, name)); lb.appendChild(el('small', null, S(id === 'theme' || id === 'system' ? 'fonts.' + id + '.desc' : 'fonts.desc.' + id))); nm.appendChild(lb);
    var ck = el('span', 'tcheck'); ck.appendChild(svg('<path d="M5 12l5 5 9-10"/>')); nm.appendChild(ck); b.appendChild(nm);
    b.onclick = function(){ applyFont(id); };
    list.appendChild(b);
  });
}
function setThemeAttr(id){ ['messenger','ctx','rulesSheet','themeSheet','authSheet','personSheet','roomSheet','confirmSheet','groupSheet','fwdSheet'].forEach(function(k){ var e = $(k); if (e) e.setAttribute('data-ct', id); }); }
function applyTheme(id, animate){
  if (id === CHAT.theme && !animate) { setThemeAttr(id); return; }
  var run = function(){ CHAT.theme = id; setThemeAttr(id); setFontVars(); setTimeout(paintBackdrop, 50); store('ps_chat_theme', id); if ($('toBubbles')) $('toBubbles').hidden = id === 'discord';
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
    b.onclick = function(){ applyTheme(t[0], true); setTimeout(function(){ themeStep(t[0] === 'discord' ? 3 : 2); }, 260); };   // then the bubble style (Discord: no bubbles → the wallpaper)
    list.appendChild(b);
  });
})();
var themeFocus = null;
/* ---------- "Are you sure?" dialog (themed, replaces window.confirm). askConfirm(message, okLabel, danger) → Promise<boolean>.
   The message's first question becomes the title, the rest the explanation. Escape / backdrop / Cancel = no. ---------- */
var CF = null;
/* ---------- Forwarding: a copy of a message to up to 5 of my chats, marked "Forwarded" (server: service.ts forward).
   Offered when the chat it comes from allows it — Chat settings → Private chats → Forwarding, each group / channel's
   Forwarding; the team always can — and not for pictures / voice messages that can't be saved there. ---------- */
var FWD = null, FWD_MAX = 5;
function canForward(m){
  if (!CHAT.db || !CHAT.uid || !CHAT.canPost || !m || !/^[a-f0-9]{24}$/i.test(String(m.id)) || m.locked || m.expired || m.deleted) return false;
  if (!m.text && !m.image && !m.voice) return false;
  if (CHAT.canEdit) return true;
  if ((m.image || m.voice) && m.nosave) return false;
  if (pmUid(CHAT.active)) return !(cfg.chat && cfg.chat.pmForward === false);
  var g = grpOf(CHAT.active); if (g) return g.forward !== false;
  return true;
}
/** the chats I can post in */
function fwdTargets(){ return rooms().filter(function(r){
  if (r.pendingOut) return false;
  if (r.group) return !!r.group.canPost;
  if (r.pm) return !!(PM.rels[r.uid] && PM.rels[r.uid].status === 'accepted');
  if (r.id === 'support') return !!CHAT.uid && !CHAT.canEdit;
  if (/^sup:/.test(r.id)) return !!CHAT.canEdit;
  if (r.lounge) return CHAT.canPost && !(cfg.chat && cfg.chat.loungeTeamOnly && !CHAT.canEdit);
  return !!CHAT.canPost;   // match rooms
}); }
function openForward(m){
  if (!fwdTargets().length){ toast(S('fwd.noChats')); return; }
  FWD = {m: m, sel: [], back: document.activeElement};
  var what = $('fwdWhat'); what.textContent = ''; what.appendChild(svg('<path d="M14 5l7 7-7 7"/><path d="M21 12H9a6 6 0 0 0-6 6v1"/>')); what.appendChild(el('span', null, msgPreview(m)));
  $('fwdSearch').value = ''; renderFwd();
  var w = $('fwdSheet'); w.classList.add('open'); w.setAttribute('aria-hidden', 'false');
  setTimeout(function(){ var f = window.innerWidth > 820 ? $('fwdSearch') : w.querySelector('.fwd-item'); if (f) f.focus({preventScroll: true}); }, 60);
}
function closeForward(){ if (!FWD) return; var back = FWD.back; FWD = null; var w = $('fwdSheet'); w.classList.remove('open'); w.setAttribute('aria-hidden', 'true'); if (back && back.focus && document.contains(back)) back.focus({preventScroll: true}); }
function renderFwd(){
  if (!FWD) return;
  var q = $('fwdSearch').value.trim(), ul = $('fwdList'), keep = ul.scrollTop; ul.textContent = '';
  var list = fwdTargets().filter(function(r){ return !q || r.title.toLowerCase().indexOf(q.toLowerCase()) >= 0; });
  if (!list.length) ul.appendChild(el('li', 'fwd-empty', S('search.none', {q: q})));
  list.forEach(function(r){
    var on = FWD.sel.indexOf(r.id) >= 0, li = el('li'), b = el('button', 'fwd-item' + (on ? ' on' : '')); b.type = 'button'; b.setAttribute('role', 'checkbox'); b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.appendChild(roomAvatar(r, false)); b.appendChild(hlName(r.title, q)); var ck = el('span', 'fwd-check'); ck.appendChild(svg('<path d="M5 12l5 5 9-10"/>')); b.appendChild(ck);
    b.onclick = function(){ var i = FWD.sel.indexOf(r.id); if (i >= 0) FWD.sel.splice(i, 1); else { if (FWD.sel.length >= FWD_MAX){ toast(S('fwd.max', {n: FWD_MAX})); return; } FWD.sel.push(r.id); } renderFwd(); };
    b.dataset.id = r.id; li.appendChild(b); ul.appendChild(li);
  });
  ul.scrollTop = keep;
  var send = $('fwdSend'); send.disabled = !FWD.sel.length; send.textContent = FWD.sel.length ? S('fwd.sendN', {n: FWD.sel.length}) : S('fwd.send');
}
$('fwdSearch').addEventListener('input', renderFwd);
$('fwdCancel').addEventListener('click', closeForward);
$('fwdSheet').addEventListener('click', function(e){ if (e.target === this) closeForward(); });
window.addEventListener('keydown', function(e){ if (e.key === 'Escape' && FWD){ e.stopImmediatePropagation(); closeForward(); } }, true);
$('fwdSend').addEventListener('click', function(){
  if (!FWD || !FWD.sel.length) return;
  var to = FWD.sel.slice(), names = {}; fwdTargets().forEach(function(r){ names[r.id] = r.title; });
  backend.forward(FWD.m.id, to).then(function(d){
    closeForward();
    var failed = (d && d.failed) || [];
    // open the first chosen chat that got it — it takes the place of the conversation forwarded from, so Back returns to the
    // chat list (not to that conversation)
    var first = to.filter(function(x){ return !failed.some(function(f){ return f.to === x; }); })[0];
    if (first && first !== CHAT.active) goChat(first, {replace: true});
    if (d && d.sent) toast(d.sent === 1 ? S('fwd.done1', {name: names[to.filter(function(x){ return !failed.some(function(f){ return f.to === x; }); })[0]] || ''}) : S('fwd.done', {n: d.sent}), true);
    if (failed.length) setTimeout(function(){ toast((names[failed[0].to] ? names[failed[0].to] + ': ' : '') + failed[0].error + (failed.length > 1 ? ' (+' + (failed.length - 1) + ')' : '')); }, d && d.sent ? 3000 : 0);
  }, function(e){ toast(e && e.message ? e.message : S('chat.sendFailed')); });
});
function askConfirm(msg, okLabel, danger){
  if (CF) CF.done(false);
  var m = /^([\s\S]*?\?)\s+([\s\S]+)$/.exec(String(msg)), w = $('confirmSheet'), ok = $('cfOk'), back = document.activeElement;
  $('cfTitle').textContent = m ? m[1] : msg; $('cfText').textContent = m ? m[2] : ''; $('cfText').hidden = !m;
  ok.textContent = okLabel || 'OK'; ok.classList.toggle('danger', !!danger);
  w.classList.add('open'); w.setAttribute('aria-hidden', 'false');
  setTimeout(function(){ (danger ? $('cfCancel') : ok).focus({preventScroll:true}); }, 60);
  return new Promise(function(res){
    CF = { done: function(v){ if (!CF) return; CF = null; w.classList.remove('open'); w.setAttribute('aria-hidden', 'true'); if (back && back.focus && document.contains(back)) back.focus({preventScroll:true}); res(v); } };
  });
}
$('cfOk').addEventListener('click', function(){ if (CF) CF.done(true); });
$('cfCancel').addEventListener('click', function(){ if (CF) CF.done(false); });
$('confirmSheet').addEventListener('click', function(e){ if (e.target === this && CF) CF.done(false); });
window.addEventListener('keydown', function(e){
  if (!CF) return;
  if (e.key === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); CF.done(false); }
  else if (e.key === 'Tab'){ var a = $('cfCancel'), b = $('cfOk'); if (document.activeElement !== a && document.activeElement !== b){ e.preventDefault(); a.focus(); } else if (e.shiftKey ? document.activeElement === a : document.activeElement === b){ e.preventDefault(); (e.shiftKey ? b : a).focus(); } }
}, true);
function openThemes(step){ themeFocus = document.activeElement; themeStep(step === 3 || step === 4 ? step : 1);   /* 4: straight to the font */   /* 3: straight to the wallpaper (quick button) */
  if (!UI.wallsWarm){ UI.wallsWarm = true; (cfg.wallpapers || []).forEach(function(w){ var i = new Image(); i.decoding = 'async'; i.src = w.url; }); }   // wallpaper previews ready by step 3
  var w = $('themeSheet'); w.classList.add('open'); w.setAttribute('aria-hidden', 'false'); setTimeout(function(){ var c = w.querySelector('.tcard[aria-pressed="true"]'); if (c) c.focus({preventScroll:true}); }, 60); }
function closeThemes(){ var w = $('themeSheet'); w.classList.remove('open'); w.setAttribute('aria-hidden', 'true'); if (themeFocus && themeFocus.focus) themeFocus.focus({preventScroll:true}); }
/* the palette button: a small menu — Theme (theme → bubbles → wallpaper) or straight to the Wallpaper */
var LOOKMENU = null;
function closeLookMenu(back){ var m = LOOKMENU; if (!m) return; LOOKMENU = null; m.btn.setAttribute('aria-expanded', 'false'); m.el.classList.remove('open'); setTimeout(function(){ m.el.remove(); }, 180); if (back) m.btn.focus({preventScroll:true}); }
function openLookMenu(btn){
  if (LOOKMENU){ var same = LOOKMENU.btn === btn; closeLookMenu(); if (same) return; }
  var menu = el('div', 'look-menu glass'); menu.setAttribute('role', 'menu'); menu.setAttribute('data-ct', CHAT.theme);
  [['theme', S('chat.themeAria'), '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A5.6 5.6 0 0 0 22 9.8C22 5.5 17.5 2 12 2z"/>', 1],
   ['wall', S('walls.open'), '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>', 3],
   ['font', S('fonts.open'), '<path d="M4 20l5.5-14h1L16 20M6.2 15h7.6"/><path d="M17 20v-6.5a2.5 2.5 0 0 1 5 0V20M17 16.5h5"/>', 4]].forEach(function(x){
    var it = el('button', 'look-item'); it.type = 'button'; it.setAttribute('role', 'menuitem'); it.appendChild(svg(x[2])); it.appendChild(el('span', null, x[1]));
    it.onclick = function(){ closeLookMenu(); openThemes(x[3]); };
    menu.appendChild(it);
  });
  paintFont(menu); document.body.appendChild(menu);
  var r = btn.getBoundingClientRect(), w = menu.offsetWidth, left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w));
  menu.style.left = left + 'px'; menu.style.top = (r.bottom + 6) + 'px'; menu.style.transformOrigin = (r.left + r.width / 2 - left) + 'px top';
  LOOKMENU = {el: menu, btn: btn}; btn.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(function(){ menu.classList.add('open'); menu.querySelector('.look-item').focus({preventScroll:true}); });
}
document.querySelectorAll('[data-open-themes]').forEach(function(b){ b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false'); b.onclick = function(e){ e.stopPropagation(); openLookMenu(b); }; });
document.addEventListener('pointerdown', function(e){ if (LOOKMENU && !LOOKMENU.el.contains(e.target) && !LOOKMENU.btn.contains(e.target)) closeLookMenu(); }, true);
document.addEventListener('keydown', function(e){
  if (!LOOKMENU) return;
  var items = Array.prototype.slice.call(LOOKMENU.el.querySelectorAll('.look-item')), i = items.indexOf(document.activeElement);
  if (e.key === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); closeLookMenu(true); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){ e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
  else if (e.key === 'Tab') closeLookMenu();
}, true);
window.addEventListener('resize', function(){ closeLookMenu(); });
$('themeDone').onclick = closeThemes;
$('bubblesDone').onclick = closeThemes;
$('bubblesBack').onclick = $('bubblesBack2').onclick = function(){ themeStep(1); };
$('toBubbles').onclick = function(){ themeStep(2); };
$('toWalls').onclick = $('bubblesNext').onclick = function(){ themeStep(3); };
$('wallsBack').onclick = function(){ themeStep(CHAT.theme === 'discord' ? 1 : 2); };
$('wallsDone').onclick = closeThemes;
$('toFonts').onclick = function(){ themeStep(4); };
$('fontsBack').onclick = function(){ themeStep(1); };
$('fontsDone').onclick = closeThemes;
// the chosen font, from the start
loadFont(CHAT.font); setFontVars();
function syncBubbleBtn(){ $('toBubbles').hidden = CHAT.theme === 'discord'; }
$('themeSheet').addEventListener('click', function(e){ if (e.target === this) closeThemes(); });
document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && $('themeSheet').classList.contains('open')){ e.stopImmediatePropagation(); closeThemes(); } }, true);
applyTheme(CHAT.theme, false); setBubbleAttr(); syncBubbleBtn(); setWallAttr();

function ensureThread(uid){ backend.watchThread(uid); }
function touchSeen(){ if (CHAT.db && CHAT.uid) backend.touchSeen(); }
document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'hidden') touchSeen(); });
window.addEventListener('pagehide', touchSeen);

/* ================= Data + chat backend ================= */
LIVE.matches = (cfg.matches || []).map(function(m){ var o = Object.assign({}, m); o.kickoff = kickoffLabel(m.startsAt); return o; });
renderSportTabs(); renderMatches(); updateTicker(); LIVE.dirty = true;
/* A link to a conversation that isn't this viewer's (someone else's private chat, a hidden group, a deleted room…):
   once everything has arrived (groups come last on connect) and it's still not there, stop waiting for it — back to the
   room list with a short note, instead of waiting forever with the lounge showing behind. The server never sends its
   messages anyway. */
function giveUpWantRoom(){
  if (!CHAT.wantRoom || !UI.ready || rooms().some(function(r){ return r.id === CHAT.wantRoom; })) return;
  CHAT.wantRoom = null; $('messenger').classList.remove('want-room');
  if (isOpen()){ toast(S('chat.roomUnavailable')); goChat('', {replace: true}); }
}
function refreshChat(mode){ renderRooms(); if (isOpen()){ renderHeader(); renderConvo(mode); } if (CHAT.wantRoom && rooms().some(function(r){ return r.id === CHAT.wantRoom; })){ CHAT.wantRoom = null; route(); } }
function updateLounge(){
  var n = online(null), msgs = LIVE.messages.length;
  var info = CHAT.db ? S('lounge.online', {n: n}) : S('lounge.info');
  var li = $('loungeInfo'), so = $('sideOnline');   // may be missing if something rewrote the page (extensions)
  if (li) li.textContent = msgs ? S('lounge.withMessages', {info: info, n: msgs}) : info;
  if (so) so.textContent = CHAT.db ? S('chat.onlineCount', {n: n}) : S('chat.liveLabel');
}
var backend = createChatBackend(cfg, {
  S: S,
  ready: function(info){
    setTimeout(tryJoinLink, 0);
    CHAT.db = true; CHAT.user = backend; CHAT.uid = info.uid || null; UI.ready = true; CHAT.perms = info.perms || {}; CHAT.canPost = !!info.canPost; CHAT.canEdit = !!info.canEdit; LIVE.me = info.me || null;
    if (info.profiles) Object.assign(LIVE.profiles, info.profiles);
    UI.accepted = !!(info.rulesAccepted || (CHAT.uid && store('ps_rules_' + CHAT.uid)));
    applyComposer(); updateLounge(); refreshChat();
    if (CHAT.wantRoom === 'support' && !CHAT.uid){ CHAT.wantRoom = null; route(); }   // not signed in: no help chat to come back to
    maybePromptSignIn();
  },
  unavailable: function(){ CHAT.db = null; UI.loaded = true; UI.unavailable = true; if (CHAT.wantRoom){ CHAT.wantRoom = null; $('messenger').classList.remove('want-room'); } applyComposer(); updateLounge(); refreshChat(); },
  profiles: function(p){ Object.assign(LIVE.profiles, p); refreshChat(); },
  searchUpdated: function(){ srchRender(); },   // the people results changed (search mode)
  messages: function(list, mode){ var firstLoad = !UI.loaded; UI.loaded = true; LIVE.messages = list; if (isOpen()) renderConvo(firstLoad ? undefined : mode); renderRooms(); renderMatches(); updateLounge(); LIVE.dirty = true; },
  myDm: function(list, mode){ DM.mine = list; refreshChat(CHAT.active === 'support' ? mode : undefined); },
  pms: function(rels){ PM.rels = rels || {}; refreshChat(); if (pmUid(CHAT.active)) applyComposer(); if (CHAT.wantRoom) return;
    // the chat I'm looking at was closed (blocked / cancelled / declined): back to the room list
    if (pmUid(CHAT.active) && !PM.rels[pmUid(CHAT.active)] && isOpen() && chatFromPath().room === CHAT.active) goChat('', {replace: true}); },
  receipts: function(map, gmap){ RCPT = map || {}; RCPTG = gmap || {}; renderRooms(); if (isOpen() && (isDmRoom(CHAT.active) || grpId(CHAT.active))) renderConvo(); },
  groups: function(list){ GR.list = list || []; refreshChat(); if (grpId(CHAT.active)) applyComposer(); giveUpWantRoom();
    if (grpId(CHAT.active) && !grpOf(CHAT.active) && !CHAT.wantRoom && isOpen() && chatFromPath().room === CHAT.active) goChat('', {replace: true}); },
  groupMsgs: function(id, list, mode){ GR.msgs[id] = list; refreshChat(CHAT.active === 'g:' + id ? mode : undefined); },
  pmMsgs: function(uid, list, mode){ PM.msgs[uid] = list; refreshChat(CHAT.active === 'pm:' + uid ? mode : undefined); },
  // "Message" from the people panel / person card
  openChatWith: function(uid){
    if (CHAT.canEdit){ if (!DM.threads[uid]) DM.threads[uid] = {lastTs: Date.now(), lastText: '', lastSeen: 0}; ensureThread(uid); openRoom('sup:' + uid); return; }
    var p = LIVE.profiles[uid]; if (p && p.staff){ openRoom('support'); return; }
    if (PM.rels[uid]) openRoom('pm:' + uid);
  },
  activeRoom: function(){ return CHAT.active; },
  openRoom: function(id){ openRoom(id); },
  nameOf: function(uid){ return nameOf(uid); },
  dm: function(uid, list, mode){ DM.msgs[uid] = list; refreshChat(CHAT.active === 'sup:' + uid ? mode : undefined); },
  threads: function(t){ DM.threads = t || {}; refreshChat(); if (String(CHAT.active).indexOf('sup:') === 0) ensureThread(CHAT.active.slice(4)); },
  agent: function(a){ DM.agent.uid = (a && a.uid) || null; DM.agent.lastSeen = Number(a && a.lastSeen) || 0; if (a && a.profile && a.uid) LIVE.profiles[a.uid] = a.profile; refreshChat(); },
  mod: function(muted){ UI.mod.muted = muted || {}; applyComposer(); if (isOpen()) renderConvo(); },
  myReports: function(ids){ (ids || []).forEach(function(id){ UI.reported[id] = true; }); },
  reports: function(counts){ UI.reports = counts || {}; if (isOpen()) renderConvo(); },
  matches: function(list){ LIVE.matches = list.map(function(m){ var o = Object.assign({}, m); o.kickoff = kickoffLabel(m.startsAt); return o; });
    renderSportTabs(); renderMatches(); updateTicker(); renderRooms(); if (isOpen()) renderHeader(); LIVE.dirty = true;
    if (chatFromPath().room && UI.renderedRoom !== chatFromPath().room) route(); },
  peers: function(peers){ CHAT.peers = peers || []; updateLounge(); clearTimeout(window.__ocPeerT); window.__ocPeerT = setTimeout(function(){ renderRooms(); if (isOpen()){ renderHeader(); renderConvo(); } }, 120); },
  toast: function(msg, ok){ toast(msg, ok); },
  confirm: function(msg, ok, danger){ return askConfirm(msg, ok, danger); },
  viewPhoto: function(url, img){ var w = (img && img.naturalWidth) || 512, hh = (img && img.naturalHeight) || 512; openLightbox(url, img || null, w, hh, false); },   // a profile / room picture, full size
  roomAvatar: function(gid){ var r = roomById('g:' + gid); return r && r.id === 'g:' + gid && r.group ? roomAvatar(r, false) : null; }
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
      txt(S('chat.lounge'),134,138,26,800,C.light); txt(online(null) ? S('chat.onlineCount', {n: online(null)}) : S('phone.communityChat'),134,172,20,600,C.mute);
      var list = LIVE.messages.filter(function(m){ return m.room === 'lounge'; }).slice(-6), y = 236, bottom = Y - 180;
      if (!list.length){ rr(X/2-200,y+40,400,80,20); g.fillStyle = 'rgba(16,48,90,.9)'; g.fill(); txt(S('chat.noMessages'), X/2, y+90, 24, 700, C.mute, 'center'); }
      var blocks = [];
      list.forEach(function(m){ var mine = m.by && m.by === CHAT.uid, words = msgPreview(m).split(/\s+/), lines = [], cur = ''; g.font = '600 24px Manrope, sans-serif';
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
  // phones: the phone ends the hero exactly in the first feature block's slot (see flowPose)
  function flowScale(){ var upp = 2 * camera.position.z * Math.tan(camera.fov * Math.PI / 360) / size.h; return Math.min(Math.max(160, flowSlotH * 0.8) * upp / (Hh + 0.12), size.w * 0.58 * upp / W); }
  function poseB(){
    if (!mobile) return {x:0,y:-0.35,rx:0.06,ry:0,rz:0,s:1.0};
    flowMeasure();
    var upp = 2 * camera.position.z * Math.tan(camera.fov * Math.PI / 360) / size.h, c0 = flowCallouts[0];
    var off = c0 ? c0.getBoundingClientRect().top - feat.getBoundingClientRect().top + flowSlotH / 2 : size.h * FLOW_R;   // slot 0 centre when the features reach the top
    return {x:0, y:(size.h / 2 - off) * upp, rx:0.05, ry:0, rz:0, s:flowScale()};
  }
  // phones, past the hero: the phone's place comes from the feature blocks (rides / glides down / rests on the rest line)
  function flowPose(fi){ var upp = 2 * camera.position.z * Math.tan(camera.fov * Math.PI / 360) / size.h; return {x:0, y:(size.h / 2 - fi.y) * upp, rx:0.05, ry:Math.PI * 2, rz:0, s:flowScale()}; }   // ry = where the hero's scroll turn ends
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
    // after the features the phone no longer flies away: tailPose() keeps it turning with the scroll down to the footer
    tls.push(t1);
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
  // share of each feature's scroll range where the phone just faces you before it starts turning (short on phones,
  // where every bit of scroll counts)
  function FACE(){ return mobile ? 0.08 : 0.14; }
  function spinPart(f, local){ if (REDUCE || f < 0 || f > 3) return 0;   // every feature turns once, the last one too
     var fc = FACE(), x = Math.max(0, Math.min(1, (local - fc) / (1 - fc))); return x * x * (3 - 2 * x); }
  var FEAT_SCREENS = [1, 2, 3, 4];
  // Below the features the phone simply keeps going with the scroll, behind the content: it stays where the features
  // left it and turns one full 360° per section (Join → promo screen, Matchday → odds screen, footer → live screen),
  // linearly with the scroll position. The screen swaps while its back faces you. No docking, no scroll hijacking.
  var TAIL = [['#join', 1], ['#matchday', 2], ['footer', 0]].map(function(x){ return {el:document.querySelector(x[0]), screen:x[1]}; }).filter(function(x){ return x.el; });
  function tailPose(){
    if (!TAIL.length) return null;
    var h = size.h, sy = window.scrollY || 0, s0 = sy + feat.getBoundingClientRect().bottom - h;
    if (sy <= s0) return null;
    var maxS = Math.max(s0, document.documentElement.scrollHeight - h);
    // anchor k = scroll position where section k's middle reaches the middle of the screen (clamped to the page end)
    var at = [s0], scr = [FEAT_SCREENS[3]];
    TAIL.forEach(function(x){ var r = x.el.getBoundingClientRect(); at.push(Math.max(at[at.length - 1], Math.min(maxS, sy + r.top + r.height / 2 - h / 2))); scr.push(x.screen); });
    var k = 0; while (k < at.length - 1 && at[k + 1] <= sy) k++;
    var den = (at[k + 1] || at[k]) - at[k], u = k + (k < at.length - 1 && den >= 1 ? Math.min(1, (sy - at[k]) / den) : 0);
    return {u:u, spin: REDUCE ? 0 : u * Math.PI * 2, screen: scr[Math.min(scr.length - 1, Math.round(u))], scr:scr};
  }
  window.onFeatureChange = function(f){
    G.to(O, {lean: (f >= 0 && !mobile) ? (f % 2 === 0 ? -0.38 : 0.38) : 0, leanX: f >= 0 ? 0.04 : 0, duration:.9, ease:'power3.out'});
    if (REDUCE && f >= 0) showScreen(FEAT_SCREENS[f], true);
  };
  var t0 = performance.now(), lastDraw = 0, flipping = false, settling = false;
  window.__phoneFlipping = function(v){ flipping = v; };
  // jump state (back-to-top / nav links) and footer fade
  var jumpUntil = 0, shownPose = [0, 0, 0, 0, 0, 1], lastFrame = performance.now(), footEl = document.querySelector('footer'), lastOp = '';
  /* Menu links / back to top: the page flies past several sections. The phone stays visible and travels with the page,
     but doesn't spin: over ~½ s it settles from wherever it was into a calm upright pose facing you, keeps that pose for
     the flight, and on arrival glides (shortest way) into the destination's pose — one turn there if the screen must
     change. The callouts step aside for the flight instead of flashing through every feature. */
  var wasJumping = false, jumpFrom = null, jumpT0 = 0, landFrom = null, landK = 0, jumpFace = 0;
  window.__phoneJump = function(ms){
    jumpUntil = performance.now() + ms + 80; JUMP.until = jumpUntil;
    if (REDUCE) return;
    if (!wasJumping){ jumpFrom = shownPose.slice(); jumpT0 = performance.now(); landFrom = null; jumpFace = Math.round(jumpFrom[3] / (Math.PI * 2)) * Math.PI * 2; }   // facing you, the nearest way
    if (feat) feat.classList.add('jumping');
  };
  function blendPose(a, b, k){   // angles the shortest way round (ry carries whole turns)
    return b.map(function(v, i){ var d = v - a[i]; if (i >= 2 && i <= 4) d = Math.atan2(Math.sin(d), Math.cos(d)); return a[i] + d * k; });
  }
  // Screen changes: normally they happen while the phone's back faces you (mid-turn), so you never see a cut. When the phone is
  // facing you and the screen must change anyway (e.g. arriving at the top after "back to top"), it turns once and swaps
  // at the half turn.
  var turning = false, turnTo = -1, TWO_PI = Math.PI * 2;
  function turnToScreen(i){
    turnTo = i; if (turning) return;
    turning = true; flipping = true;
    var start = O.flip, target = (Math.round(start / TWO_PI) + 1) * TWO_PI, swapped = false;
    function done(){ if (!swapped) showScreen(turnTo, true); turning = false; flipping = false; }
    G.to(O, {flip: target, duration: 1.25, ease: 'power3.inOut', overwrite: 'auto',
      onUpdate: function(){ if (!swapped && O.flip - start >= Math.PI){ swapped = true; showScreen(turnTo, true); } }, onComplete: done, onInterrupt: done});
  }
  function wantScreen(i, facingAngle){
    if (i === shown || (turning && turnTo === i)) return;
    if (turning){ turnTo = i; return; }
    if (REDUCE || flipping || Math.cos(facingAngle) < 0.2) showScreen(i, true);   // back (or edge) towards you: swap unseen
    else turnToScreen(i);
  }
  ['wheel', 'touchstart', 'keydown'].forEach(function(ev){ window.addEventListener(ev, function(){ jumpUntil = 0; JUMP.until = 0; }, {passive:true}); });   // the user took over: the jump ends here
  /* Steady rhythm: whatever the scroll speed, the phone turns at most one turn per SPIN_SEC and its position eases after the
     scroll instead of snapping. A hard flick plays the same calm turns one after another (screens still change mid-turn).
     When it is far behind (several turns owed) it may go a little faster — 35 % more per extra turn — so it catches up
     smoothly instead of spinning on for seconds. */
  var SPIN_SEC = 0.8, tailU = null, flowY = null;
  // per-turn tumble [rx, rz, x] at the half turn, cycling — and the resting angle [ry, rz] of each stop on phones
  var TUMBLE = [[0.42, 0.24, 0.30], [-0.32, -0.36, -0.34], [0.30, 0.40, 0.26], [-0.40, -0.22, -0.28], [0.36, -0.30, 0.32]];
  var STANCE = [[-0.30, 0.07], [0.28, -0.07], [-0.24, 0.05], [0.30, -0.06], [-0.26, 0.06]];
  // eased chase with a speed limit; unit = one turn (2π for angles, 1 for tail turns); boost = extra speed per turn owed
  function steady(cur, target, dt, unit, boost){
    var d = target - cur, behind = Math.abs(d) / unit;
    var step = d * (1 - Math.exp(-dt * 9)), max = unit / SPIN_SEC * (1 + (boost == null ? 0.6 : boost) * Math.max(0, behind - 1)) * dt;
    if (Math.abs(step) > max) step = step > 0 ? max : -max;
    cur += step; return Math.abs(target - cur) < unit * 1e-4 ? target : cur;
  }
  function frame(){
    if (document.body.classList.contains('chat-open')) return;
    var now = performance.now(), t = (now - t0) / 1000, jumping = !REDUCE && now < jumpUntil;
    if (S2.feature < 0){
      if (jumping){}
      else if (S2.pA < 0.5 && shown !== 0 && !turning && Math.abs(Math.sin(O.flip / 2)) < 0.01) wantScreen(0, O.flip + O.drag + O.sa);
      else if (S2.pA >= 0.5 && S2.pC <= 0 && shown === 0) showScreen(1);
    }
    if (LIVE.dirty && now - lastDraw > 500){ LIVE.dirty = false; lastDraw = now; showScreen(shown, true); }
    if (!flipping && !settling && !document.querySelector('.drag-zone.grabbing')){
      var turnW = Math.PI * 2, restW = Math.round(O.flip / turnW) * turnW;
      if (Math.abs(O.flip - restW) > 0.003 && !G.isTweening(O)){ settling = true; G.to(O, {flip:restW, duration:.8, ease:'power3.out', onComplete:function(){ settling = false; }, onInterrupt:function(){ settling = false; }}); }
    }
    // scroll-driven feature spin (smoothed a little on top of Lenis)
    var TURN = Math.PI * 2, f = S2.feature;
    // phones: hand over from the hero's (smoothed) scroll pose to the feature blocks over the end of that animation, so it never jumps
    var t1p = mobile && tls[0] ? tls[0].progress() : 0, fk = Math.max(0, Math.min(1, (t1p - 0.8) / 0.2));
    var flow = mobile && fk > 0, fi = flow ? flowInfo() : null;
    if (!flow) flowY = null;
    var saTarget = flow ? (REDUCE ? 0 : (fi.k + fi.e) * TURN)   // phones: one turn per glide to the next block
      : f >= 0 ? (f + spinPart(f, S2.local)) * TURN : (S2.pC > 0 || S2.pB > 0.5 ? 4 * TURN : 0);   // after the section: the 4 turns are done (never unwind)
    var dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    if (jumping || REDUCE) O.sa = saTarget;   // during back-to-top / nav jumps the phone is held still: just follow (no turns owed afterwards)
    // inside the features: calm turns, one after another. Once a flick has carried the page past them, the turns still
    // owed finish quickly (≈ half a second) instead of the phone spinning on for seconds over the next section.
    else O.sa = steady(O.sa, saTarget, dt, TURN, f < 0 ? 4 : 0.6);
    var Dk = tailPose(), Q = P;
    // below the features: the turn per section follows the same steady rhythm
    if (Dk){ tailU = (tailU == null || jumping) ? Dk.u : steady(tailU, Dk.u, dt, 1); Dk.spin = REDUCE ? 0 : tailU * TURN; Dk.screen = Dk.scr[Math.max(0, Math.min(Dk.scr.length - 1, Math.round(tailU)))]; Dk.u = tailU; }
    else tailU = null;
    if (flow){ var FP = flowPose(fi), upp0 = 2 * camera.position.z * Math.tan(camera.fov * Math.PI / 360) / size.h;
      if (flowY == null || jumping) flowY = FP.y; else { var dy = FP.y - flowY, stepY = dy * (1 - Math.exp(-dt * 10)), maxY = size.h * upp0 * 2.4 * dt; flowY += Math.abs(stepY) > maxY ? (stepY > 0 ? maxY : -maxY) : stepY; }
      FP.y = flowY; Q = fk >= 1 ? FP : {x:P.x + (FP.x - P.x) * fk, y:P.y + (FP.y - P.y) * fk, rx:P.rx + (FP.rx - P.rx) * fk, ry:P.ry + (FP.ry - P.ry) * fk, rz:P.rz + (FP.rz - P.rz) * fk, s:P.s + (FP.s - P.s) * fk}; }   // below the features: same place, scroll-linked turn (see tailPose)
    if (wasJumping && !jumping){
      // arrived: glide from the calm flight pose into the live one (see below); the callouts come back once
      landFrom = shownPose.slice(); landK = 0; jumpFrom = null;
      if (feat){ feat.classList.remove('jumping'); animateCallouts(S2.feature, -1); }   // the arrival feature's entrance, once
    }
    wasJumping = jumping;
    if (jumping || landFrom){}   // screen changes wait for the landing glide (then: one turn if needed)
    else if (Dk){ if (Dk.screen !== shown) wantScreen(Dk.screen, O.flip + O.drag + O.sa + Dk.spin); }
    else if (f >= 0 && !REDUCE){ var si = FEAT_SCREENS[Math.max(0, Math.min(3, Math.round(O.sa / TURN)))]; if (si !== shown) wantScreen(si, O.flip + O.drag + O.sa); }
    var idle = REDUCE ? 0 : 1, exitK = 1 - Math.min(1, O.ey / 7);
    var lean = Dk ? O.lean * Math.max(0, 1 - Dk.u) : O.lean, dSpin = Dk ? Dk.spin : 0;
    var spinK = Math.max(Math.sin(O.sa % TURN / 2), Math.sin(dSpin / 2));   // 0 when facing, 1 at the half turn
    // Scroll turns are not a flat spin: mid-turn the phone also tips (rx), leans (rz) and drifts sideways (x), with a
    // different mix every turn, like the free movement on the first screen. 0 when facing you, full at the half turn.
    var turnsNow = (O.sa + dSpin) / TURN, ti = Math.floor(turnsNow + 1e-6), fr = turnsNow - ti, arc = REDUCE ? 0 : Math.sin(Math.max(0, Math.min(1, fr)) * Math.PI);
    var tb = TUMBLE[((ti % TUMBLE.length) + TUMBLE.length) % TUMBLE.length], swayX = mobile ? 0.45 : 1;
    // phones (past the hero): each stop has its own resting angle, alternating sides, instead of standing flat
    var stRy = 0, stRz = 0;
    if (flow && !REDUCE){ var sa0 = STANCE[((ti % STANCE.length) + STANCE.length) % STANCE.length], sa1 = STANCE[(((ti + 1) % STANCE.length) + STANCE.length) % STANCE.length], sm = fr * fr * (3 - 2 * fr);
      stRy = (sa0[0] + (sa1[0] - sa0[0]) * sm) * fk; stRz = (sa0[1] + (sa1[1] - sa0[1]) * sm) * fk; }
    var live = [Q.x + tb[2] * arc * swayX, Q.y + O.iy + O.ey + Math.sin(t * 1.3) * 0.06 * idle,
      Q.rx + O.leanX + O.erx - O.my * 0.12 * exitK - spinK * 0.12 + tb[0] * arc, Q.ry + O.iry + lean + stRy + O.flip + O.drag + O.sa + dSpin + O.mx * 0.22 * exitK, Q.rz + stRz + tb[1] * arc + Math.sin(t * 0.9) * 0.02 * idle,
      Q.s * O.is * O.es * (1 + Math.abs(spinK) * 0.06)];
    // jumps: during the flight a calm pose (live position, no spin / tumble / sway); then the landing glide into the live pose
    var out = live;
    if (jumping){
      // a fixed upright pose facing you (the scroll-driven pose itself turns as the page flies, so it isn't used here);
      // only the position and size follow the page
      var calm = [Q.x, Q.y + O.iy + O.ey, -0.06, jumpFace, 0, Q.s * O.is * O.es];
      var kIn = Math.min(1, (now - jumpT0) / 500); kIn = 1 - Math.pow(1 - kIn, 3);
      out = jumpFrom ? blendPose(jumpFrom, calm, kIn) : calm;
    } else if (landFrom){
      landK = Math.min(1, landK + Math.min(50, now - lastFrame) / 900); var kL = 1 - Math.pow(1 - landK, 3);
      out = blendPose(landFrom, live, kL);
      if (landK >= 1) landFrom = null;
    }
    shownPose = out; lastFrame = now;
    spin.position.set(out[0], out[1], 0); spin.rotation.set(out[2], out[3], out[4]); spin.scale.setScalar(out[5]);
    // fade a little as the footer comes into view
    var ft = footEl ? footEl.getBoundingClientRect().top : size.h, fv = Math.max(0, Math.min(1, (size.h - ft) / (size.h * 0.45)));
    var op = (1 - 0.6 * fv * fv * (3 - 2 * fv)).toFixed(3); if (op !== lastOp){ lastOp = op; canvas.style.opacity = op; }
    renderer.render(scene, camera);
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
  window.__phonePose = function(){ return shownPose.slice(); };   // read-only: the pose drawn last (for checks)
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
        window.__flipDir = dir; window.__flipFrom = base; setBrand(step(dx < 0 ? 1 : -1), {from: dx < 0 ? 1 : -1}); }
      else { var turn = Math.PI * 2, total = O.flip + O.drag, rest = Math.round(total / turn) * turn; O.flip = total; O.drag = 0;
        G.to(O, {flip: rest, duration:1.2, ease:'elastic.out(1, .45)'}); }
    }
    var proxy = document.createElement('div');
    Draggable.create(proxy, {trigger:zone, type:'x', lockAxis:true, allowNativeTouchScrolling:true, zIndexBoost:false,
      onPress:press, onDrag:function(){ move(this.x); }, onRelease:function(){ var dx = this.x; G.set(proxy, {x:0}); this.update(); release(dx); }});
  })();
}
