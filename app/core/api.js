import { db, check, publicUrl } from './db.js';
import { normalizeArabic } from './format.js';

// ---------- small cache ----------
const cache = new Map();
async function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.p;
  const p = fn().catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, { t: Date.now(), p });
  return p;
}
export const invalidate = (prefix = '') => [...cache.keys()].forEach((k) => k.startsWith(prefix) && cache.delete(k));

// ---------- mapping ----------
export const variantPrice = (v) => v?.sale_price ?? v?.price;
export function mapStore(s) {
  return s && { ...s, image_url: publicUrl(s.image_path), appearance: s.storefront_settings || {} };
}
export function mapProduct(p, variants = []) {
  if (!p) return null;
  const vs = variants.filter((v) => v.product_id === p.id).map((v) => ({ ...v, img: publicUrl(v.image_path) }));
  const live = vs.filter((v) => !v.archived && v.available);
  const sell = p.attributes?._selling || {};
  let price = p.price,
    compare = p.compare_at_price ?? null,
    stock = p.stock;
  if (p.has_variants && live.length) {
    const cheapest = live.reduce((a, b) => (variantPrice(b) < variantPrice(a) ? b : a));
    price = variantPrice(cheapest);
    compare = cheapest.sale_price != null ? cheapest.price : null;
    stock = live.reduce((n, v) => n + (v.stock || 0), 0);
  }
  return {
    ...p,
    img: publicUrl(p.image_path),
    variants: vs,
    display_price: price,
    display_compare: compare,
    in_stock: stock > 0 && p.active && !p.blocked,
    total_stock: stock,
    unit: sell.unit || p.attributes?.sale_unit || 'قطعة',
    condition: sell.condition || 'new',
    sale_mode: sell.sale_mode || 'retail',
    from_price: p.has_variants && new Set(live.map(variantPrice)).size > 1,
  };
}
// Variant chosen by id, or the simple product itself.
export function chosenItem(p, vid) {
  if (!p) return null;
  if (!p.has_variants) return vid ? null : { price: p.price, compare: p.compare_at_price, stock: p.stock, img: p.img, label: '', attributes: {} };
  const v = p.variants.find((x) => x.id === vid && !x.archived);
  if (!v) return null;
  return {
    price: variantPrice(v),
    compare: v.sale_price != null ? v.price : null,
    stock: v.available ? v.stock : 0,
    img: v.img || p.img,
    label: Object.values(v.attributes || {}).join(' · '),
    attributes: v.attributes || {},
  };
}

// ---------- public catalogue ----------
export const getStores = () =>
  cached('stores', 120000, async () => (check(await db.from('stores').select('*')) || []).filter((s) => s.approved && !s.removed).map(mapStore));
export const getStore = async (id) => (await getStores()).find((s) => s.id === id) || null;
export const getCategories = () =>
  cached('categories', 600000, async () => {
    const rows = check(await db.from('catalog_categories').select('*').order('position')) || [];
    return rows.filter((c) => c.active !== false);
  });
export const getPlatform = () =>
  cached('platform', 120000, async () => {
    const [settings, delivery, zones, plans, placements] = await Promise.all([
      db.from('platform_settings').select('*').maybeSingle(),
      db.from('delivery_settings').select('*').limit(1).maybeSingle(),
      db.from('delivery_zones').select('*').order('name'),
      db.from('seller_plans').select('*').order('position'),
      db.from('promotion_placements').select('*'),
    ]);
    // Before the revenue migration is installed, fall back to cash-only defaults.
    return {
      settings: settings.error ? null : settings.data,
      payment_methods: (!settings.error && settings.data?.payment_methods) || { cod: true },
      transfer_accounts: (!settings.error && settings.data?.transfer_accounts) || {},
      support_phone: (!settings.error && settings.data?.support_phone) || '9647837271707',
      delivery: delivery.data || { platform_fee: 0, delivery_fee: 0, qi_number: '' },
      zones: zones.error ? [] : zones.data || [],
      plans: plans.error ? [] : plans.data || [],
      placements: placements.error ? [] : placements.data || [],
      revenue_ready: !settings.error,
    };
  });

