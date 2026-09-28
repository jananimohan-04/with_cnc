// "Finished Goods + Costing" modal for the Sales Pipeline Kanban.
// Opened INSTEAD of moving an Inward card to Finished Goods: the user reviews the
// engine-calculated costing (same implementation as the Quotation Costing page),
// completes gaps manually when masters are missing, optionally edits the approved
// price, and only on "Approve & Move" does the modal (1) save an Approved costing
// version and (2) perform the exact Finished Goods transition the pipeline has
// always performed (insert Completed work order + mark inward rows Processed).
// Cancel writes nothing and the card stays put.

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { todayISO } from '@/lib/format';
import { Badge, Button, statusToVariant } from '@/components/ui/Card';
import { Modal, inputClass } from '@/components/ui/Modal';
import { downloadCostingDocument, viewCostingDocument } from '@/lib/brandedDocument';
import { printHtml } from '@/lib/reportExport';
import { useAuth } from '@/contexts/AuthContext';
import {
  costInr as inr, costNum as num, costUid as uid,
  buildMaterialLines, buildOpLines, computeTotals, computeWarnings,
  applyMatPatch, applyOpPatch,
  buildVersionPayload, buildCostingPdfInput, parseQuoteProducts,
  type MaterialLine, type OpLine,
} from '@/lib/costingEngine';
import { CheckCheck, Download, Eye, Printer, Save, AlertTriangle, X, Plus, Trash2, Pencil } from 'lucide-react';

const cellInputClass = `${inputClass} text-xs !px-2 !py-1 w-full min-w-[3.5rem] tabular-nums`;

function EditNum({ value, onChange, aria }: { value: string | number; onChange: (v: string) => void; aria: string }) {
  return <input type="number" aria-label={aria} value={value} onChange={(e) => onChange(e.target.value)} className={cellInputClass} />;
}

const ManualTag = () => (
  <span className="ml-1 text-[10px] font-bold uppercase text-brand-600 bg-brand-50 border border-brand-200 rounded px-1">Manual</span>
);

const panelTitleClass = 'text-[10px] font-bold uppercase tracking-widest mb-1';
const cellTh = 'text-left py-1.5 pr-2 font-bold text-slate-500 uppercase text-[10px] whitespace-nowrap';
const cellTd = 'py-1.5 pr-2 tabular-nums whitespace-nowrap';

