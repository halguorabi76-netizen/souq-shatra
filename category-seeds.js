// Stable catalog IDs; definitions are editable in the administration portal.
const A=(key,label,variant=false,type='text',options=[])=>({key,label,variant,type,options,required:false});
const color=A('color','اللون',true),size=A('size','المقاس',true),brand=A('brand','الماركة'),type=A('type','النوع'),material=A('material','الخامة'),weight=A('weight','الوزن / الحجم',true),count=A('count','عدد القطع',true,'number'),age=A('age','الفئة العمرية'),gender=A('gender','الجنس',false,'select',['رجالي','نسائي','للجميع','أولاد','بنات']),volume=A('volume','الحجم / السعة',true),flavor=A('flavor','النكهة',true),pack=A('pack','نوع العبوة',true),model=A('model','الموديل'),ram=A('ram','RAM',true),storage=A('storage','سعة التخزين',true),warranty=A('warranty','الضمان'),origin=A('origin','بلد المنشأ'),made=A('made','تاريخ الإنتاج',false,'date'),expiry=A('expiry','تاريخ الانتهاء',false,'date'),dimensions=A('dimensions','الأبعاد'),manufacturer=A('manufacturer','الشركة المصنعة');
const roots=[
 ['مواد غذائية',[brand,origin],[['الحبوب والبقول',[weight,pack,count,made,expiry]],['الحلويات',[weight,flavor,pack,count,made,expiry]],['الألبان',[volume,flavor,pack,made,expiry]],['المعلبات والزيوت',[weight,volume,pack,count,made,expiry]],['اللحوم والأسماك',[weight,A('cut','نوع القطعة'),made,expiry]],['المخبوزات',[weight,flavor,count,made,expiry]]]],
 ['خضار وفواكه',[weight,origin,A('cultivar','الصنف'),A('freshness','الحالة / النضج')],[['خضار',[]],['فواكه',[]],['أعشاب طازجة',[]]]],
 ['تمور',[weight,origin,A('cultivar','صنف التمر'),pack,count,made,expiry],[['تمور طبيعية',[]],['تمور محشوة',[flavor]],['منتجات التمور',[flavor]]]],
 ['ملابس',[gender,type,brand,color,size,material,A('fit','القصة'),A('season','الموسم'),age],[['قمصان وتيشيرتات',[]],['بناطيل',[A('length','الطول',true)]],['فساتين وعبايات',[]],['ملابس أطفال',[]],['ملابس داخلية',[]],['ملابس رياضية',[]]]],
 ['أحذية',[size,color,gender,material,brand,A('shoe_type','نوع الحذاء')],[['أحذية رياضية',[]],['أحذية رسمية',[]],['صنادل',[]],['أحذية أطفال',[age]]]],
 ['مشروبات',[volume,flavor,pack,A('bottles','عدد العبوات',true,'number')],[['عصائر',[]],['مياه',[]],['شاي وقهوة',[weight]],['مشروبات غازية',[]]]],
 ['عطور وتجميل',[brand,volume,type],[['عطور',[A('scent','الرائحة / الإصدار',true),A('concentration','التركيز',true)]],['مكياج',[A('shade','اللون / الدرجة',true),A('skin','نوع البشرة')]],['عناية بالبشرة',[A('skin','نوع البشرة')]],['عناية بالشعر',[A('hair','نوع الشعر')]]]],
 ['أجهزة',[brand,model,color,warranty],[['هواتف',[storage,ram,A('edition','الإصدار',true),A('condition','حالة الجهاز',false,'select',['جديد','مستعمل','مجدد'])]],['إلكترونيات',[storage,A('edition','الإصدار',true),A('connection','نوع الاتصال')]],['سماعات',[A('connection','نوع الاتصال'),A('battery','البطارية')]]]],
 ['حاسبات وتابلت',[brand,model,A('processor','المعالج'),ram,storage,A('screen','الشاشة'),A('gpu','كرت الشاشة'),color,A('os','نظام التشغيل'),warranty],[['حاسبات محمولة',[]],['حاسبات مكتبية',[]],['تابلت',[]],['مكونات الحاسوب',[]]]],
 ['أجهزة كهربائية',[brand,model,volume,A('power','القدرة الكهربائية'),color,size,warranty,A('energy','كفاءة الطاقة')],[['ثلاجات',[]],['غسالات',[]],['مكيفات',[A('cooling','قدرة التبريد',true)]],['أفران',[]],['أجهزة صغيرة',[]]]],
 ['تلفزيونات',[brand,A('screen_size','حجم الشاشة',true),A('resolution','الدقة'),A('panel','نوع الشاشة'),A('smart','Smart',false,'select',['ذكي','غير ذكي']),A('os','نظام التشغيل'),warranty],[['تلفزيونات',[]],['شاشات',[]]]],
 ['أثاث',[type,dimensions,color,material,count],[['أرائك',[]],['أسرة',[]],['طاولات وكراسي',[]],['خزائن',[]]]],
 ['منزلية',[type,volume,size,material,color,count],[['أدوات المطبخ',[]],['أواني',[A('compatible','مصادر الحرارة المتوافقة')]],['مفروشات',[]],['ديكور',[]],['أدوات تنظيم',[]]]],
 ['مجوهرات وإكسسوارات',[type,material,color,size,A('mass','الوزن'),A('karat','العيار')],[['مجوهرات',[]],['إكسسوارات',[]],['ذهب وفضة',[]]]],
 ['ساعات',[brand,type,color,A('case_size','مقاس الهيكل',true),A('strap','نوع السوار'),A('water','مقاومة الماء')],[['ساعات يد',[]],['ساعات ذكية',[A('compatibility','التوافق')]],['ساعات حائط',[]]]],
 ['ألعاب أطفال',[age,type,color,volume,A('battery','البطارية')],[['ألعاب تعليمية',[]],['ألعاب إلكترونية',[]],['دمى',[gender]],['ألعاب خارجية',[]]]],
 ['مستلزمات أطفال',[age,size,volume,color,count,weight],[['حفاضات',[]],['تغذية الأطفال',[expiry]],['عربات ومقاعد',[]],['مستلزمات الرضاعة',[]]]],
 ['كتب وقرطاسية',[A('language','اللغة')],[['كتب',[A('author','المؤلف'),A('publisher','الناشر'),A('edition','الطبعة',true),A('pages','عدد الصفحات',false,'number')]],['دفاتر',[size,A('pages','عدد الصفحات',false,'number'),type]],['أدوات كتابة',[type,color,count]],['مستلزمات مكتبية',[type,size,count]]]],
 ['قطع سيارات',[brand,A('part','نوع القطعة'),manufacturer,A('car_model','موديل السيارة'),A('year','سنة الصنع'),A('compatibility','التوافق')],[['قطع محرك',[]],['هيكل وإضاءة',[]],['ملحقات سيارات',[]]]],
 ['إطارات وبطاريات',[size,type,made,A('compatibility','السيارات المتوافقة')],[['إطارات',[A('load','مؤشر الحمولة'),A('speed','مؤشر السرعة')]],['بطاريات',[A('capacity','السعة',true),A('voltage','الفولتية')]]]],
 ['مواد بناء وأدوات',[type,size,weight,A('length','الطول',true),A('thickness','السماكة',true),material,manufacturer],[['مواد بناء',[]],['أدوات يدوية',[]],['أدوات كهربائية',[A('power','القدرة الكهربائية'),warranty]],['دهانات',[color,volume]]]],
 ['رياضة',[type,size,weight,color,material],[['معدات رياضية',[]],['لياقة بدنية',[]],['تخييم',[dimensions]],['دراجات',[A('wheel','حجم العجلة',true)]]]],
 ['حقائب',[type,volume,color,material,gender],[['حقائب يد',[]],['حقائب ظهر',[]],['حقائب سفر',[size]]]],
 ['نظارات',[type,A('frame','لون الإطار',true),A('lens','لون العدسة',true),size,material],[['نظارات شمسية',[]],['نظارات طبية',[A('prescription','مواصفات العدسة')]],['إطارات نظارات',[]]]],
 ['منتجات تنظيف',[weight,volume,A('scent','الرائحة',true),type,A('bottles','عدد العبوات',true,'number')],[['منظفات منزلية',[]],['منظفات ملابس',[]],['مطهرات',[expiry]]]],
 ['مستلزمات حيوانات',[type,weight,volume,flavor,A('animal','نوع الحيوان'),age],[['غذاء الحيوانات',[expiry]],['عناية بالحيوانات',[]],['ألعاب وملحقات',[]]]],
 ['زراعة وحدائق',[type,weight,volume,A('cultivar','الصنف'),A('use','الاستخدام')],[['بذور',[made,expiry]],['نباتات',[age]],['أسمدة',[]],['أدوات حدائق',[material,size]]]],
 ['أخرى',[type,brand],[['سلع متنوعة',[color,size]],['منتجات يدوية',[material,dimensions]]]]
];
export const CATALOG_SEEDS=roots.flatMap(([name,attributes,children],i)=>{const root='b1000000-0000-4000-8000-'+String(i+1).padStart(12,'0');return [{id:root,parent_id:null,name,attributes,active:true,position:i},...children.map(([name,attributes],j)=>({id:'b2000000-0000-4000-8000-'+String((i+1)*100+j+1).padStart(12,'0'),parent_id:root,name,attributes,active:true,position:j}))];});
