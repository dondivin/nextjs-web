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
- [x] Chat backend (phase 5 work pulled forward so the clone has a working chat) — see session 5
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

### 2026-11-24 (session 4) — phone continues to the bottom of the site
- Owner: the phone should reach the bottom of the site, **behind the content**, and only react to scroll (no docking, no layout changes, no scroll hijacking).
- Removed the features "exit" timeline (phone flying up + canvas hidden). Below the features the phone stays where the features left it
  and turns one full 360° per section, linearly with the scroll (Join → promo screen, Matchday → odds screen, footer → live screen;
  screen swaps while its back faces you). Engine: `tailPose()` used in `frame()`; lean fades out over the first section.
- Layering: `.join/.board/footer` now `z-index:auto` so their backgrounds paint under the phone canvas (z 3); their `.wrap` is z 4 above it.
- An intermediate "dock into slots" version was built and rejected by the owner (it changed the layout) — fully reverted.
- Follow-up: the phone fades (down to ~40% opacity) as the footer scrolls into view (canvas opacity in `frame()`).
- Follow-up: back-to-top (and nav anchor links) made the phone spin through every turn in ~1.5s. Now `window.__phoneJump(ms)` holds the
  phone still (and its screen) during the programmatic scroll, then it glides into the live pose by the shortest turn (0.9s ease-out).
  Wheel / touch / key input during the jump cancels the hold.

### 2026-11-24 (session 5) — live chat backend
- Owner decisions: fans sign in with **email + password** (Payload auth on `members`); the **partner team / moderators are back-office
  users** (`users` with role moderator or owner). Signed in at /admin = staff in the site chat (same `payload-token` cookie).
- Server (`src/chat/`): `hub.ts` (in-process SSE hub on globalThis: clients, presence, slow-mode clock), `data.ts` (wire format, profiles,
  mute list, report counts, staff thread list, current agent, match mapper), `service.ts` (viewer context, hello snapshot, server-side
  message rules, actions, sign-up/in), `hooks.ts` (Payload afterChange hooks on chat-messages / members / chat-reports / matches → live events,
  so back-office actions also update open chats instantly).
- Routes: `GET /chat-api/stream?locale=` (SSE; `hello` then deltas: msg, peers, mod, access, reports, myReports, thread, agent, profiles, matches)
  and `POST /chat-api/<action>` JSON only: send, react, report, remove, mute, rules, presence, seen, thread, profiles, signup, login, logout.
- Browser: `site/engine/chatBackend.ts` is now the real adapter (same interface as the stub) + the sign-in / sign-up / account sheet
  (`#authSheet`, account button `#chatAccount` in the chat sidebar). New strings `auth.*`, `chat.err.*` (en + fr; seeded on next start).
- Schema: chat-messages `staffAuthor` (users), `clientId`, `reply.by`; users `chatLastSeenAt`; members `maxLoginAttempts` 8 / `lockTime` 10 min.
- **Security fix**: members `role`/`status`/`mutedUntil`/`moderationNote` were only protected on update → a public `POST /api/members`
  could create a moderator. Now moderator-only on create too (verified: request with role=moderator is saved as fan).
- Tested end to end (API + browser) with a throwaway account, then deleted it: rules gate, slow mode, link rule, reactions live,
  reports, DM privacy (other visitors never receive direct chats), logout, sign-in sheet errors, posting from the UI.
- Note: `pnpm payload run <script>` exits without running the script on this machine (likely why `pnpm seed` never filled the DB).
  Workaround: `node --env-file=.env --import tsx <script>`. The auto-seed on server start is unaffected.
- Limits / next: single server process (Redis pub/sub needed before running several instances); no password reset or email
  verification yet (needs an email service); staff DM list is built from the latest 2000 direct messages.

### 2026-11-24 (session 5, later) — forgot password without email
- Owner: "forgot password" requests go to the back office and the team lets the fan reset.
- Flow: sign-in sheet → "Forgot password?" → email + optional message → `password-resets` doc (status pending). The browser keeps
  `{id, token}` in localStorage (`oc_pw_reset`); only the SHA-256 of the token is stored. Staff approve/decline at **/admin/resets**
  (sidebar badge + dashboard notice). Once approved, that browser's Sign in opens "Choose a new password" (48 h); saving sets the
  password, unlocks the account, marks the request done and signs the fan in. Staff never see or send a password.
- API: `forgot`, `reset-status`, `reset` (in `src/chat/service.ts`). Limits: 3 requests per email per 24 h; a new request replaces the
  previous open one; pending requests expire after 7 days. Same answer whether or not the email has an account (the team sees it).
- Tested end to end in the browser (approval simulated directly in the DB — no back-office login available), then cleaned up.
  Owner to check: /admin/resets page with a moderator login.

