import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Plus, Landmark, Tags, Layers, BookOpen, PenLine, UploadCloud, FileText, Save, Table2, Eraser, FileDown, FileSpreadsheet, RefreshCw, Wand2, Search, Filter, CheckCircle2, AlertTriangle, Info, Inbox } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/contexts/AuthContext';
import { financeApi, type BankFilters, type BankRow } from '@/lib/finance';
import { formatINR, todayISO } from '@/lib/format';
import { exportCsv } from '@/lib/reportExport';
import {
  applyTypeDefaults, loadOthers, loadTypes, parseStatement, rowDirection, saveOthers, saveTypes, typeFitsRow, validateRows,
  type EntryType, type ImportRow, type RowIssue,
} from '@/lib/bankImport';

// Bank Entry: paste or upload a statement, tag each row with a Type and ledger, save it as bank transactions,
// and browse / filter / export the saved bank data. Saving uses the same erp_add_bank_entry as Manual Entry,
// so every entry posts to the ledger exactly like a manually added one.

const btn = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 text-[13px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none';
const btnPrimary = 'inline-flex items-center justify-center gap-1.5 h-9 px-5 text-[13px] font-bold text-white bg-gradient-to-b from-orange-500 to-orange-600 rounded-lg shadow-md shadow-orange-500/25 hover:from-orange-500 hover:to-orange-700 active:scale-[0.98] transition disabled:opacity-40 disabled:shadow-none';
const sel = 'h-9 px-3 text-[13px] font-medium text-slate-700 bg-white border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15';
const inp = 'h-9 px-3 text-[13px] text-slate-700 bg-white border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15';
const th = 'px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500';
const money = (n: number | string | null | undefined) => (n === null || n === undefined || n === '' ? '' : formatINR(n, { decimals: 'always', symbol: false }));
const dmy = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('-') : '');
const isoDaysAgo = (months: number) => { const d = new Date(); d.setMonth(d.getMonth() - months); return d.toISOString().slice(0, 10); };
const ERR_STATUS = /error|bounce|fail|reject/i;

type Msg = { kind: 'ok' | 'err' | 'info'; text: string } | null;

