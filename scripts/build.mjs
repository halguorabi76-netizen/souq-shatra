import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('www/icons', { recursive: true });
for (const file of ['index.html', 'config.js', 'manifest.webmanifest', 'sw.js']) await copyFile(file, `www/${file}`);
for (const size of [192, 512]) await copyFile(`icons/icon-${size}.png`, `www/icons/icon-${size}.png`);
await copyFile('icons/brand.png', 'www/icons/brand.png');
for (const name of ['shatra-river', 'shatra-square', 'shatra-bridge']) await copyFile(`icons/${name}.jpeg`, `www/icons/${name}.jpeg`);
