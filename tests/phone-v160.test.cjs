const test=require('node:test'),assert=require('node:assert/strict');
const {PhoneSync,phoneInput}=require('../electron/services/phoneSync.cjs');
const {createNotificationDelivery}=require('../electron/services/notificationDelivery.cjs');

test('new phone notifications use the same island delivery, deduplicate retries/updates per phone, and do not replay old history',()=>{
 let now=100000;const notices=[],sync=new PhoneSync({now:()=>now,onNotification:createNotificationDelivery({getSettings:()=>({}),sendToIsland:n=>notices.push(n),showWindowsToast:()=>assert.fail('Phone notifications must not create another Windows toast')})});
 const a={id:'a',name:'Samsung',capabilities:['phoneData']},b={id:'b',name:'Pixel',capabilities:['phoneData']};
 const n={id:'one',title:'New message',app:'Messages',text:'Hello',at:now};
 sync.exchange(a,{notifications:[n,{...n,id:'old',at:now-60000}]});assert.equal(notices.length,1);assert.equal(notices[0].source,'phone');assert.match(notices[0].app,/Samsung/);
 sync.exchange(a,{notifications:[n]});sync.exchange(a,{});assert.equal(notices.length,1);
 sync.exchange(b,{notifications:[n]});assert.equal(notices.length,2);assert.notEqual(notices[0].id,notices[1].id);
 sync.exchange(a,{notifications:[{...n,text:'Updated message'}]});assert.equal(notices.length,3);
 a.capabilities=[];sync.exchange(a,{notifications:[{...n,id:'hidden'}]});assert.equal(notices.length,3);assert.deepEqual(sync.snapshot(a.id).notifications,[]);sync.clear();
});
test('phone notification freshness tolerates different PC and phone clocks',()=>{
 const notices=[],sync=new PhoneSync({now:()=>100000,onNotification:n=>notices.push(n)}),d={id:'clock',capabilities:['phoneData']};
 sync.exchange(d,{sentAt:3700000,notifications:[{id:'fresh',at:3700000,title:'New message'},{id:'old',at:3600000,title:'Old message'}]});
 assert.equal(notices.length,1);assert.equal(notices[0].time,100000);sync.clear();
});
test('phone input validates geometry and needs both PC capabilities and a currently shared/control-enabled phone',async()=>{
 const sync=new PhoneSync({now:()=>10000}),d={id:'a',capabilities:['phoneControl','phoneScreen']};
 const body={status:{capture:['screen'],controlEnabled:true}};sync.exchange(d,body);
 const first=sync.request(d,{type:'input',input:{type:'swipe',x:.2,y:.3,endX:.4,endY:.8,duration:9000}});
 const sent=sync.exchange(d,body).commands[0];assert.equal(sent.input.duration,1000);assert.equal(sent.expires,12500);
 sync.exchange(d,{...body,results:[{id:sent.id,value:{accepted:true}}]});assert.equal((await first).accepted,true);
 const revoked=sync.request(d,{type:'input',input:{type:'tap',x:.5,y:.5}});sync.exchange(d,{status:{capture:[],controlEnabled:false}});await assert.rejects(revoked,/revoked/);
 await assert.rejects(sync.request(d,{type:'input',input:{type:'tap',x:.5,y:.5}}),/Enable phone control/);
 for(const value of [{type:'tap',x:-1,y:.5},{type:'tap',x:Infinity,y:0},{type:'swipe',x:0,y:0,endX:2,endY:1},{type:'key',key:'unlock'},{type:'text',text:'x'.repeat(2001)}])assert.throws(()=>phoneInput(value),/phone input/);
 assert.deepEqual(phoneInput({type:'text',text:'مرحبا 👋'}),{type:'text',text:'مرحبا 👋'});
 for(const key of ['escape','backspace','delete','selectAll','copy','cut','paste'])assert.deepEqual(phoneInput({type:'key',key}),{type:'key',key});
 d.capabilities=['phoneControl'];sync.exchange(d,body);await assert.rejects(sync.request(d,{type:'input',input:{type:'key',key:'home'}}),/Enable phone control/);sync.clear();
});
test('phone metadata is bounded and rejects remote-image URLs or malformed backgrounds',()=>{
 const sync=new PhoneSync(),d={id:'a',name:'Phone',capabilities:['phoneData']};
 sync.exchange(d,{status:{battery:150,charging:true,wallpaper:'https://example.com/tracker.jpg',connection:'script',name:'A'.repeat(300),display:{width:1080,height:2340,densityDpi:420,rotation:1}}});
 const state=sync.snapshot(d.id).status;assert.equal(state.battery,null);assert.equal(state.wallpaper,'');assert.equal(state.name.length,100);assert.equal(state.connection,'other');assert.deepEqual(state.display,{width:1080,height:2340,densityDpi:420,rotation:1});
 sync.exchange(d,{status:{battery:40,connection:'usb'}});assert.equal(sync.snapshot(d.id).status.battery,40);sync.clear();
 sync.exchange(d,{status:{display:{width:100000,height:-1,densityDpi:-1,rotation:8}}});assert.equal(sync.snapshot(d.id).status.display,null);sync.clear();
});
test('screen clicks ignore letterboxing and map cover cropping to true phone coordinates',async()=>{
 const {phonePoint}=await import('../src/components/phonePointer.mjs');const rect={left:0,top:0,width:1000,height:1000};
 assert.equal(phonePoint(100,500,rect,100,200),null);assert.deepEqual(phonePoint(500,500,rect,100,200),{x:.5,y:.5});
 assert.deepEqual(phonePoint(0,0,rect,100,200,true),{x:0,y:.25});assert.equal(phonePoint(500,500,rect,0,0),null);
});
test('wallpaper source stays with its device between lightweight polls and is cleared when phone data permission is revoked',()=>{
 const sync=new PhoneSync(),device={id:'wallpaper-source',capabilities:['phoneData'],name:'Phone'};
 sync.exchange(device,{status:{wallpaperSource:'permission-required'}});
 assert.equal(sync.snapshot(device.id).status.wallpaperSource,'permission-required');
 sync.exchange(device,{status:{battery:50}});assert.equal(sync.snapshot(device.id).status.wallpaperSource,'permission-required');
 sync.exchange(device,{status:{wallpaperSource:'https://untrusted.example/'}});assert.equal(sync.snapshot(device.id).status.wallpaperSource,'permission-required');
 sync.exchange({...device,capabilities:[]},{status:{wallpaperSource:'system'}});assert.equal(sync.snapshot(device.id).status.wallpaperSource,'off');
});
