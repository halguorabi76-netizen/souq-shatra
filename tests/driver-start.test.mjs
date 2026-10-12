import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(fail=false){
 const source=fs.readFileSync('index.html','utf8'),id='11111111-1111-4111-8111-111111111111',local=new Map([['souq-shatra-mode-'+id,'seller'],['souq-shatra-account-layout-'+id,'seller']]),pending=new Map([['souq-shatra-pending-role','seller']]);
 const tables={profiles:{id,role:'driver',disabled:false},delivery_workers:{user_id:id,approved:true,amount_due:0,debt_limit:10000},driver_profiles:{user_id:id,full_name:'سائق اختبار'},delivery_settings:{delivery_fee:1000},orders:[{id:'assigned',driver_id:id,status:'accepted',order_items:[]}],delivery_payments:[]};
 const query=table=>{const q={};for(const key of ['select','eq','order','limit','maybeSingle','is','in'])q[key]=()=>q;q.then=(ok,bad)=>{
 if(['stores','products','catalog_categories','product_variants'].includes(table))return new Promise(()=>{});
 return Promise.resolve(fail&&table==='orders'?{error:Error('driver data unavailable')}:{data:tables[table]}).then(ok,bad);
 };return q;};
 const renders=[];const c={refreshId:0,user:null,profile:null,ownStore:{id:'stale-store'},viewMode:'seller',sellerEntryPending:true,accountResolving:true,initialAccountResolved:false,dataReady:false,tab:'market',publicStoreId:null,D:{cart:[]},ADMIN_PORTAL:false,db:{auth:{getSession:async()=>({data:{session:{user:{id}}}})},from:query,rpc:async()=>({data:[]})},withTimeout:p=>p,check:r=>{if(r.error)throw r.error;return r.data},unavailableSession:()=>false,sessionStorage:{getItem:k=>pending.get(k)||null,removeItem:k=>pending.delete(k)},localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)},render(){renders.push({mode:c.viewMode,ready:c.dataReady,error:c.D.driverError})},rememberMode:m=>{c.viewMode=m;local.set('souq-shatra-mode-'+id,m)},fromOrder:o=>({id:o.id,st:1}),finishAccountEntry(){},window:{SouqLoading:{recovered(){}}},$:()=>({hidden:false})};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('async function refreshDriver('),source.indexOf('async function act(')),c);return {c,local,pending,id,renders};
}
test('approved driver overrides stale seller hints and opens without waiting for market requests',async()=>{
 const x=setup();let timer;await Promise.race([x.c.refresh(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('driver blocked by market')),100)})]).finally(()=>clearTimeout(timer));
 assert.equal(x.c.viewMode,'driver');assert.equal(x.c.profile.role,'driver');assert.equal(x.c.driverAccount.approved,true);assert.equal(x.c.dataReady,true);assert.equal(x.c.ownStore,null);assert.equal(x.c.sellerEntryPending,false);assert.equal(x.local.get('souq-shatra-account-layout-'+x.id),'driver');assert.equal(x.pending.size,0);assert.equal(x.c.tab,'account');assert.equal(x.c.D.o[0].driver_id,x.id);assert.equal(x.renders.at(-1).mode,'driver');
});
test('driver data failure replaces seller boot state with a recoverable driver error',async()=>{
 const x=setup(true);await assert.rejects(x.c.refresh(),/driver data unavailable/);assert.equal(x.c.viewMode,'driver');assert.equal(x.c.sellerEntryPending,false);assert.equal(x.c.dataReady,false);assert.match(x.c.D.driverError,/أعد المحاولة/);assert.equal(x.renders.at(-1).mode,'driver');
});
