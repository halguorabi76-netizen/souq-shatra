import { html, render, safeUrl, formData } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { isCurrent } from '../core/router.js';
import { db, check } from '../core/db.js';
import { session } from '../core/session.js';
import { getPlatform, startOnlinePayment, invalidate } from '../core/api.js';
import { wsTitle } from '../core/workspace.js';
import { emptyState, toast, busy, modal, badge, copyText } from '../core/ui.js';
import { money, dateTime, date, digits } from '../core/format.js';
import { loadFinance, loadProducts, sellerActions, sellerShell } from './seller.js';

const KIND = { commission: 'عمولة طلب', online_sale: 'مبيعات مدفوعة إلكترونيًا', settlement: 'تسديد', payout: 'تحويل لك', adjustment: 'تسوية', online_delivery: 'توصيل' };
const PURPOSE = { dues: 'تسديد مستحقات', subscription: 'اشتراك باقة', promotion: 'إعلان مميز' };
const REQ = { pending: ['قيد المراجعة', 'warn'], approved: ['مقبول', 'ok'], rejected: ['مرفوض', 'bad'] };
const notReady = () => emptyState('settings', 'الخدمات المالية قيد التفعيل', 'تعمل هذه الصفحة بعد تفعيل نظام الإيرادات من الإدارة.');

// Pay for a subscription/promotion/dues: online (ZainCash) or by transfer + receipt number.
export async function payDialog({ purpose, ref, amount, title, back }) {
  const platform = await getPlatform();
  const acc = platform.transfer_accounts || {};
  const online = platform.payment_methods?.zaincash;
  const d = modal(
    title || PURPOSE[purpose],
    html`<div class="kv total" style="margin-top:0"><span>المبلغ</span><b>${money(amount)}</b></div>
    ${online ? html`<button class="btn btn-primary btn-block btn-lg" data-online>${icon('wallet', 20)} ادفع الآن بزين كاش</button><div class="or">أو بالتحويل اليدوي</div>` : ''}
    <div class="notice">${icon('info', 18)}<div><p>حوّل المبلغ إلى أحد الحسابات ثم أرسل رقم العملية للمراجعة:</p>
      ${acc.zaincash ? html`<p>زين كاش: <b class="ltr">${acc.zaincash}</b> <button type="button" class="link-btn" data-copy="${acc.zaincash}">نسخ</button></p>` : ''}
      ${acc.qi || platform.delivery.qi_number ? html`<p>كي كارد: <b class="ltr">${acc.qi || platform.delivery.qi_number}</b> <button type="button" class="link-btn" data-copy="${acc.qi || platform.delivery.qi_number}">نسخ</button></p>` : ''}
      ${!acc.zaincash && !acc.qi && !platform.delivery.qi_number ? html`<p>تواصل مع الإدارة لمعرفة حساب التحويل.</p>` : ''}</div></div>
    <form data-proof><label class="field"><span>طريقة التحويل</span><select name="method"><option value="zaincash">زين كاش</option><option value="qi">كي كارد</option><option value="cash">نقدًا للإدارة</option></select></label>
      ${purpose === 'dues' ? html`<label class="field"><span>المبلغ المحوّل (د.ع)</span><input name="amount" type="number" min="1" required value="${amount}"></label>` : ''}
      <label class="field"><span>رقم العملية أو تفاصيل الوصل *</span><input name="reference" required minlength="3" maxlength="400"></label>
      <button class="btn btn-outline btn-block">إرسال إثبات الدفع</button></form>`,
    { size: 'sm' },
  );
  d.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copyText(b.dataset.copy)));
  d.querySelector('[data-online]')?.addEventListener('click', (e) => busy(e.currentTarget, () => startOnlinePayment(purpose, [purpose === 'dues' ? session.store.id : ref], 'zaincash', back)));
  return new Promise((resolve) => {
    d.addEventListener('close', () => resolve(false));
    d.querySelector('[data-proof]').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formData(e.target);
      const sum = purpose === 'dues' ? Number(digits(v.amount)) : amount;
      if (!Number.isInteger(sum) || sum < 1 || v.reference.length < 3) return toast('أدخل المبلغ ورقم العملية', 'error');
      busy(e.target.querySelector('button'), async () => {
        check(await db.rpc('submit_payment_proof', { p_purpose: purpose, p_ref: purpose === 'dues' ? null : ref, p_amount: sum, p_method: v.method, p_reference: v.reference }));
        toast('أُرسل إثبات الدفع للمراجعة', 'success');
        d.close();
        resolve(true);
      });
    });
  });
}

