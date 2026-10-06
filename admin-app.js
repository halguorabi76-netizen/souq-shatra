
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.57.0";
import {SUPABASE_URL,SUPABASE_ANON_KEY} from "./config.js";
import {createProductEditor,createCatalogAdmin,catalogAdmin,categoryDefinitions,specifications,inventoryVariants,selectedProduct,variantPrice,cartKey} from './product-variants.js?v=81';
import {createSellerWorkspace} from "./seller-workspace.js?v=85";
import {createActivityCenter,bellIcon} from "./activity-center.js?v=79";
import {renderAdminWorkspace} from "./admin-workspace.js?v=63";
import {createDriverWorkspace,driverContact} from "./delivery-workspace.js?v=58";
async function apiFetch(resource,init={}){
  const controller=new AbortController(),source=init.signal||resource?.signal;
  const abort=()=>controller.abort();
  if(source?.aborted)abort();else source?.addEventListener('abort',abort,{once:true});
  const token=window.SouqLoading?.begin();
  const timer=setTimeout(abort,20000);
  try{const response=await fetch(resource,{...init,signal:controller.signal});window.SouqLoading?.recovered?.();return response}
  catch(e){if(e?.name==='TypeError'||(e?.name==='AbortError'&&!source?.aborted))window.SouqLoading?.failed?.();throw e}
  finally{clearTimeout(timer);source?.removeEventListener('abort',abort);window.SouqLoading?.end(token)}
}
const accountSession=window.SouqAccountAccess?.createStorage(localStorage,sessionStorage,'sb-'+new URL(SUPABASE_URL).hostname.split('.')[0]+'-auth-token');
const db=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,storage:accountSession?.storage},global:{fetch:apiFetch}});
/* طبقة التخزين: حالياً في متصفح الجهاز. عند الانتقال لتطبيق حقيقي تُستبدل بقاعدة بيانات (Firebase / Supabase). */
const KEY='souq-shatra-online';
const local=(()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')||{}}catch{return {}}})();
let D={m:[],p:[],o:[],people:[],cart:Array.isArray(local.cart)?local.cart:[],me:null,comm:10,opin:'',cust:local.cust||{name:'',phone:'',addr:''}};
let user=null,profile=null,ownStore=null,refreshId=0,dataReady=false;
let productSaveBusy=false,storeSaveBusy=false;
let storeQuery='';
let driverAccount=null,driverProfile=null,deliverySettings={platform_fee:0,delivery_fee:0,qi_number:''},deliveryOffers=[],deliveryPayments=[];
function savedSellerView(storage,sessionKey){
 try{const session=JSON.parse(storage.getItem(sessionKey)||'null'),id=session?.user?.id;if(!/^[0-9a-f-]{36}$/i.test(id||''))return false;return storage.getItem('souq-shatra-mode-'+id)==='seller';}catch{return false;}
}
// Saved mode chooses only the initial layout; it grants no permissions.
const sellerResumeHint=(()=>{if(document.documentElement.dataset.portal)return false;try{return savedSellerView(localStorage,'sb-'+new URL(SUPABASE_URL).hostname.split('.')[0]+'-auth-token');}catch{return false;}})();

let viewMode=sellerResumeHint?'seller':'guest',geoPoint=null;
const rememberMode=mode=>{viewMode=mode;try{if(user&&mode!=='guest')localStorage.setItem('souq-shatra-mode-'+user.id,mode);else if(!user&&mode!=='guest')sessionStorage.setItem('souq-shatra-pending-role',mode)}catch{}};
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify({cart:D.cart,cust:D.cust}))}catch{toast('تعذّر حفظ السلة على هذا الجهاز')}};
const check=r=>{if(r.error)throw r.error;return r.data};
function withTimeout(promise,ms=12000){
  let timer;
  return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('انتهت مهلة الاتصال. تحقق من الإنترنت وأعد المحاولة.'),{name:'TimeoutError'})),ms)})]).finally(()=>clearTimeout(timer));
}
function error(e){if(e?.name==='TimeoutError'||e?.name==='TypeError')window.SouqLoading?.failed?.();if(e?.message?.includes('inventory changed')){toast('تغيّر مخزون هذا المنتج أثناء التعديل. أعد فتح المنتج لتحميل الكميات الجديدة ثم احفظ.');return;}if(e?.message?.includes('product unavailable')){toast('المنتج أو الكمية المطلوبة غير متوفرة حاليًا. عدّل الكمية وحاول مجددًا.');return;}if(e?.message?.includes('invalid quantity')){toast('اختر كمية صحيحة من ١ إلى ١٠٠ قطعة للطلب الواحد.');return;}if(e?.message?.includes('customer blocked by store')){toast('هذا الحساب محظور من الطلب في هذا المتجر. تواصل مع البائع.');return;}toast(e?.name==='AbortError'||e?.name==='TimeoutError'?'انتهت مهلة الاتصال. تحقق من الإنترنت وأعد المحاولة.':'تعذّر إكمال العملية: '+(e?.message||e))}
const STCODE=['new','accepted','delivery','delivered','cancelled'];
const fromOrder=o=>({id:o.id,mid:o.store_id,items:(o.order_items||[]).map(i=>({pid:i.product_id,name:i.product_name,price:i.price,q:i.quantity,vid:i.variant_id,variant_snapshot:i.variant_snapshot||{}})),total:o.total,st:Math.max(0,STCODE.indexOf(o.status)),ts:o.created_at,cust:{name:o.customer_name,phone:o.customer_phone,addr:o.address,note:o.note}});
async function refresh(){
  const id=++refreshId;
  // Keep the storefront visible while session and product requests finish.
  try{
  const session=check(await withTimeout(db.auth.getSession()));
  const nextUser=session.session?.user||null;
  if(id!==refreshId)return;
  // Restore the saved identity before querying the marketplace. A slow or failed
  // product/delivery request must never send a signed-in person back to welcome.
  if(user?.id!==nextUser?.id){profile=null;ownStore=null;viewMode='';dataReady=false}
  user=nextUser;
  if(user){
    if(!viewMode){
      try{viewMode=sessionStorage.getItem('souq-shatra-pending-role')||localStorage.getItem('souq-shatra-mode-'+user.id)||''}catch{}
      if(viewMode==='guest')viewMode='';
    }
    if(tab==='welcome'){
      tab=viewMode==='seller'||viewMode==='driver'?'account':'market';
      render();
    }
  }else if(viewMode!=='guest'){
    profile=null;ownStore=null;
    // Every device opens the storefront. Guests choose a role from the account menu.
    viewMode='guest';
    tab='market';
    render();
  }
  const [pr,ms]=await withTimeout(Promise.all([
    nextUser?db.from('profiles').select('*').eq('id',nextUser.id).single():Promise.resolve({data:null,error:null}),
    db.from('stores').select('*')
  ]));
  const nextProfile=check(pr),stores=check(ms);
  const approvedStore=nextUser&&!nextProfile?.disabled?stores.find(m=>m.owner_id===nextUser.id&&m.approved&&!m.removed):null;
  const sellerOnly=!!approvedStore&&nextProfile?.role!=='admin'&&!ADMIN_PORTAL;
  let productQuery=db.from('products').select('*').order('created_at',{ascending:false});
  let orderQuery=nextUser?db.from('orders').select('*,order_items(*)').order('created_at',{ascending:false}):Promise.resolve({data:[],error:null});
  let categoryQuery=db.from('seller_categories').select('store_id,name').eq('active',true).is('deleted_at',null);
  if(sellerOnly){productQuery=productQuery.eq('store_id',approvedStore.id);orderQuery=orderQuery.eq('store_id',approvedStore.id);categoryQuery=categoryQuery.eq('store_id',approvedStore.id);}
  const [ps,rs,cs]=await withTimeout(Promise.all([productQuery,orderQuery,categoryQuery]));
  const products=check(ps),orders=check(rs);
  const catalogResult=await withTimeout(db.from('catalog_categories').select('*').order('position'));D.catalog=check(catalogResult)||[];
  const variantResult=products.length?await withTimeout(db.from('product_variants').select('*').in('product_id',products.map(p=>p.id))):{data:[]};D.variants=check(variantResult)||[];
  D.stockMovements=nextUser&&(sellerOnly||nextProfile?.role==='admin')?check(await withTimeout(db.from('product_stock_movements').select('*').order('created_at',{ascending:false}).limit(200))):[];
  for(const c of D.catalog.filter(c=>!c.parent_id&&c.active))if(!CATS.includes(c.name))CATS.push(c.name);
  const people=nextProfile?.role==='admin'&&!nextProfile.disabled?check(await withTimeout(db.from('profiles').select('id,full_name,phone,role,disabled,created_at').order('created_at',{ascending:false}))):[];
  const dl=await withTimeout(Promise.all([
    db.from('delivery_settings').select('*').limit(1).maybeSingle(),
    nextUser?db.from('delivery_workers').select('*').eq('user_id',nextUser.id).maybeSingle():Promise.resolve({data:null}),
    nextUser?db.from('delivery_payments').select('*').order('created_at',{ascending:false}):Promise.resolve({data:[]}),
    nextProfile?.role==='admin'&&!nextProfile.disabled?db.from('delivery_workers').select('*').order('created_at',{ascending:false}):Promise.resolve({data:[]}),
    nextUser?db.from('driver_profiles').select('*').eq('user_id',nextUser.id).maybeSingle():Promise.resolve({data:null}),
    nextUser?db.rpc('assigned_delivery_contacts'):Promise.resolve({data:[]}),
    nextProfile?.role==='admin'&&!nextProfile.disabled?db.from('driver_profiles').select('*'):Promise.resolve({data:[]}),
    nextUser?db.from('store_pickups').select('*'):Promise.resolve({data:[]})
  ]));
  // An older deployment can load the rest of the market before the migration is installed.
  if(id!==refreshId)return;
  deliverySettings=dl[0].data||{platform_fee:0,delivery_fee:0,qi_number:''};
  driverAccount=dl[1].data||null;deliveryPayments=check(dl[2])||[];D.drivers=check(dl[3])||[];
  driverProfile=check(dl[4]);D.driverContacts=check(dl[5])||[];D.driverProfiles=check(dl[6])||[];D.pickups=check(dl[7])||[];
  if(nextUser&&driverAccount?.approved&&driverAccount.amount_due<driverAccount.debt_limit){
    const offers=await withTimeout(db.rpc('delivery_offer_details'));if(id!==refreshId)return;deliveryOffers=check(offers)||[];
  }else deliveryOffers=[];
  if(id!==refreshId)return;
  profile=nextProfile;
  D.publicCategories=check(cs);
  D.m=(sellerOnly?[approvedStore]:stores).map(m=>({id:m.id,name:m.name,phone:m.phone,address:m.address,store_kind:m.store_kind,pickup_address:(D.pickups||[]).find(x=>x.store_id===m.id)?.pickup_address,ok:m.approved,removed:m.removed,owner_id:m.owner_id,created_at:m.created_at,description:m.description,image_path:m.image_path||null,image_url:m.image_path?db.storage.from('products').getPublicUrl(m.image_path).data.publicUrl:'',appearance:m.storefront_settings||{}}));
  D.p=products.map(p=>({id:p.id,mid:p.store_id,name:p.name,desc:p.description,cat:p.category,price:p.price,compare_at_price:p.compare_at_price??null,stock:p.stock,img:p.image_path?db.storage.from('products').getPublicUrl(p.image_path).data.publicUrl:'',image_path:p.image_path,active:p.active,blocked:p.blocked,sku:p.sku||'',variant:p.variant||'',threshold:p.low_stock_threshold??5,created_at:p.created_at,store_category:p.store_category||'',catalog_category_id:p.catalog_category_id,attributes:p.attributes||{},has_variants:!!p.has_variants,legacy_stock_reserve:p.legacy_stock_reserve||0,variants:(D.variants||[]).filter(v=>v.product_id===p.id).map(v=>({...v,img:v.image_path?db.storage.from('products').getPublicUrl(v.image_path).data.publicUrl:''}))}));
  ownStore=user?D.m.find(m=>m.owner_id===user.id):null;
  let workspaceRow=null;
  if(ownStore&&canSell()){workspaceRow=check(await withTimeout(db.from('seller_workspace_settings').select('settings').eq('store_id',ownStore.id).maybeSingle()));}
  if(id!==refreshId)return;
  await workspace.load(workspaceRow?.settings,ownStore?.appearance,ownStore?.id||null);
  if(id!==refreshId)return;
  if(sellerOnly){rememberMode('seller');if(!dataReady||!['account','market','listings','myMarket','chats','settings','profilePage','postPage','orders'].includes(tab))tab='account';if(publicStoreId!==approvedStore.id)publicStoreId=null;}
  if(user&&!viewMode)viewMode=nextProfile?.role==='admin'?'buyer':ownStore?.ok&&!ownStore?.removed?'seller':nextProfile?.role==='driver'?'driver':'buyer';
  if(viewMode==='seller'&&!canSell())viewMode='buyer';
  if(user&&viewMode!=='guest'){rememberMode(viewMode);try{sessionStorage.removeItem('souq-shatra-pending-role')}catch{}}
  if(user&&viewMode&&tab==='welcome')tab=viewMode==='seller'||viewMode==='driver'?'account':'market';
  if(!user&&viewMode===''){viewMode='guest';tab='market'}
  D.me=profile?.role==='admin'?'owner':ownStore?.id||null;
  D.o=orders.map(o=>({...fromOrder(o),buyer_id:o.buyer_id,driver_id:o.driver_id,platform_fee:o.platform_fee||0,delivery_fee:o.delivery_fee||0}));
  D.people=people;
  dataReady=true;
  D.cart=D.cart.filter(x=>D.p.some(p=>p.id===x.pid));save();render();resumePurchaseAfterLogin();
  finishAccountEntry();
  }finally{if(id===refreshId)$('#loading').hidden=true}
}
async function act(f){const token=window.SouqLoading?.begin();try{await f()}catch(e){error(e)}finally{window.SouqLoading?.end(token)}}
const $=s=>document.querySelector(s),fmt=n=>(+n||0).toLocaleString('en-US')+' د.ع';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID();
const CATS=['مواد غذائية','خضار وفواكه','تمور','ملابس','أجهزة','منزلية','أخرى'],CI=['🛒','🥬','🌴','👕','📱','🏠','📦'];
const CP=['<path d="M4 9h20l-2 14H6L4 9Zm5-4v4m10-4v4M9 14h10m-9 5h8"/>','<path d="M16 25c-7-3-9-9-4-14 5 1 8 6 4 14Zm1-2c-2-9 3-15 11-16 1 8-3 14-11 16ZM6 10C5 6 8 4 11 5"/>','<path d="M16 27V10m0 3C10 11 7 9 5 5c6-1 10 1 11 5m0 3c4-5 8-7 12-7-1 5-5 8-12 9M11 27h10"/>','<path d="m10 5-6 4 3 6 3-2v14h12V13l3 2 3-6-6-4-4 4h-4l-4-4Z"/>','<rect x="9" y="3" width="14" height="26" rx="2"/><path d="M14 25h4M12 7h8"/>','<path d="m3 14 13-10 13 10M7 13v15h18V13M13 28v-9h6v9"/>','<path d="M4 10 16 4l12 6v16l-12 5-12-5V10Zm0 0 12 6 12-6M16 16v15"/>'];
const catIcon=i=>`<svg viewBox="0 0 32 32" aria-hidden="true">${CP[i]||CP[6]}</svg>`;
const ST=['جديد','قيد التجهيز','خرج للتوصيل','تم التسليم','ملغي'];
const mrec=id=>D.m.find(x=>x.id===id)||{};
const mname=id=>id==='owner'?(ownStore?.name||'سوق الشطرة'):mrec(id).name||'—';
const mok=id=>id==='owner'||!!mrec(id).ok&&!mrec(id).removed;
const thumb=p=>p.img&&(p.img.startsWith('data:image/')||p.img.startsWith('https://'))?`<img src="${esc(p.img)}" loading="lazy" decoding="async" alt="">`:CI[CATS.indexOf(p.cat)]||'📦';
const prod=id=>D.p.find(x=>x.id===id);
const sid=o=>'#'+o.id.slice(-4).toUpperCase();
const when=t=>new Date(t).toLocaleString('ar-IQ',{dateStyle:'medium',timeStyle:'short'});
let publicStoreId=new URLSearchParams(location.search).get('store');
if(!/^[0-9a-f-]{36}$/i.test(publicStoreId||''))publicStoreId=null;
const ADMIN_PORTAL=document.documentElement.dataset.portal==='admin';
let adminSearch='',adminFilter='all',adminDetail=null,checkoutNote='',cartReceipt=null;
const catalogParams=new URLSearchParams(location.search);
const catalogEntry=location.pathname.endsWith('/catalog.html');
let tab=publicStoreId?'market':catalogParams.get('view')==='stores'?'stores':catalogParams.get('view')==='materials'||catalogEntry?'catalog':'market',cat=catalogEntry?(catalogParams.get('category')||'all').slice(0,80):'all',q=catalogEntry?(catalogParams.get('q')||'').slice(0,200):'',dt='p',cur=null,infoRole='seller',adminTab='overview',bannerIndex=0;
const BANNERS=[['icons/shatra-river.jpeg','اكتشفوا سحر الشطرة'],['icons/shatra-square.jpeg','اكتشفوا أسواق الشطرة'],['icons/shatra-bridge.jpeg','الشطرة تجمعنا']];
const filt={min:'',max:'',sort:'newest',condition:'all',location:''};
if(catalogEntry){for(const k of ['min','max']){const v=catalogParams.get(k);if(v!==null&&v!==''&&Number.isFinite(+v)&&+v>=0)filt[k]=v}if(['newest','oldest','cheap','expensive'].includes(catalogParams.get('sort')))filt.sort=catalogParams.get('sort')}
const PURCHASE_RETURN_KEY=KEY+'-purchase-return';
function validPurchaseReturn(value){
 if(!value||!(/^[0-9a-f-]{36}$/i.test(value.pid||'')))return null;
 const n=Number(value.n);if(!Number.isInteger(n)||n<1||n>100)return null;
 const vid=value.vid==null||value.vid===''?null:value.vid;if(vid&&!/^[0-9a-f-]{36}$/i.test(vid))return null;
 return {pid:value.pid,vid,n,tab:['market','catalog','stores','cartPage'].includes(value.tab)?value.tab:'market',publicStoreId:/^[0-9a-f-]{36}$/i.test(value.publicStoreId||'')?value.publicStoreId:null,cat:String(value.cat||'all').slice(0,80),q:String(value.q||'').slice(0,200),filt:value.filt&&typeof value.filt==='object'?value.filt:{}};
}
function readPurchaseReturn(){
 const params=new URLSearchParams(location.search);
 if(params.has('resumeProduct'))return validPurchaseReturn({pid:params.get('resumeProduct'),vid:params.get('resumeVariant'),n:Number(params.get('resumeQuantity')||1),tab:catalogEntry?'catalog':'market',publicStoreId,cat,q,filt});
 try{return validPurchaseReturn(JSON.parse(sessionStorage.getItem(PURCHASE_RETURN_KEY)||'null'))}catch{return null}
}
let pendingPurchase=readPurchaseReturn();
function clearPurchaseReturn(){
 pendingPurchase=null;try{sessionStorage.removeItem(PURCHASE_RETURN_KEY)}catch{}
 const url=new URL(location.href);if(url.searchParams.has('resumeProduct')){for(const key of ['resumeProduct','resumeVariant','resumeQuantity'])url.searchParams.delete(key);history.replaceState(null,'',url)}
}
function purchaseAuthRedirect(){
 const url=new URL(location.href);url.hash='';
 if(pendingPurchase){url.searchParams.set('resumeProduct',pendingPurchase.pid);if(pendingPurchase.vid)url.searchParams.set('resumeVariant',pendingPurchase.vid);else url.searchParams.delete('resumeVariant');url.searchParams.set('resumeQuantity',pendingPurchase.n)}
 return url.href;
}
function requirePurchaseLogin(){
 if(user)return false;
 pendingPurchase=validPurchaseReturn({pid:cur.p.id,vid:cur.vid||null,n:cur.n,tab,publicStoreId,cat,q,filt:{...filt}});
 try{sessionStorage.setItem(PURCHASE_RETURN_KEY,JSON.stringify(pendingPurchase))}catch{}
 rememberMode('buyer');lsheet('m');return true;
}
function resumePurchaseAfterLogin(){
 if(!pendingPurchase||!user||!dataReady||ADMIN_PORTAL)return false;
 const destination=pendingPurchase;
 if(profile?.disabled||sellerAccount()){clearPurchaseReturn();A.close();toast(profile?.disabled?'هذا الحساب معطّل':'سجّل بحساب زبون لشراء المادة');return false}
 const p=prod(destination.pid);
 if(!p||!p.active||p.blocked||!mok(p.mid)){clearPurchaseReturn();A.close();toast('هذه المادة لم تعد متاحة للشراء');return false}
 tab=destination.tab;publicStoreId=destination.publicStoreId;cat=destination.cat;q=destination.q;Object.assign(filt,destination.filt);
 A.close();render();cur={p,n:destination.n,vid:destination.vid};
 if(p.has_variants&&!p.variants?.some(v=>v.id===cur.vid&&!v.archived))cur.vid=null;
 clearPurchaseReturn();psheet();return true;
}
function openCatalog(){const url=new URL('catalog.html',location.href);if(cat!=='all')url.searchParams.set('category',cat);if(q)url.searchParams.set('q',q);for(const k of ['min','max'])if(filt[k]!=='')url.searchParams.set(k,filt[k]);url.searchParams.set('sort',filt.sort);location.assign(url.href)}

