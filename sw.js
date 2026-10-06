const CACHE = 'souq-shatra-design-v80';
const CORE = ['./seller-workspace.js?v=79', './activity-center.js?v=79', './page-navigation.js?v=79', './main-aurora.css?v=80', './main-loading.js?v=76', './aurora-theme.css?v=72', './app-loading.js?v=72', './icons/brand-aurora-v69.png', './icons/basket-mascot-v69.png', './', './index.html', './buyer-experience.css?v=68', './stable-viewport.css?v=65', './admin.html', './admin-hub.js?v=68', './admin-app.js?v=68', './catalog.html', './preview.html', './preview-lab.js?v=65', './preview-lab.css?v=63', './admin-portal.css?v=66', './admin-workspace.js?v=63', './catalog-filter.js?v=62', './marketplace.js?v=62', './marketplace.css?v=57', './activity-center.js?v=58', './delivery-workspace.js?v=58', './operations.css?v=58', './demo-lab.js?v=51', './config.js', './product-variants.js?v=62', './product-variants.css?v=62', './category-seeds.js?v=62', './seller-workspace.js?v=70', './seller-records.js?v=62', './seller-workspace.css?v=57', './site-palette.css?v=56', './manifest.webmanifest', './admin-manifest.webmanifest?v=66', './icons/admin-192-v66.png', './icons/admin-512-v66.png', './icons/splash-s-v28.jpg', './icons/startup-s-v29.png'];

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
      const path=new URL(request.url).pathname;
      const pageKey=path.endsWith('/preview.html')?'./preview.html':path.endsWith('/admin.html')?'./admin.html':path.endsWith('/catalog.html')?'./catalog.html':'./index.html';
      try {
        const response = await fetch(request, {signal: controller.signal, cache:'no-cache'});
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(pageKey, response.clone());
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



