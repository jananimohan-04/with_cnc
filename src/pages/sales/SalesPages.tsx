import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Eye, Edit, Trash2, FileText, Users, Truck } from 'lucide-react';
import { PageHeader, DateSelector, FilterButton, ExportButton } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Card, Badge, Button, StatCard, statusToVariant, priorityToVariant } from '@/components/ui/Card';
import { Modal, ConfirmDialog, FormField, inputClass } from '@/components/ui/Modal';
import { enquiries, quotations, salesOrders, deliveries, customers } from '@/data/mockData';
import type { Enquiry, Quotation, SalesOrder, Delivery, Customer } from '@/data/mockData';

export { LeadsPage } from './LeadsPage';
export { SalesPipelinePage } from './SalesPipelinePage';

// ============ CUSTOMERS ============

export function CustomersPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewTarget, setViewTarget] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [customersData, setCustomersData] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);

  const resetForm = () => ({
    name: '', industry: 'Aerospace', contact: '', email: '', phone: '', city: '', gstNumber: '', paymentTerms: 'Net 30', status: 'Active'
  });
  const [formData, setFormData] = useState(resetForm());

  useEffect(() => {
    async function fetchCustomers() {
      try {
        const { data, error } = await supabase.from('cnc_customers').select('*').order('created_at', { ascending: false });
        if (error) {
          console.error('Error fetching customers:', error);
          setDbError(true);
          setCustomersData(customers); // Fallback to mock on error
        } else if (data) {
          setDbError(false);
          const formattedData: Customer[] = data.map((d: any) => ({
            id: d.id,
            name: d.name,
            industry: d.industry,
            contact: d.contact,
            email: d.email,
            phone: d.phone,
            city: d.city,
            totalOrders: d.total_orders,
            totalValue: Number(d.total_value),
            outstanding: Number(d.outstanding),
            rating: d.rating,
            status: d.status,
          }));
          setCustomersData(formattedData.length > 0 ? formattedData : customers);
        }
      } catch (err) {
        console.error('Unexpected error:', err);
        setDbError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchCustomers();
  }, []);

  const handleEditClick = (r: Customer) => {
    setFormData({
      name: r.name,
      industry: r.industry,
      contact: r.contact,
      email: r.email || '',
      phone: r.phone || '',
      city: r.city,
      gstNumber: '',
      paymentTerms: 'Net 30',
      status: r.status
    });
    setEditId(r.id);
    setShowAdd(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.contact) return;
    
    const entryData = {
      name: formData.name,
      industry: formData.industry,
      contact: formData.contact,
      email: formData.email,
      phone: formData.phone,
      city: formData.city,
      status: formData.status
    };

    setLoading(true);

    if (editId) {
      const { error } = await supabase.from('cnc_customers').update(entryData).eq('id', editId);
      if (!error) {
        setCustomersData(prev => prev.map(c => c.id === editId ? { 
          ...c, name: entryData.name, industry: entryData.industry, contact: entryData.contact, email: entryData.email, phone: entryData.phone, city: entryData.city, status: entryData.status as any
        } : c));
        setShowAdd(false);
        setEditId(null);
        setFormData(resetForm());
      } else {
        alert("Failed to update.");
      }
    } else {
      const newId = `CUST-${Math.floor(100 + Math.random() * 900)}`;
      const insertData = { ...entryData, id: newId, total_orders: 0, total_value: 0, outstanding: 0, rating: 3 };
      
      const { error } = await supabase.from('cnc_customers').insert([insertData]);
      if (!error) {
        const formatted: Customer = {
          id: newId, name: insertData.name, industry: insertData.industry, contact: insertData.contact, email: insertData.email, phone: insertData.phone, city: insertData.city, totalOrders: 0, totalValue: 0, outstanding: 0, rating: 3, status: 'Active'
        };
        setCustomersData([formatted, ...customersData]);
        setShowAdd(false);
        setFormData(resetForm());
      } else {
        alert("Failed to add to database. Check connection or SQL script.");
      }
    }
    setLoading(false);
  };

  const columns: Column<Customer>[] = [
    { key: 'name', label: 'Company', sortable: true, render: (r) => <span className="font-semibold text-slate-800">{r.name}</span> },
    { key: 'industry', label: 'Industry', sortable: true, render: (r) => <Badge variant="neutral">{r.industry}</Badge> },
    { key: 'contact', label: 'Contact Person', render: (r) => <div><p className="text-sm text-slate-700">{r.contact}</p><p className="text-xs text-slate-400">{r.city}</p></div> },
    { key: 'totalOrders', label: 'Orders', sortable: true, align: 'right' },
    { key: 'totalValue', label: 'Total Value', sortable: true, align: 'right', render: (r) => <span className="font-semibold text-slate-700">₹{(r.totalValue / 100000).toFixed(1)}L</span> },
    { key: 'outstanding', label: 'Outstanding', sortable: true, align: 'right', render: (r) => <span className={r.outstanding > 0 ? 'text-orange-600 font-medium' : 'text-slate-500'}>₹{(r.outstanding / 100000).toFixed(1)}L</span> },
    { key: 'rating', label: 'Rating', sortable: true, align: 'center', render: (r) => <span className="text-amber-400">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span> },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge variant={statusToVariant(r.status)} dot>{r.status}</Badge> },
    {
      key: 'actions', label: 'Actions', align: 'center', render: (r) => (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => setViewTarget(r)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Eye size={15} /></button>
          <button onClick={() => handleEditClick(r)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit size={15} /></button>
          <button onClick={() => setDeleteTarget(r)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={15} /></button>
        </div>
      )
    },
  ];

  const totalValue = customersData.reduce((acc, c) => acc + c.totalValue, 0);
  const outstanding = customersData.reduce((acc, c) => acc + c.outstanding, 0);
  const activeCount = customersData.filter(c => c.status === 'Active').length;

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Customers" description="Manage client relationships and outstanding balances" actions={<div className="flex items-center gap-2">{dbError && <Badge variant="error">DB Disconnected</Badge>}{loading && <Badge variant="neutral">Syncing...</Badge>}<DateSelector /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Clients" value={customersData.length.toString()} icon={<Users size={20} />} accent="brand" />
        <StatCard label="Active Clients" value={activeCount.toString()} icon={<Users size={20} />} trend="2" trendUp accent="success" />
        <StatCard label="Total Revenue" value={`₹${(totalValue / 10000000).toFixed(2)}Cr`} icon={<FileText size={20} />} trend="12%" trendUp accent="accent" />
        <StatCard label="Outstanding" value={`₹${(outstanding / 100000).toFixed(1)}L`} icon={<FileText size={20} />} accent="warning" />
      </div>
      <DataTable data={customersData} columns={columns} searchKeys={['name', 'contact', 'city']} onAdd={() => { setEditId(null); setFormData(resetForm()); setShowAdd(true); }} addLabel="Add Customer" filterOptions={[{ label: 'Active', value: 'Active' }, { label: 'Inactive', value: 'Inactive' }]} />
      
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setEditId(null); setFormData(resetForm()); }} title={editId ? "Edit Customer" : "New Customer"} subtitle={editId ? "Update customer profile" : "Add a new customer to the database"} size="lg" footer={<><Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button><Button onClick={handleSave}>{editId ? 'Update Customer' : 'Save Customer'}</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Company Name" required><input className={inputClass} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Company Ltd" /></FormField>
          <FormField label="Industry" required>
            <select className={inputClass} value={formData.industry} onChange={e => setFormData({...formData, industry: e.target.value})}>
              <option>Aerospace</option><option>Automotive</option><option>Defense</option><option>Medical</option><option>Space</option><option>Industrial</option>
            </select>
          </FormField>
          <FormField label="Contact Person" required><input className={inputClass} value={formData.contact} onChange={e => setFormData({...formData, contact: e.target.value})} placeholder="Full name" /></FormField>
          <FormField label="Email" required><input type="email" className={inputClass} value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="email@company.com" /></FormField>
          <FormField label="Phone"><input className={inputClass} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="+91 ..." /></FormField>
          <FormField label="City"><input className={inputClass} value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} placeholder="City" /></FormField>
          <FormField label="GST Number"><input className={inputClass} value={formData.gstNumber} onChange={e => setFormData({...formData, gstNumber: e.target.value})} placeholder="22AAAAA0000A1Z5" /></FormField>
          <FormField label="Payment Terms">
            <select className={inputClass} value={formData.paymentTerms} onChange={e => setFormData({...formData, paymentTerms: e.target.value})}>
              <option>Net 30</option><option>Net 45</option><option>Net 60</option><option>Advance</option>
            </select>
          </FormField>
          {editId && (
            <FormField label="Status">
              <select className={inputClass} value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                <option>Active</option><option>Inactive</option>
              </select>
            </FormField>
          )}
        </div>
      </Modal>

      <Modal open={!!viewTarget} onClose={() => setViewTarget(null)} title="View Customer Details" subtitle={viewTarget?.name}>
        {viewTarget && (
          <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
            <div><p className="text-slate-500 mb-1">Industry</p><Badge variant="neutral">{viewTarget.industry}</Badge></div>
            <div><p className="text-slate-500 mb-1">Status</p><Badge variant={statusToVariant(viewTarget.status)} dot>{viewTarget.status}</Badge></div>
            <div><p className="text-slate-500 mb-1">Contact</p><p className="font-medium text-slate-800">{viewTarget.contact}</p></div>
            <div><p className="text-slate-500 mb-1">City</p><p className="font-medium text-slate-800">{viewTarget.city}</p></div>
            <div><p className="text-slate-500 mb-1">Total Orders</p><p className="text-slate-800">{viewTarget.totalOrders}</p></div>
            <div><p className="text-slate-500 mb-1">Total Value</p><p className="font-semibold text-slate-800">₹{viewTarget.totalValue.toLocaleString('en-IN')}</p></div>
            <div><p className="text-slate-500 mb-1">Outstanding</p><p className={viewTarget.outstanding > 0 ? 'text-orange-600 font-medium' : 'text-slate-800'}>₹{viewTarget.outstanding.toLocaleString('en-IN')}</p></div>
            <div><p className="text-slate-500 mb-1">Rating</p><p className="text-amber-400 text-lg leading-none">{'★'.repeat(viewTarget.rating)}{'☆'.repeat(5 - viewTarget.rating)}</p></div>
          </div>
        )}
      </Modal>

      <ConfirmDialog 
        open={!!deleteTarget} 
        onClose={() => setDeleteTarget(null)} 
        onConfirm={async () => {
          if (deleteTarget) {
            setLoading(true);
            const { error } = await supabase.from('cnc_customers').delete().eq('id', deleteTarget.id);
            if (!error) {
              setCustomersData(prev => prev.filter(c => c.id !== deleteTarget.id));
            } else {
              console.error('Failed to delete:', error);
              alert("Failed to delete. Check connection.");
            }
            setLoading(false);
          }
        }} 
        title="Delete Customer" 
        message={`Delete customer ${deleteTarget?.name}? This will remove all associated records.`} 
        confirmLabel="Delete" 
        danger 
      />
    </div>
  );
}

