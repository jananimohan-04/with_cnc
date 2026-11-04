import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Upload, FileText, Printer, Search, TrendingUp, Package, GripVertical } from 'lucide-react';
import { Badge, Button, Card, statusToVariant } from '@/components/ui/Card';
import { inputClass } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDate, formatINR, todayISO } from '@/lib/format';
import { exportCsv, escapeHtml, printHtml } from '@/lib/reportExport';
import { supabase } from '@/lib/supabase';
import { machineCostTotal, quoteNameKey, spanMinutes, valueOperations } from '@/lib/projectCosting';
import { calcJobCardHours } from '@/lib/costingEngine';
import { useAuth } from '@/contexts/AuthContext';
import { useHeaderKpis } from '@/contexts/HeaderKpiContext';

type ProjectRow = {
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

type CostingDetail = {
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
    job_no: string;
    operation: string;
    machine: string;
    operator: string;
    qty_planned: string;
    qty_completed: string;
    qty_rejected: string;
    cycle_time: string;
    setup_time: string;
    status: string;
  }[];
};

const money = (v: string | number | null | undefined) =>
  v == null || v === '' ? '—' : formatINR(v, { decimals: 'auto' });

// The three cost heads are named as they are booked: Service Purchase (outside work), Goods Purchase (material bought) and
// Machine Cost (in-house operations valued with Process Master rates and the hours scheduled / run).
const tabs = [
  'Service Purchase',
  'Goods Purchase',
  'Machine Cost',
  'Expenses',
];

// Helper to check if category is Goods Purchase
const isGoodsPurchaseCategory = (cat: string | null | undefined) => {
  if (!cat) return false;
  const s = String(cat).trim().toUpperCase();
  return s.includes('GOODS PURCHASE') || s.includes('GOODS_PURCHASE') || s === 'PURCHASE';
};

// Helper to check if category is Service Purchase (routed to Machine & Labour)
const isServicePurchaseCategory = (cat: string | null | undefined) => {
  if (!cat) return false;
  const s = String(cat).trim().toUpperCase();
  return s.includes('SERVICE PURCHASE') || s.includes('SERVICE_PURCHASE') || s === 'SERVICE';
};

const isPurchaseCategory = (cat: string | null | undefined) =>
  isGoodsPurchaseCategory(cat) || isServicePurchaseCategory(cat);

// Quotation totals by sales order (via quotation_id / quote_no), falling back to customer + part.
// Returns a matcher: (project / sales-order refs, party, part) -> quoted amount, or null.
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
    // No sales-order link: customer + product, comparing the product without its date / company suffix.
    const wantPart = quoteNameKey(part);
    const byParty = quoteList.filter((q: any) => lc(q.customer) === lc(party) && (lc(q.part_name) === lc(part) || (!!wantPart && quoteNameKey(q.part_name) === wantPart)));
    const latest = byParty[byParty.length - 1];
    return latest && totalOf(latest) > 0 ? totalOf(latest) : null;
  };
}

