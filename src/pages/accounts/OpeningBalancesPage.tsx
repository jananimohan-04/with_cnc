import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Boxes, CheckCircle2, Download, Eye, FilePlus2, Landmark, Pencil, Plus, Rows3, Search, Trash2, Undo2, Upload, Users, X } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui/Card';
import { EmptyState, LoadingState } from '@/components/ui/PageHeader';
import { FormField, Modal, inputClass } from '@/components/ui/Modal';
import { SortLabel, useSort } from '@/components/ui/SortHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useHeaderKpis } from '@/contexts/HeaderKpiContext';
import { formatDate, formatINR, todayISO } from '@/lib/format';
import { exportCsv } from '@/lib/reportExport';
import { xlsxToTsv } from '@/lib/xlsxRead';
import {
  num, openingApi, parseStockCsv, stockValue, toIsoDate,
  type OpeningDraft, type OpeningEntry, type OpeningLookups, type OpeningPreview, type OpeningType,
} from '@/lib/openingBalances';


// Opening Balances: enter what the company already had when it started using the BI (bank balances, what customers owe,
// what is owed to suppliers, stock in the warehouse). Draft -> Validate & Preview -> Post -> view in the ledger / stock.
// A posted entry is never edited or deleted; it is reversed (an audit trail is kept) and a corrected entry entered.

type Tab = 'BANK' | 'PARTY' | 'STOCK';

const TABS: { id: Tab; label: string; icon: typeof Landmark }[] = [
  { id: 'BANK', label: 'Bank Opening Balances', icon: Landmark },
  { id: 'PARTY', label: 'Companies', icon: Users },
  { id: 'STOCK', label: 'Inventory Opening Stock', icon: Boxes },
];

const th = 'px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-left whitespace-nowrap';
const thR = `${th} !text-right`;
const td = 'px-3 py-2 text-[13px] text-slate-700';
const tdR = `${td} text-right tabular-nums whitespace-nowrap`;
const sel = 'h-9 px-3 text-[13px] font-medium text-slate-700 bg-white border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15';
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const money = (n: number) => formatINR(n, { decimals: 'always' });
const drCr = (side: string | null) => (side === 'CR' ? 'Cr' : 'Dr');

const statusVariant = (s: string) => (s === 'Posted' ? 'success' : s === 'Draft' ? 'warning' : 'neutral') as 'success' | 'warning' | 'neutral';

type Toast = { kind: 'ok' | 'err'; text: string } | null;

