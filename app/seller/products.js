import { html, render, safeUrl } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { go, href, isCurrent } from '../core/router.js';
import { db, check } from '../core/db.js';
import { session } from '../core/session.js';
import { getCategories, invalidate, variantPrice } from '../core/api.js';
import { wsTitle } from '../core/workspace.js';
import { emptyState, toast, busy, confirmDialog, prepareImage, badge } from '../core/ui.js';
import { money, normalizeArabic } from '../core/format.js';
import { createProductEditor } from '../lib/product-editor.js';
import { loadProducts, loadFinance, sellerActions, sellerShell } from './seller.js';

const UNITS = ['قطعة', 'زوج', 'كيلوغرام', 'غرام', 'لتر', 'متر', 'علبة', 'كرتونة'];
const uuid = () => crypto.randomUUID();
async function upload(fileOrBlob) {
  const blob = fileOrBlob instanceof Blob && fileOrBlob.type === 'image/jpeg' && fileOrBlob.size < 600000 ? fileOrBlob : await prepareImage(fileOrBlob);
  const path = `${session.store.id}/${uuid()}.jpg`;
  check(await db.storage.from('products').upload(path, blob, { contentType: 'image/jpeg' }));
  return path;
}

export async function productsView(ctx, body) {
  if (ctx.params.id) return editorView(ctx, body);
  wsTitle('المنتجات', html`<a class="btn btn-primary btn-sm" href="#/seller/products/new">${icon('plus', 16)} منتج جديد</a>`);
  const [products, finance] = await Promise.all([loadProducts(true), loadFinance()]);
  if (!isCurrent(ctx.token)) return;
  sellerShell();
  const q = ctx.query.get('q') || '',
    f = ctx.query.get('f') || 'all';
  const filters = { all: 'الكل', live: 'منشور', hidden: 'مؤرشف', low: 'مخزون منخفض', out: 'نفد', blocked: 'محظور' };
  const test = { all: () => true, live: (p) => p.active && !p.blocked, hidden: (p) => !p.active, low: (p) => p.total_stock > 0 && p.total_stock <= (p.low_stock_threshold ?? 5), out: (p) => p.total_stock <= 0, blocked: (p) => p.blocked };
  const list = products.filter(test[f] || test.all).filter((p) => !q || normalizeArabic(p.name + ' ' + (p.sku || '')).includes(normalizeArabic(q)));
  const limit = finance?.plan?.max_products;
  render(
    body,
    html`${limit ? html`<div class="notice">${icon('info', 18)}<p>باقة ${finance.plan.name}: ${finance.product_count} من ${limit} منتج منشور. <a href="#/seller/plans">رقِّ باقتك</a> لإضافة المزيد.</p></div>` : ''}
    <div class="toolbar"><form data-q style="display:flex;gap:8px" class="grow"><input class="input" name="q" type="search" placeholder="ابحث بالاسم أو SKU" value="${q}"><button class="btn btn-outline">${icon('search', 18)}</button></form></div>
    <div class="tabs">${Object.entries(filters).map(([k, l]) => html`<a class="tab ${f === k ? 'active' : ''}" href="${href('/seller/products', { q, f: k })}">${l} (${products.filter(test[k]).length})</a>`)}</div>
    ${list.length
      ? html`<div class="table-wrap"><table class="table"><thead><tr><th>المنتج</th><th>السعر</th><th>المخزون</th><th>الحالة</th><th></th></tr></thead><tbody>
        ${list.map((p) => html`<tr><td><div class="cell-flex"><span class="thumb">${p.img ? html`<img class="thumb" src="${safeUrl(p.img)}" alt="">` : icon('image', 18)}</span><div><a href="#/seller/products/${p.id}"><b>${p.name}</b></a><div class="muted small">${p.category || ''}${p.has_variants ? ` · ${p.variants.filter((v) => !v.archived).length} نسخة` : ''}</div></div></div></td>
          <td>${money(p.display_price)}${p.display_compare > p.display_price ? html`<div class="muted small"><del>${money(p.display_compare)}</del></div>` : ''}</td>
          <td>${p.total_stock <= 0 ? badge('نفد', 'bad') : p.total_stock <= (p.low_stock_threshold ?? 5) ? badge(p.total_stock, 'warn') : p.total_stock}</td>
          <td>${p.blocked ? badge('محظور من الإدارة', 'bad') : p.active ? badge('منشور', 'ok') : badge('مؤرشف')}</td>
          <td style="white-space:nowrap"><a class="icon-btn" href="#/seller/products/${p.id}" aria-label="تعديل">${icon('edit', 18)}</a><button class="icon-btn" data-action="toggle" data-id="${p.id}" aria-label="${p.active ? 'أرشفة' : 'نشر'}" title="${p.active ? 'أرشفة' : 'نشر'}">${icon(p.active ? 'eyeOff' : 'eye', 18)}</button><button class="icon-btn" data-action="del" data-id="${p.id}" aria-label="حذف">${icon('trash', 18)}</button></td></tr>`)}
      </tbody></table></div>`
      : emptyState('box', products.length ? 'لا توجد منتجات مطابقة' : 'أضف أول منتج لمتجرك', 'منتج بصورة واضحة وسعر صحيح يبيع أسرع.', html`<a class="btn btn-primary" href="#/seller/products/new">${icon('plus', 18)} منتج جديد</a>`)}`,
  );
  body.querySelector('[data-q]').addEventListener('submit', (e) => {
    e.preventDefault();
    go('/seller/products', { q: e.target.q.value.trim(), f });
  });
  sellerActions({
    toggle: (b) =>
      busy(b, async () => {
        const p = products.find((x) => x.id === b.dataset.id);
        check(await db.from('products').update({ active: !p.active }).eq('id', p.id).eq('store_id', session.store.id).select('id').single());
        invalidate();
        toast(p.active ? 'أُرشف المنتج' : 'نُشر المنتج', 'success');
        productsView(ctx, body);
      }),
    del: async (b) => {
      if (!(await confirmDialog('حذف المنتج', 'سيُحذف المنتج من متجرك. الطلبات السابقة تبقى محفوظة.', { ok: 'حذف', danger: true }))) return;
      busy(b, async () => {
        check(await db.rpc('delete_product_safely', { p_product: b.dataset.id }));
        invalidate();
        toast('حُذف المنتج', 'success');
        productsView(ctx, body);
      });
    },
  });
}

