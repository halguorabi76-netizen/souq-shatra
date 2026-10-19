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
- **open-pinterest** (plugin from `Zuhair-01/open-pinterest`, enabled in `.claude/settings.json`): visual references from Pinterest. It needs `www.pinterest.com` and `i.pinimg.com` allowed in the environment's network access; without them say so plainly and never present references that were not actually viewed. Downloads go to `design-refs/` (git-ignored) and are inspiration only, never shipped.

When designing a new screen: gather 5–10 real references, credit each by link, analyse colour, type, cards, layout, motion and UX, then design an original take in the Souq Al-Shatra identity. Show it for approval before changing the site.

Framework skills (React, Next.js, Tailwind, Vercel deploy) do not apply to this stack.

## Rules
- Keep every existing feature, and keep Supabase data, users, orders, stock and permissions intact.
- Keep the brand: navy `#3547a5` / `#101f48`, sand `#d7b890`, Tajawal for the UI, Aref Ruqaa for the wordmark only. The full identity is in the design-system artifact.
- RTL first; layouts must work on phone, iPad (portrait and landscape) and laptop.
- Shared UI polish lives in `ui-polish.css`, which is loaded last. Bump the `?v=` query and the `sw.js` cache name when a cached file changes.
