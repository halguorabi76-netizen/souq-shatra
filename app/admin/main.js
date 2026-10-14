import { theme } from '../core/state.js';
import { route, start, setGuard, setNotFound, go, refresh, isCurrent, current } from '../core/router.js';
import { load, session, onSession, isAdmin, signIn, signOut, signInWithGoogle } from '../core/session.js';
import { db, check, loading } from '../core/db.js';
import { wireActions, pageActions, globalActions } from '../core/actions.js';
import { html, render, formData } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { mountWorkspace, wsTitle } from '../core/workspace.js';
import { spinnerBlock, errorBlock, emptyState, toast, busy, confirmDialog, closeModals, badge } from '../core/ui.js';
import { money, number, shortId, dateTime, ago, normalizeArabic } from '../core/format.js';
import { participantOrders } from '../core/api.js';
import { statusBadge } from '../shop/orders.js';
import { LOGO } from '../shop/shell.js';

theme.apply();
export const A = { cache: {} };
// Small cache so moving between admin pages stays instant; "تحديث" clears it.
export async function data(key, fn, force) {
  if (!force && A.cache[key]) return A.cache[key];
  return (A.cache[key] = await fn());
}
export const clearData = () => (A.cache = {});
export const people = (f) => data('people', async () => check(await db.rpc('admin_account_profiles')) || [], f);
export const stores = (f) => data('stores', async () => check(await db.from('stores').select('*').order('created_at', { ascending: false })) || [], f);
export const workers = (f) => data('workers', async () => check(await db.from('delivery_workers').select('*').order('created_at', { ascending: false })) || [], f);
export const driverProfiles = (f) => data('dprof', async () => check(await db.from('driver_profiles').select('*')) || [], f);
export const deliveryPayments = (f) => data('dpay', async () => check(await db.from('delivery_payments').select('*').order('created_at', { ascending: false })) || [], f);
export const orders = (f) => data('orders', () => participantOrders({}), f);
export const paymentRequests = (f) => data('preq', async () => { const r = await db.from('payment_requests').select('*').order('created_at', { ascending: false }); return r.error ? null : r.data; }, f);

function shell(counts = {}) {
  return mountWorkspace({
    id: 'admin',
    title: 'لوحة الإدارة',
    subtitle: 'سوق الشطرة',
    nav: [
      { href: '#/', label: 'نظرة عامة', icon: 'chart', exact: true },
      { href: '#/approvals', label: 'طلبات الانضمام', icon: 'shield', count: counts.approvals },
      { href: '#/orders', label: 'الطلبات', icon: 'package' },
      { sep: 'السوق' },
      { href: '#/stores', label: 'المتاجر', icon: 'store' },
      { href: '#/products', label: 'المنتجات', icon: 'box' },
      { href: '#/drivers', label: 'السائقون', icon: 'truck', count: counts.driverPay },
      { href: '#/users', label: 'الحسابات', icon: 'users' },
      { href: '#/categories', label: 'الأقسام', icon: 'layers' },
      { sep: 'الإيرادات' },
      { href: '#/finance', label: 'المالية', icon: 'wallet', count: counts.payments },
      { href: '#/promotions', label: 'الإعلانات', icon: 'megaphone' },
      { href: '#/settings', label: 'الإعدادات والأسعار', icon: 'settings' },
      { href: 'index.html#/', label: 'فتح المتجر', icon: 'external' },
    ],
    footer: html`<button class="nav" data-action="logout">${icon('logout', 20)} تسجيل الخروج</button>`,
  });
}
export function adminShell() {
  const st = A.cache.stores || [],
    w = A.cache.workers || [],
    dp = A.cache.dpay || [],
    pr = A.cache.preq || [];
  return shell({
    approvals: st.filter((s) => !s.approved && !s.removed).length + w.filter((x) => !x.approved).length || 0,
    driverPay: dp.filter((p) => p.status === 'pending').length || 0,
    payments: (pr || []).filter((p) => p.status === 'pending').length || 0,
  });
}
const common = {
  logout: async () => (await confirmDialog('تسجيل الخروج', 'الخروج من لوحة الإدارة؟', { ok: 'خروج' })) && (await signOut(), location.reload()),
  reload: () => (clearData(), refresh()),
  retry: () => (clearData(), refresh()),
};
export const actions = (a = {}) => pageActions({ ...common, ...a });

