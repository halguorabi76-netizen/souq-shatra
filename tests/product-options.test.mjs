import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CATALOG_SEEDS} from '../category-seeds.js';
import {categoryDefinitions,createProductEditor,specifications} from '../product-variants.js';
import {COLOR_PALETTE,OPTION_ICONS,validateCustom,stockBreakdown,suggestions,validateAttributeValue} from '../product-options.js';
const category=name=>CATALOG_SEEDS.find(c=>c.name===name);
test('number and date values reject malformed entries, while uncommon color names stay valid',()=>{
 assert.equal(validateAttributeValue({type:'number',label:'عدد القطع'},'12'),'12');assert.throws(()=>validateAttributeValue({type:'number',label:'عدد القطع'},'-2'));assert.throws(()=>validateAttributeValue({type:'date',label:'التاريخ'},'2026-02-31'));assert.equal(validateAttributeValue({type:'date',label:'التاريخ'},'2028-02-29'),'2028-02-29');assert.equal(validateAttributeValue({type:'select',label:'اللون'},'لون خاص'),'لون خاص');
});
test('all 130 categories have optional, unique, applicable definitions',()=>{
 for(const c of CATALOG_SEEDS){const defs=categoryDefinitions(CATALOG_SEEDS,c.id);assert(defs.length>0);assert(defs.every(d=>!d.required));assert.equal(new Set(defs.map(d=>d.key)).size,defs.length);}
 const washer=categoryDefinitions(CATALOG_SEEDS,category('غسالات').id);assert(washer.some(d=>d.key==='wash_capacity'&&d.variant));assert(!washer.some(d=>d.key==='allergens'));
 const shirt=categoryDefinitions(CATALOG_SEEDS,category('قمصان وتيشيرتات').id);assert(shirt.some(d=>d.key==='pattern'));assert(!shirt.some(d=>d.key==='spin'));
 assert(COLOR_PALETTE.length>=35);assert(suggestions({key:'size'},category('أحذية رياضية').id,CATALOG_SEEDS).includes('42'));assert(suggestions({key:'size'},category('ملابس أطفال').id,CATALOG_SEEDS).includes('0–3 أشهر'));
});
test('stock totals do not double-count color/size combinations and preserve stopped stock',()=>{
 const rows=[{attributes:{color:'أزرق',size:'M'},stock:3,available:true},{attributes:{color:'أزرق',size:'L'},stock:4,available:false},{attributes:{color:'أسود',size:'M'},stock:2,available:true},{attributes:{color:'أزرق',size:'M'},stock:100,archived:true}];
 const totals=stockBreakdown(rows,[{key:'color',label:'اللون'},{key:'size',label:'المقاس'}]);assert.deepEqual(totals[0].values,[{value:'أزرق',stock:7},{value:'أسود',stock:2}]);assert.deepEqual(totals[1].values,[{value:'M',stock:5},{value:'L',stock:4}]);
});
test('custom metadata stays invisible as metadata, labels are escaped and configuration is bounded',()=>{
 const custom={key:'custom_roast',label:'درجة التحميص',icon:'🏷️',type:'select',variant:true,options:['فاتح','غامق']};assert.deepEqual(validateCustom([custom]),[custom]);assert.throws(()=>validateCustom(Array(21).fill(custom)));assert.throws(()=>validateCustom([{...custom,icon:'<img>'}]));assert.throws(()=>validateCustom([{...custom,key:'price'}]));assert.throws(()=>validateCustom([custom,custom]));
 const html=specifications({attributes:{_custom_options:[custom],_color_swatches:{'أزرق':'#2563eb'},custom_roast:'<script>فاتح</script>'}},[]);assert(html.includes('درجة التحميص'));assert(!html.includes('_custom_options'));assert(!html.includes('_color_swatches'));assert(!html.includes('<script>'));
});
test('editor round-trips custom schema, swatches, typed axes and legacy independent stock without regenerating combinations',async()=>{
 const oldDocument=globalThis.document,nodes=new Map([['productSpecs',{innerHTML:''}],['fs',{value:0}]]);globalThis.document={getElementById:id=>nodes.get(id)||null};
 const custom={key:'custom_roast',label:'درجة التحميص',icon:OPTION_ICONS[0],type:'select',variant:true,options:['فاتح','غامق']},host={innerHTML:''};
 try{const editor=createProductEditor({categories:()=>CATALOG_SEEDS,base:()=>({price:1000}),toast:m=>{throw Error(m)},upload:()=>{throw Error('unexpected upload')}});
 const product={catalog_category_id:category('قمصان وتيشيرتات').id,attributes:{_custom_options:[custom],_color_swatches:{'أزرق خاص':'#125abc'}},has_variants:true,variants:[{id:'existing',version:4,attributes:{color:'أزرق خاص',size:'M',custom_roast:'فاتح'},price:1000,stock:6,available:true,sku:'KEEP',image_path:'keep.jpg'}]};editor.mount(host,product);const b=await editor.collect();assert.equal(b.variants.length,1);assert.equal(b.variants[0].stock,6);assert.equal(b.variants[0].sku,'KEEP');assert.equal(b.variants[0].image_path,'keep.jpg');assert.equal(b.variants[0].version,4);assert.equal(b.attributes._color_swatches['أزرق خاص'],'#125abc');assert.equal(b.attributes._custom_options[0].label,'درجة التحميص');assert(!host.innerHTML.includes('إنشاء / تحديث التركيبات'));assert.throws(()=>host.onclick({target:{closest:()=>({dataset:{ve:'removeCustom',index:'0'}})},preventDefault(){}}),/أرشف/);
 }finally{globalThis.document=oldDocument;}
});