async function editorView(ctx, body) {
  const isNew = ctx.params.id === 'new';
  const [products, categories] = await Promise.all([loadProducts(), getCategories()]);
  if (!isCurrent(ctx.token)) return;
  const original = isNew ? null : products.find((p) => p.id === ctx.params.id);
  if (!isNew && !original) return render(body, emptyState('box', 'المنتج غير موجود', '', html`<a class="btn btn-primary" href="#/seller/products">المنتجات</a>`));
  wsTitle(isNew ? 'منتج جديد' : 'تعديل المنتج', html`<a class="btn btn-ghost btn-sm" href="#/seller/products">${icon('arrowR', 16)} المنتجات</a>`);
  // Simple products keep price on the product; variant products show the base variant's price.
  const baseVariant = original?.variants.find((v) => v.id === original.attributes?._base_variant_id) || original?.variants.find((v) => !v.archived);
  const p = original && baseVariant && !(original.attributes?._variant_inherit || []).includes(baseVariant.id) ? { ...original, price: variantPrice(baseVariant), compare_at_price: baseVariant.sale_price ? baseVariant.price : null } : original;
  const sell = p?.attributes?._selling || {};
  const unit = sell.unit || p?.attributes?.sale_unit || 'قطعة';
  const state = { imageFile: null, preview: p?.img || '' };
  render(
    body,
    html`<form id="productForm" novalidate style="max-width:860px">
      <section class="card"><h2>الصورة</h2><div class="image-drop"><div class="preview" id="imgPreview">${state.preview ? html`<img src="${safeUrl(state.preview)}" alt="">` : icon('camera', 36)}</div><div><label class="btn btn-outline" for="pimg">${icon('upload', 18)} ${state.preview ? 'تغيير الصورة' : 'رفع صورة'}</label><input id="pimg" type="file" accept="image/*" hidden><p class="muted small" style="margin-top:8px">صورة مربعة بخلفية فاتحة تبيع أفضل. تُضغط الصورة تلقائيًا.</p></div></div></section>
      <section class="card"><h2>المعلومات الأساسية</h2>
        <label class="field"><span>اسم المنتج *</span><input id="fn" required minlength="2" maxlength="150" value="${p?.name || ''}"></label>
        <label class="field"><span>الوصف</span><textarea id="fd" rows="4" maxlength="5000">${p?.description || ''}</textarea></label>
        <div class="grid-2"><label class="field"><span>سعر البيع (د.ع) *</span><input id="fpr" type="number" min="1" step="1" inputmode="numeric" required value="${p?.price ?? ''}"></label>
        <label class="field"><span>وحدة البيع</span><select id="funit">${UNITS.map((u) => html`<option ${u === unit ? 'selected' : ''}>${u}</option>`)}${!UNITS.includes(unit) ? html`<option selected>${unit}</option>` : ''}</select></label></div>
        <label class="check"><input id="baseDiscount" type="checkbox" ${p?.compare_at_price ? 'checked' : ''}> يوجد تخفيض على هذا المنتج</label>
        <div id="discountBox" ${p?.compare_at_price ? '' : 'hidden'}><label class="field"><span>السعر قبل التخفيض (د.ع)</span><input id="fcompare" type="number" min="1" step="1" value="${p?.compare_at_price ?? ''}"></label></div>
        <div class="grid-2"><label class="field"><span>الحالة</span><select id="productCondition"><option value="new" ${sell.condition !== 'used' ? 'selected' : ''}>جديد</option><option value="used" ${sell.condition === 'used' ? 'selected' : ''}>مستعمل</option></select></label>
        <label class="field"><span>طريقة البيع</span><select id="productSale">${[['retail', 'مفرد'], ['wholesale', 'جملة'], ['both', 'مفرد وجملة']].map(([v, l]) => html`<option value="${v}" ${(sell.sale_mode || 'retail') === v ? 'selected' : ''}>${l}</option>`)}</select></label></div>
      </section>
      <section class="card legacy-host" id="variantEditor"></section>
      <section class="card"><h2>المخزون</h2><label class="field"><span>الكمية المتوفرة *</span><input id="fs" type="number" min="0" step="1" inputmode="numeric" value="${p?.stock ?? 0}"><small>عند تفعيل النسخ تُحسب الكمية من مجموع النسخ.</small></label>
        <label class="field"><span>تنبيه عند انخفاض المخزون إلى</span><input id="fthreshold" type="number" min="0" step="1" value="${p?.low_stock_threshold ?? 5}"></label></section>
      <section class="card"><details><summary><b>خيارات متقدمة</b></summary><div style="margin-top:12px">
        <div id="productSpecs" class="legacy-host"></div>
        <label class="field"><span>مجموعة المنتج داخل متجرك</span><input id="fcCustom" maxlength="80" value="${p?.store_category || ''}" placeholder="مثال: عروض الأسبوع"></label>
        <div class="grid-2"><label class="field"><span>رمز المنتج</span><input id="fstoreCode" maxlength="80" value="${sell.store_code || ''}"></label><label class="field"><span>SKU</span><input id="fsku" maxlength="80" class="ltr" value="${p?.sku || ''}"></label></div>
        <label class="field"><span>الباركود</span><input id="fbarcode" maxlength="80" class="ltr" value="${sell.barcode || ''}"></label>
      </div></details></section>
      <section class="card"><label class="check"><input id="factive" type="checkbox" ${p?.active !== false ? 'checked' : ''}> منشور ويظهر للزبائن</label></section>
      <div class="row-actions" style="position:sticky;bottom:0;background:var(--bg);padding:12px 0"><button class="btn btn-primary btn-lg" type="submit">${icon('check', 18)} ${isNew ? 'نشر المنتج' : 'حفظ التعديلات'}</button><a class="btn btn-ghost btn-lg" href="#/seller/products">إلغاء</a></div>
    </form>`,
  );
  const $ = (id) => body.querySelector('#' + id);
  const val = (id) => ($(id)?.value || '').trim();
  const editor = createProductEditor({
    categories: () => categories,
    toast: (m) => toast(m, 'error'),
    base: () => ({ price: Number(val('fpr')) || 0, compare_at_price: $('baseDiscount').checked ? Number(val('fcompare')) : null }),
    upload,
  });
  editor.mount($('variantEditor'), p ? { ...p, cat: p.category, desc: p.description } : null);
  $('baseDiscount').addEventListener('change', (e) => ($('discountBox').hidden = !e.target.checked));
  $('pimg').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      state.imageFile = await prepareImage(file);
      state.preview = URL.createObjectURL(state.imageFile);
      render($('imgPreview'), html`<img src="${state.preview}" alt="">`);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  $('productForm').addEventListener('submit', (e) => {
    e.preventDefault();
    busy(e.submitter || body.querySelector('[type=submit]'), async () => {
      const bundle = await editor.collect();
      const name = val('fn'),
        price = Number(val('fpr')),
        threshold = Number(val('fthreshold') || 0);
      const stock = editor.hasVariants() ? bundle.variants.filter((v) => !v.archived && v.available).reduce((n, v) => n + v.stock, 0) : Number(val('fs'));
      if (name.length < 2) throw new Error('اكتب اسم المنتج');
      if (!Number.isSafeInteger(price) || price < 1) throw new Error('اكتب سعرًا صحيحًا بالدينار');
      if (!Number.isSafeInteger(stock) || stock < 0) throw new Error('اكتب كمية صحيحة');
      const compare = $('baseDiscount').checked ? Number(val('fcompare')) : null;
      if (compare !== null && (!Number.isSafeInteger(compare) || compare <= price)) throw new Error('السعر قبل التخفيض يجب أن يكون أكبر من سعر البيع');
      let image_path = original?.image_path || null;
      if (state.imageFile) image_path = await upload(state.imageFile);
      const attributes = bundle.attributes;
      const u = val('funit');
      attributes.sale_unit = u;
      attributes._selling = { ...attributes._selling, condition: val('productCondition'), sale_mode: val('productCondition') === 'used' ? null : val('productSale'), unit: u, store_code: val('fstoreCode'), barcode: val('fbarcode') };
      const product = {
        name, price, compare_at_price: compare, stock, category: bundle.category, description: val('fd'), store_category: val('fcCustom'), store_id: session.store.id,
        sku: val('fsku').slice(0, 80), variant: original?.variant || '', low_stock_threshold: threshold, active: $('factive').checked,
        image_path, catalog_category_id: bundle.catalog_category_id, attributes, expected_stock: bundle.expected_stock,
      };
      check(await db.rpc('save_product_bundle', { p_id: original?.id || null, p_store: session.store.id, p_product: product, p_variants: bundle.variants }));
      invalidate();
      await loadProducts(true);
      toast(isNew ? 'نُشر المنتج' : 'حُفظت التعديلات', 'success');
      go('/seller/products');
    }, 'جارٍ الحفظ…');
  });
  sellerActions({});
}
