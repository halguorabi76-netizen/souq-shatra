import { theme } from './core/state.js';
import { route, start, setGuard, setNotFound, go, current, refresh } from './core/router.js';
import { load, session, onSession } from './core/session.js';
import { loading } from './core/db.js';
import { wireActions, globalActions, pageActions } from './core/actions.js';
import { html, render } from './core/dom.js';
import { icon } from './core/icons.js';
import { emptyState, closeModals } from './core/ui.js';
import { wireShopActions, mountShop, setTitle } from './shop/shell.js';
import { homePage } from './shop/home.js';
import { searchPage, storesPage } from './shop/search.js';
import { productPage } from './shop/product.js';
import { storePage } from './shop/store.js';
import { cartPage } from './shop/cart.js';
import { checkoutPage, orderPlacedPage } from './shop/checkout.js';
import { ordersPage, orderPage } from './shop/orders.js';
import { loginPage, registerPage, resetPage, accountPage, favoritesPage, addressesPage, notificationsPage, passwordRecoveryDialog } from './shop/account.js';
import { sellPage, drivePage } from './shop/join.js';
import { staticPage } from './shop/pages.js';

theme.apply();
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => theme.apply());

const lazy = (path, name) => async (ctx) => (await import(path))[name](ctx);
route('/', homePage);
route('/search', searchPage);
route('/products', searchPage);
route('/categories', () => go('/products', null, { replace: true }));
route('/c/:name', (ctx) => go('/products', { cat: ctx.params.name }, { replace: true }));
route('/stores', storesPage);
route('/s/:id', storePage);
route('/p/:id', productPage);
route('/cart', cartPage);
route('/checkout', checkoutPage);
route('/order-placed', orderPlacedPage);
route('/orders', ordersPage);
route('/orders/:id', orderPage);
route('/login', loginPage);
route('/register', registerPage);
route('/reset', resetPage);
route('/account', accountPage);
route('/account/addresses', addressesPage);
route('/favorites', favoritesPage);
route('/notifications', notificationsPage);
route('/sell', sellPage);
route('/drive', drivePage);
route('/pages/:slug', staticPage);
route('/seller', lazy('./seller/seller.js', 'sellerPage'), { workspace: 'seller' });
route('/seller/:section', lazy('./seller/seller.js', 'sellerPage'), { workspace: 'seller' });
route('/seller/:section/:id', lazy('./seller/seller.js', 'sellerPage'), { workspace: 'seller' });
route('/driver', lazy('./driver/driver.js', 'driverPage'), { workspace: 'driver' });
route('/driver/:section', lazy('./driver/driver.js', 'driverPage'), { workspace: 'driver' });
setNotFound(async () => {
  const main = await mountShop();
  setTitle('الصفحة غير موجودة');
  render(main, emptyState('search', 'الصفحة غير موجودة', 'ربما تغيّر الرابط.', html`<a class="btn btn-primary" href="#/">العودة للرئيسية</a>`));
});
setGuard(() => {
  pageActions({});
  closeModals();
  return true;
});

wireActions();
wireShopActions();
globalActions({
  togglePw: (b) => {
    const input = b.parentElement.querySelector('input');
    input.type = input.type === 'password' ? 'text' : 'password';
    b.innerHTML = html`${icon(input.type === 'password' ? 'eye' : 'eyeOff', 18)}`.value;
  },
  retry: () => refresh(),
});

// Top progress bar for network activity, offline banner, password recovery.
const bar = document.getElementById('progress');
let barTimer;
loading.listeners.add((n) => {
  clearTimeout(barTimer);
  if (n) barTimer = setTimeout(() => bar?.classList.add('on'), 250);
  else bar?.classList.remove('on');
});
function offline() {
  let el = document.getElementById('offline');
  if (navigator.onLine) return el?.remove();
  if (!el) {
    el = document.createElement('div');
    el.id = 'offline';
    el.className = 'offline-bar';
    el.textContent = 'أنت غير متصل بالإنترنت. ستظهر آخر بيانات محفوظة.';
    document.body.append(el);
  }
}
addEventListener('online', offline);
addEventListener('offline', offline);
document.addEventListener('password-recovery', passwordRecoveryDialog);

let started = false;
onSession(() => {
  // Account changes re-render the current page (e.g. header name, workspace access).
  if (started) refresh();
});
(async () => {
  try {
    await load();
  } catch (e) {
    console.error(e);
  }
  try {
    const after = sessionStorage.getItem('souq.v2.after-login');
    if (after && session.user) {
      sessionStorage.removeItem('souq.v2.after-login');
      if (!location.hash || location.hash === '#/' || location.hash.startsWith('#access_token')) history.replaceState(null, '', '#' + after);
    }
  } catch {}
  if (location.hash.startsWith('#access_token') || location.hash.startsWith('#error')) history.replaceState(null, '', location.pathname + '#/');
  await start();
  started = true;
  offline();
  document.getElementById('splash')?.classList.add('gone');
  setTimeout(() => document.getElementById('splash')?.remove(), 400);
})();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
export { current };
