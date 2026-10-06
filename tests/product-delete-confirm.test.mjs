import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('main product delete confirmation is appended beneath the selected product without opening a sheet',async()=>{
 const html=await readFile('index.html','utf8'),helper=html.match(/function confirmProductDelete\(id,source\)\{[\s\S]*?\n\}/)[0];
 let appended,focused=false,removed=false;
 const panel={setAttribute(){},querySelector:()=>({focus(){focused=true}})};
 const card={append:p=>appended=p},source={closest:()=>card};
 const context={ADMIN_PORTAL:false,esc:x=>x,ask(){throw Error('full-screen confirmation opened')},toast(){throw Error('missing card')},document:{querySelectorAll:()=>[{remove(){removed=true}}],createElement:()=>panel}};
 vm.runInNewContext(helper+'\nconfirmProductDelete("product-id",source);',{...context,source});
 assert.equal(appended,panel);assert.equal(panel.className,'product-delete-confirm');assert.match(panel.innerHTML,/data-a="pdel2" data-v="product-id"/);assert.match(panel.innerHTML,/cancelProductDelete/);assert.equal(focused,true);assert.equal(removed,true);
 assert.match(html,/A\[t.dataset.a\]\(t.dataset.v,t\)/);
});
test('admin retains its existing delete confirmation',async()=>{
 const html=await readFile('index.html','utf8'),helper=html.match(/function confirmProductDelete\(id,source\)\{[\s\S]*?\n\}/)[0];let called;
 vm.runInNewContext(helper+'\nconfirmProductDelete("id");',{ADMIN_PORTAL:true,ask:(...args)=>called=args});
 assert.deepEqual(called,['حذف هذا المنتج؟','pdel2','id']);
});
