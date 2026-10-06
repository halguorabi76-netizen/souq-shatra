import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function gate(file,profile){
 const source=fs.readFileSync(file,'utf8'),view={innerHTML:''};
 const c={user:{email:'owner@example.test'},profile,dataReady:true,adminAccessReady:true,tab:'market',opened:false,document:{body:{classList:{add(){},remove(){}}},getElementById:()=>({remove(){}})},window:{SouqTheme:{get(){},set(){}}},$:s=>s==='#view'?view:{hidden:false},esc:s=>s,admin:()=>{c.opened=true}};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function renderAdminPortal(){'),source.indexOf('\nfunction admin(){')),c);c.renderAdminPortal();return {c,html:view.innerHTML};
}
test('login transition waits for a trusted profile instead of denying the administrator',()=>{
 for(const file of ['index.html','admin-app.js']){const x=gate(file,null);assert.match(x.html,/جارٍ التحقق/);assert.doesNotMatch(x.html,/لا يملك/);assert.equal(x.c.opened,false);}
});
test('only an active admin profile opens the dashboard; rejected accounts show the current email',()=>{
 for(const file of ['index.html','admin-app.js']){
  assert.equal(gate(file,{role:'admin',disabled:false}).c.opened,true);
  for(const profile of [{role:'buyer'},{role:'admin',disabled:true}]){const x=gate(file,profile);assert.equal(x.c.opened,false);assert.match(x.html,/لا يملك/);assert.match(x.html,/owner@example.test/);}
 }
});
