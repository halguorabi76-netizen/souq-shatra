import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/migrations/20261017100000_used_listings.sql',import.meta.url),'utf8');
test('the used market leads the home page; «بِع غرضك» with its price is on its own page and the profile',()=>{
 assert.match(html,/بِع غرضك بـ \$\{usedPriceLabel\(\)\}/);
 assert.match(html,/homeUsedBlock\(\)\+ui\.switcher\('home'\)/);
 assert.match(html,/offers:offersPage,usedPage,/);
 assert.match(html,/\$\{usedMine\(\)\}<nav class="profile-foot"/);
});
test('the seller number is shown only after sign-in, and the monthly limit points to opening a store',()=>{
 assert.match(html,/usedContact:v=>\{const \[mode,id\]=String\(v\)\.split\(':'\);if\(!user\)\{[^}]*waAccountSheet\('new'\)/);
 assert.match(html,/وصلت حدك الشهري/);
 assert.match(sql,/if auth\.uid\(\) is null then raise exception 'login required'/);
 assert.match(sql,/used_monthly_limit integer not null default 3/);
 assert.match(sql,/raise exception 'monthly_limit'/);
});
