import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('www/icons', { recursive: true });
for (const file of ['index.html', 'manifest.webmanifest', 'sw.js']) await copyFile(file, `www/${file}`);
for (const size of [192, 512]) await copyFile(`icons/icon-${size}.png`, `www/icons/icon-${size}.png`);
