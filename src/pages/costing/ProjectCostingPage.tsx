import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Printer, Search, Package, ChevronDown, ChevronUp, ChevronsUpDown, Layers, Filter } from 'lucide-react';
import { Badge, Button, Card, statusToVariant } from '@/components/ui/Card';
import { inputClass } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDate, formatINR, todayISO } from '@/lib/format';
import { exportCsv, escapeHtml, printHtml, printGrid } from '@/lib/reportExport';
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
  product_cost?: string | number | null;
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

const isServicePurchaseCategory = (cat: string | null | undefined) => {
  if (!cat) return false;
  const s = String(cat).trim().toUpperCase();
  return (
    s.includes('SERVICE') ||
    s.includes('LABOUR') ||
    s.includes('JOB WORK') ||
    s.includes('OUTSIDE') ||
    s.includes('SUBCONTRACT') ||
    s.includes('PLATING') ||
    s.includes('COATING') ||
    s.includes('HEAT') ||
    s.includes('TREATMENT') ||
    s.includes('ANODIZ') ||
    s.includes('GRINDING')
  );
};

const isExpenseCategory = (cat: string | null | undefined) => {
  if (!cat) return false;
  const s = String(cat).trim().toUpperCase();
  return s === 'EXPENSES' || s.includes('EXPENSE') || s.includes('PETTY') || s.includes('OVERHEAD');
};

const isGoodsPurchaseCategory = (cat: string | null | undefined) => {
  if (!cat) return true; // Default to material / goods purchase if unclassified
  const s = String(cat).trim().toUpperCase();
  if (isServicePurchaseCategory(cat)) return false;
  if (isExpenseCategory(cat)) return false;
  if (s === 'CUSTOMER DC' || s === 'CUSTOMER_DC' || s === 'JOB WORK INWARD') return false;
  return true;
};

const isPurchaseCategory = (cat: string | null | undefined) =>
  isGoodsPurchaseCategory(cat) || isServicePurchaseCategory(cat);

