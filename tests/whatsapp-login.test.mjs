import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {startWhatsappLogin,claimWhatsappLogin,whatsappLink} from '../whatsapp-login.js';
const {createHandler,codeIn,localPhone}=await import('data:text/javascript;base64,'+Buffer.from(readFileSync(new URL('../supabase/functions/whatsapp-login/index.ts',import.meta.url),'utf8')).toString('base64'));
const site='https://halguorabi76-netizen.github.io';
const rpcCall=(f,name)=>f.calls.filter(c=>c.url.endsWith('/rpc/'+name));
const fixture=(rpc={},owned=[])=>{
 const calls=[];
 const handler=createHandler({url:'https://db.invalid',anonKey:'public',serviceKey:'server-only',number:'9647837271707',verifyToken:'hook-token',appSecret:'app-secret',fetcher:async(url,options)=>{calls.push({url,...options,body:options.body&&JSON.parse(options.body)});
  if(url.includes('/rpc/'))return Response.json(rpc[url.split('/rpc/')[1]]??true);
  if(url.includes('/rest/v1/')&&!url.includes('/rpc/'))return Response.json(owned.some(t=>url.includes('/rest/v1/'+t+'?'))?[{role:'seller'}]:[]);
  if(url.endsWith('/admin/generate_link'))return Response.json({hashed_token:'hash-1'});
  if(url.endsWith('/verify'))return Response.json({access_token:'access',refresh_token:'refresh'});
  return Response.json({id:'new-user'});}});
 const site_=body=>handler(new Request('https://edge.invalid',{method:'POST',headers:{Origin:site,'Content-Type':'application/json'},body:JSON.stringify(body)}));
 const meta=(payload,secret='app-secret')=>{const raw=JSON.stringify(payload);return handler(new Request('https://edge.invalid',{method:'POST',headers:{'X-Hub-Signature-256':'sha256='+createHmac('sha256',secret).update(raw).digest('hex')},body:raw}))};
 return {calls,handler,site:site_,meta};
};
const message=(from,body)=>({entry:[{changes:[{value:{messages:[{from,type:'text',text:{body}}]}}]}]});

