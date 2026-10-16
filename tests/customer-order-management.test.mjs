import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createPreviewModel} from '../preview-lab.js';
const html=fs.readFileSync('index.html','utf8');
function context(){const view={innerHTML:''},c={D:{o:[],orderFilter:'all'},user:{id:'buyer',email:'buyer@example.invalid'},profile:{},esc:s=>String(s),ordCard:o=>`<article>${o.id}</article>`,chatButton:()=>'',rateBlock:()=>'',$:()=>view};vm.createContext(c);vm.runInContext(html.slice(html.indexOf('function customerOrderControls('),html.indexOf('async function loadCustomerOrders(')),c);return c;}
test('customer controls distinguish unassigned cancellation, hidden assigned cancellation, delivered return and hidden restoration',()=>{
 const c=context(),control=(st,driver_id=null,customer_action=null)=>c.customerOrderControls({id:'order',st,driver_id,customer_action});
 assert.match(control(0),/>✕ إلغاء الطلب</);for(const st of [0,1,2])assert.doesNotMatch(control(st,'driver'),/\|cancel|طلب إلغاء|إلغاء الطلب/);assert.match(control(1),/>✕ إلغاء الطلب</);assert.doesNotMatch(control(2),/\|cancel/);assert.match(control(3),/طلب إرجاع/);assert.doesNotMatch(control(4),/\|cancel|\|return/);assert.match(control(3,null,{hidden_at:'now'}),/\|restore/);assert.doesNotMatch(control(3,null,{request_kind:'return'}),/data-v="order\|return"/);
});
test('history contains completed and cancelled orders by default, is account-specific and hidden orders remain restorable',()=>{
 const c=context();c.D.o=[{id:'active',buyer_id:'buyer',st:0},{id:'done',buyer_id:'buyer',st:3},{id:'cancelled',buyer_id:'buyer',st:4},{id:'hidden',buyer_id:'buyer',st:3,customer_action:{hidden_at:'now'}},{id:'other-account',buyer_id:'other',st:3}];
 const render=()=>c.customerOrderHub();assert.match(render(),/<article>done/);assert.match(render(),/<article>cancelled/);assert.doesNotMatch(render(),/<article>hidden|other-account/);
 c.D.orderFilter='previous';assert.match(render(),/<article>done/);assert.doesNotMatch(render(),/<article>active/);c.D.orderFilter='hidden';assert.match(render(),/<article>hidden/);assert.doesNotMatch(render(),/<article>done/);
});
test('cart defaults to order history, checkout is explicitly selected and opening history fetches own saved orders',()=>{
 assert.match(html,/cartPane:'orders'/);assert.match(html,/data-cart-pane="items"/);assert.match(html,/if\(D.cartPane==='orders'&&!cartReceipt\)/);assert.match(html,/eq\('buyer_id',identity\)/);assert.match(html,/customerOrdersError/);
});
test('preview cancellation restores stock once and hiding never deletes the underlying order',async()=>{
 const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const model=createPreviewModel(globalThis.localStorage,()=>crypto.randomUUID());const client=model;model.setRole('buyer');const data=model.snapshot(),product=data.products[0];
 const result=await client.rpc('place_order',{p_store:data.stores[0].id,p_lines:[{id:product.id,quantity:1}],p_name:'QA',p_phone:'00000000000',p_address:'test'});assert.equal(result.error,null);const id=result.data;
 for(let i=0;i<2;i++)assert.equal((await client.rpc('customer_order_action',{p_order:id,p_action:'cancel'})).data,'cancelled');
 assert.equal(model.snapshot().products[0].stock,product.stock);
 await client.rpc('customer_order_action',{p_order:id,p_action:'hide'});assert.equal(model.snapshot().orders.length,1);assert.ok(model.snapshot().order_customer_actions[0].hidden_at);
 await client.rpc('customer_order_action',{p_order:id,p_action:'restore'});assert.equal(model.snapshot().order_customer_actions[0].hidden_at,null);
});

test('stale cancellation actions are blocked when driver assignment has already arrived',async()=>{
 const calls=[],order={id:'order',buyer_id:'buyer',st:0,driver_id:'driver'};
 const c={D:{o:[order]},user:{id:'buyer'},toast:msg=>calls.push(msg),A:{close:()=>calls.push('close')},db:{rpc:()=>{throw Error('Cancellation must not reach RPC')}},sheet:()=>{throw Error('Cancellation dialog must not open')}};
 vm.createContext(c);vm.runInContext(html.slice(html.indexOf('function customerActionAsk('),html.indexOf('function account(')),c);
 c.customerActionAsk('order|cancel');await c.performCustomerAction('order|cancel');assert.equal(calls.filter(s=>s.includes('لا يمكن إلغاء')).length,2);
});

test('help is available only on assigned active orders; returns open a dialog',()=>{
 const c=context();assert.match(c.customerOrderControls({id:'order',st:1,driver_id:'driver'}),/data-op="help"/);
 for(const st of [3,4])assert.doesNotMatch(c.customerOrderControls({id:'order',st,driver_id:'driver'}),/data-op="help"/);
 const calls=[];Object.assign(c,{D:{o:[{id:'order',st:3,buyer_id:'buyer',driver_id:'driver'}]},orderDialog:(title,body)=>calls.push({title,body}),sheet:()=>{throw Error('full page must not open')}});
 vm.runInContext(html.slice(html.indexOf('function customerActionAsk('),html.indexOf('async function performCustomerAction(')),c);
 c.customerActionAsk('order|return');assert.equal(calls[0].title,'طلب إرجاع');assert.match(calls[0].body,/customerActionReason/);
});
