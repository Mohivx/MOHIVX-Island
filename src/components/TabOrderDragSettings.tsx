import {useRef,useState} from 'react';
import {GripVertical,RotateCcw} from 'lucide-react';
import './tab-order-settings.css';

type Props={
 order:string[];
 visible:Record<string,boolean>;
 defaultTab:string;
 onChange:(next:string[])=>void;
 onVisibilityChange?:(next:Record<string,boolean>)=>void;
 onDefaultChange?:(id:string)=>void;
 previewImage?:string;
 layoutDirection?:'ltr'|'rtl';
 ar:boolean
};
const DEFAULT_ORDER=['agents','phone','controls','today','stats','clipboard','apps','wallpaper','power','ai'];
const LABELS:Record<string,[string,string]>={agents:['Agents','الوكلاء'],phone:['Phone','الهاتف'],controls:['Controls','التحكم'],today:['Today','اليوم'],stats:['Stats','الإحصائيات'],clipboard:['Clipboard','الحافظة'],apps:['Apps','التطبيقات'],wallpaper:['Wallpaper','الخلفية'],power:['Power','الطاقة'],ai:['Soul','الروح']};

export function TabOrderSettings({order,visible,defaultTab,onChange,onVisibilityChange,onDefaultChange,previewImage,layoutDirection,ar}:Props){
 const source=useRef(''),[dragged,setDragged]=useState(''),[target,setTarget]=useState('');
 const reset=()=>{source.current='';setDragged('');setTarget('');};
 const toggleVisibility=(id:string)=>{
  if(!onVisibilityChange)return;
  const currentlyVisible=visible[id]!==false;
  if(currentlyVisible&&order.filter(key=>visible[key]!==false).length<=1)return;
  onVisibilityChange({...visible,[id]:!currentlyVisible});
 };
 const resetLayout=()=>{
  const nextVisible=Object.fromEntries(DEFAULT_ORDER.map(id=>[id,id!=='power']));
  onChange(DEFAULT_ORDER);
  onVisibilityChange?.(nextVisible);
  onDefaultChange?.('controls');
  reset();
 };
 const place=(id:string)=>{
  const moving=source.current,from=order.indexOf(moving),to=order.indexOf(id);
  if(from>=0&&to>=0&&from!==to){const next=order.slice();next.splice(from,1);next.splice(to,0,moving);onChange(next);}
  reset();
 };
 const label=(id:string)=>LABELS[id]?.[ar?1:0]||id;
 return <section className="settings-card control-centre-pages" dir={layoutDirection||(ar?'rtl':'ltr')} aria-label={ar?'صفحات مركز التحكم':'Control Centre pages'} style={previewImage?{backgroundImage:'linear-gradient(#11182780,#10131dcc),url('+previewImage+')'}:undefined}>
  <header className="control-centre-heading"><div><h3>{ar?'صفحات مركز التحكم':'Control Centre pages'}</h3><p>{ar?'الأزرق هو القسم الافتراضي. الأحمر يعني أن القسم مخفي.':'Blue is your default. Red pages are hidden.'}</p></div><button type="button" className="subtle-button" onClick={resetLayout}><RotateCcw size={13}/>{ar?'استعادة':'Reset'}</button></header>
  <div className="control-centre-preview">
   <ol className="tab-order-strip">{order.map(id=>{
    const currentLabel=label(id),hidden=visible[id]===false,isDefault=defaultTab===id;
    return <li key={id} data-tab-id={id} data-dragging={dragged===id} data-drop-target={target===id&&dragged!==id} data-hidden={hidden} data-default={isDefault}
     onContextMenu={event=>{event.preventDefault();toggleVisibility(id);}}
     onDragOver={event=>{if(!source.current)return;event.preventDefault();event.dataTransfer.dropEffect='move';setTarget(id);}}
     onDrop={event=>{event.preventDefault();place(id);}}>
      <button type="button" draggable aria-pressed={isDefault} aria-label={(ar?'اسحب لترتيب ':'Drag to reorder ')+currentLabel} title={ar?'اسحب لإعادة الترتيب · انقر لتعيينه افتراضيًا · انقر بزر الفأرة الأيمن لإخفائه':'Drag to reorder · click to make default · right-click to hide'}
       onClick={()=>{if(!source.current&&!hidden)onDefaultChange?.(id);}}
       onDragStart={event=>{source.current=id;setDragged(id);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',id);}}
       onDragEnd={reset}
       onKeyDown={event=>{
        if(event.key===' '){event.preventDefault();if(source.current)reset();else{source.current=id;setDragged(id);}return;}
        if(event.key==='Escape'){reset();return;}
        if(!source.current||!['ArrowLeft','ArrowRight'].includes(event.key))return;
        event.preventDefault();
        const step=(event.key==='ArrowRight'?1:-1)*(ar?-1:1),index=order.indexOf(source.current),next=order[index+step];
        if(next){const moving=source.current;place(next);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('[data-tab-id="'+moving+'"] button')?.focus());}
       }}>
       <GripVertical size={12}/><span>{currentLabel}</span>{isDefault&&<i aria-hidden="true"/>}
      </button>
     </li>;
   })}</ol>
   <span className="control-centre-hint">{ar?'↔ اسحب القسم لتغيير مكانه　 ·　 انقر بزر الفأرة الأيمن لإخفائه':'↔ Drag a page to reorder　 ·　 Right-click to hide'}</span>
  </div>
 </section>;
}