import { useState } from 'react';
import { Plus, Eye, Edit, Cog, ClipboardList, Gauge, Package, Activity, TrendingUp, Calendar } from 'lucide-react';
import { PageHeader, FilterButton, ExportButton, DateSelector, SectionCard } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Card, Badge, Button, StatCard, ProgressBar, statusToVariant, priorityToVariant } from '@/components/ui/Card';
import { Modal, FormField, FormSection, inputClass } from '@/components/ui/Modal';
import { BarChart, ChartCard, GaugeChart } from '@/components/ui/Charts';
import { workOrders, jobCards, machines, productionTrend } from '@/data/mockData';
import type { WorkOrder, JobCard, Machine } from '@/data/mockData';

export function ProductionPlanningPage() {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Production Planning" description="Plan and schedule production orders" actions={<div className="flex items-center gap-2"><FilterButton /><ExportButton /><DateSelector /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Planned Orders" value="11" icon={<ClipboardList size={20} />} accent="brand" />
        <StatCard label="Scheduled" value="8" icon={<Calendar size={20} />} accent="success" />
        <StatCard label="Capacity Used" value="87%" icon={<Gauge size={20} />} accent="accent" />
        <StatCard label="Backlog (days)" value="4.2" icon={<ClipboardList size={20} />} accent="warning" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <ChartCard title="Planned vs Completed" subtitle="Last 7 months">
          <BarChart data={productionTrend} series={[{ key: 'planned', color: '#c7d2fe', label: 'Planned' }, { key: 'completed', color: '#4f46e5', label: 'Completed' }]} height={220} />
        </ChartCard>
        <ChartCard title="Capacity Utilization" subtitle="By machine type">
          <div className="space-y-4">
            {[{ label: 'CNC Turning', val: 87 }, { label: 'CNC VMC', val: 92 }, { label: 'CNC HMC', val: 45 }, { label: '5-Axis', val: 78 }, { label: 'Grinding', val: 0 }, { label: 'Wire EDM', val: 81 }].map((m) => (
              <div key={m.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-slate-600">{m.label}</span>
                  <span className="text-sm font-semibold text-slate-700">{m.val}%</span>
                </div>
                <ProgressBar value={m.val} color={m.val > 80 ? 'success' : m.val > 50 ? 'brand' : m.val > 0 ? 'warning' : 'error'} />
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
      <SectionCard title="Upcoming Production Schedule">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">WO No</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Part</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Customer</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase">Qty</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Start Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Due Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Priority</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.filter((w) => w.status === 'Planning' || w.status === 'In Progress').map((w) => (
                <tr key={w.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{w.woNo}</td>
                  <td className="px-4 py-3"><p className="text-sm text-slate-700">{w.partName}</p><p className="text-xs text-slate-400">{w.partNo}</p></td>
                  <td className="px-4 py-3 text-sm text-slate-600">{w.customer}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-slate-700">{w.quantity}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{w.startDate}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{w.dueDate}</td>
                  <td className="px-4 py-3"><Badge variant={priorityToVariant(w.priority)}>{w.priority}</Badge></td>
                  <td className="px-4 py-3"><Badge variant={statusToVariant(w.status)} dot>{w.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

function WorkOrderDetailModal({ wo, onClose }: { wo: WorkOrder, onClose: () => void }) {
  const operations = jobCards.filter(j => j.workOrder === wo.woNo).sort((a, b) => a.opNo - b.opNo);

  return (
    <Modal open={true} onClose={onClose} title={`Work Order Details`} subtitle={wo.woNo} size="xl">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="space-y-4">
          <div><p className="text-xs text-slate-500 uppercase tracking-wider">Part</p><p className="font-semibold text-slate-800">{wo.partName}</p><p className="text-xs text-slate-500 font-mono">{wo.partNo}</p></div>
          <div><p className="text-xs text-slate-500 uppercase tracking-wider">Customer</p><p className="text-sm text-slate-700">{wo.customer}</p></div>
          <div><p className="text-xs text-slate-500 uppercase tracking-wider">Sales Order</p><p className="text-sm font-mono text-slate-700">{wo.salesOrder}</p></div>
        </div>
        <div className="space-y-4">
          <div><p className="text-xs text-slate-500 uppercase tracking-wider">Quantity</p><p className="text-xl font-bold text-slate-800">{wo.quantity} <span className="text-sm font-normal text-slate-500">Nos</span></p></div>
          <div><p className="text-xs text-slate-500 uppercase tracking-wider">Completed</p><p className="text-sm font-medium text-green-600">{wo.completed}</p></div>
          <div><p className="text-xs text-slate-500 uppercase tracking-wider">Rejected</p><p className="text-sm font-medium text-red-600">{wo.rejected}</p></div>
        </div>
        <div className="space-y-4">
          <div><p className="text-xs text-slate-500 uppercase tracking-wider">Status</p><Badge variant={statusToVariant(wo.status)}>{wo.status}</Badge></div>
          <div><p className="text-xs text-slate-500 uppercase tracking-wider">Start Date</p><p className="text-sm text-slate-700">{wo.startDate}</p></div>
          <div><p className="text-xs text-slate-500 uppercase tracking-wider">Due Date</p><p className="text-sm text-slate-700">{wo.dueDate}</p></div>
        </div>
      </div>

      <div className="mb-8">
        <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2 mb-4">Production Workflow</h3>
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-slate-200 -z-10 transform -translate-y-1/2"></div>
          {['Planning', 'Material Issued', 'Setup', 'Machining', 'Inspection', 'Completed'].map((step, i) => {
            let state = 'pending';
            if (wo.status === 'Completed') state = 'done';
            else if (wo.status === 'Planning' && i === 0) state = 'active';
            else if (wo.status === 'Planning' && i > 0) state = 'pending';
            else if (wo.status === 'In Progress') {
              if (i <= 3) state = 'done';
              if (i === 3) state = 'active'; // Machining active
            }
            return (
              <div key={step} className="flex flex-col items-center gap-2 bg-white px-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${state === 'done' ? 'bg-green-500 border-green-500 text-white' : state === 'active' ? 'bg-white border-brand-500 text-brand-600 ring-4 ring-brand-50' : 'bg-white border-slate-300 text-slate-400'}`}>
                  {state === 'done' ? '✓' : i + 1}
                </div>
                <span className={`text-xs font-medium ${state === 'active' ? 'text-brand-700' : state === 'done' ? 'text-slate-700' : 'text-slate-400'}`}>{step}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2 mb-4">Operations Router</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500">
                <th className="py-2 font-medium">Op</th>
                <th className="py-2 font-medium">Operation</th>
                <th className="py-2 font-medium">Machine</th>
                <th className="py-2 font-medium">Operator</th>
                <th className="py-2 font-medium">Qty</th>
                <th className="py-2 font-medium">Cycle</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {operations.length > 0 ? operations.map((op) => (
                <tr key={op.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="py-3 font-mono text-xs">OP-{op.opNo}</td>
                  <td className="py-3 font-medium text-slate-700">{op.operation}</td>
                  <td className="py-3 font-mono text-xs text-brand-600">{op.machine}</td>
                  <td className="py-3 text-slate-600">{op.operator || '—'}</td>
                  <td className="py-3 font-medium">{op.qtyCompleted}/{op.qtyPlanned}</td>
                  <td className="py-3 text-slate-500">{op.cycleTime}m</td>
                  <td className="py-3"><Badge variant={statusToVariant(op.status)}>{op.status}</Badge></td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 border-2 border-dashed border-slate-100 rounded-lg">
                    No operations routed yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

export function WorkOrdersPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [selectedWO, setSelectedWO] = useState<WorkOrder | null>(null);

  const columns: Column<WorkOrder>[] = [
    { key: 'woNo', label: 'WO Number', sortable: true, render: (r) => <span className="font-mono text-xs text-slate-700 font-semibold">{r.woNo}</span> },
    { key: 'partName', label: 'Part', sortable: true, render: (r) => <div><p className="text-sm font-medium text-slate-800">{r.partName}</p><p className="text-xs text-slate-400 font-mono">{r.partNo}</p></div> },
    { key: 'customer', label: 'Customer', sortable: true, render: (r) => <span className="text-sm text-slate-600">{r.customer}</span> },
    { key: 'quantity', label: 'Planned', align: 'right', sortable: true, render: (r) => <span className="font-medium text-slate-700">{r.quantity}</span> },
    { key: 'completed', label: 'Progress', render: (r) => <div className="flex items-center gap-2 min-w-[120px]"><ProgressBar value={r.completed} max={r.quantity} color="brand" /><span className="text-xs font-medium text-slate-600 whitespace-nowrap">{r.completed}/{r.quantity}</span></div> },
    { key: 'rejected', label: 'Rej', align: 'right', render: (r) => <span className={r.rejected > 0 ? 'text-red-600 font-semibold bg-red-50 px-1.5 py-0.5 rounded' : 'text-slate-400'}>{r.rejected}</span> },
    { key: 'dueDate', label: 'Due', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.dueDate}</span> },
    { key: 'priority', label: 'Priority', sortable: true, render: (r) => <Badge variant={priorityToVariant(r.priority)}>{r.priority}</Badge> },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge variant={statusToVariant(r.status)} dot>{r.status}</Badge> },
    {
      key: 'actions', label: 'Actions', align: 'center', render: (r) => (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => setSelectedWO(r as WorkOrder)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Eye size={15} /></button>
          <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit size={15} /></button>
        </div>
      )
    },
  ];

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Work Orders" description="Manage production work orders and workflow" actions={<div className="flex items-center gap-2"><FilterButton /><ExportButton /><DateSelector /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total WOs" value="860" icon={<ClipboardList size={20} />} accent="brand" />
        <StatCard label="In Progress" value="4" icon={<Cog size={20} />} accent="accent" />
        <StatCard label="Completed" value="2" icon={<Package size={20} />} trend="100%" trendUp accent="success" />
        <StatCard label="On Hold" value="1" icon={<ClipboardList size={20} />} accent="warning" />
      </div>
      <DataTable data={workOrders} columns={columns} searchKeys={['woNo', 'partName', 'partNo', 'customer']} onAdd={() => setShowAdd(true)} addLabel="New Work Order" filterOptions={[{ label: 'Planning', value: 'Planning' }, { label: 'In Progress', value: 'In Progress' }, { label: 'Completed', value: 'Completed' }, { label: 'On Hold', value: 'On Hold' }]} />
      
      {selectedWO && <WorkOrderDetailModal wo={selectedWO} onClose={() => setSelectedWO(null)} />}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Work Order" subtitle="Create a production work order" size="lg" footer={<><Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button><Button onClick={() => setShowAdd(false)}>Create Work Order</Button></>}>
        <form className="space-y-6">
          <FormSection title="PART INFORMATION">
            <div className="grid grid-cols-2 gap-5">
              <FormField label="Part Number" required>
                <input className={inputClass} placeholder="Select or type part number" />
              </FormField>
              <FormField label="Drawing Revision">
                <input className={inputClass} placeholder="e.g., R03" />
              </FormField>
              <div className="col-span-2">
                <FormField label="Description">
                  <input className={inputClass} placeholder="Auto-filled part description" readOnly />
                </FormField>
              </div>
            </div>
          </FormSection>
          
          <FormSection title="PRODUCTION INFORMATION">
            <div className="grid grid-cols-2 gap-5">
              <FormField label="Sales Order Ref" required>
                <input className={inputClass} placeholder="Link to Sales Order" />
              </FormField>
              <FormField label="Customer" required>
                <input className={inputClass} placeholder="Customer Name" />
              </FormField>
              <FormField label="Target Quantity" required>
                <input type="number" className={inputClass} placeholder="100" />
              </FormField>
              <FormField label="Priority">
                <select className={inputClass}>
                  <option>Normal</option>
                  <option>High</option>
                  <option>Critical</option>
                </select>
              </FormField>
              <FormField label="Start Date" required>
                <input type="date" className={inputClass} />
              </FormField>
              <FormField label="Due Date" required>
                <input type="date" className={inputClass} />
              </FormField>
            </div>
          </FormSection>
        </form>
      </Modal>
    </div>
  );
}

function JobCardModal({ job, onClose }: { job: JobCard, onClose: () => void }) {
  const wo = workOrders.find(w => w.woNo === job.workOrder);
  const material = 'EN19 (Mock Material)'; // We can derive this if needed

  return (
    <Modal open={true} onClose={onClose} title={`Job Card`} subtitle={job.jobNo} size="xl">
      <div className="border-2 border-slate-800 p-6 bg-white relative">
        <div className="absolute top-4 right-4 text-slate-300 pointer-events-none">
          <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
        </div>
        
        <div className="text-center border-b-2 border-slate-800 pb-4 mb-4">
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-widest">Manufacturing Job Card</h2>
          <p className="text-sm font-bold text-slate-600 mt-1">{job.jobNo}</p>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-4 mb-6 text-sm">
          <div className="flex border-b border-slate-300 pb-1"><span className="w-32 font-bold text-slate-700">Part Number:</span><span className="font-mono">{wo?.partNo}</span></div>
          <div className="flex border-b border-slate-300 pb-1"><span className="w-32 font-bold text-slate-700">Drawing Number:</span><span className="font-mono">DWG-{wo?.partNo}-R03</span></div>
          <div className="flex border-b border-slate-300 pb-1"><span className="w-32 font-bold text-slate-700">Material:</span><span>{material}</span></div>
          <div className="flex border-b border-slate-300 pb-1"><span className="w-32 font-bold text-slate-700">Work Order:</span><span className="font-mono">{job.workOrder}</span></div>
          <div className="flex border-b border-slate-300 pb-1"><span className="w-32 font-bold text-slate-700">Quantity:</span><span>{job.qtyPlanned} Nos</span></div>
          <div className="flex border-b border-slate-300 pb-1"><span className="w-32 font-bold text-slate-700">Machine:</span><span className="font-mono">{job.machine}</span></div>
          <div className="flex border-b border-slate-300 pb-1"><span className="w-32 font-bold text-slate-700">Operator:</span><span>{job.operator || '________'}</span></div>
          <div className="flex border-b border-slate-300 pb-1"><span className="w-32 font-bold text-slate-700">Status:</span><span className="font-bold uppercase">{job.status}</span></div>
        </div>

        <div className="mb-6">
          <table className="w-full text-sm border-collapse border border-slate-800">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-800 py-2 px-3 text-left font-bold">Op</th>
                <th className="border border-slate-800 py-2 px-3 text-left font-bold">Operation</th>
                <th className="border border-slate-800 py-2 px-3 text-left font-bold">Machine</th>
                <th className="border border-slate-800 py-2 px-3 text-left font-bold">Tool</th>
                <th className="border border-slate-800 py-2 px-3 text-left font-bold">Setup Time</th>
                <th className="border border-slate-800 py-2 px-3 text-left font-bold">Cycle Time</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-800 py-2 px-3 text-center">{job.opNo}</td>
                <td className="border border-slate-800 py-2 px-3 font-medium">{job.operation}</td>
                <td className="border border-slate-800 py-2 px-3 font-mono text-xs">{job.machine}</td>
                <td className="border border-slate-800 py-2 px-3 font-mono text-xs">{job.toolNo}</td>
                <td className="border border-slate-800 py-2 px-3">{job.setupTime} min</td>
                <td className="border border-slate-800 py-2 px-3">{job.cycleTime} min</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-8 border-t border-slate-200 pt-6">
           <Button variant="primary" className="w-full justify-center">Start Job</Button>
           <Button variant="secondary" className="w-full justify-center text-amber-600 border-amber-200 hover:bg-amber-50">Pause</Button>
           <Button variant="secondary" className="w-full justify-center text-green-600 border-green-200 hover:bg-green-50">Complete</Button>
           <Button variant="danger" className="w-full justify-center">Report Rejection</Button>
        </div>
      </div>
    </Modal>
  );
}

export function JobCardsPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobCard | null>(null);

  const columns: Column<JobCard>[] = [
    { key: 'jobNo', label: 'Job Card No', sortable: true, render: (r) => <span className="font-mono text-xs font-semibold text-brand-700">{r.jobNo}</span> },
    { key: 'workOrder', label: 'WO Ref', sortable: true, render: (r) => <span className="font-mono text-xs text-slate-500">{r.workOrder}</span> },
    { key: 'partName', label: 'Part', sortable: true, render: (r) => <span className="font-medium text-slate-800">{r.partName}</span> },
    { key: 'opNo', label: 'Op', align: 'center', sortable: true, render: (r) => <Badge variant="neutral">Op {r.opNo}</Badge> },
    { key: 'operation', label: 'Operation', sortable: true, render: (r) => <span className="text-sm font-medium text-slate-700">{r.operation}</span> },
    { key: 'machine', label: 'Machine', sortable: true, render: (r) => <span className="font-mono text-xs font-semibold text-slate-600">{r.machine}</span> },
    { key: 'operator', label: 'Operator', sortable: true, render: (r) => <span className="text-sm text-slate-600">{r.operator}</span> },
    { key: 'qtyPlanned', label: 'Planned', align: 'right', sortable: true, render: (r) => <span className="text-sm font-medium">{r.qtyPlanned}</span> },
    { key: 'qtyCompleted', label: 'Done', align: 'right', render: (r) => <span className="text-green-600 font-bold">{r.qtyCompleted}</span> },
    { key: 'qtyRejected', label: 'Rej', align: 'right', render: (r) => <span className={r.qtyRejected > 0 ? 'text-red-600 font-bold' : 'text-slate-400'}>{r.qtyRejected}</span> },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge variant={statusToVariant(r.status)} dot>{r.status}</Badge> },
    {
      key: 'actions', label: 'Actions', align: 'center', render: (r) => (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => setSelectedJob(r as JobCard)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Eye size={15} /></button>
          <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit size={15} /></button>
        </div>
      )
    },
  ];

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Job Cards" description="Track individual job cards and CNC operations" actions={<div className="flex items-center gap-2"><FilterButton /><ExportButton /><DateSelector /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Job Cards" value="124" icon={<Cog size={20} />} accent="brand" />
        <StatCard label="Running" value="4" icon={<Cog size={20} />} accent="success" />
        <StatCard label="Setup" value="1" icon={<Cog size={20} />} accent="warning" />
        <StatCard label="Completed" value="1" icon={<Package size={20} />} accent="navy" />
      </div>
      <DataTable data={jobCards} columns={columns} searchKeys={['jobNo', 'workOrder', 'partName', 'operator', 'machine']} onAdd={() => setShowAdd(true)} addLabel="New Job Card" filterOptions={[{ label: 'Pending', value: 'Pending' }, { label: 'Setup', value: 'Setup' }, { label: 'Running', value: 'Running' }, { label: 'Completed', value: 'Completed' }]} />
      
      {selectedJob && <JobCardModal job={selectedJob} onClose={() => setSelectedJob(null)} />}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Job Card" subtitle="Create a job card for a CNC operation" size="lg" footer={<><Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button><Button onClick={() => setShowAdd(false)}>Create Job Card</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <p className="text-slate-500 col-span-2">Form omitted for preview.</p>
        </div>
      </Modal>
    </div>
  );
}

export function MachineSchedulingPage() {
  const dates = ['Sep 1', 'Sep 2', 'Sep 3', 'Sep 4', 'Sep 5', 'Sep 6', 'Sep 7'];

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Production Planning" description="Gantt-style machine allocation and scheduling" actions={<div className="flex items-center gap-2"><FilterButton /><DateSelector /></div>} />
      
      <div className="flex gap-4 mb-6">
        <div className="flex items-center gap-2 text-xs text-slate-500"><div className="w-3 h-3 rounded bg-brand-500"></div> Running / Planned</div>
        <div className="flex items-center gap-2 text-xs text-slate-500"><div className="w-3 h-3 rounded bg-amber-500"></div> Maintenance / Setup</div>
        <div className="flex items-center gap-2 text-xs text-slate-500"><div className="w-3 h-3 rounded bg-red-500"></div> Breakdown</div>
        <div className="flex items-center gap-2 text-xs text-slate-500"><div className="w-3 h-3 rounded bg-slate-200 border border-slate-300 border-dashed"></div> Available</div>
      </div>

      <Card className="overflow-hidden border border-slate-200">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left font-semibold text-slate-700 w-64 border-r border-slate-200 sticky left-0 bg-slate-50 z-10 shadow-[1px_0_0_0_#e2e8f0]">Machine Resource</th>
                {dates.map(d => (
                  <th key={d} className="px-2 py-3 text-center font-medium text-slate-600 min-w-[120px] border-r border-slate-100 last:border-r-0">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {machines.map((m) => {
                const schedule: Record<number, { label: string; color: string, span: number }> = {};
                let skipCols = 0;

                if (m.status === 'Running') {
                  schedule[0] = { label: m.currentJob || 'WO-0847', color: 'bg-brand-500', span: 3 };
                  schedule[3] = { label: 'WO-0853', color: 'bg-brand-400', span: 2 };
                } else if (m.status === 'Maintenance') {
                  schedule[0] = { label: 'PM Task #1042', color: 'bg-amber-500', span: 4 };
                } else if (m.status === 'Breakdown') {
                  schedule[0] = { label: 'Spindle Repair', color: 'bg-red-500', span: 3 };
                } else if (m.status === 'Idle') {
                  schedule[3] = { label: 'WO-0855', color: 'bg-brand-500', span: 2 };
                }

                return (
                  <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50/50 group">
                    <td className="px-4 py-4 border-r border-slate-200 sticky left-0 bg-white group-hover:bg-slate-50 z-10 shadow-[1px_0_0_0_#e2e8f0] transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-800">{m.code}</p>
                          <p className="text-xs text-slate-500">{m.name}</p>
                        </div>
                        <Badge variant={statusToVariant(m.status)}>{m.status}</Badge>
                      </div>
                    </td>
                    {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
                      if (skipCols > 0) {
                        skipCols--;
                        return null; // Rendered by colSpan
                      }
                      
                      const cell = schedule[dayIndex];
                      if (cell) {
                        skipCols = cell.span - 1;
                        return (
                          <td key={dayIndex} colSpan={cell.span} className="p-1 border-r border-slate-100 last:border-r-0">
                            <div className={`h-12 w-full rounded-md shadow-sm flex items-center px-3 ${cell.color} text-white font-medium text-xs hover:opacity-90 cursor-pointer transition-opacity relative overflow-hidden group/bar`}>
                               <span className="truncate relative z-10">{cell.label}</span>
                               <div className="absolute inset-0 bg-black/10 opacity-0 group-hover/bar:opacity-100 transition-opacity"></div>
                            </div>
                          </td>
                        );
                      } else {
                        return (
                          <td key={dayIndex} className="p-1 border-r border-slate-100 last:border-r-0">
                            <div className="h-12 w-full rounded-md border border-dashed border-slate-200 bg-slate-50/50 flex items-center justify-center text-slate-300 text-xs hover:bg-slate-100 transition-colors cursor-pointer">
                               +
                            </div>
                          </td>
                        );
                      }
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function CNCOperationsPage() {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="CNC Operations" description="Live CNC program execution monitoring" actions={<div className="flex items-center gap-2"><FilterButton /><ExportButton /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Active Programs" value="4" icon={<Cog size={20} />} accent="brand" />
        <StatCard label="Avg Cycle Time" value="15.3 min" icon={<Cog size={20} />} accent="accent" />
        <StatCard label="Parts Today" value="248" icon={<Package size={20} />} trend="12%" trendUp accent="success" />
        <StatCard label="Rejection Rate" value="1.5%" icon={<Cog size={20} />} trend="0.4%" trendUp accent="error" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {jobCards.filter((j) => j.status === 'Running').map((j) => (
          <Card key={j.id} className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">{j.jobNo}</h3>
                <p className="text-xs text-slate-500">{j.partName} • Op {j.opNo} — {j.operation}</p>
              </div>
              <Badge variant="success" dot>Running</Badge>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div><p className="text-xs text-slate-400">Machine</p><p className="text-sm font-mono font-medium text-slate-700">{j.machine}</p></div>
              <div><p className="text-xs text-slate-400">Operator</p><p className="text-sm font-medium text-slate-700">{j.operator}</p></div>
              <div><p className="text-xs text-slate-400">CNC Program</p><p className="text-sm font-mono font-medium text-slate-700">{j.cncProgram}</p></div>
              <div><p className="text-xs text-slate-400">Tools</p><p className="text-sm font-mono font-medium text-slate-700">{j.toolNo}</p></div>
              <div><p className="text-xs text-slate-400">Cycle Time</p><p className="text-sm font-medium text-slate-700">{j.cycleTime} min</p></div>
              <div><p className="text-xs text-slate-400">Setup Time</p><p className="text-sm font-medium text-slate-700">{j.setupTime} min</p></div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Progress</span>
                <span className="font-semibold text-slate-700">{j.qtyCompleted} / {j.qtyPlanned}</span>
              </div>
              <ProgressBar value={j.qtyCompleted} max={j.qtyPlanned} color="brand" height="h-3" />
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Rejected: <span className="text-red-600 font-medium">{j.qtyRejected}</span></span>
                <span>Yield: <span className="text-green-600 font-medium">{((1 - j.qtyRejected / Math.max(j.qtyCompleted, 1)) * 100).toFixed(1)}%</span></span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function MachineDetailPage({ machine, onBack }: { machine: Machine, onBack: () => void }) {
  const job = jobCards.find(j => j.machine === machine.code && j.status === 'Running') || jobCards.find(j => j.machine === machine.code);
  const wo = workOrders.find(w => w.woNo === job?.workOrder);

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="p-2 hover:bg-slate-200 bg-slate-100 rounded-lg text-slate-600 transition-colors">
          ← Back
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{machine.code} - {machine.name}</h1>
          <p className="text-sm text-slate-500">Shop Floor • {machine.location}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Badge variant={statusToVariant(machine.status)} dot>{machine.status}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="p-6 col-span-1 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-3 mb-4">Current Job Execution</h3>
          {job ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <div><p className="text-xs text-slate-400">Work Order</p><p className="text-sm font-mono font-medium text-slate-700">{job.workOrder}</p></div>
              <div><p className="text-xs text-slate-400">Part</p><p className="text-sm font-medium text-slate-700">{job.partName}</p></div>
              <div><p className="text-xs text-slate-400">Operation</p><p className="text-sm font-medium text-slate-700">Op {job.opNo} - {job.operation}</p></div>
              <div><p className="text-xs text-slate-400">Operator</p><p className="text-sm font-medium text-slate-700">{job.operator || machine.operator}</p></div>
              <div><p className="text-xs text-slate-400">CNC Program</p><p className="text-sm font-mono font-medium text-slate-700">{job.cncProgram}</p></div>
              <div><p className="text-xs text-slate-400">Target Qty</p><p className="text-sm font-medium text-slate-700">{job.qtyPlanned}</p></div>
              <div className="col-span-2 md:col-span-3 mt-2">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-500">Progress</span>
                  <span className="font-semibold text-slate-700">{job.qtyCompleted} / {job.qtyPlanned}</span>
                </div>
                <ProgressBar value={job.qtyCompleted} max={job.qtyPlanned} color="brand" height="h-3" />
                <div className="flex justify-between text-xs text-slate-400 mt-2">
                  <span>Rejected: <span className="text-red-600 font-medium">{job.qtyRejected}</span></span>
                  <span>Cycle Time: {job.cycleTime} min</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-slate-500 text-sm border-2 border-dashed border-slate-200 rounded-lg">
              No active job running on this machine
            </div>
          )}
        </Card>
        
        <Card className="p-6 col-span-1">
          <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-3 mb-4">Machine Metrics</h3>
          <div className="flex justify-center mb-6">
            <GaugeChart value={machine.utilization} label="OEE" color={machine.utilization > 80 ? '#16a34a' : '#f59e0b'} size={140} />
          </div>
          <div className="space-y-4">
             <div className="flex justify-between items-center"><span className="text-slate-500 text-sm">Spindle Hours</span><span className="text-slate-800 font-mono text-sm">{machine.spindleHours.toLocaleString()}</span></div>
             <div className="flex justify-between items-center"><span className="text-slate-500 text-sm">Last Maintenance</span><span className="text-slate-800 text-sm">{machine.lastMaintenance}</span></div>
             <div className="flex justify-between items-center"><span className="text-slate-500 text-sm">Next Maintenance</span><span className="text-slate-800 text-sm">{machine.nextMaintenance}</span></div>
          </div>
        </Card>
      </div>
      
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-3 mb-4">Production Timeline (Today)</h3>
        <div className="h-24 flex items-center">
          <div className="w-full bg-slate-100 h-8 rounded-lg flex overflow-hidden">
            <div className="h-full bg-green-500" style={{ width: '65%' }} title="Running"></div>
            <div className="h-full bg-amber-500" style={{ width: '10%' }} title="Setup"></div>
            <div className="h-full bg-slate-400" style={{ width: '15%' }} title="Idle"></div>
            <div className="h-full bg-red-500" style={{ width: '10%' }} title="Breakdown"></div>
          </div>
        </div>
        <div className="flex gap-4 text-xs text-slate-500 mt-2 justify-center">
          <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500 rounded-sm"></div> Running</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 bg-amber-500 rounded-sm"></div> Setup</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 bg-slate-400 rounded-sm"></div> Idle</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500 rounded-sm"></div> Breakdown</div>
        </div>
      </Card>
    </div>
  );
}

export function ShopFloorPage() {
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);

  if (selectedMachine) {
    return <MachineDetailPage machine={selectedMachine} onBack={() => setSelectedMachine(null)} />;
  }

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Shop Floor Live" description="Real-time shop floor monitoring" actions={<div className="flex items-center gap-2"><Badge variant="success" dot>Live</Badge><DateSelector /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Active Machines" value={machines.filter(m => m.status === 'Running').length.toString()} icon={<Cog size={20} />} accent="success" />
        <StatCard label="Running Jobs" value={jobCards.filter(j => j.status === 'Running').length.toString()} icon={<Activity size={20} />} accent="brand" />
        <StatCard label="Total Production" value="2,458" icon={<Package size={20} />} accent="accent" />
        <StatCard label="OEE Average" value="84.2%" icon={<Gauge size={20} />} trend="2.1%" trendUp accent="navy" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {machines.map((m) => {
          const job = jobCards.find(j => j.machine === m.code && (j.status === 'Running' || j.status === 'Setup')) || jobCards.find(j => j.machine === m.code);
          return (
            <Card key={m.id} className="p-5 hover:shadow-card-hover transition-shadow cursor-pointer border border-transparent hover:border-brand-200" onClick={() => setSelectedMachine(m)}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${m.status === 'Running' ? 'bg-green-500 animate-pulse-ring' : m.status === 'Idle' ? 'bg-slate-400' : m.status === 'Maintenance' ? 'bg-amber-500' : 'bg-red-500'}`} />
                  <div>
                    <h3 className="text-base font-bold text-slate-800">{m.code}</h3>
                    <p className="text-xs text-slate-500">{m.type}</p>
                  </div>
                </div>
                <Badge variant={statusToVariant(m.status)}>{m.status}</Badge>
              </div>
              
              <div className="bg-slate-50 rounded-lg p-3 mb-4 min-h-[90px]">
                {job ? (
                  <>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Current Job</p>
                        <p className="text-sm font-semibold text-slate-700">{job.workOrder}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Part</p>
                        <p className="text-sm font-medium text-slate-700 truncate max-w-[120px]">{job.partName}</p>
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-xs text-slate-600">
                      <span>Op {job.opNo}: {job.operation}</span>
                      <span className="font-medium text-brand-600">{job.operator || m.operator}</span>
                    </div>
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                    No active job
                  </div>
                )}
              </div>

              {job && (
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Progress</span>
                    <span className="font-semibold text-slate-700">{job.qtyCompleted} / {job.qtyPlanned}</span>
                  </div>
                  <ProgressBar value={job.qtyCompleted} max={job.qtyPlanned} color="brand" height="h-2" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
                <div className="text-center">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">Cycle Time</p>
                  <p className="text-sm font-medium text-slate-700">{job ? `${job.cycleTime}m` : '—'}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">Rejects</p>
                  <p className={`text-sm font-medium ${job?.qtyRejected ? 'text-red-600' : 'text-slate-700'}`}>{job ? job.qtyRejected : '—'}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function ProductionTrackingPage() {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Production Tracking" description="Track production progress across all work orders" actions={<div className="flex items-center gap-2"><FilterButton /><ExportButton /><DateSelector /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Planned" value="7,950" icon={<ClipboardList size={20} />} accent="brand" />
        <StatCard label="Completed" value="5,538" icon={<Package size={20} />} trend="12%" trendUp accent="success" />
        <StatCard label="Rejected" value="62" icon={<Cog size={20} />} accent="error" />
        <StatCard label="WIP" value="2,350" icon={<Cog size={20} />} accent="warning" />
      </div>
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-800">Work Order Progress</h3></div>
        <div className="divide-y divide-slate-50">
          {workOrders.map((w) => {
            const pct = (w.completed / w.quantity) * 100;
            return (
              <div key={w.id} className="px-5 py-4 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-slate-700">{w.woNo}</span>
                    <span className="text-sm text-slate-600">{w.partName}</span>
                    <Badge variant={priorityToVariant(w.priority)}>{w.priority}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-slate-500">{w.completed} / {w.quantity}</span>
                    <span className="text-red-500 text-xs">Rej: {w.rejected}</span>
                    <Badge variant={statusToVariant(w.status)} dot>{w.status}</Badge>
                  </div>
                </div>
                <ProgressBar value={pct} color={pct === 100 ? 'success' : pct > 50 ? 'brand' : 'warning'} height="h-2" />
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

export function FinishedGoodsPage() {
  const finishedGoods = workOrders.filter((w) => w.status === 'Completed' || w.completed > 0).map((w) => ({
    id: w.id,
    partName: w.partName,
    partNo: w.partNo,
    woNo: w.woNo,
    customer: w.customer,
    quantity: w.quantity,
    completed: w.completed,
    rejected: w.rejected,
    accepted: w.completed - w.rejected,
    status: w.status,
  }));

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Finished Goods" description="Track completed production and stock" actions={<div className="flex items-center gap-2"><FilterButton /><ExportButton /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Finished" value="5,538" icon={<Package size={20} />} accent="success" />
        <StatCard label="Delivered" value="3,500" icon={<Package size={20} />} accent="brand" />
        <StatCard label="In Stock" value="1,976" icon={<Package size={20} />} accent="accent" />
        <StatCard label="Awaiting QC" value="62" icon={<Package size={20} />} accent="warning" />
      </div>
      <DataTable data={finishedGoods} columns={[
        { key: 'woNo', label: 'WO No', sortable: true, render: (r) => <span className="font-mono text-xs text-slate-700">{r.woNo}</span> },
        { key: 'partName', label: 'Part', sortable: true, render: (r) => <div><p className="text-sm text-slate-700">{r.partName}</p><p className="text-xs text-slate-400">{r.partNo}</p></div> },
        { key: 'customer', label: 'Customer', sortable: true },
        { key: 'quantity', label: 'Planned', align: 'right', sortable: true },
        { key: 'completed', label: 'Completed', align: 'right', render: (r) => <span className="text-green-600 font-medium">{r.completed}</span> },
        { key: 'rejected', label: 'Rejected', align: 'right', render: (r) => <span className={r.rejected > 0 ? 'text-red-600 font-medium' : 'text-slate-400'}>{r.rejected}</span> },
        { key: 'accepted', label: 'Accepted', align: 'right', render: (r) => <span className="font-semibold text-slate-700">{r.accepted}</span> },
        { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge variant={statusToVariant(r.status)} dot>{r.status}</Badge> },
      ]} searchKeys={['woNo', 'partName', 'partNo', 'customer']} filterOptions={[{ label: 'Completed', value: 'Completed' }, { label: 'In Progress', value: 'In Progress' }]} />
    </div>
  );
}
