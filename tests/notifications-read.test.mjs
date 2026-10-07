import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function fixture({driver=false}={}){
 const elements=new Map(),badge={hidden:true,textContent:''},storage=new Map(),updates=[];
 const state={user:{id:'account-one'},profile:{},mode:driver?'driver':'seller',driver:{approved:driver}};
 const notices=[{id:'first',recipient_id:'account-one',read_at:null,event_key:'order:first',title:'طلب',body:'جديد',created_at:'now'}];
 const offers=driver?[{order_id:'delivery-one',store_name:'متجر',items:[]}]:[];
 let fail=false,hold=null;
 const document={hidden:false,body:{append:el=>elements.set(el.id,el)},getElementById:id=>elements.get(id),
  createElement:()=>({dataset:{},setAttribute(){},focus(){},remove(){elements.delete(this.id);}}),
  querySelectorAll:()=>[badge],querySelector:()=>null,addEventListener(){}};
 const db={from(table){let action='select',payload,filters=[];const q={
  select(){return q;},update(value){action='update';payload=value;return q;},
  eq(key,value){filters.push([key,value]);return q;},in(key,value){filters.push([key,value]);return q;},
  is(key,value){filters.push([key,value]);return q;},order(){return q;},limit(){return q;},
  async then(resolve,reject){try{
   if(table==='product_interactions')return resolve({data:[]});
   if(action==='select'){if(hold)await hold;return resolve({data:notices.filter(n=>filters.every(([k,v])=>n[k]===v)).map(n=>({...n}))});}
   updates.push({payload,filters});if(fail)return resolve({error:new Error('network unavailable')});
   notices.filter(n=>filters.every(([k,v])=>Array.isArray(v)?v.includes(n[k]):n[k]===v)).forEach(n=>Object.assign(n,payload));
   return resolve({data:null});
  }catch(error){reject(error);}}
 };return q;},rpc:async()=>({data:offers.map(o=>({...o}))})};
 const sandbox={document,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},setInterval(){}};
 vm.createContext(sandbox);vm.runInContext(readFileSync(new URL('../activity-center.js',import.meta.url),'utf8').replace(/export /g,''),sandbox);
 const center=sandbox.createActivityCenter({db,get:()=>state,esc:String,fmt:String,when:String,check:r=>{if(r.error)throw r.error;return r.data;},error(){}});
 return {center,state,notices,badge,updates,storage,document,setFail:v=>fail=v,setHold:v=>hold=v};
}
test('opening notifications clears badge, persists only displayed rows, and keeps history',async()=>{
 const f=fixture();await f.center.poll();assert.equal(f.badge.hidden,false);assert.equal(f.badge.textContent,1);
 await f.center.show();assert.equal(f.badge.hidden,true);assert.ok(f.notices[0].read_at);
 assert.equal(f.updates.length,1);assert.deepEqual(JSON.parse(JSON.stringify(f.updates[0].filters)),[['recipient_id','account-one'],['id',['first']],['read_at',null]]);
 f.center.close();await f.center.poll();assert.equal(f.badge.hidden,true);assert.equal(f.notices.length,1);
 f.notices.push({...f.notices[0],id:'second',read_at:null});await f.center.poll();assert.equal(f.badge.hidden,false);assert.equal(f.badge.textContent,1);
 await f.center.show();assert.equal(f.badge.hidden,true);assert.ok(f.notices[1].read_at);
});
test('new notifications while feed is visible are acknowledged; hidden page is not',async()=>{
 const f=fixture();await f.center.show();f.notices.push({...f.notices[0],id:'second',read_at:null});await f.center.poll();assert.equal(f.badge.hidden,true);
 f.document.hidden=true;f.notices.push({...f.notices[0],id:'third',read_at:null});await f.center.poll();assert.equal(f.notices[2].read_at,null);
 f.document.hidden=false;await f.center.poll();assert.ok(f.notices[2].read_at);
});
test('driver offer badge clears and seen offers persist per account',async()=>{
 const f=fixture({driver:true});await f.center.poll();assert.equal(f.badge.textContent,2);await f.center.show();assert.equal(f.badge.hidden,true);
 assert.deepEqual(JSON.parse(f.storage.get('souq-offers-read-account-one')),['delivery-one']);f.center.close();await f.center.poll();assert.equal(f.badge.hidden,true);
});
test('opening during an existing load reads on completion, closing before load does not',async()=>{
 for(const close of [false,true]){const f=fixture();let release;f.setHold(new Promise(r=>release=r));const pending=f.center.poll();await f.center.show();if(close)f.center.close();release();await pending;assert.equal(!!f.notices[0].read_at,!close);}
});
test('failed persistence keeps unread badge and can be retried',async()=>{
 const f=fixture();f.setFail(true);await assert.rejects(f.center.show(),/network unavailable/);assert.equal(f.badge.hidden,false);assert.equal(f.notices[0].read_at,null);
 f.setFail(false);await f.center.poll();assert.equal(f.badge.hidden,true);
});
test('changing account during load does not mark prior-account notifications',async()=>{
 const f=fixture();let release;f.setHold(new Promise(r=>release=r));const pending=f.center.show();f.state.user={id:'account-two'};release();await pending;assert.equal(f.updates.length,0);assert.equal(f.notices[0].read_at,null);
});
