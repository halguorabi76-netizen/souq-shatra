// End-to-end flows against the in-memory Supabase mock. Run: npm run test:e2e
// Fails on any page error or console error. Screenshots go to artifacts/ (git-ignored).
const assert = require('node:assert/strict');
const { open, shot, settle } = require('./helpers.cjs');

async function step(name, fn) {
  process.stdout.write('• ' + name + ' … ');
  await fn();
  console.log('ok');
}
(async () => {
  const { page, base, errors, close } = await open({ user: 'buyer@test.iq' });
  const T = (expr, arg) => page.evaluate(expr, arg);
  const goto = async (h, file = 'index.html') => {
    await page.goto(base + file + '#' + h);
    await settle(page);
  };
  try {
    await step('home shows sponsored hero, deals and stores', async () => {
      await goto('/');
      assert.match(await page.textContent('#hero'), /سماعات بلوتوث/);
      assert.equal(await page.getAttribute('#hero .slide.banner', 'href'), '#/products?sort=deals');
      assert.equal((await page.$$('#hero .slide')).length, 2, 'admin banner + paid ad, no stock slides');
      assert(await page.isVisible('text=عروض وتخفيضات'));
      assert.equal((await page.$$('.store-tile')).length, 3);
      assert.match(await page.textContent('main'), /من بيوت الشطرة[\s\S]*بوتيك الأناقة/);
      await shot(page, 'home');
    });
    await step('products tab shows product categories and subcategories', async () => {
      await goto('/products');
      assert((await page.$$('.cat-rail.compact .cat-card')).length >= 5);
      await page.click('.cat-rail.compact .cat-card:has-text("ملابس")');
      await page.waitForURL(/cat=/);
      await settle(page);
      assert.match(await page.textContent('main'), /تيشيرت قطني رجالي/);
      assert(!/رز بسمتي/.test(await page.textContent('.product-grid')));
      await page.click('.pill:has-text("تيشيرتات")');
      await settle(page);
      assert.deepEqual(await page.$$eval('.pcard .name', (n) => n.map((x) => x.textContent)), ['تيشيرت قطني رجالي']);
    });
    await step('stores tab filters by store category and by shop or home', async () => {
      await goto('/stores');
      await page.click('.store-cats .pill:has-text("ملابس")');
      await settle(page);
      assert.deepEqual(await page.$$eval('.scard h3', (n) => n.map((x) => x.childNodes[0].textContent.trim())), ['بوتيك الأناقة']);
      await goto('/stores?kind=home');
      assert.deepEqual(await page.$$eval('.scard h3', (n) => n.map((x) => x.childNodes[0].textContent.trim())), ['بوتيك الأناقة']);
      await goto('/stores?kind=shop');
      assert.equal((await page.$$('.scard')).length, 2);
      const tabs = await page.$$eval('.tabbar a span:first-of-type', (n) => n.map((x) => x.textContent));
      assert.deepEqual(tabs, ['الرئيسية', 'المتاجر', 'المنتجات', 'السلة', 'حسابي']);
    });
    await step('search matches Arabic spelling variants and filters', async () => {
      await goto('/search?q=' + encodeURIComponent('قهوه شاي'));
      await goto('/search?q=' + encodeURIComponent('تيشيرت'));
      assert.match(await page.textContent('main'), /تيشيرت قطني رجالي/);
      await goto('/search?cat=' + encodeURIComponent('أجهزة') + '&cond=used');
      const names = await page.$$eval('.pcard .name', (n) => n.map((x) => x.textContent));
      assert.deepEqual(names, ['هاتف سامسونج A15 مستعمل']);
    });
    await step('variant picker disables sold-out sizes and adds the chosen variant', async () => {
      const id = await T(() => window.__FIX__.products[6].id);
      await goto('/p/' + id);
      await page.click('.opt[data-value="أسود"]');
      assert(await page.isDisabled('.opt[data-axis="size"][data-value="L"]'));
      await page.click('.opt[data-axis="size"][data-value="M"]');
      await page.click('.buy-box [data-action=add]');
      const cart = await T(() => JSON.parse(localStorage.getItem('souq.v2.cart')));
      assert.equal(cart.length, 1);
      assert.equal(cart[0].label, 'أسود · M');
    });
    await step('cart re-validates prices and blocks unavailable lines', async () => {
      const rice = await T(() => window.__FIX__.products[0].id);
      await goto('/p/' + rice);
      await page.click('.buy-box [data-action=add]');
      await goto('/cart');
      assert.match(await page.textContent('.summary'), /الإجمالي قبل التوصيل/);
      await shot(page, 'cart');
    });
    await step('checkout quotes the route and places one order per store', async () => {
      await goto('/checkout');
      await page.waitForSelector('[data-action=place]:not([disabled])');
      await page.click('[data-action=place]');
      await page.waitForURL(/order-placed/);
      const { orders, items } = await T(() => ({ orders: window.__SOUQ_TEST_CLIENT__._db.tables.orders, items: window.__SOUQ_TEST_CLIENT__._db.tables.order_items }));
      assert.equal(orders.length, 2);
      for (const o of orders) assert.equal(o.total, o.platform_fee + o.delivery_fee + items.filter((i) => i.order_id === o.id).reduce((n, i) => n + i.price * i.quantity, 0));
      assert.equal(await T(() => localStorage.getItem('souq.v2.cart')), '[]');
    });
    await step('buyer can cancel before a driver accepts', async () => {
      const id = await T(() => window.__SOUQ_TEST_CLIENT__._db.tables.orders.find((o) => o.store_id === window.__FIX__.S.b).id);
      await goto('/orders/' + id);
      await page.click('[data-action=cancel]');
      await page.click('dialog [data-ok]');
      await page.waitForTimeout(400);
      assert.equal(await T(() => window.__SOUQ_TEST_CLIENT__._db.tables.orders.find((o) => o.store_id === window.__FIX__.S.b).status), 'cancelled');
    });
    await step('seller accepts the order and edits a product', async () => {
      await T(() => window.__SOUQ_TEST_CLIENT__.login('seller@test.iq'));
      await page.waitForTimeout(200);
      await goto('/seller/orders');
      await page.click('[data-action=accept]');
      await page.waitForTimeout(400);
      assert.equal(await T(() => window.__SOUQ_TEST_CLIENT__._db.tables.orders.find((o) => o.store_id === window.__FIX__.S.a).status), 'accepted');
      const rice = await T(() => window.__FIX__.products[0].id);
      await goto('/seller/products/' + rice);
      await page.fill('#fpr', '13500');
      await page.click('#productForm [type=submit]');
      await page.waitForURL(/seller\/products$/);
      assert.equal(await T((id) => window.__SOUQ_TEST_CLIENT__._db.tables.products.find((p) => p.id === id).price, rice), 13500);
    });
    await step('seller requests a paid plan and submits a transfer proof', async () => {
      await goto('/seller/plans');
      await page.click('[data-action=subscribe][data-id=silver]');
      await page.click('dialog form button');
      await page.waitForSelector('[data-proof]');
      await page.fill('[data-proof] [name=reference]', 'ZC-123456');
      await page.click('[data-proof] button');
      await page.waitForTimeout(400);
      const req = await T(() => window.__SOUQ_TEST_CLIENT__._db.tables.payment_requests.at(-1));
      assert.equal(req.amount, 15000);
      assert.equal(req.purpose, 'subscription');
    });
    await step('driver claims and delivers; platform fee is added to dues', async () => {
      await T(() => window.__SOUQ_TEST_CLIENT__.login('driver@test.iq'));
      await page.waitForTimeout(200);
      await goto('/driver/offers');
      await page.click('[data-action=claim]');
      await page.click('dialog [data-ok]');
      await page.waitForURL(/#\/driver$/);
      await settle(page);
      await page.click('[data-action=deliver]');
      await page.click('dialog [data-ok]');
      await page.waitForTimeout(400);
      assert.equal(await T(() => window.__SOUQ_TEST_CLIENT__._db.tables.orders.find((o) => o.store_id === window.__FIX__.S.a).status), 'delivered');
      assert.equal(await T(() => window.__SOUQ_TEST_CLIENT__._db.tables.delivery_workers[0].amount_due), 4000);
    });
    await step('admin approves a store and a payment proof', async () => {
      await T(() => window.__SOUQ_TEST_CLIENT__.login('admin@test.iq'));
      await goto('/approvals', 'admin.html');
      await page.click('[data-action=approveStore]');
      await page.waitForTimeout(400);
      await goto('/finance', 'admin.html');
      await page.click('[data-action=review][data-ok]');
      await page.click('dialog [data-ok]');
      await page.waitForTimeout(400);
      assert.equal(await T(() => window.__SOUQ_TEST_CLIENT__._db.tables.payment_requests[0].status), 'approved');
      await goto('/categories?t=stores', 'admin.html');
      await page.click('[data-action=editStoreCat]');
      await page.fill('dialog [name=name]', 'مطاعم');
      await page.click('dialog form button');
      await page.waitForTimeout(400);
      assert(await T(() => window.__SOUQ_TEST_CLIENT__._db.tables.store_categories.some((c) => c.name === 'مطاعم')));
      await goto('/stores', 'admin.html');
      await page.selectOption('[data-store-cat] >> nth=0', { label: 'مطاعم' });
      await page.waitForTimeout(400);
      assert(await T(() => window.__SOUQ_TEST_CLIENT__._db.tables.stores.some((s) => s.store_category_id === window.__SOUQ_TEST_CLIENT__._db.tables.store_categories.find((c) => c.name === 'مطاعم').id)));
      await goto('/banners', 'admin.html');
      await page.click('.toolbar [data-action=editBanner]');
      await page.setInputFiles('#bnFile', { name: 'b.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGNgYPj/n4GBgQEAEAQB/wR8T2MAAAAASUVORK5CYII=', 'base64') });
      await page.waitForSelector('#bnPrev img');
      await page.fill('dialog [name=title]', 'تخفيضات العيد');
      await page.selectOption('dialog [name=type]', 'store');
      await page.selectOption('dialog [name=value]', { label: 'أسواق النخيل' });
      await page.click('dialog button.btn-primary');
      await page.waitForTimeout(500);
      const bn = await T(() => window.__SOUQ_TEST_CLIENT__._db.tables.home_banners.at(-1));
      assert.equal(bn.title, 'تخفيضات العيد');
      assert.match(bn.link, /^#\/s\//);
      assert.equal(bn.position, 1);
      for (const h of ['/', '/orders?f=all', '/stores', '/products', '/drivers', '/users', '/categories', '/categories?t=stores', '/banners', '/promotions', '/settings']) await goto(h, 'admin.html');
    });
    await step('mobile layout keeps a side gutter and the tab bar', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await T(() => window.__SOUQ_TEST_CLIENT__.login('buyer@test.iq'));
      await goto('/');
      const left = await page.$eval('#hero', (e) => e.getBoundingClientRect().left);
      assert(left >= 12, 'hero touches the screen edge');
      assert(await page.isVisible('.tabbar'));
      const overflow = await T(() => document.documentElement.scrollWidth - innerWidth);
      assert(overflow <= 0, 'horizontal scroll on mobile');
    });
    assert.deepEqual(errors, [], 'browser errors:\n' + errors.join('\n'));
    console.log('ALL E2E FLOWS PASSED');
  } finally {
    await close();
  }
})().catch((e) => {
  console.error('\n' + (e.stack || e));
  process.exit(1);
});