export async function financeView(ctx, body) {
  wsTitle('المالية والمستحقات');
  const f = await loadFinance(true);
  if (!isCurrent(ctx.token)) return;
  sellerShell();
  if (!f) return render(body, notReady());
  const owe = f.balance > 0,
    credit = f.balance < 0;
  render(
    body,
    html`<div class="stat-grid">
      <div class="stat ${owe ? 'highlight' : ''}"><small>${owe ? 'مستحق للسوق عليك' : credit ? 'مستحق لك من السوق' : 'الرصيد'}</small><b>${money(Math.abs(f.balance))}</b>${owe ? html`<button class="btn btn-accent btn-sm" data-action="payDues" style="margin-top:6px">تسديد الآن</button>` : ''}</div>
      <div class="stat"><small>عمولة باقتك</small><b>${f.commission_percent}%</b><span class="small muted">من قيمة المنتجات المسلّمة</span></div>
      <div class="stat"><small>الباقة</small><b>${f.plan?.name}</b>${f.subscription ? html`<span class="small muted">حتى ${date(f.subscription.ends_at)}</span>` : html`<a class="small" href="#/seller/plans">ترقية</a>`}</div>
    </div>
    <div class="notice">${icon('info', 18)}<p>في الطلبات النقدية يستلم متجرك ثمن المنتجات من السائق، وتُسجَّل عمولة السوق هنا لتسددها. في الطلبات المدفوعة إلكترونيًا يُسجَّل ثمن المنتجات لصالحك وتحوّله الإدارة إليك.</p></div>
    <section class="card"><h3>كشف الحساب</h3>${f.entries.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>التاريخ</th><th>البيان</th><th>عليك</th><th>لك</th></tr></thead><tbody>${f.entries.map((e) => html`<tr><td>${dateTime(e.created_at)}</td><td>${KIND[e.kind] || e.kind}${e.note ? html`<div class="muted small">${e.note}</div>` : ''}</td><td>${e.amount > 0 ? money(e.amount) : ''}</td><td style="color:var(--ok)">${e.amount < 0 ? money(-e.amount) : ''}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">لا توجد حركات بعد.</p>`}</section>
    <section class="card"><h3>إثباتات الدفع المرسلة</h3>${f.requests.length ? f.requests.map((r) => html`<div class="kv"><span>${PURPOSE[r.purpose]} · ${money(r.amount)} <small class="muted">${dateTime(r.created_at)} · ${r.reference}</small></span>${badge(...REQ[r.status])}</div>`) : html`<p class="muted">لم ترسل أي إثبات بعد.</p>`}</section>`,
  );
  sellerActions({ payDues: async () => (await payDialog({ purpose: 'dues', amount: f.balance, back: '#/seller/finance' })) && financeView(ctx, body) });
}

export async function plansView(ctx, body) {
  wsTitle('الباقات');
  const [f, platform] = await Promise.all([loadFinance(true), getPlatform()]);
  if (!isCurrent(ctx.token)) return;
  sellerShell();
  if (!f) return render(body, notReady());
  const def = platform.settings?.commission_percent ?? 0;
  const pending = f.pending_subscriptions?.[0];
  render(
    body,
    html`${pending ? html`<div class="notice notice-warn">${icon('clock', 18)}<p>طلب اشتراك بانتظار الدفع: ${platform.plans.find((p) => p.id === pending.plan_id)?.name} لمدة ${pending.months} شهر (${money(pending.amount)}). <button class="link-btn" data-action="payPending">ادفع الآن</button></p></div>` : ''}
    <p class="muted">باقتك الحالية: <b>${f.plan?.name}</b>${f.subscription ? ` حتى ${date(f.subscription.ends_at)}` : ''}. اختر الباقة المناسبة لحجم متجرك.</p>
    <div class="plan-grid">${platform.plans.filter((p) => p.active).map((p, i) => html`<div class="plan ${f.plan?.id === p.id ? 'current' : ''} ${i === 1 ? 'popular' : ''}">
      <h3>${p.name}</h3><div class="amount">${p.monthly_price ? money(p.monthly_price) : 'مجانًا'}<small class="muted" style="font-size:.85rem">${p.monthly_price ? ' / شهر' : ''}</small></div>
      <p class="muted">${p.description}</p>
      <ul><li>عمولة ${p.commission_percent ?? def}% على المبيعات</li><li>${p.max_products ? `حتى ${p.max_products} منتج منشور` : 'منتجات غير محدودة'}</li>${p.featured_days ? html`<li>${p.featured_days} أيام «متجر مميز» شهريًا</li>` : ''}</ul>
      ${f.plan?.id === p.id ? html`<span class="badge badge-ok">باقتك الحالية</span>${p.monthly_price ? html`<button class="btn btn-outline btn-block" data-action="subscribe" data-id="${p.id}">تجديد</button>` : ''}` : html`<button class="btn ${p.monthly_price ? 'btn-primary' : 'btn-outline'} btn-block" data-action="subscribe" data-id="${p.id}">${p.monthly_price ? 'اشترك' : 'الانتقال إليها'}</button>`}
    </div>`)}</div>`,
  );
  sellerActions({
    subscribe: (b) => {
      const p = platform.plans.find((x) => x.id === b.dataset.id);
      const d = modal('الاشتراك في ' + p.name, html`<form><label class="field"><span>المدة</span><select name="months">${[1, 3, 6, 12].map((m) => html`<option value="${m}">${m} ${m === 1 ? 'شهر' : 'أشهر'} — ${money(p.monthly_price * m)}</option>`)}</select></label><button class="btn btn-primary btn-block">متابعة</button></form>`, { size: 'sm' });
      d.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const months = +formData(e.target).months;
        busy(e.target.querySelector('button'), async () => {
          const id = check(await db.rpc('request_subscription', { p_plan: p.id, p_months: months }));
          d.close();
          if (!p.monthly_price) {
            toast('تم تفعيل الباقة', 'success');
            return plansView(ctx, body);
          }
          await payDialog({ purpose: 'subscription', ref: id, amount: p.monthly_price * months, title: 'دفع اشتراك ' + p.name, back: '#/seller/plans' });
          plansView(ctx, body);
        });
      });
    },
    payPending: async () => (await payDialog({ purpose: 'subscription', ref: pending.id, amount: pending.amount, back: '#/seller/plans' })) && plansView(ctx, body),
  });
}

export async function adsView(ctx, body) {
  wsTitle('الإعلانات المميزة', html`<button class="btn btn-primary btn-sm" data-action="newAd">${icon('plus', 16)} إعلان جديد</button>`);
  const [f, platform, products] = await Promise.all([loadFinance(true), getPlatform(), loadProducts()]);
  if (!isCurrent(ctx.token)) return;
  sellerShell();
  if (!f) return render(body, notReady());
  const places = platform.placements.filter((p) => p.active);
  const name = (id) => places.find((p) => p.id === id)?.name || platform.placements.find((p) => p.id === id)?.name || id;
  const live = (p) => p.status === 'active' && new Date(p.ends_at) > new Date();
  const ST = (p) => (live(p) ? badge('يعمل الآن', 'ok') : p.status === 'pending' ? badge('بانتظار الدفع', 'warn') : p.status === 'rejected' ? badge('مرفوض', 'bad') : badge('منتهي'));
  render(
    body,
    html`<div class="plan-grid" style="margin-bottom:18px">${places.map((p) => html`<div class="plan"><h3>${icon(p.id === 'store_spotlight' ? 'store' : p.id === 'home_hero' ? 'sparkles' : 'megaphone', 20)} ${p.name}</h3><p class="muted">${p.description}</p><div class="amount" style="font-size:1.3rem">${p.daily_price ? money(p.daily_price) + ' / يوم' : 'مجانًا'}</div><button class="btn btn-outline btn-block" data-action="newAd" data-place="${p.id}">احجز</button></div>`)}</div>
    <section class="card"><h3>إعلاناتك</h3>${f.promotions.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>المكان</th><th>المنتج</th><th>المدة</th><th>المبلغ</th><th>الحالة</th><th></th></tr></thead><tbody>${f.promotions.map((p) => html`<tr><td>${name(p.placement)}${p.source === 'plan' ? html` <span class="badge badge-info">من الباقة</span>` : ''}</td><td>${products.find((x) => x.id === p.product_id)?.name || (p.product_id ? '—' : 'المتجر')}</td><td>${p.days} يوم${p.ends_at ? html`<div class="muted small">حتى ${date(p.ends_at)}</div>` : ''}</td><td>${money(p.amount)}</td><td>${ST(p)}</td><td>${p.status === 'pending' ? html`<button class="btn btn-primary btn-sm" data-action="payAd" data-id="${p.id}">ادفع</button>` : ''}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">لم تحجز أي إعلان بعد. الإعلان المميز يضاعف ظهور منتجاتك للزبائن.</p>`}</section>`,
  );
  sellerActions({
    newAd: (b) => {
      const live = products.filter((p) => p.active && !p.blocked);
      const d = modal(
        'إعلان مميز جديد',
        html`<form><label class="field"><span>مكان الظهور</span><select name="place">${places.map((p) => html`<option value="${p.id}" ${b.dataset.place === p.id ? 'selected' : ''}>${p.name} — ${money(p.daily_price)}/يوم</option>`)}</select></label>
        <label class="field" data-product-field><span>المنتج</span><select name="product">${live.map((p) => html`<option value="${p.id}">${p.name}</option>`)}</select></label>
        <label class="field"><span>عدد الأيام</span><input name="days" type="number" min="1" max="90" value="7"></label>
        <div class="kv total"><span>الإجمالي</span><b data-total></b></div><button class="btn btn-primary btn-block">متابعة للدفع</button></form>`,
        { size: 'sm' },
      );
      const form = d.querySelector('form');
      const sync = () => {
        const p = places.find((x) => x.id === form.place.value);
        form.querySelector('[data-product-field]').hidden = !p.needs_product;
        form.querySelector('[data-total]').textContent = money(p.daily_price * (+form.days.value || 0));
      };
      form.addEventListener('input', sync);
      sync();
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = formData(form),
          p = places.find((x) => x.id === v.place),
          days = +v.days;
        if (!Number.isInteger(days) || days < 1 || days > 90) return toast('المدة من ١ إلى ٩٠ يومًا', 'error');
        if (p.needs_product && !v.product) return toast('أضف منتجًا منشورًا أولًا', 'error');
        busy(form.querySelector('button'), async () => {
          const id = check(await db.rpc('request_promotion', { p_placement: p.id, p_product: p.needs_product ? v.product : null, p_days: days }));
          d.close();
          invalidate('promotions');
          if (p.daily_price) await payDialog({ purpose: 'promotion', ref: id, amount: p.daily_price * days, title: 'دفع الإعلان', back: '#/seller/ads' });
          else toast('بدأ إعلانك', 'success');
          adsView(ctx, body);
        });
      });
    },
    payAd: async (b) => {
      const p = f.promotions.find((x) => x.id === b.dataset.id);
      (await payDialog({ purpose: 'promotion', ref: p.id, amount: p.amount, back: '#/seller/ads' })) && adsView(ctx, body);
    },
  });
}
export { safeUrl };
