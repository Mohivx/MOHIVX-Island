import {useEffect,useState} from 'react';
import {Minus,Square,Copy,X} from 'lucide-react';
import {ipc} from '../hooks/useSettings';
export function WindowControls({ar,onClose,onMaximizedChange}:{ar:boolean;onClose?:()=>void;onMaximizedChange?:(value:boolean)=>void}){
 const [maximized,setMaximized]=useState(false);
 useEffect(()=>{onMaximizedChange?.(maximized);},[maximized,onMaximizedChange]);
 const action=async(action:string)=>{const value=await ipc?.invoke('desktop-window-action',action);if(value)setMaximized(Boolean(value.maximized));};
 useEffect(()=>{const receive=(_:unknown,value:any)=>setMaximized(Boolean(value?.maximized));void ipc?.invoke('desktop-window-state').then((value:any)=>receive(null,value));ipc?.on('desktop-window-state-changed',receive);return()=>ipc?.removeListener('desktop-window-state-changed',receive);},[]);
 return <div className="desktop-window-controls" onDoubleClick={event=>event.stopPropagation()}><button aria-label={ar?'تصغير النافذة':'Minimize window'} title={ar?'تصغير':'Minimize'} onClick={()=>void action('minimize')}><Minus size={15}/></button><button aria-label={maximized?(ar?'استعادة حجم النافذة':'Restore window'):(ar?'تكبير النافذة':'Maximize window')} title={maximized?(ar?'استعادة الحجم':'Restore'):(ar?'تكبير':'Maximize')} onClick={()=>void action('maximize')}>{maximized?<Copy size={13}/>:<Square size={13}/>}</button><button aria-label={ar?'إغلاق النافذة':'Close window'} title={ar?'إغلاق':'Close'} onClick={()=>onClose?onClose():void action('close')}><X size={16}/></button></div>;
}
