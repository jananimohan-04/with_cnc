import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Eye, Edit, Trash2, Users, FileText, ShoppingCart, Package, Activity, TrendingUp, Power, PowerOff, Printer, Send, CheckCircle, AlertCircle } from 'lucide-react';
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
  const [prs, setPrs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [viewTarget, setViewTarget] = useState<any>(null);
  
  // Master data for form
  const [materials, setMaterials] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [materialRequests, setMaterialRequests] = useState<any[]>([]);

  // Form State
  const resetForm = () => ({
    prNo: `PR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    date: new Date().toISOString().split('T')[0],
    department: 'Production',
    priority: 'Normal',
    sourceType: 'Manual',
    sourceReference: '',
    materialRequestId: '',
    remarks: '',
    items: [] as any[]
  });
  const [form, setForm] = useState(resetForm());

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    // Fetch PRs
    const { data: prData } = await supabase.from('cnc_purchase_requisitions').select('*, items:cnc_purchase_requisition_items(*)').order('created_at', { ascending: false });
    if (prData) setPrs(prData);

    // Fetch Master Data for dropdowns
    const { data: rmData } = await supabase.from('cnc_raw_materials').select('*');
    const { data: ptData } = await supabase.from('cnc_parts').select('*');
    if (rmData && ptData) {
      setMaterials([
        ...rmData.map(r => ({ code: r.material_code, name: r.name, stock: r.stock_qty || 0, min: r.min_stock || 0, uom: r.uom, supplier_id: r.preferred_supplier_id })),
        ...ptData.map(p => ({ code: p.part_no, name: p.part_name, stock: p.stock_qty || 0, min: p.min_stock || 0, uom: p.unit, supplier_id: p.preferred_supplier_id }))
      ]);
    }
    const { data: supData } = await supabase.from('cnc_suppliers').select('*').eq('status', 'Active');
    if (supData) setSuppliers(supData);

    const { data: mrData } = await supabase.from('cnc_material_requests').select('*').in('status', ['Pending', 'Partial']);
    if (mrData) setMaterialRequests(mrData);

    setLoading(false);
  }

  const handleAddItem = () => {
    setForm({ ...form, items: [...form.items, { material_code: '', material_name: '', qty: '', uom: 'kg', required_date: '', preferred_supplier_id: '', estimated_unit_cost: '' }] });
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...form.items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // Auto-fill material details
    if (field === 'material_code') {
      const mat = materials.find(m => m.code === value);
      if (mat) {
         newItems[index].material_name = mat.name;
         newItems[index].uom = mat.uom;
         newItems[index].preferred_supplier_id = mat.supplier_id || '';
      }
    }
    
    setForm({ ...form, items: newItems });
  };

  const handleSourceChange = (e: any) => {
    const type = e.target.value;
    setForm({ ...form, sourceType: type, sourceReference: '', materialRequestId: '', items: [] });
  };

  const handleMRSelect = async (e: any) => {
    const mrId = e.target.value;
    const mr = materialRequests.find(m => m.id === mrId);
    if (!mr) return;

    setForm({ 
      ...form, 
      materialRequestId: mrId, 
      sourceReference: mr.request_no,
      items: [] // In a real scenario, fetch MR items and map them here. We'll leave blank for manual fill for now.
    });
    
    // Fetch MR Items
    const { data: mrItems } = await supabase.from('cnc_material_request_items').select('*').eq('request_id', mrId);
    if (mrItems) {
      setForm(prev => ({
         ...prev,
         items: mrItems.map(i => {
           const mat = materials.find(m => m.code === i.material_code) || {} as any;
           return {
             material_code: i.material_code,
             material_name: i.material_name,
             qty: i.request_qty,
             uom: i.uom || mat.uom || 'kg',
             required_date: mr.required_date,
             preferred_supplier_id: mat.supplier_id || '',
             estimated_unit_cost: ''
           }
         })
      }));
    }
  };

  const submitPR = async (status: string) => {
    if (!form.items.length) return alert('Add at least one item');
    
    const { data: prRecord, error } = await supabase.from('cnc_purchase_requisitions').insert([{
       pr_no: form.prNo,
       pr_date: form.date,
       department: form.department,
       priority: form.priority,
       source_type: form.sourceType,
       source_reference: form.sourceReference,
       material_request_id: form.materialRequestId || null,
       status: status,
       remarks: form.remarks,
       requested_by: 'Current User'
    }]).select();

    if (error) return alert('Error creating PR: ' + error.message + "\nDid you run the SQL script?");

    const prId = prRecord[0].id;
    
    const itemsToInsert = form.items.map(i => ({
      pr_id: prId,
      material_code: i.material_code,
      material_name: i.material_name,
      qty: Number(i.qty),
      uom: i.uom,
      required_date: i.required_date || null,
      preferred_supplier_id: i.preferred_supplier_id || null,
      estimated_unit_cost: i.estimated_unit_cost ? Number(i.estimated_unit_cost) : null
    }));

    await supabase.from('cnc_purchase_requisition_items').insert(itemsToInsert);
    
    setShowAdd(false);
    fetchData();
  };

  const handleAction = async (id: string, action: string) => {
    if (action === 'Reject') {
       const reason = prompt("Enter rejection reason:");
       if (!reason) return;
       await supabase.from('cnc_purchase_requisitions').update({ status: 'Rejected', rejection_reason: reason }).eq('id', id);
    } else if (action === 'Approve') {
       await supabase.from('cnc_purchase_requisitions').update({ status: 'Approved' }).eq('id', id);
    }
    fetchData();
    setViewTarget(null);
  };

  const convertToPO = async (pr: any) => {
    if (!confirm("Create a Draft Purchase Order for this Requisition?")) return;
    
    // Create PO
    const poNo = `PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    
    // Pick the first item's supplier as the PO supplier (simplified logic for Phase 1)
    const primarySupplierId = pr.items[0]?.preferred_supplier_id || null;

    const { data: poRecord, error } = await supabase.from('cnc_purchase_orders').insert([{
       po_number: poNo,
       purchase_requisition_id: pr.id,
       supplier_id: primarySupplierId,
       order_date: new Date().toISOString().split('T')[0],
       status: 'Draft',
       notes: `Generated from ${pr.pr_no}`
    }]).select();

    if (error) return alert("Error creating PO: " + error.message + "\nCheck SQL migration!");

    const poId = poRecord[0].id;

    // Create PO Items
    if (pr.items && pr.items.length > 0) {
       const poItems = pr.items.map((i: any) => ({
          purchase_order_id: poId,
          material_code: i.material_code,
          material_name: i.material_name,
          quantity: i.qty,
          unit: i.uom,
          unit_price: i.estimated_unit_cost || 0,
          total_amount: (i.qty * (i.estimated_unit_cost || 0)),
          required_date: i.required_date
       }));
       await supabase.from('cnc_purchase_order_items').insert(poItems);
    }

    // Update PR Status
    await supabase.from('cnc_purchase_requisitions').update({ status: 'Converted to PO' }).eq('id', pr.id);
    
    alert(`Draft Purchase Order ${poNo} created successfully!`);
    fetchData();
    setViewTarget(null);
  };

  const columns: Column<any>[] = [
    { key: 'pr_no', label: 'PR Number', render: (r) => <span className="font-mono text-xs font-semibold text-brand-700">{r.pr_no}</span> },
    { key: 'pr_date', label: 'Request Date', render: (r) => <span className="text-sm">{r.pr_date}</span> },
    { key: 'department', label: 'Department', render: (r) => <span className="text-sm">{r.department}</span> },
    { key: 'source', label: 'Source', render: (r) => <span className="text-sm">{r.source_type} {r.source_reference && `(${r.source_reference})`}</span> },
    { key: 'priority', label: 'Priority', render: (r) => <Badge variant={r.priority === 'High' ? 'error' : r.priority === 'Urgent' ? 'error' : 'neutral'}>{r.priority}</Badge> },
    { key: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'Approved' ? 'success' : r.status === 'Rejected' ? 'error' : r.status === 'Converted to PO' ? 'brand' : 'warning'} dot>{r.status}</Badge> },
    { key: 'actions', label: 'Actions', align: 'center', render: (r) => (
       <Button variant="secondary" size="sm" onClick={() => setViewTarget(r)} icon={<Eye size={14} />}>View</Button>
    ) }
  ];

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader 
         title="Purchase Requisitions" 
         description="Internal requests for procurement"
         actions={<Button onClick={() => { setForm(resetForm()); setShowAdd(true); }} icon={<Plus size={16}/>}>New Requisition</Button>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total PRs" value={prs.length.toString()} icon={<FileText size={20} />} accent="neutral" />
        <StatCard label="Pending Approval" value={prs.filter(p => p.status === 'Pending Approval' || p.status === 'Submitted').length.toString()} icon={<Activity size={20} />} accent="warning" />
        <StatCard label="Approved" value={prs.filter(p => p.status === 'Approved').length.toString()} icon={<TrendingUp size={20} />} accent="success" />
        <StatCard label="Converted to PO" value={prs.filter(p => p.status === 'Converted to PO').length.toString()} icon={<ShoppingCart size={20} />} accent="brand" />
      </div>

      <Card>
         <DataTable data={prs} columns={columns} searchKeys={['pr_no', 'department', 'source_reference']} />
      </Card>

      {/* CREATE PR MODAL */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Purchase Requisition" subtitle="Internal Procurement Request" size="xl" footer={<>
         <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
         <Button variant="secondary" onClick={() => submitPR('Draft')}>Save Draft</Button>
         <Button onClick={() => submitPR('Pending Approval')}>Submit for Approval</Button>
      </>}>
         <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
               <FormField label="PR Number" required><input className={inputClass} value={form.prNo} disabled /></FormField>
               <FormField label="Request Date" required><input type="date" className={inputClass} value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></FormField>
               <FormField label="Department"><input className={inputClass} value={form.department} onChange={e => setForm({...form, department: e.target.value})} /></FormField>
               
               <div className="space-y-1">
                 <label className="text-xs font-medium text-slate-700">Source</label>
                 <select className={inputClass} value={form.sourceType} onChange={handleSourceChange}>
                    <option>Manual</option>
                    <option>Material Request</option>
                    <option>Low Stock Alert</option>
                 </select>
               </div>
               
               {form.sourceType === 'Material Request' ? (
                  <div className="space-y-1 col-span-2">
                     <label className="text-xs font-medium text-slate-700">Select Material Request</label>
                     <select className={inputClass} value={form.materialRequestId} onChange={handleMRSelect}>
                        <option value="">-- Select MR --</option>
                        {materialRequests.map(mr => (
                           <option key={mr.id} value={mr.id}>{mr.request_no} (WO: {mr.work_order_no || 'N/A'})</option>
                        ))}
                     </select>
                  </div>
               ) : (
                  <div className="col-span-2"><FormField label="Source Reference"><input className={inputClass} value={form.sourceReference} onChange={e => setForm({...form, sourceReference: e.target.value})} placeholder="e.g. Email from Production" /></FormField></div>
               )}

               <div className="space-y-1">
                 <label className="text-xs font-medium text-slate-700">Priority</label>
                 <select className={inputClass} value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
                    <option>Low</option><option>Normal</option><option>High</option><option>Urgent</option>
                 </select>
               </div>
               <div className="col-span-2"><FormField label="Remarks"><input className={inputClass} value={form.remarks} onChange={e => setForm({...form, remarks: e.target.value})} /></FormField></div>
            </div>

            <div className="border-t border-slate-200 pt-4">
               <div className="flex justify-between items-center mb-3">
                  <h4 className="text-sm font-bold text-slate-800">Requested Items</h4>
                  <Button variant="secondary" size="sm" onClick={handleAddItem} icon={<Plus size={14}/>}>Add Item</Button>
               </div>
               
               {form.items.length === 0 ? (
                  <div className="text-center p-6 bg-slate-50 rounded-lg border border-dashed border-slate-300 text-slate-500 text-sm">No items added yet.</div>
               ) : (
                  <div className="overflow-x-auto">
                     <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead>
                           <tr className="bg-slate-50 border-y border-slate-200">
                              <th className="p-2 font-semibold text-slate-600">Material</th>
                              <th className="p-2 font-semibold text-slate-600">Req Qty</th>
                              <th className="p-2 font-semibold text-slate-600">UoM</th>
                              <th className="p-2 font-semibold text-slate-600">Current Stock</th>
                              <th className="p-2 font-semibold text-slate-600">Shortage</th>
                              <th className="p-2 font-semibold text-slate-600">Pref. Supplier</th>
                              <th className="p-2 font-semibold text-slate-600">Est. Unit Cost (,1)</th>
                              <th className="p-2"></th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                           {form.items.map((item, idx) => {
                              const matInfo = materials.find(m => m.code === item.material_code) || { stock: 0 };
                              const shortage = Math.max(0, Number(item.qty || 0) - matInfo.stock);
                              return (
                                 <tr key={idx}>
                                    <td className="p-1">
                                       <select className={inputClass} value={item.material_code} onChange={e => updateItem(idx, 'material_code', e.target.value)}>
                                          <option value="">Select...</option>
                                          {materials.map(m => <option key={m.code} value={m.code}>{m.code} - {m.name}</option>)}
                                       </select>
                                    </td>
                                    <td className="p-1"><input type="number" className={inputClass} value={item.qty} onChange={e => updateItem(idx, 'qty', e.target.value)} /></td>
                                    <td className="p-1"><input className={inputClass} value={item.uom} onChange={e => updateItem(idx, 'uom', e.target.value)} /></td>
                                    <td className="p-2 text-slate-600">{item.material_code ? matInfo.stock : '-'}</td>
                                    <td className="p-2 text-red-600 font-semibold">{item.material_code && shortage > 0 ? shortage : '-'}</td>
                                    <td className="p-1">
                                       <select className={inputClass} value={item.preferred_supplier_id} onChange={e => updateItem(idx, 'preferred_supplier_id', e.target.value)}>
                                          <option value="">None</option>
                                          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                       </select>
                                    </td>
                                    <td className="p-1"><input type="number" className={inputClass} value={item.estimated_unit_cost} onChange={e => updateItem(idx, 'estimated_unit_cost', e.target.value)} /></td>
                                    <td className="p-1 text-center"><button onClick={() => { const ni = [...form.items]; ni.splice(idx, 1); setForm({...form, items: ni}); }} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button></td>
                                 </tr>
                              );
                           })}
                        </tbody>
                     </table>
                  </div>
               )}
            </div>
         </div>
      </Modal>

      {/* VIEW PR MODAL */}
      <Modal open={!!viewTarget} onClose={() => setViewTarget(null)} title={`Requisition Details: ${viewTarget?.pr_no}`} subtitle={viewTarget?.status} size="xl" footer={
         <div className="flex gap-2 w-full justify-end">
            <Button variant="secondary" onClick={() => setViewTarget(null)}>Close</Button>
            {(viewTarget?.status === 'Draft' || viewTarget?.status === 'Pending') && <Button onClick={() => handleAction(viewTarget.id, 'Approve')}>Submit for Approval</Button>}
            {viewTarget?.status === 'Pending Approval' && <>
               <Button variant="error" onClick={() => handleAction(viewTarget.id, 'Reject')}>Reject</Button>
               <Button variant="primary" onClick={() => handleAction(viewTarget.id, 'Approve')}>Approve PR</Button>
            </>}
            {viewTarget?.status === 'Approved' && (
               <Button variant="brand" onClick={() => convertToPO(viewTarget)} icon={<ShoppingCart size={16}/>}>Convert to Purchase Order</Button>
            )}
            {viewTarget?.status === 'Converted to PO' && (
               <div className="px-4 py-2 bg-brand-50 text-brand-700 rounded-lg font-medium border border-brand-200 flex items-center gap-2">
                  <ShoppingCart size={16}/> Purchase Order Created
               </div>
            )}
         </div>
      }>
         {viewTarget && (
            <div className="space-y-6">
               <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm">
                  <div><span className="block text-slate-500 mb-1">Date</span><span className="font-medium text-slate-900">{viewTarget.pr_date}</span></div>
                  <div><span className="block text-slate-500 mb-1">Requested By</span><span className="font-medium text-slate-900">{viewTarget.requested_by}</span></div>
                  <div><span className="block text-slate-500 mb-1">Department</span><span className="font-medium text-slate-900">{viewTarget.department}</span></div>
                  <div><span className="block text-slate-500 mb-1">Priority</span><Badge variant={viewTarget.priority === 'Urgent' ? 'error' : 'neutral'}>{viewTarget.priority}</Badge></div>
                  <div><span className="block text-slate-500 mb-1">Source</span><span className="font-medium text-slate-900">{viewTarget.source_type}</span></div>
                  <div className="col-span-2"><span className="block text-slate-500 mb-1">Source Ref</span><span className="font-medium text-slate-900">{viewTarget.source_reference || 'N/A'}</span></div>
               </div>

               {viewTarget.status === 'Rejected' && viewTarget.rejection_reason && (
                  <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-red-800 text-sm">
                     <strong>Rejection Reason:</strong> {viewTarget.rejection_reason}
                  </div>
               )}

               <div>
                  <h4 className="text-sm font-bold text-slate-800 mb-3 border-b border-slate-200 pb-2">Requested Items</h4>
                  <table className="w-full text-left text-sm">
                     <thead>
                        <tr className="text-slate-500 border-b border-slate-100">
                           <th className="pb-2 font-medium">Material</th>
                           <th className="pb-2 font-medium">Qty</th>
                           <th className="pb-2 font-medium">Supplier (Suggested)</th>
                           <th className="pb-2 font-medium">Est. Cost</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-50">
                        {viewTarget.items?.map((item: any, idx: number) => {
                           const sup = suppliers.find(s => s.id === item.preferred_supplier_id);
                           return (
                              <tr key={idx}>
                                 <td className="py-3">
                                    <p className="font-medium text-slate-800">{item.material_name}</p>
                                    <p className="text-xs text-slate-500 font-mono">{item.material_code}</p>
                                 </td>
                                 <td className="py-3 font-semibold">{item.qty} <span className="text-xs font-normal text-slate-500">{item.uom}</span></td>
                                 <td className="py-3">{sup ? sup.name : <span className="text-slate-400 italic">Not Specified</span>}</td>
                                 <td className="py-3 font-mono">{item.estimated_unit_cost ? `,1${item.estimated_unit_cost}` : '-'}</td>
                              </tr>
                           );
                        })}
                     </tbody>
                  </table>
               </div>
            </div>
         )}
      </Modal>
    </div>
  );
}

