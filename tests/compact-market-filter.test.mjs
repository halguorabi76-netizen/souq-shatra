import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const c={window:{}};vm.runInNewContext(readFileSync(new URL('../catalog-filter.js',import.meta.url),'utf8'),c);
const products=[['new-retail','new','retail'],['new-wholesale','new','wholesale'],['new-both','new','both'],['used','used',null],['legacy',null,null]].map(([id,condition,sale_mode])=>({id,name:id,cat:'ملابس',price:100,attributes:{_selling:{condition,sale_mode}}}));
test('new goods select wholesale or retail while used remains separate and legacy is unclassified',()=>{
 const ids=options=>Array.from(c.window.SouqCatalog.select(products,options),p=>p.id);
 assert.deepEqual(ids({condition:'new',saleMode:'retail'}),['new-retail','new-both']);assert.deepEqual(ids({condition:'new',saleMode:'wholesale'}),['new-wholesale','new-both']);assert.deepEqual(ids({condition:'used',saleMode:'all'}),['used']);assert.equal(ids({condition:'all'}).length,5);
});
