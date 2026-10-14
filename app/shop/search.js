import { html, render, formData } from '../core/dom.js';
import { pageActions } from '../core/actions.js';
import { icon } from '../core/icons.js';
import { href, go, isCurrent } from '../core/router.js';
import { getCategories, searchProducts, getStores, getLivePromotions, getProductsByIds } from '../core/api.js';
import { skeletonCards, errorBlock, emptyState, modal } from '../core/ui.js';
import { number, normalizeArabic } from '../core/format.js';
import { productCard, storeCard, breadcrumbs } from './components.js';
import { mountShop, favorites, loadFavorites, setTitle } from './shell.js';

const SORTS = [
  ['newest', 'الأحدث'],
  ['cheap', 'السعر: من الأقل'],
  ['expensive', 'السعر: من الأعلى'],
  ['deals', 'العروض أولًا'],
];
const PAGE = 24;
function params(q) {
  return { q: q.get('q') || '', cat: q.get('cat') || '', sort: q.get('sort') || 'newest', min: q.get('min') || '', max: q.get('max') || '', cond: q.get('cond') || '', page: Math.max(0, +q.get('page') || 0) };
}
function filtersForm(f, cats) {
  const roots = cats.filter((c) => !c.parent_id);
  return html`<form data-filters>
    <h3>الأقسام</h3><div class="cat-list"><a href="${href('/search', { ...f, cat: '', page: '' })}" class="${!f.cat ? 'active' : ''}">كل الأقسام</a>${roots.map((c) => html`<a href="${href('/search', { ...f, cat: c.name, page: '' })}" class="${f.cat === c.name ? 'active' : ''}">${c.name}</a>`)}</div>
    <h3>السعر (د.ع)</h3><div class="grid-2"><label class="field"><span>من</span><input name="min" type="number" min="0" inputmode="numeric" value="${f.min}"></label><label class="field"><span>إلى</span><input name="max" type="number" min="0" inputmode="numeric" value="${f.max}"></label></div>
    <h3>الحالة</h3><div class="choice-list">${[['', 'الكل'], ['new', 'جديد'], ['used', 'مستعمل']].map(([v, l]) => html`<label class="check"><input type="radio" name="cond" value="${v}" ${f.cond === v ? 'checked' : ''}>${l}</label>`)}</div>
    <div class="row-actions"><button class="btn btn-primary">تطبيق</button><a class="btn btn-ghost" href="${href('/search', { q: f.q })}">مسح</a></div>
  </form>`;
}
export async function searchPage(ctx) {
  const main = await mountShop();
  const f = params(ctx.query);
  const title = f.q ? `نتائج «${f.q}»` : f.cat || (f.sort === 'deals' ? 'العروض والتخفيضات' : 'كل المنتجات');
  setTitle(title);
  render(main, skeletonCards(12));
  try {
    const deals = f.sort === 'deals';
    const [cats, stores, promos, result] = await Promise.all([
      getCategories(),
      getStores(),
      getLivePromotions(),
      searchProducts({ q: f.q, category: f.cat, min: f.min, max: f.max, condition: f.cond, sort: deals ? 'newest' : f.sort, page: deals ? 0 : f.page, size: deals ? 200 : PAGE }),
      loadFavorites(),
    ]);
    if (!isCurrent(ctx.token)) return;
    let items = result.items,
      total = result.total;
    if (deals) {
      items = items.filter((p) => p.display_compare > p.display_price).sort((a, b) => b.display_compare / b.display_price - a.display_compare / a.display_price);
      total = items.length;
      items = items.slice(f.page * PAGE, f.page * PAGE + PAGE);
    }
    const byStore = new Map(stores.map((s) => [s.id, s]));
    // Paid placements: matching sponsored products appear first on page one.
    let sponsored = [];
    if (f.page === 0 && (f.q || f.cat)) {
      const ids = promos.filter((p) => p.product_id && (p.placement === 'search_top' && f.q || p.placement === 'category_top' && f.cat)).map((p) => p.product_id);
      if (ids.length) {
        const qn = normalizeArabic(f.q);
        sponsored = (await getProductsByIds(ids)).filter((p) => p.active && !p.blocked && byStore.has(p.store_id) && (!f.cat || p.category === f.cat || cats.some((c) => c.id === p.catalog_category_id && (c.name === f.cat || cats.find((r) => r.id === c.parent_id)?.name === f.cat))) && (!f.q || normalizeArabic(p.name + ' ' + p.description).includes(qn))).slice(0, 4);
      }
    }
    const shownIds = new Set(sponsored.map((p) => p.id));
    const matchedStores = f.q && f.page === 0 ? stores.filter((s) => normalizeArabic(s.name).includes(normalizeArabic(f.q))).slice(0, 4) : [];
    const pages = Math.ceil(total / PAGE);
    const card = (p, ad) => productCard(p, { store: byStore.get(p.store_id), fav: favorites.ids.has(p.id), sponsored: ad });
    const chips = [f.q && ['q', `«${f.q}»`], f.cat && ['cat', f.cat], f.min && ['min', `من ${f.min}`], f.max && ['max', `إلى ${f.max}`], f.cond && ['cond', f.cond === 'used' ? 'مستعمل' : 'جديد']].filter(Boolean);
    render(
      main,
      html`${breadcrumbs([{ label: 'الرئيسية', href: '#/' }, { label: title }])}
      <div class="listing">
        <aside class="filters" aria-label="تصفية النتائج">${filtersForm(f, cats)}</aside>
        <section>
          <div class="listing-bar"><div><h1 style="margin:0">${title}</h1><span class="muted small">${number(total)} منتج</span></div>
            <div style="display:flex;gap:8px"><button class="btn btn-outline btn-sm only-mobile" data-action="openFilters">${icon('filter', 16)} تصفية</button>
            <select class="input" data-sort aria-label="ترتيب">${SORTS.map(([v, l]) => html`<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`)}</select></div></div>
          ${chips.length ? html`<div class="chips" style="margin-bottom:12px">${chips.map(([k, l]) => html`<a class="chip" href="${href('/search', { ...f, [k]: '', page: '' })}">${l} ${icon('x', 14)}</a>`)}</div>` : ''}
          ${matchedStores.length ? html`<div class="store-grid" style="margin-bottom:16px">${matchedStores.map((s) => storeCard(s))}</div>` : ''}
          ${items.length || sponsored.length ? html`<div class="product-grid">${sponsored.map((p) => card(p, true))}${items.filter((p) => !shownIds.has(p.id)).map((p) => card(p))}</div>` : emptyState('search', 'لا توجد نتائج مطابقة', 'جرّب كلمات أخرى أو أزل بعض عوامل التصفية.', html`<a class="btn btn-primary" href="#/search">تصفح كل المنتجات</a>`)}
          ${pages > 1 ? html`<nav class="pager" aria-label="الصفحات">${f.page > 0 ? html`<a class="btn btn-outline" href="${href('/search', { ...f, page: f.page - 1 || '' })}">${icon('chevR', 16)} السابق</a>` : ''}<span class="btn btn-ghost">صفحة ${f.page + 1} من ${pages}</span>${f.page + 1 < pages ? html`<a class="btn btn-outline" href="${href('/search', { ...f, page: f.page + 1 })}">التالي ${icon('chevL', 16)}</a>` : ''}</nav>` : ''}
        </section>
      </div>`,
    );
    main.querySelector('[data-sort]').addEventListener('change', (e) => go('/search', { ...f, sort: e.target.value, page: '' }));
    const apply = (form) => {
      const d = formData(form);
      if (d.min && d.max && +d.min > +d.max) [d.min, d.max] = [d.max, d.min];
      go('/search', { ...f, min: d.min, max: d.max, cond: d.cond, page: '' });
    };
    main.querySelector('[data-filters]').addEventListener('submit', (e) => {
      e.preventDefault();
      apply(e.target);
    });
    pageActions({
      openFilters: () => {
        const d = modal('تصفية النتائج', filtersForm(f, cats));
        d.querySelector('form').addEventListener('submit', (e) => {
          e.preventDefault();
          d.close();
          apply(e.target);
        });
        d.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => d.close()));
      },
    });
  } catch (e) {
    if (isCurrent(ctx.token)) render(main, errorBlock(e));
  }
}
export async function storesPage(ctx) {
  const main = await mountShop();
  setTitle('المتاجر');
  render(main, skeletonCards(6));
  try {
    const [stores, promos] = await Promise.all([getStores(), getLivePromotions()]);
    if (!isCurrent(ctx.token)) return;
    const spot = new Set(promos.filter((p) => p.placement === 'store_spotlight').map((p) => p.store_id));
    const q = normalizeArabic(ctx.query.get('q') || '');
    const list = stores.filter((s) => !q || normalizeArabic(s.name + ' ' + (s.description || '')).includes(q)).sort((a, b) => Number(spot.has(b.id)) - Number(spot.has(a.id)) || a.name.localeCompare(b.name, 'ar'));
    render(
      main,
      html`${breadcrumbs([{ label: 'الرئيسية', href: '#/' }, { label: 'المتاجر' }])}
      <div class="listing-bar"><div><h1 style="margin:0">متاجر الشطرة</h1><span class="muted small">${list.length} متجر معتمد</span></div>
      <form data-store-search style="display:flex;gap:8px"><input class="input" name="q" type="search" placeholder="ابحث عن متجر" value="${ctx.query.get('q') || ''}"><button class="btn btn-primary">${icon('search', 18)}</button></form></div>
      ${list.length ? html`<div class="store-grid">${list.map((s) => storeCard(s, { featured: spot.has(s.id) }))}</div>` : emptyState('store', 'لا توجد متاجر مطابقة')}`,
    );
    main.querySelector('[data-store-search]').addEventListener('submit', (e) => {
      e.preventDefault();
      go('/stores', { q: formData(e.target).q });
    });
  } catch (e) {
    if (isCurrent(ctx.token)) render(main, errorBlock(e));
  }
}
