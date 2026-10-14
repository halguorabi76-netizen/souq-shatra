import { html, render, formData, safeUrl } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageActions } from '../core/actions.js';
import { href, go, isCurrent } from '../core/router.js';
import { db, check } from '../core/db.js';
import { session, signIn, signUp, signOut, resetPassword, updatePassword, updateEmail, signInWithGoogle, authProviders, isSeller, isDriver, isAdmin, load as reloadSession } from '../core/session.js';
import { getProductsByIds, getStores, notifications, markRead, getPlatform } from '../core/api.js';
import { theme } from '../core/state.js';
import { spinnerBlock, errorBlock, emptyState, toast, busy, modal, confirmDialog } from '../core/ui.js';
import { phoneDigits, ago } from '../core/format.js';
import { productCard } from './components.js';
import { mountShop, setTitle, favorites, loadFavorites, LOGO } from './shell.js';
import { loadAddresses, editAddress } from './checkout.js';

const safeNext = (n) => (n && /^\/[a-z0-9/_-]*$/i.test(n) ? n : '/account');
const pw = (name, label, auto) => html`<label class="field"><span>${label}</span><div class="pw"><input name="${name}" type="password" required minlength="6" autocomplete="${auto}" class="ltr"><button type="button" class="icon-btn" data-action="togglePw" aria-label="إظهار كلمة المرور">${icon('eye', 18)}</button></div></label>`;

export async function loginPage(ctx) {
  const main = await mountShop();
  setTitle('تسجيل الدخول');
  const next = safeNext(ctx.query.get('next'));
  if (session.user) return go(next, null, { replace: true });
  let role = ctx.query.get('role') || 'buyer';
  const paint = () => {
    render(
      main,
      html`<div class="auth-wrap"><div class="card">
        <div class="auth-logo"><img src="${LOGO}" alt=""><h1 style="margin:0">أهلًا بعودتك</h1><p class="muted" style="margin:0">سجّل الدخول لمتابعة التسوق وطلباتك</p></div>
        <div class="role-tabs" role="group" aria-label="نوع الحساب">${[['buyer', 'زبون'], ['seller', 'بائع'], ['driver', 'سائق']].map(([v, l]) => html`<button type="button" data-action="role" data-v="${v}" aria-pressed="${role === v}">${l}</button>`)}</div>
        <div id="providers"></div>
        <form data-login novalidate>
          <label class="field"><span>${role === 'buyer' ? 'البريد الإلكتروني' : 'البريد أو اسم المستخدم'}</span><input name="id" required autocomplete="username" class="ltr" inputmode="email" autocapitalize="none" spellcheck="false" placeholder="${role === 'buyer' ? 'name@example.com' : 'name@example.com أو @username'}"></label>
          ${pw('password', 'كلمة المرور', 'current-password')}
          <div style="display:flex;justify-content:space-between;margin:-4px 0 14px"><span></span><a href="#/reset">نسيت كلمة المرور؟</a></div>
          <button class="btn btn-primary btn-lg btn-block">تسجيل الدخول</button>
        </form>
        <p style="text-align:center;margin-top:16px">ليس لديك حساب؟ <a href="${href('/register', { next, role })}">أنشئ حسابًا</a></p>
        ${role !== 'buyer' ? html`<p class="muted small" style="text-align:center">${role === 'seller' ? 'ليس لديك متجر بعد؟' : 'لست سائقًا معتمدًا بعد؟'} <a href="${role === 'seller' ? '#/sell' : '#/drive'}">قدّم طلب انضمام</a></p>` : ''}
      </div></div>`,
    );
    authProviders().then((ext) => {
      if ((ext && !ext.google) || !main.querySelector('#providers')) return;
      render(main.querySelector('#providers'), html`<button class="btn btn-outline btn-block" data-action="google"><b style="color:#4285f4">G</b> المتابعة باستخدام Google</button><div class="or">أو</div>`);
    });
    main.querySelector('[data-login]').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formData(e.target);
      if (!v.id || (v.password || '').length < 6) return toast('اكتب البريد وكلمة مرور من ٦ أحرف على الأقل', 'error');
      if (role === 'buyer' && !v.id.includes('@')) return toast('اكتب بريدًا إلكترونيًا صحيحًا', 'error');
      busy(e.target.querySelector('button.btn-primary'), async () => {
        await signIn(v.id, v.password, role === 'buyer' ? 'seller' : role);
        await reloadSession();
        toast('تم تسجيل الدخول', 'success');
        go(role === 'seller' ? '/seller' : role === 'driver' ? '/driver' : next, null, { replace: true });
      });
    });
  };
  pageActions({
    role: (b) => {
      role = b.dataset.v;
      paint();
    },
    google: () => {
      try {
        sessionStorage.setItem('souq.v2.after-login', next);
      } catch {}
      signInWithGoogle().catch((e) => toast(e.message, 'error'));
    },
  });
  paint();
}

