// Display size (50% – 145%), kept separately for two kinds of screen:
//   'kanban' - the Sales Pipeline Kanban board (its 100% is the compact board look: 65% of normal size)
//   'page'   - every other page (starts at 100%)
// The page that is showing tells which one applies (setDisplayScope); the menu, the Ctrl + / Ctrl - keys and the scaling
// all work on that one. Saved in this browser.
import { useCallback, useEffect, useState } from 'react';
import { isTauri } from '@/lib/desktop/isTauri';

export const DISPLAY_MIN = 50;
export const DISPLAY_MAX = 145;
export const DISPLAY_STEP = 5;
export type DisplayScope = 'page' | 'kanban';
const DESKTOP = isTauri();
// The Kanban board starts on Big in the browser and on 110% in the desktop app; other pages start at 100%.
export const DISPLAY_DEFAULTS: Record<DisplayScope, number> = { page: 100, kanban: DESKTOP ? 110 : 125 };
/** What 100% means on each kind of screen: the Kanban board's 100% is the compact look (65% of normal size). */
export const DISPLAY_BASE: Record<DisplayScope, number> = { page: 1, kanban: 0.65 };
export const DISPLAY_PRESETS = [['Small', 80], ['Normal', 100], ['Big', 125]] as const;

// the desktop app keeps its own Kanban size (so its 110% start is not overridden by an older saved size)
const key = (scope: DisplayScope) => (scope === 'kanban' ? (DESKTOP ? 'cnc_display_size.kanban.desktop' : 'cnc_display_size.kanban.v3') : `cnc_display_size.${scope}`);
const EVENT = 'argus:display-size';

const clamp = (n: number) => Math.min(DISPLAY_MAX, Math.max(DISPLAY_MIN, Math.round(n / DISPLAY_STEP) * DISPLAY_STEP));

let activeScope: DisplayScope = 'page';
export const getDisplayScope = () => activeScope;
/** The showing page says which size applies (the Kanban board sets 'kanban' while it is on screen). */
export function setDisplayScope(scope: DisplayScope) {
  if (scope === activeScope) return;
  activeScope = scope;
  window.dispatchEvent(new Event(EVENT));
}

export function getDisplaySize(scope: DisplayScope = activeScope): number {
  try {
    const raw = localStorage.getItem(key(scope));
    const n = Number(raw);
    return raw !== null && Number.isFinite(n) && n > 0 ? clamp(n) : DISPLAY_DEFAULTS[scope];
  } catch { return DISPLAY_DEFAULTS[scope]; }
}

export function setDisplaySize(n: number, scope: DisplayScope = activeScope) {
  try { localStorage.setItem(key(scope), String(clamp(n))); } catch { /* not saved */ }
  window.dispatchEvent(new Event(EVENT));
}

/** The real scale factor for a size shown in the menu (the Kanban board's 100% is 0.65). */
export const displayScale = (size: number = getDisplaySize(), scope: DisplayScope = activeScope) => (size / 100) * DISPLAY_BASE[scope];

/** [size in % for the screen showing now, set it, its starting size] — every user of it stays in step. */
export function useDisplaySize(): [number, (v: number | ((prev: number) => number)) => void, number] {
  const [, bump] = useState(0);
  useEffect(() => {
    const on = () => bump((x) => x + 1);
    const other = (e: StorageEvent) => { if (e.key?.startsWith('cnc_display_size.')) on(); };   // another tab / window
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', other);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener('storage', other); };
  }, []);
  const set = useCallback((v: number | ((prev: number) => number)) => setDisplaySize(typeof v === 'function' ? v(getDisplaySize()) : v), []);
  return [getDisplaySize(), set, DISPLAY_DEFAULTS[activeScope]];
}

/** Ctrl + / Ctrl - (and Ctrl 0 to go back to the starting size) change the display size of the screen showing now. */
export function useDisplaySizeShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key;
      let next: number | null = null;
      if (k === '+' || k === '=' || e.code === 'NumpadAdd') next = getDisplaySize() + DISPLAY_STEP;
      else if (k === '-' || k === '_' || e.code === 'NumpadSubtract') next = getDisplaySize() - DISPLAY_STEP;
      else if (k === '0' || e.code === 'Numpad0') next = DISPLAY_DEFAULTS[activeScope];
      if (next === null) return;
      e.preventDefault();   // instead of the browser's own zoom
      setDisplaySize(next);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}
