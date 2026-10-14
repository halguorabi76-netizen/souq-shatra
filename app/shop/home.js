import { html, render, safeUrl } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { href, isCurrent } from '../core/router.js';
import { getCategories, searchProducts, getStores, getLivePromotions, getProductsByIds } from '../core/api.js';
import { recent } from '../core/state.js';
import { skeletonCards, errorBlock } from '../core/ui.js';
import { productCard, storeCard, sectionHead, catEmoji, priceTag } from './components.js';
import { mountShop, favorites, loadFavorites, setTitle } from './shell.js';

const SLIDES = [
  { img: 'icons/shatra-river.jpeg', title: 'أسواق الشطرة في جيبك', text: 'منتجات محلات مدينتك، بأسعارها الحقيقية، وتوصيل لباب البيت.', cta: 'ابدأ التسوق', to: '#/search' },
  { img: 'icons/shatra-square.jpeg', title: 'ادفع كما يناسبك', text: 'نقدًا عند الاستلام أو إلكترونيًا عبر زين كاش والبطاقات.', cta: 'تصفح العروض', to: '#/search?sort=deals' },
  { img: 'icons/shatra-bridge.jpeg', title: 'عندك محل؟ افتح متجرك اليوم', text: 'اعرض منتجاتك لآلاف الزبائن في الشطرة وما حولها.', cta: 'بِع معنا', to: '#/sell' },
];