export function FgCostingModal({ card, onClose, onMoved }: {
  card: any;
  onClose: () => void;
  onMoved: () => void;
}) {
  const { company, profile } = useAuth() as any;
  const companyName: string = company?.company_name ?? 'ARGUS CNC';
  const userName: string = profile?.email ?? '';

  const inward = card?.raw ?? {};
  const maxQ = num(card?.qty) || 0;

  const [fgQty, setFgQty] = useState(maxQ > 0 ? String(maxQ) : '');
  const [fgDate, setFgDate] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [quote, setQuote] = useState<any | null>(null);
  const [so, setSo] = useState<any | null>(null);
  const [wos, setWos] = useState<any[]>([]);
  const [bom, setBom] = useState<any[]>([]);
  const [rawMats, setRawMats] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Record<string, string>>({});
  const [jobCards, setJobCards] = useState<any[]>([]);
  const [woOps, setWoOps] = useState<any[]>([]);
  const [processes, setProcesses] = useState<any[]>([]);

  // Editable product code (drives the BOM lookup) + quotation overrides.
  const [code, setCode] = useState('');
  const [quoteQty, setQuoteQty] = useState('');
  const [quoteUnit, setQuoteUnit] = useState('');
  // Manual lines added by the user when masters are missing.
  const [extraMats, setExtraMats] = useState<MaterialLine[]>([]);
  const [extraOps, setExtraOps] = useState<OpLine[]>([]);
  const [newMat, setNewMat] = useState({ code: '', name: '', qty: '', unit: 'Nos', rate: '' });
  const [newOp, setNewOp] = useState({ process: '', machine: '', hours: '', mRate: '', lHours: '', lRate: '' });
  // Per-section edit mode + patches over auto lines (masters are never modified;
  // patched lines are flagged manual so adjustments stay visible).
  const [editMats, setEditMats] = useState(false);
  const [editOps, setEditOps] = useState(false);
  const [matPatches, setMatPatches] = useState<Record<string, MaterialLine>>({});
  const [opPatches, setOpPatches] = useState<Record<string, OpLine>>({});

  const [versions, setVersions] = useState<any[]>([]);
  const [sheetsMissing, setSheetsMissing] = useState(false);
  const [approvedInput, setApprovedInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  // ---- load live source records for this inward card ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const soRef: string = inward.sales_order_ref ?? '';
        let soRow: any = null;
        if (soRef) {
          const r = await supabase.from('cnc_sales_orders').select('*').eq('order_no', soRef).limit(1);
          if (!r.error && (r.data ?? []).length > 0) soRow = r.data![0];
        }
        if (cancelled) return;
        setSo(soRow);
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
        setQuote(qRow);
        setCode(soRow?.part_no || inward.part_number || qRow?.part_number || '');
        let woRows: any[] = [];
        if (soRow?.order_no) {
          const r = await supabase.from('cnc_work_orders').select('*').eq('sales_order', soRow.order_no).order('created_at');
          if (!r.error) woRows = r.data ?? [];
        }
        if (cancelled) return;
        setWos(woRows);
        const [rmRes, supRes, jcRes, wooRes, procRes] = await Promise.all([
          supabase.from('cnc_raw_materials').select('*'),
          supabase.from('cnc_suppliers').select('id,name'),
          woRows.length > 0
            ? supabase.from('cnc_job_cards').select('*').in('work_order', woRows.map((w) => w.wo_no))
            : Promise.resolve({ data: [], error: null } as any),
          woRows.length > 0
            ? supabase.from('cnc_work_order_operations').select('*').in('work_order_id', woRows.map((w) => w.id)).order('operation_sequence')
            : Promise.resolve({ data: [], error: null } as any),
          supabase.from('cnc_processes').select('*').order('process_code'),
        ]);
        if (cancelled) return;
        if (!rmRes.error) setRawMats(rmRes.data ?? []);
        if (!supRes.error) {
          const map: Record<string, string> = {};
          for (const s of supRes.data ?? []) map[String(s.id)] = s.name ?? '';
          setSuppliers(map);
        }
        if (!jcRes.error) setJobCards(jcRes.data ?? []);
        if (!wooRes.error && !(wooRes as any).error) setWoOps((wooRes.data ?? []) as any[]);
        if (!procRes.error) setProcesses(procRes.data ?? []);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- BOM follows the (editable) product code ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!code.trim()) { setBom([]); return; }
      const r = await supabase.from('cnc_bom').select('*').eq('parent_part_no', code.trim()).order('level').order('created_at');
      if (!cancelled && !r.error) setBom(r.data ?? []);
    })();
    return () => { cancelled = true; };
  }, [code]);

  // ---- versions follow quotation + product code ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!quote?.quote_no) return;
      const v = await supabase.from('cnc_costing_sheets').select('*')
        .eq('quotation_no', quote.quote_no).eq('product_code', code ?? '').order('version', { ascending: false });
      if (cancelled) return;
      if (!v.error) {
        setVersions(v.data ?? []);
        const latest = (v.data ?? [])[0];
        if (latest?.approved_price != null) setApprovedInput(String(latest.approved_price));
        if (latest?.lines?.quoteOverrides) {
          const qo = latest.lines.quoteOverrides;
          if (qo.qty != null) setQuoteQty(String(qo.qty));
          if (qo.unit != null) setQuoteUnit(String(qo.unit));
        }
      } else if ((v.error as any).code === 'PGRST205') {
        setSheetsMissing(true);
      }
    })();
    return () => { cancelled = true; };
  }, [quote, code]);

  const products = useMemo(() => (quote ? parseQuoteProducts(quote) : []), [quote]);
  const product = products[0] ?? null;
  const productName = inward.part_name || so?.part_name || product?.name || quote?.part_name || '';

  const baseQty = num(fgQty) > 0 ? num(fgQty) : 0;

  // Quotation overrides (edit the sheet's quoted qty / unit price, never the master).
  const qQtyEff = quoteQty.trim() === '' ? num(quote?.quantity) : num(quoteQty);
  const qUnitEff = quoteUnit.trim() === '' ? num(quote?.unit_price) : num(quoteUnit);
  const origBase = num(quote?.quantity) * num(quote?.unit_price);
  const quoteFactor = origBase > 0 ? num(quote?.total_value) / origBase : 1;
  const effQuoteTotal = qQtyEff * qUnitEff * quoteFactor;
  const quoteManual = quoteQty.trim() !== '' || quoteUnit.trim() !== '';
  const quoteOverrides = quoteManual ? { qty: quoteQty.trim() === '' ? null : num(quoteQty), unit: quoteUnit.trim() === '' ? null : num(quoteUnit) } : null;

  const autoMats = useMemo(
    () => buildMaterialLines(bom, rawMats, suppliers, baseQty),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bom, rawMats, suppliers, baseQty]);
  const autoOps = useMemo(
    () => buildOpLines(woOps, jobCards, processes, wos),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [woOps, jobCards, processes, wos]);
  const matLines = useMemo(() => [...autoMats.map((m) => matPatches[m.key] ?? m), ...extraMats], [autoMats, extraMats, matPatches]);
  const opLines = useMemo(() => {
    const startSeq = autoOps.length > 0 ? Math.max(...autoOps.map((o) => o.seq)) : 0;
    const base = [...autoOps.map((o) => opPatches[o.key] ?? o), ...extraOps.map((o, i) => ({ ...o, seq: startSeq + i + 1 }))];
    return base;
  }, [autoOps, extraOps, opPatches]);

  const patchMat = (key: string, patch: Partial<MaterialLine>) => {
    if (extraMats.some((m) => m.key === key)) {
      setExtraMats((ls) => applyMatPatch(ls, key, patch));
    } else {
      const base = matPatches[key] ?? autoMats.find((m) => m.key === key);
      if (base) setMatPatches((prev) => ({ ...prev, [key]: applyMatPatch([prev[key] ?? base], key, patch)[0] }));
    }
  };
  const patchOp = (key: string, patch: Partial<OpLine>) => {
    if (extraOps.some((o) => o.key === key)) {
      setExtraOps((ls) => applyOpPatch(ls, key, patch));
    } else {
      const base = opPatches[key] ?? autoOps.find((o) => o.key === key);
      if (base) setOpPatches((prev) => ({ ...prev, [key]: applyOpPatch([prev[key] ?? base], key, patch)[0] }));
    }
  };

  const buildPendingMat = (): MaterialLine | null => {
    if (!newMat.name.trim() || !(num(newMat.qty) > 0)) return null;
    const qty = num(newMat.qty);
    const rate = num(newMat.rate);
    return {
      key: uid(), material_code: newMat.code.trim(), material_name: newMat.name.trim(),
      req_qty: qty, unit: newMat.unit.trim() || 'Nos', unit_cost: rate, total: qty * rate,
      supplier: '', remarks: 'Added manually in pipeline', manual: true,
    };
  };

  const buildPendingOp = (existingCount: number): OpLine | null => {
    if (!newOp.process.trim() || !(num(newOp.hours) > 0)) return null;
    const mh = num(newOp.hours);
    const mRate = num(newOp.mRate);
    const lh = num(newOp.lHours);
    const lRate = num(newOp.lRate);
    const mc = mh * mRate;
    const lc = lh * lRate;
    return {
      key: uid(), seq: existingCount + 1,
      process_code: '', process_name: newOp.process.trim(),
      machine: newOp.machine.trim(), operator: '',
      machine_hours: mh, machine_rate: mRate, machine_cost: mc,
      labour_hours: lh, labour_rate: lRate, labour_cost: lc,
      cycle_time: 0, setup_time: 0,
      cost_per_hour: mRate, cost_per_component: 0, setup_cost: 0,
      // Machine cost is considered process cost.
      process_cost: mc + lc,
      manual: true, warn_machine: mh > 0 && mRate <= 0, warn_labour: lh > 0 && lRate <= 0,
    };
  };

  // Pending (typed but not yet Added) input counts too — it is committed
  // automatically on Save/Approve so typed values are never silently ignored.
  const draftMat = buildPendingMat();
  const draftOp = buildPendingOp(opLines.length);
  const effMatLines = draftMat ? [...matLines, draftMat] : matLines;
  const effOpLines = draftOp ? [...opLines, draftOp] : opLines;
  const effWarnings = computeWarnings({
    hasQuote: !!quote, baseQty, bom, woOps, jobCards, opLines: effOpLines,
    manualMaterials: effMatLines.some((m) => m.manual), manualOps: effOpLines.some((o) => o.manual),
  });
  // Effective totals include typed-but-unadded input, so values on screen always match.
  const effTotals = computeTotals(effMatLines, effOpLines, effQuoteTotal);

  const totals = useMemo(
    () => computeTotals(effMatLines, effOpLines, effQuoteTotal),
    [effMatLines, effOpLines, effQuoteTotal]);
  const warnings = effWarnings;

  const approvedNum = approvedInput.trim() === '' ? null : num(approvedInput);
  const effectiveApproved = approvedNum ?? totals.calculated;
  const adjustment = effectiveApproved - totals.calculated;
  // Comparison: quotation (quoted) vs project cost (manufacturing cost).
  const projectCost = totals.material + totals.process;
  const costDiff = effQuoteTotal - projectCost;
  const costDiffPct = effQuoteTotal > 0 ? (costDiff / effQuoteTotal) * 100 : null;
  const nextVersion = (versions[0]?.version ?? 0) + 1;
  const blockReasons: string[] = [];
  if (loading) blockReasons.push('Costing data is still loading.');
  if (loadError) blockReasons.push('Costing data failed to load.');
  if (!quote) blockReasons.push('No quotation is linked to this inward.');
  if (sheetsMissing) blockReasons.push('Costing storage is not provisioned (apply migration 20260930000000_costing_sheets.sql).');
  if (!(baseQty > 0)) blockReasons.push('Enter a quantity greater than 0.');
  if (baseQty > maxQ) blockReasons.push(`Quantity exceeds the inwarded amount (${maxQ}).`);
  // TESTING: BOM / work-order warnings (effWarnings) do not block approval for now.
  const canApprove = blockReasons.length === 0;

  const addManualMat = () => {
    const line = buildPendingMat();
    if (!line) return;
    setExtraMats((ls) => [...ls, line]);
    setNewMat({ code: '', name: '', qty: '', unit: 'Nos', rate: '' });
  };

  const addManualOp = () => {
    const line = buildPendingOp(opLines.length);
    if (!line) return;
    setExtraOps((ls) => [...ls, line]);
    setNewOp({ process: '', machine: '', hours: '', mRate: '', lHours: '', lRate: '' });
  };

  const pdfInput = () => buildCostingPdfInput({
    companyName,
    documentNo: `FG-${inward.inward_no ?? 'INW'}-V${nextVersion}`,
    date: fgDate,
    quote, so,
    product: { code, name: productName, qty: baseQty, unitPrice: qUnitEff },
    productCode: code, baseQty,
    inwardNo: inward.inward_no ?? '',
    status: versions[0]?.status ?? 'Draft',
    matLines: effMatLines, opLines: effOpLines, totals,
    approved: effectiveApproved, latestVersion: versions[0] ?? null, userName,
  });

  const handlePrint = () => {
    const row = (cells: string[]) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    printHtml(`Finished Goods Costing - ${inward.inward_no ?? ''}`, `
      <h2>${companyName} — Finished Goods / Costing (${inward.inward_no ?? ''})</h2>
      <p>Inward: ${inward.inward_no ?? ''} | SO: ${so?.order_no ?? ''} | Customer: ${card?.customer ?? ''} | Product: ${productName} (${code || '—'}) | Qty: ${baseQty}</p>
      <p>Project Costing ${inr(totals.calculated)} | Material ${inr(totals.material)} | Machine & Labour ${inr(totals.machineLabour)} | Process ${inr(totals.process)}</p>
      <h3>Calculated ${inr(totals.calculated)} | Approved ${inr(effectiveApproved)} | Adjustment ${adjustment >= 0 ? '+' : ''}${inr(adjustment)}</h3>
      <table><thead><tr><th>Material</th><th>Qty</th><th>Total</th></tr></thead>
      <tbody>${effMatLines.map((m) => row([m.material_name, `${m.req_qty} ${m.unit}`, inr(m.total)])).join('')}</tbody></table>
      <table><thead><tr><th>Op</th><th>Process</th><th>Machine</th><th>Mc Cost</th><th>Lab Cost</th><th>Process Cost</th></tr></thead>
      <tbody>${effOpLines.map((o) => row([String(o.seq), o.process_name, o.machine, inr(o.machine_cost), inr(o.labour_cost), inr(o.process_cost)])).join('')}</tbody></table>`);
  };

  const persistVersion = async (status: 'Draft' | 'Calculated' | 'Approved', approved: number) => {
    // Commit any typed-but-unadded input first so the saved version matches the screen.
    if (draftMat) setExtraMats((ls) => [...ls, draftMat]);
    if (draftOp) setExtraOps((ls) => [...ls, draftOp]);
    const { error } = await supabase.from('cnc_costing_sheets').insert([
      buildVersionPayload({
        quote, so, productCode: code, productName, baseQty,
        status, version: nextVersion, totals, approved,
        matLines: effMatLines, opLines: effOpLines, userName, quoteOverrides,
      }),
    ]);
    if (error) throw error;
  };

  const reloadVersions = async () => {
    if (!quote?.quote_no) return;
    const v = await supabase.from('cnc_costing_sheets').select('*')
      .eq('quotation_no', quote.quote_no).eq('product_code', code ?? '').order('version', { ascending: false });
    if (!v.error) setVersions(v.data ?? []);
  };

  const saveDraft = async () => {
    if (sheetsMissing) {
      alert('Costing storage is not provisioned. Apply supabase/migrations/20260930000000_costing_sheets.sql first.');
      return;
    }
    if (!quote || baseQty <= 0) {
      alert('A quotation and a quantity greater than 0 are required before saving.');
      return;
    }
    setSaving(true);
    try {
      await persistVersion('Draft', effectiveApproved);
      await reloadVersions();
      alert(`Costing draft saved as version ${nextVersion}. The card stays in Inward until approval.`);
    } catch (e: any) {
      alert(`Failed to save draft: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  const approveAndMove = async () => {
    if (approving) return;
    if (!canApprove) {
      alert(`Cannot approve yet:\n- ${blockReasons.join('\n- ')}`);
      return;
    }
    setApproving(true);
    try {
      const groupIds: string[] = Array.isArray(inward._groupIds) && inward._groupIds.length
        ? inward._groupIds : (inward.id ? [inward.id] : []);
      if (groupIds.length > 0) {
        const chk = await supabase.from('cnc_inwards').select('id,status').in('id', groupIds);
        if (!chk.error && (chk.data ?? []).every((r: any) => r.status === 'Processed')) {
          alert('This inward was already moved to Finished Goods. Refresh the board.');
          onMoved();
          onClose();
          return;
        }
      }
      // 1) Save the Approved costing version (same payload shape as the costing page).
      if (!quote) throw new Error('No quotation linked to this inward — cannot save costing.');
      await persistVersion('Approved', effectiveApproved);
      // 2) The exact Finished Goods transition the pipeline has always performed.
      const woNo = `WO-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const woErr = await supabase.from('cnc_work_orders').insert([{
        id: crypto.randomUUID(), wo_no: woNo, customer: card.customer,
        part_name: inward.part_name || productName, part_no: inward.part_number || code || 'N/A',
        completed: baseQty, status: 'Completed',
        sales_order: inward.sales_order_ref || '', quantity: maxQ, start_date: fgDate, due_date: fgDate,
        priority: 'Normal', drawing_revision: '0', description: '',
        created_at: fgDate + 'T00:00:00Z',
      }]);
      if (woErr.error) throw woErr.error;
      if (groupIds.length > 0) {
        const inwQuery = supabase.from('cnc_inwards').update({ status: 'Processed' });
        const inwRes = groupIds.length > 1 ? await inwQuery.in('id', groupIds) : await inwQuery.eq('id', groupIds[0]);
        if (inwRes.error) console.error('Failed to update inward status:', inwRes.error);
      }
      onMoved();
      onClose();
    } catch (e: any) {
      alert(`Approve & Move failed: ${e?.message ?? e}. Nothing was moved.`);
    } finally {
      setApproving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Finished Goods + Costing"
      subtitle={`Inward ${inward.inward_no ?? ''} → Finished Goods with pricing approval`}
      size="3xl"
      footer={
        <>
          <Button variant="secondary" icon={<Eye size={14} />} onClick={() => { try { viewCostingDocument(pdfInput()); } catch (e: any) { alert(e?.message ?? e); } }}>
            Preview PDF
          </Button>
          <Button variant="secondary" icon={<Download size={14} />} onClick={() => { downloadCostingDocument(pdfInput()).catch((e: any) => alert(e?.message ?? e)); }}>
            Download PDF
          </Button>
          <Button variant="secondary" icon={<Printer size={14} />} onClick={handlePrint}>Print</Button>
          <span className="flex-1" />
          <Button variant="secondary" icon={<X size={14} />} onClick={onClose}>Cancel</Button>
          <Button variant="secondary" icon={<Save size={14} />} disabled={saving || loading || !quote} onClick={saveDraft}>
            {saving ? 'Saving...' : 'Save Draft'}
          </Button>
          <Button icon={<CheckCheck size={14} />} disabled={!canApprove || approving}
            title={canApprove ? 'Approve pricing and move the card' : `Blocked: ${blockReasons[0] ?? 'resolving'}`}
            onClick={approveAndMove}>
            {approving ? 'Moving...' : 'Approve & Move to Finished Goods'}
          </Button>
        </>
      }
    >
      {loading ? (
        <p className="text-sm text-slate-500 py-8 text-center">Loading live transaction records and costing...</p>
      ) : loadError ? (
        <p className="text-sm text-red-600 py-8 text-center">Failed to load costing data: {loadError}</p>
      ) : (
        <div className="space-y-4">
          {/* 1 — transaction details */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-3 border-b border-brand-100 pb-2">Section 1 — Transaction Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><p className="text-[10px] uppercase tracking-wider text-slate-400">Inward No.</p><p className="font-mono font-bold">{inward.inward_no ?? '—'}</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-slate-400">Sales Order No.</p><p className="font-mono font-semibold">{so?.order_no ?? inward.sales_order_ref ?? '—'}</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-slate-400">Customer</p><p className="font-semibold">{card?.customer ?? '—'}</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-slate-400">Product</p><p className="font-semibold">{productName || '—'}</p></div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Product Code (drives BOM lookup)</p>
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter product code..." className={inputClass} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Quantity (max {maxQ})</p>
                <input type="number" min="0" value={fgQty} onChange={(e) => setFgQty(e.target.value)} className={`${inputClass} font-semibold`} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Date</p>
                <input type="date" value={fgDate} onChange={(e) => setFgDate(e.target.value)} className={inputClass} />
              </div>
              <div><p className="text-[10px] uppercase tracking-wider text-slate-400">Quotation</p><p className="font-semibold">{quote ? `${quote.quote_no} · ${inr(quote.total_value)}` : 'Not linked'}</p></div>
            </div>
          </div>

          {/* comparison workspace: quotation vs project costing */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          {/* LEFT — quotation (reference only, master never modified) */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className={`${panelTitleClass} text-brand-600 border-b border-brand-100 pb-2`}>Quotation</h3>
            <p className="text-[11px] text-slate-400 mt-1 mb-3">Customer quoted price</p>
            {!quote ? (
              <p className="text-sm text-slate-400">No quotation linked to this inward — costing starts from materials and operations only.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-[10px] uppercase tracking-wider text-slate-400">Quote No</p><p className="font-mono font-semibold">{quote.quote_no}</p></div>
                <div><p className="text-[10px] uppercase tracking-wider text-slate-400">Sales Order No</p><p className="font-mono font-semibold">{so?.order_no ?? inward.sales_order_ref ?? '—'}</p></div>
                <div><p className="text-[10px] uppercase tracking-wider text-slate-400">Customer</p><p className="font-semibold">{quote.customer || card?.customer || '—'}</p></div>
                <div><p className="text-[10px] uppercase tracking-wider text-slate-400">Product</p><p className="font-semibold">{productName || '—'}</p></div>
                <div><p className="text-[10px] uppercase tracking-wider text-slate-400">Product Code</p><p className="font-mono font-semibold">{code || product?.code || '—'}</p></div>
                <div><p className="text-[10px] uppercase tracking-wider text-slate-400">Quoted Qty</p><p className="font-semibold">{quote.quantity}</p></div>
                <div><p className="text-[10px] uppercase tracking-wider text-slate-400">Unit Price</p><p className="font-semibold">{inr(quote.unit_price)}</p></div>
                <div><p className="text-[10px] uppercase tracking-wider text-slate-400">Discount / GST</p><p className="font-semibold">{num(quote.discount_percent)}% / {num(quote.gst_percent)}%</p></div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">Qty Override</p>
                  <input type="number" min="0" value={quoteQty} onChange={(e) => setQuoteQty(e.target.value)} placeholder={String(quote.quantity ?? '')} className={inputClass} />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">Unit Price Override (₹)</p>
                  <input type="number" min="0" value={quoteUnit} onChange={(e) => setQuoteUnit(e.target.value)} placeholder={String(quote.unit_price ?? '')} className={inputClass} />
                </div>
                <div className="col-span-2 rounded-lg bg-brand-50/60 border border-brand-100 px-3 py-2 flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-wider text-brand-700 font-bold">Quotation Total {quoteManual && <span className="ml-1 text-brand-700 bg-white border border-brand-200 rounded px-1">Manual</span>}</p>
                  <p className="font-bold tabular-nums text-lg text-brand-800">{inr(effQuoteTotal)}</p>
                </div>
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-2">Reference values — overrides affect this sheet only (discount/tax ratio preserved). The quotation master is never modified.</p>
          </div>

          {/* RIGHT — project costing (actual estimated manufacturing cost) */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-5">
            <div>
              <h3 className={`${panelTitleClass} text-brand-600 border-b border-brand-100 pb-2`}>Project Costing</h3>
              <p className="text-[11px] text-slate-400 mt-1">Actual estimated manufacturing cost</p>
            </div>

            {/* 1 — process costing */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">1. Process Costing</h4>
                <button type="button" onClick={() => setEditOps((v) => !v)} className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:text-brand-800 border border-brand-200 hover:border-brand-400 rounded px-2 py-0.5 bg-brand-50/50">
                  <Pencil size={11} />{editOps ? 'Done' : 'Edit'}
                </button>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50"><tr><th className={cellTh}>#</th><th className={cellTh}>Operation / Process</th><th className={cellTh}>Machine</th><th className={cellTh}>Qty</th><th className={cellTh}>Cycle</th><th className={cellTh}>₹/Hr</th><th className={cellTh}>Setup</th><th className={cellTh}>Comp</th><th className={`${cellTh} text-right`}>Process Cost</th></tr></thead>
                  <tbody>
                    {effOpLines.length === 0 && (<tr><td colSpan={9} className="py-3 text-center text-slate-400">No operations yet — add one below.</td></tr>)}
                    {effOpLines.map((o) => (
                      <tr key={o.key} className="border-t border-slate-100">
                        <td className={cellTd}>{o.seq}</td>
                        <td className={`${cellTd} font-medium text-slate-700`}>{o.process_name || o.process_code || '—'}{o.manual && <ManualTag />}</td>
                        <td className={cellTd}>{o.machine || '—'}</td>
                        <td className={cellTd}>{baseQty}</td>
                        <td className={cellTd}>{o.cycle_time}</td>
                        <td className={cellTd}>{editOps ? <EditNum aria="Cost per hour" value={o.cost_per_hour} onChange={(v) => patchOp(o.key, { cost_per_hour: v, machine_rate: v })} /> : inr(o.cost_per_hour)}</td>
                        <td className={cellTd}>{editOps ? <EditNum aria="Setup cost" value={o.setup_cost} onChange={(v) => patchOp(o.key, { setup_cost: v })} /> : inr(o.setup_cost)}</td>
                        <td className={cellTd}>{editOps ? <EditNum aria="Cost per component" value={o.cost_per_component} onChange={(v) => patchOp(o.key, { cost_per_component: v })} /> : inr(o.cost_per_component)}</td>
                        <td className={`${cellTd} text-right font-bold`}>{inr(o.process_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between mt-1.5 text-sm">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Process Cost</span>
                <span className="font-bold tabular-nums">{inr(totals.process)}</span>
              </div>
            </div>

            {/* 2 — material cost */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">2. Material Cost</h4>
                <button type="button" onClick={() => setEditMats((v) => !v)} className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:text-brand-800 border border-brand-200 hover:border-brand-400 rounded px-2 py-0.5 bg-brand-50/50">
                  <Pencil size={11} />{editMats ? 'Done' : 'Edit'}
                </button>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50"><tr><th className={cellTh}>Material</th><th className={cellTh}>Req Qty</th><th className={cellTh}>Unit</th><th className={cellTh}>Unit Cost</th><th className={`${cellTh} text-right`}>Total</th>{editMats && <th className={cellTh} />}</tr></thead>
                  <tbody>
                    {effMatLines.length === 0 && (<tr><td colSpan={6} className="py-3 text-center text-slate-400">No material lines yet — add one below.</td></tr>)}
                    {effMatLines.map((m) => (
                      <tr key={m.key} className="border-t border-slate-100">
                        <td className={`${cellTd} font-medium text-slate-700`}>{m.material_name || '—'}{m.manual && <ManualTag />}</td>
                        <td className={cellTd}>{editMats ? <EditNum aria="Required qty" value={m.req_qty} onChange={(v) => patchMat(m.key, { req_qty: v })} /> : m.req_qty}</td>
                        <td className={cellTd}>{m.unit}</td>
                        <td className={cellTd}>{editMats ? <EditNum aria="Unit cost" value={m.unit_cost} onChange={(v) => patchMat(m.key, { unit_cost: v })} /> : inr(m.unit_cost)}</td>
                        <td className={`${cellTd} text-right font-bold`}>{inr(m.total)}</td>
                        {editMats && (
                          <td className={cellTd}>
                            {extraMats.some((x) => x.key === m.key) && (
                              <button onClick={() => setExtraMats((ls) => ls.filter((x) => x.key !== m.key))} className="text-slate-400 hover:text-red-600" title="Remove"><Trash2 size={13} /></button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between mt-1.5 text-sm">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Material Cost</span>
                <span className="font-bold tabular-nums">{inr(totals.material)}</span>
              </div>
              <div className="border border-dashed border-slate-300 rounded-lg p-2.5 mt-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Add material line</p>
                <div className="grid grid-cols-2 gap-2">
                  <input value={newMat.name} onChange={(e) => setNewMat({ ...newMat, name: e.target.value })} placeholder="Material name *" className={`${inputClass} text-xs`} />
                  <input value={newMat.code} onChange={(e) => setNewMat({ ...newMat, code: e.target.value })} placeholder="Code" className={`${inputClass} text-xs`} />
                  <input type="number" min="0" value={newMat.qty} onChange={(e) => setNewMat({ ...newMat, qty: e.target.value })} placeholder="Qty *" className={`${inputClass} text-xs`} />
                  <input type="number" min="0" value={newMat.rate} onChange={(e) => setNewMat({ ...newMat, rate: e.target.value })} placeholder="Unit cost ₹" className={`${inputClass} text-xs`} />
                </div>
                <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={addManualMat} className="mt-2">Add material to costing</Button>
              </div>
            </div>

            {/* 3 — machine & labour */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">3. Machine &amp; Labour</h4>
                <button type="button" onClick={() => setEditOps((v) => !v)} className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:text-brand-800 border border-brand-200 hover:border-brand-400 rounded px-2 py-0.5 bg-brand-50/50">
                  <Pencil size={11} />{editOps ? 'Done' : 'Edit'}
                </button>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50"><tr><th className={cellTh}>Machine</th><th className={cellTh}>Mc Hrs</th><th className={cellTh}>Mc Rate</th><th className={cellTh}>Mc Cost</th><th className={cellTh}>Operator</th><th className={cellTh}>Lab Hrs</th><th className={cellTh}>Lab Rate</th><th className={`${cellTh} text-right`}>Lab Cost</th></tr></thead>
                  <tbody>
                    {effOpLines.length === 0 && (<tr><td colSpan={8} className="py-3 text-center text-slate-400">No operations yet — add one below.</td></tr>)}
                    {effOpLines.map((o) => (
                      <tr key={o.key} className="border-t border-slate-100">
                        <td className={`${cellTd} font-medium text-slate-700`}>{o.machine || '—'}{o.manual && <ManualTag />}</td>
                        <td className={cellTd}>{editOps ? <EditNum aria="Machine hours" value={o.machine_hours} onChange={(v) => patchOp(o.key, { machine_hours: v })} /> : Math.round(o.machine_hours * 100) / 100}</td>
                        <td className={cellTd}>{editOps ? <EditNum aria="Machine rate" value={o.machine_rate} onChange={(v) => patchOp(o.key, { machine_rate: v, cost_per_hour: v })} /> : inr(o.machine_rate)}</td>
                        <td className={`${cellTd} font-semibold`}>{inr(o.machine_cost)}</td>
                        <td className={cellTd}>{o.operator || '—'}</td>
                        <td className={cellTd}>{editOps ? <EditNum aria="Labour hours" value={o.labour_hours} onChange={(v) => patchOp(o.key, { labour_hours: v })} /> : Math.round(o.labour_hours * 100) / 100}</td>
                        <td className={cellTd}>{editOps ? <EditNum aria="Labour rate" value={o.labour_rate} onChange={(v) => patchOp(o.key, { labour_rate: v })} /> : inr(o.labour_rate)}</td>
                        <td className={`${cellTd} text-right font-semibold`}>{inr(o.labour_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-1.5 space-y-0.5 text-sm">
                <div className="flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Machine Cost</span><span className="font-bold tabular-nums">{inr(totals.machine)}</span></div>
                <div className="flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Labour Cost</span><span className="font-bold tabular-nums">{inr(totals.labour)}</span></div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-1"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">Total Machine &amp; Labour Cost</span><span className="font-bold tabular-nums">{inr(totals.machineLabour)}</span></div>
              </div>
              <div className="border border-dashed border-slate-300 rounded-lg p-2.5 mt-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Add operation line</p>
                <div className="grid grid-cols-2 gap-2">
                  <input value={newOp.process} onChange={(e) => setNewOp({ ...newOp, process: e.target.value })} placeholder="Process *" className={`${inputClass} text-xs`} />
                  <input value={newOp.machine} onChange={(e) => setNewOp({ ...newOp, machine: e.target.value })} placeholder="Machine" className={`${inputClass} text-xs`} />
                  <input type="number" min="0" step="0.01" value={newOp.hours} onChange={(e) => setNewOp({ ...newOp, hours: e.target.value })} placeholder="Mc hours *" className={`${inputClass} text-xs`} />
                  <input type="number" min="0" value={newOp.mRate} onChange={(e) => setNewOp({ ...newOp, mRate: e.target.value })} placeholder="Mc rate ₹/h" className={`${inputClass} text-xs`} />
                  <input type="number" min="0" step="0.01" value={newOp.lHours} onChange={(e) => setNewOp({ ...newOp, lHours: e.target.value })} placeholder="Lab hours" className={`${inputClass} text-xs`} />
                  <input type="number" min="0" value={newOp.lRate} onChange={(e) => setNewOp({ ...newOp, lRate: e.target.value })} placeholder="Lab rate ₹/h" className={`${inputClass} text-xs`} />
                </div>
                <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={addManualOp} className="mt-2">Add operation to costing</Button>
              </div>
              {extraOps.length > 0 && (
                <div className="mt-2 space-y-1">
                  {extraOps.map((o) => (
                    <p key={o.key} className="text-xs flex items-center gap-2">
                      <ManualTag />
                      {o.process_name} · {o.machine_hours}h · {inr(o.machine_cost + o.labour_cost)}
                      <button onClick={() => setExtraOps((ls) => ls.filter((x) => x.key !== o.key))} className="text-slate-400 hover:text-red-600" title="Remove"><Trash2 size={13} /></button>
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
          </div>

          {/* cost summary — quotation vs project cost */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className={`${panelTitleClass} text-brand-600 border-b border-brand-100 pb-2`}>Cost Summary — Quotation vs Project Cost</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm mt-3">
              <div className="border border-slate-200 rounded-lg px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Quotation Total</p>
                <p className="font-bold tabular-nums text-lg">{inr(effQuoteTotal)}</p>
              </div>
              <div className="border border-slate-200 rounded-lg px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Project Cost</p>
                <p className="font-bold tabular-nums text-lg">{inr(projectCost)}</p>
                <p className="text-[11px] text-slate-400">Material {inr(totals.material)} + Process {inr(totals.process)}</p>
              </div>
              <div className={`border rounded-lg px-3 py-2 ${costDiff < 0 ? 'border-red-200 bg-red-50/50' : 'border-emerald-200 bg-emerald-50/50'}`}>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Cost Difference</p>
                <p className={`font-bold tabular-nums text-lg ${costDiff < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{costDiff >= 0 ? '+' : ''}{inr(costDiff)}{costDiffPct == null ? '' : ` (${costDiffPct >= 0 ? '+' : ''}${costDiffPct.toFixed(1)}%)`}</p>
                <p className="text-[11px] text-slate-400">Quotation − Project Cost{costDiffPct == null ? '' : ' · (Diff ÷ Quotation) × 100'}</p>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              {effMatLines.length} material line(s) · {effOpLines.length} operation(s)
              {versions[0] ? ` · Latest saved version V${versions[0].version} (${versions[0].status})` : ' · Not saved yet'}
            </p>
          </div>

          {/* 3 — final price */}
          <div className="rounded-xl p-4 bg-gradient-to-br from-navy-900 to-navy-800 text-white">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-brand-400 mb-2">Section 3 — Final Price</h3>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-300">System Calculated Price</p>
                <p className="text-3xl font-bold text-brand-400 tabular-nums">{inr(totals.calculated)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-300">Approved Final Price</p>
                <input type="number" min="0" value={approvedInput} onChange={(e) => setApprovedInput(e.target.value)}
                  placeholder={String(Math.round(totals.calculated))}
                  className="w-48 text-right font-bold text-navy-900 rounded-lg px-3 py-1.5 text-lg" />
              </div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm">
              <span>Calculated: <b className="tabular-nums">{inr(totals.calculated)}</b></span>
              <span>Approved: <b className="tabular-nums">{inr(effectiveApproved)}</b></span>
              <span>Manual Adjustment: <b className={`tabular-nums ${adjustment >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{adjustment >= 0 ? '+' : ''}{inr(adjustment)}</b></span>
            </div>
          </div>

          {/* TESTING: Section 4 — Warnings hidden for now (BOM / work-order warnings don't block approval). */}

          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Sheet status:</span>
            <Badge variant={statusToVariant(versions[0]?.status ?? 'Draft')} dot>{versions[0] ? `V${versions[0].version} ${versions[0].status}` : 'Unsaved'}</Badge>
          </div>
        </div>
      )}
    </Modal>
  );
}
