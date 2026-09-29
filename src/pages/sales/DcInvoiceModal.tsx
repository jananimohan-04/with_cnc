// DC → Invoice modal for the Sales Pipeline Kanban.
// Opened when a Delivery Challan card is dropped into Invoice. The unit price is
// NEVER typed blindly: it resolves from the latest APPROVED costing sheet
// (Finished Goods pricing) linked through DC → Sales Order → Quotation. If no
// approved price exists, creation is blocked with an explicit message — never a
// silent zero. Save reuses financeApi.saveInvoice (DB computes tax authoritatively),
// and duplicates for the same DC are refused.

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { financeApi } from '@/lib/finance';
import { fetchOrderQty, type OrderQtySummary } from '@/lib/orderQuantities';
import { formatINR, todayISO } from '@/lib/format';
import { Badge, Button, statusToVariant } from '@/components/ui/Card';
import { Modal, inputClass } from '@/components/ui/Modal';
import { downloadBrandedDocument, viewBrandedDocument } from '@/lib/brandedDocument';
import { printHtml } from '@/lib/reportExport';
import { useAuth } from '@/contexts/AuthContext';
import { CheckCheck, Download, Eye, Pencil, Printer, X, AlertTriangle } from 'lucide-react';

interface InvLine {
  key: string;
  dcId: string | null;
  itemName: string;
  productCode: string;
  qty: number;
  /** DC quantity at load: edits may reduce but never exceed it. */
  maxQty: number;
  unit: string;
  approvedUnit: number | null;
  sheetRef: string;
  unitInput: string;
  missing: boolean;
}

