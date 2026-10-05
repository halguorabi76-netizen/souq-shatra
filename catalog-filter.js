/* Shared selection rules for public listings and the labelled local demo. */
(()=>{
'use strict';
const normalize=value=>String(value??'').normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').toLocaleLowerCase('ar').replace(/\s+/g,' ').trim();
const category=value=>({'غذائيات':'مواد غذائية','إلكترونيات':'أجهزة','الكترونيات':'أجهزة','المنزل':'منزلية','رياضة':'أخرى'}[value]||value);
const matches=(text,query)=>normalize(query).split(' ').filter(Boolean).every(term=>normalize(text).includes(term));
function select(products,options={},sellerName=()=> ''){
 const chosen=options.category||'all',min=options.min,max=options.max;
 const list=products.filter(p=>(chosen==='all'||chosen==='الكل'||category(p.cat??p.category)===category(chosen))&&matches([p.name,p.desc,p.sku,p.variant,sellerName(p)].join(' '),options.query)&&(!(min!==''&&min!=null)||+p.price>=+min)&&(!(max!==''&&max!=null)||+p.price<=+max));
 if(options.sort==='cheap')list.sort((a,b)=>a.price-b.price);else if(options.sort==='expensive')list.sort((a,b)=>b.price-a.price);else if(options.sort==='oldest')list.reverse();
 return list;
}
window.SouqCatalog={normalize,category,matches,select};
})();
