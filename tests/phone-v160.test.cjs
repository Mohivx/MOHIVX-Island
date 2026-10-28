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
test('bounded ordered phone input queue preserves FIFO ordering across rapid events, Arabic/Unicode/emoji text, and cancels promptly on stop/disconnect/failure',async()=>{
 const {createPhoneInputQueue,resolvePhoneKeyShortcut,extractDirectPrintableKey}=await import('../src/components/phoneInputQueue.mjs');
 const sent=[],resolvers=[];let allowed=true,lastError=null;
 const queue=createPhoneInputQueue(action=>new Promise((resolve,reject)=>{sent.push(action);resolvers.push({resolve,reject});}),{maxSize:6,canAccept:()=>allowed,onError:err=>{lastError=err;}});
 const p1=queue.enqueue({type:'tap',x:.25,y:.5});
 const p2=queue.enqueue({type:'text',text:'مرحبا بالعالم 👋🇸🇦'});
 const p3=queue.enqueue({type:'key',key:'enter'});
 const p4=queue.enqueue({type:'swipe',x:.5,y:.7,endX:.5,endY:.2,duration:220});
 assert.equal(queue.size(),4);assert.equal(sent.length,1);
 resolvers.shift().resolve({success:true});assert.equal(await p1,true);
 assert.equal(sent.length,2);assert.deepEqual(sent[1],{type:'text',text:'مرحبا بالعالم 👋🇸🇦'});
 resolvers.shift().resolve({success:true});assert.equal(await p2,true);
 resolvers.shift().resolve({success:true});assert.equal(await p3,true);
 resolvers.shift().resolve({success:true});assert.equal(await p4,true);
 assert.deepEqual(sent.map(x=>x.type),['tap','text','key','swipe']);
 const fullPromises=[];for(let i=0;i<6;i++)fullPromises.push(queue.enqueue({type:'text',text:String(i)}));
 assert.equal(await queue.enqueue({type:'text',text:'overflow'}),false);
 assert.match(String(lastError?.message||''),/queue is full/);
 queue.clear('reset');
 assert.deepEqual(await Promise.all(fullPromises),[false,false,false,false,false,false]);
 resolvers.shift().resolve({success:true});
 assert.equal(queue.size(),0);
 lastError=null;
 const f1=queue.enqueue({type:'tap',x:.1,y:.1});
 const f2=queue.enqueue({type:'text',text:'بعد الفشل'});
 resolvers.shift().resolve({success:false,error:'Phone gesture cancelled.'});
 assert.deepEqual(await Promise.all([f1,f2]),[false,false]);
 assert.equal(sent.at(-1).type,'tap');
 assert.match(String(lastError?.message||''),/Phone gesture cancelled/);
 const c1=queue.enqueue({type:'text',text:'أول'});
 const c2=queue.enqueue({type:'text',text:'ثاني'});
 allowed=false;queue.clear('stopped');
 assert.deepEqual(await Promise.all([c1,c2]),[false,false]);
 assert.equal(await queue.enqueue({type:'tap',x:.5,y:.5}),false);
 assert.deepEqual(resolvePhoneKeyShortcut({ctrlKey:true,altKey:false,code:'KeyA',key:'ش'}),{type:'key',key:'selectAll'});
 assert.deepEqual(resolvePhoneKeyShortcut({ctrlKey:true,altKey:false,code:'KeyC',key:'ؤ'}),{type:'key',key:'copy'});
 assert.deepEqual(resolvePhoneKeyShortcut({ctrlKey:true,altKey:false,code:'KeyX',key:'ء'}),{type:'key',key:'cut'});
 assert.deepEqual(resolvePhoneKeyShortcut({ctrlKey:true,altKey:false,code:'KeyV',key:'ر'}),{type:'key',key:'paste'});
 assert.equal(resolvePhoneKeyShortcut({ctrlKey:true,altKey:true,code:'KeyV',key:'ر'}),null);
 assert.equal(resolvePhoneKeyShortcut({key:'Enter',isComposing:true}),null);
 assert.equal(resolvePhoneKeyShortcut({key:'Backspace'},true),null);
 assert.equal(extractDirectPrintableKey({key:'ض',ctrlKey:false,metaKey:false,altKey:false}),'ض');
 assert.equal(extractDirectPrintableKey({key:'Enter',ctrlKey:false,metaKey:false,altKey:false}),null);
});
test('PhoneSync prioritizes ordered control inputs ahead of bulk commands and cancels queued inputs when screen sharing stops',async()=>{
 const sync=new PhoneSync({now:()=>20000}),d={id:'prio',capabilities:['phoneData','phoneControl','phoneScreen']};
 const body={status:{capture:['screen'],controlEnabled:true}};sync.exchange(d,body);
 const listReq=sync.request(d,{type:'files.list',parent:''});
 const in1=sync.request(d,{type:'input',input:{type:'tap',x:.3,y:.4}});
 const in2=sync.request(d,{type:'input',input:{type:'text',text:'اهلا'}});
 const out=sync.exchange(d,body).commands;
 assert.deepEqual(out.map(c=>c.type),['input','input','files.list']);
 assert.equal(out[0].input.type,'tap');assert.equal(out[1].input.text,'اهلا');
 const stopReq=sync.request(d,{type:'capture.stop',kind:'screen'});
 await assert.rejects(in1,/screen sharing stopped/);
 await assert.rejects(in2,/screen sharing stopped/);
 sync.exchange(d,{...body,results:[{id:out[2].id,value:{items:[]}}]});
 assert.deepEqual(await listReq,{items:[]});
 const stopCmd=sync.exchange(d,body).commands.find(c=>c.type==='capture.stop');
 sync.exchange(d,{status:{capture:[],controlEnabled:true},results:[{id:stopCmd.id,value:{stopped:true}}]});
 assert.deepEqual(await stopReq,{stopped:true});
 sync.clear();
});
test('multi-monitor phone placement preserves primary display, avoids monitor/card overlap and shared boundaries, and enforces dwell, velocity ceiling, hysteresis, and release',async()=>{
 const {computeDisplayBoard,isSharedMonitorBoundary,resolveAllPhonePlacements,createEdgeHandoffController}=await import('../src/components/phonePlacement.mjs');
 const displays=[
  {id:'1',name:'Display 1',primary:true,bounds:{x:0,y:0,width:1920,height:1080},workArea:{x:0,y:0,width:1920,height:1040}},
  {id:'2',name:'Display 2',primary:false,bounds:{x:1920,y:0,width:1920,height:1080},workArea:{x:1920,y:0,width:1920,height:1040}}
 ];
 assert.equal(isSharedMonitorBoundary(displays[0],'right',displays),true);
 assert.equal(isSharedMonitorBoundary(displays[1],'left',displays),true);
 assert.equal(isSharedMonitorBoundary(displays[0],'left',displays),false);
 assert.equal(isSharedMonitorBoundary(displays[1],'right',displays),false);

 const board=computeDisplayBoard(displays,720);
 assert.equal(board.primaryDisplayId,'1');
 const devices=[{id:'phone-a',name:'Samsung A16'},{id:'phone-b',name:'Pixel 8'}];
 // Even if both phones are placed on top of the primary monitor at the same coordinate, resolveAllPhonePlacements separates them outside monitors
 const collidingLayout={'phone-a':{x:.85,y:.45},'phone-b':{x:.85,y:.45}};
 const placements=resolveAllPhonePlacements(devices,collidingLayout,board,displays);
 const a=placements['phone-a'],b=placements['phone-b'];
 assert.equal(a.sharedBoundary,false);
 assert.equal(b.sharedBoundary,false);
 const overlap=(r1,r2)=>r1.left<r2.left+r2.width&&r1.left+r1.width>r2.left&&r1.top<r2.top+r2.height&&r1.top+r1.height>r2.top;
 assert.equal(overlap(a,b),false,'placed phone cards must not overlap each other');
 for(const m of board.monitorRects){
  assert.equal(overlap(a,m),false,'phone-a must not overlap monitor rect');
  assert.equal(overlap(b,m),false,'phone-b must not overlap monitor rect');
 }

 // Place phone-a at outer left edge of Display 1 (x:0, y:0.4)
 const cleanLayout={'phone-a':{x:0,y:.4},'phone-b':{x:.2,y:.4}};
 const ctrl=createEdgeHandoffController({dwellMs:220,edgeThresholdPx:6,hysteresisPx:32,maxSpeedPxPerMs:1.6,cooldownMs:600});
 let eligible=true;
 const step=(point,at,enabled=true)=>ctrl.sample({point,at,enabled,displays,devices:[devices[0]],layout:cleanLayout,boardWidth:720,isEligible:()=>eligible});

 // 1. Interior shared boundary (x=1920 between Display 1 and Display 2) never triggers handoff
 assert.equal(step({x:1920,y:500},1000).action,'none');
 assert.equal(step({x:1920,y:500},1300).action,'none');

 // 2. Fast cursor flick into the outer left edge (x=900 -> x=2 in 50ms = 17.96 px/ms > 1.6 px/ms) is suppressed (TwinDesk #66)
 step({x:900,y:500},2000);
 const fast=step({x:2,y:500},2050);
 assert.equal(fast.action,'none');
 assert.equal(fast.reason,'fast-cursor');

 // 3. Settled cursor dwelling at outer left edge (x=2, y=500): <220ms stays in 'dwell', >=220ms triggers 'enter'
 const dwell1=step({x:2,y:500},2100);
 assert.equal(dwell1.action,'dwell');
 assert.equal(dwell1.pendingDeviceId,'phone-a');
 // Leaving edge before dwell completes cancels pending handoff
 assert.equal(step({x:120,y:500},2200).action,'none');
 // Re-enter smoothly and dwell full 220ms
 step({x:20,y:500},3000);
 assert.equal(step({x:2,y:500},3020).action,'dwell');
 assert.equal(step({x:2,y:500},3150).action,'dwell');
 const entered=step({x:2,y:500},3245);
 assert.equal(entered.action,'enter');
 assert.equal(entered.deviceId,'phone-a');
 assert.equal(entered.edge,'left');
 assert.equal(entered.primaryDisplayId,'1');
 assert.equal(entered.dockBounds.x,8);
 assert.equal(ctrl.getActiveDevice(),'phone-a');
 assert.equal(ctrl.isRearmRequired(),true);

 // 4. Escape release engages hysteresis & cooldown; staying near edge does not re-trigger until retreating >=32px and cooldown expires
 const rel=ctrl.release('escape',3300);
 assert.equal(rel.released,true);
 assert.equal(rel.deviceId,'phone-a');
 assert.equal(ctrl.getActiveDevice(),null);
 assert.equal(step({x:2,y:500},3400).reason,'hysteresis');
 assert.equal(step({x:2,y:500},4000).reason,'hysteresis');
 // Retreat beyond hysteresisPx (x=80 >= 32px) after cooldown (t=4050 >= 3900) re-arms controller
 assert.equal(step({x:80,y:500},4050).action,'none');
 assert.equal(ctrl.isRearmRequired(),false);

 // Re-enter and verify a lost capability immediately releases active handoff.
 step({x:20,y:500},4100);
 step({x:2,y:500},4120);
 assert.equal(step({x:2,y:500},4350).action,'enter');
 eligible=false;
 const revoked=step({x:2,y:500},4400);
 assert.equal(revoked.action,'release');
 assert.equal(revoked.deviceId,'phone-a');
 assert.equal(revoked.reason,'ineligible');
 assert.equal(ctrl.getActiveDevice(),null);
});
test('docking preserves user-resized viewer dimensions and repositions window to edge without resetting width or height',async()=>{
 const {computeViewerDockBounds}=await import('../src/components/phonePlacement.mjs');
 const {createPhoneViewer}=require('../electron/services/phoneViewer.cjs');
 const workArea={x:0,y:0,width:1920,height:1040};
 const customSize={width:540,height:910};

 const dockedLeft=computeViewerDockBounds(workArea,'left',0.5,customSize);
 assert.equal(dockedLeft.width,540);
 assert.equal(dockedLeft.height,910);
 assert.equal(dockedLeft.x,8);
 assert.equal(dockedLeft.y,Math.round(1040*0.5 - 910/2));

 const dockedRight=computeViewerDockBounds(workArea,'right',0.3,customSize);
 assert.equal(dockedRight.width,540);
 assert.equal(dockedRight.height,910);
 assert.equal(dockedRight.x,1920 - 540 - 8);

 let setBoundsArgs=null;
 class MockBrowserWindow {
  constructor(opts){this.opts=opts;this._bounds={...opts};this._normalBounds={...opts};this.maximized=false;this.webContents={setWindowOpenHandler:()=>{},on:()=>{},once:(ev,cb)=>cb(),send:()=>{},isLoading:()=>false};}
  isDestroyed(){return false;}
  isMinimized(){return false;}
  isMaximized(){return this.maximized;}
  isAlwaysOnTop(){return false;}
  show(){}
  focus(){}
  restore(){}
  unmaximize(){this.maximized=false;this.unmaximized=true;}
  setTitle(){}
  loadFile(){}
  on(){}
  once(ev,cb){if(ev==='ready-to-show')cb();}
  getBounds(){return {...this._bounds};}
  getNormalBounds(){return {...this._normalBounds};}
  setBounds(b){setBoundsArgs={...b};this._bounds={...b};if(!this.maximized)this._normalBounds={...b};}
 }
 const mockScreen={
  getCursorScreenPoint:()=>({x:500,y:500}),
  getDisplayNearestPoint:()=>({workArea})
 };
 const viewer=createPhoneViewer({BrowserWindow:MockBrowserWindow,screen:mockScreen,root:process.cwd()});
 const win=viewer.open('phone-resize-test','screen');
 win._bounds={x:300,y:300,width:540,height:910};
 win._normalBounds={...win._bounds};
 viewer.open('phone-resize-test','screen',{dock:{edge:'right',workArea,entryRatio:0.5}});
 assert.equal(setBoundsArgs.x,1920 - 540 - 8);
 assert.equal(win.getBounds().width,540);
 assert.equal(win.getBounds().height,910);
 win.maximized=true;
 win._bounds={x:0,y:0,width:1920,height:1040};
 viewer.open('phone-resize-test','screen',{dock:{edge:'left',workArea,entryRatio:0.5}});
 assert.equal(win.unmaximized,true);
 assert.equal(setBoundsArgs.x,8);
 assert.equal(setBoundsArgs.width,540);
 assert.equal(setBoundsArgs.height,910);
});
