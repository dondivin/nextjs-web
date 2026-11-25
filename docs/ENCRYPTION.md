# Message encryption — how it works and how to operate it

The text of every chat message is **encrypted in the database**. This page explains what is protected, how the keys
work, and every operation you may need: setting it up, encrypting, decrypting, changing the key, recovering.

> **The one rule:** keep a safe backup of `CHAT_MASTER_KEY`. If it is lost, every stored message text becomes
> unreadable — permanently. Nobody (including the developers) can recover it.

---

## 1. What is encrypted

| Where | What |
|---|---|
| Messages (`chat-messages`) | the message text |
| Replies (`chat-messages.reply`) | the copy of the quoted text kept inside a reply |
| Reports (`chat-reports`) | the snapshot of the reported message's text |
| Private chat requests (`chat-requests`) | the short note sent with a request |

**Not encrypted:** pictures and voice messages (files on Cloudflare R2), names, e-mails, room names and descriptions,
and anything outside the chat.

## 2. How it works (in short)

Two levels of keys — "envelope encryption":

```
CHAT_MASTER_KEY                 lives only in the server's environment (.env / hosting settings), never in the database
   └─ locks → one key per conversation   stored in the database (collection chat-keys), ONLY in locked form
                 └─ encrypts → that conversation's texts
```

- A **conversation** is the lounge, each match room, each group or channel, each private chat, each help chat with
  the team. Its key is created automatically the first time someone writes in it.
- Algorithm: **AES-256-GCM**. Every text gets a fresh random value (the same message encrypted twice looks different),
  and any change to stored data is detected.
- Each text is tied to its conversation: copied into another conversation, it can't be read there.
- In the database a text looks like `enc:v2:86cd9aad:hWPP9Ufx….NjYPcI….95x6lVOF…`.
- Encryption happens when a text is **saved**, decryption when it is **read** (Payload field hooks in
  `src/chat/crypto.ts`). The chat, live updates, history, moderation, the back office and `/cms` all see normal text —
  nothing changes for users or for the team.
- Banned words, length limits and spam rules are checked on the real text, before it is encrypted.

### What it protects — and what it doesn't

| Situation | Protected? |
|---|---|
| Someone gets a copy of the database or a backup | **Yes** — texts and conversation keys are unreadable without the master key |
| One conversation key leaks | Only that conversation is exposed |
| Your own server and team read messages (moderation) | **No, by design** — the server holds the master key |
| Someone steals **both** the database **and** the server's environment settings | **No** — only end-to-end encryption would prevent that |
| Pictures and voice files on R2 | **No** — not covered |

---

## 3. The master key

### Format
32 random bytes, written in base64 (44 characters, usually ending in `=`). Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Where it goes
- **Local development:** in `.env` as `CHAT_MASTER_KEY=…` (`.env` is ignored by git — never commit it).
- **Production:** in the hosting's environment variables (on Vercel: Project → Settings → Environment Variables), with
  the name `CHAT_MASTER_KEY`. Production should have **its own key**, different from the local one.

### Backup — do this now
Store each key (local and production) in a password manager or another safe place, labelled with its environment and
the date. Anyone who has the key **and** a copy of the database can read the messages, so treat it like a password
to everything.

### If the key is missing
The site keeps working, but **new texts are stored unencrypted** and the server log shows:
`[chat] CHAT_MASTER_KEY is missing or not 32 bytes (base64): message texts are stored UNENCRYPTED.`
Texts already encrypted read as **"🔒 This message can't be read (encryption key missing)."** until the right key is
back. Nothing is lost while the key is only *missing* — put it back and everything reads again.

---

## 4. The command: `pnpm chat:crypto`

Run it **from the project folder**, on the machine whose `.env` points at the database you want to work on.
It writes straight to the database (no live notifications are sent, "updated at" dates are kept) and can be run more
than once safely: encrypted texts are skipped when encrypting, plain ones when decrypting.

| Command | What it does | Changes data? |
|---|---|---|
| `pnpm chat:crypto` | **Status**: how many texts are encrypted / plain, how many conversation keys, which master key is set | No |
| `pnpm chat:crypto --encrypt --dry-run` | Shows what `--encrypt` would change | No |
| `pnpm chat:crypto --encrypt` | Encrypts every plain text | Yes |
| `pnpm chat:crypto --decrypt --dry-run` | Shows what `--decrypt` would change | No |
| `pnpm chat:crypto --decrypt` | Turns every encrypted text back into plain text | Yes |
| `pnpm chat:crypto --rotate --dry-run` | Shows what `--rotate` would change | No |
| `pnpm chat:crypto --rotate` | Re-locks the conversation keys with a new master key (messages untouched) | Yes (keys only) |

Example status:

```
Texts: 5065 encrypted, 0 plain. Conversation keys: 3. Master key: set (4e3c452c).
```

The value in brackets is the key's **fingerprint** (not the key): use it to check two environments use the key you
think they do.

> Before any command that changes data on production, **take a database backup**.

---

## 5. Encrypting

### A. First time on an environment (e.g. production)
1. Generate a key (section 3) and **back it up**.
2. Add `CHAT_MASTER_KEY` to the environment's settings.
3. Deploy / restart the server. From now on **new** texts are stored encrypted.
4. Encrypt the texts written before:
   ```bash
   pnpm chat:crypto                      # status: how many are plain
   pnpm chat:crypto --encrypt --dry-run  # preview
   pnpm chat:crypto --encrypt            # do it (a few seconds for thousands of messages)
   pnpm chat:crypto                      # check: "0 plain"
   ```
   Until step 4 is done, old plain texts and new encrypted texts live side by side — both read normally.

