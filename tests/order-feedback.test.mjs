import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(rpc=async()=>({error:null})){
 const source=fs.readFileSync('index.html','utf8'),start=source.indexOf('async function acceptSellerOrder('),end=source.indexOf('async function syncNotifiedOrders(',start),calls=[],messages=[];
 const c={user:{id:'seller'},D:{o:[{id:'order',st:0}]},db:{rpc:(...args)=>{calls.push(args);return rpc(...args)},from:()=>{const q={select:()=>q,eq:()=>q,single:()=>new Promise(()=>{})};return q;}},withTimeout:p=>p,check:r=>{if(r.error)throw r.error;return r.data},A:{close:()=>calls.push('closed')},render:()=>calls.push('rendered'),toast:m=>messages.push(m),activity:{poll:async()=>{}},window:{SouqLoading:{recovered(){}}}};
 c.orderRead=()=>c.db.from('orders').select('*,order_items(*),order_customer_actions(*)');vm.createContext(c);vm.runInContext(source.slice(start,end),c);return {c,calls,messages};
}
test('seller sees confirmed acceptance immediately without waiting for a stalled read or whole-site refresh',async()=>{
 const x=setup(),button={disabled:false,isConnected:true};await x.c.acceptSellerOrder('order',button);assert.equal(x.c.D.o[0].st,1);assert.ok(x.calls.includes('closed'));assert.ok(x.calls.includes('rendered'));assert.match(x.messages[0],/تم قبول الطلب/);assert.equal(button.disabled,false);assert.equal(x.calls[0][1].p_status,'accepted');
});
test('repeated clicks issue only one acceptance and failed writes never show success',async()=>{
 let release;const x=setup(()=>new Promise(r=>release=r)),button={disabled:false,isConnected:true},pending=x.c.acceptSellerOrder('order',button);assert.equal(button.disabled,true);await x.c.acceptSellerOrder('order',button);assert.equal(x.calls.length,1);release({error:Error('not permitted')});await assert.rejects(pending,/not permitted/);assert.equal(x.c.D.o[0].st,0);assert.equal(x.messages.length,0);assert.equal(button.disabled,false);
});
test('stale acceptance button cannot advance an already accepted order to delivery',async()=>{
 const x=setup();x.c.D.o[0].st=1;await x.c.acceptSellerOrder('order',{});assert.equal(x.calls.filter(Array.isArray).length,0);assert.equal(x.c.D.o[0].st,1);
});
test('notification-driven order synchronization updates buyer status from server rows',async()=>{
 const source=fs.readFileSync('index.html','utf8'),start=source.indexOf('async function syncNotifiedOrders('),end=source.indexOf('function ordCard(',start);let renders=0;
 const q={select:()=>q,in:async()=>({data:[{id:'order',status:'accepted',driver_id:null}]})},c={user:{id:'buyer'},D:{o:[{id:'order',st:0}]},db:{from:()=>q},withTimeout:p=>p,check:r=>r.data,fromOrder:r=>({id:r.id,st:r.status==='accepted'?1:0}),tab:'chats',$:()=>({hidden:true}),render:()=>renders++};c.orderRead=()=>c.db.from('orders').select('*,order_items(*),order_customer_actions(*)');vm.createContext(c);vm.runInContext(source.slice(start,end),c);await c.syncNotifiedOrders(['order']);assert.equal(c.D.o[0].st,1);assert.equal(renders,1);
});
test('open order tracking details update in place without closing the customer dialog',async()=>{
 const source=fs.readFileSync('index.html','utf8'),start=source.indexOf('async function syncNotifiedOrders('),end=source.indexOf('function ordCard(',start),card={dataset:{orderId:'order'},outerHTML:'old'};
 const q={select:()=>q,in:async()=>({data:[{id:'order',status:'accepted',driver_id:'driver'}]})},c={user:{id:'buyer'},ownStore:null,D:{o:[{id:'order',st:0}]},db:{from:()=>q},withTimeout:p=>p,check:r=>r.data,fromOrder:r=>({id:r.id,st:1}),tab:'chats',$:s=>s.includes('.ord')?card:{hidden:false},ordCard:r=>'updated:'+r.st+':'+r.driver_id,render(){throw Error('dialog must remain open')}};c.orderRead=()=>c.db.from('orders').select('*,order_items(*),order_customer_actions(*)');vm.createContext(c);vm.runInContext(source.slice(start,end),c);await c.syncNotifiedOrders(['order']);assert.equal(card.outerHTML,'updated:1:driver');
});
