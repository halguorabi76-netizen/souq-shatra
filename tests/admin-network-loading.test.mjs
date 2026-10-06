import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(online=true){
 const text={textContent:''},panel={hidden:true,dataset:{},querySelector:()=>text},events={},window={addEventListener:(k,f)=>events[k]=f},navigator={onLine:online};
 vm.runInNewContext(fs.readFileSync('admin-network-loading.js','utf8'),{window,navigator,document:{getElementById:()=>panel}});
 return {panel,text,events,navigator,loading:window.SouqLoading};
}
test('ordinary actions and requests never show loading or schedule a delay',()=>{const x=setup();x.loading.begin();x.loading.transition();x.loading.requestSucceeded();x.loading.recovered();x.loading.end();assert.equal(x.panel.hidden,true);assert.doesNotMatch(fs.readFileSync('admin-network-loading.js','utf8'),/setTimeout|setInterval/);});
test('a network failure stays visible across requests until confirmed recovery',()=>{const x=setup();x.loading.failed();assert.equal(x.panel.hidden,false);x.loading.begin();x.loading.end();x.events.online();assert.equal(x.panel.hidden,false);x.loading.requestSucceeded();assert.equal(x.panel.hidden,false);x.loading.recovered();assert.equal(x.panel.hidden,true);});
test('offline recovery requires a successful request, and repeated failures do not blink',()=>{const x=setup(false);assert.equal(x.panel.hidden,false);x.loading.failed();x.loading.failed();assert.equal(x.panel.hidden,false);x.navigator.onLine=true;x.events.online();assert.equal(x.panel.hidden,false);x.loading.recovered();assert.equal(x.panel.hidden,false);x.loading.requestSucceeded();x.loading.recovered();assert.equal(x.panel.hidden,true);assert.equal(x.text.textContent,'جار التحميل');});
test('administration content requires an enabled admin role',()=>{
 const source=fs.readFileSync('admin-app.js','utf8'),start=source.indexOf('function renderAdminPortal(){'),end=source.indexOf('\nfunction admin(){',start),view={innerHTML:''},out={hidden:false};
 let calls=0;const c={user:{id:'new'},profile:{role:'buyer'},dataReady:true,adminAccessReady:true,tab:'market',admin:()=>calls++,window:{SouqTheme:{set(){},get:()=> 'light'}},document:{body:{classList:{add(){},remove(){}}},getElementById:id=>id==='adminTop'?{}:null},$:s=>s==='#view'?view:s==='.tabs'?{hidden:false}:out};
 vm.createContext(c);vm.runInContext(source.slice(start,end),c);c.renderAdminPortal();assert.equal(calls,0);assert.match(view.innerHTML,/لا يملك صلاحية الإدارة/);
 c.profile={role:'admin',disabled:true};c.renderAdminPortal();assert.equal(calls,0);
 c.profile={role:'admin',disabled:false};c.renderAdminPortal();assert.equal(calls,1);
 c.user=null;c.renderAdminPortal();assert.match(view.innerHTML,/حساب المالك المعتمد/);
});
test('admin entry has no artificial startup timer and imports the updated loader',()=>{const s=fs.readFileSync('admin.html','utf8');assert.doesNotMatch(s,/setTimeout\(finish,1600\)|app-loading.js/);assert.match(s,/admin-network-loading.js\?v=95/);assert.match(s,/<body>/);});

