export type AppTheme =
  | 'original-blue'
  | 'original-gold'
  | 'mohivx-obsidian'
  | 'amoled-black'
  | 'silver-monochrome'
  | 'midnight'
  | 'amethyst'
  | 'custom';

export type IslandShape =
  | 'classic'
  | 'dynamic-island'
  | 'orb-circle'
  | 'liquid-glass'
  | 'mohivx-modern';

export type AiProvider =
  | 'hermes-local'
  | 'hermes-remote'
  | 'gemini-cloud'
  | 'custom-openai';

export type AppLang = 'en' | 'ar';

export interface PairedAndroidDevice {
  id: string;
  name: string;
  ip: string;
  pairedAt: string;
  lastSeen: string;
  isOnline: boolean;
  capabilities: {
    telemetry: boolean;
    volume: boolean;
    apps: boolean;
    wallpapers: boolean;
    ai: boolean;
  };
}

export interface MohivxSettings {
  settingsTheme: 'pc' | 'black';
  advancedMode:boolean;
  uiSounds:boolean;uiSoundVolume:number;abilitySoundVolume:number;liveVoiceModel:string;replySpeed:'fast'|'patient';
  historySide:'left'|'right';
  windowControlsSide:'left'|'right';
  userName:string;
  weatherCity:string;
  panelStyle:'glass'|'solid'; panelCorners:'rounded'|'square';
  shareAppContext: boolean;
  preferredMicId: string;
  providerUrl: string;
  providerKey: string;
  releaseFeed: string;
  favoriteAppIds: string[];
  mascotMode: 'original' | 'custom';
  displayId: string; hideWhileFullscreen: boolean; showReactions: boolean; showActionCards: boolean; autoCloseDictation: boolean; memoryEnabled: boolean; agentMemory: string;
  // General
  appLang: AppLang;
  runOnStartup: boolean;
  lowPowerMode: boolean;
  gpuAcceleration: boolean;
  minimizeToTray: boolean;
  autoCheckUpdates: boolean;

  // Appearance & Shapes
  theme: AppTheme;
  customAccentColor: string;
  islandShape: IslandShape;
  islandScale: number; // 0.8 to 1.3
  islandGlowStrength:number;
  islandGlowSpread:number;
  islandStroke:'off'|'thin'|'medium'|'thick';
  islandStrokeColor:string;
  clockWhileAsleep:boolean;
  reserveSpace:boolean;
  islandOpacity: number; // 0.6 to 1.0
  blurStrength: number; // 0 to 40
  borderGlow: boolean;

  // Layout & Tabs
  position: 'top-center' | 'top-left' | 'top-right' | 'left' | 'right' | 'bottom';
  visibleTabs: {
    phone: boolean;
    agents: boolean;
    ai: boolean;
    controls: boolean;
    today: boolean;
    stats: boolean;
    clipboard: boolean;
    apps: boolean;
    wallpaper: boolean;
    power: boolean;
  };
  tabOrder: string[];
  defaultTab: string;
  islandNotificationsEnabled:boolean;
  windowsNotificationsEnabled:boolean;
  mohivxToastsEnabled:boolean;
  notificationStyle:'compact'|'detailed';
  notificationMotion:'smooth'|'fade'|'instant';
  notificationDurationSeconds:number;
  notificationWidth:number;

  // Animations & Typography
  musicVisualizerStyle: 'bars' | 'wave' | 'ring';
  musicPresentation: 'off' | 'compact' | 'disc' | 'waveform';
  musicTheme: 'off' | 'player' | 'edge-bars' | 'classic' | 'split';
  musicSizing: 'expand' | 'fixed';
  animationSpeed: 'instant' | 'fast' | 'smooth' | 'cinematic';
  fontFamily: 'system-ui' | 'inter' | 'cairo' | 'sf-pro';
  fontSize: 'small' | 'medium' | 'large';

  // Shortcuts
  shortcuts: {
    toggleIsland: string;
    openSettings: string;
    showApps: string;
    dictation: string;
    circleToAsk: string;
    askClipboard: string;
  };

  // System Controls
  preferredAudioDevice: string;
  volumeStep: number;
  autoDetectNetwork: boolean;

  // Wallpapers
  wallpaperFolder: string;
  wallpaperSlideshow: boolean;
  wallpaperIntervalMinutes: number;
  wallpaper3DDepth: number; // 1 to 5

  // Clipboard
  clipboardMaxItems: number;
  clipboardPersist: boolean;
  clipboardFilterSensitive: boolean;
  clipboardAutoCaptureImages: boolean;

  // Spirit Mascot
  spiritStyle: 'mohivx' | 'silver' | 'minimal' | 'spectral';
  spiritSleepTimeout: number; // seconds
  spiritInteractive: boolean;
  spiritGlow: boolean;

  // Hermes Agent & AI
  aiEnabled: boolean;
  aiProvider: AiProvider;
  hermesServerHost: string;
  hermesServerPort: number;
  hermesModel: string;
  hermesAutoApproveSafe: boolean;
  geminiKey: string;
  customDirectives: string;
  voiceInputEnabled: boolean;