export async function homePage(ctx) {
  const main = await mountShop();
  setTitle('');
  render(main, html`<div class="hero">${SLIDES.map(slide)}</div>${skeletonCards(8)}`);
  try {
    const [cats, stores, promos, latest] = await Promise.all([getCategories(), getStores(), getLivePromotions(), searchProducts({ size: 48 }), loadFavorites()]);
    if (!isCurrent(ctx.token)) return;
    const byStore = new Map(stores.map((s) => [s.id, s]));
    const promoIds = (place) => promos.filter((p) => p.placement === place && p.product_id).map((p) => p.product_id);
    const promoted = await getProductsByIds([...promoIds('home_hero'), ...promoIds('home_featured'), ...recent.list()]);
    if (!isCurrent(ctx.token)) return;
    const live = (ids) => ids.map((id) => promoted.find((p) => p.id === id)).filter((p) => p && p.active && !p.blocked && byStore.has(p.store_id));
    const heroAds = live(promoIds('home_hero')).slice(0, 5);
    const featured = live(promoIds('home_featured'));
    const deals = latest.items.filter((p) => p.display_compare > p.display_price && p.in_stock).slice(0, 12);
    const recentItems = live(recent.list()).slice(0, 12);
    const spotlight = new Set(promos.filter((p) => p.placement === 'store_spotlight').map((p) => p.store_id));
    const storeList = [...stores].sort((a, b) => Number(spotlight.has(b.id)) - Number(spotlight.has(a.id)) || Number(!!b.verified) - Number(!!a.verified)).slice(0, 8);
    const card = (p, sponsored) => productCard(p, { store: byStore.get(p.store_id), fav: favorites.ids.has(p.id), sponsored });
    const roots = cats.filter((c) => !c.parent_id);
    render(
      main,
      html`<div class="hero" id="hero">${heroAds.map(adSlide)}${SLIDES.map(slide)}</div>
      <div class="hero-dots" id="heroDots">${[...heroAds, ...SLIDES].map((_, i) => html`<button aria-label="الشريحة ${i + 1}" aria-current="${i === 0}" data-slide="${i}"></button>`)}</div>
      <div class="trust">
        <div>${icon('truck', 26)}<span><b>توصيل محلي سريع</b><small>سائقون من مدينتك</small></span></div>
        <div>${icon('cash', 26)}<span><b>ادفع عند الاستلام</b><small>أو إلكترونيًا بأمان</small></span></div>
        <div>${icon('shield', 26)}<span><b>متاجر معتمدة</b><small>نراجع كل متجر قبل نشره</small></span></div>
        <div>${icon('undo', 26)}<span><b>إلغاء وإرجاع</b><small>قبل استلام السائق</small></span></div>
      </div>
      ${roots.length ? html`<section class="section">${sectionHead('تسوّق حسب القسم', '', '#/search')}<div class="cat-rail">${roots.map((c) => html`<a class="cat-tile" href="${href('/search', { cat: c.name })}"><span class="ic" style="font-size:2rem">${catEmoji(c.name)}</span>${c.name}</a>`)}</div></section>` : ''}
      ${featured.length ? html`<section class="section">${sectionHead('منتجات مميزة', 'اختيارات متاجرنا لك اليوم', '', 'sparkles')}<div class="scroller">${featured.map((p) => card(p, true))}</div></section>` : ''}
      ${deals.length ? html`<section class="section deal-band">${sectionHead('عروض وتخفيضات', 'أسعار مخفضة لفترة محدودة', '#/search?sort=deals', 'flame')}<div class="scroller">${deals.map((p) => card(p))}</div></section>` : ''}
      <section class="section">${sectionHead('وصل حديثًا', 'أحدث ما أضافته متاجر الشطرة', '#/search?sort=newest', 'zap')}${latest.items.length ? html`<div class="product-grid">${latest.items.slice(0, 20).map((p) => card(p))}</div>` : html`<div class="card empty">${icon('store', 40)}<h3>المتاجر تجهّز منتجاتها</h3><p>عد قريبًا لتشاهد أحدث المنتجات.</p></div>`}</section>
      ${storeList.length ? html`<section class="section">${sectionHead('متاجر الشطرة', `${stores.length} متجر معتمد`, '#/stores', 'store')}<div class="store-grid">${storeList.map((s) => storeCard(s, { featured: spotlight.has(s.id) }))}</div></section>` : ''}
      ${recentItems.length ? html`<section class="section">${sectionHead('شاهدتها مؤخرًا', '', '', 'clock')}<div class="scroller">${recentItems.map((p) => card(p))}</div></section>` : ''}
      <section class="section seller-cta"><div><h2>عندك محل أو بضاعة؟ ابدأ البيع اليوم</h2><ul><li>متجر خاص باسمك ورابط تشاركه مع زبائنك</li><li>لوحة لإدارة المنتجات والطلبات والأرباح</li><li>سائقو توصيل يستلمون من محلك مباشرة</li></ul><div class="btns"><a class="btn btn-accent" href="#/sell">افتح متجرك</a><a class="btn btn-outline" href="#/drive">انضم كسائق</a></div></div><div class="art" style="text-align:center;font-size:5rem">🏪</div></section>`,
    );
    wireHero();
  } catch (e) {
    if (isCurrent(ctx.token)) render(main, errorBlock(e));
  }
}
function slide(s) {
  return html`<div class="slide"><img class="bg" src="${s.img}" alt=""><div class="slide-body"><h2>${s.title}</h2><p>${s.text}</p><a class="btn btn-accent" href="${s.to}">${s.cta} ${icon('arrowL', 18)}</a></div></div>`;
}
function adSlide(p) {
  return html`<div class="slide"><div class="slide-body"><span class="sponsored">إعلان مُموَّل</span><h2>${p.name}</h2>${priceTag(p)}<a class="btn btn-accent" href="${href('/p/' + p.id)}">تسوّق الآن ${icon('arrowL', 18)}</a></div>${p.img ? html`<div class="slide-product"><img src="${safeUrl(p.img)}" alt="${p.name}"></div>` : ''}</div>`;
}
function wireHero() {
  const hero = document.getElementById('hero'),
    dots = document.querySelectorAll('#heroDots button');
  if (!hero || !dots.length) return;
  const at = () => Math.round(Math.abs(hero.scrollLeft) / hero.clientWidth);
  hero.addEventListener('scroll', () => dots.forEach((d, i) => d.setAttribute('aria-current', String(i === at()))), { passive: true });
  dots.forEach((d) => d.addEventListener('click', () => hero.scrollTo({ left: -d.dataset.slide * hero.clientWidth, behavior: 'smooth' })));
  const timer = setInterval(() => {
    if (!hero.isConnected) return clearInterval(timer);
    if (document.hidden || hero.matches(':hover')) return;
    const next = (at() + 1) % dots.length;
    hero.scrollTo({ left: -next * hero.clientWidth, behavior: 'smooth' });
  }, 6000);
}
