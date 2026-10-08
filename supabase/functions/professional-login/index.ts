// Credentials are verified by Supabase Auth; lookup never exposes account emails.
const origins = new Set(['https://halguorabi76-netizen.github.io', 'http://localhost', 'https://localhost', 'capacitor://localhost']);
export function createHandler({ url, anonKey, serviceKey, fetcher = fetch, hash = async value => {
 const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
 return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
} }) {
 return async req => {
  const origin = req.headers.get('Origin');
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
   'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  if (origin && origins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !origins.has(origin)) return reply({ code: 'forbidden' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply({ code: 'method_not_allowed' }, 405);
  try {
   const text = await req.text();
   if (text.length > 4096) return reply({ code: 'invalid_credentials' }, 400);
   const body = JSON.parse(text), username = typeof body.username === 'string' ? body.username.trim().replace(/^@/, '').toLowerCase() : '';
   if (!/^[a-z][a-z0-9_]{2,29}$/.test(username) || !['seller', 'driver'].includes(body.role) || typeof body.password !== 'string' || body.password.length < 6 || body.password.length > 1024) return reply({ code: 'invalid_credentials' }, 400);
   const clientKey = await hash(req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown');
   const lookup = await fetcher(url + '/rest/v1/rpc/prepare_professional_login', { method: 'POST', headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_username: username, p_role: body.role, p_client_key: clientKey }) });
   if (!lookup.ok) return reply({ code: 'temporarily_unavailable' }, 503);
   const account = await lookup.json();
   if (account.limited) return reply({ code: 'rate_limited' }, 429);
   // Perform Auth verification for unknown names too; return one generic failure.
   const email = account.email || 'missing-' + crypto.randomUUID() + '@example.invalid';
   const auth = await fetcher(url + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: body.password }) });
   if (!auth.ok) return reply({ code: auth.status === 429 ? 'rate_limited' : 'invalid_credentials' }, auth.status === 429 ? 429 : 401);
   const session = await auth.json();
   if (!account.email || !session.access_token || !session.refresh_token) return reply({ code: 'invalid_credentials' }, 401);
   return reply({ access_token: session.access_token, refresh_token: session.refresh_token });
  } catch { return reply({ code: 'temporarily_unavailable' }, 503); }
 };
}
if (typeof Deno !== 'undefined') Deno.serve(createHandler({url:Deno.env.get('SUPABASE_URL'),anonKey:Deno.env.get('SUPABASE_ANON_KEY'),serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}));
