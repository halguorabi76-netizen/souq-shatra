import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context={window:{}};vm.createContext(context);
for(const file of ['catalog-filter.js','marketplace.js'])vm.runInContext(readFileSync(file,'utf8'),context);
const ui=context.window.SouqMarketplace;
const stores=[{id:'a',name:'أسواق النور',ok:true},{id:'b',name:'متجر التفاح',ok:true}];
const products=[{id:'p1',mid:'a',name:'أرز بسمتي',active:true,stock:3},{id:'p2',mid:'a',name:'حليب',active:true,stock:1},{id:'p3',mid:'b',name:'تفاح أحمر',active:true,stock:2}];
test('one-letter suggestions put the current destination first',()=>{
 assert.equal(ui.suggestions(products,stores,'ا','catalog')[0].kind,'product');
 assert.equal(ui.suggestions(products,stores,'ا','stores')[0].kind,'store');
});
test('Arabic spelling and a single typo match products',()=>{
 assert.equal(ui.searchProducts(products,stores,'ارز')[0].id,'p1');
 assert.equal(ui.searchProducts(products,stores,'حليي')[0].id,'p2');
 assert.equal(ui.searchProducts(products,stores,'غير موجود').length,0);
});
test('product searches find its stores with only matching items',()=>{
 const rows=ui.searchStores(stores,products,'حليب');assert.equal(rows.length,1);assert.equal(rows[0].store.id,'a');assert.deepEqual(Array.from(rows[0].products,p=>p.id),['p2']);
});
test('store searches return its current materials without unrelated products',()=>{
 assert.deepEqual(Array.from(ui.searchProducts(products,stores,'النور'),p=>p.id),['p1','p2']);
});
test('drafts, blocked, exhausted products and unavailable variants stay out',()=>{
 for(const p of [{active:false,stock:5},{active:true,blocked:true,stock:5},{active:true,stock:0},{active:true,stock:10,has_variants:true,variants:[{stock:5,available:false}]}])assert.equal(ui.forSale(p),false);
 assert.equal(ui.forSale({active:true,has_variants:true,variants:[{stock:1,available:true,archived:false}]}),true);
});
test('full-page material, store and combined home results retain seller links',()=>{
 const html=readFileSync('index.html','utf8'),start=html.indexOf('function publicMarketplace(){'),end=html.indexOf('function marketSection(',start),view={innerHTML:''};
 const c={window:context.window,D:{m:stores,p:products},tab:'catalog',cat:'all',q:'النور',dataReady:true,filt:{min:'',max:'',sort:'newest'},CATS:['طعام'],esc:s=>String(s??''),fmt:n=>String(n),thumb:()=>'',mname:id=>stores.find(m=>m.id===id).name,materialCategories:()=>'',bannerHtml:()=>'',catIcon:()=>'',document:{activeElement:null},$:s=>s==='#view'?view:null};
 vm.createContext(c);vm.runInContext(html.slice(start,end),c);
 c.market();assert.match(view.innerHTML,/أسواق النور/);assert.match(view.innerHTML,/أرز بسمتي/);assert.doesNotMatch(view.innerHTML,/تفاح أحمر|sw-public-header/);
 c.tab='stores';c.q='حليب';c.storesPage();assert.match(view.innerHTML,/أسواق النور/);assert.match(view.innerHTML,/حليب/);assert.doesNotMatch(view.innerHTML,/تفاح أحمر|أرز بسمتي/);
 c.tab='market';c.market();assert.match(view.innerHTML,/المتاجر المطابقة/);assert.match(view.innerHTML,/حليب/);
});
