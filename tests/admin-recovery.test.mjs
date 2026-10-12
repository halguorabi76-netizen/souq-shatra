import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const src=fs.readFileSync('admin-app.js','utf8');
const body=src.slice(src.indexOf('async function refreshAdmin('),src.indexOf('async function act('));
async function scenario(failure,role='admin'){
 let renders=[],loading={hidden:false},queries=0;
 const owner={id:'owner',email:'owner@example.test'};
 const db={auth:{getSession:async()=>failure==='session'?Promise.reject(new Error('session timeout')):{data:{session:{user:owner}}}},from:table=>{
 const query={then(resolve,reject){queries++; if((failure==='profile'&&table==='profiles')||(failure==='dataset'&&table==='orders'))return Promise.reject(new Error(table+' timeout')).then(resolve,reject);return Promise.resolve({data:table==='profiles'?{role,disabled:false}:table==='delivery_settings'?null:[]}).then(resolve,reject)}};
 for(const method of ['select','eq','order','limit','maybeSingle'])query[method]=()=>query;return query;},rpc:()=>Promise.resolve({data:[]})};
 const ctx={db,ADMIN_PORTAL:true,window:{SouqLoading:{recovered(){}}},$:()=>loading,withTimeout:p=>p,check:r=>{if(r.error)throw r.error;return r.data},unavailableSession:()=>false,render(){renders.push(vm.runInContext('({error:adminLoadError?.message,ready:adminAccessReady,loading:D.loading})',ctx))},clearUnavailableAccount:()=>{throw Error('unexpected signout')},fromOrder:()=>{},Map};
 vm.createContext(ctx);
 vm.runInContext('let refreshId=0,adminLoadError=null,user=null,profile=null,ownStore=null,adminAccessReady=false,dataReady=false,viewMode="guest",deliveryPayments=[],deliverySettings={};let D={};'+body+';globalThis.run=refresh;globalThis.state=()=>({error:adminLoadError,profile,adminAccessReady,dataReady,D});',ctx);
 if(failure)await assert.rejects(ctx.run(),/timeout/);else await ctx.run();
 assert.equal(loading.hidden,true);
 if(failure){assert.match(ctx.state().error.message,/timeout/);assert.equal(renders.at(-1).loading,false);}
 else {assert.equal(ctx.state().error,null);assert.equal(ctx.state().adminAccessReady,true);assert.equal(ctx.state().dataReady,true);assert.equal(ctx.state().profile.role,role);}
 return queries;
}
(async()=>{await scenario('session');await scenario('profile');await scenario('dataset');await scenario(null);await scenario(null,'buyer');console.log('PASS: session/profile/data failures exit loading; admin succeeds; buyer remains unauthorized.');})().catch(e=>{console.error(e);process.exitCode=1});
