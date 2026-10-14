/* Authentication storage follows the account owner's explicit device choice. */
(()=>{
'use strict';
function createStorage(device,session,prefix){
 const preference='souq-auth-retention';
 const read=(area,key)=>{try{return area.getItem(key)}catch{return null}};
 let mode=(read(session,preference)||read(device,preference))==='session'?'session':'device';
 const target=()=>mode==='session'?session:device;
 const keys=area=>Array.from({length:area.length},(_,i)=>area.key(i)).filter(k=>k?.startsWith(prefix));
 const storage={getItem:key=>read(target(),key),setItem:(key,value)=>target().setItem(key,value),removeItem:key=>{for(const area of [device,session])area.removeItem(key)}};
 function choose(next){
  next=next==='device'?'device':'session';const destination=next==='device'?device:session,source=target();
  const tokenKeys=[...new Set([...keys(device),...keys(session)])];
  const snapshots=[device,session].map(area=>({area,entries:[preference,...tokenKeys].map(key=>[key,read(area,key)])}));
  const entries=tokenKeys.map(key=>[key,read(source,key)??read(destination,key)]).filter(([,v])=>v!==null);
  try{
   // Keep the previous copy until the destination has accepted every token, including PKCE.
   for(const [key,value] of entries)destination.setItem(key,value);
   for(const area of [device,session]){
    if(area!==destination)for(const key of tokenKeys)area.removeItem(key);
    area.setItem(preference,next);
   }
  }catch(error){
   for(const {area,entries:previous} of snapshots)for(const [key,value] of previous)try{if(value===null)area.removeItem(key);else area.setItem(key,value)}catch{}
   throw error;
  }
  mode=next;return mode;
 }
 return {storage,choose,mode:()=>mode};
}
window.SouqAccountAccess={createStorage};
})();
