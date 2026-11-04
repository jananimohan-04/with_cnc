import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Printer, Search, Package, ChevronDown, ChevronUp, ChevronsUpDown, Layers, Filter } from 'lucide-react';
import { Badge, Button, Card, statusToVariant } from '@/components/ui/Card';
import { inputClass } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDate, formatINR, todayISO } from '@/lib/format';
import { exportCsv, escapeHtml, printHtml } from '@/lib/reportExport';
import { supabase } from '@/lib/supabase';
import { machineCostTotal, quoteNameKey, valueOperations } from '@/lib/projectCosting';
import { calcJobCardHours } from '@/lib/costingEngine';
import { useAuth } from '@/contexts/AuthContext';
import { useHeaderKpis } from '@/contexts/HeaderKpiContext';

export type ProjectRow = {
  project_name: string;
  party_name: string;
  part_name: string;
  quantity: string | null;
  planned_cost: string | null;
  actual_cost: string | null;
  sales_value: string | null;
  cost_source: string | null;
  profit?: string | null;
  profit_pct?: string | null;
};

export type CostingDetail = {
  project: ProjectRow & {
    product_cost: string | null;
    process_cost: string | null;
    invoice_value: string | null;
  };
  categories: { category: string; amount: string }[];
  processes: {
    id: string;
    process: string;
    supplier: string;
    duration: string;
    quantity: string;
    rate: string;
    amount: string;
    created_at: string;
  }[];
  materials: {
    id: string;
    date: string;
    type: string;
    reference: string;
    item: string;
    quantity: string;
    unit: string;
    rate: string;
    amount: string;
    work_order: string;
    request_no: string;
  }[];
  services: {
    id: string;
    date: string;
    type: string;
    reference: string;
    item: string;
    quantity: string;
    unit: string;
    rate: string;
    amount: string;
    work_order: string;
    request_no: string;
  }[];
  work_orders: {
    id: string;
    wo_no: string;
    sales_order: string;
    customer: string;
    part_name: string;
    part_no: string;
    quantity: string;
    completed: string;
    rejected: string;
    status: string;
    due_date: string;
  }[];
  operations?: {
    id: string;
    job_no: string | null;
    op_no?: number | null;
    operation: string;
    machine: string;
    operator: string;
    qty_planned: string;
    qty_completed: string;
    qty_rejected: string;
    cycle_time: string;
    setup_time: string;
    actual_minutes?: string;
    hours?: number;
    status: string;
    start_time?: string;
    end_time?: string;
    actual_start?: string;
    actual_end?: string;
    completed_at?: string;
    created_at?: string;
  }[];
  processOps?: any[];
  processOpsTotal?: number;
  expenses?: any[];
};

const money = (v: string | number | null | undefined) =>
  v == null || v === '' ? '—' : formatINR(v, { decimals: 'auto' });

const tabs = [
  'Goods Purchase',
  'Service Purchase',
  'Machine Cost',
  'Expenses',
  'All Costings',
];

const isGoodsPurchaseCategory = (cat: string | null | undefined) => {
  if (!cat) return false;
  const s = String(cat).trim().toUpperCase();
  return s.includes('GOODS PURCHASE') || s.includes('GOODS_PURCHASE') || s === 'PURCHASE';
};

const isServicePurchaseCategory = (cat: string | null | undefined) => {
  if (!cat) return false;
  const s = String(cat).trim().toUpperCase();
  return s.includes('SERVICE PURCHASE') || s.includes('SERVICE_PURCHASE') || s === 'SERVICE';
};

const isPurchaseCategory = (cat: string | null | undefined) =>
  isGoodsPurchaseCategory(cat) || isServicePurchaseCategory(cat);

async function loadQuoteLookup() {
  const lc = (v: unknown) => String(v ?? '').trim().toLowerCase();
  const [{ data: sos }, { data: quotes }] = await Promise.all([
    supabase.from('cnc_sales_orders').select('order_no, quotation_id, quote_no'),
    supabase.from('cnc_quotations').select('id, quote_no, customer, part_name, total_value'),
  ]);
  const quoteList = quotes ?? [];
  const totalOf = (q: any) => Number(q?.total_value) || 0;
  return (refs: unknown[], party: string | null, part: string | null): number | null => {
    const wanted = new Set(refs.map(lc).filter(Boolean));
    let sum = 0;
    const seen = new Set<string>();
    for (const so of sos ?? []) {
      if (!wanted.has(lc(so.order_no))) continue;
      const q = quoteList.find((x: any) => (so.quotation_id && x.id === so.quotation_id) || (so.quote_no && lc(x.quote_no) === lc(so.quote_no)));
      if (q && !seen.has(String(q.id))) { seen.add(String(q.id)); sum += totalOf(q); }
    }
    if (sum > 0) return sum;
    const wantPart = quoteNameKey(part);
    const byParty = quoteList.filter((q: any) => lc(q.customer) === lc(party) && (lc(q.part_name) === lc(part) || (!!wantPart && quoteNameKey(q.part_name) === wantPart)));
    const latest = byParty[byParty.length - 1];
    return latest && totalOf(latest) > 0 ? totalOf(latest) : null;
  };
}

export type SharedCostingData = {
  inwardRows: any[];
  allDbWos: any[];
  allJobCards: any[];
  allOperationPlans: any[];
  allWoOps: any[];
  allRoutings: any[];
  allCostingSheets: any[];
  quoteLookup: (refs: unknown[], party: string | null, part: string | null) => number | null;
};

