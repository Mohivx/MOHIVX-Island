export type SoulMode = 'LISTENING' | 'THINKING' | 'TALKING' | 'MUTED';

export type SoulSkinId = 'hitodama' | 'ember' | 'wisp' | 'amethyst' | 'gilded' | 'void';

export interface SoulSkin {
  id: SoulSkinId;
  name: string;
  rarity: 'common' | 'rare' | 'legendary';
  core: string;
  mid: string;
  glow: string;
  aura: string;
  blurb: string;
}

export interface WallpaperItem {
  id: number|string;
  name: string;
  url: string;
  filePath?: string;
  sourcePath?: string;
  palette?: {
    accent: string;
    ink: string;
    chest: string;
    done: string;
    ember: string;
    panel: string;
  };
}

export interface ClipboardItem {
  id: string;
  type: 'text' | 'link' | 'code' | 'image';
  title: string;
  content: string;
  timestamp: string;
  pinned?: boolean;
}

export interface TodoItem {
  id: string;
  title: string;
  completed: boolean;
  time?: string;
}

export interface VoiceOption {
  key: string;
  name: string;
  description: string;
  free: boolean;
}
