import { useState } from 'react';
import { Plus, Eye, Edit, Trash2, Boxes, ArrowRightLeft, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Package } from 'lucide-react';
import { PageHeader, FilterButton, ExportButton } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Card, Badge, Button, StatCard, statusToVariant } from '@/components/ui/Card';
import { Modal, ConfirmDialog, FormField, inputClass } from '@/components/ui/Modal';
import { rawMaterials, stockMovements } from '@/data/mockData';
import type { RawMaterial, StockMovement } from '@/data/mockData';

// Reusing parts for components
import { parts } from '@/data/mockData';

export function RawMaterialsPage() {
  const [showAdd, setShowAdd] = useState(false);

  const columns: Column<RawMaterial>[] = [
    { key: 'materialCode', label: 'Code', sortable: true, render: (r) => <span className="font-mono text-xs text-slate-700">{r.materialCode}</span> },
    { key: 'name', label: 'Material Name', sortable: true, render: (r) => <span className="font-medium text-slate-700">{r.name}</span> },
    { key: 'grade', label: 'Grade', sortable: true, render: (r) => <span className="text-sm text-slate-600">{r.grade}</span> },
    { key: 'form', label: 'Form', render: (r) => <span className="text-xs text-slate-500">{r.form}</span> },
    { key: 'stockQty', label: 'Stock', sortable: true, align: 'right', render: (r) => <span className={`font-semibold ${r.stockQty <= r.minStock ? 'text-red-600' : 'text-slate-700'}`}>{r.stockQty} {r.uom}</span> },
    { key: 'location', label: 'Location', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.location}</span> },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge variant={r.status === 'In Stock' ? 'success' : r.status === 'Low Stock' ? 'warning' : 'error'} dot>{r.status}</Badge> },
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
      <PageHeader title="Raw Materials" description="Manage raw material inventory and stock levels" actions={<div className="flex items-center gap-2"><FilterButton /><ExportButton /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Materials" value="142" icon={<Boxes size={20} />} accent="brand" />
        <StatCard label="In Stock" value="115" icon={<Package size={20} />} accent="success" />
        <StatCard label="Low Stock" value="24" icon={<AlertTriangle size={20} />} accent="warning" />
        <StatCard label="Out of Stock" value="3" icon={<AlertTriangle size={20} />} accent="error" />
      </div>
      <DataTable data={rawMaterials} columns={columns} searchKeys={['materialCode', 'name', 'grade']} onAdd={() => setShowAdd(true)} addLabel="New Material" filterOptions={[{ label: 'In Stock', value: 'In Stock' }, { label: 'Low Stock', value: 'Low Stock' }, { label: 'Out of Stock', value: 'Out of Stock' }]} />
    </div>
  );
}

export function ComponentsPage() {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Components" description="Manufactured and bought-out components" actions={<div className="flex items-center gap-2"><FilterButton /><ExportButton /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Components" value="385" icon={<Package size={20} />} accent="brand" />
        <StatCard label="Make" value="210" icon={<Package size={20} />} accent="accent" />
        <StatCard label="Buy" value="175" icon={<Package size={20} />} accent="navy" />
      </div>
      {/* Reusing parts data for components */}
      <DataTable 
        data={parts} 
        columns={[
          { key: 'partNo', label: 'Part No', render: (r) => <span className="font-mono text-xs">{r.partNo}</span> },
          { key: 'partName', label: 'Part Name', render: (r) => <span className="font-medium">{r.partName}</span> },
          { key: 'category', label: 'Category', render: (r) => <span className="text-sm">{r.category}</span> },
          { key: 'status', label: 'Status', render: (r) => <Badge variant={statusToVariant(r.status)} dot>{r.status}</Badge> }
        ]} 
        searchKeys={['partNo', 'partName']} 
      />
    </div>
  );
}

