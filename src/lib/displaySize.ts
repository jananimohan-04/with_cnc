// Display size for the whole app (50% – 145%). Saved in this browser; every place that shows or uses it stays in step.
import { useCallback, useEffect, useState } from 'react';

export const DISPLAY_MIN = 50;
export const DISPLAY_MAX = 145;
export const DISPLAY_STEP = 5;
export const DISPLAY_PRESETS = [['Small', 80], ['Normal', 100], ['Big', 125]] as const;

const KEY = 'cnc_display_size';
const OLD_KEY = 'cnc_pipeline_board_zoom';   // the Sales Pipeline's own size before it became app-wide
const EVENT = 'argus:display-size';

const clamp = (n: number) => Math.min(DISPLAY_MAX, Math.max(DISPLAY_MIN, Math.round(n / DISPLAY_STEP) * DISPLAY_STEP));

export function getDisplaySize(): number {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY);
    const n = Number(raw);
    return raw !== null && Number.isFinite(n) && n > 0 ? clamp(n) : 100;
  } catch { return 100; }
}

export function setDisplaySize(n: number) {
  const v = clamp(n);
  try { localStorage.setItem(KEY, String(v)); } catch { /* not saved */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: v }));
}

/** [size in %, set it] — shared by every component that uses it. */
export function useDisplaySize(): [number, (v: number | ((prev: number) => number)) => void] {
  const [size, setSize] = useState(getDisplaySize);
  useEffect(() => {
    const on = (e: Event) => setSize((e as CustomEvent<number>).detail);
    const other = (e: StorageEvent) => { if (e.key === KEY) setSize(getDisplaySize()); };   // another tab / window
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', other);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener('storage', other); };
  }, []);
  const set = useCallback((v: number | ((prev: number) => number)) => setDisplaySize(typeof v === 'function' ? v(getDisplaySize()) : v), []);
  return [size, set];
}