export function QuotationsPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewTarget, setViewTarget] = useState<Quotation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Quotation | null>(null);
  const [quotationsData, setQuotationsData] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);

  const resetForm = () => ({
    quoteNo: `QT-2026-${Math.floor(100 + Math.random() * 900)}`,
    customer: '', enquiryNo: '', partName: '', quantity: '', unitPrice: '', validTill: '', status: 'Draft'
  });
  const [formData, setFormData] = useState(resetForm());

  useEffect(() => {
    async function fetchQuotations() {
      try {
        const { data, error } = await supabase.from('cnc_quotations').select('*').order('created_at', { ascending: false });
        if (error) {
          console.error('Error fetching quotations:', error);
          setDbError(true);
          setQuotationsData(quotations); // Fallback to mock on error
        } else if (data) {
          setDbError(false);
          const formattedData: Quotation[] = data.map((d: any) => ({
            id: d.id,
            quoteNo: d.quote_no,
            customer: d.customer,
            enquiryNo: d.enquiry_no,
            partName: d.part_name,
            quantity: d.quantity,
            unitPrice: Number(d.unit_price),
            totalValue: Number(d.total_value),
            date: d.date,
            validTill: d.valid_till,
            status: d.status,
          }));
          setQuotationsData(formattedData.length > 0 ? formattedData : quotations);
        }
      } catch (err) {
        console.error('Unexpected error:', err);
        setDbError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchQuotations();
  }, []);

  const handleEditClick = (r: Quotation) => {
    setFormData({
      quoteNo: r.quoteNo,
      customer: r.customer,
      enquiryNo: r.enquiryNo || '',
      partName: r.partName,
      quantity: r.quantity.toString(),
      unitPrice: r.unitPrice.toString(),
      validTill: r.validTill || '',
      status: r.status
    });
    setEditId(r.id);
    setShowAdd(true);
  };

  const handleSave = async () => {
    if (!formData.customer || !formData.partName) return;
    
    const qty = Number(formData.quantity) || 0;
    const price = Number(formData.unitPrice) || 0;

    const entryData = {
      quote_no: formData.quoteNo,
      customer: formData.customer,
      enquiry_no: formData.enquiryNo,
      part_name: formData.partName,
      quantity: qty,
      unit_price: price,
      total_value: qty * price,
      valid_till: formData.validTill || null,
      status: formData.status
    };

    setLoading(true);

    if (editId) {
      const { error } = await supabase.from('cnc_quotations').update(entryData).eq('id', editId);
      if (!error) {
        setQuotationsData(prev => prev.map(q => q.id === editId ? { 
          ...q, quoteNo: entryData.quote_no, customer: entryData.customer, enquiryNo: entryData.enquiry_no, partName: entryData.part_name, quantity: entryData.quantity, unitPrice: entryData.unit_price, totalValue: entryData.total_value, validTill: entryData.valid_till || '', status: entryData.status as any
        } : q));
        setShowAdd(false);
        setEditId(null);
        setFormData(resetForm());
      } else {
        alert("Failed to update.");
      }
    } else {
      const newId = crypto.randomUUID();
      const insertData = { ...entryData, id: newId, date: new Date().toISOString().split('T')[0] };
      
      const { error } = await supabase.from('cnc_quotations').insert([insertData]);
      if (!error) {
        const formatted: Quotation = {
          id: newId,
          quoteNo: insertData.quote_no,
          customer: insertData.customer,
          enquiryNo: insertData.enquiry_no,
          partName: insertData.part_name,
          quantity: insertData.quantity,
          unitPrice: insertData.unit_price,
          totalValue: insertData.total_value,
          date: insertData.date,
          validTill: insertData.valid_till || '',
          status: 'Draft'
        };
        setQuotationsData([formatted, ...quotationsData]);
        setShowAdd(false);
        setFormData(resetForm());
      } else {
        alert("Failed to add to database. Check connection or SQL script.");
      }
    }
    setLoading(false);
  };

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
      key: 'actions', label: 'Actions', align: 'center', render: (r) => (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => setViewTarget(r)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Eye size={15} /></button>
          <button onClick={() => handleEditClick(r)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit size={15} /></button>
          <button onClick={() => setDeleteTarget(r)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={15} /></button>
        </div>
      )
    },
  ];

  const pendingCount = quotationsData.filter(q => q.status === 'Sent' || q.status === 'Draft').length;
  const acceptedCount = quotationsData.filter(q => q.status === 'Accepted').length;
  const totalCompleted = quotationsData.filter(q => q.status === 'Accepted' || q.status === 'Rejected').length;
  const winRate = totalCompleted > 0 ? Math.round((acceptedCount / totalCompleted) * 100) : 0;

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Quotations" description="Manage price quotations for customer enquiries" actions={<div className="flex items-center gap-2">{dbError && <Badge variant="error">DB Disconnected</Badge>}{loading && <Badge variant="neutral">Syncing...</Badge>}<DateSelector /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Quotations" value={quotationsData.length.toString()} icon={<FileText size={20} />} accent="brand" />
        <StatCard label="Pending" value={pendingCount.toString()} icon={<FileText size={20} />} accent="warning" />
        <StatCard label="Accepted" value={acceptedCount.toString()} icon={<FileText size={20} />} trend="12%" trendUp accent="success" />
        <StatCard label="Win Rate" value={`${winRate}%`} icon={<FileText size={20} />} trend="3%" trendUp accent="accent" />
      </div>
      <DataTable data={quotationsData} columns={columns} searchKeys={['quoteNo', 'customer', 'partName']} onAdd={() => { setEditId(null); setFormData(resetForm()); setShowAdd(true); }} addLabel="New Quotation" filterOptions={[{ label: 'Draft', value: 'Draft' }, { label: 'Sent', value: 'Sent' }, { label: 'Accepted', value: 'Accepted' }, { label: 'Rejected', value: 'Rejected' }]} />
      
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setEditId(null); setFormData(resetForm()); }} title={editId ? "Edit Quotation" : "New Quotation"} subtitle={editId ? "Update quotation details" : "Create a new quotation for a customer"} size="lg" footer={<><Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button><Button onClick={handleSave}>{editId ? 'Update Quotation' : 'Save Quotation'}</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Quotation Number" required><input className={inputClass} value={formData.quoteNo} onChange={e => setFormData({...formData, quoteNo: e.target.value})} /></FormField>
          <FormField label="Customer" required>
            <select className={inputClass} value={formData.customer} onChange={e => setFormData({...formData, customer: e.target.value})}>
              <option value="">Select customer...</option>{customers.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField label="Enquiry Reference">
            <select className={inputClass} value={formData.enquiryNo} onChange={e => setFormData({...formData, enquiryNo: e.target.value})}>
              <option value="">Select enquiry...</option>{enquiries.map((e) => <option key={e.id} value={e.enquiryNo}>{e.enquiryNo}</option>)}
            </select>
          </FormField>
          <FormField label="Part Name" required><input className={inputClass} value={formData.partName} onChange={e => setFormData({...formData, partName: e.target.value})} /></FormField>
          <FormField label="Quantity" required><input type="number" className={inputClass} value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} /></FormField>
          <FormField label="Unit Price (₹)" required><input type="number" className={inputClass} value={formData.unitPrice} onChange={e => setFormData({...formData, unitPrice: e.target.value})} /></FormField>
          <FormField label="Valid Till" required><input type="date" className={inputClass} value={formData.validTill} onChange={e => setFormData({...formData, validTill: e.target.value})} /></FormField>
          <FormField label="Payment Terms"><select className={inputClass}><option>Net 30</option><option>Net 45</option><option>Net 60</option><option>Advance</option></select></FormField>
          {editId && (
            <FormField label="Status">
              <select className={inputClass} value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                <option>Draft</option><option>Sent</option><option>Accepted</option><option>Rejected</option><option>Expired</option>
              </select>
            </FormField>
          )}
        </div>
      </Modal>

      <Modal open={!!viewTarget} onClose={() => setViewTarget(null)} title="View Quotation Details" subtitle={viewTarget?.quoteNo}>
        {viewTarget && (
          <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
            <div><p className="text-slate-500 mb-1">Customer</p><p className="font-semibold text-slate-800">{viewTarget.customer}</p></div>
            <div><p className="text-slate-500 mb-1">Status</p><Badge variant={statusToVariant(viewTarget.status)} dot>{viewTarget.status}</Badge></div>
            <div><p className="text-slate-500 mb-1">Part Name</p><p className="font-medium text-slate-800">{viewTarget.partName}</p></div>
            <div><p className="text-slate-500 mb-1">Enquiry No</p><p className="font-mono text-slate-700">{viewTarget.enquiryNo}</p></div>
            <div><p className="text-slate-500 mb-1">Quantity</p><p className="text-slate-800">{viewTarget.quantity}</p></div>
            <div><p className="text-slate-500 mb-1">Unit Price</p><p className="text-slate-800">₹{viewTarget.unitPrice.toLocaleString('en-IN')}</p></div>
            <div><p className="text-slate-500 mb-1">Total Value</p><p className="font-semibold text-slate-800">₹{viewTarget.totalValue.toLocaleString('en-IN')}</p></div>
            <div><p className="text-slate-500 mb-1">Valid Till</p><p className="text-slate-800">{viewTarget.validTill}</p></div>
          </div>
        )}
      </Modal>

      <ConfirmDialog 
        open={!!deleteTarget} 
        onClose={() => setDeleteTarget(null)} 
        onConfirm={async () => {
          if (deleteTarget) {
            setLoading(true);
            const { error } = await supabase.from('cnc_quotations').delete().eq('id', deleteTarget.id);
            if (!error) {
              setQuotationsData(prev => prev.filter(q => q.id !== deleteTarget.id));
            } else {
              console.error('Failed to delete:', error);
              alert("Failed to delete. Check connection.");
            }
            setLoading(false);
          }
        }} 
        title="Delete Quotation" 
        message={`Delete quotation ${deleteTarget?.quoteNo}? This action cannot be undone.`} 
        confirmLabel="Delete" 
        danger 
      />
    </div>
  );
}

