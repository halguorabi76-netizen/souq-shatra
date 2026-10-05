import { mkdir, copyFile, cp } from 'node:fs/promises';
await mkdir('www', { recursive: true });
for (const file of ['index.html', 'demo-lab.js', 'config.js', 'manifest.webmanifest', 'sw.js', 'seller-workspace.js', 'seller-records.js', 'seller-workspace.css', 'site-palette.css']) await copyFile(file, `www/${file}`);
// Include every referenced image, including temporary startup artwork.
await cp('icons', 'www/icons', { recursive: true });
