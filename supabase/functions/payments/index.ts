// Online payments: the amount is always computed by the database from the buyer's own
// orders (or the seller's own subscription/promotion/dues), never taken from the browser.
//   POST {fn}/init      body {purpose, refs, provider, return_url}  (Authorization: user JWT)
//   GET  {fn}/zaincash  ?intent=…&token=…                            (ZainCash redirect)
// Secrets (Supabase → Edge Functions → Secrets):
//   ZAINCASH_MSISDN, ZAINCASH_MERCHANT_ID, ZAINCASH_SECRET, ZAINCASH_BASE (https://api.zaincash.iq or https://test.zaincash.iq)
//   ALLOWED_ORIGINS (comma separated, optional)  CARD_* reserved for the card gateway adapter.
const DEFAULT_ORIGINS = ['https://halguorabi76-netizen.github.io', 'http://localhost', 'https://localhost', 'capacitor://localhost'];
const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));

async function hmacKey(secret: string) {
 return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function signJwt(payload: Record<string, unknown>, secret: string) {
 const head = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))), body = b64url(enc.encode(JSON.stringify(payload)));
 const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(head + '.' + body)));
 return head + '.' + body + '.' + b64url(sig);
}
export async function verifyJwt(token: string, secret: string) {
 const parts = String(token || '').split('.');
 if (parts.length !== 3) return null;
 const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
 if (!ok) return null;
 try { return JSON.parse(new TextDecoder().decode(fromB64url(parts[1]))); } catch { return null; }
}

type Env = { url: string; anonKey: string; serviceKey: string; zaincash?: { msisdn: string; merchantId: string; secret: string; base: string }; origins?: string[]; fetcher?: typeof fetch; selfUrl?: string };

export function createHandler(env: Env) {
 const fetcher = env.fetcher || fetch, origins = new Set(env.origins?.length ? env.origins : DEFAULT_ORIGINS);
 const service = { apikey: env.serviceKey, Authorization: 'Bearer ' + env.serviceKey, 'Content-Type': 'application/json' };
 const rpc = async (name: string, body: unknown) => {
  const r = await fetcher(env.url + '/rest/v1/rpc/' + name, { method: 'POST', headers: service, body: JSON.stringify(body) });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(data?.message || 'database error'), { status: 400 });
  return data;
 };
 const allowedReturn = (value: string) => {
  try { const u = new URL(value); return origins.has(u.origin) ? u : null; } catch { return null; }
 };
 return async (req: Request) => {
  const url = new URL(req.url), origin = req.headers.get('Origin');
  const cors: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
   'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
  if (origin && origins.has(origin)) cors['Access-Control-Allow-Origin'] = origin;
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
   if (req.method === 'POST' && url.pathname.endsWith('/init')) {
    if (origin && !origins.has(origin)) return reply({ code: 'forbidden' }, 403);
    const auth = req.headers.get('Authorization') || '';
    const who = await fetcher(env.url + '/auth/v1/user', { headers: { apikey: env.anonKey, Authorization: auth } });
    if (!who.ok) return reply({ code: 'login_required' }, 401);
    const user = await who.json();
    const body = JSON.parse(await req.text() || '{}');
    const back = allowedReturn(body.return_url);
    if (!back || !['order', 'subscription', 'promotion', 'dues'].includes(body.purpose) || !Array.isArray(body.refs) || !['zaincash', 'card'].includes(body.provider))
     return reply({ code: 'invalid_request' }, 400);
    const intent = await rpc('payment_create_intent', { p_user: user.id, p_purpose: body.purpose, p_refs: body.refs, p_provider: body.provider });
    if (body.provider === 'card') return reply({ code: 'card_gateway_not_configured' }, 501);
    const z = env.zaincash;
    if (!z?.secret) return reply({ code: 'zaincash_not_configured' }, 501);
    const callback = (env.selfUrl || url.origin + url.pathname.replace(/\/init$/, '')) + '/zaincash?intent=' + intent.id;
    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt({ amount: intent.amount, serviceType: 'سوق الشطرة', msisdn: Number(z.msisdn), orderId: intent.id, redirectUrl: callback, iat: now, exp: now + 4 * 3600 }, z.secret);
    const form = new URLSearchParams({ token, merchantId: z.merchantId, lang: 'ar' });
    const init = await fetcher(z.base + '/transaction/init', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    const tx = await init.json().catch(() => null);
    if (!init.ok || !tx?.id) return reply({ code: 'gateway_error', message: tx?.err?.msg || '' }, 502);
    await fetcher(env.url + '/rest/v1/payment_intents?id=eq.' + intent.id, { method: 'PATCH', headers: service, body: JSON.stringify({ provider_ref: tx.id, details: { return_url: back.href } }) });
    return reply({ intent: intent.id, amount: intent.amount, redirect_url: z.base + '/transaction/pay?id=' + encodeURIComponent(tx.id) });
   }
   if (req.method === 'GET' && url.pathname.endsWith('/zaincash')) {
    const id = url.searchParams.get('intent') || '', z = env.zaincash;
    if (!/^[0-9a-f-]{36}$/i.test(id) || !z?.secret) return reply({ code: 'invalid_request' }, 400);
    const payload = await verifyJwt(url.searchParams.get('token') || '', z.secret);
    const rows = await (await fetcher(env.url + '/rest/v1/payment_intents?select=*&id=eq.' + id, { headers: service })).json();
    const intent = rows?.[0];
    if (!intent) return reply({ code: 'unknown_intent' }, 404);
    const paid = !!payload && payload.status === 'success' && String(payload.orderid) === id;
    await rpc('payment_complete_intent', { p_intent: id, p_paid: paid, p_provider_ref: String(payload?.id || intent.provider_ref || ''), p_details: { ...intent.details, gateway: payload || { invalid: true } } });
    const back = allowedReturn(intent.details?.return_url || '') || new URL([...origins][0]);
    back.searchParams.set('payment', paid ? 'success' : 'failed');
    back.searchParams.set('intent', id);
    return new Response(null, { status: 302, headers: { Location: back.href, 'Cache-Control': 'no-store' } });
   }
   return reply({ code: 'not_found' }, 404);
  } catch (e) {
   return reply({ code: 'payment_error', message: (e as Error).message }, (e as { status?: number }).status || 500);
  }
 };
}

declare const Deno: any;
if (typeof Deno !== 'undefined') {
 const e = (k: string) => Deno.env.get(k) || '';
 Deno.serve(createHandler({
  url: e('SUPABASE_URL'), anonKey: e('SUPABASE_ANON_KEY'), serviceKey: e('SUPABASE_SERVICE_ROLE_KEY'),
  zaincash: { msisdn: e('ZAINCASH_MSISDN'), merchantId: e('ZAINCASH_MERCHANT_ID'), secret: e('ZAINCASH_SECRET'), base: e('ZAINCASH_BASE') || 'https://api.zaincash.iq' },
  origins: e('ALLOWED_ORIGINS').split(',').map((s: string) => s.trim()).filter(Boolean),
  selfUrl: e('SUPABASE_URL') + '/functions/v1/payments',
 }));
}
