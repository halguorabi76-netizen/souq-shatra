/* Exercise the production startup with local auth/data adapters and delayed responses. */
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const seeds=fs.readFileSync(path.join(root,'category-seeds.js'),'utf8').replace(/export /g,'');
const adapter=fs.readFileSync(path.join(root,'preview-lab.js'),'utf8').replace(/^import .*;$/gm,'').replace(/export /g,'');
(async()=>{const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROME,args:['--no-sandbox']});try{
 for(const scenario of ['saved-seller','saved-buyer-mode','oauth-first-login','guest']){
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(s=>{window.__scenario=s;window.__buyerFlashes=[];if(s.startsWith('saved')){localStorage.setItem('sb-nbktyynshqldyerqtjrd-auth-token',JSON.stringify({user:{id:'a1000000-0000-4000-8000-000000000002'}}));localStorage.setItem('souq-shatra-mode-a1000000-0000-4000-8000-000000000002',s==='saved-seller'?'seller':'buyer');}
   setInterval(()=>{if(window.__scenario==='guest')return;for(const selector of ['.buyer-preflight','#view .market-materials','.app>.top','.app>.tabs']){const el=document.querySelector(selector);if(el&&el.getBoundingClientRect().width&&el.getBoundingClientRect().height&&getComputedStyle(el).visibility!=='hidden')window.__buyerFlashes.push(selector);}},10);
  },scenario);
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!=='https://souq.test')return route.abort();if(u.pathname.endsWith('/vendor/supabase/supabase-2.57.0.js'))return route.fulfill({contentType:'application/javascript',body:`(()=>{${seeds}\n${adapter}\nwindow.supabase={createClient(){const model=createPreviewModel(localStorage);model.setRole(window.__scenario==='guest'?null:'seller');const roleGate=new Promise(r=>window.__releaseRole=r),dataGate=new Promise(r=>window.__releaseData=r);const auth={...model.auth,getSession:async()=>{await new Promise(r=>window.__releaseSession=r);return model.auth.getSession()}};const from=table=>{const q=model.from(table);return new Proxy(q,{get(target,key){if(key==='then')return async(resolve,reject)=>{if(['profiles','stores'].includes(table))await roleGate;if(table==='products')await dataGate;return target.then(resolve,reject)};if(typeof target[key]==='function')return (...args)=>{target[key](...args);return new Proxy(target,this)};return target[key]}})};return {auth,from,rpc:model.rpc,storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}})})}}}}})();`});let file=path.join(root,u.pathname);if(file.endsWith('/'))file+='index.html';if(!fs.existsSync(file))return route.abort();const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};return route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/octet-stream'});});
  await page.goto('https://souq.test/'+(scenario==='oauth-first-login'?'?code=local-test':''),{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof window.__releaseSession==='function');
  if(scenario==='guest')assert.equal(await page.locator('#view .market-materials').count(),1);else assert.equal(await page.locator('.app>.tabs').isVisible(),false);
  await page.evaluate(()=>window.__releaseSession());await page.waitForTimeout(150);
  if(scenario!=='guest')assert.equal(await page.locator('#view .market-materials').isVisible().catch(()=>false),false);
  await page.evaluate(()=>window.__releaseRole());await page.waitForTimeout(150);await page.evaluate(()=>window.__releaseData());
  if(scenario!=='guest'){await page.locator('[data-s="openMenu"]').waitFor();assert.deepEqual(await page.evaluate(()=>window.__buyerFlashes),[]);}else await page.locator('.mp-product-open').first().waitFor();
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: no customer paint during delayed seller/session restoration, stale buyer mode or first OAuth login; guests browse immediately. No production calls.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
