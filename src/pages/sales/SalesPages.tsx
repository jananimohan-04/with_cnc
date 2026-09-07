import { useState } from 'react';
import { Plus, Eye, Edit, Trash2, FileText } from 'lucide-react';
import { PageHeader, DateSelector, FilterButton, ExportButton } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Card, Badge, Button, StatCard, statusToVariant, priorityToVariant } from '@/components/ui/Card';
import { Modal, ConfirmDialog, FormField, inputClass } from '@/components/ui/Modal';
import { enquiries, quotations, salesOrders, deliveries, customers } from '@/data/mockData';
import type { Enquiry, Quotation, SalesOrder, Delivery, Customer } from '@/data/mockData';

// ============ ENQUIRIES ============

export function EnquiriesPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Enquiry | null>(null);

  const columns: Column<Enquiry>[] = [
    { key: 'enquiryNo', label: 'Enquiry No', sortable: true, render: (r) => <span className="font-mono text-xs text-slate-700">{r.enquiryNo}</span> },
    { key: 'customer', label: 'Customer', sortable: true, render: (r) => <span className="font-medium text-slate-700">{r.customer}</span> },
    { key: 'partName', label: 'Part', sortable: true, render: (r) => <div><p className="text-sm text-slate-700">{r.partName}</p><p className="text-xs text-slate-400">{r.partNo}</p></div> },
    { key: 'quantity', label: 'Qty', sortable: true, align: 'right' },
    { key: 'estimatedValue', label: 'Est. Value', sortable: true, align: 'right', render: (r) => <span className="font-semibold text-slate-700">₹{(r.estimatedValue / 100000).toFixed(1)}L</span> },
    { key: 'receivedDate', label: 'Received', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.receivedDate}</span> },
    { key: 'expectedDate', label: 'Expected', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.expectedDate}</span> },
    { key: 'source', label: 'Source', render: (r) => <Badge variant={r.source === 'Tender' ? 'info' : 'neutral'}>{r.source}</Badge> },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge variant={statusToVariant(r.status)} dot>{r.status}</Badge> },
    {
      key: 'actions', label: 'Actions', align: 'center', render: (r) => (
        <div className="flex items-center justify-center gap-1">
          <button className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Eye size={15} /></button>
          <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit size={15} /></button>
          <button onClick={() => setDeleteTarget(r)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={15} /></button>
        </div>
      )
    },
  ];

  const filterOpts = [
    { label: 'New', value: 'New' },
    { label: 'Under Review', value: 'Under Review' },
    { label: 'Quoted', value: 'Quoted' },
    { label: 'Converted', value: 'Converted' },
    { label: 'Lost', value: 'Lost' },
  ];

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Sales Enquiries" description="Manage incoming customer enquiries and RFQs" actions={<div className="flex items-center gap-2"><FilterButton /><ExportButton /><DateSelector /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Enquiries" value="142" icon={<FileText size={20} />} accent="brand" />
        <StatCard label="New This Month" value="8" icon={<Plus size={20} />} trend="15%" trendUp accent="success" />
        <StatCard label="Conversion Rate" value="68%" icon={<FileText size={20} />} trend="4%" trendUp accent="accent" />
        <StatCard label="Pipeline Value" value="₹1.24Cr" icon={<FileText size={20} />} accent="navy" />
      </div>
      <DataTable data={enquiries} columns={columns} searchKeys={['enquiryNo', 'customer', 'partName', 'partNo']} onAdd={() => setShowAdd(true)} addLabel="New Enquiry" filterOptions={filterOpts} />
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Sales Enquiry" subtitle="Create a new enquiry from customer RFQ" footer={<><Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button><Button onClick={() => setShowAdd(false)}>Save Enquiry</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Enquiry Number" required><input className={inputClass} placeholder="ENQ-2026-0143" /></FormField>
          <FormField label="Customer" required><select className={inputClass}><option>Select customer...</option>{customers.map((c) => <option key={c.id}>{c.name}</option>)}</select></FormField>
          <FormField label="Part Name" required><input className={inputClass} placeholder="Part name" /></FormField>
          <FormField label="Part Number" required><input className={inputClass} placeholder="Part number" /></FormField>
          <FormField label="Quantity" required><input type="number" className={inputClass} placeholder="0" /></FormField>
          <FormField label="Estimated Value (₹)"><input type="number" className={inputClass} placeholder="0" /></FormField>
          <FormField label="Expected Delivery Date"><input type="date" className={inputClass} /></FormField>
          <FormField label="Source"><select className={inputClass}><option>Direct</option><option>Tender</option><option>Referral</option></select></FormField>
          <div className="col-span-2"><FormField label="Notes"><textarea className={inputClass} rows={3} placeholder="Additional requirements or notes..." /></FormField></div>
        </div>
      </Modal>
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => {}} title="Delete Enquiry" message={`Are you sure you want to delete enquiry ${deleteTarget?.enquiryNo}? This action cannot be undone.`} confirmLabel="Delete" danger />
    </div>
  );
}

