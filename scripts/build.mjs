import { mkdir, copyFile, cp, readFile, writeFile } from 'node:fs/promises';
const main=await readFile('index.html','utf8');
const appModule=main.match(/<script type="module">([\s\S]*?)<\/script>/);
if(!appModule)throw new Error('Missing application source module');
// Preserve the independent admin entry and its fast authorization gate.
const portalMain=main;
const adminTemplate=await readFile('admin.html','utf8');
const admin=adminTemplate.replace(/(product-variants\.(?:js|css)|seller-workspace\.js|delivery-workspace\.js)\?v=\d+/g,'$1?v=110');
await writeFile('admin.html',admin.replace(/admin-app\.js\?v=\d+/g,'admin-app.js?v=112'));
await writeFile('catalog.html',main.replace('<title>سوق الشطرة</title>','<title>أقسام وبحث سوق الشطرة</title>'));
// Reuse the exact production interfaces, but replace their client at build time.
// Preview never imports real configuration, Supabase, or live authentication.
const preview=portalMain
 .replace(/const accountSession=[^\n]*\n/,'const accountSession=null;\n')
 .replace(/const sellerResumeHint=[^\n]*\n/,'const sellerResumeHint=false;\n')
 .replace('<head>','<head><script>if(window.top===window.self){const route=new URL("admin.html",location.href);route.search=location.search;route.searchParams.set("section","preview");route.hash=location.hash;location.replace(route.href)}else{document.documentElement.dataset.embeddedPreview="true"}</script>')
 .replace('<title>سوق الشطرة</title>','<title>مختبر معاينة واجهات سوق الشطرة</title><meta name="robots" content="noindex,nofollow">')
 .replace(/<link rel="stylesheet" href="operations\.css\?v=\d+">/,'$&<link rel="stylesheet" href="preview-lab.css?v=63">')
 .replace('<script src="demo-lab.js?v=51"></script>','')
 .replace('<script src="vendor/supabase/supabase-2.57.0.js"></script>','').replace('const {createClient}=window.supabase;','import {createPreviewClient} from "./preview-lab.js?v=109";')
 .replace('import {SUPABASE_URL,SUPABASE_ANON_KEY} from "./config.js";','')
 .replace('const db=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,storage:accountSession?.storage},global:{fetch:apiFetch}});','const db=createPreviewClient();')
 .replace("const response=await apiFetch(SUPABASE_URL+'/auth/v1/settings',{headers:{apikey:SUPABASE_ANON_KEY}});","throw new Error('المعاينة تعمل بلا تسجيل دخول.');\n const response=null;")
 .replaceAll('souq-shatra-online','souq-preview-cart-v1')
 .replaceAll('souq-shatra-theme','souq-preview-theme-v1')
 .replaceAll('souq-shatra-mode-','souq-preview-mode-')
 .replaceAll('souq-shatra-pending-role','souq-preview-pending-role')
 .replaceAll("new URL('./',location.href)","new URL('preview.html',location.href)")
 .replace("cust:local.cust||{name:'',phone:'',addr:''}","cust:local.cust||{name:'معاينة زبون',phone:'00000000000',addr:'عنوان تجريبي'}")
 .replace('location.assign(url.href)','db.preview.navigate(url)');
if(preview.includes('SUPABASE_ANON_KEY')||preview.includes('import {createClient}'))throw new Error('Preview must not contain the production client');
await writeFile('preview.html',preview);
await mkdir('www', { recursive: true });
for (const file of ['interaction-motion.js', 'account-access.js', 'index.html', 'admin.html', 'catalog.html', 'preview.html', 'preview-lab.js', 'preview-lab.css', 'admin-portal.css', 'admin-workspace.js', 'stable-viewport.css', 'buyer-experience.css', 'admin-hub.js', 'admin-app.js', 'demo-lab.js', 'catalog-filter.js', 'marketplace.js', 'marketplace.css', 'activity-center.js', 'delivery-workspace.js', 'operations.css', 'config.js', 'product-variants.js', 'product-editor.js', 'product-options.js', 'product-variants.css', 'category-seeds.js', 'manifest.webmanifest', 'admin-manifest.webmanifest', 'sw.js', 'seller-workspace.js', 'seller-records.js', 'seller-workspace.css', 'site-palette.css', 'aurora-theme.css', 'app-loading.js', 'main-aurora.css', 'main-loading.js', 'page-navigation.js', 'location-picker.js']) await copyFile(file, `www/${file}`);
// Include every referenced image, including temporary startup artwork.
await cp('icons', 'www/icons', { recursive: true });

await cp('vendor', 'www/vendor', { recursive: true });

