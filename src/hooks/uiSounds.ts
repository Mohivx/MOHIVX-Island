let audio:AudioContext|null=null;
export function uiSound(kind:'tap'|'ready'|'done'|'error'|'collapse'|'sidearm'|'aura',settings:{uiSounds?:boolean;uiSoundVolume?:number;abilitySoundVolume?:number}){
 if(settings.uiSounds===false)return;
 try{audio??=new AudioContext();void audio.resume();const volume=Math.max(0,Math.min(.4,kind==='collapse'||kind==='sidearm'||kind==='aura'?settings.abilitySoundVolume??.16:settings.uiSoundVolume??.12)),now=audio.currentTime;
 const count=kind==='done'||kind==='ready'?3:1;
 for(let i=0;i<count;i++){const o=audio.createOscillator(),g=audio.createGain();o.type=kind==='collapse'?'sine':kind==='sidearm'?'triangle':'sine';const frequency=kind==='error'?220:kind==='collapse'?140:kind==='sidearm'?90:kind==='aura'?740:kind==='tap'?680:440+i*165,duration=kind==='collapse'?.7:kind==='aura'?.45:.12,t=now+i*.08;o.frequency.setValueAtTime(frequency,t);o.frequency.exponentialRampToValueAtTime(kind==='collapse'?30:frequency*1.05,t+duration);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0001,volume),t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+duration+.01);}
 }catch{}
}