// ============ SALES ORDERS ============

export function SalesOrdersPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewTarget, setViewTarget] = useState<SalesOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SalesOrder | null>(null);
  const [deliveryTarget, setDeliveryTarget] = useState<SalesOrder | null>(null);
  const [ordersData, setOrdersData] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);

  const resetForm = () => ({
    orderNo: `SO-2026-${Math.floor(1000 + Math.random() * 9000)}`,
    customer: '', quoteNo: '', partName: '', partNo: '', quantity: '', deliveryDate: '', status: 'Confirmed'
  });
  const [formData, setFormData] = useState(resetForm());

  const resetDeliveryForm = () => ({
    deliveryNo: `DLV-2026-${Math.floor(1000 + Math.random() * 9000)}`,
    dispatchQty: '', deliveryAddress: '', transport: '', vehicleNo: '', driverContact: '', remarks: ''
  });
  const [deliveryForm, setDeliveryForm] = useState(resetDeliveryForm());

  useEffect(() => {
    async function fetchOrders() {
      try {
        const { data, error } = await supabase.from('cnc_sales_orders').select('*').order('created_at', { ascending: false });
        if (error) {
          console.error('Error fetching sales orders:', error);
          setDbError(true);
          setOrdersData(salesOrders); // Fallback to mock on error
        } else if (data) {
          setDbError(false);
          const formattedData: SalesOrder[] = data.map((d: any) => ({
            id: d.id,
            orderNo: d.order_no,
            customer: d.customer,
            quoteNo: d.quote_no,
            partName: d.part_name,
            partNo: d.part_no,
            quantity: d.quantity,
            delivered: d.delivered || 0,
            value: Number(d.value),
            orderDate: d.order_date,
            deliveryDate: d.delivery_date,
            status: d.status,
          }));
          setOrdersData(formattedData.length > 0 ? formattedData : salesOrders);
        }
      } catch (err) {
        console.error('Unexpected error:', err);
        setDbError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchOrders();
  }, []);

  const handleEditClick = (r: SalesOrder) => {
    setFormData({
      orderNo: r.orderNo,
      customer: r.customer,
      quoteNo: r.quoteNo || '',
      partName: r.partName,
      partNo: r.partNo || '',
      quantity: r.quantity.toString(),
      deliveryDate: r.deliveryDate || '',
      status: r.status
    });
    setEditId(r.id);
    setShowAdd(true);
  };

  const handleSave = async () => {
    if (!formData.customer || !formData.partName) return;
    
    const entryData = {
      order_no: formData.orderNo,
      customer: formData.customer,
      quote_no: formData.quoteNo,
      part_name: formData.partName,
      part_no: formData.partNo || formData.partName.substring(0, 3).toUpperCase(),
      quantity: Number(formData.quantity) || 0,
      delivery_date: formData.deliveryDate || null,
      status: formData.status
    };

    setLoading(true);

    if (editId) {
      const { error } = await supabase.from('cnc_sales_orders').update(entryData).eq('id', editId);
      if (!error) {
        setOrdersData(prev => prev.map(o => o.id === editId ? { 
          ...o, orderNo: entryData.order_no, customer: entryData.customer, quoteNo: entryData.quote_no, partName: entryData.part_name, partNo: entryData.part_no, quantity: entryData.quantity, deliveryDate: entryData.delivery_date || '', status: entryData.status as any
        } : o));
        setShowAdd(false);
        setEditId(null);
        setFormData(resetForm());
      } else {
        alert("Failed to update.");
      }
    } else {
      const newId = crypto.randomUUID();
      const insertData = { ...entryData, id: newId, delivered: 0, value: entryData.quantity * 1500, order_date: new Date().toISOString().split('T')[0] };
      
      const { error } = await supabase.from('cnc_sales_orders').insert([insertData]);
      if (!error) {
        const formatted: SalesOrder = {
          id: newId,
          orderNo: insertData.order_no,
          customer: insertData.customer,
          quoteNo: insertData.quote_no,
          partName: insertData.part_name,
          partNo: insertData.part_no,
          quantity: insertData.quantity,
          delivered: insertData.delivered,
          value: insertData.value,
          orderDate: insertData.order_date,
          deliveryDate: insertData.delivery_date || '',
          status: 'Confirmed'
        };
        setOrdersData([formatted, ...ordersData]);
        setShowAdd(false);
        setFormData(resetForm());
      } else {
        alert("Failed to add to database. Check connection or SQL script.");
      }
    }
    setLoading(false);
  };

  const handleSaveDelivery = async () => {
    if (!deliveryTarget) return;
    setLoading(true);
    const { error } = await supabase.from('cnc_deliveries').insert([{
      delivery_no: deliveryForm.deliveryNo,
      sales_order_id: deliveryTarget.id,
      sales_order_no: deliveryTarget.orderNo,
      customer_id: 'unknown',
      customer_name: deliveryTarget.customer,
      part_name: deliveryTarget.partName,
      quantity: deliveryTarget.quantity,
      delivery_date: new Date().toISOString().split('T')[0],
      delivery_address: deliveryForm.deliveryAddress,
      transport: deliveryForm.transport,
      vehicle_no: deliveryForm.vehicleNo,
      driver_contact: deliveryForm.driverContact,
      dispatch_qty: Number(deliveryForm.dispatchQty) || deliveryTarget.quantity,
      remarks: deliveryForm.remarks,
      status: 'Pending'
    }]);
    
    if (!error) {
       // Log stock movement
       await supabase.from('cnc_stock_movements').insert([{
          date: new Date().toISOString().split('T')[0],
          type: 'Issue',
          material: deliveryTarget.partName,
          qty: Number(deliveryForm.dispatchQty) || deliveryTarget.quantity,
          uom: 'Nos',
          from: 'Main Warehouse',
          to: deliveryTarget.customer,
          reference: deliveryForm.deliveryNo,
          user: 'Admin'
       }]);
    }

    if (!error) {
      alert("Delivery tracking created! You can track it in the Operations > Delivery Tracking page.");
      setDeliveryTarget(null);
      setDeliveryForm(resetDeliveryForm());
    } else {
      alert("Error creating delivery.");
    }
    setLoading(false);
  };

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
      key: 'actions', label: 'Actions', align: 'center', render: (r) => (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => setDeliveryTarget(r)} title="Create Delivery" className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"><Truck size={15} /></button>
          <button onClick={() => setViewTarget(r)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Eye size={15} /></button>
          <button onClick={() => handleEditClick(r)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit size={15} /></button>
          <button onClick={() => setDeleteTarget(r)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={15} /></button>
        </div>
      )
    },
  ];

  const inProduction = ordersData.filter(o => o.status === 'In Production').length;
  const deliveredCount = ordersData.filter(o => o.status === 'Delivered').length;
  const totalValue = ordersData.reduce((acc, o) => acc + o.value, 0);

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Sales Orders" description="Track confirmed customer orders" actions={<div className="flex items-center gap-2">{dbError && <Badge variant="error">DB Disconnected</Badge>}{loading && <Badge variant="neutral">Syncing...</Badge>}<DateSelector /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Orders" value={ordersData.length.toString()} icon={<FileText size={20} />} accent="brand" />
        <StatCard label="In Production" value={inProduction.toString()} icon={<FileText size={20} />} accent="accent" />
        <StatCard label="Delivered" value={deliveredCount.toString()} icon={<FileText size={20} />} trend="100%" trendUp accent="success" />
        <StatCard label="Order Value" value={`₹${(totalValue / 100000).toFixed(1)}L`} icon={<FileText size={20} />} accent="navy" />
      </div>
      <DataTable data={ordersData} columns={columns} searchKeys={['orderNo', 'customer', 'partName', 'partNo']} onAdd={() => { setEditId(null); setFormData(resetForm()); setShowAdd(true); }} addLabel="New Sales Order" filterOptions={[{ label: 'Confirmed', value: 'Confirmed' }, { label: 'In Production', value: 'In Production' }, { label: 'Partially Delivered', value: 'Partially Delivered' }, { label: 'Delivered', value: 'Delivered' }, { label: 'On Hold', value: 'On Hold' }]} />
      
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setEditId(null); setFormData(resetForm()); }} title={editId ? "Edit Sales Order" : "New Sales Order"} subtitle={editId ? "Update sales order details" : "Create a sales order from an accepted quotation"} size="lg" footer={<><Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button><Button onClick={handleSave}>{editId ? 'Update Order' : 'Create Order'}</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Order Number" required><input className={inputClass} value={formData.orderNo} onChange={e => setFormData({...formData, orderNo: e.target.value})} /></FormField>
          <FormField label="Customer" required>
            <select className={inputClass} value={formData.customer} onChange={e => setFormData({...formData, customer: e.target.value})}>
              <option value="">Select customer...</option>{customers.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField label="Quotation Reference">
            <select className={inputClass} value={formData.quoteNo} onChange={e => setFormData({...formData, quoteNo: e.target.value})}>
              <option value="">Select quotation...</option>{quotations.map((q) => <option key={q.id} value={q.quoteNo}>{q.quoteNo}</option>)}
            </select>
          </FormField>
          <FormField label="Part Name" required><input className={inputClass} value={formData.partName} onChange={e => setFormData({...formData, partName: e.target.value})} /></FormField>
          <FormField label="Part Number"><input className={inputClass} value={formData.partNo} onChange={e => setFormData({...formData, partNo: e.target.value})} /></FormField>
          <FormField label="Quantity" required><input type="number" className={inputClass} value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} /></FormField>
          <FormField label="Delivery Date" required><input type="date" className={inputClass} value={formData.deliveryDate} onChange={e => setFormData({...formData, deliveryDate: e.target.value})} /></FormField>
          {editId && (
            <FormField label="Status">
              <select className={inputClass} value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                <option>Confirmed</option><option>In Production</option><option>Partially Delivered</option><option>Delivered</option><option>On Hold</option>
              </select>
            </FormField>
          )}
        </div>
      </Modal>

      <Modal open={!!viewTarget} onClose={() => setViewTarget(null)} title="View Sales Order Details" subtitle={viewTarget?.orderNo}>
        {viewTarget && (
          <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
            <div><p className="text-slate-500 mb-1">Customer</p><p className="font-semibold text-slate-800">{viewTarget.customer}</p></div>
            <div><p className="text-slate-500 mb-1">Status</p><Badge variant={statusToVariant(viewTarget.status)} dot>{viewTarget.status}</Badge></div>
            <div><p className="text-slate-500 mb-1">Part Name</p><p className="font-medium text-slate-800">{viewTarget.partName}</p></div>
            <div><p className="text-slate-500 mb-1">Part No</p><p className="font-mono text-slate-700">{viewTarget.partNo}</p></div>
            <div><p className="text-slate-500 mb-1">Quantity</p><p className="text-slate-800">{viewTarget.quantity}</p></div>
            <div><p className="text-slate-500 mb-1">Delivered</p><p className="text-slate-800">{viewTarget.delivered}</p></div>
            <div><p className="text-slate-500 mb-1">Total Value</p><p className="font-semibold text-slate-800">₹{viewTarget.value.toLocaleString('en-IN')}</p></div>
            <div><p className="text-slate-500 mb-1">Due Date</p><p className="text-slate-800">{viewTarget.deliveryDate}</p></div>
          </div>
        )}
      </Modal>

      <Modal open={!!deliveryTarget} onClose={() => setDeliveryTarget(null)} title="Create Delivery" subtitle={`Dispatch goods for Order ${deliveryTarget?.orderNo}`} size="lg" footer={<><Button variant="secondary" onClick={() => setDeliveryTarget(null)}>Cancel</Button><Button onClick={handleSaveDelivery}>Create Delivery</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Delivery Number" required><input className={inputClass} value={deliveryForm.deliveryNo} disabled /></FormField>
          <FormField label="Dispatch Quantity" required><input type="number" className={inputClass} value={deliveryForm.dispatchQty} onChange={e => setDeliveryForm({...deliveryForm, dispatchQty: e.target.value})} placeholder={deliveryTarget?.quantity.toString()} /></FormField>
          <div className="col-span-2">
            <FormField label="Delivery Address" required><input className={inputClass} value={deliveryForm.deliveryAddress} onChange={e => setDeliveryForm({...deliveryForm, deliveryAddress: e.target.value})} /></FormField>
          </div>
          <FormField label="Transport / Courier"><input className={inputClass} value={deliveryForm.transport} onChange={e => setDeliveryForm({...deliveryForm, transport: e.target.value})} /></FormField>
          <FormField label="Vehicle Number"><input className={inputClass} value={deliveryForm.vehicleNo} onChange={e => setDeliveryForm({...deliveryForm, vehicleNo: e.target.value})} /></FormField>
          <FormField label="Driver Contact"><input className={inputClass} value={deliveryForm.driverContact} onChange={e => setDeliveryForm({...deliveryForm, driverContact: e.target.value})} /></FormField>
          <FormField label="Remarks"><input className={inputClass} value={deliveryForm.remarks} onChange={e => setDeliveryForm({...deliveryForm, remarks: e.target.value})} /></FormField>
        </div>
      </Modal>

      <ConfirmDialog 
        open={!!deleteTarget} 
        onClose={() => setDeleteTarget(null)} 
        onConfirm={async () => {
          if (deleteTarget) {
            setLoading(true);
            const { error } = await supabase.from('cnc_sales_orders').delete().eq('id', deleteTarget.id);
            if (!error) {
              setOrdersData(prev => prev.filter(o => o.id !== deleteTarget.id));
            } else {
              console.error('Failed to delete:', error);
              alert("Failed to delete. Check connection.");
            }
            setLoading(false);
          }
        }} 
        title="Delete Order" 
        message={`Delete order ${deleteTarget?.orderNo}? This action cannot be undone.`} 
        confirmLabel="Delete" 
        danger 
      />
    </div>
  );
}


