const crypto=require('node:crypto');
const {jpegSize}=require('./phoneBridge.cjs');
const COMMAND_CAP={ 'apps.list':'phoneData','apps.launch':'phoneControl','files.list':'phoneData','photos.list':'phoneData','files.read':'phoneData','notifications.reply':'phoneData','messages.threads':'phoneMessages','messages.list':'phoneMessages','messages.send':'phoneMessages','capture.start':'','capture.stop':'','input':'phoneControl' };
function normalizePhoneAddress(raw){
  if(typeof raw!=='string')return '';
  return raw.replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-0x0660)).replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-0x06f0)).replace(/[\s().\-\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'');
}
function cleanMessageText(raw,max){
  return String(raw||'').replace(/\u0000/g,'').slice(0,max);
}
function validateMessageCommand(command){
  if(!command||typeof command!=='object')throw Error('Unknown phone command.');
  if(command.type==='messages.threads'){
    const offset=command.offset===undefined?0:command.offset;
    if(!Number.isSafeInteger(offset)||offset<0||offset>10000)throw Error('Invalid message page.');
    return {type:'messages.threads',offset};
  }
  if(command.type==='messages.list'){
    const threadId=typeof command.threadId==='string'?command.threadId.trim():'';
    const offset=command.offset===undefined?0:command.offset;
    if(!/^[1-9][0-9]{0,17}$/.test(threadId)||!Number.isSafeInteger(offset)||offset<0||offset>10000)throw Error('Choose a valid SMS conversation.');
    return {type:'messages.list',threadId,offset};
  }
  if(command.type!=='messages.send')throw Error('Unknown phone command.');
  const address=normalizePhoneAddress(command.address);
  const text=typeof command.text==='string'?command.text.trim():'';
  if(!/^\+?[0-9]{3,20}$/.test(address)||!text||text.length>1600||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))throw Error('Enter a valid phone number and a message of 1–1600 characters.');
  return {type:'messages.send',address,text};
}
function messageResult(type,value){
  if(!value||typeof value!=='object')throw Error('Invalid phone messages response.');
  if(type==='messages.send'){
    if(value.submitted!==true)throw Error('Invalid phone messages response.');
    return {submitted:true};
  }
  if(!Array.isArray(value.items))throw Error('Invalid phone messages response.');
  const page={next:Number.isSafeInteger(value.next)&&value.next>0&&value.next<=10000?value.next:0};
  page.items=value.items.slice(0,60).map(item=>{
    if(!item||typeof item!=='object')return null;
    const id=String(type==='messages.threads'?item.threadId:item.id||'').trim(),date=Number(item.date);
    if(!/^[1-9][0-9]{0,17}$/.test(id)||!Number.isSafeInteger(date)||date<0)return null;
    if(type==='messages.threads')return {threadId:id,address:cleanMessageText(item.address,80),preview:cleanMessageText(item.preview,500),date,unread:item.unread===true};
    return {id,address:cleanMessageText(item.address,80),text:cleanMessageText(item.text,2000),date,direction:item.direction==='outgoing'?'outgoing':'incoming'};
  }).filter(Boolean);
  return page;
}
function phoneInput(value){
 if(!value||typeof value!=='object')throw Error('Invalid phone input.');
 const point=(x,y)=>Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&x<=1&&y>=0&&y<=1;
 if(value.type==='tap'&&point(value.x,value.y))return {type:'tap',x:value.x,y:value.y};
 if(value.type==='swipe'&&point(value.x,value.y)&&point(value.endX,value.endY))return {type:'swipe',x:value.x,y:value.y,endX:value.endX,endY:value.endY,duration:Math.round(Math.max(60,Math.min(1000,Number(value.duration)||250)))};
 if(value.type==='key'&&['back','home','recents','escape','enter','backspace','delete','selectAll','copy','cut','paste'].includes(value.key))return {type:'key',key:value.key};
 if(value.type==='text'&&typeof value.text==='string'&&value.text.length>0&&value.text.length<=2000)return {type:'text',text:value.text};
 throw Error('Unsupported phone input.');
}
function wallpaper(value){if(typeof value!=='string'||value.length>180000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return '';const size=jpegSize(Buffer.from(value.slice(23),'base64'));return size&&size.width<=512&&size.height<=512?value:'';}
class PhoneSync {
  constructor({now=Date.now,timeout=25000,onNotification=()=>{}}={}){this.now=now;this.timeout=timeout;this.onNotification=onNotification;this.devices=new Map();}
  state(id){if(!this.devices.has(id))this.devices.set(id,{at:0,notifications:[],status:{},seen:new Map(),pending:new Map()});return this.devices.get(id);}
  snapshot(id){const s=this.devices.get(id);return s?{at:s.at,notifications:s.notifications,status:s.status}:{at:0,notifications:[],status:{}};}
  capability(command){if(!command||typeof command!=='object'||!Object.hasOwn(COMMAND_CAP,command.type))throw Error('Unknown phone command.');if(command.type.startsWith('capture.')){const cap={mic:'phoneMic',camera:'phoneCamera',screen:'phoneScreen'}[command.kind];if(!cap)throw Error('Unknown capture type.');return cap;}return COMMAND_CAP[command.type];}
  request(device,command){const cap=this.capability(command);if(!device?.capabilities.includes(cap))return Promise.reject(Error('Enable this phone permission on the PC.'));const s=this.state(device.id);if(this.now()-s.at>15000)return Promise.reject(Error('Open the phone app and enable background sync first.'));if(command.type.startsWith('messages.')){try{command=validateMessageCommand(command);}catch(error){return Promise.reject(error);}}if(command.type==='input'){if(!device.capabilities.includes('phoneScreen')||!s.status.controlEnabled||!s.status.capture?.includes('screen'))return Promise.reject(Error('Enable phone control on Android and keep screen sharing active.'));command={type:'input',input:phoneInput(command.input)};}if(command.type==='apps.launch'){const packageName=typeof command.packageName==='string'?command.packageName:'';if(packageName.length>255||!/^([A-Za-z][A-Za-z0-9_]*\.)+[A-Za-z][A-Za-z0-9_]*$/.test(packageName))return Promise.reject(Error('Choose an installed phone app.'));command={type:'apps.launch',packageName};}if(command.type==='notifications.reply'){const notificationId=typeof command.notificationId==='string'?command.notificationId:'';const text=typeof command.text==='string'?command.text.trim():'';if(!notificationId||notificationId.length>200||!text||text.length>1000)return Promise.reject(Error('Enter a short reply to a current phone notification.'));const notification=s.notifications.find(n=>n.id===notificationId);if(!notification||!notification.replyAvailable)return Promise.reject(Error('This phone notification no longer supports replies.'));command={type:'notifications.reply',notificationId,text};}if(s.pending.size>=8)return Promise.reject(Error('Wait for the current phone request.'));
    const id=crypto.randomUUID(),timeout=command.type==='input'?Math.min(this.timeout,2500):this.timeout;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{s.pending.delete(id);reject(Error('Phone request timed out.'));},timeout);timer.unref?.();s.pending.set(id,{command:{...command,id,expires:this.now()+timeout},cap,timer,resolve,reject});});}
  exchange(device,data){const s=this.state(device.id),ack=[],sentAt=Number.isSafeInteger(data.sentAt)&&data.sentAt>0?data.sentAt:this.now();s.at=this.now();
    const status=data.status||{},previousWallpaperSource=s.status.wallpaperSource;
    const display=status.display&&Number.isInteger(status.display.width)&&Number.isInteger(status.display.height)&&status.display.width>0&&status.display.height>0&&status.display.width<=16384&&status.display.height<=16384?{width:status.display.width,height:status.display.height,densityDpi:Number.isInteger(status.display.densityDpi)?Math.max(72,Math.min(1000,status.display.densityDpi)):null,rotation:Number.isInteger(status.display.rotation)&&status.display.rotation>=0&&status.display.rotation<=3?status.display.rotation:0}:null;
    s.status={notifications:status.notifications===true,photos:status.photos===true,folder:status.folder===true,messagesRead:status.messagesRead===true,messagesSend:status.messagesSend===true,capture:Array.isArray(status.capture)?status.capture.filter(x=>['mic','camera','screen'].includes(x)):[],controlEnabled:device.capabilities.includes('phoneControl')&&status.controlEnabled===true,battery:Number.isInteger(status.battery)&&status.battery>=0&&status.battery<=100?status.battery:null,charging:status.charging===true,name:String(status.name||device.name||'').slice(0,100),model:String(status.model||'').slice(0,100),connection:['wifi','cellular','usb','bluetooth','ethernet','offline'].includes(status.connection)?status.connection:'other',display,wallpaper:device.capabilities.includes('phoneData')?(Object.hasOwn(status,'wallpaper')?wallpaper(status.wallpaper):s.status.wallpaper||''):'',version:String(status.version||'').slice(0,30)};
    s.status.wallpaperSource=device.capabilities.includes('phoneData')?(['system','custom','permission-required','live','unavailable','off'].includes(status.wallpaperSource)?status.wallpaperSource:Object.hasOwn(status,'wallpaper')?(s.status.wallpaper?'custom':'unavailable'):previousWallpaperSource||'unavailable'):'off';
    if(device.capabilities.includes('phoneData')){
      if(Array.isArray(data.notifications))s.notifications=data.notifications.filter(n=>n&&typeof n==='object').slice(0,80).map(n=>({id:String(n.id||'').slice(0,200),app:String(n.app||'').slice(0,100),title:String(n.title||'').slice(0,300),text:String(n.text||'').slice(0,2000),at:Number(n.at)||0,sms:n.sms===true,replyAvailable:n.replyAvailable===true}));
      for(const n of [...s.notifications].sort((a,b)=>a.at-b.at)){
        if(!n.id)continue;const fingerprint=crypto.createHash('sha256').update(JSON.stringify([n.app,n.title,n.text,n.at])).digest('hex');
        const previous=s.seen.get(n.id);s.seen.delete(n.id);s.seen.set(n.id,fingerprint);
        const age=sentAt-n.at;
        if(previous!==fingerprint&&n.at>0&&age<=30000&&age>=-5000)try{this.onNotification({id:'phone:'+crypto.createHash('sha256').update(device.id+':'+n.id+':'+fingerprint).digest('hex'),source:'phone',app:n.app+(device.name?' · '+device.name:''),title:n.title,body:n.text,time:this.now()-Math.max(0,age)},device);}catch{}
      }
      while(s.seen.size>256)s.seen.delete(s.seen.keys().next().value);
    }else{s.notifications=[];s.seen.clear();}
    for(const result of (Array.isArray(data.results)?data.results:[]).slice(0,8)){const p=s.pending.get(result.id);ack.push(result.id);if(!p)continue;s.pending.delete(result.id);clearTimeout(p.timer);if(!device.capabilities.includes(p.cap))p.reject(Error('Permission revoked.'));else if(result.error)p.reject(Error(String(result.error).slice(0,300)));else try{p.resolve(p.command.type.startsWith('messages.')?messageResult(p.command.type,result.value||{}):result.value||{});}catch(error){p.reject(error);}}
    const commands=[];for(const [id,p]of s.pending){if(!device.capabilities.includes(p.cap)||p.command.expires<this.now()||(p.command.type==='input'&&(!device.capabilities.includes('phoneScreen')||!s.status.controlEnabled||!s.status.capture.includes('screen')))){clearTimeout(p.timer);p.reject(Error('Phone permission revoked or request expired.'));s.pending.delete(id);}else commands.push(p.command);}
    return {success:true,commands,ack,serverAt:this.now()};
  }
  revoke(id){const s=this.devices.get(id);if(s)for(const p of s.pending.values()){clearTimeout(p.timer);p.reject(Error('Phone disconnected.'));}this.devices.delete(id);}
  clear(){for(const id of this.devices.keys())this.revoke(id);}
}
module.exports={PhoneSync,phoneInput,messageResult,validateMessageCommand};
