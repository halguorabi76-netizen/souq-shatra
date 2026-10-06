/* Shared, non-blocking navigation and network status. */
(()=>{
 const pending=new Set();let timer,hideTimer,next=0;
 const panel=()=>document.getElementById('auroraLoading');
 const update=()=>{const el=panel();if(!el)return;const offline=navigator.onLine===false;el.hidden=!pending.size&&!offline;el.querySelector('span').textContent=offline?'الاتصال بالإنترنت منقطع — ننتظر عودته':'جارٍ التحميل…';el.dataset.offline=String(offline);};
 const begin=()=>{const token=++next;pending.add(token);clearTimeout(hideTimer);if(!timer)timer=setTimeout(()=>{timer=null;update()},220);return token;};
 const end=token=>{pending.delete(token);if(!pending.size){clearTimeout(timer);timer=null;update();}};
 const transition=()=>{const token=begin();setTimeout(()=>end(token),340);};
 window.SouqLoading={begin,end,transition};
 document.addEventListener('click',e=>{const button=e.target.closest?.('button[data-a],button[data-s],button[data-driver]');if(button)transition();},true);
 window.addEventListener('offline',update);window.addEventListener('online',update);
 update();
})();
