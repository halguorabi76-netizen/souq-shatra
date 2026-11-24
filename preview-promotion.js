const KEY='souq-preview-promotion-v1';
const PALETTES=['lavender','turquoise','orange'];
const DEFAULTS=[
 ['كل اللي تحتاجه بمكان واحد','اكتشف منتجات ومتاجر الشطرة'],
 ['تسوّق براحتك','اختيارات متنوعة وأسعار تناسبك'],
 ['عروض تستاهل تشوفها','اكتشف أحدث العروض والمنتجات']
];
const DURATION=6500;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaults=()=>DEFAULTS.map(([title,description],i)=>({
 title,description,cta:'تسوق الآن',palette:PALETTES[i],size:17,x:0,y:0,enabled:true,
 slots:Array.from({length:4},()=>({id:'',visible:true}))
}));
const bounded=(v,f,min,max)=>Number.isFinite(v)?Math.max(min,Math.min(max,v)):f;
function read() {
 const slides=defaults();
 try {
  const saved=JSON.parse(localStorage.getItem(KEY));
  return slides.map((base,i)=>{
   const s=saved?.[i];
   if(!s)return base;
   return {...base,...Object.fromEntries(['title','description','cta'].map(k=>[k,typeof s[k]==='string'?s[k].slice(0,90):base[k]])),
    palette:PALETTES.includes(s.palette)?s.palette:base.palette,enabled:s.enabled!==false,
    size:bounded(s.size,17,14,20),x:bounded(s.x,0,-8,8),y:bounded(s.y,0,-12,12),
    slots:base.slots.map((slot,j)=>({id:String(s.slots?.[j]?.id||''),visible:s.slots?.[j]?.visible!==false}))};
  });
 }catch{return slides}
}

