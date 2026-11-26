# Notifications of new chat messages

People who are signed in can get a notification on their phone or computer when a message arrives for them,
**even when the site is closed** — like WhatsApp. It uses the browsers' standard *Web Push*.

## What notifies whom

| Message | Who gets a notification |
|---|---|
| Private chat | The other person |
| Help chat — a member writes | Every **team account** that turned notifications on |
| Help chat — the team answers | The member |
| Group / channel | Its members, unless they **muted** that group (group info → *Mute notifications*) |
| A reply to your message (any room, also the lounge and match rooms) | You — even in a muted group |
| Lounge and match rooms otherwise | Nobody (too busy) |

Nobody is notified for a conversation they are looking at right now. Messages from the same conversation replace each
other (one notification per conversation). Tapping it opens that conversation.

The notification shows the sender (or the group) and the message text, like WhatsApp. Each person can switch the
text off (account panel → *Show the message text*): then it says only "New message". Photos show as "📷 Photo",
voice messages as "🎤 Voice message".

## For people using the chat

- A card in the room list offers it once (**Turn on** / **Not now** — shown again after two weeks), and the account
  panel has an on/off switch.
- The browser asks "Allow notifications?" the first time. If they refused, the switch explains how to allow it again.
- **Android, computers:** works in Chrome, Edge, Firefox, Samsung Internet, Safari on Mac.
- **iPhone / iPad (iOS 16.4+):** only when the site is added to the Home Screen (Share → *Add to Home Screen*) and
  opened from there — Apple's rule. The card and the switch say so on iPhone.
- Signing out turns notifications off on that device.

## Setting it up (server)

1. The package: `pnpm add web-push` (+ `pnpm add -D @types/web-push`).
2. A key pair (VAPID), once: `pnpm exec web-push generate-vapid-keys`, then in `.env` and on the hosting:
   ```
   VAPID_PUBLIC_KEY=…
   VAPID_PRIVATE_KEY=…        # secret — never commit it
   VAPID_SUBJECT=mailto:you@yourdomain   # optional
   ```
   Use the **same pair** everywhere the same database is used: subscriptions are made for one public key. Changing it
   later means everyone has to turn notifications on again.
3. Redeploy. Without the keys, notifications are off and the chat doesn't offer them.
4. Must be served over **https** (Render is). On `localhost` it works for testing too.

## How it works (for developers)

| Part | File |
|---|---|
| Devices that asked (endpoint + keys, account, language) | `src/collections/chat/PushSubscriptions.ts` (`push-subscriptions`, server-only) |
| Settings per account (text on lock screen, muted groups) | `pushPreview` / `pushMuted` on `members` and `users` (hidden fields) |
| Who to notify + sending | `src/chat/push.ts` (`pushForMessage`, called after every saved message in `createMessage`) |
| API | `push-subscribe`, `push-unsubscribe`, `push-prefs` in `src/app/chat-api/[action]/route.ts` → `src/chat/service.ts` |
| Showing the notification, opening the conversation | `public/sw.js` (service worker) |
| Switch, card, mute, sign-out | `src/site/engine/chatBackend.ts` (search "Web Push") |

- "Looking at it right now" = a connected tab whose presence is that room; a hidden tab reports no room.
- The push content is encrypted for the device (the push services of Google / Apple / Mozilla can't read it). It is
  sent *after* the message is saved, in the background — it never slows the sender down.
- A device the browser says is gone (404 / 410) is removed automatically.
- The database snapshot (`pnpm data:export`) includes `push-subscriptions`; after a move with the same VAPID keys, the
  devices keep working.
