import { useEffect, useMemo, useState } from 'react';
import {
  Cog,
  Gauge,
  TrendingUp,
  AlertTriangle,
  Package,
  ShoppingCart,
  Activity,
  Wrench,
  ShieldCheck,
  Boxes,
  Cpu,
} from 'lucide-react';
import { Card, Badge, ProgressBar, statusToVariant } from '@/components/ui/Card';
import { LineChart, DonutChart, ChartCard } from '@/components/ui/Charts';
import { PageHeader, DateSelector } from '@/components/ui/PageHeader';
import { supabase } from '@/lib/supabase';
import { useDateRange } from '@/contexts/DateRangeContext';
import { useAuth } from '@/contexts/AuthContext';
import { fetchRecentActivity, timeAgo, type ActivityItem } from '@/lib/recentActivity';

const activityIcons: Record<string, typeof Activity> = {
  production: Cog,
  quality: ShieldCheck,
  sales: TrendingUp,
  purchase: ShoppingCart,
  maintenance: Wrench,
  inventory: Boxes,
  engineering: Cpu,
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  'Confirmed': '#4f46e5',
  'Inwarded': '#0891b2',
  'In Production': '#f59e0b',
  'Partially Delivered': '#06b6d4',
  'Delivered': '#16a34a',
};

const CLOSED_WO = ['Completed', 'Dispatched'];

interface WorkOrderRow { id: string; wo_no: string; part_name: string; part_no: string; quantity: number; completed: number; rejected: number; status: string; created_at: string }
interface MachineRow { id: string; code: string; name: string; status: string; utilization: number | null }
interface JobCardRow { id: string; work_order: string; machine: string; op_no: number | null; qty_planned: number; qty_completed: number; status: string }
interface SalesOrderRow { id: string; status: string; value: number | null; total_value: number | null; created_at: string }

function ExecutiveKPI({ title, value, unit, note, icon }: { title: string; value: string; unit?: string; note?: string; icon: React.ReactNode }) {
  return (
    <Card className="p-5 flex flex-col justify-between border border-transparent hover:border-brand-200 transition-colors cursor-default group relative overflow-hidden">
      <div className="absolute -right-6 -top-6 text-slate-100 group-hover:text-brand-50/50 transition-colors transform group-hover:scale-110 duration-500 pointer-events-none">
        {icon}
      </div>
      <div className="relative z-10">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{title}</p>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-black text-slate-800 tracking-tight">{value}</span>
          {unit && <span className="text-sm font-semibold text-slate-500">{unit}</span>}
        </div>
        {note && <p className="mt-3 text-xs font-semibold text-slate-400">{note}</p>}
      </div>
    </Card>
  );
}

const inr = (n: number) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : n >= 1e3 ? `₹${(n / 1e3).toFixed(1)}k` : `₹${Math.round(n)}`;

const inRange = (iso: string | null | undefined, start: string, end: string) => {
  if (!iso) return false;
  const d = iso.slice(0, 10);
  return d >= start && d <= end;
};

