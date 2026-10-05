/* Public marketplace presentation. Products keep their original seller and ID. */
(()=>{
'use strict';
const icons={materials:'<path d="m3 7 9-4 9 4v10l-9 4-9-4ZM3 7l9 4 9-4M12 11v10M7 5l9 4"/>',stores:'<path d="M3 10h18l-2-7H5zM4 10v11h16V10M9 21v-7h6v7M3 10q2 4 4 0 2 4 5 0 3 4 5 0 2 4 4 0"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.materials}</svg>`;
const discounted=p=>Number.isSafeInteger(p.compare_at_price)&&p.compare_at_price>p.price&&p.price>0;
const percent=p=>discounted(p)?Math.max(1,Math.round((1-p.price/p.compare_at_price)*100)):0;
function price(p,fmt){return `<span class="mp-price"><strong>${fmt(p.price)}</strong>${discounted(p)?`<del>${fmt(p.compare_at_price)}</del>`:''}</span>`;}
function badge(p){return discounted(p)?`<span class="mp-discount">تخفيض ${percent(p)}٪</span>`:'';}
function avatar(m,esc){return `<span class="mp-store-avatar">${m.image_url?.startsWith('https://')?`<img src="${esc(m.image_url)}" alt="صورة ${esc(m.name)}" loading="lazy" decoding="async">`:icon('stores')}</span>`;}
function switcher(active='market'){return `<nav class="mp-switcher" aria-label="تصفح السوق"><button data-a="marketSection" data-v="market" aria-pressed="${active!=='stores'}">${icon('materials')}<span><b>المواد</b><small>منتجات جميع التجار</small></span></button><button data-a="marketSection" data-v="stores" aria-pressed="${active==='stores'}">${icon('stores')}<span><b>المتاجر</b><small>اختر متجرًا وتصفح مواده</small></span></button></nav>`;}
function storeCards(stores,products,{esc}){return `<div class="mp-stores">${stores.map(m=>{const items=products.filter(p=>p.mid===m.id&&p.active&&!p.blocked),deals=items.filter(discounted).length;return `<a class="mp-store-card" href="./?store=${encodeURIComponent(m.id)}">${avatar(m,esc)}<div><h3>${esc(m.name)}</h3><p>${esc(m.description||m.address||'متجر في سوق الشطرة')}</p><span>${items.length} منتج${deals?` · ${deals} عرض`:''}</span></div><span class="mp-visit">زيارة المتجر ←</span></a>`;}).join('')}</div>`;}
function productCards(products,{esc,fmt,thumb,mname}){return `<div class="grid mp-products">${products.map(p=>`<article class="mp-product"><button class="mp-product-open" data-a="prod" data-v="${esc(p.id)}" aria-label="عرض ${esc(p.name)}"><div class="tile">${thumb(p)}${badge(p)}</div><h3>${esc(p.name)}</h3>${p.variant?`<small>${esc(p.variant)}</small>`:''}${price(p,fmt)}${p.stock<1?'<small class="mp-unavailable">نفدت الكمية</small>':''}</button><a class="mp-product-store" href="./?store=${encodeURIComponent(p.mid)}">${icon('stores')}<span>${esc(mname(p.mid))}</span><span aria-hidden="true">←</span></a></article>`).join('')}</div>`;}
window.SouqMarketplace={icon,discounted,price,badge,avatar,switcher,storeCards,productCards};
})();