### B. After restoring an old database backup
The backup may contain plain texts (taken before encryption) or texts encrypted with an older key.
1. `pnpm chat:crypto` — check the counts.
2. If there are plain texts: `pnpm chat:crypto --encrypt`.
3. If texts read "🔒 … can't be read": the backup was encrypted with another master key — put that key in
   `CHAT_MASTER_KEY_OLD` and run `--rotate` (section 7).

---

## 6. Decrypting

Normally **you never need to**: the site decrypts automatically when reading. Turn everything back into plain text only
if you are removing the feature or moving the data to a system that can't use the key.

1. Take a database backup.
2. Make sure the right `CHAT_MASTER_KEY` is set (`pnpm chat:crypto` shows it).
3. Preview, then decrypt:
   ```bash
   pnpm chat:crypto --decrypt --dry-run
   pnpm chat:crypto --decrypt
   ```
4. To stop encrypting new texts afterwards, remove `CHAT_MASTER_KEY` from the environment and restart (the server will
   log the "UNENCRYPTED" warning — that is expected in this case).

If some texts can't be decrypted, the summary says how many: their conversation key was erased (section 8) or they were
encrypted with a key you don't have.

### Reading one message by hand (for a developer)
Everything read through Payload is already decrypted — e.g. in `/cms` (raw data editor) or with the Local API:
```ts
const msg = await payload.findByID({ collection: 'chat-messages', id, overrideAccess: true })   // msg.text is plain
```
Reading MongoDB directly (Compass, `mongosh`) shows the encrypted form — that is expected. To decrypt such a value in a
script, use `decryptText(payload, room, value)` from `src/chat/crypto.ts` (the room is the message's `room` field).

---

## 7. Changing the master key (rotation)

Do this if the key may have leaked, when someone who knew it leaves, or on a schedule. Only the conversation keys are
re-locked — the messages are not touched, so it takes seconds.

1. Take a database backup.
2. Generate a new key and **back it up**.
3. In the environment settings:
   - `CHAT_MASTER_KEY` = the **new** key
   - `CHAT_MASTER_KEY_OLD` = the **previous** key
4. Restart the server (it reads both keys, so nothing is unreadable in between).
5. Re-lock:
   ```bash
   pnpm chat:crypto --rotate --dry-run
   pnpm chat:crypto --rotate
   pnpm chat:crypto          # check: master key fingerprint = the new one
   ```
6. Remove `CHAT_MASTER_KEY_OLD` and restart. Keep the old key's backup until you are sure every environment and backup
   you care about has been rotated (older database backups still need the old key).

---

## 8. Deleting conversations for good ("shredding")

Deleting a conversation's key makes its texts unreadable forever, even in old backups made after encryption.
This happens automatically:
- when a group or channel is **deleted** (from the chat or the back office) — archiving does not delete anything;
- when a member account is deleted **with its messages** (back office → Members → Delete, "also delete their messages")
  — their help chat's key is erased.

There is no undo: once a key is erased, nothing can bring those texts back.

---

## 9. For developers

- Code: `src/chat/crypto.ts` (keys, encrypt / decrypt, field hooks), `src/collections/chat/ChatKeys.ts`,
  `src/scripts/chat-crypto.ts` (the command). Architecture summary: `docs/ARCHITECTURE.md` → "Message encryption".
- A new text field that should be encrypted: add `hooks: encryptedField((doc) => <its conversation's room>)` to the
  field, and make its stored `maxLength` larger than the real limit — Payload validates **after** the hooks, i.e. on the
  longer encrypted value; check the real limit on the plain text before saving.
- Code that writes **straight to MongoDB** (bypassing Payload) must encrypt itself with `encryptText(payload, room, text)`
  — see `src/scripts/seed-chat-load.ts`.
- Message text is never searched in the database. If a feature ever needs to search it, that search can't run in
  MongoDB — it would have to be designed separately.
- Room names used for keys are the stored ones: `lounge`, a match id, `g:<room id>`, `pm:<memberA>_<memberB>`,
  `dm:<member id>`.

## 10. Troubleshooting

| You see | Why | What to do |
|---|---|---|
| Messages show "🔒 This message can't be read (encryption key missing)." | `CHAT_MASTER_KEY` missing or wrong on this server, or that conversation's key was erased | Check `pnpm chat:crypto` (fingerprint); put the right key back and restart. If the key was erased (deleted room / account), the text is gone for good |
| Log: "CHAT_MASTER_KEY is missing or not 32 bytes" | Key not set, or not a 32-byte base64 value | Set a valid key (section 3) and restart |
| Status shows "plain" texts after setting the key | Texts written before the key was set | `pnpm chat:crypto --encrypt` |
| `--rotate` says some keys "could not be opened with either key" | Those keys were locked with a third key you don't have set | Find that key's backup, set it as `CHAT_MASTER_KEY_OLD`, run `--rotate` again |
| Raw database / Compass shows `enc:v2:…` instead of text | Normal — that is the encryption | Read through the site, `/cms` or Payload |
