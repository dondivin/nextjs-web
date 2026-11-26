/*
 * OddsClub service worker: shows notifications of new chat messages, also when the site is closed (Web Push).
 * The server (src/chat/push.ts) sends { title, body, tag, url, icon, ts }. One notification per conversation (`tag`):
 * a newer message replaces the older one, like WhatsApp. Tapping it opens that conversation — in the tab that is
 * already open when there is one.
 * Nothing is cached here: this file only handles notifications.
 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch (err) { d = { title: 'OddsClub', body: e.data ? e.data.text() : '' } }
  e.waitUntil((async () => {
    // that conversation is open and on screen in a tab: no need to show it
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (d.url && wins.some((w) => w.visibilityState === 'visible' && w.focused && new URL(w.url).pathname === d.url)) return
    await self.registration.showNotification(d.title || 'OddsClub', {
      body: d.body || '',
      icon: d.icon || '/brand/icon/192',
      tag: d.tag || undefined,
      renotify: !!d.tag,
      timestamp: d.ts || Date.now(),
      data: { url: d.url || '/' },
    })
  })())
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const win = wins.find((w) => new URL(w.url).origin === self.location.origin)
    if (win) {
      // the site is open: bring it forward and let it open the conversation (no reload)
      try { await win.focus() } catch (err) {}
      win.postMessage({ type: 'oc-open', url })
      return
    }
    await self.clients.openWindow(url)
  })())
})
