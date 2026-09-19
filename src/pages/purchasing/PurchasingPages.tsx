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
