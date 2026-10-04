import { mkdir, copyFile, cp } from 'node:fs/promises';
await mkdir('www', { recursive: true });
for (const file of ['index.html', 'demo-lab.js', 'config.js', 'manifest.webmanifest', 'sw.js']) await copyFile(file, `www/${file}`);
// Include every referenced image, including temporary startup artwork.
await cp('icons', 'www/icons', { recursive: true });
