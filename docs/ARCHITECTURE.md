# OddsClub — architecture

## 1. Big picture
```
Browser ──► Next.js 16 (App Router)
             ├─ /[locale]            public site (server component loads data → client component runs the animations)
             ├─ /admin               custom back office (dashboard, moderation, password resets, partners, translations, chat profile)
             ├─ /cms                 Payload's own admin (raw data editor)
             ├─ /[locale]/chat[/room] the chat as a page (same app, opened on the server; rooms: lounge, <matchId>, support, g-<id>, pm-<id>, sup-<id>)
             ├─ /chat-api/stream     live chat feed (Server-Sent Events), one per open tab
             ├─ /chat-api/<action>   chat actions (JSON; pictures/avatars as multipart)
             └─ /api/*               Payload REST (also serves uploaded files: /api/media/file/…, /api/chat-images/file/…)
Payload 3 ──► MongoDB (all content, translations, chat)
          └─► Cloudflare R2 (uploads via @payloadcms/storage-s3; public bucket domain = CDN)
```

## 2. Porting strategy for the prototype (phase 1)
- **CSS**: copied verbatim from the prototype into `src/site/styles/site.css` (imported by the frontend layout).
  Fonts (Anton, Manrope, …) via `next/font/google` or the same Google Fonts link.
- **Markup**: rewritten as JSX in `src/site/components/*`, keeping **every id, class and data-attribute identical**
  to the prototype so the CSS and the behaviour code keep working. Text comes from `t('key')`.
- **Behaviour**: the prototype's vanilla JS is ported into typed ES modules under `src/site/engine/*`
  (one module per prototype section, see §6). A single client component calls `startSite(config)` in `useEffect`
  and its returned `destroy()` on unmount. Libraries are imported from npm instead of `window.*` globals.
- Data the engine used to read from claude.ai (`window.claude` db/room/user) now comes from:
  the `config` object rendered by the server (partners, matches, strings, settings) + our chat API (phase 5).

## 3. Data model (Payload)
### Collections
| slug | purpose | key fields |
|---|---|---|
| `users` | back-office accounts | email, name, roles: owner \| editor \| translator \| moderator |
| `media` | public uploads (Cloudflare R2): avatars, logos | alt |
| `languages` | site languages | code (en, fr…), name, nativeName, dir (ltr/rtl), enabled, isDefault, order |
| `translations` | static UI strings | key (unique, e.g. `hero.headline.1`), namespace, context (help for translators), values: [{locale, value}] |
| `partners` | betting brands + theme | name, slug (used in `#b-slug`), order, active, logo, heroImage (first-screen picture; empty = no picture), promoCode, signupUrl, termsUrl, colors{night,navy,navy2,panel,blue,sky,cta,ink,odds,oddBg,tint,deep,mute,nav}, texts: [{locale, bonus, payments}] |
| `matches` | board + chat rooms | sport, league, home, away, status (upcoming/live/ft), minute, scoreHome, scoreAway, oddsHome, oddsDraw, oddsAway, startsAt, order, active |
| `members` | fan chat accounts (auth: email + password) | displayName (unique, via nameKey), avatar (media) / avatarGradient, color, memberRole (→ member-roles), status (active / muted / banned), mutedUntil, rulesAcceptedAt, lastSeenAt |
| `chat-messages` | messages | room ('lounge' \| match id \| 'dm:<memberId>'), author (member) or staffAuthor (user), text, image (chat-images), reply{id,by,text}, reactions (json), isMod, deleted |
| `chat-images` | pictures sent in the chat (never public: the file URL checks the same rule as the room) | room, thumb (tiny blurred preview data URL, sent inside the message) |
| `chat-requests` | fan → fan private chat consent (one per pair) | pairKey, from, to, status (pending / accepted / declined / blocked), blockedBy, note; messages of an accepted pair: chat-messages room `pm:<idA>_<idB>`, sent only to those two |
| `chat-rooms` | groups & channels (made by the team, or from the chat by a member whose role allows it) | name, description, rules, kind (group / channel), join (open / request / invite), autoAdd, gradient, active, order, createdBy (user) / owner (member), gradient (room colours, from ROOM_COLORS), photo (media, 512 px square), visibility (public / members / hidden) + preview (non-members read before joining; both empty on older rooms → derived from join: invite → hidden, open → preview), mediaView / mediaSave, inviteToken (invite link `/<lang>/chat/join-<token>`; joining by link works even when join = invite); messages: room `g:<id>` |
| `chat-room-members` | memberships | key (`<room>_<member>`), room, member, status (member / requested / invited), admin (co-admin: manages the room, posts in a channel) |
| `member-roles` | what chat members may do (custom roles; one default for new accounts) | name, description, color, isDefault, order, createGroups, createChannels, maxRooms (active rooms owned), sendPictures, privateChats, showBadge |
| `chat-voice` | voice messages (WebM/Opus or MP4/AAC from the browser, same privacy as chat pictures) | room, duration, peaks (40-bar waveform) |
| `chat-keys` | one encryption key per conversation, **stored locked** with `CHAT_MASTER_KEY` (no API / admin access) | room (stored name: lounge, match id, g:…, pm:…, dm:…), wrapped, kv (master key fingerprint) |
| `chat-receipts` | delivered / read positions (one-to-one chats, groups & channels) | key `<room>|<reader>`, room, reader (member id or 'team'), delivered, read (message timestamps) |
| `stickers` | team stickers for the chat's photo editor, for everyone (back office → Stickers) | name, image (media, trimmed WebP ≤ 512 px), active, order |
| `wallpapers` | chat wallpapers people can pick (theme sheet → Wallpaper; back office → Wallpapers) | name, image (media, WebP: photo ≤ 2000 px / ≤ 450 KB, pattern ≤ 600 px), mode (cover / tile), dim (0–70 %), active, order |
| `member-stickers` | personal stickers: a picture someone saved from the photo editor; only they (and the team) can load it | owner (member / team account id), file (WebP ≤ 512 px) |
| `chat-reports` | reports | message, reporter, room, text snapshot, reason, status |
| `password-resets` | "forgot password" requests approved in the back office (no email service) | kind (member / staff), email, member / user, note, status, tokenHash, expiresAt |