function toast(t){const e=$('#toast');e.textContent=t;e.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>e.hidden=true,2600)}
const pageNav=window.SouqPageNavigation?.create()||null;
const backIcon='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 5 7 7-7 7M16 12H3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function trackPage(){if(!ADMIN_PORTAL&&!db.preview)pageNav?.track({tab,dt,publicStoreId,cat,q,filt:{...filt},url:location.href,scroll:window.scrollY||0},(user?.id||'guest')+':'+viewMode);}
function pageBackbar(){
 if(ADMIN_PORTAL||db.preview||!pageNav)return;
 document.body.dataset.mainPage=tab;
 document.querySelectorAll('.header-page-back').forEach(el=>el.remove());
 const view=$('#view'),root=viewMode==='seller'?'account':'market';
 const nativeBack=view.querySelector('[data-a="back"],[data-s="recordsBack"]');
 const atHome=!publicStoreId&&(tab===root||(viewMode==='seller'&&tab==='market'));
 const needed=!atHome;
 document.body.classList.toggle('has-page-back',!!needed);
 if(!needed)return;
 const bar=view.querySelector('.sw-sitebar')||$('.topline');
 if(!bar)return;
 const button=nativeBack||document.createElement('button');
 button.type='button';button.className='header-page-back '+(bar.classList.contains('sw-sitebar')?'sw-icon':'header-icon');
 if(!nativeBack)button.dataset.a='back';
 button.setAttribute('aria-label','الرجوع إلى الواجهة السابقة');button.title='رجوع';button.innerHTML=backIcon;
 bar.prepend(button);
}
function closePage(){
 if($('#sheet').classList.contains('auth-sheet')&&pendingPurchase)clearPurchaseReturn();
 window.SouqLocationPicker?.close();
 $('#shade').hidden=true;pageNav?.closeSheets();$('.app').inert=false;
}
function goBack(){
 if(!$('#shade').hidden){
  window.SouqLocationPicker?.close();
  const previous=pageNav?.backSheet();
  if(pendingPurchase&&$('#sheet').classList.contains('auth-sheet')&&!previous?.className?.includes('auth-sheet'))clearPurchaseReturn();
  if(previous){$('#sheet').replaceChildren(...previous.nodes);$('#sheet').className=previous.className;$('#shade').className=previous.shadeClass;cur=previous.cur;infoRole=previous.infoRole;$('#sheet').scrollTop=previous.scroll;$('#sheet [data-a="back"],#sheet [data-a="close"]')?.focus();return;}
  closePage();return;
 }
 captureCheckout();
 const previous=pageNav?.backRoute();
 if(previous){({tab,dt,publicStoreId,cat,q}=previous);Object.assign(filt,previous.filt);history.replaceState(null,'',previous.url);render();scrollTo(0,previous.scroll||0);return;}
 publicStoreId=null;tab=viewMode==='seller'?'account':'market';render();scrollTo(0,0);
}

function sheet(h){
 window.SouqLocationPicker?.close();
 const el=$('#sheet'),shade=$('#shade');
 if(!ADMIN_PORTAL&&!db.preview){const key=(h.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/)?.[1]||h.slice(0,80))+'|'+(cur?.p?.id||cur?.id||'');pageNav?.openSheet(key,shade.hidden?null:{nodes:Array.from(el.childNodes),className:el.className,shadeClass:shade.className,scroll:el.scrollTop,cur:cur?{...cur}:null,infoRole},{cur:cur?{...cur}:null,infoRole});$('.app').inert=true;}
 shade.classList.remove('auth-open');el.classList.remove('auth-sheet');el.innerHTML=h;shade.hidden=false;el.scrollTop=0;
 const c=$('#sheet [data-a="back"],#sheet [data-a="close"]');c&&c.focus();
}
const head=t=>`<div class="sh"><h2>${t}</h2><button class="x" data-a="${ADMIN_PORTAL?'close':'back'}" aria-label="${ADMIN_PORTAL?'إغلاق':'الرجوع إلى الواجهة السابقة'}">${ADMIN_PORTAL?'✕':backIcon}</button></div>`;
const val=id=>($('#'+id)||{}).value?.trim()||'';
const ask=(msg,act,v)=>sheet(head('تأكيد')+`<p>${msg}</p><button class="buy" data-a="${act}" data-v="${v}">نعم</button><button class="alt" data-a="${ADMIN_PORTAL?'close':'back'}">تراجع</button>`);

const sellerAccount=()=>!!user&&profile?.role!=='admin'&&!profile?.disabled&&!!(ownStore?.ok&&!ownStore?.removed);
function buyerAccountLogin(){if(db.preview){db.preview.selectRole('buyer');return}sheet(head('الدخول بحساب زبون')+'<p>هذا حساب متجرك. لتصفح السوق والشراء، سجّل الخروج وادخل بحساب زبون آخر.</p><button class="buy" data-a="loginBuyerAccount">تسجيل الخروج والدخول كزبون</button><button class="alt" data-a="close">البقاء في متجري</button>')}
const canSell=()=>!!user&&!profile?.disabled&&(profile?.role==='admin'||!!(ownStore?.ok&&!ownStore?.removed));

function confirmProductDelete(id,source){
 if(ADMIN_PORTAL){ask('حذف هذا المنتج؟','pdel2',id);return;}
 const trigger=source||Array.from(document.querySelectorAll('[data-a="pdel"]')).find(el=>el.dataset.v===id);
 const card=trigger?.closest('.sw-product,.item');
 if(!card){toast('افتح قائمة المنتجات لتأكيد حذف المنتج');return;}
 document.querySelectorAll('.product-delete-confirm').forEach(el=>el.remove());
 const panel=document.createElement('div');panel.className='product-delete-confirm';panel.setAttribute('role','group');panel.setAttribute('aria-label','تأكيد حذف المنتج');
 panel.innerHTML='<p>هل تريد حذف هذا المنتج؟</p><div><button type="button" data-a="pdel2" data-v="'+esc(id)+'">حذف</button><button type="button" data-a="cancelProductDelete">تراجع</button></div>';
 card.append(panel);panel.querySelector('[data-a="cancelProductDelete"]')?.focus();
}

function buyerEntry(){
 sessionStorage.removeItem('souq-role-request');sessionStorage.removeItem('souq-role-login');sessionStorage.removeItem('souq-seller-onboarding');
 closeAccountMenu();accountSession?.choose('device');rememberMode('buyer');
 if(user){tab='market';A.close();render();return}
 lsheet('m');
}
function roleAccess(role){
 clearPurchaseReturn();closeAccountMenu();const seller=role==='seller',name=seller?'بائع':'عامل توصيل',request=seller?'اطلب الانضمام كتاجر':'اطلب الانضمام كسائق توصيل';
 sheet(head('الدخول ك'+name)+`<p>هل لديك حساب في سوق الشطرة؟</p><button class="buy" data-a="roleExisting" data-v="${role}">نعم، لدي حساب</button><p class="auth-switch">ليس لديك حساب؟ <button data-a="roleRequest" data-v="${role}">${request}</button></p>`);
}
async function existingRole(role){
 if(!['seller','driver'].includes(role))return;
 if(user&&((role==='seller'&&canSell())||(role==='driver'&&driverAccount))){rememberMode(role);tab='account';A.close();render();return}
 if(user){check(await db.auth.signOut());user=null;profile=null;ownStore=null;driverAccount=null;driverProfile=null;dataReady=false;D.o=[];D.cart=[];save()}
 accountSession?.choose('device');sessionStorage.removeItem('souq-role-request');sessionStorage.setItem('souq-role-login',role);rememberMode(role);lsheet('m');
}
function requestRole(role){
 if(!['seller','driver'].includes(role))return;
 sessionStorage.removeItem('souq-role-login');
 if(user){if(role==='seller')sellerRequest();else{rememberMode('driver');driverWorkspace.application()}return}
 accountSession?.choose('device');sessionStorage.setItem('souq-role-request',role);rememberMode(role);lsheet('r');
}
function finishAccountEntry(){
 if(!user||ADMIN_PORTAL)return;
 let request='',role='';try{request=sessionStorage.getItem('souq-role-request')||'';role=sessionStorage.getItem('souq-role-login')||'';if(sessionStorage.getItem('souq-seller-onboarding')==='1')request='seller';sessionStorage.removeItem('souq-role-request');sessionStorage.removeItem('souq-role-login');sessionStorage.removeItem('souq-seller-onboarding')}catch{}
 if(request==='seller'){sellerRequest();return}
 if(request==='driver'){rememberMode('driver');driverWorkspace.application();return}
 if(!['seller','driver'].includes(role))return;
 const exists=role==='seller'?!!ownStore:!!driverAccount;
 if(exists){if(role==='seller'&&!canSell())sellerRequest();else{rememberMode(role);tab='account';render()}return}
 sheet(head('هذا الحساب غير مسجّل '+(role==='seller'?'كتاجر':'كسائق توصيل'))+`<p>استخدم بريدك أو حساب Google المرتبط بحسابك القديم، أو أرسل طلب انضمام بهذا الحساب.</p><button class="buy" data-a="roleRequest" data-v="${role}">${role==='seller'?'طلب الانضمام كتاجر':'طلب الانضمام كسائق توصيل'}</button><button class="alt" data-a="roleExisting" data-v="${role}">الدخول بحساب آخر</button>`);
}
function sellerRequest(){
 if(db.preview){db.preview.selectRole('seller');return}
 closeAccountMenu();
 if(user&&canSell()&&ownStore){rememberMode('seller');tab='account';render();return}
 if(!user){requestRole('seller');return}
 tab='sellerJoin';render();scrollTo(0,0);
}
function storeLocationFields(prefix,m){
 const kind=m?.store_kind||'',address=m?.pickup_address||m?.address||'',id=prefix==='join'?'joinAddress':'editStoreAddress';
 return `<label for="${prefix}StoreKind">نوع المتجر</label><select id="${prefix}StoreKind" required data-location="${prefix}"><option value="">اختر نوع المتجر</option><option value="physical" ${kind==='physical'?'selected':''}>متجر واقعي / محل</option><option value="online" ${kind==='online'?'selected':''}>متجر إلكتروني</option></select><label id="${prefix}LocationLabel" for="${id}">${kind==='online'?'عنوان استلام البضاعة للسائق':'عنوان المحل أو المتجر'}</label><input id="${id}" required maxlength="500" autocomplete="street-address" value="${esc(address)}"><p class="op-location-note" id="${prefix}LocationNote">${kind==='online'?'عنوان الاستلام خاص بك وبالسائق المكلّف، ولا يظهر للزبائن.':'اكتب المدينة والحي وأقرب نقطة دالة. عنوان المحل يظهر للزبائن ولسائق التوصيل.'}</p>`;
}
function sellerJoinPage(){
 if(!user){sellerRequest();return}
 const names=(profile?.full_name||'').trim().split(/\s+/),first=names.shift()||'',last=names.join(' '),pending=ownStore&&!ownStore.ok&&!ownStore.removed;
 $('#view').innerHTML=`<div class="box"><button class="profile-link" data-a="tab" data-v="market">سوق الشطرة · الرئيسية</button><h1>${pending?'طلبك بانتظار موافقة الإدارة':'طلب الانضمام كتاجر'}</h1><p>${pending?'وصل طلبك إلى المدير. يمكنك تحديث بياناته أدناه، وستفتح أدوات متجرك بعد الموافقة.':'أكمل البيانات لتصل إلى لوحة المدير. لا يُفعّل المتجر قبل الموافقة.'}</p><p dir="ltr">${esc(user.email||'')}</p><form id="sellerJoinForm"><label for="sellerFirst">الاسم الأول</label><input id="sellerFirst" required maxlength="80" autocomplete="given-name" value="${esc(first)}"><label for="sellerLast">اسم العائلة</label><input id="sellerLast" required maxlength="80" autocomplete="family-name" value="${esc(last)}"><label for="joinStoreName">اسم المتجر</label><input id="joinStoreName" required maxlength="100" value="${esc(ownStore?.name||'')}"><label for="joinPhone">رقم الهاتف</label><input id="joinPhone" type="tel" required inputmode="tel" autocomplete="tel" value="${esc(ownStore?.phone||profile?.phone||'')}">${storeLocationFields('join',ownStore)}<label for="joinDescription">نبذة عن نشاط المتجر</label><textarea id="joinDescription" maxlength="1000">${esc(ownStore?.description||'')}</textarea><button class="buy" type="submit" data-a="submitSellerJoin">${pending?'تحديث بيانات الطلب':'إرسال الطلب إلى الإدارة'}</button></form></div>`;
 $('#sellerJoinForm').addEventListener('submit',e=>{e.preventDefault();A.submitSellerJoin()});
}
/* ===== الواجهات ===== */
function sellerResume(){
 document.body.classList.add('seller-workspace');
 document.body.classList.remove('welcome-mode','profile-mode','buyer-cart-mode');
 $('.tabs').hidden=true;
 $('#view').innerHTML='<div class="sw-sitebar seller-session-brand" aria-label="سوق الشطرة"><span></span><span class="sw-sitebrand"><img src="icons/brand-aurora-v69.png" alt=""><b>سوق الشطرة</b></span></div>';
}

