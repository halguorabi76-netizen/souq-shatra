import { html, render, safeUrl, formData } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageActions } from '../core/actions.js';
import { go, isCurrent } from '../core/router.js';
import { db, check } from '../core/db.js';
import { getPlatform, startOnlinePayment, invalidate } from '../core/api.js';
import { cart, prefs } from '../core/state.js';
import { session, isDisabled } from '../core/session.js';
import { spinnerBlock, errorBlock, emptyState, modal, toast, toastError, busy, confirmDialog } from '../core/ui.js';
import { money, phoneDigits, containsPhone, shortId } from '../core/format.js';
import { pickLocation, validPoint, mapPreview } from '../core/map.js';
import { cartRows, groupByStore, subtotal } from './cart.js';
import { mountShop, setTitle } from './shell.js';

const METHODS = {
  cod: { label: 'الدفع عند الاستلام', text: 'ادفع نقدًا للسائق عند وصول طلبك', ic: 'cash' },
  zaincash: { label: 'زين كاش', text: 'ادفع من محفظة زين كاش بأمان', ic: 'wallet' },
  card: { label: 'بطاقة كي كارد / ماستر كارد', text: 'ادفع ببطاقتك المصرفية', ic: 'card' },
};
const uuid = () => crypto.randomUUID?.() || ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));

export async function loadAddresses() {
  return check(await db.from('customer_addresses').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false })) || [];
}
export function addressForm(a = {}, zones = []) {
  const p = a.latitude != null ? { lat: +a.latitude, lon: +a.longitude } : null;
  return html`<form data-address-form novalidate>
    <input type="hidden" name="lat" value="${p?.lat ?? ''}"><input type="hidden" name="lon" value="${p?.lon ?? ''}">
    <div class="field"><span>موقع التوصيل على الخريطة *</span><div data-map-preview>${p ? mapPreview(p) : html`<p class="muted small">لم تحدد الموقع بعد. السائق يعتمد على الموقع للوصول إليك.</p>`}</div><button type="button" class="btn btn-outline" data-pick-map>${icon('pin', 18)} ${p ? 'تعديل الموقع' : 'تحديد الموقع على الخريطة'}</button></div>
    <div class="grid-2">
      <label class="field"><span>اسم العنوان *</span><input name="label" required maxlength="80" placeholder="البيت، العمل…" value="${a.label || ''}"></label>
      <label class="field"><span>المنطقة *</span><select name="zone" required>${zones.filter((z) => z.enabled !== false).map((z) => html`<option value="${z.id}" ${(a.zone_id || 'shatra') === z.id ? 'selected' : ''}>${z.name}</option>`)}</select></label>
      <label class="field"><span>اسم المستلم *</span><input name="name" required maxlength="120" autocomplete="name" value="${a.recipient_name || session.profile?.full_name || ''}"></label>
      <label class="field"><span>رقم الهاتف *</span><input name="phone" required inputmode="tel" class="ltr" autocomplete="tel" placeholder="07xxxxxxxxx" value="${a.phone || session.profile?.phone || ''}"></label>
    </div>
    <label class="field"><span>رقم بديل (اختياري)</span><input name="phone2" inputmode="tel" class="ltr" placeholder="07xxxxxxxxx" value="${a.phone_secondary || ''}"></label>
    <label class="field"><span>العنوان التفصيلي *</span><textarea name="address" required maxlength="500" rows="2" placeholder="الحي، الشارع، أقرب نقطة دالة">${a.address || ''}</textarea><small>لا تكتب رقم الهاتف هنا.</small></label>
    <button class="btn btn-primary btn-block">${icon('check', 18)} حفظ العنوان</button>
  </form>`;
}
// Opens the address editor; resolves with the saved row or null.
export function editAddress(existing, zones) {
  return new Promise((resolve) => {
    let saved = null;
    const d = modal(existing ? 'تعديل العنوان' : 'عنوان جديد', addressForm(existing || {}, zones), { size: 'md', onClose: () => resolve(saved) });
    const form = d.querySelector('form');
    form.querySelector('[data-pick-map]').addEventListener('click', async () => {
      const cur = form.lat.value ? { lat: +form.lat.value, lon: +form.lon.value } : null;
      const p = await pickLocation({ value: cur, title: 'موقع التوصيل' });
      if (!p) return;
      form.lat.value = p.lat;
      form.lon.value = p.lon;
      render(form.querySelector('[data-map-preview]'), mapPreview(p));
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formData(form);
      const phone = phoneDigits(v.phone),
        phone2 = phoneDigits(v.phone2);
      const errors = [];
      if (!validPoint({ lat: +v.lat, lon: +v.lon }) || v.lat === '') errors.push('حدّد الموقع على الخريطة');
      if (v.label.length < 2) errors.push('اكتب اسمًا للعنوان');
      if (v.name.length < 2) errors.push('اكتب اسم المستلم');
      if (!/^\d{10,11}$/.test(phone)) errors.push('رقم الهاتف من ١٠ أو ١١ رقمًا');
      if (phone2 && !/^\d{10,11}$/.test(phone2)) errors.push('الرقم البديل غير صحيح');
      if (v.address.length < 3) errors.push('اكتب العنوان التفصيلي');
      if (containsPhone(v.address)) errors.push('لا تكتب رقم الهاتف في العنوان');
      if (errors.length) return toast(errors[0], 'error');
      const row = { user_id: session.user.id, label: v.label, recipient_name: v.name, phone, phone_secondary: phone2 || null, address: v.address, zone_id: v.zone, latitude: +v.lat, longitude: +v.lon };
      busy(form.querySelector('button:not([type=button])'), async () => {
        saved = check(await (existing ? db.from('customer_addresses').update(row).eq('id', existing.id).eq('user_id', session.user.id) : db.from('customer_addresses').insert(row)).select('*').single());
        d.close();
      });
    });
  });
}

