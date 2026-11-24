# OddsClub — progress log & checklist

Update this file at the end of every work session (newest log entry at the bottom).

## Phase 1 — Clone with zero loss (parity checklist)
- [x] Docs + prototype exported into repo (`docs/`, `design/prototype/`)
- [x] Payload schema: languages, translations, partners, matches, site-settings, chat-settings, users roles, B2 storage (written, awaiting owner run)
- [x] Seed script with all prototype content (en + fr strings, 4 partners with exact colours, 6 sample matches) — `pnpm seed`
- [x] i18n layer (`src/i18n/data.ts` getDictionary/loadSite, `rich.tsx`, `/[locale]` route, `/` redirect, `src/proxy.ts` sets x-oc-locale for <html lang>)
- [x] site.css copied verbatim → `src/site/styles/site.css`
- [x] Markup: nav, hero (partner switcher, outlined word, drag zone, headline, promo, ticker), features (4 callouts + dots), join (3 steps + code card), board (lounge CTA, sport tabs, matches), footer
- [x] Markup: messenger, context menu, rules sheet, theme sheet, toast, back-to-top, canvas
- [x] Engine: boot + Lenis + ScrollTrigger + headline intro
- [x] Engine: partners (switch, pill stretch, hash `#b-id`, CSS var tween, copy code)
- [x] Engine: feature callouts + nav state + back-to-top ring
- [x] Engine: matches board + sport tabs + ticker
- [x] Engine: 3D phone (poses desktop/mobile slot, intro, pointer tilt, feature flips, brand flip + wordmark reveal, settle safety net)
- [x] Engine: drag phone to switch partner
- [x] Engine: chat UI (rooms, header, convo, reactions, replies, context menu, rules gate, slow mode, themes, morph open/close)
- [ ] Chat backend (phase 5 work pulled forward so the clone has a working chat)
- [ ] Owner verifies desktop / tablet / phone parity against the prototype

## Phase 2–6
See `docs/HANDOFF.md` §4.

## Log
### 2026-11-24
- Project scaffolded by the owner with `create-payload-app` (blank, MongoDB, pnpm). Extra deps added: storage-s3, three, gsap, lenis, motion, dayjs, @floating-ui/dom, socket.io(+client, unused), tsx, @types/three.
- Exported prototype to `design/prototype/oddsclub-prototype.html`; wrote `docs/HANDOFF.md`, `docs/ARCHITECTURE.md`, this file.

### 2026-11-24 (session 2)
- Phase 1a code written: schema (collections Users/Languages/Translations/Partners/Matches, globals site-settings/chat-settings, `fields/localizedText.ts`, `access/`),
  B2 storage via storage-s3 (enabled only when B2_* env vars are set), seed script, i18n data layer, `Site.tsx` markup, `site/engine/engine.ts` (single-file faithful port, `// @ts-nocheck`), site.css.
- All UI strings: `src/i18n/strings.ts` (en + fr, ~215 keys) → seeded into `translations`. Engine uses `S(key, vars)`; markup uses `t()/rich()`.
- three 0.187 port: `THREE.ColorManagement.enabled = false` + light intensities × π to match r128 look.
- Chat backend is a stub (`site/engine/chatBackend.ts`) → chat opens and shows "not available" gate. **Next: phase 1b = real chat backend** (members auth, messages, SSE, presence, moderation) implementing the same adapter interface.
- tsc passes (before `generate:types`). Owner must run: `pnpm generate:types`, `pnpm seed`, `pnpm dev`, then report errors.
- Not done yet: language switcher UI (phase 4), back-office polish (colour picker/preview, translation grid — phase 3).

