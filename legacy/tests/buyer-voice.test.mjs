import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(){
 const saved=new Map(),writes=[],state={user:{id:'customer',user_metadata:{full_name:'الاسم الأصلي'}},profile:{role:'buyer'},mode:'buyer',ready:true,adminPortal:false,seller:false};
 const c={window:{},NodeFilter:{SHOW_TEXT:4},queueMicrotask:()=>{},MutationObserver:class{observe(){}},localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},document:{body:{},documentElement:{dataset:{}},createTreeWalker:()=>({nextNode:()=>null}),querySelectorAll:()=>[]}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('buyer-voice.js','utf8'),c);
 const db={auth:{updateUser:async payload=>{writes.push(payload);return {data:{user:state.user},error:null}}}};
 const runtime=c.window.SouqBuyerVoice.create({get:()=>state,db});return {state,runtime,writes,saved,api:c.window.SouqBuyerVoice,db};
}
test('Arabic wording changes exact imperative words and can return to masculine',()=>{
 const {api}=setup(),text='ابحث عن المنتج، تسوق الآن · أضف للسلة · مبروك، طلبك تم';
 const female=api.wording(text,'female');assert.equal(female,'ابحثي عن المنتج، تسوقي الآن · أضيفي للسلة · مبروك، طلبكِ تم');assert.equal(api.wording(female,'male'),text);assert.equal(api.wording(female,'female'),female);
 assert.equal(api.wording('كتاب وباحث ومشتريات المتجر','female'),'كتاب وباحث ومشتريات المتجر');
});
test('selection saves only account wording metadata; roles and existing metadata remain intact',async()=>{
 const x=setup();await x.runtime.choose('female');assert.equal(x.writes.length,1);assert.equal(JSON.stringify(x.writes[0]),JSON.stringify({data:{address_gender:'female'}}));assert.equal(x.state.profile.role,'buyer');assert.equal(x.state.user.user_metadata.full_name,'الاسم الأصلي');assert.equal(x.runtime.gender(),'female');await x.runtime.choose('male');assert.equal(x.runtime.gender(),'male');
});
test('another account and guest mode never inherit the previous customer choice',async()=>{
 const x=setup();await x.runtime.choose('female');x.state.user={id:'another',user_metadata:{}};assert.equal(x.runtime.gender(),null);x.state.mode='guest';await x.runtime.choose('female');assert.equal(x.writes.length,1);
});
test('failed saving does not silently record a choice; sellers, drivers and admin portal are excluded',async()=>{
 const x=setup();x.db.auth.updateUser=async()=>({error:{message:'offline'}});await x.runtime.choose('female');assert.equal(x.runtime.gender(),null);assert.equal(x.saved.size,0);
 for(const change of [{mode:'seller'},{mode:'driver'},{adminPortal:true},{profile:{disabled:true}},{seller:true}]){const y=setup();Object.assign(y.state,change);await y.runtime.choose('female');assert.equal(y.writes.length,0);}
});
