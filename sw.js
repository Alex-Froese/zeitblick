// Zeitblick – Service Worker: Offline-Betrieb und Klicks auf Benachrichtigungen
const VERSION = 'zb-v2.0.0';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css', './vendor/qrcode.js',
  './js/app.js', './js/app-api.js', './js/core.js', './js/store.js', './js/sync.js', './js/ntfy.js', './js/notify.js',
  './js/obsidian.js', './js/audio.js', './js/ui.js', './js/charts.js', './js/editors.js', './js/entities.js', './js/detail.js', './js/recur-ui.js',
  './js/focus-engine.js', './js/demo.js',
  './js/views/common.js', './js/views/cockpit.js', './js/views/inbox.js', './js/views/vorgaenge.js', './js/views/calendar.js', './js/views/matrix.js',
  './js/views/focus.js', './js/views/habits.js', './js/views/notes.js', './js/views/goals.js', './js/views/projects.js', './js/views/life.js',
  './js/views/people.js', './js/views/archive.js', './js/views/guide.js', './js/views/settings.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png', './icons/badge-96.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // APIs (GitHub, ntfy) nie zwischenspeichern
  if (url.hostname.endsWith('github.com') || url.hostname.endsWith('githubusercontent.com') || url.hostname.includes('ntfy')) return;
  const isFont = false;
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !isFont) return;
  if (req.mode === 'navigate') {
    // App-Seite: Cache zuerst (schnell und offline), im Hintergrund aktualisieren
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match('./index.html');
      const net = fetch(req).then(r => { if (r.ok) cache.put('./index.html', r.clone()); return r; }).catch(() => null);
      return cached || (await net) || new Response('Offline', { status: 503 });
    })());
    return;
  }
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(req, { ignoreSearch: sameOrigin });
    const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone()); return r; }).catch(() => null);
    if (cached) { e.waitUntil(net); return cached; }
    const r = await net;
    return r || new Response('', { status: 504 });
  })());
});

self.addEventListener('notificationclick', e => {
  const n = e.notification;
  const data = n.data || {};
  const url = e.action === 'focus' ? (data.focusUrl || data.url) : (data.url || './');
  n.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope)) {
        await c.focus();
        c.postMessage({ type: 'open', url });
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
