# OddsClub — project handoff (read this first)

This file is the single source of truth for anyone (human or another Claude session) continuing the build.
Read it top to bottom, then `docs/ARCHITECTURE.md`, then the newest entries in `docs/PROGRESS.md`.

## 1. What we are building

OddsClub is a **betting-affiliate promo site** built for a client (the client is an affiliate partner of
betting brands, similar to 1xPartners). It promotes several partner bookmakers with promo codes and bonuses,
shows live/upcoming matches with odds across many sports, and has a **real community chat**.

The approved design is a working single-file prototype:
`design/prototype/oddsclub-prototype.html` (open it in a browser — it runs on its own, libraries from CDNs).
**Phase 1 = reproduce that prototype exactly in this codebase. Nothing may be lost or changed visually.**

### Product requirements (from the owner)
- Almost everything is **dynamic and managed in a back office**: partners (betting brands) and their themes,
  all site text, matches, chat rules, chat moderation, settings.
- **Add a new partner with its own theme from the back office** → it appears in the partner switcher and on the 3D phone, no code change.
- **All text comes from the database.** No hard-coded user-facing strings in components.
- **Language switcher**; admins can **add new languages** and **translate manually** in the back office.
- Real chat: rooms per match + community lounge + direct chat with the partner team ("support"/agent),
  presence (online dot, "last seen"), typing indicator, reactions, replies, reports, mute, delete, slow mode,
  house rules gate (18+ acceptance), per-user chat themes (OddsClub, WhatsApp, WhatsApp Dark, Telegram,
  iMessage, Messenger, Discord, Signal).
- Motion: iOS-style springs/smoothness (NOT the iOS glass look). Dialed-coffee-style scroll storytelling with a 3D smartphone.

### Owner's UI rules (must follow)
- Button hierarchy: exactly one primary per view, secondary = outlined, tertiary = text button.
- Icons: consistent inline stroke SVG icons. No emoji as icons (emoji are fine as chat reaction *content*).
- The partner pill has **no shadow**. 888STARZ uses **red as primary** (menus and buttons).

## 2. Fixed technical decisions (do not change without asking the owner)
| Area | Decision |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript, inside a Payload CMS 3 app (created with `create-payload-app`, blank template) |
| Back office | **Custom back office at `/admin`** (owner chose “fully custom”): Next.js route group `src/app/(backoffice)`, shadcn/ui (new-york, Tailwind v4, Radix) + TanStack Table v9 (via `@tanstack/react-table/legacy` v8-style API) + react-hook-form/zod + react-colorful + Recharts + cmdk + papaparse + sonner + next-themes + lucide-react. Data via server actions using the Payload Local API. Payload’s own admin moved to `/cms` as a raw data editor. |
| Database | **MongoDB** (`@payloadcms/db-mongodb`) — chosen by the owner |
| Images / uploads | **Cloudflare R2** through `@payloadcms/storage-s3` (R2 is S3-compatible) — owner switched from Backblaze B2 to Cloudflare (2026-11-24). `R2_*` env vars; `R2_PUBLIC_URL` (bucket custom domain) serves files from Cloudflare's CDN. Without R2 vars: local `./media` |
| Hosting | **One VPS, one Node process** (owner, 2026-11-24). The live chat keeps its state in memory, so **no Redis** is needed. Run a single instance (no PM2 cluster mode / no multiple replicas); if that ever changes, add Redis pub/sub to `src/chat/hub.ts` first. Behind nginx, turn off proxy buffering for `/chat-api/stream` (SSE). Dockerfile + docker-compose provided |
| Package manager | **pnpm** (never run npm in this repo) |
| Animation libs | three, gsap (+ScrollTrigger, Draggable), lenis, motion, dayjs, @floating-ui/dom — npm packages, same behaviour as the prototype |
| i18n | Our own `languages` + `translations` collections (NOT Payload's static `localization`), so languages can be added at runtime |
| Realtime chat | Server-Sent Events (SSE) from Next route handlers (`/chat-api/*`) + an in-process hub on `globalThis` (`src/chat/hub.ts`). One server → no Redis (see Hosting). (socket.io packages were installed early but are not used — can be removed.) |

## 3. Environment notes (important for Claude sessions)
- Project path on the owner's Mac: `~/Documents/divin/new/prod/oddsclub`.
- Claude now runs directly on the owner's Mac (earlier sessions used a Linux VM). The owner runs `pnpm dev` in their own
  terminal; Claude talks to it on http://localhost:3000 and does not start/stop it.
- Type-check: `node node_modules/typescript/bin/tsc --noEmit -p .`
- `pnpm payload run <script>` exits without running the script on this machine → scripts run with
  `node --env-file-if-exists=.env --import tsx <script>` (that is what `pnpm seed` / `pnpm admin:reset-password` do).
- Versions installed: next 16.4.6, payload 3.94.1, react 19.2.9, three 0.187, gsap 3.15, lenis 1.3, motion 14, typescript 5.7.
- Next 16 note: request interception file is `src/proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`).
- three 0.187 vs prototype r128: use `renderer.outputColorSpace = THREE.SRGBColorSpace`,
  `texture.colorSpace = THREE.SRGBColorSpace`; physically-correct lights are now always on, so multiply the
  prototype's ambient/directional intensities by `Math.PI` to match the old look. If the phone still looks
  different, pin `three@0.128.0` as a fallback.

