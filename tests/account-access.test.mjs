import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context={window:{}};vm.createContext(context);
vm.runInContext(readFileSync(new URL('../account-access.js',import.meta.url),'utf8'),context);
const create=context.window.SouqAccountAccess.createStorage;
class Storage{
 data=new Map();failKey='';
 get length(){return this.data.size}
 key(i){return [...this.data.keys()][i]??null}
 getItem(k){return this.data.get(k)??null}
 setItem(k,v){if(k===this.failKey)throw new Error('Storage unavailable');this.data.set(k,String(v))}
 removeItem(k){this.data.delete(k)}
}
const token='sb-project-auth-token',verifier=token+'-code-verifier';
test('remembered login survives a new browser session, without storing a password',()=>{
 const device=new Storage(),session=new Storage(),access=create(device,session,token);
 access.choose('device');access.storage.setItem(token,'signed-session');
 assert.equal(create(device,new Storage(),token).storage.getItem(token),'signed-session');
 assert.equal(session.getItem(token),null);
 assert.deepEqual([...device.data.keys()].sort(),[token,'souq-auth-retention'].sort());
});
test('session-only login and OAuth PKCE survive redirect and refresh but not a closed session',()=>{
 const device=new Storage(),session=new Storage(),access=create(device,session,token);
 access.storage.setItem(token,'old-session');access.storage.setItem(verifier,'pkce');
 device.setItem('sb-other-auth-token','other-account');device.setItem('cart','cart');
 access.choose('session');
 const reloaded=create(device,session,token);
 assert.equal(reloaded.storage.getItem(token),'old-session');assert.equal(reloaded.storage.getItem(verifier),'pkce');
 reloaded.storage.setItem(token,'refreshed-session');
 assert.equal(device.getItem(token),null);assert.equal(device.getItem(verifier),null);
 assert.equal(create(device,new Storage(),token).storage.getItem(token),null);
 assert.equal(device.getItem('cart'),'cart');assert.equal(device.getItem('sb-other-auth-token'),'other-account');
});
test('opting back into remembering migrates tokens; logout removes both copies',()=>{
 const device=new Storage(),session=new Storage(),access=create(device,session,token);
 access.choose('session');access.storage.setItem(token,'session');access.choose('device');
 assert.equal(session.getItem(token),null);assert.equal(device.getItem(token),'session');
 session.setItem(token,'stale');access.storage.removeItem(token);
 assert.equal(device.getItem(token),null);assert.equal(session.getItem(token),null);
});
test('failed migration keeps the previous session and preference intact',()=>{
 const device=new Storage(),session=new Storage(),access=create(device,session,token);
 access.choose('device');access.storage.setItem(token,'session');access.storage.setItem(verifier,'pkce');
 session.failKey=verifier;assert.throws(()=>access.choose('session'),/Storage unavailable/);
 assert.equal(access.mode(),'device');assert.equal(device.getItem(token),'session');assert.equal(session.getItem(token),null);
 assert.equal(create(device,session,token).mode(),'device');
});
function routing(){
 const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const c={user:{email:'old@example.test'},ownStore:null,driverAccount:null,ADMIN_PORTAL:false,sessionStorage:new Storage(),tab:'market',calls:[],sheet:s=>c.calls.push(['sheet',s]),head:s=>s,rememberMode:r=>c.calls.push(['mode',r]),canSell:()=>!!c.ownStore?.ok,render:()=>c.calls.push(['render']),sellerRequest:()=>c.calls.push(['sellerRequest']),driverWorkspace:{application:()=>c.calls.push(['driverApplication'])}};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function finishAccountEntry(){'),source.indexOf('function sellerRequest(){')),c);return c;
}
test('existing approved seller and driver enter their own workspace',()=>{
 for(const role of ['seller','driver']){
  const c=routing();if(role==='seller')c.ownStore={ok:true};else c.driverAccount={approved:true};
  c.sessionStorage.setItem('souq-role-login',role);c.finishAccountEntry();
  assert.equal(c.tab,'account');assert.deepEqual(c.calls,[['mode',role],['render']]);assert.equal(c.sessionStorage.getItem('souq-role-login'),null);
 }
});
test('unregistered professional account gets request or retry; pending seller stays in approval flow',()=>{
 const c=routing();c.sessionStorage.setItem('souq-role-login','driver');c.finishAccountEntry();
 assert.match(c.calls[0][1],/غير مسجّل/);assert.match(c.calls[0][1],/roleRequest/);assert.match(c.calls[0][1],/roleExisting/);assert.equal(c.tab,'market');
 const pending=routing();pending.ownStore={ok:false};pending.sessionStorage.setItem('souq-role-login','seller');pending.finishAccountEntry();assert.deepEqual(pending.calls,[['sellerRequest']]);
});
test('new professional login opens the requested application after authentication',()=>{
 for(const role of ['seller','driver']){
  const c=routing();c.sessionStorage.setItem('souq-role-request',role);c.finishAccountEntry();
  assert.ok(c.calls.some(call=>call[0]===(role==='seller'?'sellerRequest':'driverApplication')));
  assert.equal(c.sessionStorage.getItem('souq-role-request'),null);
 }
});
