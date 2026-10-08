/* Presentation only: actions run immediately; animation never gates navigation. */
(()=>{
'use strict';
const style=document.createElement('style');style.textContent=`
:where(button,a,input,select,textarea,label){-webkit-tap-highlight-color:transparent}
:where(button,a,[role="button"]){touch-action:manipulation}
:where(button,a):focus:not(:focus-visible){outline:none}
:where(button,a):focus-visible{outline:2px solid var(--seller-accent,var(--navy,#245bc5));outline-offset:3px}
button{transition:background-color 120ms ease,box-shadow 120ms ease}
button.ui-pressed:not(:disabled){filter:brightness(.96)}
#shade{opacity:1;transition:opacity 160ms ease,display 160ms allow-discrete}#shade[hidden]{opacity:0;pointer-events:none}
@starting-style{#shade:not([hidden]){opacity:0}}
#view{overflow-x:clip}#auroraLoading{pointer-events:none}
@media(prefers-reduced-motion:reduce){button,#shade{transition:none}}
`;document.head.append(style);
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function pulse(el){if(!el||reduced.matches||!el.animate)return;el.animate([{transform:'scale(1)'},{transform:'scale(1.12)'},{transform:'scale(1)'}],{duration:240,easing:'ease-out'});}
window.SouqMotion={pulse};
let cartCount=null;const noticeCounts=new WeakMap();new MutationObserver(()=>{const badge=document.getElementById('cc'),count=Number(badge?.textContent)||0;if(cartCount!==null&&count>cartCount)pulse(document.querySelector('.tabs [data-v="myMarket"] .navicon'));cartCount=count;document.querySelectorAll('[data-notice-count]').forEach(el=>{const n=Number(el.textContent)||0,old=noticeCounts.get(el);if(old!==undefined&&n>old)pulse(el.closest('button'));noticeCounts.set(el,n);});}).observe(document.body,{childList:true,subtree:true,characterData:true});
const animations=new WeakMap();let inputAt=-Infinity,pressed=null;
function animate(el,kind){
 if(!el||reduced.matches||!el.animate||document.hidden)return;
 animations.get(el)?.cancel();
 const panel=kind==='panel',animation=el.animate([
 {opacity:panel?0:.4,transform:panel?'translateY(18px)':'translateX(10px)'},
 {opacity:1,transform:'translate(0,0)'}
 ],{duration:panel?210:170,easing:'cubic-bezier(.22,.61,.36,1)'});
 animations.set(el,animation);animation.finished.then(()=>{if(animations.get(el)===animation)animations.delete(el);},()=>{});
}
function release(){pressed?.classList.remove('ui-pressed');pressed=null;}
document.addEventListener('pointerdown',e=>{release();pressed=e.target.closest?.('button,a,[role="button"]');if(pressed&&!pressed.matches(':disabled'))pressed.classList.add('ui-pressed');},{passive:true});
for(const event of ['pointerup','pointercancel'])document.addEventListener(event,release,{passive:true});
window.addEventListener('blur',release);
document.addEventListener('click',()=>{inputAt=performance.now();},true);
const view=document.getElementById('view'),sheet=document.getElementById('sheet'),shade=document.getElementById('shade');
// Observe only replaced page children. Typing, counters and background polls do not animate.
if(view)new MutationObserver(()=>{if(performance.now()-inputAt<500)animate(view,'page');}).observe(view,{childList:true});
if(sheet)new MutationObserver(()=>{if(shade&&!shade.hidden)animate(sheet,'panel');}).observe(sheet,{childList:true});
if(shade)new MutationObserver(()=>{if(shade.hidden&&performance.now()-inputAt<500)animate(view,'page');}).observe(shade,{attributes:true,attributeFilter:['hidden']});
})();
