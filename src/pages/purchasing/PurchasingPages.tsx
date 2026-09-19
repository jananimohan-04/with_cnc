import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Eye, Edit, Trash2, Users, FileText, ShoppingCart, Package, Activity, TrendingUp, Power, PowerOff } from 'lucide-react';
import { PageHeader, FilterButton, ExportButton } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Card, Badge, Button, StatCard, ProgressBar, statusToVariant } from '@/components/ui/Card';
import { Modal, FormField, inputClass } from '@/components/ui/Modal';
import { purchaseOrders } from '@/data/mockData';
import type { PurchaseOrder } from '@/data/mockData';

export function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [viewTarget, setViewTarget] = useState<any>(null);
  const [editId, setEditId] = useState<string | null>(null);
  
  // Tabs for details view
  const [activeTab, setActiveTab] = useState('Profile');

  const [formData, setFormData] = useState({
    code: '', name: '', category: 'Raw Material', status: 'Active',
    contact_person: '', phone: '', email: '', website: '',
    address: '', city: '', state: '', country: '', pincode: '',
    gst_number: '', pan: '', payment_terms: 'Net 30'
  });

  useEffect(() => {
    fetchSuppliers();
  }, []);

  async function fetchSuppliers() {
    setLoading(true);
    const { data, error } = await supabase.from('cnc_suppliers').select('*').order('created_at', { ascending: false });
    if (!error && data) setSuppliers(data);
    setLoading(false);
  }

  const resetForm = () => ({
    code: `VEN-${Math.floor(1000 + Math.random() * 9000)}`, name: '', category: 'Raw Material', status: 'Active',
    contact_person: '', phone: '', email: '', website: '',
    address: '', city: '', state: '', country: '', pincode: '',
    gst_number: '', pan: '', payment_terms: 'Net 30'
  });

  const handleSave = async () => {
    if (!formData.code || !formData.name) return alert("Code and Name are required");
    
    if (editId) {
      const { error } = await supabase.from('cnc_suppliers').update(formData).eq('id', editId);
      if (error) return alert("Error updating: " + error.message);
    } else {
      const { error } = await supabase.from('cnc_suppliers').insert([formData]);
      if (error) {
        if (error.code === '23505') return alert("Supplier code already exists.");
        return alert("Error saving: " + error.message + "\nMake sure you ran the SQL script.");
      }
    }
    setShowModal(false);
    fetchSuppliers();
  };

  const handleToggleStatus = async (s: any) => {
    const newStatus = s.status === 'Active' ? 'Inactive' : 'Active';
    const { error } = await supabase.from('cnc_suppliers').update({ status: newStatus }).eq('id', s.id);
    if (!error) fetchSuppliers();
  };

  const columns: Column<any>[] = [
    { key: 'code', label: 'Code', sortable: true, render: (r) => <span className="font-mono text-xs font-semibold text-brand-700">{r.code}</span> },
    { key: 'name', label: 'Supplier Name', sortable: true, render: (r) => <span className="font-medium text-slate-800">{r.name}</span> },
    { key: 'category', label: 'Category', sortable: true, render: (r) => <Badge variant="neutral">{r.category}</Badge> },
    { key: 'contact', label: 'Contact', render: (r) => <div><p className="text-sm font-medium">{r.contact_person || 'N/A'}</p><p className="text-xs text-slate-500">{r.phone || r.email || ''}</p></div> },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge variant={r.status === 'Active' ? 'success' : 'neutral'} dot>{r.status}</Badge> },
    {
      key: 'actions', label: 'Actions', align: 'center', render: (r) => (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => { setViewTarget(r); setActiveTab('Profile'); }} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors" title="View Details"><Eye size={15} /></button>
          <button onClick={() => { setEditId(r.id); setFormData(r); setShowModal(true); }} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit"><Edit size={15} /></button>
          <button onClick={() => handleToggleStatus(r)} className={`p-1.5 rounded transition-colors ${r.status === 'Active' ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`} title={r.status === 'Active' ? "Deactivate" : "Activate"}>
            {r.status === 'Active' ? <PowerOff size={15} /> : <Power size={15} />}
          </button>
        </div>
      )
    },
  ];

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader 
         title="Suppliers" 
         description="Manage vendor master data and assess performance" 
         actions={
           <div className="flex items-center gap-2">
             <FilterButton />
             <ExportButton />
             <Button onClick={() => { setEditId(null); setFormData(resetForm()); setShowModal(true); }} icon={<Plus size={16}/>}>New Supplier</Button>
           </div>
         } 
      />
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Suppliers" value={suppliers.length.toString()} icon={<Users size={20} />} accent="brand" />
        <StatCard label="Active" value={suppliers.filter(s => s.status === 'Active').length.toString()} icon={<Users size={20} />} accent="success" />
        <StatCard label="Avg Rating" value="N/A" icon={<TrendingUp size={20} />} accent="neutral" />
        <StatCard label="Avg On-Time" value="N/A" icon={<Activity size={20} />} accent="neutral" />
      </div>

      <Card>
         <DataTable data={suppliers} columns={columns} searchKeys={['name', 'code', 'category', 'contact_person']} />
      </Card>

      {/* Add / Edit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editId ? "Edit Supplier" : "New Supplier"} subtitle="Master Data Record" size="xl" footer={<><Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleSave}>Save Record</Button></>}>
        <div className="space-y-6">
           <div className="grid grid-cols-2 gap-4">
              <FormField label="Supplier Code" required><input className={inputClass} value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} /></FormField>
              <FormField label="Supplier Name" required><input className={inputClass} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></FormField>
              <div className="space-y-1"><label className="text-xs font-medium text-slate-700">Category</label>
                 <select className={inputClass} value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                    <option>Raw Material</option><option>Components</option><option>Tooling</option><option>Consumables</option><option>Services</option><option>Other</option>
                 </select>
              </div>
              <div className="space-y-1"><label className="text-xs font-medium text-slate-700">Status</label>
                 <select className={inputClass} value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                    <option>Active</option><option>Inactive</option>
                 </select>
              </div>
           </div>
           
           <h4 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2">Contact Details</h4>
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="col-span-2"><FormField label="Contact Person"><input className={inputClass} value={formData.contact_person} onChange={e => setFormData({...formData, contact_person: e.target.value})} /></FormField></div>
              <div className="col-span-2"><FormField label="Email"><input type="email" className={inputClass} value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} /></FormField></div>
              <div className="col-span-2"><FormField label="Phone"><input className={inputClass} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} /></FormField></div>
              <div className="col-span-2"><FormField label="Website"><input className={inputClass} value={formData.website} onChange={e => setFormData({...formData, website: e.target.value})} /></FormField></div>
           </div>

           <h4 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2">Business & Tax</h4>
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="col-span-2"><FormField label="GST Number"><input className={inputClass} value={formData.gst_number} onChange={e => setFormData({...formData, gst_number: e.target.value})} /></FormField></div>
              <div className="col-span-2"><FormField label="PAN"><input className={inputClass} value={formData.pan} onChange={e => setFormData({...formData, pan: e.target.value})} /></FormField></div>
              <div className="col-span-2"><FormField label="Payment Terms"><input className={inputClass} value={formData.payment_terms} onChange={e => setFormData({...formData, payment_terms: e.target.value})} /></FormField></div>
           </div>

           <h4 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2">Address</h4>
           <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><FormField label="Street Address"><input className={inputClass} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} /></FormField></div>
              <FormField label="City"><input className={inputClass} value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} /></FormField>
              <FormField label="State"><input className={inputClass} value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} /></FormField>
              <FormField label="Country"><input className={inputClass} value={formData.country} onChange={e => setFormData({...formData, country: e.target.value})} /></FormField>
              <FormField label="Pincode"><input className={inputClass} value={formData.pincode} onChange={e => setFormData({...formData, pincode: e.target.value})} /></FormField>
           </div>
        </div>
      </Modal>

      {/* View Modal */}
      <Modal open={!!viewTarget} onClose={() => setViewTarget(null)} title={viewTarget?.name} subtitle={viewTarget?.code} size="xl">
         {viewTarget && (
            <div>
               <div className="flex gap-4 border-b border-slate-200 mb-4 pb-0 overflow-x-auto scrollbar-hide">
                  {['Profile', 'Purchase Orders', 'Goods Receipts', 'Performance'].map(tab => (
                     <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-2 px-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{tab}</button>
                  ))}
               </div>

               {activeTab === 'Profile' && (
                  <div className="space-y-6">
                     <div className="grid grid-cols-3 gap-4">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                           <p className="text-xs text-slate-500 font-semibold mb-1">Status</p>
                           <Badge variant={viewTarget.status === 'Active' ? 'success' : 'neutral'}>{viewTarget.status}</Badge>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                           <p className="text-xs text-slate-500 font-semibold mb-1">Category</p>
                           <p className="font-semibold text-slate-800">{viewTarget.category || 'N/A'}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                           <p className="text-xs text-slate-500 font-semibold mb-1">Payment Terms</p>
                           <p className="font-semibold text-slate-800">{viewTarget.payment_terms || 'N/A'}</p>
                        </div>
                     </div>
                     <div className="grid grid-cols-2 gap-8">
                        <div>
                           <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Contact Information</h5>
                           <div className="space-y-2 text-sm">
                              <div className="flex justify-between"><span className="text-slate-500">Contact Person</span><span className="font-medium">{viewTarget.contact_person || '-'}</span></div>
                              <div className="flex justify-between"><span className="text-slate-500">Phone</span><span className="font-medium">{viewTarget.phone || '-'}</span></div>
                              <div className="flex justify-between"><span className="text-slate-500">Email</span><span className="font-medium">{viewTarget.email || '-'}</span></div>
                              <div className="flex justify-between"><span className="text-slate-500">Website</span><span className="font-medium">{viewTarget.website || '-'}</span></div>
                           </div>
                        </div>
                        <div>
                           <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Business Details</h5>
                           <div className="space-y-2 text-sm">
                              <div className="flex justify-between"><span className="text-slate-500">GST Number</span><span className="font-medium">{viewTarget.gst_number || '-'}</span></div>
                              <div className="flex justify-between"><span className="text-slate-500">PAN</span><span className="font-medium">{viewTarget.pan || '-'}</span></div>
                              <div className="flex flex-col mt-2 pt-2 border-t border-slate-100">
                                 <span className="text-slate-500 mb-1">Address</span>
                                 <span className="font-medium">{viewTarget.address}</span>
                                 <span className="font-medium">{[viewTarget.city, viewTarget.state, viewTarget.country].filter(Boolean).join(', ')} {viewTarget.pincode}</span>
                              </div>
                           </div>
                        </div>
                     </div>
                  </div>
               )}

               {activeTab === 'Purchase Orders' && (
                  <div className="py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                     <ShoppingCart size={24} className="mx-auto text-slate-300 mb-2" />
                     <p className="text-slate-500 text-sm">No Purchase Orders found for this supplier.</p>
                     <p className="text-xs text-slate-400 mt-1">PO tracking module is pending implementation.</p>
                  </div>
               )}

               {activeTab === 'Goods Receipts' && (
                  <div className="py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                     <Package size={24} className="mx-auto text-slate-300 mb-2" />
                     <p className="text-slate-500 text-sm">No Goods Receipts found.</p>
                  </div>
               )}

               {activeTab === 'Performance' && (
                  <div className="py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                     <Activity size={24} className="mx-auto text-slate-300 mb-2" />
                     <p className="text-slate-500 text-sm">Insufficient data to calculate performance metrics.</p>
                     <p className="text-xs text-slate-400 mt-1">Requires historical PO and delivery data.</p>
                  </div>
               )}
            </div>
         )}
      </Modal>
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
