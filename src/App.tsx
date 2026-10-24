import React, { useState } from 'react';
import { DynamicIsland } from './components/DynamicIsland';
import {AbilityView} from './components/AbilityView';
import {ChatHistoryWindow} from './components/ChatHistoryWindow';
import {PhoneViewer} from './components/PhoneViewer';
import { SettingsWindow } from './components/SettingsWindow';
import type { SoulMode, SoulSkin, WallpaperItem } from './types';
import { SOUL_SKINS, WALLPAPERS } from './constants';

export const App: React.FC = () => {
  const [mode, setMode] = useState<SoulMode>('LISTENING');
  const [skin] = useState<SoulSkin>(SOUL_SKINS.hitodama);
  const [currentWallpaper, setCurrentWallpaper] = useState<WallpaperItem>(WALLPAPERS[0]);

  const isSettingsView = typeof window !== 'undefined' && (
    window.location.search.includes('view=settings') ||
    window.location.search.includes('view=hub') ||
    window.location.hash.includes('settings') ||
    window.location.hash.includes('hub')
  );

  if (new URLSearchParams(window.location.search).get('view')==='ability') return <AbilityView/>;
  if (new URLSearchParams(window.location.search).get('view')==='history') return <ChatHistoryWindow/>;
  if (new URLSearchParams(window.location.search).get('view')==='phone-viewer') return <PhoneViewer/>;

  if (isSettingsView) {
    return <SettingsWindow />;
  }

  return (
    <div
      className="relative w-full h-full overflow-hidden bg-transparent select-none"
      dir="ltr"
      style={{ backgroundColor: 'transparent' }}
    >
      <DynamicIsland
        mode={mode}
        skin={skin}
        onModeChange={setMode}
        currentWallpaper={currentWallpaper}
        onWallpaperSelect={(wp) => setCurrentWallpaper(wp)}
      />
    </div>
  );
};

export default App;
