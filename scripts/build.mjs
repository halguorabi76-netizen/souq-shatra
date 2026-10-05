import { mkdir, copyFile, cp, readFile, writeFile } from 'node:fs/promises';
const main=await readFile('index.html','utf8');
await writeFile('admin.html',main.replace('<html lang="ar" dir="rtl">','<html lang="ar" dir="rtl" data-portal="admin">').replace('<title>سوق الشطرة</title>','<title>لوحة إدارة سوق الشطرة</title><meta name="robots" content="noindex,nofollow">'));
await writeFile('catalog.html',main.replace('<title>سوق الشطرة</title>','<title>أقسام وبحث سوق الشطرة</title>'));
await mkdir('www', { recursive: true });
for (const file of ['index.html', 'admin.html', 'catalog.html', 'admin-portal.css', 'demo-lab.js', 'catalog-filter.js', 'marketplace.js', 'marketplace.css', 'activity-center.js', 'delivery-workspace.js', 'operations.css', 'config.js', 'manifest.webmanifest', 'sw.js', 'seller-workspace.js', 'seller-records.js', 'seller-workspace.css', 'site-palette.css']) await copyFile(file, `www/${file}`);
// Include every referenced image, including temporary startup artwork.
await cp('icons', 'www/icons', { recursive: true });
