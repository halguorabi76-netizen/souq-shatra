import { html, render, formData } from '../core/dom.js';
import { pageActions } from '../core/actions.js';
import { icon } from '../core/icons.js';
import { href, go, isCurrent } from '../core/router.js';
import { getCategories, searchProducts, getStores, getLivePromotions, getProductsByIds, getStoreCategories } from '../core/api.js';
import { skeletonCards, errorBlock, emptyState, modal } from '../core/ui.js';
import { number, normalizeArabic } from '../core/format.js';
import { productCard, storeCard, breadcrumbs, isHomeSeller, catTile } from './components.js';
import { mountShop, favorites, loadFavorites, setTitle } from './shell.js';

const SORTS = [
  ['newest', 'الأحدث'],
  ['cheap', 'السعر: من الأقل'],
  ['expensive', 'السعر: من الأعلى'],
  ['deals', 'العروض أولًا'],
];
const PAGE = 24;
// The same listing serves #/search and the «المنتجات» tab (#/products); links keep the current one.
let base = '/search';
function params(q) {
  return { q: q.get('q') || '', cat: q.get('cat') || '', sort: q.get('sort') || 'newest', min: q.get('min') || '', max: q.get('max') || '', cond: q.get('cond') || '', page: Math.max(0, +q.get('page') || 0) };
}
function filtersForm(f, cats) {
  const roots = cats.filter((c) => !c.parent_id);
  return html`<form data-filters>
    <h3>الأقسام</h3><div class="cat-list"><a href="${href(base, { ...f, cat: '', page: '' })}" class="${!f.cat ? 'active' : ''}">كل الأقسام</a>${roots.map((c) => html`<a href="${href(base, { ...f, cat: c.name, page: '' })}" class="${f.cat === c.name ? 'active' : ''}">${c.name}</a>`)}</div>
    <h3>السعر (د.ع)</h3><div class="grid-2"><label class="field"><span>من</span><input name="min" type="number" min="0" inputmode="numeric" value="${f.min}"></label><label class="field"><span>إلى</span><input name="max" type="number" min="0" inputmode="numeric" value="${f.max}"></label></div>
    <h3>الحالة</h3><div class="choice-list">${[['', 'الكل'], ['new', 'جديد'], ['used', 'مستعمل']].map(([v, l]) => html`<label class="check"><input type="radio" name="cond" value="${v}" ${f.cond === v ? 'checked' : ''}>${l}</label>`)}</div>
    <div class="row-actions"><button class="btn btn-primary">تطبيق</button><a class="btn btn-ghost" href="${href(base, { q: f.q })}">مسح</a></div>
  </form>`;
}
export async function searchPage(ctx) {
  base = ctx.path === '/products' ? '/products' : '/search';
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
    // «المنتجات» tab: product categories on top, subcategories once one is chosen.
    const roots = cats.filter((c) => !c.parent_id);
    const selected = cats.find((c) => !c.parent_id && c.name === f.cat) || cats.find((c) => c.name === f.cat);
    const activeRoot = selected?.parent_id ? cats.find((c) => c.id === selected.parent_id) : selected;
    const subs = activeRoot ? cats.filter((c) => c.parent_id === activeRoot.id) : [];
    const catNav =
      base === '/products' && roots.length
        ? html`<div class="cat-rail compact"><a class="cat-card ${!activeRoot ? 'on' : ''}" href="${href(base, { sort: f.sort === 'newest' ? '' : f.sort })}"><span class="art">${icon('grid', 30)}</span><b>الكل</b></a>${roots.map((c) => catTile(c, { active: activeRoot?.id === c.id }))}</div>
        ${subs.length ? html`<div class="chip-rail"><a class="pill ${selected === activeRoot ? 'on' : ''}" href="${href(base, { ...f, cat: activeRoot.name, page: '' })}">كل ${activeRoot.name}</a>${subs.map((c) => html`<a class="pill ${selected?.id === c.id ? 'on' : ''}" href="${href(base, { ...f, cat: c.name, page: '' })}">${c.name}</a>`)}</div>` : ''}`
        : '';
    const chips = [f.q && ['q', `«${f.q}»`], f.cat && ['cat', f.cat], f.min && ['min', `من ${f.min}`], f.max && ['max', `إلى ${f.max}`], f.cond && ['cond', f.cond === 'used' ? 'مستعمل' : 'جديد']].filter(Boolean);
    render(
      main,
      html`${breadcrumbs([{ label: 'الرئيسية', href: '#/' }, { label: title }])}
      ${catNav}
      <div class="listing">
        <aside class="filters" aria-label="تصفية النتائج">${filtersForm(f, cats)}</aside>
        <section>
          <div class="listing-bar"><div><h1 style="margin:0">${title}</h1><span class="muted small">${number(total)} منتج</span></div>
            <div style="display:flex;gap:8px"><button class="btn btn-outline btn-sm only-mobile" data-action="openFilters">${icon('filter', 16)} تصفية</button>
            <select class="input" data-sort aria-label="ترتيب">${SORTS.map(([v, l]) => html`<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`)}</select></div></div>
          ${chips.length ? html`<div class="chips" style="margin-bottom:12px">${chips.map(([k, l]) => html`<a class="chip" href="${href(base, { ...f, [k]: '', page: '' })}">${l} ${icon('x', 14)}</a>`)}</div>` : ''}
          ${matchedStores.length ? html`<div class="store-grid" style="margin-bottom:16px">${matchedStores.map((s) => storeCard(s))}</div>` : ''}
          ${items.length || sponsored.length ? html`<div class="product-grid">${sponsored.map((p) => card(p, true))}${items.filter((p) => !shownIds.has(p.id)).map((p) => card(p))}</div>` : emptyState('search', 'لا توجد نتائج مطابقة', 'جرّب كلمات أخرى أو أزل بعض عوامل التصفية.', html`<a class="btn btn-primary" href="#/search">تصفح كل المنتجات</a>`)}
          ${pages > 1 ? html`<nav class="pager" aria-label="الصفحات">${f.page > 0 ? html`<a class="btn btn-outline" href="${href(base, { ...f, page: f.page - 1 || '' })}">${icon('chevR', 16)} السابق</a>` : ''}<span class="btn btn-ghost">صفحة ${f.page + 1} من ${pages}</span>${f.page + 1 < pages ? html`<a class="btn btn-outline" href="${href(base, { ...f, page: f.page + 1 })}">التالي ${icon('chevL', 16)}</a>` : ''}</nav>` : ''}
        </section>
      </div>`,
    );
    main.querySelector('[data-sort]').addEventListener('change', (e) => go(base, { ...f, sort: e.target.value, page: '' }));
    const apply = (form) => {
      const d = formData(form);
      if (d.min && d.max && +d.min > +d.max) [d.min, d.max] = [d.max, d.min];
      go(base, { ...f, min: d.min, max: d.max, cond: d.cond, page: '' });
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
    const [stores, promos, storeCats] = await Promise.all([getStores(), getLivePromotions(), getStoreCategories()]);
    if (!isCurrent(ctx.token)) return;
    const spot = new Set(promos.filter((p) => p.placement === 'store_spotlight').map((p) => p.store_id));
    const q = normalizeArabic(ctx.query.get('q') || '');
    const kind = ['shop', 'home'].includes(ctx.query.get('kind')) ? ctx.query.get('kind') : '';
    const cat = storeCats.find((c) => c.id === ctx.query.get('cat'));
    const catName = new Map(storeCats.map((c) => [c.id, c.name]));
    const matchKind = (s) => !kind || (kind === 'home') === isHomeSeller(s);
    const list = stores.filter((s) => matchKind(s) && (!cat || s.store_category_id === cat.id) && (!q || normalizeArabic(s.name + ' ' + (s.description || '')).includes(q))).sort((a, b) => Number(spot.has(b.id)) - Number(spot.has(a.id)) || a.name.localeCompare(b.name, 'ar'));
    const query = { q: ctx.query.get('q') || '', kind, cat: cat?.id || '' };
    const tab = (v, label, ic) => html`<a class="pill ${kind === v ? 'on' : ''}" href="${href('/stores', { ...query, kind: v })}">${ic ? icon(ic, 15) : ''}${label}</a>`;
    const catPill = (c) => html`<a class="pill ${(cat?.id || '') === (c?.id || '') ? 'on' : ''}" href="${href('/stores', { ...query, cat: c?.id || '' })}">${c ? c.name : 'كل الأقسام'}</a>`;
    render(
      main,
      html`<h1 class="page-title">${cat ? cat.name : 'المتاجر'}</h1>
      <p class="muted page-sub">محلات الشطرة، وأهلها الذين يبيعون من بيوتهم.</p>
      <form data-store-search class="inline-search"><input class="input" name="q" type="search" placeholder="ابحث عن متجر" value="${ctx.query.get('q') || ''}"><button class="btn btn-primary" aria-label="بحث">${icon('search', 18)}</button></form>
      ${storeCats.length ? html`<div class="chip-rail store-cats">${catPill(null)}${storeCats.map(catPill)}</div>` : ''}
      <div class="chip-rail">${tab('', 'الكل')}${tab('shop', 'محلات', 'store')}${tab('home', 'من البيت', 'home')}</div>
      <p class="muted small">${list.length} متجر</p>
      ${list.length ? html`<div class="store-grid">${list.map((s) => storeCard(s, { featured: spot.has(s.id), category: catName.get(s.store_category_id) }))}</div>` : emptyState('store', kind === 'home' ? 'لا يوجد بائعون من البيت بعد' : 'لا توجد متاجر مطابقة', kind === 'home' ? 'عندك بضاعة في البيت؟ كن أول من يعرضها.' : '', kind === 'home' ? html`<a class="btn btn-primary" href="#/sell">ابدأ البيع من بيتك</a>` : '')}`,
    );
    main.querySelector('[data-store-search]').addEventListener('submit', (e) => {
      e.preventDefault();
      go('/stores', { ...query, q: formData(e.target).q });
    });
  } catch (e) {
    if (isCurrent(ctx.token)) render(main, errorBlock(e));
  }
}
