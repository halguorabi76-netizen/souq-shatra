# Manual product variants

The existing products, product_variants, catalog definitions, atomic checkout and stock movement system are reused. No second inventory or order model is introduced. Existing catalog categories, UUID relationships, costs, orders and legacy variant identities are preserved.

The seller editor starts with the main image and basic fields. Categories are required; subcategories are optional. Custom categories and units are stored in existing product attributes. Advanced specifications, custom filters, store grouping, promotions, stock alerts, store code, SKU and barcode remain available in a closed advanced section. Cost is no longer editable in this form; existing cost records remain unchanged.

Variants are added manually. The base row and inherited rows follow the main price and image; explicit overrides are retained. Existing legacy variants keep their existing prices, IDs, SKUs, image paths and stock versions. Each variant has independent stock and checkout continues to use the existing variant_id, transactional row locks and order snapshots. The product total is an aggregate only. Nonexistent combinations cannot be selected for purchase.

Customers see product details, available options, immediate quantity controls and a public store card linked by store ID. Owners see a preview before editing and can archive or confirm deletion. Historical products are retained inactive when a previous order references them.

## Database changes

- `supabase/manual-product-variants.sql` updates two existing inventory triggers to preserve the main price for manual variants and the existing four-argument attribute validator to support custom sections. Legacy price aggregation remains unchanged.
- `supabase/professional-identifiers.sql` adds optional professional usernames to profiles and stores, unique indexes and format checks, plus an admin-controlled public verification flag. Existing professional accounts receive deterministic usernames derived from their UUIDs; buyers have no username requirement. Authenticated RPCs enforce account ownership. New professional accounts receive identifiers automatically.
- A guarded deletion RPC retains historically ordered products. No existing products, variants, orders, users or stores are deleted by these migrations. Existing Auth, RLS and atomic checkout are preserved. Public pages show verification status only, never private identity documents.

## Verification

- `npm run build` and `npm test`: 142 passing tests.
- `PLAYWRIGHT_CHROME=/path/to/chrome-headless-shell node tests/product-flow.browser.cjs`: real Chromium exercises seller create/edit, the base variant, three manual combinations, image and price inheritance/override, independent stock, owner preview, invalid-combination prevention, quantity stability, double-click protection, cart and order variant snapshots, checkout debit and real store navigation. Layout checks cover 390, 820 and 1440 pixel widths. The preview uses local isolated data, not production writes.
- `tests/manual-variants-database.sql`: transactional database fixtures exercise ordinary/custom products, independent checkout debit/cancellation restoration, snapshots, editing, archive/historical deletion, verification authorization, unique merchant/driver usernames and actual authenticated RLS. The entire fixture transaction rolls back.
- Old test fixtures were repaired for current browser helpers, RPC responses, isolated module imports and independent admin authentication. Cartesian-generation tests now verify manual additions and legacy preservation; stock and authorization assertions remain.

The independent fast admin authorization entry is preserved by the build. Preview now uses the same full-page layout and network-only loading controller as the main site, with no artificial loading timer. Private production Google sign-in and physical Android-device behavior require account/device testing beyond the isolated browser checks.

Follow-up verification preserves concurrent main changes. Legacy `sale_unit` values load into the single unit field and stay synchronized on save; custom sections expose an optional subcategory immediately. Existing custom properties are reused when selected as variant axes. The reconciliation migration removes only superseded helper functions, duplicate constraints/indexes and temporary direct username grants, retaining the professional RPC, unique indexes, usernames and all existing records.
