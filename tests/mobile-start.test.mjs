import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const pages=['index.html','catalog.html','preview.html'];
test('first HTML paint defers buyer layout until account resolution and retains seller shell',async()=>{
 for(const path of pages){const t=await readFile(path,'utf8');assert(t.includes('<body>'));assert(t.includes('id="startupSplash" class="startup-splash" hidden'));assert(!t.includes('class="buyer-preflight"'));assert(t.includes('data-account-boot="true"'));assert(t.includes('initialAccountResolved'));assert(t.includes('class="boot-seller-shell')||t.includes('sw-shell boot-seller-shell'));assert(t.includes('id="sellerStartTemplate"'));assert(!t.includes('requestAnimationFrame(finish)'));assert(!t.includes('},15000)'));assert(!t.includes('https://esm.sh/@supabase'));if(path!=='preview.html'){assert(t.includes('vendor/supabase/supabase-2.57.0.js'));assert(t.includes('const {createClient}=window.supabase;'));}
 const f=t.slice(t.indexOf('function sellerResume(){'),t.indexOf('function render(){'));assert(f.includes("$('#sellerStartTemplate').innerHTML"));assert(!f.includes('seller-session-brand'));
 }
});
test('actual seller refresh finishes while secondary customer records are unresolved; identity still verified first',async()=>{
 const t=await readFile('index.html','utf8'),source=t.slice(t.indexOf('async function refresh(){'),t.indexOf('async function act('));
 const uid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222',calls=[];
 const tables={profiles:{id:uid,role:'seller',disabled:false},stores:[{id:sid,owner_id:uid,name:'متجر اختبار',approved:true,removed:false}],products:[],orders:[],seller_categories:[],catalog_categories:[],product_variants:[],product_stock_movements:[],delivery_settings:{platform_fee:500,delivery_fee:1000},delivery_workers:null,delivery_payments:[],driver_profiles:null,store_pickups:[],seller_workspace_settings:{settings:{}}};
 const query=table=>{const q={};for(const method of ['select','eq','order','limit','maybeSingle','is','in'])q[method]=()=>q;q.then=(resolve,reject)=>{calls.push(table);return Promise.resolve({data:tables[table]??[],error:null}).then(resolve,reject)};return q;};
 const ctx={refreshId:0,user:null,profile:null,ownStore:null,viewMode:'seller',dataReady:false,publicStoreId:null,tab:'account',ADMIN_PORTAL:false,D:{catalog:[],variants:[],pickups:[],cart:[]},CATS:[],db:{auth:{getSession:async()=>({data:{session:{user:{id:uid}}}})},from:query,rpc:async()=>({data:[]}),storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}})})}},withTimeout:p=>p,check:r=>r.data,unavailableSession:()=>false,sessionStorage:{getItem:()=>null,removeItem(){}},localStorage:{getItem:()=> 'seller'},workspace:{load:()=>new Promise(()=>{})},error:e=>{throw e},fromOrder:o=>o,rendered:0,save(){},resumePurchaseAfterLogin(){},finishAccountEntry(){},$:()=>({hidden:false})};
 ctx.canSell=()=>ctx.profile?.role==='seller'&&ctx.ownStore?.ok===true;ctx.rememberMode=m=>ctx.viewMode=m;ctx.render=()=>ctx.rendered++;
 vm.createContext(ctx);vm.runInContext(source,ctx);
 const done=ctx.refresh();let timer;try{await Promise.race([done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('secondary records blocked page')),100)})]);}finally{clearTimeout(timer);}
 assert.equal(ctx.dataReady,true);assert.equal(ctx.profile.id,uid);assert.equal(ctx.ownStore.id,sid);assert(ctx.rendered>0);assert(calls.includes('profiles'));assert(calls.includes('stores'));assert(calls.includes('catalog_categories'));assert(calls.includes('delivery_settings'));assert.equal(ctx.deliverySettings.delivery_fee,1000);
});
test('pinned local browser SDK exposes the unchanged client/session/storage API without a CDN fetch',async()=>{
 const ctx={self:null,fetch,Headers,Request,Response,URL,URLSearchParams,AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout,setInterval,clearInterval,console,crypto:globalThis.crypto,WebSocket:globalThis.WebSocket};ctx.self=ctx;vm.createContext(ctx);vm.runInContext(await readFile('vendor/supabase/supabase-2.57.0.js','utf8'),ctx);
 assert.equal(typeof ctx.supabase.createClient,'function');const client=ctx.supabase.createClient('https://example.supabase.co','test-public-anon-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 assert.equal(typeof client.auth.getSession,'function');assert.equal(typeof client.from('products').select,'function');assert.equal(typeof client.rpc,'function');assert(client.storage.from('products').getPublicUrl('a.jpg').data.publicUrl.endsWith('/products/a.jpg'));
 const session=await client.auth.getSession();assert.equal(session.error,null);assert.equal(session.data.session,null);
});

