// Round profile photos for customers and delivery drivers (merchants show their store image instead).
// Each account has one public photo at avatars/<user id>/avatar.jpg. Accounts without a photo show the
// first letter of their name: a photo that fails to load removes itself and leaves that letter.
export const avatarPath=id=>`${id}/avatar.jpg`;
const SIZE=320;
export function createAvatars({db,esc}){
 const localKey=id=>'souq-shatra-avatar-'+id;
 // Your own photo is kept on this device too, so it shows at once (and offline) after you choose it.
 function local(id){try{const v=localStorage.getItem(localKey(id))||'';return v.startsWith('data:image/jpeg;base64,')?v:''}catch{return ''}}
 function url(id){
  if(!id)return '';const own=db.preview?'':local(id);if(own)return own;
  const u=db.storage.from('avatars').getPublicUrl(avatarPath(id))?.data?.publicUrl||'';
  // Public photo URLs are cached by the CDN; a ten-minute stamp lets a new photo appear the same day.
  return !u||u.startsWith('data:')?u:u+'?v='+Math.floor(Date.now()/600000);
 }
 function html(id,name='',cls=''){
  const src=url(id),letter=esc(String(name||'').trim().slice(0,1)||'؟');
  return `<span class="avatar-circle ${cls}" aria-hidden="true"><b>${letter}</b>${src?`<img src="${esc(src)}" alt="" decoding="async">`:''}</span>`;
 }
 function square(file){return new Promise((resolve,reject)=>{const link=URL.createObjectURL(file),im=new Image();im.onload=()=>{URL.revokeObjectURL(link);const side=Math.min(im.width,im.height),c=document.createElement('canvas');c.width=c.height=SIZE;c.getContext('2d').drawImage(im,(im.width-side)/2,(im.height-side)/2,side,side,0,0,SIZE,SIZE);resolve(c);};im.onerror=()=>{URL.revokeObjectURL(link);reject(Error('تعذّر فتح الصورة. اختر صورة أخرى'));};im.src=link;});}
 // Crops the middle square, uploads it, and keeps a small copy on this device.
 async function save(id,file){
  if(!id||!file)return;if(!/^image\//.test(file.type||''))throw Error('اختر صورة');
  const canvas=await square(file),blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.82));
  if(!blob)throw Error('تعذّر تجهيز الصورة');
  const {error}=await db.storage.from('avatars').upload(avatarPath(id),blob,{upsert:true,contentType:'image/jpeg',cacheControl:'60'});
  if(error)throw Error(error.message||'تعذّر رفع الصورة');
  try{const small=document.createElement('canvas');small.width=small.height=160;small.getContext('2d').drawImage(canvas,0,0,160,160);localStorage.setItem(localKey(id),small.toDataURL('image/jpeg',.75));}catch{}
 }
 if(typeof document!=='undefined'&&!createAvatars.listening){createAvatars.listening=true;document.addEventListener('error',e=>{if(e.target?.matches?.('.avatar-circle img'))e.target.remove();},true);}
 return {url,html,save,local};
}
