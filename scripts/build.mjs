import { mkdir, copyFile, cp, readFile, writeFile } from 'node:fs/promises';
const main=await readFile('index.html','utf8');
const appModule=main.match(/<script type="module">([\s\S]*?)<\/script>/);
if(!appModule)throw new Error('Missing application source module');
await writeFile('admin-app.js',appModule[1]);
const admin=main.replace('<html lang="ar" dir="rtl">','<html lang="ar" dir="rtl" data-portal="admin">')
 .replace('<title>سوق الشطرة</title>','<title>إدارة ومعاينة سوق الشطرة</title><meta name="robots" content="noindex,nofollow">')
 .replace(appModule[0],'<script type="module">import {bootAdminHub} from "./admin-hub.js?v=65";bootAdminHub();</script>');
await writeFile('admin.html',admin);
await writeFile('catalog.html',main.replace('<title>سوق الشطرة</title>','<title>أقسام وبحث سوق الشطرة</title>'));
// Reuse the exact production interfaces, but replace their client at build time.
// Preview never imports real configuration, Supabase, or live authentication.
const preview=main
 .replace('<head>','<head><script>if(window.top===window.self){const route=new URL("admin.html",location.href);route.search=location.search;route.searchParams.set("section","preview");route.hash=location.hash;location.replace(route.href)}else{document.documentElement.dataset.embeddedPreview="true"}</script>')
 .replace('<html lang="ar" dir="rtl">','<html lang="ar" dir="rtl" data-portal="preview">')
 .replace('<title>سوق الشطرة</title>','<title>مختبر معاينة واجهات سوق الشطرة</title><meta name="robots" content="noindex,nofollow">')
 .replace('<link rel="stylesheet" href="operations.css?v=58">','<link rel="stylesheet" href="operations.css?v=58"><link rel="stylesheet" href="preview-lab.css?v=63">')
 .replace('<script src="demo-lab.js?v=51"></script>','')
 .replace('import {createClient} from "https://esm.sh/@supabase/supabase-js@2.57.0";','import {createPreviewClient} from "./preview-lab.js?v=65";')
 .replace('import {SUPABASE_URL,SUPABASE_ANON_KEY} from "./config.js";','')
 .replace('const db=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true},global:{fetch:apiFetch}});','const db=createPreviewClient();')
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
for (const file of ['index.html', 'admin.html', 'catalog.html', 'preview.html', 'preview-lab.js', 'preview-lab.css', 'admin-portal.css', 'admin-workspace.js', 'stable-viewport.css', 'admin-hub.js', 'admin-app.js', 'demo-lab.js', 'catalog-filter.js', 'marketplace.js', 'marketplace.css', 'activity-center.js', 'delivery-workspace.js', 'operations.css', 'config.js', 'product-variants.js', 'product-variants.css', 'category-seeds.js', 'manifest.webmanifest', 'sw.js', 'seller-workspace.js', 'seller-records.js', 'seller-workspace.css', 'site-palette.css']) await copyFile(file, `www/${file}`);
// Include every referenced image, including temporary startup artwork.
await cp('icons', 'www/icons', { recursive: true });


