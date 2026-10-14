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
   await frame.evaluate(()=>{document.querySelector('.banner-wrap').outerHTML=window.SouqFigmaUI.featuredBanner([{id:'d622e57b-ef25-4d91-a3fa-33a98a39659d',active:true,blocked:false,img:'icons/shatra-river.jpeg',name:'منتج اختبار',mid:'fixture',price:35000,stock:1}],{esc:String,fmt:String,mname:()=> 'متجر اختبار',fallback:['icons/shatra-river.jpeg','الشطرة']});});
   const hero=await frame.locator('.figma-product-hero').evaluate(e=>{const image=e.querySelector('img'),s=getComputedStyle(image),r=e.getBoundingClientRect(),i=image.getBoundingClientRect();return {fit:s.objectFit,bg:s.backgroundColor,width:r.width,imageWidth:i.width,height:r.height,imageHeight:i.height};});
   assert.equal(hero.fit,'cover');assert.equal(hero.bg,'rgba(0, 0, 0, 0)');assert.ok(Math.abs(hero.width-hero.imageWidth)<2&&Math.abs(hero.height-hero.imageHeight)<2,'product image fills entire hero');
   const geometry=await frame.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,navBox:document.querySelector('.tabs').getBoundingClientRect().toJSON(),nav:[...document.querySelectorAll('.tabs button')].map(e=>({key:e.dataset.v,x:e.getBoundingClientRect().x,w:e.getBoundingClientRect().width,display:getComputedStyle(e).display})),menu:document.getElementById('marketMenuToggle').getBoundingClientRect().toJSON(),theme:document.getElementById('themeToggle').getBoundingClientRect().toJSON()}));
   assert.ok(geometry.width<=width+1,`horizontal overflow at ${width}: ${geometry.width}`);
   assert.equal(geometry.nav.length,5);assert.ok(geometry.nav.every(b=>b.w>0&&b.display!=='none'));
   assert.deepEqual(geometry.nav.map(b=>b.key),['profilePage','materials',undefined,'stores','market']);
   assert.ok(Math.abs(geometry.nav[2].x+geometry.nav[2].w/2-(geometry.navBox.x+geometry.navBox.width/2))<2,'media placeholder must be physically centered in the five-item bar');
   assert.ok(geometry.menu.x>=geometry.theme.x+geometry.theme.width-1,'menu and theme must not overlap');
   const menuStyle=await frame.locator('#marketMenuToggle').evaluate(e=>({lines:[...e.children].filter(s=>getComputedStyle(s).display!=='none').map(s=>s.getBoundingClientRect().width),shadow:getComputedStyle(e).boxShadow}));
   assert.equal(menuStyle.lines.length,2);assert.ok(menuStyle.lines[0]>menuStyle.lines[1]);assert.equal(menuStyle.shadow,'none','monochrome header icons are flat');
   assert.equal(await frame.locator('.header-brand img').getAttribute('src'),'icons/figma-shatra-logo-transparent-v146.png');
   await frame.locator('#marketMenuToggle').click();await frame.locator('#marketDrawer.open').waitFor();
   await frame.locator('.market-drawer-panel [data-v="settings"]').click();assert.equal(await frame.locator('#marketMenuToggle').getAttribute('aria-expanded'),'false');
   await frame.locator('.tabs [data-v="market"]').click();await frame.locator('.figma-product-card').first().waitFor();
   await frame.locator('.figma-product-media').first().click();await frame.locator('#productDetailBody .product-detail').waitFor();
   assert.ok(await frame.locator('#productPrice').innerText());assert.ok(await frame.locator('.product-seller-card').count());
   await frame.locator('#sheet [data-a="back"],#sheet [data-a="close"]').first().click();
   await frame.locator('.tabs [data-v="stores"]').click();await frame.locator('.figma-store-card').first().waitFor();
   const storeId=await frame.locator('.figma-store-card').first().getAttribute('data-v');await frame.locator('.figma-store-card').first().click();
   await frame.locator('.boutique-store-hero').waitFor();assert.ok(new URL(frame.url()).searchParams.get('store')===storeId);
   await frame.locator('[data-s="leaveStore"]').first().click();await frame.locator('#buyerFloating').click();
   await frame.locator('#view .flow-heading').waitFor();
   await frame.locator('.tabs [data-v="market"]').click();
   await frame.locator('#themeToggle').click();
   await frame.locator('.figma-product-card').first().waitFor();
   await frame.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().endTime!==Infinity).map(a=>a.finished.catch(()=>{}))));
   assert.equal(await frame.locator('.tabs [data-v="market"]').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)','active tab has no box in the monochrome bar');
   const controls=await frame.evaluate(()=>[...document.querySelectorAll('.topline #marketMenuToggle,.topline #accountTrigger,.topline #themeToggle,.topline .ac-inline,.topline .header-cart')].map(e=>{const s=getComputedStyle(e);return [s.backgroundColor,s.borderRadius,s.boxShadow,e.getBoundingClientRect().width,e.getBoundingClientRect().y]}));
   assert.equal(controls.length,5);assert.ok(controls.every(c=>JSON.stringify(c)===JSON.stringify(controls[0])));assert.equal(controls[0][0],'rgba(0, 0, 0, 0)');
   await frame.locator('.figma-header-actions .header-cart').click();await frame.locator('#view .flow-heading').waitFor();
   await frame.locator('.tabs [data-v="market"]').click();
   if(process.env.SOUQ_CAPTURE){fs.mkdirSync(process.env.SOUQ_CAPTURE,{recursive:true});await page.screenshot({path:path.join(process.env.SOUQ_CAPTURE,`figma-home-${width}.png`)});}
   assert.deepEqual(errors,[]);console.log(`PASS public ${width}px: navigation, drawer, product, store, cart, theme`);
   assert.equal(await frame.locator('.tabs [data-v="profilePage"] .navicon svg').count(),1);
   await frame.locator('#accountTrigger').click();await frame.locator('.profile-page').waitFor();
   assert.ok(await frame.locator('.profile-detail').count());
   assert.ok(await frame.evaluate(()=>document.documentElement.scrollWidth)<=width+1,`profile overflow at ${width}`);
   assert.equal(await frame.locator('.profile-hero .portrait').evaluate(e=>getComputedStyle(e).color),await frame.evaluate(()=>document.documentElement.dataset.theme==='dark'?'rgb(245, 244, 241)':'rgb(29, 26, 21)'),'portrait uses the monochrome ink of the active theme');
   if(process.env.SOUQ_CAPTURE)await page.screenshot({path:path.join(process.env.SOUQ_CAPTURE,`figma-profile-${width}.png`)});
   // Real role gates/data still own the seller/driver views.
   for(const role of ['seller','driver']){
    await frame.locator(`[data-preview="role"][data-v="${role}"]`).first().click();
    await frame.locator(role==='seller'?'.sw-shell':'.dw-shell').first().waitFor();
    assert.equal(await frame.locator('.app>.tabs').isVisible(),false);
    const w=await frame.evaluate(()=>document.documentElement.scrollWidth);assert.ok(w<=width+1,`${role} overflow at ${width}: ${w}`);
    if(role==='seller'){
     await frame.locator('[data-s="openMenu"]').click();await frame.locator('#swDrawer').waitFor();
     await frame.waitForFunction(()=>document.querySelector('#swDrawer .sw-market-logo img')?.getAttribute('src')==='icons/figma-shatra-logo-transparent-v146.png');
     await frame.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().endTime!==Infinity).map(a=>a.finished.catch(()=>{}))));
     const bounds=await frame.locator('.sw-seller-drawer').boundingBox();assert.ok(bounds.x>=-1&&bounds.x+bounds.width<=width+1);
     await frame.locator('[data-s="menuStock"]').click();await frame.locator('.sw-product-tabs [data-v="stock"].selected').waitFor();
     assert.equal(await frame.locator('#swDrawer').count(),0);
     await frame.locator('.sw-drawer-leaving').waitFor({state:'detached'});
    }
    if(process.env.SOUQ_CAPTURE)await page.screenshot({path:path.join(process.env.SOUQ_CAPTURE,`figma-${role}-${width}.png`)});
   }
   await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
