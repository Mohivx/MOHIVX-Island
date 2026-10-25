import {NotificationSettingsPanel} from './NotificationSettingsPanel';
import {WallpaperSettingsPanel} from './WallpaperSettingsPanel';
import {TabOrderSettings} from './TabOrderDragSettings';
import {LiveConversation} from './LiveConversation';
import {MusicSettings} from './MusicSettings';
import {uiSound} from '../hooks/uiSounds';
import {CompanionPages,type CompanionPage} from './CompanionPages';
import {WindowControls} from './WindowControls';
import { THEMES, themeAccent,themeVariables } from '../themes';
import {GlassDock} from './GlassDock';
import { CustomizationSettings } from './CustomizationSettings';
import {IslandCustomizationPanel} from './IslandCustomizationPanel';
import { soulLabel } from '../labels';
import React, { useEffect, useState } from 'react';
import { Home, Link, Flame, Bot, Smartphone, Store, Route, Armchair, Settings, Search, X, Keyboard, SlidersHorizontal, Monitor, KeyRound, Database, Shield, Bell, Check, ExternalLink, Send, Mic, Volume2, FolderOpen, RefreshCw } from 'lucide-react';
import { useSettings, ipc } from '../hooks/useSettings';
import type { CompanionSettings } from '../hooks/useSettings';
import { CompanionCharacter } from './CompanionCharacter';
import { LoadoutHub } from './LoadoutHub';
import { ScheduledActions } from './ScheduledActions';
import { useRecording } from '../hooks/useRecording';
import { playVoice } from '../hooks/playVoice';
import { SOUL_SKINS, VOICES } from '../constants';
import './companion.css';
import './reference-settings.css';
import { ExtensionConnections, MicrophonePicker } from './CompanionExtras';
import {AgentPage} from './AgentPage';
import {PhoneHub} from './PhoneHub';

type Dock = CompanionPage|'agents'|'phone'|'bond' | 'desk' | 'home' | 'links' | 'soul' | 'store' | 'settings';
type Section = 'customization'|'permissions'|'hitodama' | 'shortcuts' | 'behavior' | 'system' | 'keys' | 'data' | 'notifications' | 'privacy';
const sections: { id: Section; name: string; ar: string; icon: React.ElementType }[] = [
  { id: 'hitodama', name: 'Hitodama', ar: 'هيتوداما', icon: Flame },
  {id:'customization',name:'Customization',ar:'التخصيص',icon:Monitor},
  { id: 'shortcuts', name: 'Shortcuts', ar: 'الاختصارات', icon: Keyboard },
  { id: 'behavior', name: 'Behavior', ar: 'السلوك', icon: SlidersHorizontal },
  { id: 'system', name: 'System', ar: 'النظام', icon: Monitor },
  { id: 'keys', name: 'API keys', ar: 'مفاتيح API', icon: KeyRound },
  { id: 'data', name: 'Your data', ar: 'بياناتك', icon: Database },
  { id: 'notifications', name: 'Notifications', ar: 'الإشعارات', icon: Bell },
  {id:'permissions',name:'Permissions',ar:'الصلاحيات',icon:Shield},
  { id: 'privacy', name: 'Privacy', ar: 'الخصوصية', icon: Shield },
];
const shortcutRows = [
  ['open-clipboard','Clipboard','الحافظة'], ['open-today','Today','اليوم'], ['open-controls','Controls','التحكم'], ['open-wallpaper','Wallpaper','الخلفيات'], ['open-power','Power','الطاقة'],
  ['toggle-main-window', 'Open companion', 'فتح الرفيق'], ['toggle-island', 'Expand / collapse island', 'توسيع / طي الجزيرة'],
  ['open-apps', 'Quick app search', 'بحث التطبيقات'], ['trigger-lasso', 'Circle to Ask', 'تحديد الشاشة والسؤال'],
  ['trigger-dictation', 'Smart Dictation', 'الإملاء الذكي'], ['ask-clipboard', 'Ask about clipboard', 'السؤال عن الحافظة'],
  ['trigger-scheduled', 'Scheduled Actions', 'الإجراءات المجدولة'], ['trigger-loadout', 'Soul loadout', 'تجهيز الروح'],
];
function Row({ title, detail, children }: { title: string; detail?: string; children: React.ReactNode }) {
  return <div className="setting-row"><div><b>{title}</b>{detail && <p>{detail}</p>}</div><div className="row-control">{children}</div></div>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} className="setting-toggle" data-on={checked} onClick={() => onChange(!checked)}><span /></button>;
}

