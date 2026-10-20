// One administration entry point. Preview mode never loads the production client.
export function adminHubHeader(preview=false,all=false){
 const moon='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
 const out='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/></svg>';
 return `<a href="index.html" class="admin-brand admin-wordmark" aria-label="سوق الشطرة، الإدارة"><span class="admin-mark"><small>سوق</small><b>الشطرة</b></span><span class="admin-role-chip">الإدارة</span></a><nav aria-label="الإدارة والمعاينة"><div class="admin-hub-tabs"><a class="admin-hub-tab" href="admin.html" ${!preview?'aria-current="page"':''}>الإدارة</a><a class="admin-hub-tab" href="admin.html?section=preview" ${preview&&!all?'aria-current="page"':''}>المعاينة</a><a class="admin-hub-tab" href="admin.html?section=preview&amp;role=all" ${all?'aria-current="page"':''}>الواجهات معاً</a></div><a class="admin-site-link" href="index.html">فتح الموقع ‹</a><button class="admin-icon-btn" data-a="toggleTheme" aria-label="تغيير المظهر" title="الوضع النهاري / الليلي">${moon}</button><button class="admin-icon-btn" data-a="out" hidden aria-label="تسجيل الخروج" title="تسجيل الخروج">${out}</button></nav>`;
}
export async function bootAdminHub(){
 const params=new URLSearchParams(location.search),preview=params.get('section')==='preview',all=preview&&params.get('role')==='all';
 document.body.classList.add('admin-portal');
 const header=document.createElement('header');header.id='adminTop';header.innerHTML=adminHubHeader(preview,all);document.getElementById('view').before(header);
 if(!preview){await import('./admin-app.js?v=193');return;}
 document.body.classList.add('admin-preview-host');document.body.classList.remove('starting');document.getElementById('loading').hidden=true;
 header.querySelector('[data-a="toggleTheme"]').addEventListener('click',()=>window.SouqTheme.set(window.SouqTheme.get()==='dark'?'light':'dark'));
 if(all){document.body.classList.add('admin-preview-all');const {mountPreviewAll}=await import('./preview-all.js?v=2');mountPreviewAll(document.getElementById('view'));return;}
 const route=new URL('preview.html',location.href);params.delete('section');route.search=params.toString();
 const frame=document.createElement('iframe');frame.id='adminPreviewFrame';frame.title='معاينة واجهات سوق الشطرة المعزولة';frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-modals');frame.src=route.href;
 const view=document.getElementById('view');view.replaceChildren(frame);
}


