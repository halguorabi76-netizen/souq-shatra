// Device-local state: cart, recently viewed, theme. Server data is never trusted from here;
// prices and stock are re-read before checkout and re-validated by the database.
const read = (k, d) => {
  try {
    const v = JSON.parse(localStorage.getItem(k) || 'null');
    return v ?? d;
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
};
const listeners = new Set();
export const onCart = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const CART = 'souq.v2.cart';
const valid = (l) => l && typeof l.pid === 'string' && Number.isInteger(l.q) && l.q > 0 && l.q <= 100;
export const cart = {
  lines: (read(CART, []) || []).filter(valid),
  key: (l) => l.pid + ':' + (l.vid || ''),
  count() {
    return this.lines.reduce((n, l) => n + l.q, 0);
  },
  save() {
    write(CART, this.lines);
    listeners.forEach((f) => f(this));
  },
  add(line) {
    const k = this.key(line);
    const found = this.lines.find((l) => this.key(l) === k);
    if (found) found.q = Math.min(100, found.q + line.q);
    else this.lines.push({ ...line });
    this.save();
  },
  set(k, q) {
    const l = this.lines.find((x) => this.key(x) === k);
    if (!l) return;
    if (q < 1) this.lines = this.lines.filter((x) => x !== l);
    else l.q = Math.min(100, q);
    this.save();
  },
  remove(k) {
    this.lines = this.lines.filter((x) => this.key(x) !== k);
    this.save();
  },
  clear() {
    this.lines = [];
    this.save();
  },
};
addEventListener('storage', (e) => {
  if (e.key === CART) {
    cart.lines = (read(CART, []) || []).filter(valid);
    listeners.forEach((f) => f(cart));
  }
});

const RECENT = 'souq.v2.recent';
export const recent = {
  list: () => read(RECENT, []).slice(0, 20),
  push(id) {
    write(RECENT, [id, ...read(RECENT, []).filter((x) => x !== id)].slice(0, 20));
  },
};

const THEME = 'souq.v2.theme';
export const theme = {
  get: () => read(THEME, 'auto'),
  apply(mode = theme.get()) {
    const dark = mode === 'dark' || (mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0b1020' : '#1d3aa6');
  },
  set(mode) {
    write(THEME, mode);
    theme.apply(mode);
  },
};
export const prefs = { get: read, set: write };
