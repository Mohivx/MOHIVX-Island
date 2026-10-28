export function decodePhoneAudioFrame(frame){
 if(!frame||frame.rate!==48000||frame.channels!==2||typeof frame.data!=='string')throw new Error('Invalid phone audio frame.');
 const binary=atob(frame.data);if(binary.length<4||binary.length%4!==0||binary.length>19200)throw new Error('Invalid phone audio frame size.');
 const left=new Float32Array(binary.length/4),right=new Float32Array(binary.length/4);
 for(let i=0;i<left.length;i++){
  const offset=i*4;let l=(binary.charCodeAt(offset)|(binary.charCodeAt(offset+1)<<8));let r=(binary.charCodeAt(offset+2)|(binary.charCodeAt(offset+3)<<8));
  if(l&0x8000)l-=0x10000;if(r&0x8000)r-=0x10000;left[i]=l/32768;right[i]=r/32768;
 }
 return {left,right,rate:frame.rate};
}

export class PhoneAudioPlayer{
 constructor({contextFactory=()=>new AudioContext({latencyHint:'interactive'}),maxBufferedSeconds=.28}={}){
  this.context=contextFactory();this.maxBufferedSeconds=maxBufferedSeconds;this.nextAt=0;this.sources=new Set();this.closed=false;
 }
 async resume(){if(this.closed)throw new Error('Phone audio player is closed.');await this.context.resume();}
 push(frame){
  if(this.closed||this.context.state==='closed')return false;
  const pcm=decodePhoneAudioFrame(frame);const duration=pcm.left.length/pcm.rate;
  if(this.nextAt-this.context.currentTime>this.maxBufferedSeconds)this.flush();
  const buffer=this.context.createBuffer(2,pcm.left.length,pcm.rate);buffer.copyToChannel(pcm.left,0);buffer.copyToChannel(pcm.right,1);
  const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.context.destination);this.sources.add(source);source.onended=()=>this.sources.delete(source);
  const when=Math.max(this.context.currentTime+.012,this.nextAt);source.start(when);this.nextAt=when+duration;return true;
 }
 flush(){for(const source of this.sources){try{source.stop();}catch{}}this.sources.clear();this.nextAt=this.context.currentTime;}
 stop(){if(this.closed)return;this.closed=true;this.flush();void this.context.close().catch(()=>{});}
}
