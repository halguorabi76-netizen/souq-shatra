import { db, check } from './db.js';
// Who is signed in and which workspaces (shop / seller / driver / admin) they may open.
const listeners = new Set();
export const session = { ready: false, user: null, profile: null, store: null, driver: null, driverProfile: null };
export const onSession = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach((f) => f(session));

export const isSeller = () => !!(session.store?.approved && !session.store.removed && !session.profile?.disabled);
export const isDriver = () => !!(session.driver && !session.profile?.disabled);
export const isApprovedDriver = () => isDriver() && !!session.driver.approved;
export const isAdmin = () => session.profile?.role === 'admin' && !session.profile?.disabled;
export const isDisabled = () => !!session.profile?.disabled;

let loadId = 0;
export async function load() {
  const my = ++loadId;
  const { data, error } = await db.auth.getSession();
  if (error && ['refresh_token_not_found', 'session_not_found', 'user_not_found'].includes(error.code)) await db.auth.signOut({ scope: 'local' });
  const user = data?.session?.user || null;
  if (!user) {
    Object.assign(session, { ready: true, user: null, profile: null, store: null, driver: null, driverProfile: null });
    if (my === loadId) emit();
    return session;
  }
  const [profile, store, driver, driverProfile] = await Promise.all([
    db.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    db.from('stores').select('*').eq('owner_id', user.id).maybeSingle(),
    db.from('delivery_workers').select('*').eq('user_id', user.id).maybeSingle(),
    db.from('driver_profiles').select('*').eq('user_id', user.id).maybeSingle(),
  ]);
  if (my !== loadId) return session;
  // A deleted account may still hold a valid token on this device.
  if (!profile.error && !profile.data) {
    await db.auth.signOut({ scope: 'local' });
    return load();
  }
  Object.assign(session, {
    ready: true,
    user,
    profile: check(profile),
    store: store.error ? null : store.data,
    driver: driver.error ? null : driver.data,
    driverProfile: driverProfile.error ? null : driverProfile.data,
  });
  emit();
  return session;
}
let authEvents = 0;
db.auth.onAuthStateChange((event) => {
  if (event === 'INITIAL_SESSION') return;
  authEvents++;
  if (event === 'PASSWORD_RECOVERY') document.dispatchEvent(new CustomEvent('password-recovery'));
  if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(event)) setTimeout(() => load().catch(console.error), 0);
});

export async function signIn(identifier, password, role) {
  const id = identifier.trim();
  if (id.includes('@')) return check(await db.auth.signInWithPassword({ email: id, password }));
  // Sellers and drivers may sign in with their unique username through the edge function.
  const res = await db.functions.invoke('professional-login', { body: { username: id.replace(/^@/, '').toLowerCase(), password, role: role || 'seller' } });
  let code = res.data?.code;
  if (res.error) {
    try {
      code = (await res.error.context?.json())?.code || code;
    } catch {}
    throw Object.assign(new Error(code || 'invalid_credentials'), { code: code || 'invalid_credentials' });
  }
  return check(await db.auth.setSession({ access_token: res.data.access_token, refresh_token: res.data.refresh_token }));
}
export async function signUp({ name, email, password, phone }) {
  return check(
    await db.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim(), contact_phone: phone || '' }, emailRedirectTo: location.origin + location.pathname },
    }),
  );
}
export async function signInWithGoogle() {
  return check(await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } } }));
}
export async function signOut() {
  check(await db.auth.signOut());
  await load();
}
export const resetPassword = async (email) => check(await db.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname }));
export const updatePassword = async (password) => check(await db.auth.updateUser({ password }));
export const updateEmail = async (email) => check(await db.auth.updateUser({ email: email.trim() }));
export async function authProviders() {
  try {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('../../config.js');
    const r = await fetch(SUPABASE_URL + '/auth/v1/settings', { headers: { apikey: SUPABASE_ANON_KEY } });
    return r.ok ? (await r.json()).external || {} : null;
  } catch {
    return null;
  }
}
export const authEventCount = () => authEvents;
