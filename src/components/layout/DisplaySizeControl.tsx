import { useEffect, useRef, useState } from 'react';
import { DISPLAY_MAX, DISPLAY_MIN, DISPLAY_PRESETS, DISPLAY_STEP, useDisplaySize } from '@/lib/displaySize';

/** The "⋮" button with the Display Size menu (50% – 145%). Shown in the top bar, and in the Sales Pipeline toolbar. */
export function DisplaySizeControl() {
  const [size, setSize, DISPLAY_DEFAULT] = useDisplaySize();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Display size options"
        aria-expanded={open}
        aria-haspopup="true"
        title={`Display Size (${size}%)`}
        className={`p-2 border rounded-lg bg-white shadow-sm transition-colors ${size !== DISPLAY_DEFAULT || open ? 'border-orange-500 text-orange-600 ring-1 ring-orange-400 bg-orange-50/40' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Display size options"
          className="no-glass absolute right-0 top-full mt-1.5 z-50 w-64 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xl space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Display Size</span>
            <div className="flex items-center gap-1.5">
              <span className="rounded-md bg-orange-50 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-orange-700 border border-orange-200">{size}%</span>
              {size !== DISPLAY_DEFAULT && (
                <button type="button" onClick={() => setSize(DISPLAY_DEFAULT)} className="text-[11px] font-semibold text-slate-500 hover:text-orange-600 underline">
                  Reset
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {DISPLAY_PRESETS.map(([label, val]) => (
              <button
                key={label}
                type="button"
                onClick={() => setSize(val)}
                className={`h-8 rounded-lg border text-xs font-bold transition ${size === val ? 'border-orange-600 bg-orange-600 text-white shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-orange-300 hover:bg-orange-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              aria-label="Decrease size"
              disabled={size <= DISPLAY_MIN}
              onClick={() => setSize((z) => z - DISPLAY_STEP)}
              className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              −
            </button>
            <input
              type="range"
              min={DISPLAY_MIN}
              max={DISPLAY_MAX}
              step={DISPLAY_STEP}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              aria-label="Adjust display size"
              className="w-full accent-orange-600 cursor-pointer"
            />
            <button
              type="button"
              aria-label="Increase size"
              disabled={size >= DISPLAY_MAX}
              onClick={() => setSize((z) => z + DISPLAY_STEP)}
              className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              +
            </button>
          </div>
          <div className="flex justify-between text-[10px] font-semibold tabular-nums text-slate-400"><span>{DISPLAY_MIN}%</span><span>{DISPLAY_MAX}%</span></div>
          <p className="text-[10px] text-slate-400 leading-snug">Resize cards, columns, and table rows from compact to large.</p>
        </div>
      )}
    </div>
  );
}
