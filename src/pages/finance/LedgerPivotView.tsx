import { useMemo, useState } from 'react';
import {
  ChevronDown, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Building2,
  Layers, Calendar, Search, FileSpreadsheet, Eye, ArrowRight, ChevronsUpDown,
  Filter, CheckCircle2, AlertCircle
} from 'lucide-react';
import { type LedgerLine, type Settlement, dmy, drCr, nameKey } from '@/lib/ledgerDashboard';
export type PivotGroupBy = 'party' | 'particulars' | 'month';
import { formatINR } from '@/lib/format';
import { exportCsv } from '@/lib/reportExport';

const money = (n: number) => (n ? formatINR(n, { decimals: 'always', symbol: false }) : '0.00');
const btn = 'inline-flex items-center justify-center gap-1.5 h-8 px-3 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg shadow-2xs hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98] transition disabled:opacity-40';
const btnPrimary = 'inline-flex items-center justify-center gap-1.5 h-8 px-3.5 text-xs font-bold text-white bg-gradient-to-b from-orange-500 to-orange-600 rounded-lg shadow-xs hover:from-orange-500 hover:to-orange-700 active:scale-[0.98] transition disabled:opacity-40';
const inp = 'h-8 px-2.5 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15';

export interface PivotItem {
  key: string;
  label: string;
  ledgerType: string;
  entries: number;
  debit: number;
  credit: number;
  balance: number;
  lines: LedgerLine[];
}

export type PivotFilterType = 'all' | 'customer' | 'supplier' | 'nonzero';

export interface LedgerPivotViewProps {
  lines: LedgerLine[];
  settled: Map<string, Settlement>;
  statusText: (id: string) => string;
  onSelectGroup: (group: { type: PivotGroupBy; value: string; label: string }) => void;
  effFrom?: string;
  effTo?: string;
  companyName?: string;
}

