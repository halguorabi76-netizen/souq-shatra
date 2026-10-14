// Hash router: works on static hosting (GitHub Pages) and inside Capacitor.
const routes = [];
const scrolls = new Map();
let token = 0;
let notFound = () => {};
let before = () => true;
export const current = { path: '/', params: {}, query: new URLSearchParams(), token: 0 };

export function route(pattern, handler, meta = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => (keys.push(k), '/([^/]+)')) + '/?$');
  routes.push({ re, keys, handler, meta, pattern });
}
export const setNotFound = (fn) => (notFound = fn);
export const setGuard = (fn) => (before = fn);
export function parse(hash = location.hash) {
  const h = hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = h.split('?');
  return { path: path.startsWith('/') ? path : '/' + path, query: new URLSearchParams(qs) };
}
export function href(path, query) {
  const qs = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)).toString() : '';
  return '#' + path + (qs ? '?' + qs : '');
}
let pushing = false;
export function go(path, query, { replace = false } = {}) {
  const target = href(path, query);
  pushing = true;
  if (target === location.hash) {
    pushing = false;
    return resolve();
  }
  if (replace) {
    pushing = false;
    history.replaceState(null, '', target);
    return resolve();
  }
  location.hash = target;
}
export const back = (fallback = '/') => (history.length > 1 ? history.back() : go(fallback));
export const isCurrent = (t) => t === token;

async function resolve(fromPop = false) {
  const prevKey = current.path + '?' + current.query;
  scrolls.set(prevKey, scrollY);
  const { path, query } = parse();
  const my = ++token;
  for (const r of routes) {
    const m = path.match(r.re);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    Object.assign(current, { path, params, query, token: my, meta: r.meta, pattern: r.pattern });
    if ((await before(current)) === false || my !== token) return;
    await r.handler(current);
    if (my !== token) return;
    const key = path + '?' + query;
    requestAnimationFrame(() => scrollTo(0, fromPop ? scrolls.get(key) || 0 : 0));
    document.dispatchEvent(new CustomEvent('routechange', { detail: current }));
    return;
  }
  Object.assign(current, { path, params: {}, query, token: my, meta: {}, pattern: '' });
  notFound(current);
}
export function start() {
  // Link clicks and go() are forward navigations; anything else (back/forward) restores scroll.
  document.addEventListener('click', (e) => {
    if (e.target.closest?.('a[href^="#/"]')) pushing = true;
  }, true);
  addEventListener('hashchange', () => {
    const fromPop = !pushing;
    pushing = false;
    resolve(fromPop);
  });
  return resolve();
}
export const refresh = () => resolve(true);
