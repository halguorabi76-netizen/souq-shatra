import { html, render, formData } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageActions } from '../core/actions.js';
import { href, go } from '../core/router.js';
import { db, check } from '../core/db.js';
import { session, isSeller, isDriver, load as reloadSession } from '../core/session.js';
import { getPlatform } from '../core/api.js';
import { toast, busy } from '../core/ui.js';
import { money, phoneDigits } from '../core/format.js';
import { pickLocation, validPoint, mapPreview } from '../core/map.js';
import { mountShop, setTitle } from './shell.js';

const wa = (phone, lines) => `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`;

export async function sellPage() {
  const main = await mountShop();
  setTitle('بِع في سوق الشطرة');
  if (isSeller()) return go('/seller', null, { replace: true });
  const platform = await getPlatform().catch(() => ({ plans: [], support_phone: '9647837271707', settings: null }));
  const s = session.store;
  const pending = s && !s.approved && !s.removed;
  let point = null;
  const plans = platform.plans.filter((p) => p.active);
  const commission = platform.settings?.commission_percent;
  render(
    main,
    html`<section class="seller-cta" style="margin-bottom:20px"><div><h1 style="margin:0">اعرض بضاعتك في سوق الشطرة</h1><p style="opacity:.9">عندك محل، أو تبيع من بيتك بلا محل ولا بسطية؟ اعرض بضاعتك لأهل الشطرة واستقبل الطلبات على هاتفك، ونحن نوفر التوصيل.</p></div><div class="art" style="text-align:center;font-size:4.5rem">🏠</div></section>
    <div class="trust">
      <div>${icon('store', 26)}<span><b>متجر باسمك</b><small>رابط خاص تشاركه</small></span></div>
      <div>${icon('package', 26)}<span><b>إدارة سهلة</b><small>منتجات ومخزون ونسخ</small></span></div>
      <div>${icon('truck', 26)}<span><b>توصيل جاهز</b><small>سائق يستلم من بابك</small></span></div>
      <div>${icon('chart', 26)}<span><b>تقارير أرباح</b><small>مبيعاتك يومًا بيوم</small></span></div>
    </div>
    ${plans.length ? html`<section class="section"><div class="section-head"><div><h2>الباقات</h2><p>${commission != null ? `عمولة السوق الافتراضية ${commission}% من قيمة المنتجات المسلّمة فقط.` : 'ابدأ مجانًا ورقِّ باقتك متى شئت.'}</p></div></div>
      <div class="plan-grid">${plans.map((p, i) => html`<div class="plan ${i === 1 ? 'popular' : ''}"><h3>${p.name}</h3><div class="amount">${p.monthly_price ? money(p.monthly_price) : 'مجانًا'}<small class="muted" style="font-size:.9rem">${p.monthly_price ? ' / شهريًا' : ''}</small></div><p class="muted">${p.description}</p><ul>
        <li>${p.max_products ? `حتى ${p.max_products} منتج` : 'منتجات غير محدودة'}</li>
        <li>عمولة ${p.commission_percent ?? commission ?? 0}%</li>
        ${p.featured_days ? html`<li>${p.featured_days} أيام ظهور مميز شهريًا</li>` : ''}</ul></div>`)}</div></section>` : ''}
    <section class="section card" id="join" style="max-width:760px">
      ${!session.user
        ? html`<h2>ابدأ الآن</h2><p class="muted">أنشئ حسابًا أو سجّل الدخول، ثم أكمل بيانات متجرك.</p><div class="row-actions"><a class="btn btn-primary" href="${href('/register', { next: '/sell' })}">إنشاء حساب</a><a class="btn btn-outline" href="${href('/login', { next: '/sell' })}">لدي حساب</a></div>`
        : s?.removed
          ? html`<div class="notice notice-bad">${icon('alert', 18)}<p>هذا المتجر موقوف من الإدارة. تواصل مع خدمة العملاء.</p></div>`
          : html`<h2>${pending ? 'طلبك قيد المراجعة' : 'بيانات المتجر'}</h2>${pending ? html`<div class="notice">${icon('clock', 18)}<p>وصل طلبك للإدارة وسنتواصل معك قريبًا. يمكنك تحديث البيانات أدناه.</p></div>` : html`<p class="muted">تراجع الإدارة الطلب وتتواصل معك قبل تفعيل البيع.</p>`}
          <form data-join novalidate>
            <div class="grid-2"><label class="field"><span>الاسم الأول *</span><input name="first" required value="${(session.profile?.full_name || '').split(' ')[0] || ''}"></label><label class="field"><span>اسم العائلة *</span><input name="last" required value="${(session.profile?.full_name || '').split(' ').slice(1).join(' ')}"></label></div>
            <div class="field"><span>كيف تبيع؟ *</span><div class="kind-choice">
              <label class="choice"><input type="radio" name="kind" value="online" ${s?.store_kind !== 'physical' ? 'checked' : ''}><span>${icon('home', 22)}<b>أبيع من البيت</b><small>بلا محل: أكلات بيتية، خياطة، أشغال يدوية، أي بضاعة. عنوانك يراه السائق فقط.</small></span></label>
              <label class="choice"><input type="radio" name="kind" value="physical" ${s?.store_kind === 'physical' ? 'checked' : ''}><span>${icon('store', 22)}<b>عندي محل أو بسطية</b><small>عنوان المحل يظهر للزبائن في صفحة متجرك.</small></span></label>
            </div></div>
            <label class="field"><span>اسم المتجر *</span><input name="name" required maxlength="100" value="${s?.name || ''}" placeholder="مثال: مطبخ أم علي، خياطة الشطرة"></label>
            <label class="field"><span>رقم التواصل (واتساب) *</span><input name="phone" required class="ltr" inputmode="tel" value="${s?.phone || session.profile?.phone || ''}" placeholder="07xxxxxxxxx"></label>
            <label class="field"><span>عنوان استلام البضاعة *</span><input name="address" required maxlength="500" value="${s?.address || ''}" placeholder="المنطقة، الشارع، أقرب نقطة دالة"></label>
            <div class="field"><span>موقع الاستلام على الخريطة *</span><div data-preview></div><button type="button" class="btn btn-outline" data-action="pickStore">${icon('pin', 18)} تحديد الموقع</button></div>
            <label class="field"><span>ماذا تبيع؟</span><textarea name="description" maxlength="1000">${s?.description || ''}</textarea></label>
            <button class="btn btn-primary btn-lg btn-block">${pending ? 'تحديث الطلب' : 'إرسال طلب الانضمام'}</button>
          </form>`}
    </section>`,
  );
  pageActions({
    pickStore: async () => {
      const p = await pickLocation({ value: point, title: 'موقع المتجر أو استلام البضاعة' });
      if (!p) return;
      point = p;
      render(main.querySelector('[data-preview]'), mapPreview(p));
    },
  });
  main.querySelector('[data-join]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = formData(e.target),
      phone = phoneDigits(v.phone);
    if (!v.first || !v.last || v.name.length < 2 || phone.length < 10 || v.address.length < 3) return toast('أكمل الحقول المطلوبة', 'error');
    if (!validPoint(point)) return toast('حدّد موقع المتجر على الخريطة', 'error');
    busy(e.target.querySelector('button.btn-primary'), async () => {
      check(await db.rpc('request_seller_join_map', { p_first: v.first, p_last: v.last, p_name: v.name, p_phone: phone, p_address: v.address, p_description: v.description || '', p_kind: v.kind, p_lat: point.lat, p_lon: point.lon }));
      await reloadSession();
      toast('وصل طلبك للإدارة', 'success');
      render(
        main.querySelector('#join'),
        html`<div class="success-hero"><div class="ring">${icon('check', 40)}</div><h2>تم إرسال طلبك</h2><p class="muted">ستراجع الإدارة بياناتك وتتواصل معك. لتسريع الموافقة أرسل رسالة واتساب.</p><a class="btn btn-primary" target="_blank" rel="noopener" data-follow href="${wa(platform.support_phone, ['طلب انضمام كبائع — سوق الشطرة', 'الاسم: ' + v.first + ' ' + v.last, 'المتجر: ' + v.name, 'الهاتف: ' + phone, 'العنوان: ' + v.address, 'البريد: ' + session.user.email])}">${icon('whatsapp', 18)} مراسلة الإدارة</a></div>`,
      );
    });
  });
}

