import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, Plus, Printer, SlidersHorizontal, Upload } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { inventoryApi, formatQty, parseCsv, type InventoryItemRow, type RecentTransaction } from '@/lib/inventory';
import { formatDate, todayISO } from '@/lib/format';
import { exportCsv, printGrid } from '@/lib/reportExport';
import { xlsxToGrid } from '@/lib/xlsxRead';
import { retailSyncApi } from '@/lib/retailSync';
import { Modal, FormField } from '@/components/ui/Modal';
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
  const [importing, setImporting] = useState(false);

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

  const exportList = () => {
    if (!rows?.length) return;
    exportCsv(`Stock_Adjustments_${todayISO()}`, [
      ['Date', 'Product Name', 'Product Code', 'Change', 'Unit', 'Reason', 'Reference', 'By'],
      ...rows.map(t => [formatDate(t.txn_date), t.item_name, t.item_code, Number(t.qty) || 0, t.unit ?? '', t.remarks ?? '', t.reference_no ?? '', t.created_by ?? '']),
    ]);
  };

  const printList = () => {
    if (!rows?.length) return;
    printGrid('Stock Adjustments', [
      ['Date', 'Product', 'Product Code', 'Change', 'Unit', 'Reason', 'Reference', 'By'],
      ...rows.map(t => [formatDate(t.txn_date), t.item_name, t.item_code, Number(t.qty) || 0, t.unit ?? '', t.remarks ?? '', t.reference_no ?? '', t.created_by ?? '']),
    ]);
  };

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader
        title="Stock Adjustment"
        description="Correct the stock of a product (physical count difference, damage, opening corrections). Every adjustment is kept with its reason."
        actions={<>
          <button onClick={exportList} disabled={!rows?.length} className="h-10 px-4 inline-flex items-center gap-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50" title="Download the adjustments listed below as a CSV file">
            <Upload size={16} /> Export
          </button>
          <button onClick={printList} disabled={!rows?.length} className="h-10 px-4 inline-flex items-center gap-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50" title="Print the adjustments listed below">
            <Printer size={16} /> Print
          </button>
          {canAdjust && (
            <button onClick={() => setImporting(true)} className="h-10 px-4 inline-flex items-center gap-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50" title="Adjust many products from an Excel / CSV file">
              <Download size={16} /> Import
            </button>
          )}
          {canAdjust && (
            <button onClick={() => setPicking(true)} className="h-10 px-4 inline-flex items-center gap-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">
              <Plus size={16} /> New Stock Adjustment
            </button>
          )}
        </>}
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
      {importing && canAdjust && (
        <ImportAdjustmentsModal onClose={() => setImporting(false)} onDone={() => void load()} />
      )}
      {adjusting && canAdjust && (
        <AdjustStockModal row={adjusting} onClose={() => setAdjusting(null)} onSaved={() => { setAdjusting(null); void load(); }} />
      )}
    </div>
  );
}

// ---- Import: adjust many products from an Excel (.xlsx) or CSV file -----------------------------------------------------
interface ImportLine { n: number; name: string; code: string; direction: 'IN' | 'OUT' | null; qty: number; target: number | null; reason: string; reference: string; date: string; problem?: string }
interface ImportOutcome { ok: number; failed: { n: number; code: string; message: string }[] }

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const SYN: Record<string, string[]> = {
  name: ['product_name', 'product', 'name', 'item_name', 'product_material_name', 'material_name', 'part_name'],
  code: ['product_code', 'code', 'item_code', 'part_no', 'material_code', 'sku'],
  change: ['change', 'adjust_qty', 'adjustment', 'adjust_by', 'qty_change', 'qty', 'quantity'],
  direction: ['direction', 'type', 'increase_decrease', 'in_out'],
  target: ['new_stock', 'counted_qty', 'physical_stock', 'physical_qty', 'actual_stock', 'closing_stock'],
  reason: ['reason', 'remarks', 'remark', 'note', 'notes'],
  reference: ['reference', 'ref', 'reference_no', 'ref_no'],
  date: ['date', 'adjustment_date', 'txn_date'],
};
const toISO = (v: string): string => {
  const t = v.trim();
  if (!t) return todayISO();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};
