import {CATALOG_SEEDS} from './category-seeds.js?v=62';
/* Completely local adapter. This module never imports Supabase or calls fetch. */
export const PREVIEW_KEY='souq-shatra-interface-preview-v1';
export const IDS={buyer:'a1000000-0000-4000-8000-000000000001',seller:'a1000000-0000-4000-8000-000000000002',driver:'a1000000-0000-4000-8000-000000000003',admin:'a1000000-0000-4000-8000-000000000004',store:'a2000000-0000-4000-8000-000000000001'};
const clone=x=>JSON.parse(JSON.stringify(x));
const labels={buyer:'الزبون',seller:'التاجر',driver:'سائق التوصيل'};
const fail=message=>{throw new Error(message)};
// Shirt and bag can be returned; food (dates) cannot.
const SEED_RETURNABLE=[true,false,true],SEED_IDS=[1,2,3].map(n=>'a3000000-0000-4000-8000-00000000000'+n);
export function previewFixture(now=new Date().toISOString()){
 return {customer_addresses:[],catalog_categories:clone(CATALOG_SEEDS),product_variants:[],product_stock_movements:[],version:1,profiles:Object.entries(labels).map(([role,label])=>({id:IDS[role],role,full_name:'معاينة '+label,phone:'00000000000',disabled:false,created_at:now})),stores:[{id:IDS.store,owner_id:IDS.seller,name:'متجر المعاينة',description:'مواد محلية للتجربة فقط — لا توجد مبيعات حقيقية.',phone:'00000000000',address:'عنوان محل تجريبي',store_kind:'physical',approved:true,removed:false,created_at:now,storefront_settings:{},image_path:null}],products:[['قميص تجريبي','ملابس',10000,20],['تمور تجريبية','تمور',5000,12],['حقيبة تجريبية','أخرى',15000,8]].map(([name,category,price,stock],i)=>({id:'a3000000-0000-4000-8000-00000000000'+(i+1),store_id:IDS.store,name,category,price,stock,description:'هذا منتج مخصص لاختبار الواجهة، ولا يظهر في السوق الحقيقي.',active:true,blocked:false,created_at:now,image_path:null,compare_at_price:i===0?12000:null,low_stock_threshold:5,attributes:{_returnable:SEED_RETURNABLE[i]}})),orders:[],order_items:[],order_customer_actions:[],product_interactions:[],account_notifications:[],delivery_workers:[{user_id:IDS.driver,approved:true,amount_due:0,debt_limit:5000}],driver_profiles:[{user_id:IDS.driver,full_name:'معاينة سائق التوصيل',phone:'00000000000',email:'preview-driver@example.invalid',address:'عنوان تجريبي',vehicle:'وسيلة توصيل تجريبية'}],delivery_zones:[{id:'shatra',name:'الشطرة',fee:2000,enabled:true},{id:'nasr',name:'مدينة النصر',fee:5000,enabled:true},... [['dawaya','مدينة الدواية',5000],['bidaa','مدينة البدعة',3000],['seven_april','سبعة نيسان',3000]].map(([id,name,fee])=>({id,name,fee,enabled:true}))],delivery_settings:[{id:1,platform_fee:0,delivery_fee:2000,qi_number:'رقم تجريبي — لا تحوّل أموالًا'}],delivery_payments:[],delivery_declines:[],store_pickups:[{store_id:IDS.store,pickup_address:'عنوان محل تجريبي'}],seller_workspace_settings:[],seller_categories:['ملابس','تمور','أخرى'].map((name,i)=>({id:'category-'+i,store_id:IDS.store,name,active:true,deleted_at:null,created_at:now})),seller_customers:[],images:{}};
}
export function createPreviewModel(storage,uuid=()=>crypto.randomUUID(),clock=()=>new Date().toISOString()){
 let data,role=null,lastRead=null,lastWritten=null;
 const readRaw=()=>{try{return storage.getItem(PREVIEW_KEY)}catch{return null}};
 function load(text){let next=null;try{next=JSON.parse(text)}catch{}if(!next||next.version!==1||!Array.isArray(next.orders)||!Array.isArray(next.products))next=previewFixture(clock());
  // Test data saved before «قابل للإرجاع؟» existed: give the three sample products their answer.
  // Older test data charged a 500 «حصة التطبيق»; the app's share is now a private arrangement with merchants.
  if(next.delivery_settings?.[0]?.platform_fee===500&&!next.platform_fee_cleared){next.delivery_settings[0].platform_fee=0;next.platform_fee_cleared=true;}
  next.products.forEach(p=>{const i=SEED_IDS.indexOf(p.id);if(i>=0&&typeof p.attributes?._returnable!=='boolean')p.attributes={...(p.attributes||{}),_returnable:SEED_RETURNABLE[i]};});
  next.customer_addresses||=[];next.delivery_zones||=previewFixture(clock()).delivery_zones;next.catalog_categories||=clone(CATALOG_SEEDS);next.product_variants||=[];next.product_stock_movements||=[];data=next;}
 lastRead=readRaw();load(lastRead);
 // Several preview windows (customer, merchant, driver) share one local store: before each read or write, pick up what another window saved.
 function sync(){const text=readRaw();if(text!==null&&text!==lastRead&&text!==lastWritten)load(text);lastRead=text;}
 const save=()=>{const text=JSON.stringify(data);storage.setItem(PREVIEW_KEY,text);lastWritten=text;};
 const user=()=>role?{id:IDS[role],email:'preview-'+role+'@example.invalid',user_metadata:{}}:null;
 function setRole(next){if(next!==null&&!Object.hasOwn(labels,next))fail('واجهة غير معروفة');role=next;}
 function notice(to,title,body='',order_id=null,product_id=null,kind='status',key=uuid()){
  if(!to||data.account_notifications.some(n=>n.recipient_id===to&&n.event_key===key))return;
  data.account_notifications.unshift({id:uuid(),recipient_id:to,event_key:key,event_kind:kind,title,body,order_id,product_id,read_at:null,created_at:clock()});
 }
 function movement(product,variant,delta,balance,reason,order_id=null){data.product_stock_movements.push({id:uuid(),store_id:product.store_id,product_id:product.id,variant_id:variant?.id||null,product_name:product.name,variant_label:variant?.label||null,delta,balance,reason,order_id,created_at:clock()});}
 const participants=o=>[IDS.seller,o.buyer_id,o.driver_id].filter(Boolean);
 const summary=o=>data.order_items.filter(i=>i.order_id===o.id).map(i=>i.product_name+' × '+i.quantity).join('، ');
 const ownOrder=id=>data.orders.find(o=>o.id===id);
 function visible(table){if(!Array.isArray(data[table]))fail('هذا القسم غير متاح في المعاينة المحلية');const id=user()?.id;
  const rows=data[table];if(table==='customer_addresses')return rows.filter(a=>a.user_id===id);if(table==='profiles')return rows.filter(p=>p.id===id);
  if(['account_notifications'].includes(table))return rows.filter(n=>n.recipient_id===id);
  if(['product_interactions','delivery_workers','driver_profiles','delivery_payments'].includes(table))return rows.filter(n=>n.user_id===id||n.driver_id===id);
  if(table==='orders')return rows.filter(o=>participants(o).includes(id));
  if(table==='order_items')return rows.filter(i=>participants(ownOrder(i.order_id)||{}).includes(id));
  if(['product_stock_movements'].includes(table))return role==='seller'?rows:[];
  if(['store_pickups','seller_workspace_settings','seller_customers'].includes(table))return role==='seller'?rows:[];
  return rows;
 }
 function from(table){let filters=[],sort=null,max=null,mode='select',values=null,single=false;const q={
  select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},is(k,v){filters.push(r=>(r[k]??null)===v);return q},not(k,op,v){if(op==='is')filters.push(r=>(r[k]??null)!==v);else if(op==='in'){const excluded=String(v).replace(/^\(|\)$/g,'').split(',');filters.push(r=>!excluded.includes(String(r[k])));}else throw new Error('Unsupported preview filter');return q},in(k,vs){filters.push(r=>vs.includes(r[k]));return q},order(k,opts={}){sort=[k,opts.ascending!==false];return q},limit(n){max=n;return q},single(){single=true;return q},maybeSingle(){single=true;return q},insert(v){mode='insert';values=Array.isArray(v)?v:[v];return q},update(v){mode='update';values=v;return q},delete(){mode='delete';return q},upsert(v){mode='insert';values=Array.isArray(v)?v:[v];return q},
  then(resolve,reject){return Promise.resolve().then(()=>{try{sync();
   let rows=visible(table).filter(r=>filters.every(fn=>fn(r)));
   if(mode!=='select'&&!role)fail('اختر واجهة المعاينة أولًا');
   if(mode==='insert'){rows=values.map(v=>({id:uuid(),created_at:clock(),...clone(v)}));for(const r of rows){
    if(table==='customer_addresses'&&r.user_id!==user().id)fail('address ownership');if(table==='product_interactions'){if(r.user_id!==user().id||!['like','favorite'].includes(r.kind))fail('تفاعل غير صالح');if(data[table].some(x=>x.user_id===r.user_id&&x.product_id===r.product_id&&x.kind===r.kind))fail('التفاعل محفوظ بالفعل');const p=data.products.find(p=>p.id===r.product_id);if(!p)fail('المنتج غير متوفر');notice(IDS.seller,r.kind==='like'?'إعجاب جديد بمنتجك':'أُضيف منتجك إلى المفضلة',p.name,null,p.id,r.kind,'reaction:'+r.user_id+':'+p.id+':'+r.kind);}
    if(['products','seller_categories','seller_customers'].includes(table)&&role!=='seller')fail('انتقل إلى واجهة التاجر');
    data[table].push(r);
   }}
   if(mode==='update'){if(['products','stores','seller_categories','seller_customers'].includes(table)&&role!=='seller')fail('انتقل إلى واجهة التاجر');rows.forEach(r=>Object.assign(r,clone(values)));}
   if(mode==='delete'){if(table==='products'&&role!=='seller')fail('انتقل إلى واجهة التاجر');data[table]=data[table].filter(r=>!rows.includes(r));}
   if(sort)rows.sort((a,b)=>String(a[sort[0]]).localeCompare(String(b[sort[0]]))*(sort[1]?1:-1));if(max!==null)rows=rows.slice(0,max);
   if(mode!=='select')save();const result=rows.map(r=>table==='orders'?{...r,order_items:data.order_items.filter(i=>i.order_id===r.id),order_customer_actions:(data.order_customer_actions||[]).filter(i=>i.order_id===r.id)}:r);return {data:clone(single?result[0]||null:result),error:null};
  }catch(error){return {data:null,error:{message:error.message}}}}).then(resolve,reject)}
 };return q;}
 async function rpc(name,p={}){try{sync();let result=null;const id=user()?.id;if(!id)fail('اختر واجهة المعاينة أولًا');
  if(name==='save_product_bundle'){
   if(role!=='seller'||p.p_store!==IDS.store)fail('انتقل إلى واجهة التاجر');let product=data.products.find(x=>x.id===p.p_id);if(p.p_id&&!product)fail('المنتج غير متاح');const input=clone(p.p_product),rows=clone(p.p_variants);if(!Array.isArray(rows)||rows.length>200)fail('invalid product bundle');for(const v of rows){const existing=data.product_variants.find(x=>x.id===v.id);if(existing&&(existing.product_id!==product?.id||existing.version!==v.version))fail('inventory changed; reload product');if(!Number.isInteger(v.stock)||v.stock<0||!Number.isInteger(v.price)||v.price<1)fail('invalid variant');}if(product&&!product.has_variants&&input.expected_stock!=null&&product.stock!==input.expected_stock)fail('inventory changed; reload product');if(!product){product={id:uuid(),store_id:IDS.store,active:true,blocked:false,created_at:clock(),low_stock_threshold:5};data.products.push(product);}const cat=data.catalog_categories.find(x=>x.id===input.catalog_category_id),root=data.catalog_categories.find(x=>x.id===cat?.parent_id)||cat;Object.assign(product,input,{category:root?.name||input.category,has_variants:rows.some(v=>!v.archived)});delete product.expected_stock;
   data.product_variants.filter(v=>v.product_id===product.id).forEach(v=>v.archived=true);
   for(const v of rows){let row=data.product_variants.find(x=>x.id===v.id);const before=row?.stock||0;if(!row){row={id:v.id||uuid(),product_id:product.id,version:0};data.product_variants.push(row);}Object.assign(row,v,{id:row.id,product_id:product.id,version:row.version+1});if(row.stock!==before)data.product_stock_movements.push({id:uuid(),store_id:IDS.store,product_id:product.id,variant_id:row.id,product_name:product.name,variant_label:row.label,delta:row.stock-before,balance:row.stock,reason:'inventory_edit',created_at:clock()});}
   if(product.has_variants){const live=data.product_variants.filter(v=>v.product_id===product.id&&!v.archived);product.stock=live.filter(v=>v.available).reduce((n,v)=>n+v.stock,0);if(product.attributes?._manual_variants!==true){product.price=Math.min(...live.map(v=>v.sale_price??v.price));product.compare_at_price=null;}}result=product.id;
  }else if(name==='set_professional_username'){
   const username=(p.p_username||'').trim().toLowerCase();if(!['seller','driver'].includes(role)||!/^[a-z][a-z0-9_]{2,29}$/.test(username))fail('professional username required');if(data.profiles.some(x=>x.id!==id&&x.username===username))fail('username taken');data.profiles.find(x=>x.id===id).username=username;for(const m of data.stores.filter(x=>x.owner_id===id))m.username=username;
  }else if(name==='delete_product_safely'){
   const product=data.products.find(x=>x.id===p.p_product);if(role!=='seller'||product?.store_id!==IDS.store)fail('not permitted');if(data.order_items.some(x=>x.product_id===product.id)){product.active=false;product.attributes={...product.attributes,_deleted:true};}else{data.products=data.products.filter(x=>x.id!==product.id);data.product_variants=data.product_variants.filter(x=>x.product_id!==product.id);}
  }else if(name==='allocate_legacy_variant_stock'){
   const product=data.products.find(x=>x.id===p.p_product&&x.store_id===IDS.store),v=data.product_variants.find(x=>x.id===p.p_variant&&x.product_id===product?.id&&!x.archived);if(role!=='seller'||!product||!v||!Number.isInteger(p.p_quantity)||p.p_quantity<1||p.p_quantity>(product.legacy_stock_reserve||0))fail('invalid reserve quantity');product.legacy_stock_reserve-=p.p_quantity;v.stock+=p.p_quantity;v.version++;if(v.available)product.stock+=p.p_quantity;movement(product,v,p.p_quantity,v.stock,'legacy_allocation');
  }else if(name==='admin_set_delivery_zone'){
   if(role!=='admin')fail('admin required');if(!Number.isInteger(p.p_fee)||p.p_fee<0||p.p_fee>100000||String(p.p_name||'').trim().length<2)fail('invalid delivery zone');const zoneId=p.p_id||uuid(),old=data.delivery_zones.find(z=>z.id===zoneId),zone={id:zoneId,name:p.p_name.trim(),fee:p.p_fee,enabled:p.p_enabled};if(old)Object.assign(old,zone);else data.delivery_zones.push(zone);result=zoneId;
  }else if(name==='place_order'||name==='place_order_with_delivery_zone'){
   if(role!=='buyer')fail('جرّب الطلب من واجهة الزبون');if(!Array.isArray(p.p_lines)||!p.p_lines.length)fail('السلة فارغة');const seen=new Set();let subtotal=0;
   const lines=p.p_lines.map(line=>{const product=data.products.find(r=>r.id===line.id&&r.store_id===p.p_store&&r.active&&!r.blocked),variant=product?.has_variants?data.product_variants.find(v=>v.id===line.variant_id&&v.product_id===product.id&&!v.archived&&v.available):null,quantity=+line.quantity,stock=variant?.stock??product?.stock,key=line.id+':'+(line.variant_id||'');if(!product||product.has_variants&&!variant||!product.has_variants&&line.variant_id||!Number.isInteger(quantity)||quantity<1||quantity>100||quantity>stock)fail('product unavailable');if(seen.has(key))fail('duplicate product');seen.add(key);const price=variant?(variant.sale_price??variant.price):product.price;subtotal+=price*quantity;return {product,variant,quantity,price}});
   const f=data.delivery_settings[0],zone=name==='place_order_with_delivery_zone'?data.delivery_zones.find(z=>z.id===p.p_zone&&z.enabled):null;if(name==='place_order_with_delivery_zone'&&(!zone||zone.fee!==p.p_expected_fee||f.platform_fee!==p.p_expected_platform_fee))fail('delivery fee changed');const deliveryFee=zone?.fee??f.delivery_fee;
   const o={id:uuid(),store_id:p.p_store,buyer_id:id,driver_id:null,customer_name:p.p_name,customer_phone:p.p_phone,address:p.p_address,note:p.p_note||'',total:subtotal+f.platform_fee+deliveryFee,platform_fee:f.platform_fee,delivery_fee:deliveryFee,delivery_zone_id:zone?.id,delivery_zone_name:zone?.name,status:'new',created_at:clock()};data.orders.unshift(o);for(const {product,variant,quantity,price} of lines){product.stock-=quantity;if(variant){variant.stock-=quantity;variant.version++;data.product_stock_movements.push({id:uuid(),store_id:IDS.store,product_id:product.id,variant_id:variant.id,product_name:product.name,variant_label:variant.label,delta:-quantity,balance:variant.stock,reason:'order',created_at:clock(),order_id:o.id});}data.order_items.push({id:uuid(),order_id:o.id,product_id:product.id,product_name:product.name+(variant?' — '+variant.label:''),price,quantity,variant_id:variant?.id||null,variant_snapshot:variant?{label:variant.label,attributes:clone(variant.attributes),sku:variant.sku}: {}});}notice(IDS.seller,'طلب جديد من الزبون',summary(o),o.id,null,'order');notice(IDS.driver,'طلب جديد متاح للتوصيل',summary(o),o.id,null,'delivery_offer');notice(IDS.admin,'طلب جديد من زبون',summary(o),o.id,null,'order');notice(id,'أُرسل طلبك التجريبي',summary(o),o.id);result=o.id;
   }else if(name==='participant_orders'){
   result=data.orders.filter(o=>participants(o).includes(id)&&(!p.p_buyer||o.buyer_id===p.p_buyer)&&(!p.p_store||o.store_id===p.p_store)&&(!p.p_driver||o.driver_id===p.p_driver)&&(!p.p_order||o.id===p.p_order)).map(o=>({...clone(o),customer_phone:o.buyer_id===id||o.driver_id===id||role==='admin'?o.customer_phone:null,order_items:data.order_items.filter(i=>i.order_id===o.id),order_customer_actions:data.order_customer_actions?.find(a=>a.order_id===o.id)}));
  }else if(name==='customer_order_action'){
   const o=ownOrder(p.p_order);if(!o||o.buyer_id!==id)fail('not permitted');
   if(!['hide','restore','cancel','return'].includes(p.p_action))fail('invalid action');
   data.order_customer_actions ||= [];let a=data.order_customer_actions.find(a=>a.order_id===o.id);const ensure=()=>{if(!a){a={order_id:o.id,buyer_id:id,hidden_at:null,request_kind:null,reason:''};data.order_customer_actions.push(a);}return a;};
   if(['hide','restore'].includes(p.p_action)){ensure().hidden_at=p.p_action==='hide'?clock():null;result=p.p_action;}
   else if(p.p_action==='cancel'&&o.status==='cancelled'){result='cancelled';}
   else if(p.p_action==='cancel'&&['new','accepted'].includes(o.status)&&!o.driver_id){const res=await rpc('set_order_status',{p_order:o.id,p_status:'cancelled'});if(res.error)fail(res.error.message);result='cancelled';}
   else {if(p.p_action==='return'?o.status!=='delivered':!['new','accepted','delivery'].includes(o.status))fail('invalid transition');if(a?.request_kind!==p.p_action){ensure().request_kind=p.p_action;a.reason=p.p_reason||'';[...new Set([...participants(o),IDS.admin])].forEach(to=>notice(to,p.p_action==='return'?'طلب إرجاع من الزبون':'طلب إلغاء من الزبون',a.reason,o.id,null,'order'));}result='requested';}
  }else if(name==='set_order_status'){
   const o=ownOrder(p.p_order);if(!o||!(role==='seller'||(o.buyer_id===id&&p.p_status==='cancelled'&&!o.driver_id))||o.driver_id&&o.status!=='new')fail('الطلب ليس متاحًا للتاجر');
   if(p.p_status==='cancelled'&&['new','accepted'].includes(o.status)){
    for(const i of data.order_items.filter(i=>i.order_id===o.id)){
     const product=data.products.find(x=>x.id===i.product_id),v=data.product_variants.find(x=>x.id===i.variant_id);
     if(v){v.stock+=i.quantity;v.version++;if(product){if(!v.archived&&v.available)product.stock+=i.quantity;movement(product,v,i.quantity,v.stock,'cancelled_order',o.id);}}
     else if(product?.has_variants){product.legacy_stock_reserve=(product.legacy_stock_reserve||0)+i.quantity;movement(product,null,i.quantity,product.legacy_stock_reserve,'legacy_cancel_after_conversion',o.id);}
     else if(product){product.stock+=i.quantity;movement(product,null,i.quantity,product.stock,'cancelled_order',o.id);}
    }
   }else if(!(o.status==='new'&&p.p_status==='accepted'))fail('invalid transition');
   o.status=p.p_status;participants(o).forEach(to=>notice(to,o.status==='cancelled'?'أُلغي الطلب':'قبل التاجر الطلب',summary(o),o.id));
  }else if(name==='delivery_offer_details'||name==='available_delivery_orders'){
   const worker=data.delivery_workers.find(w=>w.user_id===id);result=role==='driver'&&worker?.approved&&worker.amount_due<worker.debt_limit?data.orders.filter(o=>['new','accepted'].includes(o.status)&&!o.driver_id&&!data.delivery_declines.some(d=>d.order_id===o.id&&d.driver_id===id)).map(o=>({order_id:o.id,store_name:data.stores[0].name,product_total:o.total-o.platform_fee-o.delivery_fee,delivery_fee:o.delivery_fee,platform_fee:o.platform_fee,created_at:o.created_at,items:data.order_items.filter(i=>i.order_id===o.id).map(i=>({name:i.product_name,quantity:i.quantity}))})):[];
  }else if(name==='claim_delivery'||name==='claim_route_delivery'){
   const o=ownOrder(p.p_order),worker=data.delivery_workers.find(w=>w.user_id===id);if(role!=='driver'||!worker?.approved||worker.amount_due>=worker.debt_limit)fail('driver unavailable or debt limit reached');if(!o||!['new','accepted'].includes(o.status)||o.driver_id)fail('order no longer available');o.driver_id=id;participants(o).forEach(to=>notice(to,'سائق التوصيل المكلّف بالطلب',summary(o),o.id));
  }else if(name==='decline_delivery'){data.delivery_declines.push({driver_id:id,order_id:p.p_order});
  }else if(name==='delivery_step'){
   const o=ownOrder(p.p_order);if(!o||o.driver_id!==id)fail('not assigned to you');if(o.status==='delivered'&&p.p_status==='delivered'){result=null;}else{if(!((o.status==='accepted'&&p.p_status==='delivery')||(['accepted','delivery'].includes(o.status)&&p.p_status==='delivered')))fail('invalid transition');o.status=p.p_status;if(o.status==='delivered')data.delivery_workers.find(w=>w.user_id===id).amount_due+=o.platform_fee;participants(o).forEach(to=>notice(to,o.status==='delivered'?'اكتمل التوصيل التجريبي':'استلم السائق المواد من التاجر',summary(o),o.id));}
  }else if(name==='assigned_delivery_contacts'){result=data.orders.filter(o=>o.driver_id&&participants(o).includes(id)).map(o=>({order_id:o.id,driver_id:o.driver_id,full_name:data.driver_profiles[0].full_name,phone:data.driver_profiles[0].phone,vehicle:data.driver_profiles[0].vehicle,pickup_address:role==='buyer'?null:data.store_pickups[0]?.pickup_address}));
  }else if(name==='save_seller_workspace'){
   if(role!=='seller')fail('اختر واجهة التاجر');const row=data.seller_workspace_settings.find(r=>r.store_id===p.p_store);if(row)row.settings=clone(p.p_settings);else data.seller_workspace_settings.push({store_id:p.p_store,settings:clone(p.p_settings)});data.stores[0].storefront_settings=clone(p.p_appearance);
  }else if(name==='save_store_location'){
   if(role!=='seller'||!['online','physical','social','personal','other'].includes(p.p_kind)||p.p_address?.trim().length<3)fail('أكمل نوع المتجر والعنوان');data.stores[0].store_kind=p.p_kind;data.stores[0].address=p.p_kind==='physical'?p.p_address:'';data.store_pickups[0].pickup_address=p.p_address;
  }else if(name==='rename_seller_category'){
   if(role!=='seller')fail('اختر واجهة التاجر');const c=data.seller_categories.find(c=>c.id===p.p_category);if(!c)fail('التصنيف غير موجود');data.products.filter(x=>x.category===c.name).forEach(x=>x.category=p.p_name);c.name=p.p_name;
  }else if(name==='submit_delivery_payment'){if(role!=='driver')fail('اختر واجهة السائق');data.delivery_payments.unshift({id:uuid(),driver_id:id,amount:p.p_amount,receipt:p.p_receipt,status:'pending',created_at:clock()});notice(id,'طلب تسوية تجريبي',String(p.p_amount)+' د.ع — لا تحوّل مالًا');
  }else if(name==='request_driver_application'){if(role!=='driver')fail('اختر واجهة السائق');Object.assign(data.driver_profiles[0],{full_name:p.p_name,phone:p.p_phone,email:p.p_email,address:p.p_address,vehicle:p.p_vehicle});Object.assign(data.profiles.find(p=>p.id===id),{full_name:p.p_name,phone:p.p_phone});
  }else fail('هذه العملية غير متاحة في المعاينة؛ لم يُرسل شيء إلى الخادم.');save();return {data:clone(result),error:null};
 }catch(error){return {data:null,error:{message:error.message}}}}
 return {from,rpc,user,setRole,role:()=>role,snapshot:()=>clone(data),reset:()=>{data=previewFixture(clock());save()},saveImage:async(path,blob)=>{const image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});data.images[path]=image;save()},image:path=>data.images[path]||'',auth:{getSession:async()=>({data:{session:user()?{user:user()}:null},error:null}),signOut:async()=>{role=null;return {data:null,error:null}},onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),updateUser:async()=>({data:null,error:{message:'تغيير حساب الدخول غير متاح في المعاينة'}})}};
}

