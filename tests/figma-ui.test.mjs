import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
const read=p=>readFileSync(p,'utf8');
function ui(){const context={window:{},document:{documentElement:{hasAttribute:()=>false},querySelector:()=>null,getElementById:()=>null,body:{}},MutationObserver:class{observe(){}disconnect(){}}};vm.createContext(context);vm.runInContext(read('marketplace.js'),context);vm.runInContext(read('figma-ui.js'),context);return context.window.SouqFigmaUI;}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('Figma cards use real IDs, stored favorites and variant-aware sale prices',()=>{
 const design=ui(),p={id:'live-product',mid:'live-store',name:'تمر',price:2000,stock:40,active:true,has_variants:true,variants:[{id:'variant',available:true,stock:3,price:2000}]};
 const h=design.productCards([p],{esc,fmt:p=>p+' د.ع',thumb:()=>'<span>actual image</span>',mname:()=>'<متجر>',favorites:['live-product']});
 assert.equal((h.match(/class="mp-product figma-product-card"/g)||[]).length,1);assert.match(h,/data-v="live-product"/);assert.match(h,/data-v="live-store"/);assert.match(h,/&lt;متجر&gt;/);assert.match(h,/ابتداءً من 2000/);assert.match(h,/aria-pressed="true"/);assert.doesNotMatch(h,/٤٨|rating|دار العطور|40 منتج/);
 const stores=design.storeCards([{id:'actual',name:'متجري',username:'my_store',verified:false}],[],{esc});assert.match(stores,/data-v="actual"/);assert.match(stores,/@my_store/);assert.doesNotMatch(stores,/موثّق|٤٫٩|مفتوح الآن/);
});
test('public layer has no React replacement, demo account switcher or data writes',()=>{
 const code=read('figma-ui.js');assert.doesNotMatch(code,/createClient|\.rpc\(|localStorage|setRole|RoleSwitcher|Dashboard|\badmin\b|react-dom/);
 assert.match(read('index.html'),/data-shatra-ui=/);assert.match(read('sw.js'),/figma-ui\.css\?v=144/);assert.match(read('scripts/build.mjs'),/\['figma-ui.css','figma-ui.js'\]/);
 assert.match(read('figma-ui.css'),/#3547a5/);assert.match(read('figma-ui.css'),/#080d1a/);assert.match(read('figma-ui.css'),/prefers-reduced-motion/);
});
test('administration and the business/authorization modules remain byte-for-byte unchanged',()=>{
 for(const file of ['admin.html','admin-app.js','admin-hub.js','admin-workspace.js','admin-portal.css','marketplace.js','seller-workspace.js','delivery-workspace.js','activity-center.js','product-editor.js','product-variants.js','config.js'])assert.equal(read(file),execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'}),file+' must stay unchanged');
 assert.doesNotMatch(read('admin.html'),/figma-ui/);assert.doesNotMatch(read('admin-app.js'),/figma-ui/);
});
