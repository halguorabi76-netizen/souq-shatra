/* Arabic keyboards (iPad, Android) type ٠١٢٣٤٥٦٧٨٩ or ۰۱۲۳۴۵۶۷۸۹. Phone, price and quantity
 * checks across the site expect 0-9, so a customer typing «٠٧٧٠…» could never continue.
 * Convert those digits as they are typed or pasted into any numeric or phone field,
 * before the page's own listeners read the value. Text fields (names, addresses) are left as typed. */
(()=>{
 const ARABIC='٠١٢٣٤٥٦٧٨٩',PERSIAN='۰۱۲۳۴۵۶۷۸۹';
 const toLatin=value=>String(value??'').replace(/[٠-٩۰-۹]/g,c=>{const i=ARABIC.indexOf(c);return String(i>=0?i:PERSIAN.indexOf(c));});
 const numeric=el=>el instanceof HTMLInputElement&&(['tel','number'].includes(el.type)||['numeric','decimal','tel'].includes((el.getAttribute('inputmode')||'').toLowerCase()));
 function normalize(el){
  if(!numeric(el))return;const before=el.value,after=toLatin(before);if(after===before)return;
  let start=null,end=null;try{start=el.selectionStart;end=el.selectionEnd;}catch{}
  el.value=after;
  // One Arabic digit becomes one Latin digit, so the caret stays where it was.
  try{if(start!==null)el.setSelectionRange(start,end);}catch{}
 }
 // Capture phase: runs before every form's own «input» listener, so validation sees 0-9.
 document.addEventListener('input',e=>normalize(e.target),true);
 document.addEventListener('change',e=>normalize(e.target),true);
 window.SouqDigits={toLatin,normalize};
})();
