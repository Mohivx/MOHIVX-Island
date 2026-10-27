const test=require('node:test'),assert=require('node:assert/strict');
const {PhoneSync,validatePhoneFileCommand}=require('../electron/services/phoneSync.cjs');
const {normalizeMeter}=require('../electron/services/audioMeter.cjs');
test('phone data is opt-in, bounded, and commands preserve correlation across retries',async()=>{
 let now=100000;const service=new PhoneSync({now:()=>now});const phone={id:'fixture',capabilities:[]};
 service.exchange(phone,{notifications:[{id:'sms',title:'Hello',text:'Message',sms:true}],status:{notifications:true}});
 assert.deepEqual(service.snapshot(phone.id).notifications,[]);await assert.rejects(service.request(phone,{type:'files.list'}),/permission/);
 phone.capabilities=['phoneData','phoneCamera'];service.exchange(phone,{notifications:Array.from({length:110},(_,i)=>({id:String(i),title:'X'.repeat(800),text:'Y'.repeat(4000),sms:i===0})),status:{folder:true,capture:['camera','invalid']}});
 assert.equal(service.snapshot(phone.id).notifications.length,80);assert.equal(service.snapshot(phone.id).notifications[0].title.length,300);assert.deepEqual(service.snapshot(phone.id).status.capture,['camera']);
 const pending=service.request(phone,{type:'files.list',parent:''});const first=service.exchange(phone,{}),retry=service.exchange(phone,{});assert.equal(first.commands[0].id,retry.commands[0].id);
 const id=first.commands[0].id;const r=service.exchange(phone,{results:[{id,value:{items:[{name:'Photo.jpg'}]}}]});assert.deepEqual(r.ack,[id]);assert.equal((await pending).items[0].name,'Photo.jpg');assert.equal(service.exchange(phone,{}).commands.length,0);
 const revoked=service.request(phone,{type:'capture.start',kind:'camera'});phone.capabilities=[];service.exchange(phone,{});await assert.rejects(revoked,/revoked/);assert.equal(service.snapshot(phone.id).notifications.length,0);
 now+=16000;phone.capabilities=['phoneData'];await assert.rejects(service.request(phone,{type:'files.list'}),/background sync/);service.clear();
});
test('disconnect rejects outstanding phone operations and unknown commands never queue',async()=>{const s=new PhoneSync(),d={id:'p',capabilities:['phoneMic']};s.exchange(d,{});assert.throws(()=>s.request(d,{type:'shell.exec'}),/Unknown/);const p=s.request(d,{type:'capture.stop',kind:'mic'});s.revoke('p');await assert.rejects(p,/disconnected/);assert.equal(s.snapshot('p').at,0);});
test('PC-to-phone file writes require a separate opt-in, bounded safe chunks, and acknowledged completion',async()=>{
 const s=new PhoneSync(),d={id:'file-write-phone',capabilities:['phoneData']};s.exchange(d,{status:{folderWritable:true}});
 await assert.rejects(s.request(d,{type:'files.write'}),/permission/);
 assert.throws(()=>validatePhoneFileCommand({type:'files.write',transferId:'12345678-1234-1234-1234-123456789012',name:'../outside.txt',parent:'',size:1,offset:0,data:'eA==',eof:true}),/valid file name/);
 assert.throws(()=>validatePhoneFileCommand({type:'files.write',transferId:'12345678-1234-1234-1234-123456789012',name:'ok.txt',parent:'',size:1,offset:0,data:'?',eof:true}),/Invalid phone file chunk/);
 d.capabilities=['phoneFilesWrite'];const transferId='12345678-1234-1234-1234-123456789012';
 const pending=s.request(d,{type:'files.write',transferId,name:'ok.txt',parent:'',size:5,offset:0,data:Buffer.from('hello').toString('base64'),eof:true});
 const packet=s.exchange(d,{});assert.equal(packet.commands[0].type,'files.write');assert.equal(packet.commands[0].name,'ok.txt');
 s.exchange(d,{results:[{id:packet.commands[0].id,value:{offset:0,nextOffset:5,complete:true,name:'ok.txt'}}]});
 assert.deepEqual(await pending,{offset:0,nextOffset:5,complete:true,name:'ok.txt'});
 const revoked=s.request(d,{type:'files.abort',transferId});d.capabilities=[];s.exchange(d,{});await assert.rejects(revoked,/revoked/);
});
test('phone folder creation and rename require write permission, validate names and opaque IDs, and sanitize acknowledgements',async()=>{
 const s=new PhoneSync(),d={id:'phone-folders',capabilities:['phoneData']};s.exchange(d,{});
 await assert.rejects(s.request(d,{type:'files.mkdir',parent:'',name:'Documents'}),/permission/);
 d.capabilities=['phoneFilesWrite'];
 for(const name of ['.','..','../outside','folder/escape','trailing.','bad:name'])await assert.rejects(s.request(d,{type:'files.mkdir',parent:'',name}),/valid name/);
 await assert.rejects(s.request(d,{type:'files.mkdir',parent:'bad',name:'Docs'}),/valid phone folder/);
 await assert.rejects(s.request(d,{type:'files.rename',itemId:'../outside',name:'Docs'}),/file or folder to rename/);
 const mkdir=s.request(d,{type:'files.mkdir',parent:'',name:'Travel'});let command=s.exchange(d,{}).commands[0];assert.equal(command.type,'files.mkdir');assert.equal(command.name,'Travel');
 s.exchange(d,{results:[{id:command.id,value:{created:true,name:'Travel',directory:true,unexpected:'discard'}}]});assert.deepEqual(await mkdir,{created:true,name:'Travel',directory:true});
 const newId='a'.repeat(64),rename=s.request(d,{type:'files.rename',itemId:newId,name:'Trips'});command=s.exchange(d,{}).commands[0];assert.equal(command.type,'files.rename');assert.equal(command.itemId,newId);
 s.exchange(d,{results:[{id:command.id,value:{renamed:true,id:'b'.repeat(64),name:'Trips',directory:true,unexpected:'discard'}}]});assert.deepEqual(await rename,{renamed:true,id:'b'.repeat(64),name:'Trips',directory:true});
 const revoked=s.request(d,{type:'files.mkdir',parent:'',name:'Later'});d.capabilities=[];s.exchange(d,{});await assert.rejects(revoked,/revoked/);
});
test('phone app listing and launch use separate per-device permissions',async()=>{const s=new PhoneSync(),d={id:'apps',capabilities:['phoneData']};s.exchange(d,{});const listing=s.request(d,{type:'apps.list'});let commands=s.exchange(d,{}).commands;assert.equal(commands[0].type,'apps.list');s.exchange(d,{results:[{id:commands[0].id,value:{items:[{packageName:'com.example.app',name:'Example'}]}}]});assert.deepEqual(await listing,{items:[{packageName:'com.example.app',name:'Example'}]});await assert.rejects(s.request(d,{type:'apps.launch',packageName:'com.example.app'}),/permission/);d.capabilities=['phoneControl'];const invalid=s.request(d,{type:'apps.launch',packageName:'../private'});await assert.rejects(invalid,/installed phone app/);const opening=s.request(d,{type:'apps.launch',packageName:'com.example.app'});commands=s.exchange(d,{}).commands;assert.equal(commands[0].type,'apps.launch');assert.equal(commands[0].packageName,'com.example.app');s.exchange(d,{results:[{id:commands[0].id,value:{needsTap:true}}]});assert.deepEqual(await opening,{needsTap:true});});
test('phone media sessions are independently permission-gated, sanitized, and controllable',async()=>{
 const {mediaStatus}=require('../electron/services/phoneSync.cjs'),s=new PhoneSync(),d={id:'media-phone',capabilities:['phoneData']};
 const unsafe={available:true,packageName:'com.example.player',app:'Player',title:'Track\u0000',artist:'Artist',album:'Album',duration:100000,position:200000,state:'playing',canPlay:true,canPause:true,canPrevious:true,canNext:true,canSeek:true};
 s.exchange(d,{status:{media:unsafe}});assert.deepEqual(s.snapshot(d.id).status.media,{available:false});
 await assert.rejects(s.request(d,{type:'media.control',action:'pause',packageName:'com.example.player'}),/permission/);
 d.capabilities=['phoneMedia'];s.exchange(d,{status:{media:unsafe}});
 assert.deepEqual(s.snapshot(d.id).status.media,{available:true,packageName:'com.example.player',app:'Player',title:'Track',artist:'Artist',album:'Album',duration:100000,position:100000,state:'playing',canPlay:true,canPause:true,canPrevious:true,canNext:true,canSeek:true});
 await assert.rejects(s.request(d,{type:'media.control',action:'shell',packageName:'com.example.player'}),/valid phone media control/);
 await assert.rejects(s.request(d,{type:'media.control',action:'seek',packageName:'com.example.player',position:86400001}),/valid playback position/);
 const pending=s.request(d,{type:'media.control',action:'pause',packageName:'com.example.player'}),packet=s.exchange(d,{}),command=packet.commands[0];
 assert.equal(command.type,'media.control');assert.equal(command.action,'pause');assert.equal(command.packageName,'com.example.player');
 s.exchange(d,{results:[{id:command.id,value:{accepted:true,packageName:'com.example.player',private:'discard'}}]});assert.deepEqual(await pending,{accepted:true});
 const revoked=s.request(d,{type:'media.control',action:'next',packageName:'com.example.player'});d.capabilities=[];s.exchange(d,{});await assert.rejects(revoked,/revoked/);
 assert.equal(mediaStatus(unsafe,false).available,false);
});
test('notification replies require a current reply-capable notification and keep bounded text correlated',async()=>{const s=new PhoneSync(),d={id:'reply-phone',capabilities:['phoneData']};s.exchange(d,{notifications:[{id:'chat-1',app:'Chat',title:'Hello',text:'Hi',replyAvailable:true},{id:'plain-1',title:'Alert',replyAvailable:false}]});assert.equal(s.snapshot(d.id).notifications[0].replyAvailable,true);await assert.rejects(s.request(d,{type:'notifications.reply',notificationId:'missing',text:'Hi'}),/no longer supports replies/);await assert.rejects(s.request(d,{type:'notifications.reply',notificationId:'plain-1',text:'Hi'}),/no longer supports replies/);await assert.rejects(s.request(d,{type:'notifications.reply',notificationId:'chat-1',text:'  '}),/short reply/);await assert.rejects(s.request(d,{type:'notifications.reply',notificationId:'chat-1',text:'x'.repeat(1001)}),/short reply/);const pending=s.request(d,{type:'notifications.reply',notificationId:'chat-1',text:'  Thanks  '});const packet=s.exchange(d,{});assert.equal(packet.commands[0].type,'notifications.reply');assert.equal(packet.commands[0].notificationId,'chat-1');assert.equal(packet.commands[0].text,'Thanks');s.exchange(d,{results:[{id:packet.commands[0].id,value:{submitted:true}}]});assert.deepEqual(await pending,{submitted:true});});
test('SMS history and sending require separate phoneMessages permission, validate inputs, sanitize pages, and reject on revocation',async()=>{
 const s=new PhoneSync(),d={id:'sms-phone',capabilities:['phoneData']};
 s.exchange(d,{status:{messagesRead:true,messagesSend:true}});
 assert.equal(s.snapshot(d.id).status.messagesRead,true);
 assert.equal(s.snapshot(d.id).status.messagesSend,true);
 await assert.rejects(s.request(d,{type:'messages.threads'}),/permission/);
 await assert.rejects(s.request(d,{type:'messages.list',threadId:'12'}),/permission/);
 await assert.rejects(s.request(d,{type:'messages.send',address:'+15550100',text:'Hi'}),/permission/);
 d.capabilities=['phoneData','phoneMessages'];
 await assert.rejects(s.request(d,{type:'messages.threads',offset:-1}),/Invalid message page/);
 await assert.rejects(s.request(d,{type:'messages.threads',offset:10001}),/Invalid message page/);
 await assert.rejects(s.request(d,{type:'messages.list',threadId:'0'}),/valid SMS conversation/);
 await assert.rejects(s.request(d,{type:'messages.list',threadId:'../../etc'}),/valid SMS conversation/);
 await assert.rejects(s.request(d,{type:'messages.send',address:'abc',text:'Hello'}),/valid phone number/);
 await assert.rejects(s.request(d,{type:'messages.send',address:'+15550100',text:'   '}),/1–1600/);
 await assert.rejects(s.request(d,{type:'messages.send',address:'+15550100',text:'a\u0000b'}),/1–1600/);
 const threadsPromise=s.request(d,{type:'messages.threads',offset:0});
 let commands=s.exchange(d,{}).commands;
 assert.equal(commands[0].type,'messages.threads');
 s.exchange(d,{results:[{id:commands[0].id,value:{next:60,items:[{threadId:'101',address:'+15550100\u0000',preview:'Hello'.repeat(200),date:1700000000000,unread:true},{threadId:'0',address:'bad',preview:'ignored',date:100},{threadId:'bad',date:100}]}}]});
 const threadsPage=await threadsPromise;
 assert.equal(threadsPage.next,60);
 assert.equal(threadsPage.items.length,1);
 assert.equal(threadsPage.items[0].threadId,'101');
 assert.equal(threadsPage.items[0].address,'+15550100');
 assert.equal(threadsPage.items[0].preview.length,500);
 assert.equal(threadsPage.items[0].unread,true);
 const listPromise=s.request(d,{type:'messages.list',threadId:'101',offset:0});
 commands=s.exchange(d,{}).commands;
 s.exchange(d,{results:[{id:commands[0].id,value:{next:0,items:[{id:'501',address:'+15550100',text:'مرحبا',date:1700000001000,direction:'incoming'},{id:'502',address:'+15550100',text:'أهلا',date:1700000002000,direction:'outgoing'}]}}]})
 const listPage=await listPromise;
 assert.deepEqual(listPage,{next:0,items:[{id:'501',address:'+15550100',text:'مرحبا',date:1700000001000,direction:'incoming'},{id:'502',address:'+15550100',text:'أهلا',date:1700000002000,direction:'outgoing'}]});
 const sendInput={type:'messages.send',address:'\u200e+٩٦٦ (٥٥) ٠١٠-٠٠٠٠\u200f',text:'  مرحبا من الكمبيوتر  '};
 const sendPromise=s.request(d,sendInput);
 assert.equal(sendInput.address,'\u200e+٩٦٦ (٥٥) ٠١٠-٠٠٠٠\u200f');
 commands=s.exchange(d,{}).commands;
 assert.equal(commands[0].address,'+966550100000');
 assert.equal(commands[0].text,'مرحبا من الكمبيوتر');
 s.exchange(d,{results:[{id:commands[0].id,value:{submitted:true}}]});
 assert.deepEqual(await sendPromise,{submitted:true});
 const revokedSend=s.request(d,{type:'messages.send',address:'+15550100',text:'Will revoke'});
 d.capabilities=['phoneData'];
 s.exchange(d,{});
 await assert.rejects(revokedSend,/revoked/);
});
test('contacts resolution and call history/dialer use independent phoneContacts and phoneCalls permissions, validate inputs, sanitize results, and reject on revocation',async()=>{
 const s=new PhoneSync(),d={id:'calls-phone',capabilities:['phoneData','phoneMessages']};
 s.exchange(d,{status:{contactsRead:true,callsRead:true}});
 assert.equal(s.snapshot(d.id).status.contactsRead,true);
 assert.equal(s.snapshot(d.id).status.callsRead,true);
 await assert.rejects(s.request(d,{type:'contacts.resolve',numbers:['+15550100']}),/permission/);
 await assert.rejects(s.request(d,{type:'calls.list',offset:0}),/permission/);
 await assert.rejects(s.request(d,{type:'calls.dial',number:'+15550100'}),/permission/);

 // Enabling phoneCalls alone permits calls.list and calls.dial, but NOT contacts.resolve
 d.capabilities=['phoneCalls'];
 await assert.rejects(s.request(d,{type:'contacts.resolve',numbers:['+15550100']}),/permission/);
 await assert.rejects(s.request(d,{type:'calls.list',offset:-1}),/Invalid call history page/);
 await assert.rejects(s.request(d,{type:'calls.list',offset:10001}),/Invalid call history page/);
 await assert.rejects(s.request(d,{type:'calls.dial',number:'not-a-number'}),/valid phone number to dial/);

 const callsPromise=s.request(d,{type:'calls.list',offset:0});
 let commands=s.exchange(d,{}).commands;
 assert.equal(commands[0].type,'calls.list');
 s.exchange(d,{results:[{id:commands[0].id,value:{next:60,items:[
  {id:'901',number:'+15550100\u0000',type:'incoming',date:1700000010000,duration:125,name:'MustBeIgnored'},
  {id:'902',number:'-1',type:'missed',date:1700000020000,duration:0},
  {id:'0',number:'+15550199',type:'outgoing',date:100,duration:10},
  {id:'bad',number:'+15550199',date:100,duration:10}
 ]}}]});
 const callsPage=await callsPromise;
 assert.equal(callsPage.next,60);
 assert.deepEqual(callsPage.items,[
  {id:'901',number:'+15550100',type:'incoming',date:1700000010000,duration:125},
  {id:'902',number:'',type:'missed',date:1700000020000,duration:0}
 ]);
 assert.equal('name' in callsPage.items[0],false,'calls.list must never leak cached contact names');

 const dialPromise=s.request(d,{type:'calls.dial',number:'\u200e+٩٦٦ (٥٥) ٠١٠-٠٠٠٠\u200f'});
 commands=s.exchange(d,{}).commands;
 assert.equal(commands[0].type,'calls.dial');
 assert.equal(commands[0].number,'+966550100000');
 s.exchange(d,{results:[{id:commands[0].id,value:{opened:true,needsTap:false}}]});
 assert.deepEqual(await dialPromise,{opened:true,needsTap:false});

 // Enabling phoneContacts alone permits contacts.resolve, but NOT calls.list or calls.dial
 d.capabilities=['phoneContacts'];
 await assert.rejects(s.request(d,{type:'calls.list',offset:0}),/permission/);
 await assert.rejects(s.request(d,{type:'calls.dial',number:'+15550100'}),/permission/);
 await assert.rejects(s.request(d,{type:'contacts.resolve',numbers:[]}),/1–60 valid phone numbers/);
 await assert.rejects(s.request(d,{type:'contacts.resolve',numbers:['bad']}),/1–60 valid phone numbers/);

 const resolvePromise=s.request(d,{type:'contacts.resolve',numbers:['+1 (555) 0100','+15550100','\u200e+٩٦٦ ٥٥ ٠١٠ ٠٠٠٠\u200f']});
 commands=s.exchange(d,{}).commands;
 assert.deepEqual(commands[0].numbers,['+15550100','+966550100000']);
 s.exchange(d,{results:[{id:commands[0].id,value:{contacts:{'+15550100':'Alice Smith\u0000','+966550100000':'أحمد','bad-key':'Ignored','+15550999':'\u0007Control'}}}]});
 assert.deepEqual(await resolvePromise,{contacts:{'+15550100':'Alice Smith','+966550100000':'أحمد'}});

 const revokedResolve=s.request(d,{type:'contacts.resolve',numbers:['+15550100']});
 d.capabilities=[];
 s.exchange(d,{});
 await assert.rejects(revokedResolve,/revoked/);
});
test('output meter rejects malformed levels and clamps native values without retaining audio',()=>{assert.deepEqual(normalizeMeter({available:true,peak:20,left:NaN,right:-3}),{available:true,peak:1,left:0,right:0});assert.deepEqual(normalizeMeter(null),{available:false,peak:0,left:0,right:0});});
test('encrypted phone sync protects notifications, gates agent requests, and stops accepting a revoked device',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),https=require('node:https');
 const Gateway=require('../electron/services/secureGateway.cjs'),{seal,open}=require('../electron/services/secureEnvelope.cjs'),{pinClient}=require('./helpers/pinClient.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-sync-'));const gateway=new Gateway(0,dir,()=>{},{host:'127.0.0.1',discovery:false});t.after(()=>{gateway.stop();fs.rmSync(dir,{recursive:true,force:true});});await gateway.start();
 const cert=JSON.parse(fs.readFileSync(path.join(dir,'companion-tls.json'))).cert;
 const post=(route,data)=>new Promise((resolve,reject)=>{const request=https.request({hostname:'127.0.0.1',port:gateway.port,path:route,method:'POST',ca:cert,checkServerIdentity:()=>undefined},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,...JSON.parse(text)}));});request.on('error',reject);request.end(JSON.stringify(data));});
 gateway.generateNewPin();const phone=await pinClient(gateway.pairing.pin);t.after(()=>phone.close());const start=await post('/api/pair/start',{A:phone.A,secure:true}),proof=await phone.proof(start,gateway.fingerprint),finish=await post('/api/pair/finish',{session:start.session,proof});await phone.verify(finish.proof);const pair=open(phone.key,'pair:'+start.session,finish.sealed);
 const service=new PhoneSync();gateway.setProviders({phoneSync:service,agentCenter:{getAllStatuses:async()=>({pendingApprovals:[{source:'hook',id:'hook:1',agent:'codex',fingerprint:'a'.repeat(64),title:'AskUserQuestion',questions:[{question:'Choose a layout'}]}]})}});
 let counter=0;const sync=async body=>{counter++;const scope=pair.id+':'+counter;const r=await post('/api/secure',{device:pair.id,counter,...seal(phone.key,'request:'+scope,{route:'/api/phone-sync',method:'POST',token:pair.token,body})});return open(phone.key,'response:'+scope,r);};
 assert.equal((await post('/api/phone-sync',{})).status,401);assert.deepEqual((await sync({notifications:[{title:'Private SMS'}]})).requests,[]);assert.equal(service.snapshot(pair.id).notifications.length,0);
 gateway.setCapabilities(pair.id,['phoneData','agents','agentApprovals']);const r=await sync({notifications:[{id:'n',title:'SMS notification',sms:true}]});assert.equal(r.requests[0].description,'Choose a layout');assert.equal(service.snapshot(pair.id).notifications[0].sms,true);
 const device=gateway.devices[0],p=service.request(device,{type:'files.list'}),commands=(await sync({})).commands;assert.equal(commands.length,1);await sync({results:[{id:commands[0].id,value:{items:[]}}]});assert.deepEqual(await p,{items:[]});
 gateway.revoke(pair.id);assert.equal(service.snapshot(pair.id).at,0);assert.equal((await post('/api/phone-sync',{})).status,401);
});
