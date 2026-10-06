import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, BookText, RefreshCw, Landmark, FileText, PackageOpen, Search, Filter, ArrowUp, ArrowDown, ArrowUpDown, Inbox, AlertTriangle, FileDown, FileSpreadsheet, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { financeApi, type BankRow, type InvoiceRow } from '@/lib/finance';
import { formatINR, todayISO } from '@/lib/format';
import { exportCsv } from '@/lib/reportExport';
import {
  dmy, drCr, filterLines, fromBank, fromInvoices, fromInwards, sortLines, statementFor, summarizeByParty, receivablePayable, settleDocuments,
  type LedgerLine, type LedgerSource, type SortKey,
} from '@/lib/ledgerDashboard';

// Ledger Dashboard: every bank entry, invoice and inward in one party ledger, with filters, a party statement
// and a party-wise ledger book. Read-only: it reads the same records the rest of the ERP writes.

const btn = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 text-[13px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none';
const btnPrimary = 'inline-flex items-center justify-center gap-1.5 h-9 px-5 text-[13px] font-bold text-white bg-gradient-to-b from-orange-500 to-orange-600 rounded-lg shadow-md shadow-orange-500/25 hover:from-orange-500 hover:to-orange-700 active:scale-[0.98] transition disabled:opacity-40';
const sel = 'h-9 px-3 text-[13px] font-medium text-slate-700 bg-white border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15';
const inp = 'h-9 px-3 text-[13px] text-slate-700 bg-white border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15';
const th = 'px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 select-none';
const money = (n: number) => (n ? formatINR(n, { decimals: 'always', symbol: false }) : '');
const MAX_ROWS = 5000;

type SourceState = { rows: LedgerLine[]; state: 'idle' | 'loading' | 'ok' | 'error'; error: string; at: string };
const emptySource = (): SourceState => ({ rows: [], state: 'idle', error: '', at: '' });

const COLS: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'date', label: 'Date (dd/MM/yyyy)' }, { key: 'ref', label: 'Reference Number' }, { key: 'particulars', label: 'Particulars' },
  { key: 'narration', label: 'Narration' }, { key: 'debit', label: 'Debit', align: 'right' }, { key: 'credit', label: 'Credit', align: 'right' },
  { key: 'party', label: 'Party Name' }, { key: 'ledgerType', label: 'Ledger Type' },
];

