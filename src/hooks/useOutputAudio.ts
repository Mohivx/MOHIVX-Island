import {useEffect,useState} from 'react';
import {ipc} from './useSettings';
// Only normalized output peaks arrive here; no microphone or PCM data.
export function useOutputAudio(){
 const [active,setActive]=useState(false);
 useEffect(()=>{let last=0;const receive=(_:unknown,value:any)=>{const peak=Math.max(0,Math.min(1,Number(value?.peak)||0));document.documentElement.style.setProperty('--output-peak',String(Math.sqrt(peak)));if(value?.available&&peak>.002){last=Date.now();setActive(true);}else{last=0;setActive(false);}};
 ipc?.on('audio-meter',receive);const timer=setInterval(()=>{if(Date.now()-last>180)setActive(false);},60);return()=>{clearInterval(timer);ipc?.removeListener('audio-meter',receive);};},[]);
 return active;
}
