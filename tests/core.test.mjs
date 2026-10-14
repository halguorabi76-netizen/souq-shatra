import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { html, raw, esc, toString, safeUrl } from '../app/core/dom.js';
import { money, digits, phoneDigits, containsPhone, percentOff, normalizeArabic, isUuid } from '../app/core/format.js';
import { variantState, initialPicks } from '../app/lib/variant-state.js';

test('templates escape every interpolated value unless explicitly raw', () => {
  const evil = '<img src=x onerror=alert(1)>"\'`';
  const out = toString(html`<p title="${evil}">${evil}${raw('<b>ok</b>')}${[evil, null, false]}</p>`);
  assert(!out.includes('<img'));
  assert(out.includes('&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&#96;'));
  assert(out.includes('<b>ok</b>'));
  assert.equal(esc(null), '');
  assert.equal(toString(html`${0}`), '0');
});
test('safeUrl allows only web, relative, tel and image data URLs', () => {
  for (const ok of ['https://a.b/c.png', '#/p/1', './x', 'index.html#/', 'tel:0770', 'data:image/png;base64,AA']) assert.equal(safeUrl(ok), ok);
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:x', 'data:text/html,<script>', 'vbscript:x']) assert.equal(safeUrl(bad), '');
});
test('money and number formatting', () => {
  assert.equal(money(12500), '12,500 د.ع');
  assert.equal(money('x'), '0 د.ع');
  assert.equal(percentOff(80, 100), 20);
  assert.equal(percentOff(100, 90), 0);
});
test('phone helpers handle Arabic digits and detect phone numbers in addresses', () => {
  assert.equal(digits('٠٧٧٠١٢٣'), '0770123');
  assert.equal(phoneDigits('٠٧٧٠ ١٢٣-٤٥٦٧'), '07701234567');
  assert(containsPhone('قرب الجامع ٠٧٧٠١٢٣٤٥٦٧'));
  assert(!containsPhone('شارع 14 بناية 3'));
  assert.equal(normalizeArabic('أحذيةُ'), 'احذيه');
  assert(isUuid('5a000000-0000-4000-8000-000000000001'));
});
const shirt = {
  variants: [
    { id: 'a', attributes: { color: 'أسود', size: 'M' }, price: 10, sale_price: null, stock: 3, available: true, archived: false },
    { id: 'b', attributes: { color: 'أسود', size: 'L' }, price: 10, sale_price: null, stock: 0, available: true, archived: false },
    { id: 'c', attributes: { color: 'أبيض', size: 'L' }, price: 12, sale_price: 9, stock: 2, available: true, archived: false },
    { id: 'd', attributes: { color: 'أحمر', size: 'M' }, price: 10, sale_price: null, stock: 5, available: true, archived: true },
  ],
};
test('variant options disable out-of-stock combinations and ignore archived variants', () => {
  const s = variantState(shirt, { color: 'أسود' });
  assert.deepEqual(s.values.color, ['أسود', 'أبيض']);
  assert(s.enabled('size', 'M'));
  assert(!s.enabled('size', 'L'), 'black L has no stock');
  assert.equal(variantState(shirt, { color: 'أبيض', size: 'L' }).match.id, 'c');
  assert.equal(variantState(shirt, { color: 'أسود' }).match, null);
});
test('initial picks select the cheapest sellable variant', () => {
  assert.deepEqual(initialPicks(shirt), { color: 'أبيض', size: 'L' });
});
test('pages are shells that load the module app and never inline user data', async () => {
  for (const page of ['index.html', 'admin.html']) {
    const t = await readFile(new URL('../' + page, import.meta.url), 'utf8');
    assert(t.includes('vendor/supabase/supabase-2.117.3.js'));
    assert(t.includes('type="module"'));
    assert(t.includes('dir="rtl"'));
  }
  const css = await readFile(new URL('../app/styles/app.css', import.meta.url), 'utf8');
  assert(css.includes('[hidden] { display: none !important; }'));
  assert(css.includes(":root[data-theme='dark']"));
});
test('no module builds HTML with innerHTML from template strings', async () => {
  const { readdir } = await import('node:fs/promises');
  const files = [];
  for (const dir of ['core', 'shop', 'seller', 'driver', 'admin']) for (const f of await readdir(new URL(`../app/${dir}/`, import.meta.url))) files.push(`../app/${dir}/${f}`);
  for (const f of files) {
    const src = await readFile(new URL(f, import.meta.url), 'utf8');
    // innerHTML is only allowed with toString(html`...`) (escaped) or trusted constants.
    for (const m of src.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)) assert(/toString\(|original|icon\(|`<span class="spinner">|esc\(|html`/.test(m[1]), `${f}: ${m[0]}`);
  }
});
test('earlier options stay switchable after a later option is chosen', () => {
  const s = variantState(shirt, { color: 'أبيض', size: 'L' });
  assert(s.enabled('color', 'أسود'), 'shopper can change colour even though black L is sold out');
  assert(!variantState(shirt, { color: 'أسود', size: 'L' }).enabled('size', 'L'));
});
