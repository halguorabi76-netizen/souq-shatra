import { html, render, safeUrl, formData } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { go, refresh, isCurrent, href } from '../core/router.js';
import { db, check, publicUrl } from '../core/db.js';
import { invalidate, STATUS } from '../core/api.js';
import { emptyState, toast, busy, confirmDialog, modal, badge } from '../core/ui.js';
import { money, shortId, dateTime, ago, normalizeArabic } from '../core/format.js';
import { mapsLink } from '../core/map.js';
import { statusBadge, timeline, payLabel } from '../shop/orders.js';
import { orders, stores, people, workers, driverProfiles, deliveryPayments, actions, clearData } from './main.js';

// ---------- orders ----------
export async function ordersView(ctx, body) {
  const [o, st, contacts] = await Promise.all([orders(true), stores(), db.rpc('assigned_delivery_contacts')]);
  if (!isCurrent(ctx.token)) return;
  const sm = new Map(st.map((s) => [s.id, s]));
  const f = ctx.query.get('f') || 'active',
    q = normalizeArabic(ctx.query.get('q') || '');
  const F = {
    active: ['قيد التنفيذ', (x) => ['new', 'accepted', 'delivery'].includes(x.status)],
    late: ['متأخرة', (x) => (x.can_report_late || x.tracking?.late_reported_at) && !['delivered', 'cancelled'].includes(x.status)],
    nodriver: ['بلا سائق', (x) => ['new', 'accepted'].includes(x.status) && !x.driver_id],
    delivered: ['مسلّمة', (x) => x.status === 'delivered'],
    cancelled: ['ملغاة', (x) => x.status === 'cancelled'],
    refund: ['استرجاع', (x) => x.payment_status === 'refund_due'],
    all: ['الكل', () => true],
  };
  const list = o.filter(F[f]?.[1] || F.all[1]).filter((x) => !q || normalizeArabic([x.id, x.customer_name, x.customer_phone, sm.get(x.store_id)?.name].join(' ')).includes(q));
  render(
    body,
    html`<form class="toolbar" data-q><input class="input" name="q" type="search" placeholder="رقم الطلب، اسم الزبون، الهاتف، المتجر" value="${ctx.query.get('q') || ''}"><button class="btn btn-outline">${icon('search', 18)}</button></form>
    <div class="tabs">${Object.entries(F).map(([k, [l, fn]]) => html`<a class="tab ${f === k ? 'active' : ''}" href="${href('/orders', { f: k })}">${l} (${o.filter(fn).length})</a>`)}</div>
    ${list.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>الطلب</th><th>المتجر</th><th>الزبون</th><th>المبلغ</th><th>الدفع</th><th>الحالة</th><th>الوقت</th></tr></thead><tbody>
      ${list.slice(0, 300).map((x) => html`<tr class="clickable" data-action="open" data-id="${x.id}"><td class="ltr">${shortId(x.id)}</td><td>${sm.get(x.store_id)?.name || ''}</td><td>${x.customer_name}<div class="muted small ltr">${x.customer_phone || ''}</div></td><td>${money(x.total)}</td><td class="small">${payLabel(x)}</td><td>${statusBadge(x)}${!x.driver_id && ['new', 'accepted'].includes(x.status) ? html`<div class="small" style="color:var(--warn)">بلا سائق</div>` : ''}</td><td class="small">${ago(x.created_at)}</td></tr>`)}
    </tbody></table></div>` : emptyState('package', 'لا توجد طلبات هنا')}`,
  );
  body.querySelector('[data-q]').addEventListener('submit', (e) => {
    e.preventDefault();
    go('/orders', { f, q: e.target.q.value.trim() });
  });
  actions({
    open: (b) => {
      const x = o.find((y) => y.id === b.dataset.id),
        s = sm.get(x.store_id) || {},
        d = (contacts.data || []).find((c) => c.order_id === x.id);
      const m = modal(
        'الطلب ' + shortId(x.id),
        html`<div class="grid-2"><div>${timeline(x)}</div><div>
          <div class="kv"><span>المتجر</span><b>${s.name}</b></div><div class="kv"><span>هاتف المتجر</span><a class="ltr" href="tel:${s.phone}" data-follow>${s.phone}</a></div>
          <div class="kv"><span>الزبون</span><b>${x.customer_name}</b></div><div class="kv"><span>هاتف الزبون</span><a class="ltr" href="tel:${x.customer_phone}" data-follow>${x.customer_phone}</a></div>
          <div class="kv"><span>السائق</span><b>${d ? d.full_name + ' · ' + (d.phone || '') : '—'}</b></div>
          <p class="small">${x.address}${x.customer_lat != null ? html` · <a href="${mapsLink({ lat: x.customer_lat, lon: x.customer_lng })}" target="_blank" rel="noopener" data-follow>الخريطة</a>` : ''}</p>
          ${x.internal?.inference ? html`<div class="notice notice-warn">${icon('info', 16)}<p>${x.internal.inference}</p></div>` : ''}</div></div>
        <hr class="divider">${x.items.map((i) => html`<div class="kv"><span>${i.product_name}${i.label ? ' · ' + i.label : ''} × ${i.quantity}</span><b>${money(i.price * i.quantity)}</b></div>`)}
        <div class="kv"><span>التوصيل</span><b>${money(x.delivery_fee)}</b></div><div class="kv"><span>رسوم الخدمة</span><b>${money(x.platform_fee)}</b></div>${x.commission_amount != null ? html`<div class="kv"><span>عمولة السوق</span><b>${money(x.commission_amount)}</b></div>` : ''}
        <div class="kv total"><span>الإجمالي</span><b>${money(x.total)}</b></div><p class="small muted">${payLabel(x)} · ${dateTime(x.created_at)}</p>
        <div class="row-actions">${['new', 'accepted'].includes(x.status) ? html`<button class="btn btn-danger" data-x="cancel">إلغاء الطلب</button>` : ''}${x.payment_status === 'refund_due' ? html`<button class="btn btn-primary" data-x="refunded">تم إرجاع المبلغ للزبون</button>` : ''}</div>`,
        { size: 'lg' },
      );
      m.querySelector('[data-x=cancel]')?.addEventListener('click', async (e) => {
        if (!(await confirmDialog('إلغاء الطلب', 'سيُلغى الطلب وتعود الكمية للمخزون.', { ok: 'إلغاء', danger: true }))) return;
        busy(e.target, async () => { check(await db.rpc('set_order_status', { p_order: x.id, p_status: 'cancelled' })); m.close(); clearData(); refresh(); });
      });
      m.querySelector('[data-x=refunded]')?.addEventListener('click', (e) => busy(e.target, async () => { check(await db.rpc('admin_mark_refunded', { p_order: x.id })); m.close(); clearData(); refresh(); }));
    },
  });
}

// ---------- stores ----------
export async function storesView(ctx, body) {
  const [st, ppl, bal, plans] = await Promise.all([stores(true), people(), db.rpc('admin_balances'), db.from('seller_plans').select('*').order('position')]);
  if (!isCurrent(ctx.token)) return;
  const balances = new Map((bal.data?.stores || []).map((b) => [b.store_id, b]));
  const f = ctx.query.get('f') || 'approved';
  const F = { approved: ['معتمدة', (s) => s.approved && !s.removed], pending: ['بانتظار الموافقة', (s) => !s.approved && !s.removed], removed: ['موقوفة', (s) => s.removed] };
  const list = st.filter(F[f][1]);
  render(
    body,
    html`<div class="tabs">${Object.entries(F).map(([k, [l, fn]]) => html`<a class="tab ${f === k ? 'active' : ''}" href="#/stores?f=${k}">${l} (${st.filter(fn).length})</a>`)}</div>
    ${list.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>المتجر</th><th>المالك</th><th>الباقة</th><th>الرصيد</th><th>الحالة</th><th></th></tr></thead><tbody>
    ${list.map((s) => { const b = balances.get(s.id); const owner = ppl.find((p) => p.id === s.owner_id) || {}; return html`<tr><td><div class="cell-flex"><span class="thumb">${s.image_path ? html`<img class="thumb" src="${safeUrl(publicUrl(s.image_path))}" alt="">` : icon('store', 18)}</span><div><a href="index.html#/s/${s.id}" target="_blank" data-follow><b>${s.name}</b></a>${s.verified ? html` <span class="verified">${icon('verified', 14)}</span>` : ''}<div class="muted small ltr">${s.phone}</div></div></div></td>
      <td>${owner.full_name || ''}<div class="muted small ltr">${owner.email || ''}</div></td><td>${b?.plan || '—'}</td><td>${b ? html`<b style="color:${b.balance > 0 ? 'var(--bad)' : b.balance < 0 ? 'var(--ok)' : 'inherit'}">${money(Math.abs(b.balance))}</b><div class="muted small">${b.balance > 0 ? 'عليه' : b.balance < 0 ? 'له' : ''}</div>` : '—'}</td>
      <td>${s.removed ? badge('موقوف', 'bad') : s.approved ? badge('معتمد', 'ok') : badge('بانتظار', 'warn')}</td>
      <td style="white-space:nowrap"><button class="btn btn-sm btn-outline" data-action="manage" data-id="${s.id}">إدارة</button></td></tr>`; })}
    </tbody></table></div>` : emptyState('store', 'لا توجد متاجر هنا')}`,
  );
  actions({
    manage: (b) => {
      const s = st.find((x) => x.id === b.dataset.id),
        bl = balances.get(s.id);
      const m = modal(
        s.name,
        html`<div class="row-actions" style="margin-top:0">
          ${!s.approved ? html`<button class="btn btn-ok" data-x="approve">اعتماد</button>` : ''}
          <button class="btn btn-outline" data-x="verify">${s.verified ? 'إلغاء التوثيق' : 'توثيق المتجر ✓'}</button>
          <button class="btn ${s.removed ? 'btn-outline' : 'btn-danger'}" data-x="remove">${s.removed ? 'إعادة المتجر' : 'إيقاف المتجر'}</button></div>
        ${!plans.error ? html`<hr class="divider"><h3>منح باقة</h3><form data-grant class="grid-2"><label class="field"><span>الباقة</span><select name="plan">${(plans.data || []).map((p) => html`<option value="${p.id}">${p.name}</option>`)}</select></label><label class="field"><span>الأشهر</span><input name="months" type="number" min="1" max="12" value="1"></label><button class="btn btn-outline">منح مجانًا</button></form>
        <hr class="divider"><h3>حركة مالية</h3><p class="muted small">الرصيد الحالي: ${bl ? money(bl.balance) + (bl.balance > 0 ? ' (عليه)' : bl.balance < 0 ? ' (له)' : '') : '—'}</p>
        <form data-ledger><div class="grid-2"><label class="field"><span>النوع</span><select name="kind"><option value="payout">حوّلنا له مبلغًا (يزيد ما عليه)</option><option value="settlement">استلمنا منه مبلغًا (ينقص ما عليه)</option><option value="adjustment">تسوية</option></select></label><label class="field"><span>المبلغ</span><input name="amount" type="number" min="1" required></label></div><label class="field"><span>ملاحظة</span><input name="note" required minlength="3"></label><button class="btn btn-primary">تسجيل</button></form>` : ''}`,
      );
      const run = (btn, fn) => busy(btn, async () => { await fn(); m.close(); clearData(); invalidate('stores'); refresh(); });
      m.querySelector('[data-x=approve]')?.addEventListener('click', (e) => run(e.target, async () => check(await db.rpc('approve_store', { p_store: s.id, p_approved: true }))));
      m.querySelector('[data-x=verify]').addEventListener('click', (e) => run(e.target, async () => check(await db.from('stores').update({ verified: !s.verified }).eq('id', s.id).select('id').single())));
      m.querySelector('[data-x=remove]').addEventListener('click', async (e) => (s.removed || (await confirmDialog('إيقاف المتجر', 'ستختفي منتجات المتجر من السوق.', { ok: 'إيقاف', danger: true }))) && run(e.target, async () => check(await db.rpc('admin_set_store_removed', { p_store: s.id, p_removed: !s.removed }))));
      m.querySelector('[data-grant]')?.addEventListener('submit', (e) => { e.preventDefault(); const v = formData(e.target); run(e.target.querySelector('button'), async () => check(await db.rpc('admin_grant_subscription', { p_store: s.id, p_plan: v.plan, p_months: +v.months }))); });
      m.querySelector('[data-ledger]')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = formData(e.target),
          amt = Math.abs(+v.amount);
        const signed = v.kind === 'settlement' ? -amt : amt;
        run(e.target.querySelector('button'), async () => check(await db.rpc('admin_ledger_entry', { p_party_type: 'store', p_party: s.id, p_kind: v.kind, p_amount: signed, p_note: v.note })));
      });
    },
  });
}