export async function registerPage(ctx) {
  const main = await mountShop();
  setTitle('إنشاء حساب');
  const next = safeNext(ctx.query.get('next'));
  if (session.user) return go(next, null, { replace: true });
  render(
    main,
    html`<div class="auth-wrap"><div class="card">
      <div class="auth-logo"><img src="${LOGO}" alt=""><h1 style="margin:0">حساب جديد</h1><p class="muted" style="margin:0">انضم لسوق الشطرة خلال دقيقة</p></div>
      <form data-register novalidate>
        <label class="field"><span>الاسم الكامل</span><input name="name" required maxlength="120" autocomplete="name"></label>
        <label class="field"><span>البريد الإلكتروني</span><input name="email" type="email" required class="ltr" autocomplete="email" inputmode="email"></label>
        <label class="field"><span>رقم الهاتف</span><input name="phone" class="ltr" inputmode="tel" autocomplete="tel" placeholder="07xxxxxxxxx"></label>
        ${pw('password', 'كلمة المرور (٦ أحرف على الأقل)', 'new-password')}
        ${pw('confirm', 'تأكيد كلمة المرور', 'new-password')}
        <label class="check"><input type="checkbox" name="terms" required> <span>أوافق على <a href="#/pages/terms" target="_blank">الشروط</a> و<a href="#/pages/privacy" target="_blank">سياسة الخصوصية</a></span></label>
        <button class="btn btn-primary btn-lg btn-block" style="margin-top:10px">إنشاء الحساب</button>
      </form>
      <p style="text-align:center;margin-top:16px">لديك حساب؟ <a href="${href('/login', { next })}">سجّل الدخول</a></p>
    </div></div>`,
  );
  main.querySelector('[data-register]').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = formData(e.target),
      phone = phoneDigits(v.phone);
    const err = v.name.length < 2 ? 'اكتب اسمك' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email) ? 'البريد غير صحيح' : phone && !/^\d{10,15}$/.test(phone) ? 'رقم الهاتف غير صحيح' : v.password.length < 6 ? 'كلمة المرور قصيرة' : v.password !== v.confirm ? 'كلمتا المرور غير متطابقتين' : !e.target.terms.checked ? 'وافق على الشروط للمتابعة' : '';
    if (err) return toast(err, 'error');
    busy(e.target.querySelector('button.btn-primary'), async () => {
      const r = await signUp({ name: v.name, email: v.email, password: v.password, phone });
      if (!r.session) {
        render(main, html`<div class="auth-wrap"><div class="card success-hero"><div class="ring">${icon('mail', 40)}</div><h1>تحقق من بريدك</h1><p class="muted">أرسلنا رابط التفعيل إلى <b class="ltr">${v.email}</b>. افتح الرابط ثم سجّل الدخول.</p><a class="btn btn-primary" href="${href('/login', { next })}">تسجيل الدخول</a></div></div>`);
        return;
      }
      await reloadSession();
      toast('مرحبًا بك في سوق الشطرة', 'success');
      go(next, null, { replace: true });
    });
  });
}

