import {useEffect,useRef,useState} from 'react';
import {Monitor,Camera,Square,Pin,Maximize2,MousePointer2,ArrowLeft,Home,PanelsTopLeft,Send} from 'lucide-react';
import {ipc,useSettings} from '../hooks/useSettings';
import {usePhoneFrame} from '../hooks/usePhoneFrame';
import {WindowControls} from './WindowControls';
import {phonePoint} from './phonePointer.mjs';
import './phone.css';

export function PhoneViewer(){
 const {settings:s}=useSettings(),ar=s.appLang==='ar',t=(en:string,a:string)=>ar?a:en;
 const query=new URLSearchParams(location.search),device=query.get('device')||'',kind=query.get('kind')==='camera'?'camera':'screen';
 const {frame,live,delayed,fps}=usePhoneFrame(device,kind);
 const [pinned,setPinned]=useState(false),[fill,setFill]=useState(false),[error,setError]=useState(''),[control,setControl]=useState(false),[available,setAvailable]=useState(false),[name,setName]=useState(''),[text,setText]=useState('');
 const down=useRef<{x:number;y:number;at:number}|null>(null),sending=useRef(false),wheelAt=useRef(0);
 useEffect(()=>{let alive=true;const read=async()=>{try{const data=await ipc?.invoke('phone-sync-status',device);if(alive){setAvailable(data?.status?.controlEnabled===true);setName(data?.status?.name||'');}}catch{if(alive)setAvailable(false);}};void read();const id=setInterval(read,1000);return()=>{alive=false;clearInterval(id);};},[device]);
 useEffect(()=>{if(!available||!live)setControl(false);},[available,live]);
 const input=async(value:unknown)=>{
  if(!control||!available||!live||sending.current)return false;
  sending.current=true;setError('');
  try{const result=await ipc?.invoke('phone-input',{device,input:value});if(!result||result.success===false)throw Error(result?.error||'Phone input unavailable');return true;}
  catch(e){setError(t('Phone input failed: ','تعذر التحكم بالهاتف: ')+(e instanceof Error?e.message:String(e)));return false;}
  finally{sending.current=false;}
 };
 const Icon=kind==='camera'?Camera:Monitor;
 return <main className="phone-viewer" dir={ar?'rtl':'ltr'}>
 <header className="phone-viewer-titlebar" onDoubleClick={()=>void ipc?.invoke('desktop-window-action','maximize')}><b><Icon size={16}/>{kind==='camera'?t('Phone camera','كاميرا الهاتف'):t('Phone screen','شاشة الهاتف')}{name&&<small> · {name}</small>}</b><WindowControls ar={ar}/></header>
 {kind==='screen'&&<div className="phone-viewer-control-bar"><button aria-pressed={control} disabled={!available||!live} onClick={()=>setControl(value=>!value)}><MousePointer2 size={15}/>{control?t('Control enabled','التحكم مفعّل'):t('Control phone','التحكم بالهاتف')}</button><span>{control?t('Click, drag and scroll. Esc returns to view only.','انقر واسحب ومرّر. Esc للعودة للعرض فقط.'):available?t('Enable control to interact with the screen.','فعّل التحكم للتفاعل مع الشاشة.'):t('Enable phone control in the Android Phone section, then share its screen.','فعّل التحكم من قسم الهاتف في أندرويد، ثم شارك الشاشة.')}</span></div>}
 <div className="phone-viewer-canvas" data-fill={fill} data-control={control} tabIndex={0}
  onKeyDown={e=>{if(e.key==='Escape'){setControl(false);return;}if(control&&['Backspace','Enter'].includes(e.key)){e.preventDefault();void input({type:'key',key:e.key==='Enter'?'enter':'backspace'});}}}
  onPointerDown={e=>{if(!control||!frame||!e.isPrimary)return;const p=phonePoint(e.clientX,e.clientY,e.currentTarget.getBoundingClientRect(),frame.width||0,frame.height||0,fill);if(!p)return;e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);down.current={...p,at:performance.now()};}}
  onPointerCancel={()=>{down.current=null;}}
  onPointerUp={e=>{const first=down.current;down.current=null;if(!first||!frame)return;const p=phonePoint(e.clientX,e.clientY,e.currentTarget.getBoundingClientRect(),frame.width||0,frame.height||0,fill);if(!p)return;const duration=performance.now()-first.at;void input(Math.hypot(p.x-first.x,p.y-first.y)<.015&&duration<600?{type:'tap',x:p.x,y:p.y}:{type:'swipe',x:first.x,y:first.y,endX:p.x,endY:p.y,duration});}}
  onWheel={e=>{if(!control||!frame||Date.now()-wheelAt.current<250||Math.abs(e.deltaY)<1)return;wheelAt.current=Date.now();e.stopPropagation();const p=phonePoint(e.clientX,e.clientY,e.currentTarget.getBoundingClientRect(),frame.width||0,frame.height||0,fill)||{x:.5,y:.5};const direction=e.deltaY>0?-1:1;void input({type:'swipe',x:p.x,y:Math.max(.25,Math.min(.75,p.y)),endX:p.x,endY:direction<0 ? .2 : .8,duration:220});}}>
  {live&&frame?.dataUrl?<img draggable={false} src={frame.dataUrl} alt={kind==='camera'?t('Live phone camera','كاميرا الهاتف المباشرة'):t('Live phone screen','شاشة الهاتف المباشرة')}/>:<div className="phone-viewer-empty"><Icon size={42}/><h2>{t('Waiting for your phone','بانتظار هاتفك')}</h2><p>{t('Start sharing from Phone in the Android app.','ابدأ المشاركة من قسم الهاتف في تطبيق أندرويد.')}</p></div>}
 </div>
 {kind==='screen'&&<div className="phone-viewer-input"><div>{([['back',ArrowLeft,t('Back','رجوع')],['home',Home,t('Home','الرئيسية')],['recents',PanelsTopLeft,t('Recent apps','التطبيقات الأخيرة')]] as const).map(([key,KeyIcon,label])=><button key={key} disabled={!control} aria-label={label} onClick={()=>void input({type:'key',key})}><KeyIcon size={17}/></button>)}</div><form onSubmit={e=>{e.preventDefault();if(text.trim())void input({type:'text',text}).then(sent=>{if(sent)setText('');});}}><input disabled={!control} maxLength={2000} value={text} onChange={e=>setText(e.target.value)} aria-label={t('Type on your phone','الكتابة على الهاتف')} placeholder={t('Tap a text field, then type here…','اضغط حقلًا على الهاتف، ثم اكتب هنا…')}/><button disabled={!control||!text.trim()} aria-label={t('Send text','إرسال النص')}><Send size={16}/></button></form></div>}
 <footer className="phone-viewer-toolbar"><span className="phone-viewer-status" data-live={live&&!delayed}>{live?(delayed?t('Connection delayed','تأخر الاتصال'):t('Live','مباشر')):t('Stopped','متوقف')}{live&&<small dir="ltr">{frame?.width} × {frame?.height} · {fps} fps</small>}</span><div><button aria-pressed={fill} aria-label={t('Fill window','ملء النافذة')} onClick={()=>setFill(!fill)}><Maximize2 size={16}/></button><button aria-pressed={pinned} aria-label={t('Keep on top','البقاء في المقدمة')} onClick={async()=>{const value=await ipc?.invoke('desktop-window-action','pin');if(value)setPinned(Boolean(value.alwaysOnTop));}}><Pin size={16}/></button><button disabled={!live} onClick={async()=>{try{await ipc?.invoke('phone-command',{device,command:{type:'capture.stop',kind}});await ipc?.invoke('phone-media-stop',{device,kind});}catch{setError(t('Could not stop sharing.','تعذر إيقاف المشاركة.'));}}}><Square size={14}/>{t('Stop','إيقاف')}</button></div></footer>{error&&<p role="alert" className="phone-viewer-error">{error}</p>}
 </main>;
}
