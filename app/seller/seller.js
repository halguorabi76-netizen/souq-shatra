import { html, render, safeUrl } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageActions } from '../core/actions.js';
import { go, href, isCurrent } from '../core/router.js';
import { db, check, publicUrl } from '../core/db.js';
import { session, isSeller, signOut } from '../core/session.js';
import { participantOrders, STATUS, mapProduct } from '../core/api.js';
import { mountWorkspace, wsTitle } from '../core/workspace.js';
import { spinnerBlock, errorBlock, emptyState, toast, busy, confirmDialog, modal, badge } from '../core/ui.js';
import { money, number, shortId, dateTime, ago } from '../core/format.js';
import { statusBadge, timeline, payLabel } from '../shop/orders.js';

export const sellerData = { products: null, orders: null, finance: undefined };
export async function loadProducts(force) {
  if (sellerData.products && !force) return sellerData.products;
  const rows = check(await db.from('products').select('*').eq('store_id', session.store.id).order('created_at', { ascending: false })) || [];
  const ids = rows.filter((p) => p.has_variants).map((p) => p.id);
  const vs = ids.length ? check(await db.from('product_variants').select('*').in('product_id', ids)) || [] : [];
  return (sellerData.products = rows.map((p) => mapProduct(p, vs)));
}
export async function loadOrders(force) {
  if (sellerData.orders && !force) return sellerData.orders;
  return (sellerData.orders = await participantOrders({ store: session.store.id }));
}
export async function loadFinance(force) {
  if (sellerData.finance !== undefined && !force) return sellerData.finance;
  const r = await db.rpc('store_finance');
  // null when the revenue migration has not been installed yet.
  return (sellerData.finance = r.error ? null : r.data);
}

function nav(pending) {
  return [
    { href: '#/seller', label: 'لوحة التحكم', icon: 'chart', exact: true },
    { href: '#/seller/orders', label: 'الطلبات', icon: 'package', count: pending },
    { href: '#/seller/products', label: 'المنتجات', icon: 'box' },
    { sep: 'النمو والأرباح' },
    { href: '#/seller/ads', label: 'الإعلانات المميزة', icon: 'megaphone' },
    { href: '#/seller/plans', label: 'الباقات', icon: 'crown' },
    { href: '#/seller/finance', label: 'المالية والمستحقات', icon: 'wallet' },
    { sep: 'المتجر' },
    { href: '#/seller/store', label: 'إعدادات المتجر', icon: 'settings' },
    { href: '#/s/' + session.store.id, label: 'عرض متجري', icon: 'store' },
    { href: '#/', label: 'العودة للسوق', icon: 'home' },
  ];
}
export function sellerShell() {
  const pending = (sellerData.orders || []).filter((o) => o.status === 'new').length;
  return mountWorkspace({
    id: 'seller',
    title: session.store.name,
    subtitle: 'مركز البائع',
    nav: nav(pending),
    footer: html`<button class="nav" data-action="sellerLogout">${icon('logout', 20)} تسجيل الخروج</button>`,
  });
}

export async function sellerPage(ctx) {
  if (!session.user) return go('/login', { role: 'seller', next: '/seller' }, { replace: true });
  if (!isSeller()) return go('/sell', null, { replace: true });
  if (sellerData.storeId !== session.store.id) Object.assign(sellerData, { products: null, orders: null, finance: undefined, storeId: session.store.id });
  const section = ctx.params.section || '';
  const body = sellerShell();
  actionsCache = {};
  sellerActions({});
  const routes = {
    '': dashboard,
    orders: ordersView,
    products: async (c, b) => (await import('./products.js')).productsView(c, b),
    store: async (c, b) => (await import('./store-settings.js')).storeView(c, b),
    finance: async (c, b) => (await import('./finance.js')).financeView(c, b),
    plans: async (c, b) => (await import('./finance.js')).plansView(c, b),
    ads: async (c, b) => (await import('./finance.js')).adsView(c, b),
  };
  const fn = routes[section];
  if (!fn) return go('/seller', null, { replace: true });
  render(body, spinnerBlock());
  try {
    await fn(ctx, body);
  } catch (e) {
    if (isCurrent(ctx.token)) render(body, errorBlock(e));
  }
}
let actionsCache = {};
const logout = async () => (await confirmDialog('تسجيل الخروج', 'الخروج من حسابك على هذا الجهاز؟', { ok: 'خروج' })) && (await signOut(), go('/'));
// Each section registers its buttons; retry and logout are always available.
export const sellerActions = (a) => {
  actionsCache = { ...a, sellerLogout: logout, retry: () => go('/seller' + (location.hash.split('/seller')[1] || '').split('?')[0], null, { replace: true }) };
  pageActions(actionsCache);
};