export async function checkoutPage(ctx) {
  const main = await mountShop();
  setTitle('إتمام الشراء');
  if (!session.user) return go('/login', { next: '/checkout' }, { replace: true });
  if (!cart.lines.length) return render(main, emptyState('cart', 'سلتك فارغة', '', html`<a class="btn btn-primary" href="#/">ابدأ التسوق</a>`));
  if (isDisabled()) return render(main, emptyState('alert', 'الحساب موقوف', 'تواصل مع خدمة العملاء.'));
  render(main, spinnerBlock());
  const st = { addresses: [], addressId: prefs.get('souq.v2.address', null), method: 'cod', note: '', quote: null, quoteFor: '', quoteError: '', request: null, requestKey: '' };
  let rows, platform;
  try {
    [rows, platform, st.addresses] = await Promise.all([cartRows(), getPlatform(), loadAddresses()]);
  } catch (e) {
    return isCurrent(ctx.token) && render(main, errorBlock(e));
  }
  if (!isCurrent(ctx.token)) return;
  if (rows.some((r) => r.problem)) {
    toast('راجع السلة: بعض المنتجات تغيّرت', 'error');
    return go('/cart', null, { replace: true });
  }
  const groups = groupByStore(rows);
  const methods = Object.keys(METHODS).filter((m) => platform.payment_methods?.[m] && (m === 'cod' || platform.revenue_ready));
  if (!methods.includes(st.method)) st.method = methods[0] || 'cod';
  if (!st.addresses.some((a) => a.id === st.addressId)) st.addressId = st.addresses[0]?.id || null;
  const address = () => st.addresses.find((a) => a.id === st.addressId);

  async function quote() {
    const a = address();
    if (!a) return;
    const key = a.id + ':' + groups.map((g) => g.store?.id).join(',');
    if (st.quoteFor === key && st.quote) return;
    st.quote = null;
    st.quoteError = '';
    st.quoteFor = key;
    paint();
    try {
      const q = check(await db.rpc('quote_delivery_route', { p_stores: groups.map((g) => g.store.id), p_lat: +a.latitude, p_lng: +a.longitude }));
      if (st.quoteFor !== key) return;
      st.quote = q;
    } catch (e) {
      if (st.quoteFor !== key) return;
      st.quoteError = e?.message && /[؀-ۿ]/.test(e.message) ? e.message : 'تعذّر حساب أجرة التوصيل لهذا الموقع.';
    }
    if (isCurrent(ctx.token)) paint();
  }
  const sub = subtotal(rows),
    service = (platform.delivery.platform_fee || 0) * groups.length;
  function paint() {
    const a = address();
    const fee = st.quote?.delivery_fee;
    const total = sub + service + (fee || 0);
    render(
      main,
      html`<h1>إتمام الشراء</h1>
      <ol class="steps"><li class="done">السلة</li><li class="${a ? 'done' : 'now'}">العنوان</li><li class="${a ? 'now' : ''}">الدفع والتأكيد</li></ol>
      <div class="two-col"><div>
        <section class="card"><div class="card-head"><h2>${icon('pin', 20)} عنوان التوصيل</h2><button class="btn btn-outline btn-sm" data-action="newAddress">${icon('plus', 16)} عنوان جديد</button></div>
          ${st.addresses.length ? html`<div class="choice-list">${st.addresses.map((x) => html`<label class="choice"><input type="radio" name="addr" value="${x.id}" ${x.id === st.addressId ? 'checked' : ''} data-addr><span class="choice-body"><b>${x.label}</b><span>${x.recipient_name} · <span class="ltr">${x.phone}</span></span><small>${x.address}</small></span><button type="button" class="icon-btn" data-action="editAddress" data-id="${x.id}" aria-label="تعديل">${icon('edit', 18)}</button></label>`)}</div>` : html`<div class="empty" style="padding:20px">${icon('pin', 36)}<p>أضف عنوانك وحدّد موقعك على الخريطة ليصل السائق بسهولة.</p><button class="btn btn-primary" data-action="newAddress">إضافة عنوان</button></div>`}
        </section>
        <section class="card"><h2>${icon('wallet', 20)} طريقة الدفع</h2><div class="choice-list">
          ${methods.map((m) => html`<label class="choice"><input type="radio" name="method" value="${m}" ${st.method === m ? 'checked' : ''} data-method><span style="color:var(--brand)">${icon(METHODS[m].ic, 26)}</span><span class="choice-body"><b>${METHODS[m].label}</b><small>${METHODS[m].text}</small></span></label>`)}
        </div>${st.method !== 'cod' ? html`<p class="muted small" style="margin-top:10px">${icon('lock', 14)} سيتم تحويلك إلى صفحة الدفع الآمنة بعد تأكيد الطلب. لا نحفظ بيانات بطاقتك.</p>` : ''}</section>
        <section class="card"><h2>${icon('edit', 20)} ملاحظة للمتجر والسائق (اختياري)</h2><textarea class="input" data-note maxlength="300" rows="2" placeholder="مثال: الاتصال قبل الوصول">${st.note}</textarea></section>
        <section class="card"><h2>${icon('bag', 20)} المنتجات</h2>${groups.map((g) => html`<div style="margin-top:8px"><b>${icon('store', 16)} ${g.store?.name}</b>${g.rows.map((r) => html`<div class="kv small"><span>${r.p.name}${r.item.label ? ' · ' + r.item.label : ''} × ${r.line.q}</span><span>${money(r.item.price * r.line.q)}</span></div>`)}</div>`)}</section>
      </div>
      <aside class="summary card"><h2>ملخص الدفع</h2>
        <div class="kv"><span>المنتجات</span><b>${money(sub)}</b></div>
        <div class="kv"><span>التوصيل${st.quote?.route_km != null ? html` <small class="muted">(${(+st.quote.route_km).toFixed(1)} كم)</small>` : ''}</span><b>${!a ? '—' : st.quote ? money(fee) : st.quoteError ? '—' : html`<span class="spinner"></span>`}</b></div>
        ${service ? html`<div class="kv"><span>رسوم الخدمة</span><b>${money(service)}</b></div>` : ''}
        <div class="kv total"><span>الإجمالي</span><b>${st.quote ? money(total) : '—'}</b></div>
        ${st.quote?.high_fee ? html`<div class="notice notice-warn">${icon('alert', 18)}<p>المسافة طويلة أو المتاجر كثيرة فارتفعت الأجرة. يمكنك تقسيم الطلب.</p></div>` : ''}
        ${st.quoteError ? html`<div class="notice notice-bad">${icon('alert', 18)}<p>${st.quoteError}</p></div><button class="btn btn-outline btn-block" data-action="requote">إعادة الحساب</button>` : ''}
        <button class="btn btn-primary btn-lg btn-block" data-action="place" ${a && st.quote ? '' : 'disabled'} style="margin-top:12px">${icon('lock', 18)} ${st.method === 'cod' ? 'تأكيد الطلب' : 'تأكيد والانتقال للدفع'}</button>
        <p class="muted small" style="margin-top:10px">بتأكيد الطلب أنت توافق على <a href="#/pages/terms">الشروط</a> و<a href="#/pages/returns">سياسة الإلغاء</a>.</p>
      </aside></div>`,
    );
    main.querySelectorAll('[data-addr]').forEach((r) =>
      r.addEventListener('change', () => {
        st.addressId = r.value;
        prefs.set('souq.v2.address', r.value);
        quote();
      }),
    );
    main.querySelectorAll('[data-method]').forEach((r) =>
      r.addEventListener('change', () => {
        st.method = r.value;
        paint();
      }),
    );
    main.querySelector('[data-note]').addEventListener('input', (e) => (st.note = e.target.value));
  }
  pageActions({
    newAddress: async () => {
      const row = await editAddress(null, platform.zones);
      if (!row) return;
      st.addresses.unshift(row);
      st.addressId = row.id;
      prefs.set('souq.v2.address', row.id);
      paint();
      quote();
    },
    editAddress: async (b, e) => {
      e.preventDefault();
      const row = await editAddress(st.addresses.find((x) => x.id === b.dataset.id), platform.zones);
      if (!row) return;
      st.addresses = st.addresses.map((x) => (x.id === row.id ? row : x));
      st.quoteFor = '';
      paint();
      quote();
    },
    requote: () => {
      st.quoteFor = '';
      quote();
    },
    place: (b) =>
      busy(b, async () => {
        const a = address();
        if (containsPhone(st.note)) throw new Error('لا تكتب رقم الهاتف في الملاحظة');
        const payload = {
          p_groups: groups.map((g) => ({ store: g.store.id, lines: g.rows.map((r) => ({ id: r.p.id, variant_id: r.line.vid || null, quantity: r.line.q })) })),
          p_name: a.recipient_name,
          p_phone: a.phone,
          p_phone2: a.phone_secondary || '',
          p_address: a.address,
          p_note: st.note.trim(),
          p_lat: +a.latitude,
          p_lng: +a.longitude,
          p_expected_fee: st.quote.delivery_fee,
          p_fingerprint: st.quote.fingerprint,
          p_platform_fee: platform.delivery.platform_fee || 0,
        };
        // The same request id makes a retried tap return the same orders instead of duplicating them.
        const key = JSON.stringify(payload);
        if (st.requestKey !== key) {
          st.request = uuid();
          st.requestKey = key;
        }
        let ids;
        try {
          ids = check(await db.rpc('place_route_order', { ...payload, p_request: st.request }));
        } catch (e) {
          if (String(e?.message).includes('delivery fee changed')) {
            invalidate('platform');
            platform = await getPlatform();
            st.quoteFor = '';
            await quote();
            return toast('تغيّرت أجرة التوصيل أو الرسوم. راجع الإجمالي الجديد ثم أكّد.', 'error');
          }
          throw e;
        }
        cart.clear();
        if (st.method !== 'cod') {
          try {
            return await startOnlinePayment('order', ids, st.method, '#/order-placed?ids=' + ids.join(','));
          } catch (e) {
            toastError(e);
            return go('/order-placed', { ids: ids.join(','), pay: 'failed' });
          }
        }
        go('/order-placed', { ids: ids.join(',') });
      }, 'جارٍ إرسال الطلب…'),
    retry: () => checkoutPage(ctx),
  });
  paint();
  quote();
}

