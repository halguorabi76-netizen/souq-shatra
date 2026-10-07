import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const c={window:{}};vm.createContext(c);vm.runInContext(readFileSync('catalog-filter.js','utf8'),c);const ui=c.window.SouqCatalog;
const items=[{id:'new-retail',cat:'ملابس',price:20,attributes:{_selling:{condition:'new',sale_mode:'retail'}}},{id:'used-wholesale',cat:'ملابس',price:10,attributes:{_selling:{condition:'used',sale_mode:'wholesale'}}},{id:'both',cat:'أجهزة',price:30,attributes:{_selling:{condition:'new',sale_mode:'both'}}},{id:'unknown',cat:'ملابس',price:15}];
const ids=options=>Array.from(ui.select(items,options),p=>p.id);
test('condition and selling mode combine with category and price without guessing legacy records',()=>{
 assert.deepEqual(ids({condition:'new'}),['new-retail','both']);assert.deepEqual(ids({condition:'used',saleMode:'wholesale',category:'ملابس',max:15}),['used-wholesale']);assert.deepEqual(ids({saleMode:'retail'}),['new-retail','both']);assert.deepEqual(ids({saleMode:'wholesale'}),['used-wholesale','both']);assert.deepEqual(ids({condition:'all',saleMode:'all'}),items.map(p=>p.id));assert.equal(items[3].attributes,undefined);
});
test('existing explicit Arabic condition values remain searchable and selling metadata takes precedence',()=>{
 assert.equal(ui.productType({attributes:{condition:'مستعمل'}}).condition,'used');assert.equal(ui.productType({attributes:{condition:'مستعمل',_selling:{condition:'new'}}}).condition,'new');assert.equal(ui.productType({attributes:{_selling:{sale_mode:'مفرد وجملة'}}}).saleMode,'both');
});
