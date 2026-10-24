import {useEffect,useRef,useState} from 'react';
import {ipc} from './useSettings';
import {IslandNoticeQueue,type IslandNotice} from './islandNotices.mjs';
export function useIslandNotices(blocked:boolean,enabled:boolean,durationMs:number=8000){
  const [current,setCurrent]=useState<IslandNotice|null>(null);
  const queue=useRef<IslandNoticeQueue|null>(null);
  if(!queue.current)queue.current=new IslandNoticeQueue(setCurrent,{durationMs});
  useEffect(()=>{queue.current!.setDuration(durationMs);},[durationMs]);
  useEffect(()=>{queue.current!.setBlocked(blocked);},[blocked]);
  useEffect(()=>{
    const q=queue.current!;
    if(!enabled){q.clear();return;}
    const receive=(_:unknown,item:IslandNotice)=>q.enqueue(item);
    ipc?.on('island-notification',receive);
    return()=>{ipc?.removeListener('island-notification',receive);q.clear();};
  },[enabled]);
  return {
    current:blocked||!enabled?null:current,
    dismiss:()=>queue.current?.dismiss(),
    pause:(value:boolean)=>queue.current?.pause(value)
  };
}
