import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAppearance} from '../seller-workspace.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('legacy seller colors cannot override the market palette while mode and icon preferences survive',()=>{
 for(const color of ['blue','sky','red','green','brown','indigo','violet','earth','indigo'])assert.deepEqual(normalizeAppearance({color,mode:'dark',icons:'soft'}),{color:'indigo',mode:'dark',icons:'soft'});

});
