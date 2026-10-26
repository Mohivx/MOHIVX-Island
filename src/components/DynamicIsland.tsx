import { AutoCollapse, COLLAPSED_SHAPES, collapsedSize, islandEdge, animationDuration, surfaceViewport, sectionHeightLimit, containsSurfacePoint, musicLayout, musicActivity } from '../hooks/islandSurface.mjs';
import {useIslandNotices} from '../hooks/useIslandNotices';
import {mergeAppEntries} from '../../electron/services/appEntries.mjs';
import {IslandNotificationCard} from './IslandNotificationCard';
import {useIslandKeyboard} from '../hooks/useIslandKeyboard';
import {MusicDecorations} from './MusicDecorations';
import { WallpaperQueue } from '../hooks/wallpaperQueue.mjs';
import { themeAccent,skinThemePatch,islandThemeFill,themeVariables } from '../themes';
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import {
  Wifi,
  Bluetooth,
  Volume2,
  VolumeX,
  Moon,
  Sun,
  ChevronDown,
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Search,
  Check,
  Star,
  Folder,
  Lock,
  RotateCcw,
  Power,
  PowerOff,
  Pin,
  Settings,
  Trash2,
  Copy,
  Loader2,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Mic,
  Bot,
  Zap,
  Send,
  Network,
  ClipboardList,
  Clock
} from 'lucide-react';
import confetti from 'canvas-confetti';
import type { SoulMode, SoulSkin, WallpaperItem } from '../types';
import { CompanionCharacter } from './CompanionCharacter';
import { AgentPanel } from './AgentPanel';
import {PhoneDashboard} from './PhoneDashboard';
import { MusicGlance, MusicCover } from './MusicGlance';
import {useOutputAudio} from '../hooks/useOutputAudio';
import { normalizeSettings } from '../hooks/useSettings';
import './companion.css';
import { CircleToAsk } from './CircleToAsk';
import { DictationModal } from './DictationModal';
import { LoadoutHub } from './LoadoutHub';
import { ScheduledActions } from './ScheduledActions';
import { type MohivxSettings, DEFAULT_MOHIVX_SETTINGS } from '../types/settings';
import { SOUL_SKINS, VOICES } from '../constants';

const isElectron = typeof window !== 'undefined' && Boolean((window as unknown as { require?: unknown }).require);
const electron = isElectron ? (window as unknown as { require: (mod: string) => typeof import('electron') }).require('electron') : null;

interface DynamicIslandProps {
  mode: SoulMode;
  skin: SoulSkin;
  onModeChange: (newMode: SoulMode) => void;
  currentWallpaper: WallpaperItem;
  onWallpaperSelect: (wp: WallpaperItem) => void;
}

type IslandStage = 'collapsed' | 'compact-media' | 'drawer';
type TabType = 'phone' | 'agents' | 'ai' | 'controls' | 'today' | 'stats' | 'clipboard' | 'apps' | 'wallpaper' | 'power';

const TAB_WIDTHS: Record<TabType, number> = {
  phone: 750,
  agents: 750,
  ai: 750,
  power: 700,
  wallpaper: 750,
  controls: 740,
  today: 740,
  stats: 750,
  clipboard: 740,
  apps: 740,
};

interface ClipboardItem {
  id: string;
  group: 'PINNED' | 'TODAY';
  type: string;
  icon?: string;
  title: string;
  fullText: string;
  image?: string;
  size: string;
  time: string;
  isPinned?: boolean;
}

interface AppItem {
  name: string;
  path?: string;
  target?: string;
  args?: string;
  appId?: string;
  icon?: string;
  iconRevision?: number;
  letter: string;
  type: string;
  isOpen?: boolean;
  isStarred?: boolean;
  isCustom?: boolean;
}

