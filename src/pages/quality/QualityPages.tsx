import { useState } from 'react';
import { Plus, Eye, Edit, ShieldCheck, AlertTriangle, CheckCircle2, ClipboardList, Settings } from 'lucide-react';
import { PageHeader, FilterButton, ExportButton } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Card, Badge, Button, StatCard, statusToVariant } from '@/components/ui/Card';
import { Modal, FormField, inputClass } from '@/components/ui/Modal';
import { inspections, ncrs } from '@/data/mockData';
import type { Inspection, NCR } from '@/data/mockData';

function InspectionList({ type, title, description }: { type: 'Incoming' | 'In-Process' | 'Final', title: string, description: string }) {
  const [showAdd, setShowAdd] = useState(false);
  const data = inspections.filter(i => i.type === type);

  const columns: Column<Inspection>[] = [
    { key: 'inspectionNo', label: 'Report No', sortable: true, render: (r) => <span className="font-mono text-xs text-brand-700 font-semibold">{r.inspectionNo}</span> },
    { key: 'partName', label: 'Part', sortable: true, render: (r) => <div><p className="font-medium text-sm text-slate-800">{r.partName}</p><p className="text-xs text-slate-400 font-mono">{r.partNo}</p></div> },
    { key: 'workOrder', label: 'Work Order / Ref', sortable: true, render: (r) => <span className="font-mono text-xs">{r.workOrder}</span> },
    { key: 'qtyInspected', label: 'Inspected', align: 'right', render: (r) => <span className="text-sm font-semibold text-slate-700">{r.qtyInspected}</span> },
    { key: 'qtyAccepted', label: 'Accepted', align: 'right', render: (r) => <span className="text-sm font-semibold text-green-600">{r.qtyAccepted}</span> },
    { key: 'qtyRejected', label: 'Rejected', align: 'right', render: (r) => <span className={`text-sm font-semibold ${r.qtyRejected > 0 ? 'text-red-600' : 'text-slate-500'}`}>{r.qtyRejected}</span> },
    { key: 'inspector', label: 'Inspector', render: (r) => <span className="text-sm text-slate-600">{r.inspector}</span> },
    { key: 'date', label: 'Date', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.date}</span> },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge variant={statusToVariant(r.status)} dot>{r.status}</Badge> },
    {
      key: 'actions', label: 'Actions', align: 'center', render: () => (
        <div className="flex items-center justify-center gap-1">
          <button className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Eye size={15} /></button>
        </div>
      )
    },
  ];

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title={title} description={description} actions={<div className="flex items-center gap-2"><FilterButton /><ExportButton /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Inspections" value={data.length.toString()} icon={<ShieldCheck size={20} />} accent="brand" />
        <StatCard label="Passed" value={data.filter(d => d.status === 'Pass').length.toString()} icon={<CheckCircle2 size={20} />} accent="success" />
        <StatCard label="Failed / Rework" value={data.filter(d => d.status === 'Fail' || d.status === 'Rework').length.toString()} icon={<AlertTriangle size={20} />} accent="error" />
      </div>
      <DataTable data={data} columns={columns} searchKeys={['inspectionNo', 'partName', 'partNo', 'workOrder']} onAdd={() => setShowAdd(true)} addLabel="New Inspection" />
    </div>
  );
}

export function InspectionPlansPage() {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Inspection Plans" description="Define inspection criteria, dimensions, and tolerances" />
      <div className="flex items-center justify-center h-64 border border-dashed border-slate-300 rounded-xl bg-slate-50">
        <p className="text-slate-500">Inspection Planning module coming soon.</p>
      </div>
    </div>
  );
}

export function IncomingInspectionPage() {
  return <InspectionList type="Incoming" title="Incoming Inspection" description="Quality checks for received raw materials and components" />;
}

export function InProcessInspectionPage() {
  return <InspectionList type="In-Process" title="In-Process Inspection" description="Shop floor dimensional checks during machining" />;
}

export function FinalInspectionPage() {
  return <InspectionList type="Final" title="Final Inspection" description="Pre-dispatch quality assurance and CMM reports" />;
}

export function NCRPage() {
  const columns: Column<NCR>[] = [
    { key: 'ncrNo', label: 'NCR No', sortable: true, render: (r) => <span className="font-mono text-xs font-semibold text-red-600">{r.ncrNo}</span> },
    { key: 'partName', label: 'Part', sortable: true, render: (r) => <div><p className="font-medium text-sm text-slate-800">{r.partName}</p><p className="text-xs text-slate-400 font-mono">{r.partNo}</p></div> },
    { key: 'workOrder', label: 'Work Order', render: (r) => <span className="font-mono text-xs text-slate-600">{r.workOrder}</span> },
    { key: 'defectType', label: 'Defect', render: (r) => <span className="text-sm font-medium text-slate-700">{r.defectType}</span> },
    { key: 'severity', label: 'Severity', sortable: true, render: (r) => <Badge variant={r.severity === 'Critical' ? 'error' : r.severity === 'Major' ? 'warning' : 'neutral'}>{r.severity}</Badge> },
    { key: 'qtyRejected', label: 'Qty Rejected', align: 'right', render: (r) => <span className="font-semibold text-red-600">{r.qtyRejected}</span> },
    { key: 'raisedBy', label: 'Raised By', render: (r) => <span className="text-xs text-slate-500">{r.raisedBy}</span> },
    { key: 'date', label: 'Date', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.date}</span> },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge variant={r.status === 'Closed' ? 'success' : r.status === 'Open' ? 'error' : 'warning'} dot>{r.status}</Badge> },
    {
      key: 'actions', label: 'Actions', align: 'center', render: () => (
        <div className="flex items-center justify-center gap-1">
          <button className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Eye size={15} /></button>
        </div>
      )
    },
  ];

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Non-Conformance Reports (NCR)" description="Manage rejections and non-conforming products" actions={<div className="flex items-center gap-2"><FilterButton /><ExportButton /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total NCRs" value="45" icon={<AlertTriangle size={20} />} accent="brand" />
        <StatCard label="Open" value="12" icon={<AlertTriangle size={20} />} accent="error" />
        <StatCard label="Under Investigation" value="8" icon={<Settings size={20} />} accent="warning" />
        <StatCard label="Closed" value="25" icon={<CheckCircle2 size={20} />} accent="success" />
      </div>
      <DataTable data={ncrs} columns={columns} searchKeys={['ncrNo', 'partName', 'defectType']} />
    </div>
  );
}

export function CorrectiveActionsPage() {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Corrective Actions (CAPA)" description="Track root causes and preventive actions" />
      <div className="flex items-center justify-center h-64 border border-dashed border-slate-300 rounded-xl bg-slate-50">
        <p className="text-slate-500">CAPA module coming soon.</p>
      </div>
    </div>
  );
}
