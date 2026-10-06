/* Shared, non-blocking navigation and network status. */
(()=>{
 const pending=new Set();let timer,next=0;
 const navigation=new Set();
 const panel=()=>document.getElementById('auroraLoading');
 const update=()=>{const el=panel();if(!el)return;const offline=navigator.onLine===false;el.hidden=!pending.size&&!offline;el.querySelector('span').textContent=offline?'الاتصال بالإنترنت منقطع — ننتظر عودته':'جارٍ التحميل';el.dataset.offline=String(offline);el.dataset.kind=pending.size===navigation.size?'navigation':'network';if(!offline&&pending.size&&pending.size===navigation.size)el.querySelector('span').textContent='جارٍ التحميل';};
 const begin=()=>{const token=++next;pending.add(token);if(!timer)timer=setTimeout(()=>{timer=null;update()},220);return token;};
 const end=token=>{pending.delete(token);navigation.delete(token);if(!pending.size){clearTimeout(timer);timer=null;update();}};
 const transition=()=>{const token=begin();navigation.add(token);update();setTimeout(()=>end(token),550);};
 window.SouqLoading={begin,end,transition};
 document.addEventListener('click',e=>{const button=e.target.closest?.('button[data-a],button[data-s],button[data-driver]');if(!button||button.disabled||button.getAttribute('aria-disabled')==='true')return;const action=button.dataset.a||button.dataset.s||button.dataset.driver;if(['tab','cart','prod','publicStore','marketSection','favorites','notifications','enter','menuPage','siteHome','menuBuyer','assigned','available'].includes(action))transition();},true);
 window.addEventListener('offline',update);window.addEventListener('online',update);
 update();
})();
