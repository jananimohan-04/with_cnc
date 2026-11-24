import { useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowDownRight, ArrowUpRight, Calendar, Download, Eye, FileDown,
  FileSpreadsheet, Printer, Search, Building2, Layers, CheckCircle2, Clock, AlertCircle
} from 'lucide-react';
import { type LedgerLine, type Settlement, dmy, drCr, statementFor, stripStamp } from '@/lib/ledgerDashboard';
import { type PivotGroupBy } from './LedgerPivotView';
import { formatINR } from '@/lib/format';
import { exportCsv, escapeHtml, printHtml } from '@/lib/reportExport';
import { addRoundedLogo } from '@/lib/brandedDocument';

const money = (n: number) => (n ? formatINR(n, { decimals: 'always', symbol: false }) : '0.00');
const btn = 'inline-flex items-center justify-center gap-1.5 h-8 px-3 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg shadow-2xs hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98] transition disabled:opacity-40';
const btnPrimary = 'inline-flex items-center justify-center gap-1.5 h-8 px-3.5 text-xs font-bold text-white bg-gradient-to-b from-orange-500 to-orange-600 rounded-lg shadow-xs hover:from-orange-500 hover:to-orange-700 active:scale-[0.98] transition disabled:opacity-40';
const inp = 'h-8 px-2.5 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15';

export interface LedgerDetailViewProps {
  group: { type: PivotGroupBy; value: string; label: string };
  allLines: LedgerLine[];
  settled: Map<string, Settlement>;
  statusText: (id: string) => string;
  onBack: () => void;
  initFrom?: string;
  initTo?: string;
  companyName?: string;
}

