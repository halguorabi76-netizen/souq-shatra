import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
async function navigation(){const window={};vm.runInNewContext(await readFile('page-navigation.js','utf8'),{window});return window.SouqPageNavigation.create();}
const route=(tab,q='')=>({tab,dt:'p',publicStoreId:null,cat:'all',q,filt:{min:'',max:'',sort:'newest'},scroll:0,url:'https://example.test/'});
test('multi-step back restores route filters and scroll; rerenders do not create duplicate pages',async()=>{
 const nav=await navigation();nav.track(route('market'),'buyer');
 const settings=route('settings');settings.scroll=320;nav.track(settings,'buyer');nav.track(settings,'buyer');nav.track(route('profilePage'),'buyer');
 assert.equal(nav.canBack(),true);assert.equal(nav.backRoute().tab,'settings');const home=nav.backRoute();assert.equal(home.tab,'market');assert.equal(home.scroll,320);assert.equal(nav.canBack(),false);
 const search=route('catalog','سكراب');search.filt.min='100';nav.track(search,'buyer');nav.track(route('orders'),'buyer');const restored=nav.backRoute();assert.equal(restored.q,'سكراب');assert.equal(restored.filt.min,'100');
 nav.track(route('account'),'seller');assert.equal(nav.canBack(),false);
});
test('nested screens keep the original live form nodes and replace same-screen refreshes',async()=>{
 const nav=await navigation(),input={value:'مسودة محفوظة'};
 nav.openSheet('product',null);nav.openSheet('product',{nodes:[input]});nav.openSheet('filters',{nodes:[input],scroll:55,cur:{n:2}});
 const back=nav.backSheet();assert.equal(back.nodes[0],input);assert.equal(back.nodes[0].value,'مسودة محفوظة');assert.equal(back.scroll,55);assert.equal(back.cur.n,2);assert.equal(nav.backSheet(),null);
 nav.openSheet('account',null);nav.openSheet('edit',{nodes:[input]});nav.closeSheets();assert.equal(nav.backSheet(),null);
});

test('back restores the parent product context, rather than a newly selected product',async()=>{
 const nav=await navigation(),parent={p:{id:'first'},n:3},child={p:{id:'second'},n:1};
 nav.openSheet('first',null,{cur:parent,infoRole:'seller'});
 nav.openSheet('second',{nodes:[],cur:child},{cur:child,infoRole:'buyer'});
 const previous=nav.backSheet();assert.equal(previous.cur,parent);assert.equal(previous.cur.p.id,'first');assert.equal(previous.infoRole,'seller');
});
