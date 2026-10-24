const test=require('node:test'),assert=require('node:assert/strict');
const {createNotificationDelivery}=require('../electron/services/notificationDelivery.cjs');
test('MOHIVX reminders reach the island while native banners remain off unless explicitly enabled',()=>{
 let settings={islandNotificationsEnabled:true,windowsNotificationsEnabled:true,mohivxToastsEnabled:false};const island=[],windows=[];
 const deliver=createNotificationDelivery({getSettings:()=>settings,sendToIsland:n=>island.push(n),showWindowsToast:n=>windows.push(n)});
 deliver({title:'Task done',body:'Details'});assert.equal(island.length,1);assert.equal(windows.length,0);
 settings.mohivxToastsEnabled=true;deliver({source:'mohivx',title:'Reminder',body:''});assert.equal(windows.length,1);
 deliver({source:'windows',title:'Other app',body:'Incoming'});assert.equal(island.length,3);assert.equal(windows.length,1,'mirroring another app must never produce a second Windows toast');
 settings.windowsNotificationsEnabled=false;deliver({source:'windows',title:'Hidden',body:''});assert.equal(island.length,3);
 settings.islandNotificationsEnabled=false;deliver({title:'Windows only',body:''});assert.equal(island.length,3);assert.equal(windows.length,2);
});
test('notification queue keeps active questions in front, resumes after them, deduplicates and expires stale cards',async()=>{
 const {IslandNoticeQueue}=await import('../src/hooks/islandNotices.mjs');let now=1000,callback;const events=[];const q=new IslandNoticeQueue(n=>events.push(n),{now:()=>now,setTimer:fn=>{callback=fn;return 1;},clearTimer:()=>{callback=null;}});
 const notice={id:'1',source:'windows',app:'Messages',title:'A',body:'B',time:1000};q.enqueue(notice);assert.equal(q.current.title,'A');q.setBlocked(true);assert.equal(q.current,null);q.enqueue(notice);q.enqueue({...notice,id:'2',title:'Next'});q.setBlocked(false);assert.equal(q.current.title,'A');callback();assert.equal(q.current.title,'Next');q.pause(true);assert.equal(callback,null);q.clear();q.enqueue({...notice,id:'3'});assert.equal(typeof callback,'function','clearing while paused must reset the timer state');q.setBlocked(true);now+=130000;q.setBlocked(false);assert.equal(q.current,null,'old cards must not replay after a long approval');q.clear();
});
test('notification reader discards a late in-flight result after the user switches it off',async()=>{
 const Reader=require('../electron/services/windowsNotifications.cjs');let callback,enabled=true;const received=[];const service=new Reader({now:()=>1000,getSettings:()=>({windowsNotificationsEnabled:enabled}),onNotification:n=>received.push(n),execFile:(_f,_a,_o,cb)=>{callback=cb;return {kill(){}};}});
 const polling=service.poll();enabled=false;service.stop();callback(null,JSON.stringify({success:true,allowed:true,accessStatus:'Allowed',notifications:[{id:9,app:'App',title:'Secret',body:'New',createdAt:new Date(2000).toISOString()}]}));await polling;assert.equal(received.length,0);assert.equal(service.initialized,false);
});
