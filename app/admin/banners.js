// «صور الواجهة»: the large images in the slider at the top of the shop's home page.
import { html, render, safeUrl } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { refresh, isCurrent } from '../core/router.js';
import { db, check, publicUrl } from '../core/db.js';
import { invalidate, liveBanner, getCategories } from '../core/api.js';
import { emptyState, toast, busy, confirmDialog, modal, badge, prepareImage } from '../core/ui.js';
import { dateTime } from '../core/format.js';
import { stores, actions, storeCategories } from './main.js';

const LINKS = [
  ['', 'بدون رابط'],
  ['store', 'متجر'],
  ['product', 'منتج'],
  ['pcat', 'قسم منتجات'],
  ['scat', 'قسم متاجر'],
  ['deals', 'صفحة العروض'],
  ['sell', 'صفحة «ابدأ البيع»'],
  ['custom', 'رابط آخر'],
];
// Turns a stored link back into the picker's type + value.
function parseLink(link = '') {
  if (!link) return ['', ''];
  if (link === '#/products?sort=deals') return ['deals', ''];
  if (link === '#/sell') return ['sell', ''];
  let m;
  if ((m = link.match(/^#\/s\/([\w-]+)$/))) return ['store', m[1]];
  if ((m = link.match(/^#\/p\/([\w-]+)$/))) return ['product', m[1]];
  if ((m = link.match(/^#\/products\?cat=(.+)$/))) return ['pcat', decodeURIComponent(m[1])];
  if ((m = link.match(/^#\/stores\?cat=([\w-]+)$/))) return ['scat', m[1]];
  return ['custom', link];
}
function buildLink(type, value) {
  return { '': '', deals: '#/products?sort=deals', sell: '#/sell', store: value && '#/s/' + value, product: value && '#/p/' + value, pcat: value && '#/products?cat=' + encodeURIComponent(value), scat: value && '#/stores?cat=' + value, custom: value.trim() }[type] || '';
}
const dateInput = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');

export async function bannersView(ctx, body) {
  const res = await db.from('home_banners').select('*').order('position').order('created_at');
  if (!isCurrent(ctx.token)) return;
  if (res.error) return render(body, html`<div class="notice notice-warn">${icon('alert', 18)}<p><b>صور الواجهة غير مفعّلة بعد.</b> يلزم تشغيل ترحيل <span class="ltr">20261014170000_home_banners_category_icons.sql</span>.</p></div>`);
  const list = res.data || [];
  render(
    body,
    html`<div class="toolbar"><button class="btn btn-primary" data-action="editBanner">${icon('plus', 18)} صورة جديدة</button></div>
    <div class="notice">${icon('info', 18)}<p><b>المقاس المقترح:</b> ١٦٠٠×٨٠٠ بكسل (العرض ضعف الارتفاع). ضع الكتابة والمنتج في وسط الصورة لأن الأطراف قد تُقص على بعض الشاشات. تظهر الصور بالترتيب، وتتبدل كل ٦ ثوانٍ.</p></div>
    ${list.length ? html`<div class="banner-admin">${list.map((b, i) => html`<article class="card banner-row">
        <img src="${safeUrl(publicUrl(b.image_path, 'banners'))}" alt="" loading="lazy">
        <div class="info"><b>${b.title || 'بدون عنوان'}</b>${b.subtitle ? html`<span class="muted small">${b.subtitle}</span>` : ''}
          <div class="chips">${liveBanner(b) ? badge('ظاهرة الآن', 'ok') : b.active === false ? badge('موقوفة') : badge('مجدولة', 'warn')}${b.link ? html`<span class="badge ltr">${b.link}</span>` : ''}</div>
          ${b.starts_at || b.ends_at ? html`<span class="muted small">${b.starts_at ? 'من ' + dateTime(b.starts_at) : ''} ${b.ends_at ? 'حتى ' + dateTime(b.ends_at) : ''}</span>` : ''}</div>
        <div class="tools">
          <button class="btn btn-sm btn-ghost" data-action="move" data-id="${b.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="تقديم">${icon('chevR', 16)}</button>
          <button class="btn btn-sm btn-ghost" data-action="move" data-id="${b.id}" data-dir="1" ${i === list.length - 1 ? 'disabled' : ''} aria-label="تأخير">${icon('chevL', 16)}</button>
          <button class="btn btn-sm btn-outline" data-action="toggleBanner" data-id="${b.id}">${b.active === false ? 'إظهار' : 'إيقاف'}</button>
          <button class="btn btn-sm btn-outline" data-action="editBanner" data-id="${b.id}">تعديل</button>
          <button class="btn btn-sm btn-ghost" data-action="delBanner" data-id="${b.id}" aria-label="حذف">${icon('trash', 16)}</button>
        </div></article>`)}</div>` : emptyState('image', 'لا توجد صور في الواجهة', 'يرى الزبائن الآن صور الشطرة الافتراضية. أضف صور منتجاتك وعروضك لتظهر أعلى التطبيق.')}`,
  );
  const done = (msg) => {
    invalidate('banners');
    toast(msg, 'success');
    refresh();
  };
  actions({
    move: (b) =>
      busy(b, async () => {
        const order = [...list];
        const i = order.findIndex((x) => x.id === b.dataset.id),
          j = i + Number(b.dataset.dir);
        [order[i], order[j]] = [order[j], order[i]];
        for (const [k, x] of order.entries()) if (x.position !== k) check(await db.from('home_banners').update({ position: k }).eq('id', x.id));
        done('حُفظ الترتيب');
      }),
    toggleBanner: (b) =>
      busy(b, async () => {
        const x = list.find((y) => y.id === b.dataset.id);
        check(await db.from('home_banners').update({ active: x.active === false }).eq('id', x.id));
        done(x.active === false ? 'ظهرت الصورة' : 'أُوقفت الصورة');
      }),
    delBanner: async (b) => {
      const x = list.find((y) => y.id === b.dataset.id);
      if (!(await confirmDialog('حذف الصورة', 'تُحذف الصورة من الواجهة نهائيًا.', { ok: 'حذف', danger: true }))) return;
      busy(b, async () => {
        check(await db.from('home_banners').delete().eq('id', x.id));
        await db.storage.from('banners').remove([x.image_path]);
        done('حُذفت الصورة');
      });
    },
    editBanner: (b) => editBanner(list.find((x) => x.id === b.dataset.id), list.length, done),
  });
}

async function editBanner(b, count, done) {
  const [st, scats, pcats, prods] = await Promise.all([stores(), storeCategories(), getCategories(), db.from('products').select('id,name').eq('active', true).eq('blocked', false).order('name').limit(500)]);
  const products = prods.data || [];
  let [type, value] = parseLink(b?.link);
  let file = null;
  const valueField = () => {
    const opts = { store: st.filter((s) => s.approved && !s.removed).map((s) => [s.id, s.name]), product: products.map((p) => [p.id, p.name]), pcat: pcats.filter((c) => !c.parent_id).map((c) => [c.name, c.name]), scat: scats.map((c) => [c.id, c.name]) }[type];
    if (opts) return html`<label class="field"><span>اختر</span><select name="value" required><option value="">—</option>${opts.map(([v, l]) => html`<option value="${v}" ${v === value ? 'selected' : ''}>${l}</option>`)}</select></label>`;
    if (type === 'custom') return html`<label class="field"><span>الرابط</span><input name="value" class="ltr" required value="${value}" placeholder="https://… أو #/…"></label>`;
    return '';
  };
  const m = modal(
    b ? 'تعديل صورة الواجهة' : 'صورة جديدة للواجهة',
    html`<form>
      <div class="banner-drop"><div class="preview" id="bnPrev">${b ? html`<img src="${safeUrl(publicUrl(b.image_path, 'banners'))}" alt="">` : html`${icon('image', 40)}<span>١٦٠٠×٨٠٠ بكسل</span>`}</div>
        <label class="btn btn-outline" for="bnFile">${icon('upload', 18)} ${b ? 'تغيير الصورة' : 'اختر صورة'}</label><input id="bnFile" type="file" accept="image/*" hidden></div>
      <label class="field"><span>عنوان على الصورة (اختياري)</span><input name="title" maxlength="80" value="${b?.title || ''}" placeholder="مثال: عروض نهاية الأسبوع"></label>
      <label class="field"><span>سطر وصف (اختياري)</span><input name="subtitle" maxlength="140" value="${b?.subtitle || ''}"></label>
      <div class="grid-2"><label class="field"><span>عند الضغط تفتح</span><select name="type">${LINKS.map(([v, l]) => html`<option value="${v}" ${v === type ? 'selected' : ''}>${l}</option>`)}</select></label><div data-value>${valueField()}</div></div>
      <label class="field"><span>نص الزر (اختياري)</span><input name="cta" maxlength="30" value="${b?.cta || ''}" placeholder="تسوّق الآن"></label>
      <div class="grid-2"><label class="field"><span>تبدأ في (اختياري)</span><input name="starts" type="date" value="${dateInput(b?.starts_at)}"></label><label class="field"><span>تنتهي في (اختياري)</span><input name="ends" type="date" value="${dateInput(b?.ends_at)}"></label></div>
      <label class="check"><input type="checkbox" name="active" ${b?.active === false ? '' : 'checked'}> ظاهرة للزبائن</label>
      <button class="btn btn-primary btn-block" style="margin-top:12px">حفظ</button></form>`,
    { size: 'lg' },
  );
  const form = m.querySelector('form');
  form.type.addEventListener('change', () => {
    type = form.type.value;
    value = '';
    render(form.querySelector('[data-value]'), valueField());
  });
  m.querySelector('#bnFile').addEventListener('change', async (e) => {
    try {
      file = await prepareImage(e.target.files[0], 1800, 0.86);
      render(m.querySelector('#bnPrev'), html`<img src="${URL.createObjectURL(file)}" alt="">`);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!b && !file) return toast('اختر صورة', 'error');
    const link = buildLink(form.type.value, form.value?.value || '');
    if (form.type.value === 'custom' && !/^(#\/|https:\/\/)/.test(link)) return toast('الرابط يبدأ بـ https:// أو #/', 'error');
    const starts = form.starts.value ? new Date(form.starts.value + 'T00:00:00').toISOString() : null;
    const ends = form.ends.value ? new Date(form.ends.value + 'T23:59:59').toISOString() : null;
    if (starts && ends && ends <= starts) return toast('تاريخ النهاية بعد البداية', 'error');
    busy(form.querySelector('button.btn-primary'), async () => {
      let image_path = b?.image_path;
      if (file) {
        image_path = `${crypto.randomUUID()}.jpg`;
        check(await db.storage.from('banners').upload(image_path, file, { contentType: 'image/jpeg' }));
      }
      const row = { image_path, title: form.title.value.trim(), subtitle: form.subtitle.value.trim(), cta: form.cta.value.trim(), link, starts_at: starts, ends_at: ends, active: form.active.checked };
      if (b) check(await db.from('home_banners').update(row).eq('id', b.id));
      else check(await db.from('home_banners').insert({ ...row, position: count }));
      if (b && file && b.image_path !== image_path) await db.storage.from('banners').remove([b.image_path]);
      m.close();
      done('حُفظت الصورة');
    });
  });
}
