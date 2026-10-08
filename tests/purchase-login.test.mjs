import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const helpers=html.slice(html.indexOf('const PURCHASE_RETURN_KEY='),html.indexOf('function openCatalog()'));
const pid='11111111-1111-4111-8111-111111111111',vid='22222222-2222-4222-8222-222222222222';
function setup(){
 const storage=new Map(),events=[];let current={id:pid,mid:'store',name:'قميص',price:9000,stock:12,active:true,has_variants:true,variants:[{id:vid}]};
 const c={scrollTo(){},showAccountMenu(){events.push(['menu'])},$:()=>null,KEY:'test',URL,URLSearchParams,location:new URL('https://market.invalid/catalog.html?q=قميص'),catalogEntry:true,publicStoreId:null,cat:'ملابس',q:'قميص',filt:{sort:'cheap'},tab:'catalog',user:null,profile:null,dataReady:true,ADMIN_PORTAL:false,cur:{p:current,n:3,vid},D:{cart:[]},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},history:{replaceState(_a,_b,url){c.location=new URL(url)}},rememberMode(mode){events.push(['mode',mode])},lsheet(mode){events.push(['auth',mode])},prod:()=>current,sellerAccount:()=>false,mok:()=>true,render(){events.push(['render',c.tab])},psheet(){events.push(['product',c.cur])},toast:message=>events.push(['toast',message]),A:{close(){}},save(){},selectedProduct:p=>p,cartKey:p=>p.pid+'|'+(p.vid||'')};
 vm.createContext(c);vm.runInContext(helpers,c);vm.runInContext(html.slice(html.indexOf('function accountAuthRedirect(){'),html.indexOf('let reportedProfessionalEntry=')),c);
 const add=html.split('\n').find(line=>line.startsWith('  add:()=>'));
 vm.runInContext('Object.assign(A,{'+add+'});',c);
 return {c,storage,events,replaceProduct:p=>current=p};
}
test('anonymous add opens email login and leaves the cart untouched; login returns the same product options',()=>{
 const {c,storage,events,replaceProduct}=setup();c.A.add();assert.equal(c.D.cart.length,0);assert.deepEqual(events.filter(x=>x[0]==='menu').slice(-1),[['menu']]);
 const saved=JSON.parse(storage.get('test-purchase-return'));assert.equal(saved.pid,pid);assert.equal(saved.vid,vid);assert.equal(saved.n,3);
 c.user={id:'buyer'};const updated={...c.cur.p,price:11000};replaceProduct(updated);assert.equal(c.resumePurchaseAfterLogin(),true);
 assert.equal(c.cur.p,updated);assert.equal(c.cur.vid,vid);assert.equal(c.cur.n,3);assert.equal(c.tab,'catalog');assert.equal(c.q,'قميص');assert.equal(c.filt.sort,'cheap');assert.equal(storage.has('test-purchase-return'),false);assert.equal(c.D.cart.length,0);
 c.A.add();assert.equal(c.D.cart.length,1);assert.equal(c.D.cart[0].q,3);assert.equal(c.D.cart[0].vid,vid);
});
test('confirmation redirect retains product, variant and quantity on the current origin',()=>{
 const {c}=setup();c.A.add();const url=new URL(c.purchaseAuthRedirect());assert.equal(url.origin,c.location.origin);assert.equal(url.searchParams.get('resumeProduct'),pid);assert.equal(url.searchParams.get('resumeVariant'),vid);assert.equal(url.searchParams.get('resumeQuantity'),'3');
 c.location=url;const recovered=c.readPurchaseReturn();assert.equal(recovered.pid,pid);assert.equal(recovered.vid,vid);assert.equal(recovered.n,3);
});
test('removed variants require a fresh selection and unavailable products are not added',()=>{
 const {c,replaceProduct,events}=setup();c.A.add();c.user={id:'buyer'};replaceProduct({...c.cur.p,variants:[]});c.resumePurchaseAfterLogin();assert.equal(c.cur.vid,null);
 const y=setup();y.c.A.add();y.c.user={id:'buyer'};y.replaceProduct({...y.c.cur.p,active:false});assert.equal(y.c.resumePurchaseAfterLogin(),false);assert.equal(y.c.D.cart.length,0);assert.match(y.events.at(-1)[1],/لم تعد متاحة/);
});
test('invalid return targets and quantities are rejected, and cancellation clears only the purchase intent',()=>{
 const {c,storage}=setup();for(const value of [{pid:'https://other.invalid',n:1},{pid,n:0},{pid,n:101},{pid,n:1.2},{pid,vid:'bad',n:1}])assert.equal(c.validPurchaseReturn(value),null);
 c.A.add();storage.set('other','preserved');c.clearPurchaseReturn();assert.equal(storage.has('test-purchase-return'),false);assert.equal(storage.get('other'),'preserved');c.user={id:'buyer'};assert.equal(c.resumePurchaseAfterLogin(),false);
});
test('purchase auth provides create-account wording and waits for refreshed product data',()=>{
 assert.doesNotMatch(html,/إنشاء حساب جديد/);assert.match(html,/if\(pendingPurchase\)\{await refresh\(\)/);assert.doesNotMatch(html,/if\(!pendingPurchase\)loadAuthProviders\(\)/);assert.match(html,/loadAuthProviders\(\);/);
});
function authActions(x,{signupSession=true,failure=false,failureCode='invalid_credentials'}={}){
 const c=x.c,button={disabled:false,isConnected:true},values={lp:'buyer@example.com',lk:'secret123',lkConfirm:'secret123',ln:'زبون',lphone:'07700000000'};
 Object.assign(c,{act:f=>f(),val:id=>values[id]||'',$:()=>button,withTimeout:p=>p,check:r=>{if(r.error)throw r.error;return r.data},viewMode:'buyer',ownStore:null,dt:'p',isInvalidPasswordLogin:e=>e.code==='invalid_credentials',loginAccountNotice:email=>x.events.push(['loginNotice',email]),db:{auth:{signInWithPassword:async()=>failure?{error:Object.assign(new Error('invalid credentials'),{code:failureCode})}:{data:{user:{id:'buyer'}}},signUp:async()=>({data:{user:{id:'buyer'},session:signupSession?{user:{id:'buyer'}}:null}})}},refresh:async()=>{c.dataReady=true;c.resumePurchaseAfterLogin()}});
 const start=html.indexOf('  dologin:m=>'),end=html.indexOf('  register:',start);vm.runInContext('Object.assign(A,{'+html.slice(start,end)+'});',c);return c;
}
test('actual email login and immediate-session signup return to the requested material',async()=>{
 for(const mode of ['m','r']){const x=setup();x.c.A.add();authActions(x);await x.c.A.dologin(mode);assert.equal(x.c.user.id,'buyer');assert.equal(x.c.cur.p.id,pid);assert.equal(x.c.cur.vid,vid);assert.equal(x.c.cur.n,3);assert.equal(x.c.tab,'catalog');assert.equal(x.c.D.cart.length,0);assert.equal(x.storage.has('test-purchase-return'),false);}
});
test('failed login and email confirmation keep the return target for the next successful login',async()=>{
 const x=setup();x.c.A.add();authActions(x,{failure:true});await x.c.A.dologin('m');assert.ok(x.events.some(e=>e[0]==='loginNotice'&&e[1]==='buyer@example.com'));assert.equal(x.c.user,null);assert.equal(x.storage.has('test-purchase-return'),true);
 authActions(x,{signupSession:false});await x.c.A.dologin('r');assert.equal(x.c.user,null);assert.equal(x.storage.has('test-purchase-return'),true);assert.ok(x.events.some(e=>e[0]==='auth'&&e[1]==='m'));
 authActions(x);await x.c.A.dologin('m');assert.equal(x.c.cur.p.id,pid);assert.equal(x.storage.has('test-purchase-return'),false);
});

test('network and other auth failures do not tell the customer to create an account',async()=>{
 const x=setup();x.c.A.add();authActions(x,{failure:true,failureCode:'request_timeout'});await assert.rejects(x.c.A.dologin('m'),/invalid credentials/);assert.equal(x.events.some(e=>e[0]==='loginNotice'),false);assert.equal(x.storage.has('test-purchase-return'),true);
});


test('guest plus goes straight to buyer login and retains the chosen product',()=>{
 const {c,events,storage}=setup();c.viewMode='guest';c.closeAccountMenu=()=>events.push(['close-menu']);c.lsheet=mode=>events.push(['login',mode]);c.A.prod=()=>{c.cur.n=1;c.cur.vid=null;};c.A.add=()=>{throw Error('guest must not add before login')};const start=html.indexOf('  quickAdd:'),end=html.indexOf('  prod:',start);vm.runInContext('Object.assign(A,{'+html.slice(start,end)+'});A.quickAdd("product")',c);assert.ok(events.some(e=>e[0]==='login'&&e[1]==='m'));assert.equal(JSON.parse(storage.get('test-purchase-return')).pid,pid);
});
