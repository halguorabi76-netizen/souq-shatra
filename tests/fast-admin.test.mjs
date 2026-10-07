import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('admin-app.js','utf8');
function setup(role='admin',disabled=false){
 let release;const pending=new Promise(r=>release=r),queries=[],renders=[];
 const result={id:'owner',role,disabled};
 function query(table){
  queries.push(table);let fields;
  const chain={select:f=>{fields=f;return chain},order:()=>chain,limit:()=>chain,eq:()=>chain,maybeSingle:()=>Promise.resolve({data:fields==='*'&&table==='profiles'?result:null}),then:(ok,bad)=>(table==='stores'?pending:Promise.resolve({data:[]})).then(ok,bad)};
  return chain;
 }
 const c={user:null,profile:null,ownStore:null,refreshId:1,adminAccessReady:false,dataReady:false,D:{m:[],p:[],o:[],people:[]},deliveryPayments:[],deliverySettings:{},viewMode:'guest',db:{from:query,rpc:async name=>{queries.push(name);return {data:[]}}},withTimeout:p=>p,check:r=>{if(r.error)throw r.error;return r.data},render:()=>renders.push({role:c.profile?.role,ready:c.adminAccessReady,dataReady:c.dataReady}),window:{SouqLoading:{recovered(){}}},fromOrder:o=>o,clearUnavailableAccount:async()=>{},refresh:async()=>{}};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('async function refreshAdmin('),source.indexOf('async function refresh(){')),c);
 return {c,queries,renders,release:()=>release({data:[]})};
}
test('authorized workspace renders before slow datasets finish; data loads concurrently',async()=>{
 const x=setup(),job=x.c.refreshAdmin(1,{id:'owner'});
 await new Promise(setImmediate);
 assert.equal(x.renders[0].role,'admin');assert.equal(x.renders[0].ready,true);assert.equal(x.renders[0].dataReady,false);
 assert.equal(x.queries.length,13);assert.equal(x.c.dataReady,false);
 x.release();await job;assert.equal(x.c.dataReady,true);assert.equal(x.c.D.loading,false);assert.equal(x.renders.at(-1).dataReady,true);
});
test('ordinary and disabled accounts never request administration datasets',async()=>{
 for(const [role,disabled] of [['buyer',false],['admin',true]]){const x=setup(role,disabled);await x.c.refreshAdmin(1,{id:'owner'});assert.deepEqual(x.queries,['profiles']);assert.equal(x.c.adminAccessReady,true);assert.equal(x.c.profile.role,role);}
});
test('an obsolete verification response cannot open a dashboard',async()=>{const x=setup();x.c.refreshId=2;await x.c.refreshAdmin(1,{id:'owner'});assert.equal(x.renders.length,0);assert.equal(x.c.adminAccessReady,false);});
