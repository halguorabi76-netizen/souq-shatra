import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const pages=['index.html','catalog.html','preview.html'];
test('first HTML paint defers buyer layout until account resolution and retains seller shell',async()=>{
 for(const path of pages){const t=await readFile(path,'utf8');assert(t.includes('<body>'));assert(t.includes('id="startupSplash" class="startup-splash" hidden'));assert(!t.includes('class="buyer-preflight"'));assert(t.includes('data-account-boot="true"'));assert(t.includes('initialAccountResolved'));assert(t.includes('class="boot-seller-shell')||t.includes('sw-shell boot-seller-shell'));assert(t.includes('id="sellerStartTemplate"'));assert(!t.includes('requestAnimationFrame(finish)'));assert(!t.includes('requestAnimationFrame(finish)')); assert(!t.includes('https://esm.sh/@supabase'));if(path!=='preview.html'){assert(t.includes('vendor/supabase/supabase-2.117.3.js'));assert(t.includes('const {createClient}=window.supabase;'));}
 const f=t.slice(t.indexOf('function sellerResume(){'),t.indexOf('function render(){'));assert(f.includes("$('#sellerStartTemplate').innerHTML"));assert(!f.includes('seller-session-brand'));
 }
});
test('actual seller refresh finishes while secondary customer records are unresolved; identity still verified first',async()=>{
 const t=await readFile('index.html','utf8'),source=t.slice(t.indexOf('async function refresh(){'),t.indexOf('async function act('));
 const uid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222',calls=[];
 const tables={profiles:{id:uid,role:'seller',disabled:false},stores:[{id:sid,owner_id:uid,name:'متجر اختبار',approved:true,removed:false}],products:[],orders:[],seller_categories:[],catalog_categories:[],product_variants:[],product_stock_movements:[],delivery_settings:{platform_fee:500,delivery_fee:1000},delivery_workers:null,delivery_payments:[],driver_profiles:null,store_pickups:[],seller_workspace_settings:{settings:{}}};
 const query=table=>{const q={};for(const method of ['select','eq','order','limit','maybeSingle','is','in'])q[method]=()=>q;q.then=(resolve,reject)=>{calls.push(table);return Promise.resolve({data:tables[table]??[],error:null}).then(resolve,reject)};return q;};
 const ctx={refreshId:0,user:null,profile:null,ownStore:null,viewMode:'seller',dataReady:false,publicStoreId:null,tab:'account',ADMIN_PORTAL:false,D:{catalog:[],variants:[],pickups:[],cart:[]},CATS:[],db:{auth:{getSession:async()=>({data:{session:{user:{id:uid}}}})},from:query,rpc:async()=>({data:[]}),storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}})})}},withTimeout:p=>p,check:r=>r.data,unavailableSession:()=>false,sessionStorage:{getItem:()=>null,removeItem(){}},localStorage:{getItem:()=> 'seller'},workspace:{load:()=>new Promise(()=>{})},loadUsed:async()=>{},loadReset:async()=>{},loadRatings:async()=>{},restoreRoute(){},error:e=>{throw e},fromOrder:o=>o,rendered:0,save(){},resumePurchaseAfterLogin(){},finishAccountEntry(){},$:()=>({hidden:false})};
 ctx.canSell=()=>ctx.profile?.role==='seller'&&ctx.ownStore?.ok===true;ctx.rememberMode=m=>ctx.viewMode=m;ctx.render=()=>ctx.rendered++;
 ctx.orderRead=()=>ctx.db.from('orders').select('*,order_items(*),order_customer_actions(*)');vm.createContext(ctx);vm.runInContext(source,ctx);
 const done=ctx.refresh();let timer;try{await Promise.race([done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('secondary records blocked page')),100)})]);}finally{clearTimeout(timer);}
 assert.equal(ctx.dataReady,true);assert.equal(ctx.profile.id,uid);assert.equal(ctx.ownStore.id,sid);assert(ctx.rendered>0);assert(calls.includes('profiles'));assert(calls.includes('stores'));assert(calls.includes('catalog_categories'));assert(calls.includes('delivery_settings'));assert.equal(ctx.deliverySettings.delivery_fee,1000);
});
test('pinned local browser SDK exposes the unchanged client/session/storage API without a CDN fetch',async()=>{
 const ctx={self:null,fetch,Headers,Request,Response,URL,URLSearchParams,AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout,setInterval,clearInterval,console,crypto:globalThis.crypto,WebSocket:globalThis.WebSocket};ctx.self=ctx;vm.createContext(ctx);vm.runInContext(await readFile('vendor/supabase/supabase-2.57.0.js','utf8'),ctx);
 assert.equal(typeof ctx.supabase.createClient,'function');const client=ctx.supabase.createClient('https://example.supabase.co','test-public-anon-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 assert.equal(typeof client.auth.getSession,'function');assert.equal(typeof client.from('products').select,'function');assert.equal(typeof client.rpc,'function');assert(client.storage.from('products').getPublicUrl('a.jpg').data.publicUrl.endsWith('/products/a.jpg'));
 const session=await client.auth.getSession();assert.equal(session.error,null);assert.equal(session.data.session,null);
});


test('opening animation starts once the page is loaded, a tap skips it, and it always hands over to the site',async()=>{
 const t=await readFile('index.html','utf8'),start=t.indexOf('<script>',t.indexOf('id="startupSplash"'))+8,source=t.slice(start,t.indexOf('</script>',start));
 assert.ok(t.includes('class="ss-logo"')&&t.includes('class="ss-name"'),'animated Shatra logo and name are in the splash');
 assert.match(t,/#startupSplash\.play \.ss-river\{animation:ssFlow 1\.2s \.6s/);assert.match(t,/#startupSplash\.play \.ss-pin\{animation:ssDrop \.7s 1\.9s/);assert.match(t,/#startupSplash\.play \.ss-name\{animation:ssWrite 1\.4s 1\.9s/);
 const run=(ready=true)=>{const dataset=ready?{appReady:'true'}:{};const timers=[],events={},splashEvents={},classes=new Set(),cls=new Set();
  const splash={hidden:true,offsetWidth:1,classList:{add:(...k)=>k.forEach(x=>cls.add(x)),remove:(...k)=>k.forEach(x=>cls.delete(x)),contains:k=>cls.has(k)},addEventListener:(k,f)=>splashEvents[k]=f};
  const c={document:{getElementById:()=>splash,documentElement:{dataset},visibilityState:'visible',addEventListener(){},body:{classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)}}},window:{addEventListener:(k,f)=>events[k]=f},setTimeout:(fn,ms)=>timers.push({fn,ms}),clearTimeout(){}};
  vm.runInNewContext(source,c);return {timers,events,splashEvents,classes,cls,splash,dataset};};
 let r=run();assert.equal(r.splash.hidden,false);assert.ok(r.classes.has('starting'));assert.equal(r.cls.has('play'),false,'waits for the page before playing');
 r.events.load();assert.ok(r.cls.has('play'));
 r.timers.filter(x=>x.ms===4000).at(-1).fn();assert.ok(r.cls.has('leaving'));r.timers.find(x=>x.ms===350).fn();assert.equal(r.splash.hidden,true);assert.equal(r.classes.has('starting'),false);
 r=run(false);r.events.load();r.timers.filter(x=>x.ms===4000).at(-1).fn();assert.equal(r.cls.has('leaving'),false,'the splash waits while the account is still loading');r.dataset.appReady='true';r.timers.filter(x=>x.ms===120).at(-1).fn();assert.ok(r.cls.has('leaving'),'then hands straight over to the ready screen');
 r=run();r.events.load();r.splashEvents.click();assert.ok(r.cls.has('leaving'),'a tap skips the animation');r.timers.find(x=>x.ms===180).fn();assert.equal(r.splash.hidden,true,'site opens right after the tap');assert.equal(r.classes.has('starting'),false);
 r=run();r.timers.find(x=>x.ms===2500).fn();assert.ok(r.cls.has('play'),'starts after 2.5s even if load is slow');
 r=run();r.timers.find(x=>x.ms===24000).fn();assert.equal(r.splash.hidden,true,'never traps the user');
 r=run();r.events.pageshow({persisted:true});assert.equal(r.splash.hidden,true);
});