  // Coding Agent Center
  codingAgents: {
    antigravity: boolean;
    hermes: boolean;
    claude: boolean;
    codex: boolean;
  };
  agentNotifyOnComplete: boolean;
  agentBridgeEnabled:boolean;
  agentShowRequests:boolean;
  wallpaperTransition:boolean;
  phoneCameraDevice:string;
  phoneMicDevice:string;
  phoneMicAuto:boolean;
  phoneSelectedDevice:string;
  phoneDeviceLayout:Record<string,{x:number;y:number}>;
  phoneMicSink:string;
  agentNotifyOnError: boolean;
  agentSyncToAndroid: boolean;

  // Android Companion
  androidGateway: {
    enabled: boolean;
    port: number;
    allowRemoteControl: boolean;
    requirePinConfirmation: boolean;
    pairedDevices: PairedAndroidDevice[];
  };

  // Performance
  telemetryIntervalMs: number;
  idleThrottling: boolean;
  pauseAnimationsWhenHidden: boolean;

  // Privacy & Security
  localOnlyMode: boolean;
  clearHistoryOnExit: boolean;
}

export const DEFAULT_MOHIVX_SETTINGS: MohivxSettings = {
  settingsTheme: 'pc',
  displayId:'primary', hideWhileFullscreen:false, showReactions:true, showActionCards:true, autoCloseDictation:false, memoryEnabled:false, agentMemory:'',
  advancedMode:false,
  uiSounds:true,uiSoundVolume:.12,abilitySoundVolume:.16,liveVoiceModel:'gemini-3.8-live',replySpeed:'patient',
  historySide:'left',
  windowControlsSide:'left',
  panelStyle:'glass',panelCorners:'rounded',
  shareAppContext:false,
  userName:'',weatherCity:'',
  preferredMicId: 'default', providerUrl: '', providerKey: '', releaseFeed: '', favoriteAppIds: [], mascotMode: 'original',
  appLang: 'en',
  runOnStartup: true,
  lowPowerMode: true,
  gpuAcceleration: true,
  minimizeToTray: true,
  autoCheckUpdates: true,

  theme: 'original-blue',
  customAccentColor: '#8bbcff',
  islandShape: 'classic',
  islandScale: 1.0,
  islandGlowStrength:1,
  islandGlowSpread:1,
  islandStroke:'off',
  islandStrokeColor:'#8bbcff',
  clockWhileAsleep:false,
  reserveSpace:true,
  islandOpacity: 0.95,
  blurStrength: 24,
  borderGlow: true,

  position: 'top-center',
  visibleTabs: {
    phone: true,
    agents: true,
    ai: true,
    controls: true,
    today: true,
    stats: true,
    clipboard: true,
    apps: true,
    wallpaper: true,
    power: true,
  },
  tabOrder: ['agents','phone', 'controls', 'today', 'stats', 'clipboard', 'apps', 'wallpaper', 'power', 'ai'],
  defaultTab: 'controls',
  islandNotificationsEnabled:true,windowsNotificationsEnabled:true,mohivxToastsEnabled:false,
  notificationStyle:'detailed',notificationMotion:'smooth',notificationDurationSeconds:8,notificationWidth:420,

  musicVisualizerStyle: 'bars',
  musicPresentation: 'compact',
  musicTheme: 'edge-bars',
  musicSizing: 'fixed',
  animationSpeed: 'smooth',
  fontFamily: 'system-ui',
  fontSize: 'medium',

  shortcuts: {
    toggleIsland: 'Alt+D',
    openSettings: 'Alt+Space',
    showApps: 'Alt+A',
    dictation: 'Alt+J',
    circleToAsk: 'Alt+Shift+S',
    askClipboard: 'Alt+C',
  },

  preferredAudioDevice: 'default',
  volumeStep: 5,
  autoDetectNetwork: true,

  wallpaperFolder: '',
  wallpaperSlideshow: false,
  wallpaperIntervalMinutes: 30,
  wallpaper3DDepth: 3,

  clipboardMaxItems: 50,
  clipboardPersist: true,
  clipboardFilterSensitive: true,
  clipboardAutoCaptureImages: true,

  spiritStyle: 'mohivx',
  spiritSleepTimeout: 300,
  spiritInteractive: true,
  spiritGlow: true,

  aiEnabled: true,
  aiProvider: 'gemini-cloud',
  hermesServerHost: '127.0.0.1',
  hermesServerPort: 9119,
  hermesModel: 'default',
  hermesAutoApproveSafe: true,
  geminiKey: '',
  customDirectives: 'Be concise, accurate, and execute tasks directly.',
  voiceInputEnabled: true,

  codingAgents: {
    antigravity: true,
    hermes: true,
    claude: true,
    codex: false,
  },
  agentNotifyOnComplete: true,
  agentBridgeEnabled:true,
  agentShowRequests:true,
  wallpaperTransition:true,
  phoneCameraDevice:'',phoneMicDevice:'',phoneMicAuto:true,phoneSelectedDevice:'',phoneDeviceLayout:{},
  phoneMicSink:'',
  agentNotifyOnError: true,
  agentSyncToAndroid: true,

  androidGateway: {
    enabled: false,
    port: 9120,
    allowRemoteControl: true,
    requirePinConfirmation: true,
    pairedDevices: [],
  },

  telemetryIntervalMs: 3000,
  idleThrottling: true,
  pauseAnimationsWhenHidden: true,

  localOnlyMode: false,
  clearHistoryOnExit: false,
};
