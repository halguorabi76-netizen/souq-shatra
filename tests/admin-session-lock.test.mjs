import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function client(file){
 let lockCalls=0;
 const session={access_token:'test-token',refresh_token:'test-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:'00000000-0000-0000-0000-000000000001',email:'owner@example.test'}};
 const storage={getItem:()=>JSON.stringify(session),setItem(){},removeItem(){}};
 const ctx={self:null,window:null,navigator:{locks:{request:()=>{lockCalls++;return new Promise(()=>{})}}},document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},location:{href:'https://souq.test/admin.html'},history:{replaceState(){}},fetch:()=>{throw Error('No network expected for a valid saved session')},Headers,Request,Response,URL,URLSearchParams,AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout,setInterval,clearInterval,console,crypto:globalThis.crypto};
 ctx.WebSocket=globalThis.WebSocket;ctx.self=ctx;ctx.window=ctx;ctx.addEventListener=()=>{};ctx.removeEventListener=()=>{};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
 const db=ctx.supabase.createClient('https://example.supabase.co','test-public-key',{auth:{storage,autoRefreshToken:false,persistSession:true,detectSessionInUrl:false}});
 return {db,locks:()=>lockCalls};
}
test('admin session resolves even when another tab holds the legacy auth lock',async()=>{
 const old=client('vendor/supabase/supabase-2.57.0.js');
 assert.equal(await Promise.race([old.db.auth.getSession().then(()=> 'resolved'),new Promise(r=>setTimeout(()=>r('blocked'),50))]),'blocked');assert.ok(old.locks()>0);
 const next=client('vendor/supabase/supabase-2.117.3.js');
 let timer;
 const result=await Promise.race([next.db.auth.getSession(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('session hung')),500)})]).finally(()=>clearTimeout(timer));
 assert.equal(result.error,null);assert.equal(result.data.session.user.email,'owner@example.test');assert.equal(next.locks(),0);
 next.db.auth.dispose();
});
test('admin entry pins the new SDK while keeping the public site dependency unchanged',()=>{
 assert.match(fs.readFileSync('admin.html','utf8'),/vendor\/supabase\/supabase-2\.117\.3\.js/);
 assert.match(fs.readFileSync('index.html','utf8'),/vendor\/supabase\/supabase-2\.117\.3\.js/);
});