async function withVariants(rows) {
  const ids = rows.filter((p) => p.has_variants).map((p) => p.id);
  const vs = ids.length ? check(await db.from('product_variants').select('*').in('product_id', ids)) || [] : [];
  return rows.map((p) => mapProduct(p, vs));
}
// Spelling variants so "قهوة" also finds "قهوه" and "أحذية" finds "احذية".
function termVariants(t) {
  const n = normalizeArabic(t);
  const set = new Set([t, n, n.replace(/ه\b/g, 'ة'), n.replace(/^ا/, 'أ'), n.replace(/^ا/, 'إ'), n.replace(/ي\b/g, 'ى')]);
  return [...set].map((x) => x.replace(/[,.:()%*\\"']/g, '')).filter(Boolean);
}
export async function searchProducts({ q = '', category = '', store = '', min = '', max = '', sort = 'newest', condition = '', page = 0, size = 24, ids } = {}) {
  const stores = await getStores();
  const storeIds = store ? [store] : stores.map((s) => s.id);
  if (!storeIds.length) return { items: [], total: 0 };
  let query = db.from('products').select('*', { count: 'exact' }).eq('active', true).eq('blocked', false).in('store_id', storeIds);
  if (ids) query = query.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  // All OR-groups go into one logical filter: and(or(category…),or(term1…),or(term2…)).
  const groups = [];
  if (category) {
    const cats = await getCategories();
    // Some names exist both as a main category and a subcategory; the main one wins.
    const root = cats.find((c) => c.id === category) || cats.find((c) => !c.parent_id && c.name === category) || cats.find((c) => c.name === category);
    const catIds = root ? [root.id, ...cats.filter((c) => c.parent_id === root.id).map((c) => c.id)] : [];
    const name = root?.name || category;
    groups.push(`or(category.eq.${quote(name)}${catIds.length ? `,catalog_category_id.in.(${catIds.join(',')})` : ''})`);
  }
  for (const term of String(q).trim().split(/\s+/).filter(Boolean).slice(0, 4)) {
    const opts = termVariants(term).flatMap((v) => [`name.ilike.*${v}*`, `description.ilike.*${v}*`, `category.ilike.*${v}*`]);
    if (opts.length) groups.push(`or(${opts.join(',')})`);
  }
  if (groups.length) query = query.or(`and(${groups.join(',')})`);
  if (min !== '' && min != null) query = query.gte('price', +min);
  if (max !== '' && max != null) query = query.lte('price', +max);
  if (condition) query = query.eq('attributes->_selling->>condition', condition);
  const order = { newest: ['created_at', false], oldest: ['created_at', true], cheap: ['price', true], expensive: ['price', false] }[sort] || ['created_at', false];
  query = query.order(order[0], { ascending: order[1] }).range(page * size, page * size + size - 1);
  const res = await query;
  const rows = check(res) || [];
  return { items: await withVariants(rows), total: res.count ?? rows.length };
}
const quote = (s) => '"' + String(s).replace(/"/g, '') + '"';
export async function getProduct(id) {
  const row = check(await db.from('products').select('*').eq('id', id).maybeSingle());
  if (!row) return null;
  const [p] = await withVariants([row]);
  return p;
}
export async function getProductsByIds(ids) {
  const list = [...new Set(ids)].filter(Boolean);
  if (!list.length) return [];
  const rows = check(await db.from('products').select('*').in('id', list)) || [];
  return withVariants(rows);
}
export const getLivePromotions = () =>
  cached('promotions', 60000, async () => {
    const now = new Date().toISOString();
    const r = await db.from('promotions').select('*').eq('status', 'active').lte('starts_at', now).gte('ends_at', now);
    return r.error ? [] : r.data || [];
  });
export async function sellerCategories(storeId) {
  const r = await db.from('seller_categories').select('store_id,name').eq('store_id', storeId).eq('active', true).is('deleted_at', null);
  return r.error ? [] : (r.data || []).map((x) => x.name);
}

// ---------- orders ----------
export const STATUS = { new: 'بانتظار المتجر', accepted: 'قيد التجهيز', delivery: 'في الطريق', delivered: 'تم التسليم', cancelled: 'ملغي' };
export const STAGES = {
  NEW: 'طلب جديد',
  STORE_ACCEPTED: 'وافق المتجر',
  READY: 'جاهز للاستلام',
  DRIVER_ACCEPTED: 'وافق السائق',
  PICKED_UP: 'استلم السائق الطلب',
  ON_THE_WAY: 'في الطريق إليك',
  DELIVERED: 'تم التسليم',
  CANCELLED: 'ملغي',
};
export async function participantOrders(filter = {}) {
  const params = {};
  for (const [k, v] of Object.entries({ p_buyer: filter.buyer, p_store: filter.store, p_driver: filter.driver, p_order: filter.order })) if (v) params[k] = v;
  const rows = check(await db.rpc('participant_orders', params)) || [];
  return rows.map(mapOrder);
}
export function mapOrder(o) {
  const items = (o.order_items || []).map((i) => ({ ...i, label: Object.values(i.variant_snapshot?.attributes || i.variant_snapshot || {}).filter((x) => typeof x === 'string').join(' · ') }));
  const action = Array.isArray(o.order_customer_actions) ? o.order_customer_actions[0] : o.order_customer_actions;
  return {
    ...o,
    items,
    action: action || null,
    tracking: o.tracking || {},
    goods: Math.max(0, (o.total || 0) - (o.platform_fee || 0) - (o.delivery_fee || 0)),
    payment_method: o.payment_method || 'cod',
    payment_status: o.payment_status || 'unpaid',
  };
}

// ---------- realtime-ish notifications ----------
export async function notifications(userId, kinds) {
  let q = db.from('account_notifications').select('*').eq('recipient_id', userId);
  if (kinds) q = q.in('event_kind', kinds);
  return check(await q.order('created_at', { ascending: false }).limit(60)) || [];
}
export async function markRead(userId, ids) {
  if (!ids.length) return;
  check(await db.from('account_notifications').update({ read_at: new Date().toISOString() }).eq('recipient_id', userId).in('id', ids).is('read_at', null));
}

// ---------- favourites ----------
export async function interactions(userId) {
  const r = await db.from('product_interactions').select('product_id,kind').eq('user_id', userId);
  return r.error ? [] : r.data || [];
}
export async function toggleFavorite(userId, productId, on) {
  check(
    await (on
      ? db.from('product_interactions').insert({ user_id: userId, product_id: productId, kind: 'favorite' })
      : db.from('product_interactions').delete().eq('user_id', userId).eq('product_id', productId).eq('kind', 'favorite')),
  );
}

// ---------- online payments ----------
export async function startOnlinePayment(purpose, refs, provider, returnHash) {
  const back = new URL(location.href);
  back.search = '';
  back.hash = returnHash;
  const res = await db.functions.invoke('payments/init', { body: { purpose, refs, provider, return_url: back.href } });
  if (res.error) {
    let code = '';
    try {
      code = (await res.error.context?.json())?.code || '';
    } catch {}
    throw new Error(
      code === 'zaincash_not_configured' || code === 'card_gateway_not_configured'
        ? 'الدفع الإلكتروني غير مفعّل بعد. اختر الدفع عند الاستلام.'
        : code === 'login_required'
          ? 'سجّل الدخول أولًا'
          : 'تعذّر بدء الدفع الإلكتروني. أعد المحاولة أو اختر الدفع عند الاستلام.',
    );
  }
  if (!res.data?.redirect_url) throw new Error('تعذّر بدء الدفع الإلكتروني.');
  location.assign(res.data.redirect_url);
}
