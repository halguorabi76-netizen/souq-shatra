// Free WhatsApp sign-in. The customer sends a 6-digit code from their own WhatsApp to the
// Souq Al-Shatra number; Meta forwards the incoming message here (receiving is free), and the
// sender's number proves the phone. Only the browser holding the request secret gets the session.
const origins = new Set(['https://halguorabi76-netizen.github.io', 'http://localhost', 'https://localhost', 'capacitor://localhost']);
const hex = (bytes) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (value) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
const randomHex = () => hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
async function hmac(secret, body) {
 const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
 return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
}
function sameText(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
// Reads the code from a message, accepting Arabic-Indic digits too.
export function codeIn(text) {
 if (typeof text !== 'string') return null;
 const plain = text.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6f0));
 return plain.match(/(?<!\d)\d{6}(?!\d)/)?.[0] || null;
}
// Iraqi numbers are kept in the familiar 07… form for the contact field.
export const localPhone = (phone) => phone.startsWith('964') ? '0' + phone.slice(3) : phone;
export const accountEmail = (phone) => 'wa' + phone + '@phone.souq-shatra.invalid';
// Accounts known only by a WhatsApp user ID (usernames hide the number) get a stable private address.
export const userIdEmail = async (id) => 'wau' + (await sha256(id)).slice(0, 32) + '@phone.souq-shatra.invalid';
// The customer account kept beside a seller or driver account with the same number.
export const customerEmail = (key) => 'wac' + key.replace(/@.*$/, '') + '@phone.souq-shatra.invalid';

// The automatic reply after a code message; the link brings the customer back to finish signing in.
const SITE = 'https://halguorabi76-netizen.github.io/souq-shatra/?wa=1';
export const replyText = linked => linked
 ? '✅ تم تأكيد رقمك في سوق الشطرة.\nارجع إلى الموقع ليكتمل دخولك تلقائيًا:\n' + SITE
 : 'لم نجد طلب دخول بهذا الرمز أو انتهت صلاحيته.\nاطلب رمزًا جديدًا من الموقع:\n' + SITE;