function gate() {
  document.body.classList.remove('ws-mode');
  render(
    '#app',
    html`<div class="auth-wrap" style="margin-top:8vh"><div class="card"><div class="auth-logo"><img src="${LOGO}" alt=""><h1 style="margin:0">لوحة إدارة سوق الشطرة</h1><p class="muted" style="margin:0">${session.user ? 'هذا الحساب لا يملك صلاحية الإدارة.' : 'سجّل الدخول بحساب المدير'}</p></div>
    ${session.user ? html`<p class="ltr" style="text-align:center">${session.user.email}</p><button class="btn btn-primary btn-block" data-action="logout">تبديل الحساب</button>` : html`<button class="btn btn-outline btn-block btn-lg" data-action="google"><b style="color:#4285f4">G</b> الدخول باستخدام Google</button><div class="or">أو</div><form data-admin-login><label class="field"><span>البريد الإلكتروني</span><input name="email" type="email" required class="ltr" autocomplete="username"></label><label class="field"><span>كلمة المرور</span><input name="password" type="password" required class="ltr" autocomplete="current-password"></label><button class="btn btn-primary btn-block btn-lg">دخول</button></form>`}
    <p style="text-align:center;margin-top:14px"><a href="index.html">العودة إلى السوق</a></p></div></div>`,
  );
  document.querySelector('[data-admin-login]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = formData(e.target);
    busy(e.target.querySelector('button'), async () => {
      await signIn(v.email, v.password);
      await load();
    });
  });
  actions({ google: (b) => busy(b, () => signInWithGoogle()) });
}
const page =(title, fn) => async (ctx) => {
  if (!isAdmin()) return gate();
  const body = adminShell();
  wsTitle(title, html`<button class="btn btn-outline btn-sm" data-action="reload">${icon('refresh', 16)} تحديث</button>`);
  actions();
  render(body, spinnerBlock());
  try {
    await fn(ctx, body);
    if (isCurrent(ctx.token)) adminShell();
  } catch (e) {
    if (isCurrent(ctx.token)) render(body, errorBlock(e));
  }
};