async function loadQuoteLookup() {
  const lc = (v: unknown) => String(v ?? '').trim().toLowerCase();
  const [{ data: sos }, { data: quotes }] = await Promise.all([
    supabase.from('cnc_sales_orders').select('order_no, quotation_id, quote_no'),
    supabase.from('cnc_quotations').select('id, quote_no, customer, part_name, total_value, description, quantity, unit_price'),
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
  allBoms?: any[];
  allParts?: any[];
  allQuotations?: any[];
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

    if (wNo && (wNo === pProj || pProj.includes(wNo) || wNo.includes(pProj))) return true;
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
  if (p.part_name) {
    candidatePartNames.add(p.part_name);
    candidatePartNames.add(pPart);
    if (pPartKey) candidatePartNames.add(pPartKey);
  }

  const isUuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v ?? ''));

  allWorkOrders.forEach((w: any) => {
    if (w.sales_order) matchingSo.add(lc(w.sales_order));
    if (w.wo_no) {
      matchingWo.add(lc(w.wo_no));
      allWoNos.add(w.wo_no);
    }
    if (w.id && isUuid(w.id)) allWoIds.add(String(w.id));
    if (w.part_name) {
      candidatePartNames.add(w.part_name);
      candidatePartNames.add(lc(w.part_name));
      const k = quoteNameKey(w.part_name);
      if (k) candidatePartNames.add(k);
    }
  });

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

  // 3. Inwards matching (Goods Purchase, Service Purchase, Expenses)
  const matchesInward = (inv: any) => {
    if (!inv || inv.status === 'Deleted') return false;
    const cat = String(inv.category || '').trim().toUpperCase();
    if (cat === 'CUSTOMER DC' || cat === 'CUSTOMER_DC') return false;

    const soRef = lc(inv.sales_order_ref);
    const projRef = lc(inv.project_name);
    const partyRef = lc(inv.party_name);
    const partRef = lc(inv.part_name);
    const prodRef = lc(inv.product_name);
    const remarks = lc(inv.remarks);
    const refNo = lc(inv.reference_no);
    const inwardNo = lc(inv.inward_no);

    // Sales order links
    if (soRef && matchingSo.has(soRef)) return true;
    if (projRef && matchingSo.has(projRef)) return true;
    for (const so of matchingSo) {
      if (so && (remarks.includes(so) || refNo.includes(so) || projRef.includes(so))) return true;
    }

    // Work order links
    if (projRef && matchingWo.has(projRef)) return true;
    for (const wo of allWoNos) {
      const woLc = lc(wo);
      if (!woLc) continue;
      if (
        projRef === woLc ||
        projRef.includes(woLc) ||
        remarks.includes(woLc) ||
        refNo.includes(woLc) ||
        inwardNo.includes(woLc)
      ) return true;
    }

    // Product/Part name links
    const invPartKey = quoteNameKey(partRef || prodRef || projRef);
    if (pPartKey && invPartKey && invPartKey === pPartKey) return true;
    if (pPart && (partRef === pPart || prodRef === pPart || projRef === pPart)) return true;
    if (pPartKey && (partRef.includes(pPartKey) || prodRef.includes(pPartKey) || projRef.includes(pPartKey))) return true;

    // Party + Part link
    if (partyRef && partyRef === pParty) {
      if (pPartKey && (partRef.includes(pPartKey) || prodRef.includes(pPartKey))) return true;
      if (pPart && (partRef === pPart || prodRef === pPart)) return true;
    }

    return false;
  };

  const matchedInwards = (shared.inwardRows || []).filter(matchesInward);

  const toCostRow = (inv: any, type: string) => {
    const qty = Number(inv.quantity) || 1;
    const rate = Number(inv.price) || (qty > 0 ? (Number(inv.total_amount) || 0) / qty : 0);
    const amount = Number(inv.total_amount) || qty * rate;
    return {
      id: inv.id || crypto.randomUUID(),
      date: inv.inward_date || inv.created_at || todayISO(),
      type,
      reference: inv.reference_no ? `${inv.inward_no} (${inv.reference_no})` : inv.inward_no,
      item: inv.part_name || inv.product_name || `${type} Item`,
      quantity: String(qty),
      unit: inv.unit || 'pcs',
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

  const projectExpenses = matchedInwards
    .filter((inv: any) => isExpenseCategory(inv.category));

  const allMaterials = [...(baseReport?.materials || []), ...inwardMaterials];

  // 4. Fallback to BOM if allMaterials is empty
  if (allMaterials.length === 0 && shared.allBoms && shared.allBoms.length > 0) {
    const matchingBoms = shared.allBoms.filter((b: any) => {
      const bParent = lc(b.parent_part_code || b.parent_part_name);
      const bKey = quoteNameKey(b.parent_part_name || b.parent_part_code);
      return (
        (pPartKey && bKey === pPartKey) ||
        (pPart && (bParent === pPart || pPart.includes(bParent) || bParent.includes(pPart)))
      );
    });
    matchingBoms.forEach((b: any, idx: number) => {
      const qty = Number(b.quantity) || 1;
      const rate = Number(b.unit_cost || b.rate || b.cost) || 0;
      const amount = Number(b.total_cost || b.amount) || qty * rate;
      allMaterials.push({
        id: b.id || `bom-${idx}`,
        date: todayISO(),
        type: 'BOM Material',
        reference: b.bom_no || 'BOM',
        item: b.material_name || b.material_code || b.item_name || 'Raw Material',
        quantity: String(qty),
        unit: b.uom || b.unit || 'pcs',
        rate: String(rate),
        amount: String(amount),
        work_order: p.project_name,
        request_no: b.bom_no || 'BOM',
      });
    });
  }

  // 5. Fallback to Costing Sheets for materials & operations
  const matchingCostingSheets = (shared.allCostingSheets || []).filter((s: any) => {
    const sWo = lc(s.work_order_no);
    const sSo = lc(s.sales_order_no);
    const sProd = lc(s.product_name);
    const sCode = lc(s.product_code);
    const sKey = quoteNameKey(s.product_name);
    return (
      (sWo && (allWoNos.has(s.work_order_no) || matchingWo.has(sWo))) ||
      (sSo && matchingSo.has(sSo)) ||
      (pPartKey && sKey === pPartKey) ||
      (pPart && (sProd === pPart || sProd.includes(pPart) || pPart.includes(sProd))) ||
      (pPartKey && sCode && (sCode === pPartKey || sCode.includes(pPartKey)))
    );
  });

  if (matchingCostingSheets.length > 0) {
    const sheet = matchingCostingSheets[0];
    const sheetMaterials = sheet?.lines?.materials || sheet?.workings?.materials;
    if (allMaterials.length === 0 && Array.isArray(sheetMaterials)) {
      sheetMaterials.forEach((m: any, idx: number) => {
        allMaterials.push({
          id: m.key || `cs-mat-${idx}`,
          date: todayISO(),
          type: 'Costing Sheet Material',
          reference: sheet.quotation_no || 'Costing Sheet',
          item: m.material_name || m.material_code || 'Material',
          quantity: String(m.req_qty || m.quantity || 1),
          unit: m.unit || 'pcs',
          rate: String(m.unit_cost || m.rate || 0),
          amount: String(m.total || (Number(m.req_qty || 1) * Number(m.unit_cost || 0))),
          work_order: p.project_name,
          request_no: sheet.quotation_no || '',
        });
      });
    }
  }

  // Fallback to Quotation workings if allMaterials is still empty
  if (allMaterials.length === 0 && shared.allQuotations && shared.allQuotations.length > 0) {
    const matchQuote = (shared.allQuotations || []).find((q: any) => {
      const qCust = lc(q.customer);
      const qPart = lc(q.part_name);
      const qKey = quoteNameKey(q.part_name);
      return (
        (pParty && qCust === pParty && (pPartKey && qKey === pPartKey)) ||
        (pPartKey && qKey === pPartKey) ||
        (pPart && (qPart === pPart || qPart.includes(pPart)))
      );
    });
    if (matchQuote?.description) {
      try {
        const items = JSON.parse(matchQuote.description);
        if (Array.isArray(items)) {
          const matchItem = items.find((it: any) => {
            const itKey = quoteNameKey(it.partName);
            return itKey === pPartKey || lc(it.partName) === pPart;
          }) || items[0];
          if (matchItem?.workings?.materials && Array.isArray(matchItem.workings.materials)) {
            matchItem.workings.materials.forEach((m: any, idx: number) => {
              allMaterials.push({
                id: `qw-mat-${idx}`,
                date: todayISO(),
                type: 'Quotation Material',
                reference: matchQuote.quote_no || 'Quote',
                item: m.material_name || m.material_code || 'Material',
                quantity: String(m.req_qty || m.quantity || 1),
                unit: m.unit || 'pcs',
                rate: String(m.unit_cost || m.rate || 0),
                amount: String(m.total || (Number(m.req_qty || 1) * Number(m.unit_cost || 0))),
                work_order: p.project_name,
                request_no: matchQuote.quote_no || '',
              });
            });
          }
        }
      } catch {}
    }
  }

  // Fallback to Part Master material if allMaterials is still empty
  if (allMaterials.length === 0 && shared.allParts && shared.allParts.length > 0) {
    const matchPart = (shared.allParts || []).find((pt: any) => {
      const ptKey = quoteNameKey(pt.part_name);
      const ptName = lc(pt.part_name);
      const ptNo = lc(pt.part_no);
      return (
        (pPartKey && ptKey === pPartKey) ||
        (pPart && (ptName === pPart || ptName.includes(pPart) || pPart.includes(ptName))) ||
        (pPartKey && ptNo && (ptNo === pPartKey || ptNo.includes(pPartKey)))
      );
    });
    if (matchPart && (matchPart.material || Number(matchPart.unit_price) > 0)) {
      const qty = Number(p.quantity) || 1;
      const rate = Number(matchPart.unit_price) || 0;
      allMaterials.push({
        id: matchPart.id || 'part-mat',
        date: todayISO(),
        type: 'Part Master Material',
        reference: matchPart.part_no || 'Part Master',
        item: matchPart.material ? `${matchPart.part_name} (${matchPart.material})` : (matchPart.part_name || 'Raw Material'),
        quantity: String(qty),
        unit: matchPart.unit || 'pcs',
        rate: String(rate),
        amount: String(qty * rate),
        work_order: p.project_name,
        request_no: matchPart.part_no || '',
      });
    }
  }

  // Fallback to product_cost from report if still empty
  if (allMaterials.length === 0 && Number(p.product_cost || baseReport?.project?.product_cost) > 0) {
    const costVal = Number(p.product_cost || baseReport?.project?.product_cost);
    allMaterials.push({
      id: 'prod-cost-mat',
      date: todayISO(),
      type: 'Product Material Cost',
      reference: p.project_name,
      item: 'Raw Material',
      quantity: String(p.quantity || 1),
      unit: 'pcs',
      rate: String(costVal / (Number(p.quantity) || 1)),
      amount: String(costVal),
      work_order: p.project_name,
      request_no: p.project_name,
    });
  }

  // 6. Job Cards & Machine Operations
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
    for (const wo of allWoNos) {
      const woLc = lc(wo);
      if (woLc && (jWoLc === woLc || jWoLc.includes(woLc))) {
        addJobCard(j);
        return;
      }
    }
    if (jWoId && (allWoIds.has(jWoId) || allWoIdentifiers.has(jWoId))) {
      addJobCard(j);
      return;
    }
    if (pPartKey && (jPartKey === pPartKey || jPart.includes(pPartKey) || pPartKey.includes(jPart))) {
      addJobCard(j);
      return;
    }
    if (pPart && (jPart === pPart || jPart.includes(pPart) || pPart.includes(jPart))) {
      addJobCard(j);
      return;
    }
    if (candidatePartNames.has(j.part_name) || candidatePartNames.has(jPart)) {
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
    const oWoId = String(o.work_order_id || '').toLowerCase();
    if (allWoIds.has(oWoId) || allWoIdentifiers.has(oWoId) || allWoNos.has(o.work_order_id)) {
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
    const plWoId = String(pl.work_order_id || '').toLowerCase();
    if (allWoIds.has(plWoId) || allWoIdentifiers.has(plWoId) || allWoNos.has(pl.work_order_id)) {
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
  if (mergedOps.length === 0 && matchingCostingSheets.length > 0) {
    const sheet = matchingCostingSheets[0];
    const sheetOps = sheet?.lines?.ops || sheet?.workings?.processes || sheet?.workings?.ops;
    if (Array.isArray(sheetOps) && sheetOps.length > 0) {
      sheetOps.forEach((s: any, idx: number) => {
        const opName = String(s.process_name || s.process_code || 'Machining').trim();
        const hrs = Number(s.machine_hours) || Number(s.hours) || 1;
        const rate = Number(s.cost_per_hour || s.machine_rate || s.rate || 0);
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
          rate: rate,
          cost: Number(s.machine_cost || s.cost || (hrs * rate)),
          status: 'Completed',
        });
      });
    }
  }

  // Quotation operations fallback
  if (mergedOps.length === 0 && shared.allQuotations && shared.allQuotations.length > 0) {
    const matchQuote = (shared.allQuotations || []).find((q: any) => {
      const qCust = lc(q.customer);
      const qPart = lc(q.part_name);
      const qKey = quoteNameKey(q.part_name);
      return (
        (pParty && qCust === pParty && (pPartKey && qKey === pPartKey)) ||
        (pPartKey && qKey === pPartKey) ||
        (pPart && (qPart === pPart || qPart.includes(pPart)))
      );
    });
    if (matchQuote?.description) {
      try {
        const items = JSON.parse(matchQuote.description);
        if (Array.isArray(items)) {
          const matchItem = items.find((it: any) => {
            const itKey = quoteNameKey(it.partName);
            return itKey === pPartKey || lc(it.partName) === pPart;
          }) || items[0];
          if (matchItem?.workings?.processes && Array.isArray(matchItem.workings.processes)) {
            matchItem.workings.processes.forEach((pr: any, idx: number) => {
              const hrs = Number(pr.machine_hours || pr.hours || 1);
              const rate = Number(pr.machine_rate || pr.cost_per_hour || pr.rate || 0);
              mergedOps.push({
                id: `qw-op-${idx}`,
                job_no: null,
                operation: pr.process_name || pr.process_code || 'Machining',
                machine: pr.machine || '',
                operator: '',
                qty_planned: '1',
                qty_completed: '1',
                qty_rejected: '0',
                cycle_time: '0',
                setup_time: '0',
                actual_minutes: String(Math.round(hrs * 60)),
                hours: hrs,
                rate: rate,
                cost: Number(pr.machine_cost || (hrs * rate)),
                status: 'Planned',
              });
            });
          }
        }
      } catch {}
    }
  }

  // Part routing steps fallback
  if (mergedOps.length === 0) {
    const matchingRoutings = (shared.allRoutings || []).filter((r: any) => {
      const rName = lc(r.product_name);
      const rCode = lc(r.product_code);
      const rKey = quoteNameKey(r.product_name);
      return (
        (pPartKey && rKey === pPartKey) ||
        (pPart && (rName === pPart || rName.includes(pPart) || pPart.includes(rName))) ||
        (pPartKey && (rName.includes(pPartKey) || pPartKey.includes(rName))) ||
        (pPartKey && rCode && (rCode === pPartKey || rCode.includes(pPartKey)))
      );
    });
    if (matchingRoutings.length > 0 && matchingRoutings[0]?.cnc_part_routing_steps?.length > 0) {
      matchingRoutings[0].cnc_part_routing_steps.forEach((rs: any, idx: number) => {
        const opName = String(rs.process_name || rs.process_code || 'Machining').trim();
        const cycle = Number(rs.cycle_time) || 0;
        const setup = Number(rs.setup_time) || 0;
        const hrs = Math.max(0.5, (setup + 1 * cycle) / 60);
        const stepRate = Number(rs.cost_per_hour || rs.rate || 0);
        mergedOps.push({
          id: rs.id || `routing-${idx}`,
          job_no: null,
          op_no: rs.step_no || rs.sequence || idx + 1,
          operation: opName,
          machine: rs.machine || '',
          operator: '',
          qty_planned: '1',
          qty_completed: '0',
          qty_rejected: '0',
          cycle_time: String(cycle),
          setup_time: String(setup),
          actual_minutes: String(Math.round(hrs * 60)),
          hours: hrs,
          rate: stepRate,
          cost: Math.round(hrs * (stepRate || 350) * 100) / 100,
          status: 'Planned',
        });
      });
    }
  }

  // If work order was completed, estimate machining for completed pieces
  if (mergedOps.length === 0) {
    const completedWo = allWorkOrders.find((w: any) => ['Completed', 'Done', 'Dispatched'].includes(String(w.status)) || Number(w.completed) > 0);
    if (completedWo) {
      const compQty = Number(completedWo.completed) || Number(completedWo.quantity) || 1;
      const defaultRateVal = (procRates || []).find((pr: any) => Number(pr.cost_per_hour || pr.hourly_rate) > 0)?.cost_per_hour || 350;
      const estHrs = Math.max(1, compQty * 0.5);
      mergedOps.push({
        id: `auto-op-${completedWo.id || 'wo'}`,
        job_no: completedWo.wo_no,
        op_no: 1,
        operation: 'Machining & Turning',
        machine: 'CNC Lathe / VMC',
        operator: 'Operator',
        qty_planned: String(completedWo.quantity || compQty),
        qty_completed: String(compQty),
        qty_rejected: String(completedWo.rejected || 0),
        cycle_time: '15',
        setup_time: '15',
        actual_minutes: String(Math.round(estHrs * 60)),
        hours: estHrs,
        rate: Number(defaultRateVal),
        cost: Math.round(estHrs * Number(defaultRateVal) * 100) / 100,
        status: completedWo.status || 'Completed',
      });
    }
  }

  // Value operations with Process Master rates (with fallback rate if rate is 0)
  const defaultRate = (procRates || []).find((pr: any) => Number(pr.cost_per_hour || pr.hourly_rate) > 0)?.cost_per_hour || 350;
  const valuedOps = valueOperations(mergedOps, procRates || []).map((vo: any) => {
    let cost = vo.cost;
    let rate = vo.rate;
    let matched = vo.matched;
    const hrs = Number(vo.hours) > 0 ? Number(vo.hours) : 1;
    if (!cost || cost === 0) {
      rate = Number(rate) > 0 ? Number(rate) : Number(defaultRate);
      cost = Math.round(hrs * rate * 100) / 100;
      matched = true;
    }
    return { ...vo, rate, cost, matched };
  });

  const totalMachineCost = machineCostTotal(valuedOps);
  const totalMaterialCost = allMaterials.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  const inwardAmount = inwardMaterials.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  const serviceAmount = serviceRows.reduce((sum, m) => sum + (Number(m.amount) || 0), 0) +
    (baseReport?.processes || []).reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
  const expensesAmount = projectExpenses.reduce((sum, x) => sum + (Number(x.total_amount) || 0), 0);

  // 7. Costs and Margins
  const baseActual = Number(baseReport?.project?.actual_cost) || 0;
  const totalCalculated = totalMaterialCost + serviceAmount + totalMachineCost + expensesAmount;
  const combinedActual = totalCalculated > 0 ? totalCalculated : (baseActual > 0 ? baseActual : null);

  let salesVal = Number(baseReport?.project?.sales_value || p.sales_value) || 0;
  if (salesVal === 0 && shared.quoteLookup) {
    const quoted = shared.quoteLookup(
      [p.project_name, ...allWorkOrders.map((w: any) => w.sales_order)],
      p.party_name,
      p.part_name
    );
    if (quoted) salesVal = quoted;
  }

  const profit = salesVal > 0 && combinedActual !== null ? (salesVal - combinedActual).toFixed(2) : null;
  const profitPct = salesVal > 0 && combinedActual !== null
    ? (((salesVal - combinedActual) * 100) / salesVal).toFixed(1)
    : null;

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
      sales_value: salesVal > 0 ? String(salesVal) : (p.sales_value || null),
      cost_source: 'actual_records',
      profit,
      profit_pct: profitPct,
    },
    categories: baseReport?.categories || [],
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

// Sub-component: Individual Compact Product Costing Box
function ProjectCostingBox({
  project,
  detail,
  loading,
}: {
  project: ProjectRow;
  detail?: CostingDetail;
  loading?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  const pData = detail?.project || project;
  const jobs = detail?.work_orders || [];

  const materials = detail?.materials || [];
  const services = detail?.services || [];
  const processes = detail?.processes || [];
  const processOps = detail?.processOps || [];
  const expenses = detail?.expenses || [];

  const totalMaterialsAmount = useMemo(
    () => materials.reduce((sum, m) => sum + (Number(m.amount) || 0), 0),
    [materials]
  );
  const totalServiceAmount = useMemo(
    () =>
      services.reduce((sum, m) => sum + (Number(m.amount) || 0), 0) +
      processes.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    [services, processes]
  );
  const totalExpensesAmount = useMemo(
    () => expenses.reduce((n, x) => n + (Number(x.total_amount) || 0), 0),
    [expenses]
  );
  const processOpsTotal = detail?.processOpsTotal || 0;

  const calculatedTotal = totalMaterialsAmount + totalServiceAmount + processOpsTotal + totalExpensesAmount;
  const totalActual = calculatedTotal > 0 ? calculatedTotal : (Number(pData.actual_cost) > 0 ? Number(pData.actual_cost) : (Number(pData.planned_cost) > 0 ? Number(pData.planned_cost) : null));

  const salesNum = Number(pData.sales_value) || 0;
  const profit = salesNum > 0 && totalActual !== null ? (salesNum - totalActual) : (pData.profit ? Number(pData.profit) : null);
  const profitPct = salesNum > 0 && totalActual !== null
    ? (((salesNum - totalActual) * 100) / salesNum).toFixed(1)
    : (pData.profit_pct ?? null);

  // Merged services (outside processes + service inwards)
  const allServices = useMemo(() => {
    return [
      ...services.map((s) => ({
        id: s.id,
        name: s.item || 'Service',
        sub: s.reference ? `Ref: ${s.reference}` : '',
        qty: `${s.quantity} ${s.unit || 'pcs'}`,
        rate: s.rate,
        amount: s.amount,
      })),
      ...processes.map((p) => ({
        id: `proc-${p.id}`,
        name: p.process || 'Process',
        sub: p.supplier ? `Supplier: ${p.supplier}` : '',
        qty: p.quantity || p.duration || '—',
        rate: p.rate,
        amount: p.amount,
      })),
    ];
  }, [services, processes]);

  return (
    <Card className="flex flex-col border border-slate-200/90 shadow-2xs rounded-2xl bg-white overflow-hidden hover:shadow-md transition-shadow">
      {/* Box Header */}
      <div className="p-3 sm:p-3.5 border-b border-slate-100 bg-gradient-to-r from-amber-50/40 via-white to-slate-50/50">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span className="font-mono text-[10px] font-bold text-amber-900 bg-amber-100/80 border border-amber-300 px-1.5 py-0.2 rounded">
                {project.project_name}
              </span>
              {jobs.map((w) => (
                <Badge key={w.id} variant={statusToVariant(w.status)} className="text-[9px] font-bold px-1.5 py-0.2">
                  {w.status}
                </Badge>
              ))}
            </div>
            <h3 className="text-sm font-extrabold text-slate-900 truncate leading-snug" title={project.part_name}>
              {project.part_name}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium truncate" title={project.party_name}>
              {project.party_name}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Box Body: Costings */}
      {expanded && (
        <div className="p-3 space-y-2 flex-1 flex flex-col justify-between bg-white text-xs">
          {loading ? (
            <div className="p-6 text-center text-xs text-slate-400 font-medium">Loading costings...</div>
          ) : (
            <div className="space-y-2">
              {/* 1. MACHINE COST */}
              {processOps.length > 0 ? (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                      ⚙️ Machine
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-900">
                      {money(processOpsTotal)}
                    </span>
                  </div>
                  <div className="space-y-1 max-h-[140px] overflow-y-auto pr-0.5">
                    {processOps.map((op: any) => (
                      <div
                        key={`op-${op.id}`}
                        className="flex items-center justify-between py-1 px-1.5 rounded-lg bg-white border border-slate-200/50 text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-bold text-slate-800 truncate text-[11px]">
                            {op.operation || 'Operation'}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {op.machine || '—'} · {Number(op.hours).toFixed(2).replace(/\.00$/, '')}h @ {op.matched ? money(op.rate) : '—'}/h
                          </div>
                        </div>
                        <span className="font-mono font-bold text-slate-900 text-xs shrink-0">
                          {money(op.cost)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-xl bg-slate-50/70 text-slate-400 border border-slate-100">
                  <span className="font-medium text-slate-600 text-[11px] flex items-center gap-1">
                    ⚙️ Machine
                  </span>
                  <span className="font-mono text-slate-400">—</span>
                </div>
              )}

              {/* 2. GOODS PURCHASE */}
              {materials.length > 0 ? (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                      📦 Goods Purchase
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-900">
                      {money(totalMaterialsAmount)}
                    </span>
                  </div>
                  <div className="space-y-1 max-h-[140px] overflow-y-auto pr-0.5">
                    {materials.map((m: any) => (
                      <div
                        key={`mat-${m.id}`}
                        className="flex items-center justify-between py-1 px-1.5 rounded-lg bg-white border border-slate-200/50 text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-bold text-slate-800 truncate text-[11px]">{m.item}</div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {m.quantity} {m.unit || 'pcs'} @ {money(m.rate)} {m.reference ? `· ${m.reference}` : ''}
                          </div>
                        </div>
                        <span className="font-mono font-bold text-slate-900 text-xs shrink-0">
                          {money(m.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-xl bg-slate-50/70 text-slate-400 border border-slate-100">
                  <span className="font-medium text-slate-600 text-[11px] flex items-center gap-1">
                    📦 Goods Purchase
                  </span>
                  <span className="font-mono text-slate-400">—</span>
                </div>
              )}

              {/* 3. SERVICE PURCHASE */}
              {allServices.length > 0 ? (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                      🛠️ Service Purchase
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-900">
                      {money(totalServiceAmount)}
                    </span>
                  </div>
                  <div className="space-y-1 max-h-[140px] overflow-y-auto pr-0.5">
                    {allServices.map((s: any) => (
                      <div
                        key={`srv-${s.id}`}
                        className="flex items-center justify-between py-1 px-1.5 rounded-lg bg-white border border-slate-200/50 text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-bold text-slate-800 truncate text-[11px]">{s.name}</div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {s.qty} @ {money(s.rate)} {s.sub ? `· ${s.sub}` : ''}
                          </div>
                        </div>
                        <span className="font-mono font-bold text-slate-900 text-xs shrink-0">
                          {money(s.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-xl bg-slate-50/70 text-slate-400 border border-slate-100">
                  <span className="font-medium text-slate-600 text-[11px] flex items-center gap-1">
                    🛠️ Service Purchase
                  </span>
                  <span className="font-mono text-slate-400">—</span>
                </div>
              )}

              {/* 4. EXPENSES */}
              {expenses.length > 0 ? (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                      📋 Expenses
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-900">
                      {money(totalExpensesAmount)}
                    </span>
                  </div>
                  <div className="space-y-1 max-h-[140px] overflow-y-auto pr-0.5">
                    {expenses.map((e: any) => (
                      <div
                        key={`exp-${e.id}`}
                        className="flex items-center justify-between py-1 px-1.5 rounded-lg bg-white border border-slate-200/50 text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-bold text-slate-800 truncate text-[11px]">
                            {e.part_name || e.product_name || 'Expense'}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {e.party_name || e.inward_no}
                          </div>
                        </div>
                        <span className="font-mono font-bold text-slate-900 text-xs shrink-0">
                          {money(e.total_amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-xl bg-slate-50/70 text-slate-400 border border-slate-100">
                  <span className="font-medium text-slate-600 text-[11px] flex items-center gap-1">
                    📋 Expenses
                  </span>
                  <span className="font-mono text-slate-400">—</span>
                </div>
              )}
            </div>
          )}

          {/* Box Footer Summary */}
          <div className="pt-2.5 mt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <div>
              <span className="text-[9px] uppercase font-bold text-slate-400 block leading-tight">Total Cost</span>
              <span className="font-mono font-black text-slate-900 text-xs sm:text-sm">{money(totalActual)}</span>
            </div>
            <div className="text-center">
              <span className="text-[9px] uppercase font-bold text-slate-400 block leading-tight">Sales Value</span>
              <span className="font-mono font-bold text-slate-700 text-xs sm:text-sm">{money(pData.sales_value)}</span>
            </div>
            <div className="text-right">
              <span className="text-[9px] uppercase font-bold text-slate-400 block leading-tight">Margin</span>
              <span className={`font-mono font-black text-xs sm:text-sm ${Number(profit) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {money(profit)}
                {profitPct && <span className="text-[9px] font-bold ml-1">({profitPct}%)</span>}
              </span>
            </div>
          </div>
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
        { data: procData },
        { data: bomRows },
        { data: partRows },
        { data: quoteRows },
        quoteLookup,
      ] = await Promise.all([
        supabase.from('cnc_inwards').select('*'),
        supabase.from('cnc_work_orders').select('*'),
        supabase.from('cnc_job_cards').select('*').order('created_at', { ascending: false }).limit(2000),
        supabase.from('cnc_operation_plans').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('cnc_work_order_operations').select('*').order('operation_sequence'),
        supabase.from('cnc_part_routings').select('id, product_name, product_code, status, cnc_part_routing_steps(*)'),
        supabase.from('cnc_costing_sheets').select('*').order('version', { ascending: false }).limit(200),
        supabase.from('cnc_processes').select('*').order('process_code'),
        supabase.from('cnc_bom').select('*'),
        supabase.from('cnc_parts').select('id, part_no, part_name, material, unit_price, weight, unit'),
        supabase.from('cnc_quotations').select('id, quote_no, customer, part_name, total_value, description, quantity, unit_price').limit(500),
        loadQuoteLookup(),
      ]);

      const loadedProcRates = procData || [];
      setProcRates(loadedProcRates);

      const shared: SharedCostingData = {
        inwardRows: inwardRows || [],
        allDbWos: woData || [],
        allJobCards: jcRows || [],
        allOperationPlans: plansRows || [],
        allWoOps: woOpsRows || [],
        allRoutings: routingRows || [],
        allCostingSheets: sheetRows || [],
        allBoms: bomRows || [],
        allParts: partRows || [],
        allQuotations: quoteRows || [],
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
            const detail = computeProjectDetail(proj, baseDetail, shared, loadedProcRates);
            nextMap[projectKey(proj)] = detail;
          } catch {
            const detail = computeProjectDetail(proj, null, shared, loadedProcRates);
            nextMap[projectKey(proj)] = detail;
          }
        })
      );
      setDetailsMap(nextMap);
    } catch (e) {
      setProjects([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : 'Unable to load product costing.');
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
      ['Product / Work Order', 'Part Name', 'Customer / Party', 'Planned Cost', 'Actual Cost', 'Sales Value', 'Margin (₹)', 'Margin (%)'],
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
    exportCsv(`Product_Costing_Report_${todayISO()}`, rowsToExport);
  };

  // Prints a clean cost table of the products shown (the page itself is not printed: its screen layout printed as a blank sheet).
  const printAll = () => {
    if (!filteredProjects.length) return;
    const n = (v: unknown) => Number(v) || 0;
    const sum = (a: any[] | undefined, f: (x: any) => number) => (a ?? []).reduce((t, x) => t + f(x), 0);
    const rows: unknown[][] = [['Work Order', 'Product', 'Customer', 'Machine', 'Goods Purchase', 'Service Purchase', 'Expenses', 'Total Cost', 'Sales Value', 'Margin (INR)', 'Margin %']];
    let tCost = 0, tSales = 0;
    for (const p of filteredProjects) {
      const d: any = detailsMap[projectKey(p)];
      const machine = n(d?.processOpsTotal);
      const goods = sum(d?.materials, m => n(m.amount));
      const service = sum(d?.services, m => n(m.amount)) + sum(d?.processes, m => n(m.amount));
      const exp = sum(d?.expenses, m => n(m.total_amount));
      const calc = machine + goods + service + exp;
      const pd: any = d?.project || p;
      const cost = calc > 0 ? calc : n(pd.actual_cost) || n(pd.planned_cost);
      const sales = n(pd.sales_value);
      const margin = sales > 0 ? sales - cost : null;
      tCost += cost; tSales += sales;
      rows.push([p.project_name, p.part_name, p.party_name, machine.toFixed(2), goods.toFixed(2), service.toFixed(2), exp.toFixed(2), cost.toFixed(2), sales.toFixed(2),
        margin === null ? '—' : margin.toFixed(2), margin === null || sales <= 0 ? '—' : `${((margin * 100) / sales).toFixed(1)}%`]);
    }
    rows.push(['Total', '', '', '', '', '', '', tCost.toFixed(2), tSales.toFixed(2), (tSales - tCost).toFixed(2), tSales > 0 ? `${(((tSales - tCost) * 100) / tSales).toFixed(1)}%` : '—']);
    printGrid('Product Costing', rows);
  };

  exportRef.current = exportAll;
  printRef.current = printAll;

  useEffect(() => {
    setHeader({ title: 'Product Costing' });
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
          title="Product Costing"
          description="Cost analysis by product and work order with goods purchase, service purchase, machine cost and expenses."
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
                Filter by Product / Work Order
              </label>
              <div className="relative">
                <select
                  value={selectedProjectKey}
                  onChange={(e) => setSelectedProjectKey(e.target.value)}
                  className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 pr-8 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:bg-white transition-all cursor-pointer shadow-2xs"
                >
                  <option value="all">📁 All Products / Work Orders ({projects.length})</option>
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
                  placeholder="Search product, part, company..."
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

      {/* PROJECT-WISE COMPACT BOXES GRID */}
      <div>
        {loading ? (
          <Card className="p-16 text-center text-sm font-medium text-slate-500">
            <div className="animate-spin text-2xl mb-2">⚙️</div>
            Loading product costings...
          </Card>
        ) : filteredProjects.length === 0 ? (
          <Card className="p-16 text-center text-sm font-medium text-slate-500">
            <Package className="w-8 h-8 text-slate-400 mx-auto mb-2 stroke-1" />
            No products match the selected criteria.
          </Card>
        ) : (
          <div className={filteredProjects.length === 1 ? 'max-w-xl mx-auto' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5'}>
            {filteredProjects.map((p) => {
              const k = projectKey(p);
              const detail = detailsMap[k];
              return (
                <ProjectCostingBox
                  key={k}
                  project={p}
                  detail={detail}
                  loading={detailsLoading && !detail}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
