import type { Settlement } from '@/lib/ledgerDashboard';

const amt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** Ledger Status cell: the status pill, a thin paid-progress bar and "₹x paid · ₹y bal", kept compact. */
export function SettlementCell({ s, label, center = false }: { s?: Settlement; label: string; center?: boolean }) {
  if (!s || !label) return <span className="text-slate-300">—</span>;
  const total = s.paid + s.left;
  const pct = total > 0 ? Math.min(100, Math.round((s.paid / total) * 100)) : 100;
  const late = s.state === 'Pending' && s.days > 30;
  const pill = s.state === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : s.state === 'Part' ? 'bg-amber-50 text-amber-700 border-amber-200'
    : late ? 'bg-red-50 text-red-700 border-red-200' : 'bg-orange-50 text-orange-700 border-orange-200';
  const bar = s.state === 'Completed' ? 'bg-emerald-500' : s.state === 'Part' ? 'bg-amber-500' : late ? 'bg-red-500' : 'bg-orange-400';
  return (
    <div className={`inline-flex flex-col gap-[3px] min-w-[120px] leading-none ${center ? 'items-center' : 'items-start'}`}
      title={`Total ${amt(total)} · Paid ${amt(s.paid)} · Balance ${amt(s.left)}`}>
      <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold border ${pill}`}>{label}</span>
      {total > 0 && (
        <>
          <span className="block h-[3px] w-full rounded-sm bg-black/10 overflow-hidden"><span className={`block h-full ${bar}`} style={{ width: `${pct}%` }} /></span>
          <span className="text-[10px] tabular-nums text-slate-600 whitespace-nowrap">
            <b className="font-semibold text-emerald-700">{amt(s.paid)}</b> paid
            {s.left > 0.005 && <> · <b className="font-semibold text-red-600">{amt(s.left)}</b> bal</>}
          </span>
        </>
      )}
    </div>
  );
}
