// Optional category-specific suggestions, never inferred specifications or stock.
export const OPTION_ICONS=['🏷️','🎨','📏','👕','👟','⚡','📱','💻','🧊','🪑','🧴','🍎','🥤','📦','⚖️','🛠️','🚗','💎','🌱','🐾','📚','🧸','⭐'];
export const COLOR_PALETTE=[['أسود','#111827'],['أبيض','#ffffff'],['رمادي','#808080'],['رمادي فاتح','#cbd5e1'],['رمادي غامق','#475569'],['فضي','#c0c0c0'],['ذهبي','#d4af37'],['نحاسي','#b87333'],['برونزي','#cd7f32'],['أحمر','#ef4444'],['أحمر غامق','#991b1b'],['عنابي','#800020'],['وردي','#ec4899'],['وردي فاتح','#f9a8d4'],['فوشي','#d946ef'],['أزرق','#2563eb'],['أزرق فاتح','#93c5fd'],['كحلي','#172554'],['سماوي','#38bdf8'],['تركواز','#2dd4bf'],['أخضر','#22c55e'],['أخضر غامق','#166534'],['زيتي','#65733c'],['نعناعي','#a7f3d0'],['أصفر','#facc15'],['خردلي','#c49b13'],['برتقالي','#f97316'],['مشمشي','#fdba74'],['بنفسجي','#7c3aed'],['ليلكي','#c4b5fd'],['موف','#a78bfa'],['بني','#92400e'],['بني فاتح','#c29b78'],['بيج','#dbc4a1'],['كريمي','#fff2cf'],['عاجي','#fffff0'],['شفاف','transparent'],['متعدد الألوان','conic-gradient(#f43f5e,#facc15,#22c55e,#3b82f6,#a855f7,#f43f5e)']];
const A=(key,label,variant=false,options=[],type='text')=>({key,label,variant,options,type,required:false});
const yes=['نعم','لا'];
const extras={
 'مواد غذائية':[A('food_type','نوع المادة الغذائية',true),A('ingredients','المكونات حسب العبوة'),A('allergens','مسببات الحساسية حسب الملصق'),A('storage_condition','شروط الحفظ'),A('sale_unit','وحدة البيع',true,['قطعة','عبوة','كغم','غرام','صندوق']),A('batch','رقم التشغيلة')],
 'خضار وفواكه':[A('sale_unit','وحدة البيع',true,['كغم','ربطة','حبة','صندوق']),A('grade','درجة الجودة',true),A('cultivation','طريقة الزراعة'),A('storage_condition','شروط الحفظ')],
 'تمور':[A('grade','درجة الجودة',true),A('pitted','منزوع النوى',true,yes),A('sale_unit','وحدة البيع',true,['عبوة','كغم','صندوق']),A('storage_condition','شروط الحفظ')],
 'ملابس':[A('pattern','النقشة',true,['سادة','مخطط','مربعات','منقوش','مطبوع']),A('size_system','نظام المقاس',false,['حروف','أوروبي EU','بريطاني UK','أمريكي US','عمر الطفل','سم']),A('size_type','فئة المقاس',false,['عادي','كبير','صغير','طويل']),A('care','تعليمات العناية'),A('closure','طريقة الإغلاق')],
 'أحذية':[A('size_system','نظام المقاس',false,['أوروبي EU','بريطاني UK','أمريكي US','سم']),A('width','عرض الحذاء',true,['عادي','ضيق','عريض']),A('sole','خامة النعل'),A('closure','طريقة الإغلاق',false,['رباط','لاصق','سحاب','بدون رباط']),A('heel_height','ارتفاع الكعب')],
 'مشروبات':[A('brand','الماركة'),A('ingredients','المكونات حسب العبوة'),A('allergens','مسببات الحساسية حسب الملصق'),A('sugar','وصف السكر حسب العبوة'),A('storage_condition','شروط الحفظ'),A('made','تاريخ الإنتاج',false,[],'date'),A('expiry','تاريخ الانتهاء',false,[],'date')],
 'عطور وتجميل':[A('color','اللون',true),A('ingredients','المكونات حسب العبوة'),A('expiry','تاريخ الانتهاء',false,[],'date'),A('use','طريقة الاستخدام'),A('gender','الفئة المستهدفة',false,['رجالي','نسائي','للجميع'])],
 'أجهزة':[A('device_type','نوع الجهاز',true,['هاتف','سماعة','طابعة','كاميرا','راوتر','جهاز ألعاب','إكسسوار']),A('dimensions','الأبعاد'),A('battery_capacity','سعة البطارية'),A('ports','المنافذ'),A('connectivity','الشبكات والاتصال'),A('included','محتويات العلبة')],
 'حاسبات وتابلت':[A('device_type','نوع الجهاز / المكوّن',true),A('storage_type','نوع التخزين',true,['SSD','HDD','NVMe','eMMC']),A('condition','حالة الجهاز',false,['جديد','مستعمل','مجدد']),A('ports','المنافذ'),A('screen_resolution','دقة الشاشة'),A('refresh_rate','معدل تحديث الشاشة'),A('battery_capacity','سعة البطارية'),A('included','محتويات العلبة')],
 'أجهزة كهربائية':[A('appliance_type','نوع الجهاز الكهربائي',true,['ثلاجة','مجمدة','غسالة','نشافة','مكيف','فرن','طباخ','مكنسة','خلاط','مروحة','مكواة','غلاية','سخان','مولد']),A('voltage','الفولتية'),A('frequency','التردد'),A('dimensions','الأبعاد'),A('installation','نوع التركيب',false,['مستقل','مدمج','جداري','محمول']),A('condition','حالة الجهاز',false,['جديد','مستعمل','مجدد'])],
 'تلفزيونات':[A('color','اللون',true),A('model','الموديل'),A('refresh_rate','معدل التحديث'),A('ports','المنافذ'),A('mount','طريقة التثبيت'),A('dimensions','الأبعاد'),A('voltage','الفولتية')],
 'أثاث':[A('width','العرض'),A('height','الارتفاع'),A('depth','العمق'),A('assembly','يتطلب تركيبًا',false,yes),A('finish','التشطيب',true),A('style','الطراز')],
 'منزلية':[A('brand','الماركة'),A('dimensions','الأبعاد'),A('care','تعليمات العناية'),A('pattern','النقشة',true)],
 'مجوهرات وإكسسوارات':[A('stone','نوع الحجر',true),A('stone_color','لون الحجر',true),A('length','الطول',true),A('finish','الطلاء / التشطيب',true)],
 'ساعات':[A('model','الموديل'),A('movement','نوع الحركة',false,['كوارتز','أوتوماتيك','ميكانيكي','رقمي']),A('strap_color','لون السوار',true),A('strap_size','مقاس السوار',true),A('warranty','الضمان')],
 'ألعاب أطفال':[A('material','الخامة'),A('dimensions','الأبعاد'),A('players','عدد اللاعبين'),A('warnings','تحذيرات السلامة حسب العبوة'),A('included','محتويات العبوة')],
 'مستلزمات أطفال':[A('brand','الماركة'),A('material','الخامة'),A('baby_weight','وزن الطفل المناسب'),A('warnings','تحذيرات الاستخدام حسب العبوة')],
 'كتب وقرطاسية':[A('brand','الناشر / الماركة'),A('material','الخامة'),A('sale_unit','وحدة البيع',true,['قطعة','مجموعة','علبة'])],
 'قطع سيارات':[A('part_number','رقم القطعة'),A('condition','الحالة',false,['جديد','مستعمل','مجدد']),A('position','موضع القطعة',true,['أمام','خلف','يمين','يسار']),A('color','اللون',true),A('engine','المحرك المتوافق'),A('warranty','الضمان')],
 'إطارات وبطاريات':[A('brand','الماركة'),A('model','الموديل'),A('warranty','الضمان'),A('condition','الحالة',false,['جديد','مستعمل'])],
 'مواد بناء وأدوات':[A('sale_unit','وحدة البيع',true,['قطعة','متر','متر مربع','كيس','عبوة','كغم','طن']),A('grade','الدرجة / التصنيف',true),A('use','الاستخدام'),A('standard','المواصفة حسب المصنع')],
 'رياضة':[A('brand','الماركة'),A('age','الفئة العمرية'),A('dimensions','الأبعاد'),A('load_capacity','الحمولة القصوى'),A('sport','نوع الرياضة')],
 'حقائب':[A('brand','الماركة'),A('dimensions','الأبعاد'),A('closure','طريقة الإغلاق'),A('pockets','عدد الجيوب'),A('wheels','عدد العجلات'),A('water','مقاومة الماء حسب المصنع')],
 'نظارات':[A('brand','الماركة'),A('model','الموديل'),A('frame_shape','شكل الإطار',true),A('lens_type','نوع العدسة',true),A('uv','الحماية حسب المصنع'),A('gender','الفئة المستهدفة')],
 'منتجات تنظيف':[A('brand','الماركة'),A('surface','الأسطح المناسبة'),A('ingredients','المكونات حسب الملصق'),A('warnings','تحذيرات السلامة حسب الملصق'),A('storage_condition','شروط الحفظ')],
 'مستلزمات حيوانات':[A('brand','الماركة'),A('breed_size','حجم الحيوان',true,['صغير','متوسط','كبير']),A('ingredients','المكونات حسب العبوة'),A('storage_condition','شروط الحفظ')],
 'زراعة وحدائق':[A('brand','الماركة'),A('season','موسم الزراعة'),A('care','تعليمات العناية'),A('storage_condition','شروط الحفظ')],
 'أخرى':[A('origin','بلد المنشأ'),A('sale_unit','وحدة البيع',true,['قطعة','مجموعة','عبوة']),A('condition','الحالة')],
 'قمصان وتيشيرتات':[A('sleeve','نوع الأكمام',true,['قصير','طويل','بدون أكمام']),A('neckline','شكل الياقة')],
 'بناطيل':[A('waist','مقاس الخصر',true),A('inseam','طول الساق الداخلي',true)],
 'فساتين وعبايات':[A('length','الطول',true),A('sleeve','نوع الأكمام',true)],
 'ملابس داخلية':[A('pack_count','عدد القطع في العبوة',true,[],'number')],
 'ثلاجات':[A('fridge_type','نوع الثلاجة',true,['باب واحد','بابان','جنبًا إلى جنب','باب فرنسي','مجمدة']),A('net_capacity','السعة الصافية باللتر',true),A('defrost','نظام إزالة الثلج',false,['No Frost','يدوي']),A('compressor','نوع الضاغط')],
 'غسالات':[A('washer_type','نوع الغسالة',true,['أمامية','علوية','حوضان','غسالة ونشافة']),A('wash_capacity','سعة الغسيل بالكغم',true),A('dry_capacity','سعة التجفيف بالكغم',true),A('spin','سرعة الدوران'),A('motor','نوع المحرك')],
 'مكيفات':[A('ac_type','نوع المكيف',true,['سبلت','شباك','محمول','مركزي']),A('inverter','إنفرتر',false,yes),A('refrigerant','غاز التبريد'),A('heating','تبريد وتدفئة',false,yes)],
 'أفران':[A('oven_type','نوع الفرن',true,['غاز','كهرباء','ميكروويف','مختلط']),A('burners','عدد الشعلات',true,[],'number'),A('oven_capacity','سعة الفرن باللتر',true)],
 'هواتف':[A('screen','حجم الشاشة'),A('camera','الكاميرا'),A('sim','عدد / نوع الشرائح'),A('os','نظام التشغيل')],
 'سماعات':[A('headphone_type','نوع السماعة',true,['داخل الأذن','فوق الأذن','على الأذن','مكبر صوت']),A('noise_cancel','إلغاء الضوضاء',false,yes)],
 'أسرة':[A('bed_size','مقاس السرير',true),A('mattress','المرتبة مشمولة',false,yes)],
 'أرائك':[A('seats','عدد المقاعد',true,[],'number'),A('upholstery','خامة التنجيد',true)],
 'خزائن':[A('doors','عدد الأبواب',true,[],'number')],
 'مفروشات':[A('bed_size','مقاس السرير',true),A('thread_count','عدد الخيوط')],
 'حفاضات':[A('diaper_type','نوع الحفاض',true,['لاصق','سروال','قماش']),A('pack_count','عدد الحفاضات في العبوة',true,[],'number')],
 'كتب':[A('isbn','ISBN'),A('binding','نوع التجليد',true,['ورقي','صلب']),A('genre','تصنيف الكتاب')],
 'إطارات':[A('tire_width','عرض الإطار',true),A('aspect_ratio','نسبة الارتفاع',true),A('rim','قطر الجنط',true),A('tire_season','موسم الإطار'),A('tire_type','نوع الإطار',true)],
 'بطاريات':[A('battery_type','نوع البطارية',true),A('cca','تيار التشغيل البارد CCA'),A('polarity','اتجاه الأقطاب',true)],
 'دهانات':[A('finish','التشطيب',true,['مطفي','نصف لامع','لامع']),A('paint_base','أساس الدهان'),A('coverage','مساحة التغطية حسب المصنع')],
 'دراجات':[A('frame_size','مقاس الإطار',true),A('gears','عدد السرعات',true,[],'number'),A('brakes','نوع الفرامل')],
 'غذاء الحيوانات':[A('food_type','نوع الغذاء',true,['جاف','رطب','مكافآت']),A('allergens','مسببات الحساسية حسب العبوة')],
 'أسمدة':[A('fertilizer_type','نوع السماد',true),A('npk','تركيبة NPK حسب العبوة'),A('warnings','تحذيرات الاستخدام حسب الملصق')]
};
export function mergeDefinitions(...lists){return [...new Map(lists.flat().map(d=>[d.key,d])).values()];}
export function expandedCategory(c){return {...c,attributes:mergeDefinitions(extras[c.name]||[],c.attributes||[]).map(d=>({...d,required:false}))};}
export function customDefinitions(attributes){const a=attributes?._custom_options;return Array.isArray(a)?a.filter(d=>/^custom_[a-z0-9_]{1,40}$/.test(d?.key||'')):[];}
export function validateCustom(defs){if(defs.length>20)throw Error('الحد الأقصى ٢٠ خاصية مخصصة');const keys=new Set();for(const d of defs){if(!/^custom_[a-z0-9_]{1,40}$/.test(d.key)||keys.has(d.key)||!String(d.label||'').trim()||d.label.length>80||!OPTION_ICONS.includes(d.icon)||!['text','number','date','select'].includes(d.type)||typeof d.variant!=='boolean'||!Array.isArray(d.options)||d.options.length>100||d.options.some(v=>typeof v!=='string'||!v.trim()||v.length>100))throw Error('راجع اسم ونوع وخيارات الخاصية المخصصة');keys.add(d.key);}return defs;}
export function suggestions(d,category,categories){if(d.options?.length)return d.options;if(['color','frame','lens','strap_color','stone_color','shade'].includes(d.key))return COLOR_PALETTE.map(c=>c[0]);const c=categories.find(c=>c.id===category),root=categories.find(x=>x.id===c?.parent_id)?.name||c?.name;if(d.key==='size'){if(root==='أحذية')return Array.from({length:36},(_,i)=>String(15+i));if(root==='ملابس')return c?.name==='ملابس أطفال'?['حديث الولادة','0–3 أشهر','3–6 أشهر','6–9 أشهر','9–12 شهرًا','1–2 سنة','2–3 سنوات','3–4 سنوات','4–5 سنوات','5–6 سنوات','6–8 سنوات','8–10 سنوات','10–12 سنة','12–14 سنة']:['XXS','XS','S','M','L','XL','XXL','3XL','4XL','5XL','مقاس موحد',...Array.from({length:21},(_,i)=>String(28+i*2))];if(root==='مستلزمات أطفال')return ['حديث الولادة','1','2','3','4','5','6','7','8'];}if(d.key==='storage')return ['32 GB','64 GB','128 GB','256 GB','512 GB','1 TB','2 TB'];if(d.key==='ram')return ['2 GB','4 GB','6 GB','8 GB','12 GB','16 GB','24 GB','32 GB','64 GB'];return [];}
export function stockBreakdown(rows,defs){const active=rows.filter(v=>!v.archived);return defs.filter(d=>active.some(v=>v.attributes?.[d.key])).map(d=>({key:d.key,label:d.label,values:[...new Set(active.map(v=>v.attributes?.[d.key]).filter(Boolean))].map(value=>({value,stock:active.filter(v=>v.attributes?.[d.key]===value).reduce((n,v)=>n+(Number(v.stock)||0),0)}))}));}
export function validateAttributeValue(d,value){const v=String(value??'').trim();if(!v||v.length>500)throw Error('راجع قيمة '+d.label+'؛ الحد الأقصى ٥٠٠ حرف');if(d.type==='number'&&!/^[0-9]+([.][0-9]+)?$/.test(v))throw Error('أدخل رقمًا غير سالب في '+d.label);if(d.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v))throw Error('راجع تاريخ '+d.label);return v;}
