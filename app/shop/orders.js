import { html, render, safeUrl } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageActions } from '../core/actions.js';
import { href, go, isCurrent, current } from '../core/router.js';
import { db, check } from '../core/db.js';
import { participantOrders, STATUS, getStores, getProductsByIds, getPlatform, startOnlinePayment } from '../core/api.js';
import { session } from '../core/session.js';
import { spinnerBlock, errorBlock, emptyState, confirmDialog, toast, busy, badge, modal } from '../core/ui.js';
import { money, shortId, dateTime, ago } from '../core/format.js';
import { mountShop, setTitle } from './shell.js';

const TONE = { new: 'warn', accepted: 'info', delivery: 'info', delivered: 'ok', cancelled: 'bad' };
export const statusBadge = (o) => badge(STATUS[o.status] || o.status, TONE[o.status]);
export const payLabel = (o) =>
  ({ cod: 'الدفع عند الاستلام', zaincash: 'زين كاش', card: 'بطاقة' })[o.payment_method] +
  (o.payment_method !== 'cod' ? ({ paid: ' · مدفوع', unpaid: ' · لم يكتمل الدفع (يُحصّل نقدًا)', refund_due: ' · بانتظار الاسترجاع', refunded: ' · تم الاسترجاع' })[o.payment_status] || '' : '');

export function timeline(o) {
  const t = o.tracking || {};
  if (o.status === 'cancelled') return html`<ol class="timeline"><li class="done"><span>تم إرسال الطلب<small>${dateTime(o.created_at)}</small></span></li><li class="now" style="color:var(--bad)"><span>أُلغي الطلب<small>${dateTime(t.cancelled_at)}</small></span></li></ol>`;
  const steps = [
    ['تم إرسال الطلب', o.created_at, true],
    ['وافق المتجر وبدأ التجهيز', t.store_accepted_at, o.status !== 'new'],
    ['الطلب جاهز للاستلام', t.ready_at, !!t.ready_at],
    ['وافق سائق التوصيل', t.driver_accepted_at, !!o.driver_id],
    ['استلم السائق الطلب', t.picked_up_at, !!t.picked_up_at || ['delivery', 'delivered'].includes(o.status)],
    ['في الطريق إليك', t.on_the_way_at, ['delivery', 'delivered'].includes(o.status)],
    ['تم التسليم', t.delivered_at, o.status === 'delivered'],
  ];
  const nowIdx = steps.findIndex((s) => !s[2]);
  return html`<ol class="timeline">${steps.map(([label, at, done], i) => html`<li class="${done ? 'done' : i === nowIdx ? 'now' : ''}"><span>${label}${at ? html`<small>${dateTime(at)}</small>` : ''}</span></li>`)}</ol>`;
}

async function enrich(orders) {
  const [stores, products] = await Promise.all([getStores(), getProductsByIds(orders.flatMap((o) => o.items.map((i) => i.product_id)))]);
  const sm = new Map(stores.map((s) => [s.id, s])),
    pm = new Map(products.map((p) => [p.id, p]));
  return orders.map((o) => ({ ...o, store: sm.get(o.store_id), items: o.items.map((i) => ({ ...i, img: pm.get(i.product_id)?.img || '' })) }));
}

export async function ordersPage(ctx) {
  const main = await mountShop();
  setTitle('طلباتي');
  if (!session.user) return go('/login', { next: '/orders' }, { replace: true });
  const tab = ctx.query.get('tab') || 'active';
  render(main, spinnerBlock());
  try {
    const all = await enrich(await participantOrders({ buyer: session.user.id }));
    if (!isCurrent(ctx.token)) return;
    const groups = {
      active: all.filter((o) => !o.action?.hidden_at && !['delivered', 'cancelled'].includes(o.status)),
      done: all.filter((o) => !o.action?.hidden_at && o.status === 'delivered'),
      cancelled: all.filter((o) => !o.action?.hidden_at && o.status === 'cancelled'),
      hidden: all.filter((o) => o.action?.hidden_at),
    };
    const labels = { active: 'الحالية', done: 'المكتملة', cancelled: 'الملغاة', hidden: 'المخفية' };
    const list = groups[tab] || [];
    render(
      main,
      html`<div class="listing-bar"><h1 style="margin:0">طلباتي</h1><button class="btn btn-outline btn-sm" data-action="reload">${icon('refresh', 16)} تحديث</button></div>
      <div class="tabs">${Object.entries(labels).map(([k, l]) => html`<a class="tab ${tab === k ? 'active' : ''}" href="${href('/orders', { tab: k })}">${l} (${groups[k].length})</a>`)}</div>
      ${list.length ? list.map((o) => html`<a class="card order-card" href="${href('/orders/' + o.id)}" style="display:grid;color:var(--ink)">
        <header><div><b>${o.store?.name || 'متجر'}</b> <span class="muted small ltr">${shortId(o.id)}</span><div class="muted small">${ago(o.created_at)}</div></div>${statusBadge(o)}</header>
        <div class="order-items">${o.items.map((i) => html`<span class="thumb">${i.img ? html`<img class="thumb" src="${safeUrl(i.img)}" alt="">` : icon('box', 20)}</span>`)}</div>
        <div class="kv"><span class="muted">${o.items.reduce((n, i) => n + i.quantity, 0)} قطعة · ${payLabel(o)}</span><b>${money(o.total)}</b></div>
      </a>`) : emptyState('package', tab === 'active' ? 'لا توجد طلبات حالية' : 'لا توجد طلبات هنا', '', tab === 'active' ? html`<a class="btn btn-primary" href="#/">تسوّق الآن</a>` : '')}`,
    );
    pageActions({ reload: () => ordersPage(ctx), retry: () => ordersPage(ctx) });
  } catch (e) {
    if (isCurrent(ctx.token)) render(main, errorBlock(e));
  }
}