### 2026-11-24 (session 2, later)
- Owner reported partners/themes missing: `pnpm seed` had never populated the DB (0 partners, 0 translations).
- Fix: seed moved to `src/seed/seed.ts` as `seed(payload)`; it now runs automatically in `payload.config.ts → onInit` on every server start
  (idempotent, adds only what's missing; disable with `OC_AUTO_SEED=false`). `pnpm seed` still works (CLI wrapper `src/seed/index.ts`).

### 2026-11-24 (session 3) — custom back office
- Owner asked for a “fully custom” professional back office. Priorities: 1) chat moderation 2) translations grid 3) partner theme editor 4) dashboard — all four built.
- Payload admin moved: `src/app/(payload)/cms` + `routes.admin = '/cms'`. New back office: `src/app/(backoffice)/` (own root layout, `backoffice.css` = Tailwind v4 + shadcn tokens, brand green accent, light/dark).
- Files: `src/backoffice/{lib/server.ts (auth helpers, run()), lib/partner-schema.ts (zod + contrast), actions/*.ts (server actions), views/*.tsx, components/{data-table,page-header,empty-state}.tsx, components/ui/* (shadcn)}`.
- Pages: `/admin/login` (also creates the first owner), `/admin` dashboard (KPIs, 14-day chat chart, attention list, matches, translation coverage), `/admin/moderation` (reports grouped by message → keep / remove / mute 1h–forever / ban; messages with room filter + remove/restore; members with role + mute/ban), `/admin/translations` (grid of all languages, save on blur, placeholder check, missing filter, coverage cards, CSV import/export, add language, languages sheet), `/admin/partners` (cards, live toggle, add partner copying a theme) and `/admin/partners/[id]` (details, offer + per-language texts, 14 colour pickers, WCAG contrast warnings, live preview).
- New chat collections (data for moderation; live chat API still to build): `members` (auth), `chat-messages`, `chat-reports` in `src/collections/chat/`.
- Gotchas: shadcn CLI wrote `from "cn"` → fixed to `@/backoffice/lib/utils`. TanStack Table installed as v9 → use `/legacy` entry. postcss config must stay the plain object form (dynamic require made Turbopack bundle lightningcss).
- Still linking to `/cms` for: Matches, Site settings, Chat settings, Team accounts. Next: custom pages for those, then phase 1b live chat API + SSE.

### 2026-11-24 (session 3, later) — mobile/tablet phone animation
- Owner: on phone/tablet it looked like more than one mockup. Cause: the mobile scroll path glued the phone to the hero (it left the top of the screen) and then a "second" phone rose from the bottom into the features.
- Fix: one continuous path on every screen size (same timeline as desktop: phone stays on screen and spins from the hero pose into the features pose; hero text scrolls over it).
- Portrait tablets (≤1100px wide, portrait) now use the stacked phone layout too: CSS `@media (max-width:760px), (max-width:1100px) and (orientation:portrait)` and the same query in the engine (`MQ`). The old tablet landscape block is limited to `orientation:landscape`.
- Mobile features pose lowered (y 0.4) so the phone doesn't touch the section title.

### 2026-11-24 (session 3, later) — features scroll feedback
- Owner: scrolling slowly through the features, the phone didn't react until it suddenly flipped.
- Added scroll-linked anticipation: within each feature the phone gradually turns (up to ~0.62 rad, eased) and grows slightly as you near the next one; the flip continues from that angle (tease is folded into `O.flip` in `onFeatureChange`, so no jumps forwards or backwards). Engine: `featureLocal`, `paintProgress`, `teaseFor`, `O.tease`.
- Progress UI: the active callout's green rule and the active dot become progress bars (`--p` 0..1 set by the engine; CSS appended at the end of site.css). Mobile dots centred so the back-to-top button doesn't cover them.
- Follow-up (owner: "it only reacts a bit, it doesn't rotate"): replaced the small anticipation turn + timed flip with a fully
  scroll-driven spin. Each feature: phone faces you for the first 42% of its scroll range (`FACE`), then turns a full 360° in step
  with the scroll; the screen swaps while the back faces you (`Math.round(O.sa / TURN)`), so the next screen arrives as the next
  callout appears. Scrolling back turns it back. State: `O.sa` (smoothed toward the scroll target in `frame()`), `spinPart()`.
