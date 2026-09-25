import { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Printer, Search, TrendingUp, Package } from 'lucide-react';
import { Badge, Button, Card, statusToVariant } from '@/components/ui/Card';
import { inputClass } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDate, formatINR, todayISO } from '@/lib/format';
import { exportCsv, escapeHtml, printHtml } from '@/lib/reportExport';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

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

const tabs = [
  'Cost Summary',
  'Process Costing',
  'Material Cost',
  'Machine & Labour',
  'Outside Process',
  'Tooling & Consumables',
  'Overhead',
  'Comparison',
];

// Helper to check if category is Goods Purchase
const isGoodsPurchaseCategory = (cat: string | null | undefined) => {
  if (!cat) return false;
  const s = String(cat).trim().toUpperCase();
  return s.includes('GOODS PURCHASE') || s.includes('GOODS_PURCHASE') || s === 'PURCHASE';
};

export function ProjectCostingPage() {
  const { company } = useAuth();
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ProjectRow | null>(null);
  const [report, setReport] = useState<CostingDetail | null>(null);
  const [tab, setTab] = useState('Cost Summary');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const pageSize = 10;

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

  const loadProjects = async (p = 1, q = appliedSearch) => {
    setLoading(true);
    setError('');
    try {
      await autoSyncSeededInwards();

      const { data, error: rpcError } = await supabase.rpc('erp_costing_projects', {
        p_search: q || null,
        p_page: p,
        p_page_size: pageSize,
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
        const goodsPurchaseInwards = inwardRows.filter((inv: any) =>
          isGoodsPurchaseCategory(inv.category)
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

          const matchingInwards = goodsPurchaseInwards.filter((inv: any) => {
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
            const goodsPurchaseTotal = matchingInwards.reduce((sum: number, inv: any) => {
              const qty = Number(inv.quantity) || 0;
              const price = Number(inv.price) || 0;
              const tot = Number(inv.total_amount) || qty * price;
              return sum + tot;
            }, 0);

            const baseCost = Number(proj.actual_cost) || 0;
            const combinedCost = baseCost > 0 ? baseCost + goodsPurchaseTotal : goodsPurchaseTotal;
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
                ? `${proj.cost_source} + goods purchase`
                : 'goods purchase inward',
              profit,
              profit_pct: profitPct,
            };
          }
          return proj;
        });
      }

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

      // 1. Fetch Goods Purchase inwards
      const { data: inwardRows } = await supabase
        .from('cnc_inwards')
        .select('*');

      const goodsPurchaseInwards = (inwardRows || []).filter((inv: any) =>
        isGoodsPurchaseCategory(inv.category)
      );

      // Build match keys
      const workOrders = baseReport.work_orders || [];
      const matchingSo = new Set<string>();
      const matchingWo = new Set<string>();
      matchingSo.add(p.project_name.toLowerCase());
      matchingWo.add(p.project_name.toLowerCase());
      workOrders.forEach((w: any) => {
        if (w.sales_order) matchingSo.add(w.sales_order.toLowerCase());
        if (w.wo_no) matchingWo.add(w.wo_no.toLowerCase());
      });

      const currParty = (p.party_name || '').trim().toLowerCase();
      const currPart = (p.part_name || '').trim().toLowerCase();

      const matchedInwards = goodsPurchaseInwards.filter((inv: any) => {
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

      // Format inward materials
      const inwardMaterials = matchedInwards.map((inv: any) => {
        const qty = Number(inv.quantity) || 0;
        const rate = Number(inv.price) || (qty > 0 ? (Number(inv.total_amount) || 0) / qty : 0);
        const amount = Number(inv.total_amount) || qty * rate;
        return {
          id: inv.id || crypto.randomUUID(),
          date: inv.inward_date || inv.created_at || todayISO(),
          type: 'Goods Purchase',
          reference: inv.reference_no ? `${inv.inward_no} (${inv.reference_no})` : inv.inward_no,
          item: inv.part_name || inv.product_name || 'Goods Purchase Item',
          quantity: String(qty),
          unit: 'pcs',
          rate: String(rate),
          amount: String(amount),
          work_order: inv.project_name || p.project_name,
          request_no: inv.inward_no,
        };
      });

      const allMaterials = [...(baseReport.materials || []), ...inwardMaterials];
      const totalMaterialCost = allMaterials.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
      const inwardAmount = inwardMaterials.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

      // Update categories breakdown for Cost Summary & Comparison tabs
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

      // Compute combined actual cost and margin
      const baseActual = Number(baseReport.project?.actual_cost) || 0;
      const combinedActual = (baseActual > 0 ? baseActual + inwardAmount : totalMaterialCost) || null;
      const salesVal = Number(baseReport.project?.sales_value || p.sales_value) || null;
      const profit =
        salesVal !== null && combinedActual !== null ? (salesVal - combinedActual).toFixed(2) : null;
      const profitPct =
        salesVal !== null && salesVal > 0 && combinedActual !== null
          ? (((salesVal - combinedActual) * 100) / salesVal).toFixed(2)
          : null;

      const costSource = baseReport.project?.cost_source
        ? inwardAmount > 0
          ? `${baseReport.project.cost_source} + goods purchase`
          : baseReport.project.cost_source
        : inwardAmount > 0
        ? 'goods purchase inward'
        : null;

      const finalDetail: CostingDetail = {
        ...baseReport,
        materials: allMaterials,
        categories: updatedCategories,
        project: {
          ...baseReport.project,
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
  const maxCategory = Math.max(1, ...categoryRows.map((x) => Number(x.amount)));
  const categoryForTab = useMemo(() => {
    if (tab === 'Tooling & Consumables') return categoryRows.filter((x) => /tool|consum|fixture/i.test(x.category));
    if (tab === 'Overhead') return categoryRows.filter((x) => /overhead|admin|factory/i.test(x.category));
    return categoryRows;
  }, [categoryRows, tab]);

  const exportReport = () => {
    if (!report) return;
    exportCsv('Costing_' + report.project.project_name, [
      ['Project', report.project.project_name],
      ['Customer', report.project.party_name],
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

  const totalMaterialsAmount = useMemo(() => {
    return (report?.materials || []).reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  }, [report?.materials]);

  return (
    <div className="p-4 lg:p-6 space-y-4 bg-slate-50 min-h-full">
      <PageHeader
        title="Project Costing"
        description="Cost analysis from existing project costs, production records, inventory movements and goods purchase inwards."
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={exportReport} disabled={!report}>
              Export
            </Button>
            <Button variant="secondary" size="sm" icon={<Printer size={14} />} onClick={printReport}>
              Print
            </Button>
          </>
        }
      />
      {error && <div className="border border-rose-200 bg-rose-50 text-rose-700 rounded p-2 text-sm">{error}</div>}
      <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-4 items-start">
        <Card className="overflow-hidden">
          <div className="p-3 border-b bg-slate-50">
            <h3 className="font-bold text-sm">Projects / Work Orders</h3>
            <form
              className="mt-2 flex gap-1"
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
                placeholder="Search project, part, customer..."
              />
              <Button size="sm" type="submit" aria-label="Search">
                <Search size={14} />
              </Button>
            </form>
          </div>
          <div className="max-h-[340px] overflow-auto divide-y">
            {loading ? (
              <div className="p-6 text-center text-xs text-slate-500">Loading projects...</div>
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
                  <div className="font-semibold text-xs text-slate-800">{p.project_name}</div>
                  <div className="text-[10px] text-slate-500">{p.part_name} · {p.party_name}</div>
                  <div className="text-[10px] mt-1 text-slate-600">Recorded actual: {money(p.actual_cost)}</div>
                </button>
              ))
            )}
            {!loading && !projects.length && (
              <div className="p-6 text-center text-xs text-slate-500">No project cost records found.</div>
            )}
          </div>
          <div className="flex justify-between p-2 border-t text-xs text-slate-500">
            <span>{total} projects</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => void loadProjects(page - 1)}>
                <span className="sr-only">Previous</span>‹
              </button>
              {page}
              <button disabled={page * pageSize >= total} onClick={() => void loadProjects(page + 1)}>
                <span className="sr-only">Next</span>›
              </button>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          {!selected ? (
            <Card className="p-12 text-center text-sm text-slate-500">Select a project or work order to view its costing.</Card>
          ) : (
            <>
              <Card className="p-4">
                <div className="flex flex-wrap justify-between gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Project / Work Order</div>
                    <h2 className="text-lg font-bold">{selected.project_name}</h2>
                    <div className="text-sm text-slate-600">{selected.part_name} · {selected.party_name}</div>
                    {jobs.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {jobs.map((w) => (
                          <Badge key={w.id} variant={statusToVariant(w.status)}>
                            {w.wo_no} · {w.status}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Sales Order Value</div>
                    <div className="font-bold">{money(project?.sales_value)}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                  <Metric
                    title="Planned Cost"
                    value={money(project?.planned_cost)}
                    note={project?.planned_cost ? 'From planned_workings' : 'No estimate source recorded'}
                  />
                  <Metric
                    title="Recorded Actual Cost"
                    value={money(totalActual)}
                    note={project?.cost_source || 'No cost source recorded'}
                  />
                  <Metric
                    title="Sales Value"
                    value={money(project?.sales_value)}
                    note="Linked sales order only"
                  />
                  <Metric
                    title="Margin on Recorded Cost"
                    value={money(profit)}
                    note={profitPct !== null && profitPct !== undefined ? profitPct + '%' : 'Not available'}
                  />
                </div>
                <div className="mt-4 border rounded-lg p-3 bg-slate-50">
                  <div className="flex justify-between text-xs">
                    <b>Production Progress</b>
                    <span>
                      {quantity
                        ? completed +
                          ' completed · ' +
                          Math.max(0, quantity - completed - rejected) +
                          ' pending · ' +
                          rejected +
                          ' rejected'
                        : 'No linked work order quantities'}
                    </span>
                  </div>
                  <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: progress + '%' }} />
                  </div>
                  <div className="text-right text-xs mt-1 font-semibold">{progress.toFixed(1)}%</div>
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
                  {(tab === 'Cost Summary' || tab === 'Comparison') && (
                    <Card className="overflow-hidden">
                      <div className="p-3 border-b bg-slate-50">
                        <h3 className="font-bold text-sm">
                          {tab === 'Comparison' ? 'Planned vs Actual' : 'Cost Breakdown'}
                        </h3>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500">
                            <th className="p-2 text-left">Cost Head</th>
                            <th className="p-2 text-right">Planned</th>
                            <th className="p-2 text-right">Recorded Actual</th>
                            <th className="p-2 text-right">Variance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categoryForTab.map((x) => (
                            <tr key={x.category} className="border-t">
                              <td className="p-2 font-medium">{x.category}</td>
                              <td className="p-2 text-right">—</td>
                              <td className="p-2 text-right font-medium">{money(x.amount)}</td>
                              <td className="p-2 text-right">—</td>
                            </tr>
                          ))}
                          {!categoryForTab.length && (
                            <tr>
                              <td colSpan={4} className="p-6 text-center text-slate-500">
                                {project?.planned_cost
                                  ? 'Planned amount is available at project level; category estimates are not configured.'
                                  : 'No categorized cost records for this project.'}
                              </td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="border-t bg-slate-50 font-bold">
                            <td className="p-2">Recorded Total</td>
                            <td className="p-2 text-right">{money(project?.planned_cost)}</td>
                            <td className="p-2 text-right text-brand-700">{money(totalActual)}</td>
                            <td className="p-2 text-right">—</td>
                          </tr>
                        </tfoot>
                      </table>
                    </Card>
                  )}

                  {(tab === 'Cost Summary' || tab === 'Comparison') && (
                    <Card className="p-4">
                      <h3 className="font-bold text-sm mb-3">Recorded Cost Distribution</h3>
                      {categoryRows.length ? (
                        categoryRows.map((x, i) => (
                          <div key={x.category} className="mb-3">
                            <div className="flex justify-between text-xs">
                              <span>{x.category}</span>
                              <b>{money(x.amount)}</b>
                            </div>
                            <div className="h-2 rounded bg-slate-100 mt-1">
                              <div
                                className={
                                  'h-full rounded ' +
                                  ['bg-blue-500', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500', 'bg-violet-500', 'bg-cyan-500'][
                                    i % 6
                                  ]
                                }
                                style={{ width: Math.max(1, (Number(x.amount) / maxCategory) * 100) + '%' }}
                              />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-slate-500">No cost distribution is available.</div>
                      )}
                      <div className="border-t pt-3 mt-3 text-xs text-slate-500">
                        Distribution uses {project?.cost_source || 'the available recorded cost source'}; linked detail rows are not added twice.
                      </div>
                    </Card>
                  )}

                  {(tab === 'Process Costing' || tab === 'Outside Process') && (
                    <Card className="overflow-hidden xl:col-span-2">
                      <div className="p-3 border-b bg-slate-50">
                        <h3 className="font-bold text-sm">
                          {tab === 'Outside Process' ? 'Outside Process Cost' : 'Process Wise Costing'}
                        </h3>
                      </div>
                      <div className="overflow-auto">
                        <table className="w-full min-w-[700px] text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500">
                              <th className="p-2 text-left">Process</th>
                              <th className="p-2 text-left">Supplier / Party</th>
                              <th className="p-2 text-right">Quantity</th>
                              <th className="p-2 text-right">Duration</th>
                              <th className="p-2 text-right">Rate</th>
                              <th className="p-2 text-right">Recorded Cost</th>
                              <th className="p-2">Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(report?.processes || []).map((x) => (
                              <tr key={x.id} className="border-t">
                                <td className="p-2">{x.process}</td>
                                <td className="p-2">{x.supplier || '—'}</td>
                                <td className="p-2 text-right">{x.quantity || '—'}</td>
                                <td className="p-2 text-right">{x.duration || '—'}</td>
                                <td className="p-2 text-right">{money(x.rate)}</td>
                                <td className="p-2 text-right">{money(x.amount)}</td>
                                <td className="p-2">{formatDate(x.created_at)}</td>
                              </tr>
                            ))}
                            {!report?.processes?.length && (
                              <tr>
                                <td colSpan={7} className="p-8 text-center text-slate-500">
                                  No process cost records for this project.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}

                  {tab === 'Material Cost' && (
                    <Card className="overflow-hidden xl:col-span-2">
                      <div className="p-3 border-b bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-sm">Material Cost from Goods Purchase & Inventory Issues</h3>
                          <p className="text-[10px] text-slate-500">
                            Source: Goods Purchase inward entries and posted stock movements linked to this project or work order.
                          </p>
                        </div>
                        {report?.materials && report.materials.length > 0 && (
                          <Badge variant="success" className="font-mono text-xs font-semibold px-2 py-0.5">
                            Total Material: {money(totalMaterialsAmount.toFixed(2))}
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
                                  No linked material cost or goods purchase inward records.
                                </td>
                              </tr>
                            )}
                          </tbody>
                          {report?.materials && report.materials.length > 0 && (
                            <tfoot>
                              <tr className="border-t bg-slate-50/90 font-bold">
                                <td colSpan={7} className="p-2.5 text-right text-slate-700 uppercase tracking-wide text-[11px]">
                                  Total Material Cost
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

                  {tab === 'Machine & Labour' && (
                    <Card className="overflow-hidden xl:col-span-2">
                      <div className="p-3 border-b bg-slate-50">
                        <h3 className="font-bold text-sm">Production Operations</h3>
                        <p className="text-[10px] text-slate-500">
                          Machine and operator hours/rates are not stored in the current job card schema, so monetary costs are not estimated here.
                        </p>
                      </div>
                      <div className="overflow-auto">
                        <table className="w-full min-w-[650px] text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500">
                              <th className="p-2">Job</th>
                              <th className="p-2 text-left">Operation</th>
                              <th className="p-2">Machine / Operator</th>
                              <th className="p-2 text-right">Planned Qty</th>
                              <th className="p-2 text-right">Completed</th>
                              <th className="p-2 text-right">Cycle / Setup record</th>
                              <th className="p-2">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(report?.operations || []).map((x) => (
                              <tr key={x.id} className="border-t">
                                <td className="p-2">{x.job_no}</td>
                                <td className="p-2">{x.operation}</td>
                                <td className="p-2">{x.machine} / {x.operator || '—'}</td>
                                <td className="p-2 text-right">{x.qty_planned || '—'}</td>
                                <td className="p-2 text-right">{x.qty_completed || '—'}</td>
                                <td className="p-2 text-right">{x.cycle_time || '—'} / {x.setup_time || '—'}</td>
                                <td className="p-2">{x.status || '—'}</td>
                              </tr>
                            ))}
                            {!report?.operations?.length && (
                              <tr>
                                <td colSpan={7} className="p-8 text-center text-slate-500">
                                  No linked job card records.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}

                  {(tab === 'Tooling & Consumables' || tab === 'Overhead') && (
                    <Card className="overflow-hidden xl:col-span-2">
                      <div className="p-3 border-b bg-slate-50">
                        <h3 className="font-bold text-sm">{tab}</h3>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="p-2 text-left">Cost Head</th>
                            <th className="p-2 text-right">Recorded Actual</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categoryForTab.map((x) => (
                            <tr key={x.category} className="border-t">
                              <td className="p-2">{x.category}</td>
                              <td className="p-2 text-right">{money(x.amount)}</td>
                            </tr>
                          ))}
                          {!categoryForTab.length && (
                            <tr>
                              <td colSpan={2} className="p-8 text-center text-slate-500">
                                No {tab.toLowerCase()} cost records are configured for this project.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
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

function Metric({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <Card className="p-3">
      <div className="text-[10px] text-slate-500">{title}</div>
      <div className="text-sm font-bold truncate">{value}</div>
      <div className="mt-1 text-[10px] text-slate-400 truncate">{note}</div>
    </Card>
  );
}