export async function orderPage(ctx) {
  const main = await mountShop();
  if (!session.user) return go('/login', { next: current.path }, { replace: true });
  render(main, spinnerBlock());
  const id = ctx.params.id;
  let timer;
  const load = async (quiet) => {
    try {
      const [rows, contacts, platform] = await Promise.all([participantOrders({ order: id }), db.rpc('assigned_delivery_contacts'), getPlatform()]);
      if (!isCurrent(ctx.token)) return clearInterval(timer);
      const [o] = await enrich(rows);
      if (!o) return render(main, emptyState('package', 'الطلب غير موجود', '', html`<a class="btn btn-primary" href="#/orders">طلباتي</a>`));
      setTitle('الطلب ' + shortId(o.id));
      const driver = (contacts.data || []).find((c) => c.order_id === o.id);
      const mine = o.buyer_id === session.user.id;
      const canCancel = mine && ((['new', 'accepted'].includes(o.status) && !o.driver_id) || (o.status !== 'delivered' && o.status !== 'cancelled' && o.tracking?.late_reported_at));
      const canReturn = mine && o.status === 'delivered' && o.action?.request_kind !== 'return';
      const canPay = mine && o.payment_status === 'unpaid' && !['delivered', 'cancelled'].includes(o.status) && platform.revenue_ready && (platform.payment_methods.zaincash || platform.payment_methods.card);
      render(
        main,
        html`<a href="#/orders" class="link-btn">${icon('chevR', 16)} طلباتي</a>
        <div class="listing-bar" style="margin-top:8px"><div><h1 style="margin:0">الطلب <span class="ltr">${shortId(o.id)}</span></h1><span class="muted small">${dateTime(o.created_at)}</span></div>${statusBadge(o)}</div>
        <div class="two-col"><div>
          <section class="card"><h2>${icon('truck', 20)} حالة الطلب</h2>${timeline(o)}
            ${driver && o.status !== 'cancelled' ? html`<div class="notice">${icon('user', 18)}<p>السائق: <b>${driver.full_name}</b>${driver.vehicle ? ` · ${driver.vehicle}` : ''}${driver.phone && o.status !== 'delivered' ? html` · <a class="ltr" href="tel:${driver.phone}" data-follow>${driver.phone}</a>` : ''}</p></div>` : ''}
            ${o.action?.request_kind ? html`<div class="notice notice-warn">${icon('undo', 18)}<p>${o.action.request_kind === 'return' ? 'أرسلت طلب إرجاع؛ سيتواصل معك المتجر.' : 'أرسلت طلب إلغاء للمراجعة.'}${o.action.reason ? ' السبب: ' + o.action.reason : ''}</p></div>` : ''}
            <div class="row-actions">
              ${o.driver_id && !['delivered', 'cancelled'].includes(o.status) && mine ? html`<button class="btn btn-outline" data-action="help">${icon('help', 18)} أحتاج مساعدة</button>` : ''}
              ${o.can_report_late && !o.tracking?.late_reported_at && mine ? html`<button class="btn btn-outline" data-action="late">${icon('clock', 18)} تأخر الطلب</button>` : ''}
              ${canCancel ? html`<button class="btn btn-danger" data-action="cancel">${icon('x', 18)} إلغاء الطلب</button>` : ''}
              ${canReturn ? html`<button class="btn btn-outline" data-action="return">${icon('undo', 18)} طلب إرجاع</button>` : ''}
              ${mine ? html`<button class="btn btn-ghost" data-action="${o.action?.hidden_at ? 'restore' : 'hide'}">${o.action?.hidden_at ? 'إظهار في قائمتي' : 'إخفاء من قائمتي'}</button>` : ''}
            </div>
          </section>
          <section class="card"><h2>${icon('store', 20)} ${o.store?.name || 'المتجر'}</h2>
            ${o.items.map((i) => html`<div class="line" style="grid-template-columns:64px 1fr auto"><span class="thumb" style="width:64px;height:64px">${i.img ? html`<img class="thumb" style="width:64px;height:64px" src="${safeUrl(i.img)}" alt="">` : icon('box', 20)}</span><div><a class="name" href="${href('/p/' + i.product_id)}">${i.product_name}</a>${i.label ? html`<div class="meta">${i.label}</div>` : ''}<div class="meta">${money(i.price)} × ${i.quantity}</div></div><b>${money(i.price * i.quantity)}</b></div>`)}
          </section>
        </div>
        <aside class="summary"><section class="card"><h2>المبلغ</h2>
          <div class="kv"><span>المنتجات</span><b>${money(o.goods)}</b></div>
          <div class="kv"><span>التوصيل</span><b>${money(o.delivery_fee)}</b></div>
          ${o.platform_fee ? html`<div class="kv"><span>رسوم الخدمة</span><b>${money(o.platform_fee)}</b></div>` : ''}
          <div class="kv total"><span>الإجمالي</span><b>${money(o.total)}</b></div>
          <div class="notice ${o.payment_status === 'paid' ? 'notice-ok' : ''}" style="margin-top:10px">${icon(o.payment_method === 'cod' ? 'cash' : 'wallet', 18)}<p>${payLabel(o)}</p></div>
          ${canPay ? html`<div class="row-actions">${platform.payment_methods.zaincash ? html`<button class="btn btn-primary" data-action="pay" data-m="zaincash">ادفع بزين كاش</button>` : ''}${platform.payment_methods.card ? html`<button class="btn btn-outline" data-action="pay" data-m="card">ادفع بالبطاقة</button>` : ''}</div>` : ''}
        </section>
        <section class="card"><h2>${icon('pin', 20)} التوصيل إلى</h2><p><b>${o.customer_name}</b><br><span class="ltr">${o.customer_phone || ''}</span><br>${o.address}</p>${o.note ? html`<p class="muted small">${o.note.replace(/\s*\|\s*موقع الزبون:.*$/, '')}</p>` : ''}</section></aside></div>`,
      );
    } catch (e) {
      if (!quiet && isCurrent(ctx.token)) render(main, errorBlock(e));
    }
  };
  const act = (b, action, reason = '') =>
    busy(b, async () => {
      const r = check(await db.rpc('customer_order_action', { p_order: id, p_action: action, p_reason: reason }));
      toast(r === 'cancelled' ? 'أُلغي الطلب' : r === 'requested' ? 'أُرسل طلبك للمراجعة' : 'تم', 'success');
      await load();
    });
  pageActions({
    cancel: async (b) => {
      const r = await confirmDialog('إلغاء الطلب', 'هل تريد إلغاء هذا الطلب؟ تعود الكمية للمتجر.', { ok: 'إلغاء الطلب', danger: true, cancel: 'رجوع', input: { label: 'السبب (اختياري)' } });
      if (r) act(b, 'cancel', r.value);
    },
    return: async (b) => {
      const r = await confirmDialog('طلب إرجاع', 'سيصل طلبك إلى المتجر والإدارة للتواصل معك.', { ok: 'إرسال الطلب', input: { label: 'سبب الإرجاع' } });
      if (r) act(b, 'return', r.value);
    },
    hide: (b) => act(b, 'hide'),
    restore: (b) => act(b, 'restore'),
    help: (b) =>
      busy(b, async () => {
        const r = check(await db.rpc('customer_delivery_action', { p_order: id, p_action: 'help' }));
        modal('التواصل مع السائق', html`<p>أبلغنا الإدارة بطلب المساعدة. يمكنك الاتصال بالسائق مباشرة:</p>${r?.phone ? html`<a class="btn btn-primary btn-block ltr" href="tel:${r.phone}" data-follow>${icon('phone', 18)} ${r.phone}</a>` : html`<p class="muted">رقم السائق غير متاح.</p>`}`, { size: 'sm' });
      }),
    late: async (b) => {
      if (!(await confirmDialog('الإبلاغ عن تأخر', 'سنبلغ الإدارة بالتأخير، وبعدها يمكنك إلغاء الطلب إن رغبت.', { ok: 'إبلاغ' }))) return;
      busy(b, async () => {
        check(await db.rpc('customer_delivery_action', { p_order: id, p_action: 'late' }));
        toast('وصل بلاغك للإدارة. يمكنك الآن إلغاء الطلب إن أردت.', 'success');
        await load();
      });
    },
    pay: (b) => busy(b, () => startOnlinePayment('order', [id], b.dataset.m, '#/orders/' + id)),
    retry: () => load(),
  });
  await load();
  timer = setInterval(() => {
    if (!isCurrent(ctx.token)) return clearInterval(timer);
    if (!document.hidden && !document.querySelector('dialog[open]')) load(true);
  }, 30000);
}
