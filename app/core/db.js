import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../config.js';
// One Supabase client for the whole app. Tests inject window.__SOUQ_TEST_CLIENT__.
const TIMEOUT = 20000;
export const loading = { count: 0, listeners: new Set() };
function busy(delta) {
  loading.count = Math.max(0, loading.count + delta);
  loading.listeners.forEach((f) => f(loading.count));
}
async function timedFetch(resource, init = {}) {
  const ctrl = new AbortController();
  const source = init.signal;
  const abort = () => ctrl.abort();
  if (source) source.aborted ? abort() : source.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, TIMEOUT);
  busy(1);
  try {
    return await fetch(resource, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
    busy(-1);
  }
}
export const db =
  window.__SOUQ_TEST_CLIENT__ ||
  window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { fetch: timedFetch },
  });
export const FUNCTIONS_URL = SUPABASE_URL + '/functions/v1';
export function check(result) {
  if (result?.error) throw result.error;
  return result?.data;
}
export function publicUrl(path, bucket = 'products') {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  return db.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
// Translate database/network errors to messages a shopper understands.
const KNOWN = [
  ['لا تكتب رقم هاتفك هنا', 'لا تكتب رقم هاتفك في العنوان أو الملاحظات؛ اكتبه في حقل الهاتف.'],
  ['product unavailable', 'المنتج أو الكمية المطلوبة غير متوفرة حاليًا.'],
  ['inventory changed', 'تغيّر المخزون أثناء التعديل. أعد فتح المنتج ثم احفظ.'],
  ['invalid quantity', 'اختر كمية من ١ إلى ١٠٠.'],
  ['customer blocked by store', 'لا يمكن لهذا الحساب الطلب من هذا المتجر.'],
  ['delivery fee changed', 'تغيّرت أجرة التوصيل. راجع المبلغ الجديد ثم أكّد.'],
  ['store temporarily unavailable', 'أحد المتاجر في سلتك متوقف مؤقتًا عن استقبال الطلبات.'],
  ['plan product limit reached', 'وصلت إلى حد المنتجات في باقتك. رقِّ باقتك لإضافة المزيد.'],
  ['approved store required', 'هذه الخدمة للمتاجر المعتمدة فقط.'],
  ['admin required', 'هذه العملية تحتاج صلاحية الإدارة.'],
  ['not permitted', 'لا تملك صلاحية تنفيذ هذه العملية.'],
  ['invalid transition', 'لا يمكن تغيير حالة الطلب الآن؛ حدّث الصفحة.'],
  ['order no longer available', 'أخذ سائق آخر هذا الطلب.'],
  ['driver unavailable or debt limit reached', 'بلغت حد المستحقات. سدّد المبلغ لاستقبال طلبات جديدة.'],
  ['amount does not match', 'المبلغ لا يطابق قيمة الطلب.'],
  ['payment method disabled', 'طريقة الدفع هذه غير مفعلة حاليًا.'],
  ['nothing to pay', 'لا يوجد مبلغ للدفع.'],
  ['username:', 'اسم المستخدم من ٣ إلى ٣٠ حرفًا إنجليزيًا أو رقمًا، يبدأ بحرف.'],
  ['Invalid login credentials', 'البريد أو كلمة المرور غير صحيحة.'],
  ['invalid_credentials', 'اسم المستخدم أو كلمة المرور غير صحيحة.'],
  ['Email not confirmed', 'أكّد بريدك الإلكتروني من الرسالة التي وصلتك ثم سجّل الدخول.'],
  ['User already registered', 'هذا البريد مسجّل مسبقًا. سجّل الدخول أو استعد كلمة المرور.'],
  ['rate limit', 'محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.'],
  ['Failed to fetch', 'تعذّر الاتصال. تحقق من الإنترنت وأعد المحاولة.'],
  ['AbortError', 'انتهت مهلة الاتصال. أعد المحاولة.'],
];
export function friendlyError(e) {
  const text = [e?.message, e?.code, e?.name, e?.details].filter(Boolean).join(' ');
  if (e?.code === '23505') return 'هذه القيمة مستخدمة مسبقًا.';
  for (const [needle, msg] of KNOWN) if (text.includes(needle)) return msg;
  return e?.message && /[؀-ۿ]/.test(e.message) ? e.message : 'تعذّر إكمال العملية. أعد المحاولة.';
}