// ---------- overview ----------
async function overview(ctx, body) {
  const from = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [o, st, w, dp, pr, sumR] = await Promise.all([orders(), stores(), workers(), deliveryPayments(), paymentRequests(), db.rpc('admin_finance_summary', { p_from: from.toISOString(), p_to: new Date(Date.now() + 864e5).toISOString() })]);
  if (!isCurrent(ctx.token)) return;
  const sum = sumR.error ? null : sumR.data;
  const today0 = new Date().setHours(0, 0, 0, 0);
  const todays = o.filter((x) => new Date(x.created_at) >= today0);
  const revenue = sum ? sum.platform_fees + sum.commissions + sum.delivery_share + sum.subscriptions + sum.promotions : null;
  const stuck = o.filter((x) => x.can_report_late || x.tracking?.late_reported_at).filter((x) => !['delivered', 'cancelled'].includes(x.status));
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = today0 - (13 - i) * 864e5;
    const list = o.filter((x) => { const t = new Date(x.created_at).getTime(); return t >= d && t < d + 864e5 && x.status !== 'cancelled'; });
    return { label: new Date(d).getDate() + '/' + (new Date(d).getMonth() + 1), n: list.length, v: list.reduce((a, x) => a + x.total, 0) };
  });
  const max = Math.max(1, ...days.map((d) => d.v));
  render(
    body,
    html`${!sum ? html`<div class="notice notice-warn">${icon('alert', 18)}<p><b>نظام الإيرادات غير مفعّل بعد.</b> شغّل ملف <span class="ltr">supabase/migrations/20261014090000_marketplace_revenue.sql</span> على قاعدة البيانات لتفعيل العمولات والباقات والإعلانات والدفع الإلكتروني.</p></div>` : ''}
    ${stuck.length ? html`<a class="notice notice-bad" href="#/orders?f=late" style="color:var(--ink)">${icon('clock', 18)}<p>${stuck.length} طلب متأخر يحتاج متابعة.</p></a>` : ''}
    <div class="stat-grid">
      <div class="stat highlight"><small>إيرادات السوق هذا الشهر</small><b>${revenue != null ? money(revenue) : '—'}</b><span class="small" style="opacity:.85">عمولات ورسوم واشتراكات وإعلانات</span></div>
      <div class="stat"><small>قيمة المبيعات المسلّمة (الشهر)</small><b>${sum ? money(sum.gmv) : '—'}</b><span class="small muted">${sum ? sum.orders_delivered + ' طلب' : ''}</span></div>
      <div class="stat"><small>طلبات اليوم</small><b>${todays.length}</b><span class="small muted">${money(todays.reduce((a, x) => a + x.total, 0))}</span></div>
      <div class="stat"><small>قيد التنفيذ</small><b>${o.filter((x) => ['new', 'accepted', 'delivery'].includes(x.status)).length}</b></div>
      <div class="stat"><small>متاجر معتمدة</small><b>${st.filter((s) => s.approved && !s.removed).length}</b><a class="small" href="#/approvals">${st.filter((s) => !s.approved && !s.removed).length} بانتظار الموافقة</a></div>
      <div class="stat"><small>سائقون معتمدون</small><b>${w.filter((x) => x.approved).length}</b><a class="small" href="#/approvals">${w.filter((x) => !x.approved).length} بانتظار الموافقة</a></div>
    </div>
    ${sum ? html`<section class="card"><h3>تفصيل الإيرادات هذا الشهر</h3><div class="stat-grid" style="margin:0">${[['رسوم الخدمة', sum.platform_fees], ['عمولات المتاجر', sum.commissions], ['حصة التوصيل', sum.delivery_share], ['اشتراكات الباقات', sum.subscriptions], ['الإعلانات المميزة', sum.promotions]].map(([l, v]) => html`<div class="stat" style="box-shadow:none"><small>${l}</small><b>${money(v)}</b></div>`)}</div></section>` : ''}
    <div class="two-col" style="grid-template-columns:1.5fr 1fr;margin-top:14px">
      <section class="card"><h3>المبيعات آخر ١٤ يومًا</h3><div class="chart">${days.map((d) => html`<div class="col" title="${d.label}: ${d.n} طلب · ${money(d.v)}"><i style="height:${Math.round((d.v / max) * 100)}%"></i><span>${d.label}</span></div>`)}</div></section>
      <section class="card"><h3>بانتظارك</h3>
        <div class="kv"><a href="#/approvals">متاجر جديدة</a>${badge(st.filter((s) => !s.approved && !s.removed).length, 'warn')}</div>
        <div class="kv"><a href="#/approvals">سائقون جدد</a>${badge(w.filter((x) => !x.approved).length, 'warn')}</div>
        <div class="kv"><a href="#/finance">إثباتات دفع المتاجر</a>${badge((pr || []).filter((x) => x.status === 'pending').length, 'warn')}</div>
        <div class="kv"><a href="#/drivers">تسويات السائقين</a>${badge(dp.filter((x) => x.status === 'pending').length, 'warn')}</div>
        ${sum?.refunds_due ? html`<div class="kv"><a href="#/finance">مبالغ واجبة الاسترجاع</a>${badge(money(sum.refunds_due), 'bad')}</div>` : ''}
      </section></div>
    <section class="card" style="margin-top:14px"><div class="card-head"><h3>أحدث الطلبات</h3><a href="#/orders">الكل</a></div>${o.slice(0, 8).map((x) => html`<div class="kv"><span><b class="ltr">${shortId(x.id)}</b> · ${x.customer_name} · ${money(x.total)} <small class="muted">${ago(x.created_at)}</small></span>${statusBadge(x)}</div>`)}${!o.length ? html`<p class="muted">لا توجد طلبات.</p>` : ''}</section>`,
  );
}

// ---------- approvals ----------
// Store categories: the admin can set or change any store's category inline.
export const storeCategories = async () => (await db.from('store_categories').select('*').order('position').order('name')).data || [];
export const storeCategorySelect = (s, cats) =>
  cats.length ? html`<select class="input input-sm" data-store-cat="${s.id}" aria-label="قسم المتجر"><option value="">بدون قسم</option>${cats.map((c) => html`<option value="${c.id}" ${s.store_category_id === c.id ? 'selected' : ''}>${c.name}${c.active === false ? ' (موقوف)' : ''}</option>`)}</select>` : '';
