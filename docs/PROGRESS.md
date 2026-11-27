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

### 2026-11-24 (session 6) — first-screen person picture
- Owner: big cut-out person picture (no background) on the first screen, managed in the back office. Choices: **left side, in front of
  the headline** (phone stays in front), **one picture for the whole site** (not per partner).
- `site-settings.heroImage` (media). Back office: Site settings → **First screen picture** (upload / replace / remove, desktop preview).
  `storeHeroImage()`: PNG/WebP/AVIF (JPG accepted), ≤ 10 MB, transparency kept (WebP with alpha), empty transparent margins trimmed,
  longest side ≤ 1800 px; reports whether the picture really is transparent → warning toast if it still has a background.
- Site: `<img class="hero-person">` in the hero (z 2: above headline, below the phone canvas z 3 and the intro/buttons z 4), bottom fades
  out (mask) so the intro text stays readable, rise-in on load (none with reduced motion). Phones / portrait tablets: starts under the
  partner bar, aligned with the phone slot, partly behind the phone. (A drop-shadow + mask drew a visible box → removed.)
- Verified with a temporary test figure (then removed) on desktop 1440, tablet 1024 portrait, phone 390; transparency check true for a
  cut-out PNG and false for a JPG with background.
- Back-to-top slowed down (owner): duration grows with distance, `min(3, 1.6 + scrollY/4500)` s (≈2.8 s from the bottom), with an
  ease-in-out curve (was a fixed 1.6 s with a fast start). The 3D phone hold (`__phoneJump`) uses the same duration.
