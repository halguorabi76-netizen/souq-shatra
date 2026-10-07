import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('admin hub retains its independent authorization gate and shares product implementation with the site',()=>{
 const admin=read('admin.html'),main=read('index.html');
 assert.match(admin.match(/<script type="module">([\s\S]*?)<\/script>/)[1],/bootAdminHub/);
 assert.doesNotMatch(admin.match(/<script type="module">([\s\S]*?)<\/script>/)[1],/supabase|createClient/);
 const app=read('admin-app.js');assert.match(app,/async function refreshAdmin/);assert.match(app,/profile\?\.role!==['"]admin['"]/);
 for(const file of ['product-variants.js','seller-workspace.js','delivery-workspace.js']){const reference=new RegExp(file.replace('.', '\\.')+'\\?v=\\d+');assert.equal(app.match(reference)[0],main.match(reference)[0]);}
 const fn=(source,name)=>source.slice(source.indexOf('function '+name+'('),source.indexOf('\nfunction ',source.indexOf('function '+name+'(')+1));assert.equal(fn(app,'postPage'),fn(main,'postPage'));assert.equal(fn(app,'psheet'),fn(main,'psheet'));
 const hub=read('admin-hub.js');assert.match(hub,/if\(!preview\)\{await import/);assert.match(hub,/sandbox/);
});
test('one common header provides admin, nested preview, and main site navigation',()=>{
 const c=vm.createContext({});vm.runInContext(read('admin-hub.js').replace(/export /g,''),c);
 const h=c.adminHubHeader(true);assert.match(h,/href="admin.html\?section=preview" aria-current="page"/);assert.match(h,/href="index.html"/);assert.doesNotMatch(h,/href="preview.html"/);
});
test('old preview entry redirects into admin while embedded preview keeps the isolated client',()=>{
 const preview=read('preview.html');assert.match(preview,/window.top===window.self/);assert.match(preview,/searchParams.set\("section","preview"\)/);assert.match(preview,/dataset.embeddedPreview/);assert.doesNotMatch(preview,/SUPABASE_ANON_KEY|import .*config.js|import \{createClient\}/);assert.match(preview,/const db=createPreviewClient/);
});