Staff in the chat = back-office `users` with role moderator / owner (chat name + avatar on `/admin/profile`).
The **main admin** (oldest `users` account) is protected and is only recoverable with `pnpm admin:reset-password`.
Direct chats are built from `chat-messages` with room `dm:<memberId>` (no separate threads collection).

### Globals
| slug | fields |
|---|---|
| `site-settings` | siteName, defaultPartner, agentName, company/licence line, helpline (localized text) |
| `chat-settings` | slowModeSeconds (5), maxLength (400), rules [{icon, title(localized), body(localized)}], bannedWords [], block links/emails/phones/caps/repeats toggles, scam phrases [] |

### Localized DB content
Content that admins write per item (partner bonus text, chat rules, helpline…) uses a reusable
`localizedText` field = array of `{ locale, value }`. Static UI strings live in `translations`.
Resolution order everywhere: requested locale → default language → seeded English fallback → the key itself.

## 4. i18n design
- Routes: `/[locale]/…` (e.g. `/en`, `/fr`). `src/proxy.ts` redirects `/` to the visitor's saved/negotiated locale.
- Server: `getDictionary(locale)` loads all translations for that locale (cached with `unstable_cache`, tag `i18n`;
  Payload `afterChange` hooks on `translations`/`languages` call `revalidateTag('i18n')`).
- `t(key, vars?)` with `{placeholder}` interpolation. Tiny safe markup in values: `**bold**`, `__em__` → rendered as
  React elements (never `dangerouslySetInnerHTML`).
- Dynamic partner tokens inside sentences render as live spans so switching partner updates them without reload:
  `{bookmaker}` → `<span class="js-bookmaker">`, `{code}` → `.js-code`, `{bonus}` → `.js-bonus`, `{payments}` → `.js-pay`.
- The client engine receives the strings it needs (toasts, chat labels, phone screen labels) in `config.strings`.
- Key naming: `section.element[.n]` e.g. `nav.bonus`, `hero.cta.claim`, `chat.rules.title`, `phone.tab.live`.

## 5. Theming
- Each partner's `colors` map to CSS custom properties exactly like the prototype's `brandVars()`:
  `--night --navy --navy-2 --panel --blue --sky --green(cta) --green-ink(ink) --yellow(odds) --odd-bg --tint --deep --mute --nav-bg`.
- Switching partner tweens these variables with GSAP and recolours the 3D phone (`phoneBrand`).
- Chat themes are CSS (`[data-ct="…"]` blocks in site.css); names/descriptions are translation keys.

## 6. Prototype map (`design/prototype/oddsclub-prototype.html`)

> Current state: the whole script is ported into ONE file, `src/site/engine/engine.ts`, in the same order as the prototype
> (sections marked with the same comments). The "Target module" column is the planned split for a later refactor.

