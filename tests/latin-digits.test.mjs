import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function load(){
 const listeners={};class HTMLInputElement{constructor(type,mode){this.type=type;this._mode=mode;this.value='';this.selectionStart=0;this.selectionEnd=0;this.events=[];}getAttribute(n){return n==='inputmode'?this._mode:null}setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b}setRangeText(t,s,e){this.value=this.value.slice(0,s)+t+this.value.slice(e);this.selectionStart=this.selectionEnd=s+t.length}dispatchEvent(ev){this.events.push(ev.type)}}
 const c={HTMLInputElement,Event:class{constructor(t){this.type=t}},window:{},document:{addEventListener:(t,fn,capture)=>{listeners[t]={fn,capture}}}};vm.createContext(c);
 vm.runInContext(readFileSync(new URL('../latin-digits.js',import.meta.url),'utf8'),c);
 return {c,listeners,HTMLInputElement};
}
test('Arabic and Persian digits become 0-9 in phone and number fields, before form listeners run',()=>{
 const {c,listeners,HTMLInputElement}=load();
 assert.equal(c.window.SouqDigits.toLatin('٠٧٧٠١٢٣٤٥٦٧'),'07701234567');
 assert.equal(c.window.SouqDigits.toLatin('۰۷۸۰ ۱۲۳'),'0780 123');
 assert.equal(listeners.input.capture,true,'runs in the capture phase');assert.equal(listeners.beforeinput.capture,true);assert.equal(c.window.SouqDigits.toLatin('١٢٫٥'),'12.5');
 const phone=new HTMLInputElement('tel',null);phone.value='٠٧٧٠١';phone.selectionStart=phone.selectionEnd=3;listeners.input.fn({target:phone});
 assert.equal(phone.value,'07701');assert.equal(phone.selectionStart,3,'caret stays in place');
 const price=new HTMLInputElement('text','numeric');price.value='٧٥٠٠٠';listeners.input.fn({target:price});assert.equal(price.value,'75000');
 const qty=new HTMLInputElement('number',null);qty.value='1';let stopped=false;listeners.beforeinput.fn({target:qty,data:'٢',inputType:'insertText',preventDefault:()=>{stopped=true}});
 assert.equal(stopped,true,'number fields: the Arabic keystroke is replaced before the field can drop it');assert.equal(qty.value,'12');assert.deepEqual(qty.events,['input']);
 const tel=new HTMLInputElement('tel',null);tel.value='07';tel.selectionStart=tel.selectionEnd=2;listeners.beforeinput.fn({target:tel,data:'٧٠',inputType:'insertFromPaste',preventDefault(){}});assert.equal(tel.value,'0770');
 const name=new HTMLInputElement('text',null);name.value='حي ٧';listeners.input.fn({target:name});assert.equal(name.value,'حي ٧','plain text fields are left as typed');
});
test('checkout address form explains what is missing instead of a silent disabled button',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/function addressProblem\(\)/);assert.match(html,/function addressValid\(\)\{return !addressProblem\(\);\}/);
 assert.match(html,/id="addressHint"[^>]*aria-live="polite"/);assert.match(html,/phone:digits\(val\('addressPhone'\)\)/);
 for(const page of ['index.html','admin.html'])assert.match(readFileSync(new URL('../'+page,import.meta.url),'utf8'),/<script src="latin-digits\.js\?v=\d+"><\/script><script src="page-navigation\.js/);
});
