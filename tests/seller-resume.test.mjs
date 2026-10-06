import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('seller layout restores only for the current stored account, and tolerates missing or damaged storage',async()=>{
 const html=await readFile('index.html','utf8');
 const helper=html.match(/function savedSellerView\(storage,sessionKey\)\{[\s\S]*?\n\}/)[0];
 const context=vm.createContext({});vm.runInContext(helper,context);
 const seller='11111111-1111-1111-1111-111111111111',buyer='22222222-2222-2222-2222-222222222222';
 const values=new Map([['session',JSON.stringify({user:{id:seller}})],['souq-shatra-mode-'+seller,'seller'],['souq-shatra-mode-'+buyer,'buyer']]);
 const storage={getItem:key=>values.get(key)||null};
 assert.equal(context.savedSellerView(storage,'session'),true);
 values.set('session',JSON.stringify({user:{id:buyer}}));assert.equal(context.savedSellerView(storage,'session'),false);
 values.delete('session');assert.equal(context.savedSellerView(storage,'session'),false);
 values.set('session','{');assert.equal(context.savedSellerView(storage,'session'),false);
 assert.equal(context.savedSellerView({getItem:()=>{throw Error('unavailable')}},'session'),false);
 assert.match(html,/if\(!dataReady&&viewMode==='seller'&&!db.preview&&!publicStoreId\)\{sellerResume\(\);return\}/);
 assert.match(html,/if\(dataReady&&viewMode==='seller'&&!canSell\(\)\)viewMode='buyer'/);
 assert.doesNotMatch(html.match(/function sellerResume\(\)\{[\s\S]*?\n\}/)[0],/sw-card|sw-nav|<button|متجري|المبيعات|المخزون/);
});

test('pending seller restoration shows branding only, without the temporary dashboard or buyer flash',async()=>{
 const html=await readFile('index.html','utf8'),buttons=[{disabled:false}],view={innerHTML:'',querySelectorAll:()=>buttons},tabs={hidden:false},classes=new Set();
 const context=vm.createContext({trackPage(){},pendingPurchase:null,dataReady:false,viewMode:'seller',db:{},publicStoreId:null,ADMIN_PORTAL:false,user:null,activity:{sync(){}},workspace:{chrome:()=>'<button>سوق الشطرة</button>'},document:{body:{classList:{add:c=>classes.add(c),remove:(...cs)=>cs.forEach(c=>classes.delete(c))}}},$:(selector)=>selector==='#view'?view:tabs,buyerCalls:0});
 const resume=html.match(/function sellerResume\(\)\{[\s\S]*?\n\}/)[0];
 const prefix=html.match(/function render\(\)\{([\s\S]*?)  if\(sellerAccount\(\)\)/)[1];
 vm.runInContext(resume+'\nfunction render(){'+prefix+'buyerCalls++;}',context);
 vm.runInContext('render()',context);assert.match(view.innerHTML,/seller-session-brand/);assert.doesNotMatch(view.innerHTML,/متجري|المبيعات|المخزون|sw-nav|<button/);assert.equal(context.buyerCalls,0);assert.equal(tabs.hidden,true);assert.equal(classes.has('seller-workspace'),true);
 vm.runInContext("viewMode='guest';render()",context);assert.equal(context.buyerCalls,1);
});
