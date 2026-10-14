import {test} from 'node:test';
import assert from 'node:assert/strict';
const {createHandler,signJwt,verifyJwt}=await import('../supabase/functions/payments/index.ts');

const SECRET='zain-secret-for-tests-only-0123456789';
function fixture({user={id:'u1'},intent={id:'11111111-1111-1111-1111-111111111111',amount:12500}}={}){
 const calls=[];
 const fetcher=async(url,options={})=>{
  calls.push({url:String(url),...options});
  if(url.endsWith('/auth/v1/user'))return user?Response.json(user):Response.json({},{status:401});
  if(url.includes('/rpc/payment_create_intent'))return Response.json(intent);
  if(url.includes('/transaction/init'))return Response.json({id:'zc-tx-9'});
  if(url.includes('/rest/v1/payment_intents?select'))return Response.json([{...intent,provider_ref:'zc-tx-9',details:{return_url:'https://halguorabi76-netizen.github.io/souq-shatra/#/orders'}}]);
  if(url.includes('/rpc/payment_complete_intent'))return Response.json({...intent,status:'paid'});
  return Response.json({});
 };
 const handler=createHandler({url:'https://db.invalid',anonKey:'anon',serviceKey:'service',fetcher,selfUrl:'https://db.invalid/functions/v1/payments',
  zaincash:{msisdn:'9647800000000',merchantId:'m-1',secret:SECRET,base:'https://test.zaincash.iq'}});
 return {calls,handler};
}
const init=(f,body,headers={})=>f.handler(new Request('https://db.invalid/functions/v1/payments/init',{method:'POST',headers:{Origin:'https://halguorabi76-netizen.github.io',Authorization:'Bearer user-jwt',...headers},body:JSON.stringify(body)}));

test('JWT helpers round-trip and reject tampering',async()=>{
 const t=await signJwt({a:1},SECRET);
 assert.deepEqual(await verifyJwt(t,SECRET),{a:1});
 assert.equal(await verifyJwt(t.slice(0,-2)+'xx',SECRET),null);
 assert.equal(await verifyJwt(t,'other'),null);
});

test('init asks the database for the amount and signs it for ZainCash',async()=>{
 const f=fixture();
 const r=await init(f,{purpose:'order',refs:['o1'],provider:'zaincash',return_url:'https://halguorabi76-netizen.github.io/souq-shatra/#/orders',amount:1});
 assert.equal(r.status,200);
 const body=await r.json();
 assert.equal(body.redirect_url,'https://test.zaincash.iq/transaction/pay?id=zc-tx-9');
 const rpc=f.calls.find(c=>c.url.includes('payment_create_intent'));
 assert.deepEqual(JSON.parse(rpc.body),{p_user:'u1',p_purpose:'order',p_refs:['o1'],p_provider:'zaincash'});
 assert.equal(rpc.headers.Authorization,'Bearer service');
 const form=new URLSearchParams(f.calls.find(c=>c.url.includes('/transaction/init')).body);
 const payload=await verifyJwt(form.get('token'),SECRET);
 assert.equal(payload.amount,12500,'browser-supplied amount is ignored');
 assert.equal(payload.orderId,'11111111-1111-1111-1111-111111111111');
 assert.match(payload.redirectUrl,/\/payments\/zaincash\?intent=1111/);
});

test('init refuses anonymous callers, foreign return URLs and foreign origins',async()=>{
 assert.equal((await init(fixture({user:null}),{purpose:'order',refs:['o1'],provider:'zaincash',return_url:'https://halguorabi76-netizen.github.io/'})).status,401);
 assert.equal((await init(fixture(),{purpose:'order',refs:['o1'],provider:'zaincash',return_url:'https://evil.example/'})).status,400);
 assert.equal((await init(fixture(),{purpose:'order',refs:['o1'],provider:'zaincash',return_url:'https://halguorabi76-netizen.github.io/'},{Origin:'https://evil.example'})).status,403);
});

test('callback marks paid only for a valid signed success matching the intent',async()=>{
 const id='11111111-1111-1111-1111-111111111111';
 for(const [payload,paid] of [[{status:'success',orderid:id,id:'zc-tx-9'},true],[{status:'failed',orderid:id},false],[{status:'success',orderid:'other'},false]]){
  const f=fixture(),token=await signJwt(payload,SECRET);
  const r=await f.handler(new Request('https://db.invalid/functions/v1/payments/zaincash?intent='+id+'&token='+token));
  assert.equal(r.status,302);
  assert.match(r.headers.get('location'),new RegExp('payment='+(paid?'success':'failed')));
  assert.equal(JSON.parse(f.calls.find(c=>c.url.includes('payment_complete_intent')).body).p_paid,paid);
 }
 const f=fixture(),forged=await signJwt({status:'success',orderid:id},'wrong-secret');
 await f.handler(new Request('https://db.invalid/functions/v1/payments/zaincash?intent='+id+'&token='+forged));
 assert.equal(JSON.parse(f.calls.find(c=>c.url.includes('payment_complete_intent')).body).p_paid,false,'forged token is not trusted');
});
