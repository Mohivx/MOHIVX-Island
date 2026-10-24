import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';
import { nextAppSelection, nextVisibleTab } from './islandNavigation.mjs';

export type UseIslandKeyboardProps = {
  open: boolean;
  blocked: boolean;
  rtl: boolean;
  tabIds: string[];
  activeTab: string;
  onTabSelect: (id: string) => void;
  appsActive: boolean;
  appIds: string[];
  query: string;
  searchRef: RefObject<HTMLInputElement | null>;
  onLaunchApp: (id: string) => void;
};

export type UseIslandKeyboardResult = {
  selectedAppId: string | null;
  selectApp: (id: string | null) => void;
  resetApps: () => void;
  onAppKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).tagName !== 'string') return false;
  const el = target as HTMLElement;
  const tag = el.tagName.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  if (typeof el.closest === 'function' && el.closest('[contenteditable]:not([contenteditable="false"])')) return true;
  return false;
}

function escapeAttr(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}

export function useIslandKeyboard(props: UseIslandKeyboardProps): UseIslandKeyboardResult {
  const { open, blocked, appsActive, appIds, query } = props;
  const [selected, setSelected] = useState<string | null>(null);

  // Effective selection drops a stale ID immediately; identity survives reorders.
  const selectedAppId = selected !== null && appIds.includes(selected) ? selected : null;

  const latest = useRef(props);
  latest.current = props;
  const selectedRef = useRef<string | null>(selectedAppId);
  selectedRef.current = selectedAppId;

  // Reset on query change and when apps/island close or reopen.
  useEffect(() => {
    setSelected(null);
  }, [query, appsActive, open]);

  // Remove stale selection that no longer exists in results.
  useEffect(() => {
    if (selected !== null && !appIds.includes(selected)) setSelected(null);
  }, [appIds, selected]);

  // Keep the selected row visible.
  useEffect(() => {
    if (selectedAppId === null || typeof document === 'undefined') return;
    const row = document.querySelector(`[data-app-key="${escapeAttr(selectedAppId)}"]`) as HTMLElement | null;
    if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
  }, [selectedAppId]);

  // Global Ctrl + ArrowLeft/ArrowRight section cycling.
  useEffect(() => {
    if (!open || blocked || typeof window === 'undefined') return;
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const current = latest.current;
      if (isEditableTarget(event.target) && event.target !== current.searchRef.current) return;
      const next = nextVisibleTab(current.tabIds, current.activeTab, event.key, current.rtl);
      if (next === null) return;
      event.preventDefault();
      if (next !== current.activeTab) current.onTabSelect(next);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, blocked]);

  const selectApp = useCallback((id: string | null) => setSelected(id), []);
  const resetApps = useCallback(() => setSelected(null), []);

  const onAppKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    const current = latest.current;
    if (!current.open || !current.appsActive || current.blocked) return;
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    const key = event.key;
    if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Enter') return;
    const search = current.searchRef.current;
    if (search && event.currentTarget !== search) return;
    const ids = current.appIds;
    const sel = selectedRef.current;
    if (key === 'Enter') {
      const target = sel !== null && ids.includes(sel) ? sel : ids[0];
      if (target === undefined) return;
      event.preventDefault();
      current.onLaunchApp(target);
      return;
    }
    if (ids.length === 0) return;
    event.preventDefault();
    const index = sel !== null ? ids.indexOf(sel) : -1;
    const nextIndex = nextAppSelection(ids.length, index, key);
    setSelected(nextIndex >= 0 ? ids[nextIndex] : null);
  }, []);

  return { selectedAppId, selectApp, resetApps, onAppKeyDown };
}
