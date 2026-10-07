import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('index.html','utf8');
const code=name=>html.match(new RegExp('function '+name+'\\([^]*?(?=\\nfunction )'))[0];
function ui(tab='market',cat='all'){
 const view={innerHTML:''},context={tab,cat,q:'',filt:{},storeQuery:'',dataReady:true,CATS:['ملابس','أجهزة'],D:{p:[{id:'one',mid:'a',cat:'ملابس',active:true,blocked:false},{id:'two',mid:'b',cat:'أجهزة',active:true,blocked:false}],m:[{id:'a',name:'Store A',ok:true},{id:'b',name:'Store B',ok:true},{id:'removed',name:'Removed',ok:true,removed:true}]},esc:s=>s,fmt:s=>s,thumb:()=>'',mname:()=>'',mok:()=>true,catIcon:()=>'',bannerHtml:()=>'<div>banner</div>',$:()=>view,window:{SouqCatalog:{matches:(s,q)=>!q||s.includes(q),select:(items,options)=>items.filter(p=>options.category==='all'||p.cat===options.category)},SouqMarketplace:{switcher:()=>'<nav class="switcher">المواد والمتاجر</nav>',icon:()=>'',forSale:p=>p.active&&!p.blocked,searchProducts:items=>items,searchStores:(stores,products,query)=>stores.filter(m=>!query||m.name.includes(query)).map(store=>({store,products:products.filter(p=>p.mid===store.id)})),productCards:items=>'<div class="product-cards">'+items.map(p=>p.id).join(',')+'</div>',storeMatches:rows=>'<div class="store-cards">'+rows.map(x=>x.store.name).join(',')+'</div>',storeCards:items=>'<div class="store-cards">'+items.map(m=>m.name).join(',')+'</div>'}}};
 vm.createContext(context);vm.runInContext(code('materialCategories')+'\n'+code('publicMarketplace')+'\n'+code('market')+'\n'+code('storesPage'),context);return {context,view};
}
test('home has material and store previews in that order, with one destination chooser',()=>{
 const {context,view}=ui();vm.runInContext('market()',context);assert.match(view.innerHTML,/market-materials/);assert.match(view.innerHTML,/market-stores/);assert.ok(view.innerHTML.indexOf('product-cards')<view.innerHTML.indexOf('store-cards'));assert.equal((view.innerHTML.match(/class="switcher"/g)||[]).length,1);
});
test('materials destination has categories and products without store cards or the home chooser',()=>{
 const {context,view}=ui('catalog');vm.runInContext('market()',context);assert.match(view.innerHTML,/أقسام المواد/);assert.match(view.innerHTML,/product-cards/);assert.doesNotMatch(view.innerHTML,/store-cards|class="switcher"/);
});
test('stores destination lists accounts only and filters them by their published product categories',()=>{
 const {context,view}=ui('stores','ملابس');vm.runInContext('storesPage()',context);assert.match(view.innerHTML,/أقسام المتاجر/);assert.match(view.innerHTML,/Store A/);assert.doesNotMatch(view.innerHTML,/Store B|Removed|product-cards|class="switcher"/);
 context.cat='all';context.q='Store B';vm.runInContext('storesPage()',context);assert.match(view.innerHTML,/Store B/);assert.doesNotMatch(view.innerHTML,/Store A/);
});
test('materials and stores chooser routes to dedicated pages while home stays home',()=>{
 for(const [section,expected] of [['materials','catalog'],['stores','stores'],['market','market']]){
  const context={section,publicStoreId:null,cat:'',q:'',filt:{},tab:'',URL,location:{href:'https://example.test/'},history:{pushState(){}},render(){},scrollTo(){}};vm.createContext(context);vm.runInContext(code('marketSection')+'\nmarketSection(section);',context);assert.equal(context.tab,expected);
 }
});
