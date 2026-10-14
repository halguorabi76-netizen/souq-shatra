/* Session-local navigation; no network requests or artificial delays. */
(()=>{
 const routeKey=r=>JSON.stringify([r.tab,r.dt,r.publicStoreId]);
 function create(){
  let scope='',current=null,routes=[],sheetKey=null,sheets=[],sheetContext=null;
  return {
   track(route,identity){if(scope!==identity){scope=identity;current=null;routes=[];sheets=[];sheetKey=null;sheetContext=null;}if(current&&routeKey(current)!==routeKey(route)){current.scroll=route.scroll;routes.push(current);}current={...route,filt:{...route.filt}};},
   canBack:()=>routes.length>0,
   backRoute(){const previous=routes.pop();if(previous)current=previous;return previous||null;},
   openSheet(key,snapshot,context){if(sheetKey&&key!==sheetKey&&snapshot)sheets.push({...snapshot,...(sheetContext||{}),key:sheetKey});sheetKey=key;sheetContext=context||null;},
   backSheet(){const previous=sheets.pop();sheetKey=previous?.key||null;sheetContext=previous?{cur:previous.cur,infoRole:previous.infoRole}:null;return previous||null;},
   closeSheets(){sheets=[];sheetKey=null;sheetContext=null;},
   reset(){scope='';current=null;routes=[];sheets=[];sheetKey=null;sheetContext=null;}
  };
 }
 window.SouqPageNavigation={create};
})();
