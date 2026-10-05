import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function load(file,extra={}){const context={...extra};vm.createContext(context);vm.runInContext(readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/export /g,''),context);return context;}
test('delivery metrics separate customer totals, earnings and cancelled work',()=>{
 const c=load('delivery-workspace.js'),orders=[{driver_id:'a',st:3,total:13000,delivery_fee:2000},{driver_id:'a',st:2,total:8000,delivery_fee:1500},{driver_id:'a',st:4,total:90000,delivery_fee:90000},{driver_id:'b',st:3,total:7000}];
 assert.deepEqual(JSON.parse(JSON.stringify(c.deliveryMetrics(orders,'a'))),{done:1,pending:1,completedTotal:13000,pendingTotal:8000,earnings:2000});
});
test('WhatsApp application uses agreed number, encoded data and account ID',()=>{
 const c=load('delivery-workspace.js'),url=new URL(c.driverWhatsapp({full_name:'حيدر & علي',phone:'07811111111',email:'a@example.com',address:'الشطرة',vehicle:'دراجة'},'account-id'));
 assert.equal(url.hostname,'wa.me');assert.equal(url.pathname,'/9647837271707');assert.match(url.searchParams.get('text'),/حيدر & علي/);assert.match(url.searchParams.get('text'),/account-id/);
});
test('reaction controls preserve independent like/favorite state and escape IDs',()=>{
 const c=load('activity-center.js'),html=c.interactionControls('p"bad',[{product_id:'p"bad',kind:'favorite'}],E);
 assert.match(html,/favorite" aria-pressed="true"/);assert.match(html,/like" aria-pressed="false"/);assert.doesNotMatch(html,/data-v="p"bad/);
});
test('unread count excludes read notifications and already-seen valid offers',()=>{
 const c=load('activity-center.js');assert.equal(c.unreadCount([{read_at:null},{read_at:'now'}],[{order_id:'one'},{order_id:'two'}],new Set(['one'])),2);
});
function workspace(g){const view={innerHTML:''},events={};const c=load('delivery-workspace.js',{document:{querySelector:()=>view,addEventListener:(type,fn)=>events[type]=fn}});let noticeSync=0;const ctx={get:()=>g,esc:E,fmt:n=>n+' د.ع',when:()=>'',status:['جديد','قيد التجهيز','خرج للتوصيل','تم التسليم','ملغي'],bell:'',noticeSync:()=>noticeSync++,tab(){}};const w=c.createDriverWorkspace(ctx);return {w,view,events};}
test('pending driver sees application review, no delivery offers or customer data',()=>{
 const g={user:{id:'a'},profile:{full_name:'سائق'},driver:{approved:false,amount_due:0,debt_limit:5000},driverProfile:{full_name:'سائق',email:'a@example.com'},data:{o:[{driver_id:'a',st:1,cust:{name:'SECRET'}}]},offers:[{store_name:'SECRET-OFFER'}],payments:[]};const {w,view}=workspace(g);w.render();assert.match(view.innerHTML,/طلبك قيد المراجعة/);assert.match(view.innerHTML,/wa.me\/9647837271707/);assert.doesNotMatch(view.innerHTML,/SECRET/);
});
test('approved driver sees only own current work, pickup and customer details',()=>{
 const order={id:'abcdef',mid:'store',driver_id:'a',st:1,ts:'now',items:[{name:'قميص',q:2}],cust:{name:'زبون',addr:'عنوان الزبون',phone:'07811111111'},total:12000,platform_fee:1000,delivery_fee:2000};
 const g={user:{id:'a'},profile:{},driver:{approved:true,amount_due:5000,debt_limit:5000},driverProfile:{full_name:'السائق'},data:{o:[order,{...order,driver_id:'b',items:[{name:'OTHER-DRIVER',q:1}]}],m:[{id:'store',name:'متجر',phone:'07822222222'}],driverContacts:[{order_id:'abcdef',pickup_address:'استلام خاص'}]},offers:[],payments:[]};const {w,view}=workspace(g);w.render();assert.match(view.innerHTML,/استلام خاص|عنوان الزبون|قميص/);assert.doesNotMatch(view.innerHTML,/OTHER-DRIVER/);assert.match(view.innerHTML,/بلغت حد المستحقات/);assert.match(view.innerHTML,/استلمت المواد ودفعت للتاجر/);
});
test('seller driver contact escapes names and exposes only supplied contact fields',()=>{
 const c=load('delivery-workspace.js'),html=c.driverContact({full_name:'<script>',phone:'07811111111',vehicle:'دراجة',email:'PRIVATE',address:'PRIVATE'},E);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/PRIVATE/);
});
