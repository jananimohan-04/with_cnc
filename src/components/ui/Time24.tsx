import React from 'react';

/**
 * 24-hour (railway) time entry: hour 00-23 and minute, with no AM/PM switch.
 * Value in and out is still "HH:mm", exactly like <input type="time">, so the plan
 * slots, run times and job schedules stored behind it are untouched — only the control
 * the user picks with has changed.
 */
export function Time24({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [hh, mm] = (value || '08:00').split(':').map(n => Number(n) || 0);
  const emitHour = (h: number) => onChange(`${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  const emitMinute = (m: number) => onChange(`${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  const selStyle: React.CSSProperties = {
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    appearance: 'none',
    border: 'none',
    outline: 'none',
    textAlign: 'center',
    background: 'transparent',
    padding: '0 4px',
  };
  const sel = 'appearance-none border-0 outline-none bg-transparent w-10 py-1 text-center font-bold text-slate-800 hover:bg-slate-100 hover:text-brand-600 rounded focus:bg-brand-50 focus:text-brand-700 focus:outline-none cursor-pointer tabular-nums text-sm transition-colors';

  return (
    <div className="flex items-center justify-center gap-0.5 px-1 w-full h-full select-none" role="group" aria-label={label}>
      <select
        aria-label={`${label} hour`}
        className={sel}
        style={selStyle}
        value={hh}
        onChange={e => emitHour(Number(e.target.value))}
      >
        {Array.from({ length: 24 }, (_, i) => i).map(h => (
          <option key={h} value={h} className="text-slate-800 font-medium">
            {String(h).padStart(2, '0')}
          </option>
        ))}
      </select>
      <span className="text-slate-400 font-black text-sm select-none pointer-events-none px-0.5">:</span>
      <select
        aria-label={`${label} minute`}
        className={sel}
        style={selStyle}
        value={mm}
        onChange={e => emitMinute(Number(e.target.value))}
      >
        {Array.from({ length: 60 }, (_, i) => i).map(m => (
          <option key={m} value={m} className="text-slate-800 font-medium">
            {String(m).padStart(2, '0')}
          </option>
        ))}
      </select>
    </div>
  );
}