export function StockOverviewPage() {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Stock Overview" description="Complete inventory valuation and levels" actions={<div className="flex items-center gap-2"><FilterButton /><ExportButton /></div>} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Total Inventory Value</h3>
          <p className="text-3xl font-bold text-brand-600">₹42.5M</p>
          <p className="text-sm text-slate-500 mt-2">Up 4.2% from last month</p>
        </Card>
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Raw Material Value</h3>
          <p className="text-3xl font-bold text-accent-600">₹18.2M</p>
          <p className="text-sm text-slate-500 mt-2">45% of total inventory</p>
        </Card>
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Finished Goods Value</h3>
          <p className="text-3xl font-bold text-success-600">₹24.3M</p>
          <p className="text-sm text-slate-500 mt-2">55% of total inventory</p>
        </Card>
      </div>
    </div>
  );
}

export function StockMovementsPage() {
  const columns: Column<StockMovement>[] = [
    { key: 'date', label: 'Date', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.date}</span> },
    { key: 'type', label: 'Type', sortable: true, render: (r) => <Badge variant={r.type === 'Receipt' ? 'success' : r.type === 'Issue' ? 'warning' : 'info'}>{r.type}</Badge> },
    { key: 'material', label: 'Material', sortable: true, render: (r) => <span className="font-medium text-slate-700">{r.material}</span> },
    { key: 'qty', label: 'Qty', sortable: true, align: 'right', render: (r) => <span className={`font-semibold ${r.qty < 0 ? 'text-red-600' : 'text-green-600'}`}>{r.qty > 0 ? '+' : ''}{r.qty} {r.uom}</span> },
    { key: 'from', label: 'From / To', render: (r) => <div><p className="text-xs text-slate-500">From: {r.from}</p><p className="text-xs text-slate-500">To: {r.to}</p></div> },
    { key: 'reference', label: 'Reference', render: (r) => <span className="font-mono text-xs">{r.reference}</span> },
    { key: 'user', label: 'User', render: (r) => <span className="text-sm">{r.user}</span> },
  ];

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Stock Movements" description="Track all inward, outward, and transfer movements" actions={<div className="flex items-center gap-2"><FilterButton /><ExportButton /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Movements" value="1,248" icon={<ArrowRightLeft size={20} />} accent="brand" />
        <StatCard label="Receipts" value="482" icon={<ArrowDownToLine size={20} />} accent="success" />
        <StatCard label="Issues" value="654" icon={<ArrowUpFromLine size={20} />} accent="warning" />
        <StatCard label="Transfers" value="112" icon={<ArrowRightLeft size={20} />} accent="info" />
      </div>
      <DataTable data={stockMovements} columns={columns} searchKeys={['material', 'reference', 'type']} filterOptions={[{ label: 'Receipt', value: 'Receipt' }, { label: 'Issue', value: 'Issue' }, { label: 'Transfer', value: 'Transfer' }]} />
    </div>
  );
}

export function WarehousesPage() {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Warehouses" description="Manage storage locations and zones" />
      <div className="flex items-center justify-center h-64 border border-dashed border-slate-300 rounded-xl bg-slate-50">
        <p className="text-slate-500">Warehouse mapping coming soon.</p>
      </div>
    </div>
  );
}

export function MaterialRequestsPage() {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Material Requests" description="Internal requests from production to stores" />
      <div className="flex items-center justify-center h-64 border border-dashed border-slate-300 rounded-xl bg-slate-50">
        <p className="text-slate-500">Material requests view coming soon.</p>
      </div>
    </div>
  );
}

export function LowStockPage() {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Low Stock Alerts" description="Items below minimum stock level" />
      <DataTable 
        data={rawMaterials.filter(r => r.status === 'Low Stock' || r.status === 'Out of Stock')}
        columns={[
          { key: 'materialCode', label: 'Code', render: (r) => <span className="font-mono text-xs">{r.materialCode}</span> },
          { key: 'name', label: 'Material', render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'stockQty', label: 'Current Stock', align: 'right', render: (r) => <span className="font-bold text-red-600">{r.stockQty}</span> },
          { key: 'minStock', label: 'Min Stock', align: 'right', render: (r) => <span className="text-slate-500">{r.minStock}</span> },
          { key: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'Out of Stock' ? 'error' : 'warning'}>{r.status}</Badge> }
        ]}
        searchKeys={['name']}
      />
    </div>
  );
}
