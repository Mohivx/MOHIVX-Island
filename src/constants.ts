import STUDIO_VOICES from '../electron/data/voices.json';
import type { SoulSkin, WallpaperItem, ClipboardItem, TodoItem, VoiceOption } from './types';

export const SOUL_SKINS: Record<string, SoulSkin> = {
  hitodama: {
    id: 'hitodama',
    name: 'Hitodama',
    rarity: 'common',
    core: '#FFFFFF',
    mid: '#BFE9FF',
    glow: '#5CB8FF',
    aura: 'default',
    blurb: 'The original guardian soul flame. Soft lilac-blue and serene.'
  },
  ember: {
    id: 'ember',
    name: 'Ember',
    rarity: 'common',
    core: '#FFFFFF',
    mid: '#FFA070',
    glow: '#FF4530',
    aura: 'ember',
    blurb: 'What it looks like the moment it wakes up angry.'
  },
  wisp: {
    id: 'wisp',
    name: 'Wisp',
    rarity: 'common',
    core: '#FFFFFF',
    mid: '#C9F5D8',
    glow: '#6FD79A',
    aura: 'wisp',
    blurb: 'Marsh-light green, the colour of something leading you off the path.'
  },
  amethyst: {
    id: 'amethyst',
    name: 'Amethyst',
    rarity: 'rare',
    core: '#FFFFFF',
    mid: '#E2CCFF',
    glow: '#A97BFF',
    aura: 'shard',
    blurb: 'Quieter than it looks. Burns slow and deep.'
  },
  gilded: {
    id: 'gilded',
    name: 'Gilded',
    rarity: 'rare',
    core: '#FFFFFF',
    mid: '#FFEEB8',
    glow: '#FFC24A',
    aura: 'glint',
    blurb: 'Old temple gold, the kind left burning for someone who never came back.'
  },
  void: {
    id: 'void',
    name: 'Void',
    rarity: 'legendary',
    core: '#F2E9FF',
    mid: '#8A6FC7',
    glow: '#2B1E52',
    aura: 'void',
    blurb: 'The dark it drifted through, carried on purpose this time. Includes the Collapse ability.'
  }
};

export const WALLPAPERS: WallpaperItem[] = [
  {
    id: 0,
    name: 'Solar Sunrise',
    url: '/images/wallpapers/wallpaper0.jpg',
    palette: {
      accent: '#FF8E5F',
      ink: '#3A1000',
      chest: '#DC9CFF',
      done: '#98CE58',
      ember: '#F0D03C',
      panel: '#140906'
    }
  },
  {
    id: 1,
    name: 'Gilded Temple',
    url: '/images/wallpapers/wallpaper1.jpg',
    palette: {
      accent: '#CEAD60',
      ink: '#2A1D00',
      chest: '#D3A6ED',
      done: '#A3C97D',
      ember: '#FFBFB1',
      panel: '#0F0D08'
    }
  },
  {
    id: 2,
    name: 'Azure Lake',
    url: '/images/wallpapers/wallpaper2.jpg',
    palette: {
      accent: '#64BCF0',
      ink: '#002235',
      chest: '#C2ABFA',
      done: '#8ACE8E',
      ember: '#EACF77',
      panel: '#080E12'
    }
  },
  {
    id: 3,
    name: 'Midnight Lavender',
    url: '/images/wallpapers/wallpaper3.jpg',
    palette: {
      accent: '#8AAFFF',
      ink: '#0C1C44',
      chest: '#C3AAFF',
      done: '#81D187',
      ember: '#EECF65',
      panel: '#0A0D14'
    }
  },
  {
    id: 4,
    name: 'Twilight Dusk',
    url: '/images/wallpapers/wallpaper4.jpg',
    palette: {
      accent: '#FD8E6E',
      ink: '#3D0B00',
      chest: '#DA9EFB',
      done: '#9CCD66',
      ember: '#F3CD55',
      panel: '#130A08'
    }
  },
  {
    id: 5,
    name: 'Torii Sunset',
    url: '/images/wallpapers/torii_sunset.jpg',
    palette: {
      accent: '#E65100',
      ink: '#260E04',
      chest: '#FFB74D',
      done: '#81C784',
      ember: '#FFD54F',
      panel: '#1A0C06'
    }
  },
  {
    id: 6,
    name: 'Abyss Horizon',
    url: '/images/wallpapers/abyss_horizon.jpg',
    palette: {
      accent: '#00E5FF',
      ink: '#001E28',
      chest: '#80D8FF',
      done: '#69F0AE',
      ember: '#FFE57F',
      panel: '#041017'
    }
  },
  {
    id: 7,
    name: 'Solitude Mountain',
    url: '/images/wallpapers/solitude_mountain.jpg',
    palette: {
      accent: '#78909C',
      ink: '#101416',
      chest: '#CFD8DC',
      done: '#A5D6A7',
      ember: '#FFF59D',
      panel: '#0F1214'
    }
  },
  {
    id: 8,
    name: 'Ethereal Waves',
    url: '/images/wallpapers/ethereal_waves.jpg',
    palette: {
      accent: '#7C4DFF',
      ink: '#1A0033',
      chest: '#B388FF',
      done: '#B9F6CA',
      ember: '#FFE57F',
      panel: '#120524'
    }
  },
  {
    id: 9,
    name: 'Neon Metropolis',
    url: '/images/wallpapers/neon_metropolis.jpg',
    palette: {
      accent: '#FF007F',
      ink: '#2B0017',
      chest: '#FF80BF',
      done: '#00E676',
      ember: '#FFD600',
      panel: '#19030E'
    }
  },
  {
    id: 10,
    name: 'Gothic Castle',
    url: '/images/wallpapers/gothic_castle.jpg',
    palette: {
      accent: '#5C6BC0',
      ink: '#0D1127',
      chest: '#9FA8DA',
      done: '#80CBC4',
      ember: '#FFE082',
      panel: '#0B0D1A'
    }
  },
  {
    id: 11,
    name: 'Cosmic Nebula',
    url: '/images/wallpapers/cosmic_nebula.jpg',
    palette: {
      accent: '#AB47BC',
      ink: '#1E0624',
      chest: '#CE93D8',
      done: '#80DEEA',
      ember: '#FFF176',
      panel: '#140319'
    }
  }
];

