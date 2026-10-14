// In-memory stand-in for the subset of supabase-js the app uses. Browser tests load it before
// app/main.js as window.__SOUQ_TEST_CLIENT__. Never shipped to production pages.
(function () {
  const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  const uuid = () => crypto.randomUUID();
  const norm = (s) => String(s ?? '').toLowerCase();
  function getPath(row, key) {
    if (!key.includes('->')) return row[key];
    const parts = key.split(/->>?/);
    let v = row[parts[0]];
    for (const p of parts.slice(1)) v = v == null ? undefined : v[p];
    return v;
  }
  function likeToRe(pattern) {
    return new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$', 'i');
  }
  function test(row, col, op, val) {
    const v = getPath(row, col);
    switch (op) {
      case 'eq': return String(v) === String(val);
      case 'neq': return String(v) !== String(val);
      case 'gt': return v > val;
      case 'gte': return v >= val;
      case 'lt': return v < val;
      case 'lte': return v <= val;
      case 'ilike': case 'like': return likeToRe(String(val)).test(String(v ?? ''));
      case 'in': return val.map(String).includes(String(v));
      case 'is': return val === null || val === 'null' ? v == null : v === val;
      default: throw new Error('mock: unsupported op ' + op);
    }
  }
  // Parses PostgREST logic strings: "a.eq.1,b.ilike.*x*,and(or(...),or(...))".
  function splitTop(s) {
    const out = [];
    let depth = 0, cur = '', quote = false;
    for (const ch of s) {
      if (ch === '"') quote = !quote;
      if (!quote && ch === '(') depth++;
      if (!quote && ch === ')') depth--;
      if (!quote && ch === ',' && depth === 0) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  }
  function logic(expr) {
    const m = expr.match(/^(and|or)\((.*)\)$/s);
    if (m) {
      const parts = splitTop(m[2]).map(logic);
      return m[1] === 'and' ? (r) => parts.every((f) => f(r)) : (r) => parts.some((f) => f(r));
    }
    const [col, op, ...rest] = expr.split('.');
    let val = rest.join('.');
    if (op === 'in') val = val.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, ''));
    else val = val.replace(/^"|"$/g, '');
    return (r) => test(r, col, op, val);
  }
  class Query {
    constructor(db, table) {
      Object.assign(this, { db, table, filters: [], orders: [], from: 0, to: null, mode: 'select', payload: null, single: false, maybe: false, count: false, returning: false });
    }
    select(cols, opts = {}) {
      if (this.mode === 'select') this.mode = 'select';
      else this.returning = true;
      if (opts.count) this.count = true;
      return this;
    }
    eq(c, v) { this.filters.push((r) => test(r, c, 'eq', v)); return this; }
    neq(c, v) { this.filters.push((r) => test(r, c, 'neq', v)); return this; }
    gt(c, v) { this.filters.push((r) => test(r, c, 'gt', v)); return this; }
    gte(c, v) { this.filters.push((r) => test(r, c, 'gte', v)); return this; }
    lt(c, v) { this.filters.push((r) => test(r, c, 'lt', v)); return this; }
    lte(c, v) { this.filters.push((r) => test(r, c, 'lte', v)); return this; }
    ilike(c, v) { this.filters.push((r) => test(r, c, 'ilike', v)); return this; }
    in(c, v) { this.filters.push((r) => test(r, c, 'in', v)); return this; }
    is(c, v) { this.filters.push((r) => test(r, c, 'is', v)); return this; }
    not(c, op, v) { const f = logic(`${c}.${op}.${v}`); this.filters.push((r) => !f(r)); return this; }
    or(expr) { this.filters.push(logic(`or(${expr})`)); return this; }
    filter(c, op, v) { this.filters.push((r) => test(r, c, op, v)); return this; }
    order(c, { ascending = true } = {}) { this.orders.push([c, ascending]); return this; }
    range(a, b) { this.from = a; this.to = b; return this; }
    limit(n) { this.to = this.from + n - 1; return this; }
    maybeSingle() { this.maybe = true; return this; }
    single() { this.single = true; return this; }
    insert(p) { this.mode = 'insert'; this.payload = p; return this; }
    upsert(p) { this.mode = 'upsert'; this.payload = p; return this; }
    update(p) { this.mode = 'update'; this.payload = p; return this; }
    delete() { this.mode = 'delete'; return this; }
    then(ok, fail) { return Promise.resolve().then(() => this.run()).then(ok, fail); }
    run() {
      const db = this.db;
      db.log.push({ table: this.table, mode: this.mode });
      const policy = db.policies[this.table];
      if (db.fail[this.table]) return { data: null, error: { message: db.fail[this.table] } };
      let rows = db.tables[this.table] || (db.tables[this.table] = []);
      const visible = (r) => (policy ? policy(r, db.user, this.mode) : true);
      const match = (r) => visible(r) && this.filters.every((f) => f(r));
      let data;
      if (this.mode === 'insert' || this.mode === 'upsert') {
        const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((x) => ({ id: uuid(), created_at: new Date().toISOString(), ...clone(x) }));
        for (const r of list) {
          if (policy && !policy(r, db.user, 'insert')) return { data: null, error: { message: 'new row violates row-level security policy', code: '42501' } };
          db.trigger?.(this.table, 'insert', r);
        }
        rows.push(...list);
        data = list;
      } else if (this.mode === 'update') {
        data = rows.filter(match);
        data.forEach((r) => Object.assign(r, clone(this.payload)));
      } else if (this.mode === 'delete') {
        data = rows.filter(match);
        db.tables[this.table] = rows.filter((r) => !data.includes(r));
      } else data = rows.filter(match);
      let out = clone(data);
      for (const [c, asc] of [...this.orders].reverse()) out.sort((a, b) => ((a[c] > b[c]) - (a[c] < b[c])) * (asc ? 1 : -1));
      const total = out.length;
      if (this.to != null) out = out.slice(this.from, this.to + 1);
      if (this.single || this.maybe) {
        if (out.length > 1) return { data: null, error: { message: 'multiple rows' } };
        if (!out.length) return this.single ? { data: null, error: { message: 'no rows', code: 'PGRST116' } } : { data: null, error: null };
        return { data: out[0], error: null, count: 1 };
      }
      return { data: out, error: null, count: this.count ? total : null };
    }
  }
  function createMockClient(seed = {}) {
    const listeners = new Set();
    const db = {
      tables: clone(seed.tables || {}),
      users: clone(seed.users || []),
      user: null,
      log: [],
      fail: {},
      policies: seed.policies || {},
      rpc: {},
      functions: {},
      trigger: null,
    };
    const session = () => (db.user ? { access_token: 'mock-' + db.user.id, user: db.user } : null);
    const emit = (event) => listeners.forEach((f) => f(event, session()));
    try {
      const saved = JSON.parse(sessionStorage.getItem('mock-user') || 'null');
      if (saved) db.user = db.users.find((u) => u.id === saved) || null;
    } catch {}
    const persist = () => {
      try {
        sessionStorage.setItem('mock-user', JSON.stringify(db.user?.id || null));
      } catch {}
    };
    const client = {
      _db: db,
      from: (t) => new Query(db, t),
      rpc: async (name, args = {}) => {
        db.log.push({ rpc: name, args: clone(args) });
        const fn = db.rpc[name];
        if (!fn) return { data: null, error: { message: 'mock: rpc ' + name + ' missing' } };
        try {
          return { data: clone(await fn(args, db)), error: null };
        } catch (e) {
          return { data: null, error: { message: e.message, code: e.code } };
        }
      },
      auth: {
        getSession: async () => ({ data: { session: session() }, error: null }),
        getUser: async () => ({ data: { user: db.user }, error: null }),
        onAuthStateChange: (fn) => {
          listeners.add(fn);
          return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } };
        },
        signInWithPassword: async ({ email, password }) => {
          const u = db.users.find((x) => x.email === email && x.password === password);
          if (!u) return { data: null, error: { message: 'Invalid login credentials', code: 'invalid_credentials' } };
          db.user = u;
          persist();
          setTimeout(() => emit('SIGNED_IN'));
          return { data: { user: u, session: session() }, error: null };
        },
        signUp: async ({ email, password, options }) => {
          if (db.users.some((u) => u.email === email)) return { data: null, error: { message: 'User already registered' } };
          const u = { id: uuid(), email, password, user_metadata: options?.data || {} };
          db.users.push(u);
          (db.tables.profiles ||= []).push({ id: u.id, full_name: options?.data?.full_name || '', phone: options?.data?.contact_phone || '', role: 'buyer', disabled: false, created_at: new Date().toISOString() });
          db.user = u;
          persist();
          setTimeout(() => emit('SIGNED_IN'));
          return { data: { user: u, session: session() }, error: null };
        },
        signOut: async () => {
          db.user = null;
          persist();
          setTimeout(() => emit('SIGNED_OUT'));
          return { error: null };
        },
        setSession: async () => ({ data: { session: session() }, error: null }),
        updateUser: async (p) => ({ data: { user: Object.assign(db.user, p) }, error: null }),
        resetPasswordForEmail: async () => ({ data: {}, error: null }),
        signInWithOAuth: async () => ({ data: {}, error: null }),
      },
      storage: {
        from: () => ({
          getPublicUrl: (p) => ({ data: { publicUrl: p.startsWith('data:') || p.startsWith('http') ? p : 'https://storage.invalid/' + p } }),
          upload: async (path) => ({ data: { path }, error: null }),
        }),
      },
      functions: {
        invoke: async (name, { body } = {}) => {
          const fn = db.functions[name];
          if (!fn) return { data: null, error: { message: 'missing function', context: { json: async () => ({ code: 'not_found' }) } } };
          return fn(body, db);
        },
      },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {},
      login(email) {
        db.user = db.users.find((u) => u.email === email) || null;
        persist();
        emit('SIGNED_IN');
      },
    };
    return client;
  }
  window.createMockSupabase = createMockClient;
})();
