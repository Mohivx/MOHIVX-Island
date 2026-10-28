const crypto=require('node:crypto');
function validateInput(data){
 if(!data||typeof data!=='object')throw Error('Invalid input.');
 if(data.type==='move'&&Number.isFinite(data.dx)&&Number.isFinite(data.dy))return {type:'move',dx:Math.round(Math.max(-2000,Math.min(2000,data.dx))),dy:Math.round(Math.max(-2000,Math.min(2000,data.dy)))};
 if(data.type==='click'&&['left','right'].includes(data.button))return {type:'click',button:data.button};
 if(data.type==='scroll'&&Number.isFinite(data.delta))return {type:'scroll',delta:Math.round(Math.max(-20,Math.min(20,data.delta)))};
 if(data.type==='text'&&typeof data.text==='string'&&data.text.length<=2000&&data.text.length)return {type:'text',text:data.text};
 if(data.type==='key'&&['enter','backspace','tab','escape','left','right','up','down','home','end','delete'].includes(data.key))return {type:'key',key:data.key};
 throw Error('Unsupported input.');
}
function jpegSize(bytes){
 if(bytes.length<16||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)return null;
 for(let p=2;p<bytes.length-2;){
  if(bytes[p++]!==255)return null;while(p<bytes.length&&bytes[p]===255)p++;
  if(p+3>bytes.length)return null;const marker=bytes[p++];if(marker===218||marker===217)return null;
  const length=bytes.readUInt16BE(p);if(length<2||p+length>bytes.length)return null;
  if([192,193,194].includes(marker)){if(length<8)return null;const height=bytes.readUInt16BE(p+3),width=bytes.readUInt16BE(p+5);return width>0&&height>0&&width<=4096&&height<=4096&&width*height<=4000000?{width,height}:null;}p+=length;
 }return null;
}
class PhoneBridge{
 constructor(onChange=()=>{}){this.frames=new Map();this.audio=new Map();this.streams=new Map();this.frameTimes=new Map();this.seq=0;this.onChange=onChange;}
 begin(device,kind){if(!['camera','mic','screen','audio'].includes(kind))throw Error('Unsupported media source.');this.clear(device,kind);const streamId=crypto.randomBytes(16).toString('hex');this.streams.set(device+':'+kind,streamId);return {success:true,streamId};}
 publish(device,kind,data){
  if(!this.streams.has(device+':'+kind)||data?.streamId!==this.streams.get(device+':'+kind))throw Error('Media session stopped. Start sharing again.');
  if(!data||typeof data.data!=='string'||data.data.length>1100000||!/^[A-Za-z0-9+/]*={0,2}$/.test(data.data))throw Error('Invalid media packet.');const bytes=Buffer.from(data.data,'base64');let frame;
  if(kind==='mic'){if(![16000,24000,48000].includes(data.rate)||bytes.length<2||bytes.length%2||bytes.length>data.rate*4)throw Error('Invalid microphone packet.');let sum=0,peak=0;for(let i=0;i<bytes.length;i+=2){const sample=bytes.readInt16LE(i)/32768;sum+=sample*sample;peak=Math.max(peak,Math.abs(sample));}frame={device,kind,rate:data.rate,data:data.data,inputLevel:Math.sqrt(sum/(bytes.length/2)),inputPeak:peak};}
  else if(kind==='audio'){if(data.rate!==48000||data.channels!==2||bytes.length<4||bytes.length%4||bytes.length>19200)throw Error('Invalid phone audio packet.');let sum=0,peak=0;for(let i=0;i<bytes.length;i+=2){const sample=bytes.readInt16LE(i)/32768;sum+=sample*sample;peak=Math.max(peak,Math.abs(sample));}frame={device,kind,rate:data.rate,channels:data.channels,data:data.data,inputLevel:Math.sqrt(sum/(bytes.length/2)),inputPeak:peak};}
  else{const size=jpegSize(bytes);if(!['camera','screen'].includes(kind)||!size)throw Error('Invalid image packet.');frame={device,kind,...size,dataUrl:'data:image/jpeg;base64,'+data.data};}
  frame.first=!this.frames.has(device+':'+kind);
  frame.sequence=++this.seq;frame.at=Date.now();
  const key=device+':'+kind,times=(this.frameTimes.get(key)||[]).filter(at=>frame.at-at<=2000);times.push(frame.at);this.frameTimes.set(key,times.slice(-120));
  frame.fps=times.length>1&&frame.at>times[0]?Math.round((times.length-1)*10000/(frame.at-times[0]))/10:0;
  this.frames.set(key,frame);
  if(kind==='mic'){const queue=this.audio.get(device)||[];queue.push(frame);while(queue.length>30)queue.shift();this.audio.set(device,queue);}
  this.onChange(frame);return {success:true,sequence:frame.sequence,fps:frame.fps};
 }
 expire(now=Date.now()){for(const frame of [...this.frames.values()])if(now-frame.at>=8000)this.clear(frame.device,frame.kind);}
 clearAll(){for(const key of [...this.streams.keys()]){const cut=key.lastIndexOf(':');this.clear(key.slice(0,cut),key.slice(cut+1));}}
 snapshot(){this.expire();return [...this.frames.values()].filter(frame=>Date.now()-frame.at<8000).map(({data,dataUrl,...frame})=>frame);}
 latest(device,kind){const frame=this.frames.get(device+':'+kind);return frame&&Date.now()-frame.at<8000?frame:null;}
 microphone(device,after=0){return (this.audio.get(device)||[]).filter(frame=>frame.sequence>after&&Date.now()-frame.at<8000);}
 clear(device,kind){for(const [key,frame] of this.frames)if(frame.device===device&&(!kind||frame.kind===kind)){this.frames.delete(key);this.frameTimes.delete(key);}for(const key of this.streams.keys())if(key.startsWith(device+':')&&(!kind||key===device+':'+kind))this.streams.delete(key);if(!kind||kind==='mic')this.audio.delete(device);this.onChange({device,kind:kind||'all',stopped:true});return {success:true};}
}
module.exports={PhoneBridge,validateInput,jpegSize};