export function OpeningBalancesPage() {
  const navigate = useNavigate();
  const { company } = useAuth();
  const companyId = company?.id ?? null;
  const { setHeader, setTabs, setTabActions } = useHeaderKpis();

  const [lookups, setLookups] = useState<OpeningLookups | null>(null);
  const [rows, setRows] = useState<OpeningEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<Toast>(null);

  const [tab, setTab] = useState<Tab>('BANK');
  const [fyId, setFyId] = useState('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // 'all' lists every bank / customer / supplier / item with its opening balance (blank if none); 'entries' is the plain list of entered openings
  const [view, setView] = useState<'all' | 'entries'>('all');
  const [statusFilter, setStatusFilter] = useState<'' | 'none' | 'Draft' | 'Posted'>('');

  const [form, setForm] = useState<{ type: OpeningType; entry?: OpeningEntry; prefill?: OpeningDraft } | null>(null);
  const [bulk, setBulk] = useState<BulkRow[] | null>(null);
  const [preview, setPreview] = useState<OpeningPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [reversing, setReversing] = useState<{ entry: OpeningEntry; afterReverse?: 'edit' } | null>(null);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const setColFilter = (k: string, v: string) => setColFilters(prev => {
    if (!v) { const next = { ...prev }; delete next[k]; return next; }
    return { ...prev, [k]: v };
  });
  const clearFilters = useCallback(() => setColFilters({}), []);
  const fileRef = useRef<HTMLInputElement>(null);

  const say = (kind: 'ok' | 'err', text: string) => { setToast({ kind, text }); window.setTimeout(() => setToast(t => (t && t.text === text ? null : t)), 4500); };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [lk, list] = await Promise.all([openingApi.lookups(), openingApi.list({ search: view === 'entries' ? search : '', fyId })]);
      setLookups(lk); setRows(list.rows);
      setPicked(new Set());
    } catch (e) { setError(errText(e)); }
    finally { setLoading(false); }
  }, [search, fyId, view]);

  useEffect(() => {
    if (!companyId) return;
    const t = window.setTimeout(() => { void load(); }, search ? 250 : 0);
    return () => window.clearTimeout(t);
  }, [companyId, load, search]);

  const canManage = !!lookups?.can_manage;
  const shown = useMemo(() => rows.filter(e => (tab === 'PARTY' ? e.entry_type === 'CUSTOMER' || e.entry_type === 'SUPPLIER' : e.entry_type === tab)), [rows, tab]);
  const drafts = shown.filter(e => e.status === 'Draft');
  const togglePick = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Every bank account / customer / supplier / item, each with its opening (from the entries, Reversed ones ignored)
  interface MasterRow { key: string; type: OpeningType; name: string; code: string; sub: string; entries: OpeningEntry[]; net: number; qty: number; value: number; unit: string; current: string; prefill: OpeningDraft }
  const master = useMemo<MasterRow[]>(() => {
    if (!lookups) return [];
    const live = rows.filter(e => e.status !== 'Reversed');
    const signed = (list: OpeningEntry[]) => list.reduce((n, e) => n + (e.side === 'CR' ? -1 : 1) * num(e.amount), 0);
    const q = search.trim().toLowerCase();
    const hit = (...v: (string | null | undefined)[]) => !q || v.some(x => (x ?? '').toLowerCase().includes(q));
    let out: MasterRow[] = [];
    if (tab === 'BANK') {
      out = lookups.banks.map(b => {
        const en = live.filter(e => e.entry_type === 'BANK' && e.account_id === b.id);
        return { key: b.id, type: 'BANK' as const, name: b.name, code: b.code, sub: b.type, entries: en, net: signed(en), qty: 0, value: 0, unit: '', current: money(num(b.balance)), prefill: { account_id: b.id } };
      });
    } else if (tab === 'PARTY') {
      const byName = new Map<string, { name: string; cust?: { id: string }; sup?: { id: string; code: string | null } }>();
      for (const c of lookups.customers) { const k = c.name.trim().toLowerCase(); byName.set(k, { ...(byName.get(k) ?? { name: c.name }), cust: { id: c.id } }); }
      for (const sp of lookups.suppliers) { const k = sp.name.trim().toLowerCase(); byName.set(k, { ...(byName.get(k) ?? { name: sp.name }), sup: { id: sp.id, code: sp.code } }); }
      out = Array.from(byName.entries()).sort((x, y) => x[1].name.localeCompare(y[1].name)).map(([nk, c]) => {
        const en = live.filter(e => (e.entry_type === 'CUSTOMER' || e.entry_type === 'SUPPLIER')
          && (e.party_id === c.cust?.id || e.party_id === c.sup?.id || (e.party_name ?? '').trim().toLowerCase() === nk));
        const asCustomer = !!c.cust;
        return { key: nk, type: (asCustomer ? 'CUSTOMER' : 'SUPPLIER') as OpeningType, name: c.name, code: c.sup?.code ?? '', sub: '', entries: en, net: signed(en), qty: 0, value: 0, unit: '', current: '',
          prefill: { party_id: asCustomer ? c.cust!.id : c.sup!.id, party_name: c.name, party_code: asCustomer ? '' : (c.sup!.code ?? '') } };
      });
    } else {
      out = lookups.items.map(i => {
        const en = live.filter(e => e.entry_type === 'STOCK' && e.item_id === i.id && e.item_kind === i.kind);
        return { key: `${i.kind}:${i.id}`, type: 'STOCK' as const, name: i.name, code: i.code ?? '', sub: i.kind === 'RAW' ? 'Material' : 'Part', entries: en, net: 0,
          qty: en.reduce((n, e) => n + num(e.qty), 0), value: en.reduce((n, e) => n + num(e.amount), 0), unit: i.unit ?? '', current: `${num(i.stock).toLocaleString('en-IN')} ${i.unit ?? ''}`.trim(),
          prefill: { item_kind: i.kind, item_id: i.id, unit_cost: i.rate } };
      });
    }
    const stat = (m: MasterRow) => (!m.entries.length ? 'none' : m.entries.some(e => e.status === 'Draft') ? 'Draft' : 'Posted');
    return out.filter(m => hit(m.name, m.code) && (!statusFilter || stat(m) === statusFilter));
  }, [lookups, rows, tab, search, statusFilter]);

  const addType: OpeningType = tab === 'BANK' ? 'BANK' : tab === 'STOCK' ? 'STOCK' : 'CUSTOMER';
  const addLabel = tab === 'BANK' ? 'Add Bank Balance' : tab === 'STOCK' ? 'Add Opening Stock' : 'Add Company Balance';

  useEffect(() => {
    setHeader({ title: 'Opening Balances' });
    // Keep the three section tabs in the desktop topbar (smaller screens fall back to the inline row).
    setTabs(TABS.map(t => ({
      label: t.label,
      active: tab === t.id,
      onClick: () => { setTab(t.id); setPicked(new Set()); clearFilters(); },
    })));
    setTabActions(null);
    return () => { setHeader(null); setTabs([]); setTabActions(null); };
  }, [setHeader, setTabs, setTabActions, tab, clearFilters]);

  const openPreview = async (ids: string[]) => {
    if (!ids.length) { say('err', 'Select at least one draft entry.'); return; }
    setPreviewBusy(true);
    try { setPreview(await openingApi.validate(ids)); }
    catch (e) { say('err', errText(e)); }
    finally { setPreviewBusy(false); }
  };

  const doPost = async () => {
    if (!preview) return;
    setPreviewBusy(true);
    try {
      const res = await openingApi.post(preview.entries.filter(e => e.status === 'Draft').map(e => e.id));
      setPreview(null);
      say('ok', `Posted ${res.posted} entr${res.posted === 1 ? 'y' : 'ies'}${res.skipped ? ` (${res.skipped} already posted)` : ''}.`);
      await load();
    } catch (e) { say('err', errText(e)); await load(); }
    finally { setPreviewBusy(false); }
  };

  const remove = async (e: OpeningEntry) => {
    if (!window.confirm(`Delete draft ${e.entry_no}? This cannot be undone.`)) return;
    try { await openingApi.remove(e.id); say('ok', 'Draft deleted.'); await load(); }
    catch (err) { say('err', errText(err)); }
  };

  const viewIn = (e: OpeningEntry) => {
    if (e.entry_type === 'BANK' && e.account_id) navigate(`/accounts/ledger?account=${e.account_id}`);
    else if (e.entry_type === 'STOCK') navigate(`/inventory/stock?q=${encodeURIComponent(e.item_name || e.item_code || '')}`);
    else if (e.party_name) navigate(`/accounts/ledger?party=${encodeURIComponent(e.party_name)}`);
  };

  const exportRows = () => {
    exportCsv(`Opening_${tab === 'PARTY' ? 'COMPANIES' : tab}_${todayISO()}`, [
      ['Entry No', 'Date', 'Type', 'Name', 'Code', 'Balance type', 'Invoice ref', 'Due date', 'Warehouse', 'Qty', 'Unit cost', 'Amount', 'Status', 'Remarks'],
      ...shown.map(e => [e.entry_no, e.opening_date, e.entry_type,
        e.entry_type === 'BANK' ? e.account_name : e.entry_type === 'STOCK' ? e.item_name : e.party_name,
        e.entry_type === 'STOCK' ? e.item_code : e.party_code, e.balance_type, e.invoice_ref, e.due_date, e.warehouse_name,
        e.qty, e.unit_cost, e.amount, e.status, e.remarks]),
    ]);
  };

  const importCsv = async (file: File | undefined) => {
    if (!file || !lookups) return;
    let text = '';
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      if ((bytes[0] === 0x50 && bytes[1] === 0x4B) || /\.xlsx$/i.test(file.name)) {
        text = await xlsxToTsv(buf);
      } else {
        text = new TextDecoder('utf-8').decode(buf);
      }
    } catch {
      text = await file.text();
    }
    const { rows: parsed, problems } = parseStockCsv(text);
    if (problems.length) say('err', problems.slice(0, 3).join(' | ') + (problems.length > 3 ? ` (+${problems.length - 3} more)` : ''));
    if (!parsed.length) return;
    const key = (s: string) => s.trim().toLowerCase();
    setBulk(parsed.map(r => {
      const item = lookups.items.find(i => key(i.code ?? '') === key(r.code)) ?? lookups.items.find(i => key(i.name) === key(r.code));
      const wh = r.warehouse ? lookups.warehouses.find(w => key(w.name) === key(r.warehouse) || key(w.code ?? '') === key(r.warehouse)) : undefined;
      return {
        key: `csv-${r.line}`, itemRef: item ? `${item.kind}:${item.id}` : '', warehouse: wh?.id ?? '', qty: String(r.qty), cost: String(r.unitCost || item?.rate || ''),
        date: toIsoDate(r.date), remarks: r.remarks,
        error: !item ? `Line ${r.line}: "${r.code}" is not in the inventory master` : r.warehouse && !wh ? `Line ${r.line}: warehouse "${r.warehouse}" not found` : '',
      };
    }));
  };

  const hasColFilters = Object.keys(colFilters).length > 0;

  const masterSort = useSort<MasterRow>({
    name: m => m.name,
    unit: m => m.unit,
    opening_balance: m => m.net,
    current: m => parseDisplayNumber(m.current),
    entries: m => m.entries.length,
    qty: m => m.qty,
    value: m => m.value,
    status: m => masterStatus(m),
  });

  const masterOpts = useMemo(() => ({
    unit: uniqueOpts(master.map(m => m.unit)),
    status: uniqueOpts(master.map(m => masterStatus(m))),
  }), [master]);

  const filteredMasterBase = useMemo(() => {
    if (!hasColFilters) return master;
    const eq = (key: string, val: string) => !colFilters[key] || val === colFilters[key];
    return master.filter(m =>
      matchText(`${m.name} ${m.code} ${m.sub}`, colFilters.name)
      && eq('unit', m.unit)
      && matchText(m.entries.length ? `${Math.abs(m.net)} ${money(Math.abs(m.net))} ${m.net < 0 ? 'Cr' : 'Dr'}` : '-', colFilters.opening_balance)
      && matchText(`${m.current} ${m.current.replace(/,/g, '')}`, colFilters.current)
      && matchText(m.entries.length ? String(m.entries.length) : '-', colFilters.entries)
      && matchText(m.entries.length ? `${m.qty} ${m.qty.toLocaleString('en-IN')}` : '-', colFilters.qty)
      && matchText(m.entries.length ? `${m.value} ${money(m.value)}` : '-', colFilters.value)
      && eq('status', masterStatus(m))
    );
  }, [master, colFilters, hasColFilters]);
  const filteredMaster = masterSort.sortRows(filteredMasterBase);

  const entrySort = useSort<OpeningEntry>({
    entry_no: e => e.entry_no,
    opening_date: e => e.opening_date,
    account_name: e => e.account_name ?? '',
    remarks: e => e.remarks ?? '',
    party_name: e => e.party_name ?? '',
    balance_type: e => e.balance_type ?? '',
    invoice_ref: e => e.invoice_ref ?? '',
    due_date: e => e.due_date ?? '',
    item_name: e => e.item_name ?? '',
    warehouse_name: e => e.warehouse_name ?? 'Item default',
    qty: e => num(e.qty),
    unit_cost: e => num(e.unit_cost),
    amount: e => num(e.amount),
    status: e => e.status,
  });

  const entryOpts = useMemo(() => ({
    account_name: uniqueOpts(shown.map(e => e.account_name)),
    balance_type: uniqueOpts(shown.map(e => e.balance_type)),
    warehouse_name: uniqueOpts(shown.map(e => e.warehouse_name ?? 'Item default')),
    status: uniqueOpts(shown.map(e => e.status)),
  }), [shown]);

  const filteredEntriesBase = useMemo(() => {
    if (!hasColFilters) return shown;
    const eq = (key: string, val: string) => !colFilters[key] || val === colFilters[key];
    return shown.filter(e =>
      matchText(e.entry_no, colFilters.entry_no)
      && matchText(`${e.opening_date} ${formatDate(e.opening_date)}`, colFilters.opening_date)
      && eq('account_name', e.account_name ?? '')
      && matchText(e.remarks ?? '', colFilters.remarks)
      && matchText(`${e.party_name ?? ''} ${e.party_code ?? ''}`, colFilters.party_name)
      && eq('balance_type', e.balance_type ?? '')
      && matchText(e.invoice_ref ?? '', colFilters.invoice_ref)
      && matchText(e.due_date ? `${e.due_date} ${formatDate(e.due_date)}` : '', colFilters.due_date)
      && matchText(`${e.item_name ?? ''} ${e.item_code ?? ''}`, colFilters.item_name)
      && eq('warehouse_name', e.warehouse_name ?? 'Item default')
      && matchText(`${num(e.qty)} ${num(e.qty).toLocaleString('en-IN')} ${e.unit ?? ''}`, colFilters.qty)
      && matchText(`${num(e.unit_cost)} ${money(num(e.unit_cost))}`, colFilters.unit_cost)
      && matchText(`${num(e.amount)} ${money(e.amount)} ${tab === 'STOCK' ? '' : drCr(e.side)}`, colFilters.amount)
      && eq('status', e.status)
    );
  }, [shown, colFilters, hasColFilters, tab]);
  const filteredEntries = entrySort.sortRows(filteredEntriesBase);
  const visibleDrafts = filteredEntries.filter(e => e.status === 'Draft');
  const allPicked = visibleDrafts.length > 0 && visibleDrafts.every(e => picked.has(e.id));

  const jumpToEntity = (m: MasterRow) => {
    setView('entries');
    if (tab === 'BANK') setColFilters({ account_name: m.entries[0]?.account_name || m.name });
    else if (tab === 'PARTY') setColFilters({ party_name: m.name });
    else setColFilters({ item_name: m.name });
  };

  const masterColSpan = tab === 'STOCK' ? 7 : 5;
  const entryColSpan = (canManage ? 1 : 0) + (tab === 'BANK' ? 7 : tab === 'PARTY' ? 9 : 9);

  const masterView = (() => {
    if (loading && !lookups) return <LoadingState message="Loading…" />;
    if (!master.length) return <EmptyState icon={<FilePlus2 size={28} />} title="Nothing to list" message={tab === 'BANK' ? 'No bank or cash accounts found.' : tab === 'STOCK' ? 'No inventory items found.' : 'No companies found.'} />;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <HeadingCell label={tab === 'BANK' ? 'Bank / cash account' : tab === 'STOCK' ? 'Item' : 'Company'} colKey="name" sort={masterSort} filterValue={colFilters.name ?? ''} onFilter={setColFilter} inputWidth="w-24" thClass={th} />
              {tab === 'STOCK' && <HeadingCell label="Unit" colKey="unit" sort={masterSort} filterValue={colFilters.unit ?? ''} onFilter={setColFilter} options={masterOpts.unit} optionWidth="max-w-[68px]" thClass={th} />}
              {tab === 'STOCK' ? (<>
                <HeadingCell label="Opening qty" colKey="qty" sort={masterSort} filterValue={colFilters.qty ?? ''} onFilter={setColFilter} align="right" inputWidth="w-14" thClass={thR} />
                <HeadingCell label="Opening value" colKey="value" sort={masterSort} filterValue={colFilters.value ?? ''} onFilter={setColFilter} align="right" inputWidth="w-16" thClass={thR} />
                <HeadingCell label="Stock now" colKey="current" sort={masterSort} filterValue={colFilters.current ?? ''} onFilter={setColFilter} align="right" inputWidth="w-16" thClass={thR} />
              </>) : (<>
                <HeadingCell label="Opening balance" colKey="opening_balance" sort={masterSort} filterValue={colFilters.opening_balance ?? ''} onFilter={setColFilter} align="right" inputWidth="w-16" thClass={thR} />
                {tab === 'BANK' && <HeadingCell label="Balance now" colKey="current" sort={masterSort} filterValue={colFilters.current ?? ''} onFilter={setColFilter} align="right" inputWidth="w-16" thClass={thR} />}
                {tab === 'PARTY' && <HeadingCell label="Entries" colKey="entries" sort={masterSort} filterValue={colFilters.entries ?? ''} onFilter={setColFilter} align="right" inputWidth="w-12" thClass={thR} />}
              </>)}
              <HeadingCell label="Status" colKey="status" sort={masterSort} filterValue={colFilters.status ?? ''} onFilter={setColFilter} options={masterOpts.status} optionWidth="max-w-[88px]" thClass={th} />
              <ActionsHead thClass={thR} hasFilters={hasColFilters} onClear={clearFilters} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredMaster.length === 0 && (
              <tr><td colSpan={masterColSpan} className="px-4 py-8 text-center text-xs text-slate-500">
                No rows match the active column filters.{' '}
                <button type="button" onClick={clearFilters} className="font-semibold text-orange-600 hover:underline">Clear filters</button>
              </td></tr>
            )}
            {filteredMaster.map(m => {
              const dr = m.entries.filter(e => e.status === 'Draft'); const po = m.entries.filter(e => e.status === 'Posted');
              const status = !m.entries.length ? '' : dr.length ? 'Draft' : 'Posted';
              const canAdd = canManage && (m.entries.length === 0 || tab === 'PARTY');
              const onlyDraft = m.entries.length === 1 && dr.length === 1 ? dr[0] : null;
              const onlyPosted = m.entries.length === 1 && po.length === 1 ? po[0] : null;
              const onEdit = onlyDraft
                ? () => setForm({ type: m.type, entry: onlyDraft })
                : onlyPosted && canManage
                  ? () => setReversing({ entry: onlyPosted, afterReverse: 'edit' })
                  : m.entries.length > 1
                    ? () => jumpToEntity(m)
                    : null;
              const onDelete = onlyDraft
                ? () => remove(onlyDraft)
                : onlyPosted && canManage
                  ? () => setReversing({ entry: onlyPosted })
                  : m.entries.length > 1
                    ? () => jumpToEntity(m)
                    : null;
              return (
                <tr key={m.key} className="hover:bg-orange-50/40">
                  <td className={`${td} font-semibold`}>{m.name}{m.code && <span className="ml-1.5 text-[11px] font-normal text-slate-400">{m.code}</span>}<span className="ml-1.5 text-[10px] font-semibold uppercase text-slate-400">{m.sub}</span></td>
                  {tab === 'STOCK' && <td className={td}>{m.unit}</td>}
                  {tab === 'STOCK' ? (<>
                    <td className={tdR}>{m.entries.length ? m.qty.toLocaleString('en-IN') : <span className="text-slate-300">-</span>}</td>
                    <td className={`${tdR} font-semibold`}>{m.entries.length ? money(m.value) : <span className="text-slate-300">-</span>}</td>
                    <td className={tdR}>{m.current}</td></>) : (<>
                    <td className={`${tdR} font-semibold`}>{m.entries.length ? <>{money(Math.abs(m.net))} <span className="text-[10px] text-slate-400">{m.net < 0 ? 'Cr' : 'Dr'}</span></> : <span className="text-slate-300">-</span>}</td>
                    {tab === 'BANK' && <td className={tdR}>{m.current}</td>}
                    {tab === 'PARTY' && (
                      <td className={tdR}>
                        {m.entries.length ? (
                          <button type="button" onClick={() => jumpToEntity(m)} title="View entered openings"
                            className="font-semibold text-orange-700 hover:underline">{m.entries.length}</button>
                        ) : <span className="text-slate-300">-</span>}
                      </td>
                    )}</>)}
                  <td className={td}>{status ? <Badge variant={statusVariant(status)} dot>{status}</Badge> : <span className="text-[11px] text-slate-400">No opening</span>}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    <div className="inline-flex items-center gap-1">
                      {canAdd && <button type="button" onClick={() => setForm({ type: m.type, prefill: m.prefill })} className="h-7 px-2 inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50 text-orange-700 text-[11px] font-bold hover:bg-orange-100"><Plus size={12} />Add opening</button>}
                      {dr.length > 0 && canManage && <IconBtn label="Validate, preview & post" onClick={() => openPreview(dr.map(d => d.id))}><CheckCircle2 size={14} /></IconBtn>}
                      {po.length > 0 && <IconBtn label={tab === 'STOCK' ? 'View stock' : 'View ledger'} onClick={() => viewIn(po[0])}><Eye size={14} /></IconBtn>}
                      {onEdit && <IconBtn label={onlyDraft ? 'Edit draft' : onlyPosted ? 'Edit posted entry' : 'Edit entries'} onClick={onEdit}><Pencil size={14} /></IconBtn>}
                      {onDelete && <IconBtn label={onlyDraft ? 'Delete draft' : onlyPosted ? 'Delete (reverse) posted entry' : 'Delete / reverse entries'} danger onClick={onDelete}><Trash2 size={14} /></IconBtn>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  })();

  if (!company) {
    return (
      <div className="p-2 sm:p-4 lg:px-6 lg:pt-2 lg:pb-6 bg-grid min-h-full">
        <Card><EmptyState icon={<Landmark size={28} />} title="No company selected" message="Select a company in the top bar to enter its opening balances." /></Card>
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4 lg:px-6 lg:pt-2 lg:pb-6 bg-grid min-h-full space-y-3">
      {toast && (
        <div role="status" className={`fixed bottom-20 right-5 z-[80] max-w-sm px-4 py-2.5 rounded-lg shadow-xl text-sm font-semibold ${toast.kind === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>{toast.text}</div>
      )}

      <Card className="p-2.5">
        <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap">
          <span className="text-xs font-semibold text-slate-500 px-1 shrink-0">{lookups?.company?.company_name ?? company.company_name}</span>
          <select aria-label="Financial year" className={`${sel} !w-auto shrink-0`} value={fyId} onChange={e => setFyId(e.target.value)}>
            <option value="">All financial years</option>
            {(lookups?.financial_years ?? []).map(y => <option key={y.id} value={y.id}>{y.name}{y.status === 'Closed' ? ' (closed)' : ''}</option>)}
          </select>
          <div className="relative shrink-0">
            <Search size={14} className="pointer-events-none z-10 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input aria-label="Search by name" className={`${sel} !pl-8 !w-52`} placeholder="Search name, code, entry no…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select aria-label="Filter openings" className={`${sel} !w-auto shrink-0 ${(view === 'entries' || statusFilter) ? '!border-orange-500 ring-1 ring-orange-400' : ''}`}
            value={view === 'entries' ? 'entries' : statusFilter}
            onChange={e => {
              const v = e.target.value;
              clearFilters();
              if (v === 'entries') { setView('entries'); return; }
              setView('all'); setStatusFilter(v as typeof statusFilter);
            }}>
            <option value="">All</option>
            <option value="none">No opening yet</option>
            <option value="entries">Entered openings</option>
          </select>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={exportRows} disabled={!shown.length}>Export CSV</Button>
            {tab === 'STOCK' && (
              <>
                <Button variant="secondary" size="sm" icon={<Rows3 size={14} />} onClick={() => setBulk([newBulkRow()])}>Bulk Entry</Button>
                <Button variant="secondary" size="sm" icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>Import CSV</Button>
                <input ref={fileRef} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" aria-label="Import opening stock CSV/Excel"
                  onChange={e => { void importCsv(e.target.files?.[0]); e.target.value = ''; }} />
              </>
            )}
            <Button size="sm" icon={<Plus size={14} />} onClick={() => setForm({ type: addType })}>{addLabel}</Button>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => { setTab(t.id); setPicked(new Set()); clearFilters(); }}
            className={`lg:hidden inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[13px] font-bold border transition ${tab === t.id ? 'bg-orange-600 text-white border-orange-600 shadow' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            <t.icon size={14} />{t.label}
          </button>
        ))}
        {canManage && drafts.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-500">{drafts.length} draft{drafts.length === 1 ? '' : 's'} waiting to be posted</span>
            <Button variant="success" size="sm" icon={<CheckCircle2 size={14} />} onClick={() => openPreview(drafts.map(d => d.id))} disabled={previewBusy}>Validate, Preview &amp; Post all</Button>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span>{error}</span></div>
      )}

      <Card className="overflow-hidden">
        {view === 'all' ? masterView : loading && !rows.length ? <LoadingState message="Loading opening entries…" /> : !shown.length ? (
          <EmptyState icon={<FilePlus2 size={28} />} title="No opening entries yet" message={`Use “${addLabel}” to enter the first one. Nothing counts in the books until it is posted.`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {canManage && <th className={`${th} w-8`}><input type="checkbox" aria-label="Select all drafts" checked={allPicked} disabled={!visibleDrafts.length}
                    onChange={() => setPicked(allPicked ? new Set() : new Set(visibleDrafts.map(d => d.id)))} /></th>}
                  <HeadingCell label="Entry No" colKey="entry_no" sort={entrySort} filterValue={colFilters.entry_no ?? ''} onFilter={setColFilter} inputWidth="w-16" thClass={th} />
                  <HeadingCell label="Date" colKey="opening_date" sort={entrySort} filterValue={colFilters.opening_date ?? ''} onFilter={setColFilter} inputWidth="w-16" thClass={th} />
                  {tab === 'BANK' && (<>
                    <HeadingCell label="Bank Account" colKey="account_name" sort={entrySort} filterValue={colFilters.account_name ?? ''} onFilter={setColFilter} options={entryOpts.account_name} optionWidth="max-w-[82px]" thClass={th} />
                    <HeadingCell label="Remarks" colKey="remarks" sort={entrySort} filterValue={colFilters.remarks ?? ''} onFilter={setColFilter} inputWidth="w-20" thClass={th} />
                    <HeadingCell label="Opening Balance" colKey="amount" sort={entrySort} filterValue={colFilters.amount ?? ''} onFilter={setColFilter} align="right" inputWidth="w-16" thClass={thR} />
                  </>)}
                  {tab === 'PARTY' && (<>
                    <HeadingCell label="Company" colKey="party_name" sort={entrySort} filterValue={colFilters.party_name ?? ''} onFilter={setColFilter} inputWidth="w-24" thClass={th} />
                    <HeadingCell label="Balance Type" colKey="balance_type" sort={entrySort} filterValue={colFilters.balance_type ?? ''} onFilter={setColFilter} options={entryOpts.balance_type} optionWidth="max-w-[78px]" thClass={th} />
                    <HeadingCell label="Invoice Ref" colKey="invoice_ref" sort={entrySort} filterValue={colFilters.invoice_ref ?? ''} onFilter={setColFilter} inputWidth="w-16" thClass={th} />
                    <HeadingCell label="Due" colKey="due_date" sort={entrySort} filterValue={colFilters.due_date ?? ''} onFilter={setColFilter} inputWidth="w-16" thClass={th} />
                    <HeadingCell label="Amount" colKey="amount" sort={entrySort} filterValue={colFilters.amount ?? ''} onFilter={setColFilter} align="right" inputWidth="w-16" thClass={thR} />
                  </>)}
                  {tab === 'STOCK' && (<>
                    <HeadingCell label="Product" colKey="item_name" sort={entrySort} filterValue={colFilters.item_name ?? ''} onFilter={setColFilter} inputWidth="w-24" thClass={th} />
                    <HeadingCell label="Warehouse" colKey="warehouse_name" sort={entrySort} filterValue={colFilters.warehouse_name ?? ''} onFilter={setColFilter} options={entryOpts.warehouse_name} optionWidth="max-w-[82px]" thClass={th} />
                    <HeadingCell label="Qty" colKey="qty" sort={entrySort} filterValue={colFilters.qty ?? ''} onFilter={setColFilter} align="right" inputWidth="w-14" thClass={thR} />
                    <HeadingCell label="Unit Cost" colKey="unit_cost" sort={entrySort} filterValue={colFilters.unit_cost ?? ''} onFilter={setColFilter} align="right" inputWidth="w-14" thClass={thR} />
                    <HeadingCell label="Value" colKey="amount" sort={entrySort} filterValue={colFilters.amount ?? ''} onFilter={setColFilter} align="right" inputWidth="w-16" thClass={thR} />
                  </>)}
                  <HeadingCell label="Status" colKey="status" sort={entrySort} filterValue={colFilters.status ?? ''} onFilter={setColFilter} options={entryOpts.status} optionWidth="max-w-[78px]" thClass={th} />
                  <ActionsHead thClass={thR} hasFilters={hasColFilters} onClear={clearFilters} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEntries.length === 0 && (
                  <tr><td colSpan={entryColSpan} className="px-4 py-8 text-center text-xs text-slate-500">
                    No opening entries match the active column filters.{' '}
                    <button type="button" onClick={clearFilters} className="font-semibold text-orange-600 hover:underline">Clear filters</button>
                  </td></tr>
                )}
                {filteredEntries.map(e => (
                  <tr key={e.id} className="hover:bg-orange-50/40">
                    {canManage && <td className={td}>{e.status === 'Draft' && <input type="checkbox" aria-label={`Select ${e.entry_no}`} checked={picked.has(e.id)} onChange={() => togglePick(e.id)} />}</td>}
                    <td className={`${td} font-mono text-xs`}>{e.entry_no}</td>
                    <td className={`${td} whitespace-nowrap`}>{formatDate(e.opening_date)}</td>
                    {tab === 'BANK' && (<><td className={`${td} font-semibold`}>{e.account_name}</td><td className={`${td} text-slate-500`}>{e.remarks}</td>
                      <td className={`${tdR} font-semibold`}>{money(e.amount)} <span className="text-[10px] text-slate-400">{drCr(e.side)}</span></td></>)}
                    {tab === 'PARTY' && (<><td className={`${td} font-semibold`}>{e.party_name}{e.party_code && <span className="ml-1.5 text-[11px] font-normal text-slate-400">{e.party_code}</span>}</td>
                      <td className={td}>{e.balance_type}</td><td className={td}>{e.invoice_ref ?? ''}</td><td className={`${td} whitespace-nowrap`}>{e.due_date ? formatDate(e.due_date) : ''}</td>
                      <td className={`${tdR} font-semibold`}>{money(e.amount)} <span className="text-[10px] text-slate-400">{drCr(e.side)}</span></td></>)}
                    {tab === 'STOCK' && (<><td className={`${td} font-semibold`}>{e.item_name}{e.item_code && <span className="ml-1.5 text-[11px] font-normal text-slate-400">{e.item_code}</span>}</td>
                      <td className={td}>{e.warehouse_name ?? <span className="text-slate-400">Item default</span>}</td>
                      <td className={tdR}>{num(e.qty).toLocaleString('en-IN')} <span className="text-[10px] text-slate-400">{e.unit}</span></td>
                      <td className={tdR}>{money(num(e.unit_cost))}</td><td className={`${tdR} font-semibold`}>{money(e.amount)}</td></>)}
                    <td className={td}><Badge variant={statusVariant(e.status)} dot>{e.status}</Badge>{e.status === 'Reversed' && e.reverse_reason && <p className="text-[10px] text-slate-400 mt-0.5 max-w-[10rem] truncate" title={e.reverse_reason}>{e.reverse_reason}</p>}</td>
                    <td className={`${td} text-right whitespace-nowrap`}>
                      <div className="inline-flex items-center gap-1">
                        {e.status === 'Draft' && <>
                          <IconBtn label="Edit draft" onClick={() => setForm({ type: e.entry_type, entry: e })}><Pencil size={14} /></IconBtn>
                          <IconBtn label="Validate & preview" onClick={() => openPreview([e.id])}><Eye size={14} /></IconBtn>
                          <IconBtn label="Delete draft" danger onClick={() => remove(e)}><Trash2 size={14} /></IconBtn></>}
                        {e.status !== 'Draft' && <IconBtn label={e.entry_type === 'STOCK' ? 'View stock' : 'View ledger'} onClick={() => viewIn(e)}><Eye size={14} /></IconBtn>}
                        {e.status === 'Posted' && canManage && <>
                          <IconBtn label="Edit posted entry (reverse & re-enter)" onClick={() => setReversing({ entry: e, afterReverse: 'edit' })}><Pencil size={14} /></IconBtn>
                          <IconBtn label="Delete (reverse) posted entry" danger onClick={() => setReversing({ entry: e })}><Trash2 size={14} /></IconBtn></>}
                        {e.status === 'Reversed' && canManage && <>
                          <IconBtn label="Re-enter replacement opening" onClick={() => setForm({ type: e.entry_type, prefill: entryToDraft(e) })}><Pencil size={14} /></IconBtn>
                          <IconBtn label="Already reversed" danger disabled onClick={() => {}}><Trash2 size={14} /></IconBtn></>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {form && lookups && (
        <EntryForm key={form.entry?.id ?? `new-${form.type}-${form.prefill?.account_id ?? form.prefill?.party_id ?? form.prefill?.item_id ?? ''}`} type={form.type} entry={form.entry} prefill={form.prefill} lookups={lookups} fyDefault={todayISO()}
          onClose={() => setForm(null)} onSaved={async (msg) => { setForm(null); say('ok', msg); await load(); }} />
      )}
      {bulk && lookups && (
        <BulkStock rows={bulk} lookups={lookups} onClose={() => setBulk(null)} onSaved={async (n) => { setBulk(null); say('ok', `${n} opening stock draft${n === 1 ? '' : 's'} saved. Select them and post.`); await load(); }} />
      )}
      {preview && (
        <PreviewModal data={preview} busy={previewBusy} canPost={canManage} onClose={() => setPreview(null)} onPost={doPost} />
      )}
      {reversing && (
        <ReverseModal entry={reversing.entry} onClose={() => setReversing(null)}
          onDone={async () => {
            const target = reversing;
            setReversing(null);
            await load();
            if (target.afterReverse === 'edit') {
              say('ok', 'Original entry reversed. Save and post your updated opening.');
              setForm({ type: target.entry.entry_type, prefill: entryToDraft(target.entry) });
            } else {
              say('ok', 'Entry reversed. You can now enter a corrected one.');
            }
          }} />
      )}
    </div>
  );
}

function masterStatus(m: { entries: OpeningEntry[] }): string {
  return m.entries.some(e => e.status === 'Draft') ? 'Draft' : m.entries.length ? 'Posted' : 'No opening';
}

function matchText(haystack: string, query?: string): boolean {
  if (!query) return true;
  return haystack.toLowerCase().includes(query.trim().toLowerCase());
}

function uniqueOpts(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v && v.trim())))).sort((a, b) => a.localeCompare(b));
}

function parseDisplayNumber(s: string): number {
  const cleaned = s.replace(/[^0-9.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? (/\bCr\b/i.test(s) ? -n : n) : 0;
}

function entryToDraft(e: OpeningEntry): OpeningDraft {
  return {
    entry_type: e.entry_type, opening_date: e.opening_date, account_id: e.account_id ?? '', party_id: e.party_id ?? '', party_name: e.party_name ?? '',
    party_code: e.party_code ?? '', balance_type: e.balance_type ?? '', invoice_ref: e.invoice_ref ?? '', due_date: e.due_date ?? '',
    item_kind: e.item_kind ?? undefined, item_id: e.item_id ?? '', warehouse_id: e.warehouse_id ?? '', qty: e.qty ?? '', unit_cost: e.unit_cost ?? '',
    amount: e.amount, currency: e.currency, remarks: e.remarks ?? '',
  };
}

function HeadingCell<T>({ label, colKey, sort, filterValue, onFilter, options, align = 'left', placeholder, inputWidth = 'w-16', optionWidth = 'max-w-[78px]', thClass }: {
  label: string;
  colKey: string;
  sort: Parameters<typeof SortLabel<T>>[0]['sort'];
  filterValue: string;
  onFilter: (key: string, val: string) => void;
  options?: string[];
  align?: 'left' | 'right';
  placeholder?: string;
  inputWidth?: string;
  optionWidth?: string;
  thClass: string;
}) {
  return (
    <th className={`${thClass} py-1.5 align-middle`}>
      <div className={`inline-flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
        <SortLabel label={label} col={colKey} sort={sort} className="inline-flex items-center gap-1 uppercase tracking-widest text-[10px] font-bold text-slate-500 hover:text-orange-600 cursor-pointer shrink-0" />
        {options ? (
          <select aria-label={`Filter ${label}`} value={filterValue} onClick={e => e.stopPropagation()} onChange={e => onFilter(colKey, e.target.value)}
            className={`h-5 ${optionWidth} rounded border bg-white px-1 text-[10px] font-semibold normal-case tracking-normal text-slate-800 focus:outline-none ${filterValue ? 'border-orange-500 ring-1 ring-orange-400' : 'border-slate-300'}`}>
            <option value="">All</option>
            {options.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        ) : (
          <input aria-label={`Filter ${label}`} value={filterValue} placeholder={placeholder ?? 'Filter…'} onClick={e => e.stopPropagation()} onChange={e => onFilter(colKey, e.target.value)}
            className={`h-5 ${inputWidth} rounded border bg-white px-1.5 text-[10px] font-medium normal-case tracking-normal text-slate-800 placeholder:text-slate-400 focus:outline-none ${filterValue ? 'border-orange-500 ring-1 ring-orange-400' : 'border-slate-300'}`} />
        )}
      </div>
    </th>
  );
}

function ActionsHead({ thClass, hasFilters, onClear }: { thClass: string; hasFilters: boolean; onClear: () => void }) {
  return (
    <th className={`${thClass} py-1.5 align-middle`}>
      <div className="inline-flex items-center justify-end gap-1.5">
        <span>Actions</span>
        {hasFilters && (
          <button type="button" onClick={onClear} title="Clear column filters"
            className="inline-flex items-center gap-0.5 rounded border border-orange-300 bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-orange-700 hover:bg-orange-100">
            <X size={10} />Clear
          </button>
        )}
      </div>
    </th>
  );
}

function IconBtn({ label, onClick, children, danger, disabled }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick}
      className={`h-7 w-7 inline-flex items-center justify-center rounded-md border border-transparent disabled:opacity-35 disabled:pointer-events-none ${danger ? 'text-red-500 hover:bg-red-50 hover:border-red-200' : 'text-slate-500 hover:bg-slate-100 hover:border-slate-200'}`}>{children}</button>
  );
}

// ------------------------------------------------------------------------------------------------
// Add / edit one draft
// ------------------------------------------------------------------------------------------------
function EntryForm({ type: typeProp, entry, prefill, lookups, fyDefault, onClose, onSaved }: {
  type: OpeningType; entry?: OpeningEntry; prefill?: OpeningDraft; lookups: OpeningLookups; fyDefault: string; onClose: () => void; onSaved: (msg: string) => void | Promise<void>;
}) {
  const [type, setType] = useState<OpeningType>(entry?.entry_type ?? typeProp);
  const [f, setF] = useState<OpeningDraft>(() => entry ? {
    id: entry.id, entry_type: entry.entry_type, opening_date: entry.opening_date, account_id: entry.account_id ?? '', party_id: entry.party_id ?? '', party_name: entry.party_name ?? '',
    party_code: entry.party_code ?? '', balance_type: entry.balance_type ?? '', invoice_ref: entry.invoice_ref ?? '', due_date: entry.due_date ?? '',
    item_kind: entry.item_kind ?? undefined, item_id: entry.item_id ?? '', warehouse_id: entry.warehouse_id ?? '', qty: entry.qty ?? '', unit_cost: entry.unit_cost ?? '',
    amount: entry.amount, currency: entry.currency, remarks: entry.remarks ?? '',
  } : {
    entry_type: typeProp, opening_date: fyDefault, currency: 'INR', account_id: '', party_id: '', party_name: '', party_code: '', invoice_ref: '', due_date: '', item_id: '', warehouse_id: '', qty: '', unit_cost: '', amount: '', remarks: '',
    balance_type: typeProp === 'BANK' ? 'Debit' : typeProp === 'CUSTOMER' ? 'Receivable' : typeProp === 'SUPPLIER' ? 'Payable' : '',
  });
  // opened from a row of the full list: the bank / party / item is already chosen
  useEffect(() => { if (prefill && !entry) setF(p => ({ ...p, ...prefill })); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof OpeningDraft, v: string) => setF(p => ({ ...p, [k]: v }));
  // every company (customers and suppliers together, one entry per name); a company in both lists can be entered either way
  const companies = useMemo(() => {
    const m = new Map<string, { key: string; name: string; cust?: { id: string }; sup?: { id: string; code: string | null } }>();
    for (const c of lookups.customers) { const k = c.name.trim().toLowerCase(); m.set(k, { ...(m.get(k) ?? { key: k, name: c.name }), cust: { id: c.id } }); }
    for (const sp of lookups.suppliers) { const k = sp.name.trim().toLowerCase(); m.set(k, { ...(m.get(k) ?? { key: k, name: sp.name }), sup: { id: sp.id, code: sp.code } }); }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [lookups]);
  const company = companies.find(c => c.key === (f.party_name ?? '').trim().toLowerCase());
  const itemKey = f.item_id ? `${f.item_kind}:${f.item_id}` : '';
  const item = lookups.items.find(i => `${i.kind}:${i.id}` === itemKey);

  const asType = (t: 'CUSTOMER' | 'SUPPLIER', c?: typeof company) => {
    setType(t);
    setF(prev => ({ ...prev, entry_type: t, balance_type: t === 'CUSTOMER' ? 'Receivable' : 'Payable', amount: prev.amount,
      party_id: c ? (t === 'CUSTOMER' ? c.cust?.id : c.sup?.id) ?? '' : prev.party_id, party_code: t === 'SUPPLIER' ? (c?.sup?.code ?? '') : '' }));
  };
  const pickParty = (key: string) => {
    const c = companies.find(x => x.key === key);
    if (!c) { setF(prev => ({ ...prev, party_id: '', party_name: '', party_code: '' })); return; }
    const t: 'CUSTOMER' | 'SUPPLIER' = type === 'SUPPLIER' && c.sup ? 'SUPPLIER' : c.cust ? 'CUSTOMER' : 'SUPPLIER';
    setType(t);
    setF(prev => ({ ...prev, entry_type: t, party_name: c.name, party_id: (t === 'CUSTOMER' ? c.cust?.id : c.sup?.id) ?? '', party_code: t === 'SUPPLIER' ? (c.sup?.code ?? '') : '',
      balance_type: t === 'CUSTOMER' ? 'Receivable' : 'Payable' }));
  };
  const pickItem = (key: string) => {
    const it = lookups.items.find(i => `${i.kind}:${i.id}` === key);
    setF(prev => ({ ...prev, item_kind: it?.kind, item_id: it?.id ?? '', unit_cost: it && !num(prev.unit_cost) ? it.rate : prev.unit_cost }));
  };

  // Two boxes instead of a "Balance Type" dropdown + amount: the box you type in decides the side.
  // Same direction as Bank Entry / Petty Cash — Credit = money in (the normal positive balance),
  // Debit = money out (overdraft, we owe the party). The server derives side (Dr/Cr) from balance_type.
  const moneyInType = type === 'BANK' ? 'Debit' : type === 'CUSTOMER' ? 'Receivable' : 'Debit Balance';
  const moneyOutType = type === 'BANK' ? 'Overdraft' : type === 'CUSTOMER' ? 'Credit Balance' : 'Payable';
  const bt = (f.balance_type || '').toLowerCase();
  const isMoneyIn = type === 'BANK' ? bt !== 'overdraft' && bt !== 'credit'
    : type === 'CUSTOMER' ? !bt.startsWith('credit')
    : bt.startsWith('debit');                      // supplier: 'Debit Balance' = they owe us = money in
  const amount = f.amount === undefined || f.amount === null ? '' : String(f.amount);
  const debitVal = amount && !isMoneyIn ? amount : '';
  const creditVal = amount && isMoneyIn ? amount : '';
  // Mutually exclusive rule matching Bank Entry: entering Debit disables Credit and vice versa.
  const hasOut = Boolean(debitVal.trim());
  const hasIn = Boolean(creditVal.trim());
  const setBox = (side: 'money-in' | 'money-out', rawVal: string) => {
    if (side === 'money-out' && hasIn) return;
    if (side === 'money-in' && hasOut) return;
    const clean = rawVal.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setF(p => ({ ...p, balance_type: side === 'money-in' ? moneyInType : moneyOutType, amount: clean }));
  };
  const sideFields = (
    <div className="sm:col-span-2 grid gap-x-4 sm:grid-cols-2">
      <div className={hasIn ? 'opacity-55' : ''}>
        <FormField label="Debit (Money Out)" hint="Enter in one box — typing locks the other">
          <div className="relative">
            <input
              aria-label="Debit (Money Out)"
              inputMode="decimal"
              placeholder="0.00"
              disabled={hasIn}
              className={`${inputClass} ${hasIn ? '!bg-slate-100 !text-slate-400 cursor-not-allowed border-slate-200' : debitVal ? 'pr-7' : ''}`}
              value={debitVal}
              onChange={e => setBox('money-out', e.target.value)}
            />
            {debitVal && (
              <button
                type="button"
                onClick={() => setBox('money-out', '')}
                aria-label="Clear debit"
                title="Clear"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs px-1 font-bold cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </FormField>
      </div>
      <div className={hasOut ? 'opacity-55' : ''}>
        <FormField label="Credit (Money In)">
          <div className="relative">
            <input
              aria-label="Credit (Money In)"
              inputMode="decimal"
              placeholder="0.00"
              disabled={hasOut}
              className={`${inputClass} ${hasOut ? '!bg-slate-100 !text-slate-400 cursor-not-allowed border-slate-200' : creditVal ? 'pr-7' : ''}`}
              value={creditVal}
              onChange={e => setBox('money-in', e.target.value)}
            />
            {creditVal && (
              <button
                type="button"
                onClick={() => setBox('money-in', '')}
                aria-label="Clear credit"
                title="Clear"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs px-1 font-bold cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </FormField>
      </div>
    </div>
  );

  const save = async () => {
    if (type !== 'STOCK' && num(f.amount) <= 0) { setErr('Enter the opening balance in the debit (money out) or credit (money in) box.'); return; }
    setBusy(true); setErr('');
    try {
      const res = await openingApi.save({ ...f, entry_type: type });
      await onSaved(`${res.entry_no} saved as draft.`);
    } catch (e) { setErr(errText(e)); setBusy(false); }
  };

  const title = `${entry ? 'Edit' : 'Add'} ${type === 'BANK' ? 'bank opening balance' : type === 'STOCK' ? 'opening stock' : type === 'CUSTOMER' ? 'customer opening balance' : 'supplier opening balance'}`;
  return (
    <Modal open onClose={onClose} title={title} subtitle={entry ? entry.entry_no : 'Saved as a draft; it counts only after it is posted'} size="lg" isDirty
      footer={<div className="flex items-center justify-end gap-2 w-full">
        {err && <span className="mr-auto text-xs font-semibold text-red-600">{err}</span>}
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save Draft'}</Button></div>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
        {type === 'STOCK' && <FormField label="Company"><input className={`${inputClass} bg-slate-50`} readOnly value={lookups.company?.company_name ?? ''} /></FormField>}
        <FormField label="Opening Date" required><input type="date" className={inputClass} value={f.opening_date ?? ''} max={todayISO()} onChange={e => set('opening_date', e.target.value)} /></FormField>

        {type === 'BANK' && (
          <FormField label="Bank Account" required>
            <select className={inputClass} value={f.account_id ?? ''} onChange={e => set('account_id', e.target.value)}>
              <option value="">Select account…</option>
              {lookups.banks.map(b => <option key={b.id} value={b.id}>{b.name} ({b.type})</option>)}
            </select></FormField>
        )}

        {(type === 'CUSTOMER' || type === 'SUPPLIER') && (<>
          <FormField label="Company" required>
            <select className={inputClass} value={company?.key ?? ''} onChange={e => pickParty(e.target.value)}>
              <option value="">Select company…</option>
              {companies.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
            </select></FormField>
          {company?.cust && company?.sup ? (
            <FormField label="Enter this balance as">
              <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden bg-white" role="group">
                {(['CUSTOMER', 'SUPPLIER'] as const).map(t => (
                  <button key={t} type="button" onClick={() => asType(t, company)} className={`h-9 px-3 text-[13px] font-semibold ${type === t ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{t === 'CUSTOMER' ? 'Receivable (they owe us)' : 'Payable (we owe them)'}</button>
                ))}
              </div>
            </FormField>
          ) : <div />}
          {sideFields}
          <FormField label="Invoice Reference" hint="Optional. Enter one entry per bill to track bills separately"><input className={inputClass} value={f.invoice_ref ?? ''} onChange={e => set('invoice_ref', e.target.value)} /></FormField>
          <FormField label="Due Date"><input type="date" className={inputClass} value={f.due_date ?? ''} onChange={e => set('due_date', e.target.value)} /></FormField>
        </>)}

        {type === 'BANK' && sideFields}

        {type === 'STOCK' && (<>
          <FormField label="Warehouse" hint="Leave blank to use the product's own warehouse">
            <select className={inputClass} value={f.warehouse_id ?? ''} onChange={e => set('warehouse_id', e.target.value)}>
              <option value="">Product default</option>
              {lookups.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select></FormField>
          <FormField label="Product" required>
            <select className={inputClass} value={itemKey} onChange={e => pickItem(e.target.value)}>
              <option value="">Select product…</option>
              {lookups.items.map(i => <option key={`${i.kind}:${i.id}`} value={`${i.kind}:${i.id}`}>{i.code ? `${i.code} - ` : ''}{i.name} ({i.kind === 'RAW' ? 'Material' : 'Part'})</option>)}
            </select></FormField>
          <FormField label="Product Code / SKU"><input className={`${inputClass} bg-slate-50`} readOnly value={item?.code ?? ''} /></FormField>
          <FormField label="Unit of Measurement"><input className={`${inputClass} bg-slate-50`} readOnly value={item?.unit ?? ''} /></FormField>
          <FormField label="Opening Quantity" required hint={item && item.stock > 0 ? `Already in stock: ${item.stock}. This is added to it` : undefined}>
            <input type="number" min="0" step="0.001" className={inputClass} value={f.qty ?? ''} onChange={e => set('qty', e.target.value)} /></FormField>
          <FormField label="Unit Cost" required><input type="number" min="0" step="0.01" className={inputClass} value={f.unit_cost ?? ''} onChange={e => set('unit_cost', e.target.value)} /></FormField>
          <FormField label="Total Opening Value"><input className={`${inputClass} bg-slate-50 font-bold`} readOnly value={money(stockValue(f.qty, f.unit_cost))} /></FormField>
        </>)}

        {type === 'STOCK' && <FormField label="Currency"><select className={inputClass} value={f.currency ?? 'INR'} onChange={e => set('currency', e.target.value)}><option>INR</option></select></FormField>}
        {type === 'STOCK' && <div className="sm:col-span-2"><FormField label="Remarks"><textarea rows={2} className={inputClass} value={f.remarks ?? ''} onChange={e => set('remarks', e.target.value)} /></FormField></div>}
        {type === 'STOCK' && <FormField label="Status"><input className={`${inputClass} bg-slate-50`} readOnly value={entry?.status ?? 'Draft'} /></FormField>}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------------
// Bulk opening stock (table form, also receives the CSV import)
// ------------------------------------------------------------------------------------------------
interface BulkRow { key: string; itemRef: string; warehouse: string; qty: string; cost: string; date: string; remarks: string; error: string }
let bulkSeq = 0;
const newBulkRow = (): BulkRow => ({ key: `new-${++bulkSeq}`, itemRef: '', warehouse: '', qty: '', cost: '', date: '', remarks: '', error: '' });

function BulkStock({ rows: initial, lookups, onClose, onSaved }: { rows: BulkRow[]; lookups: OpeningLookups; onClose: () => void; onSaved: (n: number) => void | Promise<void> }) {
  const [rows, setRows] = useState<BulkRow[]>(initial);
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const patch = (key: string, p: Partial<BulkRow>) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...p, error: '' } : r)));
  const total = rows.reduce((n, r) => n + stockValue(r.qty, r.cost), 0);

  const save = async () => {
    setBusy(true);
    let saved = 0;
    const left: BulkRow[] = [];
    for (const r of rows) {
      if (!r.itemRef && !num(r.qty) && !r.cost) continue;   // an untouched row
      const [kind, ...idParts] = r.itemRef.split(':');
      try {
        await openingApi.save({
          entry_type: 'STOCK', opening_date: r.date || date, item_kind: kind as 'RAW' | 'PART', item_id: idParts.join(':'), warehouse_id: r.warehouse,
          qty: r.qty, unit_cost: r.cost, remarks: r.remarks, currency: 'INR',
        });
        saved++;
      } catch (e) { left.push({ ...r, error: errText(e) }); }
    }
    setBusy(false);
    if (!left.length) { await onSaved(saved); return; }
    setRows(left);   // only the rows that could not be saved stay, each with its reason
  };

  return (
    <Modal open onClose={onClose} title="Bulk opening stock" subtitle="One row per product and warehouse. Rows are saved as drafts; post them afterwards." size="2xl" isDirty
      footer={<div className="flex items-center justify-between gap-2 w-full">
        <span className="text-sm font-semibold text-slate-600">Total value {money(total)}</span>
        <div className="flex gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save as Drafts'}</Button></div></div>}>
      <div className="mb-3 flex items-center gap-2"><label className="text-xs font-semibold text-slate-600">Opening date for rows without one</label>
        <input type="date" className={`${inputClass} !w-44`} value={date} max={todayISO()} onChange={e => setDate(e.target.value)} /></div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead><tr><th className={th}>Product</th><th className={th}>Warehouse</th><th className={thR}>Quantity</th><th className={thR}>Unit cost</th><th className={thR}>Value</th><th className={th}>Remarks</th><th /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(r => (
              <tr key={r.key} className="align-top">
                <td className="py-1.5 pr-2 min-w-[14rem]">
                  <select aria-label="Product" className={`${inputClass} !py-1.5`} value={r.itemRef} onChange={e => {
                    const it = lookups.items.find(i => `${i.kind}:${i.id}` === e.target.value);
                    patch(r.key, { itemRef: e.target.value, cost: r.cost || (it ? String(it.rate) : '') });
                  }}>
                    <option value="">Select product…</option>
                    {lookups.items.map(i => <option key={`${i.kind}:${i.id}`} value={`${i.kind}:${i.id}`}>{i.code ? `${i.code} - ` : ''}{i.name}</option>)}
                  </select>
                  {r.error && <p className="mt-0.5 text-[11px] font-semibold text-red-600">{r.error}</p>}
                </td>
                <td className="py-1.5 pr-2 min-w-[9rem]"><select aria-label="Warehouse" className={`${inputClass} !py-1.5`} value={r.warehouse} onChange={e => patch(r.key, { warehouse: e.target.value })}>
                  <option value="">Product default</option>{lookups.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></td>
                <td className="py-1.5 pr-2"><input aria-label="Quantity" type="number" min="0" step="0.001" className={`${inputClass} !py-1.5 !w-24 text-right`} value={r.qty} onChange={e => patch(r.key, { qty: e.target.value })} /></td>
                <td className="py-1.5 pr-2"><input aria-label="Unit cost" type="number" min="0" step="0.01" className={`${inputClass} !py-1.5 !w-24 text-right`} value={r.cost} onChange={e => patch(r.key, { cost: e.target.value })} /></td>
                <td className={`${tdR} font-semibold`}>{money(stockValue(r.qty, r.cost))}</td>
                <td className="py-1.5 pr-2"><input aria-label="Remarks" className={`${inputClass} !py-1.5`} value={r.remarks} onChange={e => patch(r.key, { remarks: e.target.value })} /></td>
                <td className="py-1.5"><IconBtn label="Remove row" danger onClick={() => setRows(rs => rs.length > 1 ? rs.filter(x => x.key !== r.key) : [newBulkRow()])}><Trash2 size={14} /></IconBtn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2"><Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setRows(rs => [...rs, newBulkRow()])}>Add row</Button></div>
      <p className="mt-3 text-[11px] text-slate-500">CSV columns: product (code or name), warehouse, quantity, unit cost, date, remarks. Columns are found by their heading, in any order.</p>
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------------
// Validate & preview, then post
// ------------------------------------------------------------------------------------------------
function PreviewModal({ data, busy, canPost, onClose, onPost }: { data: OpeningPreview; busy: boolean; canPost: boolean; onClose: () => void; onPost: () => void }) {
  const postable = data.entries.filter(e => e.status === 'Draft');
  const bad = data.entries.filter(e => e.issues.length).length;
  return (
    <Modal open onClose={onClose} title="Validate & preview" subtitle={bad ? `${bad} of ${data.entries.length} entries need fixing` : `${postable.length} entr${postable.length === 1 ? 'y' : 'ies'} ready to post`} size="xl"
      footer={<div className="flex items-center justify-end gap-2 w-full">
        {!canPost && <span className="mr-auto text-xs text-slate-500">Only administrators can post.</span>}
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button variant="success" icon={<CheckCircle2 size={14} />} disabled={busy || !data.ok || !canPost} onClick={onPost}>{busy ? 'Posting…' : `Confirm & Post ${postable.length}`}</Button></div>}>
      <p className="mb-3 text-xs text-slate-500">Posting writes the journal entries and stock movements in one step: if anything fails, nothing is posted. Posted entries cannot be edited, only reversed.</p>
      <div className="space-y-3">
        {data.entries.map(e => (
          <div key={e.id} className={`rounded-lg border p-3 ${e.issues.length ? 'border-red-200 bg-red-50/50' : 'border-slate-200 bg-white'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-800">{e.label} <span className="ml-1 text-[11px] font-mono font-normal text-slate-400">{e.entry_no} · {e.entry_type}</span></p>
              <p className="text-sm font-bold tabular-nums">{money(num(e.amount))}</p>
            </div>
            {e.issues.map(i => <p key={i} className="mt-1 text-xs font-semibold text-red-600">✕ {i}</p>)}
            {e.warnings.map(w => <p key={w} className="mt-1 text-xs text-amber-700">⚠ {w}</p>)}
            {!!e.lines.length && (
              <table className="mt-2 w-full text-xs"><thead><tr className="text-slate-400"><th className="text-left font-semibold py-1">Account</th><th className="text-right font-semibold">Debit</th><th className="text-right font-semibold">Credit</th></tr></thead>
                <tbody>{e.lines.map((l, i) => (
                  <tr key={i} className="border-t border-slate-100"><td className="py-1">{l.account}{l.party && <span className="text-slate-400"> · {l.party}</span>}</td>
                    <td className="text-right tabular-nums">{num(l.debit) ? money(num(l.debit)) : ''}</td><td className="text-right tabular-nums">{num(l.credit) ? money(num(l.credit)) : ''}</td></tr>))}</tbody></table>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

function ReverseModal({ entry, onClose, onDone }: { entry: OpeningEntry; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    try { await openingApi.reverse(entry.id, reason); await onDone(); }
    catch (e) { setErr(errText(e)); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Reverse ${entry.entry_no}`} subtitle="Writes an opposite entry; the original stays for the audit trail" size="md"
      footer={<div className="flex items-center justify-end gap-2 w-full">{err && <span className="mr-auto text-xs font-semibold text-red-600">{err}</span>}
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" icon={<Undo2 size={14} />} disabled={busy || !reason.trim()} onClick={go}>{busy ? 'Reversing…' : 'Reverse entry'}</Button></div>}>
      <p className="text-sm text-slate-600 mb-3">
        {entry.entry_type === 'STOCK' ? `This takes ${num(entry.qty)} ${entry.unit ?? ''} of ${entry.item_name} back out of stock (it fails if that stock has already been used).`
          : `This reverses the ${money(entry.amount)} opening balance of ${entry.party_name ?? entry.account_name}.`} Afterwards you can enter a corrected opening entry.
      </p>
      <FormField label="Reason" required><textarea rows={3} className={inputClass} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this being reversed?" /></FormField>
    </Modal>
  );
}
