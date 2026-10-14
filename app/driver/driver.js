import { html, render, formData } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageActions } from '../core/actions.js';
import { go, isCurrent } from '../core/router.js';
import { db, check } from '../core/db.js';
import { session, isDriver, signOut } from '../core/session.js';
import { participantOrders, getStores, getPlatform, STAGES } from '../core/api.js';
import { mountWorkspace, wsTitle } from '../core/workspace.js';
import { spinnerBlock, errorBlock, emptyState, toast, busy, confirmDialog, modal, badge, copyText } from '../core/ui.js';
import { money, shortId, dateTime, ago, digits } from '../core/format.js';
import { directionsLink, mapsLink } from '../core/map.js';

let poll;
function shell(offers = 0) {
  return mountWorkspace({
    id: 'driver',
    title: session.driverProfile?.full_name || session.profile?.full_name || 'السائق',
    subtitle: 'تطبيق السائق',
    nav: [
      { href: '#/driver', label: 'طلباتي الحالية', icon: 'truck', exact: true },
      { href: '#/driver/offers', label: 'طلبات متاحة', icon: 'bell', count: offers },
      { href: '#/driver/history', label: 'السجل', icon: 'list' },
      { href: '#/driver/money', label: 'الأرباح والتسوية', icon: 'wallet' },
      { href: '#/driver/profile', label: 'بياناتي', icon: 'user' },
      { href: '#/', label: 'السوق', icon: 'home' },
    ],
    footer: html`<button class="nav" data-action="logout">${icon('logout', 20)} تسجيل الخروج</button>`,
  });
}
const cod = (o) => o.payment_status !== 'paid';

export async function driverPage(ctx) {
  clearInterval(poll);
  if (!session.user) return go('/login', { role: 'driver', next: '/driver' }, { replace: true });
  if (!isDriver()) return go('/drive', null, { replace: true });
  const body = shell();
  const section = ctx.params.section || '';
  const common = { logout: async () => (await confirmDialog('تسجيل الخروج', 'الخروج من هذا الجهاز؟', { ok: 'خروج' })) && (await signOut(), go('/')), retry: () => driverPage(ctx) };
  pageActions(common);
  if (!session.driver.approved) {
    wsTitle('حسابك قيد المراجعة');
    return render(body, html`<section class="card success-hero"><div class="ring" style="background:var(--warn-soft);color:var(--warn)">${icon('clock', 40)}</div><h2>بانتظار موافقة الإدارة</h2><p class="muted">ستصلك إشعارات الطلبات فور تفعيل حسابك. تأكد من اكتمال بياناتك.</p><a class="btn btn-primary" href="#/drive">مراجعة بياناتي</a></section>`);
  }
  render(body, spinnerBlock());
  try {
    const views = { '': current, offers, history, money: moneyView, profile };
    await (views[section] || current)(ctx, body, common);
  } catch (e) {
    if (isCurrent(ctx.token)) render(body, errorBlock(e));
  }
}
async function refreshWorker() {
  const w = check(await db.from('delivery_workers').select('*').eq('user_id', session.user.id).maybeSingle());
  if (w) session.driver = w;
  return w;
}

