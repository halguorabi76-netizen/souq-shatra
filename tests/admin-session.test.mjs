import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createAdminSession} from '../admin-session.js';
const clock=1791796200000,owner={id:'owner',email:'owner@example.test'};
const saved={access_token:'valid-access',refresh_token:'refresh',expires_at:clock/1000+3600,user:{id:'forged-user'}};
function setup(value=saved,handler=()=>new Response(JSON.stringify(owner))){
 let stored=value?JSON.stringify(value):null,calls=[],cleaned='';
 const location={hash:'',pathname:'/admin.html',search:'?v=154',href:'https://souq.test/admin.html?v=154',assign:url=>calls.push({redirect:url})};
 const storage={getItem:()=>stored,setItem:(k,v)=>{stored=v},removeItem:()=>{stored=null}};
 const client=createAdminSession({url:'https://project.supabase.co',key:'public-key',storage,location,history:{replaceState:(state,title,path)=>{cleaned=path;location.hash=''}},now:()=>clock,fetchImpl:async(url,init)=>{calls.push({url,init});return handler(url,init)},timeoutMs:20});
 return {client,calls,location,storage,get stored(){return stored},get cleaned(){return cleaned}};
}
test('saved phone session uses verified server identity and stays available after a reload',async()=>{
 const x=setup(),r=await x.client.auth.getSession();assert.equal(r.error,null);assert.equal(r.data.session.user.id,'owner');assert.equal(x.calls.length,1);assert.match(x.calls[0].url,/auth\/v1\/user$/);
 const next=setup(JSON.parse(x.stored));assert.equal((await next.client.auth.getSession()).data.session.user.id,'owner');
});
test('expired token refreshes once and concurrent administration queries share the result',async()=>{
 const x=setup({...saved,expires_at:clock/1000-1},url=>new Response(JSON.stringify(url.includes('/token')?{...saved,access_token:'new',expires_at:undefined,expires_in:3600}:owner)));
 const tokens=await Promise.all(Array.from({length:12},()=>x.client.accessToken()));assert.ok(tokens.every(t=>t==='new'));assert.equal(x.calls.filter(c=>c.url.includes('/token')).length,1);assert.equal(x.calls.length,2);
 assert.equal(await x.client.accessToken(),'new');assert.equal(x.calls.length,2);
});
test('network error preserves the device session for retry; revoked identity returns to login',async()=>{
 const x=setup(saved,()=>{throw new TypeError('network down')});assert.ok((await x.client.auth.getSession()).error);assert.ok(x.stored);
 const y=setup(saved,()=>new Response(JSON.stringify({message:'invalid token'}),{status:401}));assert.equal((await y.client.auth.getSession()).data.session,null);assert.equal(y.stored,null);
});
test('OAuth callback is validated and removes tokens from URL history',async()=>{
 const x=setup(null);x.location.hash='#access_token=callback-access&refresh_token=callback-refresh&expires_in=3600';const r=await x.client.auth.getSession();assert.equal(r.data.session.user.id,'owner');assert.equal(x.cleaned,'/admin.html?v=154');assert.equal(x.location.hash,'');assert.match(x.calls[0].init.headers.Authorization,/callback-access/);
});
test('no session means no identity and no server requests',async()=>{const x=setup(null);assert.equal((await x.client.auth.getSession()).data.session,null);assert.equal(await x.client.accessToken(),null);assert.equal(x.calls.length,0)});
test('Supabase data client uses the validated token without creating a shared Auth client',async()=>{
 const x=setup();let lockCalls=0,authorization='';
 const ctx={self:null,fetch,Headers,Request,Response,URL,URLSearchParams,AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout,setInterval,clearInterval,console,crypto:globalThis.crypto,WebSocket:globalThis.WebSocket,navigator:{locks:{request(){lockCalls++;throw Error('shared auth must not run')}}}};ctx.self=ctx;
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('vendor/supabase/supabase-2.117.3.js','utf8'),ctx);
 const db=ctx.supabase.createClient('https://project.supabase.co','public-key',{accessToken:x.client.accessToken,global:{fetch:async(url,init)=>{authorization=new Headers(init.headers).get('Authorization');return new Response(JSON.stringify([{id:'owner',role:'admin'}]),{headers:{'Content-Type':'application/json'}})}}});
 db.auth=x.client.auth;
 const r=await db.from('profiles').select('*');assert.equal(r.error,null);assert.equal(r.data[0].role,'admin');assert.equal(authorization,'Bearer valid-access');assert.equal(lockCalls,0);assert.equal((await db.auth.getSession()).data.session.user.id,'owner');
});
test('a stalled authentication request exits on timeout while preserving the saved phone session',async()=>{
 const x=setup(saved,(url,init)=>new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Object.assign(new Error('abort'),{name:'AbortError'})))));
 const r=await x.client.auth.getSession();assert.equal(r.error.name,'TimeoutError');assert.ok(x.stored);
});
test('a late verification response cannot restore a locally signed-out account',async()=>{
 let release;const response=new Promise(r=>release=r),x=setup(saved,url=>url.includes('/logout')?new Response(null,{status:204}):response);const loading=x.client.auth.getSession();await x.client.auth.signOut();release(new Response(JSON.stringify(owner)));assert.equal((await loading).data.session,null);assert.equal(x.stored,null);
});
test('administration OAuth fallback redirects before the marketplace starts and preserves the callback',()=>{
 const html=fs.readFileSync('index.html','utf8'),match=html.match(/<script>\s*\/\/ Route an administration OAuth return[\s\S]*?<\/script>/);assert.ok(match);
 const code=match[0].replace(/^<script>|<\/script>$/g,''),ctx={URL,URLSearchParams,sessionStorage:{getItem:()=> '1'},location:{href:'https://souq.test/index.html#access_token=example&refresh_token=example',hash:'#access_token=example&refresh_token=example',search:'',replace:url=>{ctx.redirect=url}}};vm.runInNewContext(code,ctx);assert.match(ctx.redirect,/admin.html\?v=154#access_token=example/);assert.ok(html.indexOf(match[0])<html.indexOf('vendor/supabase/'));
});
