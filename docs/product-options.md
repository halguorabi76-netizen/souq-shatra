# Optional product properties and inventory

The 28 sections and 102 subcategories inherit appropriate optional properties. No property is required merely because a merchant chose a category. Category changes archive variants rather than deleting historical identities.

The product editor supports 38 named color swatches, an additional named hex color picker, apparel/footwear/baby size suggestions, category-specific appliance types and capacities, food packaging/net content, electronics storage/RAM, furniture dimensions, vehicle compatibility and other category-specific details. Suggestions are editable, not a universal list of valid values. Copy technical specifications, safety/allergen statements and units from the actual packaging/manual; do not infer them from category selection.

Merchants can define up to 20 product-scoped custom properties, each with an allowlisted icon, stable key, label, text/number/date/options type, suggestions, and optional independent variant inventory. Metadata is persisted under `_custom_options` and `_color_swatches`, validated on the server, and never printed as customer specifications. Custom values and labels are HTML-escaped.

Stock belongs to a sellable combination: blue + M has one quantity, not overlapping color and size inventories. Active rows retain IDs, versions, prices, SKUs and images when regenerated; new rows start at zero. Merchant-only summaries total physical stock by attribute, including temporarily unavailable rows but excluding archived rows; the saleable product total excludes unavailable rows. Each combination can have its own price, offer price, SKU, barcode, image and shipping weight. Existing checkout locking, cancellation restoration, version checks and stock movement history remain unchanged.

Limits: 12 axes, 200 submitted rows including archives, 500-character values/labels, 20 KB metadata. These keep cross-products bounded; select only choices actually stocked. Simple products continue using their single quantity without enabling variants. Neither this feature nor its rollback tests delete existing products, accounts, orders or stock.

Tests: `node --test tests/product-options.test.mjs tests/variants.test.mjs`; `tests/product-options-database.sql` runs real save/checkout/cancellation/security checks inside a rolled-back transaction and leaves no fixtures. Browser visual QA was unavailable in the execution environment; tests cover generated markup and handler behavior, not a real Android session.

Primary references used for schema design:
- Google Merchant product specification: https://support.google.com/merchants/answer/7052112?hl=en
- Google color, size and variant properties: https://support.google.com/merchants/answer/6324487?hl=en and https://support.google.com/merchants/answer/6324492?hl=en
- GS1 product attributes/packaged net content: https://www.gs1.org/services/gdsn/global-data-model
- Samsung appliance specifications (capacity, colors, electrical/dimension properties): https://www.samsung.com/iq_ar/business/refrigerators/side-by-side/rs8000nc-8-side-by-side-refrigerator-with-spacemax-technology-609l-silver-rs68a8820s9-lv/

These references guide optional fields, not claims of certification or automatic validation of a merchant's goods.