export const DynamicIsland: React.FC<DynamicIslandProps> = ({
  skin,
  currentWallpaper,
  onWallpaperSelect
}) => {
  // Island expansion stage
  const [islandStage, setIslandStage] = useState<IslandStage>('collapsed');
  const [activeTab, setActiveTab] = useState<TabType>('controls');
  const [tabDirection, setTabDirection] = useState<'right' | 'left' | 'fade'>('fade');
  const [isLightMode, setIsLightMode] = useState(false);
  const [appLang, setAppLang] = useState<'en' | 'ar'>(() => {
    try {
      return (localStorage.getItem('hitodama_lang') as 'en' | 'ar') || 'en';
    } catch(e) { return 'en'; }
  });

  // Comprehensive settings state
  const [appSettings, setAppSettings] = useState<MohivxSettings>(() => {
    try {
      const local = localStorage.getItem('mohivx_settings');
      if (local) return normalizeSettings(JSON.parse(local));
    } catch (e) {}
    return DEFAULT_MOHIVX_SETTINGS;
  });
  const selectDefaultTab = () => {
    const candidates = new Set<TabType>(['phone','agents','ai','controls','today','stats','clipboard','apps','wallpaper','power']);
    const preferred = appSettings.defaultTab as TabType;
    if (candidates.has(preferred) && appSettings.visibleTabs?.[preferred] !== false) return preferred;
    return (appSettings.tabOrder.find(id => candidates.has(id as TabType) && appSettings.visibleTabs?.[id as TabType] !== false) as TabType) || 'controls';
  };

  const actionCardPreference=useRef(appSettings.showActionCards);actionCardPreference.current=appSettings.showActionCards;
  const agentRequestPreference=useRef(appSettings.agentShowRequests);agentRequestPreference.current=appSettings.agentShowRequests;
  // Productivity Superpowers modal states
  const [showCircleToAsk, setShowCircleToAsk] = useState(false);
  const [showDictation, setShowDictation] = useState(false);
  const [showScheduled, setShowScheduled] = useState(false);
  const [showLoadout, setShowLoadout] = useState(false);
  const [notchNotification, setNotchNotification] = useState<string | null>(null);
  const [agentGlance,setAgentGlance] = useState({waiting:0,status:'idle'});
  const lastAgentRequest = useRef('');
  const toolsOpenRef = useRef(false);toolsOpenRef.current=showCircleToAsk||showDictation||showScheduled||showLoadout;

  // Active soul loadout state
  const [activeSoulSkin, setActiveSoulSkin] = useState<SoulSkin>(skin || SOUL_SKINS.hitodama);
  const [activeVoice, setActiveVoice] = useState(VOICES[0]);

  const showNotchFeedback = (msg: string) => {
    if(actionCardPreference.current===false)return;
    setNotchNotification(msg);
    setTimeout(() => {
      setNotchNotification(null);
    }, 4500);
  };

  useEffect(() => {
    const handleStorage = () => {
      try {
        const current = (localStorage.getItem('hitodama_lang') as 'en' | 'ar') || 'en';
        setAppLang(current);
        const savedSettings = localStorage.getItem('mohivx_settings');
        if (savedSettings) {
          setAppSettings(normalizeSettings(JSON.parse(savedSettings)));
        }
      } catch(e) {}
    };
    window.addEventListener('mohivx-settings-changed', handleStorage);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('hitodama-lang-changed', handleStorage);

    // Sync from Electron settings file on disk
    if (electron && electron.ipcRenderer) {
      electron.ipcRenderer.invoke('get-app-settings').then((settings: any) => {
        if (settings) {
          setAppSettings(prev => normalizeSettings({ ...prev, ...settings }));
          if (settings.appLang) {
            setAppLang(settings.appLang);
            try { localStorage.setItem('hitodama_lang', settings.appLang); } catch(e) {}
          }
        }
      });

      const handleSettingsUpdated = (_: any, newSettings: any) => {
        if (newSettings) {
          setAppSettings(prev => normalizeSettings({ ...prev, ...newSettings }));
          if (newSettings.appLang) {
            setAppLang(newSettings.appLang);
            try { localStorage.setItem('hitodama_lang', newSettings.appLang); } catch(e) {}
          }
        }
      };
      electron.ipcRenderer.on('app-settings-updated', handleSettingsUpdated);

      // Listen to shortcuts and events from electron
      const handleLasso = () => setShowCircleToAsk(true);
      const handleDictation = () => { if (document.querySelector('.dictation-pill')) window.dispatchEvent(new Event('finish-dictation')); else setShowDictation(true); };
      const handleScheduled = () => setShowScheduled(true);
      const handleLoadout = () => { electron.ipcRenderer.send('open-hub-tab', 'soul'); };

      electron.ipcRenderer.on('trigger-lasso', handleLasso);
      electron.ipcRenderer.on('trigger-dictation', handleDictation);
      electron.ipcRenderer.on('trigger-scheduled', handleScheduled);
      electron.ipcRenderer.on('trigger-loadout', handleLoadout);
      const scheduledResult = (_: unknown, item: any) => {const ar=localStorage.getItem('hitodama_lang')==='ar';showNotchFeedback(`${item.status==='failed'?(ar?'فشل الإجراء':'Action failed'):(ar?'اكتمل الإجراء':'Action completed')}: ${item.title}`);};
      electron.ipcRenderer.on('scheduled-action-triggered', scheduledResult);
      const launchFailed = (_: unknown, message: string) => {
        setNotchNotification(message);
        setTimeout(() => setNotchNotification(null), 4500);
      };
      electron.ipcRenderer.on('app-launch-failed', launchFailed);
      const openTab = (_: unknown, tab: TabType) => { if (['phone','agents','controls', 'today', 'stats', 'clipboard', 'apps', 'wallpaper', 'power', 'ai'].includes(tab)) { setActiveTab(tab); transitionToStage('drawer'); } };
      electron.ipcRenderer.on('open-island-tab', openTab);
      const collapse=()=>transitionToStage('collapsed');electron.ipcRenderer.on('collapse-island',collapse);

      return () => {
        window.removeEventListener('mohivx-settings-changed', handleStorage);
        window.removeEventListener('storage', handleStorage);
        window.removeEventListener('hitodama-lang-changed', handleStorage);
        electron.ipcRenderer.removeListener('app-settings-updated', handleSettingsUpdated);
        electron.ipcRenderer.removeListener('app-launch-failed', launchFailed);
        electron.ipcRenderer.removeListener('trigger-lasso', handleLasso);
        electron.ipcRenderer.removeListener('trigger-dictation', handleDictation);
        electron.ipcRenderer.removeListener('trigger-scheduled', handleScheduled);
        electron.ipcRenderer.removeListener('trigger-loadout', handleLoadout);
        electron.ipcRenderer.removeListener('scheduled-action-triggered', scheduledResult);
        electron.ipcRenderer.removeListener('open-island-tab', openTab);
        electron.ipcRenderer.removeListener('collapse-island',collapse);
      };
    }

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('hitodama-lang-changed', handleStorage);
    };
  }, []);

  useEffect(() => {
    const saved = appSettings as any;
    setActiveSoulSkin(SOUL_SKINS[saved.activeSkin] || SOUL_SKINS.hitodama);
    setActiveVoice(VOICES.find(v => v.name === saved.activeVoice) || VOICES[0]);
  }, [appSettings]);

  useEffect(() => {
    if (showCircleToAsk || showDictation || showScheduled || showLoadout) {
      autoCollapse.current?.cancel();
      electron?.ipcRenderer.send('set-ignore-mouse-events', false);
      electron?.ipcRenderer.send('set-window-mode', showDictation && !showCircleToAsk && !showScheduled && !showLoadout ? 'dictation' : 'fullscreen');
    }
  }, [showCircleToAsk, showDictation, showScheduled, showLoadout]);

  // ==========================================
  // HITODAMA AI AGENT STATES & HANDLERS
  // ==========================================
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [aiStatusMessage, setAiStatusMessage] = useState<string>('');
  const aiWelcome = appLang === 'ar'
    ? 'مرحباً بك! أنا MOHIVX، روح جهازك ومساعدك الذكي. اطلب مني فتح تطبيق، أو البحث، أو اسألني أي سؤال.'
    : 'Hello! I am MOHIVX, your desktop companion. Ask me to open an app, search, or answer a question.';
  const [aiChatMessages, setAiChatMessages] = useState<Array<{
    role: 'user' | 'assistant';
    text: string;
    toolUsed?: string;
    time: string;
  }>>(() => [
    {
      role: 'assistant',
      text: aiWelcome,
      time: 'now'
    }
  ]);
  const aiChatScrollRef = useRef<HTMLDivElement>(null);
  const aiCompletedRequests = useRef(new Set<string>());
  useEffect(()=>{let active=true;
    const reset=()=>setAiChatMessages([{role:'assistant',text:localStorage.getItem('hitodama_lang')==='ar'?'مرحباً بك! أنا MOHIVX، روح جهازك ومساعدك الذكي.':aiWelcome,time:'now'}]);
    const load=()=>electron?.ipcRenderer.invoke('workspace-get').then((state:any)=>{if(active&&state?.chat?.length){for(const m of state.chat)if(m.role==='assistant'&&m.requestId)aiCompletedRequests.current.add(m.requestId);setAiChatMessages(state.chat.map((m:any)=>({role:m.role,text:m.text,toolUsed:m.tools?.join(', '),time:new Date(m.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})})));}}).catch(()=>{});
    load();electron?.ipcRenderer.on('companion-data-updated',load);electron?.ipcRenderer.on('chat-history-cleared',reset);
    return()=>{active=false;electron?.ipcRenderer.removeListener('companion-data-updated',load);electron?.ipcRenderer.removeListener('chat-history-cleared',reset);};
  },[]);
  useEffect(() => {
    // Native preferences arrive after the first render. Translate the welcome
    // message too, without replacing any actual conversation messages.
    setAiChatMessages(messages => messages[0]?.time === 'now'
      ? [{...messages[0],text:aiWelcome},...messages.slice(1)] : messages);
  }, [aiWelcome]);

  const aiPendingRequest = useRef<string | null>(null);
  const appendAiReply = (result: any, requestId: string) => {
    if (!requestId || result?.historyCleared || aiCompletedRequests.current.has(requestId)) return;
    aiCompletedRequests.current.add(requestId);
    if (aiCompletedRequests.current.size > 1000) aiCompletedRequests.current.delete(aiCompletedRequests.current.values().next().value!);
    const reply = result?.reply || result?.error;
    if (!reply) return;
    setAiChatMessages(previous => [...previous, {
      role: 'assistant', text: reply,
      toolUsed: result.toolsExecuted?.map((tool: any) => tool.tool).join(', ') || undefined,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);
  };

  useEffect(() => {
    if (aiChatScrollRef.current) {
      aiChatScrollRef.current.scrollTop = aiChatScrollRef.current.scrollHeight;
    }
  }, [aiChatMessages, isAiThinking]);

  useEffect(() => {
    if (electron && electron.ipcRenderer) {
      const handleAiStatus = (_: any, data: any) => {
        if (data.status === 'thinking') {
          setIsAiThinking(true);
          setAiStatusMessage(appLang === 'ar' ? 'MOHIVX يفكر ويتخذ القرار...' : 'MOHIVX is thinking...');
        } else if (data.status === 'idle') {
          setIsAiThinking(false);
          setAiStatusMessage('');
          if (data.result && data.requestId) appendAiReply(data.result, data.requestId);
        }
      };
      electron.ipcRenderer.on('ai-status-change', handleAiStatus);
      return () => {
        electron.ipcRenderer.removeListener('ai-status-change', handleAiStatus);
      };
    }
  }, [appLang]);

  const handleSendAiPrompt = async (customText?: string) => {
    const textToSend = (customText || aiPrompt).trim();
    if (!textToSend || isAiThinking || aiPendingRequest.current) return;
    const requestId = crypto.randomUUID();
    aiPendingRequest.current = requestId;

    setAiPrompt('');
    const userMsg = {
      role: 'user' as const,
      text: textToSend,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setAiChatMessages(prev => [...prev, userMsg]);
    setIsAiThinking(true);
    setAiStatusMessage(appLang === 'ar' ? 'جاري المعالجة...' : 'Processing...');

    try {
      if (electron && electron.ipcRenderer) {
        const history = aiChatMessages.map(m => ({ role: m.role, text: m.text }));
        const res = await electron.ipcRenderer.invoke('execute-ai-prompt', {
          prompt: textToSend,
          requestId,
          history
        });
        if (res) appendAiReply(res, res.requestId || requestId);
      }
    } catch (e: any) {
      setAiChatMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: `Error: ${e.message}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      aiPendingRequest.current = null;
      setIsAiThinking(false);
      setAiStatusMessage('');
    }
  };

  const handleTestGhostCursor = () => {
    if (electron && electron.ipcRenderer) {
      electron.ipcRenderer.send('trigger-ghost-cursor', {
        label: appLang === 'ar' ? 'مؤشر MOHIVX الذكي ✨' : 'MOHIVX Ghost Cursor ✨'
      });
    }
  };

  const shellRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [clockNow,setClockNow]=useState(()=>new Date());
  useEffect(()=>{if(!appSettings.clockWhileAsleep)return;const timer=window.setInterval(()=>setClockNow(new Date()),30000);return()=>window.clearInterval(timer);},[appSettings.clockWhileAsleep]);
  const asleepClockLabel=new Intl.DateTimeFormat(appLang==='ar'?'ar-SA':'en-US',{hour:'2-digit',minute:'2-digit'}).format(clockNow);
  const drawerRef = useRef<HTMLDivElement>(null);
  const [drawerMeasurement, setDrawerMeasurement] = useState({key:'',height:0});
  const appSearchInputRef = useRef<HTMLInputElement>(null);
  const [paintedStage, setPaintedStage] = useState<IslandStage>('collapsed');
  const [availableScreen, setAvailableScreen] = useState(() => ({width:window.screen.availWidth,height:window.screen.availHeight}));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showAddAppModal, setShowAddAppModal] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const autoCollapse = useRef<AutoCollapse | null>(null);

  const transitionToStage = (targetStage: IslandStage) => {
    autoCollapse.current?.cancel();
    if (targetStage === 'collapsed') {
      setShowWifiMenu(false);
      setShowBtMenu(false);
      setShowAudioMenu(false);
    }
    // The surface animates first. A single sizing effect fits the native window afterwards.
    setIslandStage(targetStage);
  };
  const openDefaultDrawer = () => {
    setTabDirection('fade');
    setActiveTab(selectDefaultTab());
    transitionToStage('drawer');
  };
  const transitionRef = useRef(transitionToStage); transitionRef.current = transitionToStage;
  if (!autoCollapse.current) autoCollapse.current = new AutoCollapse(() => transitionRef.current('collapsed'));
  useEffect(() => () => autoCollapse.current?.dispose(), []);
  useEffect(() => {
    const update = () => setAvailableScreen(previous => previous.width===window.screen.availWidth && previous.height===window.screen.availHeight ? previous : {width:window.screen.availWidth,height:window.screen.availHeight});
    window.addEventListener('resize',update); return () => window.removeEventListener('resize',update);
  }, []);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduceMotion(query.matches);
    query.addEventListener('change', change); return () => query.removeEventListener('change', change);
  }, []);

  const handleTabSelect = (newTab: TabType) => {
    if (newTab === activeTab) {
      transitionToStage('collapsed');
      return;
    }
    const currIdx = appSettings.tabOrder.indexOf(activeTab);
    const nextIdx = appSettings.tabOrder.indexOf(newTab);
    if (nextIdx > currIdx) {
      setTabDirection('right');
    } else if (nextIdx < currIdx) {
      setTabDirection('left');
    } else {
      setTabDirection('fade');
    }
    setActiveTab(newTab);
  };

  const tabAnimationClass =
    tabDirection === 'right'
      ? 'animate-tab-right'
      : tabDirection === 'left'
      ? 'animate-tab-left'
      : 'animate-island-content';

  // Real Windows Media Track Info with Timeline Tracking
  const [mediaInfo, setMediaInfo] = useState({
    title: '',
    artist: '',
    artwork: '',
    sourceApp: '',
    isPlaying: false,
    position: 0,
    duration: 0
  });

  const formatTrackTime = (sec: number) => {
    if (!sec || isNaN(sec) || sec <= 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // Local 1-second progress ticker when media is playing
  useEffect(() => {
    if (!mediaInfo.isPlaying || mediaInfo.duration <= 0) return;
    const ticker = setInterval(() => {
      setMediaInfo((prev) => {
        if (!prev.isPlaying || prev.duration <= 0) return prev;
        const nextPos = Math.min(prev.duration, prev.position + 1);
        return { ...prev, position: nextPos };
      });
    }, 1000);
    return () => clearInterval(ticker);
  }, [mediaInfo.isPlaying, mediaInfo.duration]);

  // Every shape uses the actual painted surface for hit testing, including rounded corners.
  useEffect(() => {
    if (!electron) return;
    let lastIgnore: boolean | undefined;
    const ignore = (value:boolean) => { if (lastIgnore!==value) { lastIgnore=value; electron.ipcRenderer.send('set-ignore-mouse-events',value,{forward:true}); } };
    const move = (event: MouseEvent) => {
      if(showCircleToAsk||showDictation||showScheduled||showLoadout||showAddAppModal||pickerOpen){ignore(false);return;}
      const surface = surfaceRef.current; if (!surface) return;
      const style = getComputedStyle(surface), sx = islandStage==='collapsed'?(appSettings.islandWidthScale||appSettings.islandScale||1):1, sy = islandStage==='collapsed'?(appSettings.islandHeightScale||appSettings.islandScale||1):1, radiusScale=Math.min(sx,sy);
      const radii = {topLeft:parseFloat(style.borderTopLeftRadius)*radiusScale,topRight:parseFloat(style.borderTopRightRadius)*radiusScale,bottomLeft:parseFloat(style.borderBottomLeftRadius)*radiusScale,bottomRight:parseFloat(style.borderBottomRightRadius)*radiusScale};
      const satellite=document.querySelector('[data-music-satellite]')?.getBoundingClientRect()||null;
      ignore(!containsSurfacePoint(surface.getBoundingClientRect(), event.clientX, event.clientY, radii)&&!containsSurfacePoint(satellite,event.clientX,event.clientY,999));
    };
    const leave = () => { if(!showCircleToAsk&&!showDictation&&!showScheduled&&!showLoadout&&!showAddAppModal&&!pickerOpen)ignore(true); autoCollapse.current?.leave(); };
    // A shape switch must not inherit the old shape's click-through state.
    ignore(!(showCircleToAsk||showDictation||showScheduled||showLoadout||showAddAppModal||pickerOpen));
    window.addEventListener('mousemove', move);
    document.addEventListener('mouseleave', leave);
    window.addEventListener('blur', leave);
    return () => {window.removeEventListener('mousemove',move);document.removeEventListener('mouseleave',leave);window.removeEventListener('blur',leave);};
  }, [islandStage, appSettings.islandShape, appSettings.islandScale, appSettings.islandWidthScale, appSettings.islandHeightScale, appSettings.position,showCircleToAsk,showDictation,showScheduled,showLoadout,showAddAppModal,pickerOpen]);

  const outputAudio=useOutputAudio();
  const music=musicLayout(appSettings);
  const musicState=musicActivity(mediaInfo,outputAudio,music.enabled);
  const mediaGlance = musicState.visible;
  // If Windows exposes audio output but no track metadata, use the live output meter for playback UI.
  const mediaIsPlaying = mediaInfo.title ? mediaInfo.isPlaying : outputAudio;
  const glanceTitle=musicState.outputOnly?(appLang==='ar'?'صوت الجهاز':'Device audio'):mediaInfo.title;
  const glanceArtist=musicState.outputOnly?(appLang==='ar'?'صوت قيد التشغيل':'Sound is playing'):mediaInfo.artist;
  const glanceArtwork=musicState.outputOnly?undefined:mediaInfo.artwork;
  useEffect(()=>{
    if(!mediaGlance && islandStage==='compact-media')transitionRef.current('collapsed');
  },[mediaGlance,islandStage]);

  const handleMouseEnter = () => autoCollapse.current?.enter();
  const handleMouseLeave = () => autoCollapse.current?.leave();

  useEffect(()=>{
    if(!electron)return;
    const receive=(_:unknown,snapshot:any)=>{
      const pending=(snapshot?.pendingApprovals||[]).filter((p:any)=>!p.expires||p.expires>Date.now());
      const sessions=snapshot?.sessions||[];
      setAgentGlance({waiting:pending.length,status:pending.length?'waiting':sessions.some((s:any)=>s.status==='working')?'working':sessions.some((s:any)=>s.status==='completed')?'completed':'idle'});
      const request=pending[0];
      if(request&&lastAgentRequest.current!==request.id&&!toolsOpenRef.current&&agentRequestPreference.current!==false){lastAgentRequest.current=request.id;setActiveTab('agents');transitionRef.current('drawer');}
    };
    electron.ipcRenderer.on('agent-sessions-updated',receive);
    const refresh=()=>{electron.ipcRenderer.invoke('get-coding-agents-status').then(value=>receive(null,value)).catch(()=>{});};
    electron.ipcRenderer.on('agent-state-changed',refresh);
    electron.ipcRenderer.invoke('get-coding-agents-status').then(value=>receive(null,value)).catch(()=>{});
    return()=>{electron.ipcRenderer.removeListener('agent-sessions-updated',receive);electron.ipcRenderer.removeListener('agent-state-changed',refresh);};
  },[]);

  useEffect(()=>{
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!showCircleToAsk&&!showDictation&&!showScheduled&&!showLoadout){transitionToStage('collapsed');}};
    window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);
  },[showCircleToAsk,showDictation,showScheduled,showLoadout]);

  // Close open dropdown menus on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.dropdown-trigger-btn') && !target.closest('.dropdown-popover-menu')) {
        setShowWifiMenu(false);
        setShowBtMenu(false);
        setShowAudioMenu(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Global Alt+A / Alt+Q shortcut & Window Triggers
  useEffect(() => {
    if (electron && electron.ipcRenderer) {
      const handleOpenApps = () => {
        keyboard.resetApps();
        transitionToStage('drawer');
        setActiveTab('apps');
        setTimeout(() => {
          appSearchInputRef.current?.focus();
          appSearchInputRef.current?.select();
        }, 60);
      };
      const handleToggleIsland = () => {
        if (islandStage === 'collapsed') openDefaultDrawer();
        else transitionToStage('collapsed');
      };

      electron.ipcRenderer.on('open-apps-tab', handleOpenApps);
      electron.ipcRenderer.on('toggle-island', handleToggleIsland);
      return () => {
        electron.ipcRenderer.removeListener('open-apps-tab', handleOpenApps);
        electron.ipcRenderer.removeListener('toggle-island', handleToggleIsland);
      };
    }
  }, [islandStage, appSettings.defaultTab, appSettings.tabOrder, appSettings.visibleTabs]);

  // Local window hotkey listener for Alt+A and Alt+Q
  useEffect(() => {
    const handleLocalKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.code === 'KeyA' || e.code === 'KeyQ')) {
        keyboard.resetApps();
        e.preventDefault();
        transitionToStage('drawer');
        setActiveTab('apps');
        setTimeout(() => {
          appSearchInputRef.current?.focus();
          appSearchInputRef.current?.select();
        }, 60);
      }
    };
    window.addEventListener('keydown', handleLocalKeyDown);
    return () => window.removeEventListener('keydown', handleLocalKeyDown);
  }, []);

  // Auto-focus apps search input whenever user switches to apps tab
  useEffect(() => {
    if (activeTab === 'apps' && islandStage === 'drawer') {
      setTimeout(() => {
        appSearchInputRef.current?.focus();
        appSearchInputRef.current?.select();
      }, 50);
    }
  }, [activeTab, islandStage]);

  // Real System Telemetry
  const [telemetry, setTelemetry] = useState({
    cpu: { model: 'Reading CPU…', percent: 0, speed: '—', processes: 0 },
    gpu: { model: 'Reading GPU…', shortModel: '—', percent: 0, vramUsed: '—' },
    ram: { used: '—', free: '—', percent: 0 }, disk: { freeText: '—' },
    network: { type: '', isEthernet: false, adapterName: '', downSpeed: '—', upSpeed: '—' },
    uptime: '—', wifi: { ssid: '', signal: '', connected: false, isEthernet: false },
    bluetooth: { adapter: '', name: '', connectedDevices: [] as string[], connected: false },
  });

  // Real Top Apps by CPU / RAM
  const [topApps, setTopApps] = useState<{ name: string; ram: string; cpu: string }[]>([]);

  // Dropdown Popovers State
  const [showWifiMenu, setShowWifiMenu] = useState(false);
  const [showBtMenu, setShowBtMenu] = useState(false);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [availableWifi, setAvailableWifi] = useState<string[]>([]);
  const [audioDevices, setAudioDevices] = useState<string[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('Windows default');

  // Controls Quick Toggles State
  const [wifiActive, setWifiActive] = useState(false);
  const [btActive, setBtActive] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [volume, setVolume] = useState(0);
  const isDraggingVolume = useRef(false);
  const [volumeDragging, setVolumeDragging] = useState(false);

  // Speed Test State
  const [speedTestStage, setSpeedTestStage] = useState<'idle' | 'testing' | 'done'>('idle');
  const [speedTestProgressText, setSpeedTestProgressText] = useState('Run speed test');
  const [livePing, setLivePing] = useState(0);
  const [liveDown, setLiveDown] = useState(0);
  const [liveUp, setLiveUp] = useState(0);

  const handleRunSpeedTest = async () => {
    if (speedTestStage === 'testing') return;
    setSpeedTestStage('testing'); setSpeedTestProgressText(appLang==='ar'?'جارٍ قياس الاتصال…':'Measuring connection…');
    try {
      if (!electron?.ipcRenderer) throw new Error('Use the Windows app');
      const result = await electron.ipcRenderer.invoke('run-speed-test');
      if (!result?.success) throw new Error(result?.error || 'Test unavailable');
      setLivePing(result.ping); setLiveDown(result.down); setLiveUp(result.up);
      setSpeedTestStage('done'); setSpeedTestProgressText(appLang==='ar'?'تم القياس · Cloudflare':'Measured · Cloudflare');
    } catch (error) { setSpeedTestStage('idle'); setSpeedTestProgressText(appLang==='ar'?'تعذر القياس. حاول مجددًا.':error instanceof Error ? error.message : 'Try again'); }
  };

  // Poll real system data, CoreAudio state & media session (Throttled & CPU-Optimized)
  useEffect(() => {
    if (!electron || !electron.ipcRenderer) return;

    let isMounted = true;

    const fetchMedia = async () => {
      try {
        const media = await electron.ipcRenderer.invoke('get-current-media');
        if (isMounted && media) {
          setMediaInfo(media);
        }
      } catch (e) {}
    };

    const fetchTelemetry = async () => {
      try {
        const data = await electron.ipcRenderer.invoke('get-real-telemetry');
        if (isMounted && data) {
          setTelemetry(data);
          setBtActive(Boolean(data.bluetooth?.enabled));
          setWifiActive(Boolean(data.wifi?.connected));
        }
      } catch (e) {}
    };

    const fetchTopApps = async () => {
      try {
        const apps = await electron.ipcRenderer.invoke('get-top-apps');
        if (isMounted && apps && Array.isArray(apps)) setTopApps(apps);
      } catch (e) {}
    };

    const fetchAudioState = async () => {
      try {
        const aState = await electron.ipcRenderer.invoke('get-audio-state');
        if (isMounted && aState) {
          if (typeof aState.volume === 'number') setVolume(aState.volume);
          if (typeof aState.isMuted === 'boolean') setAudioMuted(aState.isMuted);
          if (aState.devices && aState.devices.length > 0) {
            const def = aState.devices.find((d: any) => d.isDefault);
            if (def) setSelectedAudioDevice(def.name);
            setAudioDevices(aState.devices.map((d: any) => d.name));
          }
        }
      } catch (e) {}
    };

    const fetchWallpapers = async () => {
      try {
        void electron.ipcRenderer.invoke('get-current-wallpaper').then((cur:string)=>{if(isMounted&&cur)setActiveWindowsWpPath(cur);}).catch(()=>{});
        const list = await electron.ipcRenderer.invoke('get-wallpapers-list');
        if (isMounted && Array.isArray(list)) {
          setMainWallpapersList(list);
        }
      } catch (e) {}
    };

    fetchMedia();
    fetchAudioState();
    fetchWallpapers();
    fetchTelemetry();

    const onWpChanged = (_event: any, data: any) => {
      if (data && data.path) setActiveWindowsWpPath(data.path);
    };
    electron.ipcRenderer.on('wallpaper-changed', onWpChanged);
    electron.ipcRenderer.on('wallpapers-updated', fetchWallpapers);

    const mediaIntervalTime = 2500;
    const mInterval = setInterval(fetchMedia, mediaIntervalTime);

    let tInterval: NodeJS.Timeout | null = null;
    let aInterval: NodeJS.Timeout | null = null;

    if (islandStage === 'drawer') {
      if (activeTab === 'stats' || activeTab === 'controls') {
        fetchTelemetry();
        fetchAudioState();
        tInterval = setInterval(() => { fetchTelemetry(); fetchAudioState(); }, appSettings.lowPowerMode ? 7000 : 3500);
      }
      if (activeTab === 'stats') {
        fetchTopApps();
        aInterval = setInterval(fetchTopApps, 7000);
      }
    }

    return () => {
      isMounted = false;
      clearInterval(mInterval);
      if (tInterval) clearInterval(tInterval);
      if (aInterval) clearInterval(aInterval);
      if (electron?.ipcRenderer){electron.ipcRenderer.removeListener('wallpaper-changed', onWpChanged);electron.ipcRenderer.removeListener('wallpapers-updated',fetchWallpapers);}
    };
  }, [islandStage, activeTab, appSettings.lowPowerMode]);

  // Continuous Real-Time Volume Drag
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDraggingVolume.current) return;
      const el = document.getElementById('volume-track-bar');
      if (el) {
        const rect = el.getBoundingClientRect();
        const p = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
        setVolume(p);
        if (electron && electron.ipcRenderer) {
          electron.ipcRenderer.send('volume-control', { action: 'set', value: p });
        }
      }
    };

    const handleGlobalMouseUp = () => {
      isDraggingVolume.current = false;
      setVolumeDragging(false);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  // Apple Notch Wheel Morph Handler (Expand down, Collapse up)
  const lastWheelTime = useRef<number>(0);
  const handleNotchWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastWheelTime.current < 250) return;
    lastWheelTime.current = now;

    if (e.deltaY < -10) {
      // Wheel UP -> Collapse / Shrink window back
      if (islandStage === 'drawer') {
        if (mediaGlance) {
          transitionToStage('compact-media');
        } else {
          transitionToStage('collapsed');
        }
      } else if (islandStage === 'compact-media') {
        transitionToStage('collapsed');
      }
    } else if (e.deltaY > 10) {
      // Wheel DOWN -> Expand
      if (islandStage === 'collapsed') {
        if (mediaGlance) {
          transitionToStage('compact-media');
        } else {
          transitionToStage('drawer');
        }
      } else if (islandStage === 'compact-media') {
        transitionToStage('drawer');
      }
    }
  };

  // TODAY TAB STATE
  const [currentTime, setCurrentTime] = useState(new Date());
  const [weather, setWeather] = useState<any>(null);
  useEffect(() => { if (activeTab === 'today') electron?.ipcRenderer.invoke('get-weather').then(setWeather).catch(() => setWeather(null)); }, [activeTab, appSettings]);
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Pomodoro Focus Timer
  const [pomodoroSeconds, setPomodoroSeconds] = useState(300);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [focusPaused,setFocusPaused]=useState(false);
  const [timerPreset, setTimerPreset] = useState<'1m' | '5m' | '10m' | '15m' | '20m'>('5m');

  // Real dynamic week calendar calculation based on current system time
  const weekDays = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 is Sunday, 1 is Monday...
    const diffToMonday = (dayOfWeek + 6) % 7; // days since Monday
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);

    const days = [];
    const dayNamesEn = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dayNamesAr = ['إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت', 'أحد'];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const isToday = d.toDateString() === now.toDateString();
      days.push({
        dateObj: d,
        day: dayNamesEn[i],
        ar: dayNamesAr[i],
        num: d.getDate(),
        isToday
      });
    }
    return days;
  }, [currentTime.toDateString()]);

  const [selectedDay, setSelectedDay] = useState<string>(() => {
    const dayNamesEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return dayNamesEn[new Date().getDay()];
  });

  const weekRangeString = useMemo(() => {
    if (weekDays.length < 7) return '';
    const start = weekDays[0].dateObj;
    const end = weekDays[6].dateObj;
    if (appLang === 'ar') {
      const sDay = start.getDate();
      const sMonth = start.toLocaleDateString('ar-SA', { month: 'long' });
      const eDay = end.getDate();
      const eMonth = end.toLocaleDateString('ar-SA', { month: 'long' });
      return `${sDay} ${sMonth} – ${eDay} ${eMonth}`;
    } else {
      const sMonth = start.toLocaleDateString('en-US', { month: 'short' });
      const sDay = start.getDate();
      const eMonth = end.toLocaleDateString('en-US', { month: 'short' });
      const eDay = end.getDate();
      return `${sMonth} ${sDay} – ${eMonth} ${eDay}`;
    }
  }, [weekDays, appLang]);

  useEffect(()=>{
    let live=true;
    const tick=async()=>{try{const state=await electron?.ipcRenderer.invoke('activity-get');if(!live||!state)return;if(state.focus){setFocusPaused(Boolean(state.focus.paused));setIsTimerRunning(!state.focus.paused);setPomodoroSeconds(Math.max(0,Math.ceil((state.focus.paused?state.focus.remaining:state.focus.endsAt-Date.now())/1000)));}else{setIsTimerRunning(false);setFocusPaused(false);}}catch{}};
    void tick();const interval=setInterval(()=>void tick(),1000);return()=>{live=false;clearInterval(interval);};
  },[]);
  const selectTimerPreset=(preset:'1m'|'5m'|'10m'|'15m'|'20m')=>{setTimerPreset(preset);setIsTimerRunning(false);void electron?.ipcRenderer.invoke('activity-focus',0);setPomodoroSeconds(parseInt(preset)*60);};
  const toggleFocus=()=>{if(isTimerRunning){setIsTimerRunning(false);setFocusPaused(true);void electron?.ipcRenderer.invoke('activity-focus','pause');}else{const minutes=Math.max(1,Math.ceil(pomodoroSeconds/60));void electron?.ipcRenderer.invoke('activity-focus',focusPaused?'resume':minutes);setFocusPaused(false);setIsTimerRunning(true);}};

  const formatTimer = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const [todayTodos,setTodayTodos]=useState<{id:string;title:string;completed:boolean;badge?:string}[]>([]);
  const [newTodoInput,setNewTodoInput]=useState('');
  useEffect(()=>{
    let live=true;
    async function load(){if(!electron)return;try{const state=await electron.ipcRenderer.invoke('activity-get');if(live)setTodayTodos(state.tasks.map((t:any)=>({id:t.id,title:t.title,completed:t.done})));}catch{}}
    void (async()=>{if(electron&&!localStorage.getItem('tasks-migrated-1.1')){try{const old=JSON.parse(localStorage.getItem('hitodama_todos')||'[]');for(const task of old)if(task.title){const result=await electron.ipcRenderer.invoke('activity-task',{title:task.title});if(task.completed)await electron.ipcRenderer.invoke('activity-task',{id:result.tasks[0].id,done:true});}localStorage.setItem('tasks-migrated-1.1','1');}catch{}}await load();})();
    const timer=setInterval(()=>void load(),3000);return()=>{live=false;clearInterval(timer);};
  },[]);
  const applyTask=async(input:any)=>{try{const result=await electron?.ipcRenderer.invoke('activity-task',input);if(result)setTodayTodos(result.tasks.map((t:any)=>({id:t.id,title:t.title,completed:t.done})));}catch{showNotchFeedback(appLang==='ar'?'تعذر حفظ المهمة.':'Could not save task.');}};
  const handleAddTodo=()=>{if(newTodoInput.trim()){void applyTask({title:newTodoInput.trim()});setNewTodoInput('');}};
  const toggleTodayTodo=(id:string)=>{const task=todayTodos.find(t=>t.id===id);if(task)void applyTask({id,done:!task.completed});};
  const deleteTodayTodo=(id:string,e:React.MouseEvent)=>{e.stopPropagation();void applyTask({id,remove:true});};

  // CLIPBOARD TAB STATE
  const [clipFilter, setClipFilter] = useState<'all' | 'text' | 'images' | 'links'>('all');
  const [clipSearch, setClipSearch] = useState('');
  const [clipboardItems, setClipboardItems] = useState<ClipboardItem[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string>('');

  // Receive real-time clipboard updates from Electron
  useEffect(() => {
    if (electron && electron.ipcRenderer) {
      electron.ipcRenderer.invoke('get-clipboard-history').then((hist: ClipboardItem[]) => {
        if (hist && Array.isArray(hist)) {
          setClipboardItems(hist);
          if (!selectedClipId) setSelectedClipId(hist[0]?.id || '');
        }
      });

      const handleClipUpdate = (_event: unknown, updated: ClipboardItem[]) => {
        if (updated && Array.isArray(updated)) {
          setClipboardItems(updated);
          setSelectedClipId((prev) => (updated.some(item => item.id === prev) ? prev : updated[0]?.id || ''));
        }
      };
      electron.ipcRenderer.on('clipboard-updated', handleClipUpdate);
      return () => {
        electron.ipcRenderer.removeListener('clipboard-updated', handleClipUpdate);
      };
    }
  }, []);

  // Re-fetch clipboard history immediately whenever user opens the clipboard tab
  useEffect(() => {
    if (activeTab === 'clipboard' && electron && electron.ipcRenderer) {
      electron.ipcRenderer.invoke('get-clipboard-history').then((hist: ClipboardItem[]) => {
        if (hist && Array.isArray(hist)) {
          setClipboardItems(hist);
          if (!selectedClipId) setSelectedClipId(hist[0]?.id || '');
        }
      });
    }
  }, [activeTab]);

  const handleCopyClipItem = (item: ClipboardItem) => {
    if (electron && electron.ipcRenderer) {
      electron.ipcRenderer.send('write-clipboard', item.image || item.fullText);
    } else {
      navigator.clipboard.writeText(item.fullText);
    }
    confetti({ particleCount: 25, spread: 45, origin: { y: 0.3 } });
  };

  const handlePinClipItem = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (electron && electron.ipcRenderer) {
      electron.ipcRenderer.send('pin-clipboard-item', id);
    } else {
      setClipboardItems((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isPinned: !c.isPinned, group: c.isPinned ? 'TODAY' : 'PINNED' } : c))
      );
    }
  };

  const handleDeleteClipItem = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (electron && electron.ipcRenderer) {
      electron.ipcRenderer.send('delete-clipboard-item', id);
    } else {
      setClipboardItems((prev) => prev.filter((c) => c.id !== id));
    }
  };

  const handleClearClipboard = async () => {
    if (electron && electron.ipcRenderer) {
      try {
        const remaining = await electron.ipcRenderer.invoke('clear-clipboard-history');
        if (remaining && Array.isArray(remaining)) {
          setClipboardItems(remaining);
          setSelectedClipId(remaining.length > 0 ? remaining[0].id : '');
        } else {
          setClipboardItems((prev) => prev.filter((c) => c.isPinned || c.group === 'PINNED'));
        }
      } catch (e) {
        setClipboardItems((prev) => prev.filter((c) => c.isPinned || c.group === 'PINNED'));
      }
    } else {
      setClipboardItems((prev) => prev.filter((c) => c.isPinned || c.group === 'PINNED'));
    }
  };

  // Smart Automatic Categorization (فرز تلقائي ذكي)
  const filteredClips = clipboardItems.filter((c) => {
    const isImg = c.type === 'images' || Boolean(c.image) || /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(c.fullText.trim()) || /^data:image\//i.test(c.fullText.trim());
    const isLnk = c.type === 'links' || /^(https?:\/\/|www\.)/i.test(c.fullText.trim()) || /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/[^\s]*)?$/i.test(c.fullText.trim());

    const matchesFilter =
      clipFilter === 'all'
        ? true
        : clipFilter === 'images'
        ? isImg
        : clipFilter === 'links'
        ? isLnk
        : clipFilter === 'text'
        ? (!isImg && !isLnk) || c.type === 'text'
        : true;

    const matchesSearch =
      !clipSearch ||
      c.fullText.toLowerCase().includes(clipSearch.toLowerCase()) ||
      c.title.toLowerCase().includes(clipSearch.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const activeClipboardItem = filteredClips.find((c) => c.id === selectedClipId) || filteredClips[0];

  interface WallpaperItem {
    id: number|string;
    name: string;
    url: string;
    filePath?: string;
    sourcePath?: string;
  }

  // WALLPAPERS TAB STATE (Persisted in LocalStorage & Starts in Middle)
  const [wallpaperCategory, setWallpaperCategory] = useState<'recent' | 'my_folder'>(() => {
    try {
      return (localStorage.getItem('hitodama_wp_category') as 'recent' | 'my_folder') || 'recent';
    } catch (e) { return 'recent'; }
  });
  const [customFolderName, setCustomFolderName] = useState<string>(() => {
    try {
      return localStorage.getItem('hitodama_wp_folder_name') || '';
    } catch (e) { return ''; }
  });
  const [customWallpapers, setCustomWallpapers] = useState<WallpaperItem[]>(() => {
    try {
      const saved = localStorage.getItem('hitodama_wp_custom_list');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });
  const [selectedWpIndex, setSelectedWpIndex] = useState(2);
  const [isWpApplying, setIsWpApplying] = useState(false);
  const [activeWindowsWpPath, setActiveWindowsWpPath] = useState<string>('');
  const lastWpWheelTime = useRef<number>(0);

  const [mainWallpapersList, setMainWallpapersList] = useState<WallpaperItem[]>([]);

  const currentWallpapersList: WallpaperItem[] = wallpaperCategory === 'recent' || customWallpapers.length === 0
    ? mainWallpapersList
    : customWallpapers;
  useEffect(()=>{if(!electron)return;let live=true;const load=()=>void electron.ipcRenderer.invoke('get-custom-wallpapers-list').then((items:WallpaperItem[])=>{if(live&&Array.isArray(items))setCustomWallpapers(items);}).catch(()=>{});load();electron.ipcRenderer.on('wallpapers-updated',load);return()=>{live=false;electron.ipcRenderer.removeListener('wallpapers-updated',load);};},[]);

  const handleSelectWpCategory = (cat: 'recent' | 'my_folder') => {
    setWallpaperCategory(cat);
    try { localStorage.setItem('hitodama_wp_category', cat); } catch (e) {}
    const list = cat === 'recent' ? mainWallpapersList : customWallpapers;
    if (list.length > 0) {
      setSelectedWpIndex(Math.floor(list.length / 2));
    }
  };

  const handlePickCustomFolder = async () => {
    if (electron && electron.ipcRenderer) {
      setPickerOpen(true);
      try {
        const res = await electron.ipcRenderer.invoke('select-wallpaper-folder');
        if (res && !res.canceled && res.pictures && res.pictures.length > 0) {
          const folderTitle = res.folderName || (appLang === 'ar' ? 'مجلدي' : 'My folder');
          setCustomWallpapers(res.pictures);
          setCustomFolderName(folderTitle);
          setWallpaperCategory('my_folder');
          try {
            localStorage.setItem('hitodama_wp_custom_list', JSON.stringify(res.pictures.map(({url,...item}:WallpaperItem)=>item)));
            localStorage.setItem('hitodama_wp_folder_name', folderTitle);
            localStorage.setItem('hitodama_wp_category', 'my_folder');
          } catch (e) {}
          // Start from middle
          const middleIdx = Math.floor(res.pictures.length / 2);
          setSelectedWpIndex(middleIdx);
        }
      } catch (e) {} finally {setPickerOpen(false);}
    }
  };

  const wallpaperListRef=useRef(currentWallpapersList);wallpaperListRef.current=currentWallpapersList;
  const wpIndexRef=useRef(selectedWpIndex);wpIndexRef.current=selectedWpIndex;
  const wpApplyTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const wpQueue=useRef<WallpaperQueue|null>(null);
  const wpFeedback={busy:setIsWpApplying,success:(item:WallpaperItem,result:any)=>{setActiveWindowsWpPath(result.path);onWallpaperSelect?.({...item,palette:currentWallpaper.palette});},error:()=>showNotchFeedback(appLang==='ar'?'تعذر تطبيق الخلفية. تحقق من الصورة وحاول مجددًا.':'Could not apply wallpaper. Check the image and try again.')};
  if(!wpQueue.current)wpQueue.current=new WallpaperQueue(async item=>{
    if(!electron)throw new Error('Windows app required.');return electron.ipcRenderer.invoke('set-wallpaper',{filePath:item.filePath||item.url});
  },wpFeedback);
  wpQueue.current.feedback=wpFeedback;
  useEffect(()=>{if(wpQueue.current)wpQueue.current.disposed=false;return()=>{if(wpApplyTimer.current)clearTimeout(wpApplyTimer.current);wpQueue.current?.dispose();};},[]);
  const handleBrowseWallpaper=(idx:number)=>{
    const item=wallpaperListRef.current[idx];if(!item)return;wpIndexRef.current=idx;setSelectedWpIndex(idx);
    if(wpApplyTimer.current)clearTimeout(wpApplyTimer.current);
    wpApplyTimer.current=setTimeout(()=>void wpQueue.current?.request(item),35);
  };
  const navigateWallpaper=(direction:number)=>{const len=wallpaperListRef.current.length;if(len)handleBrowseWallpaper((wpIndexRef.current+direction+len)%len);};
  const handleApplyWallpaper=(idx:number)=>handleBrowseWallpaper(idx);
  const handleWallpaperWheel=(event:React.WheelEvent)=>{event.stopPropagation();const now=Date.now();if(now-lastWpWheelTime.current<140)return;lastWpWheelTime.current=now;if(event.deltaY)navigateWallpaper(event.deltaY>0?1:-1);};
  const handleAddWallpaper=async()=>{setPickerOpen(true);try{const result=await electron?.ipcRenderer.invoke('select-wallpaper-file');if(!result||result.canceled)return;if(result.error)throw new Error(result.error);setMainWallpapersList(previous=>[...previous,result.item]);setWallpaperCategory('recent');setSelectedWpIndex(mainWallpapersList.length);wpIndexRef.current=mainWallpapersList.length;void wpQueue.current?.request(result.item);}catch{showNotchFeedback(appLang==='ar'?'تعذرت إضافة الصورة.':'Could not add the image.');}finally{setPickerOpen(false);}};

  useEffect(()=>{
    if(activeTab!=='wallpaper'||islandStage!=='drawer'||showCircleToAsk||showScheduled||showLoadout)return;
    const gallery=document.querySelector<HTMLElement>('[data-wallpaper-gallery]');gallery?.focus({preventScroll:true});
    const key=(event:KeyboardEvent)=>{if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||/INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName))return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();navigateWallpaper(event.key==='ArrowRight'?1:-1);}};
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[activeTab,islandStage,showCircleToAsk,showScheduled,showLoadout]);

  useEffect(()=>{if(activeTab!=='wallpaper')return;const len=currentWallpapersList.length;if(!len)return;for(const offset of [-3,3]){const image=new Image();image.src=currentWallpapersList[(selectedWpIndex+offset+len*10)%len].url;}},[activeTab,selectedWpIndex,currentWallpapersList]);

  // APPS TAB STATE (Real Windows Apps & Custom Apps)
  const [appSearch, setAppSearch] = useState('');
  const [savedSnippets,setSavedSnippets]=useState<any[]>([]);
  useEffect(()=>{let active=true;const load=()=>electron?.ipcRenderer.invoke('workspace-get').then((state:any)=>{if(active&&state?.snippets)setSavedSnippets(state.snippets);}).catch(()=>{});load();electron?.ipcRenderer.on('companion-data-updated',load);return()=>{active=false;electron?.ipcRenderer.removeListener('companion-data-updated',load);};},[]);
  const [installedApps, setInstalledApps] = useState<AppItem[]>([]);
  const [appScan,setAppScan]=useState(0),[appsLoading,setAppsLoading]=useState(false),[appsLoadError,setAppsLoadError]=useState(false);
  const forceNextAppScan=useRef(false);
  const [customApps, setCustomApps] = useState<AppItem[]>(() => {
    try {
      const saved = localStorage.getItem('hitodama_custom_apps');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });
  const [starredAppNames, setStarredAppNames] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('hitodama_starred_apps');
      return saved ? JSON.parse(saved) : ['Visual Studio Code', 'Google Chrome', 'File Explorer', 'Discord'];
    } catch (e) { return ['Visual Studio Code', 'Google Chrome', 'File Explorer', 'Discord']; }
  });
  useEffect(() => {
    autoCollapse.current!.update(islandStage, (activeTab==='agents'&&agentGlance.waiting>0) || showCircleToAsk || showDictation || showScheduled || showLoadout || showAddAppModal || pickerOpen || volumeDragging);
  }, [islandStage, activeTab, agentGlance.waiting, showCircleToAsk, showDictation, showScheduled, showLoadout, showAddAppModal, pickerOpen, volumeDragging]);
  const [customAppNameInput, setCustomAppNameInput] = useState('');
  const [customAppPathInput, setCustomAppPathInput] = useState('');

  // Refresh when the launcher opens, so newly installed Store/desktop apps appear.
  useEffect(() => {
    if(activeTab!=='apps'||islandStage!=='drawer')return;
    let live=true;
    if (electron && electron.ipcRenderer) {
      const refresh=forceNextAppScan.current;forceNextAppScan.current=false;setAppsLoading(true);setAppsLoadError(false);
      electron.ipcRenderer.invoke('get-installed-apps', { includeIcons: false,refresh }).then((apps: AppItem[]) => {
        if (live && Array.isArray(apps)) {
          setInstalledApps(apps);
        }
      }).catch(()=>{if(live)setAppsLoadError(true);}).finally(()=>{if(live)setAppsLoading(false);});
    }
    return()=>{live=false;};
  }, [activeTab,islandStage,appScan]);


  const toggleStarApp = (appName: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setStarredAppNames((prev) => {
      const exists = prev.includes(appName);
      const next = exists ? prev.filter(n => n !== appName) : [...prev, appName];
      try { localStorage.setItem('hitodama_starred_apps', JSON.stringify(next)); } catch (err) {}
      return next;
    });
  };

  const handleBrowseAppFile = async () => {
    if (electron && electron.ipcRenderer) {
      const res = await electron.ipcRenderer.invoke('select-app-file');
      if (res && !res.canceled && res.path) {
        setCustomAppNameInput(res.name);
        setCustomAppPathInput(res.path);
      }
    }
  };

  const handleSaveCustomApp = async () => {
    if (!customAppNameInput.trim()) return;
    const newApp: AppItem = {
      name: customAppNameInput.trim(),
      path: customAppPathInput.trim(),
      letter: (customAppNameInput.trim().charAt(0) || 'A').toUpperCase(),
      type: 'Custom App',
      isCustom: true
    };
    const next = [newApp, ...customApps.filter(c => c.name !== newApp.name)];
    setCustomApps(next);
    try { localStorage.setItem('hitodama_custom_apps', JSON.stringify(next)); } catch (err) {}
    setCustomAppNameInput('');
    setCustomAppPathInput('');
    setShowAddAppModal(false);
  };

  const handleDeleteCustomApp = (appName: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const next = customApps.filter(c => c.name !== appName);
    setCustomApps(next);
    try { localStorage.setItem('hitodama_custom_apps', JSON.stringify(next)); } catch (err) {}
  };

  // Combine custom apps and real installed apps
  const allAppsList: AppItem[] = mergeAppEntries(customApps,installedApps).map(a => ({
    ...a,
    isStarred: starredAppNames.includes(a.name)
  })).sort((a, b) => a.name.localeCompare(b.name, appLang === 'ar' ? 'ar' : 'en', { sensitivity: 'base', numeric: true }));

  const filteredApps = allAppsList.filter((a) =>
    a.name.toLowerCase().includes(appSearch.toLowerCase())
  );

  const handleLaunchApp = (app: AppItem | string) => {
    if (electron && electron.ipcRenderer) {
      if (typeof app === 'string') {
        const found = allAppsList.find(a => a.name.toLowerCase() === app.toLowerCase());
        electron.ipcRenderer.send('launch-app', found || { name: app });
      } else {
        electron.ipcRenderer.send('launch-app', app);
      }
    }
  };

  // REAL Quick Actions
  const handleToggleWifi = () => {
    electron?.ipcRenderer.send('open-external-link', 'ms-settings:network-wifi');
  };
  const handleConnectWifi = (net: string) => {
    setShowWifiMenu(false);
    electron?.ipcRenderer.send('connect-wifi-network', net);
    showNotchFeedback(appLang === 'ar' ? 'أُرسل طلب الاتصال. بانتظار ويندوز.' : 'Connection requested. Waiting for Windows.');
  };

  const handleOpenWifiMenu = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowWifiMenu(!showWifiMenu);
    setShowBtMenu(false);
    setShowAudioMenu(false);
    if (electron && electron.ipcRenderer) {
      const list = await electron.ipcRenderer.invoke('get-wifi-networks');
      if (list && Array.isArray(list)) setAvailableWifi(list);
    }
  };

  const handleOpenAudioMenu = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowAudioMenu(!showAudioMenu);
    setShowWifiMenu(false);
    setShowBtMenu(false);
    if (electron && electron.ipcRenderer) {
      const list = await electron.ipcRenderer.invoke('get-audio-devices');
      if (list && Array.isArray(list)) setAudioDevices(list);
    }
  };

  const handleToggleTheme = () => {
    const nextLight = !isLightMode;
    setIsLightMode(nextLight);
    if (electron && electron.ipcRenderer) {
      electron.ipcRenderer.send('set-windows-theme', nextLight);
    }
  };

  const handleToggleMute = () => {
    setAudioMuted(!audioMuted);
    if (electron && electron.ipcRenderer) {
      electron.ipcRenderer.send('volume-control', { action: audioMuted ? 'unmute' : 'mute' });
    }
  };

  const handleMediaControl = (action: 'play-pause' | 'next' | 'prev') => {
    if (action === 'play-pause') setMediaInfo((p) => p.title ? ({ ...p, isPlaying: !p.isPlaying }) : p);
    if (electron && electron.ipcRenderer) {
      electron.ipcRenderer.send('media-control', action);
    }
  };

  const handlePowerAction = (action: 'lock' | 'sleep' | 'restart' | 'shutdown') => {
    if (electron && electron.ipcRenderer) {
      electron.ipcRenderer.send('trigger-power', action);
    } else {
      alert(`Power Action: ${action}`);
    }
  };

  const handleQuitAppAndServer = () => {
    if (electron && electron.ipcRenderer) {
      electron.ipcRenderer.send('quit-app-and-server');
    } else {
      window.close();
    }
  };

  const allTabs: { id: TabType; label: string }[] = [
    {id:'agents',label:appLang==='ar'?'الوكلاء':'Agents'},
    {id:'phone',label:appLang==='ar'?'الهاتف':'Phone'},
    { id: 'ai', label: appLang === 'ar' ? 'الروح ✨' : 'Soul AI ✨' },
    { id: 'controls', label: appLang === 'ar' ? 'التحكم' : 'Controls' },
    { id: 'today', label: appLang === 'ar' ? 'اليوم' : 'Today' },
    { id: 'stats', label: appLang === 'ar' ? 'الإحصائيات' : 'Stats' },
    { id: 'clipboard', label: appLang === 'ar' ? 'الحافظة' : 'Clipboard' },
    { id: 'apps', label: appLang === 'ar' ? 'التطبيقات' : 'Apps' },
    { id: 'wallpaper', label: appLang === 'ar' ? 'الخلفيات' : 'Wallpaper' },
    { id: 'power', label: appLang === 'ar' ? 'الطاقة' : 'Power' }
  ];

  const tabs = allTabs.filter(t => (appSettings.visibleTabs as any)?.[t.id] ?? true).sort((a, b) => appSettings.tabOrder.indexOf(a.id) - appSettings.tabOrder.indexOf(b.id));
  useEffect(() => { if (activeTab!=='agents'&&tabs.length && !tabs.some(tab => tab.id === activeTab)) setActiveTab(tabs[0].id); }, [activeTab, appSettings.visibleTabs]);

  const appKey=(item:AppItem)=>item.path||item.name;
  const keyboardApps=[...filteredApps.filter(item=>item.isStarred),...filteredApps.filter(item=>!item.isStarred)];
  const keyboard=useIslandKeyboard({
    open:islandStage==='drawer',blocked:showCircleToAsk||showDictation||showScheduled||showLoadout||showAddAppModal||pickerOpen||Boolean(notchNotification),
    rtl:appLang==='ar',tabIds:tabs.map(tab=>tab.id),activeTab,onTabSelect:id=>handleTabSelect(id as TabType),
    appsActive:activeTab==='apps',appIds:keyboardApps.map(appKey),query:appSearch,searchRef:appSearchInputRef,
    onLaunchApp:id=>{const item=keyboardApps.find(app=>appKey(app)===id);if(item)handleLaunchApp(item);}
  });

  const notices=useIslandNotices(agentGlance.waiting>0||showCircleToAsk||showDictation||showScheduled||showLoadout||showAddAppModal||pickerOpen||Boolean(notchNotification)||(islandStage==='collapsed'&&paintedStage!=='collapsed'),appSettings.islandNotificationsEnabled!==false,appSettings.notificationDurationSeconds*1000);
  const noticeCompact=Boolean(notices.current)&&islandStage!=='drawer';
  const noticeHeight=appSettings.notificationStyle==='compact'?76:112;
  const noticeCard=notices.current?<IslandNotificationCard notice={notices.current} ar={appLang==='ar'} inline={islandStage==='drawer'} width={appSettings.notificationWidth} appearance={appSettings.notificationStyle} motion={reduceMotion?'instant':appSettings.notificationMotion} onDismiss={notices.dismiss} onPause={notices.pause}/>:null;
  // Shell dimensions and shapes depending on state for GPU fluid morphing
  const currentShape = appSettings.islandShape || 'classic';
  const currentTheme = appSettings.theme || 'original-blue';
  const accentColor = themeAccent(appSettings);
  const islandFill=isLightMode?'#f4f4f7':islandThemeFill(appSettings);

  const edge = islandEdge(appSettings.position);
  const sideEdge = edge==='left'||edge==='right';
  const collapsed = collapsedSize(currentShape,edge,mediaGlance,music.presentation);
  const musicDecorated=mediaGlance&&islandStage==='collapsed'&&paintedStage==='collapsed'&&!notchNotification&&!noticeCompact;
  const musicBars=musicDecorated&&music.bars&&outputAudio;
  const musicSatellite=musicDecorated&&music.satellite;
  const openMusic=()=>{setTabDirection('fade');setActiveTab('controls');transitionToStage('drawer');};
  const isOrbCircle = currentShape === 'orb-circle';
  const showEars = currentShape === 'classic' && !sideEdge;

  const shellWidth =
    notchNotification
      ? 480
      : noticeCompact ? appSettings.notificationWidth
      : islandStage === 'collapsed'
      ? collapsed.width
      : islandStage === 'compact-media'
      ? 390
      : TAB_WIDTHS[activeTab];

  const morphDuration = animationDuration(appSettings.animationSpeed, reduceMotion||Boolean(notices.current)&&appSettings.notificationMotion==='instant');
  const scaleCollapsed = islandStage==='collapsed'&&!noticeCompact&&!notchNotification;
  const islandScaleX = scaleCollapsed?(appSettings.islandWidthScale||appSettings.islandScale||1):1;
  const islandScaleY = scaleCollapsed?(appSettings.islandHeightScale||appSettings.islandScale||1):1;
  const earGutter=currentShape==='classic'&&!sideEdge?Math.max(12,Math.ceil(12*islandScaleX)):12;
  const maxSurfaceWidth = Math.max(1,availableScreen.width-earGutter*2);
  const drawerWidth = Math.min(TAB_WIDTHS[activeTab],maxSurfaceWidth);
  const maxDrawerHeight = sectionHeightLimit(activeTab,currentShape,1,availableScreen.height,edge);
  const drawerLayoutKey = `${activeTab}:${drawerWidth}:${maxDrawerHeight}:${appLang}`;
  const drawerReady = drawerMeasurement.key===drawerLayoutKey && drawerMeasurement.height>0;
  const drawerHeight = Math.min(drawerMeasurement.height || 1,maxDrawerHeight);
  const heightForStage = (stage:IslandStage) => stage==='collapsed' ? collapsed.height : stage==='compact-media' ? 46 : drawerHeight;
  const surfaceHeight = notchNotification ? 46 : noticeCompact ? noticeHeight : heightForStage(islandStage);
  const classicRadius=Math.min(islandStage==='collapsed'&&!noticeCompact?10:28,surfaceHeight/2,Math.min(shellWidth,maxSurfaceWidth)/2);
  const classicRadii=({top:`0 0 ${classicRadius}px ${classicRadius}px`,bottom:`${classicRadius}px ${classicRadius}px 0 0`,left:`0 ${classicRadius}px ${classicRadius}px 0`,right:`${classicRadius}px 0 0 ${classicRadius}px`})[edge];
  const earBase=Math.min(12,Math.max(0,surfaceHeight-classicRadius));
  const earWidth=earBase*islandScaleX,earHeight=earBase*islandScaleY;
  const closing = islandStage==='collapsed' && paintedStage!=='collapsed';
  const contentStage = closing ? paintedStage : islandStage;
  useLayoutEffect(() => {
    if (islandStage==='collapsed' && paintedStage!=='collapsed' && morphDuration) {
      const timer = setTimeout(()=>setPaintedStage('collapsed'),morphDuration);
      return () => clearTimeout(timer);
    }
    setPaintedStage(islandStage);
  }, [islandStage, paintedStage, morphDuration]);

  // Measure the real section at its target width, independently of the animated shell.
  // A short section fits tightly; the body scrolls only at the display's height limit.
  useLayoutEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer || contentStage!=='drawer' || notchNotification || showCircleToAsk || showDictation || showScheduled || showLoadout) return;
    const measure = () => {
      if (!drawer.offsetHeight) return;
      const style = surfaceRef.current && getComputedStyle(surfaceRef.current);
      const borders = style ? parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth) : 0;
      const height = Math.min(maxDrawerHeight,Math.ceil(drawer.offsetHeight+borders));
      setDrawerMeasurement(previous => previous.key===drawerLayoutKey && previous.height===height ? previous : {key:drawerLayoutKey,height});
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(drawer);
    return () => observer.disconnect();
  }, [drawerLayoutKey, maxDrawerHeight, contentStage, notchNotification, showCircleToAsk, showDictation, showScheduled, showLoadout]);

  const shellRadius =
    isOrbCircle
      ? (islandStage === 'collapsed' ? 'rounded-full' : 'rounded-3xl')
      : currentShape === 'dynamic-island'
      ? (islandStage === 'collapsed' ? 'rounded-full' : 'rounded-3xl')
      : currentShape === 'mohivx-modern'
      ? (islandStage === 'collapsed' ? 'rounded-b-lg' : 'rounded-xl')
      : (islandStage === 'collapsed' ? 'rounded-b-[10px]' : islandStage === 'compact-media' ? 'rounded-b-[22px]' : 'rounded-b-[28px]');

  useLayoutEffect(() => {
    if (!electron || showCircleToAsk || showDictation || showScheduled || showLoadout) return;
    // Wait for the measurement before resizing either axis on a section change.
    if (islandStage==='drawer' && !notchNotification && !drawerReady) return;
    const width = Math.min(shellWidth,maxSurfaceWidth/islandScaleX);
    const target = surfaceViewport(width, surfaceHeight, currentShape, islandScaleX,edge,{bars:musicBars,satellite:musicSatellite},islandScaleY);
    // Grow before drawing, keep space throughout a close animation, then fit the final shape.
    if (target.width > window.innerWidth || target.height > window.innerHeight) {
      electron.ipcRenderer.send('set-window-mode', {mode:islandStage,width:Math.max(window.innerWidth,target.width),height:Math.max(window.innerHeight,target.height)});
    }
    const finish = () => electron.ipcRenderer.send('set-window-mode', {mode:islandStage,...target});
    const timer = setTimeout(finish, morphDuration + 40);
    return () => clearTimeout(timer);
  }, [shellWidth, surfaceHeight, islandStage, currentShape, islandScaleX, islandScaleY, edge, morphDuration, maxSurfaceWidth, drawerReady, notchNotification, musicBars, musicSatellite, showCircleToAsk, showDictation, showScheduled, showLoadout]);

  return (
    <div
      className="island-edge-root fixed inset-0 z-50 flex select-none"
      data-island-edge={edge}
      data-island-position={appSettings.position}
      data-music-bars-active={musicBars}
      data-music-satellite-active={musicSatellite}
      dir="ltr"
      data-panel-corners={appSettings.panelCorners || 'rounded'}
      style={{...themeVariables(appSettings),'--app-accent':accentColor,'--island-fill':islandFill,'--panel-card':'#141518','--edge-inset':`${COLLAPSED_SHAPES[currentShape]?.inset||0}px`,'--ear-gutter':`${earGutter}px`} as React.CSSProperties}
    >
      {/* Outer morphing wrapper that carries the ears and seamless drop-shadow */}
      <div
        ref={shellRef}
        className="relative shrink-0 flow-root dynamic-island-shell island-anchor"
        style={{
          '--island-duration': `${morphDuration}ms`,
          width: Math.min(shellWidth,maxSurfaceWidth/islandScaleX)*islandScaleX,
          height: surfaceHeight*islandScaleY,
          filter: 'none', display: showCircleToAsk || showDictation || showScheduled || showLoadout ? 'none' : undefined
        } as React.CSSProperties}
      >
        {(musicBars||musicSatellite)&&<MusicDecorations edge={edge} width={collapsed.width} height={collapsed.height} scaleX={islandScaleX} scaleY={islandScaleY} bars={musicBars} satellite={musicSatellite} artwork={glanceArtwork} reduced={reduceMotion} onOpen={openMusic} label={appLang==='ar'?'فتح التحكم بالموسيقى':'Open music controls'}/>}
        {/* Concave Ear Corners - ONLY for classic notch shape */}
        {showEars && (
          <>
            <svg
              data-island-ear="left"
              className="island-ear absolute right-full top-0 pointer-events-none"
              style={{width:earWidth,height:earHeight,color:islandFill,fill:islandFill,stroke:'none'}}
              viewBox="0 0 12 12"
              fill={islandFill} stroke="none" aria-hidden="true"
            >
              <path d="M 0 0 C 6.6 0 12 5.4 12 12 L 12 0 Z" />
            </svg>
            <svg
              data-island-ear="right"
              className="island-ear absolute left-full top-0 pointer-events-none"
              style={{width:earWidth,height:earHeight,color:islandFill,fill:islandFill,stroke:'none'}}
              viewBox="0 0 12 12"
              fill={islandFill} stroke="none" aria-hidden="true"
            >
              <path d="M 0 12 C 0 5.4 5.4 0 12 0 L 0 0 Z" />
            </svg>
          </>
        )}

        {/* SINGLE UNIFIED MASTER ISLAND SHELL (True Fluid Morph Architecture) */}
        <div
          ref={surfaceRef}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          data-island-stage={islandStage}
          data-island-shape={currentShape}
          data-island-media={mediaGlance?'playing':undefined}
          data-surface-tone={isLightMode?'light':'dark'}
          className={`absolute top-0 left-0 dynamic-island-shell shape-${currentShape} ${islandStage!=='collapsed'||noticeCompact?'is-expanded':''} theme-${currentTheme} ${shellRadius} ${
            isLightMode ? 'bg-[#f4f4f7] text-[#1d1d1f] border-b border-black/10' : 'bg-black text-white'
          } flex flex-col overflow-hidden`}
          style={{
            width: Math.min(shellWidth,maxSurfaceWidth/islandScaleX),
            height: surfaceHeight,
            borderRadius:currentShape==='classic'?classicRadii:noticeCompact?20:undefined,
            transform: `scale(${islandScaleX}, ${islandScaleY})`,
            transformOrigin: 'top left',
            opacity: 1,
            '--mohivx-accent': accentColor,
            backgroundColor:isLightMode?'#f4f4f7':'#000000',
            border:appSettings.islandStroke&&appSettings.islandStroke!=='off'?((appSettings.islandStroke==='thin'?1:appSettings.islandStroke==='medium'?2:3)+'px solid '+(appSettings.islandStrokeColor||accentColor)):undefined,
            boxSizing:'border-box',
            '--island-duration': `${morphDuration}ms`
          } as React.CSSProperties}
        >
          <div className="island-surface-content w-full flex flex-col shrink-0 items-center" style={{height:notchNotification?46:noticeCompact?'100%':contentStage==='drawer'?'auto':heightForStage(contentStage),opacity:closing?0:1,pointerEvents:closing?'none':undefined,transition:`opacity ${Math.min(120,morphDuration)}ms ease-out`}}>
          {noticeCompact&&noticeCard}
          {/* Notification Alert in Notch (References 175300.png & 175316.png) */}
          {notchNotification && (
            <div className="w-full h-full px-4 flex items-center justify-between bg-[#0E0F13] text-white animate-island-content border border-[color:var(--app-accent)]/30">
              <div className="flex items-center gap-2 truncate">
                <Sparkles className="w-4 h-4 text-[color:var(--app-accent)] animate-pulse shrink-0" />
                <span className="text-xs font-bold truncate">{notchNotification}</span>
              </div>
              <button onClick={() => setNotchNotification(null)} className="text-zinc-400 hover:text-white p-1 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 1. COLLAPSED NOTCH CONTENT */}
          {!notchNotification && !noticeCompact && contentStage === 'collapsed' && (
            mediaGlance ? <MusicGlance presentation={music.presentation} theme={music.theme} fixed={music.fixed} audible={outputAudio} fallback={musicState.outputOnly} title={glanceTitle} artist={glanceArtist} artwork={glanceArtwork} shape={currentShape} side={sideEdge} ar={appLang==='ar'} waiting={agentGlance.waiting>0} onWheel={handleNotchWheel} onOpen={openMusic}/> : isOrbCircle ? (
              <div
                onWheel={handleNotchWheel}
                onClick={() => {
                  openDefaultDrawer();
                }}
                className="w-full h-full rounded-full flex items-center justify-center cursor-pointer bg-black/90 border border-white/20 shadow-lg group hover:scale-105 transition-transform"
                title={appLang === 'ar' ? 'اضغط لفتح جزيرة MOHIVX' : 'Click to open MOHIVX Island'}
              >
                <CompanionCharacter skin={activeSoulSkin} size={18} state={mediaGlance ? 'listening' : 'idle'} />{appSettings.clockWhileAsleep&&<small style={{fontSize:7,lineHeight:1}}>{asleepClockLabel}</small>}
              </div>
            ) : currentShape === 'dynamic-island' ? (
              <div
                onWheel={handleNotchWheel}
                onClick={() => {
                  openDefaultDrawer();
                }}
                className="island-mini-capsule w-full h-full rounded-full flex items-center justify-between px-2 cursor-pointer bg-black/90 border border-white/20 hover:border-[color:var(--app-accent)]/50 transition-colors"
                title={appLang === 'ar' ? 'اضغط لفتح جزيرة MOHIVX' : 'Click to open MOHIVX Island'}
              >
                <div className="flex items-center gap-2">
                  <CompanionCharacter skin={activeSoulSkin} size={20} state="idle" />
                  
                </div>
                <div className="w-2 h-2 rounded-full" style={{background:agentGlance.status==='waiting'?'#f5a524':agentGlance.status==='working'?accentColor:agentGlance.status==='completed'?accentColor:'#6b7079'}} />{appSettings.clockWhileAsleep&&<small style={{fontSize:8,whiteSpace:'nowrap'}}>{asleepClockLabel}</small>}
              </div>
            ) : (
              <div
                id="hitodama-collapsed-notch"
                onWheel={handleNotchWheel}
                onClick={() => {
                  openDefaultDrawer();
                }}
                className="island-mini-notch w-full h-full cursor-pointer flex items-center justify-center"
                title={appLang === 'ar' ? 'اضغط لفتح جزيرة MOHIVX' : 'Click to open MOHIVX Island'}
              >{appSettings.clockWhileAsleep&&<small style={{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',fontSize:10,fontVariantNumeric:'tabular-nums'}}>{asleepClockLabel}</small>}<span aria-hidden className="w-10 h-[3px] rounded-full" style={{background:agentGlance.status==='waiting'?'#f5a524':accentColor,boxShadow:`0 0 10px ${accentColor}66`}}/></div>
            )
          )}

        {/* 2. COMPACT AUDIO CAPSULE CONTENT */}
        {!notchNotification && !noticeCompact && contentStage === 'compact-media' && (
          <div
            onWheel={handleNotchWheel}
            onClick={() => {
              setTabDirection('fade');
              setActiveTab('controls');
              transitionToStage('drawer');
            }}
            className="w-full h-full px-3.5 flex items-center justify-between cursor-pointer animate-island-content"
            title={appLang === 'ar' ? 'اضغط لفتح درج التحكم الكامل • اسحب للأعلى للإغلاق' : 'Click to open full drawer • Scroll up to collapse'}
          >
            <div className="flex items-center gap-2 overflow-hidden pr-2">
              {mediaInfo.artwork&&<img className="w-8 h-8 rounded-lg object-cover shrink-0" src={mediaInfo.artwork} alt=""/>}
              <div className="flex items-end gap-0.5 h-4 w-4 shrink-0">
                <span className={`w-1 bg-[color:var(--app-accent)] rounded-full ${mediaIsPlaying ? 'animate-wave-1' : 'h-1.5'}`} />
                <span className={`w-1 bg-[color:var(--app-accent)] rounded-full ${mediaIsPlaying ? 'animate-wave-2' : 'h-3'}`} />
                <span className={`w-1 bg-[color:var(--app-accent)] rounded-full ${mediaIsPlaying ? 'animate-wave-3' : 'h-2'}`} />
              </div>
              <div className="flex flex-col truncate" dir="auto">
                <span className="text-xs font-bold truncate max-w-[190px]" dir="auto">{mediaInfo.title || (appLang === 'ar' ? 'صوت قيد التشغيل' : 'Playing Audio')}</span>
                <span className="text-[10px] opacity-70 truncate max-w-[170px]" dir="auto">
                  {mediaInfo.duration > 0 ? `${formatTrackTime(mediaInfo.position)} / ${formatTrackTime(mediaInfo.duration)}` : (mediaInfo.artist || 'Windows Media')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMediaControl('prev');
                }}
                className="p-1 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title={appLang === 'ar' ? 'المقطع السابق' : 'Previous Track'}
              >
                <SkipBack className="w-3.5 h-3.5 fill-current" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMediaControl('play-pause');
                }}
                className="w-7 h-7 rounded-full bg-[color:var(--app-accent)] text-black flex items-center justify-center hover:scale-105 transition-transform cursor-pointer"
                title={mediaIsPlaying ? (appLang === 'ar' ? 'إيقاف مؤقت' : 'Pause') : (appLang === 'ar' ? 'تشغيل' : 'Play')}
              >
                {mediaIsPlaying ? <Pause className="w-3.5 h-3.5 fill-black" /> : <Play className="w-3.5 h-3.5 fill-black ml-0.5" />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMediaControl('next');
                }}
                className="p-1 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title={appLang === 'ar' ? 'المقطع التالي' : 'Next Track'}
              >
                <SkipForward className="w-3.5 h-3.5 fill-current" />
              </button>
            </div>
          </div>
        )}

        {/* 3. FULL DRAWER CONTENT */}
        {!notchNotification && contentStage === 'drawer' && (
          <div ref={drawerRef} className="island-drawer-content flex flex-col shrink-0 overflow-hidden animate-island-content" style={{width:drawerWidth,maxHeight:Math.max(1,maxDrawerHeight-2)}} onWheel={(e) => e.stopPropagation()}>
            {noticeCard}
            {/* Top Notch Tab Bar */}
            <div
              onWheel={handleNotchWheel}
              aria-label={appLang==='ar'?'أقسام الجزيرة':'Island sections'}
              dir={appLang==='ar'?'rtl':'ltr'}
              className={`island-section-nav flex items-center justify-center gap-1 sm:gap-1.5 pt-2.5 pb-2 px-3 border-b flex-wrap shrink-0 ${
                isLightMode ? 'border-black/5' : 'border-white/5'
              }`}
            >
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabSelect(tab.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-all duration-300 ease-apple cursor-pointer ${
                      isActive
                        ? 'bg-[var(--panel-card)] text-[color:var(--app-accent)] scale-[1.03]'
                        : isLightMode
                        ? 'text-zinc-600 hover:text-black hover:bg-black/5'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {tab.label}
                    {tab.id==='agents'&&agentGlance.waiting>0&&<span className="ml-1 text-[9px] text-amber-300">{agentGlance.waiting}</span>}
                  </button>
                );
              })}
              <button
                onClick={() => {
                  if (electron && electron.ipcRenderer) {
                    electron.ipcRenderer.send('open-hub-window');
                  }
                }}
                className={`p-1.5 rounded-full ${
                  isLightMode
                    ? 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/80 active:bg-zinc-300/80'
                    : 'text-zinc-400 hover:text-white hover:bg-white/10 active:bg-white/15'
                } transition-all cursor-pointer shrink-0 ml-0.5 focus:outline-none focus:ring-1 focus:ring-white/20`}
                title={appLang === 'ar' ? 'الإعدادات (Alt+Space)' : 'Settings (Alt+Space)'}
                aria-label={appLang === 'ar' ? 'الإعدادات' : 'Settings'}
              >
                <Settings className="w-3.5 h-3.5 stroke-[1.8]" />
              </button>
              <button
                onClick={handleQuitAppAndServer}
                className={`p-1.5 rounded-full ${
                  isLightMode ? 'text-zinc-400 hover:text-rose-600 hover:bg-rose-50' : 'text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10'
                } transition-colors ml-0.5 cursor-pointer shrink-0`}
                title={appLang === 'ar' ? 'إغلاق MOHIVX Island' : 'Quit MOHIVX Island'}
                aria-label={appLang === 'ar' ? 'إغلاق' : 'Quit'}
              >
                <PowerOff className="w-3.5 h-3.5 stroke-[1.8]" />
              </button>
            </div>

            {/* Tab Body Contents */}
            <div className="island-tab-body p-3.5 min-h-0 overflow-y-auto flex flex-col" data-island-tab={activeTab} style={{flex:'0 1 auto'}} onWheel={(e) => e.stopPropagation()}>
              {activeTab==='phone'&&<PhoneDashboard/>}
              {activeTab==='agents'&&<><div className="flex items-center justify-between mb-2"><b className="text-xs">{appLang==='ar'?'طلبات الوكلاء':'Agent requests'}</b><button className="text-xs text-zinc-400" onClick={()=>electron?.ipcRenderer.send('open-hub-tab','agents')}>{appLang==='ar'?'فتح قسم الوكلاء':'Open agent center'}</button></div><AgentPanel ar={appLang==='ar'}/></>}
              {/* 0. SOUL AI ASSISTANT & AGENT TAB */}
              {activeTab === 'ai' && (
                <div key="ai" className={`ai-section flex flex-col gap-2.5 relative ${tabAnimationClass}`}>
                  {/* Top Bar: Soul Info & Ghost Cursor Trigger */}
                  <div className={`p-2.5 rounded-2xl flex items-center justify-between border ${
                    isLightMode ? 'bg-white/70 border-zinc-200' : 'bg-[var(--panel-card)]/70 border-white/5'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div
                        onClick={() => setShowLoadout(true)}
                        className="w-10 h-10 rounded-xl bg-[var(--panel-card)] border border-[#23242A] flex items-center justify-center relative overflow-hidden cursor-pointer hover:border-[color:var(--app-accent)] transition-colors"
                        title={appLang === 'ar' ? 'فتح لودآوت الروح والشخصية' : 'Open Soul Loadout Hub'}
                      >
                        <CompanionCharacter skin={activeSoulSkin}
                          state={isAiThinking ? 'thinking' : 'idle'}
                          size={36}
                          showGlow={false}
                        />
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white tracking-wide">{appLang === 'ar' ? 'مساعد MOHIVX' : 'MOHIVX Assistant'}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold border ${
                            isAiThinking
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse'
                              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          }`}>
                            {isAiThinking
                              ? (appLang === 'ar' ? 'ينفذ ويفكر...' : 'Thinking...')
                              : appSettings.localOnlyMode ? (appLang === 'ar' ? 'الوضع المحلي' : 'Local mode')
                              : (appLang === 'ar' ? 'جاهز' : 'Ready')}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-400">
                          {appLang === 'ar' ? 'تحكم كامل بنظام الويندوز وتصفح الويب' : 'Autonomous Windows Control & Web Navigation'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setShowCircleToAsk(true)}
                        className="px-2 py-1 rounded-full bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/25 text-[10px] font-semibold text-sky-300 transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                        title={appLang === 'ar' ? 'تحديد الشاشة والسؤال' : 'Circle to Ask'}
                      >
                        <Search className="w-3 h-3 text-sky-300" />
                        <span>{appLang === 'ar' ? 'تحديد' : 'Radar'}</span>
                      </button>

                      <button
                        onClick={() => setShowDictation(true)}
                        className="px-2 py-1 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/25 text-[10px] font-semibold text-rose-300 transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                        title={appLang === 'ar' ? 'الإملاء الذكي (Alt+J)' : 'Smart Dictation (Alt+J)'}
                      >
                        <Mic className="w-3 h-3 text-rose-300" />
                        <span>{appLang === 'ar' ? 'إملاء' : 'Dictate'}</span>
                      </button>

                      <button
                        onClick={() => setShowScheduled(true)}
                        className="px-2 py-1 rounded-full bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 text-[10px] font-semibold text-amber-300 transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                        title={appLang === 'ar' ? 'الإجراءات المجدولة (Alt+R)' : 'Scheduled Actions (Alt+R)'}
                      >
                        <Clock className="w-3 h-3 text-amber-300" />
                        <span>{appLang === 'ar' ? 'الروتينات' : 'Routines'}</span>
                      </button>

                      <button
                        onClick={handleTestGhostCursor}
                        className="px-2 py-1 rounded-full bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/25 text-[10px] font-semibold text-purple-300 transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                        title={appLang === 'ar' ? 'تشغيل الماوس الوهمي التفاعلي على الشاشة' : 'Trigger Interactive Ghost Cursor'}
                      >
                        <Sparkles className="w-3 h-3 text-purple-300 animate-spin" style={{ animationDuration: '4s' }} />
                        <span>{appLang === 'ar' ? 'المؤشر' : 'Cursor'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Chat / Message Stream */}
                  <div
                    ref={aiChatScrollRef}
                    className={`ai-message-stream overflow-y-auto pr-1 space-y-2.5 rounded-2xl p-3 border ${
                      isLightMode ? 'bg-zinc-100/60 border-zinc-200' : 'bg-black/30 border-white/5'
                    }`}
                  >
                    {aiChatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} gap-1`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-br-sm shadow-sm'
                              : isLightMode
                              ? 'bg-white text-zinc-900 border border-zinc-200 rounded-bl-sm shadow-sm'
                              : 'bg-[var(--panel-card)] text-zinc-200 border border-white/10 rounded-bl-sm'
                          }`}
                        >
                          {msg.text}
                        </div>
                        {msg.toolUsed && (
                          <div className="flex items-center gap-1 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                            <Zap className="w-2.5 h-2.5" />
                            <span>{appLang === 'ar' ? `تم تنفيذ الأداة: ${msg.toolUsed}` : `Executed: ${msg.toolUsed}`}</span>
                          </div>
                        )}
                        <span className="text-[9px] text-zinc-500 px-1">{msg.time}</span>
                      </div>
                    ))}
                    {isAiThinking && (
                      <div className="flex items-center gap-2 text-xs text-sky-400 bg-sky-500/10 border border-sky-500/20 p-2.5 rounded-2xl max-w-fit animate-pulse">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{aiStatusMessage || (appLang === 'ar' ? 'يفكر...' : 'Thinking...')}</span>
                      </div>
                    )}
                  </div>

                  {/* Quick Action Chips */}
                  <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5 shrink-0">
                    <button
                      onClick={() => handleSendAiPrompt(appLang === 'ar' ? 'افتح سبوتيفاي' : 'Open Spotify')}
                      className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-medium text-zinc-300 hover:text-white transition-all whitespace-nowrap cursor-pointer active:scale-95"
                    >
                      🎵 {appLang === 'ar' ? 'افتح سبوتيفاي' : 'Open Spotify'}
                    </button>
                    <button
                      onClick={() => handleSendAiPrompt(appLang === 'ar' ? 'ارفع الصوت' : 'Volume up')}
                      className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-medium text-zinc-300 hover:text-white transition-all whitespace-nowrap cursor-pointer active:scale-95"
                    >
                      🔊 {appLang === 'ar' ? 'ارفع الصوت' : 'Volume Up'}
                    </button>
                    <button
                      onClick={() => handleSendAiPrompt(appLang === 'ar' ? 'ابحث في يوتيوب عن اغاني لوفي' : 'Search YouTube for lofi music')}
                      className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-medium text-zinc-300 hover:text-white transition-all whitespace-nowrap cursor-pointer active:scale-95"
                    >
                      ▶️ {appLang === 'ar' ? 'يوتيوب لوفي' : 'YouTube Lofi'}
                    </button>
                    <button
                      onClick={() => handleSendAiPrompt(appLang === 'ar' ? 'ما هي مواصفات وحالة الجهاز؟' : 'What is the system status?')}
                      className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-medium text-zinc-300 hover:text-white transition-all whitespace-nowrap cursor-pointer active:scale-95"
                    >
                      📊 {appLang === 'ar' ? 'حالة الجهاز' : 'System Stats'}
                    </button>
                  </div>

                  {/* Input Command Bar */}
                  <div className={`p-1.5 rounded-2xl flex items-center gap-2 border ${
                    isLightMode ? 'bg-white border-zinc-200' : 'bg-[var(--panel-card)] border-white/10'
                  }`}>
                    <div className="pl-2 pr-1 text-zinc-400">
                      <Bot className="w-4 h-4 text-sky-400" />
                    </div>
                    <input
                      type="text"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendAiPrompt()}
                      disabled={isAiThinking}
                      placeholder={
                        appLang === 'ar'
                          ? 'اطلب أمراً (مثلاً: "افتح سبوتيفاي"، "ارفع الصوت"، "ابحث عن...")'
                          : 'Give a command (e.g., "Open Spotify", "Volume up", "Search for...")'
                      }
                      className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 outline-none"
                    />
                    <button
                      onClick={() => handleSendAiPrompt(appLang === 'ar' ? 'مرحباً MOHIVX، كيف حالك؟' : 'Hello MOHIVX, how are you?')}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-sky-300 transition-all cursor-pointer"
                      title={appLang === 'ar' ? 'تحدث مع MOHIVX' : 'Speak to MOHIVX'}
                    >
                      <Mic className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleSendAiPrompt()}
                      disabled={!aiPrompt.trim() || isAiThinking}
                      className={`p-2 rounded-xl transition-all cursor-pointer ${
                        aiPrompt.trim() && !isAiThinking
                          ? 'bg-sky-500 hover:bg-sky-400 text-white shadow-md shadow-sky-500/20 active:scale-95'
                          : 'bg-white/5 text-zinc-500 cursor-not-allowed'
                      }`}
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* 1. CONTROLS TAB */}
              {activeTab === 'controls' && (
                <div key="controls" className={`flex flex-col gap-2.5 relative ${tabAnimationClass}`}>
                  {/* Row 1: Wi-Fi/Ethernet, Bluetooth, Audio */}
                  <div className="grid grid-cols-3 gap-2">
                    {/* Wi-Fi / Ethernet */}
                    <div className="relative dropdown-container">
                      <div
                        onClick={handleToggleWifi}
                        className={`h-14 rounded-2xl px-3 flex items-center justify-between cursor-pointer transition-all duration-200 ${
                          (telemetry.network.isEthernet || wifiActive)
                            ? 'bg-[color:var(--app-accent)] text-black shadow-sm'
                            : isLightMode
                            ? 'bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50'
                            : 'bg-[var(--panel-card)] text-white hover:bg-[var(--panel-card)]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            (telemetry.network.isEthernet || wifiActive)
                              ? 'bg-[color:var(--app-accent)] text-black'
                              : isLightMode
                              ? 'bg-zinc-200 text-zinc-700'
                              : 'bg-[var(--panel-card)] text-white'
                          }`}>
                            {telemetry.network.isEthernet ? <Network className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
                          </div>
                          <div className="flex flex-col leading-tight">
                            <span className="font-bold text-xs">
                              {telemetry.network.isEthernet ? (appLang === 'ar' ? 'إيثرنت' : 'Ethernet') : (appLang === 'ar' ? 'واي فاي' : 'Wi-Fi')}
                            </span>
                            <span className="text-[11px] opacity-80 truncate max-w-[90px]">
                              {telemetry.network.isEthernet
                                ? (appLang === 'ar' ? 'متصل سلكياً' : 'Connected')
                                : wifiActive
                                ? (telemetry.wifi.ssid || (appLang === 'ar' ? 'متصل' : 'Connected'))
                                : (appLang === 'ar' ? 'متوقف' : 'Off')}
                            </span>
                          </div>
                        </div>
                        {!telemetry.network.isEthernet && (
                          <button
                            onClick={handleOpenWifiMenu}
                            className="p-1 rounded-lg hover:bg-black/10 transition-colors dropdown-trigger-btn"
                            title={appLang === 'ar' ? 'الشبكات المتاحة' : 'Available Networks'}
                          >
                            <ChevronDown className="w-4 h-4 opacity-70" />
                          </button>
                        )}
                      </div>

                      {/* Wi-Fi Networks Popover */}
                      {showWifiMenu && !telemetry.network.isEthernet && (
                        <div className={`absolute top-16 left-0 w-64 ${
                          isLightMode ? 'bg-white text-zinc-900 border-zinc-200' : 'bg-[var(--panel-card)] text-white border-white/10'
                        } border rounded-2xl p-2.5 z-30 shadow-2xl flex flex-col gap-1.5 animate-island-content dropdown-popover-menu max-h-[210px] overflow-y-auto`}>
                          <span className="text-[10px] font-semibold text-zinc-400 uppercase px-1">
                            {appLang === 'ar' ? 'الشبكات المتاحة' : 'Available Networks'}
                          </span>
                          {availableWifi.map((net) => (
                            <div
                              key={net}
                              onClick={() => handleConnectWifi(net)}
                              className={`flex items-center justify-between p-2 rounded-xl ${
                                isLightMode ? 'hover:bg-zinc-100' : 'hover:bg-white/5'
                              } cursor-pointer text-xs`}
                            >
                              <span className="font-medium truncate">{net}</span>
                              {net === telemetry.wifi.ssid && wifiActive && <Check className="w-3.5 h-3.5 text-[color:var(--app-accent)]" />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Bluetooth */}
                    <div className="relative dropdown-container">
                      <div
                        onClick={() => { electron?.ipcRenderer.send('open-external-link', 'ms-settings:bluetooth'); setShowBtMenu(true); }}
                        className={`h-14 rounded-2xl px-3 flex items-center justify-between cursor-pointer transition-all duration-200 ${
                          btActive
                            ? 'bg-[color:var(--app-accent)] text-black shadow-sm'
                            : isLightMode
                            ? 'bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50'
                            : 'bg-[var(--panel-card)] text-white hover:bg-[var(--panel-card)]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            btActive
                              ? 'bg-[color:var(--app-accent)] text-black'
                              : isLightMode
                              ? 'bg-zinc-200 text-zinc-700'
                              : 'bg-[var(--panel-card)] text-white'
                          }`}>
                            <Bluetooth className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col leading-tight">
                            <span className="font-bold text-xs">{appLang === 'ar' ? 'بلوتوث' : 'Bluetooth'}</span>
                            <span className="text-[11px] opacity-70 truncate max-w-[90px]">
                              {btActive
                                ? (telemetry.bluetooth.connectedDevices && telemetry.bluetooth.connectedDevices.length > 0
                                  ? telemetry.bluetooth.connectedDevices[0]
                                  : (appLang === 'ar' ? 'نشط' : 'Active'))
                                : (appLang === 'ar' ? 'متوقف' : 'Off')}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowBtMenu(!showBtMenu);
                            setShowWifiMenu(false);
                            setShowAudioMenu(false);
                          }}
                          className="p-1 rounded-lg hover:bg-black/10 transition-colors dropdown-trigger-btn"
                        >
                          <ChevronDown className="w-4 h-4 opacity-70" />
                        </button>
                      </div>

                      {showBtMenu && (
                        <div className={`absolute top-16 left-0 w-64 ${
                          isLightMode ? 'bg-white text-zinc-900 border-zinc-200' : 'bg-[var(--panel-card)] text-white border-white/10'
                        } border rounded-2xl p-2.5 z-30 shadow-2xl flex flex-col gap-1.5 text-xs animate-island-content dropdown-popover-menu max-h-[210px] overflow-y-auto`}>
                          <span className="text-[10px] font-semibold text-zinc-400 uppercase px-1">
                            {appLang === 'ar' ? 'الأجهزة المقترنة' : 'Paired Devices'}
                          </span>
                          {telemetry.bluetooth.connectedDevices && telemetry.bluetooth.connectedDevices.length > 0 ? (
                            telemetry.bluetooth.connectedDevices.map((devName) => (
                              <div key={devName} className={`p-2 rounded-xl ${isLightMode ? 'bg-zinc-100' : 'bg-white/5'} flex items-center justify-between`}>
                                <span className="truncate text-xs font-medium">{devName}</span>
                                <span className="text-[10px] text-emerald-400 font-semibold shrink-0">
                                  {appLang === 'ar' ? 'مقترن' : 'Paired'}
                                </span>
                              </div>
                            ))
                          ) : (
                            <div className={`p-2 rounded-xl ${isLightMode ? 'bg-zinc-100' : 'bg-white/5'} flex items-center justify-between`}>
                              <span className="truncate text-xs">{telemetry.bluetooth.adapter || 'Realtek Bluetooth 5.4'}</span>
                              <span className="text-[10px] text-zinc-400 shrink-0">{appLang === 'ar' ? 'جاهز' : 'Ready'}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Audio Output Selector */}
                    <div className="relative dropdown-container">
                      <div
                        onClick={handleToggleMute}
                        className={`h-14 rounded-2xl px-3 flex items-center justify-between cursor-pointer transition-all duration-200 ${
                          !audioMuted
                            ? 'bg-[color:var(--app-accent)] text-black shadow-sm'
                            : isLightMode
                            ? 'bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50'
                            : 'bg-[var(--panel-card)] text-white hover:bg-[var(--panel-card)]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            !audioMuted
                              ? 'bg-[color:var(--app-accent)] text-black'
                              : isLightMode
                              ? 'bg-zinc-200 text-zinc-700'
                              : 'bg-[var(--panel-card)] text-white'
                          }`}>
                            {!audioMuted ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                          </div>
                          <div className="flex flex-col leading-tight">
                            <span className="font-bold text-xs">{appLang === 'ar' ? 'جهاز الصوت' : 'Audio'}</span>
                            <span className="text-[11px] opacity-80 truncate max-w-[90px]">
                              {!audioMuted
                                ? selectedAudioDevice.replace(/\s*\(High Definition Audio Device\)/g, '').replace(/\s*\(VB-Audio Virtual Cable\)/g, '') || (appLang === 'ar' ? 'مكبر الصوت' : 'Speakers')
                                : (appLang === 'ar' ? 'مكتوم' : 'Muted')}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={handleOpenAudioMenu}
                          className="p-1 rounded-lg hover:bg-black/10 transition-colors dropdown-trigger-btn"
                          title={appLang === 'ar' ? 'تحديد جهاز إخراج الصوت' : 'Select Audio Output Device'}
                        >
                          <ChevronDown className="w-4 h-4 opacity-70" />
                        </button>
                      </div>

                      {showAudioMenu && (
                        <div className={`absolute top-16 right-0 w-72 ${
                          isLightMode ? 'bg-white text-zinc-900 border-zinc-200' : 'bg-[var(--panel-card)] text-white border-white/10'
                        } border rounded-2xl p-2.5 z-30 shadow-2xl flex flex-col gap-1 text-xs animate-island-content dropdown-popover-menu max-h-[210px] overflow-y-auto`}>
                          <span className="text-[10px] font-semibold text-zinc-400 uppercase px-1">
                            {appLang === 'ar' ? 'أجهزة تشغيل الصوت' : 'Audio Output Devices'}
                          </span>
                          {audioDevices.map((dev) => (
                            <div
                              key={dev}
                              onClick={() => {
                                setSelectedAudioDevice(dev);
                                setShowAudioMenu(false);
                                if (electron && electron.ipcRenderer) {
                                  electron.ipcRenderer.send('set-audio-device', dev);
                                }
                              }}
                              className={`flex items-center justify-between p-2 rounded-xl ${
                                isLightMode ? 'hover:bg-zinc-100' : 'hover:bg-white/5'
                              } cursor-pointer`}
                            >
                              <span className="truncate pr-2">{dev}</span>
                              {selectedAudioDevice === dev && <Check className="w-3.5 h-3.5 text-[color:var(--app-accent)]" />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Wide Dark Mode / Light Mode Tile */}
                  <div
                    onClick={handleToggleTheme}
                    className={`h-14 rounded-2xl px-4 flex items-center justify-between cursor-pointer transition-all duration-200 ${
                      !isLightMode
                        ? 'bg-[color:var(--app-accent)] text-black shadow-sm'
                        : 'bg-white text-zinc-900 border border-zinc-200 shadow-sm hover:bg-zinc-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        !isLightMode ? 'bg-[color:var(--app-accent)] text-black' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {!isLightMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                      </div>
                      <div className="flex flex-col leading-tight">
                        <span className="font-bold text-xs">
                          {!isLightMode ? (appLang === 'ar' ? 'الوضع الداكن' : 'Dark mode') : (appLang === 'ar' ? 'الوضع الفاتح' : 'Light mode')}
                        </span>
                        <span className="text-[11px] opacity-80">
                          {!isLightMode
                            ? (appLang === 'ar' ? 'مفعل • اضغط للتحويل للوضع الصباحي' : 'On • Click for Morning Light Theme')
                            : (appLang === 'ar' ? 'مفعل • اضغط للتحويل للوضع الداكن' : 'On • Click for Obsidian Dark Theme')}
                        </span>
                      </div>
                    </div>
                    <span className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full ${
                      !isLightMode ? 'bg-black/10 text-black' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {!isLightMode ? (appLang === 'ar' ? 'داكن' : 'DARK') : (appLang === 'ar' ? 'فاتح' : 'LIGHT')}
                    </span>
                  </div>

                  {/* Row 3: Real-Time Smooth Volume Drag Slider */}
                  <div
                    id="volume-track-bar"
                    onPointerCancel={() => {isDraggingVolume.current=false;setVolumeDragging(false);}}
                    onPointerUp={() => {isDraggingVolume.current=false;setVolumeDragging(false);}}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      isDraggingVolume.current = true;
                      setVolumeDragging(true);
                      const rect = e.currentTarget.getBoundingClientRect();
                      const p = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
                      setVolume(p);
                      if (electron && electron.ipcRenderer) {
                        electron.ipcRenderer.send('volume-control', { action: 'set', value: p });
                      }
                    }}
                    className={`h-10 ${
                      isLightMode ? 'bg-zinc-200 border border-zinc-300' : 'bg-[var(--panel-card)]'
                    } rounded-full relative overflow-hidden flex items-center px-4 cursor-pointer select-none`}
                  >
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-[color:var(--app-accent)] rounded-full pointer-events-none transition-[width] duration-75"
                      style={{ width: `${volume}%` }}
                    />
                    <div className="relative z-10 flex items-center justify-between w-full pointer-events-none">
                      {volume > 0 ? (
                        <Volume2 className={`w-4 h-4 ${volume > 8 ? 'text-black' : isLightMode ? 'text-zinc-700' : 'text-white'}`} />
                      ) : (
                        <VolumeX className="w-4 h-4 text-zinc-400" />
                      )}
                      <span className={`text-xs font-bold ${isLightMode && volume < 50 ? 'text-zinc-900' : 'text-white'}`}>{volume}%</span>
                    </div>
                  </div>

                  {/* Row 4: REAL Windows Media Player Card (Visible when media title exists, even if paused) */}
                  {Boolean(mediaInfo.title || outputAudio) && (
                    <div className={`${
                      isLightMode ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-[var(--panel-card)] text-white border-white/5'
                    } border rounded-2xl p-3 flex flex-col gap-2 shadow-sm animate-island-content`}>
                      <div className="flex items-center justify-between text-[11px] text-zinc-400">
                        <div className="flex items-center gap-1.5">
                          <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
                          <span className="truncate max-w-[280px]">{selectedAudioDevice}</span>
                        </div>
                        <span className={`font-mono text-[10px] ${mediaIsPlaying ? 'text-emerald-400 font-bold' : 'text-zinc-400'}`}>
                          {mediaInfo.title
                            ? mediaIsPlaying ? (appLang === 'ar' ? 'يعمل الآن' : 'Playing') : (appLang === 'ar' ? 'متوقف مؤقتاً' : 'Paused')
                            : (appLang === 'ar' ? 'صوت الجهاز يعمل' : 'Device audio is active')}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 overflow-hidden pr-2">
                          <MusicCover artwork={mediaInfo.artwork} large/>
                          <div className="flex flex-col overflow-hidden" dir="auto">
                            <span className="font-bold text-sm truncate max-w-[340px]" title={mediaInfo.title || (appLang === 'ar' ? 'صوت قيد التشغيل' : 'Audio playing')} dir="auto">
                              {mediaInfo.title || (appLang === 'ar' ? 'صوت قيد التشغيل' : 'Audio playing')}
                            </span>
                            <span className="text-xs text-zinc-400 truncate max-w-[300px]" dir="auto">
                              {mediaInfo.artist || (appLang === 'ar' ? 'من أي تطبيق على ويندوز' : 'From any Windows app')}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleMediaControl('prev')}
                            className={`p-2 rounded-full ${
                              isLightMode ? 'hover:bg-zinc-100 text-zinc-700' : 'hover:bg-white/10 text-zinc-300'
                            } transition-colors cursor-pointer`}
                            title={appLang === 'ar' ? 'المقطع السابق' : 'Previous Track'}
                          >
                            <SkipBack className="w-4 h-4 fill-current" />
                          </button>
                          <button
                            onClick={() => handleMediaControl('play-pause')}
                            className="w-10 h-10 rounded-full bg-[color:var(--app-accent)] hover:bg-white text-black flex items-center justify-center shadow-md transition-all cursor-pointer"
                            title={mediaIsPlaying ? (appLang === 'ar' ? 'إيقاف مؤقت' : 'Pause') : (appLang === 'ar' ? 'تشغيل' : 'Play')}
                          >
                            {mediaIsPlaying ? (
                              <Pause className="w-4 h-4 fill-black" />
                            ) : (
                              <Play className="w-4 h-4 fill-black ml-0.5" />
                            )}
                          </button>
                          <button
                            onClick={() => handleMediaControl('next')}
                            className={`p-2 rounded-full ${
                              isLightMode ? 'hover:bg-zinc-100 text-zinc-700' : 'hover:bg-white/10 text-zinc-300'
                            } transition-colors cursor-pointer`}
                            title={appLang === 'ar' ? 'المقطع التالي' : 'Next Track'}
                          >
                            <SkipForward className="w-4 h-4 fill-current" />
                          </button>
                        </div>
                      </div>

                      {/* Interactive Media Timeline Track */}
                      {Boolean(mediaInfo.title) && <div className="flex flex-col gap-1 pt-1.5 select-none" onClick={(e) => e.stopPropagation()}>
                        <div
                          onClick={(e) => {
                            if (!mediaInfo.duration) return;
                            const rect = e.currentTarget.getBoundingClientRect();
                            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                            const seekTarget = Math.round(ratio * mediaInfo.duration);
                            setMediaInfo(p => ({ ...p, position: seekTarget }));
                            if (electron && electron.ipcRenderer) {
                              electron.ipcRenderer.send('seek-media', seekTarget);
                            }
                          }}
                          className="w-full h-2 rounded-full bg-black/20 dark:bg-white/10 relative overflow-hidden cursor-pointer group"
                          title={appLang === 'ar' ? 'انقر أو اسحب للتقديم والتأخير' : 'Click to seek timeline'}
                        >
                          <div
                            className="h-full bg-[color:var(--app-accent)] rounded-full transition-[width] duration-150 group-hover:brightness-110"
                            style={{
                              width: mediaInfo.duration > 0
                                ? `${Math.max(0, Math.min(100, (mediaInfo.position / mediaInfo.duration) * 100))}%`
                                : mediaIsPlaying ? '50%' : '15%'
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                          <span>{formatTrackTime(mediaInfo.position)}</span>
                          <span className="text-zinc-500">
                            {mediaInfo.duration > 0
                              ? formatTrackTime(mediaInfo.duration)
                              : (mediaIsPlaying ? (appLang === 'ar' ? 'مباشر' : 'LIVE') : '--:--')}
                          </span>
                        </div>
                      </div>}
                    </div>
                  )}
                </div>
              )}

              {/* 2. TODAY PAGE */}
              {activeTab === 'today' && (
                <div key="today" className={`grid grid-cols-12 gap-3 ${tabAnimationClass}`}>
                  {/* Left Column (Clock & Weather) */}
                  <div className="col-span-3 flex flex-col gap-3">
                    {/* Digital Clock Card */}
                    <div className={`${
                      isLightMode ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-[var(--panel-card)] text-white'
                    } border border-transparent rounded-2xl p-4 flex flex-col items-center justify-center text-center h-[175px] shadow-sm`}>
                      <span className="text-4xl font-extrabold tracking-tight">
                        {String(currentTime.getHours() % 12 || 12).padStart(2, '0')}
                      </span>
                      <span className="text-zinc-500 font-bold tracking-widest text-lg my-0.5">• • •</span>
                      <span className="text-4xl font-extrabold tracking-tight">
                        {String(currentTime.getMinutes()).padStart(2, '0')}
                      </span>
                      <span className="text-[11px] text-zinc-400 mt-2 font-medium">
                        {currentTime.getHours() >= 12 ? (appLang === 'ar' ? 'م' : 'PM') : (appLang === 'ar' ? 'ص' : 'AM')} • {currentTime.toLocaleDateString(appLang === 'ar' ? 'ar-SA' : 'en-US', { weekday: 'short', day: 'numeric' })}
                      </span>
                    </div>

                    {/* Weather Card */}
                    <div className={`${
                      isLightMode ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-[var(--panel-card)] text-white'
                    } border border-transparent rounded-2xl p-4 flex flex-col items-center justify-center text-center h-[145px] shadow-sm`}>
                      <div className="text-[#f59e0b] mb-1">
                        <Sun className="w-7 h-7" />
                      </div>
                      <span className="text-2xl font-bold">{weather?.success ? `${Math.round(weather.temperature)}°C` : '—'}</span>
                      <span className="text-[11px] text-zinc-400 mt-0.5">
                        {weather?.success ? `${weather.city} · Open-Meteo` : (appLang === 'ar' ? 'اختر المدينة في الإعدادات' : 'Choose a city in Settings')}
                      </span>
                    </div>
                  </div>

                  {/* Middle Column (Week Calendar & Pomodoro Timer) */}
                  <div className="col-span-5 flex flex-col gap-3">
                    {/* This Week Card */}
                    <div className={`${
                      isLightMode ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-[var(--panel-card)] text-white'
                    } border border-transparent rounded-2xl p-3 flex flex-col gap-2.5 h-[175px] justify-between shadow-sm`}>
                      <div className="flex items-center justify-between text-xs px-1">
                        <span className="font-bold">{appLang === 'ar' ? 'هذا الأسبوع' : 'This week'}</span>
                        <span className="text-zinc-400 text-[11px] font-mono">{weekRangeString}</span>
                      </div>

                      <div className="grid grid-cols-7 gap-1 text-center">
                        {weekDays.map((d) => {
                          const isSel = selectedDay === d.day;
                          return (
                            <div
                              key={d.day}
                              onClick={() => setSelectedDay(d.day)}
                              className={`py-1.5 rounded-xl flex flex-col items-center cursor-pointer transition-all relative ${
                                isSel
                                  ? 'bg-[color:var(--app-accent)] text-black font-bold scale-105 shadow-sm'
                                  : d.isToday
                                  ? isLightMode
                                    ? 'bg-amber-100/70 text-amber-900 border border-amber-300 font-semibold'
                                    : 'bg-[var(--panel-card)] text-[color:var(--app-accent)] border border-[color:var(--app-accent)]/30 font-semibold'
                                  : isLightMode
                                  ? 'hover:bg-zinc-100 text-zinc-600'
                                  : 'hover:bg-white/5 text-zinc-400'
                              }`}
                            >
                              <span className="text-[10px] uppercase font-semibold">{appLang === 'ar' ? d.ar : d.day}</span>
                              <span className="text-xs mt-0.5">{d.num}</span>
                              {d.isToday && !isSel && (
                                <span className="w-1 h-1 rounded-full bg-[color:var(--app-accent)] mt-0.5" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Pomodoro Focus Timer */}
                    <div className={`${
                      isLightMode ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-[var(--panel-card)] text-white'
                    } border border-transparent rounded-2xl p-3.5 flex flex-col justify-between h-[145px] shadow-sm`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold">{appLang === 'ar' ? 'جلسة التركيز' : 'Focus'}</span>
                          <div className="flex gap-1 text-[10px]">
                            {(['1m', '5m', '10m', '15m', '20m'] as const).map((p) => (
                              <button
                                key={p}
                                onClick={() => selectTimerPreset(p)}
                                className={`px-2 py-0.5 rounded-lg cursor-pointer transition-colors ${
                                  timerPreset === p
                                    ? 'bg-[color:var(--app-accent)] text-black font-bold'
                                    : isLightMode
                                    ? 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                                    : 'bg-[var(--panel-card)] text-zinc-400 hover:text-white'
                                }`}
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={() => selectTimerPreset(timerPreset)}
                          className="text-zinc-400 hover:text-white text-[11px] p-1"
                          title={appLang === 'ar' ? 'إعادة ضبط المؤقت' : 'Reset Timer'}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between px-2">
                        <div className="flex flex-col">
                          <span className="text-3xl font-mono font-extrabold tracking-tight">
                            {formatTimer(pomodoroSeconds)}
                          </span>
                          <span className="text-[10px] text-zinc-400">{appLang === 'ar' ? 'جلسة تركيز عميق' : 'Deep work session'}</span>
                        </div>

                        <button
                          onClick={toggleFocus}
                          className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-sm shadow-md transition-all cursor-pointer ${
                            isTimerRunning ? 'bg-amber-500 text-black' : 'bg-[color:var(--app-accent)] hover:brightness-110 text-black'
                          }`}
                        >
                          {isTimerRunning ? <Pause className="w-5 h-5 fill-black" /> : <Play className="w-5 h-5 fill-black ml-0.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Today Checklist */}
                  <div className={`col-span-4 ${
                    isLightMode ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-[var(--panel-card)] text-white'
                  } border border-transparent rounded-2xl p-3.5 flex flex-col justify-between h-[332px] shadow-sm`}>
                    <div className="flex items-center justify-between pb-2 border-b border-black/5 dark:border-white/5">
                      <span className="font-bold text-xs">{appLang === 'ar' ? 'مهام اليوم' : "Today's Tasks"}</span>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {todayTodos.filter(t => t.completed).length}/{todayTodos.length} {appLang === 'ar' ? 'مكتمل' : 'done'}
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto py-2 flex flex-col gap-2">
                      {todayTodos.map((todo) => (
                        <div
                          key={todo.id}
                          onClick={() => toggleTodayTodo(todo.id)}
                          className={`p-2.5 rounded-xl flex items-center justify-between cursor-pointer transition-colors group ${
                            todo.completed
                              ? isLightMode ? 'bg-zinc-100 text-zinc-400' : 'bg-[var(--panel-card)]/60 text-zinc-500 line-through'
                              : isLightMode ? 'bg-zinc-50 hover:bg-zinc-100' : 'bg-[var(--panel-card)] hover:bg-[var(--panel-card)]'
                          }`}
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <div className={`w-4 h-4 rounded-md flex items-center justify-center border transition-colors ${
                              todo.completed
                                ? 'bg-[color:var(--app-accent)] border-[color:var(--app-accent)] text-black'
                                : isLightMode ? 'border-zinc-400' : 'border-zinc-500'
                            }`}>
                              {todo.completed && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <span className="text-xs truncate">{todo.title}</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {todo.badge && (
                              <span className="text-[10px] font-mono text-zinc-400 bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded">
                                {todo.badge}
                              </span>
                            )}
                            <button
                              onClick={(e) => deleteTodayTodo(todo.id, e)}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity"
                              title={appLang === 'ar' ? 'حذف المهمة' : 'Delete task'}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-black/5 dark:border-white/5">
                      <input
                        type="text"
                        placeholder={appLang === 'ar' ? 'أضف مهمة جديدة...' : 'Add a new task...'}
                        value={newTodoInput}
                        onChange={(e) => setNewTodoInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddTodo()}
                        className={`flex-1 min-w-0 text-xs px-3 py-1.5 rounded-xl outline-none ${
                          isLightMode ? 'bg-zinc-100 text-zinc-900 border border-zinc-200' : 'bg-[var(--panel-card)] text-white border border-white/5'
                        } focus:border-[color:var(--app-accent)]`}
                      />
                      <button
                        onClick={handleAddTodo}
                        className="w-8 h-8 rounded-xl bg-[color:var(--app-accent)] hover:brightness-110 text-black flex items-center justify-center transition-colors cursor-pointer shrink-0"
                      >
                        <Plus className="w-4 h-4 stroke-[2.5]" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. STATS TAB */}
              {activeTab === 'stats' && (
                <div key="stats" className={`grid grid-cols-5 shrink-0 gap-3 ${tabAnimationClass}`}>
                  <div className="col-span-3 flex flex-col justify-between gap-2.5">
                    {/* Continuous Unified Card for CPU, GPU, RAM - Extended Vertically into unused space */}
                    <div className={`${
                      isLightMode ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-[var(--panel-card)] text-white'
                    } rounded-2xl flex-1 grid grid-cols-3 gap-2 shadow-sm`} >
                      {/* CPU */}
                      <div className="flex-1 flex flex-col items-center text-center px-1 py-3 bg-[var(--panel-card)] rounded-2xl">
                        <div className="relative w-18 h-18 flex items-center justify-center">
                          <svg className="w-18 h-18 transform -rotate-90" viewBox="0 0 64 64">
                            <circle cx="32" cy="32" r="26" fill="none" stroke={isLightMode ? '#e4e4e7' : '#1f2026'} strokeWidth="4.5" />
                            <circle
                              cx="32"
                              cy="32"
                              r="26"
                              fill="none"
                              stroke="#eab308"
                              strokeWidth="4.5"
                              strokeDasharray="163.36"
                              strokeDashoffset={163.36 - (163.36 * Math.min(100, Math.max(0, telemetry.cpu.percent))) / 100}
                              strokeLinecap="round"
                            />
                          </svg>
                          <span className="absolute font-bold text-base tracking-tight font-mono">{telemetry.cpu.model === 'Reading CPU…' || telemetry.cpu.model === 'Unavailable' ? '—' : `${telemetry.cpu.percent}%`}</span>
                        </div>
                        <span className="font-bold text-xs mt-2">{appLang === 'ar' ? 'المعالج' : 'CPU'}</span>
                        <span className="text-[10px] text-zinc-400 truncate max-w-[105px] mt-0.5" title={telemetry.cpu.model}>
                          {telemetry.cpu.model}
                        </span>
                        <div className="flex gap-1 mt-2">
                          <span className={`${isLightMode ? 'bg-zinc-100 text-zinc-700' : 'bg-[var(--panel-card)] text-zinc-300'} px-2 py-0.5 rounded text-[10px] font-mono`}>
                            {telemetry.cpu.speed}
                          </span>
                          <span className={`${isLightMode ? 'bg-zinc-100 text-zinc-700' : 'bg-[var(--panel-card)] text-zinc-300'} px-2 py-0.5 rounded text-[10px] font-mono`}>
                            {telemetry.cpu.processes} {appLang === 'ar' ? 'عملية' : 'proc'}
                          </span>
                        </div>
                      </div>



                      {/* GPU */}
                      <div className="flex-1 flex flex-col items-center text-center px-1 py-3 bg-[var(--panel-card)] rounded-2xl">
                        <div className="relative w-18 h-18 flex items-center justify-center">
                          <svg className="w-18 h-18 transform -rotate-90" viewBox="0 0 64 64">
                            <circle cx="32" cy="32" r="26" fill="none" stroke={isLightMode ? '#e4e4e7' : '#1f2026'} strokeWidth="4.5" />
                            <circle
                              cx="32"
                              cy="32"
                              r="26"
                              fill="none"
                              stroke="#c084fc"
                              strokeWidth="4.5"
                              strokeDasharray="163.36"
                              strokeDashoffset={163.36 - (163.36 * Math.min(100, Math.max(0, telemetry.gpu.percent))) / 100}
                              strokeLinecap="round"
                            />
                          </svg>
                          <span className="absolute font-bold text-base tracking-tight font-mono">{telemetry.gpu.model === 'Reading GPU…' || telemetry.gpu.model === 'Unavailable' ? '—' : `${telemetry.gpu.percent}%`}</span>
                        </div>
                        <span className="font-bold text-xs mt-2">{appLang === 'ar' ? 'كرت الشاشة' : 'GPU'}</span>
                        <span className="text-[10px] text-zinc-400 truncate max-w-[105px] mt-0.5" title={telemetry.gpu.model}>
                          {telemetry.gpu.shortModel || '—'}
                        </span>
                        <div className="mt-2">
                          <span className={`${isLightMode ? 'bg-zinc-100 text-zinc-700' : 'bg-[var(--panel-card)] text-zinc-300 border border-white/5'} px-2 py-0.5 rounded text-[10px] font-mono font-medium`}>
                            {telemetry.gpu.vramUsed}
                          </span>
                        </div>
                      </div>



                      {/* RAM */}
                      <div className="flex-1 flex flex-col items-center text-center px-1 py-3 bg-[var(--panel-card)] rounded-2xl">
                        <div className="relative w-18 h-18 flex items-center justify-center">
                          <svg className="w-18 h-18 transform -rotate-90" viewBox="0 0 64 64">
                            <circle cx="32" cy="32" r="26" fill="none" stroke={isLightMode ? '#e4e4e7' : '#1f2026'} strokeWidth="4.5" />
                            <circle
                              cx="32"
                              cy="32"
                              r="26"
                              fill="none"
                              stroke="#4ade80"
                              strokeWidth="4.5"
                              strokeDasharray="163.36"
                              strokeDashoffset={163.36 - (163.36 * Math.min(100, Math.max(0, telemetry.ram.percent))) / 100}
                              strokeLinecap="round"
                            />
                          </svg>
                          <span className="absolute font-bold text-base tracking-tight font-mono">{telemetry.ram.percent}%</span>
                        </div>
                        <span className="font-bold text-xs mt-2">{appLang === 'ar' ? 'الذاكرة' : 'RAM'}</span>
                        <span className="text-[10px] text-zinc-400 truncate max-w-[105px] mt-0.5">
                          {telemetry.ram.used}
                        </span>
                        <div className="mt-2">
                          <span className={`${isLightMode ? 'bg-zinc-100 text-zinc-700' : 'bg-[var(--panel-card)] text-zinc-300'} px-2 py-0.5 rounded text-[10px] font-mono`}>
                            {telemetry.ram.free}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* ABSOLUTELY UNTOUCHED LOWER ROW: Disk C, Network, Uptime */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className={`${isLightMode ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-[var(--panel-card)] text-white'} border border-[#222328] rounded-xl p-2.5`}>
                        <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wider block">
                          {appLang === 'ar' ? 'القرص C:' : 'DISK C:'}
                        </span>
                        <span className="text-xs font-bold font-mono mt-0.5 block">{telemetry.disk.freeText}</span>
                      </div>
                      <div className={`${isLightMode ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-[var(--panel-card)] text-white'} border border-[#222328] rounded-xl p-2.5`}>
                        <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wider block">
                          {appLang === 'ar' ? 'الشبكة' : 'NETWORK'}
                        </span>
                        <span className="text-xs font-bold font-mono mt-0.5 block">
                          ↓ {telemetry.network.downSpeed} ↑ {telemetry.network.upSpeed}
                        </span>
                      </div>
                      <div className={`${isLightMode ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-[var(--panel-card)] text-white'} border border-[#222328] rounded-xl p-2.5`}>
                        <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wider block">
                          {appLang === 'ar' ? 'وقت التشغيل' : 'UP FOR'}
                        </span>
                        <span className="text-xs font-bold font-mono mt-0.5 block">{telemetry.uptime}</span>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT SIDE: Top Apps and Speed Test with subtle graphite borders */}
                  <div className="col-span-2 flex flex-col justify-between gap-2.5">
                    <div className={`${isLightMode ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-[var(--panel-card)] text-white'} border border-[#222328] rounded-2xl p-3 flex flex-col gap-2 shadow-sm`}>
                      <div className="flex items-center justify-between pb-1 border-b border-black/5 dark:border-white/5">
                        <span className="text-[11px] font-semibold">
                          {appLang === 'ar' ? 'أعلى التطبيقات استهلاكاً' : 'Top apps'}
                        </span>
                        <span className="text-[10px] font-mono text-[#eab308]">
                          {appLang === 'ar' ? 'مباشر' : 'Live OS'}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        {topApps.map((item) => (
                          <div key={item.name} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-5 h-5 rounded ${isLightMode ? 'bg-zinc-200 text-zinc-800' : 'bg-[var(--panel-card)] text-zinc-300'} text-[10px] font-mono flex items-center justify-center uppercase`}>
                                {item.name[0]}
                              </span>
                              <div className="flex flex-col">
                                <span className="text-[11px] leading-none truncate max-w-[90px]">{item.name}</span>
                                <div className="w-16 h-1 bg-black/10 dark:bg-white/10 rounded-full mt-1 overflow-hidden">
                                  <div className="h-full bg-[#4ade80] rounded-full" style={{ width: `${Math.min(100, parseFloat(item.cpu) || 0)}%` }} />
                                </div>
                              </div>
                            </div>
                            <span className="text-[10px] font-mono text-zinc-400">{item.ram}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Interactive Speed Test Card */}
                    <div className={`${isLightMode ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-[var(--panel-card)] text-white'} border border-[#222328] rounded-2xl p-3 flex flex-col justify-between shadow-sm`}>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold">{appLang === 'ar' ? 'سرعة الإنترنت' : 'Internet speed'}</span>
                        <span className="text-[9px] text-zinc-400">
                          {livePing} {appLang === 'ar' ? 'مللي ثانية زمن الاستجابة' : 'ms latency'}
                        </span>
                      </div>

                      <div className="flex items-center justify-around my-1.5">
                        <div className="text-center">
                          <span className={`text-lg font-bold font-mono ${speedTestStage === 'testing' ? 'text-amber-400 animate-pulse' : ''}`}>{speedTestStage === 'done' ? liveDown : '—'}</span>
                          <span className="text-[10px] text-zinc-400 ml-1">Mbps ↓</span>
                        </div>
                        <div className="text-center">
                          <span className={`text-lg font-bold font-mono ${speedTestStage === 'testing' ? 'text-amber-400 animate-pulse' : ''}`}>{speedTestStage === 'done' ? liveUp : '—'}</span>
                          <span className="text-[10px] text-zinc-400 ml-1">Mbps ↑</span>
                        </div>
                      </div>

                      <button
                        onClick={handleRunSpeedTest}
                        disabled={speedTestStage === 'testing'}
                        className="w-full py-1.5 bg-[color:var(--app-accent)] hover:brightness-110 disabled:opacity-75 text-black font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                      >
                        {speedTestStage === 'testing' ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>{speedTestProgressText}</span>
                          </>
                        ) : speedTestStage === 'done' ? (
                          <>
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                            <span>{speedTestProgressText}</span>
                          </>
                        ) : (
                          <>
                            <span>▶</span>
                            <span>{appLang === 'ar' ? 'بدء فحص السرعة' : 'Run speed test'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 4. CLIPBOARD TAB */}
              {activeTab === 'clipboard' && (
                <div key="clipboard" className={`flex flex-col gap-2.5 ${tabAnimationClass}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="text"
                        placeholder={appLang === 'ar' ? `البحث في ${clipboardItems.length} عنصر...` : `Search ${clipboardItems.length} items...`}
                        value={clipSearch}
                        onChange={(e) => setClipSearch(e.target.value)}
                        className={`w-full ${
                          isLightMode ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-[var(--panel-card)] text-white border-white/5'
                        } text-xs pl-8 pr-3 py-1.5 rounded-xl outline-none border focus:border-[color:var(--app-accent)]`}
                      />
                    </div>

                    <div className="flex items-center gap-1 text-[11px]">
                      {(['all', 'text', 'images', 'links'] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => setClipFilter(f)}
                          className={`px-3 py-1 rounded-full capitalize transition-colors cursor-pointer ${
                            clipFilter === f
                              ? 'bg-[color:var(--app-accent)] text-black font-bold'
                              : isLightMode
                              ? 'text-zinc-600 hover:text-black'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          {f === 'all'
                            ? (appLang === 'ar' ? 'الكل' : 'all')
                            : f === 'text'
                            ? (appLang === 'ar' ? 'نصوص' : 'text')
                            : f === 'images'
                            ? (appLang === 'ar' ? 'صور' : 'images')
                            : (appLang === 'ar' ? 'روابط' : 'links')}
                        </button>
                      ))}
                      <button
                        onClick={handleClearClipboard}
                        className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                        title={appLang === 'ar' ? 'مسح العناصر غير المثبتة' : 'Clear unpinned history'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {filteredClips.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[255px] text-center p-6 gap-2 border border-dashed border-white/10 rounded-2xl">
                      <ClipboardList className="w-10 h-10 text-zinc-600 mb-1" />
                      <span className="text-xs font-semibold text-zinc-300">
                        {appLang === 'ar' ? 'سجل الحافظة فارغ' : 'Clipboard history is empty'}
                      </span>
                      <p className="text-[11px] text-zinc-500 max-w-xs">
                        {appLang === 'ar'
                          ? 'انسخ أي نص أو رابط أو صورة في ويندوز وستظهر هنا تلقائياً'
                          : 'Copy any text, link, or image anywhere in Windows and it will appear here automatically'}
                      </p>
                    </div>
                  ) : (
                    /* Split Layout */
                    <div className="grid grid-cols-12 gap-3 h-[255px]">
                      <div className="col-span-6 overflow-y-auto pr-1 flex flex-col gap-2">
                        {/* PINNED */}
                        {filteredClips.some((c) => c.group === 'PINNED' || c.isPinned) && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1">
                              {appLang === 'ar' ? 'المثبتة' : 'PINNED'}
                            </span>
                            {filteredClips
                              .filter((c) => c.group === 'PINNED' || c.isPinned)
                              .map((item) => (
                                <div
                                  key={item.id}
                                  onClick={() => setSelectedClipId(item.id)}
                                  className={`rounded-xl px-2.5 py-1.5 flex items-center justify-between cursor-pointer transition-colors group ${
                                    selectedClipId === item.id
                                      ? isLightMode
                                        ? 'bg-amber-100/70 border border-amber-300'
                                        : 'bg-[var(--panel-card)] border border-[color:var(--app-accent)]/40'
                                      : isLightMode
                                      ? 'hover:bg-zinc-100'
                                      : 'hover:bg-white/5'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 truncate">
                                    <Pin className="w-3.5 h-3.5 text-[color:var(--app-accent)] shrink-0" />
                                    <span className="text-xs truncate">{item.title}</span>
                                  </div>

                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleCopyClipItem(item)} className="p-1 hover:text-[color:var(--app-accent)]" title={appLang === 'ar' ? 'نسخ إلى الحافظة' : 'Copy to Clipboard'}>
                                      <Copy className="w-3 h-3" />
                                    </button>
                                    <button onClick={(e) => handlePinClipItem(item.id, e)} className="p-1 hover:text-amber-400" title={appLang === 'ar' ? 'إلغاء التثبيت' : 'Unpin'}>
                                      <Pin className="w-3 h-3 fill-current" />
                                    </button>
                                    <button onClick={(e) => handleDeleteClipItem(item.id, e)} className="p-1 hover:text-red-400" title={appLang === 'ar' ? 'حذف' : 'Delete'}>
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}

                        {/* TODAY */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1">
                            {appLang === 'ar' ? 'اليوم' : 'TODAY'}
                          </span>
                          {filteredClips
                            .filter((c) => c.group !== 'PINNED' && !c.isPinned)
                            .map((item) => (
                              <div
                                key={item.id}
                                onClick={() => setSelectedClipId(item.id)}
                                className={`rounded-xl px-2.5 py-2 flex items-center justify-between cursor-pointer transition-colors group ${
                                  selectedClipId === item.id
                                    ? isLightMode
                                      ? 'bg-amber-100/70 border border-amber-300'
                                      : 'bg-[var(--panel-card)] border border-[color:var(--app-accent)]/40'
                                    : isLightMode
                                    ? 'hover:bg-zinc-100'
                                    : 'hover:bg-white/5'
                                }`}
                              >
                                <div className="flex items-center gap-2 overflow-hidden pr-2">
                                  <span className="text-[10px] font-mono text-zinc-400 uppercase w-4 flex justify-center">
                                    {item.icon === 'text' ? '≡' : item.icon === 'link' ? '🔗' : item.icon === 'code' ? '</>' : '📄'}
                                  </span>
                                  <span className="text-xs truncate">{item.title}</span>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[10px] font-mono text-zinc-500 group-hover:hidden">{item.time}</span>
                                  <div className="hidden group-hover:flex items-center gap-1">
                                    <button onClick={() => handleCopyClipItem(item)} className="p-1 hover:text-[color:var(--app-accent)]" title={appLang === 'ar' ? 'نسخ إلى الحافظة' : 'Copy to Clipboard'}>
                                      <Copy className="w-3 h-3" />
                                    </button>
                                    <button onClick={(e) => handlePinClipItem(item.id, e)} className="p-1 hover:text-amber-400" title={appLang === 'ar' ? 'تثبيت' : 'Pin'}>
                                      <Pin className="w-3 h-3" />
                                    </button>
                                    <button onClick={(e) => handleDeleteClipItem(item.id, e)} className="p-1 hover:text-red-400" title={appLang === 'ar' ? 'حذف' : 'Delete'}>
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>

                      {/* Right Preview Card */}
                      <div className={`col-span-6 ${
                        isLightMode ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-[var(--panel-card)] text-white border-white/5'
                      } border rounded-2xl p-4 flex flex-col justify-between shadow-sm`}>
                        <div className="overflow-y-auto max-h-[145px]">
                          {activeClipboardItem?.image ? (
                            <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-black/10 overflow-hidden">
                              <img src={activeClipboardItem.image} alt="Preview" className="max-h-[130px] rounded-lg object-contain shadow-sm" />
                            </div>
                          ) : activeClipboardItem?.fullText ? (
                            <p className="text-xs leading-relaxed font-medium whitespace-pre-wrap select-text">
                              "{activeClipboardItem.fullText}"
                            </p>
                          ) : (
                            <div className="flex flex-col items-center justify-center h-[130px] text-zinc-500 text-xs">
                              {appLang === 'ar' ? 'حدد عنصراً لمعاينته' : 'Select an item to preview'}
                            </div>
                          )}
                        </div>

                      <div className="pt-3 border-t border-black/5 dark:border-white/5 flex flex-col gap-1 text-[11px] text-zinc-400">
                        <div className="flex justify-between">
                          <span>{appLang === 'ar' ? 'النوع' : 'Type'}</span>
                          <span className="font-medium capitalize">{activeClipboardItem?.type || 'text'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{appLang === 'ar' ? 'الحجم' : 'Size'}</span>
                          <span className="font-medium">{activeClipboardItem?.size || ''}</span>
                        </div>
                        <div className="flex justify-between items-center pt-1">
                          <span className="font-medium">{activeClipboardItem?.time || (appLang === 'ar' ? 'الآن' : 'now')}</span>
                          <button
                            onClick={() => activeClipboardItem && handleCopyClipItem(activeClipboardItem)}
                            className="px-3 py-1 rounded-lg bg-[color:var(--app-accent)] hover:brightness-110 text-black font-semibold text-xs flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Copy className="w-3 h-3" />
                            <span>{appLang === 'ar' ? 'نسخ إلى النظام' : 'Copy to System'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                  {/* Bottom Status Bar */}
                  <div className="flex items-center justify-between pt-2 border-t border-black/5 dark:border-white/5 text-[10px] text-zinc-400">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded">{appLang === 'ar' ? '↵ لصق' : '↵ Paste'}</span>
                      <span className="bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded">{appLang === 'ar' ? 'Ctrl+C نسخ' : 'Ctrl C Copy'}</span>
                      <span className="bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded">{appLang === 'ar' ? 'Ctrl+P تثبيت' : 'Ctrl P Pin'}</span>
                      <span className="bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded">{appLang === 'ar' ? 'Del حذف' : 'Del Remove'}</span>
                    </div>
                    <span className="text-zinc-500">
                      {appLang === 'ar' ? 'مراقب الحافظة المباشر نشط' : 'Live clipboard monitor active'}
                    </span>
                  </div>
                </div>
              )}

              {/* 5. APPS TAB */}
              {activeTab === 'apps' && (
                <div key="apps" className={`apps-section flex flex-col gap-2 pr-1 ${tabAnimationClass}`}>
                  {/* Search Bar + Add App Button */}
                  <div className="flex items-center gap-2">
                    <div className={`flex-1 rounded-xl px-3 py-2 flex items-center gap-2 border ${
                      isLightMode ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-[var(--panel-card)] text-white border-white/5'
                    }`}>
                      <Search className="w-4 h-4 text-zinc-400" />
                      <input
                        ref={appSearchInputRef}
                        type="text"
                        placeholder={appLang === 'ar' ? `البحث في ${allAppsList.length} تطبيق...` : `Search ${allAppsList.length} apps...`}
                        value={appSearch}
                        onChange={(e) => setAppSearch(e.target.value)}
                        onKeyDown={keyboard.onAppKeyDown}
                        role="combobox" aria-autocomplete="list" aria-expanded={true} aria-controls="island-app-results"
                        aria-activedescendant={keyboard.selectedAppId?'launcher-app-'+encodeURIComponent(keyboard.selectedAppId):undefined}
                        className="bg-transparent text-xs outline-none flex-1 placeholder:text-zinc-500"
                      />
                      <span className="text-[10px] font-mono text-zinc-400 bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded">Alt+A</span>
                    </div>
                    <button type="button" aria-label={appLang==='ar'?'تحديث قائمة التطبيقات':'Refresh applications'} title={appLang==='ar'?'تحديث قائمة التطبيقات':'Refresh applications'} disabled={appsLoading} onClick={()=>{forceNextAppScan.current=true;setAppScan(value=>value+1);}} className="p-2 rounded-xl bg-white/5 disabled:opacity-40"><RotateCcw size={16} className={appsLoading?'animate-spin':''}/></button>
                    <button
                      onClick={() => setShowAddAppModal(true)}
                      className="px-3 py-2 rounded-xl bg-[color:var(--app-accent)] hover:brightness-110 text-black text-xs font-bold flex items-center gap-1.5 transition-transform hover:scale-105 shrink-0 cursor-pointer shadow-sm"
                      title={appLang === 'ar' ? 'إضافة مسار تطبيق مخصص' : 'Add custom app path'}
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>{appLang === 'ar' ? 'إضافة تطبيق' : 'Add App'}</span>
                    </button>
                  </div>

                  {/* Add App Modal */}
                  {showAddAppModal && (
                    <div className={`p-3 rounded-2xl border ${
                      isLightMode ? 'bg-amber-50/90 border-amber-200 text-zinc-900' : 'bg-[var(--panel-card)] border-white/10 text-white'
                    } flex flex-col gap-2.5 shadow-xl animate-island-content`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[color:var(--app-accent)]">
                          {appLang === 'ar' ? 'إضافة تطبيق أو ملف مخصص' : 'Add Custom App or Executable'}
                        </span>
                        <button
                          onClick={() => setShowAddAppModal(false)}
                          className="p-1 rounded-full text-zinc-400 hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <input
                          type="text"
                          placeholder={appLang === 'ar' ? 'اسم التطبيق (مثال: Telegram)...' : 'App name (e.g. Telegram)...'}
                          value={customAppNameInput}
                          onChange={(e) => setCustomAppNameInput(e.target.value)}
                          className={`text-xs px-2.5 py-1.5 rounded-xl border outline-none ${
                            isLightMode ? 'bg-white border-zinc-200' : 'bg-black/30 border-white/10 focus:border-[color:var(--app-accent)]'
                          }`}
                        />

                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            placeholder={appLang === 'ar' ? 'مسار الملف (.exe / .lnk)...' : 'File path (.exe / .lnk)...'}
                            value={customAppPathInput}
                            onChange={(e) => setCustomAppPathInput(e.target.value)}
                            className={`flex-1 text-xs px-2.5 py-1.5 rounded-xl border outline-none font-mono ${
                              isLightMode ? 'bg-white border-zinc-200' : 'bg-black/30 border-white/10 focus:border-[color:var(--app-accent)]'
                            }`}
                          />
                          <button
                            onClick={handleBrowseAppFile}
                            className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer shrink-0"
                          >
                            {appLang === 'ar' ? 'استعراض...' : 'Browse...'}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          onClick={() => setShowAddAppModal(false)}
                          className="px-3 py-1 rounded-lg text-xs text-zinc-400 hover:text-white"
                        >
                          {appLang === 'ar' ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                          onClick={handleSaveCustomApp}
                          className="px-3.5 py-1 rounded-lg bg-[color:var(--app-accent)] hover:brightness-110 text-black text-xs font-bold transition-colors cursor-pointer"
                        >
                          {appLang === 'ar' ? 'حفظ التطبيق' : 'Save App'}
                        </button>
                      </div>
                    </div>
                  )}

                  {(appsLoading||appsLoadError)&&<p role="status" className="text-xs opacity-70">{appsLoading?(appLang==='ar'?'جارٍ البحث عن التطبيقات…':'Finding applications…'):(appLang==='ar'?'تعذر تحديث القائمة. اضغط زر التحديث للمحاولة مجددًا.':'Could not update the list. Use Refresh to try again.')}</p>}
                  <div className="apps-results" id="island-app-results" role="listbox" aria-busy={appsLoading} aria-label={appLang === 'ar' ? 'قائمة التطبيقات' : 'Application list'}>
                  {savedSnippets.filter(item=>item.name.toLocaleLowerCase().includes(appSearch.toLocaleLowerCase())).length>0&&<section className="launcher-snippets"><small>{appLang==='ar'?'الاختصارات النصية':'SNIPPETS'}</small>{savedSnippets.filter(item=>item.name.toLocaleLowerCase().includes(appSearch.toLocaleLowerCase())).map(item=><button key={item.id} onClick={async()=>{try{await electron?.ipcRenderer.invoke('workspace-run-snippet',item.id);if(item.kind==='text')showNotchFeedback(appLang==='ar'?'تم النسخ.':'Copied.');}catch{showNotchFeedback(appLang==='ar'?'تعذر تشغيل الاختصار.':'Shortcut unavailable.');}}}><span>{item.name.charAt(0).toLocaleUpperCase()}</span><b>{item.name}</b><small>{item.kind==='text'?(appLang==='ar'?'نسخ':'Copy'):(appLang==='ar'?'فتح':'Open')}</small></button>)}</section>}
                  {/* Starred */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold text-zinc-400 tracking-wider uppercase px-1">
                      {appLang === 'ar' ? 'المفضلة' : 'STARRED'}
                    </span>
                    {filteredApps.filter((a) => a.isStarred).map((app) => (
                      <div
                        key={app.name}
                        id={'launcher-app-'+encodeURIComponent(appKey(app))} role="option" aria-selected={keyboard.selectedAppId===appKey(app)}
                        data-app-key={appKey(app)} data-app-selected={keyboard.selectedAppId===appKey(app)}
                        onClick={() => handleLaunchApp(app)}
                        className={`rounded-xl px-3 py-2 flex items-center justify-between cursor-pointer transition-colors group ${
                          app.isOpen
                            ? isLightMode
                              ? 'bg-amber-50 border border-amber-200'
                              : 'bg-[var(--panel-card)] border border-[color:var(--app-accent)]/20 hover:bg-[var(--panel-card)]'
                            : isLightMode
                            ? 'hover:bg-zinc-100'
                            : 'hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <div className={`w-8 h-8 rounded-xl ${isLightMode ? 'bg-amber-100 text-amber-900 border border-amber-200' : 'bg-[var(--panel-card)] text-zinc-100 border border-white/10'} flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden shadow-sm`}>
                            {Array.from(app.name.trim())[0]?.toLocaleUpperCase(appLang) || '?'}
                          </div>
                          <div className="flex flex-col truncate">
                            <span className="text-xs font-semibold truncate">{app.name}</span>
                            {app.isCustom && <span className="text-[9px] text-[color:var(--app-accent)]">{appLang === 'ar' ? 'مخصص' : 'Custom'}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                          {app.isOpen && <span className="text-emerald-400 font-mono text-[10px]">{appLang === 'ar' ? '✓ قيد التشغيل' : '✓ Open'}</span>}
                          <button
                            onClick={(e) => toggleStarApp(app.name, e)}
                            className="p-1 hover:scale-110 transition-transform"
                            title={appLang === 'ar' ? 'إلغاء التفضيل' : 'Unstar'}
                          >
                            <Star className="w-3.5 h-3.5 text-[#eab308] fill-[#eab308]" />
                          </button>
                          {app.isCustom && (
                            <button
                              onClick={(e) => handleDeleteCustomApp(app.name, e)}
                              className="p-1 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                              title={appLang === 'ar' ? 'حذف' : 'Delete'}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Applications */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold text-zinc-400 tracking-wider uppercase px-1">
                      {appLang === 'ar' ? 'التطبيقات' : 'APPLICATIONS'}
                    </span>
                    {filteredApps.filter((a) => !a.isStarred).map((app) => (
                      <div
                        key={app.name}
                        id={'launcher-app-'+encodeURIComponent(appKey(app))} role="option" aria-selected={keyboard.selectedAppId===appKey(app)}
                        data-app-key={appKey(app)} data-app-selected={keyboard.selectedAppId===appKey(app)}
                        onClick={() => handleLaunchApp(app)}
                        className={`${isLightMode ? 'hover:bg-zinc-100' : 'hover:bg-white/5'} rounded-xl px-3 py-1.5 flex items-center justify-between cursor-pointer transition-colors group`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <div className={`w-7 h-7 rounded-lg ${isLightMode ? 'bg-zinc-200 text-zinc-800' : 'bg-[var(--panel-card)] text-zinc-300 border border-white/5'} flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden shadow-xs`}>
                            {Array.from(app.name.trim())[0]?.toLocaleUpperCase(appLang) || '?'}
                          </div>
                          <div className="flex flex-col truncate">
                            <span className="text-xs font-medium truncate">{app.name}</span>
                            {app.isCustom && <span className="text-[9px] text-[color:var(--app-accent)]">{appLang === 'ar' ? 'مخصص' : 'Custom'}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {app.isOpen && <span className="text-emerald-400 font-mono text-[10px]">{appLang === 'ar' ? '✓ قيد التشغيل' : '✓ Open'}</span>}
                          <span className="text-[11px] text-zinc-500 group-hover:hidden">{appLang==='ar'?(app.isCustom?'تطبيق مخصص':'تطبيق'):app.type}</span>
                          <button
                            onClick={(e) => toggleStarApp(app.name, e)}
                            className="p-1 hidden group-hover:inline-block text-zinc-400 hover:text-[#eab308] hover:scale-110 transition-all"
                            title={appLang === 'ar' ? 'تفضيل' : 'Star'}
                          >
                            <Star className="w-3.5 h-3.5" />
                          </button>
                          {app.isCustom && (
                            <button
                              onClick={(e) => handleDeleteCustomApp(app.name, e)}
                              className="p-1 hidden group-hover:inline-block text-zinc-500 hover:text-red-400"
                              title={appLang === 'ar' ? 'حذف' : 'Delete'}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  </div>
                </div>
              )}

              {/* 6. WALLPAPER TAB */}
              {activeTab === 'wallpaper' && (
                <div key="wallpaper" className={`flex flex-col gap-3 ${tabAnimationClass}`}>
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSelectWpCategory('recent')}
                        className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                          wallpaperCategory === 'recent'
                            ? 'bg-[color:var(--app-accent)] text-black shadow-sm font-bold'
                            : isLightMode
                            ? 'bg-zinc-200 text-zinc-700 hover:text-black'
                            : 'bg-[var(--panel-card)] text-zinc-300 hover:text-white'
                        }`}
                      >
                        {appLang === 'ar' ? 'الأخيرة' : 'Recent'}
                      </button>

                      <button
                        onClick={() => {
                          if (customWallpapers.length === 0) {
                            handlePickCustomFolder();
                          } else {
                            handleSelectWpCategory('my_folder');
                          }
                        }}
                        className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                          wallpaperCategory === 'my_folder'
                            ? 'bg-[color:var(--app-accent)] text-black shadow-sm font-bold'
                            : isLightMode
                            ? 'bg-zinc-200 text-zinc-700 hover:text-black'
                            : 'bg-[var(--panel-card)] text-zinc-300 hover:text-white'
                        }`}
                      >
                        {appLang === 'ar'
                          ? (customFolderName || 'مجلدي')
                          : (customFolderName || 'My folder')}
                      </button>

                      <span className="text-xs text-zinc-400 font-medium ml-1">
                        {currentWallpapersList.length} {appLang === 'ar' ? 'خلفيات' : 'pictures'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">

                      <button onClick={()=>void handleAddWallpaper()} className="p-2 rounded-xl bg-white/5 text-zinc-300 hover:bg-white/10" title={appLang==='ar'?'إضافة خلفية':'Add wallpaper'} aria-label={appLang==='ar'?'إضافة خلفية':'Add wallpaper'}><Plus className="w-4 h-4"/></button>
                      <button
                        onClick={handlePickCustomFolder}
                        className={`p-2 rounded-xl ${
                          isLightMode
                            ? 'bg-zinc-200 hover:bg-zinc-300 text-zinc-800'
                            : 'bg-[var(--panel-card)] hover:bg-[var(--panel-card)] text-zinc-400 hover:text-white border border-white/5'
                        } transition-colors cursor-pointer`}
                        title={appLang === 'ar' ? 'اختيار مجلد خلفيات من الجهاز' : 'Choose Wallpaper Folder from PC'}
                      >
                        <Folder className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Authentic 5-Card Parallelogram Wallpaper Accordion (Matching Reference 174855) */}
                  {currentWallpapersList.length === 0 ? (
                    <div className="flex items-center justify-center h-[152px] text-zinc-500 text-sm">
                      {appLang === 'ar' ? 'لا توجد خلفيات في هذا المجلد' : 'No wallpapers in this folder'}
                    </div>
                  ) : (
                  <div
                    data-wallpaper-gallery
                    onWheel={handleWallpaperWheel}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      // Arrow navigation applies immediately; the window listener also
                      // handles keys while a header or navigation button has focus.
                      // Leave modified arrows to the global island navigator. In
                      // particular, Ctrl+Left/Right changes sections; only an
                      // unmodified arrow browses wallpapers.
                      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.nativeEvent.isComposing) return;
                      if ((e.target as HTMLElement).tagName==='INPUT')return;
                      if (e.key === 'ArrowLeft') {
                        e.preventDefault();
                        const len = currentWallpapersList.length;
                        if (len > 0) navigateWallpaper(-1);
                      } else if (e.key === 'ArrowRight') {
                        e.preventDefault();
                        const len = currentWallpapersList.length;
                        if (len > 0) navigateWallpaper(1);
                      } else if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (!isWpApplying) handleApplyWallpaper(selectedWpIndex);
                      }
                    }}
                    aria-label={appLang === 'ar' ? 'معرض الخلفيات — الأسهم تنقل وتطبق الخلفية مباشرة' : 'Wallpaper gallery — arrow keys browse and apply immediately'}
                    className="relative w-full h-[152px] flex items-center justify-center overflow-hidden select-none outline-none focus-visible:outline-2 focus-visible:outline-[color:var(--app-accent)] group py-1"
                  >
                    {/* Previous Button */}
                    <button
                      onClick={() => {
                        const len = currentWallpapersList.length;
                        if (len > 0) navigateWallpaper(-1);
                      }}
                      className="absolute left-1 z-30 w-7 h-7 rounded-full bg-black/60 hover:bg-black/90 text-white/70 hover:text-white flex items-center justify-center backdrop-blur-md border border-white/10 transition-all cursor-pointer opacity-70 hover:opacity-100 focus-visible:opacity-100"
                      title={appLang === 'ar' ? 'الخلفية السابقة' : 'Previous Wallpaper'}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    {/* Authentic Accordion Strip Container */}
                    <div className="relative h-[136px] w-[536px] shrink-0">
                      {(() => {
                        const len = currentWallpapersList.length;
                        // Build unique slot offsets — for small lists, only show available items
                        // (no modulo-wrapped duplicates when len < 5)
                        const maxSlots = Math.min(5, len);
                        const halfSlots = Math.floor(maxSlots / 2);
                        const slots: number[] = [];
                        for (let offset = -halfSlots; offset <= halfSlots; offset++) {
                          if (slots.length >= maxSlots) break;
                          slots.push(offset);
                        }
                        return slots.map((slotOffset) => {
                          const itemIdx = (selectedWpIndex + slotOffset + len * 100) % len;
                          const wp = currentWallpapersList[itemIdx];
                          if (!wp) return null;
                          const isSelected = slotOffset === 0;
                          // Full-path comparison only — basename matching intentionally excluded
                          // to prevent false positives when different folders share a filename
                          const isCurrentSystemWp = Boolean(
                            activeWindowsWpPath &&
                            wp.filePath &&
                            wp.filePath.toLowerCase().replace(/\//g, '\\') ===
                              activeWindowsWpPath.toLowerCase().replace(/\//g, '\\')
                          );
                          const isApplyingThis = isSelected && isWpApplying;

                          return (
                            <div
                              key={wp.id}
                              role="button"
                              tabIndex={isSelected ? 0 : -1}
                              aria-label={isSelected
                                ? (appLang === 'ar' ? `تطبيق الخلفية: ${wp.name}` : `Apply wallpaper: ${wp.name}`)
                                : (appLang === 'ar' ? `اختيار الخلفية: ${wp.name}` : `Select wallpaper: ${wp.name}`)}
                              aria-pressed={isCurrentSystemWp}
                              onClick={() => handleBrowseWallpaper(itemIdx)}
                              style={{position:'absolute',left:0,top:0,width:isSelected?264:58,height:136,transform:`translate3d(${slotOffset===0?136:slotOffset<0?136+slotOffset*68:410+(slotOffset-1)*68}px,0,0) skewX(-11deg)`,transition:'transform 240ms cubic-bezier(.22,.8,.22,1),width 240ms cubic-bezier(.22,.8,.22,1),opacity 180ms',willChange:'transform,width',cursor:'pointer'}}
                              className={`wallpaper-card relative rounded-2xl overflow-hidden select-none bg-[var(--panel-card)] shrink-0 ${
                                isSelected
                                  ? 'shadow-[0_12px_32px_rgba(0,0,0,0.8)] brightness-100'
                                  : 'opacity-75 hover:opacity-100 hover:brightness-105'
                              } ${isCurrentSystemWp ? '' : ''}`}
                              title={isCurrentSystemWp
                                ? (appLang === 'ar' ? 'الخلفية الحالية لسطح المكتب' : 'Current Windows wallpaper')
                                : isSelected
                                  ? (appLang === 'ar' ? 'الخلفية المحددة' : 'Selected wallpaper')
                                  : wp.name}
                            >
                              <img
                                src={wp.url}
                                alt={wp.name}
                                style={{
                                  transform: 'skewX(11deg) scale(1.3)',
                                  transformOrigin: 'center center',
                                }}
                                className="w-full h-full object-cover select-none pointer-events-none"
                                loading="eager" decoding="async"
                                onError={e=>{e.currentTarget.style.opacity='0';e.currentTarget.parentElement?.setAttribute('data-preview-error','true');}}
                              />
                              <span className="wallpaper-image-error">{wp.name}</span>

                              {isApplyingThis&&<span className="wallpaper-progress" aria-hidden/>}
                            </div>
                          );
                        });
                      })()}
                    </div>

                    {/* Next Button */}
                    <button
                      onClick={() => {
                        const len = currentWallpapersList.length;
                        if (len > 0) navigateWallpaper(1);
                      }}
                      className="absolute right-1 z-30 w-7 h-7 rounded-full bg-black/60 hover:bg-black/90 text-white/70 hover:text-white flex items-center justify-center backdrop-blur-md border border-white/10 transition-all cursor-pointer opacity-70 hover:opacity-100 focus-visible:opacity-100"
                      title={appLang === 'ar' ? 'الخلفية التالية' : 'Next Wallpaper'}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  )}
                </div>
              )}

              {/* 7. POWER TAB */}
              {activeTab === 'power' && (
                <div key="power" className={`flex flex-col gap-2.5 py-0.5 ${tabAnimationClass}`}>
                  {/* Row of 4 PC Power Controls */}
                  <div className="grid grid-cols-4 gap-3">
                    {/* Lock */}
                    <button
                      onClick={() => handlePowerAction('lock')}
                      className={`h-[94px] ${
                        isLightMode
                          ? 'bg-white hover:bg-zinc-50 text-zinc-900 border border-zinc-200 shadow-sm'
                          : 'bg-[var(--panel-card)] hover:bg-[var(--panel-card)] text-zinc-100 border border-white/5'
                      } rounded-2xl flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all duration-200 group active:scale-95 hover:scale-[1.02] shadow-sm`}
                      title={appLang === 'ar' ? 'قفل شاشة الكمبيوتر' : 'Lock Windows Workstation'}
                    >
                      <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center group-hover:bg-amber-500/25 transition-colors">
                        <Lock className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                      </div>
                      <span className="text-xs font-bold leading-tight">{appLang === 'ar' ? 'قفل' : 'Lock'}</span>
                      <span className="text-[10px] text-zinc-400 opacity-80 leading-none">{appLang === 'ar' ? 'الشاشة' : 'Screen'}</span>
                    </button>

                    {/* Sleep */}
                    <button
                      onClick={() => handlePowerAction('sleep')}
                      className={`h-[94px] ${
                        isLightMode
                          ? 'bg-white hover:bg-zinc-50 text-zinc-900 border border-zinc-200 shadow-sm'
                          : 'bg-[var(--panel-card)] hover:bg-[var(--panel-card)] text-zinc-100 border border-white/5'
                      } rounded-2xl flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all duration-200 group active:scale-95 hover:scale-[1.02] shadow-sm`}
                      title={appLang === 'ar' ? 'وضع الكمبيوتر في السكون' : 'Put PC to Sleep'}
                    >
                      <div className="w-8 h-8 rounded-full bg-indigo-500/15 flex items-center justify-center group-hover:bg-indigo-500/25 transition-colors">
                        <Moon className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition-transform" />
                      </div>
                      <span className="text-xs font-bold leading-tight">{appLang === 'ar' ? 'سكون' : 'Sleep'}</span>
                      <span className="text-[10px] text-zinc-400 opacity-80 leading-none">{appLang === 'ar' ? 'الاستعداد' : 'Standby'}</span>
                    </button>

                    {/* Restart */}
                    <button
                      onClick={() => handlePowerAction('restart')}
                      className={`h-[94px] ${
                        isLightMode
                          ? 'bg-white hover:bg-zinc-50 text-zinc-900 border border-zinc-200 shadow-sm'
                          : 'bg-[var(--panel-card)] hover:bg-[var(--panel-card)] text-zinc-100 border border-white/5'
                      } rounded-2xl flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all duration-200 group active:scale-95 hover:scale-[1.02] shadow-sm`}
                      title={appLang === 'ar' ? 'إعادة تشغيل ويندوز' : 'Restart Windows'}
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-500/15 flex items-center justify-center group-hover:bg-blue-500/25 transition-colors">
                        <RotateCcw className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                      </div>
                      <span className="text-xs font-bold leading-tight">{appLang === 'ar' ? 'إعادة تشغيل' : 'Restart'}</span>
                      <span className="text-[10px] text-zinc-400 opacity-80 leading-none">{appLang === 'ar' ? 'إعادة الإقلاع' : 'Reboot'}</span>
                    </button>

                    {/* Shut Down PC */}
                    <button
                      onClick={() => handlePowerAction('shutdown')}
                      className={`h-[94px] ${
                        isLightMode
                          ? 'bg-white hover:bg-zinc-50 text-zinc-900 border border-zinc-200 shadow-sm'
                          : 'bg-[var(--panel-card)] hover:bg-[var(--panel-card)] text-zinc-100 border border-white/5'
                      } rounded-2xl flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all duration-200 group active:scale-95 hover:scale-[1.02] shadow-sm`}
                      title={appLang === 'ar' ? 'إيقاف تشغيل الكمبيوتر' : 'Shut Down PC'}
                    >
                      <div className="w-8 h-8 rounded-full bg-rose-500/15 flex items-center justify-center group-hover:bg-rose-500/25 transition-colors">
                        <Power className="w-4 h-4 text-rose-400 group-hover:scale-110 transition-transform" />
                      </div>
                      <span className="text-xs font-bold leading-tight">{appLang === 'ar' ? 'إطفاء' : 'Shut down'}</span>
                      <span className="text-[10px] text-zinc-400 opacity-80 leading-none">{appLang === 'ar' ? 'إيقاف الطاقة' : 'Power off'}</span>
                    </button>
                  </div>

                  {/* Dedicated Button to Turn Off Program & Stop Server */}
                  <div className="pt-2 border-t border-black/5 dark:border-white/5">
                    <button
                      onClick={handleQuitAppAndServer}
                      className={`w-full h-11 ${
                        isLightMode
                          ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                          : 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/20'
                      } rounded-xl flex items-center justify-between px-4 cursor-pointer transition-all duration-200 active:scale-[0.99] group shadow-sm`}
                      title={appLang === 'ar' ? 'إغلاق MOHIVX Island بالكامل وإيقاف السيرفر' : 'Shut down MOHIVX Island and terminate background server'}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-lg bg-rose-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <PowerOff className="w-3.5 h-3.5 text-rose-400" />
                        </div>
                        <div className="flex flex-col text-left leading-tight">
                          <span className="text-xs font-bold text-rose-500 dark:text-rose-300">
                            {appLang === 'ar' ? 'إغلاق MOHIVX Island' : 'Quit MOHIVX Island'}
                          </span>
                          <span className="text-[10px] opacity-70">
                            {appLang === 'ar' ? 'إيقاف وإغلاق البرنامج بالكامل' : 'Closes application completely'}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 font-semibold tracking-wide">
                        {appLang === 'ar' ? 'إيقاف وخروج' : 'STOP & QUIT'}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
          </div>
        </div>
      </div>

      {/* 1. Circle to Ask Modal */}
      <CircleToAsk
        isActive={showCircleToAsk}
        onClose={() => setShowCircleToAsk(false)}
        accentColor={accentColor}
        onVisualSearchFeedback={showNotchFeedback}
      />

      {/* 2. Smart Dictation Modal */}
      <DictationModal
        isActive={showDictation}
        onClose={() => setShowDictation(false)}
        accentColor={accentColor}
        onDictationFeedback={showNotchFeedback}
      />

      {/* 3. Scheduled Actions Modal */}
      <ScheduledActions
        isOpen={showScheduled}
        onClose={() => setShowScheduled(false)}
        accentColor={accentColor}
        onScheduledFeedback={showNotchFeedback}
      />

      {/* 4. Soul Loadout Hub */}
      <LoadoutHub
        isOpen={showLoadout}
        onClose={() => setShowLoadout(false)}
        activeSkin={activeSoulSkin}
        onSelectSkin={(s) => { setActiveSoulSkin(s); electron?.ipcRenderer.invoke('update-app-settings', { activeSkin: s.id,...skinThemePatch(s.id) }); }}
        activeVoice={activeVoice}
        onSelectVoice={(v) => { setActiveVoice(v); electron?.ipcRenderer.invoke('update-app-settings', { activeVoice: v.name }); }}
        onTriggerAbility={(ab) => {
          if (ab === 'circle') setShowCircleToAsk(true);
          else if (ab === 'dictation') setShowDictation(true);
          else if (ab === 'scheduled') setShowScheduled(true);
          else if (electron?.ipcRenderer) {
            void electron.ipcRenderer.invoke('run-ability',ab).catch(()=>showNotchFeedback(appLang==='ar'?'احصل على القدرة من المتجر.':'Get this ability in the store.'));
          }
        }}
      />
    </div>
  );
};


