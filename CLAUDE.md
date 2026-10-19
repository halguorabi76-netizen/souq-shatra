# سوق الشطرة — notes for Claude

Arabic (RTL) local marketplace: buyers, sellers, drivers and an admin portal.

## Stack (do not replace without the owner's approval)
- Plain HTML, CSS and JavaScript: `index.html`, `admin.html` and the `*.js` / `*.css` files at the repo root. No framework, no bundler.
- Supabase (`vendor/supabase/supabase-2.117.3.js`, project `nbktyynshqldyerqtjrd`). Database changes are SQL files in `supabase/migrations` and `supabase/manual`, run by the owner.
- Capacitor 7 wraps the same files for Android/iOS. `npm run build` copies them to `www/`.
- Tests: `npm test` and `bash tests/db/run.sh`.

## Design skills and who does what
- **ui-ux-pro-max** (account skill): design system, components, tokens, visual consistency.
- **frontend-design** (plugin from `anthropics/claude-code`, enabled in `.claude/settings.json`): creative direction and distinctive visual identity.
- **web-design-guidelines** (`.claude/skills/web-design-guidelines`, from `vercel-labs/agent-skills`): review of quality, usability and accessibility. It fetches its rules from `raw.githubusercontent.com` at review time.

Framework skills (React, Next.js, Tailwind, Vercel deploy) do not apply to this stack.

## Rules
- Keep every existing feature, and keep Supabase data, users, orders, stock and permissions intact.
- Keep the brand: navy `#3547a5` / `#101f48`, sand `#d7b890`, Tajawal for the UI, Aref Ruqaa for the wordmark only. The full identity is in the design-system artifact.
- RTL first; layouts must work on phone, iPad (portrait and landscape) and laptop.
- Shared UI polish lives in `ui-polish.css`, which is loaded last. Bump the `?v=` query and the `sw.js` cache name when a cached file changes.
