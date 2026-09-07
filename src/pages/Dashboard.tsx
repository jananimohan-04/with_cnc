import {
  ClipboardList,
  Cog,
  CheckCircle2,
  Clock,
  Gauge,
  TrendingUp,
  AlertTriangle,
  Package,
  ShoppingCart,
  FileText,
  Activity,
  Wrench,
  ShieldCheck,
  Boxes,
  Cpu,
  BarChart4,
} from 'lucide-react';
import { Card, Badge, ProgressBar, statusToVariant } from '@/components/ui/Card';
import { LineChart, DonutChart, BarChart, ChartCard } from '@/components/ui/Charts';
import { PageHeader, DateSelector, FilterButton } from '@/components/ui/PageHeader';
import {
  productionTrend,
  orderStatusData,
  qualityData,
  machines,
  workOrders,
  recentActivities,
  jobCards,
} from '@/data/mockData';

const activityIcons: Record<string, typeof Activity> = {
  production: Cog,
  quality: ShieldCheck,
  sales: TrendingUp,
  purchase: ShoppingCart,
  maintenance: Wrench,
  inventory: Boxes,
  engineering: Cpu,
};

function ExecutiveKPI({ title, value, unit, trend, isPositive, sparklineData, icon }: any) {
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
        <div className="flex items-center gap-2 mt-3 text-xs font-semibold">
          <span className={`flex items-center gap-0.5 ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
            {isPositive ? '↑' : '↓'} {trend}
          </span>
          <span className="text-slate-400">vs last month</span>
        </div>
      </div>
      {sparklineData && (
        <div className="mt-4 h-8 flex items-end gap-1 relative z-10">
          {sparklineData.map((val: number, i: number) => (
            <div
              key={i}
              className={`flex-1 rounded-t-sm transition-all duration-300 group-hover:opacity-100 opacity-70 ${isPositive ? 'bg-emerald-500' : 'bg-brand-500'}`}
              style={{ height: `${val}%` }}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

export function Dashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader
        title="CNC Factory Command Center"
        description="Enterprise Production Analytics — September 7, 2026"
        actions={
          <div className="flex items-center gap-3">
             <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-brand-50 border border-brand-100 rounded-md text-brand-700 text-xs font-bold tracking-wide">
               <Activity size={14} /> LIVE SHIFT: MORNING
             </div>
             <FilterButton />
             <DateSelector />
          </div>
        }
      />

      {/* Executive KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <ExecutiveKPI title="Production Today" value="1,248" unit="Nos" trend="12.5%" isPositive={true} icon={<Package size={80}/>} sparklineData={[40, 60, 50, 80, 70, 90, 100]} />
        <ExecutiveKPI title="Active Jobs" value="18" trend="3 new" isPositive={true} icon={<Cog size={80}/>} sparklineData={[20, 30, 40, 30, 60, 50, 70]} />
        <ExecutiveKPI title="Machine OEE" value="84.2" unit="%" trend="2.1%" isPositive={true} icon={<Gauge size={80}/>} sparklineData={[75, 78, 80, 81, 84, 83, 84]} />
        <ExecutiveKPI title="Quality Rate" value="98.5" unit="%" trend="0.4%" isPositive={true} icon={<ShieldCheck size={80}/>} sparklineData={[96, 97, 98, 97, 98, 98, 99]} />
        <ExecutiveKPI title="Rejection Value" value="₹42k" trend="₹8k" isPositive={false} icon={<AlertTriangle size={80}/>} sparklineData={[10, 20, 15, 30, 25, 40, 35]} />
        <ExecutiveKPI title="Inventory Value" value="₹48.2" unit="L" trend="4.5%" isPositive={true} icon={<Boxes size={80}/>} sparklineData={[50, 60, 55, 70, 80, 75, 90]} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* CNC MACHINE STATUS (Command Center View) */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          <div className="flex items-center justify-between">
             <h3 className="text-sm font-bold text-slate-800 tracking-wider uppercase">Live Machine Fleet</h3>
             <Badge variant="success" dot>7 Online</Badge>
          </div>
          <div className="flex flex-col gap-3">
             {machines.map(m => {
                const job = jobCards.find(j => j.machine === m.code && (j.status === 'Running' || j.status === 'Setup')) || jobCards.find(j => j.machine === m.code);
                const isRunning = m.status === 'Running';
                
                return (
                  <Card key={m.id} className={`p-4 border-l-4 ${isRunning ? 'border-l-emerald-500' : m.status === 'Idle' ? 'border-l-slate-400' : m.status === 'Maintenance' ? 'border-l-amber-500' : 'border-l-red-500'} hover:shadow-card-hover transition-all cursor-pointer`} onClick={() => onNavigate('production/shop-floor')}>
                     <div className="flex justify-between items-start mb-2">
                        <div>
                           <div className="flex items-center gap-2">
                              <h4 className="font-bold text-slate-800 tracking-wide">{m.code}</h4>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${isRunning ? 'bg-emerald-100 text-emerald-700' : m.status === 'Idle' ? 'bg-slate-100 text-slate-600' : m.status === 'Maintenance' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                {m.status}
                              </span>
                           </div>
                        </div>
                     </div>
                     {isRunning && job ? (
                        <div className="mt-3 space-y-2">
                           <div className="flex justify-between text-xs">
                              <span className="font-mono font-semibold text-brand-700">{job.workOrder}</span>
                              <span className="text-slate-500">OP-{job.opNo}</span>
                           </div>
                           <ProgressBar value={job.qtyCompleted} max={job.qtyPlanned} color="success" height="h-1.5" />
                           <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              <span>{Math.round((job.qtyCompleted/job.qtyPlanned)*100)}% Complete</span>
                              <span>{job.qtyCompleted}/{job.qtyPlanned}</span>
                           </div>
                        </div>
                     ) : (
                        <div className="mt-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                           {m.status === 'Maintenance' ? 'Scheduled PM Task' : m.status === 'Breakdown' ? 'Spindle Error logged' : 'Awaiting Job Assignment'}
                        </div>
                     )}
                  </Card>
                );
             })}
          </div>
        </div>

        {/* PRODUCTION ANALYTICS */}
        <div className="lg:col-span-2 flex flex-col gap-6">
           <ChartCard
             title="Production vs Rejection Volume"
             subtitle="Daily aggregate across all work centers"
             action={<button className="text-brand-600 hover:text-brand-700 text-xs font-bold uppercase tracking-wider"><BarChart4 size={16}/></button>}
           >
             <LineChart
               data={productionTrend}
               series={[
                 { key: 'planned', color: '#cbd5e1', label: 'Planned' },
                 { key: 'completed', color: '#4f46e5', label: 'Completed' },
                 { key: 'rejected', color: '#ef4444', label: 'Rejected' },
               ]}
               height={320}
             />
           </ChartCard>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ChartCard title="Overall Equipment Effectiveness (OEE)" subtitle="Trailing 30 days performance">
                <div className="flex justify-center items-center h-full pb-4">
                   <div className="relative w-48 h-48 flex items-center justify-center">
                     <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                       <path className="text-slate-100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                       <path className="text-emerald-500" strokeDasharray="84.2, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                     </svg>
                     <div className="absolute flex flex-col items-center justify-center">
                        <span className="text-4xl font-black text-slate-800 tracking-tighter">84.2<span className="text-lg">%</span></span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Target: 80%</span>
                     </div>
                   </div>
                </div>
              </ChartCard>
              
              <ChartCard title="Order Execution Status" subtitle="Live tracking of 860 active orders">
                 <DonutChart data={orderStatusData} size={190} />
              </ChartCard>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-bold text-slate-800 tracking-wider uppercase">Active Work Orders</h3>
            <button
              onClick={() => onNavigate('production/work-orders')}
              className="text-xs font-bold text-brand-600 hover:text-brand-700 transition-colors uppercase tracking-wider"
            >
              View All Router →
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
                {workOrders.slice(0, 6).map((wo) => (
                  <tr key={wo.id} className="hover:bg-slate-50/50 transition-colors group cursor-pointer" onClick={() => onNavigate('production/work-orders')}>
                    <td className="px-6 py-4 font-mono text-xs font-bold text-brand-700">{wo.woNo}</td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-slate-800 group-hover:text-brand-600 transition-colors">{wo.partName}</p>
                      <p className="text-[10px] font-bold text-slate-400 font-mono tracking-wider mt-0.5">{wo.partNo}</p>
                    </td>
                    <td className="px-6 py-4 w-48">
                      <div className="flex items-center gap-3">
                        <ProgressBar value={wo.completed} max={wo.quantity} color="brand" height="h-1.5" />
                        <span className="text-xs font-bold text-slate-600 whitespace-nowrap">{wo.completed}/{wo.quantity}</span>
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
            <Badge variant="brand" dot>Live Sync</Badge>
          </div>
          <div className="divide-y divide-slate-50 flex-1 overflow-y-auto scrollbar-thin">
            {recentActivities.map((act) => {
              const Icon = activityIcons[act.type] || Activity;
              return (
                <div key={act.id} className="px-6 py-4 flex items-start gap-4 hover:bg-slate-50/50 transition-colors">
                  <div className="w-8 h-8 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 flex-shrink-0 shadow-sm mt-0.5">
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 leading-snug">{act.message}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                       <span className="text-[10px] font-bold text-brand-600 tracking-wider uppercase">{act.user}</span>
                       <span className="text-[10px] text-slate-400 font-medium tracking-wider">{act.time}</span>
                    </div>
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
