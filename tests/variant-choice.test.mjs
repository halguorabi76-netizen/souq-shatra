import {test} from 'node:test';
import assert from 'node:assert/strict';
import {variantChoices,chooseVariant,selectedProduct} from '../product-variants.js';
const variants=[{id:'a',attributes:{custom_type:'قطن',custom_color:'أسود'},price:1000,stock:4,available:true,img:'black.jpg'},{id:'b',attributes:{custom_type:'كتان',custom_color:'أزرق'},price:1500,sale_price:1200,stock:2,available:true,img:'blue.jpg'},{id:'c',attributes:{custom_type:'كتان',custom_color:'أبيض'},price:1400,stock:0,available:true}];
const p={has_variants:true,variants};
test('switching type replaces incompatible color and updates chosen image and sale price',()=>{
 const chosen=chooseVariant(variants,variants[0].attributes,'custom_type','كتان');
 assert.equal(chosen.vid,'b');assert.equal(chosen.options.custom_color,'أزرق');
 const display=selectedProduct(p,chosen.vid);assert.equal(display.img,'blue.jpg');assert.equal(display.price,1200);assert.equal(display.compare_at_price,1500);
 assert.equal(chooseVariant(variants,chosen.options,'custom_color','أبيض').vid,null);
});
test('types are a select and colors are circles restricted to the chosen type',()=>{
 const html=variantChoices(p,[],variants[1].attributes);
 assert.match(html,/<select id="variantType-custom_type"/);assert.match(html,/va-swatch/);assert.match(html,/#2563eb/);assert.match(html,/data-option="أبيض"[^>]*disabled/);assert.doesNotMatch(html,/data-option="أسود"/);
});
