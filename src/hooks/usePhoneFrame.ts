import {useEffect,useRef,useState} from 'react';
import {ipc} from './useSettings';
export type PhoneFrame={device:string;kind:string;sequence:number;at:number;dataUrl?:string;stopped?:boolean;width?:number;height?:number;first?:boolean};
export function usePhoneFrame(device:string,kind:string,maxFps=15){
 const [frame,setFrame]=useState<PhoneFrame|null>(null),[now,setNow]=useState(Date.now()),[fps,setFps]=useState(0);
 const latest=useRef(frame);latest.current=frame;
 useEffect(()=>{
  let alive=true,busy=false,dirty=false,timer:ReturnType<typeof setTimeout>|undefined,generation=0,lastFetch=0,shown=0;
  latest.current=null;setFrame(null);setFps(0);
  const fetch=async()=>{
   if(!alive||!device||document.visibilityState==='hidden')return;
   if(busy){dirty=true;return;}
   const wait=1000/maxFps-(performance.now()-lastFetch);
   if(wait>0){if(!timer)timer=setTimeout(()=>{timer=undefined;void fetch();},wait);return;}
   busy=true;lastFetch=performance.now();const ticket=generation;
   try{const value=await ipc?.invoke('phone-media-get',{device,kind});if(alive&&ticket===generation&&value?.dataUrl&&(!latest.current||value.sequence>latest.current.sequence)){shown++;setFrame(value);latest.current=value;}}
   catch{}finally{busy=false;if(dirty){dirty=false;void fetch();}}
  };
  const receive=(_:unknown,value:PhoneFrame)=>{if(value.device!==device||(value.kind!==kind&&value.kind!=='all'))return;if(value.stopped){generation++;if(timer)clearTimeout(timer);timer=undefined;latest.current=null;setFrame(null);}else void fetch();};
  const visible=()=>{if(document.visibilityState==='visible')void fetch();};
  ipc?.on('phone-media-updated',receive);document.addEventListener('visibilitychange',visible);void fetch();
  const clock=setInterval(()=>{setNow(Date.now());setFps(shown);shown=0;},1000);
  return()=>{alive=false;generation++;clearInterval(clock);if(timer)clearTimeout(timer);ipc?.removeListener('phone-media-updated',receive);document.removeEventListener('visibilitychange',visible);};
 },[device,kind,maxFps]);
 return {frame,live:Boolean(frame&&now-frame.at<8000),delayed:Boolean(frame&&now-frame.at>1500),fps};
}
