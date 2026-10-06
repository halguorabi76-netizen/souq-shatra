import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n+' د.ع';
const loadUI=()=>{const context={window:{}};vm.runInNewContext(readFileSync(new URL('../marketplace.js',import.meta.url),'utf8'),context);return context.window.SouqMarketplace;};
test('stock produces one card, linked to its seller, without a stock count',()=>{
 const ui=loadUI(),p={id:'product',mid:'store',name:'قميص',price:100,stock:17};
 const html=ui.productCards([p],{esc,fmt,thumb:()=>'',mname:()=> 'متجر'});
 assert.equal((html.match(/class="mp-product"/g)||[]).length,1);assert.match(html,/href="\.\/\?store=store"/);assert.doesNotMatch(html.replace(/<svg[\s\S]*?<\/svg>/g,''),/17|المخزون/);
});
test('discounts use a valid higher previous price and preserve sale price',()=>{
 const ui=loadUI();assert.equal(ui.discounted({price:100,compare_at_price:125}),true);assert.match(ui.badge({price:100,compare_at_price:125}),/20٪/);
 for(const previous of [null,0,100,90,'125'])assert.equal(ui.discounted({price:100,compare_at_price:previous}),false);
 assert.match(ui.price({price:100,compare_at_price:125},fmt),/<strong>100 د.ع<\/strong>/);assert.match(ui.price({price:100,compare_at_price:125},fmt),/<del>125 د.ع<\/del>/);
});
test('store counts include only its published products; text is escaped',()=>{
 const ui=loadUI(),m={id:'one',name:'<img onerror=alert(1)>',description:'<script>bad</script>'};
 const html=ui.storeCards([m],[{mid:'one',active:true,stock:9,price:50,compare_at_price:100},{mid:'one',active:false},{mid:'two',active:true}],{esc});
 assert.match(html,/1 منتج · 1 عرض/);assert.doesNotMatch(html,/<script>|<img onerror/);assert.match(html,/&lt;img/);
});
function workspaceContext(mode='guest'){
 const ui=loadUI(),view={innerHTML:''},data={m:[{id:'one',name:'المتجر الأول',ok:true,appearance:{},image_url:''},{id:'two',name:'المتجر الثاني',ok:true,appearance:{}}],p:[{id:'a',mid:'one',name:'قميص',cat:'ملابس',price:100,stock:5,active:true,compare_at_price:125},{id:'b',mid:'one',name:'حذاء',cat:'ملابس',price:60,stock:2,active:true},{id:'c',mid:'two',name:'تفاح',cat:'خضار وفواكه',price:50,stock:3,active:true}],cart:[],o:[]};
 const events={},document={getElementById:()=>null,querySelector:s=>s==='#view'?view:null,addEventListener:(name,fn)=>events[name]=fn,body:{dataset:{},style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}}}};
 const context={window:{SouqMarketplace:ui},document,structuredClone,createSellerRecords:()=>({load:async()=>{},names:()=>[],actions:{},render:()=>'',reset(){}})};
 vm.runInNewContext(readFileSync(new URL('../catalog-filter.js',import.meta.url),'utf8'),context);
 vm.runInNewContext(readFileSync(new URL('../seller-workspace.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/export /g,'')+';window.createWorkspace=createSellerWorkspace;',context);
 const g={mode,data,store:mode==='seller'?data.m[0]:null,canSell:mode==='seller'};
 const ctx={get:()=>g,esc,fmt,thumb:()=>'',status:[],when:String,publicStore(){},run:f=>f(),render:()=>workspace.storefront('one')};
 const workspace=context.window.createWorkspace(ctx);return {workspace,view,events,data};
}
test('storefront shows only its seller, has an offers filter, and hides stock',()=>{
 const {workspace,view,events}=workspaceContext();workspace.storefront('one');assert.match(view.innerHTML,/قميص|حذاء/);assert.doesNotMatch(view.innerHTML,/تفاح|المتوفر 5/);assert.match(view.innerHTML,/تصفح التخفيضات/);
 events.click({target:{closest:()=>({dataset:{s:'publicDeals',v:'on'},disabled:false})}});assert.match(view.innerHTML,/قميص/);assert.doesNotMatch(view.innerHTML,/>حذاء</);
 workspace.storefront('two');assert.match(view.innerHTML,/تفاح/);assert.doesNotMatch(view.innerHTML,/قميص/);
});
test('owner preview returns to management, without exposing management to visitors',()=>{
 const owner=workspaceContext('seller');owner.workspace.storefront('one');assert.match(owner.view.innerHTML,/العودة لإدارة متجري|معاينة ما يراه الزبون/);
 const visitor=workspaceContext();visitor.workspace.storefront('one');assert.doesNotMatch(visitor.view.innerHTML,/data-s="openMenu"/);assert.match(visitor.view.innerHTML,/جميع المتاجر/);
});