export function createPreviewClient(){
 let model;const safeStorage={getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v)};model=createPreviewModel(safeStorage);
 const client={from:model.from,rpc:model.rpc,auth:model.auth,storage:{from:()=>({
  getPublicUrl:path=>({data:{publicUrl:model.image(path)}}),
  upload:async(path,blob)=>{try{await model.saveImage(path,blob);return {data:{path},error:null}}catch{return {data:null,error:{message:'تعذّر حفظ الصورة محليًا'}}}}
 })}};
 let handlers,home=true,pendingRefresh=false,refreshTimer=0;
 // Another preview window saved new data: reload this interface, but never while someone is typing in a field.
 function refreshFromOtherWindow(){if(home||!handlers?.refresh)return;if(document.querySelector('input:focus,textarea:focus,select:focus')){pendingRefresh=true;return;}pendingRefresh=false;handlers.refresh();}
 function watchOtherWindows(){if(typeof window==='undefined'||watchOtherWindows.on)return;watchOtherWindows.on=true;window.addEventListener('storage',e=>{if(e.key!==null&&e.key!==PREVIEW_KEY)return;clearTimeout(refreshTimer);refreshTimer=setTimeout(refreshFromOtherWindow,120);});document.addEventListener('focusout',()=>{if(pendingRefresh)setTimeout(refreshFromOtherWindow,200);});}
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const roleButtons=()=>Object.entries(labels).map(([id,label])=>`<button data-preview="role" data-v="${id}" aria-pressed="${model.role()===id}">واجهة ${label}</button>`).join('');
 function toolbar(){let bar=document.getElementById('previewToolbar');if(!bar){bar=document.createElement('section');bar.id='previewToolbar';document.body.prepend(bar);}bar.innerHTML=`<div><b>مختبر معاينة الواجهات</b><small>بلا تسجيل دخول · الطلبات والإشعارات محلية · لا توجد أموال حقيقية</small></div><nav><button data-preview="home">الرئيسية</button>${roleButtons()}<button data-preview="style">تخصيص المعاينة</button><button data-preview="reset">إعادة ضبط التجربة</button>${document.documentElement.dataset.embeddedPreview?'':'<a href="admin.html">الإدارة الحقيقية</a>'}</nav>`;}
 function landing(){document.body.classList.add('preview-home');toolbar();document.body.classList.remove('seller-workspace','seller-storefront');document.getElementById('sellerNav')?.remove();document.getElementById('view').innerHTML=`<section class="pl-home"><small>مختبر سوق الشطرة</small><h1>أي واجهة تريد تجربتها؟</h1><p>اختر الواجهة مباشرة دون حساب أو اسم أو تسجيل. اطلب كزبون، ثم انتقل للتاجر والسائق لترى الإشعارات وتكمل دورة الطلب.</p><div class="pl-role-cards">${Object.entries(labels).map(([id,label],i)=>`<button data-preview="role" data-v="${id}"><span>${['▦','▤','➜'][i]}</span><h2>واجهة ${label}</h2><p>${['تصفح المواد والمتاجر، اطلب، وأضف للمفضلة.','جرّب المنتجات والمبيعات والطلبات وتخصيص المتجر.','شاهد الطلبات المتاحة، واقبل التوصيل وتابع الرصيد.'][i]}</p><b>فتح الواجهة ←</b></button>`).join('')}</div><p class="pl-note">التغييرات تخص هذه المعاينة وعلى جهازك فقط؛ لا تُعدّل تصميم الموقع المنشور ولا بيانات التجار.</p></section>`;document.querySelector('.tabs').hidden=true;}
 function navigate(url){if(home)return;handlers.navigate(new URL(url,location.href));}
 function style(){handlers.sheet(`<div class="dh"><h2>تخصيص المعاينة</h2><button class="x" data-a="close">×</button></div><p>هذه التعديلات محلية للمعاينة. أدوات التاجر الأصلية متاحة أيضًا داخل واجهته.</p><label for="previewAccent">اللون الأساسي</label><input id="previewAccent" type="color" value="${document.documentElement.style.getPropertyValue('--preview-accent')||'#245bc5'}"><label for="previewRadius">زوايا البطاقات</label><select id="previewRadius"><option value="18">دائرية</option><option value="8">خفيفة</option><option value="0">مستقيمة</option></select><button class="buy" data-preview="saveStyle">حفظ شكل المعاينة</button><button class="alt" data-a="toggleTheme">تبديل الفاتح والغامق</button>`);}
 function applyStyle(v){if(!/^#[0-9a-f]{6}$/i.test(v.color))return;const scale=16,radius=[0,8,18].includes(+v.radius)?v.radius:18;document.documentElement.style.setProperty('--preview-accent',v.color);document.documentElement.style.setProperty('--preview-font',scale+'px');document.documentElement.style.setProperty('--preview-radius',radius+'px');}
 function selectRole(role){document.body.classList.toggle('preview-home',role===null);home=role===null;model.setRole(role);toolbar();handlers.role(role);}
 client.preview={role:model.role,isHome:()=>home||model.role()===null,home:landing,navigate,toolbar,selectRole,init:callbacks=>{
  handlers=callbacks;const entryRole=new URLSearchParams(location.search).get('role');if(new URLSearchParams(location.search).get('embed')==='all')document.documentElement.dataset.previewAll='true';watchOtherWindows();if(['buyer','seller','driver'].includes(entryRole)){home=false;model.setRole(entryRole);}document.body.classList.add('preview-lab');toolbar();try{applyStyle(JSON.parse(localStorage.getItem(PREVIEW_KEY+'-style')||'null')||{})}catch{}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-preview]');if(b){e.preventDefault();const action=b.dataset.preview;if(action==='role')selectRole(b.dataset.v);if(action==='home'){selectRole(null);landing();}if(action==='reset'){if(!confirm('إعادة ضبط بيانات المعاينة المحلية فقط؟'))return;model.reset();localStorage.removeItem('souq-preview-cart-v1');handlers.role(model.role());}if(action==='style')style();if(action==='saveStyle'){const v={color:document.getElementById('previewAccent').value,scale:16,radius:document.getElementById('previewRadius').value};applyStyle(v);localStorage.setItem(PREVIEW_KEY+'-style',JSON.stringify(v));handlers.close();}return;}
   const a=e.target.closest('a[href]');if(!a)return;const href=a.getAttribute('href');if(/^(tel:|mailto:|https:\/\/wa.me)/i.test(href)){e.preventDefault();alert('هذه معاينة فقط؛ لن يتم اتصال أو إرسال رسالة حقيقية.');return;}const u=new URL(href,location.href);if(u.origin===location.origin&&!u.pathname.endsWith('/admin.html')&&!u.pathname.endsWith('/preview.html')){e.preventDefault();navigate(u);}
  },true);
 }};
 return client;
}


