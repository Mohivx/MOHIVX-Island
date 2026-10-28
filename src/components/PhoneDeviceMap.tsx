import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {Battery,BatteryCharging,Grip,Monitor,MousePointer2,Smartphone,Wifi} from 'lucide-react';
import {ipc,useSettings} from '../hooks/useSettings';
import {computeDisplayBoard,resolveAllPhonePlacements,resolvePhonePlacement} from './phonePlacement.mjs';
import './phone-map.css';

type Device={id:string;name:string;lastSeen?:number;capabilities?:string[]};
type Frame={device:string;kind:string;sequence:number;at:number;dataUrl?:string;stopped?:boolean;width?:number;height?:number};
type Position={x:number;y:number};
type Display={id:string;name:string;primary:boolean;bounds:{x:number;y:number;width:number;height:number};scaleFactor?:number};
type Props={devices:Device[];frames:Frame[];snapshots:Record<string,any>;selected:string;onSelect:(id:string)=>void};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

export function PhoneDeviceMap({devices,frames,snapshots,selected,onSelect}:Props){
 const {settings,update}=useSettings(),ar=settings.appLang==='ar',t=(en:string,a:string)=>ar?a:en;
 const [positions,setPositions]=useState<Record<string,Position>>(settings.phoneDeviceLayout||{}),[boardWidth,setBoardWidth]=useState(0),[displays,setDisplays]=useState<Display[]>([]);
 const board=useRef<HTMLDivElement>(null),drag=useRef<{id:string;pointerId:number;startX:number;startY:number;offsetX:number;offsetY:number;origin:Position;current:Position;moved:boolean}|null>(null);
 useEffect(()=>setPositions(settings.phoneDeviceLayout||{}),[settings.phoneDeviceLayout]);
 useEffect(()=>{let live=true;ipc?.invoke('get-displays').then((value:any)=>{if(live&&Array.isArray(value))setDisplays(value.filter((display:any)=>display?.bounds?.width>0&&display?.bounds?.height>0));}).catch(()=>{});return()=>{live=false;};},[]);
 useEffect(()=>{const element=board.current;if(!element)return;const observer=new ResizeObserver(entries=>setBoardWidth(entries[0]?.contentRect.width||element.clientWidth));observer.observe(element);setBoardWidth(element.clientWidth);return()=>observer.disconnect();},[]);
 if(!devices.length)return null;

 const boardLayout=computeDisplayBoard(displays,boardWidth||640);
 const {height,cardWidth,cardHeight,monitorRects}=boardLayout;
 const placements=resolveAllPhonePlacements(devices,positions,boardLayout,displays);
 const edgeLabel=(edge:string)=>({left:t('Left edge','الحافة اليسرى'),right:t('Right edge','الحافة اليمنى'),top:t('Top edge','الحافة العليا'),bottom:t('Bottom edge','الحافة السفلى')} as Record<string,string>)[edge]||edge;
 const position=(device:Device)=>placements[device.id]||{x:0,y:0,edge:'left',monitorId:null};
 const frameFor=(id:string)=>frames.find(frame=>frame.device===id&&frame.kind==='screen'&&!frame.stopped&&frame.dataUrl&&Date.now()-frame.at<8000);
 const start=(e:ReactPointerEvent<HTMLDivElement>,device:Device)=>{
  if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
  const currentPos=position(device),rect=e.currentTarget.getBoundingClientRect();
  drag.current={id:device.id,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,offsetX:e.clientX-rect.left,offsetY:e.clientY-rect.top,origin:{x:currentPos.x,y:currentPos.y},current:{x:currentPos.x,y:currentPos.y},moved:false};
 };
 const move=(e:ReactPointerEvent<HTMLDivElement>)=>{
  const active=drag.current,area=board.current;if(!active||active.pointerId!==e.pointerId||!area)return;
  const dx=e.clientX-active.startX,dy=e.clientY-active.startY;if(!active.moved&&Math.hypot(dx,dy)<5)return;active.moved=true;
  const bounds=area.getBoundingClientRect(),spanX=Math.max(1,bounds.width-cardWidth),spanY=Math.max(1,bounds.height-cardHeight);
  const next={x:clamp((e.clientX-bounds.left-active.offsetX)/spanX,0,1),y:clamp((e.clientY-bounds.top-active.offsetY)/spanY,0,1)};active.current=next;setPositions(old=>({...old,[active.id]:next}));
 };
 const finish=async(e:ReactPointerEvent<HTMLDivElement>)=>{
  const active=drag.current;if(!active||active.pointerId!==e.pointerId)return;drag.current=null;
  if(active.moved){
   const occupied=devices.filter(d=>d.id!==active.id).map(d=>placements[d.id]).filter(Boolean);
   const idx=Math.max(0,devices.findIndex(d=>d.id===active.id));
   const snapped=resolvePhonePlacement(active.current,boardLayout,occupied,idx,displays);
   const next={...positions,[active.id]:{x:snapped.x,y:snapped.y}};
   setPositions(next);await update({phoneDeviceLayout:next});
  }
  else onSelect(active.id);
 };
 const cancel=()=>{const active=drag.current;if(!active)return;drag.current=null;if(active.moved)setPositions(old=>({...old,[active.id]:active.origin}));};
 return <section className="phone-device-map" dir={ar?'rtl':'ltr'}>
  <header><div><b>{t('Display arrangement','ترتيب الشاشات')}</b><span>{devices.length} · {t('drag phones around your displays','اسحب الهواتف حول الشاشات')}</span></div><small>{t('Computer screens follow their Windows positions; phone size comes from the device.','تظهر شاشات الكمبيوتر بترتيب ويندوز، ويُكتشف حجم شاشة كل هاتف تلقائيًا.')}</small></header>
  {devices.length>1&&<div className="phone-device-map-switcher" role="group" aria-label={t('Paired phones','الهواتف المقترنة')}>{devices.map(d=><button key={d.id} type="button" aria-pressed={selected===d.id} onClick={()=>onSelect(d.id)}>{d.name}</button>)}</div>}
  <label className="phone-edge-handoff-toggle"><input type="checkbox" checked={Boolean(settings.phoneEdgeHandoff)} onChange={e=>void update({phoneEdgeHandoff:e.target.checked})}/><MousePointer2 size={13}/><span>{t('Open phone screen viewer at chosen computer display edge (Esc releases)','فتح عارض شاشة الهاتف عند حافة شاشة الكمبيوتر المختارة (Esc للإفلات)')}</span></label>
  <div className="phone-device-map-canvas" ref={board} style={{height}} dir="ltr">
   {monitorRects.map(({display,left,top,width:displayW,height:displayH})=><div key={display.id} className="phone-map-monitor" data-primary={display.primary} style={{left,top,width:Math.max(48,displayW),height:Math.max(38,displayH)}} aria-label={`${display.name}${display.primary?' · primary':''}`}>
     <div className="phone-map-monitor-screen"><Monitor size={Math.min(26,Math.max(15,displayW/10))}/></div><span>{display.name}{display.primary?` · ${t('Primary','رئيسية')}`:''}</span>
    </div>)}
   {devices.map((device)=>{
    const snapshot=snapshots[device.id]||{},status=snapshot.status||{},frame=frameFor(device.id),display=status.display||((frame?.width&&frame?.height)?{width:frame.width,height:frame.height}:null),w=display?.width||9,h=display?.height||19,screenImage=frame?.dataUrl||status.wallpaper||'',online=Date.now()-(snapshot.at||0)<15000,BatteryIcon=status.charging?BatteryCharging:Battery;
    const placed=position(device),draggingThis=drag.current?.id===device.id&&drag.current.moved,drawPos=draggingThis?drag.current!.current:placed;
    return <div key={device.id} role="button" tabIndex={0} aria-pressed={selected===device.id} aria-label={t(`Select ${device.name}; drag around the display map`,`اختر ${device.name} واسحبه على مخطط الشاشات`)} className="phone-map-device" data-selected={selected===device.id} data-online={online} data-edge={placed.edge} data-monitor={placed.monitorId||''} style={{left:`${drawPos.x*100}%`,top:`${drawPos.y*100}%`,transform:`translate(${-drawPos.x*100}%,${-drawPos.y*100}%)`}} onPointerDown={e=>start(e,device)} onPointerMove={move} onPointerUp={e=>void finish(e)} onPointerCancel={cancel} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(device.id);}}}>
      <div className="phone-map-preview" data-live={Boolean(frame?.dataUrl)} data-wallpaper={!frame?.dataUrl&&Boolean(status.wallpaper)} style={{width:Math.max(48,Math.min(108,132*w/h)),height:132,aspectRatio:`${w}/${h}`}}>{screenImage?<img src={screenImage} alt="" draggable={false}/>:<Smartphone size={23}/>}</div>
      <div className="phone-map-info"><b title={device.name}>{device.name}</b><span className="phone-map-status"><i/>{online?t('Connected','متصل'):t('Offline','غير متصل')} · {edgeLabel(placed.edge)}</span><span className="phone-map-meta">{display?`${w} × ${h}`:t('Waiting for size','بانتظار الأبعاد')}</span>{Number.isInteger(status.battery)&&<span className="phone-map-battery"><BatteryIcon size={12}/>{status.battery}%</span>}</div>
      <Grip className="phone-map-grip" size={14}/><Wifi className="phone-map-wifi" size={13}/>
    </div>;
   })}
  </div>
 </section>;
}
