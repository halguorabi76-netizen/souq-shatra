import { html, render, $, debounce, safeUrl } from '../core/dom.js';
import { globalActions } from '../core/actions.js';
import { icon } from '../core/icons.js';
import { href, go, current } from '../core/router.js';
import { cart, onCart, theme } from '../core/state.js';
import { session, onSession, isSeller, isDriver, isAdmin } from '../core/session.js';
import { getCategories, searchProducts, getStores, interactions, toggleFavorite, getPlatform, getProduct, chosenItem } from '../core/api.js';
import { toast, toastError } from '../core/ui.js';
import { money } from '../core/format.js';

export const LOGO = 'icons/shatra-calligraphy-192-v174.png';
let mounted = null;
export const favorites = { ids: new Set(), loadedFor: null };

export async function loadFavorites() {
  const uid = session.user?.id || null;
  if (favorites.loadedFor === uid) return;
  favorites.loadedFor = uid;
  favorites.ids = new Set(uid ? (await interactions(uid)).filter((r) => r.kind === 'favorite').map((r) => r.product_id) : []);
}

function header(cats) {
  const name = session.profile?.full_name?.split(' ')[0];
  return html`<header class="site-header">
    <div class="container header-row">
      <a class="brand" href="#/" aria-label="سوق الشطرة — الرئيسية"><img src="${LOGO}" alt="" width="40" height="40"><span>سوق الشطرة<small>SOUQ AL SHATRA</small></span></a>
      ${searchForm('q-desktop')}
      <nav class="header-actions" aria-label="حسابي">
        <a class="header-account" href="${session.user ? '#/account' : '#/login'}">${icon('user', 22)}<span class="who"><small>${session.user ? 'مرحبًا' : 'تسجيل الدخول'}</small><b>${session.user ? name || 'حسابي' : 'حسابي'}</b></span></a>
        <a class="icon-btn" href="#/favorites" aria-label="المفضلة">${icon('heart', 22)}</a>
        <a class="icon-btn" href="#/cart" aria-label="السلة">${icon('cart', 24)}<span class="count-dot" data-cart-count hidden></span></a>
      </nav>
    </div>
    <div class="container mobile-search">${searchForm('q-mobile')}</div>
    <nav class="cat-strip" aria-label="الأقسام"><div class="container">
      <a href="#/stores">${icon('store', 16)} المتاجر</a>
      <a href="#/products">${icon('box', 16)} المنتجات</a>
      <a href="#/products?sort=deals">${icon('percent', 16)} العروض</a>
      ${cats.filter((c) => !c.parent_id).slice(0, 14).map((c) => html`<a href="${href('/products', { cat: c.name })}">${c.name}</a>`)}
    </div></nav>
  </header>`;
}
function searchForm(id) {
  const q = current.path === '/search' ? current.query.get('q') || '' : '';
  return html`<form class="search-form" role="search" data-search><label class="sr-only" for="${id}">ابحث</label><input id="${id}" name="q" type="search" value="${q}" placeholder="ابحث عن منتج، متجر أو قسم…" autocomplete="off" enterkeyhint="search"><button aria-label="بحث">${icon('search', 18)}</button><div class="suggest" hidden></div></form>`;
}
function footer(platform) {
  const methods = platform?.payment_methods || { cod: true };
  return html`<footer class="site-footer"><div class="container">
    <div class="footer-grid">
      <div><a class="brand" href="#/"><img src="${LOGO}" alt="" width="40" height="40"><span>سوق الشطرة<small>SOUQ AL SHATRA</small></span></a>
        <p style="margin-top:12px">متاجر مدينتك في تطبيق واحد: تسوّق من محلات الشطرة، وادفع عند الاستلام أو إلكترونيًا، ويصلك طلبك مع سائق محلي.</p>
        <div class="pay-chips">${methods.cod ? html`<span>الدفع عند الاستلام</span>` : ''}${methods.zaincash ? html`<span>زين كاش</span>` : ''}${methods.card ? html`<span>كي كارد / ماستر كارد</span>` : ''}</div></div>
      <div><h4>تسوّق</h4><ul><li><a href="#/search">كل المنتجات</a></li><li><a href="#/search?sort=deals">العروض</a></li><li><a href="#/stores">المتاجر</a></li><li><a href="#/favorites">المفضلة</a></li></ul></div>
      <div><h4>اعمل معنا</h4><ul><li>${isSeller() ? html`<a href="#/seller">مركز البائع</a>` : html`<a href="#/sell">بِع في سوق الشطرة</a>`}</li><li>${isDriver() ? html`<a href="#/driver">تطبيق السائق</a>` : html`<a href="#/drive">انضم كسائق توصيل</a>`}</li></ul></div>
      <div><h4>المساعدة</h4><ul><li><a href="#/pages/faq">الأسئلة الشائعة</a></li><li><a href="#/pages/returns">الإرجاع والإلغاء</a></li><li><a href="#/pages/terms">الشروط والأحكام</a></li><li><a href="#/pages/privacy">سياسة الخصوصية</a></li><li><a href="https://wa.me/${platform?.support_phone || '9647837271707'}" target="_blank" rel="noopener" data-follow>تواصل عبر واتساب</a></li></ul></div>
    </div>
    <div class="footer-bottom"><span>© ${new Date().getFullYear()} سوق الشطرة. جميع الحقوق محفوظة.</span><button class="link-btn" style="color:#e4e8fb" data-action="toggleTheme">${icon('moon', 16)} تبديل المظهر</button></div>
  </div></footer>`;
}
function tabbar() {
  const p = current.path;
  const a = (to, ic, label, active, extra = '') => html`<a href="${to}" class="${active ? 'active' : ''}">${icon(ic, 22)}<span>${label}</span>${extra}</a>`;
  return html`<nav class="tabbar" aria-label="التنقل">${a('#/', 'home', 'الرئيسية', p === '/')}${a('#/stores', 'store', 'المتاجر', p === '/stores' || p.startsWith('/s/'))}${a('#/products', 'box', 'المنتجات', p === '/products' || p === '/search')}${a('#/cart', 'cart', 'السلة', p === '/cart' || p === '/checkout', html`<span class="count-dot" data-cart-count hidden></span>`)}${a(session.user ? '#/account' : '#/login', 'user', 'حسابي', p.startsWith('/account') || p === '/login' || p.startsWith('/orders'))}</nav>`;
}
export async function mountShop() {
  document.body.classList.add('has-tabbar');
  document.body.classList.remove('ws-mode');
  const [cats, platform] = await Promise.all([getCategories().catch(() => []), getPlatform().catch(() => null)]);
  const key = 'shop:' + (session.user?.id || '') + ':' + (session.profile?.full_name || '');
  if (mounted !== key || !$('#main')) {
    render('#app', html`${header(cats)}<main id="main" class="container" tabindex="-1"></main>${footer(platform)}<div id="tabbar-host">${tabbar()}</div>`);
    mounted = key;
    wireSearch();
  } else render('#tabbar-host', tabbar());
  syncCartBadge();
  const q = current.path === '/search' ? current.query.get('q') || '' : '';
  document.querySelectorAll('[data-search] input').forEach((i) => (i.value = q));
  document.querySelectorAll('.cat-strip a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === location.hash));
  return $('#main');
}
export const unmountShop = () => (mounted = null);
export function syncCartBadge() {
  const n = cart.count();
  document.querySelectorAll('[data-cart-count]').forEach((el) => {
    el.hidden = !n;
    el.textContent = n > 99 ? '99+' : n;
  });
}
onCart(syncCartBadge);
onSession(() => {
  mounted = null;
  favorites.loadedFor = undefined;
});

function wireSearch() {
  document.querySelectorAll('[data-search]').forEach((form) => {
    const input = form.querySelector('input'),
      box = form.querySelector('.suggest');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      box.hidden = true;
      input.blur();
      go('/search', { q: input.value.trim() });
    });
    const suggest = debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) return (box.hidden = true);
      try {
        const [{ items }, stores] = await Promise.all([searchProducts({ q, size: 6 }), getStores()]);
        if (input.value.trim() !== q) return;
        const storeHits = stores.filter((s) => s.name.includes(q)).slice(0, 3);
        render(
          box,
          html`${storeHits.map((s) => html`<a href="${href('/s/' + s.id)}">${icon('store', 18)}<span><b>${s.name}</b><br><small class="muted">متجر</small></span></a>`)}
          ${items.map((p) => html`<a href="${href('/p/' + p.id)}"><span class="thumb">${p.img ? html`<img src="${safeUrl(p.img)}" alt="">` : icon('image', 16)}</span><span>${p.name}<br><small class="muted">${money(p.display_price)}</small></span></a>`)}
          <a href="${href('/search', { q })}">${icon('search', 18)} عرض كل النتائج لـ «${q}»</a>`,
        );
        box.hidden = false;
      } catch {}
    }, 250);
    input.addEventListener('input', suggest);
    input.addEventListener('focus', suggest);
    input.addEventListener('blur', () => setTimeout(() => (box.hidden = true), 200));
  });
}

