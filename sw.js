const CACHE = 'souq-shatra-design-v120';
const CORE = ['./manifest.webmanifest?v=120', './boutique-theme.css?v=120', './boutique-presentation.js?v=120', './buyer-voice.js?v=120', './icons/brand-purple-v120.png', './icons/brand-purple-192-v120.png', './icons/brand-purple-512-v120.png', './product-editor.js?v=110', './vendor/supabase/supabase-2.57.0.js', './product-options.js?v=103', './account-access.js?v=89', './location-picker.js?v=87', './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css', './seller-workspace.js?v=120', './activity-center.js?v=110', './page-navigation.js?v=79', './main-aurora.css?v=100', './main-loading.js?v=76', './aurora-theme.css?v=72', './app-loading.js?v=72', './icons/brand-aurora-v69.png', './icons/basket-mascot-v69.png', './', './index.html', './buyer-experience.css?v=87', './stable-viewport.css?v=65', './admin.html', './admin-hub.js?v=120', './admin-app.js?v=120', './catalog.html', './preview.html', './preview-lab.js?v=109', './preview-lab.css?v=63', './admin-portal.css?v=66', './admin-workspace.js?v=109', './catalog-filter.js?v=62', './marketplace.js?v=120', './marketplace.css?v=85', './activity-center.js?v=110', './delivery-workspace.js?v=109', './operations.css?v=110', './demo-lab.js?v=51', './config.js', './product-variants.js?v=120', './product-variants.css?v=110', './category-seeds.js?v=62', './seller-workspace.js?v=120', './seller-records.js?v=62', './seller-workspace.css?v=81', './site-palette.css?v=56', './manifest.webmanifest', './admin-manifest.webmanifest?v=66', './icons/admin-192-v66.png', './icons/admin-512-v66.png', './icons/splash-s-v28.jpg', './icons/startup-s-v29.png'];

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

