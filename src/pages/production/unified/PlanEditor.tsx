import { Plus, Trash2 } from 'lucide-react';
import { inputClass } from '@/components/ui/Modal';
import { TimeAmPm } from '@/components/ui/TimeAmPm';
import { daysBetween, expandPlan, planError, planHours, type PlanDraft } from '@/lib/operationPlans';

const label = 'block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5';
const timeBox = 'inline-flex items-center rounded-lg border border-slate-300 bg-white text-sm';

/** Plan an operation: from which date to which date, and the time slots worked each day (several per day allowed,
 *  e.g. 1 PM - 3 PM and again 5 PM - 6 PM). */
export function PlanEditor({ value, onChange, showSummary = true }: { value: PlanDraft; onChange: (p: PlanDraft) => void; showSummary?: boolean }) {
  const set = (patch: Partial<PlanDraft>) => onChange({ ...value, ...patch });
  const setSlot = (i: number, patch: Partial<{ start: string; end: string }>) =>
    set({ slots: value.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const error = value.from || value.to ? planError(value) : null;
  const days = value.from && value.to && value.to >= value.from ? daysBetween(value.from, value.to) : 0;

  return (
    <div className="space-y-3" data-testid="plan-editor">
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <div>
          <span className={label}>From date</span>
          <input type="date" aria-label="Plan from date" className={inputClass} value={value.from}
            onChange={e => set({ from: e.target.value, to: value.to && value.to < e.target.value ? e.target.value : (value.to || e.target.value) })} />
        </div>
        <div>
          <span className={label}>To date</span>
          <input type="date" aria-label="Plan to date" className={inputClass} value={value.to} min={value.from || undefined} onChange={e => set({ to: e.target.value })} />
        </div>
      </div>
      <div>
        <span className={label}>Time slots each day</span>
        <div className="space-y-2">
          {value.slots.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2" data-testid="plan-slot">
              <div className={timeBox}><TimeAmPm label={`Slot ${i + 1} from`} value={s.start} onChange={v => setSlot(i, { start: v })} /></div>
              <span className="text-xs text-slate-500">to</span>
              <div className={timeBox}><TimeAmPm label={`Slot ${i + 1} to`} value={s.end} onChange={v => setSlot(i, { end: v })} /></div>
              {value.slots.length > 1 && (
                <button type="button" aria-label={`Remove slot ${i + 1}`} title="Remove slot" onClick={() => set({ slots: value.slots.filter((_, j) => j !== i) })}
                  className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => {
          const last = value.slots[value.slots.length - 1];
          const startH = last ? Math.min(23, Number(last.end.split(':')[0]) + 1) : 8;
          const endH = Math.min(23, startH + 1);
          set({ slots: [...value.slots, { start: `${String(startH).padStart(2, '0')}:00`, end: `${String(endH).padStart(2, '0')}:00` }] });
        }} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-800">
          <Plus size={13} /> Add time slot
        </button>
      </div>
      {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
      {showSummary && !error && days > 0 && (
        <p className="text-xs text-slate-500" data-testid="plan-summary">
          {days} day{days === 1 ? '' : 's'} × {value.slots.length} slot{value.slots.length === 1 ? '' : 's'} = {expandPlan(value).length} planned slots · {Math.round(planHours(value) * 100) / 100} hours in all
        </p>
      )}
    </div>
  );
}
