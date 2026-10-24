import {LoadoutCardCarousel} from './LoadoutCardCarousel';
import STUDIO_VOICES from '../../electron/data/voices.json';
import { playVoice } from '../hooks/playVoice';
import { soulLabel } from '../labels';
import React, { useEffect, useState } from 'react';
import { Sparkles, Smile, AudioLines, Rocket, X, Check } from 'lucide-react';
import type { SoulSkin, VoiceOption } from '../types';
import { SOUL_SKINS, VOICES } from '../constants';
import { CompanionCharacter } from './CompanionCharacter';
import { useSettings, ipc } from '../hooks/useSettings';

interface Props {
  isOpen: boolean; onClose: () => void; embedded?: boolean;
  activeSkin: SoulSkin; onSelectSkin: (s: SoulSkin) => void;
  activeVoice: VoiceOption; onSelectVoice: (v: VoiceOption) => void;
  onTriggerAbility: (a: 'collapse' | 'sidearm' | 'aura' | 'circle' | 'dictation' | 'scheduled') => void;
}

const SUPPORTED_VOICES = new Set(STUDIO_VOICES);

export function LoadoutHub({ isOpen, onClose, embedded, activeSkin, onSelectSkin, activeVoice, onSelectVoice, onTriggerAbility }: Props) {
  const [slot, setSlot] = useState<'soul' | 'personality' | 'voice' | 'abilities' | null>(null);
  const { settings, update, status } = useSettings();
  const [voiceMessage, setVoiceMessage] = useState('');
  const [inventory,setInventory]=useState<any>(null);
  useEffect(()=>{let live=true;const load=()=>ipc?.invoke('activity-get').then((value:any)=>{if(live)setInventory(value);}).catch(()=>{});load();ipc?.on('companion-data-updated',load);return()=>{live=false;ipc?.removeListener('companion-data-updated',load);};},[]);
  const runAbility=async(id:string)=>{if(['collapse','sidearm','aura'].includes(id)){try{const result=await ipc?.invoke('run-ability',id);if(!result?.success)throw Error(result?.error||'Ability unavailable.');}catch{setVoiceMessage(settings.appLang==='ar'?'احصل على القدرة من المتجر أولًا.':'Get this ability in the store first.');}}else onTriggerAbility(id as any);};
  if (!isOpen) return null;
  const ar = settings.appLang === 'ar';
  const slots = [
    { id: 'soul', name: ar ? 'الروح' : 'Soul', value: activeSkin.name, icon: Sparkles, color: '#c3aaff' },
    { id: 'personality', name: ar ? 'الشخصية' : 'Personality', value: settings.activePersonality, icon: Smile, color: '#ff9f6e' },
    { id: 'voice', name: ar ? 'الصوت' : 'Voice', value: activeVoice.name, icon: AudioLines, color: '#00cff7' },
    { id: 'abilities', name: ar ? 'القدرات' : 'Abilities', value: settings.activeAbility || '—', icon: Rocket, color: '#6fd579' },
  ] as const;



  async function previewVoice(name=activeVoice.name) {
    if (!SUPPORTED_VOICES.has(name)) {
      setVoiceMessage(ar ? 'هذا الصوت غير مدعوم في مزود الذكاء الحالي (Gemini).' : 'This voice is not supported by the current AI provider (Gemini).');
      return;
    }
    setVoiceMessage(ar ? 'جارٍ تحميل الصوت…' : 'Loading voice…');
    try {
      if (!ipc) throw new Error(ar ? 'معاينة الصوت تتطلب تطبيق سطح المكتب.' : 'Voice previews require the desktop app.');
      const res = await ipc.invoke('preview-companion-voice', { voice: name });
      if (!res.success) throw new Error(res.error);
      await playVoice(res.audio,res.mimeType);
      setVoiceMessage('');
    } catch (e) { setVoiceMessage(e instanceof Error && !ar ? e.message : (ar ? 'الصوت غير متاح' : 'Voice unavailable')); }
  }

  const voiceDescMap: Record<string, { en: string; ar: string }> = {
    Charon: { en: 'The OG voice of the soul. Deep and calm.', ar: 'صوت الروح الأصلي، هادئ وعميق.' },
    Puck: { en: 'Sits in front of a computer all day.. relatable.', ar: 'يجلس أمام الحاسوب طوال اليوم، مألوف وقريب.' },
    Leda: { en: 'Teenager girl with witty attitude.', ar: 'فتاة ذكية ومرحة مع سرعة بديهة.' },
    Aoede: { en: 'Older elegant woman with refined tone.', ar: 'سيدة ناضجة بنبرة أنيقة وواثقة.' },
    Enceladus: { en: 'Pretty calm guy.. seems very smart.', ar: 'شاب هادئ جداً ويبدو ذكياً للغاية.' },
    Algenib: { en: 'Used to work a 9-to-5 job. Grounded.', ar: 'واقعي ومستقر بنبرة يومية عملية.' },
    Laomedeia: { en: 'Haunting and slightly eerie presence.', ar: 'حضور غامض وهادئ.' },
    Jack: { en: 'Sounds like a guy you can be friends with.', ar: 'صوت ودود ومرح (غير مدعوم في Gemini).' },
    Ankit: { en: 'Indian tech tutorials specialist tone.', ar: 'نبرة تقنية متخصصة (غير مدعوم في Gemini).' },
    Cheng: { en: 'Learning English with earnest energy.', ar: 'طاقة حماسية واضحة (غير مدعوم في Gemini).' },
    Linda: { en: 'Smart, cool and pleasantly savage.', ar: 'ذكية وقوية النبرة (غير مدعوم في Gemini).' },
  };

  const content = <div className="loadout-content" dir={ar ? 'rtl' : 'ltr'}>
    <div className="loadout-heading"><h2>{ar ? 'تجهيز الروح' : 'Loadout'}</h2><button className="subtle-button" onClick={()=>ipc?.send('open-hub-tab','store')}>{ar?'المتجر':'Store'}</button>{!embedded && <button aria-label={ar ? 'إغلاق تجهيز الروح' : 'Close loadout'} onClick={onClose}><X size={15} /></button>}</div>
    <div className="soul-orbit" data-picker-open={Boolean(slot)}>
      <svg className="orbit-links" viewBox="0 0 640 280" aria-hidden="true"><defs><linearGradient id="orbit-line"><stop stopColor="#c3aaff" stopOpacity=".5" /><stop offset="1" stopColor="#5cb8ff" stopOpacity=".2" /></linearGradient></defs><path d="M320 140 Q250 35 140 72 M320 140 Q390 38 500 72 M320 140 Q250 242 140 208 M320 140 Q390 242 500 208" fill="none" stroke="url(#orbit-line)" strokeWidth="1" /><circle cx="320" cy="140" r="67" fill="none" stroke="#83beff" strokeOpacity=".07" /><circle cx="320" cy="140" r="47" fill="none" stroke="#83beff" strokeOpacity=".16" /></svg>
      <div className="soul-orbit-center" style={{ '--soul-color': activeSkin.glow } as React.CSSProperties}><CompanionCharacter size={90} skin={activeSkin} /></div>
      {slots.map((s, i) => <button key={s.id} className={`soul-slot slot-${i} ${slot === s.id ? 'selected' : ''}`} aria-pressed={slot === s.id} onClick={() => setSlot(slot === s.id ? null : s.id)}>
        <s.icon size={19} style={{ color: s.color }} /><span><b>{soulLabel(s.value,ar)}</b><small>{soulLabel(s.name,ar)}</small></span>
      </button>)}
    </div>
    {slot && <div className="soul-picker" key={slot} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setSlot(null);}}}>
      <div className="picker-heading"><span>{slots.find(s => s.id === slot)?.name}</span><button aria-label={ar ? 'إغلاق القائمة' : 'Close picker'} onClick={() => setSlot(null)}><X size={13} /></button></div>
      {slot==='soul'&&<LoadoutCardCarousel ar={ar} selectedId={activeSkin.id} onSelect={id=>{const skin=SOUL_SKINS[id];if(skin){onSelectSkin(skin);void update({activeSkin:id});}}} items={Object.values(SOUL_SKINS).map(skin=>({id:skin.id,title:soulLabel(skin.name,ar),subtitle:soulLabel(skin.rarity,ar),description:soulLabel(skin.blurb,ar),preview:<CompanionCharacter size={100} skin={skin}/>,disabled:Array.isArray(inventory?.ownedSkins)&&!inventory.ownedSkins.includes(skin.id),actionLabel:Array.isArray(inventory?.ownedSkins)&&!inventory.ownedSkins.includes(skin.id)?(ar?'في المتجر':'In store'):undefined}))}/>}
      {slot==='personality'&&<LoadoutCardCarousel ar={ar} selectedId={settings.activePersonality} onSelect={name=>{const id=({'True Chad':'chad','Chill Soul':'chill','Cyberpunk':'cyberpunk','Sage':'sage'} as Record<string,string>)[name];if(id)void update({activePersonality:name,aiPersonality:id});}} items={[
        ['True Chad',ar?'واثق، مختصر، ومريح في التحدث.':'Confident, concise, and relaxed.'],
        ['Chill Soul',ar?'دافئ، صبور، وسهل الحديث.':'Warm, patient, and easy to talk to.'],
        ['Cyberpunk',ar?'حاد، مرح، ومباشر.':'Sharp, playful, and direct.'],
        ['Sage',ar?'متأنٍ، هادئ، وعميق التفكير.':'Thoughtful, calm, and thorough.'],
      ].map(([name,description])=>({id:name,title:soulLabel(name,ar),description,preview:<Smile size={62} color="var(--app-accent)"/>}))}/>}
      {slot==='voice'&&<><p role="status" className="inline-message">{voiceMessage}</p><LoadoutCardCarousel ar={ar} selectedId={activeVoice.name} onSelect={name=>{const voice=VOICES.find(value=>value.name===name);if(voice&&SUPPORTED_VOICES.has(name)){onSelectVoice(voice);void update({activeVoice:name});setVoiceMessage('');}}} items={VOICES.map(voice=>({id:voice.name,title:voice.name,description:voiceDescMap[voice.name]?.[ar?'ar':'en']||(ar?'صوت من مكتبة Gemini':voice.description),preview:<AudioLines size={65} color="var(--app-accent)"/>,disabled:!SUPPORTED_VOICES.has(voice.name),secondaryLabel:SUPPORTED_VOICES.has(voice.name)?(ar?'استماع':'Play'):undefined,onSecondary:()=>void previewVoice(voice.name)}))}/></>}
      {slot === 'abilities' && <div className="choice-list"><p role="status">{voiceMessage}</p>{[
        ['collapse', ar ? 'طي المساحة' : 'Collapse', ar ? 'المس الروح وهي مستقرة، ثم قم بطي مساحة النافذة.' : 'Touch the soul while it rests, then collapse space wherever you click.'],
        ['sidearm',ar?'النبضة':'Sidearm',ar?'نبضة ضوئية في المكان الذي تختاره.':'A light burst where you choose.'],
        ['aura',ar?'الهالة':'Aura',ar?'هالة جسيمات حول موضعك.':'A particle halo around your chosen point.'],
        ['circle', ar ? 'تحديد الشاشة والسؤال' : 'Circle to Ask', ar ? 'حدد جزءًا من الشاشة واسأل عنه.' : 'Circle something on your screen and ask.'],
        ['dictation', ar ? 'الإملاء الذكي' : 'Smart Dictation', ar ? 'تكلم، ثم أدرج النص المنقح.' : 'Speak, then insert the cleaned sentence.'],
        ['scheduled', ar ? 'الإجراءات المجدولة' : 'Scheduled Actions', ar ? 'حدد موعدًا لفتح موقع أو تطبيق أو روتين.' : 'Schedule a search, an app, or a routine.'],
      ].map(([id, name, description]) => <div className="ability-row" key={id}><button className={settings.activeAbility === id ? 'selected' : ''} disabled={['collapse','sidearm','aura'].includes(id)&&!inventory?.ownedAbilities?.includes(id)} onClick={() => void update({ activeAbility: id })}><span><b>{soulLabel(name,ar)}</b><small>{description}</small></span>{settings.activeAbility === id && <Check size={14} />}</button><button className="subtle-button" onClick={() => void runAbility(id)}>{ar ? 'فتح' : 'Open'}</button></div>)}</div>}
    </div>}
    <span className="loadout-save" role="status">{status === 'Saved' ? (ar ? 'محفوظ على هذا الجهاز' : 'Saved on this PC') : status === 'Saving…' ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : status}</span>
  </div>;
  return embedded ? content : <div className="companion-overlay"><div className="companion-modal">{content}</div></div>;
}