function AppUpdateRows({ar,autoCheck,onAutoCheck}:{ar:boolean;autoCheck:boolean;onAutoCheck:(value:boolean)=>void}){
  const [status,setStatus]=useState<any>({state:'idle',supported:false,percent:0});
  const t=(en:string,a:string)=>ar?a:en;
  useEffect(()=>{
    if(!ipc)return;
    const receive=(_:unknown,value:any)=>setStatus(value||{state:'idle'});
    ipc.on('app-update-status',receive);
    ipc.invoke('get-app-update-status').then(setStatus).catch(()=>{});
    return()=>ipc.removeListener('app-update-status',receive);
  },[]);
  const check=async()=>{try{setStatus(await ipc?.invoke('check-app-update')||{state:'error'});}catch{setStatus({state:'error'});}};
  const install=async()=>{try{const result=await ipc?.invoke('install-app-update');if(result?.success)setStatus({state:'installing'});}catch{setStatus({state:'error'});}};
  const detail=({idle:t('Current version: ','الإصدار الحالي: ')+(status.currentVersion||'—'),unsupported:t('Automatic updates are available in the installed Windows app.','التحديث التلقائي متاح في نسخة Windows المثبتة.'),checking:t('Checking GitHub for an update…','جارٍ التحقق من التحديث على GitHub…'),available:t(`Update ${status.version||''} found. Downloading in the background…`,`وُجد التحديث ${status.version||''}. جارٍ تنزيله بالخلفية…`),downloading:`${t('Downloading update','جارٍ تنزيل التحديث')} · ${Math.round(status.percent||0)}%`,downloaded:t(`Update ${status.version||''} is ready. Choose when to restart and install.`,`التحديث ${status.version||''} جاهز. اختر متى تعيد التشغيل وتثبته.`),installing:t('MOHIVX Island is closing to install the update.','جارٍ إغلاق MOHIVX Island لتثبيت التحديث.'),'up-to-date':t('You have the latest version.','لديك أحدث إصدار.'),cancelled:t('Update download was cancelled. Check again to retry.','أُلغي تنزيل التحديث. تحقق مجددًا لإعادة المحاولة.'),error:t('Could not check for updates. Check your internet connection.','تعذر التحقق من التحديثات. تحقق من اتصال الإنترنت.') } as Record<string,string>)[status.state]||t('Ready to check for updates.','جاهز للتحقق من التحديثات.');
  return <>
    <Row title={t('App updates','تحديث التطبيق')} detail={detail}><button className="subtle-button" disabled={!status.supported||['checking','available','downloading','downloaded','installing'].includes(status.state)} onClick={()=>void check()}>{status.state==='checking'?t('Checking…','جارٍ التحقق…'):t('Check now','تحقق الآن')}</button></Row>
    {status.state==='downloading'&&<Row title={t('Download progress','تقدم التنزيل')}><progress aria-label={t('Update download progress','تقدم تنزيل التحديث')} max={100} value={status.percent||0}/></Row>}
    {status.state==='downloaded'&&<Row title={t('Restart to install','أعد التشغيل للتثبيت')} detail={t('You can keep working and restart later.','يمكنك متابعة العمل وإعادة التشغيل لاحقًا.')}><button className="subtle-button" onClick={()=>void install()}>{t('Restart and install','إعادة التشغيل والتثبيت')}</button></Row>}
    <Row title={t('Check automatically','التحقق تلقائيًا')} detail={t('Check on launch and periodically while MOHIVX is open.','تحقق عند التشغيل وبشكل دوري أثناء فتح MOHIVX.')}><Toggle label={t('Check automatically','التحقق تلقائيًا')} checked={autoCheck} onChange={onAutoCheck}/></Row>
  </>;
}
export const SettingsWindow: React.FC = () => {
  const { settings: s, update, status } = useSettings();
  const [dock, setDock] = useState<Dock>('settings');
  const [section, setSection] = useState<Section>('hitodama');
  const [search, setSearch] = useState('');
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState<string | null>(null);
  const [keyService, setKeyService] = useState<'geminiKey' | 'tavilyKey' | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [message, setMessage] = useState('');
  const [audio, setAudio] = useState<any>(null);
  const [hardware, setHardware] = useState<any>(null);
  const [prompt, setPrompt] = useState('');
  const [speaking,setSpeaking]=useState(false);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState('');
  const [conversation, setConversation] = useState<{ role: string; text: string }[]>([]);
  const [scheduled, setScheduled] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [maximized,setMaximized]=useState(false);
  const ar = s.appLang === 'ar';
  const text = (en: string, arabic: string) => ar ? arabic : en;
  const skin = SOUL_SKINS[s.activeSkin] || SOUL_SKINS.hitodama;
  const voice = VOICES.find(v => v.name === s.activeVoice) || VOICES[0];
  const title = sections.find(x => x.id === section);
  const searchTerms:Record<Section,string>={hitodama:'name location city language personality اسم موقع مدينة لغة شخصية',customization:'island size shape edge history wallpaper music animation theme tabs order جزيرة حجم شكل مكان سجل خلفيات موسيقى حركة ثيم ترتيب أقسام',shortcuts:'keyboard hotkey apps clipboard ctrl alt لوحة مفاتيح اختصار تطبيقات حافظة',behavior:'response voice browser monitor auto close سرعة استجابة صوت متصفح شاشة إغلاق تلقائي',system:'startup version audio input output microphone speaker بدء تشغيل إصدار صوت ميكروفون سماعة مكبر',keys:'gemini tavily api key search مفتاح مفاتيح بحث',data:'memory insights export calendar files ذاكرة ذكريات إحصاءات تصدير بيانات',notifications:'windows banners duration motion appearance alerts notification إشعارات اشعارات ويندوز بانرات مدة حركة شكل تنبيه',permissions:'permission location awareness microphone phone computer tools إذن إذونات صلاحية صلاحيات موقع مايك هاتف أدوات كمبيوتر',privacy:'delete clipboard local only cloud sensitive حذف حافظة محلي سحابة حساس خصوصية'};
  const foundSections=sections.filter(item=>`${item.name} ${item.ar} ${searchTerms[item.id]}`.normalize('NFKC').toLowerCase().includes(search.trim().normalize('NFKC').toLowerCase()));
  const save = (value: Partial<CompanionSettings>) => void update(value);
  const openExternal = (url: string) => ipc ? ipc.send('open-external-link', url) : window.open(url, '_blank', 'noopener,noreferrer');
  const close = () => { voiceInput.cancel(); if (ipc) ipc.send('close-settings-window'); else window.close(); };
  const tool = (id: string) => { if(id==='history')ipc?.send('open-chat-history'); else if (id === 'scheduled') setScheduled(true); else if (ipc) ipc.send('open-companion-tool', id); else setMessage(text('Open this tool in the Windows app.', 'افتح هذه الأداة في تطبيق ويندوز.')); };
  const voiceInput = useRecording(async audio => {
    if (!ipc) { setMessage(text('Voice conversation requires the Windows app.', 'المحادثة الصوتية تتطلب تطبيق ويندوز.')); return; }
    setBusy(true);
    try {
      const transcription = await ipc.invoke('ask-mohivx-ai', { audio, mode: 'dictation', usage:'conversation-transcription', prompt: 'Transcribe the spoken words only, preserving the language. Return an empty string if there is no speech.' });
      if (!transcription.success || !transcription.text) throw new Error(transcription.error || (ar ? 'لم يتم رصد أي صوت.' : 'No speech detected.'));
      const result = await ipc.invoke('execute-ai-prompt', { prompt: transcription.text, history: conversation.slice(-12) });
      setReply(result.reply || result.error || (ar ? 'لا يوجد رد.' : 'No answer.'));
      if (result.success) {
        setConversation(previous => [...previous, { role: 'user', text: transcription.text }, { role: 'assistant', text: result.reply }]);
        const speech = await ipc.invoke('preview-companion-voice', { voice: s.activeVoice, text: result.reply });
        if (speech.success) {setSpeaking(true);try{await playVoice(speech.audio,speech.mimeType);}finally{setSpeaking(false);}} else setMessage(speech.error || (ar ? 'الصوت غير متاح.' : 'Voice output unavailable.'));
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : (ar ? 'فشلت المحادثة الصوتية.' : 'Voice conversation failed.')); }
    finally { setBusy(false); }
  }, undefined);
  useEffect(() => { if (dock !== 'home') voiceInput.cancel(); }, [dock]);

  useEffect(() => {
    if (!ipc) return;
    ipc.invoke('get-app-version').then((v: string) => { if (v) setAppVersion(v); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!ipc) return;
    const navigate = (_: unknown, tab: Dock) => { if (['agents','phone','home','bond','desk','calendar','todo','snippets','memory','chat','insights','tools', 'links', 'soul', 'store', 'settings'].includes(tab)) setDock(tab); };
    ipc.on('hub-navigate', navigate);
    ipc.invoke('get-hub-tab').then((tab: Dock) => navigate(null, tab)).catch(() => {});
    return () => ipc.removeListener('hub-navigate', navigate);
  }, []);
  useEffect(() => {
    if (!ipc || dock !== 'settings') return;
    if (section === 'shortcuts') ipc.invoke('get-shortcuts').then(setShortcuts).catch(() => setMessage(text('Could not load shortcuts.','تعذر تحميل الاختصارات.')));
    if (section === 'system') {
      ipc.invoke('get-audio-state').then(setAudio).catch(() => {});
      ipc.invoke('get-real-telemetry').then(setHardware).catch(() => {});
    }
  }, [section, dock]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { if (keyService) setKeyService(null); else if (recording) setRecording(null); else close(); return; }
      if (!recording || ['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;
      event.preventDefault();
      const parts = [event.ctrlKey && 'Control', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Super', event.code === 'Space' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key].filter(Boolean);
      if (parts.length < 2) { setMessage(text('Use at least one modifier key.', 'استخدم مفتاح تعديل مع الاختصار.')); return; }
      if (ipc) ipc.invoke('update-shortcut', { action: recording, shortcut: parts.join('+') }).then((res: any) => {
        if (res.success) { setShortcuts(res.shortcuts); setRecording(null); setMessage(text('Shortcut saved.', 'تم حفظ الاختصار.')); }
        else setMessage(text('Shortcut is in use.','الاختصار مستخدم.'));
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recording, keyService, ar]);
  async function testKey() {
    if (!ipc || !s.geminiKey) return;
    setMessage(text('Testing connection…', 'جارٍ اختبار الاتصال…'));
    try { const res = await ipc.invoke('test-gemini-key', s.geminiKey); setMessage(res.message || res.error || (res.success ? text('Connected', 'متصل') : text('Connection failed', 'فشل الاتصال'))); }
    catch (e) { setMessage(String(e)); }
  }
  async function sendPrompt(event: React.FormEvent) {
    event.preventDefault(); if (!prompt.trim() || busy) return;
    if (!ipc) { setMessage(text('AI is available in the Windows app.', 'الذكاء الاصطناعي متاح في تطبيق ويندوز.')); return; }
    setBusy(true); setReply('');
    try { const result = await ipc.invoke('execute-ai-prompt', { prompt, history: conversation.slice(-12) }); setReply(result.reply || result.error || text('No response.', 'لا يوجد رد.')); if (result.success) setConversation(previous => [...previous, { role: 'user', text: prompt }, { role: 'assistant', text: result.reply }]); setPrompt(''); }
    catch (e) { setReply(String(e)); } finally { setBusy(false); }
  }

  return <div className="companion-app" style={themeVariables(s) as React.CSSProperties} dir={ar ? 'rtl' : 'ltr'} data-maximized={maximized} data-character={skin.id} data-settings-theme={s.settingsTheme} data-testid="companion-app">
    <header className="companion-titlebar" data-window-controls-side={s.windowControlsSide} onDoubleClick={()=>void ipc?.invoke('desktop-window-action','maximize')}><span><CompanionCharacter size={21} skin={skin} />MOHIVX Island</span><WindowControls ar={ar} onClose={close} onMaximizedChange={setMaximized}/></header>
    <div className="companion-body">
      {dock === 'settings' ? <>
        <aside className="companion-sidebar settings-layout-sidebar"><h2>{text('Settings', 'الإعدادات')}</h2><form role="search" onSubmit={event=>{event.preventDefault();if(foundSections[0]){setSection(foundSections[0].id);setMessage('');}}}><label className="settings-search"><Search size={16} /><input aria-label={text("Search settings","بحث الإعدادات")} placeholder={text('Search settings', 'بحث الإعدادات')} value={search} onChange={e => setSearch(e.target.value)} />{search&&<button type="button" aria-label={text('Clear settings search','مسح بحث الإعدادات')} onClick={()=>setSearch('')}><X size={14}/></button>}</label></form>
          <nav aria-label={text("Settings sections","أقسام الإعدادات")}>{foundSections.map(item => <button key={item.id} aria-current={section === item.id ? 'page' : undefined} onClick={() => { setSection(item.id); setMessage(''); }}><item.icon size={16} /><span>{ar ? item.ar : item.name}</span></button>)}</nav>
          {search && !foundSections.length && <p className="no-results" role="status">{text('No settings found.', 'لا توجد نتائج.')}</p>}
          <span className="settings-save" role="status">{status === 'Saving…' ? text('Saving…','جارٍ الحفظ…') : status === 'Saved' ? <><Check size={11} />{text('Saved on this PC', 'محفوظ على هذا الجهاز')}</> : status}</span>
        </aside>
        <main className="companion-page settings-layout-content" key={section}><h1>{ar ? title?.ar : title?.name}</h1>
          <p className="page-caption">{({customization:text('Where your island lives, and how it feels.','مكان الجزيرة وشكلها وحركتها.'),notifications:text('Choose how notices arrive in your island.','اختر طريقة وصول الإشعارات إلى الجزيرة.'),permissions:text('Choose what your companion may use.','اختر ما تسمح لرفيقك باستخدامه.'), hitodama: text('A small soul. A more useful desktop.', 'روح صغيرة، وسطح مكتب أكثر فائدة.'), shortcuts: text('Reach your companion from anywhere in Windows.', 'استدعِ رفيقك من أي مكان في ويندوز.'), behavior: text('Make it sound and act like your companion.', 'خصص طريقة استجابة رفيقك.'), system: text('How your companion runs on this PC.', 'إعدادات عمل الرفيق على هذا الجهاز.'), keys: text('Your Gemini key, and a free Tavily key for web search.', 'مفتاح Gemini ومفتاح Tavily للبحث على الويب.'), data: text('Your history stays on this PC.', 'سجلك محفوظ على هذا الجهاز.'), privacy: text('Choose what your companion can remember and send.', 'اختر ما يستطيع رفيقك حفظه وإرساله.') })[section]}</p>
          {section==='hitodama'&&<div className="settings-card"><Row title={text('What it calls you','بماذا يناديك')} detail={text('Your name, used by your companion.','اسمك الذي يستخدمه رفيقك.')}><input aria-label={text('Your name','اسمك')} className="city-input" maxLength={60} value={s.userName||''} onChange={e=>save({userName:e.target.value})}/></Row><Row title={text('Your location','موقعك')} detail={text('Set a city if the weather is wrong.','حدد مدينتك إذا كان الطقس غير صحيح.')}><input className="city-input" aria-label={text('Weather city','مدينة الطقس')} value={s.weatherCity||''} onChange={e=>save({weatherCity:e.target.value})}/></Row><Row title={text('Personality','الشخصية')}><button className="subtle-button" onClick={()=>setDock('soul')}>{soulLabel(s.activePersonality,ar)}</button></Row><Row title={text('Language','اللغة')}><select aria-label={text('Language','اللغة')} value={s.appLang} onChange={e=>save({appLang:e.target.value as 'ar'|'en'})}><option value="en">English</option><option value="ar">العربية</option></select></Row></div>}
          {section==='permissions'&&<div className="settings-card"><Row title={text('Advanced computer tools','أدوات الكمبيوتر المتقدمة')} detail={text('Commands and input control require approval for each action.','الأوامر والتحكم بالإدخال يتطلبان موافقتك على كل إجراء.')}><Toggle label={text('Advanced computer tools','أدوات الكمبيوتر المتقدمة')} checked={s.advancedMode} onChange={value=>save({advancedMode:value})}/></Row><CustomizationSettings mode="permissions"/><Row title={text('Voice tools','أدوات الصوت')} detail={text('Record only when you open a voice tool.','التسجيل يبدأ عند استخدام أداة صوتية فقط.')}><Toggle label={text('Voice tools','أدوات الصوت')} checked={s.voiceInputEnabled} onChange={value=>save({voiceInputEnabled:value})}/></Row><Row title={text('Phone permissions','صلاحيات الهاتف')} detail={text('Each paired phone has its own permissions.','لكل هاتف مقترن صلاحيات مستقلة.')}><button className="subtle-button" onClick={()=>setDock('phone')}>{text('Manage','إدارة')}</button></Row></div>}
          {section === 'customization' && <><IslandCustomizationPanel/><div className="settings-card"><Row title={text('Settings appearance','مظهر الإعدادات')} detail={text('Choose the current desktop look or a pure black surface.','اختر شكل الكمبيوتر الحالي أو واجهة سوداء بالكامل.')}><select aria-label={text('Settings appearance','مظهر الإعدادات')} value={s.settingsTheme} onChange={event=>save({settingsTheme:event.target.value as 'pc'|'black'})}><option value="pc">{text('Desktop style','شكل الكمبيوتر')}</option><option value="black">{text('Black','أسود')}</option></select></Row></div><MusicSettings settings={s} save={save} ar={ar}/><WallpaperSettingsPanel ar={ar}/><TabOrderSettings order={s.tabOrder} visible={s.visibleTabs} onChange={next=>save({tabOrder:next})} onVisibilityChange={next=>save({visibleTabs:next as typeof s.visibleTabs})} ar={ar}/><details className="settings-disclosure"><summary>{text('Themes, motion and tabs','الثيمات والحركة والتبويبات')}</summary>
            <div className="settings-section-label">{text('Island', 'الجزيرة')}</div>
            <Row title={text('Open island', 'فتح الجزيرة')} detail={text('Music, controls, plans, clipboard, apps and wallpapers.', 'الموسيقى والتحكم والخطط والحافظة والتطبيقات والخلفيات.')}><button className="subtle-button" onClick={() => ipc?.send('open-island-tab', 'controls')}>{text('Open', 'فتح')}</button></Row>
            <Row title={text('Language', 'اللغة')}><select aria-label={text("Language","اللغة")} value={s.appLang} onChange={e => save({ appLang: e.target.value as 'ar' | 'en' })}><option value="en">English</option><option value="ar">العربية</option></select></Row>
            <Row title={text('Theme','الثيم')}><div className="extras-actions">{THEMES.map(theme=><button key={theme.id} className="theme-swatch" title={ar?theme.ar:theme.name} aria-label={ar?theme.ar:theme.name} aria-pressed={s.theme===theme.id} style={{background:theme.color}} onClick={()=>save({theme:theme.id,customAccentColor:theme.color})}/>)}</div></Row><Row title={text('Accent', 'لون التمييز')} detail={text('Blue is the default. Choose a theme or your own accent.', 'الأزرق هو الأساسي. اختر ثيمًا أو لونًا خاصًا.')}><input aria-label={text("Accent color","لون التمييز")} type="color" value={themeAccent(s)} onChange={e => save({ customAccentColor: e.target.value, theme: 'custom' })} /></Row>
            <Row title={text('Animation', 'الحركة')}><select aria-label={text("Animation","الحركة")} value={s.animationSpeed} onChange={e => save({ animationSpeed: e.target.value as any })}><option value="smooth">{text('Smooth', 'سلسة')}</option><option value="fast">{text('Fast', 'سريعة')}</option><option value="instant">{text('Reduced motion', 'تقليل الحركة')}</option></select></Row>
            <div className="settings-section-label">{text('Tabs', 'التبويبات')}</div>
            <div className="tab-settings">{s.tabOrder.map(id => <label key={id}><input type="checkbox" checked={s.visibleTabs[id as keyof typeof s.visibleTabs] !== false} onChange={e => {
              if (!e.target.checked && Object.values(s.visibleTabs).filter(Boolean).length === 1) { setMessage(text('Keep at least one tab visible.', 'اترك تبويبًا واحدًا ظاهرًا على الأقل.')); return; }
              save({ visibleTabs: { ...s.visibleTabs, [id]: e.target.checked } });
            }} />{({ phone:text('Phone','الهاتف'),agents:text('Agents','الوكلاء'),ai: text('Soul', 'الروح'), controls: text('Controls', 'التحكم'), today: text('Today', 'اليوم'), stats: text('Stats', 'الإحصائيات'), clipboard: text('Clipboard', 'الحافظة'), apps: text('Apps', 'التطبيقات'), wallpaper: text('Wallpaper', 'الخلفية'), power: text('Power', 'الطاقة') })[id]}</label>)}</div>
            <Row title={text('Soul loadout', 'تجهيز الروح')} detail={`${soulLabel(skin.name,ar)} · ${soulLabel(s.activePersonality,ar)} · ${voice.name}`}><button className="subtle-button" onClick={() => setDock('soul')}>{text('Customize', 'تخصيص')}</button></Row>
          </details></>}
          {section === 'shortcuts' && <><div className="settings-section-label">{text('The island and its tools', 'الجزيرة وأدواتها')}</div><div className="settings-card">{shortcutRows.map(([id, en, arabic]) => <Row key={id} title={text(en, arabic)}><button className="shortcut-key" onClick={() => setRecording(recording === id ? null : id)}>{recording === id ? text('Press shortcut…', 'اضغط الاختصار…') : (shortcuts[id] || '—').replaceAll('Control', 'Ctrl').replaceAll('+', ' + ')}</button></Row>)}</div><p className="setting-help">{text('Click a shortcut to change it. Escape cancels. Use the screen selection shortcut above. Hold Ctrl + Win to dictate. Ctrl + Shift + Esc stays available for Task Manager.', 'اضغط الاختصار لتغييره، وEscape للإلغاء. استخدم اختصار تحديد الشاشة أعلاه، وCtrl + Win للإملاء. يبقى Ctrl + Shift + Esc لمدير المهام.')}</p><button className="subtle-button" onClick={() => ipc?.invoke('reset-shortcuts').then((res: any) => setShortcuts(res.shortcuts))}><RefreshCw size={12} />{text('Restore defaults', 'استعادة الافتراضيات')}</button></>}
          {section === 'notifications' && <NotificationSettingsPanel ar={ar}/>}
          {section === 'behavior' && <><div className="settings-card"><Row title={text('Notifications','الإشعارات')} detail={text('Appearance, duration and Windows banners.','الشكل والمدة وبانرات ويندوز.')}><button className="subtle-button" onClick={()=>setSection('notifications')}>{text('Manage','إدارة')}</button></Row></div><div className="settings-card"><Row title={text('Window buttons position','مكان أزرار النافذة')} detail={text('Choose which side holds minimize and maximize.','اختر جهة أزرار التصغير والتكبير.')}><select aria-label={text('Window buttons position','مكان أزرار النافذة')} value={s.windowControlsSide} onChange={event=>save({windowControlsSide:event.target.value as 'left'|'right'})}><option value="left">{text('Left','يسار')}</option><option value="right">{text('Right','يمين')}</option></select></Row></div><CustomizationSettings mode="behavior"/><details className="settings-disclosure"><summary>{text('Personality and response','الشخصية والاستجابة')}</summary><Row title={text('Character','الشخصية المرئية')} detail={text('Keep the original flame or choose the custom MOHIVX spirit.','احتفظ بالشعلة الأصلية أو اختر روح MOHIVX الخاصة.')}><select aria-label={text('Character','الشخصية المرئية')} value={s.mascotMode || 'original'} onChange={e=>save({mascotMode:e.target.value as any})}><option value="original">{text('Original','الأصلية')}</option><option value="custom">MOHIVX</option></select></Row>
            <Row title={text('Response length', 'طول الإجابة')}><select aria-label={text("Response length","طول الإجابة")} value={s.responseStyle} onChange={e => save({ responseStyle: e.target.value })}><option value="concise">{text('Concise', 'مختصرة')}</option><option value="balanced">{text('Balanced', 'متوازنة')}</option><option value="detailed">{text('Detailed', 'مفصلة')}</option></select></Row>
            <Row title={text('Personality', 'الشخصية')}><button className="subtle-button" onClick={() => setDock('soul')}>{soulLabel(s.activePersonality,ar)}</button></Row>
            <div className="settings-section-label">{text('Custom instructions', 'التعليمات المخصصة')}</div><textarea aria-label={text('Custom instructions','التعليمات المخصصة')} className="instructions-input" value={s.customDirectives} onChange={e => save({ customDirectives: e.target.value })} />
            <Row title={text('Voice input', 'الإدخال الصوتي')} detail={text('Microphone recording starts when you open a voice tool.', 'يبدأ تسجيل الميكروفون عند فتح أداة صوتية.')}><Toggle label={text("Voice input","الإدخال الصوتي")} checked={s.voiceInputEnabled} onChange={value => save({ voiceInputEnabled: value })} /></Row>
          </details></>}
          {section === 'system' && <><div className="settings-card">
            <Row title={text('Launch at sign-in', 'التشغيل مع تسجيل الدخول')} detail={text('Keep your companion ready when Windows starts.', 'يكون رفيقك جاهزًا عند بدء ويندوز.')}><Toggle label={text("Launch at sign-in","التشغيل مع تسجيل الدخول")} checked={s.runOnStartup} onChange={value => save({ runOnStartup: value })} /></Row>
            <MicrophonePicker/>
            <Row title={text('UI sounds','أصوات الواجهة')} detail={text('Soft feedback for navigation and rewards.','تنبيهات صوتية خفيفة للتنقل والمكافآت.')}><Toggle label={text('UI sounds','أصوات الواجهة')} checked={s.uiSounds} onChange={value=>save({uiSounds:value})}/></Row>
            <Row title={text('Sound volume','مستوى أصوات الواجهة')}><input aria-label={text('Sound volume','مستوى أصوات الواجهة')} type="range" min="0" max="40" value={Math.round((s.uiSoundVolume??.12)*100)} onChange={e=>save({uiSoundVolume:Number(e.target.value)/100})}/><button className="subtle-button" onClick={()=>uiSound('done',s)}>{text('Preview','معاينة')}</button></Row>
            <Row title={text('Ability volume','مستوى أصوات القدرات')}><input aria-label={text('Ability volume','مستوى أصوات القدرات')} type="range" min="0" max="40" value={Math.round((s.abilitySoundVolume??.16)*100)} onChange={e=>save({abilitySoundVolume:Number(e.target.value)/100})}/></Row>
            <Row title={text('Live voice model','نموذج المحادثة المباشرة')}><input aria-label={text('Live voice model','نموذج المحادثة المباشرة')} className="city-input" value={s.liveVoiceModel} onChange={e=>save({liveVoiceModel:e.target.value})}/></Row>
            <Row title={text('Output device', 'جهاز الإخراج')}><select aria-label={text("Output device","جهاز الإخراج")} value={audio?.defaultDeviceId || audio?.defaultDevice || 'default'} onChange={e => { ipc?.send('set-audio-device', e.target.value); save({ preferredAudioDevice: e.target.value }); }}><option value="default">{text('Windows default', 'افتراضي ويندوز')}</option>{audio?.devices?.map((device: any) => <option key={device.id || device} value={device.id || device}>{device.name || device}</option>)}</select></Row>
            <Row title={text('Version','الإصدار')} detail={text('Installed on this PC.','النسخة المثبتة على هذا الكمبيوتر.')}><span className="setting-value">{appVersion || '—'}</span></Row>
            <AppUpdateRows ar={ar} autoCheck={s.autoCheckUpdates!==false} onAutoCheck={value=>save({autoCheckUpdates:value})}/>
          </div><details className="settings-disclosure"><summary>{text('Advanced system settings','إعدادات النظام المتقدمة')}</summary><div className="settings-card">
            <Row title={text('Low power mode', 'توفير الطاقة')} detail={text('Poll system information less often.', 'تحديث بيانات النظام بوتيرة أقل.')}><Toggle label={text("Low power mode","توفير الطاقة")} checked={s.lowPowerMode} onChange={value => save({ lowPowerMode: value })} /></Row>
            <Row title={text('Output volume', 'مستوى الصوت')} detail={audio?.unavailable ? text('Audio unavailable', 'الصوت غير متاح') : audio ? `${audio.volume ?? 0}%` : text('Reading Windows audio…', 'جارٍ قراءة صوت ويندوز…')}><Volume2 size={15} /><input aria-label={text("Output volume","مستوى الصوت")} type="range" min="0" max="100" disabled={!audio || audio.unavailable} value={audio?.volume ?? 0} onChange={e => { const value = Number(e.target.value); setAudio({ ...audio, volume: value }); ipc?.send('volume-control', { action: 'set', value }); }} /></Row>
          </div><div className="diagnostic-lines"><p>{hardware?.cpu?.model || '—'}</p><p>{hardware?.gpu?.model || hardware?.gpu?.name || '—'}</p><p>{hardware?.ram?.used || '—'}</p></div></details></>}
          {section === 'keys' && <>
            <div className="settings-section-label">Gemini</div><div className="settings-card">
              <Row title={text('Gemini API key','مفتاح Gemini API')} detail={text('Stored encrypted on this PC, never shown again once saved.','يُحفظ مشفرًا على هذا الكمبيوتر ولا يظهر كاملًا بعد الحفظ.')}><button className="subtle-button" onClick={()=>{setKeyInput('');setKeyService('geminiKey');}}>{s.geminiKey?text('Change','تغيير'):text('Add key','إضافة مفتاح')}</button></Row>
              <Row title={s.geminiKey?text('Forget my API key','نسيان مفتاحي'):text('Get a Gemini key','الحصول على مفتاح Gemini')} detail={s.geminiKey?text('Erases your Gemini key from this PC.','يمسح مفتاح Gemini من هذا الكمبيوتر.'):text('Create your own key in Google AI Studio.','أنشئ مفتاحك في Google AI Studio.')}><button className="subtle-button" onClick={()=>s.geminiKey?save({geminiKey:''}):openExternal('https://aistudio.google.com/api-keys')}>{s.geminiKey?text('Forget…','نسيان…'):text('Get one','الحصول عليه')}</button>{s.geminiKey&&<button className="subtle-button" onClick={()=>void testKey()}>{text('Test','اختبار')}</button>}</Row>
            </div>
            <div className="settings-section-label">{text('Web search','البحث على الويب')}</div><div className="settings-card">
              <Row title={text('Tavily API key','مفتاح Tavily API')} detail={s.tavilyKey?text('Key saved · used only when you ask for research.','المفتاح محفوظ · يُستخدم عند طلب البحث فقط.'):text('Optional key for web research.','مفتاح اختياري للبحث على الويب.')}><button className="subtle-button" onClick={()=>{setKeyInput('');setKeyService('tavilyKey');}}>{s.tavilyKey?text('Change','تغيير'):text('Add key','إضافة مفتاح')}</button>{s.tavilyKey&&<button className="subtle-button" onClick={()=>save({tavilyKey:''})}>{text('Remove','إزالة')}</button>}</Row>
              <Row title={text('Get a Tavily key','الحصول على مفتاح Tavily')} detail={text('Sign up, copy the key, then paste it above.','أنشئ حسابًا وانسخ المفتاح ثم الصقه أعلاه.')}><button className="subtle-button" onClick={()=>openExternal('https://app.tavily.com')}>{text('Get one','الحصول عليه')}<ExternalLink size={11}/></button></Row>
              <div className="settings-information"><b>{text('What it sends','ما الذي يُرسل')}</b><p>{text('Your research question goes to Tavily under your account. Avoid including passwords or private details.','يُرسل سؤال البحث إلى Tavily بحسابك. تجنب تضمين كلمات المرور والتفاصيل الخاصة.')}</p></div>
            </div>
          </>}
          {section === 'data' && <><CustomizationSettings mode="data"/><div className="settings-card"><Row title={text('Insights','الإحصاءات')} detail={text('Your actual activity and progress.','نشاطك الفعلي وتقدمك.')}><button className="subtle-button" onClick={()=>setDock('insights')}>{text('Open','فتح')}</button></Row></div><div className="settings-card"><Row title={text('Memory','الذاكرة')} detail={text('Facts and ongoing topics you choose to save.','حقائق ومواضيع تختار حفظها.')}><button className="subtle-button" onClick={()=>setDock('memory')}>{text('Open','فتح')}</button></Row><Row title={text('Chat history','سجل المحادثة')}><button className="subtle-button" onClick={()=>ipc?.send('open-chat-history')}>{text('Open','فتح')}</button></Row></div><details className="settings-disclosure"><summary>{text('Storage and export','الحفظ والتصدير')}</summary>
            <Row title={text('Clipboard history', 'سجل الحافظة')} detail={text('Maximum number of captured items.', 'الحد الأقصى للعناصر المحفوظة.')}><select aria-label={text('Clipboard limit','حد الحافظة')} value={s.clipboardMaxItems} onChange={e => save({ clipboardMaxItems: Number(e.target.value) })}>{[20, 50, 100].map(n => <option key={n}>{n}</option>)}</select></Row>
            <Row title={text('Keep clipboard after restart', 'حفظ الحافظة بعد إعادة التشغيل')}><Toggle label="Persist clipboard" checked={s.clipboardPersist} onChange={value => save({ clipboardPersist: value })} /></Row>
            <Row title={text('Export preferences', 'تصدير التفضيلات')} detail={text('API keys and clipboard contents are excluded.', 'لا يتضمن المفاتيح أو محتوى الحافظة.')}><button className="subtle-button" onClick={async () => { const res = await ipc?.invoke('export-preferences'); if (res?.success) setMessage(text('Preferences exported.', 'تم تصدير التفضيلات.')); }}>{text('Export', 'تصدير')}</button></Row>
            <Row title={text('Wallpaper folder', 'مجلد الخلفيات')} detail={s.wallpaperFolder || text('Built-in wallpapers', 'الخلفيات المدمجة')}><button className="subtle-button" onClick={async () => { const res = await ipc?.invoke('select-wallpaper-folder'); if (res?.folderPath) save({ wallpaperFolder: res.folderPath }); }}><FolderOpen size={13} />{text('Choose', 'اختيار')}</button></Row>
          </details></>}
          {section === 'privacy' && <><div className="settings-card"><Row title={text('Delete all my data','حذف كل بياناتي')} detail={text('Settings, memories, conversations, tasks, API keys and paired devices — then MOHIVX closes.','الإعدادات والذكريات والمحادثات والمهام والمفاتيح والأجهزة المقترنة، ثم يُغلق MOHIVX.')}><button className="subtle-button destructive-action" onClick={()=>void ipc?.invoke('delete-personal-data')}>{text('Delete…','حذف…')}</button></Row></div>
            <Row title={text('Local-only mode', 'الوضع المحلي فقط')} detail={text('Blocks cloud AI, transcription, vision and research requests.', 'يمنع إرسال طلبات الذكاء الاصطناعي والصوت والصور والبحث إلى السحابة.')}><Toggle label={text("Local-only mode","الوضع المحلي")} checked={s.localOnlyMode} onChange={value => save({ localOnlyMode: value })} /></Row>
            <Row title={text('Filter sensitive clipboard text', 'تصفية النصوص الحساسة من الحافظة')} detail={text('Skips text resembling passwords, private keys, or API tokens.', 'يتجاهل النصوص التي تشبه كلمات المرور والمفاتيح والرموز السرية.')}><Toggle label={text("Filter sensitive clipboard","تصفية الحافظة الحساسة")} checked={s.clipboardFilterSensitive} onChange={value => save({ clipboardFilterSensitive: value })} /></Row>
            <Row title={text('Clear clipboard on exit', 'مسح الحافظة عند الخروج')}><Toggle label={text("Clear history on exit","مسح السجل عند الخروج")} checked={s.clearHistoryOnExit} onChange={value => save({ clearHistoryOnExit: value })} /></Row>
            <p className="setting-help">{text('Voice and screen tools send only the recording or selected region to Google when you use them. Local-only mode blocks these requests. Android and managed Hermes sessions can be enabled in Connections.', 'ترسل أدوات الصوت والشاشة التسجيل أو الجزء المحدد إلى Google عند استخدامها. يمنع الوضع المحلي هذه الطلبات. يمكن تفعيل أندرويد وجلسات Hermes المُدارة من الاتصالات.')}</p>
          </>}
        </main>
      </> : dock==='agents'?<main className="companion-fullpage"><AgentPage/></main>:dock==='phone'?<main className="companion-fullpage"><PhoneHub/></main>: dock === 'soul' ? <main className="companion-fullpage"><LoadoutHub embedded isOpen onClose={() => setDock('home')} activeSkin={skin} activeVoice={voice} onSelectSkin={value => save({ activeSkin: value.id })} onSelectVoice={value => save({ activeVoice: value.name })} onTriggerAbility={tool} /></main>
      : ['home','bond','desk','calendar','todo','snippets','memory','chat','insights','store','tools'].includes(dock) ? <main className="companion-fullpage reference-fullpage"><CompanionPages key={dock} page={dock as CompanionPage} onNavigate={setDock} onTool={tool}/>{dock==='home'&&<LiveConversation/>}{dock==='home'&&<details className="settings-disclosure home-conversation"><summary>{text('Voice conversation','المحادثة الصوتية')}</summary><div className="home-voice-panel"><CompanionCharacter size={65} skin={skin} state={speaking?'speaking':busy?'thinking':'idle'}/>{reply&&<p className="home-reply" dir="auto">{reply}</p>}<form className="companion-prompt" onSubmit={sendPrompt}><input aria-label={text('Ask your companion','اسأل رفيقك')} placeholder={text('Ask your companion…','اسأل رفيقك…')} value={prompt} onChange={e=>setPrompt(e.target.value)}/><button type="button" disabled={busy||!s.voiceInputEnabled} aria-label={text('Talk to your companion','تحدث مع رفيقك')} onClick={()=>voiceInput.recording?voiceInput.stop():void voiceInput.start()}><Mic size={16}/></button><button type="submit" disabled={busy||!prompt.trim()} aria-label={text('Send prompt','إرسال الطلب')}><Send size={16}/></button></form>{voiceInput.recording&&<p>{text('Listening… choose the microphone to finish.','جارٍ الاستماع… اضغط الميكروفون للإنهاء.')}</p>}{voiceInput.error&&<p role="alert">{voiceInput.error}</p>}</div></details>}</main>
      : dock === 'links' ? <main className="companion-fullpage connections-page"><h1>{text('Connections', 'الاتصالات')}</h1><p className="page-caption">{text('The services behind your companion.', 'الخدمات التي يعتمد عليها رفيقك.')}</p>{[['Gemini', s.geminiKey, text('Conversation · Vision · Dictation', 'المحادثة · الرؤية · الإملاء')], ['Tavily', s.tavilyKey, text('Web research', 'البحث على الويب')]].map(([name, key, detail]) => <Row key={name} title={name} detail={detail}><span className="connection-state" data-connected={Boolean(key)}>{key ? text('Key saved', 'المفتاح محفوظ') : text('Not connected', 'غير متصل')}</span><button className="subtle-button" onClick={() => { setSection('keys'); setDock('settings'); }}>{text('Manage', 'إدارة')}</button></Row>)}<ExtensionConnections/></main>
      : <main className="companion-fullpage"><h1>{text('Souls', 'الأرواح')}</h1><p className="page-caption">{text('Choose the flame that feels like yours.', 'اختر الروح التي تشبهك.')}</p><div className="soul-store">{Object.values(SOUL_SKINS).map(value => <button key={value.id} className={skin.id === value.id ? 'selected' : ''} onClick={() => save({ activeSkin: value.id })}><CompanionCharacter size={80} skin={value} /><h3>{soulLabel(value.name,ar)}</h3><small>{soulLabel(value.rarity,ar)}</small><p>{soulLabel(value.blurb,ar)}</p>{skin.id === value.id && <Check size={14} />}</button>)}</div></main>}
    </div>
    <GlassDock ar={ar} active={dock} onSelect={id=>{uiSound('tap',s);setDock(id as Dock);setMessage('');}} items={([
      ['home', Home, text('Home', 'الرئيسية')],['bond',Route,text('Bond','الرابطة')],['desk',Armchair,text('Desk','المكتب')],['agents',Bot,text('Agents','الوكلاء')],['phone',Smartphone,text('Phone','الهاتف')], ['links', Link, text('Connections', 'الاتصالات')], ['soul', Flame, text('Soul', 'الروح')], ['store', Store, text('Store', 'المتجر')], ['settings', Settings, text('Settings', 'الإعدادات')],
    ] as const).map(([id,icon,label])=>({id,icon,label}))}/>
    {message && <div className="companion-message" role="status"><span>{message}</span><button aria-label={text("Dismiss message","إخفاء الرسالة")} onClick={() => setMessage('')}><X size={12} /></button></div>}
    {keyService && <div className="companion-overlay"><form className="key-dialog" onSubmit={async e => { e.preventDefault(); if (keyInput.trim()) { if (await update({ [keyService]: keyInput.trim() })) { setKeyService(null); setKeyInput(''); } } }}><h2>{keyService === 'geminiKey' ? text('Connect Gemini', 'ربط Gemini') : text('Connect Tavily', 'ربط Tavily')}</h2><p>{text('Paste your own API key. It is stored on this PC.', 'الصق مفتاحك. سيُحفظ على هذا الجهاز.')}</p><input autoFocus aria-label={text("API key","مفتاح API")} type="password" autoComplete="off" value={keyInput} onChange={e => setKeyInput(e.target.value)} /><div><button type="button" className="subtle-button" onClick={() => setKeyService(null)}>{text('Cancel', 'إلغاء')}</button><button type="submit" className="primary-button" disabled={!keyInput.trim()}>{text('Save and connect', 'حفظ واتصال')}</button></div></form></div>}
    <ScheduledActions isOpen={scheduled} onClose={() => setScheduled(false)} />
  </div>;
};

export default SettingsWindow;
