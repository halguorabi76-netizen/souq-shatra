// In-app messages: used items (buyer ↔ owner) and orders (customer ↔ store ↔ driver).
// The database decides who belongs to a thread; this module only shows and sends messages.
const QUICK={
 driver:['أنا في الطريق إليك 🛵','وصلت، أنا عند الباب 🚪','هل أترك الطلب عند الباب؟','أرسل لي أقرب نقطة دالة 📍','تم التسليم، شكرًا لك ✅'],
 buyer:['أين وصلت؟','اترك الطلب عند الباب من فضلك','سأنزل خلال دقيقة','لا تتصل، راسلني هنا فقط 🔕','شكرًا لك 🌷'],
 buyerStore:['هل المنتج متوفر؟','أريد تعديل الطلب','متى يكون الطلب جاهزًا؟','هل يمكن تبديل المنتج؟','شكرًا لكم 🌷'],
 seller:['طلبك قيد التجهيز','طلبك جاهز وسيُسلَّم للسائق','نفدت إحدى المواد، هل نبدّلها؟','شكرًا لطلبك من متجرنا 🌷'],
 owner:['نعم، ما زال متوفرًا','السعر نهائي','يمكنك المعاينة اليوم'],
 usedBuyer:['هل ما زال متوفرًا؟','هل السعر قابل للتفاوض؟','أين يمكنني معاينته؟']
};
export function createChat(ctx){
 const E=ctx.esc;let current=null,timer=null,messages=[],busy=false,loaded=false;
 const key=t=>t.kind+':'+t.ref+':'+t.buyer;
 const parse=v=>{const [kind,ref,buyer]=String(v||'').split(/[:|]/);return kind&&ref&&buyer?{kind,ref,buyer}:null;};
 function role(t){const me=ctx.user()?.id,info=ctx.thread(t);if(t.kind==='used')return me===t.buyer?'usedBuyer':'owner';if(t.kind==='store')return me===t.buyer?'buyerStore':'seller';if(t.kind==='driver')return me===t.buyer?'buyer':'driver';if(me===info?.driver)return 'driver';if(me===t.buyer)return 'buyer';return 'seller';}
 function bubble(m){const me=m.sender_id===ctx.user()?.id,who=me?'':ctx.thread(current)?.names?.[m.sender_id]||'';return `<div class="chat-msg ${me?'mine':''}">${who?`<small>${E(who)}</small>`:''}<p>${E(m.body)}</p><time>${E(ctx.when(m.created_at))}</time></div>`;}
 function paint(){const box=document.getElementById('chatLog');if(!box)return;const atEnd=box.scrollHeight-box.scrollTop-box.clientHeight<60;box.innerHTML=messages.length?messages.map(bubble).join(''):'<p class="chat-empty">ابدأ المحادثة. رسائلك تبقى داخل سوق الشطرة ولا يظهر رقمك.</p>';if(atEnd)box.scrollTop=box.scrollHeight;}
 async function load(){if(!current)return;const t=current,r=await ctx.db.from('chat_messages').select('*').eq('kind',t.kind).eq('ref_id',t.ref).eq('buyer_id',t.buyer).order('created_at',{ascending:true}).limit(300);if(current!==t)return;if(r.error){if(!messages.length){const box=document.getElementById('chatLog');if(box)box.innerHTML='<p class="chat-empty">تعذّر تحميل الرسائل. تحقق من الاتصال.</p>';}return;}const before=messages.length,first=!loaded;loaded=true;messages=r.data||[];if(first||messages.length!==before)paint();}
 function stop(){clearInterval(timer);timer=null;current=null;messages=[];loaded=false;}
 function open(value){
  const t=typeof value==='string'?parse(value):value;if(!t)return;
  if(!ctx.user()){ctx.login();return;}
  stop();current=t;const info=ctx.thread(t)||{};
  ctx.sheet(ctx.head(E(info.title||'المحادثة'))+`<div class="chat">${info.subtitle?`<p class="chat-sub">${E(info.subtitle)}</p>`:''}<div id="chatLog" class="chat-log" aria-live="polite"><p class="chat-empty">جارٍ تحميل الرسائل…</p></div><div class="chat-quick">${(QUICK[role(t)]||[]).map(q=>`<button type="button" data-chat-quick="${E(q)}">${E(q)}</button>`).join('')}</div><form id="chatForm" class="chat-form"><input id="chatInput" maxlength="1000" autocomplete="off" placeholder="اكتب رسالتك…" aria-label="نص الرسالة"><button type="submit" aria-label="إرسال">➤</button></form></div>`);
  document.getElementById('chatForm').addEventListener('submit',e=>{e.preventDefault();send(document.getElementById('chatInput').value)});
  document.querySelector('.chat-quick')?.addEventListener('click',e=>{const q=e.target.closest('[data-chat-quick]');if(q)send(q.dataset.chatQuick)});
  load();timer=setInterval(()=>{if(!document.getElementById('chatLog')){stop();return}if(!document.hidden)load()},4000);
 }
 async function send(text){
  const body=String(text||'').trim();if(!body||busy||!current)return;busy=true;const input=document.getElementById('chatInput');
  try{const r=await ctx.db.rpc('send_chat_message',{p_kind:current.kind,p_ref:current.ref,p_buyer:current.buyer,p_body:body});
   if(r.error){ctx.toast(/too many/.test(r.error.message)?'أرسلت رسائل كثيرة؛ انتظر دقيقة':/item unavailable/.test(r.error.message)?'هذا الغرض لم يعد معروضًا':'تعذّر إرسال الرسالة');return;}
   if(input&&input.value.trim()===body)input.value='';await load();const box=document.getElementById('chatLog');if(box)box.scrollTop=box.scrollHeight;}
  finally{busy=false;}
 }
 // Threads the user takes part in, newest first: [{kind,ref,buyer,last}]
 async function threads(){const r=await ctx.db.from('chat_messages').select('kind,ref_id,buyer_id,sender_id,body,created_at').order('created_at',{ascending:false}).limit(400);if(r.error)return null;const seen=new Map();for(const m of r.data||[]){const t={kind:m.kind,ref:m.ref_id,buyer:m.buyer_id};if(!seen.has(key(t)))seen.set(key(t),{...t,last:m});}return [...seen.values()];}
 return {open,threads,key,stop,parse};
}
