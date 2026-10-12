/* Published local service areas; fees are validated again by the order RPC. */
(()=>{
 const ids=['shatra','nasr','dawaya','bidaa','alsada','seven_april'];
 function zoneId(c){return c.area==='shatra'?'shatra':c.area==='outside'?(c.outside==='other'?c.city:c.outside):'';}
 function quote(zones,choice,subtotal,platformFee,count=1){const zone=zones.find(z=>z.id===zoneId(choice)&&z.enabled),orders=Math.max(0,Number(count)||0),fee=Number(platformFee)||0;return {zone,ready:!!zone,delivery:zone?zone.fee*orders:null,platform:fee*orders,total:zone?subtotal+(zone.fee+fee)*orders:null};}
 function selection(zones,c,esc){const options=(rows,value)=>rows.map(([id,name])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(name)}</option>`).join('');return `<label for="checkoutArea">هل التوصيل داخل الشطرة أم خارجها؟</label><select id="checkoutArea">${options([['shatra','داخل الشطرة'],['outside','خارج الشطرة']],c.area)}</select>${c.area==='outside'?`<label for="checkoutOutside">المدينة</label><select id="checkoutOutside">${options([['','اختر المدينة'],...ids.slice(1).map(id=>zones.find(z=>z.id===id&&z.enabled)).filter(Boolean).map(z=>[z.id,z.name])],c.outside)}</select>`:''}`;}
 window.SouqDeliveryZones={zoneId,quote,selection};
})();
