/* Only connectivity problems show the mascot. Normal work never adds a delay. */
(()=>{
 let failed=false;
 const update=()=>{const el=document.getElementById('auroraLoading');if(!el)return;const offline=navigator.onLine===false;el.hidden=!offline&&!failed;el.dataset.offline=String(offline);el.dataset.kind='network';el.querySelector('span').textContent=offline?'الاتصال بالإنترنت منقطع — ننتظر عودته':'تعذّر الاتصال — تحقق من الإنترنت';};
 window.SouqLoading={begin:()=>{},end:()=>{},transition:()=>{},failed:()=>{failed=true;update();},recovered:()=>{failed=false;update();}};
 window.addEventListener('offline',update);window.addEventListener('online',()=>{failed=false;update();});
 update();
})();
