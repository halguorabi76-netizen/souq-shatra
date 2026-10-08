import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {signInProfessional} from '../professional-login.js';
const {createHandler}=await import('data:text/javascript;base64,'+Buffer.from(readFileSync(new URL('../supabase/functions/professional-login/index.ts',import.meta.url),'utf8')).toString('base64'));
const fixture=(account={email:'private@example.invalid',limited:false},authStatus=200)=>{
 const calls=[];const handler=createHandler({url:'https://auth.invalid',anonKey:'public',serviceKey:'server-only',hash:async()=> 'a'.repeat(64),fetcher:async(url,options)=>{calls.push({url,...options});return url.includes('/rpc/')?Response.json(account):Response.json(authStatus===200?{access_token:'verified-token',refresh_token:'refresh',user:{email:account.email}}:{error:'bad password'},{status:authStatus});}});
 return {calls,login:body=>handler(new Request('https://edge.invalid',{method:'POST',headers:{Origin:'https://halguorabi76-netizen.github.io','Content-Type':'application/json'},body:JSON.stringify(body)}))};
};
test('username password login validates through Auth without exposing lookup email or secrets',async()=>{
 const f=fixture();const response=await f.login({username:'@Store_One',password:'secret123',role:'seller'});assert.equal(response.status,200);assert.deepEqual(await response.json(),{access_token:'verified-token',refresh_token:'refresh'});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(JSON.parse(f.calls[0].body).p_username,'store_one');assert.deepEqual(JSON.parse(f.calls[1].body),{email:'private@example.invalid',password:'secret123'});assert.equal(f.calls[1].headers.apikey,'public');
});
test('unknown username and wrong password produce the same failure; rate limits stop Auth requests',async()=>{
 for(const account of [{email:null,limited:false},{email:'private@example.invalid',limited:false}]){const f=fixture(account,400),r=await f.login({username:'driver_one',password:'badpass',role:'driver'});assert.equal(r.status,401);assert.deepEqual(await r.json(),{code:'invalid_credentials'});assert.equal(f.calls.length,2);}
 const f=fixture({limited:true,email:null}),r=await f.login({username:'store_one',password:'secret123',role:'seller'});assert.equal(r.status,429);assert.equal(f.calls.length,1);
});
test('invalid input and unsupported roles never reach private lookup',async()=>{
 const f=fixture();for(const body of [{username:'x',password:'secret123',role:'seller'},{username:'store_one',password:'secret123',role:'admin'}]){assert.equal((await f.login(body)).status,400);}assert.equal(f.calls.length,0);
});
test('frontend stores verified session and preserves generic credential errors',async()=>{
 let body,session;const db={functions:{invoke:async(_name,options)=>{body=options.body;return {data:{access_token:'token',refresh_token:'refresh'}};}},auth:{setSession:async s=>{session=s;return {data:{user:{id:'professional'}},error:null};}}};
 const result=await signInProfessional(db,'@STORE_One','secret123','seller');assert.equal(body.username,'store_one');assert.equal(body.role,'seller');assert.deepEqual(session,{access_token:'token',refresh_token:'refresh'});assert.equal(result.data.user.id,'professional');
 db.functions.invoke=async()=>({error:{context:Response.json({code:'invalid_credentials'},{status:401})}});assert.equal((await signInProfessional(db,'driver_one','badpass','driver')).error.code,'invalid_credentials');
});
