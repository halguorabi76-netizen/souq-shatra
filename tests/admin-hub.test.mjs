import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('admin entry starts the hub, production runtime is generated from the unchanged source',()=>{
 const admin=read('admin.html'),main=read('index.html');
 assert.match(admin.match(/<script type="module">([\s\S]*?)<\/script>/)[1],/bootAdminHub/);
 assert.doesNotMatch(admin.match(/<script type="module">([\s\S]*?)<\/script>/)[1],/supabase|createClient/);
 assert.equal(read('admin-app.js'),main.match(/<script type="module">([\s\S]*?)<\/script>/)[1]);
 const hub=read('admin-hub.js');assert.match(hub,/if\(!preview\)\{await import/);assert.match(hub,/sandbox/);
});
test('one common header provides admin, nested preview, and main site navigation',()=>{
 const c=vm.createContext({});vm.runInContext(read('admin-hub.js').replace(/export /g,''),c);
 const h=c.adminHubHeader(true);assert.match(h,/href="admin.html\?section=preview" aria-current="page"/);assert.match(h,/href="index.html"/);assert.doesNotMatch(h,/href="preview.html"/);
});
test('old preview entry redirects into admin while embedded preview keeps the isolated client',()=>{
 const preview=read('preview.html');assert.match(preview,/window.top===window.self/);assert.match(preview,/searchParams.set\("section","preview"\)/);assert.match(preview,/dataset.embeddedPreview/);assert.doesNotMatch(preview,/SUPABASE_ANON_KEY|import .*config.js|import \{createClient\}/);assert.match(preview,/const db=createPreviewClient/);
});