export const VOICES: VoiceOption[] = STUDIO_VOICES.map(name=>({key:'voice_'+name.toLowerCase(),name,description:'Gemini studio voice',free:true}));

export const INITIAL_CLIPBOARD: ClipboardItem[] = [
  {
    id: 'clip-1',
    type: 'text',
    title: 'Meeting Notes',
    content: "Hey Arsh, what's up? How about we go get some coffee at 10 in the morning, and then hang out at the park for a bit?",
    timestamp: 'Just now',
    pinned: true
  },
  {
    id: 'clip-2',
    type: 'link',
    title: 'Amazon Product Search',
    content: 'https://www.amazon.in/s?k=red+boxing+gloves+12+oz',
    timestamp: '4m ago'
  },
  {
    id: 'clip-3',
    type: 'code',
    title: 'Vite Development Command',
    content: 'npm run dev -- --port 3000 --host',
    timestamp: '1h ago'
  },
  {
    id: 'clip-4',
    type: 'image',
    title: 'Ashfall Store Header Graphic',
    content: 'Dimensions: 1920 × 1080 · PNG',
    timestamp: '2h ago'
  },
  {
    id: 'clip-5',
    type: 'text',
    title: 'Schedule Reminder',
    content: 'Client strategy call moved to Thursday at 4:00 PM',
    timestamp: '1d ago'
  }
];

export const INITIAL_TODOS: TodoItem[] = [
  { id: 'todo-1', title: 'Buy Hitodama Founders Edition!', completed: false, time: 'Today' },
  { id: 'todo-2', title: 'Subscribe to Otism Dev channel', completed: false, time: '2:00 PM' },
  { id: 'todo-3', title: 'Gym & Cardio session', completed: false, time: '6:00 PM' }
];

export const TOP_APPS_STATS = {
  ram: [
    { name: 'Chrome', usage: '1.4 GB', percent: 0.72 },
    { name: 'VS Code', usage: '820 MB', percent: 0.48 },
    { name: 'Spotify', usage: '340 MB', percent: 0.22 },
    { name: 'Hitodama Engine', usage: '64 MB', percent: 0.08 }
  ],
  cpu: [
    { name: 'VS Code', usage: '14.2%', percent: 0.65 },
    { name: 'Hitodama Soul Canvas', usage: '4.8%', percent: 0.32 },
    { name: 'Chrome', usage: '3.1%', percent: 0.24 },
    { name: 'System Audio', usage: '0.9%', percent: 0.12 }
  ]
};
