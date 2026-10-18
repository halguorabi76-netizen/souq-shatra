// One administration entry point. Preview mode never loads the production client.
export function adminHubHeader(preview=false,all=false){
 return `<a href="index.html" class="admin-brand"><img src="icons/admin-192-v97.png" width="44" height="44" alt="شعار سوق الشطرة مع علامة الإعدادات"><span>سوق الشطرة <small>الإدارة والمعاينة</small></span></a><nav aria-label="الإدارة والمعاينة"><a class="admin-hub-tab" href="admin.html" ${!preview?'aria-current="page"':''}>الإدارة</a><a class="admin-hub-tab" href="admin.html?section=preview" ${preview&&!all?'aria-current="page"':''}>المعاينة</a><a class="admin-hub-tab" href="admin.html?section=preview&amp;role=all" ${all?'aria-current="page"':''}>الواجهات معاً</a><a href="index.html">فتح الموقع</a><button data-a="toggleTheme">تغيير المظهر</button><button data-a="out" hidden>تسجيل الخروج</button></nav>`;
}
export async function bootAdminHub(){
 const params=new URLSearchParams(location.search),preview=params.get('section')==='preview',all=preview&&params.get('role')==='all';
 document.body.classList.add('admin-portal');
 const header=document.createElement('header');header.id='adminTop';header.innerHTML=adminHubHeader(preview,all);document.getElementById('view').before(header);
 if(!preview){await import('./admin-app.js?v=190');return;}
 document.body.classList.add('admin-preview-host');document.body.classList.remove('starting');document.getElementById('loading').hidden=true;
 header.querySelector('[data-a="toggleTheme"]').addEventListener('click',()=>window.SouqTheme.set(window.SouqTheme.get()==='dark'?'light':'dark'));
 if(all){document.body.classList.add('admin-preview-all');const {mountPreviewAll}=await import('./preview-all.js?v=2');mountPreviewAll(document.getElementById('view'));return;}
 const route=new URL('preview.html',location.href);params.delete('section');route.search=params.toString();
 const frame=document.createElement('iframe');frame.id='adminPreviewFrame';frame.title='معاينة واجهات سوق الشطرة المعزولة';frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-modals');frame.src=route.href;
 const view=document.getElementById('view');view.replaceChildren(frame);
}


