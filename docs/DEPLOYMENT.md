# Deploying OddsClub

How to put the site, the back office and the chat online, and keep them running. Read section 1 first: it decides
where the site can be hosted.

Related guides: `docs/MOVING-DATA.md` (bring your current data), `docs/ENCRYPTION.md` (the chat's encryption key).

---

## 1. Two things to know first

**1. The site must run as ONE long-running server.**
The live chat (new messages, who is online, typing, ticks) keeps its connections in the server's memory. So:
- run **one instance** — no auto-scaling to several copies (messages would only reach people connected to the same
  copy);
- use a host that keeps the process running: a VPS, Docker, or a platform like Railway, Render, Fly.io or DigitalOcean
  App Platform.

**Not Vercel or other serverless hosting.** There, every request may land on a different short-lived copy and
long connections are cut: the chat would stop being live. (Moving to several instances later is possible but needs
code changes — a shared message bus such as Redis.)

**2. Files stay on Cloudflare R2.** Images, wallpapers, stickers, chat pictures and voice messages are stored in your
R2 bucket, not on the server. The server's disk can be thrown away at any time; nothing is lost.

## 2. What you need

| | Notes |
|---|---|
| A server or platform | 1 instance, **2 GB RAM minimum** (4 GB if you build on it), Node **22.23.5 or newer** (or 24 / 26), pnpm 10 |
| MongoDB | A managed database is easiest, e.g. **MongoDB Atlas** (backups and disk encryption included). Same region as the server |
| Cloudflare R2 | The bucket you use today (`R2_*` values from your `.env`) |
| A domain | e.g. `oddsclub.example`, with **HTTPS** (required: sign-in cookies and the microphone need it) |
| Your current data (optional) | A snapshot made with `pnpm data:export` (see section 5) |

## 3. Environment variables

Set these in the platform's settings (or a `.env` file on a VPS). Never commit them.

| Variable | Required | Value |
|---|---|---|
| `DATABASE_URL` | yes | MongoDB connection string, e.g. `mongodb+srv://user:pass@cluster.mongodb.net/oddsclub` |
| `PAYLOAD_SECRET` | yes | Long random string: `openssl rand -hex 32`. Signs sign-in sessions — changing it later signs everyone out |
| `NEXT_PUBLIC_SERVER_URL` | yes | The public address, `https://…`, **no trailing slash**. Used for links, invite links, share images, sitemap |
| `CHAT_MASTER_KEY` | yes | Encrypts chat texts (`docs/ENCRYPTION.md`). **Same key as the database's data** if you restore a snapshot; else a new one: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Back it up** |
| `R2_ACCOUNT_ID` `R2_BUCKET` `R2_ACCESS_KEY_ID` `R2_SECRET_ACCESS_KEY` | yes | Same as today |
| `R2_PUBLIC_URL` | recommended | The bucket's custom domain (e.g. `https://media.oddsclub.example`) — images then come from Cloudflare's CDN |
| `OC_AUTO_SEED` | no | Leave unset: on start the server adds any texts that new code needs. `false` turns that off |
| `NODE_ENV` | — | `production` (platforms and `pnpm start` set it) |

### MongoDB Atlas: user, password and `DATABASE_URL`

The database user and password are not separate settings — they are part of `DATABASE_URL`.

1. **Security → Database Access → Add New Database User**: method *Password*, a username (e.g. `oddsclub-app`),
   *Autogenerate Secure Password* (copy it), role *Read and write to any database* (or only the `oddsclub` database).
2. **Security → Network Access → Add IP Address**: the server's public IP. Platforms without a fixed IP: `0.0.0.0/0`
   (any address — the password still protects it). Add your own computer's IP too, to restore the snapshot from it.
3. **Database → your cluster → Connect → Drivers**: copy the connection string.
4. Fill in the user and password and **add the database name before `?`**:
   ```
   DATABASE_URL=mongodb+srv://oddsclub-app:YourPassword@cluster0.abcde.mongodb.net/oddsclub?retryWrites=true&w=majority
   ```
   Without `/oddsclub` the data lands in a database called `test`. Special characters in the password
   (`@ : / ? # [ ] %`) must be URL-encoded (`@` → `%40`) — or generate a password with letters and numbers only.

Without `R2_*` the server would store uploads on its own disk (`./media`) — fine for testing, **not for production**.

## 4. Choose how to run it

### Option A — a VPS (Ubuntu), the most control

```bash
# once: Node 22 + pnpm
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
sudo corepack enable && corepack prepare pnpm@10.33.0 --activate

# the code
git clone <your repository> oddsclub && cd oddsclub
cp .env.example .env && nano .env        # fill in section 3
pnpm install --frozen-lockfile
pnpm build                                # ~20 s; needs ~4 GB RAM (else build elsewhere or add swap)
```

Keep it running with **pm2** (restarts on crash and on reboot):

```bash
sudo npm i -g pm2
pm2 start "pnpm start" --name oddsclub     # listens on port 3000
pm2 save && pm2 startup                    # follow the printed command
pm2 logs oddsclub                          # logs
```

Put **Nginx** in front for HTTPS (`sudo apt install nginx certbot python3-certbot-nginx`), with
`/etc/nginx/sites-available/oddsclub`:

```nginx
server {
  server_name oddsclub.example;
  client_max_body_size 12m;                       # photos, voice messages, stickers

  location /chat-api/stream {                     # the live chat: one long open connection per visitor
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
  }
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/oddsclub /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d oddsclub.example        # free HTTPS certificate, renews itself
```

### Option B — Docker

The repository's `Dockerfile` builds a production image (configuration is given when the container starts, never
baked in; `.dockerignore` keeps `.env`, `seed-data/` and `node_modules` out).

