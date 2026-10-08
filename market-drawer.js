/* Uses existing application actions, including account and notification flows. */
(()=>{
 const toggle=document.getElementById('marketMenuToggle');if(!toggle)return;
 const root=document.createElement('div');root.id='marketDrawer';root.inert=true;
 root.innerHTML='<button class="market-drawer-shade" aria-label="إغلاق القائمة"></button><aside class="market-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="marketDrawerTitle"><button class="market-drawer-close" aria-label="إغلاق القائمة">×</button><div class="market-drawer-brand"><img src="icons/shatra-smile-display-v139.png" alt=""><b id="marketDrawerTitle">سوق الشطرة</b></div><nav><button data-a="accountMenu">الملف الشخصي وحسابي</button><button data-a="notifications">الإشعارات</button><button data-a="tab" data-v="chats">الطلبات</button><button data-a="marketSection" data-v="stores">المتاجر</button><button data-a="marketSection" data-v="materials">المواد</button><button data-a="tab" data-v="myMarket">السلة</button><button data-a="tab" data-v="settings">الإعدادات</button></nav></aside>';
 document.body.append(root);let previousOverflow='',startX=0;
 function close(){root.classList.remove('open');root.inert=true;toggle.setAttribute('aria-expanded','false');document.body.style.overflow=previousOverflow;toggle.focus();}
 function open(){previousOverflow=document.body.style.overflow;root.inert=false;root.classList.add('open');toggle.setAttribute('aria-expanded','true');document.body.style.overflow='hidden';root.querySelector('.market-drawer-close').focus();}
 toggle.addEventListener('click',()=>root.classList.contains('open')?close():open());
 root.addEventListener('click',e=>{if(e.target.closest('button'))close();});
 root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const items=[...root.querySelectorAll('button')],first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 root.addEventListener('touchstart',e=>{startX=e.touches[0].clientX;},{passive:true});root.addEventListener('touchend',e=>{if(e.changedTouches[0].clientX-startX>75)close();},{passive:true});
})();
