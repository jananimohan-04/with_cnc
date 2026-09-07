import { useState } from 'react';
import { Plus, Eye, Edit, Trash2, Boxes, FileText, Cog, ShieldCheck, GitBranch } from 'lucide-react';
import { PageHeader, FilterButton, ExportButton, DateSelector } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Card, Badge, Button, StatCard, statusToVariant } from '@/components/ui/Card';
import { Modal, ConfirmDialog, FormField, inputClass } from '@/components/ui/Modal';
import { parts, bom, routing, revisions } from '@/data/mockData';
import type { PartMaster, RevisionRecord } from '@/data/mockData';

export function PartsPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PartMaster | null>(null);

  const columns: Column<PartMaster>[] = [
    { key: 'partNo', label: 'Part No', sortable: true, render: (r) => <span className="font-mono text-xs text-slate-700">{r.partNo}</span> },
    { key: 'partName', label: 'Part Name', sortable: true, render: (r) => <span className="font-medium text-slate-700">{r.partName}</span> },
    { key: 'drawingNo', label: 'Drawing No', sortable: true, render: (r) => <span className="font-mono text-xs text-slate-500">{r.drawingNo}</span> },
    { key: 'revision', label: 'Rev', sortable: true, align: 'center', render: (r) => <Badge variant="info">{r.revision}</Badge> },
    { key: 'material', label: 'Material', sortable: true, render: (r) => <span className="text-sm text-slate-600">{r.material}</span> },
    { key: 'surfaceFinish', label: 'Surface Finish', render: (r) => <span className="text-xs text-slate-500">{r.surfaceFinish}</span> },
    { key: 'tolerance', label: 'Tolerance', render: (r) => <span className="text-xs font-mono text-slate-600">{r.tolerance}</span> },
    { key: 'weight', label: 'Weight', align: 'right', sortable: true, render: (r) => <span className="text-sm text-slate-600">{r.weight} {r.unit}</span> },
    { key: 'category', label: 'Category', sortable: true, render: (r) => <Badge variant="neutral">{r.category}</Badge> },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge variant={statusToVariant(r.status)} dot>{r.status}</Badge> },
    {
      key: 'actions', label: 'Actions', align: 'center', render: () => (
        <div className="flex items-center justify-center gap-1">
          <button className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Eye size={15} /></button>
          <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit size={15} /></button>
          <button className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={15} /></button>
        </div>
      )
    },
  ];

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Part Master" description="Central registry of all manufactured parts" actions={<div className="flex items-center gap-2"><FilterButton /><ExportButton /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Parts" value="248" icon={<Boxes size={20} />} accent="brand" />
        <StatCard label="Active" value="210" icon={<Boxes size={20} />} accent="success" />
        <StatCard label="Prototypes" value="12" icon={<Boxes size={20} />} accent="warning" />
        <StatCard label="Obsolete" value="26" icon={<Boxes size={20} />} accent="neutral" />
      </div>
      <DataTable data={parts} columns={columns} searchKeys={['partNo', 'partName', 'drawingNo', 'material']} onAdd={() => setShowAdd(true)} addLabel="New Part" filterOptions={[{ label: 'Active', value: 'Active' }, { label: 'Prototype', value: 'Prototype' }, { label: 'Obsolete', value: 'Obsolete' }]} />
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Part Master" subtitle="Register a new part in the system" size="lg" footer={<><Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button><Button onClick={() => setShowAdd(false)}>Save Part</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Part Number" required><input className={inputClass} placeholder="XX-PP-000" /></FormField>
          <FormField label="Part Name" required><input className={inputClass} /></FormField>
          <FormField label="Drawing Number" required><input className={inputClass} placeholder="DWG-XX-000-R0" /></FormField>
          <FormField label="Revision" required><input className={inputClass} placeholder="R0" /></FormField>
          <FormField label="Material Grade" required><select className={inputClass}><option>Inconel 718</option><option>Aluminum 7075-T6</option><option>Aluminum 6061-T6</option><option>SS 316L</option><option>SS 304</option><option>Hastelloy C-276</option><option>Titanium Ti-6Al-4V</option><option>EN24 Alloy Steel</option><option>EN31 Bearing Steel</option><option>Cast Iron GG25</option></select></FormField>
          <FormField label="Category"><select className={inputClass}><option>Aerospace</option><option>Automotive</option><option>Defense</option><option>Space</option><option>Industrial</option></select></FormField>
          <FormField label="Surface Finish"><input className={inputClass} placeholder="Ra 1.6" /></FormField>
          <FormField label="Tolerance"><input className={inputClass} placeholder="±0.02mm" /></FormField>
          <FormField label="Weight (kg)"><input type="number" step="0.01" className={inputClass} /></FormField>
          <FormField label="UOM"><select className={inputClass}><option>kg</option><option>PC</option><option>SET</option></select></FormField>
        </div>
      </Modal>
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => {}} title="Delete Part" message={`Delete part ${deleteTarget?.partNo}? This will affect BOM and routing.`} confirmLabel="Delete" danger />
    </div>
  );
}

