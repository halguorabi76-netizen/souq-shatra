// The customer, merchant and driver interfaces side by side, as three phones.
// Each phone is the isolated preview build (preview.html): the site's real code with a local test
// database, no login and no production client. All three share that local store, so an order placed
// in one phone shows up in the others straight away.
export const PREVIEW_ROLES=[['buyer','الزبون'],['seller','التاجر'],['driver','سائق التوصيل']];
// Phones are drawn at real size, never CSS-scaled: a scaled iframe can stop repainting after its
// content changes, which left the customer screen blank after an order. Width follows the screen,
// within real phone widths; on narrow screens the phones scroll sideways, one per swipe.
const PHONE={min:320,max:390,h:844,minH:560};
const DATA_KEYS=['souq-shatra-interface-preview-v1','souq-preview-cart-v1'];
const STYLE=`
.pa-shell{--pa-ink:#0d1834;--pa-soft:#4e5d78;--pa-line:#dce3ee;--pa-card:#fff;--pa-indigo:#3547a5;display:flex;flex-direction:column;gap:12px;padding:14px 16px 20px;min-height:calc(100dvh - 90px);box-sizing:border-box;color:var(--pa-ink);font-family:'Cairo','Tajawal',system-ui,sans-serif;background:radial-gradient(110% 60% at 100% 0%,rgba(91,111,209,.14),transparent 62%),linear-gradient(180deg,#f2f4fd,#f8f9fe)}
:root[data-theme=dark] .pa-shell{--pa-ink:#f3f6ff;--pa-soft:#b1bdd2;--pa-line:#26324a;--pa-card:#101827;--pa-indigo:#9cacfa;background:radial-gradient(110% 60% at 100% 0%,rgba(53,71,165,.3),transparent 60%),#080d1a}
.pa-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}
.pa-bar p{margin:0;font-size:14px;line-height:1.7;color:var(--pa-soft);max-width:640px}
.pa-bar p b{color:var(--pa-ink)}
.pa-actions{display:flex;flex-wrap:wrap;gap:8px}
.pa-actions button{font:inherit;font-size:13px;font-weight:700;min-height:40px;padding:8px 14px;border-radius:12px;border:1px solid var(--pa-line);background:var(--pa-card);color:var(--pa-ink);cursor:pointer}
.pa-actions button[aria-pressed=true]{background:var(--pa-indigo);border-color:var(--pa-indigo);color:#fff}
:root[data-theme=dark] .pa-actions button[aria-pressed=true]{color:#0d1834}
.pa-actions .pa-danger{color:#b4233c}
.pa-stage{display:flex;gap:16px;justify-content:center;align-items:flex-start;flex:1;min-height:0;overflow-x:auto;padding-bottom:6px;scroll-snap-type:x mandatory}
.pa-stage.is-scroll{justify-content:flex-start}
.pa-phone{margin:0;display:flex;flex-direction:column;align-items:center;gap:8px;flex:none;scroll-snap-align:center}
.pa-phone figcaption{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700}
.pa-phone figcaption button{font:inherit;font-size:12px;font-weight:600;padding:4px 10px;min-height:32px;border-radius:10px;border:1px solid var(--pa-line);background:var(--pa-card);color:var(--pa-soft);cursor:pointer}
.pa-screen{box-sizing:content-box;position:relative;overflow:hidden;border-radius:30px;border:8px solid #0d1834;background:#0d1834;box-shadow:0 18px 40px rgba(13,24,52,.18)}
.pa-screen iframe{display:block;width:100%;height:100%;border:0;background:#fff}
`;
export function mountPreviewAll(view,{src=role=>`preview.html?role=${role}&embed=all`}={}){
 if(!document.getElementById('paStyle')){const s=document.createElement('style');s.id='paStyle';s.textContent=STYLE;document.head.append(s);}
 let armed=0;
 view.innerHTML=`<section class="pa-shell" aria-label="الواجهات الثلاث معاً"><div class="pa-bar"><p><b>الواجهات الثلاث بنفس بيانات التجربة.</b> اطلب من الزبون، واقبل من التاجر، واستلم من السائق: كل خطوة تظهر فوراً بالواجهتين الثانيتين. البيانات تجريبية ومحفوظة على هذا الجهاز فقط.</p><div class="pa-actions"><button type="button" data-pa="reset" class="pa-danger">إعادة ضبط التجربة</button></div></div><div class="pa-stage">${PREVIEW_ROLES.map(([role,label])=>`<figure class="pa-phone" data-role="${role}"><figcaption>واجهة ${label}<button type="button" data-pa="reload" data-role="${role}" aria-label="إعادة تحميل واجهة ${label}">↻ تحديث</button></figcaption><div class="pa-screen"><iframe title="واجهة ${label}" src="${src(role)}" sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"></iframe></div></figure>`).join('')}</div></section>`;
 const stage=view.querySelector('.pa-stage'),screens=[...view.querySelectorAll('.pa-screen')],bezel=16;
 function layout(){
  const room=stage.getBoundingClientRect(),gap=16,captions=44;
  const share=Math.floor((room.width-gap*2)/3-bezel),width=Math.max(PHONE.min,Math.min(PHONE.max,share));
  const height=Math.max(PHONE.minH,Math.min(PHONE.h,Math.floor(innerHeight-Math.max(0,room.top)-captions-24-bezel)));
  stage.classList.toggle('is-scroll',share<PHONE.min);
  for(const box of screens){box.style.width=width+'px';box.style.height=height+'px';}
 }
 view.addEventListener('click',e=>{
  const b=e.target.closest('[data-pa]');if(!b)return;
  if(b.dataset.pa==='reload')view.querySelector(`.pa-phone[data-role="${b.dataset.role}"] iframe`).src=src(b.dataset.role);
  if(b.dataset.pa==='reset'){
   if(Date.now()-armed>4000){armed=Date.now();b.textContent='اضغط مرة ثانية للتأكيد';setTimeout(()=>{if(b.isConnected)b.textContent='إعادة ضبط التجربة'},4000);return;}
   armed=0;b.textContent='إعادة ضبط التجربة';for(const k of DATA_KEYS)try{localStorage.removeItem(k)}catch{}
   for(const [role] of PREVIEW_ROLES)view.querySelector(`.pa-phone[data-role="${role}"] iframe`).src=src(role);
  }
 });
 addEventListener('resize',layout);layout();requestAnimationFrame(layout);
 return {layout};
}
