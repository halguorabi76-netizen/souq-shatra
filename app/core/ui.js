import { html, render, toString, $, esc } from './dom.js';
import { icon } from './icons.js';
import { friendlyError } from './db.js';

export function toast(message, tone = 'info') {
  let host = $('#toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);
  }
  const el = document.createElement('div');
  el.className = 'toast toast-' + tone;
  el.innerHTML = toString(html`${icon(tone === 'error' ? 'alert' : tone === 'success' ? 'checkCircle' : 'info', 18)}<span>${message}</span>`);
  host.append(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3600);
}
export const toastError = (e) => {
  console.error(e);
  toast(friendlyError(e), 'error');
};

// Runs an async action with the button disabled and a spinner; reports errors.
export async function busy(button, fn, label) {
  if (button?.disabled) return;
  const original = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    if (label !== false) button.innerHTML = `<span class="spinner"></span>${label ? esc(label) : ''}`;
  }
  try {
    return await fn();
  } catch (e) {
    toastError(e);
  } finally {
    if (button?.isConnected) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.innerHTML = original;
    }
  }
}

let dialogStack = [];
// Modal dialog. body is a template; returns the <dialog> element. Closing resolves onClose.
export function modal(title, body, { size = 'md', onClose, className = '' } = {}) {
  const d = document.createElement('dialog');
  d.className = `modal modal-${size} ${className}`;
  d.setAttribute('aria-label', title);
  d.innerHTML = toString(html`<header class="modal-head"><h2>${title}</h2><button class="icon-btn" data-close aria-label="إغلاق">${icon('x')}</button></header><div class="modal-body">${body}</div>`);
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-close]')) d.close();
  });
  d.addEventListener('close', () => {
    dialogStack = dialogStack.filter((x) => x !== d);
    d.remove();
    onClose?.();
  });
  document.body.append(d);
  dialogStack.push(d);
  d.showModal();
  d.querySelector('input:not([type=hidden]),select,textarea')?.focus();
  return d;
}
export const closeModals = () => [...dialogStack].forEach((d) => d.close());
export function setModalBody(d, body) {
  render(d.querySelector('.modal-body'), body);
}

export function confirmDialog(title, message, { ok = 'تأكيد', cancel = 'تراجع', danger = false, input } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const d = modal(
      title,
      html`<p class="muted">${message}</p>${input ? html`<label class="field"><span>${input.label}</span><textarea name="reason" maxlength="${input.max || 500}" rows="3" placeholder="${input.placeholder || ''}"></textarea></label>` : ''}
        <div class="row-actions"><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${ok}</button><button class="btn btn-ghost" data-close>${cancel}</button></div>`,
      { size: 'sm', onClose: () => !done && resolve(false) },
    );
    d.querySelector('[data-ok]').addEventListener('click', () => {
      done = true;
      const value = input ? d.querySelector('textarea').value.trim() : true;
      d.close();
      resolve(input ? { value } : value);
    });
  });
}

export const skeletonCards = (n = 8) => html`<div class="product-grid">${Array.from({ length: n }, () => html`<div class="card-skeleton"><div class="sk sk-img"></div><div class="sk sk-line"></div><div class="sk sk-line short"></div></div>`)}</div>`;
export const emptyState = (ic, title, text, action) => html`<div class="empty">${icon(ic, 44)}<h3>${title}</h3>${text ? html`<p>${text}</p>` : ''}${action || ''}</div>`;
export const spinnerBlock = (text = 'جارٍ التحميل…') => html`<div class="loading-block" role="status"><span class="spinner"></span>${text}</div>`;
export const errorBlock = (e, retryAction = 'retry') => html`<div class="empty">${icon('alert', 40)}<h3>تعذّر التحميل</h3><p>${friendlyError(e)}</p><button class="btn btn-primary" data-action="${retryAction}">${icon('refresh', 18)} إعادة المحاولة</button></div>`;

export function badge(text, tone = 'neutral') {
  return html`<span class="badge badge-${tone}">${text}</span>`;
}
export function field(label, input, hint) {
  return html`<label class="field"><span>${label}</span>${input}${hint ? html`<small>${hint}</small>` : ''}</label>`;
}
// Downscale and JPEG-encode an image file in the browser before uploading.
export async function prepareImage(file, max = 1200, quality = 0.85) {
  if (!file?.type?.startsWith('image/')) throw new Error('اختر ملف صورة');
  if (file.size > 15 * 1024 * 1024) throw new Error('الصورة كبيرة جدًا؛ اختر صورة أقل من ١٥ ميغابايت');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((ok, fail) => {
      img.onload = ok;
      img.onerror = () => fail(new Error('تعذّر قراءة الصورة'));
      img.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('تعذّر تجهيز الصورة'))), 'image/jpeg', quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function copyText(text) {
  navigator.clipboard?.writeText(text).then(() => toast('تم النسخ', 'success'), () => toast('تعذّر النسخ', 'error'));
}