// Visual treatment for the isolated marketplace preview. See the existing actions for routing.
function mountAzurePreview() {
 const nav=document.querySelector('.app > .tabs'), view=document.getElementById('view');
 if(!nav||!view)return;
 const headerActions=document.querySelector('.figma-header-actions');
 if(headerActions){
  const favorite=document.createElement('button');
  favorite.type='button';favorite.className='header-icon azure-favorites';
  favorite.dataset.a='favorites';favorite.setAttribute('aria-label','المفضلة');
  favorite.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg>';
  headerActions.querySelector('.header-cart')?.before(favorite);
 }
 const search=document.getElementById('buyerSearch'), query=document.getElementById('q');
 if(search&&query) {
  const app=nav.parentElement, bar=document.createElement('div'), back=document.createElement('button');
  bar.className='azure-search-actions';bar.hidden=true;
  back.type='button';back.className='azure-search-back';
  back.setAttribute('aria-label','العودة من البحث');
  back.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10 6 6 6-6 6M4 12h12"/></svg>';
  bar.append(back);
  search.parentElement.before(bar);
  function syncQuery(){
   app.classList.toggle('azure-search-blank',!query.value.trim());
  }
  function setSearchMode(open){
   app.classList.toggle('azure-search-mode',open);
   bar.hidden=!open;
   if(open) syncQuery();
   else query.blur();
  }
  function openSearch(){
   if(!nav.classList.contains('azure-nav')||app.classList.contains('azure-search-mode'))return;
   history.pushState({...history.state,azureSearch:true},'');
   setSearchMode(true);
   window.scrollTo({top:0,behavior:'instant'});
  }
  function closeSearch(){
   if(!app.classList.contains('azure-search-mode'))return;
   if(history.state?.azureSearch)history.back();
   else setSearchMode(false);
  }
  query.addEventListener('focus',openSearch);
  query.addEventListener('click',openSearch);
  query.addEventListener('input',syncQuery);
  back.addEventListener('click',closeSearch);
  window.addEventListener('popstate',event=>setSearchMode(!!event.state?.azureSearch));
  search.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeSearch();}});
  nav.addEventListener('click',event=>{
   if(event.target.closest('button')&&app.classList.contains('azure-search-mode'))setSearchMode(false);
  });
 }
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 const path=document.createElementNS(svg.namespaceURI,'path');
 const disc=document.createElementNS(svg.namespaceURI,'circle');
 svg.classList.add('azure-nav-shape'); svg.setAttribute('aria-hidden','true');
 disc.setAttribute('cy','23');disc.setAttribute('r','20');svg.append(path,disc);
 let center=null, frame=0;
 function paint(x,width,height,depth=1) {
  const y=20, a=Math.min(35,width/10), b=23, d=(Number(disc.getAttribute('cy'))+24-y)*depth;
  svg.setAttribute('viewBox',`0 0 ${width} ${height+18}`);
  path.setAttribute('d',`M0 ${y} H${x-a} C${x-b} ${y} ${x-b} ${y+d} ${x} ${y+d} S${x+b} ${y} ${x+a} ${y} H${width} V${height+18} H0 Z`);
  disc.setAttribute('cx',x);
  center=x;
 }
 function align() {
  const bounds=nav.getBoundingClientRect(), button=nav.querySelector('[aria-current=page]');
  const icon=button?.querySelector('.navicon')?.getBoundingClientRect();
  cancelAnimationFrame(frame);
  if(!nav.classList.contains('azure-nav')||!bounds.width)return;
  if(svg.parentElement!==nav)nav.prepend(svg);
  if(!icon){svg.hidden=true;return;}
  svg.hidden=false;
  const next=icon.left+icon.width/2-bounds.left;
  disc.setAttribute('cy',icon.top+icon.height/2-bounds.top+18);
  const previous=center??next, start=performance.now();
  const moving=previous!==next&&!reduce.matches;
  if(!moving){paint(next,bounds.width,bounds.height);return;}
  function tick(now) {
   const t=Math.min(1,(now-start)/365), ease=1-Math.pow(1-t,3);
   paint(previous+(next-previous)*ease,bounds.width,bounds.height,1-.13*Math.sin(Math.PI*t));
   if(t<1)frame=requestAnimationFrame(tick);
  }
  frame=requestAnimationFrame(tick);
 }
 function decorateNavigation() {
  const offer=nav.querySelector('.offers-tab');
  nav.classList.toggle('azure-nav',!!offer);
  if(!offer)return;
  if(offer.dataset.a!=='offers'){
   offer.classList.remove('cart-centre','media-placeholder');
   offer.dataset.a='offers';offer.setAttribute('aria-label','العروض');
   const icon=offer.querySelector('.navicon');
   icon.textContent='٪';
   offer.replaceChildren(icon,document.createTextNode('العروض'));
   nav.append(nav.querySelector('[data-v="market"]'),nav.querySelector('[data-v="materials"]'),nav.querySelector('[data-v="stores"]'),offer,nav.querySelector('[data-v="profilePage"]'));
  }
  const offersPage=!!view.querySelector('.offers-page');
  if(offersPage)offer.setAttribute('aria-current','page');else offer.removeAttribute('aria-current');
  align();
 }
 const categoryTone=[['أجهزة','tech'],['إلكترونيات','tech'],['هواتف','tech'],['ملابس','fashion'],['سيارات','gold'],['منزل','mint'],['خضار','mint'],['عطور','rose'],['تجميل','rose'],['أثاث','violet'],['رياضة','sport'],['تمور','gold']];
 const tone=name=>categoryTone.find(([key])=>name.includes(key))?.[1]||'violet';
 function decorateView() {
  const isHome=!!view.querySelector('.figma-section')&&!!view.querySelector('.sq-used');
  view.classList.toggle('azure-home',isHome);
  for(const button of view.querySelectorAll('.category-card[data-v]'))button.dataset.azureTone=tone(button.dataset.v);
  const title=view.querySelector('.market-materials .section-title h1');
  view.dataset.azureTone=title?tone(title.textContent):'';
  if(isHome) {
   view.querySelector('.sq-used .sq-hint')?.setAttribute('hidden','');
   const intro=view.querySelector('.sq-used .sq-head p');
   if(intro)intro.textContent='منتجات مستعملة من أهالي الشطرة';
   const empty=view.querySelector('.sq-used .sq-empty');
   if(empty)empty.textContent='لا توجد إعلانات مستعملة حالياً.';
   const stores=view.querySelector(':scope > .market-stores');
   const shortcuts=view.querySelector(':scope > .mp-switcher');
   if(stores&&shortcuts)stores.after(shortcuts);
   const heading=view.querySelector('.market-materials h2.sq-title');
   if(heading)heading.textContent='منتجات جديدة';
   for(const btn of view.querySelectorAll('.sq-more,.section-title button[data-a]'))btn.textContent='عرض الكل';
  }
  if(title&&!title.textContent.startsWith('نتائج البحث')&&view.querySelector('.category-card[data-v]')) {
   const empty=view.querySelector('.market-materials .empty');
   if(empty?.textContent.trim()){
    empty.textContent='لا توجد منتجات في هذه الفئة حالياً';
    const detail=document.createElement('p');
    detail.textContent='ستظهر المنتجات هنا فور إضافتها. يمكنك استكشاف الفئات الأخرى.';
    empty.append(detail);
   }
  }
  view.querySelectorAll('.category-card,.figma-product-card,.sq-store,.used-card,.sp-card').forEach((element,index)=>{
   element.style.setProperty('--az-delay',Math.min(index,9)*40+'ms');
   if(element.classList.contains('sq-store')&&!element.dataset.azureCard)element.dataset.azureCard=String(index%3);
  });
 }
 let pending=false;
 const update=()=>{
  if(pending)return;
  pending=true;queueMicrotask(()=>{
   pending=false;
   navObserver.disconnect();viewObserver.disconnect();
   decorateView();decorateNavigation();
   navObserver.observe(nav,{childList:true});viewObserver.observe(view,{childList:true});
  });
 };
 const navObserver=new MutationObserver(update),viewObserver=new MutationObserver(update);
 new ResizeObserver(align).observe(nav);
 update();
 let pauseUntil=0, last=0;
 for(const type of ['pointerdown','wheel','focusin'])view.addEventListener(type,event=>{
  if(event.target.closest('.sq-stores'))pauseUntil=performance.now()+4000;
 },{passive:true});
 function advance(now) {
  const row=view.querySelector('.azure-home .sq-stores');
  if(row&&!reduce.matches&&!document.hidden&&now>pauseUntil&&!row.matches(':hover,:focus-within')&&row.scrollWidth>row.clientWidth+2) {
   const first=row.firstElementChild, step=first?.getBoundingClientRect().width+(parseFloat(getComputedStyle(row).columnGap)||0);
   if(last&&now-last<100&&step) {
    row._azureOffset=(row._azureOffset??Math.abs(row.scrollLeft))+(now-last)*.024;
    if(row._azureOffset>=step) { row.append(first);row._azureOffset-=step; }
    row.scrollLeft=-row._azureOffset;
   }
  }else if(row)row._azureOffset=null;
  last=now;
  requestAnimationFrame(advance);
 }
 requestAnimationFrame(advance);
}
if(typeof document!=='undefined')mountAzurePreview();

