import { html, safeUrl } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { money, percentOff } from '../core/format.js';
import { href } from '../core/router.js';

const EMOJI = {
  'مواد غذائية': '🛒', 'خضار وفواكه': '🥬', تمور: '🌴', ملابس: '👕', أحذية: '👟', مشروبات: '🥤', 'عطور وتجميل': '💄', أجهزة: '📱',
  'حاسبات وتابلت': '💻', 'أجهزة كهربائية': '🔌', تلفزيونات: '📺', أثاث: '🛋️', منزلية: '🏠', 'مجوهرات وإكسسوارات': '💍', ساعات: '⌚',
  'ألعاب أطفال': '🧸', 'مستلزمات أطفال': '🍼', 'كتب وقرطاسية': '📚', 'قطع سيارات': '🔧', 'إطارات وبطاريات': '🛞', 'مواد بناء وأدوات': '🧱',
  رياضة: '⚽', حقائب: '👜', نظارات: '👓', 'منتجات تنظيف': '🧴', 'مستلزمات حيوانات': '🐾', 'زراعة وحدائق': '🌱', أخرى: '📦',
};
export const catEmoji = (name) => EMOJI[name] || '🛍️';
// Soft tile tints, picked by the category name so each category keeps its colour.
const TINTS = ['#e7f6ee', '#fff3dc', '#e9edfc', '#fde9ef', '#e6f4f8', '#f1ebfb', '#fbefe4', '#eef5e1'];
const tint = (name) => TINTS[[...(name || '')].reduce((n, ch) => n + ch.codePointAt(0), 0) % TINTS.length];
export function catTile(c, { active = false } = {}) {
  return html`<a class="cat-card ${active ? 'on' : ''}" href="${href('/products', { cat: c.name })}" aria-current="${active}"><span class="art" style="--tint:${tint(c.name)}">${catEmoji(c.name)}</span><b>${c.name}</b></a>`;
}
// Home sellers (no shop) are stored as store_kind = 'online'.
export const isHomeSeller = (s) => s?.store_kind === 'online';
export const kindBadge = (s) => (isHomeSeller(s) ? html`<span class="kind kind-home">${icon('home', 13)} من البيت</span>` : html`<span class="kind">${icon('store', 13)} محل</span>`);
export function storeTile(s, { featured } = {}) {
  return html`<a class="store-tile" href="${href('/s/' + s.id)}">${storeAvatar(s)}<b>${s.name}${s.verified ? html`<span class="verified">${icon('verified', 14)}</span>` : ''}</b>${kindBadge(s)}${featured ? html`<span class="ad-flag">مميز</span>` : ''}</a>`;
}

export function priceTag(p) {
  const price = p.display_price ?? p.price,
    compare = p.display_compare ?? p.compare_at_price;
  return html`<div class="price">${p.from_price ? html`<span class="from">ابتداءً من</span>` : ''}<b>${money(price)}</b>${compare > price ? html`<del>${money(compare)}</del>` : ''}</div>`;
}
export function productImage(p, cls = '') {
  return p.img ? html`<img src="${safeUrl(p.img)}" alt="${p.name}" loading="lazy" decoding="async" class="${cls}">` : html`<span class="ph">${icon('image', 40)}</span>`;
}
export function productCard(p, { store, fav = false, sponsored = false } = {}) {
  const off = percentOff(p.display_price, p.display_compare);
  return html`<article class="pcard ${sponsored ? 'sponsored-card' : ''}">
    <div class="media">${productImage(p)}
      <div class="flags">${off ? html`<span class="off">-${off}%</span>` : ''}${!p.in_stock ? html`<span class="oos">نفدت الكمية</span>` : ''}${sponsored ? html`<span class="ad-flag">مُموَّل</span>` : ''}</div>
      <button class="fav" data-action="fav" data-id="${p.id}" aria-pressed="${fav}" aria-label="${fav ? 'إزالة من المفضلة' : 'أضف إلى المفضلة'}">${icon('heart', 18)}</button>
    </div>
    <div class="body">
      <a class="name stretched" href="${href('/p/' + p.id)}">${p.name}</a>
      ${store ? html`<span class="store">${icon('store', 13)}${store.name}${store.verified ? html`<span class="verified">${icon('verified', 13)}</span>` : ''}</span>` : ''}
      <div class="foot">${priceTag(p)}<button class="quick" data-action="quickAdd" data-id="${p.id}" ${p.in_stock ? '' : 'disabled'} aria-label="أضف ${p.name} إلى السلة">${icon('plus', 18)}</button></div>
    </div>
  </article>`;
}
export function storeAvatar(s, size) {
  return html`<span class="avatar" style="${size ? `width:${size}px;height:${size}px` : ''}">${s.image_url ? html`<img src="${safeUrl(s.image_url)}" alt="" loading="lazy">` : (s.name || '؟').trim().slice(0, 1)}</span>`;
}
export function storeCard(s, { count, featured, category } = {}) {
  return html`<a class="scard" href="${href('/s/' + s.id)}">${storeAvatar(s)}<div><h3>${s.name}${s.verified ? html`<span class="verified" title="متجر موثّق">${icon('verified', 16)}</span>` : ''}${featured ? html`<span class="ad-flag">مميز</span>` : ''}</h3><p>${s.description || (isHomeSeller(s) ? 'يبيع من البيت في الشطرة' : s.address) || 'متجر في سوق الشطرة'}</p><div class="meta">${kindBadge(s)}${category ? html`<span class="kind">${category}</span>` : ''}${count != null ? html`<small class="muted">${count} منتج</small>` : ''}</div></div></a>`;
}
export function sectionHead(title, sub, link, ic) {
  return html`<div class="section-head"><div><h2>${ic ? icon(ic, 22) : ''}${title}</h2>${sub ? html`<p>${sub}</p>` : ''}</div>${link ? html`<a href="${link}">عرض الكل ${icon('chevL', 16)}</a>` : ''}</div>`;
}
export function breadcrumbs(items) {
  return html`<nav class="breadcrumbs" aria-label="مسار الصفحة">${items.map((it, i) => html`${i ? icon('chevL', 14) : ''}${it.href ? html`<a href="${it.href}">${it.label}</a>` : html`<span>${it.label}</span>`}`)}</nav>`;
}
export function stepper(value, action, id, { min = 1, max = 100, small = false } = {}) {
  return html`<div class="stepper ${small ? 'sm' : ''}"><button data-action="${action}" data-id="${id}" data-delta="1" aria-label="زيادة" ${value >= max ? 'disabled' : ''}>${icon('plus', 16)}</button><output aria-live="polite">${value}</output><button data-action="${action}" data-id="${id}" data-delta="-1" aria-label="إنقاص" ${value <= min ? 'disabled' : ''}>${icon(value <= 1 && min === 0 ? 'trash' : 'minus', 16)}</button></div>`;
}
