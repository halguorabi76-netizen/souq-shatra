# سوق الشطرة

سوق عربي يعمل بواجهات الزبون والتاجر وسائق التوصيل، مع لوحة إدارة مستقلة. البيانات الحقيقية والحسابات والطلبات محفوظة في Supabase، وتُحمى بيانات الأطراف بسياسات قاعدة البيانات وصلاحيات الإدارة.

## تطوير الواجهات

`index.html` هو مصدر الصفحات، و`admin-workspace.js` يعرض لوحة الإدارة وملفات المستخدمين من البيانات المصرح بها. لا تعدّل `admin.html` أو `catalog.html` أو `preview.html` يدويًا؛ يُولّدها `npm run build` وينسخ الملفات إلى `www/` للنسخ الأصلية. GitHub Pages ينشر الملفات المولّدة من جذر `main`.

```sh
npm run build
npm test
python3 -m http.server 4173
```

- `admin.html`: دخول بحساب مدير معتمد، قوائم الزبائن والتجار والسائقين، البحث والتصفية، الملفات والطلبات والمخزون والموافقات والتسويات.
- `admin.html?section=preview`: المعاينة داخل الإدارة وتحت الرأس المشترك، بلا تسجيل دخول باستخدام عميل محلي، بلا استيراد إعدادات Supabase أو اتصال بالخادم. إضافة `&role=buyer` أو `&role=seller` أو `&role=driver` تفتح الواجهة مباشرة داخل الإدارة. الرابط القديم `preview.html` يتحوّل تلقائيًا إلى قسم المعاينة في الإدارة؛ يبقى ملفًا داخليًا لتشغيل الواجهات المعزولة.
- بيانات المعاينة محفوظة في مفاتيح مستقلة في المتصفح؛ إعادة ضبط التجربة لا تمس السوق. لا تستعمل بيانات أشخاص حقيقيين في المعاينة.
- حساب التاجر يُعرَف بملكية المتجر، والسائق بطلب تسجيله؛ قوائم الزبائن تستبعد حسابات الإدارة والتجار والسائقين. مبيعات المواد تستبعد حصة التطبيق وأجرة التوصيل، وأرباح السائق تشمل أجرة الطلبات المسلّمة فقط.

تم فحص الرئيسية والملفات على عرضي 390 و1440 بكسل، باستخدام سجلات محلية مصطنعة في متصفح الاختبار فقط. اختبارات الوحدة تشمل فصل الحسابات والمال والبيانات، ودورة طلب المعاينة والإشعارات. اختبار إجراءات الإدارة على بيانات الإنتاج يحتاج جلسة مدير فعلية؛ لا ننفّذ إيقافًا أو موافقة أو تحويلًا حقيقيًا بغرض الاختبار.

## تشغيل الموقع وتثبيته

ارفع الملفات إلى استضافة HTTPS مثل GitHub Pages. على أندرويد افتح الرابط في Chrome واختر «تثبيت التطبيق». على آيفون افتحه في Safari ثم مشاركة ← «إضافة إلى الشاشة الرئيسية». يمكن فتح الصفحة بعد تحميلها مرة واحدة حتى عند انقطاع الإنترنت؛ الخطوط الخارجية قد لا تتوفر بلا اتصال.

## إنشاء مشروع أندرويد وآيفون

ثبّت Node.js، ثم نفّذ:

```sh
npm install
npm run build
npx cap add android
npx cap add ios
npm run sync
```

لبناء أندرويد افتح المشروع بالأمر `npx cap open android` باستخدام Android Studio. لبناء آيفون افتحه بالأمر `npx cap open ios` على جهاز Mac مع Xcode. بعد تعديل ملفات الموقع شغّل `npm run sync` قبل بناء النسختين. هذه الإعدادات لا تنشر التطبيق تلقائياً في المتاجر؛ النشر يحتاج حسابات المطورين وإعداد توقيع التطبيق.

## حماية البيانات والنشر

يحتوي `config.js` على عنوان المشروع والمفتاح العام للمتصفح فقط؛ لا تضع مفتاح `service_role` في الموقع. صلاحيات الإدارة تعتمد على سياسات Supabase والدوال المحمية، وليس إخفاء الأزرار وحده. لا تُشغّل سكربتات SQL الموجودة في المستودع مجددًا دون مراجعة حالة قاعدة البيانات الحالية.

قبل النشر، اجلب آخر `main` وادمج أي تغييرات متزامنة، أعد البناء والاختبار، ثم ادفع تحديثًا عاديًا بلا force push. ملفات `www/` ناتج بناء محلي ولا تُضاف إلى المستودع.


### Category attributes and variants (v60)

The product editor reads `catalog_categories` from Supabase. Choose a section and subcategory to load their combined attributes. An attribute becomes a variant axis only when the merchant explicitly enables it; common specifications remain on `products.attributes`. The initial catalog includes 28 sections and 102 subcategories. Admins can add and edit definitions under **الفئات والخصائص** in `admin.html` without editing source files. Fields have stable keys, labels, text/number/date/select types, options, required flags, and variant eligibility.

`save_product_bundle` saves a parent product and up to 200 independent variants atomically. Each variant carries identity attributes, SKU, barcode, regular/sale prices, stock, availability, image and shipping weight. Existing IDs survive regeneration; omitted rows are archived. Version checks reject stale inventory forms. A product remains one marketplace card; buyers choose a specific variant before adding it to the cart. Checkout keys include both product ID and variant ID, and the database sets prices and records immutable order snapshots.

`place_order` locks parent products and variants in stable order and reserves the chosen stock. Cancellation credits the exact variant once. Orders made before a legacy product was converted return into a separate reserve; the seller can allocate that reserve to the correct variant. Seller inventory displays per-variant balances, CSV exports, and a movement ledger. Store merchandising groups remain independent of the global category taxonomy.

Additive SQL is in `db/category-variants.sql` and `db/category-seeds.sql`; neither deletes existing products nor historical order items. New tables have RLS, restricted grants, and explicit owner/admin checks. Run `npm run build` and `npm test`. Transactional database tests are in `tests/variants-database.sql` followed by `tests/variants-compatibility.sql`; wrap them in `BEGIN`/`ROLLBACK` on an environment with the stated test account IDs. Test fixtures are rolled back and must never be published as live merchandise. `preview.html` simulates the same variant/cart contract locally without production authentication or network writes.