async function current(ctx, body, common) {
  wsTitle('طلباتي الحالية', html`<button class="btn btn-outline btn-sm" data-action="reload">${icon('refresh', 16)}</button>`);
  const [orders, stores, contacts, offersList] = await Promise.all([participantOrders({ driver: session.user.id }), getStores(), db.rpc('assigned_delivery_contacts'), db.rpc('delivery_offer_details'), refreshWorker()]);
  if (!isCurrent(ctx.token)) return;
  shell((offersList.data || []).length);
  const sm = new Map(stores.map((s) => [s.id, s]));
  const active = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status)).sort((a, b) => (a.tracking?.queue_rank ?? 1e9) - (b.tracking?.queue_rank ?? 1e9));
  const today = orders.filter((o) => o.status === 'delivered' && new Date(o.tracking?.delivered_at || o.created_at) >= new Date().setHours(0, 0, 0, 0));
  const w = session.driver;
  const card = (o, i) => {
    const s = sm.get(o.store_id) || {},
      c = (contacts.data || []).find((x) => x.order_id === o.id);
    const t = o.tracking || {};
    return html`<article class="card" style="display:grid;gap:10px">
      <header style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div><b>${i + 1}. ${s.name || 'متجر'}</b> <span class="muted small ltr">${shortId(o.id)}</span></div>${badge(STAGES[t.stage] || o.status, o.status === 'delivery' ? 'info' : 'warn')}</header>
      ${o.status === 'new' ? html`<div class="notice notice-warn" style="margin:0">${icon('clock', 18)}<p>بانتظار موافقة المتجر قبل الاستلام.</p></div>` : t.ready_at ? html`<div class="notice notice-ok" style="margin:0">${icon('checkCircle', 18)}<p>الطلب جاهز للاستلام.</p></div>` : ''}
      <div class="grid-2" style="gap:10px">
        <div class="card" style="box-shadow:none;padding:12px"><small class="muted">${icon('store', 14)} الاستلام من</small><div><b>${s.name}</b></div><div class="small">${c?.pickup_address || s.address || ''}</div>${s.phone ? html`<a class="btn btn-outline btn-sm" href="tel:${s.phone}" data-follow style="margin-top:6px">${icon('phone', 14)} اتصال بالمتجر</a>` : ''}</div>
        <div class="card" style="box-shadow:none;padding:12px"><small class="muted">${icon('pin', 14)} التسليم إلى</small><div><b>${o.customer_name}</b></div><div class="small">${o.address}</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${o.customer_phone ? html`<a class="btn btn-outline btn-sm ltr" href="tel:${o.customer_phone}" data-follow>${icon('phone', 14)} ${o.customer_phone}</a>` : ''}${o.customer_lat != null ? html`<a class="btn btn-primary btn-sm" href="${directionsLink({ lat: o.customer_lat, lon: o.customer_lng })}" target="_blank" rel="noopener" data-follow>${icon('navigation', 14)} الاتجاهات</a>` : ''}</div></div>
      </div>
      <div class="small">${o.items.map((it) => html`<span class="badge" style="margin:2px">${it.product_name} × ${it.quantity}</span>`)}</div>
      ${o.note ? html`<p class="small muted" style="margin:0">${icon('edit', 14)} ${o.note.replace(/\s*\|\s*موقع الزبون:.*$/, '')}</p>` : ''}
      <div class="kv" style="background:var(--surface-2);padding:10px 12px;border-radius:12px">${cod(o) ? html`<span>${icon('cash', 18)} حصّل من الزبون</span><b style="font-size:1.2rem">${money(o.total)}</b>` : html`<span style="color:var(--ok)">${icon('checkCircle', 18)} مدفوع إلكترونيًا — لا تحصّل شيئًا</span><b>${money(0)}</b>`}</div>
      ${cod(o) ? html`<p class="muted small" style="margin:0">ادفع للمتجر ${money(o.goods)} عند الاستلام · أجرتك ${money(o.delivery_fee)}</p>` : html`<p class="muted small" style="margin:0">لا تدفع للمتجر؛ تحوّل الإدارة أجرتك ${money(o.delivery_fee)} إلى رصيدك.</p>`}
      <div class="row-actions" style="margin-top:0">
        ${o.status === 'accepted' && !t.picked_up_at ? html`<button class="btn btn-outline" data-action="stage" data-id="${o.id}" data-stage="PICKED_UP">${icon('package', 18)} استلمت الطلب</button>` : ''}
        ${o.status === 'accepted' ? html`<button class="btn btn-primary" data-action="stage" data-id="${o.id}" data-stage="ON_THE_WAY">${icon('truck', 18)} بدأت التوصيل</button>` : ''}
        ${['accepted', 'delivery'].includes(o.status) ? html`<button class="btn btn-ok" data-action="deliver" data-id="${o.id}">${icon('checkCircle', 18)} تم التسليم</button>` : ''}
        ${i > 0 ? html`<button class="btn btn-ghost" data-action="first" data-id="${o.id}">نقل للأعلى</button>` : ''}
      </div></article>`;
  };
  render(
    body,
    html`${w.amount_due >= w.debt_limit ? html`<a class="notice notice-bad" href="#/driver/money" style="color:var(--ink)">${icon('alert', 18)}<p>بلغت حد المستحقات (${money(w.amount_due)}). سدّد لتستقبل طلبات جديدة.</p></a>` : ''}
    <div class="stat-grid"><div class="stat highlight"><small>طلبات اليوم</small><b>${today.length}</b><span class="small" style="opacity:.85">أجرة ${money(today.reduce((n, o) => n + o.delivery_fee, 0))}</span></div><div class="stat"><small>قيد التوصيل</small><b>${active.length}</b></div><div class="stat"><small>طلبات متاحة</small><b>${(offersList.data || []).length}</b><a class="small" href="#/driver/offers">عرضها</a></div><div class="stat"><small>مستحق للتطبيق</small><b>${money(w.amount_due)}</b></div></div>
    ${active.length ? active.map(card) : emptyState('truck', 'لا توجد طلبات قيد التوصيل', 'اقبل طلبًا من الطلبات المتاحة.', html`<a class="btn btn-primary" href="#/driver/offers">الطلبات المتاحة</a>`)}`,
  );
  const reload = () => current(ctx, body, common);
  pageActions({
    ...common,
    reload,
    stage: (b) =>
      busy(b, async () => {
        check(await db.rpc('delivery_stage', { p_order: b.dataset.id, p_stage: b.dataset.stage }));
        toast(b.dataset.stage === 'ON_THE_WAY' ? 'أُبلغ الزبون أنك في الطريق' : 'تم التحديث', 'success');
        reload();
      }),
    deliver: async (b) => {
      const o = active.find((x) => x.id === b.dataset.id);
      if (!(await confirmDialog('تأكيد التسليم', cod(o) ? `هل سلّمت الطلب واستلمت ${money(o.total)} من الزبون؟` : 'هل سلّمت الطلب للزبون؟', { ok: 'نعم، تم التسليم' }))) return;
      busy(b, async () => {
        check(await db.rpc('delivery_step', { p_order: o.id, p_status: 'delivered' }));
        toast('أحسنت! تم تسليم الطلب', 'success');
        reload();
      });
    },
    first: (b) =>
      busy(b, async () => {
        const ids = [b.dataset.id, ...active.map((o) => o.id).filter((id) => id !== b.dataset.id)];
        check(await db.rpc('reorder_delivery', { p_orders: ids }));
        reload();
      }),
  });
  poll = setInterval(() => isCurrent(ctx.token) ? !document.hidden && !document.querySelector('dialog[open]') && reload() : clearInterval(poll), 30000);
}

