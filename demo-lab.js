/* Local, labelled marketplace simulation. Never sends demo identities or orders to Supabase. */
(() => {
'use strict';
const KEY='souq-shatra-demo-v1';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n).toLocaleString('ar-IQ')+' د.ع';
const roles={buyer:'زبون',seller:'بائع',driver:'عامل توصيل',admin:'مدير التجربة'};
const states={new:'جديد',accepted:'قبله البائع',claimed:'استلمه السائق',picked:'تم شراء السلعة',delivered:'تم التسليم',cancelled:'ملغى'};
// Version 2 permanently retires the old seeded marketplace data.
// Keep the local lab available, but start with no identities or listings.
const fixture=()=>({version:2,visible:false,people:[],products:[],ads:[],orders:[],notices:[],payments:[]});
let data;try{data=JSON.parse(localStorage.getItem(KEY));}catch{}
if(!data||data.version!==2){
 data=fixture();
 try{localStorage.setItem(KEY,JSON.stringify(data))}catch{}
}
let active=false,current='',page='market',category='الكل',query='',adIndex=0,checkout=null,callback=()=>{document.body.classList.remove('demo-mode');document.getElementById('view').innerHTML=preview();};
const person=id=>data.people.find(p=>p.id===id); const me=()=>person(current);
const button=(action,label,value='',cls='')=>`<button class="${cls}" data-demo="${action}" data-value="${esc(value)}">${label}</button>`;
function save(){try{localStorage.setItem(KEY,JSON.stringify(data));return true}catch{alert('تعذّر حفظ التجربة على الجهاز. تحقق من مساحة التخزين.');return false}}
function notice(ids,text,order){[...new Set(ids)].filter(person).forEach(to=>data.notices.unshift({id:crypto.randomUUID(),to,text,order,read:false,time:Date.now()}));}
const admins=()=>data.people.filter(p=>p.role==='admin').map(p=>p.id);
function inform(o,text){notice([o.buyer,o.seller,o.driver,...admins()],text,o.id)}
function art(type){const drawings={shirt:'<path d="M25 20 10 30l10 15 10-6v40h40V39l10 6 10-15-15-10-15 8H40Z"/>',dress:'<path d="m35 18 10 8h10l10-8 8 18-12 9 18 38H21l18-38-12-9Z"/>',shoe:'<path d="M18 50 30 29l22 22 28 9q12 4 6 17H15Z"/><path d="M34 44h20M39 50h20M16 70h70"/>',phone:'<rect x="30" y="12" width="40" height="77" rx="7"/><path d="M42 19h16M44 81h12"/>',headphones:'<path d="M22 54V43a28 28 0 0 1 56 0v11"/><rect x="15" y="49" width="18" height="31" rx="6"/><rect x="67" y="49" width="18" height="31" rx="6"/>',watch:'<path d="M39 10h22v20H39Zm0 60h22v20H39Z"/><rect x="27" y="28" width="46" height="44" rx="10"/><path d="M50 38v13l10 6"/>',bag:'<rect x="23" y="28" width="54" height="57" rx="10"/><path d="M37 28v-9h26v9M32 56h36v20H32Z"/>',cup:'<path d="M20 26h48v38q0 18-24 18T20 64ZM68 32h8q20 0 6 24H68"/>',lamp:'<path d="M22 83h57M50 82V51L70 25M48 28l22-14 17 25-25 13Z"/>',ball:'<circle cx="50" cy="50" r="35"/><path d="m50 32 18 13-7 21H39l-7-21ZM50 32V15M68 45l16-6M61 66l10 16M39 66 28 81M32 45l-16-6"/>',dates:'<rect x="18" y="28" width="64" height="53" rx="12"/><ellipse cx="37" cy="49" rx="8" ry="12"/><ellipse cx="62" cy="60" rx="8" ry="12"/>',plant:'<path d="m29 62 7 26h28l7-26ZM50 62V25M50 44Q20 45 25 18q25-2 25 26ZM50 52q31 2 27-27-26-3-27 27Z"/>'};return `<svg viewBox="0 0 100 100" role="img" aria-label="رسم توضيحي للمنتج" fill="#e6cbcd" stroke="#833d41" stroke-width="3" stroke-linejoin="round">${drawings[type]||drawings.bag}</svg>`}
function cards(products){return `<div class="demo-grid">${products.map(p=>`<article class="demo-product"><span class="demo-tag">تجريبي${p.promoted?' · مروّج':''}</span><div class="demo-art">${art(p.art)}</div><h3>${esc(p.name)}</h3><small>${esc(person(p.seller)?.name||'بائع محذوف')}</small><p>${money(p.price)}</p><small>المقاسات: ${p.sizes.map(esc).join('، ')} · المخزون ${p.stock}</small><div class="demo-actions">${button('product','عرض وطلب',p.id)}${active&&['seller','admin'].includes(me()?.role)&&(me().role==='admin'||p.seller===current)?button('promote',p.promoted?'إيقاف الترويج':'ترويج',p.id):''}${button('deleteProduct','🗑',p.id,'demo-delete')}</div></article>`).join('')}</div>`}
const demoProducts=options=>data.visible?window.SouqCatalog.select(data.products,options,p=>person(p.seller)?.name||''):[];
function preview(options={}){if(!data.visible)return '';const list=demoProducts(options);if(!list.length)return '';return `<section class="demo-preview"><div class="demo-heading"><div><h2>منتجات تجريبية</h2><p>لشرح فكرة التطبيق · الطلبات هنا تجريبية</p></div>${button('open','فتح التجربة')}</div>${cards(list)}</section>`}
function render(){if(!active)return;document.body.classList.add('demo-mode');const view=document.getElementById('view');const p=me();if(!p){current=data.people[0]?.id||'';}const who=me();if(!who){view.innerHTML='<div class="demo-shell"><h2>لوحة التجربة فارغة</h2><p>تمت إزالة البيانات الوهمية. منتجات التجار متاحة في السوق.</p>'+button('exit','العودة للسوق الحقيقي')+'</div>';return}
let h=`<div class="demo-shell"><div class="demo-heading"><div><h1>سوق الشطرة · تجربة متكاملة</h1><p>محاكاة محلية على هذا المتصفح؛ لا ترسل طلبات أو إشعارات حقيقية.</p></div>${button('exit','العودة للسوق الحقيقي')}</div><div class="demo-roles">${data.people.map(p=>button('switch',`${esc(p.name)}<small>${roles[p.role]}</small>`,p.id,p.id===current?'selected':'')).join('')}</div><div class="demo-current">أنت الآن: <b>${esc(who.name)}</b> · ${roles[who.role]}${who.role==='driver'?` · مستحقات ${money(who.due)} / حد ${money(5000)}`:''}</div><nav class="demo-nav">${['market','orders','notices','accounts'].map(v=>button('page',({market:'السوق والعروض',orders:'الطلبات',notices:'الإشعارات',accounts:'الحسابات والإدارة'})[v]+(v==='notices'?` (${data.notices.filter(n=>n.to===current&&!n.read).length})`:''),v,page===v?'selected':'')).join('')}</nav>`;
if(page==='market'){
const ad=data.ads[adIndex%data.ads.length];if(ad)h+=`<div class="demo-ad" style="background-image:linear-gradient(transparent,#32181ad9),url('${esc(ad.image)}')"><b>${esc(ad.title)}</b><span>${esc(ad.text)}</span><div>${button('ad','‹','-1')}${button('ad','›','1')}${button('deleteAd','🗑 حذف الإعلان',ad.id,'demo-delete')}</div></div>`;
h+=`<div class="demo-filters"><label>ابحث <input id="demo-query" value="${esc(query)}" placeholder="قميص، هاتف…"></label><label>القسم <select id="demo-cat">${['الكل','مواد غذائية','خضار وفواكه','تمور','ملابس','أجهزة','منزلية','أخرى'].map(c=>`<option ${c===category?'selected':''}>${c}</option>`).join('')}</select></label>${button('search','بحث')}</div>`;
const matches=window.SouqCatalog.select(data.products,{category,query},p=>person(p.seller)?.name||'');h+=matches.length?cards(matches.sort((a,b)=>Number(b.promoted)-Number(a.promoted))):'<div class="demo-card">لا توجد نتائج مطابقة.</div>';
}else if(page==='orders'){
const list=data.orders.filter(o=>who.role==='admin'||o.buyer===current||o.seller===current||(who.role==='driver'&&(o.driver===current||(['new','accepted'].includes(o.status)&&!o.ignored.includes(current)))));
h+=list.length?list.map(orderCard).join(''):'<div class="demo-card">لا توجد طلبات. اطلب منتجًا من السوق بالحساب التجريبي.</div>';
}else if(page==='notices'){
const list=data.notices.filter(n=>n.to===current);h+=list.length?list.map(n=>`<div class="demo-card"><b>${esc(n.text)}</b><small>${new Date(n.time).toLocaleString('ar-IQ')} · ${n.read?'مقروء':'جديد'}</small><div>${button('read','قرأت الإشعار',n.id)}${button('noticeOrder','عرض الطلب',n.order)}</div></div>`).join(''):'<div class="demo-card">لا توجد إشعارات لهذا الحساب بعد.</div>';
}else{
h+='<div class="demo-card"><h2>حسابات وهمية للتجربة</h2><p>التبديل أعلاه يحاكي الأدوار، ولا ينشئ حسابات تسجيل دخول في Supabase.</p>'+data.people.map(p=>`<div class="demo-account"><span>${esc(p.name)} · ${roles[p.role]}</span>${button('deletePerson','🗑 حذف',p.id,'demo-delete')}</div>`).join('')+'</div>';
if(who.role==='driver')h+='<div class="demo-card"><h2>تسوية المستحقات التجريبية</h2><p>لا ترسل مالًا. هذا إثبات وهمي ينتظر تأكيد المدير.</p>'+button('payment','إرسال إثبات تحويل تجريبي')+'</div>';
if(who.role==='admin')h+='<div class="demo-card"><h2>توليد طلبات تجريبية</h2><p>ينشئ طلبات وهمية حسب المخزون المتبقي، دون اتصال بالخادم.</p>'+button('bulk','إنشاء 5 طلبات','5')+button('bulk','إنشاء 50 طلبًا','50')+'</div><div class="demo-card"><h2>تحويلات السائقين</h2>'+data.payments.map(p=>`<div class="demo-account">${esc(person(p.driver)?.name||'سائق محذوف')} · ${money(p.amount)} · ${p.approved?'مؤكد': 'بانتظار التأكيد'}${!p.approved?button('approvePayment','تأكيد الاستلام',p.id):''}</div>`).join('')+'</div>';
h+='<div class="demo-card"><h2>التحكم بالبيانات التجريبية</h2>'+button('hide','إخفاء المواد من السوق الرئيسي')+button('clear','حذف جميع البيانات التجريبية','', 'demo-delete')+button('reset','تفريغ لوحة التجربة')+'</div>';
}
view.innerHTML=h+'</div>';
}
function orderCard(o){const p=me();let actions='';
if(o.status==='new'&&(p.role==='admin'||o.seller===current))actions+=button('accept','قبول البائع',o.id);
if(['new','accepted'].includes(o.status)&&p.role==='driver')actions+=button('claim','موافقة على التوصيل',o.id)+button('ignore','رفض / تجاهل',o.id);
if(o.driver===current&&o.status==='claimed')actions+=button('picked','اشتريت السلعة من البائع',o.id);
if(o.driver===current&&o.status==='picked')actions+=button('deliver','سلّمت السلعة واستلمت المبلغ',o.id);
if(!['cancelled','delivered'].includes(o.status)&&(p.role==='admin'||o.buyer===current||o.seller===current))actions+=button('cancel','إلغاء الطلب',o.id);
return `<article class="demo-card"><div class="demo-heading"><h3>طلب تجريبي #${esc(o.id.slice(-6))} · ${states[o.status]}</h3>${button('deleteOrder','🗑 حذف',o.id,'demo-delete')}</div><p>${esc(o.name)} · ${esc(o.size)} · الكمية ${o.quantity}</p><small>الزبون: ${esc(person(o.buyer)?.name||'محذوف')} · البائع: ${esc(person(o.seller)?.name||'محذوف')} · السائق: ${esc(person(o.driver)?.name||'لم يقبل أحد بعد')}</small><p>عنوان تجريبي: ${esc(o.address)}</p><p>سلعة ${money(o.subtotal)} + توصيل ${money(2000)} + تطبيق ${money(500)} = <b>${money(o.subtotal+2500)}</b></p><div class="demo-actions">${actions}</div></article>`;
}
function product(id){const p=data.products.find(p=>p.id===id);if(!p)return;active=true;checkout=id;render();document.getElementById('view').insertAdjacentHTML('afterbegin',`<section class="demo-checkout demo-card"><h2>${esc(p.name)} · طلب تجريبي</h2><div class="demo-art">${art(p.art)}</div><p>${esc(p.desc)}</p><p>${money(p.price)} · المخزون ${p.stock}</p><label>المقاس / النوع <select id="demo-size">${p.sizes.map(v=>`<option>${esc(v)}</option>`).join('')}</select></label><label>الكمية <input id="demo-quantity" type="number" min="1" max="${p.stock}" value="1"></label><label>عنوان تجريبي <input id="demo-address" value="${esc(me()?.address||'الشطرة، عنوان تجريبي قرب السوق')}"></label><p>أجرة التوصيل 2,000 د.ع · حصة التطبيق 500 د.ع. استخدم معلومات وهمية فقط.</p>${button('place','إرسال الطلب التجريبي',id)}${button('closeProduct','إغلاق')}</section>`);document.querySelector('.demo-checkout').scrollIntoView({block:'start'});}
function transition(id,kind){const o=data.orders.find(o=>o.id===id),p=me();if(!o||!p)return;const terminal=['cancelled','delivered'].includes(o.status);
if(kind==='accept'&&o.status==='new'&&(p.role==='admin'||o.seller===current)){o.status='accepted';inform(o,'وافق البائع على الطلب');}
else if(kind==='claim'&&p.role==='driver'&&['new','accepted'].includes(o.status)&&!o.driver){if(p.due>=5000){alert('وصلت المستحقات إلى 5,000 دينار. أرسل إثباتًا تجريبيًا وبدّل إلى المدير لتأكيده.');return}o.driver=current;o.status='claimed';inform(o,'وافق سائق على التوصيل وأُسند إليه الطلب');}
else if(kind==='ignore'&&p.role==='driver'&&['new','accepted'].includes(o.status)){if(!o.ignored.includes(current))o.ignored.push(current);}
else if(kind==='picked'&&o.driver===current&&o.status==='claimed'){o.status='picked';inform(o,'اشترى السائق السلعة من البائع');}
else if(kind==='deliver'&&o.driver===current&&o.status==='picked'){o.status='delivered';p.due+=500;inform(o,'تم التسليم؛ أضيفت حصة التطبيق إلى مستحقات السائق');}
else if(kind==='cancel'&&!terminal&&(p.role==='admin'||o.buyer===current||o.seller===current)){o.status='cancelled';const product=data.products.find(p=>p.id===o.product);if(product)product.stock+=o.quantity;inform(o,'أُلغي الطلب وأُعيد المخزون');}
save();render();}
function action(a,v){
if(a==='open'){active=true;data.visible=true;save();render();return}
if(a==='exit'){active=false;callback();return}
if(a==='product'){product(v);return}
if(a==='switch'){if(!person(v))return;current=v;page='orders';render();return}
if(a==='page'){page=v;render();return}
if(a==='closeProduct'){checkout=null;render();return}
if(a==='search'){query=document.getElementById('demo-query').value.trim();category=document.getElementById('demo-cat').value;render();return}
if(a==='ad'){adIndex=(adIndex+Number(v)+data.ads.length)%Math.max(1,data.ads.length);render();return}
if(a==='bulk'&&me()?.role==='admin'){
const buyers=data.people.filter(p=>p.role==='buyer'),count=Number(v);if(!buyers.length||![5,50].includes(count))return;let added=0;
for(let i=0;i<count;i++){const p=data.products.find(p=>p.stock>0&&person(p.seller));if(!p)break;const buyer=buyers[i%buyers.length];const o={id:crypto.randomUUID(),buyer:buyer.id,seller:p.seller,driver:null,product:p.id,name:p.name,quantity:1,size:p.sizes[0],address:buyer.address,subtotal:p.price,status:'new',ignored:[]};data.orders.unshift(o);p.stock--;notice([buyer.id,p.seller,...admins(),...data.people.filter(p=>p.role==='driver').map(p=>p.id)],'طلب تجريبي جديد: '+p.name,o.id);added++;}
save();page='orders';render();alert('تم إنشاء '+added+' طلب تجريبي. هذه محاكاة محلية وليست اختبار ضغط الخادم.');return}
if(a==='place'){
const p=data.products.find(p=>p.id===v),qty=Number(document.getElementById('demo-quantity')?.value),size=document.getElementById('demo-size')?.value,address=document.getElementById('demo-address')?.value.trim();
if(!p||!Number.isInteger(qty)||qty<1||qty>p.stock||!p.sizes.includes(size)||!address){alert('تحقق من المقاس والكمية والعنوان.');return}if(!me()){alert('اختر حسابًا تجريبيًا أولًا');return}
const o={id:crypto.randomUUID(),buyer:current,seller:p.seller,driver:null,product:p.id,name:p.name,quantity:qty,size,address,subtotal:p.price*qty,status:'new',ignored:[]};data.orders.unshift(o);p.stock-=qty;
notice([current,p.seller,...admins(),...data.people.filter(p=>p.role==='driver').map(p=>p.id)],'طلب تجريبي جديد: '+p.name,o.id);checkout=null;page='orders';save();render();return}
if(['accept','claim','ignore','picked','deliver','cancel'].includes(a)){transition(v,a);return}
if(a==='promote'){const p=data.products.find(p=>p.id===v);if(p&&me()&&(me().role==='admin'||p.seller===current))p.promoted=!p.promoted;}
if(a==='read'){const n=data.notices.find(n=>n.id===v&&n.to===current);if(n)n.read=true;}
if(a==='noticeOrder'){page='orders';render();return}
if(a==='payment'){const p=me();if(p?.role!=='driver'||p.due<=0){alert('لا توجد مستحقات تجريبية.');return}if(data.payments.some(x=>x.driver===current&&!x.approved)){alert('لديك إثبات بانتظار المدير.');return}const payment={id:crypto.randomUUID(),driver:current,amount:p.due,approved:false};data.payments.unshift(payment);notice(admins(),'إثبات تحويل تجريبي من '+p.name,'');}
if(a==='approvePayment'&&me()?.role==='admin'){const payment=data.payments.find(p=>p.id===v);const driver=person(payment?.driver);if(payment&&!payment.approved&&driver){driver.due=Math.max(0,driver.due-payment.amount);payment.approved=true;notice([driver.id],'أكد المدير التحويل التجريبي؛ حُدّث رصيدك','');}}
if(a==='deleteProduct')data.products=data.products.filter(p=>p.id!==v);
if(a==='deleteAd')data.ads=data.ads.filter(p=>p.id!==v);
if(a==='deletePerson'){data.people=data.people.filter(p=>p.id!==v);data.products=data.products.filter(p=>p.seller!==v);data.notices=data.notices.filter(p=>p.to!==v);}
if(a==='deleteOrder'){const o=data.orders.find(p=>p.id===v);if(o&&!['cancelled','delivered'].includes(o.status)){const p=data.products.find(p=>p.id===o.product);if(p)p.stock+=o.quantity;}data.orders=data.orders.filter(p=>p.id!==v);data.notices=data.notices.filter(p=>p.order!==v);}
if(a==='hide'){data.visible=false;active=false;save();callback();return}
if(a==='clear'){data=fixture();}
if(a==='reset'){data=fixture();current='';page='market';active=true;}
save();if(active)render();else callback();
}
let start=null;
document.addEventListener('touchstart',e=>{start=e.target.closest('.demo-ad')&&e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});
document.addEventListener('touchend',e=>{if(!start||e.changedTouches.length!==1)return;const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y;start=null;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)*1.2)action('ad',dx<0?'1':'-1');},{passive:true});
document.addEventListener('touchcancel',()=>{start=null;},{passive:true});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='demo-query'){e.preventDefault();action('search');}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-demo]');if(!b)return;e.preventDefault();action(b.dataset.demo,b.dataset.value);});
window.addEventListener('storage',e=>{if(e.key!==KEY||!e.newValue)return;try{const next=JSON.parse(e.newValue);if(next.version===2){data=next;active?render():callback();}}catch{}});
window.SouqDemo={preview,count:options=>demoProducts(options).length,render,isActive:()=>active,init:fn=>{callback=fn;},open:()=>action('open')};
})();
