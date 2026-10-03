import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { formatINR } from '@/lib/format';
import { calcWorkings, emptyWorkings, rowCost, type WorkRow, type Workings } from '@/lib/quotationWorkings';

const cell = 'w-full h-9 px-2 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:border-orange-500';
const numeric = (v: string) => v.replace(/[^0-9.,]/g, '');
let seq = 0;
const newRow = (): WorkRow => ({ id: `w${++seq}`, description: '', qty: '', rate: '' });

const GROUPS = [
  { key: 'materials', title: 'Raw material (metal)', unit: 'Weight (kg)', rate: 'Rate (₹/kg)', hint: 'Weight from the Metal Calculator, rate from your dealer.' },
  { key: 'processes', title: 'Process (machining / labour)', unit: 'Qty / hrs', rate: 'Rate (₹)', hint: '' },
  { key: 'others', title: 'Other expenses (bought out)', unit: 'Qty', rate: 'Unit cost (₹)', hint: 'Consumables, packaging, paint, hardware.' },
] as const;

/** Cost workings for one quotation line. "Apply" sets the line's unit price to the total (cost of ONE unit). */
export function WorkingsModal({ open, title, initial, onClose, onApply }: {
  open: boolean; title: string; initial?: Workings; onClose: () => void; onApply: (w: Workings, unitPrice: number) => void;
}) {
  const [w, setW] = useState<Workings>(() => initial ?? emptyWorkings());
  const r = calcWorkings(w);
  const setRows = (k: 'materials' | 'processes' | 'others', rows: WorkRow[]) => setW(p => ({ ...p, [k]: rows }));
  const upd = (k: 'materials' | 'processes' | 'others', id: string, patch: Partial<WorkRow>) => setRows(k, w[k].map(x => (x.id === id ? { ...x, ...patch } : x)));

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Workings" subtitle={title || 'Cost build-up for this product'}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm font-semibold text-slate-600">Cancel</button>
        <button data-testid="apply-workings" disabled={r.issues.length > 0 || r.total <= 0} onClick={() => onApply(w, r.total)}
          className="h-9 px-4 text-sm font-semibold text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-40">Apply ₹{r.total.toFixed(2)} as unit price</button>
      </>}>
      <div className="space-y-5">
        {GROUPS.map(g => (
          <section key={g.key}>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">{g.title}</h4>
              <button type="button" data-testid={`add-${g.key}`} onClick={() => setRows(g.key, [...w[g.key], newRow()])} className="flex items-center gap-1 text-xs font-semibold text-orange-600"><Plus size={13} /> Add</button>
            </div>
            {g.hint && <p className="text-[11px] text-slate-400 mb-1">{g.hint}</p>}
            {w[g.key].length === 0 ? <p className="text-xs text-slate-400 italic py-1">None added.</p> : (
              <div className="space-y-1.5">
                <div className="grid grid-cols-[1fr_6rem_6.5rem_6.5rem_1.5rem] gap-2 text-[10px] uppercase text-slate-400 px-1"><span>Description</span><span>{g.unit}</span><span>{g.rate}</span><span className="text-right">Cost</span><span /></div>
                {w[g.key].map((row, i) => {
                  const c = rowCost(row);
                  return (
                    <div key={row.id} className="grid grid-cols-[1fr_6rem_6.5rem_6.5rem_1.5rem] gap-2 items-center">
                      <input className={cell} aria-label={`${g.key} ${i + 1} description`} value={row.description} onChange={e => upd(g.key, row.id, { description: e.target.value })} />
                      <input className={cell} inputMode="decimal" aria-label={`${g.key} ${i + 1} qty`} value={row.qty} onChange={e => upd(g.key, row.id, { qty: numeric(e.target.value) })} />
                      <input className={cell} inputMode="decimal" aria-label={`${g.key} ${i + 1} rate`} value={row.rate} onChange={e => upd(g.key, row.id, { rate: numeric(e.target.value) })} />
                      <span className={`text-right font-mono text-sm ${Number.isNaN(c) ? 'text-red-500' : 'text-slate-700'}`}>{Number.isNaN(c) ? '—' : formatINR(c, { decimals: 'always' })}</span>
                      <button type="button" aria-label={`Remove ${g.key} ${i + 1}`} onClick={() => setRows(g.key, w[g.key].filter(x => x.id !== row.id))} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ))}

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm space-y-1" data-testid="workings-summary">
          <p className="flex justify-between"><span>Materials</span><span className="font-mono">{formatINR(r.materials, { decimals: 'always' })}</span></p>
          <p className="flex justify-between"><span>Processes</span><span className="font-mono">{formatINR(r.processes, { decimals: 'always' })}</span></p>
          <p className="flex justify-between"><span>Other expenses</span><span className="font-mono">{formatINR(r.others, { decimals: 'always' })}</span></p>
          <p className="flex justify-between items-center"><span>Profit margin</span>
            <span className="flex items-center gap-1"><input className={`${cell} !w-16 text-right`} inputMode="decimal" aria-label="Profit margin percent" value={w.marginPct} onChange={e => setW(p => ({ ...p, marginPct: numeric(e.target.value) }))} />%
              <span className="font-mono w-24 text-right">{formatINR(r.profit, { decimals: 'always' })}</span></span></p>
          <p className="flex justify-between font-bold border-t border-slate-200 pt-1"><span>Cost of one unit</span><span className="font-mono text-orange-600" data-testid="workings-total">{formatINR(r.total, { decimals: 'always' })}</span></p>
        </div>
        {r.issues.map(m => <p key={m} className="text-xs text-red-600">{m}</p>)}
      </div>
    </Modal>
  );
}
