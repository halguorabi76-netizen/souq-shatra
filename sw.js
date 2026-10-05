const CACHE = 'souq-shatra-design-v45';
const CORE = ['./', './index.html', './admin.html', './admin-portal.css?v=45', './demo-lab.js?v=31', './config.js', './seller-workspace.js?v=41', './seller-records.js?v=40', './seller-workspace.css?v=40', './site-palette.css?v=43', './manifest.webmanifest', './icons/splash-s-v28.jpg', './icons/startup-s-v29.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const pageKey=new URL(request.url).pathname.endsWith('/admin.html')?'./admin.html':'./index.html';
      try {
        const response = await fetch(request, {signal: controller.signal});
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put('./index.html', './admin.html', './admin-portal.css?v=45', response.clone());
        }
        return response;
      } catch {
        return await caches.match(pageKey) || new Response('تعذّر الاتصال. أعد المحاولة عند توفر الإنترنت.', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}});
      } finally {
        clearTimeout(timer);
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      event.waitUntil(cache.put(request, response.clone()));
    }
    return response;
  })());
});





