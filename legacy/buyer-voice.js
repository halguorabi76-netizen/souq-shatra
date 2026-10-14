/* An account preference for Arabic wording. It never determines permissions. */
(()=>{
'use strict';
const valid=value=>['male','female'].includes(value)?value:null;
const pairs=[['ابحث','ابحثي'],['تسوق','تسوقي'],['تسوّق','تسوّقي'],['انظر','انظري'],['اكتشف','اكتشفي'],['اختر','اختاري'],['تصفح','تصفحي'],['اضغط','اضغطي'],['اكتب','اكتبي'],['أضف','أضيفي'],['راجع','راجعي'],['سجّل','سجّلي'],['استخدم','استخدمي'],['عدّل','عدّلي'],['طلباتك','طلباتكِ'],['مشترياتك','مشترياتكِ'],['سلتك','سلتكِ'],['طلبك','طلبكِ']];
function wording(text,gender){
 let result=String(text??'');
 for(const [male,female] of pairs){const from=gender==='female'?male:female,to=gender==='female'?female:male;result=result.replace(new RegExp('(^|[\\s،؛:«])'+from+'(?=[\\s،؛:»·.…!?]|$)','g'),(_,before)=>before+to);}
 return result;
}
function create({get,db,onChange=()=>{}}){
 let prompted='',dialog=null,busy=false,scheduled=false;
 const key=id=>'souq-buyer-voice-'+id;
 function gender(){const {user}=get();if(!user)return null;const saved=valid(user.user_metadata?.address_gender);if(saved)return saved;try{return valid(localStorage.getItem(key(user.id)))}catch{return null;}}
 function active(){const g=get();return !!g.user&&!!g.profile&&g.ready&&g.mode==='buyer'&&!g.adminPortal&&!g.profile?.disabled&&!g.seller;}
 const excluded='#productDetailBody h1,.sw-sitebrand,.boutique-drawer-brand,#swDrawerTitle,.product-description,.product-seller-card,.mp-product-store,.mp-card-body h3,.sw-public-header,.sw-product-info,.profile-hero,.va-chip,.va-specs,.cart-line-name,.invoice-product,[data-preserve-copy]';
 function paint(){
  if(!document.body)return;
  const selected=active()?gender():null;
  document.documentElement.dataset.buyerGender=selected||'';
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  let node;while((node=walker.nextNode())){
   const el=node.parentElement;
   if(!el||el.closest('script,style,input,textarea,'+excluded)||!el.closest('button,label,legend,h1,h2,h3,summary,.note,.banner-caption,.banner-subtitle,.buyer-checkout-card.done p,.buyer-cart-heading'))continue;
   const value=wording(node.nodeValue,selected);if(value!==node.nodeValue)node.nodeValue=value;
  }
  document.querySelectorAll('input[placeholder],button[aria-label],button[title]').forEach(el=>{if(el.closest(excluded)||el.matches('[data-a=prod],.mp-product-open,.sw-public-product'))return;for(const attribute of ['placeholder','aria-label','title'])if(el.hasAttribute(attribute)){const old=el.getAttribute(attribute),value=wording(old,selected);if(value!==old)el.setAttribute(attribute,value);}});
 }
 async function choose(value){
  if(busy||!active()||!valid(value))return;
  const account=get().user;busy=true;
  dialog?.querySelectorAll('[data-gender]').forEach(b=>b.disabled=true);
  try{
   if(!db.preview){const result=await db.auth.updateUser({data:{address_gender:value}});if(result.error)throw result.error;}
   if(get().user?.id!==account.id)return;
   account.user_metadata={...account.user_metadata,address_gender:value};
   try{localStorage.setItem(key(account.id),value)}catch{}
   dialog?.close();dialog?.remove();dialog=null;paint();onChange();
  }catch(error){if(dialog){dialog.querySelector('[role=status]').textContent='تعذّر حفظ الاختيار. تحقق من الاتصال ثم حاول مرة أخرى.';}}
  finally{busy=false;dialog?.querySelectorAll('[data-gender]').forEach(b=>b.disabled=false);}
 }
 function show(){
  if(!active()||dialog)return;prompted=get().user.id;
  dialog=document.createElement('dialog');dialog.id='buyerVoiceDialog';dialog.className='buyer-voice-dialog';
  dialog.setAttribute('aria-labelledby','buyerVoiceTitle');
  dialog.innerHTML='<span class="voice-mark" aria-hidden="true">✦</span><h2 id="buyerVoiceTitle">كيف نخاطبك؟</h2><p>اختر الجنس لتناسبك عبارات التسوق.</p><div class="voice-options"><button type="button" data-gender="male"><span aria-hidden="true">♂</span>ذكر</button><button type="button" data-gender="female"><span aria-hidden="true">♀</span>أنثى</button></div><small>يمكن تعديل اختيارك من الإعدادات.</small><p role="status" aria-live="polite"></p>';
  dialog.addEventListener('click',event=>{const choice=event.target.closest('[data-gender]');if(choice)choose(choice.dataset.gender);});
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  dialog.addEventListener('close',()=>{dialog?.remove();dialog=null;});
  document.body.append(dialog);dialog.showModal();paint();
 }
 function sync(){
  if(scheduled)return;scheduled=true;
  queueMicrotask(()=>{scheduled=false;paint();const g=get();if(!active()){if(dialog&&!busy){dialog.close();dialog=null;}if(!g.user)prompted='';return;}if(!gender()&&prompted!==g.user.id&&!db.preview)show();});
 }
 const observer=new MutationObserver(sync);observer.observe(document.body,{childList:true,characterData:true,subtree:true});sync();
 return {sync,show,choose,gender,paint};
}
window.SouqBuyerVoice={create,wording,valid};
})();
