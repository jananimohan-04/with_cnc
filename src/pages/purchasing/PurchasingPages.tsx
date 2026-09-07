import { useState } from 'react';
import { Plus, Eye, Edit, Trash2, Users, FileText, ShoppingCart, Package, Activity, TrendingUp } from 'lucide-react';
import { PageHeader, FilterButton, ExportButton } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Card, Badge, Button, StatCard, ProgressBar, statusToVariant } from '@/components/ui/Card';
import { Modal, FormField, inputClass } from '@/components/ui/Modal';
import { suppliers, purchaseOrders } from '@/data/mockData';
import type { Supplier, PurchaseOrder } from '@/data/mockData';

export function SuppliersPage() {
  const [showAdd, setShowAdd] = useState(false);

  const columns: Column<Supplier>[] = [
    { key: 'name', label: 'Supplier Name', sortable: true, render: (r) => <span className="font-medium text-slate-800">{r.name}</span> },
    { key: 'category', label: 'Category', sortable: true, render: (r) => <Badge variant="neutral">{r.category}</Badge> },
    { key: 'contact', label: 'Contact', render: (r) => <div><p className="text-sm">{r.contact}</p><p className="text-xs text-slate-400">{r.email}</p></div> },
    { key: 'rating', label: 'Rating', sortable: true, align: 'center', render: (r) => <div className="flex justify-center text-amber-400">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div> },
    { key: 'onTimeRate', label: 'On-Time', sortable: true, render: (r) => <div className="flex items-center gap-2"><ProgressBar value={r.onTimeRate} max={100} color={r.onTimeRate > 90 ? 'success' : 'warning'} /><span className="text-xs">{r.onTimeRate}%</span></div> },
    { key: 'outstanding', label: 'Outstanding', align: 'right', sortable: true, render: (r) => <span className="font-mono text-sm">₹{(r.outstanding / 1000).toFixed(1)}k</span> },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge variant={r.status === 'Active' ? 'success' : 'neutral'} dot>{r.status}</Badge> },
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
      <PageHeader title="Suppliers" description="Manage vendors and assess performance" actions={<div className="flex items-center gap-2"><FilterButton /><ExportButton /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Suppliers" value="48" icon={<Users size={20} />} accent="brand" />
        <StatCard label="Active" value="42" icon={<Users size={20} />} accent="success" />
        <StatCard label="Avg Rating" value="4.2" icon={<TrendingUp size={20} />} accent="accent" />
        <StatCard label="Avg On-Time" value="92%" icon={<Activity size={20} />} accent="info" />
      </div>
      <DataTable data={suppliers} columns={columns} searchKeys={['name', 'category', 'contact']} onAdd={() => setShowAdd(true)} addLabel="New Supplier" />
    </div>
  );
}

export function PurchaseRequisitionsPage() {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Purchase Requisitions" description="Internal requests for procurement" />
      <div className="flex items-center justify-center h-64 border border-dashed border-slate-300 rounded-xl bg-slate-50">
        <p className="text-slate-500">Purchase Requisitions module coming soon.</p>
      </div>
    </div>
  );
}

export function PurchaseOrdersPage() {
  const columns: Column<PurchaseOrder>[] = [
    { key: 'poNo', label: 'PO No', sortable: true, render: (r) => <span className="font-mono text-xs font-semibold text-brand-700">{r.poNo}</span> },
    { key: 'supplier', label: 'Supplier', sortable: true, render: (r) => <span className="font-medium text-slate-800">{r.supplier}</span> },
    { key: 'category', label: 'Category', sortable: true, render: (r) => <span className="text-sm">{r.category}</span> },
    { key: 'orderDate', label: 'Order Date', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.orderDate}</span> },
    { key: 'expectedDate', label: 'Expected By', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.expectedDate}</span> },
    { key: 'totalValue', label: 'Value', align: 'right', sortable: true, render: (r) => <span className="font-mono text-sm">₹{(r.totalValue / 1000).toFixed(1)}k</span> },
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
      <PageHeader title="Purchase Orders" description="Manage POs issued to suppliers" actions={<div className="flex items-center gap-2"><FilterButton /><ExportButton /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total POs" value="124" icon={<ShoppingCart size={20} />} accent="brand" />
        <StatCard label="Open Value" value="₹2.4M" icon={<TrendingUp size={20} />} accent="warning" />
        <StatCard label="Received" value="86" icon={<Package size={20} />} accent="success" />
        <StatCard label="Delayed" value="3" icon={<Activity size={20} />} accent="error" />
      </div>
      <DataTable data={purchaseOrders} columns={columns} searchKeys={['poNo', 'supplier']} />
    </div>
  );
}

export function GoodsReceiptPage() {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Goods Receipt (GRN)" description="Receive materials against Purchase Orders" />
      <div className="flex items-center justify-center h-64 border border-dashed border-slate-300 rounded-xl bg-slate-50">
        <p className="text-slate-500">GRN module coming soon.</p>
      </div>
    </div>
  );
}

export function SupplierPerformancePage() {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Supplier Performance" description="Analytics on supplier delivery, quality, and pricing" />
      <div className="flex items-center justify-center h-64 border border-dashed border-slate-300 rounded-xl bg-slate-50">
        <p className="text-slate-500">Supplier performance analytics coming soon.</p>
      </div>
    </div>
  );
}