const num = (v: string) => { const n = Number(String(v).replace(/[^0-9.\-+]/g, '')); return Number.isFinite(n) ? n : NaN; };

function ImportAdjustmentsModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [fileName, setFileName] = useState('');
  const [lines, setLines] = useState<ImportLine[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  const template = () => exportCsv('stock-adjustment-import-template', [
    ['product_name', 'change', 'new_stock', 'reason', 'reference', 'date'],
    ['Stainless Steel Round Bar 25mm', '5', '', 'Physical count difference', 'COUNT-01', todayISO()],
    ['Deep Groove Ball Bearing 6204', '-2', '', 'Damaged', '', todayISO()],
    ['Carbide End Mill 10mm 4-Flute', '', '40', 'Counted stock (leave change empty)', '', todayISO()],
  ]);

  const readFile = async (file: File | null) => {
    setLines(null); setOutcome(null); setParseError(null);
    if (!file) return;
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let grid: string[][];
      if ((bytes[0] === 0x50 && bytes[1] === 0x4b) || /\.xlsx$/i.test(file.name)) grid = await xlsxToGrid(buf);
      else if (bytes[0] === 0xd0 && bytes[1] === 0xcf) { setParseError('Old .xls files are not supported. Save the file as .xlsx or .csv and upload again.'); return; }
      else grid = parseCsv(new TextDecoder('utf-8').decode(buf));
      const data = grid.map(r => r.map(c => String(c ?? '').trim())).filter(r => r.some(Boolean));
      if (data.length < 2) { setParseError('No data rows found. The first row must be the column headings.'); return; }
      const head = data[0].map(norm);
      const col = (k: string) => head.findIndex(h => SYN[k].includes(h));
      const idx = { name: col('name'), code: col('code'), change: col('change'), direction: col('direction'), target: col('target'), reason: col('reason'), reference: col('reference'), date: col('date') };
      if (idx.name < 0 && idx.code < 0) { setParseError('A "product_name" column is needed. Download the template to see the columns.'); return; }
      if (idx.change < 0 && idx.target < 0) { setParseError('Add a "change" column (e.g. 5 or -2) or a "new_stock" column (the counted quantity).'); return; }
      const get = (r: string[], i: number) => (i >= 0 ? r[i] ?? '' : '');
      setLines(data.slice(1).map((r, i): ImportLine => {
        const name = get(r, idx.name);
        const code = get(r, idx.code);
        const rawChange = get(r, idx.change);
        const dirText = get(r, idx.direction).toLowerCase();
        let change = rawChange === '' ? NaN : num(rawChange);
        if (!Number.isNaN(change) && /^(out|decrease|dec|issue|minus|-)/.test(dirText)) change = -Math.abs(change);
        const target = get(r, idx.target) === '' ? null : num(get(r, idx.target));
        const date = toISO(get(r, idx.date));
        const line: ImportLine = {
          n: i + 2, name, code, direction: Number.isNaN(change) ? null : change < 0 ? 'OUT' : 'IN', qty: Number.isNaN(change) ? 0 : Math.abs(change),
          target, reason: get(r, idx.reason) || 'Stock adjustment (import)', reference: get(r, idx.reference), date,
        };
        if (!name && !code) line.problem = 'Product name is missing';
        else if (Number.isNaN(change) && target === null) line.problem = 'Give a change or a new stock quantity';
        else if (target !== null && Number.isNaN(target)) line.problem = 'New stock is not a number';
        else if (target !== null && target < 0) line.problem = 'New stock cannot be negative';
        else if (!Number.isNaN(change) && change === 0 && target === null) line.problem = 'Change is zero';
        else if (!date) line.problem = 'Date is not valid';
        return line;
      }));
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    }
  };

  const run = async () => {
    if (!lines) return;
    setBusy(true);
    const ok: number[] = [];
    const failed: ImportOutcome['failed'] = [];
    const touched = new Map<string, InventoryItemRow>();
    try {
      // every product once, found by its name (the code is only used to tell apart products that share a name)
      const byName = new Map<string, InventoryItemRow[]>();
      const byCode = new Map<string, InventoryItemRow>();
      const nameKey = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
      let seen = 0;
      for (let p = 1; ; p++) {
        const res = await inventoryApi.items({ categoryId: null, search: null, supplierId: null, status: null, warehouseId: null, page: p, pageSize: 500 });
        res.rows.forEach(r => {
          byName.set(nameKey(r.name), [...(byName.get(nameKey(r.name)) ?? []), r]);
          byCode.set(String(r.code).trim().toLowerCase(), r);
        });
        seen += res.rows.length;
        if (res.rows.length < 500 || seen >= res.total) break;
      }
      for (const l of lines) {
        if (l.problem) { failed.push({ n: l.n, code: l.name || l.code, message: l.problem }); continue; }
        const label = l.name || l.code;
        let item: InventoryItemRow | undefined;
        if (l.name) {
          const same = byName.get(nameKey(l.name)) ?? [];
          item = same.length === 1 ? same[0] : same.find(x => l.code && String(x.code).trim().toLowerCase() === l.code.trim().toLowerCase());
          if (same.length > 1 && !item) { failed.push({ n: l.n, code: label, message: `${same.length} products have this name. Add a product_code column to choose one` }); continue; }
        } else {
          item = byCode.get(l.code.trim().toLowerCase());
        }
        if (!item) { failed.push({ n: l.n, code: label, message: 'No product with this name' }); continue; }
        let direction = l.direction;
        let qty = l.qty;
        if (l.target !== null && direction === null) {
          // "new_stock": adjust by the difference to the counted quantity
          const diff = Math.round((l.target - (Number(item.current_stock) || 0)) * 1000) / 1000;
          if (diff === 0) { failed.push({ n: l.n, code: label, message: 'Stock already equals the counted quantity' }); continue; }
          direction = diff > 0 ? 'IN' : 'OUT'; qty = Math.abs(diff);
        }
        if (!direction) { failed.push({ n: l.n, code: label, message: 'Nothing to adjust' }); continue; }
        try {
          const res = await inventoryApi.adjustStock({ kind: item.kind, id: item.id, direction, qty: String(qty), reason: l.reason, reference: l.reference, date: l.date });
          item.current_stock = res.new_stock;           // later lines for the same product see the new stock
          touched.set(`${item.kind}:${item.id}`, item);
          ok.push(l.n);
        } catch (e) {
          failed.push({ n: l.n, code: label, message: e instanceof Error ? e.message : String(e) });
        }
      }
      // Retail Store: products kept in the Retail Store warehouse show their new stock there
      try {
        const d = await retailSyncApi.resolveDesignation();
        if (d) {
          for (const row of touched.values()) {
            if (row.warehouse_id && row.warehouse_id !== d.id) continue;
            const retailStock = await retailSyncApi.warehouseStock(row.kind, row.id, d.id, row.warehouse_id);
            await retailSyncApi.syncItem({
              id: row.id, code: row.code || '', name: row.name || '', category_name: row.category_name || 'General',
              specification: row.specification || row.name, unit: row.unit || 'Nos', stock: retailStock, rate: Number(row.rate || 0),
              warehouse_id: row.warehouse_id || d.id, warehouse_name: d.warehouse_name, status: row.item_status === 'Active' ? 'Active' : 'Inactive',
            }, true);
          }
        }
      } catch (syncErr) { console.warn('Retail store sync warning on import:', syncErr); }
    } catch (e) {
      failed.push({ n: 0, code: '', message: e instanceof Error ? e.message : String(e) });
    }
    setOutcome({ ok: ok.length, failed });
    setBusy(false);
    if (ok.length) onDone();
  };

  const valid = (lines ?? []).filter(l => !l.problem).length;
  return (
    <Modal open onClose={onClose} size="lg" title="Import Stock Adjustments"
      footer={<>
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">{outcome ? 'Close' : 'Cancel'}</button>
        {!outcome && (
          <button onClick={() => void run()} disabled={!lines || valid === 0 || busy} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60 inline-flex items-center gap-2">
            {busy && <Loader2 size={14} className="animate-spin" />} Adjust {valid || ''} Product{valid === 1 ? '' : 's'}
          </button>
        )}
      </>}>
      <div className="space-y-4">
        <div className="text-sm text-slate-600 bg-white border border-slate-200 rounded-lg p-4">
          <p className="mb-2 font-medium text-slate-800">Upload an Excel (.xlsx) or CSV file with these columns:</p>
          <code className="block text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-slate-800">product_name, change, new_stock, reason, reference, date</code>
          <ul className="mt-2 text-xs text-slate-500 list-disc pl-5 space-y-0.5">
            <li><b>product_name</b>: the product's name, exactly as in Inventory (capital letters and extra spaces do not matter).</li>
            <li><b>change</b>: how much to add (5) or take off (-2). Or use <b>direction</b> (IN / OUT) with a positive qty.</li>
            <li><b>new_stock</b>: instead of a change, give the counted quantity and the difference is adjusted for you.</li>
            <li><b>reason</b> is kept with each adjustment (blank = "Stock adjustment (import)"); <b>date</b> blank = today.</li>
            <li>A decrease larger than the stock on hand is refused. Rows with a problem are skipped and listed; the rest are adjusted.</li>
          </ul>
          <button onClick={template} className="mt-3 h-9 px-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
            <Download size={14} /> Download Template (.csv)
          </button>
        </div>
        <FormField label="Spreadsheet or CSV file">
          <input type="file" accept=".xlsx,.csv,.tsv,.txt" onChange={e => void readFile(e.target.files?.[0] ?? null)} className="text-sm" />
        </FormField>
        {parseError && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{parseError}</p>}
        {lines && !outcome && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-3 py-2 text-xs bg-slate-50 border-b border-slate-200 text-slate-700">
              <b>{fileName}</b>: {lines.length} row(s), <span className="text-emerald-700 font-semibold">{valid} ready</span>{lines.length - valid > 0 && <>, <span className="text-red-600 font-semibold">{lines.length - valid} with a problem</span></>}
            </div>
            <div className="max-h-56 overflow-y-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-slate-500"><th className="px-2 py-1">Row</th><th className="px-2 py-1">Product</th><th className="px-2 py-1 text-right">Change</th><th className="px-2 py-1 text-right">New stock</th><th className="px-2 py-1">Reason</th><th className="px-2 py-1">Check</th></tr></thead>
                <tbody>
                  {lines.map(l => (
                    <tr key={l.n} className="border-t border-slate-100">
                      <td className="px-2 py-1 text-slate-500">{l.n}</td><td className="px-2 py-1 font-medium">{l.name || l.code || '—'}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{l.direction ? `${l.direction === 'OUT' ? '-' : '+'}${l.qty}` : '—'}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{l.target ?? '—'}</td>
                      <td className="px-2 py-1 text-slate-600">{l.reason}</td>
                      <td className={`px-2 py-1 ${l.problem ? 'text-red-600' : 'text-emerald-600'}`}>{l.problem ?? 'OK'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {outcome && (
          <div className="space-y-2">
            <p className={`text-sm rounded-lg px-3 py-2 border ${outcome.ok ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
              {outcome.ok} product(s) adjusted{outcome.failed.length ? `, ${outcome.failed.length} skipped` : ''}.
            </p>
            {outcome.failed.length > 0 && (
              <ul className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 max-h-40 overflow-y-auto space-y-0.5">
                {outcome.failed.map((f, i) => <li key={i}>{f.n ? `Row ${f.n}` : 'Import'}{f.code ? ` (${f.code})` : ''}: {f.message}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
