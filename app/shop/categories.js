// Categories tab and a single category page. A category opens on its products,
// with a switch to the stores that sell in it.
import { html, render } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { href, isCurrent } from '../core/router.js';
import { getCategories, searchProducts, getStores } from '../core/api.js';
import { skeletonCards, errorBlock, emptyState } from '../core/ui.js';
import { number } from '../core/format.js';
import { catTile, catEmoji, productCard, storeCard } from './components.js';
import { mountShop, favorites, loadFavorites, setTitle } from './shell.js';

const PAGE = 24;

export async function categoriesPage(ctx) {
  const main = await mountShop();
  setTitle('الأقسام');
  render(main, html`<h1 class="page-title">الأقسام</h1><div class="cat-grid">${Array.from({ length: 8 }, () => html`<div class="cat-card sk-card"><span class="art sk"></span></div>`)}</div>`);
  try {
    const cats = await getCategories();
    if (!isCurrent(ctx.token)) return;
    const roots = cats.filter((c) => !c.parent_id);
    render(
      main,
      html`<h1 class="page-title">الأقسام</h1>
      <p class="muted page-sub">اختر قسمًا لتشاهد منتجاته أو المتاجر التي تبيع فيه.</p>
      ${roots.length ? html`<div class="cat-grid">${roots.map((c) => catTile(c))}</div>` : emptyState('grid', 'لا توجد أقسام بعد')}`,
    );
  } catch (e) {
    if (isCurrent(ctx.token)) render(main, errorBlock(e));
  }
}

export async function categoryPage(ctx) {
  const main = await mountShop();
  const name = ctx.params.name;
  const view = ctx.query.get('view') === 'stores' ? 'stores' : 'products';
  const sub = ctx.query.get('sub') || '';
  const page = Math.max(0, +ctx.query.get('page') || 0);
  setTitle(name);
  render(main, skeletonCards(8));
  try {
    const [cats, stores] = await Promise.all([getCategories(), getStores(), loadFavorites()]);
    if (!isCurrent(ctx.token)) return;
    const root = cats.find((c) => !c.parent_id && c.name === name) || cats.find((c) => c.name === name);
    if (!root) return render(main, emptyState('grid', 'القسم غير موجود', '', html`<a class="btn btn-primary" href="#/categories">كل الأقسام</a>`));
    const subs = cats.filter((c) => c.parent_id === root.id);
    const subCat = subs.find((c) => c.id === sub);
    const byStore = new Map(stores.map((s) => [s.id, s]));
    const link = (q) => href('/c/' + encodeURIComponent(name), { view: view === 'stores' ? 'stores' : '', sub, page: '', ...q });
    const head = html`<div class="cat-head"><span class="art">${catEmoji(root.name)}</span><div><h1>${root.name}</h1><a class="muted small" href="#/categories">${icon('chevR', 14)} كل الأقسام</a></div></div>
      <div class="seg" role="tablist" aria-label="عرض">
        <a role="tab" aria-selected="${view === 'products'}" href="${link({ view: '' })}">${icon('box', 18)} المنتجات</a>
        <a role="tab" aria-selected="${view === 'stores'}" href="${link({ view: 'stores' })}">${icon('store', 18)} المتاجر</a>
      </div>
      ${subs.length ? html`<div class="chip-rail"><a class="pill ${!subCat ? 'on' : ''}" href="${link({ sub: '' })}">الكل</a>${subs.map((c) => html`<a class="pill ${subCat?.id === c.id ? 'on' : ''}" href="${link({ sub: c.id })}">${c.name}</a>`)}</div>` : ''}`;
    const category = subCat ? subCat.id : root.id;

    if (view === 'stores') {
      // Stores that have at least one live product in this category.
      const { items } = await searchProducts({ category, size: 1000 });
      if (!isCurrent(ctx.token)) return;
      const counts = new Map();
      items.forEach((p) => counts.set(p.store_id, (counts.get(p.store_id) || 0) + 1));
      const list = [...counts.keys()].map((id) => byStore.get(id)).filter(Boolean).sort((a, b) => counts.get(b.id) - counts.get(a.id));
      render(
        main,
        html`${head}<p class="muted small">${number(list.length)} متجر يبيع في ${subCat?.name || root.name}</p>
        ${list.length ? html`<div class="store-grid">${list.map((s) => storeCard(s, { count: counts.get(s.id) }))}</div>` : emptyState('store', 'لا توجد متاجر في هذا القسم بعد', 'عندك بضاعة من هذا النوع؟ اعرضها عندنا.', html`<a class="btn btn-primary" href="#/sell">ابدأ البيع</a>`)}`,
      );
      return;
    }

    const { items, total } = await searchProducts({ category, page, size: PAGE });
    if (!isCurrent(ctx.token)) return;
    const pages = Math.ceil(total / PAGE);
    render(
      main,
      html`${head}<p class="muted small">${number(total)} منتج</p>
      ${items.length ? html`<div class="product-grid">${items.map((p) => productCard(p, { store: byStore.get(p.store_id), fav: favorites.ids.has(p.id) }))}</div>` : emptyState('box', 'لا توجد منتجات في هذا القسم بعد', 'عندك بضاعة من هذا النوع؟ اعرضها عندنا.', html`<a class="btn btn-primary" href="#/sell">ابدأ البيع</a>`)}
      ${pages > 1 ? html`<nav class="pager" aria-label="الصفحات">${page > 0 ? html`<a class="btn btn-outline" href="${link({ page: page - 1 || '' })}">${icon('chevR', 16)} السابق</a>` : ''}<span class="btn btn-ghost">صفحة ${page + 1} من ${pages}</span>${page + 1 < pages ? html`<a class="btn btn-outline" href="${link({ page: page + 1 })}">التالي ${icon('chevL', 16)}</a>` : ''}</nav>` : ''}`,
    );
  } catch (e) {
    if (isCurrent(ctx.token)) render(main, errorBlock(e));
  }
}
