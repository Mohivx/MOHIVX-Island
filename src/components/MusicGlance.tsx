import {useState} from 'react';
import {Music} from 'lucide-react';
import './music.css';

export function MusicCover({artwork,waiting=false,large=false}:{artwork?:string;waiting?:boolean;large?:boolean}){
  const [failedArtwork,setFailedArtwork]=useState<string>();
  return <span className={`island-media-cover${large?' island-media-cover-large':''}`}>{artwork&&failedArtwork!==artwork?<img src={artwork} alt="" draggable={false} onError={()=>setFailedArtwork(artwork)}/>:<Music size={large?24:16}/>}<span className="island-media-wait" hidden={!waiting}/></span>;
}

export function MusicGlance({title,artist,artwork,shape,side,ar,waiting,presentation='compact',audible=false,fixed=false,theme='player',fallback=false,onOpen,onWheel}:{title:string;artist:string;artwork?:string;shape:string;side:boolean;ar:boolean;waiting:boolean;presentation?:string;audible?:boolean;fixed?:boolean;theme?:string;fallback?:boolean;onOpen:()=>void;onWheel:(event:React.WheelEvent)=>void}){
  const label=ar?`الآن: ${title} · فتح التحكم بالموسيقى`:`Now playing: ${title} · Open music controls`;
  return <button type="button" className="island-media-glance" data-media-glance data-media-source={fallback?'output':'session'} data-presentation={presentation} data-music-theme={theme} data-fixed={fixed} data-audible={audible} data-shape={shape} data-side={side} aria-label={label} title={label} onClick={onOpen} onWheel={onWheel}>
    <MusicCover artwork={artwork} waiting={waiting}/>
    <span className="island-media-copy" dir="auto"><strong>{title}</strong><small>{artist}</small></span>
    <span className="island-media-waves" aria-hidden="true"><span /><span /><span /></span>
    {presentation==='disc'&&<span className="island-disc-grooves" aria-hidden="true"><i/></span>}
    {presentation==='waveform'&&<span className="island-internal-wave" aria-hidden="true">{Array.from({length:17},(_,i)=><i key={i} style={{height:`calc(2px + var(--output-peak,0) * ${5+12*(1-Math.abs(i-8)/8)}px)`}}/>)}</span>}
  </button>;
}
