import {CATALOG_SEEDS} from '../category-seeds.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function setup(){const writes=new Map(),storage={getItem:k=>writes.get(k)||null,setItem:(k,v)=>writes.set(k,v)};let seq=0;const c={CATALOG_SEEDS};vm.createContext(c);vm.runInContext(readFileSync(new URL('../preview-lab.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/export /g,''),c);return {model:c.createPreviewModel(storage,()=>`test-id-${++seq}`,()=> '2026-10-05T13:00:00Z'),ids:vm.runInContext('IDS',c),writes,c};}
const ok=result=>{assert.equal(result.error,null,result.error?.message);return result.data;};
test('preview opens without login, uses one isolated local storage key, no production client',async()=>{
 const {model,writes}=setup();assert.equal((await model.auth.getSession()).data.session,null);model.setRole('buyer');ok(await model.from('profiles').update({full_name:'معاينة فقط'}).eq('id',model.user().id));assert.deepEqual([...writes.keys()],['souq-shatra-interface-preview-v1']);
 const source=readFileSync(new URL('../preview.html',import.meta.url),'utf8');assert.doesNotMatch(source,/SUPABASE_|esm.sh\/@supabase|import .*config.js|const db=createClient/);assert.match(source,/const db=createPreviewClient/);assert.match(source,/souq-preview-cart-v1/);assert.match(source,/cust:local.cust\|\|\{name:'معاينة زبون'/);
});
test('full simulated lifecycle generates seller, buyer and driver notifications and local debt',async()=>{
 const {model,ids}=setup();const p=model.snapshot().products[0];model.setRole('buyer');const orderId=ok(await model.rpc('place_order',{p_store:ids.store,p_lines:[{id:p.id,quantity:2}],p_name:'معاينة زبون',p_phone:'00000000000',p_address:'عنوان تجريبي'}));assert.equal(model.snapshot().products[0].stock,18);
 model.setRole('seller');const notices=ok(await model.from('account_notifications').select('*'));assert.equal(notices[0].event_kind,'order');assert.match(notices[0].body,/قميص تجريبي × 2/);ok(await model.rpc('set_order_status',{p_order:orderId,p_status:'accepted'}));
 model.setRole('driver');const offers=ok(await model.rpc('delivery_offer_details'));assert.equal(offers.length,1);assert.doesNotMatch(JSON.stringify(offers),/customer_name|customer_phone|عنوان تجريبي/);ok(await model.rpc('claim_delivery',{p_order:orderId}));assert.equal(ok(await model.from('orders').select('*')).length,1);ok(await model.rpc('delivery_step',{p_order:orderId,p_status:'delivery'}));ok(await model.rpc('delivery_step',{p_order:orderId,p_status:'delivered'}));assert.equal(model.snapshot().delivery_workers[0].amount_due,500);assert.equal(model.snapshot().orders[0].status,'delivered');assert.equal(ok(await model.rpc('delivery_offer_details')).length,0);
 assert.ok(ok(await model.from('account_notifications').select('*')).length>=3);
});
test('local favorite and like notify only seller and remain independently saved',async()=>{
 const {model,ids}=setup(),p=model.snapshot().products[0];model.setRole('buyer');ok(await model.from('product_interactions').insert({user_id:ids.buyer,product_id:p.id,kind:'favorite'}));ok(await model.from('product_interactions').insert({user_id:ids.buyer,product_id:p.id,kind:'like'}));assert.equal(ok(await model.from('account_notifications').select('*')).length,0);model.setRole('seller');assert.equal(ok(await model.from('account_notifications').select('*')).length,2);
});
test('seller customization, product edits and pickup type stay in local preview',async()=>{
 const {model,ids}=setup();model.setRole('seller');ok(await model.rpc('save_seller_workspace',{p_store:ids.store,p_settings:{nav:['chats','account']},p_appearance:{mode:'dark',color:'indigo'}}));assert.equal(model.snapshot().stores[0].storefront_settings.mode,'dark');ok(await model.from('products').update({price:7000}).eq('id',model.snapshot().products[0].id).select('id').single());assert.equal(model.snapshot().products[0].price,7000);ok(await model.rpc('save_store_location',{p_store:ids.store,p_kind:'online',p_address:'عنوان الاستلام الخاص'}));assert.equal(model.snapshot().stores[0].address,'');model.setRole('buyer');assert.equal(ok(await model.from('store_pickups').select('*')).length,0);
});
test('invalid stock, role and second claim cannot corrupt the simulation',async()=>{
 const {model,ids}=setup(),p=model.snapshot().products[0];model.setRole('buyer');const bad=await model.rpc('place_order',{p_store:ids.store,p_lines:[{id:p.id,quantity:999}]});assert.ok(bad.error);assert.equal(model.snapshot().orders.length,0);assert.equal(model.snapshot().products[0].stock,20);
 const id=ok(await model.rpc('place_order',{p_store:ids.store,p_lines:[{id:p.id,quantity:1}],p_name:'زبون',p_phone:'00000000000',p_address:'عنوان'}));assert.ok((await model.rpc('claim_delivery',{p_order:id})).error);model.setRole('seller');ok(await model.rpc('set_order_status',{p_order:id,p_status:'accepted'}));model.setRole('driver');ok(await model.rpc('claim_delivery',{p_order:id}));assert.ok((await model.rpc('claim_delivery',{p_order:id})).error);
 model.reset();assert.equal(model.snapshot().orders.length,0);assert.equal(model.snapshot().products[0].stock,20);
});
test('preview blocks unknown RPCs and includes separate offline navigation cache',async()=>{
 const {model}=setup();model.setRole('seller');assert.ok((await model.rpc('admin_set_account_disabled',{p_user:'real-id'})).error);assert.doesNotMatch(readFileSync(new URL('../preview-lab.js',import.meta.url),'utf8'),/\bfetch\s*\(|import .*supabase/);
 assert.match(readFileSync(new URL('../sw.js',import.meta.url),'utf8'),/path.endsWith\('\/preview.html'\)\?'\.\/preview.html'/);
});
test('generated preview boots the actual buyer, seller and driver interfaces without a network',async()=>{
 const nodes=new Map(),storage=new Map();
 const element=(id='')=>{const e={id,innerHTML:'',textContent:'',dataset:{},style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},setAttribute(){},removeAttribute(){},addEventListener(){},focus(){},append(child){if(child.id)nodes.set('#'+child.id,child)},prepend(child){this.append(child)},before(){},remove(){nodes.delete('#'+e.id)},insertAdjacentHTML(_p,html){e.innerHTML+=html},querySelector(){return element()},querySelectorAll(){return []}};if(id)nodes.set('#'+id,e);return e;};
 const document={hidden:false,documentElement:{dataset:{portal:'preview'},style:{setProperty(){},getPropertyValue(){return ''}}},body:element('body'),createElement:()=>element(),getElementById:id=>nodes.get('#'+id)||null,querySelector:s=>nodes.get(s)||element(s.startsWith('#')?s.slice(1):s),querySelectorAll:()=>[],addEventListener(){}};
 const url=new URL('https://preview.invalid/preview.html'),context={document,location:url,URL,URLSearchParams,structuredClone,crypto:{randomUUID:()=> 'a9999999-0000-4000-8000-'+String(Math.random()).slice(2,14).padEnd(12,'0')},navigator:{},history:{replaceState(){},pushState(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},matchMedia:()=>({matches:true}),setTimeout,clearTimeout,setInterval(){},scrollTo(){},alert(){throw new Error('Unexpected dialog')},confirm:()=>true,fetch(){throw new Error('Preview attempted a network request')}};
 context.CATALOG_SEEDS=CATALOG_SEEDS;context.window=context;context.addEventListener=()=>{};context.SouqTheme={get:()=> 'light',set(){}};
 vm.createContext(context);
 const variantCode=readFileSync(new URL('../product-variants.js',import.meta.url),'utf8').replace(/export /g,'');vm.runInContext('{'+variantCode+';Object.assign(globalThis,{createProductEditor,createCatalogAdmin,catalogAdmin,categoryDefinitions,specifications,inventoryVariants,selectedProduct,variantPrice,cartKey});}',context);
 for(const file of ['catalog-filter.js','marketplace.js','preview-lab.js','seller-records.js','seller-workspace.js','activity-center.js','delivery-workspace.js'])vm.runInContext(readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/export /g,''),context,{filename:file});
 const source=readFileSync(new URL('../preview.html',import.meta.url),'utf8').match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^import .*;$/gm,'');vm.runInContext(source,context,{filename:'preview.html'});
 const settle=()=>new Promise(resolve=>setImmediate(resolve));await settle();assert.match(nodes.get('#view').innerHTML,/أي واجهة تريد تجربتها/);
 vm.runInContext("db.preview.selectRole('buyer')",context);await settle();assert.match(nodes.get('#view').innerHTML,/المواد المعروضة|قميص تجريبي/);
 vm.runInContext("A.prod(D.p[0].id);A.add();A.cart()",context);
 assert.match(nodes.get('#view').innerHTML,/buyer-checkout-layout/);assert.match(nodes.get('#view').innerHTML,/المبلغ النهائي المطلوب/);assert.doesNotMatch(nodes.get('#view').innerHTML,/حصة التطبيق|لكل بائع/);assert.equal(nodes.get('#shade').hidden,true);
 vm.runInContext("A.accountMenu()",context);assert.match(nodes.get('#view').innerHTML,/data-a="editCustomerPhone"/);
 vm.runInContext("A.editCustomerPhone()",context);assert.match(nodes.get('#sheet').innerHTML,/customerPhoneForm/);assert.doesNotMatch(nodes.get('#sheet').innerHTML,/pfname/);
 vm.runInContext("A.close()",context);
 vm.runInContext("db.preview.selectRole('seller')",context);await settle();assert.match(nodes.get('#view').innerHTML,/لوحة متجرك|متجر المعاينة/);assert.match(nodes.get('#view').innerHTML,/مبيعات اليوم المكتملة/);
 vm.runInContext("db.preview.selectRole('driver')",context);await settle();assert.match(nodes.get('#view').innerHTML,/مساحة التوصيل/);assert.match(nodes.get('#view').innerHTML,/رصيد مستحق للتطبيق/);
});

