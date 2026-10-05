import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CATALOG_SEEDS} from '../category-seeds.js';
import {categoryDefinitions,combinations,variantKey,selectedProduct,cartKey,createProductEditor,specifications,inventoryVariants} from '../product-variants.js';
import {createPreviewModel,IDS} from '../preview-lab.js';
const defs=name=>{const c=CATALOG_SEEDS.find(c=>c.name===name);return categoryDefinitions(CATALOG_SEEDS,c.id);};
test('category definitions inherit applicable fields, keep specifications separate from axes, cover all catalog families',()=>{
 assert.equal(CATALOG_SEEDS.filter(c=>!c.parent_id).length,28);assert.equal(CATALOG_SEEDS.filter(c=>c.parent_id).length,102);
 for(const c of CATALOG_SEEDS){const d=categoryDefinitions(CATALOG_SEEDS,c.id);assert.equal(new Set(d.map(d=>d.key)).size,d.length,c.name);}
 const clothes=defs('قمصان وتيشيرتات');assert(clothes.some(d=>d.key==='size'&&d.variant));assert(clothes.some(d=>d.key==='material'&&!d.variant));assert(!clothes.some(d=>d.key==='ram'));
 assert(defs('هواتف').some(d=>d.key==='storage'&&d.variant));assert(!defs('خضار').some(d=>d.key==='size'));assert(defs('الحلويات').some(d=>d.key==='expiry'&&!d.variant));assert(!defs('عطور').some(d=>d.key==='skin'));
});
test('combinations deduplicate values and preserve identities regardless of key order; limit prevents explosions',()=>{
 const rows=combinations({size:['S','M','L','M'],color:['أزرق','أسود']});assert.equal(rows.length,6);assert.equal(variantKey({size:'M',color:'أزرق'}),variantKey({color:'أزرق',size:'M'}));assert.throws(()=>combinations({size:[]}));assert.throws(()=>combinations({a:Array.from({length:201},(_,i)=>i)}));
});
test('cart identity and selected price/inventory/image are specific to a variant; no automatic first variant',()=>{
 const p={id:'p',price:800,stock:99,img:'parent',has_variants:true,variants:[{id:'m',label:'M',price:1000,sale_price:800,stock:2,available:true,img:'M'},{id:'l',price:1200,stock:3,available:false},{id:'old',stock:10,archived:true}]};
 assert.equal(selectedProduct(p,null),null);assert.equal(selectedProduct(p,'old'),null);assert.equal(selectedProduct(p,'l').stock,0);assert.equal(selectedProduct(p,'m').price,800);assert.equal(selectedProduct(p,'m').img,'M');assert.notEqual(cartKey({pid:'p',vid:'m'}),cartKey({pid:'p',vid:'l'}));assert.equal(cartKey({pid:'p'}),cartKey({pid:'p',vid:null}));
 const html=specifications({...p,attributes:{material:'<script>'},catalog_category_id:CATALOG_SEEDS.find(c=>c.name==='ملابس').id},CATALOG_SEEDS);assert(!html.includes('<script>'));assert(inventoryVariants(p,String).includes('2 قطعة'));
});
const ok=r=>{assert.equal(r.error,null,r.error?.message);return r.data;};
test('preview uses the same parent + variant basket contract, debits separate stock, snapshots, restores on cancel',async()=>{
 let i=0;const m=createPreviewModel({getItem:()=>null,setItem(){}},()=>`id-${++i}`);m.setRole('seller');const product=ok(await m.rpc('save_product_bundle',{p_store:IDS.store,p_id:null,p_product:{name:'قميص نسخ',price:1000,stock:0,catalog_category_id:CATALOG_SEEDS.find(c=>c.name==='ملابس').id},p_variants:[{label:'M',attributes:{size:'M'},price:1000,sale_price:800,stock:2,available:true},{label:'L',attributes:{size:'L'},price:1200,stock:3,available:true}]}));const vs=m.snapshot().product_variants;assert.equal(vs.length,2);m.setRole('buyer');
 const order=ok(await m.rpc('place_order',{p_store:IDS.store,p_lines:vs.map(v=>({id:product,variant_id:v.id,quantity:1,price:1})),p_name:'معاينة',p_phone:'00000000000',p_address:'عنوان تجريبي'}));const snap=m.snapshot();assert.equal(snap.products.find(p=>p.id===product).stock,3);assert.equal(snap.order_items.filter(i=>i.order_id===order).length,2);assert.equal(snap.order_items.filter(i=>i.order_id===order).reduce((n,i)=>n+i.price,0),2000);assert.equal(snap.order_items.find(i=>i.variant_id===vs[0].id).variant_snapshot.label,'M');
 const bad=await m.rpc('place_order',{p_store:IDS.store,p_lines:[{id:product,quantity:1}]});assert(bad.error);assert.equal(m.snapshot().products.find(p=>p.id===product).stock,3);
 m.setRole('seller');ok(await m.rpc('set_order_status',{p_order:order,p_status:'cancelled'}));assert.equal(m.snapshot().products.find(p=>p.id===product).stock,5);
});
test('editor shows only chosen category fields and preserves row SKU/image/version on regeneration',async()=>{
 const nodes=new Map([['fs',{closest:()=>null}],['fpr',{value:'1000'}]]);const originalDoc=globalThis.document;globalThis.document={getElementById:id=>nodes.get(id)||null};const host={innerHTML:''};const p={cat:'ملابس',catalog_category_id:CATALOG_SEEDS.find(c=>c.name==='قمصان وتيشيرتات').id,has_variants:true,stock:2,attributes:{material:'قطن'},variants:[{id:'old-id',version:7,label:'M',attributes:{size:'M',color:'أزرق'},sku:'keep',barcode:'bar',stock:2,price:1000,image_path:'keep.jpg',available:true}]};
 try{const w=createProductEditor({categories:()=>CATALOG_SEEDS,toast:msg=>{throw Error(msg)},base:()=>({price:1000}),upload:()=>{throw Error('unexpected upload')}});w.mount(host,p);assert.match(host.innerHTML,/الخامة/);assert.doesNotMatch(host.innerHTML,/RAM|نوع البشرة/);host.onclick({target:{closest:()=>({dataset:{va:'generate'}})},preventDefault(){}});const bundle=await w.collect();assert.equal(bundle.variants.length,1);assert.equal(bundle.variants[0].id,'old-id');assert.equal(bundle.variants[0].version,7);assert.equal(bundle.variants[0].sku,'keep');assert.equal(bundle.variants[0].image_path,'keep.jpg');assert.equal(bundle.attributes.material,'قطن');}finally{globalThis.document=originalDoc;}
});