export async function drivePage() {
  const main = await mountShop();
  setTitle('انضم كسائق توصيل');
  if (isDriver() && session.driver?.approved) return go('/driver', null, { replace: true });
  const platform = await getPlatform().catch(() => ({ support_phone: '9647837271707' }));
  const d = session.driverProfile || {};
  render(
    main,
    html`<section class="seller-cta" style="margin-bottom:20px"><div><h1 style="margin:0">اربح من التوصيل في مدينتك</h1><p style="opacity:.9">استقبل طلبات التوصيل القريبة منك، واعمل بالوقت الذي يناسبك، واستلم أجرتك عن كل طلب.</p></div><div class="art" style="text-align:center;font-size:4.5rem">🛵</div></section>
    <section class="card" style="max-width:760px">
      ${!session.user
        ? html`<h2>ابدأ الآن</h2><p class="muted">أنشئ حسابًا أو سجّل الدخول، ثم أكمل طلب الانضمام.</p><div class="row-actions"><a class="btn btn-primary" href="${href('/register', { next: '/drive' })}">إنشاء حساب</a><a class="btn btn-outline" href="${href('/login', { next: '/drive' })}">لدي حساب</a></div>`
        : html`<h2>${session.driver ? 'طلبك قيد المراجعة' : 'طلب الانضمام'}</h2>${session.driver ? html`<div class="notice">${icon('clock', 18)}<p>وصل طلبك للإدارة. سيُفعّل حسابك بعد المراجعة.</p></div>` : ''}
          <form data-driver novalidate>
            <label class="field"><span>الاسم الكامل *</span><input name="name" required maxlength="160" value="${d.full_name || session.profile?.full_name || ''}"></label>
            <label class="field"><span>رقم الهاتف *</span><input name="phone" required class="ltr" inputmode="tel" value="${d.phone || session.profile?.phone || ''}"></label>
            <label class="field"><span>منطقة العمل والعنوان *</span><textarea name="address" required maxlength="500">${d.address || ''}</textarea></label>
            <label class="field"><span>وسيلة التوصيل *</span><input name="vehicle" required maxlength="160" placeholder="دراجة نارية، اللون، رقم اللوحة" value="${d.vehicle || ''}"></label>
            <label class="field"><span>اسم مستخدم للدخول (اختياري)</span><input name="username" class="ltr" maxlength="30" placeholder="driver_name" value="${session.profile?.username || ''}"><small>أحرف إنجليزية وأرقام، يبدأ بحرف.</small></label>
            <button class="btn btn-primary btn-lg btn-block">${session.driver ? 'تحديث البيانات' : 'إرسال الطلب'}</button>
          </form>`}
    </section>`,
  );
  main.querySelector('[data-driver]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = formData(e.target),
      phone = phoneDigits(v.phone);
    if (v.name.length < 2 || !/^\d{10,15}$/.test(phone) || v.address.length < 3 || v.vehicle.length < 2) return toast('أكمل الحقول المطلوبة', 'error');
    busy(e.target.querySelector('button'), async () => {
      check(await db.rpc('request_driver_application', { p_name: v.name, p_phone: phone, p_email: session.user.email, p_address: v.address, p_vehicle: v.vehicle }));
      if (v.username) check(await db.rpc('set_professional_username', { p_username: v.username.replace(/^@/, '').toLowerCase() }));
      await reloadSession();
      render(main.querySelector('.card'), html`<div class="success-hero"><div class="ring">${icon('check', 40)}</div><h2>تم إرسال طلبك</h2><p class="muted">ستراجع الإدارة بياناتك. يمكنك مراسلتنا لتسريع التفعيل.</p><a class="btn btn-primary" target="_blank" rel="noopener" data-follow href="${wa(platform.support_phone, ['طلب انضمام كسائق — سوق الشطرة', 'الاسم: ' + v.name, 'الهاتف: ' + phone, 'المنطقة: ' + v.address, 'الوسيلة: ' + v.vehicle, 'البريد: ' + session.user.email])}">${icon('whatsapp', 18)} مراسلة الإدارة</a><a class="btn btn-outline" href="#/driver">تطبيق السائق</a></div>`);
    });
  });
}