export function ProjectCostingPage() {
  const { company } = useAuth();
  const { setHeader, setTabActions } = useHeaderKpis();
  const exportRef = useRef<() => void>(() => {});
  const printRef = useRef<() => void>(() => {});

  // Resizable left/right panes width (persisted in localStorage)
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('project_costing_left_width');
      const n = saved ? parseInt(saved, 10) : NaN;
      return Number.isFinite(n) && n >= 220 && n <= 750 ? n : 300;
    } catch {
      return 300;
    }
  });
  const [isDragging, setIsDragging] = useState(false);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startX = e.clientX;
    const initialWidth = leftWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidth = Math.max(220, Math.min(750, initialWidth + delta));
      setLeftWidth(nextWidth);
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      const delta = upEvent.clientX - startX;
      const finalWidth = Math.max(220, Math.min(750, initialWidth + delta));
      setLeftWidth(finalWidth);
      try {
        localStorage.setItem('project_costing_left_width', String(finalWidth));
      } catch {}
      setIsDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [leftWidth]);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ProjectRow | null>(null);
  const [report, setReport] = useState<CostingDetail | null>(null);
  const [tab, setTab] = useState('Goods Purchase');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [pageSize, setPageSize] = useState(10);
  // Process Master rates for valuing production operations (missing table tolerated).
  const [procRates, setProcRates] = useState<any[]>([]);
  // Expense inwards entered for this project (typed product / project name).
  const [expenseRows, setExpenseRows] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error: e } = await supabase.from('cnc_processes').select('*').order('process_code');
        if (!cancelled && !e) setProcRates(data ?? []);
      } catch { /* rates stay empty; operations show unmatched */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-upgrade seeded dummy inwards if needed
  const autoSyncSeededInwards = async () => {
    try {
      await supabase
        .from('cnc_inwards')
        .update({ category: 'GOODS PURCHASE' })
        .in('inward_no', ['INW-2026-201', 'INW-2026-202', 'INW-2026-203', 'INW-2026-204', 'INW-2026-205'])
        .eq('category', 'CUSTOMER DC');
    } catch {
      // Ignore if permission or network issue
    }
  };

  const loadProjects = async (p = 1, q = appliedSearch, sz = pageSize) => {
    setLoading(true);
    setError('');
    try {
      await autoSyncSeededInwards();

      const { data, error: rpcError } = await supabase.rpc('erp_costing_projects', {
        p_search: q || null,
        p_page: p,
        p_page_size: sz,
      } as never);
      if (rpcError) throw new Error(rpcError.message);
      const result = data as any;
      let rows: ProjectRow[] = result.rows || [];

      // Fetch Goods Purchase inwards to enrich actual_cost in project list
      const { data: inwardRows } = await supabase
        .from('cnc_inwards')
        .select('*');

      const { data: woList } = await supabase
        .from('cnc_work_orders')
        .select('wo_no, sales_order, customer, part_name');

      if (inwardRows && inwardRows.length > 0) {
        const purchaseInwards = inwardRows.filter((inv: any) =>
          isPurchaseCategory(inv.category)
        );

        rows = rows.map((proj) => {
          const linkedWos = (woList || []).filter(
            (w: any) =>
              w.wo_no === proj.project_name ||
              w.sales_order === proj.project_name ||
              (w.customer === proj.party_name && w.part_name === proj.part_name)
          );

          const matchingSo = new Set<string>();
          const matchingWo = new Set<string>();
          matchingSo.add(proj.project_name.toLowerCase());
          matchingWo.add(proj.project_name.toLowerCase());
          linkedWos.forEach((w: any) => {
            if (w.sales_order) matchingSo.add(w.sales_order.toLowerCase());
            if (w.wo_no) matchingWo.add(w.wo_no.toLowerCase());
          });

          const matchingInwards = purchaseInwards.filter((inv: any) => {
            const soRef = (inv.sales_order_ref || '').trim().toLowerCase();
            const projRef = (inv.project_name || '').trim().toLowerCase();
            const partyRef = (inv.party_name || '').trim().toLowerCase();
            const partRef = (inv.part_name || '').trim().toLowerCase();
            const prodRef = (inv.product_name || '').trim().toLowerCase();
            const currParty = (proj.party_name || '').trim().toLowerCase();
            const currPart = (proj.part_name || '').trim().toLowerCase();

            if (soRef && matchingSo.has(soRef)) return true;
            if (projRef && (matchingWo.has(projRef) || matchingSo.has(projRef))) return true;
            if (partyRef && partyRef === currParty && (partRef === currPart || prodRef === currPart)) return true;
            return false;
          });

          if (matchingInwards.length > 0) {
            const purchaseTotal = matchingInwards.reduce((sum: number, inv: any) => {
              const qty = Number(inv.quantity) || 0;
              const price = Number(inv.price) || 0;
              const tot = Number(inv.total_amount) || qty * price;
              return sum + tot;
            }, 0);

            const kinds = Array.from(
              new Set(
                matchingInwards.map((inv: any) =>
                  isServicePurchaseCategory(inv.category) ? 'service purchase' : 'goods purchase'
                )
              )
            );

            const baseCost = Number(proj.actual_cost) || 0;
            const combinedCost = baseCost > 0 ? baseCost + purchaseTotal : purchaseTotal;
            const salesVal = Number(proj.sales_value) || 0;
            const profit = salesVal ? (salesVal - combinedCost).toFixed(2) : null;
            const profitPct =
              salesVal && salesVal > 0
                ? (((salesVal - combinedCost) * 100) / salesVal).toFixed(2)
                : null;

            return {
              ...proj,
              actual_cost: combinedCost.toFixed(2),
              cost_source: proj.cost_source
                ? `${proj.cost_source} + ${kinds.join(' + ')}`
                : `${kinds.join(' + ')} inward`,
              profit,
              profit_pct: profitPct,
            };
          }
          return proj;
        });
      }

      // Planned Cost: the amount quoted to the customer, unless planned_workings already has one.
      const quoteLookup = await loadQuoteLookup();
      rows = rows.map((proj) => {
        if (Number(proj.planned_cost) > 0) return proj;
        const linked = (woList || []).filter((w: any) => w.wo_no === proj.project_name || w.sales_order === proj.project_name);
        const quoted = quoteLookup(
          [proj.project_name, ...linked.map((w: any) => w.sales_order)],
          proj.party_name, proj.part_name,
        );
        return quoted ? { ...proj, planned_cost: quoted.toFixed(2) } : proj;
      });

      setProjects(rows);
      setTotal(result.total || 0);
      setPage(p);
      const next =
        rows.find(
          (x: ProjectRow) =>
            selected &&
            x.project_name === selected.project_name &&
            x.part_name === selected.part_name &&
            x.party_name === selected.party_name
        ) ||
        rows[0] ||
        null;
      setSelected(next);
    } catch (e) {
      setProjects([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : 'Unable to load project costing.');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (p: ProjectRow | null) => {
    if (!p) {
      setReport(null);
      return;
    }
    setDetailLoading(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('erp_project_costing_detail', {
        p_project_name: p.project_name,
        p_part_name: p.part_name || null,
        p_party_name: p.party_name || null,
      } as never);
      if (rpcError) throw new Error(rpcError.message);

      const baseReport = (data as CostingDetail) || {
        project: { ...p, product_cost: null, process_cost: null, invoice_value: null },
        categories: [],
        processes: [],
        materials: [],
        work_orders: [],
        operations: [],
      };

      // 1. Fetch all work orders from cnc_work_orders to find all matching / linked production orders
      const { data: woData } = await supabase.from('cnc_work_orders').select('*');
      const allDbWos = (woData || []) as any[];

      const lc = (v: any) => String(v ?? '').trim().toLowerCase();
      const pProj = lc(p.project_name);
      const pPart = lc(p.part_name);
      const pParty = lc(p.party_name);
      const pPartKey = quoteNameKey(p.part_name);

      const matchedDbWos = allDbWos.filter((w: any) => {
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
        ...(baseReport.work_orders || []),
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

      // 2. Fetch purchase inwards (goods -> material, service -> machine & labour)
      const { data: inwardRows } = await supabase.from('cnc_inwards').select('*');
      const purchaseInwards = (inwardRows || []).filter((inv: any) => isPurchaseCategory(inv.category));

      // Build match keys for inwards and operations
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
        if (w.sales_order) {
          matchingSo.add(lc(w.sales_order));
        }
        if (w.wo_no) {
          matchingWo.add(lc(w.wo_no));
          allWoNos.add(w.wo_no);
        }
        if (w.id && isUuid(w.id)) allWoIds.add(String(w.id));
        if (w.part_name) candidatePartNames.add(w.part_name);
      });

      const currParty = pParty;
      const currPart = pPart;

      setExpenseRows((inwardRows || []).filter((inv: any) => {
        if (String(inv.category || '').trim().toUpperCase() !== 'EXPENSES' || inv.status === 'Deleted') return false;
        const names = [inv.project_name, inv.product_name].map(lc).filter(Boolean);
        if (lc(inv.sales_order_ref) && matchingSo.has(lc(inv.sales_order_ref))) return true;
        if (names.some(n => n === pProj || n === currPart || matchingSo.has(n) || matchingWo.has(n))) return true;
        return !!lc(inv.party_name) && lc(inv.party_name) === currParty && lc(inv.part_name) === currPart;
      }));

      const matchedInwards = purchaseInwards.filter((inv: any) => {
        const soRef = (inv.sales_order_ref || '').trim().toLowerCase();
        const projRef = (inv.project_name || '').trim().toLowerCase();
        const partyRef = (inv.party_name || '').trim().toLowerCase();
        const partRef = (inv.part_name || '').trim().toLowerCase();
        const prodRef = (inv.product_name || '').trim().toLowerCase();

        if (soRef && matchingSo.has(soRef)) return true;
        if (projRef && (matchingWo.has(projRef) || matchingSo.has(projRef))) return true;
        if (partyRef && partyRef === currParty && (partRef === currPart || prodRef === currPart)) return true;
        return false;
      });

      // Format inward rows: goods purchase -> material, service purchase -> machine & labour
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

      const allMaterials = [...(baseReport.materials || []), ...inwardMaterials];
      const totalMaterialCost = allMaterials.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
      const inwardAmount = inwardMaterials.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
      const serviceAmount = serviceRows.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

      // 3. Fetch Job Cards, Operation Plans, Work Order Operations, Costing Sheets, and Part Routing
      const targetWoList = Array.from(allWoNos);
      const targetPartList = Array.from(candidatePartNames);
      const targetWoIds = Array.from(allWoIds);

      const [jcByWoRes, jcByPartRes, jcRecentRes, plansByWoRes, plansRecentRes, woOpsRes, routingRes, sheetRes] = await Promise.all([
        targetWoList.length > 0
          ? supabase.from('cnc_job_cards').select('id, job_no, work_order, part_name, operation, machine, operator, actual_start, actual_end, completed_at, actual_minutes, status, qty_completed, qty_planned, cycle_time, setup_time, created_at').in('work_order', targetWoList)
          : Promise.resolve({ data: [] }),
        targetPartList.length > 0
          ? supabase.from('cnc_job_cards').select('id, job_no, work_order, part_name, operation, machine, operator, actual_start, actual_end, completed_at, actual_minutes, status, qty_completed, qty_planned, cycle_time, setup_time, created_at').in('part_name', targetPartList)
          : Promise.resolve({ data: [] }),
        supabase.from('cnc_job_cards').select('id, job_no, work_order, part_name, operation, machine, operator, actual_start, actual_end, completed_at, actual_minutes, status, qty_completed, qty_planned, cycle_time, setup_time, created_at').order('created_at', { ascending: false }).limit(200),
        targetWoIds.length > 0
          ? supabase.from('cnc_operation_plans').select('*').in('work_order_id', targetWoIds).order('operation_sequence')
          : Promise.resolve({ data: [] }),
        supabase.from('cnc_operation_plans').select('*').order('created_at', { ascending: false }).limit(200),
        targetWoIds.length > 0
          ? supabase.from('cnc_work_order_operations').select('*').in('work_order_id', targetWoIds).order('operation_sequence')
          : Promise.resolve({ data: [] }),
        supabase.from('cnc_part_routings').select('id, product_name, product_code, cnc_part_routing_steps(*)').or(`product_name.ilike.%${p.part_name}%,product_code.ilike.%${p.part_name}%`).eq('status', 'Active').limit(1),
        (targetWoList.length > 0 || matchingSo.size > 0)
          ? supabase.from('cnc_costing_sheets').select('*').order('version', { ascending: false }).limit(20)
          : Promise.resolve({ data: [] }),
      ]);

      const jcMap = new Map<string, any>();
      const addJobCard = (j: any) => {
        if (!j || !j.id) return;
        if (jcMap.has(String(j.id))) return;
        jcMap.set(String(j.id), j);
      };
      (jcByWoRes.data || []).forEach(addJobCard);
      (jcByPartRes.data || []).forEach(addJobCard);

      (jcRecentRes.data || []).forEach((j: any) => {
        const jPartKey = quoteNameKey(j.part_name);
        if (pPartKey && jPartKey && jPartKey === pPartKey) addJobCard(j);
        if (j.work_order && (allWoNos.has(j.work_order) || matchingSo.has(lc(j.work_order)))) addJobCard(j);
      });

      const planList: any[] = (plansByWoRes.data || []) as any[];
      const seenPlanIds = new Set<string>(planList.map((x: any) => String(x.id)));
      (plansRecentRes.data || []).forEach((pl: any) => {
        if (seenPlanIds.has(String(pl.id))) return;
        if (allWoIds.has(String(pl.work_order_id))) {
          seenPlanIds.add(String(pl.id));
          planList.push(pl);
        }
      });

      const woOps: any[] = (woOpsRes.data || []) as any[];
      const routingSteps: any[] = (routingRes.data?.[0]?.cnc_part_routing_steps || []) as any[];

      // Match costing sheets if any belong to these work orders or sales orders
      let sheetOps: any[] = [];
      const matchingSheets = (sheetRes.data || []).filter((s: any) => {
        const sWo = s.work_order_no;
        const sSo = lc(s.sales_order_no);
        return (sWo && allWoNos.has(sWo)) || (sSo && matchingSo.has(sSo));
      });
      if (matchingSheets.length > 0 && matchingSheets[0]?.workings?.processes) {
        sheetOps = matchingSheets[0].workings.processes;
      }

      // Build merged operations
      const jcList = Array.from(jcMap.values());
      const mergedOps: any[] = [];
      const seenOpKey = new Set<string>();

      // 1. Add Job Cards
      jcList.forEach((j: any) => {
        const opName = String(j.operation || 'Machining').trim();
        const mach = String(j.machine || '').trim();
        const hrs = calcJobCardHours(j);
        mergedOps.push({
          id: j.id,
          job_no: j.job_no,
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
          start_time: j.start_time,
          end_time: j.end_time,
          actual_start: j.actual_start,
          actual_end: j.actual_end,
          completed_at: j.completed_at,
          created_at: j.created_at,
        });
        seenOpKey.add(`${opName.toLowerCase()}|${mach.toLowerCase()}`);
      });

      // 2. Add Work Order Operations if not represented by a job card
      woOps.forEach((o: any) => {
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
      });

      // 3. Add Operation Plans if not represented
      planList.forEach((pl: any) => {
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
      });

      // 4. Add Costing Sheet Operations (fallback if mergedOps is empty)
      if (mergedOps.length === 0 && sheetOps.length > 0) {
        sheetOps.forEach((s: any, idx: number) => {
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

      // 5. Add Part Routing Steps (fallback if mergedOps is empty)
      if (mergedOps.length === 0 && routingSteps.length > 0) {
        routingSteps.forEach((rs: any, idx: number) => {
          const opName = String(rs.process_name || rs.process_code || 'Machining').trim();
          const cycle = Number(rs.cycle_time) || 0;
          const setup = Number(rs.setup_time) || 0;
          const hrs = Math.max(1, (setup + 1 * cycle) / 60);
          mergedOps.push({
            id: rs.id || `routing-${idx}`,
            job_no: null,
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
            status: 'Routing Planned',
          });
        });
      }

      // 6. Keep any operations from baseReport if not covered
      (baseReport.operations || []).forEach((bo: any) => {
        const opName = String(bo.operation || 'Machining').trim();
        const mach = String(bo.machine || '').trim();
        const k = `${opName.toLowerCase()}|${mach.toLowerCase()}`;
        if (!seenOpKey.has(k)) {
          const hrs = calcJobCardHours(bo);
          mergedOps.push({
            ...bo,
            actual_minutes: String(Math.round(hrs * 60)),
            hours: hrs,
          });
          seenOpKey.add(k);
        }
      });

      // Calculate total machine cost
      const valuedOps = valueOperations(mergedOps, procRates);
      const totalMachineCost = machineCostTotal(valuedOps);

      // Update categories breakdown (used by export/print)
      let updatedCategories = [...(baseReport.categories || [])];
      const matCatIdx = updatedCategories.findIndex((c) => /material/i.test(c.category));
      if (matCatIdx >= 0) {
        const existingAmt = Number(updatedCategories[matCatIdx].amount) || 0;
        updatedCategories[matCatIdx] = {
          ...updatedCategories[matCatIdx],
          amount: (existingAmt + inwardAmount).toFixed(2),
        };
      } else if (totalMaterialCost > 0) {
        updatedCategories.unshift({
          category: 'Material Cost',
          amount: totalMaterialCost.toFixed(2),
        });
      }
      if (serviceAmount > 0) {
        const svcCatIdx = updatedCategories.findIndex((c) => /service/i.test(c.category));
        if (svcCatIdx >= 0) {
          const existingAmt = Number(updatedCategories[svcCatIdx].amount) || 0;
          updatedCategories[svcCatIdx] = {
            ...updatedCategories[svcCatIdx],
            amount: (existingAmt + serviceAmount).toFixed(2),
          };
        } else {
          updatedCategories.push({
            category: 'Service Cost',
            amount: serviceAmount.toFixed(2),
          });
        }
      }
      if (totalMachineCost > 0) {
        const machCatIdx = updatedCategories.findIndex((c) => /machine|in-house|labour/i.test(c.category));
        if (machCatIdx >= 0) {
          updatedCategories[machCatIdx] = {
            ...updatedCategories[machCatIdx],
            amount: totalMachineCost.toFixed(2),
          };
        } else {
          updatedCategories.push({
            category: 'Machine Cost',
            amount: totalMachineCost.toFixed(2),
          });
        }
      }

      // Compute combined actual cost and margin including machine cost
      const baseActual = Number(baseReport.project?.actual_cost) || 0;
      const purchaseAmount = inwardAmount + serviceAmount;
      const combinedActual = (totalMaterialCost + serviceAmount + totalMachineCost) || (baseActual > 0 ? baseActual + purchaseAmount : null);
      const salesVal = Number(baseReport.project?.sales_value || p.sales_value) || null;
      const profit =
        salesVal !== null && combinedActual !== null ? (salesVal - combinedActual).toFixed(2) : null;
      const profitPct =
        salesVal !== null && salesVal > 0 && combinedActual !== null
          ? (((salesVal - combinedActual) * 100) / salesVal).toFixed(2)
          : null;

      const purchaseKinds = [
        ...(inwardAmount > 0 ? ['goods purchase'] : []),
        ...(serviceAmount > 0 ? ['service purchase'] : []),
        ...(totalMachineCost > 0 ? ['machine cost'] : []),
      ];
      const costSource = baseReport.project?.cost_source
        ? purchaseKinds.length > 0
          ? `${baseReport.project.cost_source} + ${purchaseKinds.join(' + ')}`
          : baseReport.project.cost_source
        : purchaseKinds.length > 0
        ? `${purchaseKinds.join(' + ')}`
        : null;

      let plannedCost = baseReport.project?.planned_cost ?? null;
      if (!(Number(plannedCost) > 0)) {
        const quoted = (await loadQuoteLookup())(
          [p.project_name, ...allWorkOrders.map((w: any) => w.sales_order)], p.party_name, p.part_name,
        );
        if (quoted) plannedCost = quoted.toFixed(2);
      }

      const finalDetail: CostingDetail = {
        ...baseReport,
        work_orders: allWorkOrders,
        operations: mergedOps,
        materials: allMaterials,
        services: [...(baseReport.services || []), ...serviceRows],
        categories: updatedCategories,
        project: {
          ...baseReport.project,
          planned_cost: plannedCost,
          actual_cost: combinedActual !== null ? String(combinedActual) : null,
          cost_source: costSource,
          profit,
          profit_pct: profitPct,
        },
      };

      setReport(finalDetail);
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : 'Unable to load costing details.');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects(1, '');
  }, [company?.id]);

  useEffect(() => {
    void loadDetail(selected);
  }, [selected?.project_name, selected?.part_name, selected?.party_name, company?.id]);

  const project = report?.project;
  const categoryRows = report?.categories || [];
  const jobs = report?.work_orders || [];
  const completed = jobs.reduce((n, w) => n + Number(w.completed || 0), 0);
  const rejected = jobs.reduce((n, w) => n + Number(w.rejected || 0), 0);
  const quantity = jobs.reduce((n, w) => n + Number(w.quantity || 0), 0);
  const progress = quantity ? Math.min(100, (completed / quantity) * 100) : 0;
  const totalActual = project?.actual_cost ?? project?.product_cost ?? project?.process_cost ?? null;
  const profit = project?.profit ?? null;
  const profitPct = project?.profit_pct ?? null;

  const exportReport = () => {
    if (!report) return;
    exportCsv('Costing_' + report.project.project_name, [
      ['Project', report.project.project_name],
      ['Company', report.project.party_name],
      ['Part', report.project.part_name],
      ['Planned Cost', report.project.planned_cost || ''],
      ['Recorded Actual Cost', totalActual || ''],
      ['Sales Order Value', report.project.sales_value || ''],
      ['Recorded Margin', profit || ''],
      [],
      ['Cost Category', 'Actual Amount'],
      ...categoryRows.map((x) => [x.category, x.amount]),
      [],
      ['Process', 'Supplier', 'Quantity', 'Duration', 'Rate', 'Amount'],
      ...(report.processes || []).map((x) => [
        x.process,
        x.supplier,
        x.quantity,
        x.duration,
        x.rate,
        x.amount,
      ]),
      [],
      ['Date', 'Source', 'Item', 'Quantity', 'Unit', 'Rate', 'Amount'],
      ...(report.materials || []).map((x) => [
        x.date,
        x.request_no,
        x.item,
        x.quantity,
        x.unit,
        x.rate,
        x.amount,
      ]),
      [],
      ['Machine Cost Operations'],
      ['Process / Operation', 'Machine / Operator', 'Hours', 'Rate / Hour', 'Cost', 'Status'],
      ...processOps.map((x: any) => [
        x.operation || '',
        `${x.machine || ''} / ${x.operator || ''}`,
        `${x.hours} h`,
        x.matched ? String(x.rate) : '—',
        x.matched ? String(x.cost) : '—',
        x.status || '—',
      ]),
    ]);
  };

  const printReport = () => {
    if (!report) {
      window.print();
      return;
    }
    const rows = categoryRows
      .map((x) => '<tr><td>' + escapeHtml(x.category) + '</td><td>' + money(x.amount) + '</td></tr>')
      .join('');
    printHtml(
      'Project Costing ' + report.project.project_name,
      '<h1>ARGUS CNC</h1><h2>Project Costing</h2><p>' +
        escapeHtml(report.project.project_name) +
        ' · ' +
        escapeHtml(report.project.part_name) +
        ' · ' +
        escapeHtml(report.project.party_name) +
        '</p><table><thead><tr><th>Cost Head</th><th>Recorded Actual</th></tr></thead><tbody>' +
        rows +
        '</tbody></table><p>Planned: ' +
        money(report.project.planned_cost) +
        ' · Actual: ' +
        money(totalActual) +
        ' · Sales Order: ' +
        money(report.project.sales_value) +
        '</p>'
    );
  };

  exportRef.current = exportReport;
  printRef.current = printReport;
  const hasReport = !!report;

  useEffect(() => {
    setHeader({ title: 'Project Costing' });
    setTabActions(
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={<Upload size={14} />}
          onClick={() => exportRef.current()}
          disabled={!hasReport}
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
  }, [setHeader, setTabActions, hasReport]);

  const totalMaterialsAmount = useMemo(() => {
    return (report?.materials || []).reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  }, [report?.materials]);

  const totalServiceAmount = useMemo(() => {
    return (report?.services || []).reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  }, [report?.services]);
  // Production operations valued with live Process Master rates (process costing
  // = production operations). Operations without a matching master rate show
  // hours only and are excluded from the total.
  const processOps = useMemo(() => valueOperations(report?.operations || [], procRates ?? []), [report?.operations, procRates]);

  const processOpsTotal = useMemo(() => machineCostTotal(processOps), [processOps]);

  return (
    <div className="p-2 sm:p-4 lg:px-6 lg:pt-2 lg:pb-6 space-y-3 bg-slate-50 min-h-full">
      <div className="lg:hidden">
        <PageHeader
          title="Project Costing"
          description="Cost analysis from existing project costs, production records, inventory movements, goods purchase inwards, service purchase inwards and machine cost."
          actions={
            <>
              <Button variant="secondary" size="sm" icon={<Upload size={14} />} onClick={exportReport} disabled={!report}>
                Export
              </Button>
              <Button variant="secondary" size="sm" icon={<Printer size={14} />} onClick={printReport}>
                Print
              </Button>
            </>
          }
        />
      </div>
      {error && <div className="border border-rose-200 bg-rose-50 text-rose-700 rounded p-2 text-sm">{error}</div>}
      <div className="flex flex-col xl:flex-row items-start gap-4 xl:gap-0">
        <div
          className="w-full xl:w-[var(--left-pane-w)] xl:shrink-0"
          style={{ ['--left-pane-w' as any]: `${leftWidth}px` }}
        >
          <Card className="overflow-hidden">
            <div className="p-3 border-b bg-slate-50 flex items-center justify-between">
              <h3 className="font-bold text-sm">Projects / Work Orders</h3>
              <span className="hidden xl:inline text-[10px] text-slate-400 font-mono" title="Width of panel">{leftWidth}px</span>
            </div>
            <div className="p-3 border-b bg-slate-50 pt-0">
              <form
                className="flex gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  setAppliedSearch(search);
                  void loadProjects(1, search);
                }}
              >
                <input
                  className={inputClass}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search project, part, company..."
                />
                <Button size="sm" type="submit" aria-label="Search">
                  <Search size={14} />
                </Button>
              </form>
            </div>
            <div className="max-h-[340px] overflow-auto divide-y">
              {loading ? (
                <div className="p-4 text-center text-xs text-slate-500">Loading projects...</div>
              ) : (
                projects.map((p) => (
                  <button
                    key={p.project_name + '|' + p.part_name + '|' + p.party_name}
                    onClick={() => setSelected(p)}
                    className={
                      'w-full text-left p-3 hover:bg-blue-50 transition-colors ' +
                      (selected?.project_name === p.project_name && selected?.part_name === p.part_name
                        ? 'bg-blue-50 border-l-4 border-brand-600'
                        : '')
                    }
                  >
                    <div className="text-xs font-semibold text-slate-800">{p.part_name} · {p.party_name}</div>
                    <div className="text-[10px] mt-1 text-slate-600">Recorded actual: {money(p.actual_cost)}</div>
                  </button>
                ))
              )}
              {!loading && !projects.length && (
                <div className="p-4 text-center text-xs text-slate-500">No project cost records found.</div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 border-t text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 font-medium text-slate-600">
                  Show
                  <select aria-label="Projects per page" value={pageSize} onChange={e => { const sz = Number(e.target.value); setPageSize(sz); void loadProjects(1, appliedSearch, sz); }}
                    className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-700">
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={100}>All</option>
                  </select>
                </label>
                <span>{total} projects</span>
              </div>
              <div className="flex gap-2 items-center">
                <button disabled={page <= 1} onClick={() => void loadProjects(page - 1)} className="p-1 hover:bg-slate-100 rounded disabled:opacity-40">
                  <span className="sr-only">Previous</span>‹
                </button>
                <span className="font-semibold">{page}</span>
                <button disabled={page * pageSize >= total} onClick={() => void loadProjects(page + 1)} className="p-1 hover:bg-slate-100 rounded disabled:opacity-40">
                  <span className="sr-only">Next</span>›
                </button>
              </div>
            </div>
          </Card>
        </div>

        {/* Draggable Divider between Left and Right panes (Desktop) */}
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={startDrag}
          onDoubleClick={() => {
            setLeftWidth(300);
            try {
              localStorage.setItem('project_costing_left_width', '300');
            } catch {}
          }}
          className={`hidden xl:flex items-center justify-center w-3 hover:w-3.5 cursor-col-resize select-none shrink-0 self-stretch group z-10 transition-colors ${
            isDragging ? 'bg-orange-100/60' : 'hover:bg-slate-200/50'
          }`}
          title="Drag left/right to resize panels (Double-click to reset to 300px)"
        >
          <div
            className={`rounded-full transition-all flex items-center justify-center ${
              isDragging
                ? 'w-1.5 bg-orange-500 h-28 shadow-sm'
                : 'w-1 h-14 group-hover:h-28 bg-slate-300 group-hover:bg-orange-400 group-hover:w-1.5'
            }`}
          >
            <GripVertical
              size={11}
              className={`transition-colors ${
                isDragging ? 'text-white' : 'text-slate-400 group-hover:text-white'
              }`}
            />
          </div>
        </div>

        <div className="w-full min-w-0 flex-1 space-y-4 xl:pl-3">
          {!selected ? (
            <Card className="p-12 text-center text-sm text-slate-500">Select a project or work order to view its costing.</Card>
          ) : (
            <>
              <Card className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <div className="min-w-[180px] max-w-[320px]">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Project / Work Order</div>
                    <h2 className="text-base font-bold leading-tight truncate" title={selected.project_name}>{selected.project_name}</h2>
                    <div className="text-xs text-slate-600 truncate" title={`${selected.part_name} · ${selected.party_name}`}>{selected.part_name} · {selected.party_name}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">Sales Order Value</div>
                      <div className="text-sm font-bold">{money(project?.sales_value)}</div>
                    </div>
                    <div title={project?.planned_cost ? 'From planned_workings, else the quotation total' : 'No estimate source recorded'}>
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">Planned Cost</div>
                      <div className="text-sm font-bold">{money(project?.planned_cost)}</div>
                    </div>
                    <div title="In-house operations: hours run in Scheduling (or setup + qty x cycle time) x the Process Master cost per hour">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">Machine Cost</div>
                      <div className="text-sm font-bold">{processOpsTotal > 0 ? money(processOpsTotal) : '—'}</div>
                    </div>
                    <div title={project?.cost_source || 'No cost source recorded'}>
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">Recorded Actual Cost</div>
                      <div className="text-sm font-bold">{money(totalActual)}</div>
                    </div>
                    <div title="Linked sales order only">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">Sales Value</div>
                      <div className="text-sm font-bold">{money(project?.sales_value)}</div>
                    </div>
                    <div title={profitPct !== null && profitPct !== undefined ? profitPct + '%' : 'Not available'}>
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">Margin on Recorded Cost</div>
                      <div className="text-sm font-bold">{money(profit)}</div>
                    </div>
                  </div>
                </div>
                {jobs.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {jobs.map((w) => (
                      <Badge key={w.id} variant={statusToVariant(w.status)}>
                        {w.part_name || 'Production order'} · {w.status}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <b className="text-[11px] whitespace-nowrap">Production Progress</b>
                  <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: progress + '%' }} />
                  </div>
                  <span className="text-[11px] text-slate-500 whitespace-nowrap">
                    {quantity
                      ? completed +
                        ' completed · ' +
                        Math.max(0, quantity - completed - rejected) +
                        ' pending · ' +
                        rejected +
                        ' rejected'
                      : 'No linked work order quantities'}
                  </span>
                  <span className="text-[11px] font-semibold">{progress.toFixed(1)}%</span>
                </div>
              </Card>

              <div className="flex overflow-auto border-b">
                {tabs.map((x) => (
                  <button
                    key={x}
                    onClick={() => setTab(x)}
                    className={
                      'whitespace-nowrap px-3 py-2 text-[11px] font-semibold border-b-2 transition-colors ' +
                      (tab === x ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800')
                    }
                  >
                    {x}
                  </button>
                ))}
              </div>

              {detailLoading ? (
                <Card className="p-12 text-center text-sm text-slate-500">Loading costing records...</Card>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {tab === 'Service Purchase' && (
                    <>
                    <Card className="overflow-hidden xl:col-span-2">
                      <div className="p-3 border-b bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-sm">Service Purchase</h3>
                          <p className="text-[10px] text-slate-500">
                            Work done outside for this project: the process costs recorded against it. In-house work is under Machine Cost.
                          </p>
                        </div>
                        {(report?.processes?.length ?? 0) > 0 && (
                          <Badge variant="success" className="font-mono text-xs font-semibold px-2 py-0.5">
                            Total Service Purchase: {money((report?.processes || []).reduce((n, x) => n + (Number(x.amount) || 0), 0).toFixed(2))}
                          </Badge>
                        )}
                      </div>
                      <div className="overflow-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500">
                              <th className="p-2 text-left">Type</th>
                              <th className="p-2 text-left">Process</th>
                              <th className="p-2 text-left">Company</th>
                              <th className="p-2 text-right">Qty / Duration</th>
                              <th className="p-2 text-right">Rate</th>
                              <th className="p-2 text-right">Cost</th>
                              <th className="p-2 text-left">Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(report?.processes || []).map((x) => (
                              <tr key={`p-${x.id}`} className="border-t hover:bg-slate-50/70">
                                <td className="p-2"><span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200">Service Purchase</span></td>
                                <td className="p-2 font-medium text-slate-800">{x.process}</td>
                                <td className="p-2">{x.supplier || '—'}</td>
                                <td className="p-2 text-right">{x.quantity || x.duration || '—'}</td>
                                <td className="p-2 text-right">{money(x.rate)}</td>
                                <td className="p-2 text-right font-semibold text-slate-900">{money(x.amount)}</td>
                                <td className="p-2">{formatDate(x.created_at)}</td>
                              </tr>
                            ))}
                            {!report?.processes?.length && (
                              <tr>
                                <td colSpan={7} className="p-6 text-center text-slate-500">No outside process cost recorded for this project.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                    <Card className="overflow-hidden xl:col-span-2">
                      <div className="p-3 border-b bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-sm">Service Purchase Inwards</h3>
                          <p className="text-[10px] text-slate-500">
                            Source: Service Purchase inward entries linked to this project or work order.
                          </p>
                        </div>
                        {report?.services && report.services.length > 0 && (
                          <Badge variant="success" className="font-mono text-xs font-semibold px-2 py-0.5">
                            Total Service Purchase: {money(totalServiceAmount.toFixed(2))}
                          </Badge>
                        )}
                      </div>
                      <div className="overflow-auto">
                        <table className="w-full min-w-[700px] text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500">
                              <th className="p-2 text-left">Date</th>
                              <th className="p-2 text-left">Item / Service</th>
                              <th className="p-2 text-left">Source</th>
                              <th className="p-2 text-left">Inward / Request Ref</th>
                              <th className="p-2 text-right">Quantity</th>
                              <th className="p-2 text-center">Unit</th>
                              <th className="p-2 text-right">Rate</th>
                              <th className="p-2 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(report?.services || []).map((x) => (
                              <tr key={x.id} className="border-t hover:bg-slate-50/70">
                                <td className="p-2">{formatDate(x.date)}</td>
                                <td className="p-2 font-medium text-slate-800">{x.item}</td>
                                <td className="p-2">
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200">
                                    Service Purchase
                                  </span>
                                </td>
                                <td className="p-2 font-mono text-[11px] text-slate-600">{x.reference || x.request_no}</td>
                                <td className="p-2 text-right font-medium">{x.quantity}</td>
                                <td className="p-2 text-center text-slate-500">{x.unit || 'pcs'}</td>
                                <td className="p-2 text-right">{money(x.rate)}</td>
                                <td className="p-2 text-right font-semibold text-slate-900">{money(x.amount)}</td>
                              </tr>
                            ))}
                            {!report?.services?.length && (
                              <tr>
                                <td colSpan={8} className="p-6 text-center text-slate-500">No linked service purchase inward records.</td>
                              </tr>
                            )}
                          </tbody>
                          {report?.services && report.services.length > 0 && (
                            <tfoot>
                              <tr className="border-t bg-slate-50/90 font-bold">
                                <td colSpan={7} className="p-2.5 text-right text-slate-700 uppercase tracking-wide text-[11px]">Total Service Purchase</td>
                                <td className="p-2.5 text-right font-mono text-emerald-700 text-sm">{money(totalServiceAmount.toFixed(2))}</td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </Card>
                    </>
                  )}
{tab === 'Expenses' && (
                    <Card className="overflow-hidden xl:col-span-2">
                      <div className="p-3 border-b bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-sm">Expenses</h3>
                          <p className="text-[10px] text-slate-500">Expense inward entries made for this project.</p>
                        </div>
                        {expenseRows.length > 0 && (
                          <Badge variant="success" className="font-mono text-xs font-semibold px-2 py-0.5">
                            Total Expenses: {money(expenseRows.reduce((n, x) => n + (Number(x.total_amount) || 0), 0).toFixed(2))}
                          </Badge>
                        )}
                      </div>
                      <div className="overflow-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500">
                              <th className="p-2 text-left">Date</th>
                              <th className="p-2 text-left">Reference</th>
                              <th className="p-2 text-left">Expense</th>
                              <th className="p-2 text-left">Company</th>
                              <th className="p-2 text-left">Remarks</th>
                              <th className="p-2 text-right">Qty</th>
                              <th className="p-2 text-right">Rate</th>
                              <th className="p-2 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {expenseRows.map((x) => (
                              <tr key={x.id} className="border-t hover:bg-slate-50/70">
                                <td className="p-2">{formatDate(x.inward_date || x.created_at)}</td>
                                <td className="p-2 font-mono text-[11px]">{x.inward_no}{x.reference_no ? ` (${x.reference_no})` : ''}</td>
                                <td className="p-2 font-medium text-slate-800">{x.part_name || x.product_name || '—'}</td>
                                <td className="p-2">{x.party_name || '—'}</td>
                                <td className="p-2">{x.remarks || '—'}</td>
                                <td className="p-2 text-right">{x.quantity}</td>
                                <td className="p-2 text-right">{money(x.price)}</td>
                                <td className="p-2 text-right font-semibold text-slate-900">{money(x.total_amount)}</td>
                              </tr>
                            ))}
                            {!expenseRows.length && (
                              <tr><td colSpan={8} className="p-8 text-center text-slate-500">No expenses for this project.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}
{tab === 'Goods Purchase' && (
                    <Card className="overflow-hidden xl:col-span-2">
                      <div className="p-3 border-b bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-sm">Goods Purchase</h3>
                          <p className="text-[10px] text-slate-500">
                            Source: Goods Purchase inward entries (and material issued from stock) linked to this project or work order.
                          </p>
                        </div>
                        {report?.materials && report.materials.length > 0 && (
                          <Badge variant="success" className="font-mono text-xs font-semibold px-2 py-0.5">
                            Total Goods Purchase: {money(totalMaterialsAmount.toFixed(2))}
                          </Badge>
                        )}
                      </div>
                      <div className="overflow-auto">
                        <table className="w-full min-w-[700px] text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500">
                              <th className="p-2 text-left">Date</th>
                              <th className="p-2 text-left">Item / Material</th>
                              <th className="p-2 text-left">Source</th>
                              <th className="p-2 text-left">Inward / Request Ref</th>
                              <th className="p-2 text-right">Quantity</th>
                              <th className="p-2 text-center">Unit</th>
                              <th className="p-2 text-right">Rate</th>
                              <th className="p-2 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(report?.materials || []).map((x) => (
                              <tr key={x.id} className="border-t hover:bg-slate-50/70">
                                <td className="p-2">{formatDate(x.date)}</td>
                                <td className="p-2 font-medium text-slate-800">{x.item}</td>
                                <td className="p-2">
                                  <span
                                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                      x.type === 'Goods Purchase'
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-blue-50 text-blue-700 border border-blue-200'
                                    }`}
                                  >
                                    {x.type || 'Material'}
                                  </span>
                                </td>
                                <td className="p-2 font-mono text-[11px] text-slate-600">
                                  {x.reference || x.request_no}
                                </td>
                                <td className="p-2 text-right font-medium">{x.quantity}</td>
                                <td className="p-2 text-center text-slate-500">{x.unit || 'pcs'}</td>
                                <td className="p-2 text-right">{money(x.rate)}</td>
                                <td className="p-2 text-right font-semibold text-slate-900">{money(x.amount)}</td>
                              </tr>
                            ))}
                            {!report?.materials?.length && (
                              <tr>
                                <td colSpan={8} className="p-8 text-center text-slate-500">
                                  No linked goods purchase inward records.
                                </td>
                              </tr>
                            )}
                          </tbody>
                          {report?.materials && report.materials.length > 0 && (
                            <tfoot>
                              <tr className="border-t bg-slate-50/90 font-bold">
                                <td colSpan={7} className="p-2.5 text-right text-slate-700 uppercase tracking-wide text-[11px]">
                                  Total Goods Purchase
                                </td>
                                <td className="p-2.5 text-right font-mono text-emerald-700 text-sm">
                                  {money(totalMaterialsAmount.toFixed(2))}
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </Card>
                  )}

                  {tab === 'Machine Cost' && (
                    <Card className="overflow-hidden xl:col-span-2">
                      <div className="p-3 border-b bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-sm">Machine Cost</h3>
                          <p className="text-[10px] text-slate-500">
                            In-house operations of this project. Hours are the time run in Scheduling (actual start to end); if none were recorded, setup + qty x cycle time.
                            Cost = hours x the cost per hour of that process in Process Master, plus cost per component and setup cost.
                          </p>
                        </div>
                        {processOpsTotal > 0 && (
                          <Badge variant="success" className="font-mono text-xs font-semibold px-2 py-0.5">
                            Total Machine Cost: {money(processOpsTotal.toFixed(2))}
                          </Badge>
                        )}
                      </div>
                      <div className="overflow-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500">
                              <th className="p-2 text-left">Process / Operation</th>
                              <th className="p-2 text-left">Machine / Operator</th>
                              <th className="p-2 text-right">Hours</th>
                              <th className="p-2 text-right">Rate / hour</th>
                              <th className="p-2 text-right">Cost</th>
                              <th className="p-2 text-left">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {processOps.map((x: any) => (
                              <tr key={`o-${x.id}`} className="border-t hover:bg-slate-50/70">
                                <td className="p-2 font-medium text-slate-800">
                                  {x.operation || '—'}
                                  {!x.matched && (
                                    <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200"
                                      title="Machine cost needs an operation name that matches a process in Process Master with a cost per hour">
                                      {x.operation ? 'Not in Process Master' : 'No operation name'}
                                    </span>
                                  )}
                                </td>
                                <td className="p-2">{x.machine || '—'} / {x.operator || '—'}</td>
                                <td className="p-2 text-right">{x.hours} h</td>
                                <td className="p-2 text-right">{x.matched ? money(x.rate) : '—'}</td>
                                <td className="p-2 text-right font-semibold text-slate-900">{x.matched ? money(x.cost) : '—'}</td>
                                <td className="p-2">{x.status || '—'}</td>
                              </tr>
                            ))}
                            {!processOps.length && (
                              <tr>
                                <td colSpan={6} className="p-8 text-center text-slate-500">
                                  No in-house operations for this project yet. Record the runs under Scheduling, Actual, Add runs for this part,
                                  and set the cost per hour of the process in Process Master.
                                </td>
                              </tr>
                            )}
                          </tbody>
                          {processOps.length > 0 && (
                            <tfoot>
                              <tr className="border-t bg-slate-50/90 font-bold">
                                <td colSpan={4} className="p-2.5 text-right text-slate-700 uppercase tracking-wide text-[11px]">Total Machine Cost</td>
                                <td className="p-2.5 text-right font-mono text-emerald-700 text-sm">{money(processOpsTotal.toFixed(2))}</td>
                                <td />
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </Card>
                  )}

                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
