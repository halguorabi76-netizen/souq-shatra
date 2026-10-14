// Copies the static site into www/ for the Capacitor Android/iOS projects. No bundling needed.
import { cp, rm, mkdir } from 'node:fs/promises';
await rm('www', { recursive: true, force: true });
await mkdir('www', { recursive: true });
for (const item of ['index.html', 'admin.html', 'manifest.webmanifest', 'sw.js', 'config.js', 'app', 'icons', 'vendor']) await cp(item, 'www/' + item, { recursive: true });
console.log('www/ ready');