const favoritesHeart='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.6c0 4.5-8.8 9.9-8.8 9.9S3.2 13.1 3.2 8.6a4.5 4.5 0 0 1 8.8-1.3 4.5 4.5 0 0 1 8.8 1.3Z"/></svg>';

export function openPreviewFavorites({sheet, activity, products, explore, cardOptions}) {
 const root=()=>document.querySelector('#sheet .azure-favorites-page');
 const header='<header class="azure-favorites-heading"><button type="button" data-a="back" aria-label="الرجوع"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg></button><h2>المفضلة '+favoritesHeart+'</h2></header>';
 const empty='<div class="azure-favorites-empty"><div class="azure-favorites-art">'+favoritesHeart+'</div><h3>مفضلتك بانتظار اختياراتك</h3><p>احفظ المنتجات التي تعجبك لتعود إليها بسهولة في أي وقت.</p><button type="button" class="azure-favorites-explore" data-favorites-explore>استكشف المنتجات</button></div>';
 sheet('<section class="azure-favorites-page">'+header+'<div class="azure-favorites-content" role="status"></div></section>');
 const page=root(), content=page.querySelector('.azure-favorites-content');
 const paint=()=>{
  const favorites=activity.favorites(), list=products().filter(p=>p.active&&!p.blocked&&favorites.includes(p.id));
  if(!list.length){content.innerHTML=empty;return;}
  const count=list.length, label=count===1?'منتج واحد':count===2?'منتجان':count>=3&&count<=10?count+' منتجات':count+' منتجًا';
  content.innerHTML='<div class="azure-favorites-info"><strong>المنتجات المحفوظة</strong><span>'+label+'</span></div>'+window.SouqMarketplace.productCards(list,{...cardOptions,favorites});
  content.querySelectorAll('.mp-product').forEach((card,i)=>card.style.setProperty('--favorite-delay',Math.min(i,7)*40+'ms'));
 };
 async function load(){
  content.innerHTML='<p class="azure-favorites-status">جارٍ تحميل المفضلة…</p>';
  try{await activity.poll();if(page.isConnected)paint();}
  catch{if(page.isConnected)content.innerHTML='<div class="azure-favorites-status"><p>تعذّر تحميل المفضلة.</p><button type="button" class="azure-favorites-explore" data-favorites-retry>إعادة المحاولة</button></div>';}
 }
 page.addEventListener('click',event=>{if(event.target.closest('[data-favorites-retry]'))load();
  if(event.target.closest('[data-favorites-explore]'))explore();});
 page.addEventListener('souq-favorite-removed',event=>{
  const button=event.detail;
  const animation=matchMedia('(prefers-reduced-motion: reduce)').matches?null:button.animate([{transform:'scale(1)'},{transform:'scale(.72)'}],{duration:120,easing:'ease-out'});
  if(animation)animation.finished.then(paint,paint);else paint();
 });
 load();
}
