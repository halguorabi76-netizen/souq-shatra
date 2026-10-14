import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('presentation feedback does not delay actions or animate background renders',()=>{
 const listeners={},observers=[],effects=[];let now=0,reduced=false;
 const view={animate(frames,options){effects.push(options);return {cancel(){},finished:Promise.resolve()};}},sheet={...view},shade={hidden:true};
 const context={document:{hidden:false,head:{append(){}},createElement:()=>({}),getElementById:id=>({view,sheet,shade})[id],addEventListener:(name,fn)=>listeners[name]=fn},window:{addEventListener(){}},matchMedia:()=>({get matches(){return reduced}}),performance:{now:()=>now},MutationObserver:class{constructor(fn){this.fn=fn;}observe(el){observers.push([el,this.fn]);}}};
 vm.runInNewContext(readFileSync('interaction-motion.js','utf8'),context);
 const render=observers.find(([el])=>el===view)[1];render();assert.equal(effects.length,0);
 listeners.click();render();assert.equal(effects.length,1);assert.equal(effects[0].duration,170);
 now=1000;render();assert.equal(effects.length,1);listeners.click();reduced=true;render();assert.equal(effects.length,1);
 assert.match(readFileSync('interaction-motion.js','utf8'),/tap-highlight-color:transparent/);
});