export function DrawingsPage() {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="CAD / Drawing Management" description="Manage engineering drawings and CAD files" actions={<div className="flex items-center gap-2"><FilterButton /><ExportButton /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Drawings" value="348" icon={<FileText size={20} />} accent="brand" />
        <StatCard label="Latest Revisions" value="248" icon={<FileText size={20} />} accent="success" />
        <StatCard label="Pending Approval" value="6" icon={<FileText size={20} />} accent="warning" />
        <StatCard label="Superseded" value="94" icon={<FileText size={20} />} accent="neutral" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {parts.map((p) => (
          <Card key={p.id} className="overflow-hidden hover:shadow-card-hover transition-shadow group">
            <div className="aspect-[4/3] bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center relative">
              <div className="w-full h-full bg-grid-dark opacity-10" />
              <svg className="absolute inset-0 w-full h-full p-6" viewBox="0 0 200 150">
                <rect x="40" y="30" width="120" height="90" fill="none" stroke="#475569" strokeWidth="1.5" rx="4" />
                <circle cx="100" cy="75" r="25" fill="none" stroke="#475569" strokeWidth="1.5" />
                <circle cx="100" cy="75" r="15" fill="none" stroke="#475569" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="40" y1="30" x2="30" y2="20" stroke="#94a3b8" strokeWidth="0.5" />
                <line x1="160" y1="30" x2="170" y2="20" stroke="#94a3b8" strokeWidth="0.5" />
                <line x1="40" y1="120" x2="30" y2="130" stroke="#94a3b8" strokeWidth="0.5" />
                <line x1="160" y1="120" x2="170" y2="130" stroke="#94a3b8" strokeWidth="0.5" />
              </svg>
              <div className="absolute top-2 right-2"><Badge variant={statusToVariant(p.status)} dot>{p.status}</Badge></div>
              <div className="absolute bottom-2 left-2"><Badge variant="info">{p.revision}</Badge></div>
            </div>
            <div className="p-4">
              <p className="font-mono text-xs text-slate-500">{p.drawingNo}</p>
              <h3 className="text-sm font-semibold text-slate-800 mt-1">{p.partName}</h3>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-slate-400">{p.material}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Eye size={14} /></button>
                  <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit size={14} /></button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function BOMPage() {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Bill of Materials" description="Multi-level BOM for Turbine Bracket (BA-TB-204)" actions={<div className="flex items-center gap-2"><Button size="sm" icon={<Plus size={14} />}>Add Component</Button><ExportButton /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="BOM Levels" value="3" icon={<Boxes size={20} />} accent="brand" />
        <StatCard label="Total Components" value="5" icon={<Boxes size={20} />} accent="accent" />
        <StatCard label="Make Items" value="3" icon={<Cog size={20} />} accent="navy" />
        <StatCard label="Buy Items" value="2" icon={<Boxes size={20} />} accent="success" />
      </div>
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">BOM Structure — Turbine Bracket</h3>
            <p className="text-xs text-slate-500 mt-0.5">Part No: BA-TB-204 • Rev: R3 • Material: Inconel 718</p>
          </div>
          <Badge variant="brand" dot>Active</Badge>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/30">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Level</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Part No</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Part Name</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Material</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Qty</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">UOM</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Make/Buy</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Operation</th>
              </tr>
            </thead>
            <tbody>
              {bom.map((item, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center" style={{ paddingLeft: `${item.level * 20}px` }}>
                      <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${item.level === 0 ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>L{item.level}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-700">{item.partNo}</td>
                  <td className="px-5 py-3"><span className={item.level === 0 ? 'font-semibold text-slate-800' : 'text-slate-700'}>{item.partName}</span></td>
                  <td className="px-5 py-3 text-sm text-slate-600">{item.material}</td>
                  <td className="px-5 py-3 text-right font-medium text-slate-700">{item.quantity}</td>
                  <td className="px-5 py-3 text-sm text-slate-500">{item.unit}</td>
                  <td className="px-5 py-3"><Badge variant={item.make === 'Make' ? 'brand' : 'success'}>{item.make}</Badge></td>
                  <td className="px-5 py-3 text-xs text-slate-500">{item.operation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function RoutingPage() {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Process Routing" description="Manufacturing routing for Turbine Bracket (BA-TB-204)" actions={<div className="flex items-center gap-2"><Button size="sm" icon={<Plus size={14} />}>Add Operation</Button><ExportButton /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Operations" value="7" icon={<Cog size={20} />} accent="brand" />
        <StatCard label="Total Setup Time" value="4.3 hr" icon={<Cog size={20} />} accent="accent" />
        <StatCard label="Total Cycle Time" value="80 min" icon={<Cog size={20} />} accent="navy" />
        <StatCard label="Machines Used" value="4" icon={<Cog size={20} />} accent="success" />
      </div>
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Operation Sequence</h3>
          <p className="text-xs text-slate-500 mt-0.5">Part: BA-TB-204 • Turbine Bracket • Inconel 718</p>
        </div>
        <div className="divide-y divide-slate-50">
          {routing.map((op, i) => (
            <div key={i} className="px-5 py-4 hover:bg-slate-50/50 transition-colors">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center font-bold text-sm flex-shrink-0">{op.opNo}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h4 className="text-sm font-semibold text-slate-800">{op.operation}</h4>
                    <div className="flex items-center gap-2">
                      <Badge variant="info">{op.machine}</Badge>
                      <Badge variant="neutral">Prog: {op.cncProgram ?? '—'}</Badge>
                    </div>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">{op.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                    <span>Setup: <span className="font-medium text-slate-600">{op.setupTime} min</span></span>
                    <span>Cycle: <span className="font-medium text-slate-600">{op.cycleTime} min</span></span>
                    <span>Tools: <span className="font-medium text-slate-600">{op.tools}</span></span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function WorkInstructionsPage() {
  const instructions = [
    { opNo: 10, title: 'Facing & Turning — Op 10', machine: 'CNC-T-01', steps: [
      'Mount raw blank in 3-jaw chuck, ensure datum face is flush',
      'Load CNC program O8471, verify tool offsets T01-T04',
      'Run first article in single block mode, verify dimensions',
      'Facing operation: face both ends to 25mm length, ±0.02mm',
      'Turning operation: turn OD to Ø48±0.02mm, Ra 1.6',
      'Drill center hole Ø12mm, depth 15mm',
      'Deburr sharp edges, inspect before next operation',
    ]},
    { opNo: 20, title: 'Rough Milling — Op 20', machine: 'CNC-VMC-02', steps: [
      'Mount part in precision vise, align datum',
      'Load CNC program O8472, verify tool offsets T02-T06',
      'Rough mill profile with Ø10 end mill, leave 0.5mm stock',
      'Rough pocket with Ø16 end mill, leave 0.5mm stock',
      'Verify stock allowance with caliper before finishing',
    ]},
    { opNo: 30, title: 'Finish Milling — Op 30', machine: 'CNC-VMC-02', steps: [
      'Remount part, ensure no deviation from previous setup',
      'Load CNC program O8473, verify Ø6 ball mill and Ø8 end mill',
      'Finish profile to drawing dimensions, Ra 1.6',
      'Finish pocket floor and walls to tolerance',
      'Inspect critical dimensions on CMM before removal',
    ]},
  ];

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Work Instructions" description="Step-by-step manufacturing instructions for Turbine Bracket" actions={<div className="flex items-center gap-2"><Button size="sm" icon={<Plus size={14} />}>Add Instruction</Button><ExportButton /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Instructions" value="7" icon={<FileText size={20} />} accent="brand" />
        <StatCard label="With CNC Programs" value="5" icon={<FileText size={20} />} accent="accent" />
        <StatCard label="Avg Steps/Op" value="6" icon={<FileText size={20} />} accent="navy" />
        <StatCard label="Last Updated" value="Aug 20" icon={<FileText size={20} />} accent="success" />
      </div>
      <div className="space-y-4">
        {instructions.map((inst) => (
          <Card key={inst.opNo}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center font-bold text-sm">{inst.opNo}</div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">{inst.title}</h3>
                  <p className="text-xs text-slate-500">Machine: {inst.machine}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Eye size={16} /></button>
                <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit size={16} /></button>
              </div>
            </div>
            <div className="p-5">
              <ol className="space-y-2">
                {inst.steps.map((step, si) => (
                  <li key={si} className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5">{si + 1}</span>
                    <span className="text-sm text-slate-600">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function RevisionsPage() {
  const [showAdd, setShowAdd] = useState(false);

  const columns: Column<RevisionRecord>[] = [
    { key: 'drawingNo', label: 'Drawing No', sortable: true, render: (r) => <span className="font-mono text-xs text-slate-700">{r.drawingNo}</span> },
    { key: 'partName', label: 'Part Name', sortable: true, render: (r) => <span className="font-medium text-slate-700">{r.partName}</span> },
    { key: 'revision', label: 'Revision', sortable: true, align: 'center', render: (r) => <Badge variant="info">{r.revision}</Badge> },
    { key: 'description', label: 'Description of Change', render: (r) => <span className="text-sm text-slate-600">{r.description}</span> },
    { key: 'date', label: 'Date', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.date}</span> },
    { key: 'approvedBy', label: 'Approved By', sortable: true, render: (r) => <span className="text-sm text-slate-600">{r.approvedBy}</span> },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge variant={statusToVariant(r.status)} dot>{r.status}</Badge> },
    {
      key: 'actions', label: 'Actions', align: 'center', render: () => (
        <div className="flex items-center justify-center gap-1">
          <button className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Eye size={15} /></button>
          <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit size={15} /></button>
        </div>
      )
    },
  ];

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Revision Control" description="Track drawing revisions and engineering change orders" actions={<div className="flex items-center gap-2"><FilterButton /><ExportButton /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Revisions" value="86" icon={<GitBranch size={20} />} accent="brand" />
        <StatCard label="Released" value="248" icon={<ShieldCheck size={20} />} accent="success" />
        <StatCard label="Pending" value="6" icon={<FileText size={20} />} accent="warning" />
        <StatCard label="Superseded" value="94" icon={<GitBranch size={20} />} accent="neutral" />
      </div>
      <DataTable data={revisions} columns={columns} searchKeys={['drawingNo', 'partName']} onAdd={() => setShowAdd(true)} addLabel="New Revision" filterOptions={[{ label: 'Released', value: 'Released' }, { label: 'Pending', value: 'Pending' }, { label: 'Superseded', value: 'Superseded' }]} />
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Revision" subtitle="Create a new drawing revision" footer={<><Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button><Button onClick={() => setShowAdd(false)}>Save Revision</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Drawing Number" required><input className={inputClass} /></FormField>
          <FormField label="Part Name" required><input className={inputClass} /></FormField>
          <FormField label="Revision" required><input className={inputClass} placeholder="R4" /></FormField>
          <FormField label="Date" required><input type="date" className={inputClass} /></FormField>
          <div className="col-span-2"><FormField label="Description of Change" required><textarea className={inputClass} rows={3} /></FormField></div>
        </div>
      </Modal>
    </div>
  );
}