test('code reader accepts the prepared message and Arabic-Indic digits only as a whole 6-digit code',()=>{
 assert.equal(codeIn('رمز الدخول إلى سوق الشطرة: 482913'),'482913');assert.equal(codeIn('رمز ٤٨٢٩١٣'),'482913');assert.equal(codeIn('07801234567'),null);assert.equal(codeIn(null),null);assert.equal(localPhone('9647801234567'),'07801234567');
 assert.equal(whatsappLink('9647837271707','482913'),'https://wa.me/9647837271707?text='+encodeURIComponent('رمز الدخول إلى سوق الشطرة: 482913'));
});
test('start returns a code, a browser-only secret and the business number; the database stores only the secret hash',async()=>{
 const f=fixture({whatsapp_login_start:{code:'482913'}});const r=await f.site({action:'start'});assert.equal(r.status,200);const body=await r.json();
 assert.equal(body.code,'482913');assert.equal(body.number,'9647837271707');assert.match(body.secret,/^[0-9a-f]{64}$/);assert.equal(r.headers.get('cache-control'),'no-store');
 const started=rpcCall(f,'whatsapp_login_start')[0];assert.match(started.body.p_secret_hash,/^[0-9a-f]{64}$/);assert.notEqual(started.body.p_secret_hash,body.secret);assert.equal(started.headers.Authorization,'Bearer server-only');
 const limited=fixture({whatsapp_login_start:{limited:true}});assert.equal((await limited.site({action:'start'})).status,429);
});
test('only messages signed by Meta confirm a code, using the real sender number',async()=>{
 const f=fixture();assert.equal((await f.meta(message('9647801234567','رمز الدخول إلى سوق الشطرة: 482913'))).status,200);
 assert.deepEqual(rpcCall(f,'whatsapp_login_confirm')[0].body,{p_code:'482913',p_phone:'9647801234567',p_wa_user_id:''});assert.deepEqual(rpcCall(f,'whatsapp_login_seen')[0].body,{p_kind:'webhook'});
 const forged=fixture();assert.equal((await forged.meta(message('9647801234567','482913'),'wrong')).status,401);assert.equal(rpcCall(forged,'whatsapp_login_confirm').length+rpcCall(forged,'whatsapp_login_seen').length,0);
 const noise=fixture();await noise.meta(message('9647801234567','مرحبا'));assert.equal(rpcCall(noise,'whatsapp_login_confirm').length,0);
});
test('number, webhook token and secret saved from the admin page are used; nothing saved means not activated',async()=>{
 const f=fixture({whatsapp_login_config:{number:'9647700000001',verify_token:'from-admin',app_secret:'admin-secret-0123456789'},whatsapp_login_start:{code:'111111'}});
 assert.equal((await (await f.site({action:'start'})).json()).number,'9647700000001');
 assert.equal(await (await f.handler(new Request('https://edge.invalid/?hub.mode=subscribe&hub.verify_token=from-admin&hub.challenge=7'))).text(),'7');
 const {createHandler:make}={createHandler};const empty=make({url:'https://db.invalid',anonKey:'a',serviceKey:'s',fetcher:async u=>Response.json(u.includes('whatsapp_login_config')?{number:null,verify_token:'t',app_secret:null}:true)});
 const r=await empty(new Request('https://edge.invalid',{method:'POST',headers:{Origin:site},body:'{"action":"start"}'}));assert.equal(r.status,503);assert.deepEqual(await r.json(),{code:'not_configured'});
});
test('messages that carry only a WhatsApp user ID (usernames) still confirm the code and create a private account',async()=>{
 const f=fixture();await f.meta({entry:[{changes:[{field:'messages',value:{contacts:[{profile:{name:'x'},user_id:'IQ.555'}],messages:[{from_user_id:'IQ.555',type:'text',text:{body:'رمز الدخول إلى سوق الشطرة: 482913'}}]}}]}]});
 assert.deepEqual(rpcCall(f,'whatsapp_login_confirm')[0].body,{p_code:'482913',p_phone:'',p_wa_user_id:'IQ.555'});
 const c=fixture({whatsapp_login_claim:{status:'verified',phone:null,wa_user_id:'IQ.555',user_id:null,email:null}});
 assert.equal((await (await c.site({action:'claim',code:'482913',secret:'a'.repeat(64)})).json()).access_token,'access');
 const created=c.calls.find(x=>x.url.endsWith('/admin/users')).body;assert.equal(created.phone,undefined);assert.equal(created.app_metadata.wa_user_id,'IQ.555');assert.match(created.email,/^wau[0-9a-f]{32}@phone\.souq-shatra\.invalid$/);
 assert.equal(c.calls.find(x=>x.url.endsWith('/generate_link')).body.email,created.email);
});
test('after a code message the store number replies inside the free window: confirmed, or ask for a new code',async()=>{
 const f=fixture({whatsapp_login_config:{number:'9647761076662',verify_token:'v',app_secret:'app-secret',access_token:'E'.repeat(60)},whatsapp_login_confirm:true});
 const payload=(body,extra={})=>({entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'1398820353312150'},contacts:[{wa_id:'9647801234567'}],messages:[{from:'9647801234567',type:'text',text:{body},...extra}]}}]}]});
 await f.meta(payload('رمز الدخول إلى سوق الشطرة: 482913'));
 const sent=f.calls.find(c=>c.url.startsWith('https://graph.facebook.com/'));assert.equal(sent.url,'https://graph.facebook.com/v21.0/1398820353312150/messages');assert.equal(sent.headers.Authorization,'Bearer '+'E'.repeat(60));
 assert.equal(sent.body.to,'9647801234567');assert.match(sent.body.text.body,/تم تأكيد رقمك/);assert.match(sent.body.text.body,/\?wa=1/);
 const late=fixture({whatsapp_login_config:{number:'1',verify_token:'v',app_secret:'app-secret',access_token:'E'.repeat(60)},whatsapp_login_confirm:false});await late.meta(payload('482913'));
 assert.match(late.calls.find(c=>c.url.startsWith('https://graph.facebook.com/')).body.text.body,/انتهت صلاحيته/);
 const quiet=fixture({whatsapp_login_config:{number:'1',verify_token:'v',app_secret:'app-secret',access_token:'E'.repeat(60)}});await quiet.meta(payload('مرحبا'));
 assert.equal(quiet.calls.some(c=>c.url.startsWith('https://graph.facebook.com/')),false,'ordinary chat gets no automatic reply');
});
test('Meta webhook verification answers the challenge only with the right token',async()=>{
 const f=fixture();const ok=await f.handler(new Request('https://edge.invalid/?hub.mode=subscribe&hub.verify_token=hook-token&hub.challenge=42'));assert.equal(await ok.text(),'42');
 assert.equal((await f.handler(new Request('https://edge.invalid/?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=42'))).status,403);
});
test('a verified claim creates the phone account once and returns a session; pending claims touch nothing else',async()=>{
 const pending=fixture({whatsapp_login_claim:{status:'pending'}});assert.deepEqual(await (await pending.site({action:'claim',code:'482913',secret:'a'.repeat(64)})).json(),{status:'pending'});assert.equal(pending.calls.length,1);
 const f=fixture({whatsapp_login_claim:{status:'verified',phone:'9647801234567',user_id:null,email:null}});
 const r=await f.site({action:'claim',code:'482913',secret:'a'.repeat(64)});assert.deepEqual(await r.json(),{status:'verified',access_token:'access',refresh_token:'refresh'});
 const created=f.calls.find(c=>c.url.endsWith('/admin/users'));assert.equal(created.body.phone,'9647801234567');assert.equal(created.body.user_metadata.contact_phone,'07801234567');assert.match(created.body.email,/@phone\.souq-shatra\.invalid$/);
 assert.equal(f.calls.find(c=>c.url.endsWith('/verify')).headers.apikey,'public');
 const known=fixture({whatsapp_login_claim:{status:'verified',phone:'9647801234567',user_id:'u1',email:'me@mail.com'}});await known.site({action:'claim',code:'482913',secret:'a'.repeat(64)});
 assert.equal(known.calls.some(c=>c.url.includes('/admin/users')),false);assert.equal(known.calls.find(c=>c.url.endsWith('/generate_link')).body.email,'me@mail.com');
});
test('foreign sites and malformed claims are refused',async()=>{
 const f=fixture();const r=await f.handler(new Request('https://edge.invalid',{method:'POST',headers:{Origin:'https://evil.example'},body:'{"action":"start"}'}));assert.equal(r.status,403);
 assert.equal((await f.site({action:'claim',code:'12',secret:'x'})).status,400);assert.equal(f.calls.length,0);
});
test('browser helper sets the session only after verification',async()=>{
 const sessions=[];const db=answer=>({functions:{invoke:async()=>({data:answer,error:null})},auth:{setSession:async s=>{sessions.push(s);return {data:{user:{id:'u1'}},error:null}}}});
 assert.deepEqual((await claimWhatsappLogin(db({status:'pending'}),'482913','a'.repeat(64))).data,{status:'pending'});assert.equal(sessions.length,0);
 assert.equal((await claimWhatsappLogin(db({status:'verified',access_token:'a',refresh_token:'r'}),'482913','a'.repeat(64))).data.user.id,'u1');assert.deepEqual(sessions,[{access_token:'a',refresh_token:'r'}]);
 assert.equal((await startWhatsappLogin({})).error.code,'not_configured');
});
test('customer login offers WhatsApp first; professionals keep their username login',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/\$\{professional\?'':`<button type="button" class="auth-provider whatsapp" data-a="waLogin">/);assert.match(html,/waLogin:\(\)=>waAccountSheet\(\)/);assert.match(html,/waStart:\(\)=>act\(/);assert.match(html,/waDraftProblem\(waDraft\)/);assert.match(html,/if\(waMode==='new'\)await waApplyDraft\(signedIn\?\.id\)/);assert.match(html,/claimWhatsappLogin\(db,r\.code,r\.secret\)/);
 assert.match(readFileSync(new URL('../supabase/config.toml',import.meta.url),'utf8'),/\[functions\.whatsapp-login\]\nverify_jwt = false/);
 assert.match(readFileSync(new URL('../sw.js',import.meta.url),'utf8'),/whatsapp-login\.js\?v=2/);
});
function deletion({role='buyer',busy=[],signedIn=true}={}){
 const calls=[],id='11111111-2222-3333-4444-555555555555';
 const handler=createHandler({url:'https://db.invalid',anonKey:'public',serviceKey:'server-only',fetcher:async(url,options={})=>{
  calls.push({url,method:options.method||'GET',body:options.body&&JSON.parse(options.body),auth:options.headers?.Authorization});
  if(url.endsWith('/auth/v1/user'))return signedIn?Response.json({id}):new Response('{}',{status:401});
  if(url.includes('/auth/v1/admin/users/')&&!options.method)return Response.json({id,phone:'9647801234567',user_metadata:{full_name:'علي',contact_phone:'0780'},app_metadata:{provider:'email',login:'whatsapp',wa_user_id:'IQ.123'}});
  if(url.includes('/rest/v1/profiles?select'))return Response.json([{role}]);
  if((options.method||'GET')==='GET'&&url.includes('/rest/v1/'))return Response.json(busy.some(t=>url.includes('/rest/v1/'+t+'?'))?[{x:1}]:[]);
  return new Response(null,{status:200});
 }});
 const send=(token='user-jwt')=>handler(new Request('https://fn.invalid',{method:'POST',headers:{Origin:'https://halguorabi76-netizen.github.io',Authorization:'Bearer '+token},body:JSON.stringify({action:'delete_account'})}));
 return {calls,send,id};
}
test('a customer without orders is deleted for good, using their own session to find the account',async()=>{
 const {calls,send,id}=deletion();
 const r=await send();assert.equal(r.status,200);assert.deepEqual(await r.json(),{status:'deleted'});
 assert.equal(calls[0].auth,'Bearer user-jwt');
 assert.ok(calls.some(c=>c.method==='DELETE'&&c.url.endsWith('/auth/v1/admin/users/'+id)));
 assert.ok(calls.some(c=>c.method==='DELETE'&&c.url.includes('customer_addresses?user_id=eq.'+id)));
});
test('a customer with past orders loses every personal detail and can never sign in again',async()=>{
 const {calls,send,id}=deletion({busy:['orders']});
 assert.equal((await send()).status,200);
 assert.ok(!calls.some(c=>c.method==='DELETE'&&c.url.includes('/auth/v1/admin/users/')));
 const profile=calls.find(c=>c.method==='PATCH');assert.deepEqual(profile.body,{full_name:'حساب محذوف',phone:'',disabled:true});
 const lock=calls.find(c=>c.method==='PUT'&&c.url.endsWith('/admin/users/'+id));
 assert.match(lock.body.email,/@deleted\.souq-shatra\.invalid$/);assert.equal(lock.body.ban_duration,'876000h');assert.deepEqual(lock.body.user_metadata,{full_name:null,contact_phone:null});
 assert.equal(lock.body.app_metadata.wa_user_id,null);assert.equal(lock.body.app_metadata.deleted,true);assert.match(lock.body.phone,/^000[0-9]{12}$/);
});
test('sellers, drivers, admins and signed-out visitors cannot delete through the app',async()=>{
 for(const opts of [{busy:['stores']},{busy:['delivery_workers']},{role:'admin'}]){const {calls,send}=deletion(opts);assert.equal((await send()).status,409);assert.ok(!calls.some(c=>c.method!=='GET'))}
 const out=deletion({signedIn:false});assert.equal((await out.send()).status,401);assert.equal(out.calls.length,1);
 const anon=deletion();assert.equal((await anon.send('public')).status,401);assert.equal(anon.calls.length,0);
});
test('customer profile offers logout back to «لدي حساب» and a confirmed permanent delete',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/data-a="deleteAccountAsk">حذف الحساب نهائيًا/);
 assert.match(html,/الحذف نهائي ولا يمكن التراجع عنه/);
 assert.match(html,/«لدي حساب»/);
 assert.match(html,/changeaccount:\(\)=>confirmBox\('تسجيل الخروج'[^\n]*A\.out\('profilePage'\)/);
 assert.match(html,/deleteAccountAsk:\(\)=>confirmBox\([^\n]*await deleteMyAccount\(db\)[^\n]*A\.out\('profilePage'/);
 assert.match(html,/غير موافق/);
});
test('a number that belongs to an approved seller or driver opens a separate customer account, never the professional one',async()=>{
 for(const table of ['stores','delivery_workers']){
  const f=fixture({whatsapp_login_claim:{status:'verified',phone:'9647801234567',user_id:'seller-1',email:'shop@mail.com'}},[table]);
  assert.deepEqual(await (await f.site({action:'claim',code:'482913',secret:'a'.repeat(64)})).json(),{status:'verified',access_token:'access',refresh_token:'refresh'});
  const created=f.calls.find(c=>c.url.endsWith('/admin/users'));
  assert.equal(created.body.email,'wac9647801234567@phone.souq-shatra.invalid');assert.equal(created.body.phone,undefined);assert.equal(created.body.user_metadata.contact_phone,'07801234567');
  assert.equal(f.calls.find(c=>c.url.endsWith('/generate_link')).body.email,'wac9647801234567@phone.souq-shatra.invalid');
  assert.ok(!f.calls.some(c=>c.url.includes('/admin/users/seller-1')));
 }
});
test('a seller or driver still waiting for approval keeps signing in to the same account; only approved ones get a separate customer account',async()=>{
 const f=fixture({whatsapp_login_claim:{status:'verified',phone:'9647801234567',user_id:'u1',email:'me@mail.com'}});
 await f.site({action:'claim',code:'482913',secret:'a'.repeat(64)});
 const checks=f.calls.filter(c=>c.url.includes('/rest/v1/stores?')||c.url.includes('/rest/v1/delivery_workers?'));
 assert.ok(checks.some(c=>c.url.includes('approved=is.true')));
 assert.ok(!f.calls.some(c=>c.url.includes('/rest/v1/driver_profiles?')),'a pending driver profile alone is not a professional account');
});
