import {createRequire} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {previewFixture} from '../preview-lab.js';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const fixture=previewFixture(),product=fixture.products[0];
Object.assign(product,{price:1000,stock:21,has_variants:true,compare_at_price:null,attributes:{_manual_variants:true,_selling:{unit:'قطعة'}}});
fixture.product_variants=[['أسود','L',10,1000],['أسود','XL',4,1700],['أبيض','L',7,1000]].map(([color,size,stock,price],i)=>({id:'a4000000-0000-4000-8000-00000000000'+(i+1),product_id:product.id,attributes:{color,size},stock,price,available:true,archived:false,version:1,image_path:null}));
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROME,args:['--no-sandbox','--disable-gpu']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(data=>{if(location.origin==='https://souq.test')localStorage.setItem('souq-shatra-interface-preview-v1',JSON.stringify(data))},fixture);
 await page.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!=='https://souq.test')return r.abort();if(u.pathname==='/harness.html')return r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{width:100vw;height:100vh;border:0}</style><iframe src="/preview.html"></iframe>'});let file=path.join(root,u.pathname);if(file.endsWith('/'))file+='index.html';if(!existsSync(file))return r.abort();const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpeg':'image/jpeg'};return r.fulfill({body:readFileSync(file),contentType:mime[path.extname(file)]||'application/octet-stream'});});
 await page.goto('https://souq.test/harness.html');const f=page.frames().find(x=>x.url().includes('preview.html'));
 await f.locator('[data-preview="role"][data-v="buyer"]').first().click();await f.locator('.figma-product-card').first().waitFor();
 const heart=f.locator(`[data-a="cardFavorite"][data-v="${product.id}"]`);await heart.click();await f.waitForFunction(id=>document.querySelector(`[data-a="cardFavorite"][data-v="${id}"]`)?.getAttribute('aria-pressed')==='true',product.id);
 const snapshot=()=>f.evaluate(()=>JSON.parse(localStorage.getItem('souq-shatra-interface-preview-v1')));
 const selectStable=(id,value)=>f.evaluate(({id,value})=>{
  const select=document.getElementById(id);select.scrollIntoView({block:'center',behavior:'instant'});
  const sheet=document.getElementById('sheet'),formField=document.getElementById('addressName')||document.getElementById('cn'),map=document.querySelector('.address-map-preview iframe');
  const before={page:scrollY,sheet:sheet.scrollTop};select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));
  if(Math.abs(scrollY-before.page)>2||Math.abs(sheet.scrollTop-before.sheet)>2)throw new Error('Delivery selection moved the scroll position');
  if(!formField.isConnected||(map&&!map.isConnected))throw new Error('Delivery selection rebuilt the address form or map');
 },{id,value});

 assert.ok((await snapshot()).product_interactions.some(r=>r.product_id===product.id&&r.kind==='favorite'));
 await f.locator(`.figma-product-media[data-v="${product.id}"]`).click();
 await f.locator('[data-axis="color"][data-option="أسود"]').click();await f.locator('[data-axis="size"][data-option="XL"]').click();
 assert.equal(await f.locator('[data-axis="color"][data-option="أبيض"]').isEnabled(),false);assert.match(await f.locator('#productPrice').innerText(),/1,700/);
 await f.locator('[data-a="pq"][data-v="1"]').click();await f.locator('[data-a="add"]').click();
 await f.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().endTime!==Infinity).map(a=>a.finished.catch(()=>{}))));if(process.env.SOUQ_CAPTURE)await page.screenshot({path:process.env.SOUQ_CAPTURE+'/product.png'});
 const cart=await f.evaluate(()=>JSON.parse(localStorage.getItem('souq-preview-cart-v1')).cart);assert.equal(cart.length,1);assert.equal(cart[0].vid,fixture.product_variants[1].id);assert.equal(cart[0].q,2);assert.equal(cart[0].price,1700);
 await f.locator('.pd-add.added').waitFor();await f.locator('.detail-cart[data-a="cart"]').click();await f.locator('.cart-line').first().waitFor();
 await f.locator('.cart-line [data-a="cq"][data-v$="|-1"]').click();await f.locator('.cart-line [data-a="cq"][data-v$="|-1"]').click();await f.locator('.confirm-modal').waitFor();assert.equal((await f.evaluate(()=>JSON.parse(localStorage.getItem('souq-preview-cart-v1')).cart))[0].q,1);await f.locator('.confirm-modal .confirm-no').click();await f.locator('.cart-line [data-a="cq"][data-v$="|1"]').click();
 await f.locator('[data-a="cartEdit"]').click();await f.locator('[data-a="add"]').click();await f.locator('.detail-cart[data-a="cart"]').click();assert.equal((await f.evaluate(()=>JSON.parse(localStorage.getItem('souq-preview-cart-v1')).cart)).length,1);
 await f.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().endTime!==Infinity).map(a=>a.finished.catch(()=>{}))));if(process.env.SOUQ_CAPTURE)await page.screenshot({path:process.env.SOUQ_CAPTURE+'/cart.png'});await f.locator('[data-a="checkoutAddresses"]').click();await f.locator('[data-a="addressNew"]').click();await f.locator('#deliveryMap').waitFor();await f.locator('#deliveryMap').click({position:{x:140,y:140}});await f.locator('#mapConfirm').click();await f.locator('#addressLabel').fill('بيت الاختبار');await f.locator('#addressName').fill('زبون اختبار');await f.locator('#addressPhone').fill('07700000000');await f.locator('#addressPhone2').fill('07800000000');await f.locator('#addressText').fill('عنوان اختبار محلي');await selectStable('checkoutArea','outside');await selectStable('checkoutOutside','nasr');await f.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().endTime!==Infinity).map(a=>a.finished.catch(()=>{}))));if(process.env.SOUQ_CAPTURE)await page.screenshot({path:process.env.SOUQ_CAPTURE+'/address.png'});await f.locator('[data-a="addressSave"]').click();await f.locator('.checkout-summary').waitFor();
 // One confirmation page: the details entered in the address form are shown, not asked again.
 assert.match(await f.locator('.co-head h1').innerText(),/تأكيد الطلب/);assert.equal(await f.locator('.co-details input').count(),0);
 const details=await f.locator('.co-details').innerText();for(const t of ['زبون اختبار','07700000000','07800000000','خارج الشطرة','عنوان اختبار محلي','محدد على الخريطة'])assert.ok(details.includes(t),'shows '+t);
 assert.equal(await f.locator('#cn').inputValue(),'زبون اختبار');assert.equal(await f.locator('#cp').inputValue(),'07700000000');assert.equal(await f.locator('#ca').inputValue(),'عنوان اختبار محلي');
 assert.match(await f.locator('.buyer-total').innerText(),/8,900/);assert.match(await f.locator('.co-bar-total').innerText(),/8,900/);assert.equal(await f.locator('[data-a="order"]').isEnabled(),true);
 assert.equal(await f.locator('#buyerFloating').isVisible(),false,'nothing floats over the confirm bar');
 await f.locator('[data-a="order"]').click();await f.locator('.buyer-checkout-card.done').waitFor();
 const after=await snapshot();assert.equal(after.orders.length,1);assert.equal(after.order_items[0].variant_id,fixture.product_variants[1].id);assert.equal(after.order_items[0].quantity,2);assert.deepEqual(after.product_variants.map(v=>v.stock),[10,2,7]);
 assert.equal(after.customer_addresses.length,1);assert.equal(after.customer_addresses[0].phone_secondary,'07800000000');assert.match(after.orders[0].note,/07800000000/);assert.deepEqual(errors,[]);console.log('PASS isolated favorite save, actual variant combinations, selected price/cart, checkout and precise variant stock deduction. No production requests.');
}finally{await browser.close();}
