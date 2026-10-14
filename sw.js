// سوق الشطرة service worker: network-first pages, cache-first static assets, never caches API calls.
const VERSION = 'souq-v2-2';
const SHELL = ['./', './index.html', './admin.html', './manifest.webmanifest', './app/styles/app.css', './app/main.js', './vendor/supabase/supabase-2.117.3.js', './icons/shatra-calligraphy-192-v174.png', './icons/shatra-calligraphy-512-v174.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
// Removes the previous site's caches (souq-shatra-design-v*) as well.
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const fresh = req.mode === 'navigate' || /\.(js|css|html|webmanifest)$/.test(url.pathname);
  e.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      if (fresh) {
        try {
          const res = await fetch(req, { cache: 'no-cache' });
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return (await cache.match(req)) || (req.mode === 'navigate' && (await cache.match('./index.html'))) || new Response('غير متصل بالإنترنت', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }
      }
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })(),
  );
});
