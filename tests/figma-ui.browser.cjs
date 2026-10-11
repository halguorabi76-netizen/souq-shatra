/* Real-browser checks against isolated preview data, never production writes. */
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROME,args:['--no-sandbox','--disable-gpu']});
 try{
  for(const width of [320,390,768,1024,1366]){
   const page=await browser.newPage({viewport:{width,height:900},isMobile:width<=640,hasTouch:width<=640,serviceWorkers:'block'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',async route=>{
    const u=new URL(route.request().url());if(u.origin!=='https://souq.test')return route.abort();
    if(u.pathname==='/harness.html')return route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{width:100vw;height:100vh;border:0}</style><iframe src="/preview.html"></iframe>'});
    let file=path.join(root,u.pathname);if(file.endsWith('/'))file+='index.html';if(!fs.existsSync(file))return route.abort();
    const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpeg':'image/jpeg','.svg':'image/svg+xml'};
    return route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/octet-stream'});
   });
   await page.goto('https://souq.test/harness.html');const frame=page.frames().find(f=>f.url().includes('preview.html'));
   await frame.locator('[data-preview="role"][data-v="buyer"]').first().click();
   await frame.locator('.figma-product-card').first().waitFor();
   const geometry=await frame.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,navBox:document.querySelector('.tabs').getBoundingClientRect().toJSON(),nav:[...document.querySelectorAll('.tabs button')].map(e=>({key:e.dataset.v,x:e.getBoundingClientRect().x,w:e.getBoundingClientRect().width,display:getComputedStyle(e).display})),menu:document.getElementById('marketMenuToggle').getBoundingClientRect().toJSON(),theme:document.getElementById('themeToggle').getBoundingClientRect().toJSON()}));
   assert.ok(geometry.width<=width+1,`horizontal overflow at ${width}: ${geometry.width}`);
   assert.equal(geometry.nav.length,5);assert.ok(geometry.nav.every(b=>b.w>0&&b.display!=='none'));
   assert.deepEqual(geometry.nav.map(b=>b.key),['myMarket','stores','market','materials','chats']);
   assert.ok(Math.abs(geometry.nav[2].x+geometry.nav[2].w/2-(geometry.navBox.x+geometry.navBox.width/2))<2,'home must be physically centered in the five-item bar');
   assert.ok(geometry.menu.x>=geometry.theme.x+geometry.theme.width-1,'menu and theme must not overlap');
   await frame.locator('#marketMenuToggle').click();await frame.locator('#marketDrawer.open').waitFor();
   await frame.locator('.market-drawer-panel [data-v="settings"]').click();assert.equal(await frame.locator('#marketMenuToggle').getAttribute('aria-expanded'),'false');
   await frame.locator('.tabs [data-v="market"]').click();await frame.locator('.figma-product-card').first().waitFor();
   await frame.locator('.figma-product-media').first().click();await frame.locator('#productDetailBody .product-detail').waitFor();
   assert.ok(await frame.locator('#productPrice').innerText());assert.ok(await frame.locator('.product-seller-card').count());
   await frame.locator('#sheet [data-a="back"],#sheet [data-a="close"]').first().click();
   await frame.locator('.tabs [data-v="stores"]').click();await frame.locator('.figma-store-card').first().waitFor();
   const storeId=await frame.locator('.figma-store-card').first().getAttribute('data-v');await frame.locator('.figma-store-card').first().click();
   await frame.locator('.boutique-store-hero').waitFor();assert.ok(new URL(frame.url()).searchParams.get('store')===storeId);
   await frame.locator('[data-s="leaveStore"]').first().click();await frame.locator('.tabs [data-v="myMarket"]').click();
   await frame.locator('.buyer-cart-heading').waitFor();
   await frame.locator('.tabs [data-v="market"]').click();
   await frame.locator('#themeToggle').click();
   await frame.locator('.figma-product-card').first().waitFor();
   await frame.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().endTime!==Infinity).map(a=>a.finished.catch(()=>{}))));
   assert.equal(await frame.locator('.tabs [data-v="market"]').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(16, 31, 72)');
   if(process.env.SOUQ_CAPTURE){fs.mkdirSync(process.env.SOUQ_CAPTURE,{recursive:true});await page.screenshot({path:path.join(process.env.SOUQ_CAPTURE,`figma-home-${width}.png`)});}
   assert.deepEqual(errors,[]);console.log(`PASS public ${width}px: navigation, drawer, product, store, cart, theme`);
   // Real role gates/data still own the seller/driver views.
   for(const role of ['seller','driver']){
    await frame.locator(`[data-preview="role"][data-v="${role}"]`).first().click();
    await frame.locator(role==='seller'?'.sw-shell':'.dw-shell').first().waitFor();
    assert.equal(await frame.locator('.app>.tabs').isVisible(),false);
    const w=await frame.evaluate(()=>document.documentElement.scrollWidth);assert.ok(w<=width+1,`${role} overflow at ${width}: ${w}`);
   }
   await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