export async function resetPage() {
  const main = await mountShop();
  setTitle('استعادة كلمة المرور');
  render(main, html`<div class="auth-wrap"><div class="card"><h1>استعادة كلمة المرور</h1><p class="muted">اكتب بريدك وسنرسل لك رابطًا لتعيين كلمة مرور جديدة.</p><form data-reset><label class="field"><span>البريد الإلكتروني</span><input name="email" type="email" required class="ltr"></label><button class="btn btn-primary btn-block">إرسال الرابط</button></form><p style="margin-top:14px"><a href="#/login">العودة لتسجيل الدخول</a></p></div></div>`);
  main.querySelector('[data-reset]').addEventListener('submit', (e) => {
    e.preventDefault();
    busy(e.target.querySelector('button'), async () => {
      await resetPassword(formData(e.target).email);
      render(main, html`<div class="auth-wrap"><div class="card success-hero"><div class="ring">${icon('mail', 40)}</div><h2>راجع بريدك</h2><p class="muted">إذا كان البريد مسجلًا ستصلك رسالة خلال دقائق. تحقق من مجلد الرسائل غير المرغوبة.</p><a class="btn btn-primary" href="#/login">تسجيل الدخول</a></div></div>`);
    });
  });
}
export function passwordRecoveryDialog() {
  const d = modal('تعيين كلمة مرور جديدة', html`<form data-recover>${pw('password', 'كلمة المرور الجديدة', 'new-password')}${pw('confirm', 'تأكيد كلمة المرور', 'new-password')}<button class="btn btn-primary btn-block">حفظ</button></form>`, { size: 'sm' });
  d.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = formData(e.target);
    if (v.password.length < 6 || v.password !== v.confirm) return toast('تأكد من تطابق كلمتي المرور (٦ أحرف على الأقل)', 'error');
    busy(e.target.querySelector('button'), async () => {
      await updatePassword(v.password);
      d.close();
      toast('تم تحديث كلمة المرور', 'success');
    });
  });
}