// Compute complete costing details for a single project from base RPC and shared datasets
function computeProjectDetail(
  p: ProjectRow,
  baseReport: any,
  shared: SharedCostingData,
  procRates: any[]
): CostingDetail {
  const lc = (v: any) => String(v ?? '').trim().toLowerCase();
  const pProj = lc(p.project_name);
  const pPart = lc(p.part_name);
  const pParty = lc(p.party_name);
  const pPartKey = quoteNameKey(p.part_name);

  // 1. Work Orders
  const matchedDbWos = (shared.allDbWos || []).filter((w: any) => {
    const wNo = lc(w.wo_no);
    const wSo = lc(w.sales_order);
    const wPart = lc(w.part_name);
    const wCust = lc(w.customer);
    const wPartKey = quoteNameKey(w.part_name);

    if (wNo && wNo === pProj) return true;
    if (wSo && (wSo === pProj || wSo === pPart)) return true;
    if (pParty && wCust === pParty && (wPart === pPart || (pPartKey && wPartKey === pPartKey))) return true;
    if (wPart && wPart === pPart) return true;
    if (pPartKey && wPartKey && wPartKey === pPartKey) return true;
    return false;
  });

  const seenWos = new Set<string>();
  const allWorkOrders = [
    ...(baseReport?.work_orders || []),
    ...matchedDbWos.map((w: any) => ({
      id: w.id,
      wo_no: w.wo_no,
      sales_order: w.sales_order || '',
      customer: w.customer || '',
      part_name: w.part_name || '',
      part_no: w.part_no || '',
      quantity: String(w.quantity ?? 0),
      completed: String(w.completed ?? 0),
      rejected: String(w.rejected ?? 0),
      status: w.status || 'Planned',
      due_date: w.due_date || '',
    })),
  ].filter((w) => !seenWos.has(w.wo_no) && !seenWos.has(w.id) && !!seenWos.add(w.wo_no) && !!seenWos.add(w.id));

  // 2. Matching keys
  const matchingSo = new Set<string>();
  const matchingWo = new Set<string>();
  const allWoNos = new Set<string>();
  const allWoIds = new Set<string>();
  const candidatePartNames = new Set<string>();

  if (p.project_name) {
    matchingSo.add(pProj);
    matchingWo.add(pProj);
    allWoNos.add(p.project_name);
  }
  if (p.part_name) candidatePartNames.add(p.part_name);

  const isUuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v ?? ''));

  allWorkOrders.forEach((w: any) => {
    if (w.sales_order) matchingSo.add(lc(w.sales_order));
    if (w.wo_no) {
      matchingWo.add(lc(w.wo_no));
      allWoNos.add(w.wo_no);
    }
    if (w.id && isUuid(w.id)) allWoIds.add(String(w.id));
    if (w.part_name) candidatePartNames.add(w.part_name);
  });

  // 3. Inwards (Goods Purchase & Service Purchase)
  const purchaseInwards = (shared.inwardRows || []).filter((inv: any) => isPurchaseCategory(inv.category));
  const matchedInwards = purchaseInwards.filter((inv: any) => {
    const soRef = lc(inv.sales_order_ref);
    const projRef = lc(inv.project_name);
    const partyRef = lc(inv.party_name);
    const partRef = lc(inv.part_name);
    const prodRef = lc(inv.product_name);

    if (soRef && matchingSo.has(soRef)) return true;
    if (projRef && (matchingWo.has(projRef) || matchingSo.has(projRef))) return true;
    if (partyRef && partyRef === pParty && (partRef === pPart || prodRef === pPart)) return true;
    return false;
  });

  const toCostRow = (inv: any, type: string) => {
    const qty = Number(inv.quantity) || 0;
    const rate = Number(inv.price) || (qty > 0 ? (Number(inv.total_amount) || 0) / qty : 0);
    const amount = Number(inv.total_amount) || qty * rate;
    return {
      id: inv.id || crypto.randomUUID(),
      date: inv.inward_date || inv.created_at || todayISO(),
      type,
      reference: inv.reference_no ? `${inv.inward_no} (${inv.reference_no})` : inv.inward_no,
      item: inv.part_name || inv.product_name || `${type} Item`,
      quantity: String(qty),
      unit: 'pcs',
      rate: String(rate),
      amount: String(amount),
      work_order: inv.project_name || p.project_name,
      request_no: inv.inward_no,
    };
  };

  const inwardMaterials = matchedInwards
    .filter((inv: any) => isGoodsPurchaseCategory(inv.category))
    .map((inv: any) => toCostRow(inv, 'Goods Purchase'));
  const serviceRows = matchedInwards
    .filter((inv: any) => isServicePurchaseCategory(inv.category))
    .map((inv: any) => toCostRow(inv, 'Service Purchase'));

  const allMaterials = [...(baseReport?.materials || []), ...inwardMaterials];
  const totalMaterialCost = allMaterials.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  const inwardAmount = inwardMaterials.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  const serviceAmount = serviceRows.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

  // 4. Expenses
  const projectExpenses = (shared.inwardRows || []).filter((inv: any) => {
    if (String(inv.category || '').trim().toUpperCase() !== 'EXPENSES' || inv.status === 'Deleted') return false;
    const names = [inv.project_name, inv.product_name].map(lc).filter(Boolean);
    if (lc(inv.sales_order_ref) && matchingSo.has(lc(inv.sales_order_ref))) return true;
    if (names.some(n => n === pProj || n === pPart || matchingSo.has(n) || matchingWo.has(n))) return true;
    return !!lc(inv.party_name) && lc(inv.party_name) === pParty && lc(inv.part_name) === pPart;
  });

  // 5. Operations & Machine Cost
  const allWoIdentifiers = new Set<string>();
  allWoNos.forEach(n => {
    if (n) {
      allWoIdentifiers.add(String(n).trim());
      allWoIdentifiers.add(String(n).trim().toLowerCase());
    }
  });
  allWoIds.forEach(id => {
    if (id) {
      allWoIdentifiers.add(String(id).trim());
      allWoIdentifiers.add(String(id).trim().toLowerCase());
    }
  });
  matchingWo.forEach(m => {
    if (m) {
      allWoIdentifiers.add(String(m).trim());
      allWoIdentifiers.add(String(m).trim().toLowerCase());
    }
  });

  const jcMap = new Map<string, any>();
  const addJobCard = (j: any) => {
    if (!j || !j.id || jcMap.has(String(j.id))) return;
    jcMap.set(String(j.id), j);
  };

  (shared.allJobCards || []).forEach((j: any) => {
    const jWo = String(j.work_order || '').trim();
    const jWoLc = jWo.toLowerCase();
    const jWoId = String(j.work_order_id || '').trim().toLowerCase();
    const jPart = String(j.part_name || '').trim().toLowerCase();
    const jPartKey = quoteNameKey(j.part_name);

    if (jWo && (allWoIdentifiers.has(jWo) || allWoIdentifiers.has(jWoLc) || matchingSo.has(jWoLc) || matchingWo.has(jWoLc))) {
      addJobCard(j);
      return;
    }
    if (jWoId && (allWoIds.has(jWoId) || allWoIdentifiers.has(jWoId))) {
      addJobCard(j);
      return;
    }
    if (pPart && (jPart === pPart || (pPartKey && jPartKey === pPartKey))) {
      addJobCard(j);
      return;
    }
    if (candidatePartNames.has(j.part_name)) {
      addJobCard(j);
      return;
    }
  });

  const jcList = Array.from(jcMap.values());
  jcList.sort((a, b) => {
    if (a.op_no != null && b.op_no != null && a.op_no !== b.op_no) return a.op_no - b.op_no;
    const aT = new Date(a.actual_start || a.created_at || 0).getTime();
    const bT = new Date(b.actual_start || b.created_at || 0).getTime();
    return aT - bT;
  });

  const mergedOps: any[] = [];
  const seenOpKey = new Set<string>();

  jcList.forEach((j: any) => {
    const opName = String(j.operation || 'Machining').trim();
    const mach = String(j.machine || '').trim();
    const hrs = calcJobCardHours(j);
    mergedOps.push({
      id: j.id,
      job_no: j.job_no,
      op_no: j.op_no,
      operation: opName,
      machine: mach,
      operator: j.operator || '',
      qty_planned: String(j.qty_planned ?? 0),
      qty_completed: String(j.qty_completed ?? 0),
      qty_rejected: String(j.qty_rejected ?? 0),
      cycle_time: String(j.cycle_time ?? 0),
      setup_time: String(j.setup_time ?? 0),
      actual_minutes: String(Math.round(hrs * 60)),
      hours: hrs,
      status: j.status || 'Completed',
    });
    seenOpKey.add(`${opName.toLowerCase()}|${mach.toLowerCase()}`);
  });

  // Work order operations fallback
  (shared.allWoOps || []).forEach((o: any) => {
    if (allWoIds.has(String(o.work_order_id))) {
      const opName = String(o.process_name || o.process_code || 'Machining').trim();
      const mach = String(o.machine || '').trim();
      const k = `${opName.toLowerCase()}|${mach.toLowerCase()}`;
      if (!seenOpKey.has(k)) {
        const hrs = calcJobCardHours({
          ...o,
          actual_start: o.actual_start || o.planned_start,
          actual_end: o.actual_finish || o.planned_finish,
          qty_planned: o.planned_qty,
          qty_completed: o.completed_qty,
          cycle_time: o.est_cycle_time,
        });
        mergedOps.push({
          id: o.id,
          job_no: null,
          operation: opName,
          machine: mach,
          operator: o.operator || '',
          qty_planned: String(o.planned_qty ?? 0),
          qty_completed: String(o.completed_qty ?? 0),
          qty_rejected: '0',
          cycle_time: String(o.est_cycle_time ?? 0),
          setup_time: String(o.setup_time ?? 0),
          actual_minutes: String(Math.round(hrs * 60)),
          hours: hrs,
          status: o.status || 'Pending',
        });
        seenOpKey.add(k);
      }
    }
  });

  // Operation plans fallback
  (shared.allOperationPlans || []).forEach((pl: any) => {
    if (allWoIds.has(String(pl.work_order_id))) {
      const opName = String(pl.process_name || 'Machining').trim();
      const mach = String(pl.machine || '').trim();
      const k = `${opName.toLowerCase()}|${mach.toLowerCase()}`;
      if (!seenOpKey.has(k)) {
        const hrs = calcJobCardHours(pl);
        mergedOps.push({
          id: pl.id,
          job_no: null,
          operation: opName,
          machine: mach,
          operator: pl.operator || '',
          qty_planned: String(pl.quantity ?? 0),
          qty_completed: '0',
          qty_rejected: '0',
          cycle_time: '0',
          setup_time: '0',
          actual_minutes: String(Math.round(hrs * 60)),
          hours: hrs,
          status: 'Scheduled',
        });
        seenOpKey.add(k);
      }
    }
  });

  // Costing sheet operations fallback
  if (mergedOps.length === 0) {
    const matchingSheets = (shared.allCostingSheets || []).filter((s: any) => {
      const sWo = s.work_order_no;
      const sSo = lc(s.sales_order_no);
      return (sWo && allWoNos.has(sWo)) || (sSo && matchingSo.has(sSo));
    });
    if (matchingSheets.length > 0 && matchingSheets[0]?.workings?.processes) {
      matchingSheets[0].workings.processes.forEach((s: any, idx: number) => {
        const opName = String(s.process_name || s.process_code || 'Machining').trim();
        const hrs = Number(s.machine_hours) || Number(s.hours) || 1;
        mergedOps.push({
          id: s.key || `sheet-${idx}`,
          job_no: null,
          operation: opName,
          machine: s.machine || '',
          operator: s.operator || '',
          qty_planned: String(s.qty ?? 1),
          qty_completed: String(s.qty ?? 1),
          qty_rejected: '0',
          cycle_time: String(s.cycle_time ?? 0),
          setup_time: String(s.setup_time ?? 0),
          actual_minutes: String(Math.round(hrs * 60)),
          hours: hrs,
          status: 'Completed',
        });
      });
    }
  }

  // Value operations with Process Master rates
  const valuedOps = valueOperations(mergedOps, procRates || []);
  const totalMachineCost = machineCostTotal(valuedOps);

  // 6. Categories breakdown
  const updatedCategories = [...(baseReport?.categories || [])];
  if (totalMaterialCost > 0) {
    const idx = updatedCategories.findIndex((c) => /material/i.test(c.category));
    if (idx >= 0) updatedCategories[idx].amount = (Number(updatedCategories[idx].amount || 0) + inwardAmount).toFixed(2);
    else updatedCategories.unshift({ category: 'Material Cost', amount: totalMaterialCost.toFixed(2) });
  }
  if (serviceAmount > 0) {
    const idx = updatedCategories.findIndex((c) => /service/i.test(c.category));
    if (idx >= 0) updatedCategories[idx].amount = (Number(updatedCategories[idx].amount || 0) + serviceAmount).toFixed(2);
    else updatedCategories.push({ category: 'Service Cost', amount: serviceAmount.toFixed(2) });
  }
  if (totalMachineCost > 0) {
    const idx = updatedCategories.findIndex((c) => /machine|in-house|labour/i.test(c.category));
    if (idx >= 0) updatedCategories[idx].amount = totalMachineCost.toFixed(2);
    else updatedCategories.push({ category: 'Machine Cost', amount: totalMachineCost.toFixed(2) });
  }

  // 7. Costs and Margins
  const baseActual = Number(baseReport?.project?.actual_cost) || 0;
  const purchaseAmount = inwardAmount + serviceAmount;
  const combinedActual = (totalMaterialCost + serviceAmount + totalMachineCost) || (baseActual > 0 ? baseActual + purchaseAmount : null);
  const salesVal = Number(baseReport?.project?.sales_value || p.sales_value) || null;
  const profit = salesVal !== null && combinedActual !== null ? (salesVal - combinedActual).toFixed(2) : null;
  const profitPct = salesVal !== null && salesVal > 0 && combinedActual !== null
    ? (((salesVal - combinedActual) * 100) / salesVal).toFixed(2)
    : null;

  const purchaseKinds = [
    ...(inwardAmount > 0 ? ['goods purchase'] : []),
    ...(serviceAmount > 0 ? ['service purchase'] : []),
    ...(totalMachineCost > 0 ? ['machine cost'] : []),
  ];
  const costSource = baseReport?.project?.cost_source
    ? purchaseKinds.length > 0 ? `${baseReport.project.cost_source} + ${purchaseKinds.join(' + ')}` : baseReport.project.cost_source
    : purchaseKinds.length > 0 ? `${purchaseKinds.join(' + ')}` : null;

  let plannedCost = baseReport?.project?.planned_cost ?? p.planned_cost ?? null;
  if (!(Number(plannedCost) > 0) && shared.quoteLookup) {
    const quoted = shared.quoteLookup(
      [p.project_name, ...allWorkOrders.map((w: any) => w.sales_order)],
      p.party_name,
      p.part_name
    );
    if (quoted) plannedCost = quoted.toFixed(2);
  }

  return {
    project: {
      ...p,
      product_cost: baseReport?.project?.product_cost || null,
      process_cost: baseReport?.project?.process_cost || null,
      invoice_value: baseReport?.project?.invoice_value || null,
      planned_cost: plannedCost ? String(plannedCost) : null,
      actual_cost: combinedActual !== null ? String(combinedActual) : null,
      cost_source: costSource,
      profit,
      profit_pct: profitPct,
    },
    categories: updatedCategories,
    processes: baseReport?.processes || [],
    materials: allMaterials,
    services: [...(baseReport?.services || []), ...serviceRows],
    work_orders: allWorkOrders,
    operations: mergedOps,
    processOps: valuedOps,
    processOpsTotal: totalMachineCost,
    expenses: projectExpenses,
  };
}