// ---------- dashboard ----------
async function dashboard(ctx, body) {
  wsTitle('لوحة التحكم', html`<a class="btn btn-primary btn-sm" href="#/seller/products/new">${icon('plus', 16)} منتج جديد</a>`);
  const [orders, products, finance] = await Promise.all([loadOrders(true), loadProducts(true), loadFinance(true)]);
  if (!isCurrent(ctx.token)) return;
  sellerShell();
  const delivered = orders.filter((o) => o.status === 'delivered');
  const startOfDay = new Date().setHours(0, 0, 0, 0),
    startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const sum = (list) => list.reduce((n, o) => n + o.goods, 0);
  const today = delivered.filter((o) => new Date(o.tracking?.delivered_at || o.created_at) >= startOfDay);
  const month = delivered.filter((o) => new Date(o.tracking?.delivered_at || o.created_at) >= startOfMonth);
  const pending = orders.filter((o) => o.status === 'new');
  const active = orders.filter((o) => ['accepted', 'delivery'].includes(o.status));
  const low = products.filter((p) => p.active && p.total_stock <= (p.low_stock_threshold ?? 5));
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(startOfDay - (13 - i) * 864e5);
    const next = d.getTime() + 864e5;
    return { label: d.getDate() + '/' + (d.getMonth() + 1), value: sum(delivered.filter((o) => { const t = new Date(o.tracking?.delivered_at || o.created_at).getTime(); return t >= d.getTime() && t < next; })) };
  });
  const max = Math.max(1, ...days.map((d) => d.value));
  const sold = new Map();
  for (const o of delivered) for (const i of o.items) sold.set(i.product_name, (sold.get(i.product_name) || 0) + i.quantity);
  const top = [...sold].sort((a, b) => b[1] - a[1]).slice(0, 5);
  render(
    body,
    html`${pending.length ? html`<a class="notice notice-warn" href="#/seller/orders" style="color:var(--ink)">${icon('bell', 20)}<p><b>لديك ${pending.length} طلب جديد بانتظار موافقتك.</b> الزبائن ينتظرون؛ اقبل الطلب ليبدأ السائق.</p></a>` : ''}
    ${finance && finance.balance > 0 ? html`<a class="notice" href="#/seller/finance" style="color:var(--ink)">${icon('wallet', 20)}<p>مستحقات السوق عليك: <b>${money(finance.balance)}</b>. سدّدها من صفحة المالية.</p></a>` : ''}
    <div class="stat-grid">
      <div class="stat highlight"><small>مبيعات اليوم</small><b>${money(sum(today))}</b><span class="small" style="opacity:.85">${today.length} طلب مسلّم</span></div>
      <div class="stat"><small>مبيعات هذا الشهر</small><b>${money(sum(month))}</b><span class="trend">${month.length} طلب</span></div>
      <div class="stat"><small>طلبات جديدة</small><b>${pending.length}</b></div>
      <div class="stat"><small>قيد التجهيز والتوصيل</small><b>${active.length}</b></div>
      <div class="stat"><small>المنتجات المنشورة</small><b>${products.filter((p) => p.active).length}</b><span class="small muted">من ${products.length}</span></div>
      ${finance ? html`<div class="stat"><small>باقتك</small><b>${finance.plan?.name || 'الأساسية'}</b><span class="small muted">عمولة ${finance.commission_percent}%</span></div>` : ''}
    </div>
    <div class="two-col" style="grid-template-columns:1.6fr 1fr">
      <section class="card"><div class="card-head"><h3>المبيعات آخر ١٤ يومًا</h3><span class="muted small">قيمة المنتجات المسلّمة</span></div>
        <div class="chart">${days.map((d) => html`<div class="col" title="${d.label}: ${money(d.value)}"><i style="height:${Math.round((d.value / max) * 100)}%"></i><span>${d.label}</span></div>`)}</div></section>
      <section class="card"><h3>الأكثر مبيعًا</h3>${top.length ? top.map(([n, q]) => html`<div class="kv"><span>${n}</span><b>${q}</b></div>`) : html`<p class="muted">تظهر هنا منتجاتك الأكثر مبيعًا.</p>`}</section>
    </div>
    <div class="two-col" style="grid-template-columns:1fr 1fr;margin-top:14px">
      <section class="card"><div class="card-head"><h3>أحدث الطلبات</h3><a href="#/seller/orders">الكل</a></div>
        ${orders.slice(0, 6).map((o) => html`<div class="kv"><span><b class="ltr">${shortId(o.id)}</b> · ${o.customer_name} <small class="muted">${ago(o.created_at)}</small></span>${statusBadge(o)}</div>`)}${!orders.length ? html`<p class="muted">لا توجد طلبات بعد. شارك رابط متجرك لتصلك الطلبات.</p>` : ''}</section>
      <section class="card"><div class="card-head"><h3>تنبيهات المخزون</h3><a href="#/seller/products">المنتجات</a></div>
        ${low.length ? low.slice(0, 8).map((p) => html`<div class="kv"><a href="#/seller/products/${p.id}">${p.name}</a><span class="badge ${p.total_stock ? 'badge-warn' : 'badge-bad'}">${p.total_stock ? 'بقي ' + p.total_stock : 'نفد'}</span></div>`) : html`<p class="muted">${icon('checkCircle', 16)} المخزون جيد.</p>`}</section>
    </div>
    <section class="card" style="margin-top:14px"><h3>شارك متجرك</h3><p class="muted">أرسل الرابط لزبائنك على واتساب وفيسبوك ليطلبوا مباشرة.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><input class="input ltr" readonly value="${location.href.split('#')[0]}#/s/${session.store.id}" style="flex:1;min-width:220px"><button class="btn btn-outline" data-action="copyLink">${icon('copy', 18)} نسخ</button><a class="btn btn-ok" target="_blank" rel="noopener" data-follow href="https://wa.me/?text=${encodeURIComponent('تسوّق من ' + session.store.name + ' على سوق الشطرة: ' + location.href.split('#')[0] + '#/s/' + session.store.id)}">${icon('whatsapp', 18)} واتساب</a></div></section>`,
  );
  sellerActions({ copyLink: () => navigator.clipboard?.writeText(location.href.split('#')[0] + '#/s/' + session.store.id).then(() => toast('تم نسخ الرابط', 'success')) });
}