function render(){
  trackPage();
  if(document.documentElement)delete document.documentElement.dataset.sellerResume;
  activity.sync();
  if(db.preview?.isHome()){db.preview.home();return;}
  if(ADMIN_PORTAL){renderAdminPortal();return}
  if(pendingPurchase&&!dataReady&&!db.preview){$('.tabs').hidden=true;$('#view').innerHTML='<div class="empty" role="status">جارٍ العودة إلى المادة…</div>';return}
  try{if(user&&sessionStorage.getItem('souq-admin-return')==='1'){sessionStorage.removeItem('souq-admin-return');location.replace('admin.html');return}}catch{}
  // Public browsing must not wait for account, delivery or workspace requests.
  // Private actions still use the existing account checks and database policies.
  if(!dataReady&&viewMode==='seller'&&!db.preview&&!publicStoreId){sellerResume();return}
  if(sellerAccount())viewMode='seller';
  if(dataReady&&viewMode==='seller'&&!canSell())viewMode='buyer';
  if(canSell()&&viewMode==='seller'&&ownStore){if(publicStoreId&&publicStoreId!==ownStore.id)publicStoreId=null;if(!['account','market','listings','myMarket','chats','settings','profilePage','postPage','orders'].includes(tab))tab='account';}
  window.SouqTheme.set(window.SouqTheme.get(),false);
  document.body.classList.toggle('demo-mode',!!window.SouqDemo?.isActive());
  if(window.SouqDemo?.isActive()){document.body.classList.remove('seller-workspace','seller-storefront');document.getElementById('sellerNav')?.remove();}
  if(window.SouqDemo?.isActive()){window.SouqDemo.render();return}
  closeAccountMenu();
  document.body.classList.remove('welcome-mode','profile-mode');document.body.classList.toggle('buyer-cart-mode',tab==='cartPage');const searchInput=$('#q');if(searchInput&&searchInput.value!==q)searchInput.value=q;
  if(publicStoreId&&tab==='market'){workspace.storefront(publicStoreId);pageBackbar();return;}
  if(workspace.render(tab)){activity.sync();pageBackbar();return;}
  const n=D.cart.reduce((s,c)=>s+c.q,0);
  document.body.classList.toggle('welcome-mode',tab==='welcome');
  document.body.classList.toggle('profile-mode',tab==='profilePage');
  $('.tabs').hidden=tab==='welcome';
  const sellerView=canSell()&&viewMode==='seller';
  const marketButton=$('.tabs [data-v="myMarket"]');marketButton.innerHTML=`<span class="navicon">${sellerView?'▤':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 3h3l3 13h11l3-9H6M9 20h.01M18 20h.01" stroke-linecap="round" stroke-linejoin="round"/></svg>' }</span>${sellerView?'إعلاناتي':'السلة'}<i id="cc" hidden></i>`;
  const roleNav=$('.tabs [data-v="chats"]');roleNav.innerHTML=viewMode==='driver'?'<span class="navicon">▣</span>التوصيل':'<span class="navicon">▣</span>الطلبات';
  const badge=$('#cc');badge.textContent=n;badge.hidden=!n;
  document.querySelectorAll('.tabs button').forEach(b=>b.dataset.v===(['account','profilePage','settings'].includes(tab)?'settings':tab==='cartPage'?'myMarket':tab)?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current'));
  ({welcome,market,catalog:market,stores:storesPage,orders,account,chats,listings,admin,categories,myMarket,cartPage:csheet,searchPage,postPage,settings,profilePage,sellerJoin:sellerJoinPage})[tab]();
  if(viewMode==='seller'&&canSell()&&ownStore)($('#view .sw-shell')||$('#view')).insertAdjacentHTML('afterbegin',workspace.chrome());
  activity.sync();pageBackbar();
}
function welcome(){
  $('#view').innerHTML=`<div class="welcome"><div class="welcome-content"><h1>أهلًا بك في سوق الشطرة</h1><p>اختر دورك مرة واحدة، ويمكنك شراء المنتجات من أي حساب</p>${bannerHtml()}<div class="welcome-roles"><button class="welcome-option" data-a="enter" data-v="buyer" aria-label="الدخول كزبون"><span class="symbol"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="15" r="7" fill="#F0C3A5"/><path d="M26 12q6-9 13 0v4H26Z" fill="#443a31"/><path d="M23 26q8-8 18 0l4 17H19Z" fill="#b49f8e"/><path d="M20 29l-5 11m29-11 5 11"/><path d="M9 38h46l-6 16H15Z" fill="#b69070"/><path d="M17 38l4 16m8-16 1 16m8-16-1 16m10-16-4 16M14 47h36" stroke="#48392d"/><path d="M24 35l4 5m12-5-4 5"/></svg></span><strong>زبون</strong></button><button class="welcome-option" data-a="enter" data-v="seller" aria-label="الدخول كبائع"><span class="symbol"><svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="35" width="48" height="19" rx="2" fill="#8e7057"/><rect x="12" y="39" width="40" height="9" rx="1" fill="#e5d5c7"/><rect x="18" y="27" width="26" height="8" rx="1" fill="#8BB8A4"/><rect x="21" y="15" width="23" height="14" rx="2" fill="#e5d5c7"/><rect x="25" y="18" width="15" height="8" fill="#A4CFB8"/><path d="M26 33h12m-30 2h48M21 44h8m6 0h8M9 55h46"/><rect x="8" y="16" width="10" height="15" rx="1" fill="#F2DAB4"/><path d="M11 20h4m-4 4h4"/></svg></span><strong>بائع</strong></button><button class="welcome-option" data-a="enter" data-v="driver" aria-label="الدخول كعامل توصيل"><span class="symbol"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="17" cy="49" r="8" fill="#efeae5"/><circle cx="49" cy="49" r="8" fill="#efeae5"/><circle cx="17" cy="49" r="3" fill="#866c56"/><circle cx="49" cy="49" r="3" fill="#866c56"/><path d="M17 49l9-17h17l6 17H17Zm9-17 11 17m-1-17 7 17M12 32h15" fill="#c8b2a0"/><rect x="6" y="24" width="16" height="14" rx="2" fill="#D99A5E"/><path d="M6 29h16m-8-5v14"/><circle cx="38" cy="17" r="6" fill="#EFC4A9"/><path d="M31 15q1-9 11-6l2 7Z" fill="#453b33"/><path d="M33 24l-7 9 12 4 7-13-7-3Z" fill="#ae9580"/><path d="M38 37l6 10m-16-14-6 13"/></svg></span><strong>عامل توصيل</strong></button></div></div><button class="welcome-guest" data-a="enter" data-v="guest"><span>الدخول كضيف دون تسجيل</span></button></div>`;
}
function profilePage(){
 if(canSell()&&viewMode==='seller'&&ownStore){$('#view').innerHTML=`<div class="sw-shell"><section class="sw-card"><h1>حساب متجري</h1><h2>${esc(ownStore.name)}</h2><p>${esc(profile?.full_name||'')}</p><p dir="ltr">${esc(user.email||'')}</p><p>رقم الحساب: <span dir="ltr">${esc(user.id)}</span></p><p dir="ltr">${esc(profile?.phone||ownStore.phone||'')}</p><p>${esc(ownStore.address||'')}</p><div class="sw-actions"><button data-a="editprofile">تعديل بيانات حسابي</button><button data-a="storeEdit">تعديل معلومات المتجر</button><button data-a="editEmail">تغيير البريد الإلكتروني</button></div></section><section class="sw-card"><button class="sw-primary" data-a="tab" data-v="account">العودة إلى إدارة متجري</button><button data-a="switchrole" data-v="buyer">الدخول بحساب زبون</button><button data-a="changeaccount">تسجيل الخروج</button></section></div>`;return}
 if(!user){$('#view').innerHTML='<div class="box"><h2>حساب سوق الشطرة</h2><p>تستطيع تصفح السوق كضيف. سجّل الدخول للشراء أو البيع أو العمل بالتوصيل.</p><button class="buy" data-a="enter" data-v="buyer">الدخول كزبون</button><button class="alt" data-a="enter" data-v="seller">بائع</button><button class="alt" data-a="enter" data-v="driver">الدخول كعامل توصيل</button></div>';return}
 const name=profile?.full_name||user.user_metadata?.full_name||'مستخدم سوق الشطرة';
 const mine=D.o.filter(o=>o.buyer_id===user.id),completed=mine.filter(o=>o.st===3),last=mine.length?new Date(mine[0].ts).toLocaleDateString('ar-IQ'):'';
 let address='',avatar='';try{address=localStorage.getItem('souq-shatra-address-'+user.id)||'';avatar=localStorage.getItem('souq-shatra-avatar-'+user.id)||''}catch{}
 let location=null;try{const saved=JSON.parse(localStorage.getItem('souq-shatra-location-'+user.id)||'null');if(saved&&Number.isFinite(+saved.lat)&&Number.isFinite(+saved.lon))location=saved}catch{}
 $('#view').innerHTML=`<div class="profile-page"><section class="profile-card profile-hero"><div class="profile-photo"><div class="portrait" aria-label="صورة الحساب">${avatar.startsWith('data:image/jpeg;base64,')?`<img src="${avatar}" alt="صورة الحساب">`:esc(name.trim().slice(0,1))}</div><button data-a="chooseAvatar" aria-label="إضافة صورة للحساب">✎</button><input id="avatarInput" type="file" accept="image/*" hidden></div><div><b>${esc(name)}</b><small>${esc(user.email||'')}</small></div></section><section class="profile-card"><div class="profile-heading"><h2>بيانات الحساب الأساسية</h2><button class="profile-edit" data-a="editprofile" aria-label="تعديل بيانات الحساب">✎</button></div><div class="profile-detail"><span class="picon">♙</span><span>${esc(name)}</span></div><div class="profile-detail"><span class="picon">☎</span><button class="buyer-phone-action" data-a="editCustomerPhone" ${profile?.phone?'dir="ltr"':''}>${esc(profile?.phone||'أضف رقم هاتفك')}</button></div><div class="profile-detail"><span class="picon">✉</span><span dir="ltr">${esc(user.email||'')}</span></div></section><div class="profile-pair"><section class="profile-card"><h3>ملخص الطلبات</h3><p>${completed.length} طلب مكتمل</p><small>${last?'آخر طلب: '+esc(last):'لم تطلب بعد'}</small><button class="profile-action" data-a="tab" data-v="orders">عرض طلباتي</button></section><section class="profile-card"><h3>عنوان التوصيل</h3><p>${address?esc(address):'لم تُضف عنوانًا بعد'}</p><div class="profile-address-actions"><button class="profile-action" data-a="editaddress">${address?'تعديل العنوان':'إضافة عنوان'}</button><button class="profile-gps" data-a="saveProfileLocation" aria-label="تحديد موقعي عبر GPS" title="تحديد موقعي عبر GPS">📍</button></div><small class="profile-location-status">${location?'الموقع محفوظ ويمكن مشاركته عند الطلب':'اضغط علامة الموقع لتحديد مكانك'}</small></section></div><section class="profile-card"><button class="profile-link" data-a="tab" data-v="orders">♧ طلباتي <span>‹</span></button><button class="profile-link" data-a="paymentinfo">▣ طريقة الدفع <span>‹</span></button><button class="profile-link" data-a="editaddress">⌖ عنواني <span>‹</span></button><button class="profile-link" data-a="editEmail">✉ تغيير البريد الإلكتروني <span>‹</span></button></section><section class="profile-card"><h3>استخدام الحساب</h3><div class="profile-role-actions"><button data-a="profileSwitch" data-v="buyer" aria-pressed="${viewMode==='buyer'}">🛒 الدخول كزبون</button><button data-a="profileSwitch" data-v="seller" aria-pressed="${viewMode==='seller'}">${canSell()?'▤ إدارة متجري':'طلب الانضمام كبائع'}</button></div><p class="note">${sellerAccount()?'حسابك مخصص لإدارة متجرك. للشراء ادخل بحساب زبون آخر.':'تُفتح أدوات البيع بعد اعتماد الإدارة لمتجرك.'}</p></section><button class="profile-logout" data-a="changeaccount">تسجيل الخروج من الحساب</button></div>`;
}
function settings(){
 $('#view').innerHTML=`<div class="section-title"><h2>الإعدادات</h2></div><section class="box" aria-labelledby="appearanceTitle"><h2 id="appearanceTitle">مظهر التطبيق</h2><p>اختر الوضع الذي يناسبك</p><div class="theme-options" role="group" aria-label="مظهر التطبيق"><button data-a="theme" data-v="light" aria-pressed="${window.SouqTheme.get()==='light'}">☀ الوضع الفاتح</button><button data-a="theme" data-v="dark" aria-pressed="${window.SouqTheme.get()==='dark'}">☾ الوضع الغامق</button></div></section><div class="box"><button class="setting-row" data-a="tab" data-v="account">حسابي وإدارة نشاطي</button><button class="setting-row" data-a="tab" data-v="profilePage"><span class="avatar"><svg viewBox="0 0 32 32" width="25" height="25" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="16" cy="10" r="5"/><path d="M5 28v-3c0-5 4-9 11-9s11 4 11 9v3"/></svg></span>ملفي الشخصي ومعلوماتي</button>${ownStore&&viewMode==='seller'?'<button class="setting-row" data-a="tab" data-v="listings">إعلاناتي ومنتجاتي</button>':''}<button class="setting-row" data-a="tab" data-v="orders">طلباتي</button><button class="setting-row" data-a="tab" data-v="market">الإعلانات والمنتجات الجديدة</button><button class="setting-row" data-a="info">شرح التطبيق والأسئلة الشائعة</button><button class="setting-row" data-demo="open">لوحة التجربة</button><button class="setting-row" data-a="support">تواصل مع الدعم</button></div>`;
}
function supportSheet(){sheet(head('تواصل مع الدعم')+`<p>مصمم ومبرمج تقني لتطبيق سوق الشطرة.</p><p><a href="https://wa.me/9647837271707" target="_blank" rel="noopener noreferrer">واتساب: 07837271707</a></p><p><a href="https://www.instagram.com/haider.alguorabi?stkn=Nzd2eTluem9oNnNr" target="_blank" rel="noopener noreferrer">حساب إنستغرام</a></p>`)}

function bannerHtml(){const [src,caption]=BANNERS[bannerIndex];return `<div class="banner-wrap"><div class="banner" aria-label="صور الشطرة؛ اسحب للتنقل بين الصور"><img src="${src}" alt="مشهد من مدينة الشطرة" decoding="async" draggable="false"><span class="banner-caption">${caption}</span></div><div class="banner-dots" aria-label="صور الشطرة">${BANNERS.map((_,i)=>`<button data-a="banner" data-v="${i}" aria-label="الصورة ${i+1}" aria-current="${i===bannerIndex}"></button>`).join('')}</div></div>`}
function categories(){
  $('#view').innerHTML=`<div class="section-title"><h2>الأقسام</h2></div><div class="category-cards" style="flex-wrap:wrap;justify-content:center">${CATS.map((c,i)=>`<button class="category-card" data-a="pickcat" data-v="${c}"><span aria-hidden="true">${catIcon(i)}</span>${c}</button>`).join('')}</div>`;
}
function myMarket(){
  if(canSell()&&viewMode==='seller'){listings();return}
  $('#view').innerHTML='<div class="section-title"><h2>سوقي</h2></div><div class="market-section"><h2>تسوّقك</h2><button data-a="cart">🛒 السلة · '+D.cart.reduce((s,c)=>s+c.q,0)+' منتج</button></div>';
}
function postPage(){
  if(!canSell()){sellerRequest();tab='settings';settings();return}
  const p=cur?.id?prod(cur.id):null;
  const field=(id,label,value,type='text',extra='')=>`<div class="pe-field"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(value??'')}" ${extra}></div>`;
  $('#view').innerHTML=`<div class="sw-shell pe-shell"><header class="pe-header"><button type="button" data-a="tab" data-v="listings" aria-label="العودة إلى المنتجات">${authIcon('back')}</button><h1>${p?'تعديل المنتج':'إضافة منتج'}</h1><span></span></header><form id="productCreateForm" class="pe-form">
  <section class="post-card pe-basic">
  ${field('fn','اسم المنتج <span class="pe-required">*</span>',p?.name,'text','required minlength="2" maxlength="200" autocomplete="off"')}
  ${field('fsku','رمز المنتج / الباركود',p?.sku,'text','maxlength="80"')}
  <div class="pe-field"><label for="fd">الوصف</label><textarea id="fd" rows="4" maxlength="5000">${esc(p?.desc||'')}</textarea></div>
  ${field('fpr','سعر البيع (د.ع) <span class="pe-required">*</span>',p?.price,'number','required min="1" max="2147483647" step="1" inputmode="numeric"')}
  ${field('fcost','سعر التكلفة (د.ع)',workspace.productCost(p?.id),'number','min="0" max="2147483647" step="1" inputmode="numeric"')}
  <p class="pe-note">سعر التكلفة خاص بك ولا يظهر للزبون.</p>
  </section>
  <section class="post-card" id="variantEditor"></section>
  <section class="post-card">
  ${field('fcCustom','المجموعة داخل متجرك',p?.store_category,'text','maxlength="80" list="sellerGroupNames" placeholder="اختر أو اكتب مجموعة"')}
  <datalist id="sellerGroupNames">${workspace.categoryNames().map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
  ${field('fs','الكمية <span class="pe-required">*</span>',p?.stock??0,'number','required min="0" max="2147483647" step="1" inputmode="numeric"')}
  <p class="pe-note">المخزون يظهر لك فقط. لكل نسخة كمية مستقلة عند تفعيل الفاريانت.</p>
  <label for="factive">متاح في السوق</label><select id="factive"><option value="true" ${p?.active!==false?'selected':''}>متاح — منشور</option><option value="false" ${p?.active===false?'selected':''}>غير متاح — مسودة</option></select>
  <details class="pe-discount" ${p?.compare_at_price?'open':''}><summary>تخفيض على المنتج</summary>
  ${field('fcompare','السعر قبل التخفيض (د.ع)',p?.compare_at_price,'number','min="1" max="2147483647" step="1" inputmode="numeric"')}
  <p class="pe-note">أدخل السعر القديم وسعر البيع الحالي لعرض التخفيض. اترك السعر القديم فارغًا لإلغائه.</p></details>
  <details class="pe-advanced"><summary>إعدادات المخزون</summary>
  ${field('fthreshold','تنبيه المخزون عند الكمية',p?.threshold??5,'number','min="0" max="2147483647" step="1"')}
  ${p?.variant?field('fvariant','وصف الخيار القديم',p.variant,'text','maxlength="120"'):''}</details>
  </section>
  <section class="post-card pe-images"><h2>الصور</h2><label class="pe-upload" for="pimg">${authIcon('image')}<span>إضافة صورة</span></label><input id="pimg" class="pe-file" type="file" accept="image/*"><div class="tile" id="pv">${p?thumb(p):'📷'}</div><p class="pe-note">صورة رئيسية للمنتج، ويمكن إضافة صورة لكل نسخة.</p></section>
  <footer class="post-actions pe-actions"><button class="buy" type="submit" data-a="psave">${p?'حفظ التعديلات':'إنشاء'}</button><button class="alt" type="button" data-a="tab" data-v="listings">إلغاء</button></footer></form></div>`;
  $('#productCreateForm').addEventListener('submit',e=>{e.preventDefault();A.psave()});
  productEditor.mount($('#variantEditor'),p);
  updatePostProgress();
}
function updatePostProgress(){const bar=$('#post-progress');if(!bar)return;const fields=['fn','fpr','fs','fd'].map(id=>val(id)),image=cur?.img||cur?.id&&prod(cur.id)?.img;bar.style.width=Math.round((fields.filter(Boolean).length+(image?1:0))/5*100)+'%'}
function searchPage(){
  $('#view').innerHTML=`<div class="search-page"><h2>البحث عن منتج أو متجر</h2><p class="note">اكتب في حقل البحث أعلى الصفحة، ثم عدّل خيارات البحث هنا.</p><div class="filter-group"><h3>القسم</h3><div class="filter-chips">${['all',...CATS].map(c=>`<button data-a="searchcat" data-v="${c}" aria-pressed="${cat===c}">${c==='all'?'الكل':c}</button>`).join('')}</div></div><div class="filter-group"><h3>الموقع</h3><select disabled aria-label="اختر المحافظة"><option>اختر المحافظة</option></select><p class="note">سيعمل هذا الخيار بعد إضافة موقع الإعلان.</p></div><div class="filter-group"><h3>السعر (د.ع)</h3><div class="filter-range"><label>من<input id="fmin" type="number" inputmode="numeric" min="0" placeholder="0" value="${esc(filt.min)}"></label><label>إلى<input id="fmax" type="number" inputmode="numeric" min="0" placeholder="بدون حد" value="${esc(filt.max)}"></label></div></div><div class="filter-group"><h3>الحالة</h3><div class="filter-chips"><button disabled>الكل</button><button disabled>جديد</button><button disabled>مستعمل</button></div><p class="note">سيعمل هذا الخيار بعد إضافة حالة المنتج إلى الإعلان.</p></div><div class="filter-group"><h3>الترتيب</h3><div class="filter-chips">${[['newest','الأحدث'],['oldest','الأقدم'],['cheap','السعر الأقل'],['expensive','السعر الأعلى']].map(([v,t])=>`<button data-a="searchsort" data-v="${v}" aria-pressed="${filt.sort===v}">${t}</button>`).join('')}</div></div><div class="filter-actions"><button class="buy" data-a="searchapply">عرض النتائج</button><button class="alt" data-a="searchclear">حذف الفلاتر</button></div></div>`;
}
function renderAdminPortal(){
 document.body.classList.add('admin-portal');
 document.body.classList.remove('seller-workspace','seller-storefront','demo-mode','welcome-mode','profile-mode');
 document.getElementById('sellerNav')?.remove();
 $('.tabs').hidden=true;
 if(!document.getElementById('adminTop')){
 const header=document.createElement('header');header.id='adminTop';
 header.innerHTML='<a href="index.html" class="admin-brand">سوق الشطرة <small>لوحة الإدارة</small></a><div><a href="admin.html?section=preview" class="admin-tool-link">⌕ المعاينة</a><a href="index.html">فتح الموقع</a><button data-a="toggleTheme">تغيير المظهر</button><button data-a="out">تسجيل الخروج</button></div>';
 $('#view').before(header);
 }
 $('#adminTop [data-a="out"]').hidden=!user;
 window.SouqTheme.set(window.SouqTheme.get(),false);
 if(!dataReady){$('#view').innerHTML='<div class="admin-gate"><h1>لوحة إدارة سوق الشطرة</h1><p>جارٍ التحقق من حسابك…</p></div>';return}
 if(!user){$('#view').innerHTML='<div class="admin-gate"><span class="admin-gate-mark">S</span><h1>لوحة إدارة سوق الشطرة</h1><p>سجّل الدخول بحساب المدير لمراجعة التجار وإدارة الموقع.</p><button class="buy" data-a="login" data-v="m">تسجيل الدخول</button><a href="index.html">العودة إلى السوق</a></div>';return}
 if(profile?.role!=='admin'||profile?.disabled){$('#view').innerHTML='<div class="admin-gate"><h1>هذا الحساب لا يملك صلاحية الإدارة</h1><p>استخدم حساب المدير المعتمد.</p><button class="buy" data-a="out">تبديل الحساب</button><a href="index.html">العودة إلى السوق</a></div>';return}
 tab='admin';admin();
}

function admin(){
 if(!ADMIN_PORTAL){location.assign('admin.html');return}
 if(profile?.disabled||profile?.role!=='admin')return;
 $('#view').innerHTML=renderAdminWorkspace({data:D,esc,fmt,when,sid,status:ST,storeName:mname,payments:deliveryPayments,settings:deliverySettings,catalog:()=>catalogAdmin(D.catalog||[]),inventoryVariants:p=>inventoryVariants(p,fmt),state:{tab:adminTab,search:adminSearch,filter:adminFilter,detail:adminDetail}});
 $('#adminAccountSearch')?.addEventListener('submit',e=>{e.preventDefault();adminSearch=val('adminQuery');admin()});
}

function materialCategories(){
 return '<div class="section-title"><h2>أقسام المواد</h2></div><div class="category-cards">'+CATS.map((c,i)=>'<button class="category-card" data-a="pickcat" data-v="'+esc(c)+'"><span aria-hidden="true">'+catIcon(i)+'</span>'+esc(c)+'</button>').join('')+'</div>';
}
function market(){
 const options={category:cat,query:q,min:filt.min,max:filt.max,sort:filt.sort};
 const l=window.SouqCatalog.select(D.p.filter(p=>p.active&&!p.blocked&&mok(p.mid)),options,p=>mname(p.mid));
 const results=tab==='catalog'||cat!=='all'||!!q;
 const title=q?'نتائج البحث عن «'+q+'»':cat!=='all'?cat:'المواد المعروضة';
 const cards=items=>window.SouqMarketplace.productCards(items,{esc,fmt,thumb,mname});
 if(results){
  $('#view').innerHTML=materialCategories()+'<section class="market-materials"><div class="section-title"><h2>'+esc(title)+'</h2><span class="note">'+l.length+' منتج</span></div><div class="box"><button class="alt" data-a="filters">تصفية النتائج</button></div>'+ (l.length?cards(l):'<div class="empty">'+(!dataReady?'':'لا توجد مواد مطابقة. جرّب قسمًا آخر أو عدّل البحث.')+'</div>')+'</section>';
  return;
 }
 const stores=D.m.filter(m=>m.ok&&!m.removed);
 $('#view').innerHTML=bannerHtml()+window.SouqMarketplace.switcher('home')+
 '<section class="market-materials">'+materialCategories()+'<div class="section-title"><h2>المواد المعروضة</h2><span class="note">'+l.length+' منتج</span><button data-a="marketSection" data-v="materials">عرض الكل ‹</button></div>'+
 (l.length?cards(l.slice(0,6)):'<div class="empty">'+(!dataReady?'':'تظهر هنا منتجات التجار المعتمدين.')+'</div>')+'</section>'+
 '<section class="market-stores"><div class="section-title"><h2>المتاجر</h2><span class="note">'+stores.length+' متجر</span><button data-a="marketSection" data-v="stores">عرض الكل ‹</button></div>'+
 (stores.length?window.SouqMarketplace.storeCards(stores.slice(0,4),D.p,{esc}):'<div class="empty">'+(!dataReady?'':'تظهر هنا المتاجر المعتمدة.')+'</div>')+'</section>';
}
function storesPage(){
 storeQuery=q;
 const approved=D.m.filter(m=>m.ok&&!m.removed);
 const published=D.p.filter(p=>p.active&&!p.blocked&&approved.some(m=>m.id===p.mid));
 const categories=CATS.filter(c=>published.some(p=>p.cat===c));
 const stores=approved.filter(m=>window.SouqCatalog.matches([m.name,m.description,m.address].join(' '),storeQuery)&&(cat==='all'||published.some(p=>p.mid===m.id&&p.cat===cat)));
 const sections='<div class="section-title"><h2>أقسام المتاجر</h2></div><div class="category-cards store-category-cards">'+['all',...categories].map(c=>'<button class="category-card" data-a="storeCategory" data-v="'+esc(c)+'" aria-pressed="'+(cat===c)+'"><span aria-hidden="true">'+(c==='all'?window.SouqMarketplace.icon('stores'):catIcon(Math.max(0,CATS.indexOf(c))))+'</span>'+esc(c==='all'?'كل المتاجر':c)+'</button>').join('')+'</div>';
 $('#view').innerHTML=sections+'<section class="market-stores"><div class="section-title"><h2>متاجر سوق الشطرة</h2><span class="note">'+stores.length+' متجر</span></div>'+
 (stores.length?window.SouqMarketplace.storeCards(stores,D.p,{esc}):'<div class="empty">'+(!dataReady?'':'لا توجد متاجر مطابقة لهذا القسم أو البحث.')+'</div>')+'</section>';
}
function marketSection(section){
 publicStoreId=null;cat='all';q='';filt.min='';filt.max='';filt.sort='newest';tab=section==='stores'?'stores':section==='materials'?'catalog':'market';
 const url=new URL('./',location.href);if(tab==='stores')url.searchParams.set('view','stores');if(tab==='catalog')url.searchParams.set('view','materials');history.pushState(null,'',url);render();scrollTo(0,0);
}
function chats(){
  if(viewMode==='driver'){driverPage();return}
  if(user&&viewMode==='seller'&&ownStore){const incoming=D.o.filter(o=>o.mid===ownStore.id);$('#view').innerHTML='<div class="section-title"><h2>طلبات منتجاتي</h2></div>'+(incoming.length?incoming.map(o=>ordCard(o,true)).join(''):'<div class="empty">لا توجد طلبات لمنتجاتك بعد.</div>');return}
  $('#view').innerHTML='<div class="section-title"><h2>طلباتي وإشعاراتي</h2></div><div class="box"><button class="buy" data-a="tab" data-v="orders">متابعة مشترياتي</button></div>';
}
function driverPage(){driverWorkspace.render();}

function listings(){
  if(!canSell()){$('#view').innerHTML='<div class="box"><h2>البيع يحتاج موافقة الإدارة</h2><p>تواصل معنا لاعتماد حسابك. منتجاتك وطلباتك السابقة محفوظة.</p><button class="buy" data-a="sellerRequest">طلب الانضمام كبائع</button></div>';return}
  if(!user){$('#view').innerHTML='<div class="box"><h2>إعلاناتي</h2><p>سجّل الدخول لعرض منتجاتك وإدارتها.</p><button class="buy" data-a="login" data-v="m">دخول</button></div>';return}
  if(!ownStore){$('#view').innerHTML='<div class="box"><h2>إعلاناتي</h2><p>سجّل متجرك أولًا لتضيف المنتجات. يمكن للأفراد أيضًا التسجيل لعرض ما يريدون بيعه.</p><button class="buy" data-a="login" data-v="store">تسجيل بائع</button></div>';return}
  const mine=D.p.filter(p=>p.mid===ownStore.id);
  $('#view').innerHTML=`<div class="section-title"><h2>إعلاناتي</h2><button data-a="pform" data-v="">إضافة منتج ＋</button></div><div class="chips"><span class="chip">الكل ${mine.length}</span></div>`+(mine.length?mine.map(p=>`<div class="item"><div class="tile">${thumb(p)}</div><div><b>${esc(p.name)}</b><small>${fmt(p.price)} · المتوفر ${p.stock}</small><div class="acts"><button data-a="pform" data-v="${p.id}">تعديل</button><button data-a="pdel" data-v="${p.id}">حذف</button></div></div></div>`).join(''):'<div class="empty">لا توجد إعلانات بعد.</div>');
}
function ordCard(o,m){
  return `<div class="ord"><div class="r"><b>${sid(o)} · ${esc(m?o.cust.name:mname(o.mid))}</b><span class="pill s${o.st}">${ST[o.st]}</span></div><small>${when(o.ts)}</small>
  ${o.items.map(i=>`<div class="r"><span>${esc(i.name)} × ${i.q}</span><span>${fmt(i.price*i.q)}</span></div>`).join('')}
  <div class="r"><b>الإجمالي</b><b>${fmt(o.total)}</b></div>
  ${m?`<small>📞 <a href="tel:${esc(o.cust.phone)}">${esc(o.cust.phone)}</a> · 📍 ${esc(o.cust.addr)}${o.cust.note?' · '+esc(o.cust.note):''}</small>`:''}
  ${o.st<3&&m&&!o.driver_id?`<div class="acts">${m&&o.st<3?`<button class="go" data-a="st" data-v="${o.id}">${['قبول الطلب','خرج للتوصيل','تم التسليم'][o.st]}</button>`:''}${m?`<button data-a="cancel" data-v="${o.id}">إلغاء الطلب</button>`:''}</div>`:''}</div>`;
}
function orders(){
  const l=D.o.filter(o=>user&&o.buyer_id===user.id);
  $('#view').innerHTML='<div class="dh"><h2 style="margin:0">طلباتي</h2></div>'+(l.length?l.map(o=>ordCard(o,false)).join(''):'<div class="empty">ما عندك طلبات بعد.<br>اختر منتجاً من السوق وأرسل طلبك.</div>');
}
function account(){
  if(!user){$('#view').innerHTML=`<div class="box"><h2>حساب سوق الشطرة</h2><p>يمكنك التصفح دون حساب. سجّل الدخول لإرسال طلب أو عرض منتجاتك.</p><button class="buy" data-a="enter" data-v="buyer">الدخول كزبون</button><button class="alt" data-a="enter" data-v="seller">بائع</button><button class="alt" data-a="enter" data-v="driver">الدخول كعامل توصيل</button><button class="alt" data-a="info">عن التطبيق</button></div>`;return}
  if(profile?.disabled){$('#view').innerHTML='<div class="box"><h2>الحساب معطّل</h2><p>تم إيقاف استخدام هذا الحساب في السوق. تواصل مع إدارة التطبيق إذا كان لديك استفسار.</p><button class="alt" data-a="out">خروج</button></div>';return}
  if(viewMode==='guest'){$('#view').innerHTML=`<div class="box"><h2>تتصفح السوق كضيف</h2><p>اختر حساب الزبون للشراء، أو حساب البائع لنشر المواد.</p><button class="buy" data-a="enter" data-v="buyer">الدخول كزبون</button><button class="alt" data-a="enter" data-v="seller">بائع</button><button class="alt" data-a="out">تسجيل الخروج من الحساب المحفوظ</button></div>`;return}
  if(viewMode==='driver'&&profile?.role!=='admin'){driverPage();return}
  if(viewMode==='buyer'){$('#view').innerHTML=`<div class="account-head"><b>حساب الزبون</b><small>${esc(user.email)}</small></div><div class="account-shortcuts"><button data-a="tab" data-v="orders">🛒<br>متابعة مشترياتي</button><button data-a="cart">▣<br>السلة</button><button data-a="favorites">★<br>المفضلة</button></div><div class="box"><button class="alt" data-a="info">عن التطبيق</button><button class="alt" data-a="notifications">الإشعارات</button><button class="alt" data-a="switchrole" data-v="seller">${canSell()?'إدارة متجري':'طلب الانضمام كبائع'}</button><button class="alt" data-a="out">خروج</button></div>`;return}
  if(!D.me){$('#view').innerHTML=`<div class="account-head"><b>حساب البائع</b><small>${esc(user.email)}</small></div><div class="box"><p>تواصل مع الإدارة لاعتماد متجرك وتفعيل أدوات البيع.</p><button class="buy" data-a="login" data-v="store">بائع</button><button class="alt" data-a="switchrole" data-v="buyer">الانتقال إلى وضع الزبون</button><button class="alt" data-a="info">عن التطبيق</button><button class="alt" data-a="out">خروج</button></div>`;return}
  const me=D.me,own=me==='owner',T=[...(ownStore?[['p','منتجاتي'],['o','الطلبات']]:[]),...(own?[['m','التجار والأرباح']]:[])];
  let h=`<div class="account-head"><b>${esc(mname(me))}</b><small>${esc(user.email)}</small>${mok(me)?'':ownStore?.removed?'<small>أزالت الإدارة هذا البائع من السوق.</small>':'<small>بانتظار موافقة الإدارة. منتجاتك لا تظهر بعد.</small>'}</div><div class="account-shortcuts"><button data-a="tab" data-v="orders">🛒<br>طلباتي</button><button data-a="tab" data-v="${own?'admin':'listings'}">${own?'▦<br>لوحة الإدارة':'▤<br>إعلاناتي'}</button></div><div class="box"><button class="buy" data-a="addentry">＋ إضافة إعلان</button><button class="alt" data-a="storeEdit">تعديل اسم المتجر وعنوانه</button><button class="alt" data-a="info">عن التطبيق</button><button class="alt" data-a="notifications">الإشعارات</button><button class="alt" data-a="switchrole" data-v="buyer">الانتقال إلى وضع الزبون</button></div><div class="dh"><b>إدارة المتجر</b><button class="link" data-a="out">خروج</button></div><div class="chips">${T.map(t=>`<button class="chip" data-a="dtab" data-v="${t[0]}" aria-pressed="${t[0]===dt}">${t[1]}</button>`).join('')}</div>`;
  const mine=D.p.filter(p=>p.mid===(own?ownStore?.id:me)),mo=D.o.filter(o=>o.mid===(own?ownStore?.id:me));
  if(dt==='p'&&!ownStore)dt='m';
  if(dt==='p')h+=`<div style="padding:0 16px"><button class="buy" style="margin-top:0" data-a="pform" data-v="">＋ إضافة منتج</button></div>`+(mine.length?mine.map(p=>`<div class="item"><div class="tile">${thumb(p)}</div><div><b>${esc(p.name)}</b><small>${fmt(p.price)} · المتوفر ${p.stock}</small><div class="acts"><button data-a="pform" data-v="${p.id}">تعديل</button><button data-a="pdel" data-v="${p.id}">حذف</button></div></div></div>`).join(''):'<div class="empty">ما أضفت منتجات بعد.</div>');
  else if(dt==='o')h+=mo.length?mo.map(o=>ordCard(o,true)).join(''):'<div class="empty">ما وصلتك طلبات بعد.</div>';
  else{
    const dn=D.o.filter(o=>o.st===3),tot=dn.reduce((s,o)=>s+o.total,0),ext=dn.filter(o=>o.mid!=='owner').reduce((s,o)=>s+o.total,0),cm=Math.round(ext*D.comm/100);
    h+=`${!ownStore?'<div class="box"><button class="buy" data-a="login" data-v="store">تسجيل متجر خاص بك</button></div>':''}<div class="box"><div class="row" style="border:0"><span>مبيعات مكتملة</span><b>${fmt(tot)}</b></div><div class="row"><span>مبيعات التجار</span><b>${fmt(ext)}</b></div><div class="row"><span>عمولتك التقديرية (${D.comm}%)</span><b>${fmt(cm)}</b></div><p class="note">النسبة المعروضة تقديرية في هذا الجهاز.</p></div>`+
    (D.m.length?D.m.map(m=>{const s=D.o.filter(o=>o.mid===m.id&&o.st===3).reduce((a,o)=>a+o.total,0);return `<div class="item"><div><b>${esc(m.name)}</b><small>📞 ${esc(m.phone)} · مبيعات ${fmt(s)}</small><div class="acts"><button class="${m.ok?'':'go'}" data-a="mok" data-v="${m.id}">${m.ok?'إيقاف المتجر':'قبول المتجر'}</button></div></div></div>`}).join(''):'<div class="empty">ما سجّل أي تاجر بعد.</div>');
  }
  $('#view').innerHTML=h;
}

/* ===== النوافذ ===== */
async function prepareStoreImage(file){
 const url=URL.createObjectURL(file);
 try{const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('تعذّر قراءة الصورة'));image.src=url});
 const scale=Math.min(1,768/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
 return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('تعذّر تجهيز الصورة')),'image/jpeg',.85));
 }finally{URL.revokeObjectURL(url)}
}
async function saveProduct(){
    if(productSaveBusy)return;
    if(!canSell()){sellerRequest();return}
    if(!ownStore){toast('سجّل متجرًا أولًا');return}
    const button=$('[data-a="psave"]');
    productSaveBusy=true;if(button){button.disabled=true;button.textContent='جارٍ حفظ المنتج…'}
    try{
    const bundle=await productEditor.collect();
    const name=val('fn'),price=+val('fpr'),stock=productEditor.hasVariants()?bundle.variants.filter(v=>!v.archived&&v.available).reduce((n,v)=>n+v.stock,0):+val('fs');
    if(name.length<2||!Number.isSafeInteger(price)||price<1||price>2147483647||!Number.isSafeInteger(stock)||stock<0||stock>2147483647||(!productEditor.hasVariants()&&val('fs')==='')||val('fthreshold')===''||!Number.isSafeInteger(+val('fthreshold'))||+val('fthreshold')<0||+val('fthreshold')>2147483647){toast('اكتب الاسم والسعر والكمية');return}
    const costText=val('fcost'),cost=costText===''?null:Number(costText);
    if(cost!==null&&(!Number.isSafeInteger(cost)||cost<0||cost>2147483647)){toast('اكتب سعر تكلفة صحيحًا');return}
    const compare=productEditor.hasVariants()?'':val('fcompare'),compare_at_price=compare?+compare:null;
    if(compare&&(!Number.isSafeInteger(compare_at_price)||compare_at_price<=price||compare_at_price>2147483647)){toast('السعر قبل التخفيض يجب أن يكون أكبر من سعر البيع');return}
    const draft=cur,storeId=ownStore.id,image=draft.img;
    const f={name,price,compare_at_price,stock,category:(D.catalog||[]).find(c=>c.id===bundle.catalog_category_id)?.name||prod(cur.id)?.cat||'أخرى',description:val('fd'),store_category:val('fcCustom'),store_id:storeId,sku:val('fsku').slice(0,80),variant:val('fvariant').slice(0,120),low_stock_threshold:+val('fthreshold'),active:$('#factive').value==='true'};
    let image_path=draft.id?prod(draft.id)?.image_path:null;
    if(image&&image.startsWith('data:image/')){
      const blob=await (await fetch(image)).blob();if(blob.size>2097152)throw Error('الصورة كبيرة؛ اختر صورة أصغر');
      image_path=`${storeId}/${uid()}.jpg`;
      check(await db.storage.from('products').upload(image_path,blob,{contentType:'image/jpeg'}));
    }
    f.image_path=image_path;f.catalog_category_id=bundle.catalog_category_id;f.attributes=bundle.attributes;f.expected_stock=bundle.expected_stock;
    draft.id=check(await db.rpc('save_product_bundle',{p_id:draft.id||null,p_store:storeId,p_product:f,p_variants:bundle.variants}));
    let costSaved=true;try{await workspace.saveProductCost(draft.id,cost)}catch{costSaved=false}
    tab='listings';await refresh();A.close();render();toast(costSaved?'تم حفظ المنتج':'حُفظ المنتج، لكن تعذّر حفظ سعر التكلفة. أعد فتح تعديله للمحاولة مجددًا.');
    }finally{productSaveBusy=false;if(button?.isConnected){button.disabled=false;button.textContent=cur?.id?'حفظ التعديلات':'إنشاء'}}
}

