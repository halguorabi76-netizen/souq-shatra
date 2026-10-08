import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {CATALOG_SEEDS} from '../category-seeds.js';
test('production seller login stays on seller shell when an older guest refresh finishes during authentication',async()=>{
 const nodes=new Map(),storage=new Map();
 const element=(id='')=>{const e={id,innerHTML:'',textContent:'',dataset:{},style:{setProperty(){}},classList:{add(){},remove(){},toggle(){},contains(){return false}},setAttribute(){},removeAttribute(){},addEventListener(){},focus(){},append(child){if(child.id)nodes.set('#'+child.id,child)},prepend(child){this.append(child)},before(){},remove(){nodes.delete('#'+e.id)},insertAdjacentHTML(_p,html){e.innerHTML+=html},querySelector(){return element()},querySelectorAll(){return []}};if(id)nodes.set('#'+id,e);return e;};
 const document={hidden:false,documentElement:{dataset:{},style:{setProperty(){},getPropertyValue(){return ''}}},body:element('body'),createElement:()=>element(),getElementById:id=>nodes.get('#'+id)||null,querySelector:s=>s==='#view .boot-seller-shell'?(nodes.get('#view')?.innerHTML.includes('boot-seller-shell')?{}:null):nodes.get(s)||element(s.startsWith('#')?s.slice(1):s),querySelectorAll:()=>[],addEventListener(){}};
 const url=new URL('https://market.invalid/'),context={TextEncoder,document,location:url,URL,URLSearchParams,structuredClone,crypto:{randomUUID:()=> 'a9999999-0000-4000-8000-'+String(Math.random()).slice(2,14).padEnd(12,'0')},navigator:{},history:{replaceState(){},pushState(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},matchMedia:()=>({matches:true}),setTimeout,clearTimeout,setInterval(){},scrollTo(){},alert(){throw new Error('Unexpected dialog')},confirm:()=>true,fetch(){throw new Error('Preview attempted a network request')}};
 context.CATALOG_SEEDS=CATALOG_SEEDS;context.window=context;context.addEventListener=()=>{};context.SouqTheme={get:()=> 'light',set(){}};
 vm.createContext(context);
 const strip=code=>code.replace(/^import .*;$/gm,'').replace(/^export \{.*\} from .*;$/gm,'').replace(/export /g,'');
 for(const file of ['product-options.js','product-variants.js','product-editor.js']){const code=readFileSync(new URL('../'+file,import.meta.url),'utf8'),names=[...code.matchAll(/export (?:const|function|async function) ([a-zA-Z0-9_]+)/g)].map(m=>m[1]);vm.runInContext('{'+strip(code)+';Object.assign(globalThis,{'+names.join(',')+'});}',context);}
 for(const file of ['catalog-filter.js','marketplace.js','preview-lab.js','seller-records.js','seller-workspace.js','activity-center.js','delivery-workspace.js'])vm.runInContext(readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/export /g,''),context,{filename:file});

 let releaseStores,releaseLogin;const storesWait=new Promise(r=>releaseStores=r),loginWait=new Promise(r=>releaseLogin=r);let firstStores=true;
 const model=context.createPreviewModel(context.localStorage,()=>context.crypto.randomUUID());
 const client={rpc:model.rpc,storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}})})},auth:{...model.auth,signInWithPassword:async()=>{await loginWait;model.setRole('seller');return {data:{user:model.user()},error:null};}},from:table=>{const query=model.from(table);if(table==='stores'&&firstStores){firstStores=false;const then=query.then.bind(query);query.then=async(resolve,reject)=>{await storesWait;return then(resolve,reject);};}return query;}};
 context.supabase={createClient:()=>client};context.SUPABASE_URL='https://nbktyynshqldyerqtjrd.supabase.co';context.SUPABASE_ANON_KEY='fixture-only';
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),view=document.querySelector('#view');document.querySelector('#sellerStartTemplate').innerHTML=html.match(/<template id="sellerStartTemplate">([\s\S]*?)<\/template>/)[1];
 const source=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^import .*;$/gm,'');vm.runInContext(source,context,{filename:'production-main.js'});
 const settle=()=>new Promise(r=>setImmediate(r));await settle();await vm.runInContext("existingRole('seller')",context);assert.match(view.innerHTML,/boot-seller-shell/);
 const paints=[];let markup=view.innerHTML;Object.defineProperty(view,'innerHTML',{get:()=>markup,set:value=>{markup=value;paints.push(value);}});
 document.querySelector('#lp').value='seller@example.invalid';document.querySelector('#lk').value='secret123';const login=vm.runInContext("A.dologin('m')",context);
 releaseStores();await settle();await settle();assert.equal(vm.runInContext('dataReady',context),true);assert.match(view.innerHTML,/boot-seller-shell/);assert.ok(paints.every(p=>!p.includes('market-materials')&&!p.includes('market-stores')),'guest refresh must not paint buyer content');
 releaseLogin();await login;await settle();assert.match(view.innerHTML,/لوحة متجرك|متجر المعاينة/);assert.ok(paints.every(p=>!p.includes('market-materials')&&!p.includes('market-stores')));assert.equal(vm.runInContext('sellerEntryPending',context),false);
 await vm.runInContext("A.out();",context);await settle();await vm.runInContext("existingRole('seller')",context);assert.match(view.innerHTML,/boot-seller-shell/);vm.runInContext("A.close()",context);assert.equal(vm.runInContext('sellerEntryPending',context),false);assert.doesNotMatch(view.innerHTML,/boot-seller-shell/);
});