let publicProducts;
export function promotionProduct(id){return publicProducts?.find(p=>p.id===id)}
async function fetchProducts() {
 const {SUPABASE_URL:url,SUPABASE_ANON_KEY:key}=await import('./config.js');
 const endpoint=new URL('/rest/v1/products',url);
 endpoint.search=new URLSearchParams({
  select:'id,store_id,name,sku,image_path,price,compare_at_price,description,category,stock,catalog_category_id,has_variants',
  active:'eq.true',blocked:'eq.false',review_status:'eq.approved',order:'id'
 });
 const products=[];
 for(let offset=0;;offset+=300){
  endpoint.searchParams.set('limit','300');endpoint.searchParams.set('offset',String(offset));
  const response=await fetch(endpoint,{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('Catalog unavailable');
  const rows=await response.json();
  products.push(...rows.map(p=>({...p,mid:p.store_id,desc:p.description,cat:p.category,active:true,variants:[],
   img:p.image_path?new URL('/storage/v1/object/public/products/'+p.image_path.split('/').map(encodeURIComponent).join('/'),url).href:''})));
  if(rows.length<300)return products;
 }
}
function stage(slide,products,editing=false) {
 const copy=['title','description','cta'].map((key,i)=>{
  const tag=['h2','p','span'][i],text='<'+tag+'>'+esc(slide[key])+'</'+tag+'>';
  if(editing&&i===2)return '<span class="promo-cta">'+text+'</span>';
  return i===2?'<button type="button" class="promo-cta" data-a="marketSection" data-v="materials">'+text+'</button>':text;
 }).join('');
 const hasProducts=slide.slots.some(s=>s.visible&&products.some(p=>p.id===s.id));
 const slots=slide.slots.map((slot,i)=>{
  const product=products.find(p=>p.id===slot.id),n=i+1;
  const image=product?.img?'<img src="'+esc(product.img)+'" alt="" draggable="false">':'';
  const content=image?'<span class="promo-float">'+image+'<i class="promo-glint" aria-hidden="true"></i></span>':
   product?'<span class="promo-product-name">'+esc(product.name)+'</span>':'';
  const item=editing?((content&&'<span class="promo-product">'+content+'</span>')||'<button type="button" class="promo-slot-plus" data-pick="'+i+'" aria-label="إضافة منتج إلى اللوح '+n+'">+</button>'):
   product?'<button type="button" class="promo-product" data-a="promoProduct" data-v="'+esc(product.id)+'" aria-label="'+esc(product.name)+'">'+content+'</button>':'';
  return '<div class="promo-slot" style="--slot:'+i+'"'+(!slot.visible?(editing?' data-off="true"':' hidden'):'')+'>'+item+'<span class="promo-wood" aria-hidden="true"></span></div>';
 }).join('');
 return '<div class="promo-stage" data-palette="'+slide.palette+'"'+(!editing&&!hasProducts?' data-copy-only':'')+'><div class="promo-copy" style="--title-size:'+slide.size+'px;--copy-x:'+slide.x+'px;--copy-y:'+slide.y+'px">'+copy+'</div><div class="promo-shelves">'+slots+'</div></div>';
}

export function previewPromotionMarkup(){return '<section class="preview-promotion" aria-label="عروض سوق الشطرة"></section>'}

export function mountPreviewPromotion({products,format,openProduct}) {
 let slides=read(),active=0,editorSlide=0,pickedSlot=-1,host,elapsed=0,last=0,timer=0,hover=false,pointer=null,suppressUntil=0;
 let loading=false,failed=false;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const catalog=()=>[...new Map([...products(),...(publicProducts||[])].map(p=>[p.id,p])).values()];
 const available=()=>slides.flatMap((s,i)=>s.enabled?[i]:[]);
 function draw(direction=0) {
  const previous=direction&&!reduced.matches?host?.querySelector('.promo-stage')?.cloneNode(true):null;
  if(!host?.isConnected)return;
  const indexes=available();
  if(indexes.length&&!indexes.includes(active))active=indexes[0];
  host.hidden=!indexes.length;
  host.innerHTML=indexes.length?'<div class="promo-window">'+stage(slides[active],catalog())+'</div>'+(indexes.length>1?'<div class="promo-indicators" role="group" aria-label="الشرائح الترويجية">'+indexes.map(i=>'<button type="button" data-slide="'+i+'" aria-label="الشريحة '+(i+1)+'" aria-current="'+(i===active)+'"><i></i></button>').join('')+'</div>':''):'';
  if(previous){
   const incoming=host.querySelector('.promo-stage');
   const carousel=host.querySelector('.promo-window');
   previous.inert=true;previous.setAttribute('aria-hidden','true');previous.classList.add('promo-outgoing');
   carousel.prepend(previous);
   const options={duration:440,easing:'cubic-bezier(.25,.7,.25,1)'};
   previous.animate([{transform:'translateX(0)'},{transform:'translateX('+(-direction*108)+'%) rotate('+(-direction*7)+'deg)'}],options).finished.finally(()=>previous.remove());
   incoming.animate([{transform:'translateX('+(direction*100)+'%) rotate('+(direction*4)+'deg)'},{transform:'translateX(0)'}],options);
  }
  elapsed=0;last=0;
  if(indexes.length>1&&!timer)timer=requestAnimationFrame(tick);
 }
 function step(direction) {
  const indexes=available();
  if(indexes.length<2)return;
  active=indexes[(indexes.indexOf(active)+direction+indexes.length)%indexes.length];draw(direction);
 }
 function tick(time) {
  timer=0;
  if(!host?.isConnected||available().length<2)return;
  if(last&&!document.hidden&&!hover&&!pointer&&!host.contains(document.activeElement)&&!dialog.open&&!reduced.matches){
   elapsed+=time-last;
   if(elapsed>=DURATION){step(1);return}
  }
  last=time;
  host.style.setProperty('--progress',String(elapsed/DURATION));
  timer=requestAnimationFrame(tick);
 }
 async function loadCatalog() {
  if(publicProducts||loading)return;
  loading=true;failed=false;renderResults();
  try{publicProducts=await fetchProducts();draw();if(dialog.open)drawEditor()}
  catch{failed=true}
  finally{loading=false;renderResults()}
 }
 function bindHost() {
  const next=document.querySelector('.preview-promotion');
  if(!next||next===host)return;
  host=next;hover=false;pointer=null;draw();
  if(slides.some(s=>s.slots.some(slot=>slot.id)))void loadCatalog();
  host.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')hover=true});
  host.addEventListener('pointerleave',()=>{hover=false;pointer=null});
  host.addEventListener('pointerdown',e=>{pointer={x:e.clientX,y:e.clientY,id:e.pointerId}});
  window.addEventListener('pointerup',onRelease,{signal:hostListeners.signal});
  host.addEventListener('pointercancel',()=>{pointer=null});
  host.addEventListener('click',e=>{
   if(performance.now()<suppressUntil){e.stopPropagation();e.preventDefault();return}
   const slide=e.target.closest('[data-slide]');
   if(slide){const next=Number(slide.dataset.slide),direction=Math.sign(next-active);active=next;draw(direction);host.querySelector('[aria-current="true"]')?.focus()}
   const product=e.target.closest('[data-a="promoProduct"]');
   if(product){e.stopPropagation();openProduct(product.dataset.v)}
  },true);
 }
 function onRelease(e) {
  if(!pointer||pointer.id!==e.pointerId)return;
  const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
  pointer=null;
  if(Math.abs(dx)<35||Math.abs(dx)<Math.abs(dy)*1.25)return;
  suppressUntil=performance.now()+350;
  step(dx>0?1:-1);
 }
 let hostListeners=new AbortController();
 const view=document.getElementById('view');
 new MutationObserver(()=>{
  if(document.querySelector('.preview-promotion')===host)return;
  hostListeners.abort();hostListeners=new AbortController();
  bindHost();
 }).observe(view,{childList:true});

 const inlineEditor=new URLSearchParams(location.search).get('bannerEditor')==='embedded';
 const dialog=document.createElement('dialog');
 dialog.className='promo-editor';
 dialog.setAttribute('aria-labelledby','promo-editor-label');
 dialog.innerHTML=`<header><div><h1 id="promo-editor-label">إدارة البنر الترويجي</h1><p>تُحفظ التعديلات محليًا في هذا المتصفح للمعاينة فقط.</p></div><button type="button" data-editor="close" aria-label="إغلاق المحرر">×</button></header>
 <div class="promo-editor-tabs" role="group" aria-label="اختيار الشريحة"></div>
 <div class="promo-editor-grid"><div><div class="promo-editor-stage"></div><div class="promo-editor-actions"><button type="button" data-editor="phone" aria-pressed="false">معاينة الهاتف</button><button type="button" data-editor="replay">إعادة الحركة</button><button type="button" data-editor="text" aria-expanded="false" aria-controls="promo-copy-settings">✎ تعديل النص</button></div></div>
 <div class="promo-settings"></div></div>
 <section class="promo-picker" hidden><div class="promo-picker-head"><label for="promo-product-search">اختيار منتج</label><button type="button" data-editor="cancel-pick">إغلاق الاختيار</button></div><input id="promo-product-search" type="search" placeholder="ابحث باسم المنتج أو رمزه"><div class="promo-results" aria-live="polite"></div></section>`;
 document.body.append(dialog);
 function drawEditorStage(){dialog.querySelector('.promo-editor-stage').innerHTML=stage(slides[editorSlide],catalog(),true)}
 function drawEditor() {
  const textOpen=dialog.querySelector('[data-editor="text"]').getAttribute('aria-expanded')==='true';
  const slide=slides[editorSlide];
  dialog.querySelector('.promo-editor-tabs').innerHTML=slides.map((s,i)=>'<button type="button" data-editor-slide="'+i+'" aria-pressed="'+(editorSlide===i)+'">الشريحة '+(i+1)+(s.enabled?'':' · مخفية')+'</button>').join('');
  drawEditorStage();
  dialog.querySelector('.promo-settings').innerHTML=`<div class="promo-text-controls">
  <label>لون الشريحة<select data-setting="palette">${PALETTES.map((p,i)=>'<option value="'+p+'" '+(p===slide.palette?'selected':'')+'>'+['لافندر','تركواز','برتقالي'][i]+'</option>').join('')}</select></label>
  <label class="promo-check"><input type="checkbox" data-setting="enabled" ${slide.enabled?'checked':''}>إظهار الشريحة</label>
  </div><div id="promo-copy-settings" class="promo-text-controls promo-copy-settings" ${textOpen?'':'hidden'}>
  ${[['title','العنوان'],['description','الوصف'],['cta','عبارة الزر']].map(([k,label])=>'<label>'+label+'<input data-setting="'+k+'" maxlength="'+(k==='cta'?24:60)+'" value="'+esc(slide[k])+'"></label>').join('')}
  ${[['size','حجم العنوان',14,20],['x','الموضع الأفقي',-8,8],['y','الموضع الرأسي',-12,12]].map(([k,label,min,max])=>'<label>'+label+'<input data-setting="'+k+'" type="range" min="'+min+'" max="'+max+'" value="'+slide[k]+'"></label>').join('')}</div>
  <div class="promo-slot-settings">${slide.slots.map((slot,i)=>{
   const p=catalog().find(p=>p.id===slot.id);
   return '<div><label><input type="checkbox" data-visible="'+i+'" '+(slot.visible?'checked':'')+'>اللوح '+(i+1)+'</label><span>'+esc(p?.name||(slot.id?'منتج مرتبط':'فارغ'))+'</span><button type="button" data-pick="'+i+'">'+(slot.id?'استبدال':'إضافة')+'</button>'+(slot.id?'<button type="button" data-remove="'+i+'">إزالة</button>':'')+'</div>'
  }).join('')}</div>`;
 }
 function persist() {
  try{localStorage.setItem(KEY,JSON.stringify(slides))}
  catch{dialog.querySelector('header p').textContent='تعذّر الحفظ في المتصفح. التعديلات متاحة في هذه الجلسة فقط.'}
  draw();
 }
 function renderResults() {
  if(pickedSlot<0)return;
  const q=dialog.querySelector('input[type="search"]').value.trim().toLocaleLowerCase();
  const matches=catalog().filter(p=>[p.name,p.sku,p.id].some(v=>String(v||'').toLocaleLowerCase().includes(q)));
  dialog.querySelector('.promo-results').innerHTML=(loading?'<p>جارٍ تحميل المنتجات المنشورة…</p>':failed?'<p>تعذّر تحميل الكتالوج المنشور. <button type="button" data-editor="retry">إعادة المحاولة</button></p>':'')+
  (matches.length?matches.slice(0,30).map(p=>'<button type="button" data-product="'+esc(p.id)+'">'+(p.img?'<img src="'+esc(p.img)+'" alt="">':'')+'<span><b>'+esc(p.name)+'</b><small>'+esc(p.sku||p.id)+' · '+esc(format(p.price))+'</small></span></button>').join(''):
   loading?'':q?'<p>لا توجد منتجات مطابقة.</p>':failed?'':'<p>لا توجد منتجات منشورة متاحة للربط حاليًا.</p>');
 }
 function closePicker(){pickedSlot=-1;dialog.querySelector('.promo-picker').hidden=true}
 dialog.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  const d=b.dataset;
  if(d.editor==='close')dialog.close();
  if(d.editor==='cancel-pick')closePicker();
  if(d.editor==='retry')void loadCatalog();
  if(d.editor==='replay')drawEditorStage();
  if(d.editor==='phone'){
   const phone=dialog.classList.toggle('promo-phone');
   b.setAttribute('aria-pressed',String(phone));
  }
  if(d.editorSlide!==undefined){editorSlide=Number(d.editorSlide);closePicker();drawEditor();dialog.querySelector('[data-editor-slide="'+editorSlide+'"]').focus()}
  if(d.editor==='text'){
   const panel=dialog.querySelector('#promo-copy-settings');
   panel.hidden=!panel.hidden;b.setAttribute('aria-expanded',String(!panel.hidden));
   if(!panel.hidden)panel.querySelector('input').focus();
  }
  if(d.pick!==undefined){
   pickedSlot=Number(d.pick);dialog.querySelector('.promo-picker').hidden=false;
   const search=dialog.querySelector('input[type="search"]');search.value='';search.focus();renderResults();void loadCatalog();
  }
  if(d.product&&pickedSlot>=0){
   slides[editorSlide].slots[pickedSlot].id=d.product;persist();closePicker();drawEditor();
  }
  if(d.remove!==undefined){slides[editorSlide].slots[Number(d.remove)].id='';persist();drawEditor()}
 });
 dialog.addEventListener('input',e=>{
  const el=e.target,k=el.dataset.setting,slide=slides[editorSlide];
  if(el.type==='search'){renderResults();return}
  if(el.dataset.visible!==undefined)slide.slots[Number(el.dataset.visible)].visible=el.checked;
  else if(k)slide[k]=el.type==='checkbox'?el.checked:el.type==='range'?Number(el.value):el.value;
  else return;
  persist();drawEditorStage();
  if(k==='enabled')dialog.querySelector('[data-editor-slide="'+editorSlide+'"]').textContent='الشريحة '+(editorSlide+1)+(el.checked?'':' · مخفية');
 });
 dialog.addEventListener('close',closePicker);
 function openEditor(){
  if(dialog.open)return;
  slides=read();drawEditor();if(inlineEditor)dialog.show();else dialog.showModal();void loadCatalog();
 }
 document.addEventListener('souq:open-promotion-editor',openEditor);
 if(inlineEditor){document.documentElement.classList.add('promo-admin-embed');openEditor()}
 document.addEventListener('visibilitychange',()=>{last=0});
 window.addEventListener('storage',e=>{
  if(e.key!==KEY)return;
  slides=read();draw();if(dialog.open)drawEditor();
  if(slides.some(s=>s.slots.some(slot=>slot.id)))void loadCatalog();
 });
 bindHost();
}
