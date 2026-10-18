/* Arabic keyboards (iPad, Android) type ٠١٢٣٤٥٦٧٨٩ or ۰۱۲۳۴۵۶۷۸۹. Phone, price and quantity
 * checks across the site expect 0-9, so a customer typing «٠٧٧٠…» could never continue, and
 * number fields (price, stock) silently dropped those digits altogether.
 * Convert them in every numeric or phone field. Text fields (names, addresses) are left as typed. */
(()=>{
 const ARABIC='٠١٢٣٤٥٦٧٨٩',PERSIAN='۰۱۲۳۴۵۶۷۸۹',EASTERN=/[٠-٩۰-۹]/;
 const toLatin=value=>String(value??'').replace(/[٠-٩۰-۹٫٬]/g,c=>{if(c==='٫')return '.';if(c==='٬')return '';const i=ARABIC.indexOf(c);return String(i>=0?i:PERSIAN.indexOf(c));});
 const numeric=el=>el instanceof HTMLInputElement&&(['tel','number'].includes(el.type)||['numeric','decimal','tel'].includes((el.getAttribute('inputmode')||'').toLowerCase()));
 // Number fields reject «٤» before any «input» event, so catch the keystroke or paste first and insert 0-9 instead.
 function beforeInput(e){
  const el=e.target;if(!numeric(el)||!e.data||!EASTERN.test(e.data)||!/^insert/.test(e.inputType||''))return;
  e.preventDefault();const text=toLatin(e.data);
  // A number field has no caret position to read: append, but replace a lone placeholder zero.
  if(el.type==='number'){const v=String(el.value||'');el.value=(v==='0'?'':v)+text;}
  else{const s=el.selectionStart??el.value.length,t=el.selectionEnd??s;el.setRangeText(text,s,t,'end');}
  el.dispatchEvent(new Event('input',{bubbles:true}));
 }
 function normalize(el){
  if(!numeric(el)||el.type==='number')return;const before=el.value,after=toLatin(before);if(after===before)return;
  let start=null,end=null;try{start=el.selectionStart;end=el.selectionEnd;}catch{}
  el.value=after;
  // One Arabic digit becomes one Latin digit, so the caret stays where it was.
  try{if(start!==null)el.setSelectionRange(start,end);}catch{}
 }
 // Capture phase: runs before every form's own listeners, so validation sees 0-9.
 document.addEventListener('beforeinput',beforeInput,true);
 document.addEventListener('input',e=>normalize(e.target),true);
 document.addEventListener('change',e=>normalize(e.target),true);
 window.SouqDigits={toLatin,normalize};
})();
