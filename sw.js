const CACHE = 'souq-shatra-design-v267';
const FIGMA_CORE=['./delivery-zones.js?v=165','./figma-ui.css?v=164','./monochrome.css?v=21','./ui-polish.css?v=3','./laser-theme.css?v=2','./checkout-review.css?v=2','./returns.css?v=1','./people.css?v=2','./settings.css?v=1','./seller-dashboard.css?v=4','./figma-ui.js?v=164','./icons/figma-shatra-logo-transparent-v146.png'];
const CORE = ['./icons/shatra-splash-v175.webp','./icons/shatra-calligraphy-32-v174.png','./icons/shatra-calligraphy-180-v174.png','./icons/shatra-calligraphy-192-v174.png','./icons/shatra-calligraphy-512-v174.png','./delivery-operations.js?v=172','./delivery-operations.css?v=172','./admin-session.js?v=154', './vendor/supabase/supabase-2.117.3.js', './visual-identity.css?v=142', './market-drawer.js?v=139', './icons/shatra-smile-display-v139.png', './icons/shatra-smile-192-v139.png', './icons/shatra-smile-512-v139.png', './professional-login.js?v=140', './whatsapp-login.js?v=2','./chat.js?v=4','./store-explorer.js?v=1','./store-explorer.css?v=1', './market-refinement.css?v=137', './interaction-motion.js?v=139', './product-editor.js?v=110', './vendor/supabase/supabase-2.57.0.js', './product-options.js?v=103', './account-access.js?v=89', './location-picker.js?v=163', './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css', './seller-workspace.js?v=185', './activity-center.js?v=174', './page-navigation.js?v=79','./latin-digits.js?v=2','./avatars.js?v=1', './main-aurora.css?v=172', './main-loading.js?v=155', './aurora-theme.css?v=72', './app-loading.js?v=72', './icons/brand-classic-purple-512-v121.png', './icons/basket-mascot-v69.png', './', './index.html', './buyer-experience.css?v=87', './stable-viewport.css?v=65', './admin.html', './admin-hub.js?v=182', './admin-app.js?v=191', './catalog.html', './preview.html', './preview-lab.js?v=166', './preview-lab.css?v=64','./preview-all.js?v=2', './admin-portal.css?v=66', './admin-whatsapp.css?v=5', './admin-workspace.js?v=181', './catalog-filter.js?v=62', './marketplace.js?v=139', './marketplace.css?v=85', './activity-center.js?v=174', './delivery-workspace.js?v=180', './operations.css?v=170', './demo-lab.js?v=51', './config.js', './product-variants.js?v=111', './product-variants.css?v=110', './category-seeds.js?v=62', './seller-workspace.js?v=185', './seller-records.js?v=63', './seller-workspace.css?v=174', './site-palette.css?v=56', './manifest.webmanifest', './admin-manifest.webmanifest?v=121', './icons/admin-192-v66.png', './icons/admin-512-v66.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE.concat(FIGMA_CORE))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Refresh install metadata instead of retaining an obsolete launch identity.
  if (new URL(request.url).pathname.endsWith('/manifest.webmanifest')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(request, {cache:'no-cache', signal:controller.signal});
        if (!response.ok) throw new Error('Manifest unavailable');
        await cache.put('./manifest.webmanifest', response.clone());
        return response;
      } catch {
        return await cache.match('./manifest.webmanifest') || Response.error();
      } finally {
        clearTimeout(timer);
      }
    })());
    return;
  }

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


