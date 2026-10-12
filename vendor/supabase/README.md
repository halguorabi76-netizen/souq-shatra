# Pinned browser client

Supabase JavaScript 2.57.0, MIT license, copied from the package's `dist/umd/supabase.js` at https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/dist/umd/supabase.js.

Upstream SHA-256: `14998cfa794c1fab3f8b3c45cbaa60ca3721af53b8acabfa27658f453e52b267`. Repository SHA-256: `ac53454710a0cf1b5fa3a731f146f26ef1d2cc6f6b73e8b6530ddd0729c423c1`. Only a terminal newline was added. LICENSE is retained unchanged in this directory.

The main site and catalog load this same-origin bundle rather than an external ESM dependency graph, keeping the existing pinned version, Auth storage key and client configuration. Preview uses its existing local simulation client. The service worker precaches this file.

Initial HTML contains public browsing and seller-specific layout shells. The saved account/mode selects the initial presentation only. It grants no database or seller permissions; live session/profile/store checks remain in refresh. No stock, sales totals or customer data are invented or cached by the shell. Startup splash is hidden from the first paint. Core/ancillary requests run in parallel where independent, while variant reads still use the queried product IDs. Secondary customer records do not block first rendering; edit and inventory actions continue using live authorization.

Verification: `node --test tests/mobile-start.test.mjs tests/seller-resume.test.mjs tests/main-loading.test.mjs`. Tests exercise the actual refresh with unresolved secondary records, the browser SDK constructor/session API, saved-role isolation, and network-only mascot behavior. A real Android device was not available for visual timing measurements.

## Administration client

The admin portal pins Supabase JavaScript 2.117.3 from the official npm package, copied verbatim from `dist/umd/supabase.js`. SHA-256: `d6a5c4414a5d4ce646d9c1de223aa7067d3ff664c15394ffeb7fcffc763354a3`. The same MIT license applies. This version uses the upstream lockless Auth coordination introduced in 2.107.0, so a stalled legacy Navigator Lock in another tab cannot block admin session initialization. Public pages retain 2.57.0.

Verification: `node --test tests/admin-session-lock.test.mjs` reproduces a held browser lock against the old SDK and verifies the new SDK resolves the same valid stored session without acquiring that lock. Session storage, server-side role checks and RLS are retained.
