import { html, render, safeUrl } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageActions } from '../core/actions.js';
import { href, go, isCurrent } from '../core/router.js';
import { getProduct, getStore, getCategories, searchProducts, chosenItem, getPlatform } from '../core/api.js';
import { cart, recent } from '../core/state.js';
import { session } from '../core/session.js';
import { spinnerBlock, errorBlock, emptyState, toast, copyText } from '../core/ui.js';
import { money, percentOff } from '../core/format.js';
import { categoryDefinitions } from '../lib/product-variants.js';
import { COLOR_PALETTE } from '../lib/product-options.js';
import { variantState, initialPicks } from '../lib/variant-state.js';
import { productCard, breadcrumbs, storeAvatar, sectionHead } from './components.js';
import { mountShop, favorites, loadFavorites, setTitle, toggleFav } from './shell.js';

const AXIS_LABEL = { color: 'اللون', size: 'المقاس', type: 'النوع', material: 'الخامة', custom_color: 'اللون', custom_size: 'المقاس', custom_type: 'النوع', custom_material: 'الخامة' };
const isColor = (k, defs) => k === 'color' || k.endsWith('_color') || defs.find((d) => d.key === k)?.label === 'اللون';

export async function productPage(ctx) {
  const main = await mountShop();
  render(main, spinnerBlock());
  try {
    const [p, cats, platform] = await Promise.all([getProduct(ctx.params.id), getCategories(), getPlatform(), loadFavorites()]);
    if (!isCurrent(ctx.token)) return;
    const store = p && (await getStore(p.store_id));
    if (!p || !store || p.blocked || (!p.active && store.owner_id !== session.user?.id)) {
      setTitle('منتج غير متاح');
      return render(main, emptyState('box', 'هذا المنتج غير متاح', 'ربما أُزيل أو نفدت كميته.', html`<a class="btn btn-primary" href="#/search">تصفح منتجات أخرى</a>`));
    }
    recent.push(p.id);
    setTitle(p.name);
    const defs = [...categoryDefinitions(cats, p.catalog_category_id), ...(p.attributes?._custom_options || [])];
    const cat = cats.find((c) => c.id === p.catalog_category_id);
    const root = cat?.parent_id ? cats.find((c) => c.id === cat.parent_id) : cat;
    const state = { picks: p.has_variants ? initialPicks(p) : {}, qty: 1, photo: null };
    const own = store.owner_id === session.user?.id;

    const view = () => {
      const vs = p.has_variants ? variantState(p, state.picks) : null;
      const vid = vs?.match?.id || null;
      const item = chosenItem(p, vid);
      const price = item?.price ?? p.display_price,
        compare = item?.compare ?? p.display_compare,
        stock = item ? item.stock : 0;
      const photos = [...new Set([item?.img, p.img, ...p.variants.filter((v) => !v.archived).map((v) => v.img)].filter(Boolean))];
      const photo = state.photo && photos.includes(state.photo) ? state.photo : photos[0];
      const ready = !!item && stock > 0 && p.active;
      const off = percentOff(price, compare);
      const specs = Object.entries(p.attributes || {}).filter(([k, v]) => !k.startsWith('_') && typeof v === 'string' && v && !(vs?.axes || []).includes(k) && k !== 'sale_unit');
      const fav = favorites.ids.has(p.id);
      const buttons = html`<button class="btn btn-primary btn-lg" data-action="add" ${ready && !own ? '' : 'disabled'}>${icon('cart', 20)} ${!item && p.has_variants ? 'اختر الخيارات' : stock < 1 ? 'نفدت الكمية' : 'أضف إلى السلة'}</button><button class="btn btn-accent btn-lg" data-action="buyNow" ${ready && !own ? '' : 'disabled'}>اشترِ الآن</button>`;
      return html`<div class="pdp-page">
        ${breadcrumbs([{ label: 'الرئيسية', href: '#/' }, root && { label: root.name, href: href('/search', { cat: root.name }) }, { label: p.name }].filter(Boolean))}
        <div class="pdp">
          <div class="gallery"><div class="main">${photo ? html`<img src="${safeUrl(photo)}" alt="${p.name}">` : icon('image', 64)}</div>
            ${photos.length > 1 ? html`<div class="thumbs">${photos.map((src) => html`<button data-action="photo" data-src="${src}" aria-pressed="${src === photo}" aria-label="عرض الصورة"><img src="${safeUrl(src)}" alt=""></button>`)}</div>` : ''}</div>
          <div class="pdp-info">
            <a class="pdp-store" href="${href('/s/' + store.id)}">${icon('store', 18)} ${store.name} ${store.verified ? html`<span class="verified">${icon('verified', 16)}</span>` : ''}</a>
            <h1>${p.name}</h1>
            <div class="chips">${p.condition === 'used' ? html`<span class="badge badge-warn">مستعمل</span>` : html`<span class="badge badge-info">جديد</span>`}${p.sale_mode === 'wholesale' ? html`<span class="badge">جملة</span>` : p.sale_mode === 'both' ? html`<span class="badge">مفرد وجملة</span>` : ''}${!p.active ? html`<span class="badge badge-bad">غير منشور</span>` : ''}</div>
            <div class="pdp-price"><b>${money(price)}</b>${compare > price ? html`<del>${money(compare)}</del><span class="off">-${off}%</span>` : ''}<span class="muted">/ ${p.unit}</span></div>
            ${compare > price ? html`<div class="saving">وفّرت ${money(compare - price)}</div>` : ''}
            <div class="small ${stock > 0 ? '' : 'muted'}" style="margin-top:6px">${item ? (stock > 0 ? html`<span style="color:var(--ok)">${icon('checkCircle', 16)} متوفر${stock <= 5 ? ` — بقي ${stock} فقط` : ''}</span>` : 'غير متوفر حاليًا') : 'اختر الخيارات لمعرفة التوفر'}</div>
            ${vs ? vs.axes.map((axis) => {
              const label = defs.find((d) => d.key === axis)?.label || AXIS_LABEL[axis] || axis;
              const color = isColor(axis, defs);
              return html`<fieldset class="opt-group" style="border:0;padding:0"><legend>${label}${state.picks[axis] ? html`: <span class="muted">${state.picks[axis]}</span>` : ''}</legend><div class="opt-values">${vs.values[axis].map((v) => {
                const tone = color ? p.attributes?._color_swatches?.[v] || COLOR_PALETTE.find((c) => c[0] === v)?.[1] : null;
                return html`<button class="opt ${color ? 'swatch' : ''}" data-action="pick" data-axis="${axis}" data-value="${v}" aria-pressed="${state.picks[axis] === v}" ${vs.enabled(axis, v) ? '' : 'disabled'}>${tone ? html`<i style="background:${/^#[0-9a-f]{3,8}$/i.test(tone) ? tone : 'transparent'}"></i>` : ''}${v}</button>`;
              })}</div></fieldset>`;
            }) : ''}
            ${own ? html`<div class="notice">${icon('info', 18)}<p>هذا منتج من متجرك. <a href="#/seller/products/${p.id}">تعديله من مركز البائع</a></p></div>` : html`<div class="opt-group"><span>الكمية</span><div class="stepper"><button data-action="qty" data-delta="1" aria-label="زيادة" ${state.qty >= Math.min(100, stock || 1) ? 'disabled' : ''}>${icon('plus', 16)}</button><output>${state.qty}</output><button data-action="qty" data-delta="-1" aria-label="إنقاص" ${state.qty <= 1 ? 'disabled' : ''}>${icon('minus', 16)}</button></div></div>
            <div class="buy-box">${buttons}<button class="icon-btn btn-outline" style="border:1px solid var(--line)" data-action="fav" data-id="${p.id}" aria-pressed="${fav}" aria-label="المفضلة">${icon('heart', 22)}</button><button class="icon-btn" style="border:1px solid var(--line)" data-action="share" aria-label="مشاركة">${icon('external', 20)}</button></div>`}
            <div class="perks">
              <div>${icon('truck', 20)} توصيل داخل الشطرة وما حولها — تظهر الأجرة قبل تأكيد الطلب</div>
              <div>${icon('cash', 20)} ${[platform.payment_methods.cod && 'الدفع عند الاستلام', platform.payment_methods.zaincash && 'زين كاش', platform.payment_methods.card && 'البطاقات'].filter(Boolean).join(' · ')}</div>
              <div>${icon('undo', 20)} يمكنك إلغاء الطلب قبل أن يستلمه السائق</div>
              ${store.prep_time_min ? html`<div>${icon('clock', 20)} يجهّز المتجر الطلب عادةً خلال ${store.prep_time_min} دقيقة</div>` : ''}
            </div>
            ${p.description ? html`<section class="card" style="margin-top:14px"><h3>الوصف</h3><p style="white-space:pre-line">${p.description}</p></section>` : ''}
            ${specs.length ? html`<section class="card"><h3>المواصفات</h3><dl class="specs">${specs.map(([k, v]) => html`<div><dt>${defs.find((d) => d.key === k)?.label || k}</dt><dd>${v}</dd></div>`)}</dl></section>` : ''}
            <a class="scard" style="margin-top:14px" href="${href('/s/' + store.id)}">${storeAvatar(store)}<div><h3>${store.name}${store.verified ? html`<span class="verified">${icon('verified', 16)}</span>` : ''}</h3><p>${store.description || store.address || 'زيارة المتجر'}</p></div>${icon('chevL', 20)}</a>
          </div>
        </div>
        ${own ? '' : html`<div class="sticky-buy"><div><b>${money(price * state.qty)}</b></div>${buttons}</div>`}
        <div id="related"></div>
      </div>`;
    };
    const paint = () => {
      const y = scrollY;
      const related = main.querySelector('#related');
      render(main, view());
      if (related?.childNodes.length) main.querySelector('#related').replaceWith(related);
      scrollTo(0, y);
    };
    render(main, view());
    const add = (andGo) => {
      const vid = p.has_variants ? variantState(p, state.picks).match?.id : null;
      const item = chosenItem(p, vid);
      if (!item) return toast('اختر الخيارات أولًا', 'error');
      if (!session.user) toast('أُضيف إلى السلة. سجّل الدخول عند الدفع.', 'info');
      const k = p.id + ':' + (vid || '');
      const inCart = cart.lines.find((l) => cart.key(l) === k)?.q || 0;
      if (inCart + state.qty > Math.min(100, item.stock)) return toast(`المتاح ${item.stock} فقط${inCart ? ` وفي سلتك ${inCart}` : ''}`, 'error');
      cart.add({ pid: p.id, vid, q: state.qty, sid: p.store_id, name: p.name, price: item.price, img: item.img, label: item.label });
      if (andGo) return go('/cart');
      toast('أُضيف إلى السلة', 'success');
    };
    pageActions({
      pick: (b) => {
        const { axis, value } = b.dataset;
        state.picks = { ...state.picks, [axis]: state.picks[axis] === value ? undefined : value };
        // Drop picks that no longer combine with the new choice.
        const vs = variantState(p, state.picks);
        for (const a of vs.axes) if (a !== axis && state.picks[a] && !vs.enabled(a, state.picks[a])) delete state.picks[a];
        state.qty = 1;
        state.photo = null;
        paint();
      },
      qty: (b) => {
        state.qty = Math.max(1, Math.min(100, state.qty + +b.dataset.delta));
        paint();
      },
      photo: (b) => {
        state.photo = b.dataset.src;
        paint();
      },
      add: () => add(false),
      buyNow: () => add(true),
      fav: async (b) => {
        await toggleFav(b);
      },
      share: async () => {
        const url = location.href;
        if (navigator.share) return navigator.share({ title: p.name, text: `${p.name} — ${money(p.display_price)} في سوق الشطرة`, url }).catch(() => {});
        copyText(url);
      },
    });
    // Related: more from this store, then similar items in the category.
    const [more, similar] = await Promise.all([
      searchProducts({ store: store.id, size: 12 }),
      root ? searchProducts({ category: root.name, size: 12 }) : Promise.resolve({ items: [] }),
    ]);
    if (!isCurrent(ctx.token)) return;
    const card = (x) => productCard(x, { store: x.store_id === store.id ? store : null, fav: favorites.ids.has(x.id) });
    const m = more.items.filter((x) => x.id !== p.id),
      s = similar.items.filter((x) => x.id !== p.id && x.store_id !== store.id);
    render(
      main.querySelector('#related'),
      html`${m.length ? html`<section class="section">${sectionHead('المزيد من ' + store.name, '', href('/s/' + store.id))}<div class="scroller">${m.map(card)}</div></section>` : ''}${s.length ? html`<section class="section">${sectionHead('منتجات مشابهة', '', root ? href('/search', { cat: root.name }) : '')}<div class="scroller">${s.map(card)}</div></section>` : ''}`,
    );
  } catch (e) {
    if (isCurrent(ctx.token)) render(main, errorBlock(e));
  }
}
