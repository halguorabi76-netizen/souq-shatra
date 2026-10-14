import { html, render, safeUrl } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageActions } from '../core/actions.js';
import { href, go, isCurrent } from '../core/router.js';
import { getProductsByIds, getStores, chosenItem, getPlatform } from '../core/api.js';
import { cart } from '../core/state.js';
import { session } from '../core/session.js';
import { spinnerBlock, errorBlock, emptyState, confirmDialog } from '../core/ui.js';
import { money } from '../core/format.js';
import { stepper } from './components.js';
import { mountShop, setTitle } from './shell.js';

// Re-reads every cart line from the database: current price, stock and availability.
export async function cartRows() {
  const [products, stores] = await Promise.all([getProductsByIds(cart.lines.map((l) => l.pid)), getStores()]);
  const storeMap = new Map(stores.map((s) => [s.id, s]));
  let changed = false;
  const rows = cart.lines.map((line) => {
    const p = products.find((x) => x.id === line.pid);
    const store = p && storeMap.get(p.store_id);
    const item = p ? chosenItem(p, line.vid) : null;
    let problem = '';
    if (!p || !store || !p.active || p.blocked || !item) problem = 'لم يعد هذا المنتج متاحًا؛ احذفه من السلة';
    else if (item.stock < 1) problem = 'نفدت الكمية';
    else if (item.stock < line.q) problem = `المتاح ${item.stock} فقط`;
    if (item && item.price !== line.price) {
      line.price = item.price;
      changed = true;
    }
    return { line, p, store, item, problem, key: cart.key(line) };
  });
  if (changed) cart.save();
  return rows;
}
export function groupByStore(rows) {
  const groups = new Map();
  for (const r of rows) {
    const id = r.store?.id || r.line.sid || 'x';
    if (!groups.has(id)) groups.set(id, { store: r.store, rows: [] });
    groups.get(id).rows.push(r);
  }
  return [...groups.values()];
}
export const subtotal = (rows) => rows.reduce((n, r) => n + (r.item ? r.item.price * r.line.q : 0), 0);
export const savings = (rows) => rows.reduce((n, r) => n + (r.item?.compare > r.item?.price ? (r.item.compare - r.item.price) * r.line.q : 0), 0);

export async function cartPage(ctx) {
  const main = await mountShop();
  setTitle('السلة');
  const paint = async () => {
    if (!cart.lines.length) return render(main, html`<h1>السلة</h1>${emptyState('cart', 'سلتك فارغة', 'أضف منتجات من متاجر الشطرة لتظهر هنا.', html`<a class="btn btn-primary" href="#/">ابدأ التسوق</a>`)}`);
    render(main, spinnerBlock());
    try {
      const [rows, platform] = await Promise.all([cartRows(), getPlatform()]);
      if (!isCurrent(ctx.token)) return;
      const groups = groupByStore(rows);
      const sub = subtotal(rows),
        save = savings(rows),
        fee = (platform.delivery.platform_fee || 0) * groups.length;
      const blocked = rows.some((r) => r.problem);
      render(
        main,
        html`<h1>السلة <span class="muted small">(${cart.count()} قطعة)</span></h1>
        <div class="two-col"><div>
          ${groups.map((g) => html`<section class="card cart-store"><header>${icon('store', 18)}<a href="${href('/s/' + (g.store?.id || ''))}">${g.store?.name || 'متجر'}</a></header>
            ${g.rows.map((r) => html`<div class="line">
              <a class="thumb" href="${href('/p/' + r.line.pid)}">${r.item?.img || r.line.img ? html`<img class="thumb" src="${safeUrl(r.item?.img || r.line.img)}" alt="">` : icon('image', 24)}</a>
              <div><a class="name" href="${href('/p/' + r.line.pid)}">${r.p?.name || r.line.name}</a>${r.item?.label || r.line.label ? html`<div class="meta">${r.item?.label || r.line.label}</div>` : ''}<div class="meta">${money(r.item?.price ?? r.line.price)} / ${r.p?.unit || 'قطعة'}</div>${r.problem ? html`<div class="warn">${icon('alert', 14)} ${r.problem}</div>` : ''}</div>
              <div class="end"><b>${money((r.item?.price ?? r.line.price) * r.line.q)}</b><div style="display:flex;gap:6px;align-items:center">${stepper(r.line.q, 'qty', r.key, { min: 0, max: Math.min(100, r.item?.stock || r.line.q), small: true })}<button class="icon-btn" data-action="remove" data-id="${r.key}" aria-label="حذف">${icon('trash', 18)}</button></div></div>
            </div>`)}</section>`)}
          <button class="btn btn-ghost" data-action="clear">${icon('trash', 18)} إفراغ السلة</button>
        </div>
        <aside class="summary card"><h2>ملخص الطلب</h2>
          <div class="kv"><span>المنتجات (${cart.count()})</span><b>${money(sub)}</b></div>
          ${save ? html`<div class="kv" style="color:var(--ok)"><span>التوفير</span><b>- ${money(save)}</b></div>` : ''}
          <div class="kv"><span>التوصيل</span><span class="muted">يُحسب حسب موقعك</span></div>
          ${fee ? html`<div class="kv"><span>رسوم الخدمة${groups.length > 1 ? ` (${groups.length} متاجر)` : ''}</span><b>${money(fee)}</b></div>` : ''}
          <div class="kv total"><span>الإجمالي قبل التوصيل</span><b>${money(sub + fee)}</b></div>
          ${blocked ? html`<div class="notice notice-warn">${icon('alert', 18)}<p>عدّل المنتجات المعلّمة قبل المتابعة.</p></div>` : ''}
          <button class="btn btn-primary btn-lg btn-block" data-action="checkout" ${blocked ? 'disabled' : ''}>متابعة الشراء ${icon('arrowL', 18)}</button>
          <a class="btn btn-ghost btn-block" href="#/" style="margin-top:8px">متابعة التسوق</a>
          ${groups.length > 1 ? html`<p class="muted small" style="margin-top:10px">طلبك من ${groups.length} متاجر؛ يجمعها سائق واحد في مسار واحد.</p>` : ''}
        </aside></div>`,
      );
    } catch (e) {
      if (isCurrent(ctx.token)) render(main, errorBlock(e));
    }
  };
  pageActions({
    qty: (b) => {
      const l = cart.lines.find((x) => cart.key(x) === b.dataset.id);
      if (l) cart.set(b.dataset.id, l.q + +b.dataset.delta);
      paint();
    },
    remove: (b) => {
      cart.remove(b.dataset.id);
      paint();
    },
    clear: async () => {
      if (await confirmDialog('إفراغ السلة', 'سيتم حذف كل المنتجات من سلتك.', { ok: 'إفراغ', danger: true })) {
        cart.clear();
        paint();
      }
    },
    checkout: () => (session.user ? go('/checkout') : go('/login', { next: '/checkout' })),
    retry: paint,
  });
  await paint();
}
