import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { inventoryApi, formatQty, type InventoryItemRow, type RecentTransaction } from '@/lib/inventory';
import { formatDate } from '@/lib/format';
import { AdjustStockModal, ItemPickerModal } from './InventoryPage';

// Stock Adjustment: its own menu with its own access. Everyone who may view it sees the adjustments made; only those with
// the Edit right can make one (the database checks the same right). The Inventory page no longer changes stock counts.
export function StockAdjustmentPage() {
  const { canDo } = useAuth();
  const canAdjust = canDo('stock-adjustment', 'edit');
  const [rows, setRows] = useState<RecentTransaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [adjusting, setAdjusting] = useState<InventoryItemRow | null>(null);

  const load = useCallback(async () => {
    try {
      const all = await inventoryApi.recent(300);
      setRows(all.filter(t => String(t.type).toLowerCase() === 'adjustment'));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader
        title="Stock Adjustment"
        description="Correct the stock of a product (physical count difference, damage, opening corrections). Every adjustment is kept with its reason."
        actions={canAdjust ? (
          <button onClick={() => setPicking(true)} className="h-10 px-4 inline-flex items-center gap-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">
            <Plus size={16} /> New Stock Adjustment
          </button>
        ) : undefined}
      />
      {error && <p role="alert" className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <SlidersHorizontal size={15} className="text-slate-500" /> Recent adjustments
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2">Date</th><th className="px-3 py-2">Product</th>
                <th className="px-3 py-2 text-right">Change</th><th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Reference</th><th className="px-3 py-2">By</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400"><Loader2 size={16} className="inline animate-spin" /> Loading…</td></tr>}
              {rows !== null && rows.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">No stock adjustments yet.</td></tr>}
              {(rows ?? []).map(t => {
                const n = Number(t.qty) || 0;
                return (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{formatDate(t.txn_date)}</td>
                    <td className="px-3 py-2"><div className="font-medium text-slate-800">{t.item_name}</div><div className="text-xs text-slate-500">{t.item_code}</div></td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${n < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{n > 0 ? '+' : ''}{formatQty(t.qty)} {t.unit ?? ''}</td>
                    <td className="px-3 py-2 text-slate-600">{t.remarks || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{t.reference_no || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{t.created_by || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {picking && canAdjust && (
        <ItemPickerModal title="Stock Adjustment — Select Product" onClose={() => setPicking(false)} onPick={row => { setPicking(false); setAdjusting(row); }} />
      )}
      {adjusting && canAdjust && (
        <AdjustStockModal row={adjusting} onClose={() => setAdjusting(null)} onSaved={() => { setAdjusting(null); void load(); }} />
      )}
    </div>
  );
}