export function LedgerPivotView({
  lines,
  settled,
  statusText,
  onSelectGroup,
  effFrom = '',
  effTo = '',
  companyName = 'Argus Technologies',
}: LedgerPivotViewProps) {
  const [groupBy, setGroupBy] = useState<PivotGroupBy>('party');
  const [filterType, setFilterType] = useState<PivotFilterType>('all');
  const [search, setSearch] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<'label' | 'entries' | 'debit' | 'credit' | 'balance'>('balance');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Build aggregated Pivot Groups
  const rawGroups = useMemo(() => {
    const map = new Map<string, {
      key: string;
      label: string;
      ledgerType: string;
      debit: number;
      credit: number;
      lines: LedgerLine[];
    }>();

    for (const l of lines) {
      let key = '';
      let label = '';
      let type = l.ledgerType || 'Other';

      if (groupBy === 'party') {
        key = nameKey(l.party) || '(no party)';
        label = l.party.trim() || '(no party)';
      } else if (groupBy === 'particulars') {
        label = (l.particulars || 'Other').trim();
        key = label.toLowerCase();
        type = l.source || 'Category';
      } else if (groupBy === 'month') {
        key = l.date ? l.date.slice(0, 7) : 'Unknown';
        if (key !== 'Unknown') {
          const [yy, mm] = key.split('-');
          const d = new Date(Number(yy), Number(mm) - 1, 1);
          label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        } else {
          label = 'Unknown Date';
        }
        type = 'Period';
      }

      const item = map.get(key) ?? {
        key,
        label,
        ledgerType: type,
        debit: 0,
        credit: 0,
        lines: [],
      };
      item.debit = Math.round((item.debit + l.debit) * 100) / 100;
      item.credit = Math.round((item.credit + l.credit) * 100) / 100;
      if (!item.ledgerType && type) item.ledgerType = type;
      item.lines.push(l);
      map.set(key, item);
    }

    return Array.from(map.values()).map(g => ({
      ...g,
      balance: Math.round((g.debit - g.credit) * 100) / 100,
      entries: g.lines.length,
    }));
  }, [lines, groupBy]);

  // Count metrics for quick filter chips
  const counts = useMemo(() => {
    let cust = 0;
    let supp = 0;
    let nonzero = 0;
    for (const g of rawGroups) {
      if (g.ledgerType.toLowerCase() === 'customer' || g.balance > 0.005) cust++;
      if (g.ledgerType.toLowerCase() === 'supplier' || g.balance < -0.005) supp++;
      if (Math.abs(g.balance) > 0.005) nonzero++;
    }
    return { all: rawGroups.length, customer: cust, supplier: supp, nonzero };
  }, [rawGroups]);

  // Filtered and Sorted Pivot rows
  const sortedGroups = useMemo(() => {
    let list = rawGroups;

    // Filter type
    if (filterType === 'customer') {
      list = list.filter(g => g.ledgerType.toLowerCase() === 'customer' || g.balance > 0.005);
    } else if (filterType === 'supplier') {
      list = list.filter(g => g.ledgerType.toLowerCase() === 'supplier' || g.balance < -0.005);
    } else if (filterType === 'nonzero') {
      list = list.filter(g => Math.abs(g.balance) > 0.005);
    }

    // Search query
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(g =>
        g.label.toLowerCase().includes(q) ||
        g.ledgerType.toLowerCase().includes(q) ||
        money(g.debit).includes(q) ||
        money(g.credit).includes(q) ||
        money(Math.abs(g.balance)).includes(q)
      );
    }

    // Sort
    return [...list].sort((a, b) => {
      let diff = 0;
      if (sortKey === 'label') diff = a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
      else if (sortKey === 'entries') diff = a.entries - b.entries;
      else if (sortKey === 'debit') diff = a.debit - b.debit;
      else if (sortKey === 'credit') diff = a.credit - b.credit;
      else if (sortKey === 'balance') diff = Math.abs(a.balance) - Math.abs(b.balance);
      return sortDir === 'asc' ? diff : -diff;
    });
  }, [rawGroups, filterType, search, sortKey, sortDir]);

  // Grand totals across visible pivot groups
  const totals = useMemo(() => {
    let entries = 0, debit = 0, credit = 0;
    for (const g of sortedGroups) {
      entries += g.entries;
      debit += g.debit;
      credit += g.credit;
    }
    debit = Math.round(debit * 100) / 100;
    credit = Math.round(credit * 100) / 100;
    return {
      groups: sortedGroups.length,
      entries,
      debit,
      credit,
      balance: Math.round((debit - credit) * 100) / 100,
    };
  }, [sortedGroups]);

  // Toggle single row inline expansion
  const toggleExpand = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Expand / Collapse all
  const allExpanded = sortedGroups.length > 0 && sortedGroups.every(g => expandedKeys.has(g.key));
  const toggleExpandAll = () => {
    if (allExpanded) {
      setExpandedKeys(new Set());
    } else {
      setExpandedKeys(new Set(sortedGroups.map(g => g.key)));
    }
  };

  const selectGroup = (g: { key: string; label: string }) => {
    onSelectGroup({ type: groupBy, value: groupBy === 'party' ? g.label : g.key, label: g.label });
  };

  // Change sort column
  const handleSort = (key: 'label' | 'entries' | 'debit' | 'credit' | 'balance') => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'label' ? 'asc' : 'desc');
    }
  };

  // Export Pivot CSV
  const handleExportCsv = () => {
    const groupName = groupBy === 'party' ? 'Company Name' : groupBy === 'particulars' ? 'Particulars Category' : 'Month';
    exportCsv(`ledger-pivot-${groupBy}`, [
      [groupName, 'Type', 'Entries', 'Debit (Out)', 'Credit (In)', 'Net Balance'],
      ...sortedGroups.map(g => [
        g.label,
        g.ledgerType,
        g.entries,
        money(g.debit),
        money(g.credit),
        `${money(Math.abs(g.balance))} ${drCr(g.balance)}`,
      ]),
      ['Total', `${totals.groups} groups`, totals.entries, money(totals.debit), money(totals.credit), `${money(Math.abs(totals.balance))} ${drCr(totals.balance)}`],
    ]);
  };

  return (
    <div className="space-y-3">
      {/* Pivot Controls Header */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        {/* Dimension Group By */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1 flex items-center gap-1">
            <Filter size={12} />
            Group By:
          </span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => { setGroupBy('party'); setExpandedKeys(new Set()); }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                groupBy === 'party' ? 'bg-orange-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 size={13} />
              Company
            </button>
            <button
              type="button"
              onClick={() => { setGroupBy('particulars'); setExpandedKeys(new Set()); }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                groupBy === 'particulars' ? 'bg-orange-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers size={13} />
              Particulars
            </button>
            <button
              type="button"
              onClick={() => { setGroupBy('month'); setExpandedKeys(new Set()); }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                groupBy === 'month' ? 'bg-orange-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar size={13} />
              Month
            </button>
          </div>
        </div>

        {/* Quick Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-2.5 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
              filterType === 'all'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            All ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('customer')}
            className={`px-2.5 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
              filterType === 'customer'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100'
            }`}
          >
            Receivable ({counts.customer})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('supplier')}
            className={`px-2.5 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
              filterType === 'supplier'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            Payable ({counts.supplier})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('nonzero')}
            className={`px-2.5 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
              filterType === 'nonzero'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'bg-orange-50 text-orange-800 border border-orange-200 hover:bg-orange-100'
            }`}
          >
            With Balance ({counts.nonzero})
          </button>
        </div>

        {/* Right Search & Expand All & Export */}
        <div className="flex items-center gap-2 w-full sm:w-auto ml-auto">
          <div className="relative w-full sm:w-48">
            <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              aria-label="Filter pivot table"
              placeholder="Search group…"
              className={`${inp} pl-8 w-full`}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <button
            type="button"
            onClick={toggleExpandAll}
            className={btn}
            title={allExpanded ? 'Collapse all row details' : 'Expand all rows to see underlying transactions'}
          >
            <ChevronsUpDown size={13} />
            {allExpanded ? 'Collapse All' : 'Expand All'}
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className={btn}
            title="Export Pivot Table to CSV"
          >
            <FileSpreadsheet size={13} />
            CSV
          </button>
        </div>
      </div>

      {/* Pivot Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] leading-tight min-w-[760px]">
            <thead className="bg-slate-100/90 text-slate-600 border-b border-slate-200 font-bold uppercase text-[9px] tracking-wider select-none">
              <tr>
                <th className="w-8 px-2 py-2 text-center"></th>
                <th
                  onClick={() => handleSort('label')}
                  className="px-2.5 py-2 text-left cursor-pointer hover:text-orange-600"
                >
                  <div className="inline-flex items-center gap-1">
                    {groupBy === 'party' ? 'Company Name' : groupBy === 'particulars' ? 'Particulars Category' : 'Month'}
                    {sortKey === 'label' ? (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={10} className="text-slate-400" />}
                  </div>
                </th>
                <th className="px-2.5 py-2 text-left">Type</th>
                <th
                  onClick={() => handleSort('entries')}
                  className="px-2.5 py-2 text-center cursor-pointer hover:text-orange-600"
                >
                  <div className="inline-flex items-center gap-1 justify-center">
                    Entries
                    {sortKey === 'entries' ? (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={10} className="text-slate-400" />}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('debit')}
                  className="px-2.5 py-2 text-right cursor-pointer hover:text-orange-600"
                >
                  <div className="inline-flex items-center gap-1 justify-end">
                    Total Debit (Out)
                    {sortKey === 'debit' ? (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={10} className="text-slate-400" />}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('credit')}
                  className="px-2.5 py-2 text-right cursor-pointer hover:text-orange-600"
                >
                  <div className="inline-flex items-center gap-1 justify-end">
                    Total Credit (In)
                    {sortKey === 'credit' ? (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={10} className="text-slate-400" />}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('balance')}
                  className="px-2.5 py-2 text-right cursor-pointer hover:text-orange-600"
                >
                  <div className="inline-flex items-center gap-1 justify-end">
                    Net Balance
                    {sortKey === 'balance' ? (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={10} className="text-slate-400" />}
                  </div>
                </th>
                <th className="px-2.5 py-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedGroups.map(g => {
                const isExpanded = expandedKeys.has(g.key);
                const isCustomer = g.ledgerType.toLowerCase() === 'customer' || g.balance > 0.005;
                const isSupplier = g.ledgerType.toLowerCase() === 'supplier' || g.balance < -0.005;

                return (
                  <React.Fragment key={g.key}>
                    <tr
                      className={`border-b border-slate-100 transition cursor-pointer ${
                        isExpanded ? 'bg-orange-50/20 font-semibold' : 'hover:bg-orange-50/30 odd:bg-white even:bg-slate-50/40'
                      }`}
                      onClick={() => toggleExpand(g.key)}
                    >
                      {/* Expand / Collapse Icon */}
                      <td className="px-2 py-2 text-center text-slate-400 hover:text-orange-600" onClick={e => { e.stopPropagation(); toggleExpand(g.key); }}>
                        <button type="button" className="p-0.5 rounded hover:bg-slate-200/60 transition cursor-pointer">
                          {isExpanded ? <ChevronDown size={14} className="text-orange-600" /> : <ChevronRight size={14} />}
                        </button>
                      </td>

                      {/* Group Label */}
                      <td className="px-2.5 py-2 font-bold uppercase tracking-wide text-slate-800">
                        <div className="flex items-center gap-2">
                          <span>{g.label}</span>
                          {g.entries > 1 && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-slate-100 text-slate-500">
                              {g.entries}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Ledger Type Badge */}
                      <td className="px-2.5 py-2 text-left whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          isCustomer
                            ? 'bg-sky-50 text-sky-700 border-sky-200'
                            : isSupplier
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {g.ledgerType}
                        </span>
                      </td>

                      {/* Entries count */}
                      <td className="px-2.5 py-2 text-center tabular-nums text-slate-700 font-semibold">
                        {g.entries}
                      </td>

                      {/* Total Debit */}
                      <td className="px-2.5 py-2 text-right tabular-nums font-semibold text-red-600">
                        {g.debit ? `₹${money(g.debit)}` : '—'}
                      </td>

                      {/* Total Credit */}
                      <td className="px-2.5 py-2 text-right tabular-nums font-semibold text-emerald-600">
                        {g.credit ? `₹${money(g.credit)}` : '—'}
                      </td>

                      {/* Net Balance */}
                      <td className="px-2.5 py-2 text-right tabular-nums font-black whitespace-nowrap">
                        <span className={
                          g.balance > 0.005 ? 'text-sky-700' : g.balance < -0.005 ? 'text-amber-700' : 'text-slate-400'
                        }>
                          ₹{money(Math.abs(g.balance))}
                        </span>
                        <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded font-extrabold ${
                          g.balance > 0.005
                            ? 'bg-sky-100 text-sky-800'
                            : g.balance < -0.005
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {drCr(g.balance) || 'Settled'}
                        </span>
                      </td>

                      {/* Action: Drill Down to inside page */}
                      <td className="px-2.5 py-2 text-center" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => selectGroup(g)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold text-orange-600 hover:text-white hover:bg-orange-600 bg-orange-50 border border-orange-200 hover:border-orange-600 transition shadow-2xs cursor-pointer active:scale-95 whitespace-nowrap"
                          title={`Open detailed statement for ${g.label}`}
                        >
                          View Details
                          <ArrowRight size={12} />
                        </button>
                      </td>
                    </tr>

                    {/* Inline Expanded Detail Sub-table (Excel Pivot Outline) */}
                    {isExpanded && (
                      <tr className="bg-slate-50/70 border-b-2 border-slate-200">
                        <td colSpan={8} className="p-2 sm:px-6 sm:py-3">
                          <div className="bg-white border border-slate-200 rounded-lg shadow-2xs p-3 max-h-[360px] overflow-auto [&_thead_th]:!z-10">
                            <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-slate-100">
                              <span className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                                <Layers size={13} className="text-orange-500" />
                                {g.label} — {g.lines.length} Transaction{g.lines.length === 1 ? '' : 's'}
                              </span>
                              <button
                                type="button"
                                onClick={() => selectGroup(g)}
                                className="text-xs font-bold text-orange-600 hover:text-orange-700 underline inline-flex items-center gap-1 cursor-pointer"
                              >
                                Open Full Detail Page →
                              </button>
                            </div>

                            <table className="w-full text-[11px] leading-tight">
                              <thead className="bg-slate-100/70 text-slate-600 font-bold uppercase text-[9px]">
                                <tr>
                                  <th className="px-2 py-1.5 text-left">Date</th>
                                  <th className="px-2 py-1.5 text-left">Ref No.</th>
                                  {groupBy !== 'party' && <th className="px-2 py-1.5 text-left">Company Name</th>}
                                  {groupBy !== 'particulars' && <th className="px-2 py-1.5 text-left">Particulars</th>}
                                  <th className="px-2 py-1.5 text-left">Narration</th>
                                  <th className="px-2 py-1.5 text-right">Debit</th>
                                  <th className="px-2 py-1.5 text-right">Credit</th>
                                  <th className="px-2 py-1.5 text-center">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {g.lines.map(l => (
                                  <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50/80 transition">
                                    <td className="px-2 py-1 whitespace-nowrap text-slate-600">{dmy(l.date)}</td>
                                    <td className="px-2 py-1 font-mono text-slate-700 font-semibold">{l.ref || '—'}</td>
                                    {groupBy !== 'party' && <td className="px-2 py-1 uppercase font-medium text-slate-800">{l.party}</td>}
                                    {groupBy !== 'particulars' && <td className="px-2 py-1 uppercase text-slate-600">{l.particulars}</td>}
                                    <td className="px-2 py-1 text-slate-500 max-w-xs truncate">{l.narration || '—'}</td>
                                    <td className="px-2 py-1 text-right tabular-nums text-red-600 font-semibold">
                                      {l.debit ? `₹${money(l.debit)}` : '—'}
                                    </td>
                                    <td className="px-2 py-1 text-right tabular-nums text-emerald-600 font-semibold">
                                      {l.credit ? `₹${money(l.credit)}` : '—'}
                                    </td>
                                    <td className="px-2 py-1 text-center whitespace-nowrap">
                                      {statusText(l.id) ? (
                                        <span className="text-[10px] text-slate-600 font-medium">
                                          {statusText(l.id)}
                                        </span>
                                      ) : <span className="text-slate-300">—</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {sortedGroups.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-400">
                    No matching groups found.
                  </td>
                </tr>
              )}
            </tbody>

            {/* Grand Totals */}
            <tfoot className="sticky bottom-0 z-20 bg-[#f1f5f9] border-t-2 border-slate-300 font-bold text-[12px] [&_td]:sticky [&_td]:bottom-0 [&_td]:z-20 [&_td]:bg-[#f1f5f9] [&_td]:shadow-[inset_0_2px_0_#cbd5e1]">
              <tr>
                <td colSpan={3} className="px-2.5 py-2.5 text-right uppercase tracking-wider text-slate-700">
                  Grand Total ({totals.groups} Groups)
                </td>
                <td className="px-2.5 py-2.5 text-center tabular-nums text-slate-800">
                  {totals.entries}
                </td>
                <td className="px-2.5 py-2.5 text-right tabular-nums text-red-600">
                  ₹{money(totals.debit)}
                </td>
                <td className="px-2.5 py-2.5 text-right tabular-nums text-emerald-600">
                  ₹{money(totals.credit)}
                </td>
                <td className="px-2.5 py-2.5 text-right tabular-nums font-black text-slate-900">
                  ₹{money(Math.abs(totals.balance))} <span className="text-xs">{drCr(totals.balance) || 'Settled'}</span>
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// Support React.Fragment import in file
import React from 'react';
