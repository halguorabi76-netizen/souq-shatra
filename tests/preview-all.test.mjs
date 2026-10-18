import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createPreviewModel,IDS} from '../preview-lab.js';

// Three preview windows share one localStorage; each keeps its own model in memory.
function sharedStorage(){const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,v)};}
const order=(db,product)=>db.rpc('place_order',{p_store:IDS.store,p_lines:[{id:product,quantity:1}],p_name:'زبون',p_phone:'00000000000',p_address:'حي الحسين',p_note:''});

test('an order placed in the customer window reaches the merchant and driver windows, and their updates come back',async()=>{
 const storage=sharedStorage(),buyer=createPreviewModel(storage,()=>crypto.randomUUID()),seller=createPreviewModel(storage,()=>crypto.randomUUID()),driver=createPreviewModel(storage,()=>crypto.randomUUID());
 buyer.setRole('buyer');seller.setRole('seller');driver.setRole('driver');
 const product=buyer.snapshot().products[0];
 const placed=await order(buyer,product.id);assert.equal(placed.error,null);
 const seen=await seller.from('orders').select('*').eq('store_id',IDS.store);assert.equal(seen.data.length,1,'merchant sees the new order without reloading');
 assert.equal((await seller.rpc('set_order_status',{p_order:placed.data,p_status:'accepted'})).error,null);
 const mine=await buyer.from('orders').select('*').eq('id',placed.data).single();assert.equal(mine.data.status,'accepted','customer sees the acceptance');
 const second=await order(buyer,product.id);assert.equal(second.error,null);
 const all=await seller.from('orders').select('*').eq('store_id',IDS.store);assert.equal(all.data.length,2,'a later write from one window never erases another window\'s order');
 assert.equal(seller.snapshot().products.find(p=>p.id===product.id).stock,product.stock-2,'stock reflects both orders');
});

test('a store that ignores writes keeps the in-memory data (single-window behaviour unchanged)',async()=>{
 const base=createPreviewModel(sharedStorage()).snapshot(),frozen=JSON.stringify(base),db=createPreviewModel({getItem:()=>frozen,setItem(){}},()=>crypto.randomUUID());db.setRole('buyer');
 assert.equal((await order(db,base.products[0].id)).error,null);
 assert.equal((await db.from('orders').select('*')).data.length,1);
});

test('admin header offers the side-by-side view and marks it current',()=>{
 const c=vm.createContext({});vm.runInContext(readFileSync(new URL('../admin-hub.js',import.meta.url),'utf8').replace(/export /g,''),c);
 const all=c.adminHubHeader(true,true);assert.match(all,/href="admin.html\?section=preview&amp;role=all" aria-current="page"/);assert.doesNotMatch(all,/href="admin.html\?section=preview" aria-current/);
 assert.match(c.adminHubHeader(true),/href="admin.html\?section=preview" aria-current="page"/);
 const view=readFileSync(new URL('../preview-all.js',import.meta.url),'utf8');for(const role of ['buyer','seller','driver'])assert.match(view,new RegExp(`'${role}'`));assert.match(view,/sandbox="allow-scripts allow-same-origin/);assert.doesNotMatch(view,/supabase|config\.js/i);
});