```bash
docker build -t oddsclub .
docker run -d --name oddsclub --restart unless-stopped -p 3000:3000 --env-file .env.production oddsclub
```

`.env.production` holds the variables of section 3. Run **one** container, behind the same Nginx / HTTPS as option A
(or your platform's proxy). Maintenance commands work inside it: `docker exec -it oddsclub pnpm chat:crypto`.

> The image build hasn't been run on the development machine yet (Docker wasn't running). The build step itself was
> checked: `pnpm build` succeeds with placeholder values and no database. Build the image once before relying on it.

### Option C — a platform (Railway, Render, Fly.io, DigitalOcean App Platform)

| Setting | Value |
|---|---|
| Build command | `pnpm install --frozen-lockfile && pnpm build` (or use the Dockerfile) |
| Start command | `pnpm start` |
| Port | `3000` (or the platform's `PORT`) |
| Node version | 22.23.5+ (`engines` in `package.json`) |
| Instances | **exactly 1**, auto-scaling **off** |
| Health check | `/en` |
| Environment | section 3 |

Long open connections are fine on these platforms (the chat sends a small "ping" every 20 seconds, which keeps them
open through proxies). Add your domain in the platform; it provides HTTPS.

## 5. The database: start fresh or bring your data

**Bring your current data (recommended)** — everything, including accounts and chat history:
1. On your computer: `pnpm data:export` (→ `seed-data/snapshot/`).
2. Still on your computer, point `.env`'s `DATABASE_URL` at the **new, empty production database** (keep the same
   `CHAT_MASTER_KEY` and `R2_*`), then run `pnpm seed`. It restores the snapshot.
3. Put `DATABASE_URL` back to your local database.
4. Production must use that **same `CHAT_MASTER_KEY`** (section 3).

Details and troubleshooting: `docs/MOVING-DATA.md`.

**Start fresh** — an empty database: the server fills in the default content (languages, texts, demo partners, chat
rules) on its first start. Then open `https://<your domain>/admin`: on an empty database the sign-in page offers to
**create the first team account**.

## 6. After the first deploy — check

- [ ] `https://<domain>/` opens the site in the right language; the partner switcher, pictures and hero images show.
- [ ] `/admin` — sign in (or create the first account); open Partners, Translations, Groups & channels.
- [ ] Chat: open it, sign in as a member, send a message, open a second browser — it arrives **live**, ticks change.
- [ ] Send a picture and a voice message (uploads + R2 work; microphone works only on HTTPS).
- [ ] `pnpm chat:crypto` (on the server / in the container) shows `Master key: set` and `0 plain`.
- [ ] Logs show no `CHAT_MASTER_KEY is missing` and no R2 errors.
- [ ] Optional cleanup: delete `src/app/my-route/` (the template's example route, still answering at `/my-route`).
- [ ] Optional: e-mail isn't configured — "forgot password" requests are handled by the team in the back office
      (Password resets); Payload's own e-mails only go to the log.

## 7. Updating to a new version

```bash
git pull
pnpm install --frozen-lockfile
pnpm build
pm2 restart oddsclub            # or: docker build … && docker rm -f oddsclub && docker run …  / or the platform redeploys
```

On start the server adds any new texts automatically (your back-office edits are never overwritten). People connected
to the chat reconnect by themselves after a few seconds.

## 8. Backups

| What | How |
|---|---|
| Database | Atlas: automatic backups (check the plan). Self-hosted: `mongodump --uri "$DATABASE_URL" --out backup-$(date +%F)` daily |
| Everything in one go | `pnpm data:export` (a full snapshot, restorable with `pnpm seed` — `docs/MOVING-DATA.md`) |
| Files | They are on R2 — keep the bucket; optionally enable R2's object versioning / lifecycle rules |
| Secrets | `CHAT_MASTER_KEY`, `PAYLOAD_SECRET`, `R2_*`, `DATABASE_URL` in a password manager. **Without `CHAT_MASTER_KEY` a database backup's chat texts can't be read** |

## 9. Troubleshooting

| Symptom | Likely cause → fix |
|---|---|
| Chat messages appear only after a reload | The proxy buffers the live connection → Nginx `proxy_buffering off` on `/chat-api/stream` (section 4); or several instances are running → set exactly 1 |
| "Connecting…" forever in the chat | The live connection is blocked or cut → check the proxy timeout (≥ 1 h) and that `/chat-api/stream` reaches the app |
| Uploading a photo / voice message fails | Body size limit at the proxy → `client_max_body_size 12m` |
| Pictures don't load | `R2_*` / `R2_PUBLIC_URL` wrong, or a different bucket than the data refers to |
| Messages show "🔒 This message can't be read" | `CHAT_MASTER_KEY` missing or not the key the data was encrypted with (`docs/ENCRYPTION.md`) |
| Everyone was signed out | `PAYLOAD_SECRET` changed — expected; passwords are unchanged |
| Invite links / share images point to localhost | `NEXT_PUBLIC_SERVER_URL` not set to the public `https://` address (then restart — it's read when the server runs, no rebuild needed) |
| WhatsApp / Facebook link preview has no logo | Set `NEXT_PUBLIC_SERVER_URL`, redeploy, then share a **new** link (WhatsApp caches a preview per link for a while — adding `?x=1` gives a fresh one). If the logo still doesn't load, the server log shows a line starting with `[brand]` with the reason |
| Microphone button missing / not working | The site isn't on HTTPS |
| `pnpm build` killed / out of memory | Build on a machine with ≥ 4 GB RAM (add swap on a small VPS), or build the Docker image elsewhere |
