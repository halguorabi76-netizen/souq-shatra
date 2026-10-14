import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
test('customer navigation keeps four destinations and an inactive media placeholder in physical left-to-right order',()=>{
 const nav=read('index.html').match(/<nav class="tabs"[^]*?<\/nav>/)[0];
 assert.deepEqual([...nav.matchAll(/data-v="([^"]+)"/g)].map(m=>m[1]),['profilePage','materials','stores','market']);
 assert.match(nav,/aria-disabled="true"/);assert.equal((nav.match(/<button /g)||[]).length,5);assert.match(read('visual-identity.css'),/direction:ltr/);assert.match(read('visual-identity.css'),/\.tabs\[hidden\]\{display:none!important/);
 assert.match(read('market-drawer.js'),/data-v="settings"/);
});
test('supplied app icons are used and interaction confirmations follow stored changes',()=>{
 const manifest=JSON.parse(read('manifest.webmanifest'));assert.equal(manifest.background_color,'#ffffff');assert.ok(manifest.icons.every(i=>i.src.includes('shatra-calligraphy-')));
 const main=read('index.html');assert.doesNotMatch(main,/brand-classic-purple/);assert.match(main,/if\(await activity.react\(v,'favorite'\)\)/);
 assert.match(read('interaction-motion.js'),/count>cartCount/);assert.match(read('visual-identity.css'),/prefers-reduced-motion:reduce/);
 assert.match(read('market-drawer.js'),/root.inert=true/);
});
