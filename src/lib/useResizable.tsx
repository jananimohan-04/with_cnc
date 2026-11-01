import { useCallback, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * A panel that can be made bigger or smaller by dragging a corner. The size is remembered in this browser.
 * The panel is anchored at its bottom, so it grows upwards; `dirX` says which way it grows sideways
 * (1 = to the right, for a panel anchored at its left edge; -1 = to the left, for one anchored at its right edge).
 */
export function useResizable(storageKey: string, def: { w: number; h: number }, min: { w: number; h: number }) {
  const [size, setSize] = useState<{ w: number; h: number }>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (v && typeof v.w === 'number' && typeof v.h === 'number') return { w: Math.max(min.w, v.w), h: Math.max(min.h, v.h) };
    } catch { /* default size */ }
    return def;
  });
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const begin = useCallback((dirX: 1 | -1) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    const prevSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';   // no text gets selected while dragging (preventDefault would also swallow the double-click)
    const start = { x: e.clientX, y: e.clientY, w: sizeRef.current.w, h: sizeRef.current.h };
    const move = (ev: PointerEvent) => {
      const w = Math.min(Math.max(min.w, start.w + (ev.clientX - start.x) * dirX), window.innerWidth - 16);
      const h = Math.min(Math.max(min.h, start.h - (ev.clientY - start.y)), window.innerHeight - 24);
      setSize({ w, h });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.userSelect = prevSelect;
      try { localStorage.setItem(storageKey, JSON.stringify(sizeRef.current)); } catch { /* not saved */ }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [min.w, min.h, storageKey]);

  const reset = useCallback(() => {
    setSize(def);
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
  }, [def, storageKey]);

  /** keeps the panel inside the screen even when the saved size is bigger than this window */
  const style: CSSProperties = { width: `min(${size.w}px, calc(100vw - 1.5rem))`, height: `min(${size.h}px, calc(100vh - 6rem))` };
  return { size, style, begin, reset };
}

/** The grip in a top corner of the panel. */
export function ResizeGrip({ corner, onPointerDown, onDoubleClick }: { corner: 'left' | 'right'; onPointerDown: (e: ReactPointerEvent) => void; onDoubleClick: () => void }) {
  return (
    <div
      role="separator"
      aria-label="Resize"
      title="Drag to make it bigger or smaller (double-click to reset)"
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      style={{ touchAction: 'none' }}
      className={`absolute top-0 z-20 flex h-5 w-5 items-start ${corner === 'right' ? 'right-0 justify-end cursor-nesw-resize' : 'left-0 justify-start cursor-nwse-resize'} text-white/70 hover:text-white`}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" className={`m-0.5 ${corner === 'left' ? '' : 'scale-x-[-1]'}`} aria-hidden="true">
        <path d="M1 11 L11 1 M1 7 L7 1 M1 3 L3 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      </svg>
    </div>
  );
}