export function Dashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { dateRange } = useDateRange();
  const { company, isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [workOrders, setWorkOrders] = useState<WorkOrderRow[]>([]);
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [jobCards, setJobCards] = useState<JobCardRow[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrderRow[]>([]);
  const [inventoryValue, setInventoryValue] = useState(0);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [wo, mc, jc, so, parts, raw, act] = await Promise.all([
          supabase.from('cnc_work_orders').select('id, wo_no, part_name, part_no, quantity, completed, rejected, status, created_at').order('created_at', { ascending: false }),
          supabase.from('cnc_machines').select('id, code, name, status, utilization').order('code'),
          supabase.from('cnc_job_cards').select('id, work_order, machine, op_no, qty_planned, qty_completed, status'),
          supabase.from('cnc_sales_orders').select('id, status, value, total_value, created_at'),
          supabase.from('cnc_parts').select('stock_qty, unit_price'),
          supabase.from('cnc_raw_materials').select('stock_qty, unit_price'),
          fetchRecentActivity(8),
        ]);
        for (const r of [wo, mc, jc, so, parts, raw]) if (r.error) console.error('Dashboard query failed:', r.error);
        if (cancelled) return;
        setWorkOrders((wo.data as WorkOrderRow[]) || []);
        setMachines((mc.data as MachineRow[]) || []);
        setJobCards((jc.data as JobCardRow[]) || []);
        setSalesOrders((so.data as SalesOrderRow[]) || []);
        const stockValue = (rows: { stock_qty: number | null; unit_price: number | null }[] | null) =>
          (rows || []).reduce((s, r) => s + (Number(r.stock_qty) || 0) * (Number(r.unit_price) || 0), 0);
        setInventoryValue(stockValue(parts.data) + stockValue(raw.data));
        setActivity(act);
      } catch (err) {
        console.error('Dashboard load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => {
    const openWOs = workOrders.filter(w => !CLOSED_WO.includes(w.status));
    const completed = workOrders.reduce((s, w) => s + (Number(w.completed) || 0), 0);
    const rejected = workOrders.reduce((s, w) => s + (Number(w.rejected) || 0), 0);
    const running = machines.filter(m => m.status === 'Running').length;
    const utilValues = machines.map(m => Number(m.utilization)).filter(v => !Number.isNaN(v));
    const openOrders = salesOrders.filter(o => o.status !== 'Delivered');
    return {
      openWOs,
      activeJobs: jobCards.filter(j => j.status === 'In Progress').length,
      running,
      qualityRate: completed + rejected > 0 ? (completed / (completed + rejected)) * 100 : null,
      avgUtilization: utilValues.length ? utilValues.reduce((a, b) => a + b, 0) / utilValues.length : null,
      openOrderValue: openOrders.reduce((s, o) => s + (Number(o.total_value ?? o.value) || 0), 0),
      openOrderCount: openOrders.length,
    };
  }, [workOrders, machines, jobCards, salesOrders]);

  // Planned / completed / rejected quantity of work orders raised per month in the selected range.
  const productionTrend = useMemo(() => {
    const buckets = new Map<string, { month: string; planned: number; completed: number; rejected: number }>();
    workOrders
      .filter(w => inRange(w.created_at, dateRange.start, dateRange.end))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .forEach(w => {
        const d = new Date(w.created_at);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const b = buckets.get(key) || { month: d.toLocaleString('en', { month: 'short' }), planned: 0, completed: 0, rejected: 0 };
        b.planned += Number(w.quantity) || 0;
        b.completed += Number(w.completed) || 0;
        b.rejected += Number(w.rejected) || 0;
        buckets.set(key, b);
      });
    return [...buckets.values()];
  }, [workOrders, dateRange]);

  const orderStatusData = useMemo(() => {
    const counts = new Map<string, number>();
    salesOrders.forEach(o => counts.set(o.status || 'Unknown', (counts.get(o.status || 'Unknown') || 0) + 1));
    return [...counts.entries()].map(([label, value]) => ({ label, value, color: ORDER_STATUS_COLORS[label] || '#64748b' }));
  }, [salesOrders]);

  const scopeLabel = company ? company.company_name : isSuperAdmin ? 'All companies' : '';
  const util = stats.avgUtilization;

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader
        title="CNC Factory Command Center"
        description={`${scopeLabel} — ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`}
        actions={<DateSelector />}
      />

      {/* Executive KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <ExecutiveKPI title="Open Work Orders" value={loading ? '—' : String(stats.openWOs.length)} note={`${workOrders.length} in total`} icon={<Package size={80} />} />
        <ExecutiveKPI title="Active Jobs" value={loading ? '—' : String(stats.activeJobs)} note="Job cards in progress" icon={<Cog size={80} />} />
        <ExecutiveKPI title="Machines Running" value={loading ? '—' : String(stats.running)} unit={machines.length ? `/ ${machines.length}` : undefined} note="From machine master" icon={<Gauge size={80} />} />
        <ExecutiveKPI title="Quality Rate" value={loading || stats.qualityRate === null ? '—' : stats.qualityRate.toFixed(1)} unit={stats.qualityRate === null ? undefined : '%'} note="Good ÷ (good + rejected)" icon={<ShieldCheck size={80} />} />
        <ExecutiveKPI title="Open Order Value" value={loading ? '—' : inr(stats.openOrderValue)} note={`${stats.openOrderCount} open sales orders`} icon={<AlertTriangle size={80} />} />
        <ExecutiveKPI title="Inventory Value" value={loading ? '—' : inr(inventoryValue)} note="Stock × unit price" icon={<Boxes size={80} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Machine status */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 tracking-wider uppercase">Live Machine Fleet</h3>
            <Badge variant="success" dot>{stats.running} Running</Badge>
          </div>
          <div className="flex flex-col gap-3">
            {!loading && machines.length === 0 && (
              <Card className="p-6 text-center text-sm text-slate-400">No machines registered yet.</Card>
            )}
            {machines.map(m => {
              const job = jobCards.find(j => j.machine === m.code && j.status === 'In Progress');
              const isRunning = m.status === 'Running';
              return (
                <Card key={m.id} className={`p-4 border-l-4 ${isRunning ? 'border-l-emerald-500' : m.status === 'Idle' ? 'border-l-slate-400' : m.status === 'Maintenance' ? 'border-l-amber-500' : 'border-l-red-500'} hover:shadow-card-hover transition-all cursor-pointer`} onClick={() => onNavigate('production/shop-floor')}>
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-bold text-slate-800 tracking-wide">{m.code}</h4>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${isRunning ? 'bg-emerald-100 text-emerald-700' : m.status === 'Idle' ? 'bg-slate-100 text-slate-600' : m.status === 'Maintenance' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                      {m.status}
                    </span>
                  </div>
                  {job ? (
                    <div className="mt-3 space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-mono font-semibold text-brand-700">{job.work_order}</span>
                        {job.op_no != null && <span className="text-slate-500">OP-{job.op_no}</span>}
                      </div>
                      <ProgressBar value={job.qty_completed || 0} max={job.qty_planned || 1} color="success" height="h-1.5" />
                      <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <span>{job.qty_planned ? Math.round(((job.qty_completed || 0) / job.qty_planned) * 100) : 0}% Complete</span>
                        <span>{job.qty_completed || 0}/{job.qty_planned || 0}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      {m.name || 'No active job'}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>

        {/* Production analytics */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <ChartCard title="Production vs Rejection Volume" subtitle="Work orders raised in the selected date range, by month">
            {productionTrend.length > 0 ? (
              <LineChart
                data={productionTrend}
                series={[
                  { key: 'planned', color: '#cbd5e1', label: 'Planned' },
                  { key: 'completed', color: '#4f46e5', label: 'Completed' },
                  { key: 'rejected', color: '#ef4444', label: 'Rejected' },
                ]}
                height={320}
              />
            ) : (
              <div className="h-[320px] flex items-center justify-center text-sm text-slate-400">
                {loading ? 'Loading…' : 'No work orders in this date range.'}
              </div>
            )}
          </ChartCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ChartCard title="Machine Utilization" subtitle="Average across the machine master">
              <div className="flex justify-center items-center h-full pb-4">
                <div className="relative w-48 h-48 flex items-center justify-center">
                  <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                    <path className="text-slate-100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                    <path className="text-emerald-500" strokeDasharray={`${util ?? 0}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className="text-4xl font-black text-slate-800 tracking-tighter">
                      {util === null ? '—' : util.toFixed(1)}{util !== null && <span className="text-lg">%</span>}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{machines.length} machines</span>
                  </div>
                </div>
              </div>
            </ChartCard>

            <ChartCard title="Order Execution Status" subtitle={`${salesOrders.length} sales orders`}>
              {orderStatusData.length > 0 ? (
                <DonutChart data={orderStatusData} size={190} />
              ) : (
                <div className="h-[190px] flex items-center justify-center text-sm text-slate-400">{loading ? 'Loading…' : 'No sales orders yet.'}</div>
              )}
            </ChartCard>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-bold text-slate-800 tracking-wider uppercase">Active Work Orders</h3>
            <button
              onClick={() => onNavigate('production/planning')}
              className="text-xs font-bold text-brand-600 hover:text-brand-700 transition-colors uppercase tracking-wider"
            >
              View All →
            </button>
          </div>
          <div className="overflow-x-auto scrollbar-thin flex-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-6 py-3.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Work Order</th>
                  <th className="px-6 py-3.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Part Reference</th>
                  <th className="px-6 py-3.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Progress</th>
                  <th className="px-6 py-3.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {!loading && stats.openWOs.length === 0 && (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-slate-400">No open work orders.</td></tr>
                )}
                {stats.openWOs.slice(0, 6).map((wo) => (
                  <tr key={wo.id} className="hover:bg-slate-50/50 transition-colors group cursor-pointer" onClick={() => onNavigate('production/planning')}>
                    <td className="px-6 py-4 font-mono text-xs font-bold text-brand-700">{wo.wo_no}</td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-slate-800 group-hover:text-brand-600 transition-colors">{wo.part_name}</p>
                      <p className="text-[10px] font-bold text-slate-400 font-mono tracking-wider mt-0.5">{wo.part_no}</p>
                    </td>
                    <td className="px-6 py-4 w-48">
                      <div className="flex items-center gap-3">
                        <ProgressBar value={Number(wo.completed) || 0} max={Number(wo.quantity) || 1} color="brand" height="h-1.5" />
                        <span className="text-xs font-bold text-slate-600 whitespace-nowrap">{wo.completed || 0}/{wo.quantity || 0}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={statusToVariant(wo.status)} dot>{wo.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="flex flex-col">
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-bold text-slate-800 tracking-wider uppercase">System Activity</h3>
          </div>
          <div className="divide-y divide-slate-50 flex-1 overflow-y-auto scrollbar-thin">
            {!loading && activity.length === 0 && (
              <div className="px-6 py-8 text-center text-sm text-slate-400">No activity yet.</div>
            )}
            {activity.map((act) => {
              const Icon = activityIcons[act.type] || Activity;
              return (
                <div key={act.id} className="px-6 py-4 flex items-start gap-4 hover:bg-slate-50/50 transition-colors">
                  <div className="w-8 h-8 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 flex-shrink-0 shadow-sm mt-0.5">
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 leading-snug">{act.message}</p>
                    <span className="text-[10px] text-slate-400 font-medium tracking-wider">{timeAgo(act.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