// ---------- orders ----------
const COLS = [
  ['new', 'جديدة', 'warn'],
  ['accepted', 'قيد التجهيز', 'info'],
  ['delivery', 'مع السائق', 'info'],
  ['done', 'مكتملة / ملغاة', 'ok'],
];
async function ordersView(ctx, body) {
  wsTitle('الطلبات', html`<button class="btn btn-outline btn-sm" data-action="reload">${icon('refresh', 16)} تحديث</button>`);
  const orders = await loadOrders(true);
  const contacts = (await db.rpc('assigned_delivery_contacts')).data || [];
  if (!isCurrent(ctx.token)) return;
  sellerShell();
  const col = (k) => orders.filter((o) => (k === 'done' ? ['delivered', 'cancelled'].includes(o.status) : o.status === k));
  const card = (o) => {
    const driver = contacts.find((c) => c.order_id === o.id);
    return html`<article class="mini-order"><div style="display:flex;justify-content:space-between;gap:8px"><b class="ltr">${shortId(o.id)}</b>${statusBadge(o)}</div>
      <div class="small">${o.items.map((i) => html`<div>${i.product_name}${i.label ? ' · ' + i.label : ''} × ${i.quantity}</div>`)}</div>
      <div class="kv small"><span class="muted">${ago(o.created_at)}</span><b>${money(o.goods)}</b></div>
      ${o.payment_status === 'paid' ? html`<span class="badge badge-ok">مدفوع إلكترونيًا</span>` : ''}
      ${driver ? html`<div class="small">${icon('truck', 14)} ${driver.full_name}${driver.phone ? html` · <a class="ltr" href="tel:${driver.phone}" data-follow>${driver.phone}</a>` : ''}</div>` : o.status !== 'cancelled' && o.status !== 'delivered' ? html`<div class="small muted">بانتظار سائق</div>` : ''}
      ${o.action?.request_kind ? html`<div class="small" style="color:var(--warn)">${icon('undo', 14)} ${o.action.request_kind === 'return' ? 'طلب إرجاع' : 'طلب إلغاء'}: ${o.action.reason || ''}</div>` : ''}
      <div class="acts">${o.status === 'new' ? html`<button class="btn btn-ok btn-sm" data-action="accept" data-id="${o.id}">${icon('check', 16)} قبول</button><button class="btn btn-ghost btn-sm" data-action="reject" data-id="${o.id}">رفض</button>` : ''}
        ${o.status === 'accepted' && !o.tracking?.ready_at ? html`<button class="btn btn-primary btn-sm" data-action="ready" data-id="${o.id}">جاهز للاستلام</button>` : ''}
        ${o.status === 'accepted' && !o.driver_id ? html`<button class="btn btn-ghost btn-sm" data-action="reject" data-id="${o.id}">إلغاء</button>` : ''}
        <button class="btn btn-outline btn-sm" data-action="details" data-id="${o.id}">التفاصيل</button></div></article>`;
  };
  render(
    body,
    orders.length
      ? html`<div class="kanban">${COLS.map(([k, label]) => html`<section><h3>${label} <span class="badge">${col(k).length}</span></h3>${col(k).slice(0, k === 'done' ? 30 : 100).map(card)}</section>`)}</div>`
      : emptyState('package', 'لا توجد طلبات بعد', 'عند وصول طلب سيظهر هنا وستصلك إشعارات.'),
  );
  const set = (b, status, msg) =>
    busy(b, async () => {
      check(await db.rpc('set_order_status', { p_order: b.dataset.id, p_status: status }));
      toast(msg, 'success');
      ordersView(ctx, body);
    });
  sellerActions({
    reload: () => ordersView(ctx, body),
    accept: (b) => set(b, 'accepted', 'تم قبول الطلب وإبلاغ الزبون'),
    reject: async (b) => (await confirmDialog('إلغاء الطلب', 'سيُلغى الطلب وتعود الكمية للمخزون ويُبلَّغ الزبون.', { ok: 'إلغاء الطلب', danger: true })) && set(b, 'cancelled', 'أُلغي الطلب'),
    ready: (b) =>
      busy(b, async () => {
        check(await db.rpc('delivery_stage', { p_order: b.dataset.id, p_stage: 'READY' }));
        toast('أُبلغ السائق أن الطلب جاهز', 'success');
        ordersView(ctx, body);
      }),
    details: (b) => {
      const o = orders.find((x) => x.id === b.dataset.id);
      modal(
        'الطلب ' + shortId(o.id),
        html`${timeline(o)}<hr class="divider">${o.items.map((i) => html`<div class="kv"><span>${i.product_name}${i.label ? ' · ' + i.label : ''} × ${i.quantity}</span><b>${money(i.price * i.quantity)}</b></div>`)}
        <div class="kv total"><span>قيمة المنتجات</span><b>${money(o.goods)}</b></div>
        <p class="muted small">${payLabel(o)} · ${dateTime(o.created_at)}</p>
        <h3>الزبون</h3><p>${o.customer_name}${o.customer_phone ? html` · <a class="ltr" href="tel:${o.customer_phone}" data-follow>${o.customer_phone}</a>` : html` <small class="muted">(يظهر الرقم بعد قبول السائق)</small>`}<br>${o.address}</p>`,
      );
    },
  });
}
export { badge, STATUS, safeUrl, publicUrl, number, href };