export async function accountPage() {
  const main = await mountShop();
  setTitle('حسابي');
  if (!session.user) return go('/login', { next: '/account' }, { replace: true });
  const p = session.profile || {};
  const storeState = session.store ? (session.store.removed ? 'removed' : session.store.approved ? 'approved' : 'pending') : null;
  render(
    main,
    html`<section class="account-hero"><span class="avatar">${(p.full_name || session.user.email || '؟').trim().slice(0, 1)}</span><div><h1 style="margin:0">${p.full_name || 'حسابي'}</h1><div class="ltr" style="opacity:.85">${session.user.email}</div>${p.disabled ? html`<span class="badge badge-bad">الحساب موقوف</span>` : ''}</div></section>
    <div class="two-col" style="grid-template-columns:1fr 1fr">
      <section class="card"><h2>التسوق</h2><nav class="menu-list">
        <a href="#/orders">${icon('package', 20)} طلباتي <span class="end">${icon('chevL', 18)}</span></a>
        <a href="#/favorites">${icon('heart', 20)} المفضلة <span class="end">${icon('chevL', 18)}</span></a>
        <a href="#/account/addresses">${icon('pin', 20)} عناويني <span class="end">${icon('chevL', 18)}</span></a>
        <a href="#/notifications">${icon('bell', 20)} الإشعارات <span class="end">${icon('chevL', 18)}</span></a>
      </nav></section>
      <section class="card"><h2>الحساب</h2><nav class="menu-list">
        <button data-action="editProfile">${icon('user', 20)} البيانات الشخصية <span class="end">${icon('chevL', 18)}</span></button>
        <button data-action="changeEmail">${icon('mail', 20)} تغيير البريد الإلكتروني <span class="end">${icon('chevL', 18)}</span></button>
        <button data-action="changePassword">${icon('lock', 20)} تغيير كلمة المرور <span class="end">${icon('chevL', 18)}</span></button>
        <button data-action="themeMenu">${icon('moon', 20)} المظهر <span class="end">${{ auto: 'تلقائي', light: 'فاتح', dark: 'داكن' }[theme.get()]}</span></button>
      </nav></section>
      <section class="card"><h2>مساحات العمل</h2><nav class="menu-list">
        ${isSeller() ? html`<a href="#/seller">${icon('store', 20)} مركز البائع <span class="end">${icon('chevL', 18)}</span></a>` : storeState === 'pending' ? html`<a href="#/sell">${icon('clock', 20)} طلب متجرك قيد المراجعة <span class="end">${icon('chevL', 18)}</span></a>` : html`<a href="#/sell">${icon('store', 20)} افتح متجرك وابدأ البيع <span class="end">${icon('chevL', 18)}</span></a>`}
        ${isDriver() ? html`<a href="#/driver">${icon('truck', 20)} تطبيق السائق <span class="end">${icon('chevL', 18)}</span></a>` : html`<a href="#/drive">${icon('truck', 20)} انضم كسائق توصيل <span class="end">${icon('chevL', 18)}</span></a>`}
        ${isAdmin() ? html`<a href="admin.html" data-follow>${icon('shield', 20)} لوحة الإدارة <span class="end">${icon('external', 18)}</span></a>` : ''}
      </nav></section>
      <section class="card"><h2>المساعدة</h2><nav class="menu-list">
        <a href="#/pages/faq">${icon('help', 20)} الأسئلة الشائعة</a>
        <a href="#/pages/returns">${icon('undo', 20)} الإلغاء والإرجاع</a>
        <button data-action="support">${icon('whatsapp', 20)} خدمة العملاء</button>
        <button data-action="logout" style="color:var(--bad)">${icon('logout', 20)} تسجيل الخروج</button>
      </nav></section>
    </div>`,
  );
  pageActions({
    editProfile: () => {
      const d = modal('البيانات الشخصية', html`<form><label class="field"><span>الاسم</span><input name="name" required maxlength="120" value="${p.full_name || ''}"></label><label class="field"><span>الهاتف</span><input name="phone" class="ltr" inputmode="tel" value="${p.phone || ''}"></label><button class="btn btn-primary btn-block">حفظ</button></form>`, { size: 'sm' });
      d.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = formData(e.target),
          phone = phoneDigits(v.phone);
        if (v.name.length < 2 || (phone && !/^\d{10,15}$/.test(phone))) return toast('تحقق من الاسم ورقم الهاتف', 'error');
        busy(e.target.querySelector('button'), async () => {
          check(await db.from('profiles').update({ full_name: v.name, phone }).eq('id', session.user.id));
          await reloadSession();
          d.close();
          toast('تم الحفظ', 'success');
          accountPage();
        });
      });
    },
    changeEmail: () => {
      const d = modal('تغيير البريد', html`<form><p class="muted small">سيصلك رابط تأكيد على البريد الجديد.</p><label class="field"><span>البريد الجديد</span><input name="email" type="email" required class="ltr"></label><button class="btn btn-primary btn-block">إرسال رابط التأكيد</button></form>`, { size: 'sm' });
      d.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        busy(e.target.querySelector('button'), async () => {
          await updateEmail(formData(e.target).email);
          d.close();
          toast('أرسلنا رابط التأكيد إلى بريدك الجديد', 'success');
        });
      });
    },
    changePassword: passwordRecoveryDialog,
    themeMenu: () => {
      const d = modal('المظهر', html`<div class="choice-list">${[['auto', 'تلقائي حسب الجهاز'], ['light', 'فاتح'], ['dark', 'داكن']].map(([v, l]) => html`<label class="choice"><input type="radio" name="t" value="${v}" ${theme.get() === v ? 'checked' : ''}><span class="choice-body"><b>${l}</b></span></label>`)}</div>`, { size: 'sm' });
      d.querySelectorAll('input').forEach((i) =>
        i.addEventListener('change', () => {
          theme.set(i.value);
          d.close();
          accountPage();
        }),
      );
    },
    support: async () => {
      const pl = await getPlatform();
      window.open('https://wa.me/' + pl.support_phone, '_blank', 'noopener');
    },
    logout: async (b) => {
      if (!(await confirmDialog('تسجيل الخروج', 'هل تريد تسجيل الخروج من هذا الجهاز؟', { ok: 'خروج' }))) return;
      busy(b, async () => {
        await signOut();
        go('/');
      });
    },
  });
}