// ============ CUSTOMERS ============

export function CustomersPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);

  const columns: Column<Customer>[] = [
    { key: 'id', label: 'ID', sortable: true, render: (r) => <span className="font-mono text-xs text-slate-500">{r.id}</span> },
    { key: 'name', label: 'Customer', sortable: true, render: (r) => <div><p className="font-medium text-slate-700">{r.name}</p><p className="text-xs text-slate-400">{r.industry}</p></div> },
    { key: 'contact', label: 'Contact Person', sortable: true, render: (r) => <span className="text-sm text-slate-600">{r.contact}</span> },
    { key: 'city', label: 'City', sortable: true },
    { key: 'totalOrders', label: 'Orders', sortable: true, align: 'right' },
    { key: 'totalValue', label: 'Total Value', sortable: true, align: 'right', render: (r) => <span className="font-semibold text-slate-700">₹{(r.totalValue / 100000).toFixed(1)}L</span> },
    { key: 'outstanding', label: 'Outstanding', sortable: true, align: 'right', render: (r) => <span className={r.outstanding > 0 ? 'text-amber-600 font-medium' : 'text-slate-400'}>₹{(r.outstanding / 1000).toFixed(0)}K</span> },
    { key: 'rating', label: 'Rating', sortable: true, align: 'center', render: (r) => <span className="text-amber-500">{'★'.repeat(r.rating)}<span className="text-slate-200">{'★'.repeat(5 - r.rating)}</span></span> },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge variant={statusToVariant(r.status)} dot>{r.status}</Badge> },
    {
      key: 'actions', label: 'Actions', align: 'center', render: (r) => (
        <div className="flex items-center justify-center gap-1">
          <button className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Eye size={15} /></button>
          <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit size={15} /></button>
          <button onClick={() => setDeleteTarget(r)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={15} /></button>
        </div>
      )
    },
  ];

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Customers" description="Manage customer accounts and relationships" actions={<div className="flex items-center gap-2"><FilterButton /><ExportButton /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Customers" value="10" icon={<FileText size={20} />} accent="brand" />
        <StatCard label="Active" value="9" icon={<FileText size={20} />} accent="success" />
        <StatCard label="Total Revenue" value="₹7.04Cr" icon={<FileText size={20} />} trend="18%" trendUp accent="accent" />
        <StatCard label="Outstanding" value="₹19.6L" icon={<FileText size={20} />} accent="warning" />
      </div>
      <DataTable data={customers} columns={columns} searchKeys={['name', 'contact', 'city', 'industry']} onAdd={() => setShowAdd(true)} addLabel="Add Customer" filterOptions={[{ label: 'Active', value: 'Active' }, { label: 'Inactive', value: 'Inactive' }]} />
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add New Customer" subtitle="Create a new customer account" size="lg" footer={<><Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button><Button onClick={() => setShowAdd(false)}>Save Customer</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Customer Name" required><input className={inputClass} placeholder="Company name" /></FormField>
          <FormField label="Industry" required><select className={inputClass}><option>Aerospace</option><option>Automotive</option><option>Defense</option><option>Space</option><option>Industrial</option><option>Energy</option></select></FormField>
          <FormField label="Contact Person" required><input className={inputClass} placeholder="Full name" /></FormField>
          <FormField label="Email" required><input type="email" className={inputClass} placeholder="email@company.com" /></FormField>
          <FormField label="Phone"><input className={inputClass} placeholder="+91 ..." /></FormField>
          <FormField label="City"><input className={inputClass} placeholder="City" /></FormField>
          <FormField label="GST Number"><input className={inputClass} placeholder="22AAAAA0000A1Z5" /></FormField>
          <FormField label="Payment Terms"><select className={inputClass}><option>Net 30</option><option>Net 45</option><option>Net 60</option><option>Advance</option></select></FormField>
        </div>
      </Modal>
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => {}} title="Delete Customer" message={`Delete customer ${deleteTarget?.name}? This will remove all associated records.`} confirmLabel="Delete" danger />
    </div>
  );
}

