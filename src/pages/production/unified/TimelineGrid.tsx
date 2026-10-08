import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge, Button } from '@/components/ui/Card';
import { addDays, fmtTime12, parseYmd, ymd } from '@/lib/operationPlans';

// Calendar used by the Comparison page: a week / day grid with blocks placed by date and time, side-by-side lanes
// inside a day (planned | actual), a current-time line, and the same navigation as the Planned timeline.

export const HOUR_PX = 44;
export const PALETTE = ['bg-blue-100 border-blue-400 text-blue-900', 'bg-emerald-100 border-emerald-400 text-emerald-900', 'bg-amber-100 border-amber-400 text-amber-900',
  'bg-violet-100 border-violet-400 text-violet-900', 'bg-rose-100 border-rose-400 text-rose-900', 'bg-cyan-100 border-cyan-400 text-cyan-900'];
export const colorFor = (key: string) => PALETTE[[...key].reduce((n, c) => n + c.charCodeAt(0), 0) % PALETTE.length];
export const dayLabel = (s: string) => parseYmd(s).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
export const minToHhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export interface GridBlock {
  id: string;
  date: string;
  startMin: number;
  endMin: number;
  /** 0-based lane within the day and how many lanes there are (planned | actual). */
  lane?: number;
  lanes?: number;
  className: string;
  title: string;
  lines: string[];
  /** Dashed, lighter look (the plan shown beside what ran). */
  ghost?: boolean;
  ring?: boolean;
  onClick?: () => void;
}

export function useCalendarNav() {
  const [view, setView] = useState<'Week' | 'Day'>('Week');
  const [anchor, setAnchor] = useState(ymd(new Date()));
  const days = useMemo(() => {
    if (view === 'Day') return [anchor];
    const dow = parseYmd(anchor).getDay();
    const monday = addDays(anchor, dow === 0 ? -6 : 1 - dow);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [view, anchor]);
  const step = (n: number) => setAnchor(a => addDays(a, view === 'Week' ? n * 7 : n));
  const title = view === 'Day' ? dayLabel(days[0]) : `${dayLabel(days[0])} – ${dayLabel(days[6])}`;
  return { view, setView, anchor, setAnchor, days, step, title };
}

export function CalendarNav({ nav, onToday, loading }: { nav: ReturnType<typeof useCalendarNav>; onToday: () => void; loading?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center bg-white rounded-lg border border-slate-200">
        <button aria-label="Previous" className="p-2 text-slate-600 hover:bg-slate-50 border-r border-slate-200" onClick={() => nav.step(-1)}><ChevronLeft size={16} /></button>
        <div className="px-4 py-1.5 text-sm font-medium text-slate-700 min-w-[210px] text-center">{nav.title}</div>
        <button aria-label="Next" className="p-2 text-slate-600 hover:bg-slate-50 border-l border-slate-200" onClick={() => nav.step(1)}><ChevronRight size={16} /></button>
      </div>
      <Button variant="secondary" className="bg-white" onClick={onToday}>Today</Button>
      <div className="flex bg-white rounded-lg border border-slate-200 p-1">
        {(['Week', 'Day'] as const).map(v => (
          <button key={v} onClick={() => nav.setView(v)} className={`px-3 py-1 text-sm font-medium rounded-md ${nav.view === v ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{v}</button>
        ))}
      </div>
      {loading && <Badge variant="neutral">Loading…</Badge>}
    </div>
  );
}

export function TimelineGrid({ days, blocks, testId = 'timeline-grid' }: { days: string[]; blocks: GridBlock[]; testId?: string }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [nowMin, setNowMin] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
  const today = ymd(new Date());
  useEffect(() => {
    const t = setInterval(() => { const d = new Date(); setNowMin(d.getHours() * 60 + d.getMinutes()); }, 60000);
    return () => clearInterval(t);
  }, []);
  const toNow = useCallback(() => {
    const el = scrollRef.current; if (!el) return;
    const d = new Date(); el.scrollTop = Math.max(0, ((d.getHours() * 60 + d.getMinutes()) / 60 - 2) * HOUR_PX);
  }, []);
  useEffect(() => { toNow(); }, [toNow]);

  return (
    <div ref={scrollRef} className="bg-white rounded-xl border border-slate-200 overflow-auto max-h-[68vh]" data-testid={testId}>
      <div className="grid min-w-[760px]" style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="sticky top-0 z-20 bg-white border-b border-slate-200" />
        {days.map(d => (
          <div key={d} className={`sticky top-0 z-20 border-b border-l border-slate-200 px-2 py-2 text-center text-xs font-semibold ${d === today ? 'bg-blue-50 text-blue-700' : 'bg-white text-slate-600'}`}>{dayLabel(d)}</div>
        ))}
        <div className="relative" style={{ height: 24 * HOUR_PX }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="absolute right-2 -translate-y-2 text-[10px] text-slate-400" style={{ top: h * HOUR_PX }}>{h === 0 ? '' : fmtTime12(`${h}:00`)}</div>
          ))}
        </div>
        {days.map(d => (
          <div key={d} className="relative border-l border-slate-200" style={{ height: 24 * HOUR_PX }} data-testid="tl-day" data-date={d}>
            {Array.from({ length: 24 }, (_, h) => <div key={h} className="absolute inset-x-0 border-t border-slate-100" style={{ top: h * HOUR_PX }} />)}
            {d === today && <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ top: (nowMin / 60) * HOUR_PX }}><div className="h-0.5 bg-red-500" /><div className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" /></div>}
            {blocks.filter(b => b.date === d).map(b => {
              const lanes = b.lanes ?? 1; const lane = b.lane ?? 0;
              const top = (b.startMin / 60) * HOUR_PX;
              const height = Math.max(18, ((b.endMin - b.startMin) / 60) * HOUR_PX - 2);
              return (
                <button key={b.id} type="button" data-testid="tl-block" data-lane={lane} title={b.title} onClick={b.onClick}
                  className={`absolute overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-[10px] leading-tight shadow-sm hover:brightness-95 ${b.className} ${b.ghost ? 'opacity-60 border-dashed' : ''} ${b.ring ? 'ring-2 ring-red-500' : ''}`}
                  style={{ top, height, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}>
                  {b.lines.map((l, i) => <div key={i} className={i === 0 ? 'font-bold truncate' : 'truncate'}>{l}</div>)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