async function offers(ctx, body, common) {
  wsTitle('طلبات متاحة', html`<button class="btn btn-outline btn-sm" data-action="reload">${icon('refresh', 16)}</button>`);
  const [list] = await Promise.all([db.rpc('delivery_offer_details').then(check), refreshWorker()]);
  if (!isCurrent(ctx.token)) return;
  const seen = new Set();
  const items = (list || []).filter((o) => !o.batch_id || (!seen.has(o.batch_id) && seen.add(o.batch_id)));
  shell(items.length);
  const w = session.driver,
    locked = w.amount_due >= w.debt_limit;
  render(
    body,
    html`${locked ? html`<div class="notice notice-bad">${icon('alert', 18)}<p>استقبال الطلبات متوقف حتى تسديد المستحقات. <a href="#/driver/money">التسوية</a></p></div>` : ''}
    ${items.length ? items.map((o) => html`<article class="card drv-offer" style="display:grid;gap:8px">
      <header style="display:flex;justify-content:space-between"><b>${icon('store', 16)} ${o.store_name}${o.batch_id ? html` <span class="badge badge-info">مسار عدة متاجر</span>` : ''}</b><span class="muted small">${ago(o.created_at)}</span></header>
      ${o.items?.length ? html`<div class="small">${o.items.map((i) => html`<span class="badge" style="margin:2px">${i.name} × ${i.quantity}</span>`)}</div>` : ''}
      <div class="small">${icon('pin', 14)} ${o.address || 'العنوان يظهر بعد القبول'}</div>
      <div class="kv"><span>المسافة ${o.route_km != null ? (+o.route_km).toFixed(1) + ' كم' : '—'}</span><b style="color:var(--ok);font-size:1.15rem">أجرتك ${money(o.delivery_fee)}</b></div>
      <div class="row-actions" style="margin-top:0"><button class="btn btn-primary" data-action="claim" data-id="${o.order_id}" ${locked ? 'disabled' : ''}>${icon('check', 18)} قبول التوصيل</button>${o.latitude != null ? html`<a class="btn btn-outline" href="${mapsLink({ lat: o.latitude, lon: o.longitude })}" target="_blank" rel="noopener" data-follow>${icon('map', 18)} الموقع</a>` : ''}<button class="btn btn-ghost" data-action="decline" data-id="${o.order_id}">تجاهل</button></div>
    </article>`) : emptyState('bell', 'لا توجد طلبات متاحة الآن', 'تتحدث القائمة تلقائيًا كل ٢٠ ثانية.')}`,
  );
  const reload = () => offers(ctx, body, common);
  pageActions({
    ...common,
    reload,
    claim: async (b) => {
      if (!(await confirmDialog('قبول الطلب', 'ستلتزم بتوصيل هذا الطلب. يبدأ الاستلام بعد موافقة المتجر.', { ok: 'قبول' }))) return;
      busy(b, async () => {
        check(await db.rpc('claim_route_delivery', { p_order: b.dataset.id }));
        toast('أُسند إليك الطلب', 'success');
        go('/driver');
      });
    },
    decline: (b) =>
      busy(b, async () => {
        check(await db.rpc('decline_delivery', { p_order: b.dataset.id }));
        reload();
      }),
  });
  poll = setInterval(() => (isCurrent(ctx.token) ? !document.hidden && !document.querySelector('dialog[open]') && reload() : clearInterval(poll)), 20000);
}