// Number, webhook token, app secret and reply token come from the admin page (database), with optional env fallbacks.
export function createHandler({ url, anonKey, serviceKey, number: envNumber, verifyToken: envToken, appSecret: envSecret, accessToken: envAccess, fetcher = fetch }) {
 const service = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' };
 const rpc = async (name, args) => {
  const r = await fetcher(url + '/rest/v1/rpc/' + name, { method: 'POST', headers: service, body: JSON.stringify(args) });
  if (!r.ok) throw new Error('rpc ' + name);
  return r.json();
 };
 let cached = null;
 const config = async () => {
  if (cached && Date.now() - cached.at < 30000) return cached;
  let stored = {};
  try { stored = (await rpc('whatsapp_login_config', {})) || {}; } catch { /* keep env fallbacks */ }
  cached = { at: Date.now(), number: String(stored.number || envNumber || '').replace(/\D/g, ''), verifyToken: stored.verify_token || envToken || '', appSecret: stored.app_secret || envSecret || '', accessToken: stored.access_token || envAccess || '' };
  return cached;
 };
 const seen = kind => rpc('whatsapp_login_seen', { p_kind: kind }).catch(() => {});
 const rest = async (method, path, body) => {
  const r = await fetcher(url + '/rest/v1/' + path, { method, headers: { ...service, Prefer: 'return=minimal' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!r.ok) throw new Error(method + ' ' + path.split('?')[0] + ' ' + r.status);
  return method === 'GET' ? r.json() : null;
 };
 const busy = async (table, col, id) => (await rest('GET', table + '?select=' + col + '&limit=1&' + col + '=eq.' + id)).length > 0;
 // Sellers, delivery workers and admins keep their professional account to themselves.
 const professional = async (id) => {
  const [profile] = await rest('GET', 'profiles?select=role&id=eq.' + id);
  return profile?.role === 'admin' || await busy('stores', 'owner_id', id) || await busy('delivery_workers', 'user_id', id) || await busy('driver_profiles', 'user_id', id);
 };
 async function session(found) {
  const phone = found.phone || '', waUser = found.wa_user_id || '';
  // WhatsApp sign-in is for customers only. When the number belongs to a seller or driver account,
  // the customer gets a separate shopping account with the same number instead.
  const separate = !!found.user_id && await professional(found.user_id);
  if (separate) found = { phone, wa_user_id: waUser };
  const email = found.email || (separate ? customerEmail(phone || await userIdEmail(waUser)) : phone ? accountEmail(phone) : await userIdEmail(waUser));
  if (!found.user_id) {
   const account = separate
    ? { email, email_confirm: true, user_metadata: { full_name: '', ...(phone ? { contact_phone: localPhone(phone) } : {}) }, app_metadata: { login: 'whatsapp', customer_of: 'professional' } }
    : phone
    ? { email, phone, email_confirm: true, phone_confirm: true, user_metadata: { full_name: '', contact_phone: localPhone(phone) }, app_metadata: { login: 'whatsapp', ...(waUser ? { wa_user_id: waUser } : {}) } }
    : { email, email_confirm: true, user_metadata: { full_name: '' }, app_metadata: { login: 'whatsapp', wa_user_id: waUser } };
   const created = await fetcher(url + '/auth/v1/admin/users', { method: 'POST', headers: service, body: JSON.stringify(account) });
   if (!created.ok && created.status !== 422) throw new Error('create user ' + created.status);
  } else if (!found.email) {
   const updated = await fetcher(url + '/auth/v1/admin/users/' + found.user_id, { method: 'PUT', headers: service, body: JSON.stringify({ email, email_confirm: true }) });
   if (!updated.ok) throw new Error('attach email ' + updated.status);
  }
  // A magic link generated by the admin API is never e-mailed; it is redeemed here at once.
  const link = await fetcher(url + '/auth/v1/admin/generate_link', { method: 'POST', headers: service, body: JSON.stringify({ type: 'magiclink', email }) });
  if (!link.ok) throw new Error('link ' + link.status);
  const data = await link.json(), token_hash = data.hashed_token || data.properties?.hashed_token;
  const verified = await fetcher(url + '/auth/v1/verify', { method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash }) });
  if (!verified.ok) throw new Error('verify ' + verified.status);
  const tokens = await verified.json();
  if (!tokens.access_token || !tokens.refresh_token) throw new Error('tokens');
  await seen('login');
  return { status: 'verified', access_token: tokens.access_token, refresh_token: tokens.refresh_token };
 }
 // Permanent account deletion requested by the signed-in customer. Accounts with order history keep
 // the orders for the sellers but lose every personal detail and can never sign in again.
 async function deleteAccount(token) {
  const me = await fetcher(url + '/auth/v1/user', { headers: { apikey: anonKey, Authorization: 'Bearer ' + token } });
  if (!me.ok) return { code: 'login_required' };
  const id = (await me.json()).id;
  if (!/^[0-9a-f-]{36}$/.test(id || '')) return { code: 'login_required' };
  if (await professional(id)) return { code: 'professional' };
  let history = false;
  for (const [table, col] of [['orders', 'buyer_id'], ['order_customer_actions', 'buyer_id'], ['delivery_batches', 'buyer_id'], ['delivery_events', 'buyer_id'], ['payment_requests', 'payer_id'], ['payment_intents', 'user_id']]) if (await busy(table, col, id)) { history = true; break; }
  for (const [table, col] of [['customer_addresses', 'user_id'], ['product_interactions', 'user_id'], ['account_notifications', 'recipient_id']]) await rest('DELETE', table + '?' + col + '=eq.' + id);
  if (!history) {
   const gone = await fetcher(url + '/auth/v1/admin/users/' + id, { method: 'DELETE', headers: service });
   if (!gone.ok) throw new Error('delete user ' + gone.status);
   return { status: 'deleted' };
  }
  await rest('PATCH', 'profiles?id=eq.' + id, { full_name: 'حساب محذوف', phone: '', disabled: true });
  // Auth merges metadata and ignores an empty phone: clear every key and swap the number for an
  // unreachable placeholder, so the old WhatsApp number can open a brand-new account later.
  const old = await fetcher(url + '/auth/v1/admin/users/' + id, { headers: service });
  if (!old.ok) throw new Error('read user ' + old.status);
  const before = await old.json(), cleared = meta => Object.fromEntries(Object.keys(meta || {}).map(k => [k, null]));
  const placeholder = '000' + Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b % 10).join('');
  const locked = await fetcher(url + '/auth/v1/admin/users/' + id, { method: 'PUT', headers: service, body: JSON.stringify({ email: 'deleted-' + crypto.randomUUID() + '@deleted.souq-shatra.invalid', email_confirm: true, phone: placeholder, phone_confirm: true, password: randomHex(), user_metadata: cleared(before.user_metadata), app_metadata: { wa_user_id: null, login: null, deleted: true }, ban_duration: '876000h' }) });
  if (!locked.ok) throw new Error('lock user ' + locked.status);
  return { status: 'deleted' };
 }
 return async (req) => {
  const reqUrl = new URL(req.url);
  // Meta's one-time webhook check.
  if (req.method === 'GET') {
   const { verifyToken } = await config();
   const ok = verifyToken && reqUrl.searchParams.get('hub.mode') === 'subscribe' && sameText(reqUrl.searchParams.get('hub.verify_token') || '', verifyToken);
   return new Response(ok ? reqUrl.searchParams.get('hub.challenge') || '' : 'forbidden', { status: ok ? 200 : 403 });
  }
  // Incoming WhatsApp messages from Meta, signed with the app secret.
  const signature = req.headers.get('x-hub-signature-256');
  if (signature !== null) {
   const raw = await req.text(), { appSecret, accessToken } = await config();
   // A reply inside the 24-hour window the customer opened (free service message).
   const answer = async (phoneId, to, linked) => {
    if (!accessToken || !/^[0-9]{5,30}$/.test(String(phoneId || '')) || !to) return 'no_token';
    const sent = await fetcher('https://graph.facebook.com/v21.0/' + phoneId + '/messages', { method: 'POST', headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', ...to, type: 'text', text: { preview_url: false, body: replyText(linked) } }) }).catch(() => null);
    return sent ? sent.status : 'network';
   };
   if (!appSecret || !sameText(signature, 'sha256=' + await hmac(appSecret, raw))) return new Response('bad signature', { status: 401 });
   await seen('webhook');
   try {
    for (const entry of JSON.parse(raw).entry || []) for (const change of entry.changes || []) {
     const contacts = change.value?.contacts || [];
     console.log(JSON.stringify({ webhook: change.field, messages: (change.value?.messages || []).length, statuses: (change.value?.statuses || []).length }));
     for (const message of change.value?.messages || []) {
      // The sender's number: `from`, or the matching contact's wa_id when Meta omits it.
      const contact = contacts.find(c => c.user_id && c.user_id === message.from_user_id) || contacts[0] || {};
      const phone = [message.from, contact.wa_id].map(v => String(v || '').replace(/\D/g, '')).find(v => /^[0-9]{8,15}$/.test(v)) || '';
      const waUser = [message.from_user_id, contact.user_id].map(v => String(v || '')).find(v => /^[A-Za-z0-9._:-]{3,100}$/.test(v)) || '';
      const code = codeIn(message.text?.body ?? message.button?.text ?? message.interactive?.button_reply?.title);
      let linked = false;
      if (code && (phone || waUser)) linked = await rpc('whatsapp_login_confirm', { p_code: code, p_phone: phone, p_wa_user_id: waUser }).catch(() => 'rpc_error');
      const replied = code ? await answer(change.value?.metadata?.phone_number_id, phone ? { to: phone } : waUser ? { recipient: waUser } : null, linked === true) : 'no_code';
      console.log(JSON.stringify({ webhook: 'message', type: message.type, has_code: !!code, has_phone: !!phone, has_user_id: !!waUser, linked, replied }));
     }
    }
   } catch { /* Meta retries non-200 replies; a bad message must not cause a retry storm. */ }
   return new Response('ok');
  }
  // Requests from the site.
  const origin = req.headers.get('Origin');
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  if (origin && origins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !origins.has(origin)) return reply({ code: 'forbidden' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply({ code: 'method_not_allowed' }, 405);
  try {
   const text = await req.text();
   if (text.length > 2048) return reply({ code: 'invalid' }, 400);
   const body = JSON.parse(text);
   if (body.action === 'start') {
    const { number, appSecret } = await config();
    if (!appSecret || !/^[0-9]{8,15}$/.test(number || '')) return reply({ code: 'not_configured' }, 503);
    const secret = randomHex(), clientKey = await sha256(req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown');
    const started = await rpc('whatsapp_login_start', { p_secret_hash: await sha256(secret), p_client_key: clientKey });
    if (started.limited) return reply({ code: 'rate_limited' }, 429);
    return reply({ code: started.code, secret, number, expires_in: 600 });
   }
   if (body.action === 'delete_account') {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token || token === anonKey) return reply({ code: 'login_required' }, 401);
    const done = await deleteAccount(token);
    return reply(done, done.status ? 200 : done.code === 'professional' ? 409 : 401);
   }
   if (body.action === 'claim') {
    if (!/^[0-9]{6}$/.test(body.code || '') || !/^[0-9a-f]{64}$/.test(body.secret || '')) return reply({ code: 'invalid' }, 400);
    const found = await rpc('whatsapp_login_claim', { p_code: body.code, p_secret_hash: await sha256(body.secret) });
    if (found.status !== 'verified') return reply({ status: found.status });
    return reply(await session(found));
   }
   return reply({ code: 'invalid' }, 400);
  } catch (error) { console.log(JSON.stringify({ failed: String(error?.message || error).slice(0, 80) })); return reply({ code: 'temporarily_unavailable' }, 503); }
 };
}
if (typeof Deno !== 'undefined') Deno.serve(createHandler({ url: Deno.env.get('SUPABASE_URL'), anonKey: Deno.env.get('SUPABASE_ANON_KEY'), serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), number: (Deno.env.get('WHATSAPP_NUMBER') || '').replace(/\D/g, ''), verifyToken: Deno.env.get('WHATSAPP_VERIFY_TOKEN'), appSecret: Deno.env.get('WHATSAPP_APP_SECRET'), accessToken: Deno.env.get('WHATSAPP_ACCESS_TOKEN') }));
