import { FormField, inputClass } from '@/components/ui/Modal';
import { todayISO } from '@/lib/format';
import { sideLabel, type ExistingOpening, type OpeningInput } from '@/lib/openingBalances';

export const emptyOpening = (): OpeningInput => ({ amount: '', type: '', date: todayISO() });

/** Optional "Opening balance" block for the Add / Edit form of a company (customer) or supplier. */
export function OpeningBalanceFields({ kind, value, onChange, existing, className = 'col-span-2' }: {
  className?: string;
  kind: 'CUSTOMER' | 'SUPPLIER';
  value: OpeningInput;
  onChange: (v: OpeningInput) => void;
  existing: ExistingOpening | null;
}) {
  const options = kind === 'CUSTOMER'
    ? [['Receivable', 'Receivable - they owe us'], ['Credit Balance', 'Credit balance - we owe them']]
    : [['Payable', 'Payable - we owe them'], ['Debit Balance', 'Debit balance - they owe us']];
  const posted = existing?.status === 'Posted';
  return (
    <div className={`${className} rounded-lg border border-slate-200 bg-slate-50/60 p-3`}>
      <p className="text-sm font-semibold text-slate-800 mb-1">Opening balance <span className="font-normal text-slate-400">(optional)</span></p>
      {posted ? (
        <p className="text-sm text-slate-600">
          Posted: <b>₹{Number(existing!.amount).toLocaleString('en-IN')} {sideLabel(existing!.side === 'DR' ? 1 : -1)}</b>.
          A posted balance is part of the books, so change it from the Opening Balances page (reverse it, then enter the corrected one).
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Amount (₹)"><input type="number" min="0" step="0.01" className={inputClass} value={value.amount} onChange={e => onChange({ ...value, amount: e.target.value })} placeholder="0.00" /></FormField>
          <FormField label="Type">
            <select className={inputClass} value={value.type || options[0][0]} onChange={e => onChange({ ...value, type: e.target.value })}>
              {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FormField>
          <FormField label="As on date"><input type="date" className={inputClass} value={value.date} onChange={e => onChange({ ...value, date: e.target.value })} /></FormField>
        </div>
      )}
      {existing?.status === 'Draft' && <p className="text-xs text-amber-600 mt-1">A draft opening balance exists; saving updates it and posts it.</p>}
    </div>
  );
}
