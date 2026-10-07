import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAppearance} from '../seller-workspace.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('legacy seller colors cannot override the market palette while mode and icon preferences survive',()=>{
 for(const color of ['blue','sky','red','green','brown','indigo','violet'])assert.deepEqual(normalizeAppearance({color,mode:'dark',icons:'soft'}),{color:'violet',mode:'dark',icons:'soft'});
 const c={window:{}};vm.createContext(c);vm.runInContext(readFileSync('boutique-presentation.js','utf8'),c);const bar=c.window.SouqBoutique.storeBar({id:'store',name:'متجر',appearance:{color:'blue'}},{esc:String});assert.match(bar,/--store-header:#45205e/);assert.doesNotMatch(bar,/#245bc5/);
});
