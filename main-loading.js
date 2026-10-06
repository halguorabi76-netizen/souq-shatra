/* Track real work only; bridge adjacent requests without blocking the app. */
(()=>{
 const pending=new Set();let showTimer=null,hideTimer=null,next=0;
 const panel=()=>document.getElementById('auroraLoading');
 const show=()=>{const el=panel();if(!el)return;el.hidden=false;el.querySelector('span').textContent=navigator.onLine===false?'الاتصال بالإنترنت منقطع — ننتظر عودته':'جارٍ التحميل';el.dataset.offline=String(navigator.onLine===false);el.dataset.kind='network';};
 const settle=()=>{hideTimer=null;if(!pending.size&&navigator.onLine!==false){const el=panel();if(el)el.hidden=true;}};
 const begin=()=>{const token=++next;pending.add(token);clearTimeout(hideTimer);hideTimer=null;const el=panel();if(el&&!el.hidden)show();else if(showTimer===null)showTimer=setTimeout(()=>{showTimer=null;if(pending.size||navigator.onLine===false)show();},220);return token;};
 const end=token=>{pending.delete(token);if(pending.size)return;clearTimeout(showTimer);showTimer=null;if(navigator.onLine===false){show();return;}clearTimeout(hideTimer);hideTimer=setTimeout(settle,180);};
 const connection=()=>{if(navigator.onLine===false||pending.size){clearTimeout(hideTimer);hideTimer=null;show();}else{clearTimeout(hideTimer);hideTimer=setTimeout(settle,180);}};
 // Synchronous navigation has no loading task.
 window.SouqLoading={begin,end,transition:()=>{}};
 window.addEventListener('offline',connection);window.addEventListener('online',connection);
 if(navigator.onLine===false)show();
})();