export async function favoritesPage(ctx) {
  const main = await mountShop();
  setTitle('المفضلة');
  if (!session.user) return go('/login', { next: '/favorites' }, { replace: true });
  render(main, spinnerBlock());
  try {
    favorites.loadedFor = undefined;
    await loadFavorites();
    const [items, stores] = await Promise.all([getProductsByIds([...favorites.ids]), getStores()]);
    if (!isCurrent(ctx.token)) return;
    const sm = new Map(stores.map((s) => [s.id, s]));
    const live = items.filter((p) => p.active && !p.blocked && sm.has(p.store_id));
    render(main, html`<h1>المفضلة</h1>${live.length ? html`<div class="product-grid">${live.map((p) => productCard(p, { store: sm.get(p.store_id), fav: true }))}</div>` : emptyState('heart', 'لا توجد منتجات مفضلة', 'اضغط على القلب في أي منتج لحفظه هنا.', html`<a class="btn btn-primary" href="#/">تصفح المنتجات</a>`)}`);
  } catch (e) {
    if (isCurrent(ctx.token)) render(main, errorBlock(e));
  }
}

export async function addressesPage(ctx) {
  const main = await mountShop();
  setTitle('عناويني');
  if (!session.user) return go('/login', { next: '/account/addresses' }, { replace: true });
  render(main, spinnerBlock());
  const paint = async () => {
    try {
      const [list, platform] = await Promise.all([loadAddresses(), getPlatform()]);
      if (!isCurrent(ctx.token)) return;
      render(
        main,
        html`<div class="listing-bar"><h1 style="margin:0">عناويني</h1><button class="btn btn-primary" data-action="add">${icon('plus', 18)} عنوان جديد</button></div>
        ${list.length ? list.map((a) => html`<section class="card addr">${icon('pin', 22)}<div style="flex:1"><b>${a.label}</b><div>${a.recipient_name} · <span class="ltr">${a.phone}</span></div><div class="muted small">${a.address}</div></div><button class="icon-btn" data-action="edit" data-id="${a.id}" aria-label="تعديل">${icon('edit', 18)}</button><button class="icon-btn" data-action="del" data-id="${a.id}" aria-label="حذف">${icon('trash', 18)}</button></section>`) : emptyState('pin', 'لا توجد عناوين محفوظة', 'احفظ عنوانك لتسريع الطلب القادم.')}`,
      );
      pageActions({
        add: async () => (await editAddress(null, platform.zones)) && paint(),
        edit: async (b) => (await editAddress(list.find((a) => a.id === b.dataset.id), platform.zones)) && paint(),
        del: async (b) => {
          if (!(await confirmDialog('حذف العنوان', 'سيُحذف العنوان من حسابك.', { ok: 'حذف', danger: true }))) return;
          busy(b, async () => {
            check(await db.from('customer_addresses').delete().eq('id', b.dataset.id).eq('user_id', session.user.id));
            paint();
          });
        },
        retry: paint,
      });
    } catch (e) {
      if (isCurrent(ctx.token)) render(main, errorBlock(e));
    }
  };
  paint();
}

export async function notificationsPage(ctx) {
  const main = await mountShop();
  setTitle('الإشعارات');
  if (!session.user) return go('/login', { next: '/notifications' }, { replace: true });
  render(main, spinnerBlock());
  try {
    const list = await notifications(session.user.id, ['order', 'status', 'assigned', 'delivery_offer', 'app_update', 'site_update', 'warning', 'approval']);
    if (!isCurrent(ctx.token)) return;
    render(main, html`<h1>الإشعارات</h1>${list.length ? html`<div class="notif-list">${list.map((n) => html`<a class="notif ${n.read_at ? '' : 'unread'}" href="${n.order_id ? href('/orders/' + n.order_id) : n.product_id ? href('/p/' + n.product_id) : '#/notifications'}">${icon(n.event_kind === 'warning' ? 'alert' : n.order_id ? 'package' : 'bell', 20)}<span><b>${n.title}</b><br>${n.body}<small>${ago(n.created_at)}</small></span></a>`)}</div>` : emptyState('bell', 'لا توجد إشعارات')}`);
    await markRead(session.user.id, list.filter((n) => !n.read_at).map((n) => n.id));
  } catch (e) {
    if (isCurrent(ctx.token)) render(main, errorBlock(e));
  }
}
export { safeUrl };
