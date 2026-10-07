# Pinned browser client

Supabase JavaScript 2.57.0, MIT license, copied from the package's `dist/umd/supabase.js` at https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/dist/umd/supabase.js.

Upstream SHA-256: `14998cfa794c1fab3f8b3c45cbaa60ca3721af53b8acabfa27658f453e52b267`. Repository SHA-256: `ac53454710a0cf1b5fa3a731f146f26ef1d2cc6f6b73e8b6530ddd0729c423c1`. Only a terminal newline was added. LICENSE is retained unchanged in this directory.

The main site and catalog load this same-origin bundle rather than an external ESM dependency graph, keeping the existing pinned version, Auth storage key and client configuration. Preview uses its existing local simulation client. The service worker precaches this file.

Initial HTML contains public browsing and seller-specific layout shells. The saved account/mode selects the initial presentation only. It grants no database or seller permissions; live session/profile/store checks remain in refresh. No stock, sales totals or customer data are invented or cached by the shell. Startup splash is hidden from the first paint. Core/ancillary requests run in parallel where independent, while variant reads still use the queried product IDs. Secondary customer records do not block first rendering; edit and inventory actions continue using live authorization.

Verification: `node --test tests/mobile-start.test.mjs tests/seller-resume.test.mjs tests/main-loading.test.mjs`. Tests exercise the actual refresh with unresolved secondary records, the browser SDK constructor/session API, saved-role isolation, and network-only mascot behavior. A real Android device was not available for visual timing measurements.