export function wireStoreCategorySelects(body) {
  body.querySelectorAll('[data-store-cat]').forEach((sel) =>
    sel.addEventListener('change', async () => {
      try {
        check(await db.rpc('admin_set_store_category', { p_store: sel.dataset.storeCat, p_category: sel.value || null }));
        clearData();
        toast('حُفظ قسم المتجر', 'success');
      } catch (e) {
        toast(e.message, 'error');
      }
    }),
  );
}
async function approvals(ctx, body) {
  const [st, w, dprof, ppl, scats] = await Promise.all([stores(true), workers(true), driverProfiles(true), people(), storeCategories()]);
  if (!isCurrent(ctx.token)) return;
  const pendingStores = st.filter((s) => !s.approved && !s.removed);
  const pendingDrivers = w.filter((x) => !x.approved);
  const person = (id) => ppl.find((p) => p.id === id) || {};
  const wa = (phone) => (phone ? html`<a class="btn btn-ok btn-sm" target="_blank" rel="noopener" data-follow href="https://wa.me/${String(phone).replace(/^0/, '964')}">${icon('whatsapp', 16)} واتساب</a>` : '');
  render(
    body,
    html`<section class="card"><h2>${icon('store', 20)} متاجر بانتظار الموافقة (${pendingStores.length})</h2>
      ${pendingStores.length ? pendingStores.map((s) => html`<div class="card" style="box-shadow:none;margin-top:10px"><div class="card-head"><div><b>${s.name}</b> <span class="muted small">${ago(s.created_at)}</span><div class="small">${person(s.owner_id).full_name || ''} · <span class="ltr">${person(s.owner_id).email || ''}</span></div></div><div style="display:flex;gap:6px">${wa(s.phone)}</div></div>
        <div class="small">${icon('phone', 14)} <span class="ltr">${s.phone}</span> · ${icon('pin', 14)} ${s.address || '—'} · ${s.store_kind === 'online' ? 'يبيع من البيت' : 'محل'}</div>${s.description ? html`<p class="small muted">${s.description}</p>` : ''}
        ${scats.length ? html`<label class="field" style="max-width:280px;margin-top:8px"><span>قسم المتجر</span>${storeCategorySelect(s, scats)}</label>` : ''}
        <div class="row-actions"><button class="btn btn-ok" data-action="approveStore" data-id="${s.id}">${icon('check', 18)} اعتماد المتجر</button><button class="btn btn-ghost" data-action="rejectStore" data-id="${s.id}">رفض</button></div></div>`) : html`<p class="muted">لا توجد طلبات.</p>`}</section>
    <section class="card"><h2>${icon('truck', 20)} سائقون بانتظار الموافقة (${pendingDrivers.length})</h2>
      ${pendingDrivers.length ? pendingDrivers.map((x) => { const d = dprof.find((p) => p.user_id === x.user_id) || {}; return html`<div class="card" style="box-shadow:none;margin-top:10px"><div class="card-head"><div><b>${d.full_name || person(x.user_id).full_name || 'بدون اسم'}</b> <span class="muted small">${ago(x.created_at)}</span></div>${wa(d.phone)}</div>
        <div class="small">${icon('phone', 14)} <span class="ltr">${d.phone || '—'}</span> · ${icon('pin', 14)} ${d.address || '—'} · ${d.vehicle || '—'}</div>
        <div class="row-actions">${d.user_id ? html`<button class="btn btn-ok" data-action="approveDriver" data-id="${x.user_id}">${icon('check', 18)} اعتماد السائق</button>` : html`<span class="muted small">لم يكمل بيانات التسجيل بعد.</span>`}</div></div>`; }) : html`<p class="muted">لا توجد طلبات.</p>`}</section>`,
  );
  wireStoreCategorySelects(body);
  actions({
    approveStore: (b) => busy(b, async () => { check(await db.rpc('approve_store', { p_store: b.dataset.id, p_approved: true })); toast('اعتُمد المتجر', 'success'); clearData(); refresh(); }),
    rejectStore: async (b) => (await confirmDialog('رفض المتجر', 'سيُزال طلب المتجر من القائمة.', { ok: 'رفض', danger: true })) && busy(b, async () => { check(await db.rpc('admin_set_store_removed', { p_store: b.dataset.id, p_removed: true })); clearData(); refresh(); }),
    approveDriver: (b) => busy(b, async () => { check(await db.rpc('admin_approve_driver', { p_driver: b.dataset.id, p_approved: true })); toast('اعتُمد السائق', 'success'); clearData(); refresh(); }),
  });
}

