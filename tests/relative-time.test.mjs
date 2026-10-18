import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const c=vm.createContext({Date,isNaN,setInterval:()=>0,document:{querySelectorAll:()=>[]}});
vm.runInContext(html.slice(html.indexOf('const exactWhen'),html.indexOf('setInterval(()=>document.querySelectorAll',html.indexOf('const exactWhen'))).replace(/^const /gm,'var '),c);
test('times read as minutes, hours, yesterday, then date and time',()=>{
 const now=new Date(2026,9,19,15,0).getTime(),ago=s=>c.relativeTime(now-s*1000,now);
 assert.equal(ago(10),'الآن');assert.equal(ago(60),'منذ دقيقة');assert.equal(ago(120),'منذ دقيقتين');assert.equal(ago(300),'منذ 5 دقائق');assert.equal(ago(1500),'منذ 25 دقيقة');
 assert.equal(ago(3600),'منذ ساعة');assert.equal(ago(7200),'منذ ساعتين');assert.equal(ago(5*3600),'منذ 5 ساعات');
 assert.match(ago(20*3600),/^منذ 20 ساعة$/);assert.match(ago(30*3600),/^أمس · /);
 const older=ago(3*86400);assert.doesNotMatch(older,/منذ|يوم/);assert.match(older,/16 .+ · /);
 assert.equal(c.when(null),'');assert.match(c.when(now),/<time class="rel-time" datetime="/);
});
test('settings are grouped with sign-out last',()=>{
 const f=html.slice(html.indexOf('function settings(){'));
 for(const t of ['st-profile','id="stAccount"','id="stLook"','id="stHelp"','st-danger'])assert.ok(f.includes(t),t);
 assert.ok(f.indexOf('st-danger')>f.indexOf('id="stHelp"'),'sign out comes after help');
});