// ---------- shared actions used across shop pages ----------
export async function toggleFav(btn) {
  if (!session.user) {
    toast('سجّل الدخول لحفظ المنتجات في المفضلة');
    return go('/login', { next: location.hash.slice(1) });
  }
  const id = btn.dataset.id,
    on = !favorites.ids.has(id);
  btn.setAttribute('aria-pressed', String(on));
  try {
    await toggleFavorite(session.user.id, id, on);
    on ? favorites.ids.add(id) : favorites.ids.delete(id);
    toast(on ? 'أُضيف إلى المفضلة' : 'أُزيل من المفضلة', 'success');
  } catch (e) {
    btn.setAttribute('aria-pressed', String(!on));
    toastError(e);
  }
}
export async function quickAdd(btn) {
  try {
    const p = await getProduct(btn.dataset.id);
    if (!p) return toast('المنتج غير متاح', 'error');
    if (p.has_variants) return go('/p/' + p.id);
    const item = chosenItem(p, null);
    const inCart = cart.lines.find((l) => l.pid === p.id && !l.vid)?.q || 0;
    if (!p.in_stock || item.stock < inCart + 1) return toast('الكمية المطلوبة غير متوفرة', 'error');
    cart.add({ pid: p.id, vid: null, q: 1, sid: p.store_id, name: p.name, price: item.price, img: p.img, label: '' });
    toast('أُضيف إلى السلة', 'success');
  } catch (e) {
    toastError(e);
  }
}
export function wireShopActions() {
  globalActions({
    fav: toggleFav,
    quickAdd,
    toggleTheme: () => theme.set(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'),
  });
}
export function setTitle(t) {
  document.title = t ? `${t} | سوق الشطرة` : 'سوق الشطرة — تسوّق من متاجر الشطرة';
}
export const roleLinks = () => ({ seller: isSeller(), driver: isDriver(), admin: isAdmin() });