## 4. Phases and status
See `docs/PROGRESS.md` for the live checklist and log. Summary:
1. **Clone** the prototype into Next.js with zero loss (visual + behaviour parity checklist in PROGRESS.md).
2. **Content to DB**: every string → translation key; partners, matches, settings → collections/globals; seed = prototype content.
3. **Back office**: partners + theme editor with preview, languages, translations grid (missing filter, import/export), page texts, matches, chat rules & banned words, reports/mutes, users & roles (owner, editor, translator, moderator).
4. **Language switcher** (`/[locale]/...`, remembered choice, fallback to default language, RTL support).
5. **Real chat** backend (members auth, rooms, DMs, presence, moderation) replacing the prototype's claude.ai `db/room/user` capabilities.
6. **Launch prep**: Docker, env docs, SEO, monitoring, backups, compliance (18+ gate, cookie consent, responsible-gambling + affiliate notices, geo restrictions — client's lawyer to confirm).

## 5. Commands
Run from the project folder. Use **pnpm** (never npm).

| Command | What it does | When |
|---|---|---|
| `pnpm install` | Install dependencies | After cloning / when package.json changes |
| `pnpm dev` | Start the site + back office on http://localhost:3000 (`/en` site, `/admin` back office, `/cms` raw data editor) | Development. **Restart it** after changing `.env` or `next.config.ts` |
| `pnpm build` then `pnpm start` | Production build, then run it | On the server |
| `pnpm generate:types` | Regenerate `src/payload-types.ts` from the collections | After any schema change (collections / globals / fields) |
| `pnpm generate:importmap` | Regenerate Payload's admin import map | After adding custom Payload admin components |
| `node node_modules/typescript/bin/tsc --noEmit -p .` | Type-check everything | Before handing over any change |
| `pnpm lint` | ESLint | Optional |
| `pnpm test` | Integration (vitest) + end-to-end (Playwright) tests | Optional (starter tests only so far) |
| `pnpm seed` | Fill the database with the prototype content (languages, all texts en + fr, partners + themes, matches, chat rules). Only **adds what is missing**, never overwrites back-office edits | Fresh database, or after adding new text keys to `src/i18n/strings.ts`. The server also does this automatically on start (turn off with `OC_AUTO_SEED=false` in `.env`) |
| `pnpm seed --force-strings` | Same, but **overwrites** existing texts with the built-in English/French | Only to reset texts on purpose (it erases translators' edits) |
| `pnpm admin:reset-password` | Shows which account is the main admin | Server, recovery |
| `pnpm admin:reset-password <main-admin-email>` | New password for the **main admin** (the first account created), typed hidden; `--generate` prints a random one instead. Unlocks it and keeps it an owner. Refuses every other account (they use "Forgot your password?" + owner approval) | Server, when the main admin is locked out |

Deploying: `docs/DEPLOYMENT.md` (one long-running server — not serverless; env vars, VPS / Docker / platform, checks, updates, backups).

Environment variables: see `.env.example` (MongoDB, `PAYLOAD_SECRET`, `NEXT_PUBLIC_SERVER_URL`, Cloudflare R2 `R2_*`,
`CHAT_MASTER_KEY`).

**`CHAT_MASTER_KEY` — message encryption (critical; full guide: `docs/ENCRYPTION.md`).** Message texts are encrypted at rest (master key → one key per
conversation, see ARCHITECTURE "Message encryption"). The key must be in every environment (local `.env`, production
settings) and **backed up somewhere safe**: losing it makes every stored message text unreadable, for good. Never commit
it, never change it by hand — to change it use `pnpm chat:crypto --rotate` (set `CHAT_MASTER_KEY_OLD` = previous key).
Without it the server keeps working but stores new texts unencrypted (warning in the log).

| `pnpm data:export` | Save the WHOLE database (content, settings, accounts, chat history, encryption keys) into `seed-data/snapshot/` (git-ignored — personal data). Files stay on R2 | Before moving to a new database (`docs/MOVING-DATA.md`) |
| `pnpm seed` on an empty database | Restores `seed-data/snapshot/` when present (needs the same `CHAT_MASTER_KEY`); `pnpm seed --restore --yes` replaces a non-empty database's data | Moving / resetting a database |
| `pnpm chat:crypto` | Status of message encryption; `--encrypt [--dry-run]` encrypts plain texts, `--decrypt` reverts, `--rotate` re-locks the conversation keys after changing the master key | After restoring an old backup, before removing the feature, when changing the master key |

## 6. How to continue
1. Read `docs/PROGRESS.md` → find the first unchecked item.
2. Read the matching section of the prototype (map in `docs/ARCHITECTURE.md` §6).
3. Write code, type-check with tsc, append a dated entry to `docs/PROGRESS.md` (what changed, what the owner must run).
4. Ask the owner to run `pnpm dev` and report errors when a step needs runtime verification.