export function LedgerDetailView({
  group,
  allLines,
  settled,
  statusText,
  onBack,
  initFrom = '',
  initTo = '',
  companyName = 'Argus Technologies',
}: LedgerDetailViewProps) {
  const [from, setFrom] = useState(initFrom);
  const [to, setTo] = useState(initTo);
  const [search, setSearch] = useState('');

  const isParty = group.type === 'party';

  // For a party group, compute true opening, chronological running balances, and closing
  const partyStatement = useMemo(() => {
    if (!isParty) return null;
    return statementFor(allLines, group.value, from || undefined, to || undefined);
  }, [isParty, allLines, group.value, from, to]);

  // For non-party groups (e.g. Particulars or Month), filter matching lines
  const genericLines = useMemo(() => {
    if (isParty) return [];
    return allLines.filter(l => {
      if (group.type === 'particulars') {
        const p = (l.particulars || 'Other').trim().toLowerCase();
        if (p !== group.value.toLowerCase()) return false;
      } else if (group.type === 'month') {
        const ym = l.date ? l.date.slice(0, 7) : 'Unknown';
        if (ym !== group.value) return false;
      }
      if (from && l.date && l.date < from) return false;
      if (to && l.date && l.date > to) return false;
      return true;
    }).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }, [isParty, allLines, group.type, group.value, from, to]);

  // Search filter inside the detail view
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (isParty && partyStatement) {
      if (!q) return partyStatement.rows;
      return partyStatement.rows.filter(r =>
        r.ref.toLowerCase().includes(q) ||
        r.particulars.toLowerCase().includes(q) ||
        r.narration.toLowerCase().includes(q) ||
        dmy(r.date).includes(q) ||
        String(r.debit).includes(q) ||
        String(r.credit).includes(q)
      );
    }
    if (!q) return genericLines;
    return genericLines.filter(r =>
      r.ref.toLowerCase().includes(q) ||
      r.party.toLowerCase().includes(q) ||
      r.particulars.toLowerCase().includes(q) ||
      r.narration.toLowerCase().includes(q) ||
      dmy(r.date).includes(q) ||
      String(r.debit).includes(q) ||
      String(r.credit).includes(q)
    );
  }, [isParty, partyStatement, genericLines, search]);

  // Summary figures
  const summary = useMemo(() => {
    if (isParty && partyStatement) {
      return {
        opening: partyStatement.opening,
        debit: partyStatement.debit,
        credit: partyStatement.credit,
        closing: partyStatement.closing,
        count: partyStatement.rows.length,
      };
    }
    const d = genericLines.reduce((n, l) => n + l.debit, 0);
    const c = genericLines.reduce((n, l) => n + l.credit, 0);
    return {
      opening: 0,
      debit: d,
      credit: c,
      closing: d - c,
      count: genericLines.length,
    };
  }, [isParty, partyStatement, genericLines]);

  // Detect ledger type if party
  const partyType = useMemo(() => {
    if (!isParty) return group.type === 'particulars' ? 'Category' : 'Period';
    const sample = allLines.find(l => l.party.toLowerCase() === group.value.toLowerCase() && l.ledgerType);
    return sample?.ledgerType || (summary.closing > 0 ? 'Customer' : summary.closing < 0 ? 'Supplier' : 'Party');
  }, [isParty, allLines, group.value, group.type, summary.closing]);

  // Export CSV
  const handleExportCsv = () => {
    const title = `ledger-${group.label.replace(/[^\w]+/g, '_')}`;
    if (isParty && partyStatement) {
      exportCsv(title, [
        ['Company Name', group.label],
        ['Ledger Type', partyType],
        ['From', from ? dmy(from) : 'Beginning'],
        ['To', to ? dmy(to) : 'Today'],
        [],
        ['Date', 'Reference No.', 'Particulars', 'Narration', 'Debit (Out)', 'Credit (In)', 'Running Balance', 'Status'],
        ['', '', 'Opening balance', 'Brought forward', '', '', `${money(Math.abs(partyStatement.opening))} ${drCr(partyStatement.opening)}`, ''],
        ...partyStatement.rows.map(r => [
          dmy(r.date),
          r.ref,
          r.particulars,
          r.narration,
          r.debit ? money(r.debit) : '',
          r.credit ? money(r.credit) : '',
          `${money(Math.abs(r.balance))} ${drCr(r.balance)}`,
          statusText(r.id),
        ]),
        ['', '', 'Closing balance', 'Net balance', money(partyStatement.debit), money(partyStatement.credit), `${money(Math.abs(partyStatement.closing))} ${drCr(partyStatement.closing)}`, ''],
      ]);
    } else {
      exportCsv(title, [
        ['Group', group.label],
        ['Type', group.type],
        ['From', from ? dmy(from) : 'Beginning'],
        ['To', to ? dmy(to) : 'Today'],
        [],
        ['Date', 'Reference No.', 'Company Name', 'Particulars', 'Narration', 'Debit (Out)', 'Credit (In)', 'Status'],
        ...genericLines.map(r => [
          dmy(r.date),
          r.ref,
          r.party,
          r.particulars,
          r.narration,
          r.debit ? money(r.debit) : '',
          r.credit ? money(r.credit) : '',
          statusText(r.id),
        ]),
        ['', '', 'Total', `${genericLines.length} entries`, money(summary.debit), money(summary.credit), `Balance: ${money(Math.abs(summary.closing))} ${drCr(summary.closing)}`],
      ]);
    }
  };

  // Download PDF
  const handleDownloadPdf = async () => {
    const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    await addRoundedLogo(doc, 14, 8, 40, 17);

    doc.setFontSize(14);
    doc.text(`Ledger Statement - ${group.label}`, 60, 15);
    doc.setFontSize(8);
    doc.text(`${companyName} | ${from ? dmy(from) : 'Beginning'} to ${to ? dmy(to) : 'Today'} | ${summary.count} entries`, 60, 20.5);
    doc.setDrawColor(242, 90, 10);
    doc.setLineWidth(0.7);
    doc.line(14, 27, 283, 27);

    if (isParty && partyStatement) {
      const balStr = (n: number) => `${money(Math.abs(n))} ${drCr(n)}`.trim();
      autoTable(doc, {
        startY: 31,
        styles: { fontSize: 7.5, cellPadding: 1.4 },
        headStyles: { fillColor: [51, 65, 85] },
        head: [['Date', 'Reference', 'Particulars', 'Narration', 'Debit', 'Credit', 'Balance', 'Status']],
        body: [
          ['', '', 'Opening balance', 'Brought forward', '', '', balStr(partyStatement.opening), ''],
          ...partyStatement.rows.map(r => [
            dmy(r.date),
            r.ref,
            r.particulars,
            r.narration,
            r.debit ? money(r.debit) : '',
            r.credit ? money(r.credit) : '',
            balStr(r.balance),
            statusText(r.id),
          ]),
          ['', '', 'Closing balance', 'Net balance', money(partyStatement.debit), money(partyStatement.credit), balStr(partyStatement.closing), ''],
        ],
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
      });
    } else {
      autoTable(doc, {
        startY: 31,
        styles: { fontSize: 7.5, cellPadding: 1.4 },
        headStyles: { fillColor: [51, 65, 85] },
        head: [['Date', 'Reference', 'Company Name', 'Particulars', 'Narration', 'Debit', 'Credit', 'Status']],
        body: genericLines.map(r => [
          dmy(r.date),
          r.ref,
          r.party,
          r.particulars,
          r.narration,
          r.debit ? money(r.debit) : '',
          r.credit ? money(r.credit) : '',
          statusText(r.id),
        ]),
        foot: [['', '', '', 'Total', `(${genericLines.length} entries)`, money(summary.debit), money(summary.credit), `Balance: ${money(Math.abs(summary.closing))} ${drCr(summary.closing)}`]],
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        columnStyles: { 5: { halign: 'right' }, 6: { halign: 'right' } },
      });
    }

    doc.save(`ledger-${group.label.replace(/[^\w]+/g, '_')}.pdf`);
  };

  // Print Statement
  const handlePrint = () => {
    const cell = (v: string, num = false) => `<td${num ? ' class="num"' : ''}>${escapeHtml(v)}</td>`;
    if (isParty && partyStatement) {
      const head = ['Date', 'Reference', 'Particulars', 'Narration', 'Debit', 'Credit', 'Balance', 'Status']
        .map((h, i) => `<th${i >= 4 && i <= 6 ? ' class="num"' : ''}>${escapeHtml(h)}</th>`).join('');

      const balStr = (n: number) => `${money(Math.abs(n))} ${drCr(n)}`.trim();
      const rowsHtml = [
        `<tr><td></td><td></td><td><strong>Opening balance</strong></td><td>Brought forward</td><td></td><td></td><td class="num"><strong>${balStr(partyStatement.opening)}</strong></td><td></td></tr>`,
        ...partyStatement.rows.map(r => `<tr>
          <td>${dmy(r.date)}</td>
          <td>${escapeHtml(r.ref)}</td>
          <td>${escapeHtml(r.particulars)}</td>
          <td>${escapeHtml(r.narration)}</td>
          <td class="num">${r.debit ? money(r.debit) : ''}</td>
          <td class="num">${r.credit ? money(r.credit) : ''}</td>
          <td class="num">${balStr(r.balance)}</td>
          <td>${escapeHtml(statusText(r.id))}</td>
        </tr>`),
        `<tr class="total">
          <td colspan="4" style="text-align:right"><strong>Closing balance</strong></td>
          <td class="num"><strong>${money(partyStatement.debit)}</strong></td>
          <td class="num"><strong>${money(partyStatement.credit)}</strong></td>
          <td class="num"><strong>${balStr(partyStatement.closing)}</strong></td>
          <td></td>
        </tr>`,
      ].join('');

      printHtml(`Ledger Statement - ${group.label}`, `
        <div class="brand">
          <img src="${window.location.origin}/arguscnc-logo.jpg" alt="Logo">
          <div style="text-align:right">
            <h1>Ledger Statement - ${escapeHtml(group.label)}</h1>
            <div class="meta">${escapeHtml(companyName)} | ${from ? dmy(from) : 'Beginning'} to ${to ? dmy(to) : 'Today'}</div>
          </div>
        </div>
        <table>
          <thead><tr>${head}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `);
    } else {
      const head = ['Date', 'Reference', 'Company Name', 'Particulars', 'Narration', 'Debit', 'Credit', 'Status']
        .map((h, i) => `<th${i >= 5 && i <= 6 ? ' class="num"' : ''}>${escapeHtml(h)}</th>`).join('');

      const rowsHtml = genericLines.map(r => `<tr>
        <td>${dmy(r.date)}</td>
        <td>${escapeHtml(r.ref)}</td>
        <td>${escapeHtml(r.party)}</td>
        <td>${escapeHtml(r.particulars)}</td>
        <td>${escapeHtml(r.narration)}</td>
        <td class="num">${r.debit ? money(r.debit) : ''}</td>
        <td class="num">${r.credit ? money(r.credit) : ''}</td>
        <td>${escapeHtml(statusText(r.id))}</td>
      </tr>`).join('');

      printHtml(`Ledger - ${group.label}`, `
        <div class="brand">
          <img src="${window.location.origin}/arguscnc-logo.jpg" alt="Logo">
          <div style="text-align:right">
            <h1>Ledger - ${escapeHtml(group.label)}</h1>
            <div class="meta">${escapeHtml(companyName)} | ${from ? dmy(from) : 'Beginning'} to ${to ? dmy(to) : 'Today'}</div>
          </div>
        </div>
        <table>
          <thead><tr>${head}</tr></thead>
          <tbody>
            ${rowsHtml}
            <tr class="total">
              <td colspan="5" style="text-align:right"><strong>Total (${genericLines.length} entries)</strong></td>
              <td class="num"><strong>${money(summary.debit)}</strong></td>
              <td class="num"><strong>${money(summary.credit)}</strong></td>
              <td><strong>Balance: ${money(Math.abs(summary.closing))} ${drCr(summary.closing)}</strong></td>
            </tr>
          </tbody>
        </table>
      `);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Navigation & Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold text-orange-600 bg-orange-50 border border-orange-200 hover:bg-orange-100 transition shadow-2xs cursor-pointer active:scale-95"
            title="Return to the pivot summary table"
          >
            <ArrowLeft size={14} />
            Back to Pivot Table
          </button>
          <div className="h-4 w-px bg-slate-200 hidden sm:block" />
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400">Ledger Dashboard</span>
            <span className="text-slate-300">/</span>
            <span className="font-bold text-slate-800 uppercase tracking-wide truncate max-w-[240px] sm:max-w-md">{group.label}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 ml-auto">
          <button type="button" onClick={handlePrint} className={btn} title="Print ledger statement">
            <Printer size={13} />
            Print
          </button>
          <button type="button" onClick={() => void handleDownloadPdf()} className={btn} title="Download PDF statement">
            <FileDown size={13} />
            PDF
          </button>
          <button type="button" onClick={handleExportCsv} className={btn} title="Export CSV statement">
            <FileSpreadsheet size={13} />
            CSV
          </button>
        </div>
      </div>

      {/* Overview Card with KPIs */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-4 sm:p-5 text-white shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-slate-700/60 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block p-1.5 bg-orange-500/20 text-orange-400 rounded-lg">
                <Building2 size={18} />
              </span>
              <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight text-white">{group.label}</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                partyType.toLowerCase() === 'customer'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-400/30'
                  : partyType.toLowerCase() === 'supplier'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                  : 'bg-slate-700 text-slate-300 border border-slate-600'
              }`}>
                {partyType}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 pl-8">
              Detailed chronological statement showing every voucher, inward, invoice, and payment.
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400 block font-medium">Activity in Period</span>
            <span className="text-sm font-bold text-white">{summary.count} entries</span>
          </div>
        </div>

        {/* 4 KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {isParty && (
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Opening Balance</span>
              <div className="text-base sm:text-lg font-bold tabular-nums text-slate-200">
                ₹{money(Math.abs(summary.opening))}
                <span className="ml-1 text-xs font-semibold text-slate-400">{drCr(summary.opening) || '—'}</span>
              </div>
              <span className="text-[10px] text-slate-400">Brought forward</span>
            </div>
          )}

          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-red-300 block mb-0.5">Total Debit (Out)</span>
            <div className="text-base sm:text-lg font-bold tabular-nums text-red-400">
              ₹{money(summary.debit)}
            </div>
            <span className="text-[10px] text-slate-400">{partyType === 'Customer' ? 'Sales Invoices / Billed' : 'Payments Made Out'}</span>
          </div>

          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 block mb-0.5">Total Credit (In)</span>
            <div className="text-base sm:text-lg font-bold tabular-nums text-emerald-400">
              ₹{money(summary.credit)}
            </div>
            <span className="text-[10px] text-slate-400">{partyType === 'Customer' ? 'Receipts In' : 'Goods / Service Inward'}</span>
          </div>

          <div className={`border rounded-xl p-3 ${
            summary.closing > 0.005
              ? 'bg-sky-950/40 border-sky-600/50'
              : summary.closing < -0.005
              ? 'bg-amber-950/40 border-amber-600/50'
              : 'bg-slate-800/80 border-slate-700'
          }`}>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 block mb-0.5">Net Closing Balance</span>
            <div className={`text-base sm:text-lg font-black tabular-nums ${
              summary.closing > 0.005 ? 'text-sky-300' : summary.closing < -0.005 ? 'text-amber-300' : 'text-slate-200'
            }`}>
              ₹{money(Math.abs(summary.closing))}
              <span className="ml-1 text-xs font-bold">{drCr(summary.closing) || 'Settled'}</span>
            </div>
            <span className="text-[10px] text-slate-300">
              {summary.closing > 0.005 ? 'Receivable (They owe us)' : summary.closing < -0.005 ? 'Payable (We owe them)' : 'Fully settled'}
            </span>
          </div>
        </div>
      </div>

      {/* Date & Search Filters Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 font-semibold text-slate-600">
            From:
            <input
              type="date"
              aria-label="Filter from date"
              className={inp}
              value={from}
              onChange={e => setFrom(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-1.5 font-semibold text-slate-600">
            To:
            <input
              type="date"
              aria-label="Filter to date"
              className={inp}
              value={to}
              onChange={e => setTo(e.target.value)}
            />
          </label>
          {(from || to) && (
            <button
              type="button"
              onClick={() => { setFrom(''); setTo(''); }}
              className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 underline ml-1 cursor-pointer"
            >
              Clear dates
            </button>
          )}
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            aria-label="Search within statement"
            placeholder="Search reference, narration…"
            className={`${inp} pl-8 w-full`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Chronological Statement Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] leading-tight min-w-[760px]">
            <thead className="bg-slate-100/90 text-slate-600 border-b border-slate-200 font-bold uppercase text-[9px] tracking-wider select-none">
              <tr>
                <th className="px-2.5 py-2 text-left">Date</th>
                <th className="px-2.5 py-2 text-left">Reference No.</th>
                {!isParty && <th className="px-2.5 py-2 text-left">Company Name</th>}
                <th className="px-2.5 py-2 text-left">Particulars</th>
                <th className="px-2.5 py-2 text-left">Narration / Item</th>
                <th className="px-2.5 py-2 text-right">Debit (Out)</th>
                <th className="px-2.5 py-2 text-right">Credit (In)</th>
                {isParty && <th className="px-2.5 py-2 text-right">Running Balance</th>}
                <th className="px-2.5 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {/* Opening balance row for party */}
              {isParty && partyStatement && (
                <tr className="bg-slate-50/80 font-semibold border-b border-slate-200 text-slate-700">
                  <td className="px-2.5 py-2 text-slate-400 italic">{from ? dmy(from) : '—'}</td>
                  <td className="px-2.5 py-2 font-mono text-slate-400">—</td>
                  <td className="px-2.5 py-2 uppercase font-bold text-slate-800">Opening Balance</td>
                  <td className="px-2.5 py-2 text-slate-500 italic">Brought forward before {from ? dmy(from) : 'period'}</td>
                  <td className="px-2.5 py-2 text-right text-slate-400">—</td>
                  <td className="px-2.5 py-2 text-right text-slate-400">—</td>
                  <td className="px-2.5 py-2 text-right tabular-nums font-bold text-slate-800">
                    ₹{money(Math.abs(partyStatement.opening))} {drCr(partyStatement.opening) || '—'}
                  </td>
                  <td className="px-2.5 py-2 text-center text-slate-400">—</td>
                </tr>
              )}

              {/* Detail rows */}
              {filteredRows.map((r, idx) => {
                const bal = (r as any).balance !== undefined ? (r as any).balance : null;
                const status = statusText(r.id);
                return (
                  <tr
                    key={r.id || idx}
                    className="border-b border-slate-100 odd:bg-white even:bg-slate-50/40 hover:bg-orange-50/30 transition"
                  >
                    <td className="px-2.5 py-2 whitespace-nowrap text-slate-700">{dmy(r.date)}</td>
                    <td className="px-2.5 py-2 font-mono text-slate-800 font-semibold">{r.ref || '—'}</td>
                    {!isParty && <td className="px-2.5 py-2 uppercase font-medium text-slate-800">{r.party}</td>}
                    <td className="px-2.5 py-2 uppercase font-medium text-slate-700">{r.particulars}</td>
                    <td className="px-2.5 py-2 text-slate-600 max-w-xs truncate" title={r.narration}>{r.narration || '—'}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums font-semibold text-red-600">
                      {r.debit ? `₹${money(r.debit)}` : '—'}
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums font-semibold text-emerald-600">
                      {r.credit ? `₹${money(r.credit)}` : '—'}
                    </td>
                    {isParty && (
                      <td className="px-2.5 py-2 text-right tabular-nums font-bold text-slate-800">
                        ₹{money(Math.abs(bal))} <span className="text-[10px] text-slate-500 font-normal">{drCr(bal)}</span>
                      </td>
                    )}
                    <td className="px-2.5 py-2 text-center whitespace-nowrap">
                      {status ? (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          status.toLowerCase().includes('completed')
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : status.toLowerCase().includes('part')
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-orange-50 text-orange-700 border-orange-200'
                        }`}>
                          {status}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                );
              })}

              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={isParty ? 8 : 8} className="px-3 py-10 text-center text-slate-400">
                    No transactions found for this period.
                  </td>
                </tr>
              )}
            </tbody>

            {/* Closing Balance / Grand Total footer */}
            <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-[12px] sticky bottom-0">
              <tr>
                <td colSpan={isParty ? 4 : 4} className="px-2.5 py-2.5 text-right uppercase tracking-wider text-slate-700">
                  {isParty ? 'Closing Balance (Net Due)' : `Total (${summary.count} entries)`}
                </td>
                <td className="px-2.5 py-2.5 text-right tabular-nums text-red-600">
                  ₹{money(summary.debit)}
                </td>
                <td className="px-2.5 py-2.5 text-right tabular-nums text-emerald-600">
                  ₹{money(summary.credit)}
                </td>
                {isParty && (
                  <td className="px-2.5 py-2.5 text-right tabular-nums font-black text-slate-900">
                    ₹{money(Math.abs(summary.closing))} <span className="text-xs">{drCr(summary.closing) || 'Settled'}</span>
                  </td>
                )}
                <td className="px-2.5 py-2.5 text-center text-xs text-slate-500 font-semibold">
                  {summary.closing > 0.005 ? 'Receivable' : summary.closing < -0.005 ? 'Payable' : 'Settled'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
