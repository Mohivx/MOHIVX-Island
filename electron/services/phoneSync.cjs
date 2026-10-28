const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {jpegSize}=require('./phoneBridge.cjs');
const COMMAND_CAP={ 'apps.list':'phoneData','apps.launch':'phoneControl','files.list':'phoneData','photos.list':'phoneData','files.read':'phoneData','files.write':'phoneFilesWrite','files.abort':'phoneFilesWrite','files.mkdir':'phoneFilesWrite','files.rename':'phoneFilesWrite','files.delete':'phoneFilesWrite','notifications.reply':'phoneData','messages.threads':'phoneMessages','messages.list':'phoneMessages','messages.send':'phoneMessages','contacts.resolve':'phoneContacts','calls.list':'phoneCalls','calls.dial':'phoneCalls','media.control':'phoneMedia','clipboard.set':'phoneClipboard','clipboard.get':'phoneClipboard','capture.start':'','capture.stop':'','input':'phoneControl' };
const PHONE_FILE_CHUNK=48*1024,PHONE_FILE_MAX=2147483648,PHONE_SHARE_FILE_MAX=100*1024*1024,PHONE_CLIPBOARD_MAX_BYTES=65536,PHONE_CLIPBOARD_MAX_CHARS=32000;
const BLOCKED_SHARE_EXT=/\.(?:exe|bat|cmd|com|scr|msi|msp|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|hta|cpl|msc|jar|apk|aab|dex|reg|lnk|dll|sys|inf|scf|url|pif)$/i;
const BLOCKED_SHARE_MIME=/^application\/(?:x-msdownload|x-msdos-program|x-executable|x-dosexec|x-bat|x-msi|vnd\.android\.package-archive|x-android-package-archive|hta|winhlp)$/i;
function isSensitivePhoneText(text){
  return /-----BEGIN (?:\w+ )?PRIVATE KEY-----|\b(?:AIza[A-Za-z0-9_-]{25,}|sk-[A-Za-z0-9_-]{20,}|tvly-[A-Za-z0-9_-]{15,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})\b|(?:password|passwd|api[_ -]?key|access[_ -]?token|client[_ -]?secret)\s*[:=]\s*\S+/i.test(String(text||''));
}
function validateClipboardCommand(command){
  if(!command||typeof command!=='object')throw Error('Invalid phone clipboard command.');
  if(command.type==='clipboard.get')return {type:'clipboard.get'};
  if(command.type!=='clipboard.set')throw Error('Invalid phone clipboard command.');
  if(typeof command.text!=='string'||!command.text.trim()||command.text.length>PHONE_CLIPBOARD_MAX_CHARS||Buffer.byteLength(command.text,'utf8')>PHONE_CLIPBOARD_MAX_BYTES||/\u0000/.test(command.text))throw Error('Choose plain text up to 32,000 characters (64 KB).');
  if(isSensitivePhoneText(command.text))throw Error('Sensitive clipboard content was blocked from syncing.');
  return {type:'clipboard.set',text:command.text};
}
function clipboardResult(type,value){
  if(!value||typeof value!=='object')throw Error('Invalid phone clipboard response.');
  if(type==='clipboard.set'){
    if(value.updated!==true)throw Error('Invalid phone clipboard response.');
    return {updated:true,hash:typeof value.hash==='string'&&/^[a-f0-9]{64}$/.test(value.hash)?value.hash:''};
  }
  const validated=validateClipboardCommand({type:'clipboard.set',text:value.text});
  return {text:validated.text,hash:crypto.createHash('sha256').update(validated.text).digest('hex')};
}
function validatePhoneShare(payload){
  if(!payload||typeof payload!=='object')throw Error('Invalid phone share payload.');
  if(payload.kind==='abort'){
    if(typeof payload.transferId!=='string'||!/^[0-9a-f-]{36}$/i.test(payload.transferId))throw Error('Invalid phone share payload.');
    return {kind:'abort',transferId:payload.transferId};
  }
  if(payload.kind==='text'){
    if(typeof payload.shareId!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(payload.shareId))throw Error('Invalid phone share payload.');
    const checked=validateClipboardCommand({type:'clipboard.set',text:payload.text});
    const title=cleanMessageText(payload.title,200).trim();
    return {kind:'text',shareId:payload.shareId,text:checked.text,title};
  }
  if(payload.kind!=='file'||typeof payload.transferId!=='string'||!/^[0-9a-f-]{36}$/i.test(payload.transferId))throw Error('Invalid phone share payload.');
  const name=typeof payload.name==='string'?payload.name.trim():'';
  if(!name||name.length>160||name==='.'||name==='..'||/[\\/:<>"|?*\x00-\x1f]/.test(name)||/[. ]$/.test(name))throw Error('Choose a valid shared file name.');
  if(BLOCKED_SHARE_EXT.test(name))throw Error('This file type cannot be shared to the PC.');
  const mimeType=typeof payload.mimeType==='string'?payload.mimeType.trim().slice(0,120):'';
  if(mimeType&&(!/^[a-z0-9!#$&-^_]+\/[a-z0-9!#$&-^_.+]+$/i.test(mimeType)||BLOCKED_SHARE_MIME.test(mimeType)))throw Error('This file type cannot be shared to the PC.');
  const size=payload.size,offset=payload.offset;
  if(!Number.isSafeInteger(size)||size<=0||size>PHONE_SHARE_FILE_MAX||!Number.isSafeInteger(offset)||offset<0||offset>=size)throw Error('Shared file must be between 1 byte and 100 MB.');
  if(typeof payload.data!=='string'||payload.data.length===0||payload.data.length>Math.ceil(PHONE_FILE_CHUNK/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload.data))throw Error('Invalid shared file chunk.');
  const length=Buffer.from(payload.data,'base64').length;
  if(length<=0||length>PHONE_FILE_CHUNK||offset+length>size||payload.eof!==(offset+length===size))throw Error('Invalid shared file chunk.');
  return {kind:'file',transferId:payload.transferId,name,mimeType:mimeType||'application/octet-stream',size,offset,data:payload.data,eof:payload.eof};
}
function normalizePhoneAddress(raw){
  if(typeof raw!=='string')return '';
  return raw.replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-0x0660)).replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-0x06f0)).replace(/[\s().\-\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'');
}
function cleanMessageText(raw,max){
  return String(raw||'').replace(/\u0000/g,'').slice(0,max);
}
function validateContactCommand(command){
  if(!command||typeof command!=='object'||command.type!=='contacts.resolve')throw Error('Unknown phone command.');
  if(!Array.isArray(command.numbers)||command.numbers.length===0||command.numbers.length>60)throw Error('Provide 1–60 valid phone numbers to resolve.');
  const numbers=[];
  for(const raw of command.numbers){
    const normalized=normalizePhoneAddress(raw);
    if(!/^\+?[0-9]{3,20}$/.test(normalized))throw Error('Provide 1–60 valid phone numbers to resolve.');
    if(!numbers.includes(normalized))numbers.push(normalized);
  }
  return {type:'contacts.resolve',numbers};
}
function contactResult(value){
  if(!value||typeof value!=='object'||!value.contacts||typeof value.contacts!=='object'||Array.isArray(value.contacts))throw Error('Invalid phone contacts response.');
  const contacts={};
  for(const [rawKey,rawName] of Object.entries(value.contacts).slice(0,60)){
    const num=normalizePhoneAddress(rawKey);
    const name=cleanMessageText(rawName,120).trim();
    if(/^\+?[0-9]{3,20}$/.test(num)&&name&&!/[\u0000-\u001f]/.test(name))contacts[num]=name;
  }
  return {contacts};
}
function validateCallCommand(command){
  if(!command||typeof command!=='object')throw Error('Unknown phone command.');
  if(command.type==='calls.list'){
    const offset=command.offset===undefined?0:command.offset;
    if(!Number.isSafeInteger(offset)||offset<0||offset>10000)throw Error('Invalid call history page.');
    return {type:'calls.list',offset};
  }
  if(command.type!=='calls.dial')throw Error('Unknown phone command.');
  const number=normalizePhoneAddress(command.number);
  if(!/^\+?[0-9]{3,20}$/.test(number))throw Error('Enter a valid phone number to dial.');
  return {type:'calls.dial',number};
}
function callResult(type,value){
  if(!value||typeof value!=='object')throw Error('Invalid phone call response.');
  if(type==='calls.dial'){
    if(value.opened!==true&&value.needsTap!==true)throw Error('Invalid phone call response.');
    return {opened:value.opened===true,needsTap:value.needsTap===true};
  }
  if(!Array.isArray(value.items))throw Error('Invalid phone call response.');
  const page={next:Number.isSafeInteger(value.next)&&value.next>0&&value.next<=10000?value.next:0};
  page.items=value.items.slice(0,60).map(item=>{
    if(!item||typeof item!=='object')return null;
    const id=String(item.id||'').trim(),date=Number(item.date),duration=item.duration===undefined?0:Number(item.duration);
    if(!/^[1-9][0-9]{0,17}$/.test(id)||!Number.isSafeInteger(date)||date<0||!Number.isSafeInteger(duration)||duration<0)return null;
    const callType=['incoming','outgoing','missed','rejected'].includes(item.type)?item.type:'incoming';
    const rawNumber=cleanMessageText(item.number,80).trim();
    const number=rawNumber.startsWith('-')?'':rawNumber;
    return {id,number,type:callType,date,duration:Math.min(864000,duration)};
  }).filter(Boolean);
  return page;
}
function validatePhoneFileCommand(command){
 if(!command||typeof command!=='object')throw Error('Invalid phone file transfer.');
 if(command.type==='files.abort'){
  if(typeof command.transferId!=='string'||! /^[0-9a-f-]{36}$/i.test(command.transferId))throw Error('Invalid phone file transfer.');
  return {type:'files.abort',transferId:command.transferId};
 }
 if(command.type==='files.mkdir'||command.type==='files.rename'||command.type==='files.delete'){
  if(command.type==='files.delete'){
   if(typeof command.itemId!=='string'||!/^[a-f0-9]{64}$/.test(command.itemId))throw Error('Choose a phone file or folder to delete.');
   return {type:'files.delete',itemId:command.itemId};
  }
  const name=typeof command.name==='string'?command.name.trim():'';
  if(!name||name.length>160||name==='.'||name==='..'||/[\\/:<>"|?*\x00-\x1f]/.test(name)||/[. ]$/.test(name))throw Error('Choose a valid name for the phone item.');
  if(command.type==='files.mkdir'){
   const parent=command.parent===undefined?'':command.parent;
   if(typeof parent!=='string'||(parent!==''&&!/^[a-f0-9]{64}$/.test(parent)))throw Error('Choose a valid phone folder.');
   return {type:'files.mkdir',parent,name};
  }
  if(typeof command.itemId!=='string'||!/^[a-f0-9]{64}$/.test(command.itemId))throw Error('Choose a phone file or folder to rename.');
  return {type:'files.rename',itemId:command.itemId,name};
 }
 if(command.type!=='files.write'||typeof command.transferId!=='string'||! /^[0-9a-f-]{36}$/i.test(command.transferId))throw Error('Invalid phone file transfer.');
 const name=typeof command.name==='string'?command.name.trim():'';
 if(!name||name.length>160||name==='.'||name==='..'||/[\\/:<>"|?*\x00-\x1f]/.test(name))throw Error('Choose a valid file name.');
 const parent=command.parent===undefined?'':command.parent;
 if(typeof parent!=='string'||(parent!==''&&!/^[a-f0-9]{64}$/.test(parent)))throw Error('Choose a valid phone folder.');
 const size=command.size,offset=command.offset;
 if(!Number.isSafeInteger(size)||size<0||size>PHONE_FILE_MAX||!Number.isSafeInteger(offset)||offset<0||offset>size)throw Error('Phone file is too large or invalid.');
 if(typeof command.data!=='string'||command.data.length>Math.ceil(PHONE_FILE_CHUNK/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(command.data))throw Error('Invalid phone file chunk.');
 const length=Buffer.from(command.data,'base64').length;
 if(length>PHONE_FILE_CHUNK||offset+length>size||command.eof!== (offset+length===size))throw Error('Invalid phone file chunk.');
 return {type:'files.write',transferId:command.transferId,name,parent,size,offset,data:command.data,eof:command.eof};
}
function phoneFileResult(type,value){
 if(!value||typeof value!=='object')throw Error('Invalid phone file transfer response.');
 if(type==='files.abort')return {aborted:value.aborted===true};
 if(type==='files.mkdir'){
  if(value.created!==true||typeof value.name!=='string'||value.name.length>160)throw Error('Invalid phone folder response.');
  return {created:true,name:value.name,directory:true};
 }
 if(type==='files.rename'){
  if(value.renamed!==true||typeof value.id!=='string'||!/^[a-f0-9]{64}$/.test(value.id)||typeof value.name!=='string'||value.name.length>160||typeof value.directory!=='boolean')throw Error('Invalid phone rename response.');
  return {renamed:true,id:value.id,name:value.name,directory:value.directory};
 }
 if(type==='files.delete'){
  if(value.deleted!==true)throw Error('Invalid phone delete response.');
  return {deleted:true};
 }
 const offset=Number(value.offset),nextOffset=Number(value.nextOffset);
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(nextOffset)||nextOffset<offset||nextOffset>PHONE_FILE_MAX)throw Error('Invalid phone file transfer response.');
 return {offset,nextOffset,complete:value.complete===true,name:cleanMessageText(value.name,160)};
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
 if(value.type==='move'&&point(value.x,value.y))return {type:'move',x:value.x,y:value.y};
 if(value.type==='tap'&&point(value.x,value.y))return {type:'tap',x:value.x,y:value.y};
 if(value.type==='swipe'&&point(value.x,value.y)&&point(value.endX,value.endY))return {type:'swipe',x:value.x,y:value.y,endX:value.endX,endY:value.endY,duration:Math.round(Math.max(60,Math.min(1000,Number(value.duration)||250)))};
 if(value.type==='key'&&['back','home','recents','escape','enter','backspace','delete','selectAll','copy','cut','paste'].includes(value.key))return {type:'key',key:value.key};
 if(value.type==='text'&&typeof value.text==='string'&&value.text.length>0&&value.text.length<=2000)return {type:'text',text:value.text};
 throw Error('Unsupported phone input.');
}
function validateMediaCommand(command){
 if(!command||typeof command!=='object'||command.type!=='media.control'||!['play','pause','previous','next','seek'].includes(command.action))throw Error('Choose a valid phone media control.');
 const packageName=typeof command.packageName==='string'?command.packageName:'';
 if(packageName.length>255||!/^([A-Za-z][A-Za-z0-9_]*\.)+[A-Za-z][A-Za-z0-9_]*$/.test(packageName))throw Error('Choose an active phone media player.');
 if(command.action==='seek'&&(!Number.isSafeInteger(command.position)||command.position<0||command.position>86400000))throw Error('Choose a valid playback position.');
 return {type:'media.control',action:command.action,packageName,...(command.action==='seek'?{position:command.position}:{})};
}
function mediaStatus(value,allowed){
 if(!allowed||!value||typeof value!=='object'||value.available!==true)return {available:false};
 const packageName=typeof value.packageName==='string'&&value.packageName.length<=255&&/^([A-Za-z][A-Za-z0-9_]*\.)+[A-Za-z][A-Za-z0-9_]*$/.test(value.packageName)?value.packageName:'';
 if(!packageName)return {available:false};
 const duration=Number.isSafeInteger(value.duration)&&value.duration>=0&&value.duration<=86400000?value.duration:0;
 const position=Number.isSafeInteger(value.position)&&value.position>=0?Math.min(value.position,duration):0;
 return {available:true,packageName,app:cleanMessageText(value.app,120),title:cleanMessageText(value.title,300),artist:cleanMessageText(value.artist,200),album:cleanMessageText(value.album,200),duration,position,state:['playing','paused','buffering','stopped','none'].includes(value.state)?value.state:'none',canPlay:value.canPlay===true,canPause:value.canPause===true,canPrevious:value.canPrevious===true,canNext:value.canNext===true,canSeek:value.canSeek===true};
}
function mediaResult(value){
 if(!value||typeof value!=='object'||value.accepted!==true)throw Error('The phone did not accept the media control.');
 return {accepted:true};
}
function wallpaper(value){if(typeof value!=='string'||value.length>180000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return '';const size=jpegSize(Buffer.from(value.slice(23),'base64'));return size&&size.width<=512&&size.height<=512?value:'';}
class PhoneSync {
  constructor({now=Date.now,timeout=25000,onNotification=()=>{},onClipboard=()=>{},onShare=()=>{},shareDir=''}={}){this.now=now;this.timeout=timeout;this.onNotification=onNotification;this.onClipboard=onClipboard;this.onShare=onShare;this.shareDir=shareDir;this.devices=new Map();}
  state(id){if(!this.devices.has(id))this.devices.set(id,{at:0,notifications:[],status:{},seen:new Map(),pending:new Map(),clipboard:null,lastClipboardHash:'',lastClipboardAt:0,shares:[],seenShares:new Map(),shareTransfers:new Map(),shareProgress:null});return this.devices.get(id);}
  clearClipboard(id){const s=this.devices.get(id);if(s){s.clipboard=null;s.lastClipboardHash='';s.lastClipboardAt=0;}}
  clearReceivedShares(id){const s=this.devices.get(id);if(s)s.shares=[];}
  clearShares(id){const s=this.devices.get(id);if(!s)return;for(const t of s.shareTransfers.values()){if(t.fd!==null)try{fs.closeSync(t.fd);}catch{}if(t.tempPath)try{fs.unlinkSync(t.tempPath);}catch{}}s.shareTransfers.clear();s.shareProgress=null;s.shares=[];s.seenShares.clear();}
  canAutoSyncClipboard(device,text){if(!device?.capabilities?.includes('phoneClipboard')||typeof text!=='string'||!text.trim()||text.length>PHONE_CLIPBOARD_MAX_CHARS||Buffer.byteLength(text,'utf8')>PHONE_CLIPBOARD_MAX_BYTES||/\u0000/.test(text)||isSensitivePhoneText(text))return false;const s=this.devices.get(device.id);if(!s||this.now()-s.at>15000||s.status.clipboardSync!==true)return false;const hash=crypto.createHash('sha256').update(text).digest('hex');return s.lastClipboardHash!==hash;}
  receiveClipboard(device,raw,source='phone'){
    if(!device?.capabilities?.includes('phoneClipboard'))throw Error('Enable this phone permission on the PC.');
    const checked=validateClipboardCommand({type:'clipboard.set',text:raw?.text});
    const hash=crypto.createHash('sha256').update(checked.text).digest('hex');
    const s=this.state(device.id);
    if(s.lastClipboardHash===hash)return {accepted:true,duplicate:true,hash};
    s.lastClipboardHash=hash;s.lastClipboardAt=this.now();
    s.clipboard={text:checked.text,hash,at:this.now(),source};
    if(source==='phone')try{this.onClipboard({text:checked.text,hash,at:s.clipboard.at,deviceId:device.id,deviceName:String(device.name||s.status.name||'Android').slice(0,100)},device);}catch{}
    return {accepted:true,duplicate:false,hash};
  }
  receiveShare(device,raw){
    const payload=validatePhoneShare(raw);
    const allowed=payload.kind==='text'?(device?.capabilities?.includes('phoneData')||device?.capabilities?.includes('phoneClipboard')):device?.capabilities?.includes('phoneData');
    if(!allowed)throw Error('Enable this phone permission on the PC.');
    const s=this.state(device.id),now=this.now();
    for(const [k,v] of s.seenShares)if(now-v.at>600000)s.seenShares.delete(k);
    for(const [k,t] of s.shareTransfers)if(now-t.updatedAt>60000){if(t.fd!==null)try{fs.closeSync(t.fd);}catch{}if(t.tempPath)try{fs.unlinkSync(t.tempPath);}catch{}s.shareTransfers.delete(k);if(s.shareProgress?.transferId===k)s.shareProgress=null;}
    if(payload.kind==='abort'){
      const t=s.shareTransfers.get(payload.transferId);
      if(t){if(t.fd!==null)try{fs.closeSync(t.fd);}catch{}if(t.tempPath)try{fs.unlinkSync(t.tempPath);}catch{}s.shareTransfers.delete(payload.transferId);if(s.shareProgress?.transferId===payload.transferId)s.shareProgress=null;}
      return {aborted:Boolean(t)};
    }
    if(payload.kind==='text'){
      const existing=s.seenShares.get(payload.shareId);
      if(existing)return {accepted:true,duplicate:true,item:existing.item};
      const item={id:payload.shareId,kind:'text',title:payload.title,text:payload.text,at:now,deviceId:device.id,deviceName:String(device.name||s.status.name||'Android').slice(0,100)};
      s.seenShares.set(payload.shareId,{at:now,item});while(s.seenShares.size>128)s.seenShares.delete(s.seenShares.keys().next().value);
      s.shares.unshift(item);if(s.shares.length>40)s.shares.length=40;
      try{this.onShare(item,device);}catch{}
      try{this.onNotification({id:'share:'+crypto.createHash('sha256').update(device.id+':'+item.id).digest('hex'),source:'phone',app:'MOHIVX Share'+(device.name?' · '+device.name:''),title:item.title||'Shared text from phone',body:item.text.slice(0,240),time:now},device);}catch{}
      return {accepted:true,duplicate:false,item};
    }
    const existing=s.seenShares.get(payload.transferId);
    if(existing)return {accepted:true,duplicate:true,offset:payload.offset,nextOffset:payload.size,complete:true,item:existing.item};
    if(payload.offset===0){
      if(s.shareTransfers.has(payload.transferId)||s.shareTransfers.size>=2)throw Error('Too many active file transfers.');
      let fd=null,tempPath='';
      if(this.shareDir){
        fs.mkdirSync(this.shareDir,{recursive:true});
        tempPath=path.join(this.shareDir,'.mohivx-share-'+payload.transferId+'.part');
        fd=fs.openSync(tempPath,'wx');
      }
      s.shareTransfers.set(payload.transferId,{transferId:payload.transferId,name:payload.name,mimeType:payload.mimeType,size:payload.size,offset:0,fd,tempPath,updatedAt:now});
    }
    const transfer=s.shareTransfers.get(payload.transferId);
    if(!transfer)throw Error('File transfer expired. Start again.');
    if(transfer.name!==payload.name||transfer.size!==payload.size||transfer.offset!==payload.offset){
      if(transfer.fd!==null)try{fs.closeSync(transfer.fd);}catch{}if(transfer.tempPath)try{fs.unlinkSync(transfer.tempPath);}catch{}
      s.shareTransfers.delete(payload.transferId);if(s.shareProgress?.transferId===payload.transferId)s.shareProgress=null;
      throw Error('File chunks arrived out of order.');
    }
    const bytes=Buffer.from(payload.data,'base64');
    try{
      if(transfer.fd!==null)fs.writeSync(transfer.fd,bytes);
      transfer.offset+=bytes.length;transfer.updatedAt=now;
      s.shareProgress={transferId:payload.transferId,name:payload.name,sent:transfer.offset,total:payload.size,updatedAt:now};
      if(payload.eof){
        let finalPath='',finalName=payload.name;
        if(transfer.fd!==null){
          fs.closeSync(transfer.fd);transfer.fd=null;
          const parsed=path.parse(payload.name);
          let candidate=path.join(this.shareDir,payload.name),idx=1;
          while(fs.existsSync(candidate)&&idx<1000){finalName=`${parsed.name} (${idx++})${parsed.ext}`;candidate=path.join(this.shareDir,finalName);}
          fs.renameSync(transfer.tempPath,candidate);finalPath=candidate;
        }
        s.shareTransfers.delete(payload.transferId);s.shareProgress=null;
        const item={id:payload.transferId,kind:'file',name:finalName,mimeType:payload.mimeType,size:payload.size,filePath:finalPath,at:now,deviceId:device.id,deviceName:String(device.name||s.status.name||'Android').slice(0,100)};
        s.seenShares.set(payload.transferId,{at:now,item});while(s.seenShares.size>128)s.seenShares.delete(s.seenShares.keys().next().value);
        s.shares.unshift(item);if(s.shares.length>40)s.shares.length=40;
        try{this.onShare(item,device);}catch{}
        try{this.onNotification({id:'share:'+crypto.createHash('sha256').update(device.id+':'+item.id).digest('hex'),source:'phone',app:'MOHIVX Share'+(device.name?' · '+device.name:''),title:item.name,body:Math.max(1,Math.ceil(item.size/1024))+' KB',time:now},device);}catch{}
        return {accepted:true,duplicate:false,offset:payload.offset,nextOffset:transfer.offset,complete:true,item};
      }
      return {accepted:true,duplicate:false,offset:payload.offset,nextOffset:transfer.offset,complete:false};
    }catch(error){
      if(transfer.fd!==null)try{fs.closeSync(transfer.fd);}catch{}if(transfer.tempPath)try{fs.unlinkSync(transfer.tempPath);}catch{}
      s.shareTransfers.delete(payload.transferId);if(s.shareProgress?.transferId===payload.transferId)s.shareProgress=null;
      throw error;
    }
  }
  snapshot(id){const s=this.devices.get(id);return s?{at:s.at,notifications:s.notifications,status:s.status,clipboard:s.clipboard,shares:s.shares,shareProgress:s.shareProgress}:{at:0,notifications:[],status:{},clipboard:null,shares:[],shareProgress:null};}
  cancelInputs(id,reason='Phone screen sharing stopped.'){const s=this.devices.get(id);if(!s)return 0;let count=0;for(const [cmdId,p] of s.pending){if(p.command.type==='input'){clearTimeout(p.timer);p.reject(Error(reason));s.pending.delete(cmdId);count++;}}return count;}
  capability(command){if(!command||typeof command!=='object'||!Object.hasOwn(COMMAND_CAP,command.type))throw Error('Unknown phone command.');if(command.type.startsWith('capture.')){const cap={mic:'phoneMic',camera:'phoneCamera',screen:'phoneScreen'}[command.kind];if(!cap)throw Error('Unknown capture type.');return cap;}return COMMAND_CAP[command.type];}
  request(device,command){const cap=this.capability(command);if(!device?.capabilities.includes(cap))return Promise.reject(Error('Enable this phone permission on the PC.'));const s=this.state(device.id);if(this.now()-s.at>15000)return Promise.reject(Error('Open the phone app and enable background sync first.'));if(command.type==='capture.stop'&&(command.kind==='screen'||!command.kind))this.cancelInputs(device.id,'Phone screen sharing stopped.');if(command.type.startsWith('messages.')){try{command=validateMessageCommand(command);}catch(error){return Promise.reject(error);}}if(command.type==='contacts.resolve'){try{command=validateContactCommand(command);}catch(error){return Promise.reject(error);}}if(command.type.startsWith('calls.')){try{command=validateCallCommand(command);}catch(error){return Promise.reject(error);}}if(['files.write','files.abort','files.mkdir','files.rename','files.delete'].includes(command.type)){try{command=validatePhoneFileCommand(command);}catch(error){return Promise.reject(error);}}if(command.type==='media.control'){try{command=validateMediaCommand(command);}catch(error){return Promise.reject(error);}}if(command.type.startsWith('clipboard.')){if(!s.status.clipboardSync)return Promise.reject(Error('Enable clipboard sync in Phone on Android first.'));try{command=validateClipboardCommand(command);}catch(error){return Promise.reject(error);}if(command.type==='clipboard.set'){const hash=crypto.createHash('sha256').update(command.text).digest('hex');s.lastClipboardHash=hash;s.lastClipboardAt=this.now();}}if(command.type==='input'){if(!device.capabilities.includes('phoneScreen')||!s.status.controlEnabled||!s.status.capture?.includes('screen'))return Promise.reject(Error('Enable phone control on Android and keep screen sharing active.'));command={type:'input',input:phoneInput(command.input)};}if(command.type==='apps.launch'){const packageName=typeof command.packageName==='string'?command.packageName:'';if(packageName.length>255||!/^([A-Za-z][A-Za-z0-9_]*\.)+[A-Za-z][A-Za-z0-9_]*$/.test(packageName))return Promise.reject(Error('Choose an installed phone app.'));command={type:'apps.launch',packageName};}if(command.type==='notifications.reply'){const notificationId=typeof command.notificationId==='string'?command.notificationId:'';const text=typeof command.text==='string'?command.text.trim():'';if(!notificationId||notificationId.length>200||!text||text.length>1000)return Promise.reject(Error('Enter a short reply to a current phone notification.'));const notification=s.notifications.find(n=>n.id===notificationId);if(!notification||!notification.replyAvailable)return Promise.reject(Error('This phone notification no longer supports replies.'));command={type:'notifications.reply',notificationId,text};}let inputPending=0,otherPending=0;for(const p of s.pending.values()){if(p.command.type==='input')inputPending++;else otherPending++;}if(command.type==='input'?inputPending>=16:otherPending>=8)return Promise.reject(Error('Wait for the current phone request.'));
    const id=crypto.randomUUID(),timeout=command.type==='input'?Math.min(this.timeout,2500):this.timeout;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{s.pending.delete(id);reject(Error('Phone request timed out.'));},timeout);timer.unref?.();s.pending.set(id,{command:{...command,id,expires:this.now()+timeout},cap,timer,resolve,reject});});}
  exchange(device,data){const s=this.state(device.id),ack=[],sentAt=Number.isSafeInteger(data.sentAt)&&data.sentAt>0?data.sentAt:this.now();s.at=this.now();
    const status=data.status||{},previousWallpaperSource=s.status.wallpaperSource;
    const display=status.display&&Number.isInteger(status.display.width)&&Number.isInteger(status.display.height)&&status.display.width>0&&status.display.height>0&&status.display.width<=16384&&status.display.height<=16384?{width:status.display.width,height:status.display.height,densityDpi:Number.isInteger(status.display.densityDpi)?Math.max(72,Math.min(1000,status.display.densityDpi)):null,rotation:Number.isInteger(status.display.rotation)&&status.display.rotation>=0&&status.display.rotation<=3?status.display.rotation:0}:null;
    s.status={notifications:status.notifications===true,photos:status.photos===true,folder:status.folder===true,folderWritable:status.folderWritable===true,messagesRead:status.messagesRead===true,messagesSend:status.messagesSend===true,contactsRead:status.contactsRead===true,callsRead:status.callsRead===true,clipboardSync:device.capabilities.includes('phoneClipboard')&&status.clipboardSync===true,media:mediaStatus(status.media,device.capabilities.includes('phoneMedia')),capture:Array.isArray(status.capture)?status.capture.filter(x=>['mic','camera','screen'].includes(x)):[],controlEnabled:device.capabilities.includes('phoneControl')&&status.controlEnabled===true,battery:Number.isInteger(status.battery)&&status.battery>=0&&status.battery<=100?status.battery:null,charging:status.charging===true,name:String(status.name||device.name||'').slice(0,100),model:String(status.model||'').slice(0,100),connection:['wifi','cellular','usb','bluetooth','ethernet','offline'].includes(status.connection)?status.connection:'other',display,wallpaper:device.capabilities.includes('phoneData')?(Object.hasOwn(status,'wallpaper')?wallpaper(status.wallpaper):s.status.wallpaper||''):'',version:String(status.version||'').slice(0,30)};
    if(!device.capabilities.includes('phoneClipboard')){s.clipboard=null;s.lastClipboardHash='';}else if(s.status.clipboardSync&&data.clipboard&&typeof data.clipboard==='object'&&typeof data.clipboard.text==='string'){try{this.receiveClipboard(device,data.clipboard,'phone');}catch{}}
    if(!device.capabilities.includes('phoneData')&&!device.capabilities.includes('phoneClipboard'))this.clearShares(device.id);
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
    for(const result of (Array.isArray(data.results)?data.results:[]).slice(0,24)){const p=s.pending.get(result.id);ack.push(result.id);if(!p)continue;s.pending.delete(result.id);clearTimeout(p.timer);if(!device.capabilities.includes(p.cap))p.reject(Error('Permission revoked.'));else if(result.error)p.reject(Error(String(result.error).slice(0,300)));else try{if(p.command.type.startsWith('clipboard.')){const val=clipboardResult(p.command.type,result.value||{});if(p.command.type==='clipboard.get'){s.lastClipboardHash=val.hash;s.lastClipboardAt=this.now();s.clipboard={text:val.text,hash:val.hash,at:this.now(),source:'phone'};try{this.onClipboard({text:val.text,hash:val.hash,at:s.clipboard.at,deviceId:device.id,deviceName:String(device.name||s.status.name||'Android').slice(0,100)},device);}catch{}}else if(p.command.type==='clipboard.set'){s.lastClipboardHash=val.hash;s.lastClipboardAt=this.now();s.clipboard={text:p.command.text,hash:val.hash,at:this.now(),source:'pc'};}p.resolve(val);continue;}p.resolve(p.command.type.startsWith('messages.')?messageResult(p.command.type,result.value||{}):p.command.type==='contacts.resolve'?contactResult(result.value||{}):p.command.type.startsWith('calls.')?callResult(p.command.type,result.value||{}):p.command.type==='media.control'?mediaResult(result.value||{}):['files.write','files.abort','files.mkdir','files.rename','files.delete'].includes(p.command.type)?phoneFileResult(p.command.type,result.value||{}):result.value||{});}catch(error){p.reject(error);}}
    const inputCommands=[],otherCommands=[];for(const [id,p]of s.pending){if(!device.capabilities.includes(p.cap)||p.command.expires<this.now()||(p.command.type.startsWith('clipboard.')&&!s.status.clipboardSync)||(p.command.type==='input'&&(!device.capabilities.includes('phoneScreen')||!s.status.controlEnabled||!s.status.capture.includes('screen')))){clearTimeout(p.timer);p.reject(Error('Phone permission revoked or request expired.'));s.pending.delete(id);}else if(p.command.type==='input')inputCommands.push(p.command);else otherCommands.push(p.command);}const coalescedInputs=[];for(let i=0;i<inputCommands.length;i++){const cur=inputCommands[i],next=inputCommands[i+1];if(cur.input?.type==='move'&&next?.input?.type==='move'){const p=s.pending.get(cur.id);if(p){s.pending.delete(cur.id);clearTimeout(p.timer);p.resolve({accepted:true,coalesced:true});}continue;}coalescedInputs.push(cur);}const commands=[...coalescedInputs,...otherCommands];

    return {success:true,commands,ack,serverAt:this.now()};
  }
  revoke(id){const s=this.devices.get(id);if(s){for(const p of s.pending.values()){clearTimeout(p.timer);p.reject(Error('Phone disconnected.'));}this.clearShares(id);}this.devices.delete(id);}
  clear(){for(const id of this.devices.keys())this.revoke(id);}
}
module.exports={PhoneSync,phoneInput,messageResult,validateMessageCommand,contactResult,validateContactCommand,callResult,validateCallCommand,validatePhoneFileCommand,phoneFileResult,validateMediaCommand,mediaStatus,mediaResult,validateClipboardCommand,clipboardResult,validatePhoneShare,isSensitivePhoneText,normalizePhoneAddress,PHONE_FILE_CHUNK,PHONE_FILE_MAX,PHONE_SHARE_FILE_MAX,PHONE_CLIPBOARD_MAX_BYTES,PHONE_CLIPBOARD_MAX_CHARS};
