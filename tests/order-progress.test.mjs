import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('index.html','utf8'),start=html.indexOf('function orderProgress('),end=html.indexOf('function ordCard(',start),ctx={};vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
const render=(st,driver_id=null)=>ctx.orderProgress({st,driver_id});
test('seller and driver approvals update independently in either order',()=>{
 for(const [st,driver,sellerApproved,driverApproved] of [[0,null,false,false],[1,null,true,false],[0,'driver',false,true],[1,'driver',true,true]]){
  const h=render(st,driver);assert.match(h,new RegExp('class="'+(sellerApproved?'approved':'pending')+'" data-approval="seller"'));assert.match(h,new RegExp('class="'+(driverApproved?'approved':'pending')+'" data-approval="driver"'));assert.match(h,new RegExp('class="'+(sellerApproved&&driverApproved?'active':'pending')+'" data-stage="processing"'));assert.match(h,/class="pending" data-stage="delivered"/);
 }
});
test('delivered record completes tracking; cancelled record does not pretend to be delivered',()=>{assert.match(render(3,'driver'),/class="complete" data-stage="delivered"/);assert.match(render(3,'driver'),/تم التسليم/);assert.doesNotMatch(render(4,'driver'),/data-stage="delivered"/);assert.match(render(4,'driver'),/تم إلغاء الطلب/)});
test('preparation wording does not claim the driver has already collected the goods',()=>{const h=render(1,'driver');assert.match(h,/جارٍ تجهيز وتوصيل طلبك/);assert.doesNotMatch(h,/الطلب في طريقه إليك|استلم السائق/)});
