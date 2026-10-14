import { html, render, safeUrl, formData } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { isCurrent } from '../core/router.js';
import { db, check, publicUrl } from '../core/db.js';
import { session, load as reloadSession } from '../core/session.js';
import { invalidate } from '../core/api.js';
import { wsTitle, resetWorkspace } from '../core/workspace.js';
import { toast, busy, prepareImage } from '../core/ui.js';
import { phoneDigits } from '../core/format.js';
import { pickLocation, validPoint, mapPreview } from '../core/map.js';
import { sellerActions, sellerShell } from './seller.js';

export async function storeView(ctx, body) {
  wsTitle('إعدادات المتجر');
  const s = session.store;
  const pickup = (await db.from('store_pickups').select('*').eq('store_id', s.id).maybeSingle()).data;
  if (!isCurrent(ctx.token)) return;
  sellerShell();
  let point = pickup?.latitude != null ? { lat: +pickup.latitude, lon: +pickup.longitude } : null;
  let image = null;
  const img = publicUrl(s.image_path);
  render(
    body,
    html`<div style="max-width:820px">
    <form class="card" data-identity><h2>${icon('store', 20)} هوية المتجر</h2>
      <div class="image-drop"><div class="preview" id="storeImg">${img ? html`<img src="${safeUrl(img)}" alt="">` : icon('camera', 32)}</div><div><label class="btn btn-outline" for="storeFile">${icon('upload', 18)} صورة / شعار المتجر</label><input id="storeFile" type="file" accept="image/*" hidden><p class="muted small">تظهر في صفحة متجرك وقائمة المتاجر.</p></div></div>
      <label class="field"><span>اسم المتجر *</span><input name="name" required maxlength="100" value="${s.name}"></label>
      <label class="field"><span>رابط مختصر (اسم مستخدم)</span><input name="username" class="ltr" maxlength="30" placeholder="my_store" value="${s.username || session.profile?.username || ''}"><small>أحرف إنجليزية وأرقام وشرطة سفلية. يُستخدم أيضًا لتسجيل الدخول.</small></label>
      <label class="field"><span>رقم التواصل *</span><input name="phone" required class="ltr" inputmode="tel" value="${s.phone || ''}"></label>
      <label class="field"><span>نبذة عن المتجر</span><textarea name="description" maxlength="1000" rows="3">${s.description || ''}</textarea></label>
      <button class="btn btn-primary">${icon('check', 18)} حفظ الهوية</button>
    </form>
    <form class="card" data-location><h2>${icon('pin', 20)} الموقع والتجهيز</h2>
      <label class="field"><span>نوع المتجر</span><select name="kind"><option value="physical" ${s.store_kind !== 'online' ? 'selected' : ''}>محل أو بسطية (العنوان يظهر للزبائن)</option><option value="online" ${s.store_kind === 'online' ? 'selected' : ''}>أبيع من البيت (العنوان للسائق فقط)</option></select></label>
      <label class="field"><span>عنوان الاستلام *</span><input name="address" required maxlength="500" value="${pickup?.pickup_address || s.address || ''}"></label>
      <div class="field"><span>موقع استلام الطلبات على الخريطة *</span><div data-prev>${point ? mapPreview(point) : html`<div class="notice notice-warn">${icon('alert', 18)}<p>لم تحدد موقع الاستلام. لا يمكن حساب أجرة التوصيل لطلبات متجرك بدونه.</p></div>`}</div><button type="button" class="btn btn-outline" data-action="pick">${icon('pin', 18)} ${point ? 'تعديل الموقع' : 'تحديد الموقع'}</button></div>
      <label class="field"><span>وقت تجهيز الطلب (دقائق)</span><input name="prep" type="number" min="0" max="1440" step="1" value="${s.prep_time_min ?? 15}"><small>يظهر للزبون ويساعد السائق على الوصول في الوقت المناسب.</small></label>
      <button class="btn btn-primary">${icon('check', 18)} حفظ الموقع</button>
    </form></div>`,
  );
  body.querySelector('#storeFile').addEventListener('change', async (e) => {
    try {
      image = await prepareImage(e.target.files[0], 800);
      render(body.querySelector('#storeImg'), html`<img src="${URL.createObjectURL(image)}" alt="">`);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  const done = async (msg) => {
    await reloadSession();
    invalidate('stores');
    resetWorkspace();
    toast(msg, 'success');
    storeView(ctx, sellerShell());
  };
  body.querySelector('[data-identity]').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = formData(e.target),
      phone = phoneDigits(v.phone);
    if (v.name.length < 2 || phone.length < 10) return toast('اكتب اسم المتجر ورقم هاتف صحيح', 'error');
    busy(e.target.querySelector('button.btn-primary'), async () => {
      let image_path = s.image_path || null;
      if (image) {
        image_path = `${s.id}/store-${crypto.randomUUID()}.jpg`;
        check(await db.storage.from('products').upload(image_path, image, { contentType: 'image/jpeg' }));
      }
      const username = v.username.replace(/^@/, '').toLowerCase();
      if (username && username !== (s.username || session.profile?.username)) check(await db.rpc('set_professional_username', { p_username: username }));
      check(await db.from('stores').update({ name: v.name, phone, description: v.description, image_path }).eq('id', s.id).select('id').single());
      await done('حُفظت هوية المتجر');
    });
  });
  body.querySelector('[data-location]').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = formData(e.target),
      prep = Number(v.prep);
    if (v.address.length < 3) return toast('اكتب عنوان الاستلام', 'error');
    if (!validPoint(point)) return toast('حدّد موقع الاستلام على الخريطة', 'error');
    if (!Number.isInteger(prep) || prep < 0 || prep > 1440) return toast('وقت التجهيز بين ٠ و١٤٤٠ دقيقة', 'error');
    busy(e.target.querySelector('button.btn-primary'), async () => {
      check(await db.rpc('save_store_location', { p_store: s.id, p_kind: v.kind, p_address: v.address }));
      check(await db.rpc('save_store_delivery', { p_store: s.id, p_lat: point.lat, p_lng: point.lon, p_prep: prep }));
      await done('حُفظ الموقع ووقت التجهيز');
    });
  });
  sellerActions({
    pick: async () => {
      const p = await pickLocation({ value: point, title: 'موقع استلام الطلبات' });
      if (!p) return;
      point = p;
      render(body.querySelector('[data-prev]'), mapPreview(p));
    },
  });
}
