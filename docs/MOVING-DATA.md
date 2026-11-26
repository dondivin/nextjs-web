# Moving the data to a new database

The whole database can be saved into a **snapshot** and restored on a new database with `pnpm seed`.
Everything comes back exactly as it was: same ids, dates and links between records.

## What is in the snapshot

**Everything stored in the database**: partners and their themes, all texts and languages, site and chat settings,
matches, wallpapers, stickers, member roles, groups and channels, team accounts and members (with their password
hashes — people keep their passwords), chat messages and replies, receipts, reports, chat requests, password-reset
requests, and the chat's encryption keys (in their locked form).

**Not in the snapshot: files.** Images, wallpapers, stickers, chat pictures and voice messages live on **Cloudflare R2**;
the database only points at them. The new server must use the **same R2 settings** (`R2_*` variables) so the files keep
working. Don't delete or empty the bucket.

Left out on purpose: temporary bookkeeping (`payload-locked-documents`, `payload-kvs`).

## 1. Save the snapshot (on the current machine)

```bash
pnpm data:export
```

It writes `seed-data/snapshot/` (one file per collection + `manifest.json` with the date, the counts and the
fingerprint of the master key). The previous snapshot is kept as `seed-data/snapshot-previous/`. A few seconds for
thousands of messages; around 2–3 MB today.

> `seed-data/` is **git-ignored** and must never be committed: it contains e-mails, password hashes and private
> messages. Move it like a secret (encrypted drive, password manager attachment…), and delete copies you no longer need.

## 2. Restore it on the new database

1. Put the `seed-data/snapshot/` folder in the project folder on the machine that will run the restore.
2. In `.env`, set:
   - `DATABASE_URL` = the **new, empty** database;
   - `CHAT_MASTER_KEY` = **the same master key** as the old server (the restore checks it — see below);
   - the same `R2_*` values (files);
   - `PAYLOAD_SECRET`: the same value keeps people signed in; a new value just signs everyone out (passwords still work).
3. Run:
   ```bash
   pnpm seed
   ```
   On an empty database it restores the snapshot, then adds any texts that newer code needs. You'll see:
   `[seed] restored 5254 documents in 24 collections from the snapshot of …`
4. Start the site (`pnpm dev`, or deploy). Done.

The new database can be anywhere (MongoDB Atlas, another server…): the restore can be run from your own computer with
`DATABASE_URL` pointing at it — the snapshot doesn't need to be on the hosting.

The server also runs the seed automatically when it starts (unless `OC_AUTO_SEED=false`), so starting the site on an
empty database with a `seed-data/snapshot/` folder present restores it too.

## Replacing the data of a database that isn't empty

`pnpm seed` never overwrites existing data: on a database that already has data it only adds missing texts. To replace
the data with the snapshot on purpose (for example to reset a test database):

```bash
pnpm seed --restore --yes
```

Every collection in the snapshot is **emptied and reloaded**. Take a backup first if you might need what's there.

## The encryption key (important)

Message texts are encrypted (see `docs/ENCRYPTION.md`); the snapshot copies them still encrypted. The new server must
have the **same `CHAT_MASTER_KEY`**, otherwise the restore stops before writing anything:

```
The snapshot's messages are encrypted with master key 4e3c452c, but this server has 2a2ee227.
Set the same CHAT_MASTER_KEY (see docs/ENCRYPTION.md) and run again.
```

The 8-character code is the key's fingerprint (not the key). `pnpm chat:crypto` shows the fingerprint of the key a
server has. If you want the new server to use a **different** key, restore with the old key first, then follow
"Changing the master key" in `docs/ENCRYPTION.md`.

## Quick reference

| Command | What it does |
|---|---|
| `pnpm data:export` | Save the whole database into `seed-data/snapshot/` |
| `pnpm seed` | Empty database + snapshot present → restore it; otherwise only add missing texts |
| `pnpm seed --restore --yes` | Replace this database's data with the snapshot |
| `pnpm chat:crypto` | Show the master key fingerprint (must match the snapshot's) |

Optional: `OC_SNAPSHOT_DIR` in `.env` to keep snapshots in another folder (default `seed-data/snapshot`).

## Troubleshooting

| Message | What to do |
|---|---|
| "No snapshot in …" | Run `pnpm data:export` on the source machine and copy `seed-data/snapshot/` here |
| "The database already has data in: …" | You are not on an empty database. Check `DATABASE_URL`, or use `pnpm seed --restore --yes` to replace it |
| "…encrypted with master key X, but this server has Y" | Set the old server's `CHAT_MASTER_KEY` and run again |
| Pictures don't show after the move | The new server's `R2_*` settings differ from the old one's — use the same bucket |
| The data went into a database called `test` (Atlas) | `DATABASE_URL` has no database name: add `/oddsclub` before the `?` (`…mongodb.net/oddsclub?retryWrites=true&w=majority`), run `pnpm seed` again, then delete `test` in Atlas |
| "The database already has data" right after creating it | The server was started first and filled it with the default content. Restore **before** starting the server, or use `pnpm seed --restore --yes` |
| Everyone has to sign in again | `PAYLOAD_SECRET` changed — expected; passwords are unchanged |
