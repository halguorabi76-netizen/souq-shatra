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
test('editor round-trips custom schema and creates separate zero-stock combinations with swatches',async()=>{
 const oldDocument=globalThis.document;const nodes=new Map([['fs',{value:0,closest:()=>null}],['fpr',{value:1000}],['vaNewColor',{value:'أزرق خاص'}],['vaNewHex',{value:'#125abc'}]]);globalThis.document={getElementById:id=>nodes.get(id)||null};
 const host={innerHTML:''},custom={key:'custom_roast',label:'درجة التحميص',icon:OPTION_ICONS[0],type:'select',variant:true,options:['فاتح','غامق']};const click=ds=>host.onclick({target:{closest:()=>({dataset:{va:ds.action,...ds}})},preventDefault(){}});
 try{
 const editor=createProductEditor({categories:()=>CATALOG_SEEDS,base:()=>({price:1000}),toast:m=>{throw Error(m)},upload:()=>{throw Error('unexpected upload')}});editor.mount(host,{catalog_category_id:category('قمصان وتيشيرتات').id,attributes:{_custom_options:[custom]},has_variants:true,variants:[]});assert(host.innerHTML.includes('data-va="common"'));host.onchange({target:{dataset:{vaAxis:'color'},checked:true}});click({action:'pick',key:'color',value:'أسود'});click({action:'addColor'});host.onchange({target:{dataset:{vaAxis:'size'},checked:true}});click({action:'pick',key:'size',value:'M'});click({action:'pick',key:'size',value:'L'});host.onchange({target:{dataset:{vaAxis:'custom_roast'},checked:true}});click({action:'pick',key:'custom_roast',value:'فاتح'});click({action:'generate'});
 let bundle=await editor.collect();assert.equal(bundle.variants.length,4);assert(bundle.variants.every(v=>v.stock===0));assert.equal(bundle.attributes._color_swatches['أزرق خاص'],'#125abc');assert.equal(bundle.attributes._custom_options[0].label,'درجة التحميص');
 host.oninput({target:{dataset:{vaRow:'0',vaField:'stock'},type:'number',value:'6'}});bundle=await editor.collect();assert.equal(bundle.variants[0].stock,6);assert.equal(nodes.get('fs').value,6);
 const p={attributes:bundle.attributes,catalog_category_id:bundle.catalog_category_id,variants:bundle.variants,has_variants:true};editor.mount(host,p);assert.equal((await editor.collect()).variants[0].stock,6);assert(host.innerHTML.includes('degree')===false);assert.throws(()=>click({action:'removeCustom',index:'0'}),/أرشف/);
 }finally{globalThis.document=oldDocument;}
});
