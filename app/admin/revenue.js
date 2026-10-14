import { html, render, formData } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { go, refresh, isCurrent, href } from '../core/router.js';
import { db, check } from '../core/db.js';
import { invalidate } from '../core/api.js';
import { emptyState, toast, busy, confirmDialog, modal, badge } from '../core/ui.js';
import { money, dateTime, date } from '../core/format.js';
import { stores, paymentRequests, actions, clearData } from './main.js';

const notReady = () => html`<div class="notice notice-warn">${icon('alert', 18)}<p><b>نظام الإيرادات غير مفعّل.</b> شغّل ملف <span class="ltr">supabase/migrations/20261014090000_marketplace_revenue.sql</span> في Supabase (SQL Editor) ثم حدّث الصفحة.</p></div>`;
const PURPOSE = { dues: 'تسديد مستحقات', subscription: 'اشتراك باقة', promotion: 'إعلان مميز' };
const METHOD = { zaincash: 'زين كاش', qi: 'كي كارد', cash: 'نقدًا' };

export async function financeView(ctx, body) {
  const q = ctx.query;
  const from = q.get('from') || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const to = q.get('to') || new Date().toISOString().slice(0, 10);
  const [sumR, reqs, st, bal, refunds] = await Promise.all([
    db.rpc('admin_finance_summary', { p_from: new Date(from).toISOString(), p_to: new Date(new Date(to).getTime() + 864e5).toISOString() }),
    paymentRequests(true),
    stores(),
    db.rpc('admin_balances'),
    db.from('orders').select('id,total,payment_method,created_at,store_id').eq('payment_status', 'refund_due'),
  ]);
  if (!isCurrent(ctx.token)) return;
  if (sumR.error || reqs === null) return render(body, notReady());
  const s = sumR.data;
  const sm = new Map(st.map((x) => [x.id, x]));
  const pending = reqs.filter((r) => r.status === 'pending');
  const revenue = s.platform_fees + s.commissions + s.delivery_share + s.subscriptions + s.promotions;
  const owing = (bal.data?.stores || []).filter((b) => b.balance !== 0).sort((a, b) => b.balance - a.balance);
  render(
    body,
    html`<form class="toolbar" data-range><label>من <input class="input" type="date" name="from" value="${from}"></label><label>إلى <input class="input" type="date" name="to" value="${to}"></label><button class="btn btn-outline">عرض</button></form>
    <div class="stat-grid">
      <div class="stat highlight"><small>إيرادات السوق</small><b>${money(revenue)}</b></div>
      <div class="stat"><small>رسوم الخدمة</small><b>${money(s.platform_fees)}</b></div>
      <div class="stat"><small>عمولات المتاجر</small><b>${money(s.commissions)}</b></div>
      <div class="stat"><small>حصة التوصيل</small><b>${money(s.delivery_share)}</b></div>
      <div class="stat"><small>الاشتراكات</small><b>${money(s.subscriptions)}</b></div>
      <div class="stat"><small>الإعلانات</small><b>${money(s.promotions)}</b></div>
      <div class="stat"><small>قيمة المبيعات المسلّمة</small><b>${money(s.gmv)}</b><span class="small muted">${s.orders_delivered} طلب · ${s.orders_cancelled} ملغي</span></div>
      <div class="stat"><small>مدفوع إلكترونيًا</small><b>${money(s.online_paid)}</b></div>
    </div>
    <div class="stat-grid"><div class="stat"><small>مستحق على المتاجر</small><b style="color:var(--bad)">${money(s.store_receivable)}</b></div><div class="stat"><small>مستحق للمتاجر</small><b style="color:var(--ok)">${money(s.store_payable)}</b></div><div class="stat"><small>مستحق على السائقين</small><b style="color:var(--bad)">${money(s.driver_receivable)}</b></div><div class="stat"><small>مستحق للسائقين</small><b style="color:var(--ok)">${money(s.driver_payable)}</b></div></div>
    <section class="card"><h3>${icon('receipt', 18)} إثباتات دفع بانتظار المراجعة (${pending.length})</h3>${pending.length ? pending.map((r) => html`<div class="kv"><span><b>${sm.get(r.store_id)?.name || ''}</b> · ${PURPOSE[r.purpose]} · <b>${money(r.amount)}</b> عبر ${METHOD[r.method]}<br><small class="muted">رقم العملية: ${r.reference} · ${dateTime(r.created_at)}</small></span><span style="display:flex;gap:6px"><button class="btn btn-ok btn-sm" data-action="review" data-id="${r.id}" data-ok="1">تأكيد الاستلام</button><button class="btn btn-ghost btn-sm" data-action="review" data-id="${r.id}">رفض</button></span></div>`) : html`<p class="muted">لا توجد إثباتات جديدة.</p>`}</section>
    ${refunds.data?.length ? html`<section class="card"><h3>${icon('undo', 18)} مبالغ واجبة الاسترجاع</h3>${refunds.data.map((o) => html`<div class="kv"><span>${sm.get(o.store_id)?.name || ''} · ${money(o.total)} (${o.payment_method}) <small class="muted">${dateTime(o.created_at)}</small></span><button class="btn btn-primary btn-sm" data-action="refunded" data-id="${o.id}">تم الإرجاع</button></div>`)}</section>` : ''}
    <section class="card"><h3>أرصدة المتاجر</h3>${owing.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>المتجر</th><th>الباقة</th><th>الرصيد</th></tr></thead><tbody>${owing.map((b) => html`<tr><td><a href="#/stores">${b.name}</a></td><td>${b.plan}</td><td><b style="color:${b.balance > 0 ? 'var(--bad)' : 'var(--ok)'}">${money(Math.abs(b.balance))}</b> ${b.balance > 0 ? 'عليه' : 'له'}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">كل الأرصدة صفر.</p>`}</section>
    <section class="card"><h3>سجل الإثباتات</h3>${reqs.filter((r) => r.status !== 'pending').slice(0, 50).map((r) => html`<div class="kv small"><span>${sm.get(r.store_id)?.name || ''} · ${PURPOSE[r.purpose]} · ${money(r.amount)} · ${r.reference}</span>${badge(r.status === 'approved' ? 'مقبول' : 'مرفوض', r.status === 'approved' ? 'ok' : 'bad')}</div>`)}</section>`,
  );
  body.querySelector('[data-range]').addEventListener('submit', (e) => { e.preventDefault(); const v = formData(e.target); go('/finance', { from: v.from, to: v.to }); });
  actions({
    review: async (b) => {
      const ok = !!b.dataset.ok;
      if (!(await confirmDialog(ok ? 'تأكيد الاستلام' : 'رفض الإثبات', ok ? 'تأكدت أن المبلغ وصل إلى حسابك؟ سيُفعَّل الطلب المرتبط تلقائيًا.' : 'سيُبلَّغ التاجر برفض الإثبات.', { ok: ok ? 'نعم، وصل المبلغ' : 'رفض', danger: !ok }))) return;
      busy(b, async () => { check(await db.rpc('admin_review_payment_request', { p_id: b.dataset.id, p_approved: ok })); toast('تمت المراجعة', 'success'); clearData(); invalidate('promotions'); refresh(); });
    },
    refunded: (b) => busy(b, async () => { check(await db.rpc('admin_mark_refunded', { p_order: b.dataset.id })); refresh(); }),
  });
}

export async function promotionsView(ctx, body) {
  const [r, st, places] = await Promise.all([db.from('promotions').select('*').order('created_at', { ascending: false }).limit(300), stores(), db.from('promotion_placements').select('*')]);
  if (!isCurrent(ctx.token)) return;
  if (r.error) return render(body, notReady());
  const sm = new Map(st.map((x) => [x.id, x]));
  const ids = [...new Set(r.data.map((p) => p.product_id).filter(Boolean))];
  const prods = ids.length ? check(await db.from('products').select('id,name').in('id', ids)) : [];
  const live = (p) => p.status === 'active' && new Date(p.ends_at) > new Date();
  render(
    body,
    html`<p class="muted">الأسعار اليومية لكل مكان تُعدّل من <a href="#/settings">الإعدادات</a>. الإعلانات المدفوعة بالتحويل تُفعَّل عند تأكيد إثبات الدفع من صفحة المالية.</p>
    ${r.data.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>المتجر</th><th>المكان</th><th>المنتج</th><th>المدة</th><th>المبلغ</th><th>الحالة</th><th></th></tr></thead><tbody>
    ${r.data.map((p) => html`<tr><td>${sm.get(p.store_id)?.name || ''}</td><td>${(places.data || []).find((x) => x.id === p.placement)?.name || p.placement}</td><td>${prods.find((x) => x.id === p.product_id)?.name || '—'}</td><td>${p.days} يوم${p.ends_at ? html`<div class="muted small">حتى ${date(p.ends_at)}</div>` : ''}</td><td>${money(p.amount)}${p.source !== 'paid' ? html` ${badge(p.source === 'plan' ? 'باقة' : 'إدارة', 'info')}` : ''}</td><td>${live(p) ? badge('يعمل', 'ok') : p.status === 'pending' ? badge('بانتظار الدفع', 'warn') : badge(p.status === 'rejected' ? 'مرفوض' : 'منتهي')}</td>
      <td style="white-space:nowrap">${p.status === 'pending' ? html`<button class="btn btn-ok btn-sm" data-action="set" data-id="${p.id}" data-s="active">تفعيل</button> <button class="btn btn-ghost btn-sm" data-action="set" data-id="${p.id}" data-s="rejected">رفض</button>` : live(p) ? html`<button class="btn btn-ghost btn-sm" data-action="set" data-id="${p.id}" data-s="cancelled">إيقاف</button>` : ''}</td></tr>`)}
    </tbody></table></div>` : emptyState('megaphone', 'لا توجد إعلانات بعد')}`,
  );
  actions({ set: (b) => busy(b, async () => { check(await db.rpc('admin_set_promotion', { p_id: b.dataset.id, p_status: b.dataset.s })); invalidate('promotions'); refresh(); }) });
}

const CONFIG = { BASE_FEE: 'الرسم الأساسي للتوصيل', PER_KM_FEE: 'لكل كيلومتر', EXTRA_STORE_FEE: 'لكل متجر إضافي', FEE_ROUNDING: 'تقريب الأجرة', ROAD_FACTOR: 'معامل الطريق', MAX_ROUTE_KM: 'تنبيه المسافة (كم)', MAX_STORES: 'تنبيه عدد المتاجر', STALL_TOTAL_MIN: 'تأخر بعد القبول (دقيقة)', STALL_STATUS_MIN: 'تأخر دون تحديث (دقيقة)', MIN_PER_KM: 'دقائق لكل كم', BUFFER_MIN: 'هامش الوقت', EXTRA_STORE_MIN: 'دقائق لكل متجر إضافي' };
export async function settingsView(ctx, body) {
  const [ps, ds, zones, cfg, plans, places] = await Promise.all([db.from('platform_settings').select('*').maybeSingle(), db.from('delivery_settings').select('*').limit(1).maybeSingle(), db.from('delivery_zones').select('*').order('name'), db.from('delivery_config').select('*').order('key'), db.from('seller_plans').select('*').order('position'), db.from('promotion_placements').select('*')]);
  if (!isCurrent(ctx.token)) return;
  const p = ps.error ? null : ps.data,
    d = ds.data || { platform_fee: 0, delivery_fee: 0, qi_number: '' };
  const pm = p?.payment_methods || {},
    ta = p?.transfer_accounts || {};
  render(
    body,
    html`<div style="max-width:900px">${!p ? notReady() : ''}
    ${p ? html`<form class="card" data-platform><h2>${icon('percent', 20)} العمولات وطرق الدفع</h2>
      <div class="notice">${icon('info', 18)}<p>كل النسب تطبَّق على الطلبات التي تُسلَّم بعد الحفظ فقط. أبلغ التجار والسائقين قبل رفع النسب.</p></div>
      <div class="grid-2"><label class="field"><span>عمولة المتاجر الافتراضية (%)</span><input name="commission" type="number" min="0" max="50" step="0.5" value="${p.commission_percent}"><small>من قيمة المنتجات المسلّمة. يمكن أن تختلف حسب الباقة.</small></label>
      <label class="field"><span>حصة السوق من أجرة التوصيل (%)</span><input name="share" type="number" min="0" max="100" step="0.5" value="${p.delivery_share_percent}"><small>تُضاف إلى مستحقات السائق.</small></label>
      <label class="field"><span>حد مستحقات المتجر (د.ع)</span><input name="debt" type="number" min="0" value="${p.store_debt_limit}"><small>عند بلوغه يتوقف استقبال طلبات المتجر. ٠ = بلا حد.</small></label>
      <label class="field"><span>رقم واتساب الدعم</span><input name="support" class="ltr" value="${p.support_phone}"></label></div>
      <h3>طرق دفع الزبون</h3>
      <label class="check"><input type="checkbox" name="cod" ${pm.cod !== false ? 'checked' : ''}> الدفع عند الاستلام</label>
      <label class="check"><input type="checkbox" name="zaincash" ${pm.zaincash ? 'checked' : ''}> زين كاش (يتطلب إعداد مفاتيح التاجر في Supabase)</label>
      <label class="check"><input type="checkbox" name="card" ${pm.card ? 'checked' : ''}> البطاقات كي كارد / ماستر (يتطلب عقد بوابة الدفع)</label>
      <h3>حسابات استلام التحويلات (للتجار والسائقين)</h3><div class="grid-2"><label class="field"><span>رقم زين كاش</span><input name="ta_zain" class="ltr" value="${ta.zaincash || ''}"></label><label class="field"><span>رقم كي كارد</span><input name="ta_qi" class="ltr" value="${ta.qi || ''}"></label></div>
      <button class="btn btn-primary">حفظ</button></form>` : ''}
    <form class="card" data-delivery><h2>${icon('truck', 20)} رسوم الخدمة</h2><div class="grid-2"><label class="field"><span>رسوم خدمة لكل متجر في الطلب (د.ع)</span><input name="fee" type="number" min="0" value="${d.platform_fee}"><small>تظهر للزبون باسم «رسوم الخدمة» ويحصّلها السائق للسوق.</small></label><label class="field"><span>رقم كي كارد لتسويات السائقين</span><input name="qi" class="ltr" value="${d.qi_number || ''}"></label></div><button class="btn btn-primary">حفظ</button></form>
    ${!cfg.error && cfg.data?.length ? html`<form class="card" data-config><h2>${icon('map', 20)} حساب أجرة التوصيل</h2><p class="muted small">الأجرة = الرسم الأساسي + (المسافة × سعر الكيلومتر) + (المتاجر الإضافية × رسمها)، مقرّبة.</p><div class="grid-2">${cfg.data.map((c) => html`<label class="field"><span>${CONFIG[c.key] || c.key}</span><input name="${c.key}" type="number" step="${c.key === 'ROAD_FACTOR' ? '0.05' : '1'}" min="0" value="${c.value}"></label>`)}</div><button class="btn btn-primary">حفظ</button></form>` : ''}
    <section class="card"><div class="card-head"><h2>${icon('pin', 20)} مناطق التوصيل</h2><button class="btn btn-outline btn-sm" data-action="zone">${icon('plus', 14)} منطقة</button></div>${(zones.data || []).map((z) => html`<div class="kv"><span>${z.name} ${z.enabled ? '' : badge('متوقفة')}</span><span>${money(z.fee)} <button class="btn btn-ghost btn-sm" data-action="zone" data-id="${z.id}">تعديل</button></span></div>`)}</section>
    ${!plans.error ? html`<section class="card"><div class="card-head"><h2>${icon('crown', 20)} باقات التجار</h2><button class="btn btn-outline btn-sm" data-action="plan">${icon('plus', 14)} باقة</button></div><div class="table-wrap"><table class="table"><thead><tr><th>الباقة</th><th>السعر الشهري</th><th>العمولة</th><th>حد المنتجات</th><th>أيام مميزة</th><th></th></tr></thead><tbody>${plans.data.map((x) => html`<tr><td>${x.name} ${x.active ? '' : badge('موقوفة')}</td><td>${money(x.monthly_price)}</td><td>${x.commission_percent ?? 'الافتراضية'}${x.commission_percent != null ? '%' : ''}</td><td>${x.max_products ?? 'بلا حد'}</td><td>${x.featured_days}</td><td><button class="btn btn-ghost btn-sm" data-action="plan" data-id="${x.id}">تعديل</button></td></tr>`)}</tbody></table></div></section>
    <section class="card"><h2>${icon('megaphone', 20)} أسعار الإعلانات اليومية</h2>${places.data.map((x) => html`<form class="grid-2" data-place="${x.id}" style="align-items:end;border-bottom:1px solid var(--line);padding-bottom:8px;margin-bottom:8px"><label class="field"><span>${x.name} — السعر اليومي</span><input name="price" type="number" min="0" value="${x.daily_price}"></label><div style="display:flex;gap:8px;align-items:center;margin-bottom:14px"><label class="field" style="margin:0"><span>أقصى عدد</span><input name="max" type="number" min="1" max="100" value="${x.max_active}"></label><label class="check"><input type="checkbox" name="active" ${x.active ? 'checked' : ''}> متاح</label><button class="btn btn-outline btn-sm">حفظ</button></div></form>`)}</section>` : ''}
    </div>`,
  );
  const done = (b, fn) => busy(b, async () => { await fn(); invalidate('platform'); toast('تم الحفظ', 'success'); refresh(); });
  body.querySelector('[data-platform]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    done(f.querySelector('button'), async () => check(await db.rpc('admin_set_platform_settings', { p_values: { commission_percent: +f.commission.value, delivery_share_percent: +f.share.value, store_debt_limit: +f.debt.value, support_phone: f.support.value.replace(/\D/g, ''), payment_methods: { cod: f.cod.checked, zaincash: f.zaincash.checked, card: f.card.checked }, transfer_accounts: { zaincash: f.ta_zain.value.trim(), qi: f.ta_qi.value.trim() } } })));
  });
  body.querySelector('[data-delivery]').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    done(f.querySelector('button'), async () => check(await db.rpc('admin_set_delivery_settings', { p_platform_fee: +f.fee.value, p_delivery_fee: d.delivery_fee, p_qi_number: f.qi.value.trim() })));
  });
  body.querySelector('[data-config]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const values = Object.fromEntries(cfg.data.map((c) => [c.key, Number(e.target[c.key].value)]));
    done(e.target.querySelector('button'), async () => check(await db.rpc('admin_delivery_config', { p_values: values })));
  });
  body.querySelectorAll('[data-place]').forEach((f) => f.addEventListener('submit', (e) => { e.preventDefault(); done(f.querySelector('button'), async () => check(await db.rpc('admin_save_placement', { p_id: f.dataset.place, p_price: +f.price.value, p_max: +f.max.value, p_active: f.active.checked }))); }));
  actions({
    zone: (b) => {
      const z = (zones.data || []).find((x) => x.id === b.dataset.id) || { id: '', name: '', fee: 2000, enabled: true };
      const m = modal(z.id ? 'تعديل منطقة' : 'منطقة جديدة', html`<form><label class="field"><span>الاسم</span><input name="name" required value="${z.name}"></label><label class="field"><span>الأجرة المرجعية (د.ع)</span><input name="fee" type="number" min="0" max="100000" value="${z.fee}"></label><label class="check"><input type="checkbox" name="enabled" ${z.enabled ? 'checked' : ''}> متاحة</label><button class="btn btn-primary btn-block">حفظ</button></form>`, { size: 'sm' });
      m.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; busy(f.querySelector('button'), async () => { check(await db.rpc('admin_set_delivery_zone', { p_id: z.id, p_name: f.name.value.trim(), p_fee: +f.fee.value, p_enabled: f.enabled.checked })); m.close(); invalidate('platform'); refresh(); }); });
    },
    plan: (b) => {
      const x = (plans.data || []).find((y) => y.id === b.dataset.id) || { id: '', name: '', description: '', monthly_price: 0, commission_percent: null, max_products: null, featured_days: 0, active: true };
      const m = modal(x.id ? 'تعديل ' + x.name : 'باقة جديدة', html`<form><label class="field"><span>المعرّف (إنجليزي)</span><input name="id" class="ltr" required pattern="[a-z][a-z0-9_]{1,30}" value="${x.id}" ${x.id ? 'readonly' : ''}></label><label class="field"><span>الاسم</span><input name="name" required value="${x.name}"></label><label class="field"><span>الوصف</span><input name="description" value="${x.description}"></label><div class="grid-2"><label class="field"><span>السعر الشهري (د.ع)</span><input name="price" type="number" min="0" value="${x.monthly_price}"></label><label class="field"><span>العمولة % (فارغ = الافتراضية)</span><input name="commission" type="number" min="0" max="50" step="0.5" value="${x.commission_percent ?? ''}"></label><label class="field"><span>حد المنتجات (فارغ = بلا حد)</span><input name="max" type="number" min="1" value="${x.max_products ?? ''}"></label><label class="field"><span>أيام «متجر مميز» شهريًا</span><input name="featured" type="number" min="0" max="31" value="${x.featured_days}"></label></div><label class="check"><input type="checkbox" name="active" ${x.active ? 'checked' : ''}> متاحة للاشتراك</label><button class="btn btn-primary btn-block">حفظ</button></form>`, { size: 'md' });
      m.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; busy(f.querySelector('button'), async () => { check(await db.rpc('admin_save_plan', { p_id: f.id.value.trim(), p_name: f.name.value.trim(), p_description: f.description.value.trim(), p_price: +f.price.value, p_commission: f.commission.value === '' ? null : +f.commission.value, p_max_products: f.max.value === '' ? null : +f.max.value, p_featured_days: +f.featured.value, p_active: f.active.checked })); m.close(); invalidate('platform'); refresh(); }); });
    },
  });
}
export { href };