| Lines | Section | Target module |
|---|---|---|
| 5–692 | All CSS (site + chat + 8 chat themes, doodle wallpapers inlined) | `src/site/styles/site.css` |
| 694–806 | Canvas, back-to-top, nav, hero, features, join, board, footer markup | `src/site/components/*` |
| 808–884 | Messenger, context menu, rules sheet, theme sheet, toast markup | `src/site/components/chat/*` |
| 896–981 | Boot, Lenis, scroll state, feature callouts, nav state | `engine/core.ts`, `engine/scroll.ts` |
| 983–1007 | Back to top, helpers, storage | `engine/ui.ts`, `engine/util.ts` |
| 1009–1157 | Matches board, sport tabs, ticker (+ admin inline edit) | `engine/board.ts` |
| 1032–1101 | Partners: BRANDS, brandVars, setBrand, pill, hash `#b-id`, copy code | `engine/partners.ts` |
| 1160–1193 | Spring + LiquidPill (Motion) | `engine/springs.ts` |
| 1195–1531 | Chat data, rooms, header, conversation, context menu | `engine/chat/*` |
| 1533–1599 | Message rules check, composer, slow mode | `engine/chat/composer.ts`, `engine/chat/rules.ts` |
| 1601–1673 | Rules sheet, liquid morph open/close, hash routing `#chat-…` | `engine/chat/sheets.ts`, `engine/chat/route.ts` |
| 1676–1721 | Chat themes | `engine/chat/themes.ts` |
| 1728–1795 | claude.ai capability boot (db/user/room) — **replace with our API** | `engine/chat/backend.ts` |
| 1798–2034 | 3D phone (Three.js), screens drawn on canvas, scroll poses, brand flip | `engine/phone3d.ts` |
| 2035–2063 | Drag the phone to switch partner (GSAP Draggable) | `engine/drag.ts` |

## 7. Commands
See `docs/HANDOFF.md` §5 for every command (dev, build, types, seed, recovery).

## 8. Folder layout (target)
```
src/
  app/(frontend)/[locale]/layout.tsx   html/body, fonts, site.css, lang/dir
  app/(frontend)/[locale]/page.tsx     loads data → <Site config/>
  app/(payload)/…                      Payload admin + API (generated)
  proxy.ts                             locale redirect
  collections/  globals/  fields/      Payload schema (fields/localizedText.ts)
  i18n/                                getDictionary, t, rich text renderer, locale utils
  site/components/                     JSX markup (ids/classes = prototype)
  site/engine/                         ported behaviour modules
  site/styles/site.css                 prototype CSS
  seed/                                seed script: languages, translations (en + fr), partners, matches, settings
  chat/                                live chat server: hub (SSE), data, service (rules + actions), hooks, avatars, gradients
  app/chat-api/                        chat routes (stream + actions)
  app/(backoffice)/ + backoffice/      custom back office
  scripts/                             server commands (reset-password)
docs/  design/prototype/
```


## Message encryption (at rest)

Operations guide (setup, encrypt, decrypt, key rotation, recovery): `docs/ENCRYPTION.md`.

Envelope encryption, `src/chat/crypto.ts`:
- `CHAT_MASTER_KEY` (server environment only, 32 bytes base64) locks one random 256-bit key per conversation (`chat-keys`,
  created on its first message; only the locked form is stored; kept unlocked in server memory).
- Each conversation's texts are encrypted with its own key: `chat-messages.text`, `chat-messages.reply.text`,
  `chat-reports.messageText` (room of the message), `chat-requests.note` (the private chat `pm:<pairKey>`).
- AES-256-GCM, random IV per value, the conversation bound as additional data (`msg:<room>`, `chatkey:<room>` for the
  locked keys). Stored text: `enc:v2:<key fingerprint>:<iv>.<tag>.<ciphertext>`; anything else is read as old plain text.
- Done by Payload field hooks (`encryptedField`): encrypt in `beforeChange`, decrypt in `afterRead` — so every Payload read
  (chat, live delivery, history, moderation, back office, /cms) sees plain text and nothing else changed. Payload validates
  *after* `beforeChange` hooks, so the stored `maxLength`s are larger; the real limits (chat settings, 140 for request
  notes) are checked on the plain text in the chat service. Code writing straight to MongoDB must call `encryptText`
  (see `seed-chat-load.ts`). Nothing queries message text, so nothing else needed changing.
- Shredding: deleting a room (chat or back office) or an account with its messages deletes the conversation key too
  (`shredRoom`). A text whose key is missing reads as "🔒 This message can’t be read…".
- What it protects: a leaked database or backup (texts and keys are unreadable without the master key). What it does not:
  the server and the team read messages (moderation), and someone with both the database and the server's environment
  could read them — only end-to-end encryption would change that. Pictures / voice files (R2) are not covered.
- Operations: `pnpm chat:crypto` (status · `--encrypt [--dry-run]` · `--decrypt` · `--rotate` with `CHAT_MASTER_KEY_OLD`).
