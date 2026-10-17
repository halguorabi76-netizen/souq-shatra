// Store explorer: the stores of one section, one in focus at a time, swiped or stepped with arrows.
// Only the store cards are a horizontal scroller; the products below belong to the store in focus and
// are rebuilt from data already loaded by the app (no extra requests, no data of other stores shown).
const ICON={
 clock:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
 star:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4L4.2 9.7l5.4-.8Z"/></svg>',
 pin:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z"/><circle cx="12" cy="10" r="2.3"/></svg>',
 store:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5 5.5 4h13L20 9.5M4 9.5V20h16V9.5M4 9.5c0 1.6 1.3 2.5 2.7 2.5s2.6-.9 2.6-2.5c0 1.6 1.2 2.5 2.7 2.5s2.7-.9 2.7-2.5c0 1.6 1.2 2.5 2.6 2.5S20 11.1 20 9.5M9.5 20v-5h5v5"/></svg>',
 prev:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
 next:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>'
};
const KIND={physical:'محل في المدينة',online:'متجر إلكتروني',social:'صفحة على مواقع التواصل',personal:'بائع فردي'};
export function storeHours(s,now=new Date()){
 const t=v=>{const m=/^(\d{1,2}):(\d{2})/.exec(String(v||''));return m?Number(m[1])*60+Number(m[2]):null},o=t(s.open_time),c=t(s.close_time);if(o==null||c==null)return null;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Baghdad',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now),mins=Number(parts.find(p=>p.type==='hour').value)*60+Number(parts.find(p=>p.type==='minute').value);
 const open=o===c?true:o<c?mins>=o&&mins<c:mins>=o||mins<c,f=v=>{const h=Math.floor(v/60),m=v%60;return (h%12||12)+':'+String(m).padStart(2,'0')+' '+(h<12?'ص':'م')};
 return {open,label:f(o)+' – '+f(c)};
}
// Stores of a section: approved stores that sell at least one public product in it (or are filed under it).
export function sectionStores(section,stores,products,ratings=new Map()){
 const count=new Map();for(const p of products)if(p.cat===section)count.set(p.mid,(count.get(p.mid)||0)+1);
 return stores.filter(m=>count.has(m.id)||(section&&m.section_name===section)).sort((a,b)=>(ratings.get(b.id)?.rating||0)-(ratings.get(a.id)?.rating||0)||(count.get(b.id)||0)-(count.get(a.id)||0)||String(a.name).localeCompare(String(b.name),'ar'));
}
// The store's own product groups, in first-seen order, with «الكل» first.
export function storeGroups(products){const seen=[];for(const p of products){const g=String(p.store_category||'').trim();if(g&&!seen.includes(g))seen.push(g)}return seen;}

