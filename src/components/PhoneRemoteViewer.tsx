import {useEffect,useRef,useState,type KeyboardEvent as ReactKeyboardEvent} from 'react';
import {Monitor,Camera,Square,Pin,Maximize2,MousePointer2,ArrowLeft,Home,PanelsTopLeft,Send} from 'lucide-react';
import {ipc,useSettings} from '../hooks/useSettings';
import {usePhoneFrame} from '../hooks/usePhoneFrame';
import {WindowControls} from './WindowControls';
import {phonePoint} from './phonePointer.mjs';
import {createPhoneInputQueue,extractDirectPrintableKey,isComposingKeyEvent,resolvePhoneKeyShortcut} from './phoneInputQueue.mjs';
import './phone.css';
import './phone-keyboard.css';

export function PhoneViewer(){
 const {settings:s}=useSettings(),ar=s.appLang==='ar',t=(en:string,a:string)=>ar?a:en;
 const query=new URLSearchParams(location.search),device=query.get('device')||'',kind=query.get('kind')==='camera'?'camera':'screen';
 const {frame,live,delayed,fps}=usePhoneFrame(device,kind);
 const [pinned,setPinned]=useState(false),[fill,setFill]=useState(false),[error,setError]=useState(''),[control,setControl]=useState(false),[available,setAvailable]=useState(false),[name,setName]=useState(''),[text,setText]=useState('');
 const down=useRef<{x:number;y:number;at:number}|null>(null),wheelAt=useRef(0),keyboardCapture=useRef<HTMLTextAreaElement>(null),composing=useRef(false),compositionCommit=useRef<{text:string;expires:number}|null>(null);
 const stateRef=useRef({control:false,available:false,live:false,ar:false,device:''});
 stateRef.current={control,available,live,ar,device};
 const queueRef=useRef<ReturnType<typeof createPhoneInputQueue>|null>(null);
 if(!queueRef.current){
  queueRef.current=createPhoneInputQueue(
   async(action:unknown)=>ipc?.invoke('phone-input',{device:stateRef.current.device,input:action}),
   {
    maxSize:32,
    canAccept:()=>Boolean(stateRef.current.control&&stateRef.current.available&&stateRef.current.live),
    onError:(e:unknown)=>{
     const msg=e instanceof Error?e.message:String(e);
     setError((stateRef.current.ar?'تعذر التحكم بالهاتف: ':'Phone input failed: ')+msg);
    }
   }
  );
 }
 useEffect(()=>{let alive=true;const read=async()=>{try{const data=await ipc?.invoke('phone-sync-status',device);if(alive){const fresh=data?.at===undefined||Date.now()-Number(data.at)<15000;const nextAvailable=Boolean(fresh&&data?.status?.controlEnabled===true);setAvailable(nextAvailable);setName(data?.status?.name||'');if(!nextAvailable){stateRef.current.available=false;queueRef.current?.clear('unavailable');}}}catch{if(alive){setAvailable(false);stateRef.current.available=false;queueRef.current?.clear('error');}}};void read();const id=setInterval(read,1000);return()=>{alive=false;clearInterval(id);queueRef.current?.clear('unmount');};},[device]);
 useEffect(()=>{if(!available||!live){stateRef.current.control=false;down.current=null;queueRef.current?.clear('stopped');setControl(false);}},[available,live]);
 useEffect(()=>{if(!control){down.current=null;queueRef.current?.clear('control-off');}},[control]);
 const input=async(value:unknown)=>{
  if(!stateRef.current.control||!stateRef.current.available||!stateRef.current.live)return false;
  setError('');
  return queueRef.current!.enqueue(value);
 };
 useEffect(()=>{if(control&&live&&kind==='screen')requestAnimationFrame(()=>keyboardCapture.current?.focus());},[control,live,kind]);
 const keyDown=(e:ReactKeyboardEvent<HTMLDivElement>)=>{
  if(!control||isComposingKeyEvent(e,composing.current))return;
  const resolved=resolvePhoneKeyShortcut(e,composing.current);
  if(resolved?.type==='escape'){e.preventDefault();stateRef.current.control=false;queueRef.current?.clear('escape');setControl(false);return;}
  if(resolved?.type==='key'){e.preventDefault();void input({type:'key',key:resolved.key});return;}
  const target=e.target as HTMLElement|null;
  if(target!==keyboardCapture.current&&target?.tagName!=='INPUT'&&target?.tagName!=='TEXTAREA'){
   const printable=extractDirectPrintableKey(e,composing.current);
   if(printable){e.preventDefault();keyboardCapture.current?.focus();void input({type:'text',text:printable});}
  }
 };
 const Icon=kind==='camera'?Camera:Monitor;
 return <main className="phone-viewer" dir={ar?'rtl':'ltr'}>
 <header className="phone-viewer-titlebar" onDoubleClick={()=>void ipc?.invoke('desktop-window-action','maximize')}><b><Icon size={16}/>{kind==='camera'?t('Phone camera','كاميرا الهاتف'):t('Phone screen','شاشة الهاتف')}{name&&<small> · {name}</small>}</b><WindowControls ar={ar}/></header>
  {kind==='screen'&&<div className="phone-viewer-control-bar"><button aria-pressed={control} disabled={!available||!live} onClick={()=>setControl(value=>{const next=!value;stateRef.current.control=next;if(!next)queueRef.current?.clear('toggle-off');return next;})}><MousePointer2 size={15}/>{control?t('Control enabled','التحكم مفعّل'):t('Control phone','التحكم بالهاتف')}</button><span>{control?t('Click, drag and scroll. Type with your current Windows language; Esc returns to view only.','انقر واسحب ومرّر. اكتب باللغة المحددة في ويندوز؛ Esc للعودة للعرض فقط.'):available?t('Enable control to interact with the screen.','فعّل التحكم للتفاعل مع الشاشة.'):t('Enable phone control in the Android Phone section, then share its screen.','فعّل التحكم من قسم الهاتف في أندرويد، ثم شارك الشاشة.')}</span></div>}
 <div className="phone-viewer-canvas" data-fill={fill} data-control={control} tabIndex={0}
   onKeyDown={keyDown}
   onPointerDown={e=>{if(!control||!frame||!e.isPrimary)return;const p=phonePoint(e.clientX,e.clientY,e.currentTarget.getBoundingClientRect(),frame.width||0,frame.height||0,fill);if(!p)return;e.preventDefault();e.currentTarget.focus();keyboardCapture.current?.focus();e.currentTarget.setPointerCapture(e.pointerId);down.current={...p,at:performance.now()};}}
  onPointerCancel={()=>{down.current=null;}}
  onPointerUp={e=>{const first=down.current;down.current=null;if(!first||!frame)return;const p=phonePoint(e.clientX,e.clientY,e.currentTarget.getBoundingClientRect(),frame.width||0,frame.height||0,fill);if(!p)return;const duration=performance.now()-first.at;void input(Math.hypot(p.x-first.x,p.y-first.y)<.015&&duration<600?{type:'tap',x:p.x,y:p.y}:{type:'swipe',x:first.x,y:first.y,endX:p.x,endY:p.y,duration});}}
  onWheel={e=>{if(!control||!frame||Date.now()-wheelAt.current<90||Math.abs(e.deltaY)<1)return;wheelAt.current=Date.now();e.stopPropagation();const p=phonePoint(e.clientX,e.clientY,e.currentTarget.getBoundingClientRect(),frame.width||0,frame.height||0,fill)||{x:.5,y:.5};const direction=e.deltaY>0?-1:1;void input({type:'swipe',x:p.x,y:Math.max(.25,Math.min(.75,p.y)),endX:p.x,endY:direction<0 ? .2 : .8,duration:220});}}>
   {live&&frame?.dataUrl?<img draggable={false} src={frame.dataUrl} alt={kind==='camera'?t('Live phone camera','كاميرا الهاتف المباشرة'):t('Live phone screen','شاشة الهاتف المباشرة')}/>:<div className="phone-viewer-empty"><Icon size={42}/><h2>{t('Waiting for your phone','بانتظار هاتفك')}</h2><p>{t('Start sharing from Phone in the Android app.','ابدأ المشاركة من قسم الهاتف في تطبيق أندرويد.')}</p></div>}
   {kind==='screen'&&<textarea ref={keyboardCapture} className="phone-keyboard-capture" aria-label={t('Type on the phone using your Windows keyboard layout','اكتب على الهاتف بتخطيط لوحة مفاتيح ويندوز')} disabled={!control} tabIndex={control?0:-1} autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={e=>{composing.current=false;const committed=e.data;if(committed){compositionCommit.current={text:committed,expires:Date.now()+350};void input({type:'text',text:committed});}const target=e.currentTarget;setTimeout(()=>{target.value='';},0);}} onBeforeInput={e=>{const event=e.nativeEvent as InputEvent;if(!control){e.preventDefault();return;}if(event.inputType!=='insertText'||!event.data||event.isComposing||composing.current)return;const pending=compositionCommit.current;if(pending&&pending.expires>Date.now()&&pending.text===event.data){compositionCommit.current=null;e.preventDefault();return;}compositionCommit.current=null;e.preventDefault();void input({type:'text',text:event.data});}}/>}
 </div>
 {kind==='screen'&&<div className="phone-viewer-input"><div>{([['back',ArrowLeft,t('Back','رجوع')],['home',Home,t('Home','الرئيسية')],['recents',PanelsTopLeft,t('Recent apps','التطبيقات الأخيرة')]] as const).map(([key,KeyIcon,label])=><button key={key} disabled={!control} aria-label={label} onClick={()=>void input({type:'key',key})}><KeyIcon size={17}/></button>)}</div><form onSubmit={e=>{e.preventDefault();const draft=text;if(draft.trim())void input({type:'text',text:draft}).then(sent=>{if(sent)setText(current=>current===draft?'':current);});}}><input disabled={!control} maxLength={2000} value={text} onChange={e=>setText(e.target.value)} aria-label={t('Type on your phone','الكتابة على الهاتف')} placeholder={t('Tap a text field, then type here…','اضغط حقلًا على الهاتف، ثم اكتب هنا…')}/><button disabled={!control||!text.trim()} aria-label={t('Send text','إرسال النص')}><Send size={16}/></button></form></div>}
 <footer className="phone-viewer-toolbar"><span className="phone-viewer-status" data-live={live&&!delayed}>{live?(delayed?t('Connection delayed','تأخر الاتصال'):t('Live','مباشر')):t('Stopped','متوقف')}{live&&<small dir="ltr">{frame?.width} × {frame?.height} · {fps} fps</small>}</span><div><button aria-pressed={fill} aria-label={t('Fill window','ملء النافذة')} onClick={()=>setFill(!fill)}><Maximize2 size={16}/></button><button aria-pressed={pinned} aria-label={t('Keep on top','البقاء في المقدمة')} onClick={async()=>{const value=await ipc?.invoke('desktop-window-action','pin');if(value)setPinned(Boolean(value.alwaysOnTop));}}><Pin size={16}/></button><button disabled={!live} onClick={async()=>{stateRef.current.control=false;queueRef.current?.clear('stop-button');setControl(false);try{await ipc?.invoke('phone-command',{device,command:{type:'capture.stop',kind}});await ipc?.invoke('phone-media-stop',{device,kind});}catch{setError(t('Could not stop sharing.','تعذر إيقاف المشاركة.'));}}}><Square size={14}/>{t('Stop','إيقاف')}</button></div></footer>{error&&<p role="alert" className="phone-viewer-error">{error}</p>}
 </main>;
}
