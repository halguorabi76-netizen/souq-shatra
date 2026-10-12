import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {createPreviewModel,previewFixture} from '../preview-lab.js';
const c={window:{}};vm.createContext(c);vm.runInContext(readFileSync('delivery-zones.js','utf8'),c);const ui=c.window.SouqDeliveryZones;
const zones=[{id:'shatra',name:'داخل الشطرة',fee:2000,enabled:true},{id:'nasr',name:'مدينة النصر',fee:5000,enabled:true},{id:'test-city',name:'مدينة اختبار',fee:3500,enabled:true}];
test('delivery regions publish exact totals, require selection and use configured city fees',()=>{
 const q=choice=>ui.quote(zones,choice,35000,0,1);
 assert.equal(q({area:'shatra'}).total,37000);assert.equal(q({area:'outside',outside:'nasr'}).total,40000);assert.equal(q({area:'outside',outside:'other',city:'test-city'}).total,38500);
 for(const choice of [{},{area:'outside'},{area:'outside',outside:'other',city:'unknown'}]){assert.equal(q(choice).ready,false);assert.equal(q(choice).total,null);}
 assert.equal(ui.quote(zones,{area:'shatra'},50000,500,2).total,55000);
 assert.equal(ui.quote(zones.map(z=>({...z,enabled:false})),{area:'shatra'},35000,0).ready,false);
});
test('zone checkout keeps variant stock precise, records the selected charge and rejects stale prices',async()=>{
 const fixture=previewFixture(),storage={getItem:()=>JSON.stringify(fixture),setItem(){}};const db=createPreviewModel(storage);db.setRole('buyer');const id=fixture.products[0].id,store=fixture.stores[0].id;
 const args={p_store:store,p_lines:[{id,quantity:2}],p_name:'زبون اختبار',p_phone:'07700000000',p_address:'عنوان اختبار',p_note:'',p_zone:'nasr',p_expected_fee:5000,p_expected_platform_fee:500};
 assert.ok((await db.rpc('place_order_with_delivery_zone',{...args,p_expected_fee:2000})).error);assert.equal(db.snapshot().orders.length,0);assert.equal(db.snapshot().products[0].stock,20);
 const result=await db.rpc('place_order_with_delivery_zone',args);assert.equal(result.error,null);const order=db.snapshot().orders[0];assert.equal(order.total,25500);assert.equal(order.delivery_fee,5000);assert.equal(order.delivery_zone_id,'nasr');assert.equal(db.snapshot().products[0].stock,18);
 assert.ok((await db.rpc('admin_set_delivery_zone',{p_id:'',p_name:'مدينة اختبار',p_fee:3500,p_enabled:true})).error);

});