// ============ QUOTATIONS ============

export function QuotationsPage() {
  const [showAdd, setShowAdd] = useState(false);

  const columns: Column<Quotation>[] = [
    { key: 'quoteNo', label: 'Quote No', sortable: true, render: (r) => <span className="font-mono text-xs text-slate-700">{r.quoteNo}</span> },
    { key: 'customer', label: 'Customer', sortable: true, render: (r) => <span className="font-medium text-slate-700">{r.customer}</span> },
    { key: 'enquiryNo', label: 'Enquiry', render: (r) => <span className="font-mono text-xs text-slate-500">{r.enquiryNo}</span> },
    { key: 'partName', label: 'Part', sortable: true },
    { key: 'quantity', label: 'Qty', sortable: true, align: 'right' },
    { key: 'unitPrice', label: 'Unit Price', sortable: true, align: 'right', render: (r) => <span>₹{r.unitPrice.toLocaleString('en-IN')}</span> },
    { key: 'totalValue', label: 'Total Value', sortable: true, align: 'right', render: (r) => <span className="font-semibold text-slate-700">₹{(r.totalValue / 100000).toFixed(1)}L</span> },
    { key: 'date', label: 'Date', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.date}</span> },
    { key: 'validTill', label: 'Valid Till', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.validTill}</span> },
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
      <PageHeader title="Quotations" description="Manage price quotations for customer enquiries" actions={<div className="flex items-center gap-2"><FilterButton /><ExportButton /><DateSelector /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Quotations" value="89" icon={<FileText size={20} />} accent="brand" />
        <StatCard label="Pending" value="2" icon={<FileText size={20} />} accent="warning" />
        <StatCard label="Accepted" value="42" icon={<FileText size={20} />} trend="12%" trendUp accent="success" />
        <StatCard label="Win Rate" value="52%" icon={<FileText size={20} />} trend="3%" trendUp accent="accent" />
      </div>
      <DataTable data={quotations} columns={columns} searchKeys={['quoteNo', 'customer', 'partName']} onAdd={() => setShowAdd(true)} addLabel="New Quotation" filterOptions={[{ label: 'Draft', value: 'Draft' }, { label: 'Sent', value: 'Sent' }, { label: 'Accepted', value: 'Accepted' }, { label: 'Rejected', value: 'Rejected' }]} />
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Quotation" subtitle="Create a quotation for a customer enquiry" size="lg" footer={<><Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button><Button onClick={() => setShowAdd(false)}>Save Quotation</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Quotation Number" required><input className={inputClass} placeholder="QT-2026-0090" /></FormField>
          <FormField label="Customer" required><select className={inputClass}><option>Select customer...</option>{customers.map((c) => <option key={c.id}>{c.name}</option>)}</select></FormField>
          <FormField label="Enquiry Reference"><select className={inputClass}><option>Select enquiry...</option>{enquiries.map((e) => <option key={e.id}>{e.enquiryNo}</option>)}</select></FormField>
          <FormField label="Part Name" required><input className={inputClass} /></FormField>
          <FormField label="Quantity" required><input type="number" className={inputClass} /></FormField>
          <FormField label="Unit Price (₹)" required><input type="number" className={inputClass} /></FormField>
          <FormField label="Valid Till" required><input type="date" className={inputClass} /></FormField>
          <FormField label="Payment Terms"><select className={inputClass}><option>Net 30</option><option>Net 45</option><option>Net 60</option><option>Advance</option></select></FormField>
        </div>
      </Modal>
    </div>
  );
}

// ============ SALES ORDERS ============