- Hydration warning on `<html>` (`lang="fr"` vs `"en"` + class `translated-ltr`) = Chrome's page translation editing the tag before React
  loads, not a bug. Added `suppressHydrationWarning` on the public `<html>` (that element's attributes only). Translation stays allowed.

### 2026-11-24 (session 6, later) — people, online list, fan-to-fan private chats
- Explained to owner: the "football" rooms are the seeded sample matches (Example league) — real rooms; delete/disable them in
  /admin/matches. Previously the only private chat was fan ↔ partner team; nobody could search or start a conversation.
- Owner decisions: **fans → fans only if both agree** (request → accept / decline / block), staff can message any fan directly;
  **online list for everyone**.
- Server: `chat-requests` collection + `src/chat/pm.ts`; service `people` (username search, signed-in only), `chatRequest`
  (rules: accepted house rules, not muted; note ≤ 140 chars checked like messages; ≤ 10 open / 20 per day; 7 days after a decline;
  asking back = accepting), `chatRespond` (accept / decline / block / cancel / unblock); `send` with `pmTo` only for accepted pairs.
  Private rooms excluded from the public room list, REST read access and chat-image access; hooks send pm messages and request
  changes only to the two fans (each gets their own view; decline/block invisible to the other side).
- Browser: people panel in the chat sidebar (`#people`): chat requests (Accept / Decline / Block), "Online now" strip (staff first,
  MOD tag, +N guests), people results when searching (the room search now also finds people). Person card (`#personSheet`):
  request with optional note / waiting / accept / open chat / block / unblock; staff get "Message" (opens the fan's team thread);
  fans clicking staff get "Message the team". Engine: `pm:<uid>` rooms (waiting state + gate, typing, header block button),
  hooks `pms`, `pmMsgs`, `openChatWith`.
- Verified: API (12 checks incl. privacy: anonymous stream + public REST never see private messages; block stops messages and
  requests) and two browsers (request → card on the other side → accept → chat opens → message delivered). Test data removed.
  Not verified in a browser: the staff "Message" flow (no staff login available to Claude).

### 2026-11-24 (session 6, later) — sample matches removed
- Owner: no sample conversations. The 6 seeded sample matches (Example league…) are removed from `src/seed/seed.ts` (the seed used
  to re-add them whenever the matches table was empty) and deleted from the database (no messages/pictures were in their rooms).
  The chat now shows the lounge + private chats until real matches are added in /admin/matches.
- Chrome translation turned initials into words ("LU" → "READ", "NE" → "BORN"): team badges, avatar initials and scores are now
  marked `translate="no"` / `notranslate` (engine `el()` + people panel avatars). ("DIRECT" was the French LIVE label, not a bug.)

### 2026-11-24 (session 6, later) — no "Fan" label, chat survives a refresh
- "Fan" was a fallback name (profile not loaded yet) and a role label. Now: unknown names are fetched on demand (`fetchName`,
  '…' meanwhile), "Deleted account" when the account no longer exists, "Guest" for visitors; headers / person cards show
  Online now / Offline (staff: Partner team). Default wording "fans" → "members / the community" (en + fr); 14 untouched DB texts
  updated the same way (edited texts left alone).
- Refresh: private and team chats now have their own address (`#chat-pm-<id>`, `#chat-sup-<id>`, was a shared `#chat-dm` kept in
  memory) → a refresh reopens the same conversation once its data arrives (`CHAT.wantRoom`). Opening from a refresh / link shows
  the chat at once (no morph animation; the morph stays for taps). Staff can open a fan's team thread by address even before it
  has messages. Verified in the browser (refresh inside a private chat → same chat, opened instantly). Test data removed.

### 2026-11-24 (session 6, later) — groups & channels
- Owner decisions: **staff create/edit rooms**; two kinds: **group** (members post) and **channel** (only the team posts, members
  read + react); joining rules per room: **open** (anyone reads, one tap to join), **request** (visible, team approves),
  **invite** (hidden, invited people accept) + **auto-add new members** (and "Add all members" for existing accounts).
- Collections `chat-rooms`, `chat-room-members`; `src/chat/groups.ts` (visibility / read / post rules, `roomsFor`, `roomAccess`,
  `setMembership`). Service: snapshot `groups` + `gMsgs`, actions `groups` (refresh after a `groups` event), `group-join`,
  `group-leave`; `send` to `g:<id>` checked; signup auto-joins auto-add rooms. Hooks: group messages go to everyone for open rooms,
  else members + team only; any room/membership change → `groups` event (clients refetch). Public REST never returns `g:` messages.
- Back office: **/admin/groups** (list: kind, join rule, auto-add, members / waiting / invited, archived) + "New group or channel"
  sheet; **/admin/groups/[id]**: settings (shared `group-fields.tsx`), members with tabs Members / Waiting (accept, decline) /
  Invited, invite by username (or add directly), "Add all members", delete (room + memberships + messages). Nav: Community.
- Chat: rooms list after the lounge (icon, CHANNEL tag, status lines: invited / request sent / members only), header "Group ·
  N members", leave button, room rules in the pinned bar, gate with Join / Request to join / Cancel request / Join + Decline (invite),
  "Members only" placeholder, "No announcements yet" for empty channels. Address `#chat-g-<id>` (survives a refresh).
- Ghost "online" people: closed tabs weren't always noticed. Now every chat sends a keep-alive each minute, the server drops
  connections silent for 150 s, and deleting an account closes its connections.
- Verified: API (visibility for anonymous / members, auto-add, channel posting refused, request → accepted → can post, invite →
  accept, invite-only messages never reach non-members / anonymous / public API, leave) and the browser (channel + request flow).
  Test rooms/accounts removed. Not verified signed in: the back-office pages (no staff login for Claude).

### 2026-11-24 (session 6, later) — the chat is a page
- Owner: no "sheet / dialog" opening animation; the chat should be a page. Now `/[locale]/chat` (room list) and
  `/[locale]/chat/<room>` (lounge, match id, support, g-<id>, pm-<id>, sup-<id>) — route `app/(frontend)/[locale]/chat/[[...room]]`
  renders the same site with the chat already open (`renderSite(locale, { room })` in `src/site/render-site.tsx`; chat pages are
  noindex). The engine navigates with history.pushState (`goChat`, `leaveChat`, `chatFromPath`, popstate): no morph, browser Back
  goes room → list → site and restores the site's scroll position; the close button / Escape do the same; tab title = room.
  The site behind is `inert` while the chat is open. Old `#chat…` links are converted to the new addresses (on load and in-page).
- Verified in the browser (desktop + phone): open from the nav, room, Back ×2 (scroll restored to 4800 px), direct load already
  open before scripts, close → /en, titles, old hash link.
- Browser translation turned OFF for the public site (`<html translate="no" class="notranslate">` + `<meta name="google"
  content="notranslate">`). Chrome translating /fr into English rewrote the page before React loaded (`<font>` wrappers, changed
  aria-labels) → "Hydration failed", React rebuilt the tree and the chat engine hit missing elements ("Cannot set properties of
  null" in updateLounge). The site's own language switcher replaces it. `updateLounge` is null-safe too.
- Chat picture viewer animated (owner: "grow bigger to full screen and return where it was"): a frame grows from the bubble's exact
  rect to the full-screen fit (bubble crop opens into the whole picture, corners round off, background fades in, bubble copy hidden),
  and closing (tap, ✕, Escape) shrinks it back into the re-measured bubble; if the bubble scrolled away it fades/scales out.
  Drag down/up to close (follows the finger, background fades; < 110 px springs back). Reduced motion: instant. Resize-aware.
  Verified: frame measured at bubble → 694×582 → 817×685 → 859×720 and back to the bubble; drag-to-close.

### 2026-11-24/25 (session 6, later) — member roles: groups & channels made from the chat
- Owner: "in the chat we can create group or channel based on the rights the account's role has → more roles in the back office".
  Choices: custom roles; the room owner edits name/description/rules, manages members, names co-admins, archives/deletes; join
  rules same as the team's (open / request / invite).
- New collection `member-roles` (rights: create groups, create channels, max rooms owned, send pictures, private chats, show badge;
  colour; one default). Seed creates a default "Member" role (private chats on, nothing else). `members.role` select replaced by
  `memberRole`. `chat-rooms.owner` (member) and `chat-room-members.admin` (co-admin) added.
- Server: rights resolved per connection (`permsOf`, cached 30 s; the team has everything). `hello` carries `perms`. New actions
  `room-create` (rights per kind, limit on *active* rooms owned), `room-update`, `room-remove` (archive / delete; owner or team),
  `room-members`, `room-member` (invite / accept / decline / remove / admin / unadmin — co-admin changes owner-only; the owner can't
  be removed). Channels: owner + co-admins post. Pictures: team, own team chat, or role "send pictures" (not in private chats).
  Chat requests need "private chats". Role or member-role change → `rolesChanged` event → that chat reconnects with the new rights.
- Back office: **/admin/roles** (table + editor sheet, badge preview; deleting a role moves its members to the default role),
  role picker in Moderation → Members, groups list shows "Made by", room page shows Owner / Co-admin and Make / Remove admin.
- Chat: "+" button in the sidebar (only when the role allows), room sheet (#roomSheet) with Settings (name, description, kind
  limited by rights, who can join, rules, Archive / Delete for the owner) and Members (invite by username, accept / decline
  requests, co-admins, remove, cancel invites); gear in the room header for owner / co-admins / team; role badge (role colour) next
  to names; member-owned channels say "Only the admins of this channel post here"; "1 member" singular.
- Verified via API: rights per role (default role refused, limit reached, wrong kind refused), request → accept, co-admin posting
  in a channel, co-admin can't change admins or the kind, only the owner archives. Browser: create sheet + limit error, gear,
  Members tab (Owner / Co-admin labels), badge seen by another member, co-admin gets the gear, default role has no "+", archive →
  back to the lounge. The create → invite run in the browser was cut short (dev server stopped); test data removed.
- Not verified: live `rolesChanged` from the back office (needs a staff login), back-office roles pages signed in.

### 2026-11-25 — no "fan" / league framing
- Owner: the site is a betting-affiliate platform (partner codes, bonuses, odds, community chat), not a fan club; remove every
  "fan" and league-flavoured wording (listing matches and odds stays).
- Site texts (code seed + DB, hand-edited DB values left alone): room name placeholder "e.g. Bonus codes", responsible-play tip
  "Set your limit before you bet", ticker "Loading live odds" / "Odds board below", phone label "Live odds"; unused `chat.fan`
  deleted; `phone.fanChat` renamed `phone.communityChat`.
- Back office: every "fan(s)" → "member(s)" (dashboard, moderation fallback name, chat profile, site/chat settings, password
  resets, team-account roles, Payload field labels); match editor "Kick-off" → "Start time", league placeholder → "Competition";
  group name placeholder "e.g. VIP bonus group"; SEO description example rewritten around partner codes, odds and the chat.
- Code comments use "member" too. Audit of DB texts, partners, rooms, roles, matches and settings: no fan / league wording left.

### 2026-11-25 — first-screen picture per partner
- Owner: one person picture per partner instead of one for the whole site.
- `partners.heroImage` (media, same processing as the site picture: cut-out check, trim, WebP ≤ 1800 px). Site settings →
  First screen picture is now the default for partners without their own.
- Back office: partner page → "First screen picture" card (saved immediately, the default shows faded when empty; action
  `setPartnerHero`; deleting a partner deletes its picture). The uploader is shared: `src/backoffice/views/brand-image.tsx`
  (BrandImage + LogoMark, moved out of site-settings.tsx).
- Site: `EnginePartner.hero` + `EngineConfig.heroDefault`; the server renders the first partner's picture (the `<img>` is always
  there, hidden, when any picture exists). Switching partner: picture fades down, the new file is decoded first, then rises in;
  same file → nothing happens; no picture → hidden. Other partners' pictures preload when the visitor reaches the switcher.
- Verified in the browser with a temporary picture on 888STARZ: swap to it, back to the default on Melbet (fade measured), no
  errors; temporary picture removed.
- Follow-up (owner: "never just change it, smooth with motion"): real crossover instead of fade-out-then-in. The new picture is
  decoded first (old one stays, 4 s cap), then both overlap: the old drifts out (−46 px towards where you came from, scale .96,
  .55 s) while the new slides in from the side you switched towards (70 px, scale 1.04 → 1, 1.05 s expo-out). Direction follows
  the switcher order. Fast double switches cancel cleanly (no leftover copies). First load on another partner than the server's
  default: the picture stays invisible until the right file is loaded, then rises in (never shows the wrong person). Reduced
  motion: plain .45 s crossfade. Pictures preload when the page is idle (and on reaching the switcher), so switches start at once.
  Verified frame by frame both directions, fast switching, first load; temporary picture removed.
- Correction (owner): (1) no fallback — a partner without its own picture shows no person. The Site settings "First screen
  picture" card is gone (global field kept hidden so old data isn't lost; `heroDefault` / `Brand.hero` removed); its preview
  moved to the partner page, drawn in the partner's colours. (2) The sideways slide + scale was not wanted: back to the original
  vertical motion — old picture sinks 24 px and fades (.38 s), new one rises 40 px → 0 with the page-opening curve
  cubic-bezier(.16,1,.3,1) over 1.3 s, slight overlap so there's no empty moment, file decoded first (Web Animations API).
  Verified with the real pictures (1xBet, 888STARZ, Melbet, Betwinner) and "New partner" (none → picture sinks out, nothing shown).
- Follow-up (owner: "too quick; horizontal, from the side the partner is on"): sideways and unhurried. Picking a partner to the
  right (or → key, or dragging the phone to the left = next) brings the new picture in from the right while the old one drifts
  out to the left; the other way round for the left. Old: 110 px + fade over .9 s (ease-in-out). New: from 140 px, 1.6 s soft
  ease-out cubic-bezier(.22,.61,.36,1), starts .18 s after, fully visible at 85 % of the move. Wrap-around follows the gesture,
  not the list order. Reduced motion: .6 s crossfade. Verified clicks both ways, arrow keys (wrap), phone drag both ways.
- Follow-up (owner: "make the motion and timings configurable — per partner"): `partners.heroMotion` {style slide | rise | fade,
  easing soft | smooth | expressive | linear, enterMs, exitMs, delayMs, distance}; it applies when the site switches TO that
  partner. Shared definitions + clamping + defaults in `src/lib/hero-motion.ts` (`heroMotionOf`, `heroMotionPlay`); the loader
  sends `EnginePartner.motion`; the engine's swapHero builds its keyframes from it (reduced motion still forces a short fade).
  Back office: partner page → First screen picture → "Switch animation" (style toggle, times in seconds, distance, easing,
  Default button, live preview playing the same keyframes "from left" / "from right", scaled to the preview). Saved with the
  partner form (zod limits: arrival 0.2–5 s, leaving 0.1–4 s, delay 0–2 s, distance 0–400 px).
  Verified on the site: Melbet set to Rise / 2 s / 80 px rose from below while Betwinner kept the default slide; reset after.
  Not verified: the back-office controls and preview signed in (no staff login for Claude).
- Follow-up (owner: "show it in the preview in real time, and the final result"): both previews now play the switch live.
  "Switch animation" preview replays by itself ~0.3 s after any setting changes, From left / From right, ▶ replay and a Loop
  switch (keeps replaying, alternating sides); capped at 560 px so settings + preview fit on screen. The sticky "Live preview"
  (mini site) now shows the partner's person in the hero — in front of the headline, behind the phone and buttons, like the
  site — and plays the same switch on changes (▶ replays). Shared: `src/backoffice/lib/hero-switch-play.ts` (keyframes, same as
  the engine, scaled to the preview width) and `use-hero-switch.ts` (auto-replay on real changes only, loop, direction).
  Verified on a temporary unauthenticated copy of the partner page (deleted after): changing Style and Arrival time replayed
  both previews; Loop; no console errors.

### 2026-11-25 — feature section pacing + no screen cut after "back to top"
- Owner (phone screenshot): too much scroll before the phone starts turning in the features section and before the last
  progress bar fills; after "back to top" the phone screen changed instantly.
- Pacing: the hold before each turn was 42 % of a feature's scroll → 16 % on phones, 26 % on desktop (`FACE()`); the section
  splits into 4 features + a short end hold (`FEAT_UNITS` 4.15, was 4.4 with the last feature stretched ×1.4), so the last bar
  fills before the section ends; phones: `.features` 330vh (was 420vh). Measured at 390×844: turning starts ≈0.15 screen into
  the section, one feature ≈0.77 screen, last bar full ≈0.1 screen before the end.
- Screen changes never cut while the phone faces you: `wantScreen()` swaps directly only when the back/edge faces you (as during
  scroll turns); otherwise `turnToScreen()` turns the phone once and swaps at the half turn. Used after back-to-top / nav jumps
  (waits for the jump and the settle blend), and for the feature / tail screens. Verified: back to top from the odds board →
  arrives, settles, one 1.25 s turn, home screen; no console errors.
- Follow-up (owner: "still too much scroll; the last one must rotate too"): `.features` 330vh desktop / 260vh phones (≈2.3
  screens of scroll on both, was 3.2), hold before each turn 8 % phones / 14 % desktop, `FEAT_UNITS` 4.08. The 4th feature now
  turns once as well (4 turns in all; after the section the target stays at 4 turns, so nothing unwinds). Measured at 390×844:
  ≈0.56 screen per feature, turning starts right away, 4th turn completes as its bar fills; same 4.00 turns past the section
  on desktop and phone.
- Owner idea (phones): "instead of rotating in the same place, make the phone rotate and go down to the next part" — the
  features section on phones (same query as the 3D phone: ≤760px or portrait ≤1100px) is no longer pinned. The 4 callouts are
  stacked blocks in reading order (0-3), each with an empty slot (`--fslot` 56svh) at its top for the phone, text below.
  Engine: `flowInfo()` finds the block being left and the travel progress; the phone rides up with that block, then glides
  DOWN to the next block's slot while turning once (smoothstep, `flowEase`), landing facing you with the new screen as that
  block reaches the rest line (`FLOW_R` 35 % of the screen); after the last block it rests there and the tail behaviour
  continues (3 turns in the section, no extra spin). `poseB()` on phones = the first block's slot, and the hero's smoothed
  scroll pose is blended into the block pose over the end of that animation, so nothing jumps. Text and title sit above the
  canvas on phones (z 4), so the gliding phone passes behind the words. All blocks are visible; each plays its reveal once;
  dots hidden. Desktop and landscape tablets keep the pinned version (verified: sticky, 4 turns).
  Verified at 390×844: phone centre rides 295 → ~210 px, glides down to ~380 px turning, settles at 295; turns 0→1→2→3; no
  console errors over a full-page scroll.
- Follow-up (owner: "keep the same rhythm when scrolling fast"): the phone's scroll turn no longer follows the scroll 1:1.
  `steady()` eases after the target with a speed limit: max one turn per 0.8 s (`SPIN_SEC`), a little faster when several
  turns are owed (+35 % per extra turn) so a hard flick catches up in ~2 s instead of spinning on; screens still change at
  the half turns. Used for the features spin (desktop + phones), the turn per section below the features (`tailU`, its screen
  follows the smoothed value) and the phone's place in the phone layout (`flowY`: eased, ≤ 2.4 screens/s). During back-to-top /
  nav jumps it just follows (the phone is held still then), so nothing is owed afterwards.
  Measured: normal flick → steady 1.25 turns/s; flick of 3 turns → ~2 turns/s easing to 1.25, done in ~2 s, no jumps; desktop same.
- Follow-up (owner: "from section 2 it only rotates vertically; at the start it moves in all angles"): scroll turns are no longer
  a flat spin around the vertical axis. Mid-turn the phone also tips (rx), leans (rz) and drifts sideways (x), peaking at the
  half turn and back to 0 when facing; the mix changes every turn (`TUMBLE`, 5 variants, cycling; sideways drift ×0.45 on
  phones). Phones: each stop also has its own resting angle, alternating sides (`STANCE`, ry ±0.24–0.30 with a small rz),
  blended in from the hero (× the hand-over factor), so it never stands flat. Desktop keeps its lean towards the active callout.
  Applies to the features and to the turns below them. Verified visually (rest angles alternate, diagonal tumble mid-turn),
  no console errors on phone or desktop.

### 2026-11-25 — sheets scroll with the mouse wheel
- Owner: the "New group or channel" sheet could not be scrolled. Cause: Lenis (page smooth scroll) took every wheel event, so
  scrollable boxes inside the page didn't scroll. Lenis now runs with `allowNestedScroll: true` and `prevent` for `.sheet`,
  `.sheet-wrap` and `#messenger`, so every sheet (room, auth, rules, theme, person) and the chat scroll natively; the page keeps
  its smooth scroll. Verified: wheel over a tall room sheet scrolled it (0 → 1000 px), the page still smooth-scrolls.
- The new-room intro said "up to ∞ rooms" for team accounts: the team now gets `rooms.newIntroTeam` (no limit sentence).

### 2026-11-25 — the Community lounge is managed in the back office
- Owner: "Communauté" (the chat's main room / title) wasn't managed anywhere. The lounge is a built-in room (not a chat-rooms
  doc); its texts only existed as translation keys. Now: Chat settings global → `lounge` group {chatTitle, name, subtitle,
  description (all per language), postBy everyone | team}.
- Back office: Groups & channels starts with a "Community lounge · Built-in" entry → `/admin/groups/lounge` (moderators):
  chat title (the big "Communauté" at the top of the chat + tab), lounge name, subtitle, description (empty = default wording,
  shown as grey placeholders per language), who can post, live preview (room list + header). Action `saveLounge`.
  `LocalizedInput` gained `placeholders` (per language) and `optional` (no "missing" dot).
- Site: `loadSite` swaps in the texts written for that language (`chat.title`, `chat.lounge`, `chat.loungeSub`, `lounge.info`,
  `chat.loungeHint`); team-only lounge → subtitle "Announcements · the team posts" unless one is written, members get the gate
  "Only the team posts in the lounge. You can react to messages." and the server refuses their messages (`chat.err.loungeTeam`).
- Verified: French override shown in /fr only (English kept default), member blocked in team-only mode (API + gate), editor
  rendered on a temporary unauthenticated copy (deleted). Test data reset, test account removed.
- Image viewer: the full-size picture kept 12 px rounded corners. Now it opens from the bubble's own radius to 0 (square)
  at full size, also after a window resize; corners round again only while it shrinks back / is dragged away. Verified:
  radius 12 → 5 → 1.7 → 0 px during the opening, 0 at full size.

### 2026-11-25 — Members: every registered account in one place
- Owner: no menu to see all registered accounts and manage them (ban, delete, demote/promote, reset password…). The only list
  was a tab inside Moderation (mute/ban/role).
- New nav item **Members** (Community, `/admin/members`, moderators): stats (accounts, online now, new this week, muted or
  banned), search by username / e-mail, filters (All / Online / Active / Muted / Banned, by role), columns member (avatar,
  online dot) · role picker (promote / demote) · status · messages · last seen ("Online now" from the live hub) · joined;
  row menu: open profile, unmute / lift ban, mute (1 h · 24 h · 7 days · until unmuted), ban (confirm), reset password,
  remove photo, delete account.
- Member page `/admin/members/[id]`: header (status, role badge, online / last seen, joined) with Reset password · Ban / Lift
  ban · Delete; Account (username, e-mail, private team note → `saveMemberDetails`, same username rules as sign-up, unique,
  team names reserved), Role (with its rights spelled out), Posting (unmute / mute durations), counters (messages, reports,
  rooms made), groups & channels (owner / co-admin / member / asked / invited), private chats (with whom, status; messages stay
  private), last 30 public messages with Remove / Restore, house-rules acceptance, banner when a reset request is open.
- `src/backoffice/actions/members.ts`: `setTemporaryPassword` (12-character code shown once to copy; settles open reset
  requests), `deleteMemberAccount` (type the username to confirm; optionally deletes their messages, otherwise they stay as
  "Deleted account"; removes memberships, chat requests, reset requests; rooms they owned become team rooms; photo removed).
  Shared dialogs in `member-dialogs.tsx`. Moderation → Members tab now points to the new page.
- Verified: list + member page rendered on temporary unauthenticated copies (deleted), filters work; the password update logs
  in with the new password and rejects the old one; the delete steps leave nothing behind. Test accounts removed. Not verified
  signed in (no staff login for Claude): the buttons themselves.

### 2026-11-25 — delivered / read receipts
- Owner: messages didn't show whether they reached the other person or were read. One-to-one chats (member ↔ member private
  chats, member ↔ team direct chat) now show WhatsApp-style ticks on your own messages: clock = sending · ✓ = sent (saved) ·
  ✓✓ = delivered (reached the other side's device) · ✓✓ in the theme's tick colour = seen. Lounge / match rooms / groups keep
  the single ✓ (read receipts with many readers would be noise). Sent / delivered ticks use the muted time colour.
- New collection `chat-receipts` (one doc per stored room + reader: `delivered` / `read` message timestamps, only moving
  forward; reader = member id, or 'team' — any team member counts for the team side). Action `receipt` (batched items
  {room, kind delivered|read, ts}; private chats must be accepted); the other side gets a live `receipt` event; `hello`
  carries the receipts that matter to the viewer.
- Browser: the adapter reports delivered for everything loaded on connect, for live messages and for team threads when
  loaded; the engine reports read while a one-to-one conversation is actually on screen (tab visible, chat open, conversation
  showing on phones; also on tab focus). Deleting an account removes its receipts.
- Verified live with two accounts: A writes while B is away → "Sent" (✓); B opens the site → "Delivered" (✓✓); B opens the
  conversation → "Seen" (✓✓ coloured). Not verified: the team side of a direct chat (no staff login for Claude); same code path.
  Test accounts and their receipts removed.
- Follow-up (owner: "no real time; sometimes I can send, sometimes not; why the 5-second countdown?"):
  - The countdown was slow mode (Chat settings → Limits, 5 s). The browser applied it to everyone, the team included, and in
    one-to-one chats; the "same text again within 2 minutes" rule did too. Now: the team is never slowed or blocked by the
    browser's anti-spam rules (matches the server); slow mode and the repeat rule only apply to members in shared rooms
    (lounge, match rooms, groups), never in private chats or the chat with the team (server too). Owner finds slow mode
    unnecessary → set to 0 (off) in the database and 0 is now the default everywhere; it can be turned back on in Chat settings.
  - Other "can't send" cause seen: the lounge is in "team only" mode (set from the Community lounge page).
  - Real time measured with two members: message arrives in ~0.1 s; ✓✓ Delivered ~0.4 s (other side has the site open, chat
    closed); Seen ~0.2 s when both are in the conversation, ~1.4 s after the other opens it (page load included). Receipt
    bundling delay cut from 0.6 s to 0.12 s (read) / 0.35 s (delivered). Pages opened before an update keep the old code until
    reloaded. Team side of the direct chat still untested (no staff login). Test accounts removed.
- Follow-up (owner: "Delivered and Seen look the same in the first theme; we can't see the status of our own messages"):
  measured every theme — Seen vs Delivered differed only by a little opacity (OddsClub, iMessage, Messenger, Signal) or not at
  all (Telegram, Discord), so the status was effectively invisible. Now per theme `--c-tick-dim` (✓ sent, ✓✓ delivered) and
  `--c-tick-read` (✓✓ seen): mint #7CF5B0 on the coloured bubbles (OddsClub, iMessage, Messenger, Signal), blue for WhatsApp
  (unchanged), green for Telegram and Discord, with grey / dimmed-white for the other states. Verified with one conversation
  holding all three states, photographed in all 8 themes. Shared rooms (lounge, match rooms, groups) still show only ✓.
- Follow-up (owner: "in groups: delivered when any member received it, seen when all members saw it; same in channels"):
  groups & channels now have receipts too. Only the room's members leave them (not visitors of an open group, not the team);
  stored per member in `chat-receipts` (room 'g:<id>'), broadcast live to the room's members + the team; `hello` carries the
  current members' positions for the rooms the viewer is in (the team: all rooms). On our own messages: ✓ sent · ✓✓ delivered
  = at least one other member's device received it · ✓✓ coloured "Seen by everyone" = every other member saw it (member count
  from the room, minus ourselves when we are a member). Joined rooms report delivered on connect / when their messages load /
  live, and read while on screen. Lounge and match rooms keep ✓ (no member list).
  Verified live with a 3-member group: A posts → Sent; B opens the site → Delivered (0.2 s); B reads, C not → still Delivered;
  C opens the group → Seen by everyone. Test group and accounts removed.
- Follow-up (owner screenshot of the room list: "nothing tells you if the message you sent was sent, delivered or seen"):
  the room list now shows the status of OUR last message in front of "You: …" (clock sending · ✓ sent · ✓✓ delivered ·
  ✓✓ coloured seen), like WhatsApp; lounge / match rooms show ✓. One shared `tickState(room, message)` + `tickIcon()` feed both
  the conversation and the list, so they always agree; receipts re-render the list live. List "seen" colour per theme
  (`--c-list-read`: readable on each sidebar — blue for WhatsApp / iMessage / Messenger / Signal, green for Telegram / Discord,
  mint for OddsClub). Verified: list row went Sent → Delivered → Seen live; photographed in OddsClub and WhatsApp.
- Follow-up (owner: "the status only shows after I open the conversation"): reproduced as a member → list showed the status
  live, after reload and on a phone without opening anything. The owner is the team: a member's thread isn't loaded for the
  team until opened, so its list row is built from the thread summary — and those summaries were excluded from the status.
  Now the summary's last-message time is used, so team threads show ✓ / ✓✓ / ✓✓ seen in the list before opening (receipts
  for team threads already come with `hello` and live). Not verified signed in as the team (no staff login for Claude).

### 2026-11-25 — voice messages, pictures on demand, media clean-up
- **Pictures on demand** (owner: "don't load images directly, it takes resources: thumbnail first + download button, keep it
  in cache, let users save it"). At upload the server also makes a ~200-byte blurred preview (`chat-images.thumb`, 32 px
  WebP data URL) that travels inside the message with the file size. Others see the preview + "⬇ 30 KB"; a tap downloads
  the file once into Cache Storage ('oc-media-v1') and shows it from a blob URL — after a reload it appears from the cache
  with no request. Own pictures load automatically. Full-screen viewer: "Save" (share sheet on phones → Save image,
  download elsewhere). Old pictures without a preview show a neutral placeholder + the button.
- **Voice messages**: mic button while the box is empty → MediaRecorder (WebM/Opus, MP4/AAC on Safari, 32 kbps) with a
  recording bar (delete · red dot + timer · live waveform · send), auto-send at the maximum length, stops if the tab is
  hidden. Upload `/chat-api/voice` (multipart: file, duration, peaks) → new `chat-voice` collection (R2) → message
  `voice`. Allowed: the team; members in their chat with the team and in private chats; in shared rooms with the role right
  (renamed "Send pictures & voice messages"). Bubble: play / pause, 40-bar waveform (fills while playing, tap to jump),
  time; the file loads on first play and is cached. Previews / replies / team thread summaries say "Voice message".
  Audio-only WebM/MP4 are often detected as video/* → allowed too.
- **Media clean-up** (owner: "configured in the admin"): Chat settings → "Voice messages & media storage": longest voice
  message (default 120 s), delete pictures and voice messages after N days (default 0 = keep forever), what is stored now
  (count, size, oldest), "Run clean-up now". `src/chat/cleanup.ts`: runs a minute after the server starts and every 6 h
  (started with the chat stream), deletes files older than N days from R2 (via Payload) and marks their messages
  `mediaExpired` → "Photo expired" / "Voice message expired" in the chat. Profile photos, logos, partner pictures untouched.
  Private-chat pictures / voice: file access for members now includes private chats they belong to.
- Verified: lounge photo for a member → preview + "⬇ 30 KB", 0 downloads until tapped, 1 after, 0 after reload (cache),
  Save button; new upload carries a 200-byte preview; voice recorded in the browser (generated tone instead of a mic),
  received live by the other member with waveform 0:03, played to the end, sender saw "Seen"; clean-up limited to the test
  rooms deleted 1 picture + 1 voice (14 KB) and marked both messages expired; settings card rendered on a temporary copy
  (deleted). The owner's own voice message (11 s, WebM) was left untouched. Test accounts and their media removed.
  Not verified: playback of WebM voice notes on older iPhones (Safari 17.4+ plays WebM/Opus; older iOS may not).
- Follow-up (owner screenshots: voice bubble not centred; reactions bar + "⋯" menu behave inconsistently):
  - Voice bubble: grid — play button centred on the left (spanning both lines), waveform on top, length · time + ticks
    underneath (the time no longer sits on its own line below the player).
  - Message menu, one list of actions everywhere (`ctxItems`): Reply · Copy (only when there is text) · Save (pictures and
    voice messages) · Report · Mute (team) · Delete. Computer ("⋯", right-click, Enter): a small menu next to the button /
    pointer (`.ctx.lite`: no blur, no lifted copy, no second set of reactions — the hover bar has them). Phone (press and
    hold): the lifted message over the blurred background with reactions above and actions below. Closes on outside
    click/tap, Escape, scrolling the conversation, resize, changing room or any action. The hover bar hides while a menu is
    open and highlights our reaction.
  - Fixed: on phones the overlay closed again the moment the finger was lifted (the release counted as a tap on the
    background), and a long press could open it twice (our timer + the phone's own long-press event).
  - Verified: computer "⋯" → Reply/Copy/Report small menu, Escape closes; right-click on a voice note → Reply/Save/Delete,
    flips above near the bottom, outside click closes; phone long-press stays open after release, tap outside closes,
    voice note → Reply/Save/Delete. Test accounts removed.
- Correction (owner: "why did you remove the blur when we choose the menu; keep the emoji bar longer"): the small no-blur
  computer menu is gone — "⋯", right-click and Enter open the blurred overlay again (lifted message, reactions above, actions
  below), keeping the fixes (Copy only with text, Save for media, no double open / close-on-release on phones). The hover
  reactions bar now lingers ~0.6 s after the mouse leaves (visibility delayed, then fades) and the 6 px gap between message
  and bar counts as the bar, so moving to it never loses it. Verified: visible at +0.3 s, hidden by +1 s, stays when moving
  onto it; "⋯" → blurred overlay with 5 reactions, Escape closes.
- Follow-up (owner: "it eases in, but closing just disappears and the message pops back bluntly"): the lifted message lived
  inside the overlay, which was hidden in one frame on close, so its spring back was never seen; the real message then faded
  in from 0 (its own transition) → blink. Now closing plays the opening backwards: the overlay stays visible ('closing',
  no clicks) while the blur fades, reactions / actions shrink away and the lifted copy glides home (shadow fading); the
  real message takes over in the same frame without its fade as soon as the glide is visually home (|lift| < 0.006; safety
  net 0.7 s). Instant closes (room change) swap without the fade too; a new menu finishes a closing one at once.
  Measured per frame: glide −106 px → 0 in ~0.3 s, swap at 298 ms, 0 frames where the message is missing or faded.

### 2026-11-25 — who can see pictures & voice messages, per room
- Owner: rules for who sees media in the lounge (and can they save it). `src/chat/media-policy.ts`: per room `view`
  everyone · members (lounge: signed-in accounts; group: people who joined) · team · none (text only) + `save` (allowed or
  not). Lounge + match rooms: Chat settings → lounge.mediaView / mediaSave (Groups & channels → Community lounge → "Pictures &
  voice messages"); groups & channels: chat-rooms.mediaView / mediaSave (room page, shared `MediaFields`). Private chats and
  chats with the team: unchanged. The team always sees everything.
- Server-enforced: `lockWire` replaces media with `locked {kind, why: signin|group|team|none}` for viewers who may not see
  it (hello, group loads, live — the hook now sends each client its own variant), and `chat-images` / `chat-voice` file
  access uses `mediaReadWhere` (403 for others). Text-only rooms refuse picture / voice uploads (`chat.err.mediaOff`) and
  hide the picture / mic buttons. Saving off → `nosave`: no Save in the viewer or the menu, no right-click / long-press
  saving, no dragging (screenshots can't be blocked — said in the back office). Rule changes apply at once (lounge: open
  chats reconnect; group: its messages reload).
- Verified (lounge set to members-only, then also no saving; restored to everyone + saving after): visitor got locked
  photo + voice ("Sign in to see this photo" + Sign in button), the file URL answered 403 for the visitor and 200 for a
  member; member with saving off: picture shown, viewer without Save, menu Reply / Report only. Not verified signed in:
  the back-office controls (no staff login for Claude). Test account removed.

### 2026-11-25 — picture editor before sending + swipe to reply with a mouse
- Owner: "no way to preview / edit / crop a picture before sending like WhatsApp or Telegram; and swipe to reply".
- Picture editor (engine, `pe*`): picking a picture opens a full-screen editor — preview, Crop (free / square / 4:3 / 16:9,
  8 drag handles, move the frame, rule-of-thirds grid, dimmed outside), Rotate 90°, Flip, Draw (6 colours, thin / thick,
  smooth strokes), Undo (60 steps), Reset, caption field (pre-filled with the message box) and Send. All on a canvas in the
  browser: crop and strokes are kept in 0–1 coordinates of the rotated picture so rotating / flipping carries them along;
  the result is a JPEG (≤ 2560 px) that goes through the normal send (rules, upload, preview generation). Escape leaves a
  tool, then closes. Pictures the browser can't decode (e.g. HEIC outside Safari) fall back to the old direct attach.
  If sending fails, the edited picture and caption stay in the box for another try.
- Swipe to reply already worked with touch (verified: bubble follows the finger, reply starts). Now also with a mouse /
  trackpad: drag a message to the right (not from buttons, the picture or the voice player), no text selected while
  dragging; a plain click does nothing.
- Verified in the browser: crop square (481×481 frame) → rotate → red stroke → caption → arrived as a 695×695 picture with
  "Cropped, rotated, drawn"; mouse drag → reply bar, plain click → none. Test accounts and their messages removed.

### 2026-11-25 — stickers in the photo editor (team stickers + personal stickers)
- Owner: "add stickers and resize them; import our own stickers — personal ones only for their owner, and stickers managed
  in the admin for everyone".
- Editor (engine `pe*`): Stickers tool → tray in three sections: **My stickers** ("+" turns a picture into a personal sticker,
  saved on the account; ✕ deletes it), **Team stickers** (back office), **Emoji** (30). A sticker lands in the middle,
  selected: drag to move, round handle = resize + rotate (snaps to straight angles), mouse wheel resizes, ✕ / Delete removes,
  tap another to select it, tap the photo to deselect; touched sticker comes to the front. Stickers are kept like the
  drawing (0–1 of the rotated picture) so rotate / flip / undo / reset carry them; they are drawn into the exported JPEG.
- Team stickers: collection `stickers` (name, image → media, active, order); back office **Stickers** (Community): upload
  several (or drop), rename, show / hide, reorder, delete; processing `prepareSticker` (trims transparent margins, ≤ 512 px
  WebP with alpha). Sent to the site in `cfg.stickers`.
- Personal stickers: collection `member-stickers` (upload, R2) with read access = owner (+ team); chat-api `stickers` (list),
  multipart `sticker` (add, max 60 per account), `sticker-remove` (own only).
- Verified: team sticker trimmed 600×600 → 300×200; emoji moved / resized (361 px) / rotated, team + device stickers drawn into
  the exported picture (upload intercepted, nothing sent); member A: "+" saved and placed, still there after reload, ✕
  deletes; member B never sees A's sticker and gets 403 on its file (A: 200). Test sticker, accounts and files removed.

### 2026-11-25 — one reaction per person; swipe to reply both ways + trackpad
- Owner: "you can't react twice with different emojis — the new one must replace the current one; and swipe to reply".
- Reactions: the server keeps one reaction per person per message — choosing another emoji removes the previous one; tapping
  the current one removes it. (Already-stored double reactions stay until that person reacts again.)
- Swipe to reply now works either way (right like WhatsApp, left like Telegram) with a finger and a mouse drag, and with a
  two-finger trackpad swipe (horizontal wheel events; also blocks the browser's swipe-back navigation over a message). The
  reply icon appears on the side the message moves away from. Vertical scrolling over messages is unaffected.
- Verified: ⚽ then 🔥 on one message → only 🔥 stored and highlighted; trackpad right / left, mouse drag left, finger swipe
  left all opened the reply; vertical wheel did not. Test accounts removed.

### 2026-11-25 — replies: quotes were never saved; picture / voice quotes
- Owner: "a sent reply shows no preview, as if not attached; replying to a picture shows only text, no thumbnail".
- Root cause: the quoted message's id was stored as `reply.id`; Payload treats `id` inside a group as reserved and silently
  dropped it, so every stored reply lost its link and the chat hid the quote (since the beginning). Now `reply.msgId`
  (old `reply.id` still read if present). Replies sent before this fix have no link and stay without a quote.
- Quotes also remember what was quoted: `reply.kind` (photo | voice), `reply.thumb` (the picture's ~200-byte preview), `reply.dur`
  (voice length) — read by the server from the quoted message. The reply bar above the box and the quote in the bubble show
  📷 + caption (or "Photo") with the picture's thumbnail on the right (sharp when the original is already on the device), or
  🎤 "Voice message · 0:12". Viewers who may not see the room's media (room rule) don't get the quoted thumbnail.
- Verified: text reply in a private chat shows its quote (also after reload); reply to a voice note → 🎤 "Voice message · 0:02"
  in the bar and the quote; reply to a captioned picture (menu → Reply) → thumbnail + 📷 caption in the bar and the quote.
  Test accounts and their messages removed.
- Follow-up (owner: "closing the reply with ✕ dismisses the keyboard and the reply stays — a second tap is needed"): on
  phones the tap first blurred the text box, the keyboard closed, the layout jumped and the tap missed. ✕ on the reply bar
  and on the picture bar now act on the first touch (`tapKeepFocus`: pointerdown with preventDefault, so the box keeps
  focus and the keyboard stays open; click still works for keyboards). Verified with touch at 390 px: one tap → reply gone,
  text box still focused.

### 2026-11-25 — invite links, voice-record feedback, room sheet tab motion
- Owner: "animate the mic like stretching when recording starts, add start / stop sounds like WhatsApp, the room sheet has no
  motion between tabs, and where is the invite link — there are many ways to add members, you added only one".
- Invite links for groups and channels: `chat-rooms.inviteToken`. Chat room sheet → Members tab → "Invite link": create,
  Copy, Share (phone share sheet), New link (the old one stops working), Turn off. Back office: group editor → Invite link box
  (Copy / New link / Turn off). Opening `/<lang>/chat/join-<token>`: a signed-in member joins and lands in the room; a visitor
  is asked to sign in first and joins right after. Works even for invite-only rooms. Only the room's admins (and the team)
  see or change the link. Server: `roomInvite` / `roomJoinLink` (`/chat-api/room-invite`, `/chat-api/join-link`).
  The other ways stay: invite by username, join requests, open rooms, auto-add.
- Mic: the button squeezes and pops when tapped, the recording bar stretches open, the red dot pulses; short start / stop /
  cancel blips made with WebAudio (no sound files). Recording starts ~170 ms after the start sound so the sound isn't recorded.
- Room sheet tabs: the green pill slides between tabs and the content slides in from that side. It keeps going smoothly when
  the tab redraws on data arriving (members, invite link). Respects reduced motion.
- Verified: pill and pane slide both ways; A created a link, B opened it and landed in the room ("You joined …"); a visitor got
  the sign-in prompt; after "New link" the old link answers "This invite link doesn't work any more"; Turn off / create;
  mic press + bar animation, start sound, timer + waveform running, cancel sound. Test accounts and room removed.
- Follow-up (owner: "creating a new invite link opens a prompt instead of a dialog"): every "are you sure?" in the site chat
  used the browser's `window.confirm`. Now one themed dialog (`#confirmSheet`, engine `askConfirm(message, okLabel, danger)`,
  passed to the adapter as `h.confirm`): the question as the title, the rest as the explanation, the action's own word on the
  button (red for destructive ones, which also get focus on Cancel). Escape, the backdrop and Cancel say no; the room sheet
  underneath stays open. Used for: new link / turn off link, block, leave room, archive / delete room, remove member, delete
  a personal sticker. Verified at 1100 and 390 px (no browser dialogs left). Test account and room removed.
- Follow-up (owner: "the tab switcher is inconsistent when tapped, and after creating a new link it goes to the last tab
  twice"): the room sheet redraws on every data change (members loaded, link created / renewed…) and each redraw rebuilt
  the tab pill at zero width on the left, so it slid back to the tab again; a redraw during a tab switch restarted the slide.
  Now a redraw starts the pill exactly where it is (even mid-slide) and only glides if the tab changed; the scroll position
  is kept; opening the sheet starts clean. Verified by sampling the pill every 30 ms: open = still, tab switch = one glide,
  create / new link = no movement, rapid back-and-forth taps = smooth reversals, no jump. Test account and room removed.

### 2026-11-25 — groups made by the team: owner and member count
- Owner: "I don't see the owner of the group; I invited someone and it shows the invite; he sees one member when he should
  see two". "Les Agents" was made from the back office: such rooms have `createdBy` (a team account) and no member owner,
  and the team account is not stored as a membership, so the creator appeared nowhere and every count missed them.
- Now the creator of a team-made room is listed first in the room sheet's members, tagged Owner (no remove / admin buttons),
  and counts as a member everywhere: room list and header ("2 members"), back-office groups list. The group editor shows
  "Made by <name> (team)" instead of "Team room".
- An invited person stays under "Invited · waiting for their answer" (was just "Invited") until they accept the invite in
  their chat ("You're invited — tap to answer"); then they move to Members for everyone, live.
- Verified on the real room (read-only): Brillant now sees 2 members; the members list is divin don (owner, team) + Brillant.

### 2026-11-25 — group info for everyone; ticks in team-made groups
- Owner: "the one invited can see the group info, bio / description and members with their role, right? And make sure
  sent / delivered / seen are well implemented in groups".
- Group info sheet (`#groupSheet`): tap a group's name or picture in the chat header (a private chat's name opens the
  person's card). Anyone who can see the group — members, people invited, and anyone for open / ask-to-join rooms — sees the
  picture, name, "Group · N members", how people join (Anyone can join / Ask to join / Invite only), About (description),
  Room rules, and the members with their role (Owner, Admin, Team; "· You" on oneself; tap someone → their card).
  Actions: invited → Join / Decline; not a member → Join / Request to join / Cancel request; admins → Manage (opens the room
  settings); members → Leave (themed confirm). Pending requests and invites stay visible to admins only. Updates live.
  Server: `roomInfo` (`/chat-api/room-info`), allowed for whoever `roomAccess` lets see the room.
- Ticks in groups: Sent → Delivered (any other participant's device got it) → Seen by everyone (all have read it). Fixed for
  rooms made from the back office: the team account that made it is a participant (`teamCreatorOf`, `participantUids`):
  it counts in "everyone", leaves its own delivered / read receipts and gets the others' live; `isOwner` is true for it.
  (Before, counting it as a member would have made "Seen by everyone" impossible; other team accounts don't count.)
- Verified: invitee at 390 px saw bio, rules, members + Join / Decline; joined → 3 members live; owner saw Manage;
  co-admin tag shown. Ticks with 3 members: Sent (nobody online) → Delivered (B online elsewhere) → still Delivered after B
  read → Seen by everyone after C read, same in the room list and after reload. Team-made room (server script): 2 members,
  team creator = owner, its read receipt stored. Test accounts, room and messages removed.

### 2026-11-25 — sticker upload "Body exceeded 6mb limit"; one fixed sticker size
- Owner: error on Back office → Stickers upload (`Body exceeded 6mb limit`, 413) + "make them have a fixed size".
- Cause: the page sent the original pictures, all in one server-action request (limit 6 MB, next.config).
- Now the back office shrinks each picture in the browser (≤ 1024 px, WebP, transparency kept) and uploads them one per
  request with an "Uploading 3 / 8…" toast; failures are listed by file name. The chat does the same for personal stickers.
- Fixed size: every sticker (team and personal) is stored as a 512 × 512 transparent WebP — empty margins trimmed, the
  picture centred (`STICKER_PX`, `prepareSticker` fit contain). So all stickers have the same size in the tray and when
  placed in the photo editor. There were no stickers yet, so nothing to convert.
- Verified: server — 1600×400, 300×900, 64×64 and a 1800×1200 photo all → 512×512 WebP; browser — a 39.4 MB 4000×3000
  PNG went up as 448 KB and was stored as 512×512 through the real member sticker upload. Test account removed.
  (The back-office page itself was not clicked through: no team sign-in available to me; it type-checks.)
- Follow-up (owner: "is compressing right? a sticker can't exceed 500 KB, right?"): stored stickers are now capped at
  100 KB (`STICKER_MAX_BYTES`, like WhatsApp's static sticker limit): WebP quality steps down 90 → 20 until it fits, then
  a slight smoothing as a last resort; always 512 × 512. (The ≤ 1024 px file the browser sends is only for the upload.)
  Measured: transparent logo 17 KB, photo 84 KB, worst case (random noise with random transparency) 79 KB.

### 2026-11-25 — downloads show real progress (no spinner)
- Owner: "the download button spins instead of a progress circle".
- `mediaFetch(url, onProg, sizeHint)` now reads the response as a stream and reports the bytes received (total from
  Content-Length, else the size we know); several views of the same file share one download. `mediaAbort(url)` cancels.
- Picture: the "⬇ 30 KB" button turns into a ring that fills with the real progress, ✕ inside, and "4 KB / 30 KB";
  tap again cancels (back to "⬇ 30 KB", no error). A redraw mid-download keeps showing the progress. Screen readers hear
  "Downloading… 40%. Tap to cancel." (every 10 %). Voice notes: the same ring around the play button while it loads.
  The spinning / pulsing animations are gone.
- Verified with the connection slowed to 6 KB/s: ring and text rose steadily 0 → 5 → 10 … %, cancel half-way restored
  the button without an error, a full download showed the picture; voice ring 0 → 12 → 24 %. Test account removed.
- Follow-up (owner: "the same with voice messages"): a voice note not on this device shows a download arrow and
  "0:03 · 12 KB"; tapping it fills the ring around the button (✕ inside, "1 KB / 12 KB"), tap again cancels, then it plays.
  Our own voice notes and ones already cached show ▶ directly. Screen-reader label follows the progress.

### 2026-11-25 — sending pictures / voice: upload progress, no flicker; recording bar on phones
- Owner: "I don't see it uploading, it just disappears and appears with status Sent; and recording overflows on mobile".
- Flicker cause: the pending bubble (temporary id) was removed and a new bubble built when the server's copy (real id)
  arrived. Now the same bubble is kept and re-keyed (clientId → id). The local file is handed to the server's copy
  (`mediaAdopt`: no re-download of our own picture / voice, and it goes into the device cache).
- Upload progress: pictures and voice notes are sent with XHR upload progress (`upload()` in chatBackend). While sending:
  picture → the ring with ✕ and "45%" over it; voice → the ring around the play button with ✕. Tap ✕ to cancel (until
  100 %: once fully sent only the server's answer is left, so it can't come back as a ghost). A cancelled picture returns
  to the box with its caption; no error message on cancel.
- Recording bar: can't grow past the message box any more (min-width 0); the waveform scrolls inside.
- Rings drew as a small filled circle on the voice button (an older `.v-play .icon` rule won) — fixed with a more specific
  selector; also affected the voice download ring.
- Verified at 360 px with a fake microphone: after 12 s of recording the send button stays inside (301–343 of 360);
  slow upload (6 KB/s) → same bubble, ring 32 → 65 → 97 → 100 %, then "Sent" with the real id; cancel → bubble gone,
  no toast. Picture upload uses the same code but was not clicked through. Test accounts and messages removed.
- Follow-up (owner screenshot, wide screen: "why is it cut in half"): the recording waveform kept at most 48 bars (~240 px),
  so on a wide screen it covered only the right part of the bar. Now it holds as many bars as fit the bar's width (3 px +
  2 px gap, recomputed every tick, so resizing works): it starts as a full row of flat dots and the live level comes in
  from the right. Verified in the dark WhatsApp theme: 1610 px → 207 bars spanning the whole bar, 360 px → 29 bars,
  send button inside both times. Test account removed.

### 2026-11-25 — bubble style, chosen after the chat theme
- Owner: "let people also choose a preferred bubble; when we choose the theme it opens the bubble preference", then
  "these bubbles look almost identical".
- The theme sheet has two steps: picking a theme slides on to "Bubble style" (Back returns; a "Bubble style" button on
  step 1 opens it directly). Not offered for the Discord theme (no bubbles). Kept per device (`ps_bubble`).
- 8 styles, each clearly different, always in the theme's colours: Theme default · Classic (pointed tail at the top) ·
  Curl (curved tail at the bottom) · Pill (capsule) · Card (square + stripe on the speaker's side) · Outline (see-through
  with a border) · Comic (bold border + solid offset shadow) · Leaf (two sharp opposite corners). Each card is a mini chat
  in the chosen theme with a one-line description. First version had only radius variations (round / soft / square…),
  which looked the same — replaced.
- CSS: `.bs-scope[data-bs]` on #messenger, #ctx and the previews, written to beat the themes' own tails (theme tails are
  switched off unless the style draws one; top / bottom reset so a theme's top tail can't leak into a bottom tail).
- Verified: step 2 opens after picking WhatsApp; previews use the picked theme; choice applied to the chat and kept after
  reload; screenshots of all 8 in the WhatsApp and OddsClub themes.

### 2026-11-25 — loading a room: skeleton bubbles, then a soft fade-in
- Owner: "messages appear out of nowhere, no loading state like a skeleton".
- Before: placeholders only for the very first lounge load, and only once the live connection was up — so the room said
  "Start the conversation" (empty) while loading; groups / private chats / help threads had nothing at all.
- `roomReady(id)` knows when each kind of room has its messages (lounge & match rooms & help chat: first load; a group:
  its list; a private chat: once accepted; a member's help thread for the team: when opened). Until then: 7 placeholder
  bubbles (incoming with avatar, outgoing on the right, one or two lines), built as real rows so they take the theme's
  colours and the chosen bubble style, with a soft shimmer. Then the newest 14 messages fade up one after another
  (`soft-in`) instead of popping in; placeholders no longer count as messages (no "new message" bounce).
- Verified with the live stream held back 3 s: 7 placeholders shown (OddsClub theme; WhatsApp + Comic bubbles), then the
  messages arrived with the fade, no empty-room card in between. Group / private-chat loading uses the same path but
  wasn't slowed down separately.

### 2026-11-25 — group info polish: no link underline, tags on one line, long member lists
- Owner screenshots: the room name in the chat header was underlined on hover (looked like a link); the "Team" tag
  wrapped onto its own line and stretched across the row; "what if there are many members?".
- Header: no underline; a light fade on hover only (still tappable / keyboard-reachable).
- Tags: the "Team" tag used the class `team`, which the match cards style as a full-width flex row → renamed
  `rs-tag-team`. Member rows (`nameLine`) keep the name and its tags on one line: the name shortens with "…", the tags
  never wrap. Same in the admins' room sheet (it also shows "· You" and the Team tag now).
- Many members: group info shows the first 8, a search box ("Search members", filters as you type without losing focus)
  and "Show all N members". The admins' room sheet shows 10 per section, then "Show N more".
- Verified (French, dark WhatsApp theme, team-made group with 15 members): no underline on hover; "Propriétaire" +
  "Équipe" on the name's line; 8 shown + search + "Voir les 15 membres"; "mo" → Jules Moreau, Moussa Traoré; show all → 15.
  Test accounts and room removed.

### 2026-11-25 — chat wallpapers (managed in the back office); welcome page when no conversation is chosen
- Owner: "add wallpapers in conversations — they will be managed in admin, we add them manually"; and "opening the chat
  opens the first conversation directly; there must be a blank page with a description and logo like WhatsApp".
- Wallpapers: new collection `wallpapers` + back office → Wallpapers (`/admin/wallpapers`, nav under Stickers): upload
  photos or patterns (shrunk in the browser first, one per request; server: WebP, photo ≤ 2000 px and ≤ 450 KB, pattern
  ≤ 600 px), live preview behind two sample bubbles, rename, Photo / Pattern switch, Darken slider (mixes in the chat
  theme's background colour so messages stay readable), shown / hidden, order, delete. Sent to the site as
  `cfg.wallpapers`.
- Chat: the theme sheet now has 3 steps — Theme → Bubble style → Wallpaper ("Wallpaper →" from step 2; a "Wallpaper"
  button on step 1; Discord goes straight from the theme to the wallpaper). Choices: Theme default, Plain, then ours,
  each a mini chat preview in the chosen theme and bubble style. Kept per device (`ps_wall`); a deleted wallpaper falls back
  to the theme's. Pictures start loading when the sheet opens.
- Welcome page: opening the chat with no room chosen (wide screens) now shows a welcome page — logo, the chat's title,
  "Pick a room or a conversation on the left…", three highlights, "House rules apply · 18+" — instead of the lounge. Nothing
  counts as viewing the lounge behind it (`viewing()`): no presence in it, no read marking, no unread reset, no highlight
  in the room list. Phones keep showing the room list first.
- Verified (visitor, 1280 px): /chat → welcome page, no room highlighted; sheet → 4 wallpaper cards (Theme default, Plain,
  a test photo, a test pattern) with previews; picking the photo → the conversation shows it (darkened 20 %); opening a room
  hides the welcome page. Test wallpapers removed. The back-office page type-checks but wasn't clicked through (no team
  sign-in available to me).

### 2026-11-25 — messages page by page per conversation; voice messages play one after another
- Owner: "it doesn't fetch all messages at the same time, right? there is pagination and per conversation?" and "no auto
  play for voice messages like WhatsApp".
- Before: on connect the server sent the latest 400 messages of the lounge + all match rooms together (a busy lounge could
  push a match room's history out), 300 of the help chat, 60 per private chat (≤ 40), 80 per group (≤ 30); nothing older
  could ever be reached.
- Now: `PAGE = 40` per conversation — the lounge and each match room get their own latest 40, as do the help chat, every
  private chat, every group, and a member's thread for the team. New `history` action (`/chat-api/history`
  {room, before}) returns the 40 before a time + `more`, with the same rights as live reading (group: canRead; private
  chat: its two members, accepted; help chat: its member / the team) and the same media locks.
- Chat: scrolling near the top of a conversation loads the previous page (dots at the top while loading); what is on
  screen stays put (scroll anchored from the bottom; older rows don't count as "new" and don't animate in); if a page
  doesn't fill the screen the next one loads by itself; at the beginning "This is the start of the conversation". The
  browser keeps up to 3000 messages per list.
- Voice: when a voice message ends and the very next message is a voice message too, it plays next after a short pause
  (scrolled into view; downloads first if needed). Tapping another voice message or stopping cancels the chain.
- Verified (help chat with 90 older texts + 2 voice notes): opened with 40; top → 80, view kept in place; top again → all
  92 and "This is the start of the conversation"; voice 1 played, then voice 2 by itself. Test account and data removed.

### 2026-11-25 — load-test data: thousands of messages in the lounge and the group
- Owner: "insert as many messages as possible in the lounge and in any existing group".
- New script `src/scripts/seed-chat-load.ts` (`pnpm seed:chat-load`, options `--lounge N --group N`, `--remove`):
  creates 24 "seed fan" accounts (seed-fan-NN@oddsclub.test), then writes straight to the database (no live broadcast):
  lounge ≈ 3000 messages over the last 30 days (¼ from the team account, the rest from the seed fans), every active group
  ≈ 1500 written by its own members + its team creator (memberships unchanged; channels: only admins / the team). Bursts
  of back-and-forth and ~12 % replies quoting an earlier message. All tagged (clientId "seed-load-…");
  `pnpm seed:chat-load --remove` deletes the messages and the seed fan accounts.
- Ran it: lounge 3002 messages (3000 + the 2 real ones), "Les Agents" 1504; 548 replies. Stored like real messages
  (ObjectIds, dates; Payload reads authors). Browser: the lounge opens with 40 and each scroll to the top adds 40
  (checked up to 280), replies and names show.

### 2026-11-25 — the member's help chat has an id in its address; refresh stays in it
- Owner: "why doesn't the partner conversation have an id instead of 'support'? and refreshing in it goes to the blank
  page".
- Address: the member's help chat is now /chat/team-<member id> — the conversation's own id (the team opens the same
  conversation as /chat/sup-<member id>). Old /chat/support links still open it and switch to the new address.
  (Internally the room stays 'support'.)
- Refresh: after a refresh the account arrives a moment after the page, so 'support' wasn't a known room yet and the chat
  fell back to the welcome page (private chats and groups already waited; the help chat didn't). Now it waits for it too,
  showing placeholders with the header / box hidden (`want-room`) instead of another room or the welcome page; a visitor
  (no account) gets the welcome page.
- Verified: open → /en/chat/team-<id>; reload → straight back in the help chat with its messages; /en/chat/support → same
  conversation, address switched. Test account removed.

### 2026-11-25 — darken the wallpaper yourself; palette button menu (Theme / Wallpaper)
- Owner: "let them darken the wallpaper they choose, and a quick way to the wallpaper (not through theme etc.), without
  touching the current flow" → then "the same button, with a popover: Wallpaper or Theme".
- Darken: picking one of our wallpapers shows a "Darken" slider (0–80 %) under the list; it starts at the back office's
  value, changes the chat behind the sheet and the chosen card live, and is kept per wallpaper on the device
  (`ps_wall_dim`). Hidden for "Theme default" / "Plain".
- The palette buttons (chat header and room list) open a small menu: "Chat theme" (the usual theme → bubbles → wallpaper
  steps, unchanged) or "Wallpaper" (straight to the wallpaper step). Closes on outside tap, Escape (focus back to the
  button), Tab, resize; ↑ / ↓ move between the two. No extra button in the header.
- Verified: menu items, Wallpaper → step 3, Chat theme → step 1, outside / Escape close, arrows, room-list button menu
  on screen; slider 20 → 60 % applied live and kept after reload. Test wallpaper removed (the team's own uploads kept).

### 2026-11-25 — groups & channels: who sees it, reading before joining, how people join (separate settings)
- Owner: "no setting for whether people who aren't signed in can see a group / channel, or non-members, and whether they
  request to join or join directly".
- Before, one "join" setting decided everything (open = everyone sees & reads; request = everyone sees, nobody reads;
  invite = hidden). Now three separate settings on `chat-rooms`:
  · visibility: Everyone (also visitors) · Signed-in members · Only its members (hidden; invited / requesting people see it)
  · preview: "Can read before joining" (people who see it read it without joining; off → locked card + join / request)
  · join: Join directly · Ask to join (admins accept) · Invite only (by name or the invite link; a visible invite-only
    room now says "…is invite only. Ask one of its admins…" instead of a request button that can't work).
  Older rooms keep their behaviour (empty fields derived from join: `roomVisibility()`).
- Enforced on the server (`rules()` in chat/groups.ts: visible / canRead), in live delivery (hooks: non-members get new
  messages only where they may read), history, receipts. Editable in the back office (room page + new room; list shows
  "Who can see it" and "How people join") and in the chat's room settings (owners / admins). Join wording updated in
  the database where it hadn't been edited.
- Verified with 4 test rooms: visitor sees A (locked) + D (reads), not B (signed-in only) or C (hidden); a signed-in
  non-member also reads B; the owner sees all; "Les Agents" unchanged. Browser: owner's settings show the 3 choices;
  turning on "read before joining" lets a visitor read A at once; D shows the invite-only message; a non-member gets a
  new message in B live. Test rooms and accounts removed.

### 2026-11-25 — sign-in offered when opening the chat signed out (continue as guest)
- Owner: "when the chat opens, the sign-in dialog must show if he isn't signed in, but he can dismiss it and continue as
  a guest".
- Opening the chat (a chat address, or from the site) while not signed in: once the chat knows nobody is signed in, the
  sign-in sheet opens by itself (~0.7 s), with "Sign in to write, react and chat privately. You can also look around as a
  guest." and the way out labelled "Continue as guest" (Escape / backdrop also close it). Shown once per browser session
  (sessionStorage `oc_auth_prompted`), never when signed in, not over another open sheet, not when an invite link is being
  handled (that opens sign-in itself). The usual "Sign in" buttons keep "Not now" and the normal intro.
- Verified: visitor on /en/chat → sheet with "Continue as guest" → closed → reload: not shown again; gate "Sign in"
  button → normal sheet; new visitor via the home page's "Open chat" → shown; signed-in member → never. Test account removed.

### 2026-11-25 — switching conversations animates
- Owner: "messages show up instantly, without motion, when going from one conversation to another".
- On a room change: the message area fades in (`#wallIn.room-in`, .28 s), the newest 14 messages rise in one after
  another (the `soft-in` used after the loading placeholders, 12 ms apart), and the header's picture (scale) and name
  (slide from the right) come in (`hdr-in`). Not on redraws inside the same room; nothing moves with reduced motion.
- Verified (lounge ↔ Les Agents, sampled every 60 ms): area 0 → 1, older rows before the newest, title 8 px → 0, all
  done in ≈ 350 ms.
- Follow-up (owner: "when I go back to the site and open the chat again the dialog doesn't show, as if it persists"):
  it was once per browser session. Now it is offered every time the chat is opened signed out (from the site, a link, a
  reload) — but only once per opening, not on every room change (`UI.prompted`, reset when the chat closes). Verified:
  open → shown; guest + room switch → not shown; close to the site and open again → shown; reload → shown.

### 2026-11-25 — group / channel picture (photo or colours), confirm before upload, tap to see full size
- Owner: "we can't edit or change the profile of a group or channel, even in admin" → "choosing an image must not upload
  right away (a wrong pick wastes space): preview it and confirm" → "tapping a profile should preview it" → "also in the
  admin portal".
- Rooms now have a picture: `chat-rooms.photo` (media, cropped square 512 px) or one of 10 colours (`ROOM_COLORS`,
  `gradient`). Shown in the room list, header, group info, room settings, back-office list and room page; changes reach open
  chats live.
- Chat (owner / admins / the team → room settings): picking a photo shows it as a preview ("Preview — not saved yet",
  dashed frame) with Save photo / Choose another / Cancel — nothing is uploaded until Save (closing the sheet drops it);
  Remove photo; colour swatches (saved at once). Server: `room-photo` (multipart; adminOf) and `room-color`.
- Back office → Groups → a room: "Picture" card with the same preview → Save photo / Choose another / Cancel, Remove photo
  and the colours (`groupPhoto`, `groupColor`).
- Tap / click to see full size: the room's picture in group info and room settings (also an unsaved preview), a person's
  picture on their card (chat); in the back office (`PhotoZoom`): the room page picture, a member's photo on their page,
  the team chat profile photo. Profile pictures are now stored at 512 px (was 256) so they're sharp full size.
- Fixes found while testing: the room photo url needs `filename` in the media `select` (else url is null); Escape now
  closes the full-size viewer before the sheet under it.
- Already fine (checked): a member's own profile photo and the team chat profile photo only upload on Save.
- Verified in the chat: pick → local preview, no upload; Cancel → old picture; Save → exactly 1 upload, the photo (512×512)
  in list + header for the owner and live for a member, group info shows it; tap → full size; Escape closes only the
  viewer; Remove → colours back; a swatch → new colours live for the member. Back office type-checks (no team sign-in
  available to me to click through). Test room and accounts removed.

### 2026-11-25 — message texts encrypted at rest (master key + one key per conversation)
- Owner: "are text messages encrypted?" (no — readable in the database) → "yes do it, explain first" → "with the strong
  key from .env plus a key per conversation" → "go ahead".
- `src/chat/crypto.ts` + `chat-keys` collection (details in ARCHITECTURE "Message encryption"): CHAT_MASTER_KEY locks a
  random key per conversation; texts (messages, reply quotes, report snapshots, request notes) encrypted with AES-256-GCM
  bound to their conversation; Payload field hooks encrypt on save / decrypt on read, so the chat, live delivery, history,
  moderation and back office are unchanged. Room / account deletion erases the conversation key.
- `pnpm chat:crypto` (status, `--encrypt [--dry-run]`, `--decrypt`, `--rotate`); the load-test seed encrypts too.
  A strong key was generated into the local `.env` (git-ignored); `.env.example` documents it.
- Migrated: 5065 existing texts encrypted in ≈ 2 s; 0 plain left; 3 conversation keys (lounge, Les Agents, one
  other conversation).
- Verified: raw database shows only `enc:v2:…` (message, reply quote, report snapshot, request note), the conversation key
  only locked, `/api/chat-keys` → 403; the chat shows normal text (new message + reply quote, after reload; lounge 40 →
  160 messages by paging, 0 unreadable); reporting works and moderators read the text; erasing a conversation key makes its
  texts read "🔒 … can’t be read"; `--decrypt --dry-run` sees all 4514 documents. Test data removed.
- Production: add CHAT_MASTER_KEY (same value as local, or a new one + run `pnpm chat:crypto --encrypt` there) BEFORE
  deploying; keep a backup of the key.

- Follow-up: `docs/ENCRYPTION.md` — operations guide for owners / developers (what is encrypted, keys, `pnpm chat:crypto` commands, encrypting a new environment, decrypting, rotating the master key, shredding, troubleshooting). Linked from HANDOFF and ARCHITECTURE.

### 2026-11-25 — full database snapshot: `pnpm data:export` → `pnpm seed` restores it on a new database
- Owner: "create a full seed of the data we have now so when we move we just run seed" — everything, database only (files
  stay on R2, same bucket).
- `src/seed/snapshot.ts`: `pnpm data:export` writes every collection (MongoDB Extended JSON, one document per line, so ids,
  dates and relations come back exactly) + `manifest.json` (date, counts, master-key fingerprint) into `seed-data/snapshot/`
  (previous kept as `snapshot-previous`; `/seed-data/` git-ignored: e-mails, password hashes, private messages). Skips
  `payload-locked-documents`, `payload-kvs`.
- `pnpm seed` (and the automatic seed on start): empty database + snapshot present → restore it, then add any newer texts;
  otherwise unchanged. `pnpm seed --restore --yes` replaces a non-empty database. Restoring stops before writing if the
  server's CHAT_MASTER_KEY differs from the snapshot's (encrypted texts would be unreadable).
- Guide: `docs/MOVING-DATA.md` (linked from HANDOFF commands; `OC_SNAPSHOT_DIR` in .env.example).
- Verified: export 5254 documents / 24 collections in ≈ 2 s (2.3 MB); `pnpm seed` into a new empty database restored all
  of them (every count equal), messages decrypt with authors, partners keep their hero images, group and site settings
  there, team account same id + password hash; a second `pnpm seed` doesn't restore again; `--restore` without `--yes`
  refuses; another master key → stops with a clear message. Test databases dropped; the real database untouched.

### 2026-11-26 — deployment guide + a working Dockerfile
- Owner: "I'm going to deploy it, write an md file for deployment".
- `docs/DEPLOYMENT.md`: why it must be ONE long-running server (the chat's live connections and presence live in memory —
  not Vercel / serverless, no auto-scaling), requirements, every environment variable, three ways to run it (VPS with pm2 +
  Nginx/HTTPS incl. the live-chat proxy settings, Docker, a platform such as Railway / Render / Fly / DigitalOcean), the
  database (restore the snapshot or start fresh → first account at /admin), post-deploy checklist, updating, backups,
  troubleshooting. Linked from HANDOFF.
- `Dockerfile` replaced (the template expected `output: 'standalone'` and a `public/` folder this project doesn't have):
  pnpm install → build with placeholder env → `pnpm start`, full app kept so `pnpm seed` / `chat:crypto` /
  `data:export` work in the container; `.dockerignore` added (no `.env`, `seed-data/`, `node_modules`, `.git`).
  The template was kept in the scratchpad only.
- Verified on a copy of the project (the running dev setup untouched): `pnpm build` succeeds (≈ 20 s), also with only
  placeholder env and no reachable database (what the Dockerfile does); `pnpm start` serves /en, /fr, /en/chat,
  /admin/login, robots, sitemap (200, ≈ 40 ms) and the live chat stream delivers decrypted messages. Not verified: the
  Docker image build itself (Docker's engine wasn't running).
- Noted: `src/app/my-route/` (template example route) still answers at /my-route — optional to delete.

### 2026-11-26 — Atlas: data went into `test`
- Owner: "why does it add the seed in `test` on MongoDB?" — the Atlas `DATABASE_URL` had no database name, so MongoDB used
  `test`. `test` held only the default demo content (1 account, 14 partners — added more than once — 641 texts, no members or
  messages): the server's automatic seed had filled it before the snapshot could be restored.
- Fixed the local `.env` (password untouched): `…mongodb.net/oddsclub?retryWrites=true&w=majority`. Ran `pnpm seed` → restored
  the snapshot of 2026-11-26 11:08 into Atlas `oddsclub`: 5254 documents / 24 collections (≈ 25 s); checked: 26 members,
  5 partners, 646 texts, 4521 messages (decrypt fine), 3 conversation keys, 18 media, 3 wallpapers.
- Left for the owner: delete the `test` database in Atlas (not touched). Atlas steps + this case added to DEPLOYMENT.md /
  MOVING-DATA.md troubleshooting.
- Follow-up: `test` is the database of ANOTHER site (not to be deleted). Inspected read-only: its data dates from Nov 17–24;
  OddsClub had added today 4 partners (1xBet, 888STARZ, Melbet, Betwinner — the other site's partners use other fields), and
  created translations (641) / languages (2) / globals (2) / member-roles (1) + 20 empty collections. No blocking index on
  the shared `partners` (only date indexes); `users` has the usual unique e-mail. With the owner's OK: backed up everything
  removed to `seed-data/test-cleanup-backup.json` (git-ignored), then removed only those (checks: exactly 4 partners by slug
  + date; whole collections only if every document was from today; empty collections only if still empty). `test` now:
  only the other site's collections, counts unchanged (partners 10, users 1, …). The owner's `pnpm seed` output
  ("0 created") was correct: `oddsclub` was already restored.
- Follow-up: `pnpm seed` now says why it skips the snapshot ("the database \"oddsclub\" already has data, so the snapshot was not restored (nothing to do). To replace its data with the snapshot: pnpm seed --restore --yes") instead of only "translations: 0 created" — the owner thought the restore had failed.

### 2026-11-26 — partner switch: the page glides to the new text lengths instead of jumping
- Owner screenshot (hero CTA + promo box): "not animated when text changes length or a card disappears — the site jumps".
- `setBrand`: GSAP **Flip** (bundled with gsap, now registered) records the blocks around the partner's texts
  (`BRAND_FLIP`: hero intro / CTA row / promo box, join steps, join buttons incl. the terms link that shows or hides, code
  card) before `applySite()`, then animates them from their old size / place to the new one (.6 s, power3.inOut, sizes
  animated without scaling so text isn't stretched); something that appears fades / scales in. The texts keep their own
  crossfade. `.is-flipping` turns the blocks' CSS transitions off while they move (the promo box has a hover transition).
  No animation on first load or with reduced motion.
- Type-checks. NOT checked in a browser: no dev server was running and starting a test server was declined.

### 2026-11-26 — favicon: visible on every tab, optional dedicated icon, refreshed when changed
- Owner: "the logo isn't applied as favicon in the back office / search engines — I see nothing".
- Cause: the icon WAS made from the logo, but the logo is a wide silver-white "ODDS" wordmark in the middle of a big
  transparent 512 px square: at 16–48 px only ~7 % of the icon had any pixels, pale on transparent → invisible on light tabs.
- `brandIcon` (src/lib/brand-images.ts): margins trimmed; the logo is centred on a rounded tile in the site's dark colour
  (default partner `night`), so a light logo shows on light and dark tabs (Apple 180 px: square, iOS rounds it).
- New optional Site settings → **Browser tab icon** (`site-settings.icon`, trimmed 512 px PNG): when set it's used as it
  is for the tab / home screen / search results instead of the logo tile (a wordmark can't be read at 16 px).
- Icon links carry `?v=<icon or logo id>-<colour>` (site page metadata + back-office layout, now generateMetadata) so
  browsers and crawlers fetch the new icon when it changes; `/favicon.ico` unchanged path (48 px).
- Site settings previews now show the real generated icon on a light and a dark tab and in the search result.
- Verified: rendered 16 / 32 / 180 px from the real logo on light and dark backgrounds — visible navy tile with the logo.
  Type-checks. Back office not clicked through (no running server / team sign-in available to me).
- Follow-up (owner: "check what you did on the hero yourself"): tested on the running site — the FLIP version was wrong:
  in the centred button row, giving the promo box its old width during the animation re-centred the row, so the Claim
  button was off by half the width change (21 px / 89 px) and overshot, briefly sliding under the promo box. Replaced
  FLIP (plugin no longer used): `brandSizes()` animates only the SIZE of the blocks holding the texts (promo box, hero
  intro, steps, code card code / bonus) from old to new — the browser lays out the neighbours on every frame, so they glide
  along; the terms link opens / closes (width + fade) instead of popping. Verified at 1600 px over 4 switches
  (Betwinner ↔ 1xBet, Betwinner ↔ New partner, sampled every 55 ms): promo width and Claim position change smoothly in one
  direction, gap between them constantly 12 px, no jump at the end; mid-frame screenshot clean; 390 px: stacked, no movement.
- Follow-up (owner screenshot, French hero sentence: "these texts too"): only the partner's name faded; the rest of the
  sentence re-wrapped instantly (words jumping between lines). Now the whole sentence crossfades: a copy of the old one
  (`.brand-ghost`, same parent, exact position / width) fades out while the new one fades in — an even crossfade (the
  two add up to one visible sentence every frame), with the block's height gliding as before. Applies to the hero intro and
  the join steps (`BRAND_TEXTS`). Verified (FR, 430 px and 1600 px): ghost exactly on the old paragraph, old + new = 1.00
  in every frame, steps crossfade too, no copies left — also after 4 switches 90 ms apart (final text right, opacity 1).

### 2026-11-26 — features section (3D phone): menu links, back to top and fast scrolling look deliberate
- Owner screenshot of "Your edge on every match": "looks like a beginner: scroll quickly, click the menu (Bonus), or the
  back-to-top button at the bottom — see what happens in that section".
- Reproduced on the running site (1440 px): during back-to-top / menu jumps the phone was frozen in its pose at the start
  (from the bottom: back-facing, tilted) floating over every section flying past, then blended slowly into place; the
  callouts played their entrance for every feature passed (half-drawn callouts mid-flight).
- Now (`JUMP`, `__phoneJump`, frame loop): a jump fades the phone (.22 s) and the callouts (`.features.jumping`) out for the
  flight; the phone follows the destination pose / screen unseen (screen shown directly, no turn); on arrival it fades and
  scales back in (.6 s) and only the arrival feature plays its entrance once. Wheel / touch / key during a jump ends it.
  Removed the old frozen "held" pose. Verified: back to top → phone 0 during the flight, 1.0 at the top with the partner's
  home screen; Bonus link → arrives on the welcome-bonus screen; callouts hidden in flight.
- Fast wheel flicks: the steady-rhythm chase owed up to ~1.7 s of turning after the page had already left the section (the
  phone keeps showing in the sections below). Owed turns now finish fast once outside the features (boost 4 per turn owed);
  inside them the catch-up is a bit quicker (0.6 instead of 0.35). Measured: flick past the whole section → phone settles
  0.3 s after the page (was ≈ 1.7 s); flick stopping inside → 1.2 s of calm turns.
- The cut-off left texts in the screenshot: no width between 880 and 1440 px cuts a callout (checked) — the screenshot crop.
- Follow-up (owner: "you made the mockup disappear on back to top / Bonus / Odds — let it travel there as before, just
  without spinning until it arrives"): the phone no longer fades out. During a jump it stays visible and follows the page's
  position and size, but its rotation is fixed to an upright pose facing you (the nearest front-facing angle; settles into it
  over ½ s from wherever it was) — the scroll-driven pose itself turns as the page flies, so it isn't used during the jump.
  On arrival it glides (shortest way, .9 s) into the live pose; if the destination shows another screen it then turns once
  and swaps at the half turn (as before). Callouts still step aside for the flight. `window.__phonePose()` (read-only) added
  for checks. Measured (rotation as seen on screen): back to top — 0° while flying, 31° landing glide; Odds — 0° in flight,
  6° landing; Bonus — 0° in flight, one turn on arrival to show the welcome-bonus screen; phone visible throughout
  (opacity only lowered by the usual footer fade).

## 2026-11-26 — Link previews & favicon on the live site (Render)

- Problem on Render: `NEXT_PUBLIC_SERVER_URL` was not set, so the preview image pointed at `http://localhost:3000`; the
  `/brand/*` and `/favicon.ico` routes answered 500 (the logo was fetched through the public address from inside the
  container); chat pages had no preview tags at all (WhatsApp showed a bare "Community · OddsClub").
- `src/lib/brand-images.ts`: the logo is read through the server's own loopback first (then `NEXT_PUBLIC_SERVER_URL`, then
  the request address), with an 8 s timeout; if it still fails the icons fall back to the default mark (never a 500) and
  the reason is logged as `[brand] …`. The share image now shows the trimmed logo large and centred.
- `src/lib/brand.ts` `publicOrigin()`: `NEXT_PUBLIC_SERVER_URL`, else the address the request came in on
  (`x-forwarded-host` / `x-forwarded-proto`), so previews are absolute and correct even before the variable is set.
- New `src/lib/site-metadata.ts` `siteMetadata()`: one place for Open Graph / X card / icons / theme colour; the preview
  image URL is versioned (`/brand/og?v=…`) so a new logo gives a new preview. Used by the home page and the chat page.
- Chat page: every chat link gets the logo card. A **public** group's link (`/chat/g-<id>`) shows that group's name,
  description and picture; an invite link (`/chat/join-<token>`) shows the group it invites to. Hidden / members-only
  groups only get the generic community card. Group pictures are served as JPEG by the new `/brand/room/<id>` (public
  groups, or with the invite token) since WhatsApp doesn't reliably show .webp.
- Checked locally: `/en`, `/en/chat`, `/en/chat/g-…` have absolute og:image / twitter:image / icons; `/brand/og`,
  `/brand/icon/32|192`, `/favicon.ico`, `/brand/room/<id>` → 200; unknown room → 404. Type-check clean.
- `docs/DEPLOYMENT.md`: troubleshooting row for missing link-preview logos.

## 2026-11-26 — Links to a conversation that isn't yours

- Opening `/chat/pm-<id>`, `/chat/sup-<id>` or `/chat/g-<id>` for a conversation the viewer has no access to (someone
  else's private chat, a hidden group, a deleted room) waited for it forever: the address kept the foreign id, the
  "waiting for the room" state stayed on, and the Community lounge showed behind it. The server was already safe
  (`history` / hello only send a private chat to its two people and a group to those allowed to read it).
- `engine.ts` `giveUpWantRoom()`: called when the groups arrive (the last part of each connection's data); if the room
  still isn't in the viewer's list → stop waiting, back to the room list (`/chat`) with "This conversation isn't
  available to you." (new string `chat.roomUnavailable`, en + fr). Checked: foreign pm link → room list + note; unknown
  group → same; a real public group link still opens after a refresh.
- Found while testing: the local database's logo file (`brand-logo-1795546324466.png`) is gone from R2. The local and
  Render databases share one R2 bucket; replacing the logo on Render removed the old logo's file, which the local copy
  still points at. Re-upload the logo locally, and use a separate bucket (or prefix) for local work.

## 2026-11-26 — Phone long-press menu closing at once; wallpaper behind the input

- Long-press on a message (phones) opened the menu and closed it straight away. Causes: (1) when the finger was held a bit
  longer than ~0.45 s, the tap the browser makes from the lift landed on the menu's backdrop (`ctxBg`) and closed it;
  (2) any window resize closed it — on phones the height changes all the time (keyboard closing, address bar sliding);
  (3) the message text was selectable, so the phone's own selection + Copy bar fought with our menu.
- `engine.ts`: the press that opened the menu by holding is remembered (`held`); its lift sets `CTX.liftAt` and the
  `touchend` is cancelled (no tap made from it); the backdrop ignores taps within 400 ms of that lift. The menu now closes
  on resize only when the width changes (rotation). `site.css`: no text selection on bubbles on touch screens (`hover:none`
  + `pointer:coarse`) — Copy is in our menu.
- Wallpaper: the bar under the message field (`.dock`) kept the theme's solid colour; with a wallpaper chosen
  (`data-wp` cover / tile) it is now see-through, so the wallpaper runs to the bottom like WhatsApp. Theme backgrounds
  unchanged.
- Checked on an emulated phone (390×780, real touch events): hold 0.5 s and 1.2 s → menu stays open, no text selected;
  a tap on the backdrop still closes it; with a tile wallpaper the dock is transparent (screenshot).
- Follow-up from the owner's screen recording (Android Chrome, on Render = old code): the menu opened, then closed
  ~0.25 s later **with the finger still down**. Cause: our menu opens at 0.42 s; Android's own long-press (`contextmenu`,
  ≈0.5–0.65 s) then arrives on what is under the finger now — the menu's backdrop — whose handler closed the menu; Android
  also sends `pointercancel` then, which the first fix took for the finger lifting. Now: `contextmenu` anywhere on the
  menu is swallowed and only closes it from the backdrop more than 1.5 s after it opened; `pointercancel` no longer
  counts as a lift. Replayed the Android sequence on the emulated phone (hold → contextmenu on `ctx-bg` + pointercancel →
  lift + stray click): stays open; a later tap on the backdrop closes it.
- Slip while editing: an inline `//` comment inside a one-line function swallowed its end → the page 500'd for a minute
  (`Expected '}'`), fixed with `/* */`. Note: tsc doesn't check `engine.ts`, so it didn't catch it — load the page after
  editing that file.
- Lifted copy re-wrapping: `openCtx` measured the message while it was still shrinking back from the press
  (`.bubble.pressing` = scale .96), so the copy was made ~4% narrower, its text re-wrapped (the time dropped to a new line)
  and it jumped in height during the lift animation (visible in the owner's video). Now the message is measured with its
  transform switched off for that instant, and the copy gets that exact width and height (border-box). Checked on a
  360 px emulated phone, 6 messages: copy width/height = original, no overflow, same text height.

## 2026-11-26 — Phone keyboard & message box, picture picker, bubble-style cards (owner's Android screenshots)

- Keyboard covering the message box: the chat is `position:fixed; inset:0`, and phones open the keyboard *over* the page
  (Android Chrome's default, iOS Safari), so the box sat half behind the keys with no gap. `engine.ts`: the open chat is
  sized to the visible area (`visualViewport` → `--vvh` / `--vvt` on `#messenger`, `kb-open` when the keyboard is up);
  a conversation read to the end stays at the end; pinch-zoom is left alone. `site.css`: `.messenger.open` uses those
  values; `kb-open` gives the dock 14 px of space above the keys.
- Send keeps the keyboard open: tapping the send button no longer takes the focus from the text box
  (`pointerdown`/`mousedown` default prevented while the box has focus; the tap still sends).
- Picture editor: closing it (✕) or sending from it now puts the keyboard away (it used to focus the message box again).
- "Can't be used as a photo" on the first pick, fine on the second: Android's picker hands over a file it may still be
  copying. The picked file is now read fully first (up to 4 tries, 350 ms apart), its type is taken from its first bytes
  when the phone gives none (JPEG/PNG/GIF/WebP/HEIC/AVIF), and the editor opens from the bytes in memory. If it still
  can't be read: "That picture couldn't be opened…" (`chat.err.picRead`, en + fr).
- Bubble-style sheet: the step title (with ←) stays pinned while the cards scroll (it was cut by the sheet's edge); on
  narrow phones the mini chats are drawn smaller (`zoom` .8 ≤420 px, .7 ≤380 px) so the bubbles fit whole instead of
  running out of the card.
- Checked on emulated phones: chat height = visible height (760 → 420 px: dock bottom at 420); send button keeps the
  focus in the box; a PNG without extension/type opens the editor with no error; ✕ leaves nothing focused; bubble cards
  at 340/360/375/412 px: nothing runs out of the card. The real keyboard can't be emulated — to confirm on the phone.

## 2026-11-26 — Checked on the iPhone simulator (iPhone 16e, iOS 26.1, Safari)

- Driven with `safaridriver` (Safari in the simulator, `safari:useSimulator`) + `xcrun simctl io booted screenshot`.
  Limits: in automation mode Safari never shows the on-screen keyboard, and real taps on the simulator need it in front
  (no screen-recording permission to aim them) — so typing with the real keyboard still has to be tried by hand.
- Found: the sign-in form that opens with the chat focused the e-mail box by itself → on iPhone the keyboard popped up
  uninvited and covered the password field and the buttons. `chatBackend.ts` `focusFirst()`: on touch screens a text
  box is no longer focused automatically (the form itself takes the focus, no ring); computers unchanged. Checked on the
  simulator: sign-in opens with the whole form visible, no keyboard.
- Pop-up forms follow the keyboard like the chat: the visible-area values (`--vvh` / `--vvt`, `kb-open`) now live on the
  page root; `.sheet-wrap.open` uses them and its sheet's max height fits above the keyboard.
- Bubble-style cards on iOS Safari: all bubbles whole (screenshot).

## 2026-11-26 — Several photos at once (like WhatsApp)

- Picker (`#picFile`) takes several pictures (up to 10; more → "You can send up to 10 photos at once."). Each one is read
  fully first (Android fix above), checked (type, 10 MB), then all open in the picture editor.
- Editor (`engine.ts`): a strip of thumbnails above the caption (tap = switch; dashed "+" = add more, up to 10) and a
  trash button in the toolbar (only with 2+ photos) to drop the current one. Every photo keeps its own crop / rotation /
  flip / drawing / stickers / undo history and caption (`PE.items`, `peSave` / `peLoad` / `peShow`). The text already in
  the message box becomes the first photo's caption. On phones the caption is no longer focused on open (no keyboard
  over the photo).
- Send: one photo → as before (through the message box: rules, slow mode, reply). Several → `sendAlbum`: checks once
  (rules accepted, slow mode, each caption), all appear at once in order, then upload one after the other so they arrive
  in that order; the reply goes with the first; ✕ on one still waiting skips it.
- Slow mode: photos sent together carry a batch id (`batch`); the server (`sendImage` / `prepareSend`) lets the 2nd–10th
  photo of the same batch, same room, within 3 min, through without the wait (`hub.batches`). The first photo still
  waits like any message.
- Safety: `sendImage` in `chatBackend.ts` now passes `pmTo` like voice messages do — without it, a picture from a
  private chat would have been routed as a lounge message (not reachable today: the picture button is hidden in private
  chats, but no longer possible at all).
- New strings (en + fr): `pe.photos`, `pe.photoN`, `pe.addMore`, `pe.removePhoto`, `pe.err.max`.
- Checked on an emulated phone: 3 pictures open with a strip; caption on photo 1 and rotation on photo 2 are kept when
  switching back and forth; trash removes the current one; "+" adds; going past 10 stops at 10 with the message.
  Not checked here: the actual upload of an album (needs a signed-in account allowed to send pictures).
- Follow-up: the picture editor (`.pe`, full screen) now follows the visible area like the chat (`.pe.open` uses
  `--vvh` / `--vvt`): the caption and the photo strip stay just above the keyboard (12 px gap); its height — and the chat's
  — eases with the keyboard (.26 s) instead of jumping; a ResizeObserver on the stage re-fits the photo as it changes.
  Switching photos slides + fades the next one in from its side (240 ms); added thumbnails pop in one after the other;
  removing a photo slides the next one in. Reduced-motion: none of it. Checked (emulated phone, 780 → 430 px visible):
  editor 780 → 515 (mid-way) → 430, caption bottom = visible bottom, photo inside the stage, slide animation runs.

## 2026-11-26 — Chat full screen on phones (no address bar)

- Android browsers: the chat asks for full screen (`requestFullscreen({navigationUI:'hide'})`, `engine.ts` `fsEnter`)
  when it opens from a tap; opened from a link (no tap yet → refused), the first tap anywhere while it is open does it
  (listener on the document, since the sign-in form isn't inside the chat panel). Leaving the chat exits full screen
  (`fsLeave`, only if we entered it). If the person leaves it themselves (Back), it isn't asked again until the next
  opening. Touch screens only; not in an installed app (already full screen).
- iPhone Safari can't hide its address bar from a page. New `src/app/manifest.ts` (`/manifest.webmanifest`: site name,
  navy colours, 192/512 icons from the back office, `display: standalone`) + `appleWebApp` in `siteMetadata` (manifest
  link, `mobile-web-app-capable`, title, black status bar): "Add to Home Screen" opens the site like an app, no address
  bar — also on Android ("Install app").
- Checked: manifest served, tags on the pages, icon 512 → 200. Full screen: the test browser refuses every full-screen
  request (even a bare page), so the calls were checked with a stand-in that behaves like a phone (granted only on a
  tap): home → no request; chat opened by a tap → full screen; leaving → exit; opened from a link → refused, first tap →
  full screen; left by the person → not asked again.

## 2026-11-26 — Buttons show a spinner while waiting for the server

- Chat buttons that ask the server something (sign in, create account, reset password, save profile, join / leave /
  request a group, create / save a room, invite links, report, block, accept / decline…) only faded while waiting and
  looked stuck. `chatBackend.ts`: every `post()` now puts the button the person just pressed (click, or the form's submit
  button, within 2 s) into a busy state until the answer: disabled + `aria-busy`, and after 120 ms (no flash on quick
  answers) `.is-busy` — same size and colour, label hidden, spinner in the button's own text colour. Background requests
  (presence, receipts, lists, history…) and sending messages / reactions never take a button.
- Panels that redraw while working: room settings' Save/Create shows the spinner instead of "…"; group info keeps the
  spinner on the action pressed (others just wait disabled).
- `site.css`: `.is-busy` (+ `busy-spin`), and no fading for a waiting button (`[aria-busy="true"]:disabled`).
- Checked (emulated phone, server answer slowed to 1.6 s): Sign in → spinner, full colour, same width (340 px); after
  the answer the label is back with "Email or password is incorrect."

## 2026-11-26 — Show / hide password (eye)

- Chat sign-in / sign-up / new-password field (`Site.tsx` `#authPassword` in `.pw-wrap` + `#authPwEye`): an eye button
  inside the field toggles show / hide ("Show password" / "Hide password", en + fr, `aria-pressed`). The tap keeps the
  focus and the keyboard in the field; the password is hidden again when the form is sent or closed.
- Back office: new `src/backoffice/components/ui/password-input.tsx` (`PasswordInput`, same props as `Input`, works
  with react-hook-form) — used on the login page, the forgot-password page and both fields of My account.
- Checked: chat (emulated phone) — typed, eye → visible with focus kept, eye → hidden, closing the form → hidden;
  back-office login — eye shows the password. Screenshots look right in both.
- Owner's choice: text on the chat's green (OddsClub chat theme) is now the site navy #0D2747 instead of near-black
  #0B1F05 — green buttons' labels and their spinner, the green send button's arrow and the unread badge
  (`--c-accent-ink`, `--c-send-ink`, `--c-unread-ink`). Contrast on #7CC242: 6.9:1 (readable; white would be 2.2:1).
  The main website's green buttons (`--green-ink`) are unchanged. Checked: label and spinner both rgb(13,39,71).

## 2026-11-26 — Owner's Android screenshot: full screen removed, keyboard gap fixed

- Full screen (previous entry) is **removed**, owner's choice: the browser's full screen also hid the phone's
  notification bar, and a page can't hide only the address bar. The chat stays in the normal browser view; installed
  from the browser ("Install app" / "Add to Home Screen", manifest kept) the site opens with the notification bar and no
  address bar. (The empty strip above the chat header in the screenshot came from full screen + the notch padding; gone
  with it.)
- No space between the message box and the keyboard: in that mode Android shrank the whole page with the keyboard, so
  "page height − visible height" never showed it. Now: the visible area is compared with the tallest seen at this width,
  while a text box has the focus (re-measured on rotation / full-screen change, re-checked on focus in / out).
  Checked (emulated, page shrinking 780 → 430 with the box focused): `kb-open` on, 14 px under the box; closed → 8 px.
- Keyboard suggestions: tried turning autofill off on non-login text boxes — reverted at the owner's request; text boxes
  are as they were.

## 2026-11-26 — Notifications of new messages (Web Push) — built, waiting for the `web-push` package to test

- Owner's choices: private chats, help chat and replies always; joined groups on with a mute per group; lounge and
  match rooms off; lock screen shows sender + text by default (each person can hide the text); team accounts are
  notified of members' help-chat messages.
- Server: `push-subscriptions` collection (device endpoint + keys, account, language; server-only); `pushPreview` /
  `pushMuted` hidden fields on `members` and `users`; `src/chat/push.ts` (`pushForMessage` after every saved message:
  recipients by room type, skips whoever is looking at that conversation, per-device language, removes dead devices on
  404/410); API `push-subscribe` / `push-unsubscribe` / `push-prefs`. `web-push` is loaded on first use (createRequire),
  so a missing package only turns notifications off — it broke the chat pages for a minute while it was a top-level
  import (fixed). Page settings `cfg.chat.pushKey` = the public key only when keys + package are there.
- `public/sw.js` (new `public/` folder): shows the notification (one per conversation, replaced by newer ones), skips it
  if that conversation is on screen, tap → focuses the open tab and opens the conversation (message `oc-open` →
  engine routes it) or opens a new window.
- Chat (`chatBackend.ts`, "Web Push" section): card in the room list ("Get notified of new messages", Turn on / Not now
  for 14 days; on iPhone outside the Home Screen: how to add it), switch + "Show the message text" in the account panel,
  "Mute / Unmute notifications" in group info, subscription re-attached to the signed-in account on connect, turned off
  on sign-out. `engine.ts`: a hidden tab reports no room (so it gets notifications). Strings en + fr (`push.*`).
- Local `.env`: a VAPID key pair was generated (private key not printed). Docs: new `docs/NOTIFICATIONS.md`,
  `docs/DEPLOYMENT.md` env table (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).
- Not tested yet: `web-push` is still not installed in this project (`pnpm add web-push` + `pnpm add -D @types/web-push`).
  Type-check clean; chat pages and API answer normally without it.

## 2026-11-26 — Search results: stretched profile pictures

- Owner's screenshot: people found by the room search showed their picture as a long oval. `.ppl-row-item span{flex:1}`
  (meant for the name) also matched the picture (`span.ppl-av`). Now only the name grows; the picture is `flex:none`.
  Checked: a result row's picture measures 36×36. Proposals for a more polished search sent to the owner (not built yet).

## 2026-11-26 — Search mode in the room list (like WhatsApp / Telegram)

- `Site.tsx`: the search box is in a `.search-row` with a clear ✕ (`#searchClear`) and a Cancel button
  (`#searchCancel`, slides in); `#srchHint`, a "Chats" heading (`#srchChats`) and an empty state (`#srchEmpty`).
- `engine.ts` "Search mode": tapping the box adds `.searching` to the side panel — the tabs, notification card, rules
  link, chat requests and online strip make way (on phones the panel header too); one scrolling list with the search
  bar pinned on top: hint before typing → Chats (all rooms whose name matches, whatever tab was chosen, letters
  highlighted with `mark.hl`) → People. Nothing found → icon + "No results for “…”" + a tip. Cancel / Escape / the
  phone's Back leave it (one history step, depth counted); the keyboard's search key and starting to scroll put the
  keyboard away, results stay. A room opened from the results replaces the search step in the history (Back = room
  list in one step).
- `chatBackend.ts`: People results use the same highlight, show two shimmer rows while looking, hide people already
  in an accepted private chat (they're under Chats), and no longer show their own "no results" (the engine's empty
  state covers both). `peopleSearch()` / `searchUpdated` link the two.
- Strings en + fr (`search.*`). Checked on an emulated phone (guest): enter, hint, "ag" → Chats with "Les **Ag**ents",
  nonsense → empty state, ✕ clears, search key closes the keyboard and keeps results, Back and Cancel leave, open from
  results → Back once → list → close → site. People results need a signed-in account: not checked here.

## 2026-11-26 — Notifications tested end to end (web-push installed)

- `web-push` 4 + `@types/web-push` installed by the owner; type-check clean; the page now offers notifications
  (`cfg.chat.pushKey` set).
- Real test (local, Chrome with a normal profile — Chrome has no push in incognito windows, so Playwright's extra
  contexts can't subscribe): test account Amara A. signed in, account panel → switch on → subscribed with Google's push
  service (fcm.googleapis.com), panel "on" + "Show the message text". Bastien H. (2nd test account) wrote in the group
  "Les Agents" while Amara was on the room list:
  - notification shown by the service worker: "Les Agents" / "Bastien H.: Push test: who is watching the match
    tonight?", tag `g:<id>`, opens `/en/chat/g-<id>`;
  - "Show the message text" off → same notification, body "New message";
  - group muted → no notification.
  Cleaned up: the 3 test messages deleted, both accounts left the group, Amara's subscription removed and signed out.
- Fixed while testing: a failed subscription showed Chrome's raw English error; now our message (`push.err.failed`,
  mentions private windows).
- The two load-test accounts `seed-fan-01` / `seed-fan-02@oddsclub.test` (local test data) now have a known test
  password (they had random ones).
- Not tested here: tapping the notification (needs a person), private-chat / help-chat / reply notifications (same
  sending path, recipients chosen in `src/chat/push.ts`), iPhone.

## 2026-11-27 — iPhone (iOS 26 Safari): empty bands + the see-through keyboard

- Owner's iPhone screenshots: an empty band above the chat header and above the home page's top bar, one under the
  message box, and the website showing through the (see-through) keyboard below the chat.
- Bands: the viewport asked for `viewport-fit=cover`, so Safari reported the status bar / home bar as safe areas
  (~59 / 34 pt) although its own bars already sit there → our `env(safe-area-inset-*)` paddings left empty strips.
  Removed from `src/app/(frontend)/layout.tsx` (the paddings now resolve to 0 in the browser).
- Keyboard: the chat was shrunk to the area above the keyboard, so the page behind showed through iOS's see-through
  keyboard. Now (`engine.ts` keyboard block, `site.css`): the chat / photo editor / pop-up forms keep the full screen
  height (`--vvfull`, learnt while the keyboard is down), and only the bottom part is lifted by the keyboard's height
  (`--kb`): the message box (`.dock` margin, + 14 px), the room list's bottom, the editor's caption, a form's buttons.
  Eased (.26 s). The conversation keeps showing the latest message just above the box while it moves (a ResizeObserver
  on the message list keeps it at the end when it was at the end).
- Not checked yet: the owner's dev server was stopped when the change was made (not restarted by me, as agreed).

## 2026-11-27 — Dragging the hero phone on some phones

- Owner: some phones can drag-rotate the mockup, others can't. Not a motion problem: the drag zone (`#dragZone`) is
  meant to have `touch-action: pan-y`, but GSAP's Draggable writes `touch-action: manipulation` inline, which lets the
  browser claim sideways swipes. Browsers that do (Chrome on Android among them) send `pointercancel` after ~28 px →
  Draggable treats it as a release → under the 70 px threshold → the phone springs back. Others never cancel, so it
  worked there.
- Fix (`site.css`): `touch-action: pan-y !important` on `.drag-zone`. No change to any motion / animation / thresholds.
- Checked (emulated phone, real touch events): sideways left / right, a diagonal-start thumb swipe and a slightly
  downward one all switch the partner; a 50 px swipe springs back; a vertical swipe still scrolls the page. It is the
  only Draggable on the site.

## 2026-11-27 — Private chats: pictures / voice setting · notification card loading + "Not now"

- Private chats between members had no setting: pictures were always refused and voice messages always allowed (hard
  wired). New in back office → Chat settings → **Private chats**: "Pictures" (off by default = as before) and "Voice
  messages" (on by default = as before). Stored in `chat-settings.privateChats` {pictures, voice}; applied by the server
  (`sendImage` / `sendVoice` → `chatConfig().pmPictures / pmVoice`, messages `chat.err.pmPicturesOff` /
  `chat.err.pmVoiceOff`) and by the chat (`cfg.chat.pmPictures / pmVoice` → picture button / microphone shown or hidden
  in private chats). The chat with the team always allows both; shared rooms still follow the role's right.
- Notification card: "Turn on" shows a spinner from the tap until done (also while the browser's "Allow
  notifications?" question is open), "Not now" disabled meanwhile; success or a refusal → the card folds away. "Not
  now" folds the card away (height / padding / opacity, .3 s) and is also remembered for the visit in memory — when the
  browser can't store it (private browsing) the card used to come back at the next refresh. The account panel's switch
  pulses while working.
- Upload errors: a failed voice upload said "can't be used as a photo"; now "That recording can't be used".
- Checked: private chat between the two test accounts — picture refused with the new message, voice passes the rule
  (then closed the chat again); card — spinner while the question is open, Not-now disabled, clear message after;
  Not now with storage blocked folds 130 → 26 → 0 px and stays hidden after a refresh.

## 2026-11-27 — Chat text font (theme picker step 4)

- New step "Text font" in the theme sheet (`Site.tsx` `#tsFonts`), reachable from the Theme step ("Font" button) and
  from the palette menu (Theme / Wallpaper / **Font**). 13 choices (`engine.ts` `FONTS`): Theme default (as before),
  This device's font, Inter, Roboto, Open Sans, Lato, Poppins, Nunito, Montserrat, Source Sans 3, Lexend, Atkinson
  Hyperlegible, Merriweather. Each card: "Aa" + name + a sample message in that font + a short description (en + fr).
- Loading: Google Fonts only when chosen (`loadFont`); the cards' previews load only the letters they show (`&text=`).
  Saved per device (`ps_font`), applied at start.
- Applied everywhere in the chat: `--font-chat`, `--font-title` and `--body` set on every themed part (messenger, menus,
  every chat sheet, the palette menu, the photo viewer, toasts; the photo editor lives inside the messenger). On the
  OddsClub theme (tall display titles) the titles get weight 800 with a text font. Theme previews keep their own font.
- Checked (emulated phone): with Poppins — bubbles, room list, header, search, message box, sheet title + buttons,
  sign-in button, toast, chat title all Poppins; kept after a reload and after changing theme; "Theme default" brings
  back the theme's own font.
- Follow-up (owner): fonts in a 2-column grid like the other steps, and clearly different fonts. List now: Theme
  default, Device font, Inter, Poppins, Fredoka (round), Oswald (tall / sporty), Exo 2 (futuristic), Merriweather (book
  serif), Playfair Display (elegant serif), Space Mono (typewriter), Patrick Hand (handwritten), Atkinson (legible).
  Cards (`.tcard.fcard`): a preview (theme colours, "Aa" + the sample message, wraps on 2 lines) + name + style + check.
- Cards changed size when a font was picked (the whole sheet's font changed, so every label re-wrapped). Now each card
  — preview and labels — is written in its own font, the name has one line (… + tooltip) and the style a fixed two
  lines. Also: the check circle was a `<span>` caught by the label's `flex:1` and took half the width (fixed).
  Shortened names that didn't fit at 360 px: "Device font" / fr "Appareil", fr "Thème", "Atkinson".
- Checked at 360 / 390 / 430 px (en + fr): all 12 cards the same size, no name cut, 0 size changes after 6 picks.
- Local DB: `pnpm seed` added the 61 missing translations (new texts since the last start); the two shortened French
  names were updated in place (the seed never overwrites existing texts).

## 2026-11-27 — Hero picture vanishing and fading in again after a partner switch (Safari)

- Owner: after the switch animation the hero picture disappeared and came back, "as if it loaded twice". Cause
  (`engine.ts` `swapHero`): at the end of the entrance, the inline `opacity:0`, the finished Web Animation and the
  inline `transition:none` were all removed in the same instant; Safari then ran the picture's CSS opening fade (1 s,
  .2 s delay) from "invisible" → it dropped to 0 and faded back in. Chrome started from the animated value, so it never
  showed there.
- Fix: the style is applied first (`offsetWidth`) with transitions still off, and they stay off on swapped pictures
  (only the very first picture uses the opening fade). The animation itself is unchanged.
- Measured (opacity every 40–50 ms through partner switches): Safari on the iPhone simulator before — at the end of
  the entrance 1 → 0 → back to 1 over ~1 s; after — no drop, two switches in a row; Chrome desktop + phone — no drop.

## 2026-11-27 — No zoom in the chat

- While the chat is open (`engine.ts` `lockZoom`, on open / close in `route()`): the viewport meta becomes
  `maximum-scale=1, user-scalable=no` (Android; on iPhone it also stops the automatic zoom-in when tapping the message
  box) and is restored on the site; iPhone Safari's `gesturestart` / `gesturechange` (pinch) are cancelled while it is
  open. `site.css`: `touch-action: pan-x pan-y` on the chat, its sheets, the photo viewer, the photo editor and the
  palette menu (no pinch / double-tap zoom; scrolling and swipes keep working). The rest of the site keeps normal zoom.
- Checked (emulated phone): home → normal viewport; chat opened from the site or loaded from a link → locked +
  `pan-x pan-y`; back on the site → restored. Finger scrolling of the conversation and long-press menu still work.
