/* Only failed connectivity shows the mascot; normal actions add no delay. */
(()=>{
 let failed=navigator.onLine===false,successful=false;
 const update=()=>{
  const panel=document.getElementById('auroraLoading');if(!panel)return;
  const offline=navigator.onLine===false;panel.hidden=!failed&&!offline;
  panel.dataset.offline=String(offline);panel.dataset.kind='network';
  panel.querySelector('span').textContent='جار التحميل';
 };
 window.SouqLoading={
  begin:()=>{},end:()=>{},transition:()=>{},
  failed:()=>{failed=true;successful=false;update();},
  requestSucceeded:()=>{successful=true;},
  recovered:()=>{if(successful&&navigator.onLine!==false){failed=false;successful=false;}update();}
 };
 window.addEventListener('offline',()=>{failed=true;successful=false;update();});
 // Keep the mascot visible until a real request confirms recovery.
 window.addEventListener('online',update);
 update();
})();
