// Demo marketplace data + RPC behaviour for browser tests (mirrors the production contracts).
(function () {
  const now = Date.now();
  const iso = (minsAgo = 0) => new Date(now - minsAgo * 60000).toISOString();
  const U = { buyer: 'u-buyer-0000-0000-0000-000000000001', seller: 'u-seller-000-0000-0000-000000000002', driver: 'u-driver-000-0000-0000-000000000003', admin: 'u-admin-0000-0000-0000-000000000004', seller2: 'u-seller2-00-0000-0000-000000000005' };
  const S = { a: '5a000000-0000-4000-8000-000000000001', b: '5b000000-0000-4000-8000-000000000002', c: '5c000000-0000-4000-8000-000000000003' };
  const C = { food: 'c1000000-0000-4000-8000-000000000001', clothes: 'c1000000-0000-4000-8000-000000000004', shoes: 'c1000000-0000-4000-8000-000000000005', phones: 'c1000000-0000-4000-8000-000000000008', home: 'c1000000-0000-4000-8000-000000000013', tshirts: 'c2000000-0000-4000-8000-000000000041' };
  const img = (hue, label) =>
    'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="hsl(${hue},70%,88%)"/><circle cx="200" cy="170" r="90" fill="hsl(${hue},60%,60%)"/><text x="200" y="330" font-size="44" text-anchor="middle" font-family="sans-serif" fill="hsl(${hue},50%,25%)">${label}</text></svg>`);
  let pid = 0;
  const P = (store, name, price, extra = {}) => ({ id: 'p' + String(++pid).padStart(7, '0') + '-0000-4000-8000-000000000000', store_id: store, name, description: extra.description || 'منتج أصلي بجودة عالية من متاجر الشطرة.', category: extra.category || 'مواد غذائية', catalog_category_id: extra.cat || C.food, price, compare_at_price: extra.compare ?? null, stock: extra.stock ?? 25, image_path: img(extra.hue ?? pid * 37, extra.label || name.slice(0, 6)), active: extra.active ?? true, blocked: false, has_variants: !!extra.variants, attributes: extra.attributes || { _selling: { condition: extra.condition || 'new', sale_mode: 'retail', unit: extra.unit || 'قطعة' } }, created_at: iso(pid * 30), store_category: extra.group || '', sku: '', variant: '', low_stock_threshold: 5, legacy_stock_reserve: 0 });
  const products = [
    P(S.a, 'رز بسمتي هندي 5 كغم', 14500, { compare: 16000, unit: 'كيس', group: 'الحبوب' }),
    P(S.a, 'زيت دوار الشمس 1.8 لتر', 4250, { group: 'الزيوت' }),
    P(S.a, 'سكر أبيض 2 كغم', 3000, { group: 'الحبوب' }),
    P(S.a, 'شاي العروسة 500 غم', 5500, { compare: 6250 }),
    P(S.a, 'تمر برحي فاخر 1 كغم', 7000, { category: 'تمور', cat: C.food }),
    P(S.a, 'معجون طماطم 6 علب', 6000, { stock: 0 }),
    P(S.b, 'تيشيرت قطني رجالي', 12000, { category: 'ملابس', cat: C.tshirts, variants: true, hue: 210, attributes: { _selling: { condition: 'new', sale_mode: 'retail', unit: 'قطعة' } } }),
    P(S.b, 'دشداشة رجالية صيفية', 30000, { category: 'ملابس', cat: C.clothes, compare: 35000, hue: 30 }),
    P(S.b, 'حذاء رياضي خفيف', 27500, { category: 'أحذية', cat: C.shoes, variants: true, hue: 350 }),
    P(S.b, 'عباءة نسائية مطرزة', 45000, { category: 'ملابس', cat: C.clothes, hue: 280 }),
    P(S.c, 'سماعات بلوتوث لاسلكية', 18000, { category: 'أجهزة', cat: C.phones, compare: 25000, hue: 190 }),
    P(S.c, 'شاحن سريع 25 واط', 9000, { category: 'أجهزة', cat: C.phones, hue: 160 }),
    P(S.c, 'هاتف سامسونج A15 مستعمل', 165000, { category: 'أجهزة', cat: C.phones, condition: 'used', hue: 240 }),
    P(S.c, 'مروحة سقفية 56 إنش', 55000, { category: 'منزلية', cat: C.home, hue: 100 }),
    P(S.c, 'طقم أواني طبخ 10 قطع', 62000, { category: 'منزلية', cat: C.home, compare: 75000, hue: 15 }),
  ];
  const tshirt = products[6], shoe = products[8];
  const V = (p, attrs, price, stock, sale = null) => ({ id: 'v' + Math.random().toString(16).slice(2, 10) + '-0000-4000-8000-000000000000', product_id: p.id, attributes: attrs, price, sale_price: sale, stock, available: true, archived: false, image_path: null, sku: '', barcode: '', label: Object.values(attrs).join(' · ') });
  const variants = [
    V(tshirt, { color: 'أسود', size: 'M' }, 12000, 4), V(tshirt, { color: 'أسود', size: 'L' }, 12000, 0), V(tshirt, { color: 'أبيض', size: 'M' }, 12000, 6), V(tshirt, { color: 'أبيض', size: 'L' }, 13000, 2, 11000),
    V(shoe, { size: '42' }, 27500, 3), V(shoe, { size: '43' }, 27500, 5), V(shoe, { size: '44' }, 29000, 0),
  ];
  const tables = {
    profiles: [
      { id: U.buyer, full_name: 'علي حسين', phone: '07701234567', role: 'buyer', disabled: false, created_at: iso(5000) },
      { id: U.seller, full_name: 'كرار جاسم', phone: '07801234567', role: 'seller', disabled: false, created_at: iso(9000), username: 'karrar' },
      { id: U.seller2, full_name: 'زينب علي', phone: '07811111111', role: 'seller', disabled: false, created_at: iso(9000) },
      { id: U.driver, full_name: 'حيدر سائق', phone: '07901234567', role: 'driver', disabled: false, created_at: iso(8000) },
      { id: U.admin, full_name: 'مدير السوق', phone: '07700000000', role: 'admin', disabled: false, created_at: iso(10000) },
    ],
    stores: [
      { id: S.a, owner_id: U.seller, name: 'أسواق النخيل', phone: '07801234567', address: 'شارع السوق الكبير', description: 'مواد غذائية وتمور بأسعار الجملة', approved: true, removed: false, verified: true, store_kind: 'physical', prep_time_min: 15, created_at: iso(9000), username: 'nakheel', image_path: img(120, 'النخيل') },
      { id: S.b, owner_id: U.seller2, name: 'بوتيك الأناقة', phone: '07811111111', address: 'حي الشهداء', description: 'ملابس وأحذية رجالية ونسائية', approved: true, removed: false, verified: false, store_kind: 'online', prep_time_min: 20, created_at: iso(7000) },
      { id: S.c, owner_id: 'u-other', name: 'عالم الإلكترونيات', phone: '07722222222', address: 'شارع المحافظة', description: 'هواتف وإكسسوارات وأجهزة منزلية', approved: true, removed: false, verified: true, store_kind: 'physical', prep_time_min: 10, created_at: iso(6000) },
    ],
    store_pickups: [S.a, S.b, S.c].map((id, i) => ({ store_id: id, pickup_address: 'الشطرة', latitude: 31.41 + i * 0.002, longitude: 46.17 + i * 0.002 })),
    products,
    product_variants: variants,
    catalog_categories: [
      { id: C.food, parent_id: null, name: 'مواد غذائية', attributes: [], position: 0, active: true },
      { id: C.clothes, parent_id: null, name: 'ملابس', attributes: [{ key: 'color', label: 'اللون', variant: true, type: 'text', options: [] }, { key: 'size', label: 'المقاس', variant: true, type: 'text', options: [] }], position: 3, active: true },
      { id: C.tshirts, parent_id: C.clothes, name: 'تيشيرتات', attributes: [], position: 0, active: true },
      { id: C.shoes, parent_id: null, name: 'أحذية', attributes: [{ key: 'size', label: 'المقاس', variant: true, type: 'text', options: [] }], position: 4, active: true },
      { id: C.phones, parent_id: null, name: 'أجهزة', attributes: [], position: 7, active: true },
      { id: C.home, parent_id: null, name: 'منزلية', attributes: [], position: 12, active: true },
    ],
    seller_categories: [{ store_id: S.a, name: 'الحبوب', active: true, deleted_at: null }, { store_id: S.a, name: 'الزيوت', active: true, deleted_at: null }],
    delivery_settings: [{ id: true, platform_fee: 500, delivery_fee: 2000, qi_number: '1234567890' }],
    delivery_zones: [{ id: 'shatra', name: 'داخل الشطرة', fee: 2000, enabled: true }, { id: 'nasr', name: 'مدينة النصر', fee: 5000, enabled: true }],
    platform_settings: [{ id: true, commission_percent: 5, delivery_share_percent: 10, store_debt_limit: 0, payment_methods: { cod: true, zaincash: true, card: false }, transfer_accounts: { zaincash: '07800000000', qi: '1234567890' }, support_phone: '9647837271707' }],
    seller_plans: [
      { id: 'free', name: 'الأساسية', description: 'ابدأ مجانًا.', monthly_price: 0, commission_percent: null, max_products: 30, featured_days: 0, position: 0, active: true },
      { id: 'silver', name: 'الفضية', description: 'عمولة أقل وظهور مميز.', monthly_price: 15000, commission_percent: 4, max_products: 200, featured_days: 3, position: 1, active: true },
      { id: 'gold', name: 'الذهبية', description: 'أفضل قيمة للمتاجر الكبيرة.', monthly_price: 35000, commission_percent: 2.5, max_products: null, featured_days: 10, position: 2, active: true },
    ],
    promotion_placements: [
      { id: 'home_hero', name: 'واجهة الصفحة الرئيسية', description: '', daily_price: 5000, max_active: 5, needs_product: true, active: true },
      { id: 'home_featured', name: 'منتجات مميزة', description: '', daily_price: 2000, max_active: 12, needs_product: true, active: true },
      { id: 'search_top', name: 'أعلى نتائج البحث', description: '', daily_price: 1500, max_active: 20, needs_product: true, active: true },
      { id: 'category_top', name: 'أعلى القسم', description: '', daily_price: 1000, max_active: 20, needs_product: true, active: true },
      { id: 'store_spotlight', name: 'متجر مميز', description: '', daily_price: 1500, max_active: 8, needs_product: false, active: true },
    ],
    promotions: [
      { id: 'pr1', store_id: S.c, product_id: products[10].id, placement: 'home_hero', days: 7, amount: 35000, status: 'active', starts_at: iso(60), ends_at: new Date(now + 6 * 864e5).toISOString(), created_at: iso(60) },
      { id: 'pr2', store_id: S.a, product_id: products[0].id, placement: 'home_featured', days: 7, amount: 14000, status: 'active', starts_at: iso(60), ends_at: new Date(now + 6 * 864e5).toISOString(), created_at: iso(60) },
      { id: 'pr3', store_id: S.b, product_id: null, placement: 'store_spotlight', days: 7, amount: 0, status: 'active', starts_at: iso(60), ends_at: new Date(now + 6 * 864e5).toISOString(), created_at: iso(60) },
    ],
    customer_addresses: [{ id: 'addr-1', user_id: U.buyer, label: 'البيت', recipient_name: 'علي حسين', phone: '07701234567', phone_secondary: null, address: 'حي الحسين قرب الجامع', zone_id: 'shatra', latitude: 31.412, longitude: 46.174, created_at: iso(100) }],
    orders: [],
    order_items: [],
    account_notifications: [{ id: 'n1', recipient_id: U.buyer, event_key: 'welcome', event_kind: 'site_update', title: 'مرحبًا بك في سوق الشطرة', body: 'جرّب الطلب من أكثر من متجر بتوصيل واحد.', read_at: null, created_at: iso(30) }],
    product_interactions: [],
    delivery_workers: [{ user_id: U.driver, approved: true, amount_due: 3500, debt_limit: 50000, created_at: iso(8000) }],
    driver_profiles: [{ user_id: U.driver, full_name: 'حيدر سائق', phone: '07901234567', email: 'driver@test.iq', address: 'الشطرة', vehicle: 'دراجة نارية حمراء' }],
    delivery_payments: [],
    ledger_entries: [],
    payment_requests: [],
    store_subscriptions: [],
    product_stock_movements: [],
    seller_workspace_settings: [],
    delivery_config: [],
    order_customer_actions: [],
  };
  const users = [
    { id: U.buyer, email: 'buyer@test.iq', password: 'secret123' },
    { id: U.seller, email: 'seller@test.iq', password: 'secret123' },
    { id: U.seller2, email: 'seller2@test.iq', password: 'secret123' },
    { id: U.driver, email: 'driver@test.iq', password: 'secret123' },
    { id: U.admin, email: 'admin@test.iq', password: 'secret123' },
  ];
  const client = window.createMockSupabase({ tables, users });
  const db = client._db;
  const T = db.tables;
  const me = () => db.user?.id;
  const isAdmin = () => T.profiles.find((p) => p.id === me())?.role === 'admin';
  const ownsStore = (sid) => T.stores.some((s) => s.id === sid && s.owner_id === me());
  const store = (sid) => T.stores.find((s) => s.id === sid);
  const fail = (m) => {
    throw new Error(m);
  };
  const km = (a, b) => 6371 * 2 * Math.asin(Math.sqrt(Math.sin(((b.lat - a.lat) * Math.PI) / 360) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(((b.lng - a.lng) * Math.PI) / 360) ** 2)) * 1.3;
  function quote({ p_stores, p_lat, p_lng }) {
    let at = null,
      dist = 0;
    for (const sid of p_stores) {
      const p = T.store_pickups.find((x) => x.store_id === sid);
      if (!p) fail('لم يحدد أحد المتاجر موقع الاستلام بعد');
      const here = { lat: p.latitude, lng: p.longitude };
      if (at) dist += km(at, here);
      at = here;
    }
    dist += km(at, { lat: p_lat, lng: p_lng });
    const fee = Math.round((1000 + dist * 500 + (p_stores.length - 1) * 500) / 250) * 250;
    return { route: p_stores, route_km: dist, extra_stores: p_stores.length - 1, delivery_fee: fee, high_fee: dist > 8, fingerprint: 'fp-' + fee };
  }
  const orderView = (o) => ({
    ...o,
    order_items: T.order_items.filter((i) => i.order_id === o.id),
    order_customer_actions: T.order_customer_actions.find((a) => a.order_id === o.id) || null,
    tracking: o.tracking || { stage: 'NEW' },
    can_report_late: false,
  });
  function notify(recipient, title, body, order_id, kind = 'status') {
    if (!recipient) return;
    T.account_notifications.push({ id: crypto.randomUUID(), recipient_id: recipient, event_key: crypto.randomUUID(), event_kind: kind, title, body, order_id, read_at: null, created_at: new Date().toISOString() });
  }
  Object.assign(db.rpc, {
    quote_delivery_route: quote,
    place_route_order(a) {
      if (!me()) fail('active account required');
      const q = quote({ p_stores: a.p_groups.map((g) => g.store), p_lat: a.p_lat, p_lng: a.p_lng });
      const settings = T.delivery_settings[0];
      if (q.delivery_fee !== a.p_expected_fee || settings.platform_fee !== a.p_platform_fee) fail('delivery fee changed');
      const prior = T.orders.filter((o) => o.request_id === a.p_request);
      if (prior.length) return prior.map((o) => o.id);
      const ids = [];
      a.p_groups.forEach((g, gi) => {
        const id = crypto.randomUUID();
        let sub = 0;
        for (const l of g.lines) {
          const p = T.products.find((x) => x.id === l.id);
          const v = l.variant_id && T.product_variants.find((x) => x.id === l.variant_id);
          const stockHolder = v || p;
          if (!p || !p.active || stockHolder.stock < l.quantity) fail('product unavailable');
          stockHolder.stock -= l.quantity;
          const price = v ? v.sale_price ?? v.price : p.price;
          sub += price * l.quantity;
          T.order_items.push({ id: T.order_items.length + 1, order_id: id, product_id: p.id, variant_id: v?.id || null, product_name: p.name, price, quantity: l.quantity, variant_snapshot: v ? { attributes: v.attributes } : {} });
        }
        const fee = Math.floor(q.delivery_fee / a.p_groups.length) + (gi === 0 ? q.delivery_fee % a.p_groups.length : 0);
        T.orders.push({ id, request_id: a.p_request, store_id: g.store, buyer_id: me(), driver_id: null, status: 'new', total: sub + fee + settings.platform_fee, platform_fee: settings.platform_fee, delivery_fee: fee, customer_name: a.p_name, customer_phone: a.p_phone, address: a.p_address, note: a.p_note, created_at: new Date().toISOString(), payment_method: 'cod', payment_status: 'unpaid', tracking: { stage: 'NEW' }, customer_lat: a.p_lat, customer_lng: a.p_lng, route_km: q.route_km });
        notify(store(g.store).owner_id, 'طلب جديد من زبون', a.p_name, id, 'order');
        ids.push(id);
      });
      return ids;
    },
    participant_orders(a) {
      return T.orders
        .filter((o) => isAdmin() || o.buyer_id === me() || ownsStore(o.store_id) || o.driver_id === me())
        .filter((o) => (!a.p_buyer || o.buyer_id === a.p_buyer) && (!a.p_store || o.store_id === a.p_store) && (!a.p_driver || o.driver_id === a.p_driver) && (!a.p_order || o.id === a.p_order))
        .sort((x, y) => y.created_at.localeCompare(x.created_at))
        .map(orderView);
    },
    assigned_delivery_contacts: () => T.orders.filter((o) => o.driver_id && (o.buyer_id === me() || o.driver_id === me() || ownsStore(o.store_id))).map((o) => ({ order_id: o.id, driver_id: o.driver_id, full_name: 'حيدر سائق', phone: '07901234567', vehicle: 'دراجة نارية', pickup_address: store(o.store_id)?.address })),
    customer_order_action(a) {
      const o = T.orders.find((x) => x.id === a.p_order && x.buyer_id === me());
      if (!o) fail('not permitted');
      if (a.p_action === 'hide' || a.p_action === 'restore') {
        let x = T.order_customer_actions.find((r) => r.order_id === o.id);
        if (!x) T.order_customer_actions.push((x = { order_id: o.id, buyer_id: me() }));
        x.hidden_at = a.p_action === 'hide' ? new Date().toISOString() : null;
        return a.p_action;
      }
      if (a.p_action === 'cancel') {
        if (o.driver_id) fail('لا يمكن إلغاء الطلب بعد قبول سائق التوصيل');
        o.status = 'cancelled';
        o.tracking = { ...o.tracking, stage: 'CANCELLED', cancelled_at: new Date().toISOString() };
        return 'cancelled';
      }
      let x = T.order_customer_actions.find((r) => r.order_id === o.id);
      if (!x) T.order_customer_actions.push((x = { order_id: o.id, buyer_id: me() }));
      Object.assign(x, { request_kind: a.p_action, reason: a.p_reason });
      return 'requested';
    },
    customer_delivery_action: () => ({ phone: '07901234567' }),
    set_order_status(a) {
      const o = T.orders.find((x) => x.id === a.p_order);
      if (!o || !(ownsStore(o.store_id) || isAdmin())) fail('not permitted');
      if (!((o.status === 'new' && ['accepted', 'cancelled'].includes(a.p_status)) || (o.status === 'accepted' && a.p_status === 'cancelled' && !o.driver_id))) fail('invalid transition');
      o.status = a.p_status;
      o.tracking = { ...o.tracking, stage: a.p_status === 'accepted' ? 'STORE_ACCEPTED' : 'CANCELLED', store_accepted_at: a.p_status === 'accepted' ? new Date().toISOString() : o.tracking?.store_accepted_at };
      notify(o.buyer_id, a.p_status === 'accepted' ? 'تمت الموافقة من قبل البائع' : 'أُلغي الطلب', '', o.id);
    },
    delivery_stage(a) {
      const o = T.orders.find((x) => x.id === a.p_order);
      const t = (o.tracking ||= {});
      const at = new Date().toISOString();
      if (a.p_stage === 'READY') Object.assign(t, { ready_at: at, stage: 'READY' });
      if (a.p_stage === 'PICKED_UP') Object.assign(t, { picked_up_at: at, stage: 'PICKED_UP' });
      if (a.p_stage === 'ON_THE_WAY') {
        Object.assign(t, { on_the_way_at: at, stage: 'ON_THE_WAY' });
        o.status = 'delivery';
      }
    },
    delivery_offer_details: () => T.orders.filter((o) => ['new', 'accepted'].includes(o.status) && !o.driver_id).map((o) => ({ order_id: o.id, store_name: store(o.store_id).name, created_at: o.created_at, address: o.address, latitude: o.customer_lat, longitude: o.customer_lng, route_km: o.route_km, delivery_fee: o.delivery_fee, product_total: o.total - o.delivery_fee - o.platform_fee, items: T.order_items.filter((i) => i.order_id === o.id).map((i) => ({ name: i.product_name, quantity: i.quantity })) })),
    claim_route_delivery(a) {
      const o = T.orders.find((x) => x.id === a.p_order);
      if (!o || o.driver_id) fail('order no longer available');
      o.driver_id = me();
      o.tracking = { ...o.tracking, driver_accepted_at: new Date().toISOString(), stage: 'DRIVER_ACCEPTED', queue_rank: 1 };
    },
    decline_delivery: () => null,
    reorder_delivery: () => null,
    delivery_step(a) {
      const o = T.orders.find((x) => x.id === a.p_order && x.driver_id === me());
      if (!o) fail('not assigned to you');
      o.status = a.p_status;
      if (a.p_status === 'delivered') {
        o.tracking = { ...o.tracking, delivered_at: new Date().toISOString(), stage: 'DELIVERED' };
        T.delivery_workers.find((w) => w.user_id === me()).amount_due += o.platform_fee;
      }
    },
    submit_delivery_payment(a) {
      T.delivery_payments.push({ id: crypto.randomUUID(), driver_id: me(), amount: a.p_amount, receipt: a.p_receipt, status: 'pending', created_at: new Date().toISOString() });
    },
    request_seller_join_map(a) {
      let s = T.stores.find((x) => x.owner_id === me());
      if (!s) T.stores.push((s = { id: crypto.randomUUID(), owner_id: me(), approved: false, removed: false, created_at: new Date().toISOString() }));
      Object.assign(s, { name: a.p_name, phone: a.p_phone, address: a.p_address, description: a.p_description, store_kind: a.p_kind });
      return s.id;
    },
    request_driver_application(a) {
      T.driver_profiles = T.driver_profiles.filter((d) => d.user_id !== me());
      T.driver_profiles.push({ user_id: me(), full_name: a.p_name, phone: a.p_phone, email: a.p_email, address: a.p_address, vehicle: a.p_vehicle });
      if (!T.delivery_workers.some((w) => w.user_id === me())) T.delivery_workers.push({ user_id: me(), approved: false, amount_due: 0, debt_limit: 50000, created_at: new Date().toISOString() });
    },
    set_professional_username: () => null,
    record_professional_entry: () => null,
  });

  const ownStore = () => T.stores.find((s) => s.owner_id === me() && s.approved);
  Object.assign(db.rpc, {
    store_finance() {
      const s = ownStore();
      if (!s) return null;
      const sub = T.store_subscriptions.find((x) => x.store_id === s.id && x.status === 'active');
      const plan = T.seller_plans.find((p) => p.id === (sub?.plan_id || 'free'));
      return { balance: T.ledger_entries.filter((e) => e.party_type === 'store' && e.party_id === s.id).reduce((n, e) => n + e.amount, 0), plan, commission_percent: plan.commission_percent ?? T.platform_settings[0].commission_percent, product_count: T.products.filter((p) => p.store_id === s.id && p.active).length, subscription: sub || null, entries: T.ledger_entries.filter((e) => e.party_id === s.id), requests: T.payment_requests.filter((r) => r.store_id === s.id), pending_subscriptions: T.store_subscriptions.filter((x) => x.store_id === s.id && x.status === 'pending'), promotions: T.promotions.filter((x) => x.store_id === s.id) };
    },
    request_subscription(a) {
      const s = ownStore(), p = T.seller_plans.find((x) => x.id === a.p_plan);
      const row = { id: crypto.randomUUID(), store_id: s.id, plan_id: p.id, months: a.p_months, amount: p.monthly_price * a.p_months, status: p.monthly_price ? 'pending' : 'active', starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + a.p_months * 30 * 864e5).toISOString() };
      T.store_subscriptions.push(row);
      return row.id;
    },
    request_promotion(a) {
      const s = ownStore(), pl = T.promotion_placements.find((x) => x.id === a.p_placement);
      const row = { id: crypto.randomUUID(), store_id: s.id, product_id: a.p_product, placement: pl.id, days: a.p_days, amount: pl.daily_price * a.p_days, status: 'pending', source: 'paid', created_at: new Date().toISOString() };
      T.promotions.push(row);
      return row.id;
    },
    submit_payment_proof(a) {
      const row = { id: crypto.randomUUID(), payer_id: me(), store_id: ownStore().id, purpose: a.p_purpose, ref_id: a.p_ref, amount: a.p_amount, method: a.p_method, reference: a.p_reference, status: 'pending', created_at: new Date().toISOString() };
      T.payment_requests.push(row);
      return row.id;
    },
    save_product_bundle(a) {
      const id = a.p_id || crypto.randomUUID();
      const prev = T.products.find((p) => p.id === id);
      const row = { ...(prev || { created_at: new Date().toISOString(), blocked: false }), ...a.p_product, id, store_id: a.p_store, has_variants: a.p_variants.length > 0 };
      delete row.expected_stock;
      if (prev) Object.assign(prev, row); else T.products.push(row);
      T.product_variants = T.product_variants.filter((v) => v.product_id !== id).concat(a.p_variants.map((v) => ({ ...v, product_id: id })));
      return id;
    },
    delete_product_safely(a) { T.products = T.products.filter((p) => p.id !== a.p_product); },
    save_store_location(a) { Object.assign(T.stores.find((s) => s.id === a.p_store), { store_kind: a.p_kind, address: a.p_address }); },
    save_store_delivery(a) { const p = T.store_pickups.find((x) => x.store_id === a.p_store); Object.assign(p, { latitude: a.p_lat, longitude: a.p_lng }); T.stores.find((s) => s.id === a.p_store).prep_time_min = a.p_prep; },
    driver_finance: () => ({ credit: 0, entries: [] }),
  });

  Object.assign(db.rpc, {
    admin_account_profiles: () => T.profiles.map((p) => ({ ...p, email: db.users.find((u) => u.id === p.id)?.email })),
    admin_finance_summary: () => ({ orders_delivered: T.orders.filter((o) => o.status === 'delivered').length, gmv: T.orders.filter((o) => o.status === 'delivered').reduce((n, o) => n + o.total, 0), platform_fees: 1500, commissions: 4200, delivery_share: 600, online_paid: 0, refunds_due: 0, orders_total: T.orders.length, orders_cancelled: 0, subscriptions: 15000, promotions: 49000, store_receivable: 4200, store_payable: 0, driver_receivable: 3500, driver_payable: 0, pending_requests: T.payment_requests.length }),
    admin_balances: () => ({ stores: T.stores.filter((s) => s.approved).map((s) => ({ store_id: s.id, name: s.name, balance: s.id === T.stores[0].id ? 4200 : 0, plan: 'الأساسية' })), drivers: T.delivery_workers.map((w) => ({ user_id: w.user_id, name: 'سائق', amount_due: w.amount_due, credit: 0 })) }),
    approve_store: (a) => { T.stores.find((s) => s.id === a.p_store).approved = a.p_approved; },
    admin_approve_driver: (a) => { T.delivery_workers.find((w) => w.user_id === a.p_driver).approved = a.p_approved; },
    admin_set_store_removed: (a) => { T.stores.find((s) => s.id === a.p_store).removed = a.p_removed; },
    admin_set_account_disabled: (a) => { T.profiles.find((p) => p.id === a.p_user).disabled = a.p_disabled; },
    admin_set_product_blocked: (a) => { T.products.find((p) => p.id === a.p_product).blocked = a.p_blocked; },
    admin_review_payment_request: (a) => { T.payment_requests.find((r) => r.id === a.p_id).status = a.p_approved ? 'approved' : 'rejected'; },
    admin_review_delivery_payment: (a) => { T.delivery_payments.find((r) => r.id === a.p_payment).status = a.p_approved ? 'approved' : 'rejected'; },
    admin_set_platform_settings: (a) => Object.assign(T.platform_settings[0], a.p_values),
    admin_set_delivery_settings: (a) => Object.assign(T.delivery_settings[0], { platform_fee: a.p_platform_fee, qi_number: a.p_qi_number }),
    admin_delivery_config: () => null,
    admin_set_delivery_zone: () => null,
    admin_save_plan: () => null,
    admin_save_placement: () => null,
    admin_set_promotion: (a) => { T.promotions.find((p) => p.id === a.p_id).status = a.p_status; },
    admin_grant_subscription: () => null,
    admin_ledger_entry: () => null,
    admin_mark_refunded: () => null,
    save_catalog_category: () => null,
  });
  T.stores.push({ id: '5d000000-0000-4000-8000-000000000004', owner_id: U.buyer, name: 'محل الوفاء الجديد', phone: '07733333333', address: 'حي العسكري', description: 'عطور ومستحضرات', approved: false, removed: false, store_kind: 'physical', created_at: iso(20) });
  T.payment_requests.push({ id: 'req-1', payer_id: U.seller, store_id: S.a, purpose: 'subscription', ref_id: null, amount: 15000, method: 'zaincash', reference: 'ZC-998877', status: 'pending', created_at: iso(10) });
  T.delivery_config = [{ key: 'BASE_FEE', value: 1000 }, { key: 'PER_KM_FEE', value: 500 }, { key: 'ROAD_FACTOR', value: 1.3 }];
  db.functions['payments/init'] = async () => ({ data: { redirect_url: '#/order-placed?payment=success' }, error: null });
  db.policies = {
    customer_addresses: (r, u) => r.user_id === u?.id,
    product_interactions: (r, u) => r.user_id === u?.id,
    account_notifications: (r, u) => r.recipient_id === u?.id,
  };
  window.__SOUQ_TEST_CLIENT__ = client;
  window.__FIX__ = { U, S, C, products, variants };
})();
