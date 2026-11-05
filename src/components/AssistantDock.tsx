import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// One small arrow tab instead of two floating pills. Point at it (or click it) and the AI help + Co-worker buttons appear next to it;
// move the mouse away and they tuck back. Drag the arrow anywhere; the place is remembered in this browser (double-click = reset).
// The assistants keep running while tucked away (Co-worker still listens for "Hi Raaju"): only their buttons are hidden.
const KEY = 'assistant-dock-pos';
const W = 26, H = 58;

const defaults = () => (window.innerWidth >= 1024 ? { x: 80, y: 20 } : { x: 0, y: 76 });
const clamp = (p: { x: number; y: number }) => ({
  x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - W)),
  y: Math.min(Math.max(8, p.y), Math.max(8, window.innerHeight - H - 8)),
});
function read(): { x: number; y: number } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v.x === 'number' && typeof v.y === 'number') return clamp(v);
  } catch { /* default */ }
  return defaults();
}
/** y is the distance from the bottom of the screen; the buttons are placed from these two variables (see index.css). */
function publish(p: { x: number; y: number }) {
  const s = document.documentElement.style;
  s.setProperty('--dock-x', `${p.x}px`);
  s.setProperty('--dock-y', `${p.y}px`);
  // the buttons open towards the free side of the screen
  document.documentElement.setAttribute('data-dock-side', p.x > window.innerWidth / 2 ? 'right' : 'left');
}

export function AssistantDock() {
  const [pos, setPos] = useState(read);
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const timer = useRef<number | null>(null);
  const drag = useRef<{ dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);
  const moved = useRef(false);

  useEffect(() => { publish(pos); }, [pos]);
  useEffect(() => {
    const onResize = () => setPos(p => clamp(p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute('data-dock', open ? 'open' : 'collapsed');
  }, [open]);
  useEffect(() => () => { document.documentElement.removeAttribute('data-dock'); }, []);

  const stopTimer = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };
  const tuck = useCallback(() => { stopTimer(); timer.current = window.setTimeout(() => { if (!pinned.current) setOpen(false); }, 1500); }, []);

  // While open: staying over the arrow, a button or a popup keeps it open; leaving them all tucks it away after a moment.
  useEffect(() => {
    if (!open) return;
    const onMove = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest?.('[data-dock-handle], [data-assistant-launcher], [role="menu"], [role="dialog"]')) stopTimer();
      else if (timer.current === null) tuck();
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [open, tuck]);

  const Icon = (pos.x > window.innerWidth / 2) !== open ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      data-dock-handle
      data-voice-ignore
      aria-label={open ? 'Hide the AI buttons' : 'Show the AI buttons'}
      aria-expanded={open}
      title="AI help + Co-worker · point here to open · drag to move · double-click to reset"
      className="fixed z-[61] flex touch-none select-none items-center justify-center rounded-r-xl border border-l-0 border-slate-700 bg-slate-900/90 text-white shadow-lg backdrop-blur-xs hover:bg-slate-800 cursor-grab active:cursor-grabbing"
      style={{ left: pos.x, bottom: pos.y, width: W, height: H, ...(pos.x > window.innerWidth / 2 ? { borderRadius: '0.75rem 0 0 0.75rem', borderLeftWidth: 1, borderRightWidth: 0 } : {}) }}
      onMouseEnter={() => { stopTimer(); setOpen(true); }}
      onPointerDown={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        drag.current = { dx: e.clientX - r.left, dy: r.bottom - e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
        moved.current = false;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current; if (!d) return;
        if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
        d.moved = true; moved.current = true;
        setPos(clamp({ x: e.clientX - d.dx, y: window.innerHeight - e.clientY - d.dy }));
      }}
      onPointerUp={() => {
        const d = drag.current; drag.current = null;
        if (d?.moved) {
          try { localStorage.setItem(KEY, JSON.stringify(pos)); } catch { /* not saved */ }
          setTimeout(() => { moved.current = false; }, 0);
        }
      }}
      onDoubleClick={() => { const p = defaults(); setPos(p); try { localStorage.removeItem(KEY); } catch { /* ignore */ } }}
      onClick={() => {
        if (moved.current) return;
        // a click keeps the buttons open until it is clicked again
        if (pinned.current) { pinned.current = false; setOpen(false); } else { pinned.current = true; setOpen(true); }
      }}
    >
      <Icon size={16} />
    </button>
  );
}