export async function orderPlacedPage(ctx) {
  const main = await mountShop();
  setTitle('تم استلام طلبك');
  const ids = (ctx.query.get('ids') || '').split(',').filter(Boolean);
  const pay = ctx.query.get('payment') || new URLSearchParams(location.search).get('payment') || ctx.query.get('pay');
  render(
    main,
    html`<section class="card success-hero" style="max-width:640px;margin:20px auto">
      <div class="ring">${icon(pay === 'failed' ? 'alert' : 'check', 44)}</div>
      <h1>${pay === 'failed' ? 'تم إنشاء طلبك ولم يكتمل الدفع' : 'شكرًا لك! وصل طلبك'}</h1>
      <p class="muted">${pay === 'failed' ? 'يمكنك إعادة محاولة الدفع من صفحة الطلب، أو الدفع نقدًا عند الاستلام.' : pay === 'success' ? 'تم الدفع بنجاح. سيبدأ المتجر بتجهيز طلبك.' : 'سيوافق المتجر ويستلمه سائق التوصيل. تابع كل خطوة من صفحة طلباتي.'}</p>
      ${ids.length ? html`<p>رقم الطلب: ${ids.map((id) => html`<b class="ltr">${shortId(id)}</b> `)}</p>` : ''}
      <div class="row-actions" style="width:100%"><a class="btn btn-primary" href="${ids.length === 1 ? '#/orders/' + ids[0] : '#/orders'}">${icon('package', 18)} تتبع الطلب</a><a class="btn btn-outline" href="#/">متابعة التسوق</a></div>
    </section>`,
  );
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);
}
export { confirmDialog };