const num = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`;

export function DcInvoiceModal({ card, onClose, onMoved }: {
  card: any;
  onClose: () => void;
  onMoved: () => void;
}) {
  const { company } = useAuth() as any;
  const companyName: string = company?.company_name ?? 'ARGUS CNC';

  const raw = card?.raw ?? {};
  const dcId: string | null = raw.id && raw.id !== 'dummy' ? String(raw.id) : null;
  const dcNo: string = raw.delivery_no || raw.dc_no || card?.refNo || '';

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [existingInv, setExistingInv] = useState<string | null>(null);

  const [customer, setCustomer] = useState(card?.customer ?? '');
  const [invDate, setInvDate] = useState(todayISO());
  const [quoteNo, setQuoteNo] = useState('');
  const [soNo, setSoNo] = useState('');
  const [soId, setSoId] = useState<string | null>(null);
  const [lines, setLines] = useState<InvLine[]>([]);
  const [cgst, setCgst] = useState('');
  const [sgst, setSgst] = useState('');
  const [igst, setIgst] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orderQty, setOrderQty] = useState<OrderQtySummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // 0) Duplicate / already-billed guards first.
        if (raw.status === 'Billed') {
          if (!cancelled) { setBlocked('This Delivery Challan is already billed. Refresh the board.'); setLoading(false); }
          return;
        }
        if (dcId) {
          const r = await supabase.from('cnc_invoices').select('id,invoice_no').eq('delivery_id', dcId).limit(1);
          if (!cancelled && !r.error && (r.data ?? []).length > 0) {
            setExistingInv(r.data![0].invoice_no ?? r.data![0].id);
            setBlocked(`An invoice (${r.data![0].invoice_no ?? 'saved'}) already exists for this Delivery Challan. Duplicate invoicing is blocked.`);
            setLoading(false);
            return;
          }
        }
        if (!cancelled && dcNo) {
          const r = await supabase.from('cnc_invoices').select('id,invoice_no').eq('dc_no', dcNo).limit(1);
          if (!r.error && (r.data ?? []).length > 0) {
            setExistingInv(r.data![0].invoice_no ?? r.data![0].id);
            setBlocked(`An invoice (${r.data![0].invoice_no ?? 'saved'}) already exists for DC ${dcNo}. Duplicate invoicing is blocked.`);
            setLoading(false);
            return;
          }
        }
        // 1) All DC rows under this challan number (multi-item support).
        let rows: any[] = [raw];
        if (dcNo) {
          const r = await supabase.from('cnc_deliveries').select('*').eq('delivery_no', dcNo).order('created_at');
          if (!r.error && (r.data ?? []).length > 0) rows = r.data!;
        }
        if (cancelled) return;
        // 2) Sales order → quotation chain.
        const first = rows[0] ?? {};
        let soRow: any = null;
        if (first.sales_order_id) {
          const r = await supabase.from('cnc_sales_orders').select('*').eq('id', first.sales_order_id).limit(1);
          if (!r.error && (r.data ?? []).length > 0) soRow = r.data![0];
        }
        if (!soRow && (first.sales_order_no || first.sales_order_ref)) {
          const r = await supabase.from('cnc_sales_orders').select('*').eq('order_no', first.sales_order_no || first.sales_order_ref).limit(1);
          if (!r.error && (r.data ?? []).length > 0) soRow = r.data![0];
        }
        let qRow: any = null;
        if (soRow?.quotation_id) {
          const r = await supabase.from('cnc_quotations').select('*').eq('id', soRow.quotation_id).limit(1);
          if (!r.error && (r.data ?? []).length > 0) qRow = r.data![0];
        }
        if (!qRow && soRow?.quote_no) {
          const r = await supabase.from('cnc_quotations').select('*').eq('quote_no', soRow.quote_no).limit(1);
          if (!r.error && (r.data ?? []).length > 0) qRow = r.data![0];
        }
        if (cancelled) return;
        if (!qRow) {
          setBlocked('No quotation is linked to this Delivery Challan (via Sales Order). Approved selling price is required before creating the invoice.');
          setLoading(false);
          return;
        }
        setQuoteNo(qRow.quote_no ?? '');
        setSoNo(soRow?.order_no ?? '');
        setSoId(soRow?.id != null ? String(soRow.id) : null);
        // Order quantity context: delivered vs invoiced vs still invoiceable.
        if (soRow) {
          try {
            const { summary } = await fetchOrderQty(
              soRow.id != null ? String(soRow.id) : null, String(soRow.order_no ?? ''));
            if (!cancelled && summary) setOrderQty(summary);
          } catch { /* invoice still uses the DC quantity */ }
        }
        if (first.customer_name || first.customer || card?.customer) {
          setCustomer(first.customer_name || first.customer || card?.customer || '');
        }
        // 3) Approved price per product line.
        const built: InvLine[] = [];
        let missing: string[] = [];
        for (const row of rows) {
          const code = row.part_no || soRow?.part_no || '';
          let approvedUnit: number | null = null;
          let sheetRef = '';
          if (code) {
            const v = await supabase.from('cnc_costing_sheets').select('approved_price,quantity,version,status')
              .eq('quotation_no', qRow.quote_no).eq('product_code', code)
              .eq('status', 'Approved').order('version', { ascending: false }).limit(1);
            const sheet = !v.error ? (v.data ?? [])[0] : null;
            if (sheet && num(sheet.quantity) > 0 && sheet.approved_price != null) {
              approvedUnit = num(sheet.approved_price) / num(sheet.quantity);
              sheetRef = `${qRow.quote_no} V${sheet.version}`;
            }
          }
          const name = row.part_name || row.product_name || soRow?.part_name || '';
          if (approvedUnit == null) missing.push(name || code || 'Unnamed item');
          const lineQty = num(row.dispatch_qty ?? row.quantity) || 0;
          built.push({
            key: uid(),
            dcId: row.id != null ? String(row.id) : null,
            itemName: name,
            productCode: code,
            qty: lineQty,
            maxQty: lineQty,
            unit: row.unit || '',
            approvedUnit,
            sheetRef,
            unitInput: '',
            missing: approvedUnit == null,
          });
          if (cancelled) return;
        }
        if (missing.length > 0) {
          setBlocked(`Approved selling price is required before creating the invoice. Missing for: ${missing.join(', ')}. Approve the Finished Goods costing first.`);
        }
        setLines(built);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effUnit = (l: InvLine) => (l.unitInput.trim() === '' ? (l.approvedUnit ?? 0) : num(l.unitInput));
  const basic = lines.reduce((s, l) => s + num(l.qty) * effUnit(l), 0);
  const c = cgst.trim() === '' ? null : num(cgst);
  const s = sgst.trim() === '' ? null : num(sgst);
  const ig = igst.trim() === '' ? null : num(igst);
  const tax = basic * ((c ?? 0) + (s ?? 0) + (ig ?? 0)) / 100;
  const grand = basic + tax;
  const origTotal = lines.reduce((sum, l) => sum + num(l.qty) * (l.approvedUnit ?? 0), 0);
  const edited = lines.some((l) => l.unitInput.trim() !== '');
  const adjustment = basic - origTotal;

  const canApprove = !loading && !loadError && !blocked && lines.length > 0
    && lines.every((l) => !l.missing && num(l.qty) > 0 && num(l.qty) <= num(l.maxQty) && effUnit(l) >= 0)
    && customer.trim() !== '';
  const dcTotal = lines.reduce((s, l) => s + num(l.qty), 0);

  const setLine = (key: string, patch: Partial<InvLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const approve = async () => {
    if (!canApprove || saving) return;
    setSaving(true);
    try {
      // Re-check duplicates at commit time (second tab / double-click safe).
      if (dcId) {
        const r = await supabase.from('cnc_invoices').select('id,invoice_no').eq('delivery_id', dcId).limit(1);
        if (!r.error && (r.data ?? []).length > 0) throw new Error(`Invoice ${r.data![0].invoice_no ?? ''} already exists for this DC.`);
      }
      const gstRate = (c !== null || s !== null || ig !== null) ? (c ?? 0) + (s ?? 0) + (ig ?? 0) : null;
      const refs = Array.from(new Set(lines.map((l) => l.sheetRef).filter(Boolean))).join(', ');
      const res = await financeApi.saveInvoice({
        invoice_no: null,
        invoice_type: 'Sales Invoice',
        customer_name: customer.trim(),
        customer_id: raw.customer_id || null,
        part_name: lines[0].itemName,
        quantity: lines.reduce((n, l) => n + num(l.qty), 0),
        invoice_date: invDate || null,
        dc_no: dcNo || null,
        delivery_id: dcId,
        sales_order_id: soId,
        notes: `Priced from approved FG costing ${refs}${edited ? ` (invoice-edited, adjustment ${adjustment >= 0 ? '+' : ''}${adjustment})` : ''}`,
      }, lines.map((l) => ({
        description: l.itemName, quantity: num(l.qty), unit: l.unit || null,
        rate: effUnit(l), gst_rate: gstRate,
      })));
      if (dcId) {
        const { error: dcErr } = await supabase.from('cnc_deliveries').update({ status: 'Billed' }).eq('id', dcId);
        if (dcErr) throw dcErr;
      }
      onMoved();
      onClose();
      void res;
    } catch (e: any) {
      alert(`Approve & Create Invoice failed: ${e?.message ?? e}. Nothing was created.`);
    } finally {
      setSaving(false);
    }
  };

  const pdfInput = () => ({
    companyName,
    title: 'Tax Invoice',
    documentNo: 'DRAFT',
    date: invDate,
    details: [
      ['Bill To', customer], ['Delivery Challan', dcNo], ['Sales Order', soNo],
      ['Quotation', quoteNo], ['Priced From', Array.from(new Set(lines.map((l) => l.sheetRef).filter(Boolean))).join(', ') || '—'],
    ] as [string, string | number | null | undefined][],
    columns: ['#', 'Description', 'HSN', 'Qty', 'Unit', 'Rate', 'Amount'],
    rows: lines.map((l, i) => [
      i + 1, `${l.itemName}${l.unitInput.trim() !== '' ? ' (edited)' : ''}`, '—',
      l.qty, l.unit || '', formatINR(effUnit(l)), formatINR(num(l.qty) * effUnit(l)),
    ] as (string | number)[]),
    totals: [
      ['Basic Value', formatINR(basic)],
      ['CGST', formatINR(c !== null ? basic * c / 100 : 0)],
      ['SGST', formatINR(s !== null ? basic * s / 100 : 0)],
      ['IGST', formatINR(ig !== null ? basic * ig / 100 : 0)],
      ['Total', formatINR(grand)],
    ] as [string, string][],
  });

  const handlePrint = () => {
    const row = (cells: string[]) => `<tr>${cells.map((x) => `<td>${x}</td>`).join('')}</tr>`;
    printHtml(`Invoice - ${dcNo}`, `
      <h2>${companyName} — Tax Invoice (DRAFT)</h2>
      <p>Customer: ${customer} | DC: ${dcNo} | SO: ${soNo} | Date: ${invDate}</p>
      <table><thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
      <tbody>${lines.map((l) => row([l.itemName, String(l.qty), formatINR(effUnit(l)), formatINR(num(l.qty) * effUnit(l))])).join('')}</tbody></table>
      <h3>Basic ${formatINR(basic)} | Tax ${formatINR(tax)} | Total ${formatINR(grand)}</h3>`);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Invoice Entry — Approved Price"
      subtitle={`DC ${dcNo || ''} → Invoice`}
      size="2xl"
      footer={
        <>
          <Button variant="secondary" icon={<Eye size={14} />} onClick={() => { try { viewBrandedDocument(pdfInput()); } catch (e: any) { alert(e?.message ?? e); } }}>
            Preview Invoice PDF
          </Button>
          <Button variant="secondary" icon={<Download size={14} />} onClick={() => { downloadBrandedDocument(pdfInput()).catch((e: any) => alert(e?.message ?? e)); }}>
            Download PDF
          </Button>
          <Button variant="secondary" icon={<Printer size={14} />} onClick={handlePrint}>Print</Button>
          <span className="flex-1" />
          <Button variant="secondary" icon={<X size={14} />} onClick={onClose}>Cancel</Button>
          <Button variant="secondary" icon={<Pencil size={14} />} onClick={() => setEditing((v) => !v)}>
            {editing ? 'Done Editing' : 'Edit'}
          </Button>
          <Button icon={<CheckCheck size={14} />} disabled={!canApprove || saving}
            title={!canApprove ? 'Resolve the blocker below first' : 'Create the invoice and move the card'}
            onClick={approve}>
            {saving ? 'Creating...' : 'Approve & Create Invoice'}
          </Button>
        </>
      }
    >
      {loading ? (
        <p className="text-sm text-slate-500 py-8 text-center">Resolving approved prices...</p>
      ) : loadError ? (
        <p className="text-sm text-red-600 py-8 text-center">Failed to load invoice data: {loadError}</p>
      ) : (
        <div className="space-y-4">
          {blocked && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm font-bold text-red-800 flex gap-2"><AlertTriangle size={15} className="shrink-0 mt-0.5" />{blocked}</p>
              {existingInv && <p className="text-xs text-red-600 mt-1">Open the existing invoice from the Invoice column instead.</p>}
            </div>
          )}
          {/* header */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><p className="text-[10px] uppercase tracking-wider text-slate-400">Document Type</p><p className="font-semibold">Tax Invoice</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-slate-400">Invoice Number</p><p className="font-mono text-slate-500">Auto-generated on save</p></div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Customer</p>
                <input value={customer} disabled={!editing} onChange={(e) => setCustomer(e.target.value)} className={`${inputClass} font-semibold`} />
              </div>
              <div><p className="text-[10px] uppercase tracking-wider text-slate-400">DC Number</p><p className="font-mono font-semibold">{dcNo || '—'}</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-slate-400">Sales Order No.</p><p className="font-mono font-semibold">{soNo || '—'}</p></div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Invoice Date</p>
                <input type="date" value={invDate} disabled={!editing} onChange={(e) => setInvDate(e.target.value)} className={inputClass} />
              </div>
              <div><p className="text-[10px] uppercase tracking-wider text-slate-400">Quotation</p><p className="font-semibold">{quoteNo || '—'}</p></div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Status</p>
                <p><Badge variant={blocked ? 'error' : statusToVariant('Pending')} dot>{blocked ? 'Blocked' : 'Ready'}</Badge></p>
              </div>
            </div>
            {orderQty && (
              <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 text-xs">
                <span className="font-bold text-violet-800 uppercase tracking-wider text-[10px]">Order quantity — </span>
                <span className="tabular-nums">Ordered {orderQty.ordered} · Good {orderQty.good} · Rejected {orderQty.rejected} · Delivered {orderQty.delivered} · Invoiced {orderQty.invoiced} · </span>
                <b className="tabular-nums text-violet-800">Still invoiceable after this invoice: {Math.max(0, orderQty.delivered - orderQty.invoiced - dcTotal)}</b>
                <span className="text-slate-500"> (this DC: {dcTotal} pcs at approved unit price — never the full order qty)</span>
              </div>
            )}
          </div>

          {/* items */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-3 border-b border-brand-100 pb-2">Item Details</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead><tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="text-left py-2">Item Name</th><th className="text-left py-2">Product Code</th>
                  <th className="text-right py-2">Qty</th><th className="text-left py-2">Unit</th>
                  <th className="text-right py-2">System Approved Unit Price</th><th className="text-right py-2">Invoice Unit Price</th>
                  <th className="text-right py-2">Basic Amount</th>
                </tr></thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.key} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 font-medium">{l.itemName || '—'}</td>
                      <td className="py-2 font-mono text-xs">{l.productCode || '—'}</td>
                      <td className="py-2 text-right">
                        {editing
                          ? <input type="number" min="0" value={l.qty} onChange={(e) => setLine(l.key, { qty: num(e.target.value) })} className="w-20 text-right text-xs rounded border border-slate-300 px-1.5 py-1" />
                          : num(l.qty)}
                      </td>
                      <td className="py-2">{l.unit || '—'}</td>
                      <td className="py-2 text-right tabular-nums text-slate-500">{l.approvedUnit == null ? '—' : formatINR(l.approvedUnit)}</td>
                      <td className="py-2 text-right">
                        {editing
                          ? <input type="number" min="0" value={l.unitInput} onChange={(e) => setLine(l.key, { unitInput: e.target.value })} placeholder={l.approvedUnit == null ? '' : String(Math.round(l.approvedUnit * 100) / 100)} className="w-24 text-right text-xs rounded border border-slate-300 px-1.5 py-1" />
                          : <span className="font-semibold tabular-nums">{formatINR(effUnit(l))}</span>}
                      </td>
                      <td className="py-2 text-right font-bold tabular-nums">{formatINR(num(l.qty) * effUnit(l))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {edited && (
              <div className="mt-2 text-sm flex flex-wrap gap-x-6 gap-y-1">
                <span>Original Approved Price: <b className="tabular-nums">{formatINR(origTotal)}</b></span>
                <span>Edited Invoice Price: <b className="tabular-nums">{formatINR(basic)}</b></span>
                <span>Adjustment: <b className={`tabular-nums ${adjustment >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{adjustment >= 0 ? '+' : ''}{formatINR(adjustment)}</b></span>
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-2">Unit prices come from the approved Finished Goods costing — never re-entered. The FG approved price itself is never modified here.</p>
          </div>

          {/* tax */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-3 border-b border-brand-100 pb-2">Tax (company GST rules apply on save)</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">CGST (%)</p>
                <input type="number" min="0" value={cgst} disabled={!editing} onChange={(e) => setCgst(e.target.value)} placeholder="Company default" className={inputClass} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">SGST (%)</p>
                <input type="number" min="0" value={sgst} disabled={!editing} onChange={(e) => setSgst(e.target.value)} placeholder="Company default" className={inputClass} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">IGST (%)</p>
                <input type="number" min="0" value={igst} disabled={!editing} onChange={(e) => setIgst(e.target.value)} placeholder="Company default" className={inputClass} />
              </div>
            </div>
            <div className="mt-3 text-sm space-y-1 max-w-xs ml-auto">
              <div className="flex justify-between"><span className="text-slate-500">Basic</span><span className="font-semibold tabular-nums">{formatINR(basic)}</span></div>
              {c !== null && <div className="flex justify-between"><span className="text-slate-500">CGST ({c}%)</span><span className="tabular-nums">{formatINR(basic * c / 100)}</span></div>}
              {s !== null && <div className="flex justify-between"><span className="text-slate-500">SGST ({s}%)</span><span className="tabular-nums">{formatINR(basic * s / 100)}</span></div>}
              {ig !== null && <div className="flex justify-between"><span className="text-slate-500">IGST ({ig}%)</span><span className="tabular-nums">{formatINR(basic * ig / 100)}</span></div>}
              {c === null && s === null && ig === null && <p className="text-xs text-slate-400">GST applied from company settings on save.</p>}
              <div className="flex justify-between border-t border-slate-200 pt-1"><span className="font-bold">Grand Total</span><span className="font-bold text-brand-700 tabular-nums">{formatINR(grand)}</span></div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
