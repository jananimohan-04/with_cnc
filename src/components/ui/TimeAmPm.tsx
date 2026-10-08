import React from 'react';

/** 12-hour time entry (hour, minute, AM/PM). Value in and out is "HH:mm" (24-hour), like <input type="time">. */
export function TimeAmPm({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [hh, mm] = (value || '08:00').split(':').map(n => Number(n) || 0);
  const pm = hh >= 12;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const emit = (h: number, m: number, isPm: boolean) => {
    const h24 = (h % 12) + (isPm ? 12 : 0);
    onChange(`${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  };
  const sel = 'bg-transparent py-2 focus:outline-none cursor-pointer';
  return (
    <div className="flex items-center gap-0.5 px-2" role="group" aria-label={label}>
      <select aria-label={`${label} hour`} className={sel} value={h12} onChange={e => emit(Number(e.target.value), mm, pm)}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}</option>)}
      </select>
      <span className="text-slate-400">:</span>
      <select aria-label={`${label} minute`} className={sel} value={mm} onChange={e => emit(h12, Number(e.target.value), pm)}>
        {Array.from({ length: 60 }, (_, i) => i).map(m => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
      </select>
      <select aria-label={`${label} AM or PM`} className={`${sel} font-semibold`} value={pm ? 'PM' : 'AM'} onChange={e => emit(h12, mm, e.target.value === 'PM')}>
        <option>AM</option><option>PM</option>
      </select>
    </div>
  );
}
