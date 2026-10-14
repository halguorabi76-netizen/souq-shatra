import { html, render, formData } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageActions } from '../core/actions.js';
import { href, go, isCurrent } from '../core/router.js';
import { getStore, searchProducts, sellerCategories, getLivePromotions } from '../core/api.js';
import { spinnerBlock, errorBlock, emptyState, copyText } from '../core/ui.js';
import { number, date } from '../core/format.js';
import { productCard, breadcrumbs, storeAvatar } from './components.js';
import { mountShop, favorites, loadFavorites, setTitle } from './shell.js';

export async function storePage(ctx) {
  const main = await mountShop();
  render(main, spinnerBlock());
  const id = ctx.params.id,
    q = ctx.query.get('q') || '',
    group = ctx.query.get('g') || '',
    sort = ctx.query.get('sort') || 'newest';
  try {
    const [store, groups, promos] = await Promise.all([getStore(id), sellerCategories(id), getLivePromotions(), loadFavorites()]);
    if (!isCurrent(ctx.token)) return;
    if (!store) return render(main, emptyState('store', 'هذا المتجر غير متاح', 'ربما أُغلق المتجر أو الرابط غير صحيح.', html`<a class="btn btn-primary" href="#/stores">كل المتاجر</a>`));
    setTitle(store.name);
    let size = 24;
    const featured = promos.some((p) => p.placement === 'store_spotlight' && p.store_id === id);
    const load = async () => {
      const r = await searchProducts({ store: id, q, sort, size: 200 });
      const items = group ? r.items.filter((p) => p.store_category === group) : r.items;
      return items;
    };
    const items = await load();
    if (!isCurrent(ctx.token)) return;
    const paint = () =>
      render(
        main,
        html`${breadcrumbs([{ label: 'الرئيسية', href: '#/' }, { label: 'المتاجر', href: '#/stores' }, { label: store.name }])}
        <section class="account-hero" style="align-items:flex-start">${storeAvatar(store, 84)}<div style="flex:1">
          <h1 style="margin:0;display:flex;gap:8px;align-items:center;flex-wrap:wrap">${store.name}${store.verified ? html`<span class="badge" style="background:#fff;color:#1d9bf0">${icon('verified', 16)} موثّق</span>` : ''}${featured ? html`<span class="badge badge-accent">${icon('crown', 14)} متجر مميز</span>` : ''}</h1>
          ${store.username ? html`<div class="ltr" style="opacity:.8">@${store.username}</div>` : ''}
          ${store.description ? html`<p style="margin:8px 0 0;opacity:.92">${store.description}</p>` : ''}
          <div class="small" style="margin-top:8px;opacity:.85;display:flex;gap:14px;flex-wrap:wrap">${store.store_kind === 'physical' && store.address ? html`<span>${icon('pin', 15)} ${store.address}</span>` : ''}<span>${icon('box', 15)} ${number(items.length)} منتج</span>${store.created_at ? html`<span>${icon('clock', 15)} منذ ${date(store.created_at)}</span>` : ''}</div>
        </div><button class="btn btn-outline btn-sm" style="color:#fff;border-color:rgba(255,255,255,.4)" data-action="shareStore">${icon('external', 16)} مشاركة</button></section>
        <div class="listing-bar"><form data-store-q style="display:flex;gap:8px;flex:1;max-width:420px"><input class="input" name="q" type="search" value="${q}" placeholder="ابحث في ${store.name}"><button class="btn btn-primary">${icon('search', 18)}</button></form>
          <select class="input" data-sort style="width:auto">${[['newest', 'الأحدث'], ['cheap', 'الأقل سعرًا'], ['expensive', 'الأعلى سعرًا']].map(([v, l]) => html`<option value="${v}" ${sort === v ? 'selected' : ''}>${l}</option>`)}</select></div>
        ${groups.length ? html`<div class="tabs"><a class="tab ${!group ? 'active' : ''}" href="${href('/s/' + id, { q, sort })}">الكل</a>${groups.map((g) => html`<a class="tab ${group === g ? 'active' : ''}" href="${href('/s/' + id, { q, sort, g })}">${g}</a>`)}</div>` : ''}
        ${items.length ? html`<div class="product-grid">${items.slice(0, size).map((p) => productCard(p, { fav: favorites.ids.has(p.id) }))}</div>${items.length > size ? html`<div class="pager"><button class="btn btn-outline" data-action="more">عرض المزيد</button></div>` : ''}` : emptyState('box', q ? 'لا توجد نتائج في هذا المتجر' : 'لا توجد منتجات بعد')}`,
      );
    paint();
    const wire = () => {
      main.querySelector('[data-store-q]').addEventListener('submit', (e) => {
        e.preventDefault();
        go('/s/' + id, { q: formData(e.target).q, sort, g: group });
      });
      main.querySelector('[data-sort]').addEventListener('change', (e) => go('/s/' + id, { q, g: group, sort: e.target.value }));
    };
    wire();
    pageActions({
      more: () => {
        size += 24;
        const y = scrollY;
        paint();
        wire();
        scrollTo(0, y);
      },
      shareStore: () => {
        const url = location.href.split('#')[0] + '#/s/' + id;
        if (navigator.share) navigator.share({ title: store.name, url }).catch(() => {});
        else copyText(url);
      },
    });
  } catch (e) {
    if (isCurrent(ctx.token)) render(main, errorBlock(e));
  }
}
