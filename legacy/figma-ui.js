/* Figma Make presentation adapted to the existing HTML/JS marketplace.
 * No database client, account switcher, fixture data, or persistence lives here.
 */
(()=>{
 'use strict';
 if(document.documentElement.hasAttribute('data-portal'))return;
 const base=window.SouqMarketplace;if(!base)return;
 const paths={
  media:'<path d="M3 10h18v10H3zM3 10l-1-5 18-3 1 5-18 3M7 4l3 4m4-5 3 4"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  bag:'<rect x="5" y="6" width="14" height="15" rx="3"/><path d="M8 6V4h8v2M8 10a4 4 0 0 0 8 0"/>',
  pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  home:'<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  store:'<path d="M4 10v10h16V10"/><path d="M3 10 5 4h14l2 6"/><path d="M8 20v-6h8v6"/><path d="M3 10c1 2 3 2 4 0 1 2 3 2 5 0 1 2 3 2 5 0 1 2 3 2 4 0"/>',
  cart:'<path d="M3 4h2l2 11h11l2-7H7"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
  arrow:'<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  orders:'<path d="M6 3h12v18H6z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 4-7 8-7s7 2 8 7"/>',
  truck:'<path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
  check:'<path d="m5 12 4 4L19 6"/>'
 };
 const icon=name=>`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name==='stores'?'store':name]||paths.grid}</svg>`;
 function productCards(products,{esc,fmt,thumb,mname,favorites=[]}){
  return `<div class="grid mp-products figma-product-grid">${products.map(p=>`<article class="mp-product figma-product-card">${base.favoriteButton(p,esc,favorites)}<button class="figma-product-media" data-a="prod" data-v="${esc(p.id)}" aria-label="عرض ${esc(p.name)}">${thumb(p)}${base.badge(p)}</button><div class="figma-product-info"><a class="figma-store-link" href="./?store=${encodeURIComponent(p.mid)}" data-a="visitStore" data-v="${esc(p.mid)}">${esc(mname(p.mid))}</a><button class="figma-product-name" data-a="prod" data-v="${esc(p.id)}">${esc(p.name)}</button><div class="figma-product-row">${base.price(p,fmt)}<button class="figma-add" data-a="quickAdd" data-v="${esc(p.id)}" aria-label="إضافة ${esc(p.name)} إلى السلة" ${base.forSale(p)?'':'disabled'}>${icon('plus')}</button></div></div></article>`).join('')}</div>`;
 }
 function storeCards(stores,products,{esc}){
  return `<div class="mp-stores figma-store-grid">${stores.map(m=>{const count=products.filter(p=>p.mid===m.id&&p.active&&!p.blocked).length;return `<a class="mp-store-card figma-store-card" href="./?store=${encodeURIComponent(m.id)}" data-a="visitStore" data-v="${esc(m.id)}">${base.avatar(m,esc)}<div><h3>${esc(m.name)}</h3>${m.username?`<small dir="ltr">@${esc(m.username)}</small>`:''}<p>${esc(m.description||m.address||'متجر في سوق الشطرة')}</p><small>${count} منتج${m.verified?' · ✓ موثّق':''}</small></div>${icon('arrow')}</a>`;}).join('')}</div>`;
 }
 // Search, stock/variant eligibility and discount math stay owned by the app.
 const storeMatches=(rows,options)=>rows.map(({store:m,products})=>`<section class="mp-search-store"><div class="section-title"><a class="figma-store-link" href="./?store=${encodeURIComponent(m.id)}" data-a="visitStore" data-v="${options.esc(m.id)}"><h2>${options.esc(m.name)}</h2></a><small>${products.length} مادة مطابقة</small></div>${products.length?productCards(products,options):'<p class="note">لا توجد مواد متوفرة حاليًا.</p>'}</section>`).join('');
 const featuredProductId='d622e57b-ef25-4d91-a3fa-33a98a39659d';
 function featuredBanner(products,{esc,fmt,mname,fallback}){
  const product=products.find(p=>p.id===featuredProductId&&p.active&&!p.blocked&&p.img);
  const image=product?product.img:fallback[0],caption=product?product.name:fallback[1];
  return `<div class="banner-wrap"><div class="banner figma-hero ${product?'figma-product-hero':''}" aria-label="${product?'منتج من سوق الشطرة':'مشهد من مدينة الشطرة'}"><img src="${esc(image)}" alt="${esc(product?product.name:'مشهد من مدينة الشطرة')}" decoding="async" draggable="false"><div class="figma-hero-copy"><span class="figma-eyebrow">${product?esc(mname(product.mid)):'من الشطرة وإليها'}</span><h1>${product?esc(product.name):'اكتشف محلات مدينتك<br>من مكانك'}</h1><p>${product?esc((product.desc||'').slice(0,160)):'منتجات محلية، وتسوق أسهل كل يوم.'}</p>${product?`<div class="figma-hero-price">${base.price(product,fmt)}</div>`:''}<button class="figma-button" data-a="${product?'prod':'marketSection'}" data-v="${product?esc(product.id):'materials'}">${product?'عرض المنتج':'ابدأ التسوق'} ${icon('arrow')}</button></div><div class="figma-hero-note"><small>${product?'من متاجر الشطرة':'أسواق مدينتك'}</small><strong class="banner-caption">${esc(caption)}</strong></div></div></div>`;
 }
 window.SouqFigmaUI={...base,icon,productCards,storeCards,storeMatches,featuredBanner};
 const line=document.querySelector('.app>.top .topline');
 if(line){
  const group=document.createElement('div'),actions=document.createElement('div');group.className='figma-header-brand';actions.className='figma-header-actions';
  const menu=document.getElementById('marketMenuToggle'),brand=line.querySelector('.header-brand');
  if(menu)group.append(menu);if(brand){const image=brand.querySelector('.header-logo');if(image){const frame=document.createElement('span');frame.className='figma-logo-frame';image.src='../icons/figma-shatra-logo-transparent-v146.png';image.replaceWith(frame);frame.append(image);}const tagline=brand.querySelector('.header-brand-name small');if(tagline){tagline.textContent='كل المدينة في مكان واحد';tagline.removeAttribute('lang');tagline.removeAttribute('dir');}group.append(brand);}
  const notice=line.querySelector('[data-a="notifications"]'),theme=document.getElementById('themeToggle'),account=document.getElementById('accountTrigger');
  for(const el of [notice,theme,account,line.querySelector('.header-cart')])if(el)actions.append(el);
  line.prepend(group,actions);
 }
 function decorateDrawer(){
  const panel=document.querySelector('#marketDrawer .market-drawer-panel');
  if(panel&&!panel.dataset.figmaDecorated){
   panel.dataset.figmaDecorated='true';
   const image=panel.querySelector('.market-drawer-brand img');
   if(image){const frame=document.createElement('span');frame.className='figma-logo-frame';image.className='header-logo';image.src='../icons/figma-shatra-logo-transparent-v146.png';image.replaceWith(frame);frame.append(image);}
   for(const button of panel.querySelectorAll('nav button')){const name=button.dataset.a==='accountMenu'?'user':button.dataset.v==='stores'?'store':button.dataset.v==='myMarket'?'cart':button.dataset.v==='chats'?'orders':'grid';button.insertAdjacentHTML('afterbegin',icon(name));}
  }
  const sellerLogo=document.querySelector('#swDrawer .sw-market-logo img');
  if(sellerLogo)sellerLogo.src='../icons/figma-shatra-logo-transparent-v146.png';
 }
 const drawerObserver=new MutationObserver(decorateDrawer);drawerObserver.observe(document.body,{childList:true});
 const nav=document.querySelector('.app>.tabs');
 for(const [value,name] of [['stores','store'],['market','home'],['materials','grid'],['profilePage','user']]){const mark=nav?.querySelector(`[data-v="${value}"] .navicon`);if(mark)mark.innerHTML=icon(name);}
 // The existing render() replaces cart/order labels. Styling remains on their
 // existing actions, rather than creating a second set of navigation controls.
 const profile=document.getElementById('accountTrigger');if(profile)profile.classList.add('figma-profile-shortcut');
})();