export function PurchaseOrdersPage() {
  const [pos, setPos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [viewTarget, setViewTarget] = useState<any>(null);
  
  // Master Data
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);

  // Form State
  const resetForm = () => ({
    id: null,
    poNo: `PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    orderDate: new Date().toISOString().split('T')[0],
    expectedDate: '',
    supplierId: '',
    paymentTerms: 'Net 30',
    billingAddress: '',
    deliveryAddress: '',
    notes: '',
    items: [] as any[]
  });
  const [form, setForm] = useState(resetForm());

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    // 1. Fetch POs
    const { data: poData } = await supabase.from('cnc_purchase_orders').select('*, supplier:cnc_suppliers(name, code, address, gst_number), items:cnc_purchase_order_items(*)').order('created_at', { ascending: false });
    if (poData) setPos(poData);

    // 2. Fetch Suppliers
    const { data: supData } = await supabase.from('cnc_suppliers').select('*').eq('status', 'Active');
    if (supData) setSuppliers(supData);

    // 3. Fetch Materials
    const { data: rmData } = await supabase.from('cnc_raw_materials').select('*');
    const { data: ptData } = await supabase.from('cnc_parts').select('*');
    if (rmData && ptData) {
      setMaterials([
        ...rmData.map(r => ({ code: r.material_code, name: r.name, uom: r.uom })),
        ...ptData.map(p => ({ code: p.part_no, name: p.part_name, uom: p.unit }))
      ]);
    }
    setLoading(false);
  }

  const handleSupplierChange = (e: any) => {
    const sId = e.target.value;
    const s = suppliers.find(sup => sup.id === sId);
    setForm({
      ...form, 
      supplierId: sId,
      paymentTerms: s?.payment_terms || 'Net 30',
      billingAddress: 'CNCFORGE Main Office, 123 Industrial Phase, Pune',
      deliveryAddress: s?.address || 'CNCFORGE Main Warehouse, Pune'
    });
  };

  const handleAddItem = () => {
    setForm({ ...form, items: [...form.items, { material_code: '', material_name: '', quantity: '', unit: 'kg', unit_price: '', tax_amount: '', total_amount: '' }] });
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...form.items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    if (field === 'material_code') {
      const mat = materials.find(m => m.code === value);
      if (mat) {
         newItems[index].material_name = mat.name;
         newItems[index].unit = mat.uom;
      }
    }

    // Auto calculate totals
    const qty = Number(newItems[index].quantity) || 0;
    const price = Number(newItems[index].unit_price) || 0;
    const taxPercent = Number(newItems[index].tax_amount) || 0; // Using tax_amount field as tax% for UI input simplicity
    
    const lineTotalBase = qty * price;
    const taxAmount = lineTotalBase * (taxPercent / 100);
    newItems[index].total_amount = lineTotalBase + taxAmount;
    
    setForm({ ...form, items: newItems });
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let tax = 0;
    form.items.forEach(i => {
       const qty = Number(i.quantity) || 0;
       const price = Number(i.unit_price) || 0;
       const taxPercent = Number(i.tax_amount) || 0;
       const lineBase = qty * price;
       subtotal += lineBase;
       tax += lineBase * (taxPercent / 100);
    });
    return { subtotal, tax, grandTotal: subtotal + tax };
  };

  const savePO = async (statusToSave = 'Draft') => {
    if (!form.supplierId) return alert('Supplier is required');
    if (!form.items.length) return alert('At least one item is required');
    if (statusToSave === 'Issued' && !form.expectedDate) return alert('Expected Delivery Date is required to Issue PO');

    const totals = calculateTotals();

    const poRecord = {
       po_number: form.poNo,
       supplier_id: form.supplierId,
       order_date: form.orderDate,
       expected_date: form.expectedDate || null,
       status: statusToSave,
       payment_terms: form.paymentTerms,
       billing_address: form.billingAddress,
       delivery_address: form.deliveryAddress,
       subtotal: totals.subtotal,
       tax: totals.tax,
       grand_total: totals.grandTotal,
       notes: form.notes
    };

    let poId = form.id;

    if (poId) {
       // Update existing Draft
       const { error: updErr } = await supabase.from('cnc_purchase_orders').update(poRecord).eq('id', poId);
       if (updErr) return alert('Error updating PO: ' + updErr.message);
       // Delete old items and re-insert
       await supabase.from('cnc_purchase_order_items').delete().eq('purchase_order_id', poId);
    } else {
       // Insert new
       const { data: insData, error: insErr } = await supabase.from('cnc_purchase_orders').insert([poRecord]).select();
       if (insErr) return alert('Error creating PO: ' + insErr.message);
       poId = insData[0].id;
    }

    // Insert items
    const itemsToInsert = form.items.map(i => ({
      purchase_order_id: poId,
      material_code: i.material_code,
      material_name: i.material_name,
      quantity: Number(i.quantity),
      unit: i.unit,
      unit_price: Number(i.unit_price),
      tax_amount: Number(i.tax_amount), // Storing tax % here for simplicity
      total_amount: Number(i.total_amount)
    }));

    await supabase.from('cnc_purchase_order_items').insert(itemsToInsert);

    setShowAdd(false);
    setViewTarget(null);
    fetchData();
  };

  const loadPOForEdit = (po: any) => {
     setForm({
        id: po.id,
        poNo: po.po_number,
        orderDate: po.order_date,
        expectedDate: po.expected_date || '',
        supplierId: po.supplier_id,
        paymentTerms: po.payment_terms || '',
        billingAddress: po.billing_address || '',
        deliveryAddress: po.delivery_address || '',
        notes: po.notes || '',
        items: po.items.map((i:any) => ({ ...i }))
     });
     setShowAdd(true);
  };

  const handleIssueAction = async (po: any) => {
     if (!po.expected_date) return alert("Expected delivery date is missing. Please edit the PO first.");
     if (!confirm("Are you sure you want to issue this PO? It will be marked as Issued.")) return;
     await supabase.from('cnc_purchase_orders').update({ status: 'Issued' }).eq('id', po.id);
     fetchData();
     setViewTarget(null);
  };

  // Determine if a PO is delayed visually (Calculated dynamically, doesn't change DB status)
  const isDelayed = (po: any) => {
     if (['Draft', 'Received', 'Cancelled'].includes(po.status)) return false;
     if (!po.expected_date) return false;
     return new Date(po.expected_date) < new Date();
  };

  const columns: Column<any>[] = [
    { key: 'po_number', label: 'PO No', sortable: true, render: (r) => <span className="font-mono text-xs font-semibold text-brand-700">{r.po_number}</span> },
    { key: 'supplier', label: 'Supplier', sortable: true, render: (r) => <span className="font-medium text-slate-800">{r.supplier?.name}</span> },
    { key: 'order_date', label: 'Order Date', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.order_date}</span> },
    { key: 'expected_date', label: 'Expected By', sortable: true, render: (r) => (
       <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500">{r.expected_date || '-'}</span>
          {isDelayed(r) && <AlertCircle size={12} className="text-red-500" title="Delayed" />}
       </div>
    )},
    { key: 'grand_total', label: 'Value', align: 'right', sortable: true, render: (r) => <span className="font-mono text-sm">,1{(r.grand_total).toLocaleString()}</span> },
    { key: 'status', label: 'Status', sortable: true, render: (r) => (
       <div className="flex flex-col gap-1 items-start">
         <Badge variant={r.status === 'Issued' ? 'brand' : r.status === 'Draft' ? 'neutral' : r.status === 'Received' ? 'success' : 'warning'} dot>{r.status}</Badge>
         {isDelayed(r) && <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1 rounded">DELAYED</span>}
       </div>
    )},
    { key: 'actions', label: 'Actions', align: 'center', render: (r) => (
       <div className="flex gap-1 justify-center">
         <Button variant="secondary" size="sm" onClick={() => setViewTarget(r)} icon={<Eye size={14} />}>View</Button>
         {r.status === 'Draft' && <Button variant="secondary" size="sm" onClick={() => loadPOForEdit(r)} icon={<Edit size={14} />}></Button>}
       </div>
    ) }
  ];

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader 
         title="Purchase Orders" 
         description="Manage commercial purchase commitments issued to suppliers" 
         actions={<Button onClick={() => { setForm(resetForm()); setShowAdd(true); }} icon={<Plus size={16}/>}>New PO</Button>} 
      />
      
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <StatCard label="Total POs" value={pos.length.toString()} icon={<ShoppingCart size={20} />} accent="brand" />
        <StatCard label="Draft" value={pos.filter(p => p.status === 'Draft').length.toString()} icon={<FileText size={20} />} accent="neutral" />
        <StatCard label="Issued / Sent" value={pos.filter(p => p.status === 'Issued').length.toString()} icon={<Send size={20} />} accent="brand" />
        <StatCard label="Partially / Fully Rcvd" value={pos.filter(p => ['Partially Received', 'Received'].includes(p.status)).length.toString()} icon={<Package size={20} />} accent="success" />
        <StatCard label="Delayed" value={pos.filter(p => isDelayed(p)).length.toString()} icon={<Activity size={20} />} accent="error" />
      </div>
      
      <Card>
         <DataTable data={pos} columns={columns} searchKeys={['po_number', 'supplier.name', 'supplier.code']} />
      </Card>

      {/* CREATE / EDIT PO MODAL */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={form.id ? "Edit Purchase Order" : "New Purchase Order"} subtitle="Commercial Commitment" size="xl" footer={<>
         <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
         <Button variant="secondary" onClick={() => savePO('Draft')}>Save Draft</Button>
         <Button onClick={() => savePO('Issued')} icon={<Send size={16}/>}>Issue PO</Button>
      </>}>
         <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
               <FormField label="PO Number" required><input className={inputClass} value={form.poNo} disabled /></FormField>
               <FormField label="Order Date" required><input type="date" className={inputClass} value={form.orderDate} onChange={e => setForm({...form, orderDate: e.target.value})} /></FormField>
               <FormField label="Expected Delivery Date"><input type="date" className={inputClass} value={form.expectedDate} onChange={e => setForm({...form, expectedDate: e.target.value})} /></FormField>
               
               <div className="space-y-1 col-span-2">
                 <label className="text-xs font-medium text-slate-700">Supplier *</label>
                 <select className={inputClass} value={form.supplierId} onChange={handleSupplierChange}>
                    <option value="">-- Select Supplier --</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                 </select>
               </div>
               
               <FormField label="Payment Terms"><input className={inputClass} value={form.paymentTerms} onChange={e => setForm({...form, paymentTerms: e.target.value})} /></FormField>
               
               <div className="col-span-3 grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                     <label className="text-xs font-medium text-slate-700">Billing Address</label>
                     <textarea className={inputClass} rows={2} value={form.billingAddress} onChange={e => setForm({...form, billingAddress: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                     <label className="text-xs font-medium text-slate-700">Delivery Address</label>
                     <textarea className={inputClass} rows={2} value={form.deliveryAddress} onChange={e => setForm({...form, deliveryAddress: e.target.value})} />
                  </div>
               </div>
            </div>

            <div className="border-t border-slate-200 pt-4">
               <div className="flex justify-between items-center mb-3">
                  <h4 className="text-sm font-bold text-slate-800">Order Items</h4>
                  <Button variant="secondary" size="sm" onClick={handleAddItem} icon={<Plus size={14}/>}>Add Item</Button>
               </div>
               
               {form.items.length === 0 ? (
                  <div className="text-center p-6 bg-slate-50 rounded-lg border border-dashed border-slate-300 text-slate-500 text-sm">No items added to PO.</div>
               ) : (
                  <div className="overflow-x-auto">
                     <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead>
                           <tr className="bg-slate-50 border-y border-slate-200">
                              <th className="p-2 font-semibold text-slate-600">Material</th>
                              <th className="p-2 font-semibold text-slate-600 w-24">Qty</th>
                              <th className="p-2 font-semibold text-slate-600 w-16">UoM</th>
                              <th className="p-2 font-semibold text-slate-600 w-32">Unit Price (,1)</th>
                              <th className="p-2 font-semibold text-slate-600 w-24">Tax %</th>
                              <th className="p-2 font-semibold text-slate-600 text-right">Total (,1)</th>
                              <th className="p-2"></th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                           {form.items.map((item, idx) => (
                                 <tr key={idx}>
                                    <td className="p-1">
                                       <select className={inputClass} value={item.material_code} onChange={e => updateItem(idx, 'material_code', e.target.value)}>
                                          <option value="">Select...</option>
                                          {materials.map(m => <option key={m.code} value={m.code}>{m.code} - {m.name}</option>)}
                                       </select>
                                    </td>
                                    <td className="p-1"><input type="number" className={inputClass} value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} /></td>
                                    <td className="p-1"><input className={inputClass} value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} /></td>
                                    <td className="p-1"><input type="number" className={inputClass} value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', e.target.value)} /></td>
                                    <td className="p-1"><input type="number" className={inputClass} value={item.tax_amount} onChange={e => updateItem(idx, 'tax_amount', e.target.value)} /></td>
                                    <td className="p-2 text-right font-mono font-semibold text-slate-800">{item.total_amount ? Number(item.total_amount).toLocaleString() : '-'}</td>
                                    <td className="p-1 text-center"><button onClick={() => { const ni = [...form.items]; ni.splice(idx, 1); setForm({...form, items: ni}); }} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button></td>
                                 </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               )}
               
               {form.items.length > 0 && (() => {
                  const totals = calculateTotals();
                  return (
                     <div className="flex justify-end mt-4">
                        <div className="w-64 bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm">
                           <div className="flex justify-between mb-2"><span className="text-slate-500">Subtotal</span><span className="font-mono">,1{totals.subtotal.toLocaleString()}</span></div>
                           <div className="flex justify-between mb-2 pb-2 border-b border-slate-200"><span className="text-slate-500">Estimated Tax</span><span className="font-mono">,1{totals.tax.toLocaleString()}</span></div>
                           <div className="flex justify-between font-bold text-slate-900 text-base"><span>Grand Total</span><span className="font-mono text-brand-700">,1{totals.grandTotal.toLocaleString()}</span></div>
                        </div>
                     </div>
                  );
               })()}
            </div>
         </div>
      </Modal>

      {/* VIEW / PRINT PO MODAL */}
      <Modal open={!!viewTarget} onClose={() => setViewTarget(null)} title={`Purchase Order: ${viewTarget?.po_number}`} size="xl" footer={
         <div className="flex gap-2 w-full justify-between items-center">
            <div>
               {viewTarget?.status === 'Issued' && (
                  <Button variant="success" icon={<Package size={16}/>} onClick={() => alert("Goods Receipt module is pending implementation. Once available, this will map the PO into a new GRN transaction.")}>
                     Create Goods Receipt
                  </Button>
               )}
               {['Partially Received', 'Received'].includes(viewTarget?.status) && (
                  <span className="text-sm font-medium text-emerald-600 flex items-center gap-1"><CheckCircle size={16}/> Goods Receiving In Progress / Completed</span>
               )}
            </div>
            <div className="flex gap-2">
               <Button variant="secondary" onClick={() => window.print()} icon={<Printer size={16}/>}>Print / PDF</Button>
               {viewTarget?.status === 'Draft' && <Button onClick={() => loadPOForEdit(viewTarget)} icon={<Edit size={16}/>}>Edit PO</Button>}
               {viewTarget?.status === 'Draft' && <Button variant="brand" onClick={() => handleIssueAction(viewTarget)} icon={<Send size={16}/>}>Issue Purchase Order</Button>}
               <Button variant="secondary" onClick={() => setViewTarget(null)}>Close</Button>
            </div>
         </div>
      }>
         {viewTarget && (
            <div className="space-y-8 bg-white p-4" id="printable-po">
               {/* Print Header */}
               <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6">
                  <div>
                     <h1 className="text-3xl font-black text-slate-900 tracking-tight">PURCHASE ORDER</h1>
                     <p className="text-slate-500 mt-1 font-mono">{viewTarget.po_number}</p>
                     {isDelayed(viewTarget) && <Badge variant="error" className="mt-2">DELAYED</Badge>}
                  </div>
                  <div className="text-right text-sm">
                     <p className="font-bold text-slate-800">CNCFORGE MFG LTD.</p>
                     <p className="text-slate-500">123 Industrial Phase, Pune</p>
                     <p className="text-slate-500">GSTIN: 27AAAAA0000A1Z5</p>
                  </div>
               </div>

               {/* Parties Info */}
               <div className="grid grid-cols-2 gap-8 text-sm">
                  <div>
                     <h3 className="font-bold text-slate-400 uppercase text-xs tracking-wider mb-2">Vendor (Supplier)</h3>
                     <p className="font-bold text-slate-800 text-base">{viewTarget.supplier?.name}</p>
                     <p className="text-slate-600">{viewTarget.supplier?.address || 'Address not provided'}</p>
                     <p className="text-slate-600 mt-2"><strong>GSTIN:</strong> {viewTarget.supplier?.gst_number || 'N/A'}</p>
                  </div>
                  <div>
                     <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div><span className="block text-xs text-slate-500 uppercase tracking-wider mb-1">PO Date</span><span className="font-medium text-slate-900">{viewTarget.order_date}</span></div>
                        <div><span className="block text-xs text-slate-500 uppercase tracking-wider mb-1">Expected By</span><span className="font-medium text-slate-900">{viewTarget.expected_date || 'TBD'}</span></div>
                        <div><span className="block text-xs text-slate-500 uppercase tracking-wider mb-1">Payment Terms</span><span className="font-medium text-slate-900">{viewTarget.payment_terms || 'N/A'}</span></div>
                        <div><span className="block text-xs text-slate-500 uppercase tracking-wider mb-1">Status</span><span className="font-medium text-slate-900">{viewTarget.status}</span></div>
                     </div>
                  </div>
               </div>

               {/* Addresses */}
               <div className="grid grid-cols-2 gap-8 text-sm pt-4 border-t border-slate-100">
                  <div>
                     <h3 className="font-bold text-slate-400 uppercase text-xs tracking-wider mb-2">Delivery Address</h3>
                     <p className="text-slate-700 whitespace-pre-wrap">{viewTarget.delivery_address}</p>
                  </div>
                  <div>
                     <h3 className="font-bold text-slate-400 uppercase text-xs tracking-wider mb-2">Billing Address</h3>
                     <p className="text-slate-700 whitespace-pre-wrap">{viewTarget.billing_address}</p>
                  </div>
               </div>

               {/* Items Table */}
               <div className="pt-4">
                  <table className="w-full text-left text-sm">
                     <thead>
                        <tr className="border-b-2 border-slate-800 text-slate-800">
                           <th className="py-2 font-bold w-12">#</th>
                           <th className="py-2 font-bold">Item & Description</th>
                           <th className="py-2 font-bold text-center">Ordered Qty</th>
                           <th className="py-2 font-bold text-center">Pending Qty</th>
                           <th className="py-2 font-bold text-right">Unit Price</th>
                           <th className="py-2 font-bold text-right">Tax %</th>
                           <th className="py-2 font-bold text-right">Total Amount</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-200">
                        {viewTarget.items?.map((item: any, idx: number) => (
                           <tr key={idx}>
                              <td className="py-3 text-slate-500">{idx + 1}</td>
                              <td className="py-3">
                                 <p className="font-bold text-slate-800">{item.material_name}</p>
                                 <p className="text-xs text-slate-500 font-mono">{item.material_code}</p>
                              </td>
                              <td className="py-3 text-center font-medium">{item.quantity} {item.unit}</td>
                              <td className="py-3 text-center text-slate-500">{item.quantity} {item.unit} <span className="text-[10px] block">(0 Received)</span></td>
                              <td className="py-3 text-right font-mono">,1{Number(item.unit_price).toLocaleString()}</td>
                              <td className="py-3 text-right text-slate-500">{item.tax_amount}%</td>
                              <td className="py-3 text-right font-mono font-bold text-slate-900">,1{Number(item.total_amount).toLocaleString()}</td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>

               {/* Totals */}
               <div className="flex justify-end pt-4">
                  <div className="w-72">
                     <div className="flex justify-between py-1 text-sm text-slate-600"><span>Subtotal</span><span className="font-mono text-slate-900">,1{Number(viewTarget.subtotal).toLocaleString()}</span></div>
                     <div className="flex justify-between py-1 text-sm text-slate-600 border-b border-slate-200 mb-2 pb-2"><span>Total Tax</span><span className="font-mono text-slate-900">,1{Number(viewTarget.tax).toLocaleString()}</span></div>
                     <div className="flex justify-between py-2 text-lg font-black text-slate-900"><span>Grand Total</span><span className="font-mono">,1{Number(viewTarget.grand_total).toLocaleString()}</span></div>
                  </div>
               </div>
               
               {/* Notes */}
               {viewTarget.notes && (
                  <div className="pt-8 border-t border-slate-100 text-sm">
                     <h3 className="font-bold text-slate-400 uppercase text-xs tracking-wider mb-2">Terms & Notes</h3>
                     <p className="text-slate-700 whitespace-pre-wrap">{viewTarget.notes}</p>
                  </div>
               )}
               
               <div className="mt-16 pt-8 border-t border-slate-100 flex justify-between text-xs text-slate-400 uppercase tracking-widest font-bold">
                  <div>Authorized Signatory</div>
                  <div>Supplier Acceptance</div>
               </div>
            </div>
         )}
      </Modal>
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