function psheet(){
  const {p,n}=cur;if(!p){toast('المنتج غير متاح');return}const chosen=selectedProduct(p,cur.vid),display=chosen||p,vs=(p.variants||[]).filter(v=>!v.archived);
  sheet(head(esc(p.name))+`<div class="tile big">${thumb(display)}</div>${window.SouqMarketplace.price(display,fmt)}<p class="note">البائع: <a class="mp-product-store" href="./?store=${encodeURIComponent(p.mid)}">${esc(mname(p.mid))} ← زيارة المتجر</a></p>${p.desc?`<p>${esc(p.desc)}</p>`:''}${specifications(p,D.catalog||[])}${p.has_variants?`<div class="va-choice"><label for="buyerVariant">اختر النسخة المطلوبة</label><select id="buyerVariant"><option value="">اختر اللون / المقاس / الخيارات</option>${vs.map(v=>`<option value="${v.id}" ${cur.vid===v.id?'selected':''}>${esc(v.label)} — ${fmt(variantPrice(v))}${!v.available||v.stock<1?' — غير متاحة':''}</option>`).join('')}</select></div>`:p.variant?`<p>${esc(p.variant)}</p>`:''}${activity.controls(p.id)}
  <div class="row"><span>الكمية المطلوبة</span><div class="qty"><button data-a="pq" data-v="-1" aria-label="أقل">−</button><b>${n}</b><button data-a="pq" data-v="1" aria-label="أكثر">+</button></div></div>
  <button class="buy" data-a="add" ${!chosen||chosen.stock<1?'disabled':''}>${!chosen?'اختر النسخة أولًا':chosen.stock<1?'غير متوفرة حاليًا':'أضف للسلة · '+fmt(chosen.price*n)}</button>`);

}
function cartRows(){return D.cart.map(c=>({c,p:selectedProduct(prod(c.pid),c.vid)}));}
function captureCheckout(){if(tab!=='cartPage'||!$('#cn'))return;D.cust={name:val('cn'),phone:val('cp'),addr:val('ca')};checkoutNote=val('cno');save()}
function checkoutLocationCard(){
 if(!geoPoint)return '';
 return `<div class="checkout-map-card"><span aria-hidden="true">📍</span><div><b>موقع التوصيل المحدد</b><small dir="ltr">${Number(geoPoint.lat).toFixed(5)}, ${Number(geoPoint.lon).toFixed(5)}</small><a href="https://www.google.com/maps?q=${Number(geoPoint.lat)},${Number(geoPoint.lon)}" target="_blank" rel="noopener">عرض الموقع على الخريطة</a></div><button class="checkout-map-edit" data-a="geolocate" type="button" aria-label="تعديل موقع التوصيل" title="تعديل الموقع"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15Z"/></svg></button><iframe class="checkout-map-preview" title="الموقع المختار للتوصيل" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=${Number(geoPoint.lon)-.003}%2C${Number(geoPoint.lat)-.003}%2C${Number(geoPoint.lon)+.003}%2C${Number(geoPoint.lat)+.003}&amp;layer=mapnik&amp;marker=${Number(geoPoint.lat)}%2C${Number(geoPoint.lon)}"></iframe></div>`;
}
function chooseCheckoutLocation(value=geoPoint){
 captureCheckout();
 window.SouqLocationPicker.show({value,sheet,head,onConfirm:point=>{geoPoint=point;A.close();csheet();toast('تم اعتماد موقع التوصيل')}});
}
function csheet(){
 const heading='<div class="buyer-cart-heading"><h1>سلة التسوق</h1><button data-a="tab" data-v="market">العودة إلى السوق ‹</button></div>';
 if(cartReceipt){$('#view').innerHTML=heading+`<section class="buyer-checkout-card done"><div class="ck" aria-hidden="true">✓</div><h2>وصل طلبك</h2><p>رقم الطلب ${cartReceipt.map(esc).join('، ')}</p><p class="note">سيؤكد البائع الطلب. الدفع عند الاستلام.</p><button class="buy" data-a="tab" data-v="orders">متابعة طلباتي</button></section>`;return;}
  const it=cartRows(),tot=it.reduce((s,x)=>s+(x.p?.price||0)*x.c.q,0);
  if(!it.length){$('#view').innerHTML=heading+'<section class="buyer-checkout-card empty"><h2>سلتك فارغة</h2><p>اختر مشترياتك من السوق لتظهر هنا.</p><button class="buy" data-a="tab" data-v="market">تصفح المنتجات</button></section>';return}
  const u={name:D.cust.name||profile?.full_name||'',phone:D.cust.phone||profile?.phone||'',addr:D.cust.addr||''},fees=(deliverySettings.platform_fee||0)+(deliverySettings.delivery_fee||0),orderCount=new Set(it.map(x=>x.p?.mid).filter(Boolean)).size;
  $('#view').innerHTML=heading+'<div class="buyer-checkout-layout"><section class="buyer-checkout-card"><h2>مشترياتك</h2>'+it.map(x=>`<div class="row"><div><b>${esc(x.p?.name||prod(x.c.pid)?.name||'منتج غير متاح')}</b><small class="note" style="display:block;margin:0">${esc(x.p?.selectedVariant?.label||x.p?.variant||'')} · ${x.p?esc(mname(x.p.mid))+' · '+fmt(x.p.price):'هذه النسخة غير متاحة؛ أزلها من السلة'}</small>${x.p&&(!x.p.active||x.p.blocked||x.p.stock<x.c.q)?'<small class="va-unavailable">الكمية المطلوبة غير متاحة حاليًا</small>':''}</div><div class="qty"><button data-a="cq" data-v="${cartKey(x.c)}|-1" aria-label="أقل">−</button><b>${x.c.q}</b><button data-a="cq" data-v="${cartKey(x.c)}|1" aria-label="أكثر">+</button><button data-a="cartRemove" data-v="${cartKey(x.c)}" aria-label="إزالة">×</button></div></div>`).join('')+
  `<div class="row"><span>المنتجات</span><b>${fmt(tot)}</b></div><div class="row buyer-total"><b>المبلغ النهائي المطلوب</b><b>${fmt(tot+fees*orderCount)}</b></div>
  </section><section class="buyer-checkout-card"><h2>بيانات استلام الطلب</h2><label for="cn">الاسم</label><input id="cn" value="${esc(u.name)}" autocomplete="name">
  <label for="cp">رقم الهاتف</label><input id="cp" type="tel" inputmode="numeric" value="${esc(u.phone)}" placeholder="07xxxxxxxxx" autocomplete="tel">
  <label for="ca">عنوان التوصيل</label><input id="ca" value="${esc(u.addr)}" placeholder="المنطقة، الحي، أقرب نقطة دالة"><div class="checkout-location"><button class="alt" data-a="geolocate" type="button">📍 ${geoPoint?'تعديل الموقع على الخريطة':'اختيار الموقع على الخريطة'}</button>${user?'<button class="alt" data-a="useProfileLocation" type="button">📍 استخدام الموقع المحفوظ</button>':''}</div>${checkoutLocationCard()}<small id="geoStatus" class="note">${geoPoint?'تم اعتماد الموقع وسيُرفق بالطلب.':'اختر موقع التوصيل ثم اضغط موافق، واكتب العنوان ورقم الهاتف أيضًا.'}</small>
  <label for="cno">ملاحظات (اختياري)</label><input id="cno" value="${esc(checkoutNote)}">
  <button class="buy" data-a="order">إرسال الطلب · الدفع عند الاستلام</button></section></div>`;
}
function authIcon(name){
 const paths={back:'<path d="m10 6 6 6-6 6M16 12H4"/>',image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 3-3 6 6"/>',person:'<circle cx="12" cy="7" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',phone:'<rect x="7" y="2" width="10" height="20" rx="3"/><path d="M10 18h4"/>',mail:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 7 9-7"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',eyeOff:'<path d="m3 3 18 18M9 5.5A11 11 0 0 1 12 5c6 0 10 7 10 7a18 18 0 0 1-3 3.5M6 6.5A20 20 0 0 0 2 12s4 7 10 7a12 12 0 0 0 5-1M10 10a3 3 0 0 0 4 4"/>',sms:'<path d="M5 3h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-9l-6 4v-4H3V5a2 2 0 0 1 2-2Z"/><path d="M7 8h10M7 12h6"/>',whatsapp:'<path d="M20 12a8 8 0 0 1-12 7l-5 2 1.5-5A8 8 0 1 1 20 12Z"/><path d="M8 7c-2 4 3 9 7 8l1-2-3-1-1 1-2-2 1-1-1-3Z"/>',support:'<path d="M4 14v-3a8 8 0 0 1 16 0v3M20 18c0 3-4 3-7 3"/><rect x="2" y="11" width="4" height="8" rx="2"/><rect x="18" y="11" width="4" height="8" rx="2"/>'};
 return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.person}</svg>`;
}
function authField(id,label,type,icon,attrs=''){
 return `<label for="${id}">${label}</label><div class="auth-field"><span class="auth-field-icon">${authIcon(icon)}</span><input id="${id}" type="${type}" ${attrs}>${type==='password'?`<button class="auth-eye" type="button" data-a="showPassword" data-v="${id}" aria-label="إظهار كلمة المرور${id==='lkConfirm'?' المؤكدة':''}" aria-pressed="false">${authIcon('eyeOff')}</button>`:''}</div>`;
}
function lsheet(m){
 if(m==='store'){sellerRequest();return}
 const signup=m==='r',professional=['seller','driver'].includes(viewMode),role=viewMode==='seller'?'بائع':viewMode==='driver'?'عامل توصيل':'زبون';
 const phone=signup?authField('lphone','رقم هاتفك <small>(اختياري للتواصل)</small>','tel','phone','dir="ltr" inputmode="tel" autocomplete="tel" placeholder="07xxxxxxxxx"'):'';
 sheet(`<div class="auth-handle" aria-hidden="true"></div><div class="auth-top"><strong>سوق الشطرة<small>SOUQ AL-SHATRA</small></strong><button class="x" data-a="${ADMIN_PORTAL?'close':'back'}" aria-label="الرجوع إلى الواجهة السابقة">${ADMIN_PORTAL?'✕':backIcon}</button></div><h2 class="auth-title">${signup?'إنشاء حساب':'تسجيل الدخول'} ${role}</h2><p class="auth-subtitle">${professional?(signup?'أنشئ حساب الدخول أولًا، ثم أكمل طلب الانضمام.':'استخدم البريد أو حساب Google نفسه الذي ربطت به حسابك القديم.'):signup?'أهلاً بك في سوق الشطرة.':'أهلًا بعودتك إلى سوق الشطرة.'}</p><div id="authProviders" class="auth-providers" hidden></div><form id="authForm" data-mode="${m}">${signup?authField('ln','الاسم الكامل <span class="auth-required">*</span>','text','person','required autocomplete="name" placeholder="اكتب اسمك"')+phone:''}${authField('lp','البريد الإلكتروني <span class="auth-required">*</span>','email','mail','required dir="ltr" inputmode="email" autocomplete="email" placeholder="name@example.com"')}${authField('lk','كلمة المرور <span class="auth-required">*</span>','password','lock',`required minlength="6" autocomplete="${signup?'new-password':'current-password'}" placeholder="اكتب كلمة المرور"`)}${signup?authField('lkConfirm','تأكيد كلمة المرور <span class="auth-required">*</span>','password','lock','required minlength="6" autocomplete="new-password" placeholder="أعد كتابة كلمة المرور"')+'<p class="note">استخدم 6 أحرف على الأقل.</p>':'<button class="auth-forgot" type="button" data-a="forgotPassword">نسيت كلمة المرور؟</button>'}<button class="buy auth-submit" type="submit" data-a="dologin" data-v="${m}">${signup?'إنشاء حساب':'تسجيل الدخول'}</button></form><p class="auth-switch">${signup?'لديك حساب بالفعل؟':'ليس لديك حساب؟'} <button data-a="${professional?signup?'roleExisting':'roleRequest':'login'}" data-v="${professional?viewMode:signup?'m':'r'}">${signup?'تسجيل الدخول':professional?viewMode==='seller'?'اطلب الانضمام كتاجر':'اطلب الانضمام كسائق توصيل':'إنشاء حساب'}</button></p><a class="auth-support" href="https://wa.me/9647837271707" target="_blank" rel="noopener noreferrer">${authIcon('support')}خدمة العملاء</a>`);
 $('#shade').classList.add('auth-open');$('#sheet').classList.add('auth-sheet');
 if(!pendingPurchase)loadAuthProviders();
}
function roleIcon(role){
  const paths=role==='seller'?'<path d="M4 12h24v16H4zM3 12l3-8h20l3 8M11 28V18h10v10M3 12q3 5 6 0 3 5 7 0 4 5 7 0 3 5 6 0"/>':role==='driver'?'<circle cx="8" cy="24" r="5"/><circle cx="25" cy="24" r="5"/><circle cx="18" cy="5" r="3"/><path d="M8 24l8-12 5 3 4 9M16 12l-2 7 7 5M5 8h7v8H5M21 15h5"/>':'<circle cx="16" cy="8" r="4"/><path d="M9 18q7-8 14 0M3 19h26l-4 10H7zM10 22v4M16 22v4M22 22v4"/>';
  return `<svg viewBox="0 0 32 32" aria-hidden="true">${paths}</svg>`;
}
function closeAccountMenu(){const menu=$('#accountMenu');if(menu)menu.hidden=true;$('#accountTrigger')?.setAttribute('aria-expanded','false')}
async function authProviderSettings(){
  const response=await apiFetch(SUPABASE_URL+'/auth/v1/settings',{headers:{apikey:SUPABASE_ANON_KEY}});
  if(!response.ok)throw new Error('تعذر التحقق من خدمة الدخول. حاول مجددًا.');
  return response.json();
}
async function loadAuthProviders(){
  const target=$('#authProviders');if(!target)return;
  const providers=[['google','Google','G']];
  function paint(){
    if(!target.isConnected)return;
    target.innerHTML=providers.map(([provider,name,icon])=>`<button type="button" class="auth-provider ${provider}" data-a="oauth" data-v="${provider}"><span aria-hidden="true">${icon}</span>المتابعة باستخدام ${name}</button>`).join('')+'<div class="auth-divider">أو بالبريد الإلكتروني</div>';
    target.hidden=false;
  }
  paint();
  try{
    const settings=await authProviderSettings();
    for(const item of [['facebook','Facebook','f'],['apple','Apple','●']])if(settings.external?.[item[0]])providers.push(item);
    paint();
  }catch{}
}
function recoverySheet(){
  sheet(head('تعيين كلمة مرور جديدة')+'<label for="recoveryPassword">كلمة المرور الجديدة</label><input id="recoveryPassword" type="password" minlength="6" autocomplete="new-password"><label for="recoveryConfirm">تأكيد كلمة المرور</label><input id="recoveryConfirm" type="password" autocomplete="new-password"><button class="buy" data-a="saveRecoveryPassword">حفظ كلمة المرور</button>');
}
function fsheet(id){
  if(!canSell()){sellerRequest();return}
  const p=id?prod(id):null;if(id&&(!p||p.mid!==ownStore?.id)){toast('هذا المنتج لا يتبع متجرك');return;}cur={img:p?p.img:'',id};tab='postPage';render();scrollTo(0,0);
}
function filterSheet(){
  sheet(head('فلتر')+`<div class="filter-group"><h3>القسم</h3><div class="filter-chips">${['all',...CATS].map(c=>`<button data-a="fcat" data-v="${c}" aria-pressed="${cat===c}">${c==='all'?'الكل':c}</button>`).join('')}</div></div>
  <div class="filter-group"><h3>الموقع</h3><p class="note">تصفية المحافظة ستتوفر حين تصبح مواقع المنتجات محفوظة في التطبيق.</p></div>
  <div class="filter-group"><h3>السعر (د.ع)</h3><div class="filter-range"><label>من<input id="fmin" type="number" inputmode="numeric" min="0" placeholder="0" value="${esc(filt.min)}"></label><label>إلى<input id="fmax" type="number" inputmode="numeric" min="0" placeholder="بدون حد" value="${esc(filt.max)}"></label></div></div>
  <div class="filter-group"><h3>الحالة</h3><p class="note">فلتر جديد أو مستعمل سيُفعّل بعد إضافة حالة المنتج إلى بيانات الإعلان.</p></div>
  <div class="filter-group"><h3>الترتيب</h3><div class="filter-chips">${[['newest','الأحدث'],['oldest','الأقدم'],['cheap','السعر: الأقل أولًا'],['expensive','السعر: الأعلى أولًا']].map(([v,t])=>`<button data-a="fsort" data-v="${v}" aria-pressed="${filt.sort===v}">${t}</button>`).join('')}</div></div><div class="filter-actions"><button class="buy" data-a="fapply">عرض النتائج</button><button class="alt" data-a="fclear">حذف الفلاتر</button></div>`);
}
function infoSheet(){
  const seller=[['من يستطيع البيع؟','البيع متاح للتجار الذين تعتمدهم إدارة سوق الشطرة بعد التواصل والتحقق من بياناتهم.'],['كيف أنشر منتجًا؟','أنشئ حساب زبون، ثم تواصل مع الإدارة لطلب الانضمام كبائع. بعد الاعتماد تظهر أدوات إضافة المنتجات.'],['هل توجد نسبة من البيع؟','يعرض التطبيق سعر المنتج، وأجرة التوصيل وحصة التطبيق قبل إرسال الطلب. يدفع عامل التوصيل ثمن المنتج للبائع من ماله عند الاستلام.']];
  const buyer=[['كيف أجد منتجًا؟','تصفح الأقسام أو اكتب اسم المنتج في البحث، واستعمل خيارات السعر والترتيب للوصول إلى ما يناسبك.'],['كيف أشتري؟','افتح المنتج، أضفه إلى السلة وأدخل رقم هاتفك وعنوانك. بعد قبول الطلب يستلمه عامل التوصيل من البائع. ادفع للعامل إجمالي الطلب الظاهر لك عند التسليم، وتابع الحالة من طلباتي.'],['هل أستطيع البيع أيضًا؟','نعم. سجّل كبائع واعرض المنتج الذي تملكه حتى لو لم يكن لديك متجر.']];
  const rows=infoRole==='seller'?seller:buyer;
  sheet(head('عن سوق الشطرة')+`<p class="note">سوق محلي يعرض منتجات المتاجر والأفراد في الشطرة.</p><div class="info-tabs"><button data-a="inforole" data-v="seller" aria-pressed="${infoRole==='seller'}">للبائع</button><button data-a="inforole" data-v="buyer" aria-pressed="${infoRole==='buyer'}">للمشتري</button></div><div class="faq">${rows.map(([title,body])=>`<details><summary>${title}</summary><p>${body}</p></details>`).join('')}</div>`);
}

/* ===== الإجراءات ===== */
const A={
  marketSection,
  submitSellerJoin:()=>act(async()=>{if(!user||profile?.disabled)return;const first=val('sellerFirst'),last=val('sellerLast'),name=val('joinStoreName'),phone=val('joinPhone').replace(/\D/g,''),address=val('joinAddress'),description=val('joinDescription'),kind=val('joinStoreKind');if(!first||!last||name.length<2||phone.length<10||address.length<3||!kind){toast('أكمل الاسم واسم المتجر والهاتف والعنوان');return}const button=$('#sellerJoinForm [type="submit"]');if(button?.disabled)return;if(button)button.disabled=true;try{check(await db.rpc('request_seller_join_location',{p_first:first,p_last:last,p_name:name,p_phone:phone,p_address:address,p_description:description,p_kind:kind}));tab='sellerJoin';await refresh();toast('وصل طلبك إلى الإدارة وبانتظار الموافقة');}finally{if(button?.isConnected)button.disabled=false;}}),
  buyerAccountLogin,
  loginBuyerAccount:()=>act(async()=>{check(await db.auth.signOut());user=null;profile=null;ownStore=null;dataReady=false;publicStoreId=null;D.p=[];D.o=[];D.cart=[];save();rememberMode('buyer');tab='market';A.close();await refresh();buyerEntry()}),
  sellerRequest,
  activateSeller:v=>{if(profile?.role!=='admin')return;const p=D.people.find(p=>p.id===v);if(!p||p.disabled)return;const m=D.m.find(m=>m.owner_id===v);sheet(head('تفعيل حساب تاجر')+`<p>بعد التحقق من التاجر، أدخل بيانات متجره لتفعيل البيع.</p><p>${esc(p.full_name||'الحساب')} · <span dir="ltr">${esc(v)}</span></p><label for="sellerName">اسم المتجر</label><input id="sellerName" value="${esc(m?.name||'')}"><label for="sellerPhone">رقم الهاتف</label><input id="sellerPhone" type="tel" value="${esc(m?.phone||p.phone||'')}"><label for="sellerAddress">عنوان المتجر</label><input id="sellerAddress" value="${esc(m?.address||'')}"><button class="buy" data-a="saveSellerActivation" data-v="${esc(v)}">اعتماد التاجر وتفعيل البيع</button>`)},
  saveSellerActivation:v=>act(async()=>{if(profile?.role!=='admin')return;const name=val('sellerName'),phone=val('sellerPhone'),address=val('sellerAddress');if(name.length<2||phone.replace(/\D/g,'').length<10||address.length<3){toast('أدخل اسم المتجر ورقم هاتف صحيح والعنوان');return}check(await db.rpc('admin_activate_seller',{p_user:v,p_name:name,p_phone:phone,p_address:address}));A.close();await refresh();toast('تم اعتماد التاجر وتفعيل البيع')}),
  toggleTheme:()=>{window.SouqTheme.set(window.SouqTheme.get()==='dark'?'light':'dark');if(tab==='settings')settings()},
  theme:mode=>{window.SouqTheme.set(mode);settings()},
  accountMenu:()=>{
    const menu=$('#accountMenu');if(!menu.hidden){closeAccountMenu();return}
    menu.innerHTML=(user?'<button data-a="tab" data-v="profilePage">حسابي وبياناتي</button>':'')+'<p>اختر طريقة استخدام حسابك</p>'+[['buyer','زبون'],['seller','بائع'],['driver','عامل توصيل']].map(([role,label])=>`<button data-a="enter" data-v="${role}"><span class="account-role-icon">${roleIcon(role)}</span>${label}</button>`).join('');menu.hidden=false;$('#accountTrigger').setAttribute('aria-expanded','true');
  },
  showPassword:id=>{const input=$('#'+(id||'lk')),button=$('#sheet [data-a="showPassword"][data-v="'+(id||'lk')+'"]');if(!input||!button)return;const show=input.type==='password';input.type=show?'text':'password';button.innerHTML=authIcon(show?'eye':'eyeOff');button.setAttribute('aria-pressed',String(show));button.setAttribute('aria-label',(show?'إخفاء كلمة المرور':'إظهار كلمة المرور')+(id==='lkConfirm'?' المؤكدة':''))},
  oauth:provider=>act(async()=>{
    const settings=await authProviderSettings();
    if(!settings.external?.[provider]){toast('الدخول باستخدام '+provider+' لم يُفعّل بعد من إدارة التطبيق. يمكنك استخدام البريد مؤقتًا.');return}
    rememberMode(['seller','driver'].includes(viewMode)?viewMode:'buyer');
    if(ADMIN_PORTAL)sessionStorage.setItem('souq-admin-return','1');
    check(await withTimeout(db.auth.signInWithOAuth({provider,options:{redirectTo:ADMIN_PORTAL?new URL('./',location.href).href:location.origin+location.pathname,...(provider==='google'?{queryParams:{prompt:'select_account'}}:{})}})));
  }),
  forgotPassword:()=>act(async()=>{
    const email=val('lp');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){toast('اكتب بريدك الإلكتروني أولًا');$('#lp')?.focus();return}
    const button=$('#sheet [data-a="forgotPassword"]');if(button.disabled)return;button.disabled=true;
    try{check(await withTimeout(db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname})));sheet(head('راجع بريدك الإلكتروني')+'<p>إذا كان هذا البريد مسجلًا، سيصلك رابط لتعيين كلمة مرور جديدة. افحص مجلد الرسائل غير المرغوبة أيضًا.</p><button class="buy" data-a="login" data-v="m">العودة لتسجيل الدخول</button>')}finally{if(button.isConnected)button.disabled=false}
  }),
  saveRecoveryPassword:()=>act(async()=>{
    const password=val('recoveryPassword');if(password.length<6||password!==val('recoveryConfirm')){toast('استخدم 6 أحرف على الأقل وتأكد من تطابق الكلمتين');return}
    const button=$('#sheet [data-a="saveRecoveryPassword"]');if(button.disabled)return;button.disabled=true;
    try{check(await withTimeout(db.auth.updateUser({password})));A.close();toast('تم تحديث كلمة المرور');refresh().catch(error)}finally{if(button.isConnected)button.disabled=false}
  }),
  retry:()=>{ $('#loading').hidden=false;refresh().catch(error) },
  chooseAvatar:()=>$('#avatarInput')?.click(),
  profileSwitch:v=>{if(db.preview){db.preview.selectRole(v);return}if(sellerAccount()&&v!=='seller'){buyerAccountLogin();return}if(v==='seller'&&!canSell()){sellerRequest();return}if(!user)return;rememberMode(v);tab='account';render();scrollTo(0,0);toast(v==='seller'?'انتقلت إلى وضع البائع':'انتقلت إلى وضع الزبون')},
  editEmail:()=>{if(!user)return;sheet(head('تغيير البريد الإلكتروني')+`<p class="note">بريدك الحالي: <span dir="ltr">${esc(user.email||'')}</span></p><label for="newEmail">البريد الإلكتروني الجديد</label><input id="newEmail" type="email" autocomplete="email" inputmode="email"><p class="note">سيصلك رابط تأكيد. قد يطلب النظام تأكيد البريد الحالي أيضًا. يبقى بريد الدخول القديم حتى يكتمل التحقق.</p><button class="buy" data-a="saveEmail">إرسال رابط التأكيد</button>`)},
  saveEmail:()=>act(async()=>{if(!user)return;const email=val('newEmail').toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email===user.email?.toLowerCase()){toast('اكتب بريدًا جديدًا صحيحًا');return}check(await withTimeout(db.auth.updateUser({email})));A.close();toast('أُرسل رابط التحقق. افتح بريدك الجديد لإكمال التغيير.')}),
  editCustomerPhone:()=>{if(!user||profile?.disabled)return;sheet(head('رقم الهاتف')+`<form id="customerPhoneForm"><label for="customerPhone">رقم هاتفك</label><input id="customerPhone" type="tel" inputmode="tel" autocomplete="tel" maxlength="15" required value="${esc(profile?.phone||'')}" placeholder="07xxxxxxxxx"><button class="buy" type="submit">حفظ رقم الهاتف</button></form>`);$('#customerPhone').focus()},
  saveCustomerPhone:()=>act(async()=>{if(!user||profile?.disabled)return;const phone=val('customerPhone').replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c<='٩'?1632:1776))).replace(/[\s()+-]/g,'');if(!/^[0-9]{10,15}$/.test(phone)){toast('اكتب رقم هاتف صحيح');$('#customerPhone')?.focus();return}check(await db.from('profiles').update({phone}).eq('id',user.id));D.cust.phone=phone;save();A.close();await refresh();toast('تم حفظ رقم الهاتف')}),
  editprofile:()=>{if(!user)return;sheet(head('تعديل بيانات الحساب')+`<label for="pfname">الاسم</label><input id="pfname" autocomplete="name" value="${esc(profile?.full_name||user.user_metadata?.full_name||'')}"><label for="pfphone">رقم الهاتف</label><input id="pfphone" type="tel" inputmode="tel" autocomplete="tel" value="${esc(profile?.phone||'')}"><p class="note">البريد الإلكتروني مرتبط بحساب الدخول ولا يتغير من هذه الصفحة.</p><button class="buy" data-a="saveprofile">حفظ المعلومات</button>`)},
  editaddress:()=>{if(!user)return;let address='';try{address=localStorage.getItem('souq-shatra-address-'+user.id)||''}catch{}sheet(head('عنوان التوصيل')+`<label for="profileAddress">اكتب العنوان بالتفصيل</label><textarea id="profileAddress" rows="3" placeholder="المدينة، الحي، أقرب نقطة دالة">${esc(address)}</textarea><button class="alt" data-a="saveProfileLocation" type="button">📍 تحديد موقعي عبر GPS</button><p class="note">الموقع المحفوظ اختياري. اكتب عنوانًا واضحًا للتوصيل ويمكنك تغييره عند كل طلب.</p><button class="buy" data-a="saveaddress">حفظ العنوان</button>`)},
  saveaddress:()=>{if(!user)return;const address=val('profileAddress');if(address.length<5){toast('اكتب عنوانًا واضحًا');return}try{localStorage.setItem('souq-shatra-address-'+user.id,address)}catch{toast('تعذّر حفظ العنوان على هذا الجهاز');return}D.cust.addr=address;save();A.close();render();toast('تم حفظ العنوان على هذا الجهاز')},
  saveProfileLocation:()=>{if(!user||!navigator.geolocation){toast('خدمة الموقع غير متاحة');return}const status=$('#profileLocationStatus');if(status)status.textContent='جارٍ طلب إذن الموقع وتحديده…';navigator.geolocation.getCurrentPosition(pos=>{const point={lat:+pos.coords.latitude.toFixed(6),lon:+pos.coords.longitude.toFixed(6)};try{localStorage.setItem('souq-shatra-location-'+user.id,JSON.stringify(point))}catch{toast('تعذّر حفظ الموقع على هذا الجهاز');return}if(!$('#shade').hidden)A.close();render();toast('تم حفظ موقعك. اختر مشاركته عند الشراء.')},()=>{const status=$('#profileLocationStatus');if(status)status.textContent='تعذّر تحديد الموقع. فعّل GPS واسمح للموقع بالوصول إليه ثم حاول مجددًا.';toast('تعذّر تحديد الموقع. تحقق من إذن GPS.')},{enableHighAccuracy:true,timeout:15000,maximumAge:0})},
  useProfileLocation:()=>{if(!user)return;try{const saved=window.SouqLocationPicker.point(JSON.parse(localStorage.getItem('souq-shatra-location-'+user.id)||'null'));if(!saved)throw new Error();chooseCheckoutLocation(saved)}catch{toast('لم تحفظ موقعًا في ملفك بعد')}},
  paymentinfo:()=>sheet(head('طريقة الدفع')+'<p>الدفع نقدًا عند استلام الطلب من عامل التوصيل، وفق المبلغ المعروض عند تأكيد الشراء.</p>'),
  support:supportSheet,
  storeEdit:()=>{if(!ownStore||!canSell())return;sheet(head('هوية متجري')+`<label for="editStoreName">اسم المتجر</label><input id="editStoreName" maxlength="100" value="${esc(ownStore.name)}"><label for="editStoreImage">صورة المتجر</label>${ownStore.image_url?`<img class="mp-store-image-preview" src="${esc(ownStore.image_url)}" alt="صورة المتجر الحالية"><label><input id="removeStoreImage" type="checkbox"> إزالة الصورة الحالية</label>`:''}<input id="editStoreImage" type="file" accept="image/*"><p class="mp-deal-note">تظهر الصورة في قائمة المتاجر وفي صفحة متجرك.</p><label for="editStoreDescription">نبذة عن المتجر</label><textarea id="editStoreDescription" maxlength="1000" rows="3">${esc(ownStore.description||'')}</textarea><label for="editStorePhone">رقم المتجر</label><input id="editStorePhone" type="tel" value="${esc(ownStore.phone||'')}">${storeLocationFields('edit',ownStore)}<button class="buy" data-a="storeSave">حفظ معلومات المتجر</button>`)},
  storeSave:()=>act(async()=>{
   if(storeSaveBusy||!ownStore||!canSell())return;
   const storeId=ownStore.id,name=val('editStoreName'),phone=val('editStorePhone').replace(/\D/g,''),address=val('editStoreAddress'),kind=val('editStoreKind'),description=val('editStoreDescription'),file=$('#editStoreImage')?.files?.[0];
   let image_path=$('#removeStoreImage')?.checked?null:ownStore.image_path;
   if(name.length<2||name.length>100||phone.length<10||address.length<3||!kind){toast('أكمل اسم المتجر والهاتف والعنوان');return}
   if(file&&(!file.type.startsWith('image/')||file.size>10485760)){toast('اختر صورة بحجم أقل من ١٠ ميغابايت');return}
   const button=$('[data-a="storeSave"]');storeSaveBusy=true;if(button)button.disabled=true;
   try{
    if(file){const blob=await prepareStoreImage(file);image_path=`${storeId}/store-${uid()}.jpg`;check(await db.storage.from('products').upload(image_path,blob,{contentType:'image/jpeg'}));}
    check(await db.rpc('save_store_location',{p_store:storeId,p_kind:kind,p_address:address}));
    check(await db.from('stores').update({name,phone,description,image_path}).eq('id',storeId).select('id').single());A.close();await refresh();toast('تم تحديث هوية المتجر');
   }finally{storeSaveBusy=false;if(button?.isConnected)button.disabled=false}
  }),
  registerDriver:()=>driverWorkspace.application(),
  claimAsk:v=>ask('ستدفع ثمن المنتج للبائع من مالك، ثم تقبض من الزبون إجمالي الطلب. هل تقبل؟','claimOrder',v),
  claimOrder:v=>act(async()=>{check(await db.rpc('claim_delivery',{p_order:v}));A.close();await refresh();driverWorkspace.assigned(1);toast('أُسند إليك الطلب')}),
  ignoreOffer:v=>act(async()=>{check(await db.rpc('decline_delivery',{p_order:v}));deliveryOffers=deliveryOffers.filter(o=>o.order_id!==v);driverPage();toast('لن يظهر لك هذا الطلب مرة أخرى')}),
  driverStepAsk:v=>{const [id,status]=v.split('|');ask(status==='delivered'?'هل سلّمت المنتج وقبضت المبلغ كاملًا؟':'هل دفعت ثمن المنتج واستلمته من البائع؟','driverStep',v)},
  driverStep:v=>act(async()=>{const [id,status]=v.split('|');check(await db.rpc('delivery_step',{p_order:id,p_status:status}));A.close();await refresh();driverWorkspace.assigned(status==='delivered'?3:2);toast('تم تحديث الطلب')}),
  paySheet:()=>sheet(head('إثبات تحويل المستحقات')+`<p>حوّل إلى رقم Qi: <b dir="ltr">${esc(deliverySettings.qi_number||'لم يُحدد بعد')}</b></p><label for="payAmount">المبلغ المحوّل بالدينار</label><input id="payAmount" type="number" min="1" value="${driverAccount?.amount_due||''}"><label for="payRef">رقم العملية أو تفاصيل الوصل</label><input id="payRef" maxlength="400"><p class="note">لا يُخصم المبلغ حتى يتحقق المدير من وصوله ويؤكد الاستلام.</p><button class="buy" data-a="sendPayment">إرسال طلب التأكيد</button>`),
  sendPayment:()=>act(async()=>{const amount=+val('payAmount'),receipt=val('payRef');if(!Number.isInteger(amount)||amount<1||receipt.length<3){toast('أدخل المبلغ ورقم العملية');return}check(await db.rpc('submit_delivery_payment',{p_amount:amount,p_receipt:receipt}));A.close();await refresh();toast('أُرسل طلب المراجعة إلى المدير')}),
  approveDriver:v=>act(async()=>{if(profile?.role!=='admin'||profile?.disabled)return;const w=D.drivers.find(x=>x.user_id===v);if(!w)return;check(await db.rpc('admin_approve_driver',{p_driver:v,p_approved:!w.approved}));A.close();await refresh();toast('تم تحديث عامل التوصيل')}),
  deliveryConfig:()=>sheet(head('إعداد التوصيل')+`<label>حصة التطبيق لكل طلب (د.ع)</label><input id="cfgFee" type="number" min="0" value="${deliverySettings.platform_fee}"><label>أجرة عامل التوصيل لكل طلب (د.ع)</label><input id="cfgDelivery" type="number" min="0" value="${deliverySettings.delivery_fee}"><label>رقم Qi المخصص للتطبيق</label><input id="cfgQi" value="${esc(deliverySettings.qi_number)}"><button class="buy" data-a="saveDeliveryConfig">حفظ</button>`),
  saveDeliveryConfig:()=>act(async()=>{const fee=+val('cfgFee'),delivery=+val('cfgDelivery');if(!Number.isInteger(fee)||!Number.isInteger(delivery)||fee<0||delivery<0){toast('أدخل مبالغ صحيحة');return}check(await db.rpc('admin_set_delivery_settings',{p_platform_fee:fee,p_delivery_fee:delivery,p_qi_number:val('cfgQi')}));A.close();await refresh();toast('تم حفظ الأسعار للطلبات الجديدة')}),
  reviewPayment:v=>{const [id,yes]=v.split('|');ask(yes==='true'?'تأكدت من وصول المبلغ إلى بطاقتك؟ سيتم خصمه من مستحقات العامل.':'رفض طلب التحويل؟','confirmPayment',v)},
  confirmPayment:v=>act(async()=>{const [id,yes]=v.split('|');check(await db.rpc('admin_review_delivery_payment',{p_payment:id,p_approved:yes==='true'}));A.close();await refresh();toast('تمت مراجعة التحويل')}),
  saveprofile:()=>act(async()=>{if(!user)return;const name=val('pfname'),phone=val('pfphone').replace(/\D/g,'');if(name.length<2||phone.length<10){toast('اكتب الاسم ورقم هاتف صحيح');return}check(await db.from('profiles').update({full_name:name,phone}).eq('id',user.id));await refresh();toast('تم حفظ الملف الشخصي')}),
  changeaccount:()=>ask('تسجيل الخروج والانتقال إلى حساب آخر؟','out',''),
  geolocate:()=>chooseCheckoutLocation(),
  roleExisting:v=>act(()=>existingRole(v)),
  roleRequest:v=>act(()=>requestRole(v)),
  enter:v=>{if(db.preview&&['buyer','seller','driver'].includes(v)){db.preview.selectRole(v);return}if(sellerAccount()&&v==='buyer'){buyerAccountLogin();return}if(v==='buyer'){act(buyerEntry);return}if(['seller','driver'].includes(v)){roleAccess(v);return}closeAccountMenu();if(v==='guest'){rememberMode('guest');tab='market';render();scrollTo(0,0)}},
  switchrole:v=>{if(db.preview){db.preview.selectRole(v);return}if(sellerAccount()&&v!=='seller'){buyerAccountLogin();return}if(v==='seller'&&!canSell()){sellerRequest();return}rememberMode(v);tab=['seller','driver'].includes(v)?'account':'market';render();scrollTo(0,0)},
  tab:v=>{closeAccountMenu();captureCheckout();if(v==='myMarket'&&viewMode!=='seller'&&!ADMIN_PORTAL){A.cart();return}if(['market','stores'].includes(v)&&viewMode!=='seller'&&!ADMIN_PORTAL){marketSection(v);return}if(viewMode==='buyer'&&['listings','postPage'].includes(v)){toast('انتقل إلى وضع البائع من حسابي أولًا');return}if(v==='market'){cat='all';q='';filt.min='';filt.max='';filt.sort='newest'}tab=v;render();scrollTo(0,0)},
  allocateReserve:v=>{const [pid,vid]=v.split('|'),p=prod(pid);if(!p||(p.mid!==ownStore?.id&&profile?.role!=='admin')||!p.legacy_stock_reserve)return;sheet(head('توزيع مرتجع قديم')+`<p>الكمية التي لم تحدد نسختها: ${p.legacy_stock_reserve}</p><label for="reserveQty">الكمية التي تخص هذه النسخة</label><input id="reserveQty" type="number" min="1" max="${p.legacy_stock_reserve}" value="1"><button class="buy" data-a="saveReserve" data-v="${v}">تأكيد توزيع الكمية</button>`);},
  saveReserve:v=>act(async()=>{const [pid,vid]=v.split('|'),qty=Number(val('reserveQty'));check(await db.rpc('allocate_legacy_variant_stock',{p_product:pid,p_variant:vid,p_quantity:qty}));await refresh();A.close();render();toast('تم توزيع المرتجع على النسخة المحددة');}),
  catalogEdit:v=>catalogManager.show(v),
  adminTab:v=>{if(profile?.role!=='admin'||profile?.disabled)return;adminTab=v;adminFilter='all';adminSearch='';adminDetail=null;admin();scrollTo(0,0)},
  adminDetail:v=>{if(profile?.role!=='admin'||profile?.disabled)return;const [kind,id]=v.split('|');adminDetail={kind,id};admin();scrollTo(0,0)},
  adminBack:()=>{adminDetail=null;admin();scrollTo(0,0)},
  adminRefresh:()=>act(async()=>{await refresh();toast('تم تحديث البيانات')}),
  adminOrder:v=>{if(profile?.role!=='admin'||profile?.disabled)return;adminDetail={kind:'order',id:v};admin();scrollTo(0,0)},
  adminDriverAsk:v=>{if(profile?.role!=='admin'||profile?.disabled)return;const w=D.drivers.find(x=>x.user_id===v);if(!w)return;ask(w.approved?'إيقاف السائق عن قبول طلبات جديدة؟ ستبقى طلباته السابقة محفوظة.':'الموافقة على تسجيل هذا السائق؟','approveDriver',v)},
  adminStat:v=>{if(profile?.role!=='admin'||profile?.disabled)return;adminSearch='';adminTab=v==='pending'?'sellers':v==='accounts'?'customers':'activity';adminFilter=v==='accounts'?'all':v;admin();$('#adminResults')?.scrollIntoView({block:'start',behavior:'smooth'})},
  adminListFilter:v=>{adminFilter=v;admin();$('#adminResults')?.scrollIntoView({block:'start',behavior:'smooth'})},
  cat:v=>{cat=v;tab='catalog';render()},
  pickcat:v=>{cat=v;q='';filt.min='';filt.max='';filt.sort='newest';openCatalog()},
  storeCategory:v=>{cat=v;render();},
  allcat:()=>{cat='all';tab='catalog';render()},
  searchfocus:()=>{$('#q')?.focus();$('#q')?.scrollIntoView({block:'center',behavior:'instant'})},
  searchcat:v=>{q=val('q');filt.min=val('fmin');filt.max=val('fmax');cat=v;searchPage()},
  searchsort:v=>{q=val('q');filt.min=val('fmin');filt.max=val('fmax');filt.sort=v;searchPage()},
  searchapply:()=>{const min=$('#fmin')?val('fmin'):filt.min,max=$('#fmax')?val('fmax'):filt.max;if((min&&+min<0)||(max&&+max<0)||(min&&max&&+min>+max)){toast('تحقق من حدود السعر');return}q=val('q');filt.min=min;filt.max=max;publicStoreId=null;if(tab!=='stores')tab='catalog';A.close();render()},
  searchclear:()=>{q='';cat='all';filt.min='';filt.max='';filt.sort='newest';searchPage()},
  banner:v=>{bannerIndex=+v;updateBanner()},
  filters:filterSheet,
  fcat:v=>{cat=v;filterSheet()},
  fsort:v=>{filt.sort=v;filterSheet()},
  fapply:()=>{const min=val('fmin'),max=val('fmax');if((min&&+min<0)||(max&&+max<0)||(min&&max&&+min>+max)){toast('تحقق من حدود السعر');return}filt.min=min;filt.max=max;A.close();market()},
  fclear:()=>{cat='all';filt.min='';filt.max='';filt.sort='newest';A.close();market()},
  info:infoSheet,
  inforole:v=>{infoRole=v;infoSheet()},
  notifications:()=>act(()=>activity.show()),
  reloadNotice:()=>act(()=>activity.poll()),
  react:v=>act(async()=>{const [id,kind]=v.split('|');if(await activity.react(id,kind))psheet()}),
  favorites:()=>act(async()=>{if(!user){A.enter('buyer');return}await activity.poll();const list=D.p.filter(p=>activity.favorites().includes(p.id)&&p.active&&!p.blocked);sheet(head('المفضلة')+(list.length?window.SouqMarketplace.productCards(list,{esc,fmt,thumb,mname}):'<div class="empty">لم تضف مواد إلى المفضلة بعد.</div>'))}),
  addentry:()=>{if(!canSell()){sellerRequest();return}if(!user){A.enter('seller');return}if(profile?.disabled){toast('هذا الحساب معطّل');return}if(viewMode!=='seller'&&profile?.role!=='admin'){toast('انتقل إلى وضع البائع من حسابي أولًا');return}if(!ownStore){lsheet('store');return}if(ownStore.removed){toast('أزالت الإدارة هذا البائع من السوق');return}fsheet('')},
  close:closePage,
  back:goBack,
  prod:v=>{if(sellerAccount()||(viewMode==='seller'&&ownStore)){if(prod(v)?.mid===ownStore.id)fsheet(v);return}cur={p:prod(v),n:1};psheet()},
  pq:v=>{const n=Math.max(1,cur.n+ +v);if(n>100){toast('الحد الأقصى للطلب الواحد ١٠٠ قطعة');return}if(n>(selectedProduct(cur.p,cur.vid)?.stock||0)){toast('الكمية المطلوبة غير متوفرة حاليًا');return}cur.n=n;psheet()},
  add:()=>{if(sellerAccount()){buyerAccountLogin();return}const {p,n}=cur,chosen=selectedProduct(p,cur.vid);if(!chosen){toast('اختر النسخة المطلوبة');return}const key=cartKey({pid:p.id,vid:cur.vid}),c=D.cart.find(x=>cartKey(x)===key),quantity=(c?.q||0)+n;if(quantity>100){toast('الحد الأقصى للطلب الواحد ١٠٠ قطعة');return}if(!p.active||p.blocked||quantity>chosen.stock){toast('المنتج أو الكمية المطلوبة غير متوفرة حاليًا');return}if(requirePurchaseLogin())return;if(c)c.q=quantity;else D.cart.push({pid:p.id,vid:cur.vid||null,q:n});save();A.close();render();toast('أُضيف للسلة')},
  cart:()=>{if(sellerAccount()){buyerAccountLogin();return}A.close();cartReceipt=null;tab='cartPage';render();scrollTo(0,0)},
  cartRemove:v=>{captureCheckout();D.cart=D.cart.filter(c=>cartKey(c)!==v);save();render()},
  cq:v=>{captureCheckout();const [id,d]=v.split('|'),c=D.cart.find(x=>cartKey(x)===id),p=c?selectedProduct(prod(c.pid),c.vid):null;if(!c)return;const quantity=c.q+ +d;if(+d>0&&(!p||quantity>p.stock||quantity>100)){toast('الكمية المطلوبة غير متوفرة لهذا الطلب');return}if(quantity<1)D.cart=D.cart.filter(x=>x!==c);else c.q=quantity;save();render()},
  order:()=>act(async()=>{
    captureCheckout();
    if(sellerAccount()){buyerAccountLogin();return}
    if(!user||viewMode==='guest'){A.close();A.enter('buyer');toast('سجّل الدخول لإرسال الطلب');return}
    if(profile?.disabled){toast('هذا الحساب معطّل');return}
    const name=val('cn'),phone=val('cp').replace(/\D/g,''),addr=val('ca'),note=val('cno');
    const orderNote=[note,geoPoint?'موقع الزبون: https://www.google.com/maps?q='+geoPoint.lat+','+geoPoint.lon:''].filter(Boolean).join(' | ');
    if(name.length<2||addr.length<3||!/^\d{10,11}$/.test(phone)){toast('اكتب الاسم ورقم هاتف صحيح والعنوان');return}
    const latestFees=check(await withTimeout(db.from('delivery_settings').select('*').limit(1).single()));
    if(latestFees.platform_fee!==deliverySettings.platform_fee||latestFees.delivery_fee!==deliverySettings.delivery_fee){deliverySettings=latestFees;toast('تغيرت أجور الطلب. راجع الإجمالي ثم أرسل من جديد');csheet();return}
    if(!D.cart.length){toast('السلة فارغة');return}if(cartRows().some(x=>!x.p||!x.p.active||x.p.blocked||x.p.stock<x.c.q)){toast('راجع النسخ والكمية غير المتاحة في السلة');csheet();return}
    const groups=new Map();for(const c of D.cart){const p=prod(c.pid);if(!p)throw Error('product unavailable');if(!groups.has(p.mid))groups.set(p.mid,[]);groups.get(p.mid).push({id:p.id,variant_id:c.vid||null,quantity:c.q})}
    const ids=[];for(const [store,lines] of groups){
      const id=check(await db.rpc('place_order',{p_store:store,p_lines:lines,p_name:name,p_phone:phone,p_address:addr,p_note:orderNote}));
      ids.push('#'+id.slice(-4).toUpperCase());D.cart=D.cart.filter(c=>!lines.some(l=>l.id===c.pid&&(l.variant_id||null)===(c.vid||null)));save();
    }
    D.cust={name,phone,addr};geoPoint=null;checkoutNote='';save();cartReceipt=ids;await refresh();

    tab='cartPage';render();scrollTo(0,0);
  }),
  login:v=>lsheet(v),
  dologin:m=>act(async()=>{
    const email=val('lp'),password=val('lk');if(!email.includes('@')||password.length<6){toast('اكتب البريد وكلمة مرور من 6 أحرف على الأقل');return}
    const button=$('#sheet [data-a="dologin"]');
    if(button.disabled)return;
    button.disabled=true;button.textContent='جارٍ الاتصال…';
    try{
      let signedIn;
      if(m==='r'){
        const name=val('ln'),phone=val('lphone').replace(/[\s()+-]/g,'');if(name.length<2){toast('اكتب اسمك');return}if(phone&&!/^[0-9]{10,15}$/.test(phone)){toast('اكتب رقم هاتف صحيح');$('#lphone')?.focus();return}if(password!==val('lkConfirm')){toast('كلمتا المرور غير متطابقتين');$('#lkConfirm')?.focus();return}
        const data=check(await withTimeout(db.auth.signUp({email,password,options:{data:{full_name:name,contact_phone:phone},emailRedirectTo:pendingPurchase?purchaseAuthRedirect():location.origin+location.pathname}})));
        if(!data.session){if(pendingPurchase){lsheet('m');toast('تحقق من بريدك الإلكتروني، ثم سجّل الدخول للعودة إلى المادة')}else{A.close();toast('تحقق من بريدك الإلكتروني، ثم سجّل الدخول')}return}
        signedIn=data.user;
      }else signedIn=check(await withTimeout(db.auth.signInWithPassword({email,password}))).user;
      user=signedIn;rememberMode(['seller','driver'].includes(viewMode)?viewMode:'buyer');profile=null;ownStore=null;if(pendingPurchase){await refresh();toast('تم الدخول؛ يمكنك متابعة شراء المادة');return}dt='m';tab=['seller','driver'].includes(viewMode)?'account':'market';A.close();render();toast('تم الدخول');
      await refresh();
    }finally{
      if(button.isConnected){button.disabled=false;button.textContent=m==='r'?'إنشاء الحساب':'دخول'}
    }
  }),
  register:()=>sellerRequest(),
  out:()=>act(async()=>{check(await db.auth.signOut());clearPurchaseReturn();user=null;profile=null;ownStore=null;D.people=[];D.drivers=[];D.driverProfiles=[];D.o=[];deliveryPayments=[];adminDetail=null;viewMode='guest';tab='market';dt='p';render();refresh().catch(error)}),
  dtab:v=>{dt=v;render()},
  pform:v=>{if(!canSell()){sellerRequest();return}if(viewMode!=='seller'&&profile?.role!=='admin'){toast('انتقل إلى وضع البائع من حسابي أولًا');return}fsheet(v)},
  psave:()=>act(saveProduct),
  pdel:(v,source)=>confirmProductDelete(v,source),
  cancelProductDelete:()=>{const panel=document.querySelector('.product-delete-confirm'),card=panel?.closest('.sw-product,.item');panel?.remove();card?.querySelector('[data-a="pdel"]')?.focus();},
  pdel2:v=>act(async()=>{if(!canSell()||!ownStore||!D.p.some(p=>p.id===v&&p.mid===ownStore.id))return;check(await db.from('products').delete().eq('id',v).eq('store_id',ownStore.id));await refresh();A.close();render()}),
  st:v=>act(async()=>{const o=D.o.find(x=>x.id===v);if(!o)return;check(await db.rpc('set_order_status',{p_order:v,p_status:STCODE[Math.min(3,o.st+1)]}));await refresh()}),
  cancel:v=>ask('إلغاء هذا الطلب؟','cancel2',v),
  cancel2:v=>act(async()=>{check(await db.rpc('set_order_status',{p_order:v,p_status:'cancelled'}));await refresh();A.close();render()}),
  mok:v=>act(async()=>{const m=mrec(v);check(await db.rpc('approve_store',{p_store:v,p_approved:!m.ok}));await refresh()}),
  userDisableAsk:v=>{if(profile?.role!=='admin')return;const p=D.people.find(x=>x.id===v);if(!p||p.role==='admin')return;ask(p.disabled?'إعادة تفعيل هذا الحساب؟':'تعطيل هذا الحساب ومنعه من الطلب أو البيع؟ ستبقى الطلبات السابقة محفوظة.','userDisable2',v)},
  userDisable2:v=>act(async()=>{if(profile?.role!=='admin')return;const p=D.people.find(x=>x.id===v);if(!p)return;check(await db.rpc('admin_set_account_disabled',{p_user:v,p_disabled:!p.disabled}));A.close();await refresh();toast('تم تحديث الحساب')}),
  storeRemoveAsk:v=>{if(profile?.role!=='admin')return;const m=mrec(v);if(!m.id)return;ask(m.removed?'إعادة هذا البائع إلى قائمة المراجعة؟ ستحتاج إلى قبوله من جديد.':'إزالة هذا البائع ومنتجاته من السوق؟ تبقى الطلبات السابقة محفوظة.','storeRemove2',v)},
  storeRemove2:v=>act(async()=>{if(profile?.role!=='admin')return;const m=mrec(v);check(await db.rpc('admin_set_store_removed',{p_store:v,p_removed:!m.removed}));A.close();await refresh();toast('تم تحديث البائع')}),
  productBlockAsk:v=>{if(profile?.role!=='admin')return;const p=prod(v);if(!p)return;ask(p.blocked?'إعادة هذا المنتج للظهور إذا كان متجره معتمدًا؟':'إزالة هذا المنتج من السوق؟ ستبقى تفاصيل الطلبات السابقة محفوظة.','productBlock2',v)},
  productBlock2:v=>act(async()=>{if(profile?.role!=='admin')return;const p=prod(v);check(await db.rpc('admin_set_product_blocked',{p_product:v,p_blocked:!p.blocked}));A.close();await refresh();toast('تم تحديث المنتج')}),
  adminAcceptAsk:v=>{if(profile?.role==='admin')ask('تحديث حالة هذا الطلب إلى مقبول؟','adminAccept2',v)},
  adminAccept2:v=>act(async()=>{if(profile?.role!=='admin')return;check(await db.rpc('set_order_status',{p_order:v,p_status:'accepted'}));A.close();await refresh();toast('تم قبول الطلب')}),
  adminCancelAsk:v=>{if(profile?.role==='admin')ask('إلغاء هذا الطلب وإعادة الكمية إلى المخزون؟','adminCancel2',v)},
  adminCancel2:v=>act(async()=>{if(profile?.role!=='admin')return;check(await db.rpc('set_order_status',{p_order:v,p_status:'cancelled'}));A.close();await refresh();toast('تم إلغاء الطلب')}),
  comm:()=>{toast('إعداد العمولة يحتاج تفعيلًا في قاعدة البيانات')}

};
const productEditor=createProductEditor({categories:()=>D.catalog||[],getProduct:prod,toast,base:()=>({price:Number(val('fpr'))||0}),upload:async file=>{const blob=await prepareStoreImage(file),path=`${ownStore.id}/${uid()}.jpg`;check(await db.storage.from('products').upload(path,blob,{contentType:'image/jpeg'}));return path;}});
const catalogManager=createCatalogAdmin({categories:()=>D.catalog||[],db,check,sheet,head,toast,refresh,render});
const workspace=createSellerWorkspace({db,esc,fmt,when,thumb,status:ST,bell:bellIcon,editProduct:fsheet,inventoryVariants:p=>inventoryVariants(p,fmt),stockMovements:()=>D.stockMovements||[],driverContact:c=>driverContact(c,esc),check,sheet,head,toast,refresh,render,run:act,close:()=>A.close(),tab:v=>{tab=v;render();scrollTo(0,0)},buyerAccount:buyerAccountLogin,get:()=>({store:ownStore,data:D,profile,mode:viewMode,canSell:canSell()}),publicStore:id=>{publicStoreId=id;tab=id?'market':viewMode==='seller'?'account':'stores';const url=new URL('./',location.href);if(id)url.searchParams.set('store',id);else if(tab==='stores')url.searchParams.set('view','stores');history.pushState(null,'',url);render();scrollTo(0,0)}});
const activity=createActivityCenter({db,esc,fmt,when,check,error,run:act,login:()=>A.enter('buyer'),get:()=>({user,profile,mode:viewMode,driver:driverAccount,adminPortal:ADMIN_PORTAL}),offers:rows=>{deliveryOffers=rows},driverOrders:()=>driverWorkspace.available(),product:id=>A.prod(id),order:showOrderNotice});
const driverWorkspace=createDriverWorkspace({db,esc,fmt,when,status:ST,bell:bellIcon,check,sheet,head,toast,refresh,run:act,noticeSync:()=>activity.sync(),tab:v=>{tab=v;render()},get:()=>({user,profile,driver:driverAccount,driverProfile,data:D,offers:deliveryOffers,payments:deliveryPayments})});
db.preview?.init({sheet,close:()=>A.close(),role:role=>{refreshId++;dataReady=false;user=null;profile=null;ownStore=null;driverAccount=null;driverProfile=null;D.cart=[];D.o=[];activity.close();viewMode=role||'guest';rememberMode(viewMode);publicStoreId=null;tab=role==='buyer'?'market':'account';history.replaceState(null,'',new URL('preview.html',location.href));A.close();render();refresh().catch(error);},navigate:url=>{publicStoreId=url.searchParams.get('store');tab=publicStoreId?'market':url.searchParams.get('view')==='stores'?'stores':'market';cat=url.searchParams.get('category')||'all';q=url.searchParams.get('q')||'';const route=new URL('preview.html',location.href);route.search=url.search;history.pushState(null,'',route);A.close();render();scrollTo(0,0);}});
async function showOrderNotice(id){
 const row=check(await db.from('orders').select('*,order_items(*)').eq('id',id).single()),o={...fromOrder(row),buyer_id:row.buyer_id,driver_id:row.driver_id,platform_fee:row.platform_fee||0,delivery_fee:row.delivery_fee||0};
 const contacts=check(await db.rpc('assigned_delivery_contacts'))||[];D.driverContacts=contacts;
 if(viewMode==='driver'){await refresh();driverWorkspace.assigned(o.st);return;}
 sheet(head('تفاصيل الطلب '+sid(o))+ordCard(o,ownStore?.id===o.mid)+driverContact(contacts.find(c=>c.order_id===id),esc));
}
document.addEventListener('change',e=>{if(e.target.id==='buyerVariant'){cur.vid=e.target.value||null;cur.n=1;psheet();return}const prefix=e.target.dataset.location;if(!prefix)return;const online=e.target.value==='online';document.getElementById(prefix+'LocationLabel').textContent=online?'عنوان استلام البضاعة للسائق':'عنوان المحل أو المتجر';document.getElementById(prefix+'LocationNote').textContent=online?'عنوان الاستلام خاص بك وبالسائق المكلّف، ولا يظهر للزبائن.':'عنوان المحل إلزامي ويظهر للزبائن والسائق.';});
document.addEventListener('click',e=>{
  if(e.target.id==='shade'){A.close();return}
  if(!e.target.closest('#accountMenu')&&!e.target.closest('#accountTrigger'))closeAccountMenu();
  const t=e.target.closest('[data-a]');if(t?.matches('#authForm [type="submit"],#sellerJoinForm [type="submit"],#productCreateForm [type="submit"]'))return;if(t&&A[t.dataset.a])A[t.dataset.a](t.dataset.v,t);
});
document.addEventListener('change',async e=>{
  if(e.target.id==='avatarInput'&&e.target.files[0]){
    if(!user)return;const id=user.id,file=e.target.files[0];if(!file.type.startsWith('image/')){toast('اختر صورة فقط');return}
    const url=URL.createObjectURL(file),im=new Image();im.onload=()=>{URL.revokeObjectURL(url);if(user?.id!==id)return;const scale=Math.min(1,160/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*scale));c.height=Math.max(1,Math.round(im.height*scale));c.getContext('2d').drawImage(im,0,0,c.width,c.height);try{localStorage.setItem('souq-shatra-avatar-'+id,c.toDataURL('image/jpeg',.72));render();toast('تم حفظ صورتك على هذا الجهاز')}catch{toast('تعذّر حفظ الصورة. اختر صورة أصغر')}};im.onerror=()=>{URL.revokeObjectURL(url);toast('تعذّر قراءة الصورة')};im.src=url;return
  }
  if(e.target.id!=='pimg'||!e.target.files[0])return;
  const im=new Image();im.onload=()=>{const s=Math.min(1,480/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=im.width*s;c.height=im.height*s;c.getContext('2d').drawImage(im,0,0,c.width,c.height);cur.img=c.toDataURL('image/jpeg',.72);$('#pv').innerHTML=`<img src="${cur.img}" alt="">`;updatePostProgress()};
  im.src=URL.createObjectURL(e.target.files[0]);
});
document.addEventListener('input',e=>{if(e.target.id==='q'){q=e.target.value;publicStoreId=null;if(tab!=='stores')tab='catalog';clearTimeout(A.searchTimer);A.searchTimer=setTimeout(()=>render(),150);}if(['fn','fpr','fs','fd'].includes(e.target.id))updatePostProgress()});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='q'){e.preventDefault();A.searchapply();return}if(e.key==='Escape'){if(document.querySelector('.product-delete-confirm')){A.cancelProductDelete();return}closeAccountMenu();if(ADMIN_PORTAL)A.close();else A.back()}});
document.addEventListener('submit',e=>{if(e.target.id==='customerPhoneForm'){e.preventDefault();A.saveCustomerPhone();return}if(e.target.id==='buyerSearch'){e.preventDefault();clearTimeout(A.searchTimer);A.searchapply();return}if(e.target.id==='authForm'){e.preventDefault();A.dologin(e.target.dataset.mode)}});
function updateBanner(){const banner=$('.banner');if(!banner)return;banner.querySelector('img').src=BANNERS[bannerIndex][0];banner.querySelector('.banner-caption').textContent=BANNERS[bannerIndex][1];document.querySelectorAll('.banner-dots button').forEach((b,i)=>b.setAttribute('aria-current',String(i===bannerIndex)))}
let bannerTouch=null,lastBannerInteraction=0;
$('#view').addEventListener('touchstart',e=>{
  bannerTouch=e.touches.length===1&&e.target.closest('.banner')?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;
},{passive:true});
$('#view').addEventListener('touchend',e=>{
  if(!bannerTouch||e.changedTouches.length!==1)return;
  const dx=e.changedTouches[0].clientX-bannerTouch.x,dy=e.changedTouches[0].clientY-bannerTouch.y;
  bannerTouch=null;
  if(Math.abs(dx)<40||Math.abs(dx)<Math.abs(dy)*1.2)return;
  bannerIndex=(bannerIndex+(dx<0?1:-1)+BANNERS.length)%BANNERS.length;
  lastBannerInteraction=Date.now();updateBanner();
},{passive:true});
$('#view').addEventListener('touchcancel',()=>{bannerTouch=null},{passive:true});
if(!matchMedia('(prefers-reduced-motion: reduce)').matches)setInterval(()=>{if(['market','welcome'].includes(tab)&&!document.hidden&&Date.now()-lastBannerInteraction>5500){bannerIndex=(bannerIndex+1)%BANNERS.length;updateBanner()}},5500);
db.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')setTimeout(recoverySheet,0)});
if(!ADMIN_PORTAL)window.SouqDemo?.init(render);
window.addEventListener('popstate',()=>{const params=new URLSearchParams(location.search);publicStoreId=params.get('store');if(!/^[0-9a-f-]{36}$/i.test(publicStoreId||''))publicStoreId=null;tab=publicStoreId?'market':params.get('view')==='stores'?'stores':params.get('view')==='materials'||location.pathname.endsWith('/catalog.html')?'catalog':'market';cat=params.get('category')||'all';q=params.get('q')||'';A.close();render()});
render();
refresh().catch(e=>{
  if(!dataReady&&!window.SouqDemo?.isActive()){
    render();
  }
  error(e);
});
setInterval(()=>{if(!document.hidden&&user&&dataReady&&((viewMode==='driver'&&['chats','account'].includes(tab))||(profile?.role==='admin'&&ADMIN_PORTAL)||(ownStore&&!ownStore.ok&&!ownStore.removed)))refresh().catch(()=>{})},60000);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(() => {}));
}
