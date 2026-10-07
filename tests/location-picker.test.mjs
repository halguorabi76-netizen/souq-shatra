import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../location-picker.js',import.meta.url),'utf8');
function setup(){
 const nodes=new Map(),geo=[],maps=[],markers=[],confirmed=[];
 const node=id=>{const n={id,isConnected:true,disabled:false,hidden:false,textContent:'',events:{},focus(){},addEventListener(type,callback){this.events[type]=callback}};nodes.set(id,n);return n};
 node('shade');
 const L={map(){const map={events:{},setView(){return this},on(type,callback){this.events[type]=callback;return this},invalidateSize(){},remove(){this.removed=true}};maps.push(map);return map},tileLayer(){return {on(){return this},addTo(){return this}}},divIcon:x=>x,marker(coords){const marker={coords,events:{},addTo(){return this},on(type,callback){this.events[type]=callback;return this},setLatLng(coords){this.coords=coords},getLatLng(){return {lat:this.coords[0],lng:this.coords[1]}}};markers.push(marker);return marker}};
 const context={window:{L},navigator:{geolocation:{getCurrentPosition(success,failure){geo.push({success,failure})}}},document:{activeElement:{focus(){}},getElementById:id=>nodes.get(id)},MutationObserver:class{observe(){}disconnect(){}},setTimeout,clearTimeout};vm.createContext(context);vm.runInContext(code,context);
 const api=context.window.SouqLocationPicker;
 const show=value=>api.show({value,sheet(){for(const id of ['deliveryMap','mapStatus','mapConfirm','mapLocate','mapRetry','mapExternal'])node(id);nodes.get('mapConfirm').disabled=true},head:()=>'',onConfirm:p=>confirmed.push(p)});
 return {api,show,nodes,geo,maps,markers,confirmed};
}
test('map remains selectable when GPS is denied and confirms only the chosen point',async()=>{
 const x=setup();await x.show();assert.equal(x.confirmed.length,0);assert.equal(x.nodes.get('mapConfirm').disabled,true);
 x.geo[0].failure({code:1});assert.match(x.nodes.get('mapStatus').textContent,/اختيار المكان على الخريطة/);
 x.maps[0].events.click({latlng:{lat:31.4112346,lng:46.1712346}});assert.equal(x.nodes.get('mapConfirm').disabled,false);assert.equal(x.confirmed.length,0);
 x.nodes.get('mapConfirm').events.click();assert.equal(x.confirmed[0].lat,31.411235);assert.equal(x.confirmed[0].lon,46.171235);assert.equal(x.maps[0].removed,true);
});
test('manual adjustment wins over a late automatic location response',async()=>{
 const x=setup();await x.show();x.maps[0].events.click({latlng:{lat:31.4,lng:46.2}});
 x.geo[0].success({coords:{latitude:30,longitude:45}});x.nodes.get('mapConfirm').events.click();assert.equal(x.confirmed[0].lat,31.4);assert.equal(x.confirmed[0].lon,46.2);
});
test('editing and cancelling do not replace an already confirmed location; closed GPS callbacks are ignored',async()=>{
 const x=setup(),previous={lat:31.4,lon:46.2};await x.show(previous);assert.equal(x.geo.length,0);
 x.nodes.get('mapLocate').events.click();x.maps[0].events.click({latlng:{lat:32,lng:47}});x.api.close();
 x.geo[0].success({coords:{latitude:30,longitude:45}});assert.equal(x.confirmed.length,0);assert.deepEqual(previous,{lat:31.4,lon:46.2});assert.equal(x.maps[0].removed,true);
});
test('marker dragging determines the final approved delivery coordinates',async()=>{
 const x=setup();await x.show({lat:31.4,lon:46.2});x.markers[0].coords=[31.5,46.3];x.markers[0].events.dragend();x.nodes.get('mapConfirm').events.click();assert.equal(x.confirmed[0].lat,31.5);assert.equal(x.confirmed[0].lon,46.3);
});
test('invalid or absent coordinates cannot produce a saved delivery link',()=>{
 const x=setup();for(const p of [null,{}, {lat:'',lon:''},{lat:91,lon:0},{lat:0,lon:181},{lat:'bad',lon:46}])assert.equal(x.api.point(p),null);
 assert.equal(x.api.url({lat:0,lon:0}),'https://www.google.com/maps?q=0,0');
});