export function BankEntryPage() {
  const { company } = useAuth();
  const cid = company?.id ?? null;
  const navigate = useNavigate();

  const [options, setOptions] = useState<BankFilters | null>(null);
  const [bankId, setBankId] = useState('');
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [showTable, setShowTable] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [types, setTypes] = useState<EntryType[]>(() => loadTypes(cid));
  const [others, setOthers] = useState<string[]>(() => loadOthers(cid));
  const [existing, setExisting] = useState<BankRow[]>([]);
  const [modal, setModal] = useState<null | 'banks' | 'types' | 'others' | 'ledger' | 'manual'>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Bank Data
  const [data, setData] = useState<BankRow[]>([]);
  const [dataTotal, setDataTotal] = useState(0);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState('');
  const [fBank, setFBank] = useState('');
  const [fKind, setFKind] = useState('');
  const [onlyErr, setOnlyErr] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [full, setFull] = useState(false);

  const loadOptions = useCallback(async () => {
    try {
      const o = await financeApi.bankFilters();
      setOptions(o);
      setBankId(b => b || o.accounts.find(a => a.type === 'Bank')?.id || o.accounts[0]?.id || '');
    } catch (e) { setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Could not load bank accounts.' }); }
  }, []);
  useEffect(() => { void loadOptions(); setTypes(loadTypes(cid)); setOthers(loadOthers(cid)); }, [cid, loadOptions]);

  const loadData = useCallback(async (everything = false) => {
    setLoadingData(true); setDataError('');
    try {
      const args = { account: fBank || null, kind: fKind || null, from: from || undefined, to: to || undefined };
      if (!everything) {
        const r = await financeApi.bankTransactions({ ...args, page: 1, pageSize: 50 });
        setData(r.rows); setDataTotal(r.total); setFull(r.rows.length >= r.total);
      } else {
        const all: BankRow[] = []; let total = 0;
        for (let page = 1; page <= 25; page++) {
          const r = await financeApi.bankTransactions({ ...args, page, pageSize: 200 });
          total = r.total; all.push(...r.rows);
          if (all.length >= total || r.rows.length === 0) break;
        }
        setData(all); setDataTotal(total); setFull(all.length >= total);
      }
    } catch (e) { setData([]); setDataTotal(0); setDataError(e instanceof Error ? e.message : 'Could not load bank data.'); }
    finally { setLoadingData(false); }
  }, [fBank, fKind, from, to]);
  useEffect(() => { void loadData(false); }, [loadData, cid]);

  const bank = options?.accounts.find(a => a.id === bankId);
  const issues = useMemo(() => validateRows(rows, existing.map(e => ({ txn_date: e.txn_date, amount: e.amount, direction: e.direction, reference_no: e.reference_no }))), [rows, existing]);
  const errCount = rows.filter(r => (issues.get(r.id) ?? []).length > 0).length;
  const okCount = rows.length - errCount;

  const incomeOpts = options?.income_accounts ?? [];
  const expenseOpts = options?.expense_accounts ?? [];
  const ledgerChoices = (r: ImportRow) => (rowDirection(r) === 'IN' ? incomeOpts : rowDirection(r) === 'OUT' ? expenseOpts : [...incomeOpts, ...expenseOpts]);
  const parties = useMemo(() => Array.from(new Set([...others, ...(options?.customers ?? []).map(c => c.name), ...(options?.suppliers ?? []).map(s => s.name)])).filter(Boolean), [others, options]);

  const readExisting = async (list: ImportRow[]) => {
    const dates = list.map(r => r.date).filter((d): d is string => !!d).sort();
    if (!dates.length || !bankId) { setExisting([]); return []; }
    try {
      const all: BankRow[] = [];
      for (let page = 1; page <= 10; page++) {
        const r = await financeApi.bankTransactions({ account: bankId, from: dates[0], to: dates[dates.length - 1], page, pageSize: 200 });
        all.push(...r.rows); if (all.length >= r.total || !r.rows.length) break;
      }
      setExisting(all); return all;
    } catch { setExisting([]); return []; }
  };

  const parseNow = async (src = text): Promise<ImportRow[]> => {
    const p = parseStatement(src);
    if (!p.rows.length) { setRows([]); setMsg({ kind: 'err', text: 'Nothing to read. Paste rows (TAB or comma separated) or choose a file first.' }); return []; }
    const withTypes = applyTypeDefaults(p.rows, types);
    setRows(withTypes); setShowTable(true);
    await readExisting(withTypes);
    setMsg({ kind: 'info', text: `${p.rows.length} row${p.rows.length === 1 ? '' : 's'} read${p.warnings.length ? ' · ' + p.warnings.join(' ') : ''}` });
    return withTypes;
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setMsg({ kind: 'err', text: 'File is larger than 5 MB.' }); return; }
    if (!/\.(csv|tsv|txt)$/i.test(f.name)) { setMsg({ kind: 'err', text: 'Choose a .csv, .tsv or .txt statement. For Excel files, use Save As CSV first.' }); return; }
    const t = await f.text();
    setText(t); setMsg({ kind: 'info', text: `Loaded ${f.name}. Click “View full Table” to check the rows.` });
  };

  const patchRow = (id: string, patch: Partial<ImportRow>) => setRows(rs => rs.map(r => {
    if (r.id !== id) return r;
    const next = { ...r, ...patch };
    if (patch.typeId !== undefined) {
      const t = types.find(x => x.id === patch.typeId);
      if (t && !typeFitsRow(t, next)) { setMsg({ kind: 'err', text: `Type “${t.name}” is for ${t.direction === 'IN' ? 'money in' : 'money out'}, but row ${r.line} is the opposite.` }); return r; }
      if (t && t.ledgerId) next.ledgerId = t.ledgerId;
    }
    return next;
  }));

  const updateEntries = async () => {
    if (!rows.length) { setMsg({ kind: 'err', text: 'No rows to update. Click “View full Table” first.' }); return; }
    setBusy(true);
    const re = applyTypeDefaults(rows, types);
    setRows(re); await readExisting(re);
    setBusy(false);
    setMsg({ kind: 'ok', text: 'Entries updated: type defaults applied and every row re-checked against saved bank data.' });
  };

  const save = async () => {
    if (!bankId) { setMsg({ kind: 'err', text: 'Select a bank first.' }); return; }
    let list = rows;
    if (!list.length) list = await parseNow();
    if (!list.length) return;
    const ex = await readExisting(list);
    const iss = validateRows(list, ex.map(e => ({ txn_date: e.txn_date, amount: e.amount, direction: e.direction, reference_no: e.reference_no })));
    const good = list.filter(r => (iss.get(r.id) ?? []).length === 0);
    if (!good.length) { setShowTable(true); setMsg({ kind: 'err', text: 'No row is ready to save. Fix the highlighted rows (type/ledger, date, amount) first.' }); return; }
    setBusy(true);
    const savedIds = new Set<string>(); const failed: string[] = [];
    for (const r of good) {
      const dir = rowDirection(r)!; const t = types.find(x => x.id === r.typeId);
      const cust = options?.customers.find(c => c.name === r.party); const sup = options?.suppliers.find(s => s.name === r.party);
      try {
        await financeApi.addBankEntry({
          direction: dir, account_id: bankId, contra_account_id: r.ledgerId || '', amount: String(dir === 'IN' ? r.credit : r.debit), txn_date: r.date,
          party_type: cust ? 'Customer' : sup ? 'Supplier' : r.party ? 'Other' : '', party_name: r.party, customer_id: cust?.id ?? '', supplier_id: sup?.id ?? '',
          mode: 'Statement import', reference_no: r.reference, description: [t?.name, r.description].filter(Boolean).join(' - '), status: 'Cleared', source_type: 'bank_import',
        });
        savedIds.add(r.id);
      } catch (e) { failed.push(`row ${r.line}: ${e instanceof Error ? e.message : 'failed'}`); }
    }
    setBusy(false);
    setRows(list.filter(r => !savedIds.has(r.id)));
    await readExisting(list.filter(r => !savedIds.has(r.id)));
    const skipped = list.length - good.length;
    setMsg({ kind: failed.length ? 'err' : 'ok', text: `Saved ${savedIds.size} entr${savedIds.size === 1 ? 'y' : 'ies'}${skipped ? ` · ${skipped} row${skipped === 1 ? '' : 's'} with errors left in the table` : ''}${failed.length ? ` · ${failed.length} failed: ${failed.slice(0, 3).join('; ')}` : ''}.` });
    if (!list.some(r => !savedIds.has(r.id))) setText('');
    void loadData(full);
  };

  const clearText = () => { setText(''); setRows([]); setShowTable(false); setExisting([]); setMsg(null); if (fileRef.current) fileRef.current.value = ''; };

  const shownData = data.filter(r => (!onlyErr || ERR_STATUS.test(r.status)));
  const kinds = useMemo(() => Array.from(new Set(data.map(r => r.kind).filter(Boolean))).sort(), [data]);
  const shownRows = rows.filter(r => !onlyErr || (issues.get(r.id) ?? []).length > 0);

  const downloadCsv = () => {
    if (!shownData.length) { setMsg({ kind: 'err', text: 'No bank data to download.' }); return; }
    exportCsv(`bank-data-${todayISO()}`, [
      ['Txn No', 'Date', 'Bank', 'Type', 'Party', 'Reference', 'Description', 'Debit (out)', 'Credit (in)', 'Balance', 'Status'],
      ...shownData.map(r => [r.txn_no, dmy(r.txn_date), r.account_name, r.kind, r.party_name ?? '', r.reference_no ?? '', r.description ?? '', r.direction === 'OUT' ? r.amount : '', r.direction === 'IN' ? r.amount : '', r.balance ?? '', r.status]),
    ]);
  };
  const downloadPdf = async () => {
    if (!shownData.length) { setMsg({ kind: 'err', text: 'No bank data to download.' }); return; }
    try {
      const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const pdf = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      pdf.setFontSize(13); pdf.text(`Bank Data${bank ? ' - ' + bank.name : ''}`, 14, 14);
      pdf.setFontSize(8); pdf.text(`${company?.company_name ?? ''}  |  ${dmy(from) || 'start'} to ${dmy(to) || 'today'}  |  ${shownData.length} rows`, 14, 19);
      autoTable(pdf, {
        startY: 23, styles: { fontSize: 7.5, cellPadding: 1.4 }, headStyles: { fillColor: [51, 65, 85] },
        head: [['Txn No', 'Date', 'Bank', 'Type', 'Party', 'Ref', 'Description', 'Debit', 'Credit', 'Balance', 'Status']],
        body: shownData.map(r => [r.txn_no, dmy(r.txn_date), r.account_name, r.kind, r.party_name ?? '', r.reference_no ?? '', (r.description ?? '').slice(0, 40), r.direction === 'OUT' ? Number(r.amount).toFixed(2) : '', r.direction === 'IN' ? Number(r.amount).toFixed(2) : '', r.balance ?? '', r.status]),
        columnStyles: { 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' } },
      });
      pdf.save(`bank-data-${todayISO()}.pdf`);
    } catch (e) { setMsg({ kind: 'err', text: `Could not create the PDF: ${(e as Error).message}` }); }
  };

  const range = (months: number) => { setFrom(isoDaysAgo(months)); setTo(todayISO()); };
  const clearFilters = () => { setFBank(''); setFKind(''); setOnlyErr(false); setFrom(''); setTo(''); };

  const issueBadge = (is: RowIssue[]) => is.length === 0
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 size={12} /> OK</span>
    : <span className="inline-flex flex-wrap gap-1" data-testid="row-issue">{is.map(i => <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200"><AlertTriangle size={11} />{i}</span>)}</span>;
  const statusPill = (st: string) => (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${ERR_STATUS.test(st) ? 'bg-red-50 text-red-700 border-red-200' : /pend/i.test(st) ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>{st}</span>
  );
  const topBtn = (icon: React.ReactNode, label: string, onClick: () => void) => (
    <button className={`${btn} !rounded-full !h-9`} onClick={onClick}>{icon}{label}</button>
  );
  const msgTone = msg?.kind === 'err' ? 'bg-red-50 border-red-200 text-red-800' : msg?.kind === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-sky-50 border-sky-200 text-sky-800';
  const inTotal = shownData.filter(r => r.direction === 'IN').reduce((n, r) => n + Number(r.amount || 0), 0);
  const outTotal = shownData.filter(r => r.direction === 'OUT').reduce((n, r) => n + Number(r.amount || 0), 0);
  const quick = (months: number, label: string) => {
    const active = from === isoDaysAgo(months) && to === todayISO();
    return <button key={label} className={`h-8 px-3 text-xs font-semibold rounded-full border transition ${active ? 'bg-orange-500 text-white border-orange-500 shadow' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`} onClick={() => range(months)}>{label}</button>;
  };

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <div className="space-y-5 max-w-[1500px] mx-auto">
        {/* ---------- header ---------- */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 text-white flex items-center justify-center shadow-lg shadow-orange-500/25"><Landmark size={22} /></div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Bank Entry</h1>
              <p className="text-sm text-slate-500">Import a bank statement, tag each row, and post it to your ledger.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {topBtn(<Landmark size={14} />, 'Manage Banks', () => setModal('banks'))}
            {topBtn(<Tags size={14} />, 'Manage Types', () => setModal('types'))}
            {topBtn(<Layers size={14} />, 'Manage Others', () => setModal('others'))}
            {topBtn(<BookOpen size={14} />, 'Ledger Details', () => setModal('ledger'))}
            {topBtn(<PenLine size={14} />, 'Manual Entry', () => setModal('manual'))}
          </div>
        </div>

        {/* ---------- import ---------- */}
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex items-center gap-2">
            <UploadCloud size={16} className="text-orange-500" /><h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Import statement</h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4">
              <label className="flex items-center gap-4 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 hover:border-orange-400 hover:bg-orange-50/30 transition px-5 py-4 cursor-pointer">
                <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-orange-500 shrink-0"><FileText size={22} /></div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Choose a statement file <span className="font-normal text-slate-400">or paste rows below</span></p>
                  <p className="text-xs text-slate-500 mt-0.5">CSV, TSV or TXT · up to 5 MB · Excel: Save As CSV first</p>
                  <input ref={fileRef} type="file" aria-label="Statement file" accept=".csv,.tsv,.txt" onChange={e => void onFile(e.target.files?.[0])} className="mt-2 text-xs text-slate-600 file:mr-3 file:h-8 file:px-3 file:rounded-lg file:border file:border-slate-200 file:bg-white file:text-[13px] file:font-semibold file:text-slate-700 file:cursor-pointer" />
                </div>
              </label>
              <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[14rem]">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Post into</p>
                  <select aria-label="Select bank" className={`${sel} w-full`} value={bankId} onChange={e => { setBankId(e.target.value); setExisting([]); }}>
                    <option value="">-- Select Bank --</option>
                    {(options?.accounts ?? []).map(a => <option key={a.id} value={a.id}>{a.name}{a.type === 'Cash' ? ' (Cash)' : ''}</option>)}
                  </select>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Balance</p>
                  <p className="text-lg font-bold text-slate-900 tabular-nums" data-testid="bank-balance">{bank ? `₹${money(bank.balance)}` : '—'}</p>
                </div>
                <button className={`${btn} !px-2.5`} aria-label="Refresh" onClick={() => void loadOptions().then(() => loadData(full))}><RefreshCw size={14} /> Refresh</button>
              </div>
            </div>

            <textarea aria-label="Statement rows" value={text} onChange={e => setText(e.target.value)} rows={7}
              placeholder="Paste rows here - use TAB or comma separated columns"
              className="w-full p-3 text-[13px] font-mono leading-relaxed text-slate-800 bg-slate-50/60 border border-slate-200 rounded-xl resize-y focus:outline-none focus:bg-white focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15" />

            <div className="flex flex-wrap items-center gap-2">
              <button className={btnPrimary} disabled={busy} onClick={() => void save()}><Save size={14} />{busy ? 'Saving…' : 'Save'}</button>
              <button className={btn} disabled={busy} onClick={() => void parseNow()}><Table2 size={14} />View full Table</button>
              <button className={btn} onClick={clearText}><Eraser size={14} />Clear Text</button>
              <span className="w-px h-6 bg-slate-200 mx-1" />
              <button className={btn} onClick={downloadCsv}><FileSpreadsheet size={14} />Download CSV</button>
              <button className={btn} onClick={() => void downloadPdf()}><FileDown size={14} />Download PDF</button>
              <button className={btn} disabled={busy} onClick={() => void updateEntries()}><Wand2 size={14} />Update entries</button>
            </div>
            {msg && (
              <div role="status" data-testid="bank-msg" className={`flex items-start gap-2 text-sm rounded-xl border px-3.5 py-2.5 ${msgTone}`}>
                {msg.kind === 'err' ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : msg.kind === 'ok' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <Info size={16} className="mt-0.5 shrink-0" />}
                <span>{msg.text}</span>
              </div>
            )}
          </div>
        </section>

        {/* ---------- preview grid ---------- */}
        {showTable && rows.length > 0 && (
          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden" data-testid="import-grid">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-bold text-slate-800">{rows.length} rows</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200" data-testid="ok-count">{okCount} ready</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${errCount ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`} data-testid="err-count">{errCount} with errors</span>
              </div>
              <span className="text-xs text-slate-500">Choose a Type or a Ledger for every row, then Save. Rows with errors are not saved.</span>
            </div>
            <div className="overflow-auto max-h-[440px]">
              <table className="w-full text-xs min-w-[1100px]">
                <thead className="bg-slate-50/95 backdrop-blur sticky top-0 z-10 shadow-[0_1px_0_#e2e8f0]"><tr className="text-left">
                  {['#', 'Date', 'Description', 'Reference', 'Debit', 'Credit', 'Type', 'Ledger', 'Party / Other', 'Status'].map((h, i) => <th key={h} className={`${th} ${i === 4 || i === 5 ? 'text-right' : ''}`}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {shownRows.map(r => {
                    const is = issues.get(r.id) ?? [];
                    return (
                      <tr key={r.id} data-testid="import-row" className={`border-t border-slate-100 transition ${is.length ? 'bg-red-50/40 hover:bg-red-50/70' : 'hover:bg-slate-50'}`}>
                        <td className="px-3 py-2 text-slate-400 tabular-nums">{r.line}</td>
                        <td className="px-3 py-2 whitespace-nowrap font-medium">{r.date ? dmy(r.date) : <span className="text-red-600">{r.rawDate || '—'}</span>}</td>
                        <td className="px-3 py-2 max-w-[260px] truncate text-slate-700" title={r.description}>{r.description}</td>
                        <td className="px-3 py-2 font-mono text-slate-500">{r.reference}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-red-600">{Number.isNaN(r.debit) ? '?' : r.debit ? money(r.debit) : ''}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-600">{Number.isNaN(r.credit) ? '?' : r.credit ? money(r.credit) : ''}</td>
                        <td className="px-3 py-1.5"><select aria-label={`Type row ${r.line}`} className={`${sel} !h-8 w-40`} value={r.typeId} onChange={e => patchRow(r.id, { typeId: e.target.value })}>
                          <option value="">—</option>{types.filter(t => typeFitsRow(t, r)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></td>
                        <td className="px-3 py-1.5"><select aria-label={`Ledger row ${r.line}`} className={`${sel} !h-8 w-48`} value={r.ledgerId} onChange={e => patchRow(r.id, { ledgerId: e.target.value })}>
                          <option value="">—</option>{ledgerChoices(r).map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></td>
                        <td className="px-3 py-1.5"><input aria-label={`Party row ${r.line}`} list="bank-parties" className={`${inp} !h-8 w-36`} value={r.party} onChange={e => patchRow(r.id, { party: e.target.value })} /></td>
                        <td className="px-3 py-2">{issueBadge(is)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <datalist id="bank-parties">{parties.map(pn => <option key={pn} value={pn} />)}</datalist>
          </section>
        )}

        {/* ---------- bank data ---------- */}
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Search size={16} className="text-orange-500" /><h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Bank Data</h2></div>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold tabular-nums">In ₹{money(inTotal)}</span>
              <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 font-bold tabular-nums">Out ₹{money(outTotal)}</span>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 flex flex-wrap items-center gap-2.5">
              <Filter size={14} className="text-slate-400" />
              <select aria-label="Filter bank" className={`${sel} w-60`} value={fBank} onChange={e => setFBank(e.target.value)}>
                <option value="">-- All Banks / Types --</option>{(options?.accounts ?? []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
              <select aria-label="Filter ledger type" className={`${sel} w-56`} value={fKind} onChange={e => setFKind(e.target.value)}>
                <option value="">-- All Ledger Types --</option>{kinds.map(k => <option key={k} value={k}>{k}</option>)}</select>
              <label className="flex items-center gap-2 text-[13px] font-medium text-slate-600 px-2"><input type="checkbox" aria-label="Only error rows" className="accent-orange-500 w-4 h-4" checked={onlyErr} onChange={e => setOnlyErr(e.target.checked)} /> Only error rows</label>
              <span className="text-xs font-semibold text-slate-500">From</span><input type="date" aria-label="From date" className={inp} value={from} onChange={e => setFrom(e.target.value)} />
              <span className="text-xs font-semibold text-slate-500">To</span><input type="date" aria-label="To date" className={inp} value={to} onChange={e => setTo(e.target.value)} />
              <span className="flex gap-1.5 ml-1">{quick(3, 'Last 3 Months')}{quick(6, 'Last 6 Months')}{quick(12, 'Last 1 Year')}</span>
              <button className={`${btn} !h-8 ml-auto`} onClick={clearFilters}>Clear Filters</button>
            </div>
            <div className="flex items-center gap-3">
              <button className={btn} disabled={loadingData} onClick={() => void loadData(true)}>{loadingData ? 'Loading…' : 'Load Full Data'}</button>
              <span className="text-xs text-slate-500" data-testid="data-count">{loadingData ? '' : `${shownData.length} shown${dataTotal > data.length ? ` of ${dataTotal} (click Load Full Data for all)` : ''}`}</span>
            </div>
            {dataError && <div data-testid="data-error" className="flex items-start gap-2 text-sm rounded-xl border border-red-200 bg-red-50 text-red-800 px-3.5 py-2.5"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{dataError}</div>}
            <div className="overflow-auto max-h-[480px] border border-slate-200 rounded-xl">
              <table className="w-full text-xs min-w-[1000px]">
                <thead className="bg-slate-50/95 backdrop-blur sticky top-0 z-10 shadow-[0_1px_0_#e2e8f0]"><tr className="text-left">
                  {['Txn No', 'Date', 'Bank', 'Type', 'Party', 'Reference', 'Description', 'Debit (out)', 'Credit (in)', 'Balance', 'Status'].map((h, i) => <th key={h} className={`${th} ${i >= 7 && i <= 9 ? 'text-right' : ''}`}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {shownData.map(r => (
                    <tr key={r.id} data-testid="data-row" className="border-t border-slate-100 hover:bg-slate-50 transition">
                      <td className="px-3 py-2.5 font-mono font-semibold text-slate-700">{r.txn_no}</td><td className="px-3 py-2.5 whitespace-nowrap">{dmy(r.txn_date)}</td><td className="px-3 py-2.5">{r.account_name}</td>
                      <td className="px-3 py-2.5"><span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold">{r.kind}</span></td>
                      <td className="px-3 py-2.5">{r.party_name ?? ''}</td><td className="px-3 py-2.5 font-mono text-slate-500">{r.reference_no ?? ''}</td><td className="px-3 py-2.5 max-w-[240px] truncate text-slate-600" title={r.description ?? ''}>{r.description ?? ''}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-red-600">{r.direction === 'OUT' ? money(r.amount) : ''}</td><td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-600">{r.direction === 'IN' ? money(r.amount) : ''}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{money(r.balance)}</td><td className="px-3 py-2.5">{statusPill(r.status)}</td>
                    </tr>
                  ))}
                  {!loadingData && shownData.length === 0 && (
                    <tr><td colSpan={11} className="px-3 py-14 text-center">
                      <Inbox size={30} className="mx-auto text-slate-300 mb-2" />
                      <p className="text-sm font-semibold text-slate-600">No bank data for these filters</p>
                      <p className="text-xs text-slate-400 mt-0.5">Import a statement above or change the filters.</p>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      <ManualEntryModal open={modal === 'manual'} onClose={() => setModal(null)} bankId={bankId} bankName={bank?.name ?? ''} types={types}
        incomeOpts={incomeOpts} expenseOpts={expenseOpts} onTypes={() => setModal('types')}
        onSaved={() => { setMsg({ kind: 'ok', text: 'Manual entry saved.' }); void loadData(full); }} />
      <ManageBanks open={modal === 'banks'} onClose={() => setModal(null)} accounts={options?.accounts ?? []} onChart={() => navigate('/accounts/ledger')} />
      <ManageTypes open={modal === 'types'} onClose={() => setModal(null)} types={types} ledgers={[...incomeOpts, ...expenseOpts]}
        onSave={t => { if (saveTypes(cid, t)) { setTypes(t); setMsg({ kind: 'ok', text: 'Types saved.' }); } else setMsg({ kind: 'err', text: 'Could not save: browser storage is unavailable.' }); }} />
      <ManageOthers open={modal === 'others'} onClose={() => setModal(null)} others={others}
        onSave={o => { if (saveOthers(cid, o)) { setOthers(o); setMsg({ kind: 'ok', text: 'Others saved.' }); } else setMsg({ kind: 'err', text: 'Could not save: browser storage is unavailable.' }); }} />
      <Modal open={modal === 'ledger'} onClose={() => setModal(null)} title="Ledger Details" subtitle="Accounts a statement row can be posted against" size="lg">
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          {([['Income (money in)', incomeOpts, 'text-emerald-600'], ['Expense (money out)', expenseOpts, 'text-red-600']] as const).map(([title, list, tone]) => (
            <div key={title}><p className={`text-xs font-bold uppercase mb-1.5 ${tone}`}>{title}</p>
              {list.length === 0 ? <p className="text-slate-400 text-xs">None.</p> : <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">{list.map(a => <li key={a.id} className="px-3 py-2 flex gap-3 hover:bg-slate-50"><span className="font-mono text-slate-500">{a.code}</span>{a.name}</li>)}</ul>}</div>
          ))}
        </div>
        <button className={`${btn} mt-4`} onClick={() => { setModal(null); navigate('/accounts/ledger'); }}><BookOpen size={14} />Open Ledger</button>
      </Modal>
    </div>
  );
}

function ManageBanks({ open, onClose, accounts, onChart }: { open: boolean; onClose: () => void; accounts: { id: string; code: string; name: string; type: string; balance: string }[]; onChart: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Manage Banks" subtitle="Bank and cash accounts in your chart of accounts" size="lg">
      {accounts.length === 0 ? <p className="text-sm text-slate-500">No bank or cash accounts yet.</p> : (
        <table className="w-full text-sm"><thead><tr className="text-left text-[10px] uppercase text-slate-500"><th className="py-1">Code</th><th>Name</th><th>Type</th><th className="text-right">Balance</th></tr></thead>
          <tbody>{accounts.map(a => <tr key={a.id} className="border-t border-slate-100"><td className="py-1.5 font-mono">{a.code}</td><td>{a.name}</td><td>{a.type}</td><td className="text-right tabular-nums">₹{formatINR(a.balance, { decimals: 'always', symbol: false })}</td></tr>)}</tbody></table>
      )}
      <p className="text-xs text-slate-500 mt-3">Bank accounts are created in the Ledger (Accounts tab) so they stay in your books. Add a new bank there and press Refresh here.</p>
      <button className={`${btn} mt-3`} onClick={onChart}>Open Ledger</button>
    </Modal>
  );
}

function ManageTypes({ open, onClose, types, ledgers, onSave }: { open: boolean; onClose: () => void; types: EntryType[]; ledgers: { id: string; code: string; name: string }[]; onSave: (t: EntryType[]) => void }) {
  const [list, setList] = useState(types);
  const [name, setName] = useState('');
  const [dir, setDir] = useState<EntryType['direction']>('OUT');
  useEffect(() => { if (open) setList(types); }, [open, types]);
  const dup = list.some(t => t.name.trim().toLowerCase() === name.trim().toLowerCase());
  return (
    <Modal open={open} onClose={onClose} title="Manage Types" subtitle="A Type tags a statement row and can set its default ledger" size="lg"
      footer={<><button className={btn} onClick={onClose}>Cancel</button><button className={btnPrimary} data-testid="types-save" onClick={() => { onSave(list); onClose(); }}>Save</button></>}>
      <div className="space-y-1.5">
        {list.length === 0 && <p className="text-sm text-slate-400">No types yet.</p>}
        {list.map(t => (
          <div key={t.id} className="flex items-center gap-2 text-sm" data-testid="type-row">
            <span className="flex-1 font-medium">{t.name}</span>
            <select aria-label={`Direction ${t.name}`} className={sel} value={t.direction} onChange={e => setList(l => l.map(x => x.id === t.id ? { ...x, direction: e.target.value as EntryType['direction'] } : x))}>
              <option value="IN">Money in</option><option value="OUT">Money out</option><option value="ANY">Either</option></select>
            <select aria-label={`Default ledger ${t.name}`} className={`${sel} w-52`} value={t.ledgerId} onChange={e => setList(l => l.map(x => x.id === t.id ? { ...x, ledgerId: e.target.value } : x))}>
              <option value="">No default ledger</option>{ledgers.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select>
            <button aria-label={`Delete type ${t.name}`} className="text-slate-400 hover:text-red-600" onClick={() => setList(l => l.filter(x => x.id !== t.id))}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
        <input aria-label="New type name" className={`${inp} flex-1`} placeholder="New type, e.g. Salary" value={name} onChange={e => setName(e.target.value)} />
        <select aria-label="New type direction" className={sel} value={dir} onChange={e => setDir(e.target.value as EntryType['direction'])}><option value="IN">Money in</option><option value="OUT">Money out</option><option value="ANY">Either</option></select>
        <button className={btn} disabled={!name.trim() || dup} onClick={() => { setList(l => [...l, { id: `t-${Date.now()}`, name: name.trim(), direction: dir, ledgerId: '' }]); setName(''); }}><Plus size={14} className="inline" /> Add</button>
      </div>
      {dup && name.trim() && <p className="text-xs text-red-600 mt-1">A type with that name already exists.</p>}
    </Modal>
  );
}

function ManageOthers({ open, onClose, others, onSave }: { open: boolean; onClose: () => void; others: string[]; onSave: (o: string[]) => void }) {
  const [list, setList] = useState(others);
  const [name, setName] = useState('');
  useEffect(() => { if (open) setList(others); }, [open, others]);
  const dup = list.some(o => o.toLowerCase() === name.trim().toLowerCase());
  return (
    <Modal open={open} onClose={onClose} title="Manage Others" subtitle="Extra names (not customers or suppliers) you can pick as the Party of a row" size="md"
      footer={<><button className={btn} onClick={onClose}>Cancel</button><button className={btnPrimary} data-testid="others-save" onClick={() => { onSave(list); onClose(); }}>Save</button></>}>
      <div className="space-y-1.5">
        {list.length === 0 && <p className="text-sm text-slate-400">None yet, for example Owner, Petty Cash or Landlord.</p>}
        {list.map(o => <div key={o} className="flex items-center justify-between text-sm" data-testid="other-row"><span>{o}</span><button aria-label={`Delete ${o}`} className="text-slate-400 hover:text-red-600" onClick={() => setList(l => l.filter(x => x !== o))}><Trash2 size={15} /></button></div>)}
      </div>
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
        <input aria-label="New other name" className={`${inp} flex-1`} placeholder="e.g. Landlord" value={name} onChange={e => setName(e.target.value)} />
        <button className={btn} disabled={!name.trim() || dup} onClick={() => { setList(l => [...l, name.trim()]); setName(''); }}><Plus size={14} className="inline" /> Add</button>
      </div>
    </Modal>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

/** Manual Entry: one debit OR credit line against the selected bank, tagged with a Type. Lists the manual entries
 *  already saved for that bank underneath. Saving uses the same erp_add_bank_entry as the statement import. */
function ManualEntryModal({ open, onClose, bankId, bankName, types, incomeOpts, expenseOpts, onTypes, onSaved }: {
  open: boolean; onClose: () => void; bankId: string; bankName: string; types: EntryType[];
  incomeOpts: { id: string; code: string; name: string }[]; expenseOpts: { id: string; code: string; name: string }[]; onTypes: () => void; onSaved: () => void;
}) {
  const [date, setDate] = useState(today());
  const [debit, setDebit] = useState('');
  const [credit, setCredit] = useState('');
  const [desc, setDesc] = useState('');
  const [typeId, setTypeId] = useState('');
  const [ledgerId, setLedgerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [list, setList] = useState<BankRow[]>([]);
  const [listState, setListState] = useState('');

  const num = (v: string) => { const n = Number(v.replace(/,/g, '').trim()); return v.trim() === '' ? 0 : Number.isFinite(n) && n >= 0 ? n : NaN; };
  const d = num(debit), c = num(credit);
  const dir: 'IN' | 'OUT' | null = c > 0 && !(d > 0) ? 'IN' : d > 0 && !(c > 0) ? 'OUT' : null;
  const type = types.find(t => t.id === typeId);
  const ledgers = dir === 'IN' ? incomeOpts : dir === 'OUT' ? expenseOpts : [...incomeOpts, ...expenseOpts];
  const fits = types.filter(t => dir === null || t.direction === 'ANY' || t.direction === dir);

  const loadList = useCallback(async () => {
    if (!bankId) { setList([]); setListState('Select a bank first.'); return; }
    setListState('Loading…');
    try {
      const all: BankRow[] = [];
      for (let page = 1; page <= 10; page++) {
        const r = await financeApi.bankTransactions({ account: bankId, page, pageSize: 200 });
        all.push(...r.rows); if (all.length >= r.total || !r.rows.length) break;
      }
      const manual = all.filter(r => /manual/i.test(r.mode ?? ''));
      setList(manual); setListState(`Loaded ${manual.length} manual entr${manual.length === 1 ? 'y' : 'ies'}`);
    } catch (e) { setList([]); setListState(e instanceof Error ? e.message : 'Could not load manual entries.'); }
  }, [bankId]);
  useEffect(() => { if (open) { setErr(''); setDate(today()); void loadList(); } }, [open, loadList]);

  const submit = async () => {
    setErr('');
    if (!bankId) return setErr('Select a bank first (on the Bank Entry page).');
    if (!parseDateOk(date)) return setErr('Enter a valid date.');
    if (Number.isNaN(d) || Number.isNaN(c)) return setErr('Debit and credit must be numbers of 0 or more.');
    if (!dir) return setErr(d > 0 && c > 0 ? 'Enter either a debit or a credit, not both.' : 'Enter a debit or a credit amount.');
    if (!typeId && !ledgerId) return setErr('Choose a Type or a Ledger.');
    if (type && !(type.direction === 'ANY' || type.direction === dir)) return setErr(`Type “${type.name}” is for ${type.direction === 'IN' ? 'money in (credit)' : 'money out (debit)'}.`);
    setBusy(true);
    try {
      await financeApi.addBankEntry({
        direction: dir, account_id: bankId, contra_account_id: ledgerId || type?.ledgerId || '', amount: String(dir === 'IN' ? c : d), txn_date: date,
        mode: 'Manual entry', description: [type?.name, desc.trim()].filter(Boolean).join(' - '), status: 'Cleared', source_type: 'manual_entry',
      });
      setDebit(''); setCredit(''); setDesc(''); setTypeId(''); setLedgerId('');
      onSaved(); await loadList();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save the entry.'); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title="Manual Entry" subtitle={bankName ? `Posting to ${bankName}` : 'Select a bank on the Bank Entry page first'} size="xl"
      footer={<><button className={btn} onClick={onClose}>Close</button><button className={btnPrimary} data-testid="manual-save" disabled={busy} onClick={() => void submit()}><Save size={14} />{busy ? 'Saving…' : 'Save'}</button></>}>
      <div className="flex justify-end -mt-1 mb-2"><button className={btn} onClick={onTypes}><Tags size={14} />Types</button></div>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Date
          <input type="date" aria-label="Manual date" className={`${inp} w-full mt-1 normal-case font-normal`} value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Debit (money out)
          <input aria-label="Manual debit" inputMode="decimal" placeholder="0.00" className={`${inp} w-full mt-1 normal-case font-normal`} value={debit} onChange={e => setDebit(e.target.value.replace(/[^0-9.,]/g, ''))} /></label>
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Credit (money in)
          <input aria-label="Manual credit" inputMode="decimal" placeholder="0.00" className={`${inp} w-full mt-1 normal-case font-normal`} value={credit} onChange={e => setCredit(e.target.value.replace(/[^0-9.,]/g, ''))} /></label>
      </div>
      <label className="block mt-3 text-xs font-bold uppercase tracking-wider text-slate-500">Description
        <input aria-label="Manual description" className={`${inp} w-full mt-1 normal-case font-normal`} placeholder="Description" value={desc} onChange={e => setDesc(e.target.value)} /></label>
      <div className="grid sm:grid-cols-2 gap-3 mt-3">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Type
          <select aria-label="Manual type" className={`${sel} w-full mt-1 normal-case font-normal`} value={typeId} onChange={e => { setTypeId(e.target.value); const t = types.find(x => x.id === e.target.value); if (t?.ledgerId) setLedgerId(t.ledgerId); }}>
            <option value="">-- Select Type --</option>{fits.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Ledger {type?.ledgerId ? '' : '(if the Type has no default)'}
          <select aria-label="Manual ledger" className={`${sel} w-full mt-1 normal-case font-normal`} value={ledgerId} onChange={e => setLedgerId(e.target.value)}>
            <option value="">{type?.ledgerId ? 'Type default' : '—'}</option>{ledgers.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></label>
      </div>
      {err && <p role="alert" data-testid="manual-error" className="mt-3 flex items-start gap-2 text-sm rounded-xl border border-red-200 bg-red-50 text-red-800 px-3 py-2"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{err}</p>}

      <div className="mt-5 pt-4 border-t border-slate-200">
        <h3 className="text-base font-bold text-slate-900">Manual Entry Details</h3>
        <p className="text-sm text-emerald-700 mt-0.5" data-testid="manual-count">{listState}</p>
        {list.length > 0 && (
          <div className="mt-2 overflow-auto max-h-56 border border-slate-200 rounded-xl">
            <table className="w-full text-xs"><thead className="bg-slate-50 sticky top-0"><tr className="text-left">{['Txn No', 'Date', 'Description', 'Debit', 'Credit'].map((h, i) => <th key={h} className={`${th} ${i >= 3 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody>{list.map(r => (
                <tr key={r.id} data-testid="manual-row" className="border-t border-slate-100"><td className="px-3 py-2 font-mono">{r.txn_no}</td><td className="px-3 py-2">{dmy(r.txn_date)}</td><td className="px-3 py-2 max-w-[260px] truncate">{r.description ?? ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-600 font-semibold">{r.direction === 'OUT' ? money(r.amount) : ''}</td><td className="px-3 py-2 text-right tabular-nums text-emerald-600 font-semibold">{r.direction === 'IN' ? money(r.amount) : ''}</td></tr>
              ))}</tbody></table>
          </div>
        )}
      </div>
    </Modal>
  );
}
function parseDateOk(v: string) { return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v).getTime()); }
