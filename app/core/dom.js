// Safe HTML templating: every interpolated value is escaped unless wrapped in raw().
// Arrays are joined, null/undefined/false render nothing.
const RAW = Symbol('raw');
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"'`]/g, (c) => ESC[c]);
export function raw(value) {
  return { [RAW]: true, value: String(value ?? '') };
}
function part(v) {
  if (v == null || v === false || v === true) return '';
  if (Array.isArray(v)) return v.map(part).join('');
  if (typeof v === 'object' && v[RAW]) return v.value;
  return esc(v);
}
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return raw(out);
}
export const toString = (t) => (t && t[RAW] ? t.value : part(t));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export function render(target, template) {
  const el = typeof target === 'string' ? $(target) : target;
  if (el) el.innerHTML = toString(template);
  return el;
}
// Only http(s) and same-origin relative URLs are allowed in href/src built from data.
export function safeUrl(u) {
  const s = String(u ?? '').trim();
  if (!s) return '';
  if (/^(https?:)?\/\//i.test(s) || /^(\.\/|\/|#|[a-z0-9_-]+\.html)/i.test(s) || s.startsWith('data:image/') || s.startsWith('blob:')) return s;
  if (/^(tel|mailto):/i.test(s)) return s;
  return '';
}
// Delegated actions: <button data-action="name" data-id="..."> → handlers.name(el, event)
export function delegate(root, handlers, events = ['click']) {
  for (const type of events) {
    root.addEventListener(type, (e) => {
      const el = e.target.closest?.(`[data-${type === 'click' ? 'action' : 'on' + type}]`);
      if (!el || !root.contains(el)) return;
      const name = el.dataset[type === 'click' ? 'action' : 'on' + type];
      const fn = handlers[name];
      if (!fn) return;
      if (type === 'click' && el.tagName === 'A' && !el.hasAttribute('data-follow')) e.preventDefault();
      fn(el, e);
    });
  }
}
export function formData(form) {
  const out = {};
  for (const [k, v] of new FormData(form)) out[k] = typeof v === 'string' ? v.trim() : v;
  return out;
}
export const debounce = (fn, ms = 250) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};