export function SalesOrdersPage() {
  const [showAdd, setShowAdd] = useState(false);

  const columns: Column<SalesOrder>[] = [
    { key: 'orderNo', label: 'Order No', sortable: true, render: (r) => <span className="font-mono text-xs text-slate-700">{r.orderNo}</span> },
    { key: 'customer', label: 'Customer', sortable: true, render: (r) => <span className="font-medium text-slate-700">{r.customer}</span> },
    { key: 'partName', label: 'Part', sortable: true, render: (r) => <div><p className="text-sm text-slate-700">{r.partName}</p><p className="text-xs text-slate-400">{r.partNo}</p></div> },
    { key: 'quantity', label: 'Qty', sortable: true, align: 'right' },
    { key: 'delivered', label: 'Delivered', align: 'right', render: (r) => <span className={r.delivered === r.quantity ? 'text-green-600 font-medium' : 'text-slate-500'}>{r.delivered}/{r.quantity}</span> },
    { key: 'value', label: 'Value', sortable: true, align: 'right', render: (r) => <span className="font-semibold text-slate-700">₹{(r.value / 100000).toFixed(1)}L</span> },
    { key: 'orderDate', label: 'Order Date', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.orderDate}</span> },
    { key: 'deliveryDate', label: 'Due Date', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.deliveryDate}</span> },
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
      <PageHeader title="Sales Orders" description="Track confirmed customer orders" actions={<div className="flex items-center gap-2"><FilterButton /><ExportButton /><DateSelector /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Orders" value="67" icon={<FileText size={20} />} accent="brand" />
        <StatCard label="In Production" value="3" icon={<FileText size={20} />} accent="accent" />
        <StatCard label="Delivered" value="2" icon={<FileText size={20} />} trend="100%" trendUp accent="success" />
        <StatCard label="Order Value" value="₹93.2L" icon={<FileText size={20} />} accent="navy" />
      </div>
      <DataTable data={salesOrders} columns={columns} searchKeys={['orderNo', 'customer', 'partName', 'partNo']} onAdd={() => setShowAdd(true)} addLabel="New Sales Order" filterOptions={[{ label: 'Confirmed', value: 'Confirmed' }, { label: 'In Production', value: 'In Production' }, { label: 'Partially Delivered', value: 'Partially Delivered' }, { label: 'Delivered', value: 'Delivered' }, { label: 'On Hold', value: 'On Hold' }]} />
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Sales Order" subtitle="Create a sales order from an accepted quotation" size="lg" footer={<><Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button><Button onClick={() => setShowAdd(false)}>Create Order</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Order Number" required><input className={inputClass} placeholder="SO-2026-0068" /></FormField>
          <FormField label="Customer" required><select className={inputClass}><option>Select customer...</option>{customers.map((c) => <option key={c.id}>{c.name}</option>)}</select></FormField>
          <FormField label="Quotation Reference"><select className={inputClass}><option>Select quotation...</option>{quotations.map((q) => <option key={q.id}>{q.quoteNo}</option>)}</select></FormField>
          <FormField label="Part Number" required><input className={inputClass} /></FormField>
          <FormField label="Quantity" required><input type="number" className={inputClass} /></FormField>
          <FormField label="Delivery Date" required><input type="date" className={inputClass} /></FormField>
        </div>
      </Modal>
    </div>
  );
}

// ============ DELIVERIES ============

export function DeliveriesPage() {
  const columns: Column<Delivery>[] = [
    { key: 'deliveryNo', label: 'Delivery No', sortable: true, render: (r) => <span className="font-mono text-xs text-slate-700">{r.deliveryNo}</span> },
    { key: 'orderNo', label: 'Order No', sortable: true, render: (r) => <span className="font-mono text-xs text-slate-500">{r.orderNo}</span> },
    { key: 'customer', label: 'Customer', sortable: true, render: (r) => <span className="font-medium text-slate-700">{r.customer}</span> },
    { key: 'partName', label: 'Part' },
    { key: 'quantity', label: 'Qty', align: 'right' },
    { key: 'dispatchDate', label: 'Dispatched', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.dispatchDate}</span> },
    { key: 'expectedDelivery', label: 'Expected', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.expectedDelivery}</span> },
    { key: 'carrier', label: 'Carrier' },
    { key: 'trackingNo', label: 'Tracking', render: (r) => <span className="font-mono text-xs text-slate-500">{r.trackingNo}</span> },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge variant={statusToVariant(r.status)} dot>{r.status}</Badge> },
  ];

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Delivery Tracking" description="Track dispatches and deliveries to customers" actions={<div className="flex items-center gap-2"><FilterButton /><ExportButton /><DateSelector /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Shipments" value="54" icon={<FileText size={20} />} accent="brand" />
        <StatCard label="In Transit" value="1" icon={<FileText size={20} />} accent="accent" />
        <StatCard label="Delivered" value="2" icon={<FileText size={20} />} trend="100%" trendUp accent="success" />
        <StatCard label="Delayed" value="1" icon={<FileText size={20} />} accent="error" />
      </div>
      <DataTable data={deliveries} columns={columns} searchKeys={['deliveryNo', 'orderNo', 'customer', 'partName', 'trackingNo']} filterOptions={[{ label: 'Pending', value: 'Pending' }, { label: 'Dispatched', value: 'Dispatched' }, { label: 'In Transit', value: 'In Transit' }, { label: 'Delivered', value: 'Delivered' }, { label: 'Delayed', value: 'Delayed' }]} />
    </div>
  );
}