// ---------- users ----------
async function users(ctx, body) {
  const [ppl, st, w] = await Promise.all([people(true), stores(), workers()]);
  if (!isCurrent(ctx.token)) return;
  const q = normalizeArabic(ctx.query.get('q') || ''),
    f = ctx.query.get('f') || 'all';
  const role = (p) => (p.role === 'admin' ? 'admin' : st.some((s) => s.owner_id === p.id && s.approved) ? 'seller' : w.some((x) => x.user_id === p.id) ? 'driver' : 'buyer');
  const L = { all: 'الكل', buyer: 'زبائن', seller: 'تجار', driver: 'سائقون', admin: 'مدراء', disabled: 'موقوفون' };
  const list = ppl.filter((p) => (f === 'all' || (f === 'disabled' ? p.disabled : role(p) === f)) && (!q || normalizeArabic([p.full_name, p.email, p.phone].join(' ')).includes(q)));
  render(
    body,
    html`<form class="toolbar" data-q><input class="input" name="q" type="search" placeholder="ابحث بالاسم أو البريد أو الهاتف" value="${ctx.query.get('q') || ''}"><button class="btn btn-outline">${icon('search', 18)}</button></form>
    <div class="tabs">${Object.entries(L).map(([k, l]) => html`<a class="tab ${f === k ? 'active' : ''}" href="#/users?f=${k}">${l} (${ppl.filter((p) => k === 'all' || (k === 'disabled' ? p.disabled : role(p) === k)).length})</a>`)}</div>
    <div class="table-wrap"><table class="table"><thead><tr><th>الاسم</th><th>البريد</th><th>الهاتف</th><th>النوع</th><th>التسجيل</th><th></th></tr></thead><tbody>
    ${list.slice(0, 300).map((p) => html`<tr><td><b>${p.full_name || '—'}</b>${p.disabled ? html` ${badge('موقوف', 'bad')}` : ''}</td><td class="ltr">${p.email || ''}</td><td class="ltr">${p.phone || ''}</td><td>${L[role(p)]}</td><td>${dateTime(p.created_at)}</td><td>${p.role !== 'admin' ? html`<button class="btn btn-sm ${p.disabled ? 'btn-outline' : 'btn-ghost'}" data-action="toggleUser" data-id="${p.id}">${p.disabled ? 'إعادة تفعيل' : 'إيقاف'}</button>` : ''}</td></tr>`)}
    </tbody></table></div>${list.length > 300 ? html`<p class="muted">يُعرض أول ٣٠٠؛ استخدم البحث.</p>` : ''}`,
  );
  body.querySelector('[data-q]').addEventListener('submit', (e) => {
    e.preventDefault();
    go('/users', { q: e.target.q.value.trim(), f });
  });
  actions({
    toggleUser: async (b) => {
      const p = ppl.find((x) => x.id === b.dataset.id);
      if (!(await confirmDialog(p.disabled ? 'إعادة التفعيل' : 'إيقاف الحساب', p.disabled ? 'سيعود الحساب للعمل.' : 'لن يستطيع صاحب الحساب الطلب أو البيع أو التوصيل.', { ok: 'تأكيد', danger: !p.disabled }))) return;
      busy(b, async () => { check(await db.rpc('admin_set_account_disabled', { p_user: p.id, p_disabled: !p.disabled })); clearData(); refresh(); });
    },
  });
}

route('/', page('نظرة عامة', overview));
route('/approvals', page('طلبات الانضمام', approvals));
route('/users', page('الحسابات', users));
const lazy = (title, file, fn) => page(title, async (ctx, body) => (await import(file))[fn](ctx, body));
route('/orders', lazy('الطلبات', './market.js', 'ordersView'));
route('/stores', lazy('المتاجر', './market.js', 'storesView'));
route('/products', lazy('المنتجات', './market.js', 'productsView'));
route('/drivers', lazy('السائقون', './market.js', 'driversView'));
route('/categories', lazy('الأقسام والخصائص', './market.js', 'categoriesView'));
route('/finance', lazy('المالية', './revenue.js', 'financeView'));
route('/promotions', lazy('الإعلانات المميزة', './revenue.js', 'promotionsView'));
route('/settings', lazy('الإعدادات والأسعار', './revenue.js', 'settingsView'));
setNotFound(() => go('/', null, { replace: true }));
setGuard(() => (closeModals(), pageActions({}), true));
wireActions();
globalActions({ ...common });
const bar = document.getElementById('progress');
loading.listeners.add((n) => bar?.classList.toggle('on', n > 0));
let started = false;
onSession(() => started && refresh());
(async () => {
  await load().catch(console.error);
  if (location.hash.startsWith('#access_token') || location.hash.startsWith('#error')) history.replaceState(null, '', location.pathname + '#/');
  await start();
  started = true;
})();
export { html, render, icon, money, number, shortId, dateTime, ago, badge, current };
