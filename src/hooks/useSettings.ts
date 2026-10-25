import { useCallback, useEffect, useRef, useState } from 'react';
import {skinThemePatch} from '../themes';
import { normalizeTabOrder } from './islandNavigation.mjs';
import {notificationPreferences} from '../../electron/services/notificationPreferences.mjs';
import { DEFAULT_MOHIVX_SETTINGS, type MohivxSettings } from '../types/settings';

export const ipc = typeof window !== 'undefined' && (window as any).require
  ? (window as any).require('electron').ipcRenderer : null;

export type CompanionSettings = MohivxSettings & {
  activeSkin: string; activeVoice: string; activePersonality: string; activeAbility: string;
  tavilyKey: string; responseStyle: string; aiPersonality: string;
};

export function normalizeSettings(value: any = {}): CompanionSettings {
  const base = DEFAULT_MOHIVX_SETTINGS;
  const tabOrder = normalizeTabOrder(value.tabOrder, base.tabOrder);
  const visibleTabs = { ...base.visibleTabs, ...value.visibleTabs };
  const supportedTabs = new Set(base.tabOrder);
  const defaultTab = typeof value.defaultTab === 'string' &&
    supportedTabs.has(value.defaultTab) && visibleTabs[value.defaultTab as keyof typeof visibleTabs] !== false
    ? value.defaultTab
    : tabOrder.find(id => supportedTabs.has(id) && visibleTabs[id as keyof typeof visibleTabs] !== false) || 'controls';
  const phoneDeviceLayout:Record<string,{x:number;y:number}>={};
  if(value.phoneDeviceLayout&&typeof value.phoneDeviceLayout==='object'&&!Array.isArray(value.phoneDeviceLayout))for(const [id,point]of Object.entries(value.phoneDeviceLayout).slice(0,32)){
    const p=point as any;if(typeof id==='string'&&id.length>0&&id.length<=100&&Number.isFinite(p?.x)&&Number.isFinite(p?.y))phoneDeviceLayout[id]={x:Math.max(0,Math.min(1,p.x)),y:Math.max(0,Math.min(1,p.y))};
  }
  return {
    ...base, activeSkin: 'hitodama', activeVoice: 'Charon', activePersonality: 'True Chad',
    activeAbility: '', tavilyKey: '', responseStyle: 'concise', aiPersonality: 'chad', ...value,
    settingsTheme: value.settingsTheme === 'black' ? 'black' : 'pc',
    musicTheme: ['off','player','edge-bars','classic','split'].includes(value.musicTheme) ? value.musicTheme : value.musicPresentation==='off' ? 'off' : value.musicPresentation==='waveform' ? 'edge-bars' : value.musicPresentation==='disc' ? 'split' : base.musicTheme,
    musicSizing: ['fixed','expand'].includes(value.musicSizing) ? value.musicSizing : base.musicSizing,
    visibleTabs,
    shortcuts: { ...base.shortcuts, ...value.shortcuts },
    codingAgents: { ...base.codingAgents, ...value.codingAgents },
    androidGateway: { ...base.androidGateway, ...value.androidGateway },
    tabOrder,
    defaultTab,
    phoneDeviceLayout,
    windowControlsSide: value.windowControlsSide === 'right' ? 'right' : 'left',
    islandGlowStrength:typeof value.islandGlowStrength==='number'&&Number.isFinite(value.islandGlowStrength)?Math.max(0,Math.min(1.5,value.islandGlowStrength)):1,
    islandGlowSpread:typeof value.islandGlowSpread==='number'&&Number.isFinite(value.islandGlowSpread)?Math.max(.5,Math.min(1.5,value.islandGlowSpread)):1,
    ...notificationPreferences(value),
  };
}

export function useSettings() {
  const [settings, setSettings] = useState(() => {
    try { return normalizeSettings(ipc ? {} : JSON.parse(localStorage.getItem('mohivx_settings') || '{}')); }
    catch { return normalizeSettings(); }
  });
  const [status, setStatus] = useState('');
  const confirmed = useRef(settings);
  useEffect(() => {
    const receive = (_: unknown, value: unknown) => {
      confirmed.current = normalizeSettings(value);
      setSettings(confirmed.current);
    };
    if (ipc) {
      ipc.invoke('get-app-settings').then((s: unknown) => receive(null, s)).catch(() => setStatus('Could not load settings'));
      ipc.on('app-settings-updated', receive);
      return () => ipc.removeListener('app-settings-updated', receive);
    }
    const sync = () => {
      try { receive(null, JSON.parse(localStorage.getItem('mohivx_settings') || '{}')); } catch { /* invalid old cache */ }
    };
    window.addEventListener('storage', sync);
    window.addEventListener('mohivx-settings-changed', sync);
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('mohivx-settings-changed', sync); };
  }, []);
  const update = useCallback(async (partial: Partial<CompanionSettings>) => {
    if(partial.activeSkin)partial={...partial,...skinThemePatch(partial.activeSkin)};
    setSettings(s => normalizeSettings({ ...s, ...partial }));
    setStatus('Saving…');
    try {
      if (ipc) {
        const saved = await ipc.invoke('update-app-settings', partial);
        if (saved?.error) throw new Error(saved.error);
        confirmed.current = normalizeSettings(saved);
        setSettings(confirmed.current);
      } else {
        const previous = JSON.parse(localStorage.getItem('mohivx_settings') || '{}');
        const next = normalizeSettings({ ...previous, ...partial });
        const { geminiKey: _key, tavilyKey: _searchKey, providerKey: _providerKey, ...cache } = next;
        localStorage.setItem('mohivx_settings', JSON.stringify(cache));
        confirmed.current = next;
        window.dispatchEvent(new Event('mohivx-settings-changed'));
      }
      if (partial.appLang) localStorage.setItem('hitodama_lang', partial.appLang);
      setStatus('Saved');
      return true;
    } catch (e) {
      setSettings(confirmed.current);
      setStatus(e instanceof Error ? e.message : 'Could not save');
      return false;
    }
  }, []);
  return { settings, update, status };
}
