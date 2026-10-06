/* Delivery location selection. Coordinates remain a draft until explicit confirmation. */
(()=>{
 const home=[31.409063,46.172704];
 let active=null,loading=null;
 function point(value){
  if(!value||value.lat==null||value.lon==null||value.lat===''||value.lon==='')return null;
  const lat=Number(value.lat),lon=Number(value.lon);
  return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?{lat:+lat.toFixed(6),lon:+lon.toFixed(6)}:null;
 }
 function url(value){const p=point(value);return p?'https://www.google.com/maps?q='+p.lat+','+p.lon:''}
 function close(){const previous=active;active=null;if(previous){previous.map?.remove();previous.observer?.disconnect();previous.returnFocus?.focus();}}
 function load(){
  if(window.L)return Promise.resolve(window.L);
  if(loading)return loading;
  loading=new Promise((resolve,reject)=>{
   const css=document.createElement('link');css.rel='stylesheet';css.href='vendor/leaflet/leaflet.css';document.head.append(css);
   const script=document.createElement('script');script.src='vendor/leaflet/leaflet.js';
   const fail=()=>{clearTimeout(timer);script.remove();css.remove();loading=null;reject(new Error('map unavailable'))};
   const timer=setTimeout(fail,15000);script.onload=()=>{clearTimeout(timer);if(window.L)resolve(window.L);else fail()};script.onerror=fail;document.head.append(script);
  });return loading;
 }
 async function show({value,sheet,head,onConfirm,title='اختيار موقع التوصيل',purpose='التوصيل'}){
  close();const returnFocus=document.activeElement;
  sheet(head(title)+`<div class="location-picker"><p>اضغط على الخريطة لاختيار مكان ${purpose}، أو حرّك علامة الموقع.</p><div id="deliveryMap" class="delivery-map" aria-label="خريطة اختيار موقع ${purpose}"></div><p id="mapStatus" class="note" role="status" aria-live="polite">جارٍ فتح الخريطة…</p><div class="location-picker-actions"><button id="mapLocate" class="alt" type="button">تحديد موقعي الآن</button><button id="mapRetry" class="alt" type="button" hidden>إعادة تحميل الخريطة</button><a id="mapExternal" class="alt" target="_blank" rel="noopener noreferrer" hidden>فتح الموقع في تطبيق الخرائط</a><button id="mapConfirm" class="buy" type="button" disabled>موافق، اعتماد هذا الموقع</button></div></div>`);
  const session={draft:point(value),map:null,revision:0,request:0,returnFocus};active=session;
  const container=document.getElementById('deliveryMap'),status=document.getElementById('mapStatus'),confirm=document.getElementById('mapConfirm'),locate=document.getElementById('mapLocate'),retry=document.getElementById('mapRetry');
  const current=()=>active===session&&container.isConnected;
  session.observer=new MutationObserver(()=>{if(active===session&&(!container.isConnected||document.getElementById('shade').hidden))close()});session.observer.observe(document.getElementById('shade'),{attributes:true,childList:true,subtree:true,attributeFilter:['hidden']});
  let marker=null;
  const select=(value,manual=true)=>{
   const p=point(value);if(!p||!current())return;
   session.draft=p;if(manual)session.revision++;
   if(marker)marker.setLatLng([p.lat,p.lon]);
   else {marker=window.L.marker([p.lat,p.lon],{draggable:true,icon:window.L.divIcon({className:'delivery-map-pin',html:'<span aria-hidden="true">📍</span>',iconSize:[36,42],iconAnchor:[18,40]}),title:'الموقع المختار؛ اسحب لتعديله'}).addTo(session.map);marker.on('dragend',()=>{const p=marker.getLatLng();select({lat:p.lat,lon:p.lng})});}
   const external=document.getElementById('mapExternal');external.href=url(p);external.hidden=false;confirm.disabled=false;status.textContent='الموقع المختار: '+p.lat.toFixed(5)+'، '+p.lon.toFixed(5)+' — اضغط موافق لاعتماده.';
  };
  const locateNow=()=>{
   if(!navigator.geolocation){status.textContent='تحديد الموقع التلقائي غير متاح. اختر مكانك بالضغط على الخريطة.';return;}
   const request=++session.request,revision=session.revision;locate.disabled=true;status.textContent='اسمح بالوصول إلى الموقع لتحديد مكانك، أو اختره على الخريطة.';
   navigator.geolocation.getCurrentPosition(position=>{
    if(!current()||request!==session.request)return;locate.disabled=false;
    if(revision!==session.revision)return;
    const p=point({lat:position.coords.latitude,lon:position.coords.longitude});if(!p){status.textContent='تعذّر تحديد مكانك. اختره على الخريطة.';return;}
    session.map.setView([p.lat,p.lon],17);select(p,false);
   },error=>{
    if(!current()||request!==session.request)return;locate.disabled=false;if(revision!==session.revision)return;
    status.textContent=error.code===1?'لم يُسمح بالوصول إلى الموقع. يمكنك السماح به من إعدادات الهاتف، أو اختيار المكان على الخريطة.':'تعذّر تحديد موقعك تلقائيًا. اختر المكان على الخريطة أو حاول مجددًا.';
   },{enableHighAccuracy:true,timeout:12000,maximumAge:0});
  };
  confirm.addEventListener('click',()=>{if(current()&&session.draft){const selected={...session.draft};close();onConfirm(selected)}});
  retry.addEventListener('click',()=>show({value:session.draft,sheet,head,onConfirm,title,purpose}));
  try{
   const L=await load();if(!current())return;
   session.map=L.map(container,{zoomControl:true}).setView(session.draft?[session.draft.lat,session.draft.lon]:home,session.draft?17:14);
   const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'});
   tiles.on('tileerror',()=>{if(current()){status.textContent='تعذّر تحميل جزء من الخريطة. تحقق من الإنترنت ثم أعد المحاولة.';retry.hidden=false}});tiles.addTo(session.map);
   session.map.on('click',event=>select({lat:event.latlng.lat,lon:event.latlng.lng}));
   locate.addEventListener('click',locateNow);session.map.invalidateSize();
   if(session.draft)select(session.draft,false);else {status.textContent='اختر مكان '+purpose+' على الخريطة.';locateNow();}
  }catch{if(current()){locate.disabled=true;status.textContent='تعذّر فتح الخريطة. تحقق من الإنترنت وأعد المحاولة.';retry.hidden=false;}}
 }
 window.SouqLocationPicker={show,close,point,url};
})();