export function createStoreExplorer(ctx){
 const E=ctx.esc;let section='',list=[],index=0,group='',observer=null,settle=0;
 const reduce=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 // Scroll position that centres a card (works for RTL and LTR scrollers alike).
 const centre=(track,c)=>{const t=track.getBoundingClientRect(),r=c.getBoundingClientRect();return track.scrollLeft+(r.left+r.width/2)-(t.left+t.width/2)};
 const cover=m=>{const c=m.appearance?.cover_url||'';return c?`<img src="${E(c)}" alt="" loading="lazy" decoding="async">`:m.image_url?`<img class="sx-cover-blur" src="${E(m.image_url)}" alt="" loading="lazy" decoding="async">`:'<span class="sx-cover-art" aria-hidden="true"></span>'};
 const logo=m=>m.image_url?`<img src="${E(m.image_url)}" alt="" loading="lazy" decoding="async">`:`<b>${E(String(m.name||'م').trim().charAt(0))}</b>`;
 function card(m,i){
  const h=storeHours(m),r=ctx.rating(m.id),address=m.store_kind==='physical'&&m.address?m.address:'',meta=[
   h?`<span class="sx-meta ${h.open?'is-open':'is-closed'}">${ICON.clock}<b>${h.open?'مفتوح الآن':'مغلق الآن'}</b><small dir="rtl">${E(h.label)}</small></span>`:'',
   r?`<span class="sx-meta">${ICON.star}<b>${Number(r.rating).toFixed(1)}</b><small>(${r.ratings} تقييم)</small></span>`:'',
   address?`<span class="sx-meta">${ICON.pin}<small>${E(address)}</small></span>`:KIND[m.store_kind]?`<span class="sx-meta">${ICON.store}<small>${E(KIND[m.store_kind])}</small></span>`:''
  ].filter(Boolean).join('');
  return `<article class="sx-card" data-index="${i}" aria-roledescription="متجر" aria-label="${E(m.name)} · ${i+1} من ${list.length}"${i===index?'':' aria-hidden="true"'}><div class="sx-cover">${cover(m)}</div><div class="sx-info"><span class="sx-logo">${logo(m)}</span><h2>${E(m.name)}${m.verified?' <i class="sx-verified" title="متجر موثّق" aria-label="متجر موثّق">✓</i>':''}</h2>${m.description?`<p class="sx-desc">${E(m.description)}</p>`:''}${meta?`<div class="sx-metas">${meta}</div>`:''}<a class="sx-visit" href="./?store=${encodeURIComponent(m.id)}" data-a="visitStore" data-v="${E(m.id)}" tabindex="${i===index?0:-1}">صفحة المتجر</a></div></article>`;
 }
 function body(){
  const m=list[index];if(!m)return '';
  const all=ctx.products().filter(p=>p.mid===m.id),groups=storeGroups(all),shown=group?all.filter(p=>String(p.store_category||'').trim()===group):all;
  const tabs=groups.length?`<div class="sx-tabs" role="tablist" aria-label="مجموعات منتجات ${E(m.name)}" data-no-pull>${['',...groups].map(g=>`<button role="tab" type="button" data-sx-group="${E(g)}" aria-selected="${g===group}">${g?E(g):'الكل'}</button>`).join('')}</div>`:'';
  return `${tabs}<div class="sx-products-head"><h3>منتجات المتجر</h3><small>${shown.length} منتج</small></div>${shown.length?ctx.productCards(shown):`<div class="sx-empty">${all.length?'لا توجد منتجات في هذه المجموعة.':'لا توجد منتجات معروضة في هذا المتجر الآن.'}</div>`}`;
 }
 function paintBody(animate){
  const el=document.getElementById('sxBody');if(!el)return;el.innerHTML=body();
  if(animate&&!reduce()&&el.animate)el.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:220,easing:'ease-out'});
 }
 function paintChrome(){
  const counter=document.getElementById('sxCounter');if(counter)counter.textContent=`${index+1} من ${list.length} متاجر`;
  document.querySelectorAll('#sxTrack .sx-card').forEach((c,i)=>{const on=i===index;c.classList.toggle('is-current',on);if(on)c.removeAttribute('aria-hidden');else c.setAttribute('aria-hidden','true');const a=c.querySelector('.sx-visit');if(a)a.tabIndex=on?0:-1});
  document.querySelectorAll('[data-sx-step="-1"]').forEach(b=>b.disabled=index===0);document.querySelectorAll('[data-sx-step="1"]').forEach(b=>b.disabled=index>=list.length-1);
  document.querySelectorAll('#sxDots button').forEach((d,i)=>d.setAttribute('aria-current',String(i===index)));
  place();
 }
 // Arrows sit at the middle of the cover, whatever its height on this screen.
 function place(){const stage=document.querySelector('.sx-stage'),cov=document.querySelector('#sxTrack .sx-card .sx-cover');if(stage&&cov)stage.style.setProperty('--sx-arrow-y',Math.max(8,cov.offsetHeight/2-22)+'px')}
 function focusStore(i,{scroll=true,animate=true}={}){
  i=Math.max(0,Math.min(list.length-1,i));const changed=i!==index;index=i;if(changed)group='';
  paintChrome();if(changed)paintBody(animate);
  if(scroll){const c=document.querySelector(`#sxTrack .sx-card[data-index="${i}"]`),track=document.getElementById('sxTrack');if(c&&track){settle=Date.now();track.scrollTo({left:centre(track,c),behavior:reduce()?'auto':'smooth'})}}
 }
 function watch(){
  observer?.disconnect();const track=document.getElementById('sxTrack');if(!track||!globalThis.IntersectionObserver)return;
  observer=new IntersectionObserver(entries=>{if(Date.now()-settle<450)return;const best=entries.filter(e=>e.isIntersecting&&e.intersectionRatio>=.6).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(best)focusStore(Number(best.target.dataset.index),{scroll:false})},{root:track,threshold:[.6,.9]});
  track.querySelectorAll('.sx-card').forEach(c=>observer.observe(c));
  track.addEventListener('scrollend',()=>{const mid=track.getBoundingClientRect().left+track.clientWidth/2;let best=index,dist=1e9;track.querySelectorAll('.sx-card').forEach(c=>{const r=c.getBoundingClientRect(),d=Math.abs(r.left+r.width/2-mid);if(d<dist){dist=d;best=Number(c.dataset.index)}});if(best!==index)focusStore(best,{scroll:false})});
 }
 function render(name){
  if(name!==undefined&&name!==section){section=name;index=0;group=''}
  const view=document.getElementById('view');if(!view)return;
  const head=`<header class="sx-head"><div><small>الأقسام</small><h1>متاجر ${E(section)}</h1></div><a class="sx-all" href="#" data-a="pickcat" data-v="${E(section)}">كل منتجات القسم</a></header>`;
  if(!ctx.ready()){view.innerHTML=`<section class="sx" aria-busy="true">${head}<div class="sx-skeleton"><span></span><span></span><span></span></div></section>`;return}
  list=sectionStores(section,ctx.stores(),ctx.products(),ctx.ratings());if(index>=list.length)index=0;
  if(!list.length){view.innerHTML=`<section class="sx">${head}<div class="sx-empty sx-none"><span>${ICON.store}</span><h2>لا توجد متاجر في هذا القسم بعد</h2><p>جرّب قسماً آخر أو تصفّح كل المتاجر.</p><button class="buy" data-a="marketSection" data-v="stores">كل المتاجر</button></div></section>`;return}
  const many=list.length>1;
  view.innerHTML=`<section class="sx ${many?'':'is-single'}" aria-roledescription="مستكشف المتاجر">${head}<div class="sx-stage">${many?`<button class="sx-arrow sx-prev" type="button" data-sx-step="-1" aria-label="المتجر السابق">${ICON.prev}</button>`:''}<div class="sx-track" id="sxTrack" tabindex="0" aria-label="متاجر ${E(section)} — اسحب أو استخدم الأسهم" data-no-pull>${list.map(card).join('')}</div>${many?`<button class="sx-arrow sx-next" type="button" data-sx-step="1" aria-label="المتجر التالي">${ICON.next}</button>`:''}</div>${many?`<div class="sx-nav"><span id="sxCounter" role="status" aria-live="polite"></span>${list.length<=12?`<div class="sx-dots" id="sxDots">${list.map((m,i)=>`<button type="button" data-sx-go="${i}" aria-label="${E(m.name)}"></button>`).join('')}</div>`:''}</div>`:''}<div class="sx-body" id="sxBody" aria-live="polite"></div></section>`;
  paintChrome();paintBody(false);
  const c=document.querySelector(`#sxTrack .sx-card[data-index="${index}"]`),track=document.getElementById('sxTrack');if(c&&track){settle=Date.now();track.scrollLeft=centre(track,c)}
  watch();
 }
 document.addEventListener('click',e=>{
  if(!e.target.closest?.('.sx'))return;
  const step=e.target.closest('[data-sx-step]'),go=e.target.closest('[data-sx-go]'),tab=e.target.closest('[data-sx-group]'),peek=e.target.closest('.sx-card:not(.is-current)');
  if(step){focusStore(index+Number(step.dataset.sxStep));return}
  if(go){focusStore(Number(go.dataset.sxGo));return}
  if(peek&&!e.target.closest('a')){e.preventDefault();focusStore(Number(peek.dataset.index));return}
  if(tab){group=tab.dataset.sxGroup;document.querySelectorAll('[data-sx-group]').forEach(b=>b.setAttribute('aria-selected',String(b===tab)));const el=document.getElementById('sxBody'),tabs=el?.querySelector('.sx-tabs'),left=tabs?.scrollLeft;paintBody(false);const again=document.querySelector('#sxBody .sx-tabs');if(again&&left!=null)again.scrollLeft=left;const grid=document.querySelector('#sxBody .figma-product-grid');if(grid&&!reduce()&&grid.animate)grid.animate([{opacity:.3},{opacity:1}],{duration:180})}
 });
 document.addEventListener('keydown',e=>{if(!e.target.closest?.('#sxTrack')||(e.key!=='ArrowLeft'&&e.key!=='ArrowRight'))return;e.preventDefault();focusStore(index+(e.key==='ArrowLeft'?1:-1))});
 globalThis.addEventListener?.('resize',()=>{if(document.getElementById('sxTrack'))place()},{passive:true});
 return {render,current:()=>list[index]||null,section:()=>section};
}
