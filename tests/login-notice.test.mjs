import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function isInvalidPasswordLogin('),html.indexOf('function authIcon('));
function setup(role='buyer'){
 const events=[],fields={lp:{value:'old@example.com'},lk:{value:'secret',focus(){events.push(['passwordFocus'])}},ln:{focus(){}}};let dialog;
 const c={viewMode:role,$:key=>fields[key.slice(1)],lsheet:mode=>events.push(['auth',mode]),requestRole:role=>events.push(['request',role]),document:{getElementById:()=>null,body:{append(d){dialog=d}},createElement(){const listeners={},buttons={};return {setAttribute(){},addEventListener(name,fn){listeners[name]=fn},querySelector(key){return buttons[key]||= {addEventListener(_event,fn){this.click=fn}}},showModal(){this.open=true},close(){this.open=false;listeners.close()},remove(){this.removed=true}}}}};
 vm.createContext(c);vm.runInContext(source,c);return {c,events,fields,getDialog:()=>dialog};
}
test('only invalid credentials trigger account guidance, not connection or rate-limit errors',()=>{
 const {c}=setup();for(const e of [{code:'invalid_credentials'},{message:'Invalid login credentials'}])assert.equal(c.isInvalidPasswordLogin(e),true);
 for(const e of [{code:'over_request_rate_limit',message:'Invalid login credentials'},{code:'email_not_confirmed'},new TypeError('Failed to fetch'),null])assert.equal(c.isInvalidPasswordLogin(e),false);
});
test('small modal can retry without clearing credentials or automatically signing up',()=>{
 const {c,events,fields,getDialog}=setup();c.loginAccountNotice('buyer@example.com');const d=getDialog();assert.equal(d.open,true);assert.match(d.innerHTML,/إذا لم يكن لديك حساب/);assert.match(d.innerHTML,/Google/);
 d.querySelector('[data-notice="retry"]').click();assert.equal(d.removed,true);assert.equal(fields.lp.value,'old@example.com');assert.equal(fields.lk.value,'secret');assert.equal(events.some(e=>e[0]==='auth'),false);
});
test('create account preserves entered email and professional application routing',()=>{
 for(const role of ['buyer','seller','driver']){
  const {c,events,fields,getDialog}=setup(role);c.loginAccountNotice('new@example.com');getDialog().querySelector('[data-notice="signup"]').click();
  assert.equal(getDialog().removed,true);assert.equal(fields.lp.value,'new@example.com');assert.ok(events.some(e=>e[0]===(role==='buyer'?'auth':'request')&&e[1]===(role==='buyer'?'r':role)));
 }
});