// Sub-component: Individual Project Costing Box
function ProjectCostingBox({
  project,
  detail,
  loading,
  globalTab,
}: {
  project: ProjectRow;
  detail?: CostingDetail;
  loading?: boolean;
  globalTab?: string;
}) {
  const [localTab, setLocalTab] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const activeTab = localTab || globalTab || 'Goods Purchase';

  const pData = detail?.project || project;
  const jobs = detail?.work_orders || [];
  const completed = jobs.reduce((n, w) => n + Number(w.completed || 0), 0);
  const rejected = jobs.reduce((n, w) => n + Number(w.rejected || 0), 0);
  const quantity = jobs.reduce((n, w) => n + Number(w.quantity || 0), 0);
  const progress = quantity ? Math.min(100, (completed / quantity) * 100) : 0;

  const totalActual = pData.actual_cost ?? null;
  const profit = pData.profit ?? null;
  const profitPct = pData.profit_pct ?? null;
  const machineCost = detail?.processOpsTotal && detail.processOpsTotal > 0 ? detail.processOpsTotal : null;

  const materials = detail?.materials || [];
  const services = detail?.services || [];
  const processes = detail?.processes || [];
  const processOps = detail?.processOps || [];
  const expenses = detail?.expenses || [];

  const totalMaterialsAmount = useMemo(() => materials.reduce((sum, m) => sum + (Number(m.amount) || 0), 0), [materials]);
  const totalServiceAmount = useMemo(() => services.reduce((sum, m) => sum + (Number(m.amount) || 0), 0), [services]);
  const totalExpensesAmount = useMemo(() => expenses.reduce((n, x) => n + (Number(x.total_amount) || 0), 0), [expenses]);
  const processOpsTotal = detail?.processOpsTotal || 0;

  return (
    <Card className="overflow-hidden border border-slate-200/90 shadow-xs rounded-2xl bg-white transition-all">
      {/* Box Header */}
      <div className="p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-amber-50/50 via-white to-slate-50/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                Project / Work Order
              </span>
              <span className="font-mono text-xs font-black text-amber-900 bg-amber-100/70 border border-amber-300 px-2.5 py-0.5 rounded-md shadow-2xs">
                {project.project_name}
              </span>
              {jobs.map((w) => (
                <Badge key={w.id} variant={statusToVariant(w.status)} className="text-[10px] font-bold">
                  {w.part_name || 'Production order'} · {w.status}
                </Badge>
              ))}
            </div>

            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-snug truncate">
              {project.part_name} <span className="text-slate-400 font-normal">·</span> {project.party_name}
            </h2>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-2xs cursor-pointer"
              title={expanded ? 'Collapse costing details' : 'Expand costing details'}
            >
              {expanded ? (
                <>
                  <ChevronUp size={14} /> Collapse
                </>
              ) : (
                <>
                  <ChevronDown size={14} /> View Costings
                </>
              )}
            </button>
          </div>
        </div>

        {/* Financial KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mt-3.5 pt-3.5 border-t border-slate-100">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Sales Order Value</div>
            <div className="text-sm font-extrabold text-slate-900 font-mono mt-0.5">{money(pData.sales_value)}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80" title={pData.planned_cost ? 'From planned workings or quotation' : 'No recorded estimate'}>
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Planned Cost</div>
            <div className="text-sm font-extrabold text-blue-900 font-mono mt-0.5">{money(pData.planned_cost)}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80" title="Machine & labour operations valued with Process Master rates">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Machine Cost</div>
            <div className="text-sm font-extrabold text-purple-900 font-mono mt-0.5">{machineCost ? money(machineCost) : '—'}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80" title={pData.cost_source || 'Recorded actual costs'}>
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Recorded Actual Cost</div>
            <div className="text-sm font-extrabold text-amber-950 font-mono mt-0.5">{money(totalActual)}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Sales Value</div>
            <div className="text-sm font-extrabold text-slate-900 font-mono mt-0.5">{money(pData.sales_value)}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80" title={profitPct ? `${profitPct}% margin` : 'Margin'}>
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Margin on Cost</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-sm font-extrabold font-mono ${Number(profit) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {money(profit)}
              </span>
              {profitPct && (
                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${Number(profitPct) >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                  {profitPct}%
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Production Progress Bar */}
        <div className="mt-3 pt-2.5 border-t border-slate-100/90 flex flex-wrap items-center gap-2">
          <b className="text-[11px] font-bold text-slate-700 whitespace-nowrap">Production Progress:</b>
          <div className="flex-1 min-w-[140px] h-2 bg-slate-200 rounded-full overflow-hidden shadow-inner">
            <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[11px] text-slate-600 whitespace-nowrap font-medium">
            {quantity
              ? `${completed} completed · ${Math.max(0, quantity - completed - rejected)} pending · ${rejected} rejected`
              : 'No work order quantities'}
          </span>
          <span className="text-[11px] font-black text-slate-800 font-mono bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
            {progress.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Box Body: Costing Details */}
      {expanded && (
        <div className="p-4 sm:p-5 bg-slate-50/50 space-y-4">
          {/* Sub-Tabs Selector inside this Box */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200/90">
            {tabs.map((t) => {
              const isActive = activeTab === t;
              let badgeVal = '';
              if (t === 'Goods Purchase' && materials.length) badgeVal = `${materials.length}`;
              if (t === 'Service Purchase' && (services.length || processes.length)) badgeVal = `${services.length + processes.length}`;
              if (t === 'Machine Cost' && processOps.length) badgeVal = `${processOps.length}`;
              if (t === 'Expenses' && expenses.length) badgeVal = `${expenses.length}`;

              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setLocalTab(t)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-amber-600 text-white shadow-xs shadow-amber-600/30'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  <span>{t}</span>
                  {badgeVal && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-extrabold ${isActive ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      {badgeVal}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500 font-medium">Loading costing records...</div>
          ) : (
            <div className="space-y-4">
              {/* GOODS PURCHASE */}
              {(activeTab === 'Goods Purchase' || activeTab === 'All Costings') && (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                  <div className="p-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-xs sm:text-sm text-slate-900">Goods Purchase</h3>
                      <p className="text-[10px] text-slate-500">
                        Source: Goods Purchase inward entries (and material issued from stock) linked to this project or work order.
                      </p>
                    </div>
                    {materials.length > 0 && (
                      <Badge variant="success" className="font-mono text-xs font-semibold px-2 py-0.5">
                        Total Goods Purchase: {money(totalMaterialsAmount.toFixed(2))}
                      </Badge>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] text-xs">
                      <thead>
                        <tr className="bg-slate-50/70 text-slate-500 border-b border-slate-100">
                          <th className="p-2.5 text-left font-bold">DATE</th>
                          <th className="p-2.5 text-left font-bold">ITEM / MATERIAL</th>
                          <th className="p-2.5 text-left font-bold">SOURCE</th>
                          <th className="p-2.5 text-left font-bold">INWARD / REQUEST REF</th>
                          <th className="p-2.5 text-right font-bold">QUANTITY</th>
                          <th className="p-2.5 text-center font-bold">UNIT</th>
                          <th className="p-2.5 text-right font-bold">RATE</th>
                          <th className="p-2.5 text-right font-bold">AMOUNT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {materials.map((x) => (
                          <tr key={x.id} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                            <td className="p-2.5 text-slate-600">{formatDate(x.date)}</td>
                            <td className="p-2.5 font-bold text-slate-900">{x.item}</td>
                            <td className="p-2.5">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                x.type === 'Goods Purchase' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                              }`}>
                                {x.type || 'Material'}
                              </span>
                            </td>
                            <td className="p-2.5 font-mono text-[11px] text-slate-600">{x.reference || x.request_no}</td>
                            <td className="p-2.5 text-right font-semibold font-mono text-slate-800">{x.quantity}</td>
                            <td className="p-2.5 text-center text-slate-500">{x.unit || 'pcs'}</td>
                            <td className="p-2.5 text-right font-mono text-slate-700">{money(x.rate)}</td>
                            <td className="p-2.5 text-right font-bold font-mono text-slate-900">{money(x.amount)}</td>
                          </tr>
                        ))}
                        {!materials.length && (
                          <tr>
                            <td colSpan={8} className="p-6 text-center text-slate-500 text-xs">
                              No linked goods purchase inward records.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {materials.length > 0 && (
                        <tfoot>
                          <tr className="bg-slate-50/90 font-bold border-t border-slate-200">
                            <td colSpan={7} className="p-2.5 text-right text-slate-700 uppercase tracking-wide text-[11px]">Total Goods Purchase</td>
                            <td className="p-2.5 text-right font-mono text-emerald-700 text-sm">{money(totalMaterialsAmount.toFixed(2))}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              )}

              {/* SERVICE PURCHASE */}
              {(activeTab === 'Service Purchase' || activeTab === 'All Costings') && (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                  <div className="p-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-xs sm:text-sm text-slate-900">Service Purchase</h3>
                      <p className="text-[10px] text-slate-500">
                        Outside process work and Service Purchase inwards recorded for this project.
                      </p>
                    </div>
                    {services.length > 0 && (
                      <Badge variant="success" className="font-mono text-xs font-semibold px-2 py-0.5">
                        Total Service Purchase: {money(totalServiceAmount.toFixed(2))}
                      </Badge>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] text-xs">
                      <thead>
                        <tr className="bg-slate-50/70 text-slate-500 border-b border-slate-100">
                          <th className="p-2.5 text-left font-bold">DATE</th>
                          <th className="p-2.5 text-left font-bold">ITEM / SERVICE</th>
                          <th className="p-2.5 text-left font-bold">SOURCE</th>
                          <th className="p-2.5 text-left font-bold">INWARD / REQUEST REF</th>
                          <th className="p-2.5 text-right font-bold">QUANTITY</th>
                          <th className="p-2.5 text-center font-bold">UNIT</th>
                          <th className="p-2.5 text-right font-bold">RATE</th>
                          <th className="p-2.5 text-right font-bold">AMOUNT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {services.map((x) => (
                          <tr key={x.id} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                            <td className="p-2.5 text-slate-600">{formatDate(x.date)}</td>
                            <td className="p-2.5 font-bold text-slate-900">{x.item}</td>
                            <td className="p-2.5">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
                                Service Purchase
                              </span>
                            </td>
                            <td className="p-2.5 font-mono text-[11px] text-slate-600">{x.reference || x.request_no}</td>
                            <td className="p-2.5 text-right font-semibold font-mono text-slate-800">{x.quantity}</td>
                            <td className="p-2.5 text-center text-slate-500">{x.unit || 'pcs'}</td>
                            <td className="p-2.5 text-right font-mono text-slate-700">{money(x.rate)}</td>
                            <td className="p-2.5 text-right font-bold font-mono text-slate-900">{money(x.amount)}</td>
                          </tr>
                        ))}
                        {processes.map((x) => (
                          <tr key={`proc-${x.id}`} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                            <td className="p-2.5 text-slate-600">{formatDate(x.created_at)}</td>
                            <td className="p-2.5 font-bold text-slate-900">{x.process}</td>
                            <td className="p-2.5">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
                                Outside Process
                              </span>
                            </td>
                            <td className="p-2.5 text-slate-600">{x.supplier || '—'}</td>
                            <td className="p-2.5 text-right font-semibold font-mono text-slate-800">{x.quantity || x.duration || '—'}</td>
                            <td className="p-2.5 text-center text-slate-500">pcs</td>
                            <td className="p-2.5 text-right font-mono text-slate-700">{money(x.rate)}</td>
                            <td className="p-2.5 text-right font-bold font-mono text-slate-900">{money(x.amount)}</td>
                          </tr>
                        ))}
                        {!services.length && !processes.length && (
                          <tr>
                            <td colSpan={8} className="p-6 text-center text-slate-500 text-xs">
                              No linked service purchase records.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {services.length > 0 && (
                        <tfoot>
                          <tr className="bg-slate-50/90 font-bold border-t border-slate-200">
                            <td colSpan={7} className="p-2.5 text-right text-slate-700 uppercase tracking-wide text-[11px]">Total Service Purchase</td>
                            <td className="p-2.5 text-right font-mono text-emerald-700 text-sm">{money(totalServiceAmount.toFixed(2))}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              )}

              {/* MACHINE COST */}
              {(activeTab === 'Machine Cost' || activeTab === 'All Costings') && (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                  <div className="p-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-xs sm:text-sm text-slate-900">Machine Cost</h3>
                      <p className="text-[10px] text-slate-500">
                        In-house operations valued with machine &amp; process master rates.
                      </p>
                    </div>
                    {processOpsTotal > 0 && (
                      <Badge variant="success" className="font-mono text-xs font-semibold px-2 py-0.5">
                        Total Machine Cost: {money(processOpsTotal.toFixed(2))}
                      </Badge>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] text-xs">
                      <thead>
                        <tr className="bg-slate-50/70 text-slate-500 border-b border-slate-100">
                          <th className="p-2.5 text-left font-bold">PROCESS / OPERATION</th>
                          <th className="p-2.5 text-left font-bold">MACHINE / OPERATOR</th>
                          <th className="p-2.5 text-right font-bold">HOURS</th>
                          <th className="p-2.5 text-right font-bold">RATE / HOUR</th>
                          <th className="p-2.5 text-right font-bold">COST</th>
                          <th className="p-2.5 text-left font-bold">STATUS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {processOps.map((x: any) => (
                          <tr key={`o-${x.id}`} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                            <td className="p-2.5">
                              <div className="font-bold text-slate-900">{x.operation || '—'}</div>
                              {x.op_no != null && <div className="text-[10px] text-slate-400 font-mono">Seq OP {x.op_no}</div>}
                              {!x.matched && (
                                <span className="mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200" title="Operation not matched to Process Master rate">
                                  Not in Process Master
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 text-slate-700">{x.machine || '—'} / {x.operator || '—'}</td>
                            <td className="p-2.5 text-right">
                              <div className="font-bold text-slate-800 font-mono">{Number(x.hours).toFixed(2).replace(/\.00$/, '')} h</div>
                              {(() => {
                                const totalM = Math.round(Number(x.hours || 0) * 60);
                                const h = Math.floor(totalM / 60);
                                const m = totalM % 60;
                                return m > 0 ? <div className="text-[10px] text-slate-400 font-mono">{h}h {m}m</div> : null;
                              })()}
                            </td>
                            <td className="p-2.5 text-right font-mono text-slate-700">{x.matched ? money(x.rate) : '—'}</td>
                            <td className="p-2.5 text-right font-bold font-mono text-slate-900">{x.matched ? money(x.cost) : '—'}</td>
                            <td className="p-2.5">
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                                {x.status || '—'}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {!processOps.length && (
                          <tr>
                            <td colSpan={6} className="p-6 text-center text-slate-500 text-xs">
                              No in-house operations recorded for this project yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {processOps.length > 0 && (
                        <tfoot>
                          <tr className="bg-slate-50/90 font-bold border-t border-slate-200">
                            <td colSpan={2} className="p-2.5 text-right text-slate-700 uppercase tracking-wide text-[11px]">Total Machine Cost</td>
                            <td className="p-2.5 text-right font-mono text-slate-700 text-xs font-bold">
                              {processOps.reduce((sum, x) => sum + (Number(x.hours) || 0), 0).toFixed(2).replace(/\.00$/, '')} h
                            </td>
                            <td />
                            <td className="p-2.5 text-right font-mono text-emerald-700 text-sm">{money(processOpsTotal.toFixed(2))}</td>
                            <td />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              )}

              {/* EXPENSES */}
              {(activeTab === 'Expenses' || activeTab === 'All Costings') && (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                  <div className="p-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-xs sm:text-sm text-slate-900">Expenses</h3>
                      <p className="text-[10px] text-slate-500">Expense inward entries made for this project.</p>
                    </div>
                    {expenses.length > 0 && (
                      <Badge variant="success" className="font-mono text-xs font-semibold px-2 py-0.5">
                        Total Expenses: {money(totalExpensesAmount.toFixed(2))}
                      </Badge>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] text-xs">
                      <thead>
                        <tr className="bg-slate-50/70 text-slate-500 border-b border-slate-100">
                          <th className="p-2.5 text-left font-bold">DATE</th>
                          <th className="p-2.5 text-left font-bold">REFERENCE</th>
                          <th className="p-2.5 text-left font-bold">EXPENSE</th>
                          <th className="p-2.5 text-left font-bold">COMPANY</th>
                          <th className="p-2.5 text-left font-bold">REMARKS</th>
                          <th className="p-2.5 text-right font-bold">QTY</th>
                          <th className="p-2.5 text-right font-bold">RATE</th>
                          <th className="p-2.5 text-right font-bold">AMOUNT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.map((x) => (
                          <tr key={x.id} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                            <td className="p-2.5 text-slate-600">{formatDate(x.inward_date || x.created_at)}</td>
                            <td className="p-2.5 font-mono text-[11px] text-slate-700">{x.inward_no}{x.reference_no ? ` (${x.reference_no})` : ''}</td>
                            <td className="p-2.5 font-bold text-slate-900">{x.part_name || x.product_name || '—'}</td>
                            <td className="p-2.5 text-slate-600">{x.party_name || '—'}</td>
                            <td className="p-2.5 text-slate-600">{x.remarks || '—'}</td>
                            <td className="p-2.5 text-right font-semibold font-mono text-slate-800">{x.quantity}</td>
                            <td className="p-2.5 text-right font-mono text-slate-700">{money(x.price)}</td>
                            <td className="p-2.5 text-right font-bold font-mono text-slate-900">{money(x.total_amount)}</td>
                          </tr>
                        ))}
                        {!expenses.length && (
                          <tr>
                            <td colSpan={8} className="p-6 text-center text-slate-500 text-xs">
                              No expenses recorded for this project.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// MAIN PAGE
export function ProjectCostingPage() {
  const { company } = useAuth();
  const { setHeader, setTabActions } = useHeaderKpis();
  const exportRef = useRef<() => void>(() => {});
  const printRef = useRef<() => void>(() => {});

  const [search, setSearch] = useState('');
  const [selectedProjectKey, setSelectedProjectKey] = useState<string>('all');
  const [globalTab, setGlobalTab] = useState<string>('Goods Purchase');
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState('');

  const [procRates, setProcRates] = useState<any[]>([]);
  const [detailsMap, setDetailsMap] = useState<Record<string, CostingDetail>>({});

  const projectKey = (p: ProjectRow) => `${p.project_name}|${p.part_name}|${p.party_name}`;

  // Load process master rates once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error: e } = await supabase.from('cnc_processes').select('*').order('process_code');
        if (!cancelled && !e) setProcRates(data ?? []);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const autoSyncSeededInwards = async () => {
    try {
      await supabase
        .from('cnc_inwards')
        .update({ category: 'GOODS PURCHASE' })
        .in('inward_no', ['INW-2026-201', 'INW-2026-202', 'INW-2026-203', 'INW-2026-204', 'INW-2026-205'])
        .eq('category', 'CUSTOMER DC');
    } catch {}
  };

  const loadData = useCallback(async (p = page, q = search, sz = pageSize) => {
    setLoading(true);
    setDetailsLoading(true);
    setError('');
    try {
      await autoSyncSeededInwards();

      // 1. Fetch Projects list via RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('erp_costing_projects', {
        p_search: q || null,
        p_page: p,
        p_page_size: sz,
      } as never);
      if (rpcError) throw new Error(rpcError.message);
      const result = rpcData as any;
      let rows: ProjectRow[] = result.rows || [];

      // 2. Fetch Shared Costing Datasets
      const [
        { data: inwardRows },
        { data: woData },
        { data: jcRows },
        { data: plansRows },
        { data: woOpsRows },
        { data: routingRows },
        { data: sheetRows },
        quoteLookup,
      ] = await Promise.all([
        supabase.from('cnc_inwards').select('*'),
        supabase.from('cnc_work_orders').select('*'),
        supabase.from('cnc_job_cards').select('*').order('created_at', { ascending: false }).limit(2000),
        supabase.from('cnc_operation_plans').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('cnc_work_order_operations').select('*').order('operation_sequence'),
        supabase.from('cnc_part_routings').select('id, product_name, product_code, cnc_part_routing_steps(*)').eq('status', 'Active'),
        supabase.from('cnc_costing_sheets').select('*').order('version', { ascending: false }).limit(50),
        loadQuoteLookup(),
      ]);

      const shared: SharedCostingData = {
        inwardRows: inwardRows || [],
        allDbWos: woData || [],
        allJobCards: jcRows || [],
        allOperationPlans: plansRows || [],
        allWoOps: woOpsRows || [],
        allRoutings: routingRows || [],
        allCostingSheets: sheetRows || [],
        quoteLookup,
      };

      // 3. Planned Cost: Quote totals
      rows = rows.map((proj) => {
        if (Number(proj.planned_cost) > 0) return proj;
        const linked = (woData || []).filter((w: any) => w.wo_no === proj.project_name || w.sales_order === proj.project_name);
        const quoted = quoteLookup(
          [proj.project_name, ...linked.map((w: any) => w.sales_order)],
          proj.party_name,
          proj.part_name
        );
        return quoted ? { ...proj, planned_cost: quoted.toFixed(2) } : proj;
      });

      setProjects(rows);
      setTotal(result.total || 0);
      setPage(p);
      setLoading(false);

      // 4. Batch compute detail for all projects on current page
      const nextMap: Record<string, CostingDetail> = {};
      await Promise.all(
        rows.map(async (proj) => {
          try {
            const { data: baseDetail } = await supabase.rpc('erp_project_costing_detail', {
              p_project_name: proj.project_name,
              p_part_name: proj.part_name || null,
              p_party_name: proj.party_name || null,
            } as never);
            const detail = computeProjectDetail(proj, baseDetail, shared, procRates);
            nextMap[projectKey(proj)] = detail;
          } catch {
            const detail = computeProjectDetail(proj, null, shared, procRates);
            nextMap[projectKey(proj)] = detail;
          }
        })
      );
      setDetailsMap(nextMap);
    } catch (e) {
      setProjects([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : 'Unable to load project costing.');
    } finally {
      setLoading(false);
      setDetailsLoading(false);
    }
  }, [page, search, pageSize, procRates]);

  useEffect(() => {
    void loadData(1, search, pageSize);
  }, [company?.id]);

  // Filter projects based on top dropdown selection and search
  const filteredProjects = useMemo(() => {
    let list = projects;
    if (selectedProjectKey !== 'all') {
      list = list.filter((p) => projectKey(p) === selectedProjectKey);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) =>
        (p.project_name && p.project_name.toLowerCase().includes(q)) ||
        (p.part_name && p.part_name.toLowerCase().includes(q)) ||
        (p.party_name && p.party_name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [projects, selectedProjectKey, search]);

  // Export CSV
  const exportAll = () => {
    if (!filteredProjects.length) return;
    const rowsToExport = [
      ['Project / Work Order', 'Part Name', 'Customer / Party', 'Planned Cost', 'Actual Cost', 'Sales Value', 'Margin (₹)', 'Margin (%)'],
      ...filteredProjects.map((p) => {
        const d = detailsMap[projectKey(p)];
        const act = d?.project?.actual_cost || p.actual_cost || '';
        const pl = d?.project?.planned_cost || p.planned_cost || '';
        const sv = d?.project?.sales_value || p.sales_value || '';
        const prof = d?.project?.profit || p.profit || '';
        const pct = d?.project?.profit_pct || p.profit_pct || '';
        return [p.project_name, p.part_name, p.party_name, pl, act, sv, prof, pct];
      }),
    ];
    exportCsv(`Project_Costing_Report_${todayISO()}`, rowsToExport);
  };

  const printAll = () => {
    window.print();
  };

  exportRef.current = exportAll;
  printRef.current = printAll;

  useEffect(() => {
    setHeader({ title: 'Project Costing' });
    setTabActions(
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={<Upload size={14} />}
          onClick={() => exportRef.current()}
          className="h-7 py-1 text-xs px-2.5 shadow-sm"
        >
          Export
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<Printer size={14} />}
          onClick={() => printRef.current()}
          className="h-7 py-1 text-xs px-2.5 shadow-sm"
        >
          Print
        </Button>
      </div>
    );
    return () => {
      setHeader(null);
      setTabActions(null);
    };
  }, [setHeader, setTabActions]);

  return (
    <div className="p-3 sm:p-5 lg:px-6 lg:pt-3 lg:pb-8 space-y-4 bg-[#F8F5F1] min-h-full">
      <div className="lg:hidden">
        <PageHeader
          title="Project Costing"
          description="Cost analysis by project and work order with goods purchase, service purchase, machine cost and expenses."
          actions={
            <>
              <Button variant="secondary" size="sm" icon={<Upload size={14} />} onClick={exportAll}>
                Export
              </Button>
              <Button variant="secondary" size="sm" icon={<Printer size={14} />} onClick={printAll}>
                Print
              </Button>
            </>
          }
        />
      </div>

      {error && <div className="border border-rose-200 bg-rose-50 text-rose-700 rounded-xl p-3 text-sm">{error}</div>}

      {/* TOP CONTROLS & DROPDOWN BAR */}
      <Card className="p-3.5 sm:p-4 bg-white shadow-xs border border-slate-200/90 rounded-2xl">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Left: Project Selector Dropdown + Search Input */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
            {/* Project / Work Order Dropdown */}
            <div className="min-w-[280px] sm:min-w-[340px]">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1 block">
                Filter by Project / Work Order
              </label>
              <div className="relative">
                <select
                  value={selectedProjectKey}
                  onChange={(e) => setSelectedProjectKey(e.target.value)}
                  className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 pr-8 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:bg-white transition-all cursor-pointer shadow-2xs"
                >
                  <option value="all">📁 All Projects / Work Orders ({projects.length})</option>
                  {projects.map((p) => {
                    const k = projectKey(p);
                    return (
                      <option key={k} value={k}>
                        {p.part_name} · {p.party_name} ({p.project_name})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Quick Search */}
            <div className="flex-1 min-w-[200px]">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1 block">
                Search Part / Customer / Work Order
              </label>
              <div className="relative">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search project, part, company..."
                  className="w-full pl-8 pr-8 py-2 text-xs font-medium bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:bg-white transition-all shadow-2xs"
                />
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right: Global Tab Shortcut & Page Size */}
          <div className="flex flex-wrap items-center gap-2.5 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100 justify-between lg:justify-end">
            {/* Global View Mode */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
              {['Goods Purchase', 'Service Purchase', 'Machine Cost', 'Expenses', 'All Costings'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setGlobalTab(t)}
                  className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                    globalTab === t ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t === 'Goods Purchase' ? 'Goods' : t === 'Service Purchase' ? 'Service' : t === 'Machine Cost' ? 'Machine' : t === 'Expenses' ? 'Expenses' : 'All'}
                </button>
              ))}
            </div>

            {/* Page Size & Pagination */}
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <label className="flex items-center gap-1">
                Show
                <select
                  value={pageSize}
                  onChange={(e) => {
                    const sz = Number(e.target.value);
                    setPageSize(sz);
                    void loadData(1, search, sz);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-800 cursor-pointer shadow-2xs"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </label>

              <span className="text-slate-400">·</span>
              <span className="text-slate-500 font-medium">{total} total</span>

              <div className="flex items-center gap-1 ml-1">
                <button
                  disabled={page <= 1}
                  onClick={() => void loadData(page - 1, search, pageSize)}
                  className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
                >
                  ‹
                </button>
                <span className="px-1.5 font-bold font-mono text-slate-800">{page}</span>
                <button
                  disabled={page * pageSize >= total}
                  onClick={() => void loadData(page + 1, search, pageSize)}
                  className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
                >
                  ›
                </button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* PROJECT-WISE COSTING BOXES LIST */}
      <div className="space-y-4">
        {loading ? (
          <Card className="p-16 text-center text-sm font-medium text-slate-500">
            <div className="animate-spin text-2xl mb-2">⚙️</div>
            Loading project costings...
          </Card>
        ) : filteredProjects.length === 0 ? (
          <Card className="p-16 text-center text-sm font-medium text-slate-500">
            <Package className="w-8 h-8 text-slate-400 mx-auto mb-2 stroke-1" />
            No projects match the selected criteria.
          </Card>
        ) : (
          filteredProjects.map((p) => {
            const k = projectKey(p);
            const detail = detailsMap[k];
            return (
              <ProjectCostingBox
                key={k}
                project={p}
                detail={detail}
                loading={detailsLoading && !detail}
                globalTab={globalTab}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
