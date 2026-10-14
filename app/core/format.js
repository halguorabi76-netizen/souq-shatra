const nf = new Intl.NumberFormat('en-US');
export const money = (n) => nf.format(Math.round(+n || 0)) + ' د.ع';
export const number = (n) => nf.format(+n || 0);
export const shortId = (id) => '#' + String(id || '').slice(-6).toUpperCase();
export const date = (t) => (t ? new Date(t).toLocaleDateString('ar-IQ', { dateStyle: 'medium' }) : '');
export const dateTime = (t) => (t ? new Date(t).toLocaleString('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' }) : '');
export function ago(t) {
  const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
  if (s < 60) return 'الآن';
  if (s < 3600) return `قبل ${Math.floor(s / 60)} دقيقة`;
  if (s < 86400) return `قبل ${Math.floor(s / 3600)} ساعة`;
  if (s < 86400 * 30) return `قبل ${Math.floor(s / 86400)} يوم`;
  return date(t);
}
// Arabic-Indic and Persian digits → ASCII, strip separators.
export const digits = (v) =>
  String(v ?? '').replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776));
export const phoneDigits = (v) => digits(v).replace(/[^\d]/g, '');
export const validIraqPhone = (v) => /^07\d{9}$/.test(phoneDigits(v)) || /^9647\d{9}$/.test(phoneDigits(v));
export const containsPhone = (v) => /\d{7,}/.test(digits(v).replace(/[\s()+.−-]/g, ''));
export const percentOff = (price, compare) => (compare > price && price > 0 ? Math.max(1, Math.round((1 - price / compare) * 100)) : 0);
export const plural = (n, one, few, many) => `${number(n)} ${n === 1 ? one : n >= 3 && n <= 10 ? few : many}`;
export const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
export const normalizeArabic = (s) =>
  digits(s)
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