// ---------- products ----------
export async function productsView(ctx, body) {
  const q = (ctx.query.get('q') || '').trim(),
    f = ctx.query.get('f') || 'all';
  let query = db.from('products').select('*').order('created_at', { ascending: false }).limit(200);
  if (q) query = query.ilike('name', `*${q.replace(/[*,()]/g, '')}*`);
  if (f === 'blocked') query = query.eq('blocked', true);
  const [rows, st] = await Promise.all([query.then(check), stores()]);
  if (!isCurrent(ctx.token)) return;
  const sm = new Map(st.map((s) => [s.id, s]));
  render(
    body,
    html`<form class="toolbar" data-q><input class="input" name="q" type="search" placeholder="ابحث عن منتج" value="${q}"><button class="btn btn-outline">${icon('search', 18)}</button></form>
    <div class="tabs"><a class="tab ${f === 'all' ? 'active' : ''}" href="#/products">الكل</a><a class="tab ${f === 'blocked' ? 'active' : ''}" href="#/products?f=blocked">المحظورة</a></div>
    ${rows.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>المنتج</th><th>المتجر</th><th>السعر</th><th>المخزون</th><th>الحالة</th><th></th></tr></thead><tbody>
    ${rows.map((p) => html`<tr><td><div class="cell-flex"><span class="thumb">${p.image_path ? html`<img class="thumb" src="${safeUrl(publicUrl(p.image_path))}" alt="">` : icon('image', 18)}</span><a href="index.html#/p/${p.id}" target="_blank" data-follow>${p.name}</a></div></td><td>${sm.get(p.store_id)?.name || ''}</td><td>${money(p.price)}</td><td>${p.stock}</td><td>${p.blocked ? badge('محظور', 'bad') : p.active ? badge('منشور', 'ok') : badge('مؤرشف')}</td><td><button class="btn btn-sm ${p.blocked ? 'btn-outline' : 'btn-ghost'}" data-action="block" data-id="${p.id}" data-on="${p.blocked ? '' : '1'}">${p.blocked ? 'رفع الحظر' : 'حظر'}</button></td></tr>`)}
    </tbody></table></div>` : emptyState('box', 'لا توجد منتجات')}`,
  );
  body.querySelector('[data-q]').addEventListener('submit', (e) => { e.preventDefault(); go('/products', { q: e.target.q.value.trim(), f }); });
  actions({
    block: async (b) => {
      if (b.dataset.on && !(await confirmDialog('حظر المنتج', 'سيختفي المنتج من السوق ويُبلَّغ البائع.', { ok: 'حظر', danger: true }))) return;
      busy(b, async () => { check(await db.rpc('admin_set_product_blocked', { p_product: b.dataset.id, p_blocked: !!b.dataset.on })); invalidate(); refresh(); });
    },
  });
}

// ---------- drivers ----------
export async function driversView(ctx, body) {
  const [w, dprof, pays, bal] = await Promise.all([workers(true), driverProfiles(true), deliveryPayments(true), db.rpc('admin_balances')]);
  if (!isCurrent(ctx.token)) return;
  const credit = new Map((bal.data?.drivers || []).map((d) => [d.user_id, d.credit]));
  const name = (id) => dprof.find((d) => d.user_id === id)?.full_name || id.slice(0, 8);
  const pending = pays.filter((p) => p.status === 'pending');
  render(
    body,
    html`${pending.length ? html`<section class="card"><h3>${icon('wallet', 18)} تسويات بانتظار التأكيد (${pending.length})</h3>${pending.map((p) => html`<div class="kv"><span><b>${name(p.driver_id)}</b> · ${money(p.amount)} <small class="muted">${dateTime(p.created_at)} · رقم العملية: ${p.receipt}</small></span><span style="display:flex;gap:6px"><button class="btn btn-ok btn-sm" data-action="pay" data-id="${p.id}" data-ok="1">تأكيد الاستلام</button><button class="btn btn-ghost btn-sm" data-action="pay" data-id="${p.id}">رفض</button></span></div>`)}</section>` : ''}
    <div class="table-wrap" style="margin-top:14px"><table class="table"><thead><tr><th>السائق</th><th>الهاتف</th><th>الوسيلة</th><th>مستحق للتطبيق</th><th>مستحق له</th><th>الحالة</th><th></th></tr></thead><tbody>
    ${w.map((x) => { const d = dprof.find((p) => p.user_id === x.user_id) || {}; return html`<tr><td><b>${d.full_name || '—'}</b><div class="muted small">${d.address || ''}</div></td><td class="ltr">${d.phone || ''}</td><td>${d.vehicle || ''}</td><td><b style="color:${x.amount_due >= x.debt_limit ? 'var(--bad)' : 'inherit'}">${money(x.amount_due)}</b><div class="muted small">الحد ${money(x.debt_limit)}</div></td><td>${credit.get(x.user_id) ? money(credit.get(x.user_id)) : '—'}</td><td>${x.approved ? badge('معتمد', 'ok') : badge('بانتظار', 'warn')}</td><td style="white-space:nowrap"><button class="btn btn-sm btn-outline" data-action="toggle" data-id="${x.user_id}">${x.approved ? 'إيقاف' : 'اعتماد'}</button>${credit.get(x.user_id) ? html` <button class="btn btn-sm btn-ghost" data-action="payout" data-id="${x.user_id}">تسجيل تحويل</button>` : ''}</td></tr>`; })}
    </tbody></table></div>`,
  );
  actions({
    pay: (b) => busy(b, async () => { check(await db.rpc('admin_review_delivery_payment', { p_payment: b.dataset.id, p_approved: !!b.dataset.ok })); toast('تمت المراجعة', 'success'); clearData(); refresh(); }),
    toggle: async (b) => {
      const x = w.find((y) => y.user_id === b.dataset.id);
      if (x.approved && !(await confirmDialog('إيقاف السائق', 'لن تصله طلبات جديدة. طلباته الحالية تبقى.', { ok: 'إيقاف', danger: true }))) return;
      busy(b, async () => { check(await db.rpc('admin_approve_driver', { p_driver: x.user_id, p_approved: !x.approved })); clearData(); refresh(); });
    },
    payout: (b) => {
      const amount = credit.get(b.dataset.id);
      const m = modal('تحويل مستحقات السائق', html`<form><p class="muted">مستحق له: ${money(amount)}</p><label class="field"><span>المبلغ المحوّل</span><input name="amount" type="number" min="1" value="${amount}"></label><label class="field"><span>ملاحظة / رقم العملية</span><input name="note" required minlength="3"></label><button class="btn btn-primary btn-block">تسجيل</button></form>`, { size: 'sm' });
      m.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); const v = formData(e.target); busy(e.target.querySelector('button'), async () => { check(await db.rpc('admin_ledger_entry', { p_party_type: 'driver', p_party: b.dataset.id, p_kind: 'payout', p_amount: Math.abs(+v.amount), p_note: v.note })); m.close(); clearData(); refresh(); }); });
    },
  });
}

// ---------- categories ----------
const TYPES = [['text', 'نص'], ['number', 'رقم'], ['date', 'تاريخ'], ['select', 'قائمة']];
export async function categoriesView(ctx, body) {
  const cats = check(await db.from('catalog_categories').select('*').order('position')) || [];
  if (!isCurrent(ctx.token)) return;
  const roots = cats.filter((c) => !c.parent_id);
  render(
    body,
    html`<div class="toolbar"><button class="btn btn-primary" data-action="edit">${icon('plus', 18)} قسم جديد</button><span class="muted">الفئات الفرعية ترث خصائص القسم. إيقاف القسم يخفيه دون حذف المنتجات.</span></div>
    ${roots.map((r) => html`<section class="card"><div class="card-head"><h3>${r.name} ${r.active === false ? badge('موقوف') : ''}</h3><span><button class="btn btn-sm btn-outline" data-action="edit" data-id="${r.id}">تعديل</button> <button class="btn btn-sm btn-ghost" data-action="edit" data-parent="${r.id}">${icon('plus', 14)} فئة فرعية</button></span></div>
      <div class="muted small">${(r.attributes || []).length} خاصية</div><div class="chips" style="margin-top:8px">${cats.filter((c) => c.parent_id === r.id).map((c) => html`<button class="chip" data-action="edit" data-id="${c.id}">${c.name}${c.active === false ? ' (موقوف)' : ''}</button>`)}</div></section>`)}`,
  );
  actions({
    edit: (b) => {
      const c = cats.find((x) => x.id === b.dataset.id) || { id: null, name: '', parent_id: b.dataset.parent || null, active: true, attributes: [] };
      const attrs = structuredClone(c.attributes || []);
      const row = (a, i) => html`<fieldset style="border:1px solid var(--line);border-radius:12px;padding:10px;margin-bottom:8px"><div class="grid-2"><label class="field"><span>المفتاح (إنجليزي ثابت)</span><input class="ltr" name="key${i}" value="${a.key}"></label><label class="field"><span>الاسم المعروض</span><input name="label${i}" value="${a.label}"></label><label class="field"><span>النوع</span><select name="type${i}">${TYPES.map(([v, l]) => html`<option value="${v}" ${a.type === v ? 'selected' : ''}>${l}</option>`)}</select></label><label class="field"><span>الخيارات (مفصولة بفاصلة)</span><input name="options${i}" value="${(a.options || []).join('، ')}"></label></div><label class="check"><input type="checkbox" name="variant${i}" ${a.variant ? 'checked' : ''}> تُستخدم للنسخ (لون، مقاس…)</label><label class="check"><input type="checkbox" name="required${i}" ${a.required ? 'checked' : ''}> مطلوبة</label><button type="button" class="btn btn-ghost btn-sm" data-remove="${i}">حذف الخاصية</button></fieldset>`;
      const m = modal(c.id ? 'تعديل ' + c.name : 'قسم جديد', html`<form><label class="field"><span>الاسم</span><input name="name" required value="${c.name}"></label><label class="field"><span>القسم الأب</span><select name="parent"><option value="">قسم رئيسي</option>${roots.filter((r) => r.id !== c.id).map((r) => html`<option value="${r.id}" ${c.parent_id === r.id ? 'selected' : ''}>${r.name}</option>`)}</select></label><label class="check"><input type="checkbox" name="active" ${c.active !== false ? 'checked' : ''}> فعّال</label><h3>الخصائص</h3><div data-attrs>${attrs.map(row)}</div><button type="button" class="btn btn-outline btn-sm" data-add>${icon('plus', 14)} خاصية</button><button class="btn btn-primary btn-block" style="margin-top:12px">حفظ</button></form>`, { size: 'lg' });
      const form = m.querySelector('form');
      const read = () => attrs.forEach((a, i) => Object.assign(a, { key: form['key' + i].value.trim(), label: form['label' + i].value.trim(), type: form['type' + i].value, options: form['options' + i].value.split(/[,،]/).map((x) => x.trim()).filter(Boolean), variant: form['variant' + i].checked, required: form['required' + i].checked }));
      const repaint = () => render(form.querySelector('[data-attrs]'), html`${attrs.map(row)}`);
      form.querySelector('[data-add]').addEventListener('click', () => { read(); attrs.push({ key: '', label: '', type: 'text', options: [], variant: false, required: false }); repaint(); });
      form.addEventListener('click', (e) => { const r = e.target.closest('[data-remove]'); if (r) { read(); attrs.splice(+r.dataset.remove, 1); repaint(); } });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        read();
        if (attrs.some((a) => !/^[a-z][a-z0-9_]{1,40}$/.test(a.key) || !a.label)) return toast('المفتاح بأحرف إنجليزية صغيرة ويبدأ بحرف، والاسم مطلوب', 'error');
        busy(form.querySelector('button.btn-primary'), async () => { check(await db.rpc('save_catalog_category', { p_id: c.id, p_parent: form.parent.value || null, p_name: form.name.value.trim(), p_attributes: attrs, p_active: form.active.checked })); invalidate('categories'); m.close(); refresh(); });
      });
    },
  });
}
export { STATUS, ago };
