// Shared Playwright setup: serves the repo, injects the in-memory Supabase mock, records errors.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const root = path.resolve(__dirname, '../..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function serve() {
  return new Promise((ok) => {
    const server = http.createServer((req, res) => {
      const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, () => ok(server));
  });
}
async function open({ width = 1280, height = 900, user, mobile = false } = {}) {
  const server = await serve();
  const base = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROME || undefined, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width, height }, locale: 'ar-IQ', isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
  await context.route(/fonts\.(googleapis|gstatic)\.com|openstreetmap|tile\./, (r) => r.abort());
  const mock = fs.readFileSync(path.join(root, 'tests/support/mock-supabase.js'), 'utf8');
  const fixtures = fs.readFileSync(path.join(root, 'tests/support/fixtures.js'), 'utf8');
  await context.addInitScript({ content: mock + '\n' + fixtures + (user ? `\nif (!sessionStorage.getItem('mock-user')) window.__SOUQ_TEST_CLIENT__.login(${JSON.stringify(user)});` : '') });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && !/favicon|ERR_FAILED|net::/.test(m.text()) && errors.push('console: ' + m.text()));
  page.on('dialog', (d) => d.dismiss());
  const close = async () => {
    await browser.close();
    server.close();
  };
  return { page, base, errors, close, context };
}
const shotDir = process.env.SHOTS || path.join(root, 'artifacts');
async function shot(page, name) {
  fs.mkdirSync(shotDir, { recursive: true });
  await page.screenshot({ path: path.join(shotDir, name + '.png'), fullPage: true });
}
async function settle(page) {
  await page.waitForTimeout(150);
  await page.waitForFunction(() => !document.querySelector('.loading-block, .card-skeleton'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(100);
}
module.exports = { open, shot, settle, root };