### 2026-11-24 (session 5, later) — usernames + avatars (fans and staff)
- Fans: sign-up now asks for a **username** (2–24 letters/numbers; unique ignoring case via `members.nameKey`; can't copy a team
  member's name or the site agent name; banned words refused) and an **avatar**: upload a photo or keep the random gradient
  (pre-picked, "Shuffle colours"). No choice → random gradient right away (also enforced in a `beforeChange` hook).
  Fans can change both later: account sheet → "Edit profile".
- Staff: **/admin/profile** ("My chat profile" in the sidebar + account menu): chat name, photo or gradient, live preview. Saved
  through a server action (`serverActions.bodySizeLimit` raised to 6 MB in next.config.ts — restart `pnpm dev` once).
- Photos: re-encoded server-side with sharp to 256×256 WebP (strips EXIF/GPS, rejects non-images, 5 MB max), stored in `media`
  (B2 when configured); the replaced photo is deleted. Moderators: Moderation → Members → "Remove profile photo".
- Gradients are stored in one strict CSS format (`src/chat/gradient.ts`, validated by regex) and drawn as the avatar background;
  the first colour is the name colour. Profile changes (fans and staff) are pushed live to open chats.
- Tested: sign-up with shuffle + photo, photo shown in account sheet, edit profile (rename + remove photo), another visitor sees the
  gradient avatar, duplicate/staff names refused, CSS injection in gradient ignored, fake image rejected. Test data cleaned up.
  Not tested (no back-office login here): /admin/profile save and "Remove profile photo".

### 2026-11-24 (session 5, later) — Cloudflare R2 instead of Backblaze B2
- Owner chose Cloudflare. Uploads now go to **R2** when `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` are set
  (endpoint `https://<account>.r2.cloudflarestorage.com`, region `auto`). Optional `R2_PUBLIC_URL` (bucket custom domain) → image URLs
  point straight at Cloudflare's CDN (`disablePayloadAccessControl` + `generateFileURL`); without it files stream through
  `/api/media/file/…`. B2 variables removed (.env.example updated). No R2 credentials yet → still local `./media`; not yet tested against R2.
- If Cloudflare also proxies the site: SSE works (20 s heartbeat < Cloudflare's 100 s idle limit; responses are `no-cache`), but add a
  Cache Rule "bypass cache" for `/chat-api/*` and `/admin*`, and use SSL mode Full (strict).

### 2026-11-24 (session 5, later) — back-office "Forgot your password?"
- The login link pointed to Payload's own `/cms/forgot` (other UI, and it emails a link — no email service → only printed to the console).
- Now `/admin/forgot` (same look as the login): request (email + optional message) → **an owner** approves on Password resets
  (team requests show a "Team account" badge; moderators don't see them and can't approve them, also enforced in the collection
  access and in `decideReset`; an owner can't approve a reset of their own account) → the same browser sets a new password
  and is signed in. Actions: `src/backoffice/actions/staff-reset.ts`; `password-resets.kind` = member | staff, `user` relation.
- Tested in the browser up to "Waiting for an owner" (state kept after reload). Creating a test moderator account to test approval +
  new password was blocked by the permission system → **owner to test end to end** (see the summary given in chat).
- Single-owner case: an owner who forgets their own password can't be approved by anyone else → recovery must happen on the server.

### 2026-11-24 (session 5, later) — server recovery command
- `pnpm admin:reset-password` (`src/scripts/reset-password.ts`), run on the server from the project folder (reads `.env`).
  Owner rule: **only the main admin** (the oldest back-office account = the first one created) can be reset from the server;
  every other account must use "Forgot your password?" + owner approval. No args → shows the main admin; `<email>` (hidden prompt,
  typed twice) or `<email> --generate`. Unlocks it, keeps/restores its owner role, cancels open reset requests for it.
- `pnpm seed` fixed: it used `payload run`, which exits without running anything here → now `node --env-file-if-exists=.env --import tsx`.
- Deployment note: the Docker runner image is Next "standalone" (no source / tsx), so run these commands from a project checkout
  on the VPS (or a one-off container built from the `builder` stage). Also: next.config.ts has no `output: 'standalone'` yet, which
  the Dockerfile needs — fix when we set up the VPS.
- Main admin protection (`src/collections/Users.ts`, `mainAdminId()`): the oldest `users` account can't be deleted (beforeDelete),
  always keeps the owner role, and only the main admin themself — or the server command (`context.mainAdminRecovery`) — can change
  its email or password (beforeValidate, which runs before Payload applies a password). Reset requests for the main admin can't be
  approved in the back office (`decideReset`; badge "Main admin" + disabled Approve on /admin/resets).
  Verified with 10 hook cases called directly (no database writes): all as expected.

### 2026-11-24 (session 5, later) — last Payload screens replaced in the back office
- New custom pages (same shadcn style): **/admin/matches** (table, on/off switch, add/edit side sheet, delete), **/admin/settings/site**
  (site name, default partner, team name in the chat, helpline + company line per language), **/admin/settings/chat** (slow mode,
  max length, house rules with icon + per-language title/text, add/remove/reorder, banned words one per line), **/admin/team**
  (everyone sees the list; owners add people → temporary password shown once, change roles, delete; main admin + yourself
  protected), **/admin/account** (name, email, new password; current password required for email/password, re-signs in).
- Server actions: `actions/content.ts` (matches, site, chat — chat settings cache cleared on save), `actions/team.ts`;
  schemas `lib/forms.ts`; per-language input `components/localized-input.tsx`; option lists moved to `src/lib/options.ts`.
- Sidebar/menu/dashboard no longer link to /cms, except **Raw data editor** (owners only).
- Verified: type-check, every page compiles and redirects signed-out visitors to the login. **Not yet seen signed in** (no
  back-office login available to Claude) → owner to click through and report.
- Fix: "Encountered a script tag while rendering React component" (React 19.2 dev warning) came from next-themes 0.4.6 (latest),
  which renders its anti-flash <script> from a client component. Replaced by `backoffice/components/theme-provider.tsx` (own
  light/dark/system context, same localStorage key `theme`) + `themeInitScript` inlined in <head> by the server layout.
  Verified: no console errors on /admin/login, dark mode applied before first paint. `next-themes` is no longer imported
  (can be removed with `pnpm remove next-themes`).
- Fix: /admin/settings/chat (and /site) returned 500 — `fillLanguages()` lived in a 'use client' file and was called from the
  server page. Moved to `backoffice/lib/localized.ts`. Same class of bug: `themeInitScript` was exported from the 'use client'
  theme provider (server got a client reference, not the string) → moved to `backoffice/lib/theme-script.ts` (+ fixed a
  template slip that made it read the wrong localStorage key). Rule: **server pages/layouts may only import components and
  types from 'use client' files — helpers/constants go in a plain module** (a scan found no other case).
  Verified: served HTML has the right script; with all app JS blocked the page still turns dark; no console errors on
  /admin/login → /admin/forgot → /admin/login → /en.
- Layout: Chat profile, Site settings, Chat settings and My account were capped at max-w-2xl/3xl (narrow column, empty right side).
  Now full width like the partner editor: Chat profile = form + sticky preview (room message + fan's direct-chat header),
  Save in the page header (enabled when something changed); Site settings = General | Footer side by side; Chat settings =
  house rules main column + sticky side column (Limits, Banned words); My account = Profile | Sign-in. Below xl/lg they stack.
  Rule for new back-office pages: no max-w on the page; use `grid xl:grid-cols-[minmax(0,1fr)_380-400px]` or 2 columns.

### 2026-11-24 (session 5, later) — language switcher + language icons; chat picture fix
- Bug: picture messages disappeared after sending/reload — the browser adapter's `view()` dropped the `image` field when
  mapping server messages. Fixed (server + file serving were fine). Verified as an anonymous visitor: picture shown, viewer opens.
- `languages.icon` (media): uploaded in Translations → **Add language** (optional icon) and **Languages** panel (click the icon
  to change, "remove icon"). `storeLanguageIcon()` turns SVG/PNG/JPG (≤ 2 MB) into a 128×128 WebP (SVG rasterised → no script kept).
  Icons also shown in the translations grid headers.
- Site: `src/site/LanguageSwitcher.tsx` in the nav (Site's `languageSwitcher` slot): current icon + code; menu of enabled languages
  (icon, native name, code, check); keyboard (arrows / Escape), click outside closes; picking sets cookie `oc_locale` (read by "/")
  and opens `/<code>#same-section`. Hidden with one language; no icon → code in a circle. Narrow phones: nav fits on one line
  in en + fr at 360/390 px. Verified in the browser (switch en → fr, "/" remembers fr, SVG flag test added then removed).

### 2026-11-24 (session 5, later) — platform logo + SEO
- Site settings → **Brand & search** (back office): **logo** (SVG/PNG/JPG → 512×512 PNG), optional **link-preview image**
  (→ 1200×630 JPG; otherwise generated from the logo), **search description** per language. Live previews (top bar, tab, Google
  result, shared link). Images save immediately (`setBrandImage`), description with the form.
- Logo used in: site nav + chat sidebar (`BrandMark logoUrl`), back-office sidebar / login / forgot (`BrandLogo`), site name too.
- Derived images (`src/lib/brand-images.ts`, cached per logo): `/brand/icon/{16,32,48,180,192,512}`, `/favicon.ico` (fixes the 404),
  `/brand/og`. Default lightning mark when no logo.
- SEO on `/[locale]`: metadataBase, title, description, canonical, hreflang alternates + x-default, Open Graph + Twitter card with
  the share image, icons, theme-color, JSON-LD (Organization with logo, WebSite). `/robots.txt` (blocks /admin, /cms, /api, /chat-api)
  and `/sitemap.xml` (all enabled languages with hreflang).
- **Production must set `NEXT_PUBLIC_SERVER_URL`** (e.g. https://oddsclub.example) — share images, canonical URLs, sitemap and
  structured data are absolute and currently fall back to http://localhost:3000. After launch: submit /sitemap.xml in Google Search Console.
- Verified with a temporary test logo (then removed): nav, chat sidebar, login, favicon, generated share image all switched.
