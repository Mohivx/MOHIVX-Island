import {useEffect,useRef} from 'react';
import {ipc} from '../hooks/useSettings';
import {MusicCover} from './MusicGlance';
export function MusicDecorations({edge,width,height,scaleX,scaleY,bars,satellite,artwork,reduced,onOpen,label}:{edge:string;width:number;height:number;scaleX:number;scaleY:number;bars:boolean;satellite:boolean;artwork?:string;reduced:boolean;onOpen:()=>void;label:string}){
 const svg=useRef<SVGSVGElement>(null),horizontal=edge==='top'||edge==='bottom';
 useEffect(()=>{if(!bars)return;const receive=(_:unknown,v:any)=>{const peak=Math.max(0,Math.min(1,Number(v?.peak)||0));svg.current?.querySelectorAll('line').forEach((line,i,lines)=>{const t=i/Math.max(1,lines.length-1),stereo=Math.max(peak*.5,Math.max(0,Number(v?.left)||0)*(1-t)+Math.max(0,Number(v?.right)||0)*t);line.style.setProperty('--line-length',String(reduced?5:Math.min(20,2+Math.sqrt(stereo)*18*(.35+.65*(1-Math.abs(t*2-1))))));});};ipc?.on('audio-meter',receive);return()=>ipc?.removeListener('audio-meter',receive);},[bars,edge,reduced]);
 const count=Math.max(7,Math.min(29,Math.floor((horizontal?width:height)/6))),out=edge==='top'||edge==='left'?1:-1;
 return <div className="music-decoration" data-music-decoration aria-hidden={!satellite}>
  {bars&&<svg ref={svg} data-music-bars aria-hidden="true" width={width*scaleX} height={height*scaleY}>{Array.from({length:count},(_,i)=>{const t=(i+.5)/count,x=horizontal?width*scaleX*t:edge==='left'?width*scaleX:0,y=horizontal?edge==='top'?height*scaleY:0:height*scaleY*t;return <line key={i} x1="0" y1="0" x2={horizontal?0:out} y2={horizontal?out:0} stroke="var(--app-accent)" strokeWidth={2.1} strokeLinecap="round" style={{transform:`translate(${x}px,${y}px) ${horizontal?'scaleY':'scaleX'}(var(--line-length,2))`}}/>;})}</svg>}
  {satellite&&<button type="button" data-music-satellite aria-label={label} title={label} onClick={onOpen} style={{left:horizontal?width*scaleX+8:Math.max(0,(width-28)*scaleX/2),top:horizontal?Math.max(0,(height-28)*scaleY/2):height*scaleY+8,width:28*scaleX,height:28*scaleY}}><MusicCover artwork={artwork}/></button>}
 </div>;
}
