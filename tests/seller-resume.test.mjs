import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('seller layout restores only for the current stored account, and tolerates missing or damaged storage',async()=>{
 const html=await readFile('index.html','utf8');
 const helper=html.match(/function savedSellerView\(storage,sessionKey,modeStorage=storage\)\{[\s\S]*?\n\}/)[0];
 const context=vm.createContext({});vm.runInContext(helper,context);
 const seller='11111111-1111-1111-1111-111111111111',buyer='22222222-2222-2222-2222-222222222222';
 const values=new Map([['session',JSON.stringify({user:{id:seller}})],['souq-shatra-mode-'+seller,'seller'],['souq-shatra-mode-'+buyer,'buyer']]);
 const storage={getItem:key=>values.get(key)||null};
 assert.equal(context.savedSellerView(storage,'session'),true);
 values.set('session',JSON.stringify({user:{id:buyer}}));assert.equal(context.savedSellerView(storage,'session'),false);
 values.delete('session');assert.equal(context.savedSellerView(storage,'session'),false);
 values.set('session','{');assert.equal(context.savedSellerView(storage,'session'),false);
 assert.equal(context.savedSellerView({getItem:()=>{throw Error('unavailable')}},'session'),false);
 assert.match(html,/if\(!dataReady&&viewMode==='seller'&&!db.preview\)\{sellerResume\(\);return\}/);
 assert.match(html,/if\(dataReady&&viewMode==='seller'&&!canSell\(\)\)viewMode='buyer'/);
 assert.doesNotMatch(html.match(/function sellerResume\(\)\{[\s\S]*?\n\}/)[0],/sw-card|sw-nav|<button|متجري|المبيعات|المخزون/);
});

test('pending seller restoration shows the seller shell without a buyer flash or invented sales/stock counts',async()=>{
 const html=await readFile('index.html','utf8'),template={innerHTML:html.match(/<template id="sellerStartTemplate">([\s\S]*?)<\/template>/)[1]},view={innerHTML:''},tabs={hidden:false},classes=new Set();
 const context=vm.createContext({trackPage(){},syncMarketSearch(){},sellerEntryPending:false,sellerAccount:()=>false,pendingPurchase:null,accountResolving:false,dataReady:false,viewMode:'seller',db:{},publicStoreId:null,ADMIN_PORTAL:false,user:null,activity:{sync(){}},document:{documentElement:{dataset:{}},body:{classList:{add:c=>classes.add(c),remove:(...cs)=>cs.forEach(c=>classes.delete(c))}}},$:(selector)=>selector==='#view'?view:selector==='#sellerStartTemplate'?template:selector==='#view .boot-seller-shell'?(view.innerHTML.includes('boot-seller-shell')?{}:null):tabs,buyerCalls:0});
 const resume=html.match(/function sellerResume\(\)\{[\s\S]*?\n\}/)[0];
 const prefix=html.match(/function render\(\)\{([\s\S]*?)  if\(sellerAccount\(\)\)/)[1];
 vm.runInContext(resume+'\nfunction render(){'+prefix+'buyerCalls++;}',context);
 context.publicStoreId='previous-store';vm.runInContext('render()',context);assert.match(view.innerHTML,/boot-seller-shell/);assert.match(view.innerHTML,/sw-nav/);assert.doesNotMatch(view.innerHTML,/مبيعات اليوم|طلبات الأسبوع|٠ د\.ع|0 د\.ع/);assert.match(view.innerHTML,/<button disabled>/);assert.equal(context.buyerCalls,0);assert.equal(tabs.hidden,true);assert.equal(classes.has('seller-workspace'),true);
 vm.runInContext("viewMode='guest';render()",context);assert.equal(context.buyerCalls,1);vm.runInContext('accountResolving=true;render()',context);assert.equal(context.buyerCalls,1);assert.match(view.innerHTML,/جارٍ فتح حسابك/);vm.runInContext("sellerEntryPending=true;accountResolving=false;dataReady=true;viewMode='guest';render()",context);assert.equal(context.buyerCalls,1);assert.match(view.innerHTML,/boot-seller-shell/);
});


test('preflight recognizes pending Google seller login and saved seller on a store URL before first render',async()=>{
 const html=await readFile('index.html','utf8'),code=html.slice(html.indexOf("(()=>{try{\n if(document.documentElement.dataset.portal"),html.indexOf('</script>',html.indexOf("(()=>{try{\n if(document.documentElement.dataset.portal")));
 const id='11111111-1111-4111-8111-111111111111';
 for(const scenario of ['pending','saved','resolved','oauth']){
  const local=new Map(),session=new Map(),dataset={};if(scenario==='pending')session.set('souq-shatra-pending-role','seller');else if(scenario!=='oauth'){local.set('sb-nbktyynshqldyerqtjrd-auth-token',JSON.stringify({user:{id}}));local.set(scenario==='saved'?'souq-shatra-mode-'+id:'souq-shatra-account-layout-'+id,'seller');}
  vm.runInNewContext(code,{document:{documentElement:{dataset}},localStorage:{getItem:k=>local.get(k)||null},sessionStorage:{getItem:k=>session.get(k)||null},location:{search:scenario==='oauth'?'?roleLogin=seller&store=previous-store':'?store=previous-store'},URLSearchParams});assert.equal(dataset.sellerResume,'true');assert.equal(dataset.accountResume,undefined);
 }
});