export function LedgerDashboardPage() {
  const { company } = useAuth();
  const cid = company?.id ?? null;
  const [src, setSrc] = useState<Record<LedgerSource, SourceState>>({ Bank: emptySource(), Invoice: emptySource(), Inward: emptySource() });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [part, setPart] = useState('');
  const [party, setParty] = useState('');
  const [applied, setApplied] = useState({ from: '', to: '', part: '', party: '' });
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });
  const [modal, setModal] = useState<null | 'statement' | 'book'>(null);
  const [stmtParty, setStmtParty] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async (which: LedgerSource): Promise<number> => {
    setSrc(s => ({ ...s, [which]: { ...s[which], state: 'loading', error: '' } }));
    try {
      let rows: LedgerLine[] = [];
      if (which === 'Bank') {
        const all: BankRow[] = [];
        for (let page = 1; all.length < MAX_ROWS; page++) {
          const r = await financeApi.bankTransactions({ page, pageSize: 200 });
          all.push(...r.rows); if (all.length >= r.total || !r.rows.length) break;
        }
        rows = fromBank(all);
      } else if (which === 'Invoice') {
        const all: InvoiceRow[] = [];
        for (let page = 1; all.length < MAX_ROWS; page++) {
          const r = await financeApi.invoices({ page, pageSize: 200 });
          all.push(...r.rows); if (all.length >= r.total || !r.rows.length) break;
        }
        rows = fromInvoices(all);
      } else {
        const r = await supabase.from('cnc_inwards').select('*').neq('status', 'Deleted').limit(MAX_ROWS);
        if (r.error) throw new Error(r.error.message);
        rows = fromInwards((r.data ?? []) as Record<string, unknown>[]);
      }
      setSrc(s => ({ ...s, [which]: { rows, state: 'ok', error: '', at: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) } }));
      return rows.length;
    } catch (e) {
      setSrc(s => ({ ...s, [which]: { ...s[which], state: 'error', error: e instanceof Error ? e.message : 'Could not load.' } }));
      return -1;
    }
  }, []);

  const refreshAll = useCallback(async () => { await Promise.all((['Bank', 'Invoice', 'Inward'] as LedgerSource[]).map(load)); }, [load]);
  useEffect(() => { void refreshAll(); }, [refreshAll, cid]);
  const updateOne = async (which: LedgerSource) => {
    const n = await load(which);
    setNote(n < 0 ? `${which}: could not update.` : `${which} updated: ${n} row${n === 1 ? '' : 's'}.`);
  };

  const all = useMemo(() => [...src.Bank.rows, ...src.Invoice.rows, ...src.Inward.rows], [src]);
  const recPay = useMemo(() => receivablePayable(all), [all]);
  const settled = useMemo(() => settleDocuments(all, todayISO()), [all]);
  const statusText = (id: string): string => {
    const s = settled.get(id);
    if (!s) return '';
    const age = s.days <= 0 ? 'today' : `${s.days} day${s.days === 1 ? '' : 's'}`;
    return s.state === 'Completed' ? 'Completed' : s.state === 'Part' ? `Part paid · ${age}` : `Pending · ${age}`;
  };
  const parties = useMemo(() => Array.from(new Set(all.map(l => l.party.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })), [all]);
  const filtered = useMemo(() => filterLines(all, { from: applied.from, to: applied.to, particulars: applied.part, party: applied.party, search }), [all, applied, search]);
  const sorted = useMemo(() => sortLines(filtered, sort.key, sort.dir), [filtered, sort]);
  const pages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(sorted.length / pageSize));
  const cur = Math.min(page, pages);
  const shown = pageSize === 0 ? sorted : sorted.slice((cur - 1) * pageSize, cur * pageSize);
  const totals = useMemo(() => ({ debit: filtered.reduce((n, l) => n + l.debit, 0), credit: filtered.reduce((n, l) => n + l.credit, 0) }), [filtered]);
  const anyLoading = Object.values(src).some(s => s.state === 'loading');
  const errors = (Object.entries(src) as [LedgerSource, SourceState][]).filter(([, s]) => s.state === 'error');
  const filtersActive = !!(applied.from || applied.to || applied.part || applied.party || search);

  const apply = () => { if (from && to && from > to) { setNote('Start date is after the end date.'); return; } setApplied({ from, to, part, party }); setPage(1); setNote(''); };
  const clear = () => { setFrom(''); setTo(''); setPart(''); setParty(''); setSearch(''); setApplied({ from: '', to: '', part: '', party: '' }); setPage(1); setNote(''); };
  const sortBy = (key: SortKey) => setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'debit' || key === 'credit' ? 'desc' : 'asc' }));

  const exportRows = () => {
    if (!sorted.length) { setNote('Nothing to export.'); return; }
    exportCsv(`ledger-${todayISO()}`, [['Date', 'Reference Number', 'Particulars', 'Narration', 'Debit', 'Credit', 'Party Name', 'Ledger Type', 'Source', 'Status'],
      ...sorted.map(l => [dmy(l.date), l.ref, l.particulars, l.narration, l.debit || '', l.credit || '', l.party, l.ledgerType, l.source, statusText(l.id)])]);
  };

  const srcBtn = (which: LedgerSource, icon: React.ReactNode, label: string) => (
    <button className={btn} data-testid={`update-${which.toLowerCase()}`} disabled={src[which].state === 'loading'} onClick={() => void updateOne(which)} title={src[which].error || (src[which].at ? `${src[which].rows.length} rows · ${src[which].at}` : '')}>
      {icon}{label}<span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${src[which].state === 'error' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>{src[which].state === 'loading' ? '…' : src[which].state === 'error' ? '!' : src[which].rows.length}</span>
    </button>
  );

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <div className="space-y-5 max-w-[1500px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 text-white flex items-center justify-center shadow-lg shadow-orange-500/25"><BookText size={22} /></div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-baseline gap-3">Ledger Dashboard <span className="text-sm font-medium text-slate-500" data-testid="row-count">{sorted.length} rows</span></h1>
              <p className="text-sm text-slate-500">Bank entries, invoices and inwards in one party ledger.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={btn} data-testid="refresh-all" disabled={anyLoading} onClick={() => void refreshAll().then(() => setNote('Everything refreshed.'))}><RefreshCw size={14} className={anyLoading ? 'animate-spin' : ''} />Refresh</button>
            {srcBtn('Bank', <Landmark size={14} />, 'Update Bank')}
            {srcBtn('Invoice', <FileText size={14} />, 'Update Invoice')}
            {srcBtn('Inward', <PackageOpen size={14} />, 'Update Inward')}
            <button className={btn} onClick={() => { setStmtParty(applied.party || parties[0] || ''); setModal('statement'); }}><BookOpen size={14} />Ledger Statement</button>
            <button className={`${btn} !border-orange-300 !bg-orange-50 !text-orange-800`} onClick={() => setModal('book')}><BookText size={14} />Ledger Book</button>
          </div>
        </div>

        {errors.length > 0 && (
          <div role="alert" data-testid="source-error" className="flex items-start gap-2 text-sm rounded-xl border border-red-200 bg-red-50 text-red-800 px-3.5 py-2.5">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{errors.map(([k, s]) => `${k}: ${s.error}`).join(' · ')} — the other sources are still shown.</span>
          </div>
        )}
        {note && <div role="status" data-testid="ledger-note" className="rounded-xl border border-sky-200 bg-sky-50 text-sky-800 text-sm px-3.5 py-2">{note}</div>}

        <div className="grid sm:grid-cols-2 gap-4" data-testid="rec-pay">
          <button type="button" onClick={() => { setSearch('Customer'); setPage(1); }} className="text-left rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white px-5 py-4 shadow-sm hover:shadow-md transition">
            <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700">Receivable · customers owe you</p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900" data-testid="receivable-total">₹{money(recPay.receivable) || '0.00'}</p>
            <p className="text-xs text-slate-500">{recPay.customers} customer{recPay.customers === 1 ? '' : 's'} with a balance</p>
          </button>
          <button type="button" onClick={() => { setSearch('Supplier'); setPage(1); }} className="text-left rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white px-5 py-4 shadow-sm hover:shadow-md transition">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Payable · you owe suppliers</p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900" data-testid="payable-total">₹{money(recPay.payable) || '0.00'}</p>
            <p className="text-xs text-slate-500">{recPay.suppliers} supplier{recPay.suppliers === 1 ? '' : 's'} with a balance</p>
          </button>
        </div>

        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center gap-2.5">
            <Filter size={14} className="text-slate-400" />
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">Start <input type="date" aria-label="Start date" className={inp} value={from} onChange={e => setFrom(e.target.value)} /></label>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">End <input type="date" aria-label="End date" className={inp} value={to} onChange={e => setTo(e.target.value)} /></label>
            <input aria-label="Filter particulars" className={`${inp} w-56`} placeholder="Filter: Particulars" value={part} onChange={e => setPart(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') apply(); }} />
            <select aria-label="Party" className={`${sel} w-64`} value={party} onChange={e => setParty(e.target.value)}>
              <option value="">Party (all)</option>{parties.map(p => <option key={p} value={p}>{p}</option>)}</select>
            <button className={btnPrimary} onClick={apply}>Apply</button>
            <button className={btn} onClick={clear}><X size={14} />Clear</button>
            <button className={`${btn} ml-auto`} onClick={exportRows}><FileSpreadsheet size={14} />Export CSV</button>
          </div>

          <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
            <label className="flex items-center gap-2 text-slate-600">Show
              <select aria-label="Entries per page" className={`${sel} !h-8`} value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
                {[10, 25, 50, 100, 500].map(n => <option key={n} value={n}>{n}</option>)}<option value={0}>All</option></select> entries</label>
            <label className="flex items-center gap-2 text-slate-600">Search:
              <input aria-label="Search ledger" className={`${inp} !h-8 w-56`} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></label>
          </div>

          <div className="overflow-auto max-h-[560px] border-t border-slate-200">
            <table className="w-full text-[13px] min-w-[1100px]">
              <thead className="bg-slate-100/90 backdrop-blur sticky top-0 z-10 shadow-[0_1px_0_#e2e8f0]"><tr className="text-left">
                {COLS.map(c => (
                  <th key={c.key} className={`${th} cursor-pointer hover:bg-slate-200/60 ${c.align === 'right' ? 'text-right' : ''}`} onClick={() => sortBy(c.key)} data-testid={`sort-${c.key}`} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <span className="inline-flex items-center gap-1">{c.label}{sort.key === c.key ? (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={11} className="text-slate-300" />}</span>
                  </th>
                ))}
                <th className={th}>Status</th>
              </tr></thead>
              <tbody>
                {shown.map(l => (
                  <tr key={l.id} data-testid="ledger-row" className="border-t border-slate-100 odd:bg-white even:bg-slate-50/50 hover:bg-orange-50/40 transition">
                    <td className="px-3 py-2 whitespace-nowrap">{dmy(l.date)}</td>
                    <td className="px-3 py-2 font-mono text-slate-600">{l.ref}</td>
                    <td className="px-3 py-2 uppercase">{l.particulars}</td>
                    <td className="px-3 py-2">{l.narration}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-red-600">{money(l.debit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-600">{money(l.credit)}</td>
                    <td className="px-3 py-2 uppercase font-medium text-slate-800">{l.party}</td>
                    <td className="px-3 py-2">{l.ledgerType && <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${l.ledgerType === 'Customer' ? 'bg-sky-50 text-sky-700 border-sky-200' : l.ledgerType === 'Supplier' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{l.ledgerType}</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap" data-testid="bill-status">{(() => {
                      const s = settled.get(l.id);
                      if (!s) return null;
                      const cls = s.state === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : s.state === 'Part' ? 'bg-amber-50 text-amber-700 border-amber-200' : s.days > 30 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-orange-50 text-orange-700 border-orange-200';
                      return <span title={s.state === 'Completed' ? 'Settled by the bank statement' : `Still unpaid: ${money(s.left)}`} className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>{statusText(l.id)}</span>;
                    })()}</td>
                  </tr>
                ))}
                {!anyLoading && shown.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-14 text-center"><Inbox size={30} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-sm font-semibold text-slate-600">{filtersActive ? 'No ledger rows match these filters' : 'No ledger entries yet'}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{filtersActive ? 'Change or clear the filters.' : 'Bank entries, invoices and inwards will appear here.'}</p></td></tr>
                )}
                {anyLoading && shown.length === 0 && <tr><td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-400">Loading…</td></tr>}
              </tbody>
              {sorted.length > 0 && (
                <tfoot className="sticky bottom-0 bg-slate-100 border-t border-slate-300 font-bold text-[13px]">
                  <tr><td colSpan={4} className="px-3 py-2 text-right text-slate-600">Total ({sorted.length} rows)</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-600" data-testid="total-debit">{money(totals.debit) || '0.00'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-600" data-testid="total-credit">{money(totals.credit) || '0.00'}</td>
                    <td colSpan={3} className="px-3 py-2 text-slate-600">Balance <span data-testid="total-balance">{money(Math.abs(totals.debit - totals.credit)) || '0.00'} {drCr(totals.debit - totals.credit)}</span></td></tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 border-t border-slate-100">
            <span data-testid="showing">{sorted.length === 0 ? 'Showing 0 entries' : `Showing ${pageSize === 0 ? 1 : (cur - 1) * pageSize + 1} to ${pageSize === 0 ? sorted.length : Math.min(cur * pageSize, sorted.length)} of ${sorted.length} entries`}</span>
            <span className="flex items-center gap-1.5">
              <button className={`${btn} !h-8 !px-2`} aria-label="Previous page" disabled={cur <= 1} onClick={() => setPage(cur - 1)}><ChevronLeft size={14} /></button>
              <span>Page {cur} of {pages}</span>
              <button className={`${btn} !h-8 !px-2`} aria-label="Next page" disabled={cur >= pages} onClick={() => setPage(cur + 1)}><ChevronRight size={14} /></button>
            </span>
          </div>
        </section>
      </div>

      <StatementModal open={modal === 'statement'} onClose={() => setModal(null)} lines={all} parties={parties} party={stmtParty} setParty={setStmtParty} initFrom={applied.from} initTo={applied.to} company={company?.company_name ?? ''} />
      <BookModal open={modal === 'book'} onClose={() => setModal(null)} lines={filterLines(all, { from: applied.from, to: applied.to })} onOpen={p => { setStmtParty(p); setModal('statement'); }} />
    </div>
  );
}

function StatementModal({ open, onClose, lines, parties, party, setParty, initFrom, initTo, company }: {
  open: boolean; onClose: () => void; lines: LedgerLine[]; parties: string[]; party: string; setParty: (p: string) => void; initFrom: string; initTo: string; company: string;
}) {
  const [from, setFrom] = useState(initFrom);
  const [to, setTo] = useState(initTo);
  useEffect(() => { if (open) { setFrom(initFrom); setTo(initTo); } }, [open, initFrom, initTo]);
  const st = useMemo(() => (party ? statementFor(lines, party, from || undefined, to || undefined) : null), [lines, party, from, to]);

  const csv = () => {
    if (!st || !party) return;
    exportCsv(`statement-${party.replace(/[^\w]+/g, '_')}`, [['Party', party], ['From', from ? dmy(from) : ''], ['To', to ? dmy(to) : ''], [], ['Date', 'Reference', 'Particulars', 'Narration', 'Debit', 'Credit', 'Balance'],
      ['', '', 'Opening balance', '', '', '', `${Math.abs(st.opening)} ${drCr(st.opening)}`],
      ...st.rows.map(r => [dmy(r.date), r.ref, r.particulars, r.narration, r.debit || '', r.credit || '', `${Math.abs(r.balance)} ${drCr(r.balance)}`]),
      ['', '', 'Closing balance', '', st.debit, st.credit, `${Math.abs(st.closing)} ${drCr(st.closing)}`]]);
  };
  const pdf = async () => {
    if (!st || !party) return;
    const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const doc = new JsPDF({ unit: 'mm', format: 'a4' });
    doc.setFontSize(14); doc.text(`Ledger Statement - ${party}`, 14, 14);
    doc.setFontSize(9); doc.text(`${company}  |  ${from ? dmy(from) : 'start'} to ${to ? dmy(to) : 'today'}`, 14, 20);
    const bal = (n: number) => `${Math.abs(n).toFixed(2)} ${drCr(n)}`.trim();
    autoTable(doc, {
      startY: 25, styles: { fontSize: 8, cellPadding: 1.6 }, headStyles: { fillColor: [51, 65, 85] },
      head: [['Date', 'Reference', 'Particulars', 'Narration', 'Debit', 'Credit', 'Balance']],
      body: [['', '', 'Opening balance', '', '', '', bal(st.opening)], ...st.rows.map(r => [dmy(r.date), r.ref, r.particulars, r.narration, r.debit ? r.debit.toFixed(2) : '', r.credit ? r.credit.toFixed(2) : '', bal(r.balance)]), ['', '', 'Closing balance', '', st.debit.toFixed(2), st.credit.toFixed(2), bal(st.closing)]],
      columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    });
    doc.save(`statement-${party.replace(/[^\w]+/g, '_')}.pdf`);
  };

  return (
    <Modal open={open} onClose={onClose} title="Ledger Statement" subtitle="Running balance for one party" size="2xl"
      footer={<><button className={btn} onClick={onClose}>Close</button><button className={btn} disabled={!st} onClick={csv}><FileSpreadsheet size={14} />CSV</button><button className={btnPrimary} disabled={!st} data-testid="statement-pdf" onClick={() => void pdf()}><FileDown size={14} />Download PDF</button></>}>
      <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-slate-100">
        <select aria-label="Statement party" className={`${sel} w-72`} value={party} onChange={e => setParty(e.target.value)}><option value="">-- Select party --</option>{parties.map(p => <option key={p} value={p}>{p}</option>)}</select>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">From <input type="date" aria-label="Statement from" className={inp} value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">To <input type="date" aria-label="Statement to" className={inp} value={to} onChange={e => setTo(e.target.value)} /></label>
      </div>
      {!st ? <p className="py-10 text-center text-sm text-slate-400">Choose a party to see the statement.</p> : (
        <div className="mt-3 overflow-auto max-h-[420px] border border-slate-200 rounded-xl">
          <table className="w-full text-xs min-w-[760px]">
            <thead className="bg-slate-50 sticky top-0"><tr className="text-left">{['Date', 'Reference', 'Particulars', 'Narration', 'Debit', 'Credit', 'Balance'].map((h, i) => <th key={h} className={`${th} ${i >= 4 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
            <tbody>
              <tr className="bg-slate-50/70 font-semibold"><td colSpan={6} className="px-3 py-2">Opening balance</td><td className="px-3 py-2 text-right tabular-nums" data-testid="stmt-opening">{money(Math.abs(st.opening)) || '0.00'} {drCr(st.opening)}</td></tr>
              {st.rows.map(r => (
                <tr key={r.id} data-testid="stmt-row" className="border-t border-slate-100"><td className="px-3 py-2 whitespace-nowrap">{dmy(r.date)}</td><td className="px-3 py-2 font-mono">{r.ref}</td><td className="px-3 py-2 uppercase">{r.particulars}</td><td className="px-3 py-2">{r.narration}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-600">{money(r.debit)}</td><td className="px-3 py-2 text-right tabular-nums text-emerald-600">{money(r.credit)}</td><td className="px-3 py-2 text-right tabular-nums font-semibold">{money(Math.abs(r.balance)) || '0.00'} {drCr(r.balance)}</td></tr>
              ))}
              {st.rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">No entries for this party in the period.</td></tr>}
              <tr className="bg-slate-100 font-bold border-t border-slate-300"><td colSpan={4} className="px-3 py-2 text-right">Closing balance</td>
                <td className="px-3 py-2 text-right tabular-nums text-red-600" data-testid="stmt-debit">{money(st.debit) || '0.00'}</td><td className="px-3 py-2 text-right tabular-nums text-emerald-600" data-testid="stmt-credit">{money(st.credit) || '0.00'}</td>
                <td className="px-3 py-2 text-right tabular-nums" data-testid="stmt-closing">{money(Math.abs(st.closing)) || '0.00'} {drCr(st.closing)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function BookModal({ open, onClose, lines, onOpen }: { open: boolean; onClose: () => void; lines: LedgerLine[]; onOpen: (party: string) => void }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const sum = useMemo(() => summarizeByParty(lines), [lines]);
  const rows = sum.filter(s => (!q.trim() || s.party.toLowerCase().includes(q.trim().toLowerCase())) && (!type || s.ledgerType === type));
  const types = Array.from(new Set(sum.map(s => s.ledgerType).filter(Boolean))).sort();
  const tot = rows.reduce((a, s) => ({ d: a.d + s.debit, c: a.c + s.credit }), { d: 0, c: 0 });
  return (
    <Modal open={open} onClose={onClose} title="Ledger Book" subtitle="Party-wise totals. Click a party to open its statement." size="2xl"
      footer={<button className={btn} onClick={onClose}>Close</button>}>
      <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-slate-100">
        <div className="relative"><Search size={14} className="absolute left-3 top-2.5 text-slate-400" /><input aria-label="Search parties" className={`${inp} pl-8 w-64`} placeholder="Search party" value={q} onChange={e => setQ(e.target.value)} /></div>
        <select aria-label="Ledger type filter" className={sel} value={type} onChange={e => setType(e.target.value)}><option value="">All types</option>{types.map(t => <option key={t} value={t}>{t}</option>)}</select>
        <span className="ml-auto text-xs text-slate-500">{rows.length} parties</span>
      </div>
      <div className="mt-3 overflow-auto max-h-[440px] border border-slate-200 rounded-xl">
        <table className="w-full text-[13px] min-w-[720px]">
          <thead className="bg-slate-50 sticky top-0"><tr className="text-left">{['Party', 'Type', 'Entries', 'Debit', 'Credit', 'Balance'].map((h, i) => <th key={h} className={`${th} ${i >= 3 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.party} data-testid="book-row" className="border-t border-slate-100 hover:bg-orange-50/40 cursor-pointer" onClick={() => s.party !== '(no party)' && onOpen(s.party)}>
                <td className="px-3 py-2 uppercase font-medium">{s.party}</td><td className="px-3 py-2">{s.ledgerType}</td><td className="px-3 py-2 tabular-nums">{s.entries}</td>
                <td className="px-3 py-2 text-right tabular-nums text-red-600">{money(s.debit)}</td><td className="px-3 py-2 text-right tabular-nums text-emerald-600">{money(s.credit)}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-semibold ${s.balance > 0 ? 'text-red-600' : s.balance < 0 ? 'text-emerald-600' : ''}`}>{money(Math.abs(s.balance)) || '0.00'} {drCr(s.balance)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400">No parties.</td></tr>}
          </tbody>
          {rows.length > 0 && <tfoot className="bg-slate-100 font-bold border-t border-slate-300"><tr><td colSpan={3} className="px-3 py-2 text-right">Total</td><td className="px-3 py-2 text-right tabular-nums text-red-600" data-testid="book-debit">{money(tot.d) || '0.00'}</td><td className="px-3 py-2 text-right tabular-nums text-emerald-600" data-testid="book-credit">{money(tot.c) || '0.00'}</td><td className="px-3 py-2 text-right tabular-nums">{money(Math.abs(tot.d - tot.c)) || '0.00'} {drCr(tot.d - tot.c)}</td></tr></tfoot>}
        </table>
      </div>
    </Modal>
  );
}
