import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Eye, Edit, Trash2, ArrowRightCircle, XCircle, FileText } from 'lucide-react';
import { PageHeader, DateSelector, FilterButton, ExportButton } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge, Button, StatCard, statusToVariant } from '@/components/ui/Card';
import { Modal, ConfirmDialog, FormField, inputClass } from '@/components/ui/Modal';

export function LeadsPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewTarget, setViewTarget] = useState<any | null>(null);
  const [convertTarget, setConvertTarget] = useState<any | null>(null);
  const [leadsData, setLeadsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);

  const resetForm = () => ({
    leadNo: `PROJ-${Math.floor(1000 + Math.random() * 9000)}`,
    customer: '', contactPerson: '', phone: '', email: '', city: '', industry: 'Aerospace', 
    partName: '', partNo: '', quantity: '', estimatedValue: '', expectedDate: '', source: 'Direct', status: 'New', notes: ''
  });
  const [formData, setFormData] = useState(resetForm());

  useEffect(() => {
    fetchLeads();
  }, []);

  async function fetchLeads() {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('cnc_enquiries').select('*').order('created_at', { ascending: false });
      if (error) {
        console.error('Error fetching leads:', error);
        setDbError(true);
      } else if (data) {
        setDbError(false);
        setLeadsData(data.map((d: any) => ({
          id: d.id,
          leadNo: d.lead_no || `LD-${d.enquiry_no}`,
          company: d.customer,
          contactPerson: d.contact_person || '',
          phone: d.phone || '',
          email: d.email || '',
          city: d.city || '',
          industry: d.industry || 'Aerospace',
          partName: d.part_name,
          partNo: d.part_no,
          quantity: d.quantity,
          expectedDate: d.expected_date,
          status: d.status || 'New',
          estimatedValue: Number(d.estimated_value),
          source: d.source || 'Direct',
        })));
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      setDbError(true);
    } finally {
      setLoading(false);
    }
  }

  const handleEditClick = (r: any) => {
    setFormData({
      leadNo: r.leadNo,
      customer: r.company,
      contactPerson: r.contactPerson,
      phone: r.phone,
      email: r.email,
      city: r.city,
      industry: r.industry,
      partName: r.partName,
      partNo: r.partNo || '',
      quantity: r.quantity?.toString() || '',
      estimatedValue: r.estimatedValue?.toString() || '',
      expectedDate: r.expectedDate || '',
      source: r.source,
      status: r.status,
      notes: r.notes || ''
    });
    setEditId(r.id);
    setShowAdd(true);
  };

  const handleSave = async () => {
    if (!formData.customer || !formData.partName) return;
    
    const entryData = {
      lead_no: formData.leadNo,
      customer: formData.customer,
      contact_person: formData.contactPerson,
      phone: formData.phone,
      email: formData.email,
      city: formData.city,
        gst: formData.gst,
        enquiring_for: formData.enquiringFor,
      part_name: formData.partName,
      part_no: formData.partNo,
      quantity: Number(formData.quantity) || 0,
      estimated_value: Number(formData.estimatedValue) || 0,
      expected_date: formData.expectedDate || null,
      source: formData.source,
      status: formData.status
    };

    setLoading(true);
    if (editId) {
      await supabase.from('cnc_enquiries').update(entryData).eq('id', editId);
    } else {
      await supabase.from('cnc_enquiries').insert([entryData]);
    }
    await fetchLeads();
    setShowAdd(false);
    setEditId(null);
  };

  const handleConvert = async () => {
    if (!convertTarget) return;
    setLoading(true);
    // Create customer
    const { data: custData, error: custErr } = await supabase.from('cnc_customers').insert([{
      name: convertTarget.company,
      contact: convertTarget.contactPerson,
      phone: convertTarget.phone,
      email: convertTarget.email,
      city: convertTarget.city,
      industry: convertTarget.industry,
      lead_id: convertTarget.id,
      status: 'Active',
      total_orders: 0,
      total_value: 0,
      outstanding: 0,
      rating: 5
    }]).select();

    if (!custErr && custData) {
      // Update lead
      await supabase.from('cnc_enquiries').update({
        status: 'Converted',
        converted_customer_id: custData[0].id,
        converted_at: new Date().toISOString(),
        pipeline_stage: 'Qualified' // enters pipeline
      }).eq('id', convertTarget.id);
    }
    await fetchLeads();
    setConvertTarget(null);
    setLoading(false);
  };

  const handleMarkLost = async (id: string) => {
    setLoading(true);
    await supabase.from('cnc_enquiries').update({ status: 'Lost', pipeline_stage: null }).eq('id', id);
    await fetchLeads();
  };

  const columns: Column<any>[] = [
    { key: 'leadNo', label: 'Project Name', sortable: true, render: (r) => <span className="font-mono text-xs text-slate-500">{r.leadNo}</span> },
    { key: 'company', label: 'Company', sortable: true, render: (r) => <span className="font-semibold text-slate-800">{r.company}</span> },
    { key: 'contactPerson', label: 'Contact', render: (r) => <div><p className="text-sm">{r.contactPerson}</p><p className="text-xs text-slate-500">{r.phone}</p></div> },
    { key: 'partName', label: 'Requirement', render: (r) => <div><p className="text-sm font-medium text-slate-700">{r.partName}</p><p className="text-xs text-slate-500">Qty: {r.quantity}</p></div> },
    { key: 'source', label: 'Source', render: (r) => <Badge variant="neutral">{r.source}</Badge> },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge variant={r.status === 'Converted' ? 'success' : r.status === 'Lost' ? 'error' : 'warning'} dot>{r.status}</Badge> },
    {
      key: 'actions', label: 'Actions', align: 'right', render: (r) => (
        <div className="flex items-center justify-end gap-1">
          {r.status !== 'Converted' && r.status !== 'Lost' && (
            <>
              <button onClick={() => setConvertTarget(r)} title="Convert to Customer" className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"><ArrowRightCircle size={15} /></button>
              <button onClick={() => handleMarkLost(r.id)} title="Mark as Lost" className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><XCircle size={15} /></button>
            </>
          )}
          <button onClick={() => setViewTarget(r)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Eye size={15} /></button>
          <button onClick={() => handleEditClick(r)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit size={15} /></button>
        </div>
      )
    },
  ];

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="All Leads" description="Manage all incoming enquiries and convert qualified leads to customers" actions={<div className="flex items-center gap-2">{dbError && <Badge variant="error">DB Disconnected</Badge>}{loading && <Badge variant="neutral">Syncing...</Badge>}<DateSelector /></div>} />
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Leads" value={leadsData.length.toString()} icon={<FileText size={20} />} accent="brand" />
        <StatCard label="New" value={leadsData.filter(l => l.status === 'New').length.toString()} icon={<FileText size={20} />} accent="warning" />
        <StatCard label="Converted" value={leadsData.filter(l => l.status === 'Converted').length.toString()} icon={<FileText size={20} />} accent="success" />
        <StatCard label="Lost" value={leadsData.filter(l => l.status === 'Lost').length.toString()} icon={<FileText size={20} />} accent="error" />
      </div>

      <DataTable data={leadsData} columns={columns} searchKeys={['company', 'partName', 'leadNo']} onAdd={() => { setEditId(null); setFormData(resetForm()); setShowAdd(true); }} addLabel="New Lead" />

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={editId ? "Edit Lead" : "Add New Lead"} size="lg" footer={<><Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button><Button onClick={handleSave}>Save Lead</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Project Name" required><input className={inputClass} value={formData.leadNo} onChange={e => setFormData({...formData, leadNo: e.target.value})} disabled={!!editId} /></FormField>
          <FormField label="Company Name" required><input className={inputClass} value={formData.customer} onChange={e => setFormData({...formData, customer: e.target.value})} /></FormField>
          <FormField label="Contact Person" required><input className={inputClass} value={formData.contactPerson} onChange={e => setFormData({...formData, contactPerson: e.target.value})} /></FormField>
          <FormField label="Phone"><input className={inputClass} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} /></FormField>
          <FormField label="Email"><input type="email" className={inputClass} value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} /></FormField>
          <FormField label="City"><input className={inputClass} value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} /></FormField>
          <FormField label="GST No."><input className={inputClass} value={formData.gst} onChange={e => setFormData({...formData, gst: e.target.value})} /></FormField>
          <FormField label="Enquiring For"><input className={inputClass} value={formData.enquiringFor} onChange={e => setFormData({...formData, enquiringFor: e.target.value})} /></FormField>
          <FormField label="Product / Part Required" required><input className={inputClass} value={formData.partName} onChange={e => setFormData({...formData, partName: e.target.value})} /></FormField>
          <FormField label="Quantity"><input type="number" className={inputClass} value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} /></FormField>
          <FormField label="Source">
            <select className={inputClass} value={formData.source} onChange={e => setFormData({...formData, source: e.target.value})}>
              <option>Direct</option><option>Website</option><option>Referral</option><option>Phone</option><option>Email</option><option>Other</option>
            </select>
          </FormField>
          <FormField label="Status">
            <select className={inputClass} value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
              <option>New</option><option>Contacted</option><option>Qualified</option><option>Converted</option><option>Lost</option>
            </select>
          </FormField>
        </div>
      </Modal>

      <ConfirmDialog 
        open={!!convertTarget} 
        onClose={() => setConvertTarget(null)} 
        onConfirm={handleConvert} 
        title="Convert to Customer?" 
        message={`This will create a customer record for ${convertTarget?.company} and move this opportunity to the Sales Pipeline.`} 
        confirmLabel="Convert to Customer" 
      />
    </div>
  );
}
