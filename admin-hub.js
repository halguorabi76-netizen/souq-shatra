// One administration entry point. Preview mode never loads the production client.
export function adminHubHeader(preview=false,all=false){
 const moon='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
 const out='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/></svg>';
 return `<a href="index.html" class="admin-brand admin-wordmark" aria-label="سوق الشطرة، الإدارة"><span class="admin-mark"><small>سوق</small><b>الشطرة</b></span><span class="admin-role-chip">الإدارة</span></a><nav aria-label="الإدارة والمعاينة"><div class="admin-hub-tabs"><a class="admin-hub-tab" href="admin.html" ${!preview?'aria-current="page"':''}>الإدارة</a><a class="admin-hub-tab" href="admin.html?section=preview" ${preview&&!all?'aria-current="page"':''}>المعاينة</a><a class="admin-hub-tab" href="admin.html?section=preview&amp;role=all" ${all?'aria-current="page"':''}>الواجهات معاً</a></div><a class="admin-site-link" href="index.html">فتح الموقع ‹</a><button class="admin-icon-btn" data-a="toggleTheme" aria-label="تغيير المظهر" title="الوضع النهاري / الليلي">${moon}</button><button class="admin-icon-btn" data-a="out" hidden aria-label="تسجيل الخروج" title="تسجيل الخروج">${out}</button></nav>`;
}
// The private door: the page shows only the logo and «منطقة خاصة». Three taps on the logo
// (the agreed secret) open it, and this device remembers it. Real protection stays on the server:
// without an admin account the database still refuses every admin request.
const ADMIN_GATE='souq-admin-gate';
function adminGate(){
 try{if(localStorage.getItem(ADMIN_GATE)==='1')return Promise.resolve()}catch{}
 return new Promise(resolve=>{
  document.body.classList.add('admin-gated');document.body.classList.remove('starting');
  const loading=document.getElementById('loading');if(loading)loading.hidden=true;
  const gate=document.createElement('main');gate.id='adminGate';
  gate.innerHTML='<button type="button" class="gate-mark" aria-label="سوق الشطرة"><small>سوق</small><b>الشطرة</b></button><p>منطقة خاصة</p>';
  document.body.append(gate);
  const mark=gate.querySelector('.gate-mark');let taps=0,timer=0;
  mark.addEventListener('click',()=>{
   taps++;clearTimeout(timer);timer=setTimeout(()=>{taps=0},1200);
   mark.classList.remove('tap');void mark.offsetWidth;mark.classList.add('tap');
   if(taps<3)return;
   try{localStorage.setItem(ADMIN_GATE,'1')}catch{}
   gate.remove();document.body.classList.remove('admin-gated');resolve();
  });
 });
}
export async function bootAdminHub(){
 const params=new URLSearchParams(location.search),preview=params.get('section')==='preview',all=preview&&params.get('role')==='all';
 document.body.classList.add('admin-portal');
 await adminGate();
 const header=document.createElement('header');header.id='adminTop';header.innerHTML=adminHubHeader(preview,all);document.getElementById('view').before(header);
 // The sections bar sticks right under the top bar, whatever height the top bar wraps to.
 const fit=()=>document.body.style.setProperty('--ad-top',Math.ceil(header.getBoundingClientRect().height)+'px');fit();if(typeof ResizeObserver==='function')new ResizeObserver(fit).observe(header);
 if(!preview){await import('./admin-app.js?v=215');return;}
 document.body.classList.add('admin-preview-host');document.body.classList.remove('starting');document.getElementById('loading').hidden=true;
 header.querySelector('[data-a="toggleTheme"]').addEventListener('click',()=>window.SouqTheme.set(window.SouqTheme.get()==='dark'?'light':'dark'));
 if(all){document.body.classList.add('admin-preview-all');const {mountPreviewAll}=await import('./preview-all.js?v=2');mountPreviewAll(document.getElementById('view'));return;}
 const route=new URL('preview.html',location.href);params.delete('section');route.search=params.toString();
 const frame=document.createElement('iframe');frame.id='adminPreviewFrame';frame.title='معاينة واجهات سوق الشطرة المعزولة';frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-modals');frame.src=route.href;
 const view=document.getElementById('view');view.replaceChildren(frame);
}


