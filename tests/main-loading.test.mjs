import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('normal work never shows a loader or schedules timers; only connectivity failures do',async()=>{
 const listeners={},text={textContent:''},panel={hidden:true,dataset:{},querySelector:()=>text};
 const navigator={onLine:true},window={addEventListener:(event,fn)=>listeners[event]=fn};
 vm.runInNewContext(await readFile('main-loading.js','utf8'),{window,navigator,document:{getElementById:()=>panel},setTimeout:()=>{throw Error('Artificial delay');}});
 window.SouqLoading.begin();window.SouqLoading.end();window.SouqLoading.transition();assert.equal(panel.hidden,true);
 window.SouqLoading.failed();assert.equal(panel.hidden,false);
 window.SouqLoading.recovered();assert.equal(panel.hidden,true);
 navigator.onLine=false;listeners.offline();assert.equal(panel.hidden,false);
 window.SouqLoading.recovered();assert.equal(panel.hidden,false);
 navigator.onLine=true;listeners.online();assert.equal(panel.hidden,true);
});