async function history(ctx, body, common) {
  wsTitle('السجل');
  const [orders, stores] = await Promise.all([participantOrders({ driver: session.user.id }), getStores()]);
  if (!isCurrent(ctx.token)) return;
  const sm = new Map(stores.map((s) => [s.id, s]));
  const done = orders.filter((o) => ['delivered', 'cancelled'].includes(o.status));
  render(body, done.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>الطلب</th><th>المتجر</th><th>التاريخ</th><th>الحالة</th><th>أجرتك</th></tr></thead><tbody>${done.map((o) => html`<tr><td class="ltr">${shortId(o.id)}</td><td>${sm.get(o.store_id)?.name || ''}</td><td>${dateTime(o.tracking?.delivered_at || o.created_at)}</td><td>${o.status === 'delivered' ? badge('تم التسليم', 'ok') : badge('ملغي', 'bad')}</td><td>${o.status === 'delivered' ? money(o.delivery_fee) : '—'}</td></tr>`)}</tbody></table></div>` : emptyState('list', 'لا يوجد سجل بعد'));
  pageActions(common);
}

async function moneyView(ctx, body, common) {
  wsTitle('الأرباح والتسوية');
  const [orders, payments, platform, fin] = await Promise.all([
    participantOrders({ driver: session.user.id }),
    db.from('delivery_payments').select('*').eq('driver_id', session.user.id).order('created_at', { ascending: false }).then(check),
    getPlatform(),
    db.rpc('driver_finance'),
    refreshWorker(),
  ]);
  if (!isCurrent(ctx.token)) return;
  const w = session.driver;
  const delivered = orders.filter((o) => o.status === 'delivered');
  const month = delivered.filter((o) => new Date(o.tracking?.delivered_at || o.created_at) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const credit = fin.error ? 0 : fin.data?.credit || 0;
  const qi = platform.transfer_accounts?.qi || platform.delivery.qi_number;
  const zc = platform.transfer_accounts?.zaincash;
  render(
    body,
    html`<div class="stat-grid">
      <div class="stat highlight"><small>أجورك هذا الشهر</small><b>${money(month.reduce((n, o) => n + o.delivery_fee, 0))}</b><span class="small" style="opacity:.85">${month.length} طلب</span></div>
      <div class="stat"><small>إجمالي الأجور</small><b>${money(delivered.reduce((n, o) => n + o.delivery_fee, 0))}</b></div>
      <div class="stat"><small>مستحق للتطبيق</small><b style="color:${w.amount_due ? 'var(--bad)' : 'inherit'}">${money(w.amount_due)}</b><span class="small muted">الحد ${money(w.debt_limit)}</span></div>
      ${credit > 0 ? html`<div class="stat"><small>مستحق لك (طلبات إلكترونية)</small><b style="color:var(--ok)">${money(credit)}</b></div>` : ''}
    </div>
    <div class="bar" style="margin-bottom:16px" title="نسبة المستحقات من الحد"><i style="width:${Math.min(100, Math.round((w.amount_due / Math.max(1, w.debt_limit)) * 100))}%;background:${w.amount_due >= w.debt_limit ? 'var(--bad)' : 'var(--brand)'}"></i></div>
    <section class="card"><h3>تسديد المستحقات</h3><p class="muted">حوّل المبلغ ثم أرسل رقم العملية. يُخصم من رصيدك بعد تأكيد الإدارة.</p>
      ${qi ? html`<p>كي كارد: <b class="ltr">${qi}</b> <button class="link-btn" data-action="copy" data-v="${qi}">نسخ</button></p>` : ''}${zc ? html`<p>زين كاش: <b class="ltr">${zc}</b> <button class="link-btn" data-action="copy" data-v="${zc}">نسخ</button></p>` : ''}
      <form data-pay class="grid-2"><label class="field"><span>المبلغ (د.ع)</span><input name="amount" type="number" min="1" value="${w.amount_due || ''}" required></label><label class="field"><span>رقم العملية</span><input name="receipt" required minlength="3" maxlength="400"></label><button class="btn btn-primary" ${w.amount_due ? '' : 'disabled'}>إرسال للتأكيد</button></form></section>
    <section class="card"><h3>طلبات التسوية</h3>${payments.length ? payments.map((p) => html`<div class="kv"><span>${money(p.amount)} <small class="muted">${dateTime(p.created_at)} · ${p.receipt}</small></span>${badge({ pending: 'قيد المراجعة', approved: 'مؤكد', rejected: 'مرفوض' }[p.status] || p.status, { approved: 'ok', rejected: 'bad' }[p.status] || 'warn')}</div>`) : html`<p class="muted">لا توجد طلبات تسوية.</p>`}</section>`,
  );
  body.querySelector('[data-pay]').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = formData(e.target),
      amount = Number(digits(v.amount));
    if (!Number.isInteger(amount) || amount < 1 || v.receipt.length < 3) return toast('أدخل المبلغ ورقم العملية', 'error');
    busy(e.target.querySelector('button'), async () => {
      check(await db.rpc('submit_delivery_payment', { p_amount: amount, p_receipt: v.receipt }));
      toast('أُرسل للمراجعة', 'success');
      moneyView(ctx, body, common);
    });
  });
  pageActions({ ...common, copy: (b) => copyText(b.dataset.v) });
}

async function profile(ctx, body, common) {
  wsTitle('بياناتي');
  const d = session.driverProfile || {};
  render(body, html`<section class="card" style="max-width:640px"><h3>${d.full_name || session.profile?.full_name}</h3><div class="kv"><span>الهاتف</span><b class="ltr">${d.phone || ''}</b></div><div class="kv"><span>البريد</span><b class="ltr">${session.user.email}</b></div><div class="kv"><span>المنطقة</span><b>${d.address || ''}</b></div><div class="kv"><span>وسيلة التوصيل</span><b>${d.vehicle || ''}</b></div><div class="kv"><span>الحالة</span>${session.driver.approved ? badge('معتمد', 'ok') : badge('قيد المراجعة', 'warn')}</div><a class="btn btn-outline" href="#/drive" style="margin-top:12px">${icon('edit', 18)} تعديل البيانات</a></section>`);
  pageActions(common);
}
export { modal };
