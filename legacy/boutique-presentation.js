/* Only derived presentation; no new prices, ratings, stock or delivery claims. */
(()=>{
'use strict';
const COLORS={'أسود':'#15131b','أبيض':'#fff','رمادي':'#808080','عنابي':'#800020','كحلي':'#18244c','أزرق':'#2563eb','بيج':'#dbc4a1','كريمي':'#fff2cf','أحمر':'#bc344c','وردي':'#f0aec9','أخضر':'#218568','بنفسجي':'#542577','بني':'#92400e','ذهبي':'#d4af37','فضي':'#c0c0c0','ليلكي':'#c4b5fd'};
function previewOptions(p,{esc}){
 const rows=(p.variants||[]).filter(v=>!v.archived),attrs=rows.map(v=>v.attributes||{}),colors=[...new Set(attrs.map(a=>a.color||a.custom_color).filter(Boolean))],sizes=[...new Set(attrs.map(a=>a.size||a.custom_size).filter(Boolean))];
 if(!colors.length&&!sizes.length)return '';
 return `<div class="boutique-options" aria-label="الألوان والمقاسات المتاحة"><span class="boutique-color-dots">${colors.slice(0,5).map(value=>{const custom=p.attributes?._color_swatches?.[value],color=/^#[0-9a-f]{3,8}$/i.test(custom||'')?custom:COLORS[value];return `<i title="${esc(value)}" style="--dot-color:${color||'var(--tile)'}" aria-label="${esc(value)}">${color?'':esc(value.slice(0,1))}</i>`;}).join('')}</span><span class="boutique-size-list" dir="ltr">${sizes.slice(0,6).map(v=>`<span>${esc(v)}</span>`).join(' ')}</span></div>`;
}
function gallery(p,display,photo,{esc,thumb}){
 const images=[...new Set([p.img,...(p.variants||[]).filter(v=>!v.archived).map(v=>v.img)].filter(src=>typeof src==='string'&&(src.startsWith('https://')||src.startsWith('data:image/'))))];
 const current=images.includes(photo)?photo:display.img;
 return `<div class="boutique-gallery"><div class="tile big" id="productPhoto">${thumb({...display,img:current})}</div>${images.length>1?`<div class="boutique-thumbnails" aria-label="صور المنتج">${images.map((src,i)=>`<button type="button" data-a="productImage" data-v="${i}" aria-label="صورة المنتج ${i+1}" aria-pressed="${src===current}"><img src="${esc(src)}" loading="lazy" alt="صورة المنتج ${i+1}"></button>`).join('')}</div>`:''}</div>`;
}
function storeBar(m,{esc}){
 if(!m?.id)return '';
 const color='#45205e';
 return `<div class="boutique-storebar boutique-checkout-bar" style="--store-header:${color}"><button class="sw-icon" data-a="back" aria-label="العودة إلى المتجر">←</button><span class="sw-sitebrand"><b>${esc(m.name)}</b></span><button class="sw-icon" data-a="tab" data-v="orders" aria-label="طلباتي"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9 9h6M9 13h6M9 17h4"/></svg></button></div>`;
}
window.SouqBoutique={previewOptions,gallery,storeBar};
})();
