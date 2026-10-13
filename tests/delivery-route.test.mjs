import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addressContainsPhone,routeTotals,readOrders} from '../delivery-operations.js';
const config={BASE_FEE:1000,PER_KM_FEE:500,EXTRA_STORE_FEE:500,FEE_ROUNDING:250,MIN_PER_KM:3,BUFFER_MIN:5,EXTRA_STORE_MIN:7};
test('two-store delivery example totals 3000 IQD and 31 internal minutes',()=>{assert.deepEqual(routeTotals(3,2,10,config),{delivery_fee:3000,expected_min:31});assert.equal(routeTotals(1.26,1,0,config).delivery_fee,1750)});
test('address guard covers Arabic, Persian and separated phone numbers but permits house numbers',()=>{for(const t of ['07812345678','٠٧٨١٢٣٤٥٦٧٨','۰۷۸۱۲۳۴۵۶۷۸','078 123 456 78','078-123-45678'])assert.equal(addressContainsPhone(t),true,t);for(const t of ['المنطقة الأولى، قرب المدرسة','محلة 12، منزل 4','شارع 123456'])assert.equal(addressContainsPhone(t),false,t)});
test('order reads use authorized API filters and preserve individual/multiple results',async()=>{let args;const db={rpc:async(name,params)=>{args={name,params};return {data:[{id:'one',buyer_id:'buyer'},{id:'two',buyer_id:'buyer'}],error:null}}};assert.equal((await readOrders(db).eq('buyer_id','buyer').in('id',['two'])).data[0].id,'two');assert.deepEqual(args,{name:'participant_orders',params:{p_buyer:'buyer'}});assert.equal((await readOrders(db).eq('id','one').single()).data.id,'one');});
