import { ipc } from './useSettings';
let active: AudioContext | null = null;
export function stopVoicePlayback() { const context=active;active=null;if(context&&context.state!=='closed')void context.close(); }
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')stopVoicePlayback();});
ipc?.on('companion-window-hidden',stopVoicePlayback);
export async function playVoice(audio:string,mimeType='audio/L16') {
  stopVoicePlayback();
  const bytes=Uint8Array.from(atob(audio),char=>char.charCodeAt(0));
  if(!bytes.length||bytes.length>25*1024*1024)throw new Error('Invalid voice audio.');
  const context=new AudioContext({sampleRate:24000});active=context;
  try {
    await context.resume(); let buffer:AudioBuffer;
    const wav=bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[3]===70;
    if(wav||/wav|mpeg|mp3|ogg/i.test(mimeType))buffer=await context.decodeAudioData(bytes.buffer);
    else {
      if(bytes.length%2)throw new Error('Invalid PCM audio.');
      buffer=context.createBuffer(1,bytes.length/2,24000);const view=new DataView(bytes.buffer),channel=buffer.getChannelData(0);
      for(let i=0;i<channel.length;i++)channel[i]=view.getInt16(i*2,true)/32768;
    }
    if(active!==context)return;
    await new Promise<void>((resolve,reject)=>{
      const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);
      source.onended=()=>resolve();context.onstatechange=()=>{if(context.state==='closed')resolve();};
      try{source.start();}catch(e){reject(e);}
    });
  } finally {if(active===context)active=null;if(context.state!=='closed')await context.close();}
}
