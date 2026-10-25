import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {Battery,BatteryCharging,Grip,Monitor,Smartphone,Wifi} from 'lucide-react';
import {ipc,useSettings} from '../hooks/useSettings';
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

 const width=boardWidth||640,screenList=displays,hasScreens=screenList.length>0;
 const minX=hasScreens?Math.min(...screenList.map(display=>display.bounds.x)):0,minY=hasScreens?Math.min(...screenList.map(display=>display.bounds.y)):0;
 const maxX=hasScreens?Math.max(...screenList.map(display=>display.bounds.x+display.bounds.width)):1920,maxY=hasScreens?Math.max(...screenList.map(display=>display.bounds.y+display.bounds.height)):1080;
 const worldWidth=Math.max(1,maxX-minX),worldHeight=Math.max(1,maxY-minY);
 const screenScale=hasScreens?Math.max(.035,Math.min(.24,(width-260)/worldWidth,190/worldHeight)):0;
 const displayWidth=worldWidth*screenScale,displayHeight=worldHeight*screenScale,displayLeft=Math.max(8,width-displayWidth-12),displayTop=48;
 const height=Math.max(300,displayTop+displayHeight+30),cardWidth=width>460?198:178,cardHeight=width>460?124:118;
 const monitorRects=screenList.map(display=>({display,left:displayLeft+(display.bounds.x-minX)*screenScale,top:displayTop+(display.bounds.y-minY)*screenScale,width:display.bounds.width*screenScale,height:display.bounds.height*screenScale}));
 const primaryRect=monitorRects.find(rect=>rect.display.primary)||monitorRects[0];
 const initial=(index:number):Position=>{
  const left=primaryRect?primaryRect.left-cardWidth-14-(index%2)*24:8+(index%2)*30;
  const centerY=primaryRect?primaryRect.top+primaryRect.height/2:height/2;
  const top=clamp(centerY-cardHeight/2+Math.floor(index/2)*58,8,Math.max(8,height-cardHeight-8));
  return {x:clamp(left/Math.max(1,width-cardWidth),0,1),y:clamp(top/Math.max(1,height-cardHeight),0,1)};
 };
 const position=(device:Device,index:number)=>positions[device.id]||initial(index);
 const frameFor=(id:string)=>frames.find(frame=>frame.device===id&&frame.kind==='screen'&&!frame.stopped&&frame.dataUrl&&Date.now()-frame.at<8000);
 const start=(e:ReactPointerEvent<HTMLDivElement>,device:Device,index:number)=>{
  if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
  const rect=e.currentTarget.getBoundingClientRect();drag.current={id:device.id,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,offsetX:e.clientX-rect.left,offsetY:e.clientY-rect.top,origin:position(device,index),current:position(device,index),moved:false};
 };
 const move=(e:ReactPointerEvent<HTMLDivElement>)=>{
  const active=drag.current,area=board.current;if(!active||active.pointerId!==e.pointerId||!area)return;
  const dx=e.clientX-active.startX,dy=e.clientY-active.startY;if(!active.moved&&Math.hypot(dx,dy)<5)return;active.moved=true;
  const bounds=area.getBoundingClientRect(),spanX=Math.max(1,bounds.width-cardWidth),spanY=Math.max(1,bounds.height-cardHeight);
  const next={x:clamp((e.clientX-bounds.left-active.offsetX)/spanX,0,1),y:clamp((e.clientY-bounds.top-active.offsetY)/spanY,0,1)};active.current=next;setPositions(old=>({...old,[active.id]:next}));
 };
 const finish=async(e:ReactPointerEvent<HTMLDivElement>)=>{
  const active=drag.current;if(!active||active.pointerId!==e.pointerId)return;drag.current=null;
  if(active.moved){const next={...positions,[active.id]:active.current};setPositions(next);await update({phoneDeviceLayout:next});}
  else onSelect(active.id);
 };
 const cancel=()=>{const active=drag.current;if(!active)return;drag.current=null;if(active.moved)setPositions(old=>({...old,[active.id]:active.origin}));};
 return <section className="phone-device-map" dir={ar?'rtl':'ltr'}>
  <header><div><b>{t('Display arrangement','ترتيب الشاشات')}</b><span>{devices.length} · {t('drag phones around your displays','اسحب الهواتف حول الشاشات')}</span></div><small>{t('Computer screens follow their Windows positions; phone size comes from the device.','تظهر شاشات الكمبيوتر بترتيب ويندوز، ويُكتشف حجم شاشة كل هاتف تلقائيًا.')}</small></header>
  <div className="phone-device-map-canvas" ref={board} style={{height}} dir="ltr">
   {monitorRects.map(({display,left,top,width:displayW,height:displayH})=><div key={display.id} className="phone-map-monitor" data-primary={display.primary} style={{left,top,width:Math.max(48,displayW),height:Math.max(38,displayH)}} aria-label={`${display.name}${display.primary?' · primary':''}`}>
     <div className="phone-map-monitor-screen"><Monitor size={Math.min(26,Math.max(15,displayW/10))}/></div><span>{display.name}{display.primary?` · ${t('Primary','رئيسية')}`:''}</span>
    </div>)}
   {devices.map((device,index)=>{
    const snapshot=snapshots[device.id]||{},status=snapshot.status||{},frame=frameFor(device.id),display=status.display||((frame?.width&&frame?.height)?{width:frame.width,height:frame.height}:null),w=display?.width||9,h=display?.height||19,online=Date.now()-(snapshot.at||0)<15000,BatteryIcon=status.charging?BatteryCharging:Battery;
    const placed=position(device,index);
    return <div key={device.id} role="button" tabIndex={0} aria-pressed={selected===device.id} aria-label={t(`Select ${device.name}; drag around the display map`,`اختر ${device.name} واسحبه على مخطط الشاشات`)} className="phone-map-device" data-selected={selected===device.id} data-online={online} style={{left:`${placed.x*100}%`,top:`${placed.y*100}%`,transform:`translate(${-placed.x*100}%,${-placed.y*100}%)`}} onPointerDown={e=>start(e,device,index)} onPointerMove={move} onPointerUp={e=>void finish(e)} onPointerCancel={cancel} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(device.id);}}}>
      <div className="phone-map-preview" style={{width:Math.max(31,Math.min(75,72*w/h)),height:72,aspectRatio:`${w}/${h}`}}>{frame?.dataUrl?<img src={frame.dataUrl} alt="" draggable={false}/>:<Smartphone size={23}/>}</div>
      <div className="phone-map-info"><b title={device.name}>{device.name}</b><span className="phone-map-status"><i/>{online?t('Connected','متصل'):t('Offline','غير متصل')}</span><span className="phone-map-meta">{display?`${w} × ${h}`:t('Waiting for size','بانتظار الأبعاد')}</span>{Number.isInteger(status.battery)&&<span className="phone-map-battery"><BatteryIcon size={12}/>{status.battery}%</span>}</div>
      <Grip className="phone-map-grip" size={14}/><Wifi className="phone-map-wifi" size={13}/>
    </div>;
   })}
  </div>
 </section>;
}