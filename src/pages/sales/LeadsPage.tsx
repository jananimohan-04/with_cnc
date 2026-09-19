import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Eye, Edit, Trash2, ArrowRightCircle, XCircle, FileText, RefreshCcw } from 'lucide-react';
import { PageHeader, DateSelector, FilterButton, ExportButton } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge, Button, StatCard, statusToVariant } from '@/components/ui/Card';
import { Modal, ConfirmDialog, FormField, inputClass } from '@/components/ui/Modal';

export function LeadsPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewTarget, setViewTarget] = useState<any | null>(null);
  const [viewData, setViewData] = useState({ enquiries: 0, quotes: 0, orders: 0 });
  const [viewHistory, setViewHistory] = useState<any[]>([]);

  useEffect(() => {
    if (viewTarget) {
      const fetchHistory = async () => {
        const { data: enqs } = await supabase.from('cnc_enquiries').select('*').eq('customer', viewTarget.company).order('created_at', { ascending: false });
        
        if (enqs) {
           setViewHistory(enqs.map((d: any) => ({
              id: d.id,
              leadNo: d.lead_no || `LD-${d.enquiry_no}`,
              company: d.customer,
              contactPerson: d.contact_person || '',
              phone: d.phone || '',
              email: d.email || '',
              city: d.city || '',
              gst: d.gst || '',
              enquiringFor: d.enquiring_for || '',
              partName: d.part_name,
              partNo: d.part_no,
              quantity: d.quantity,
              expectedDate: d.expected_date,
              status: d.status || 'New',
              estimatedValue: Number(d.estimated_value),
              source: d.source || 'Direct',
              notes: d.notes || ''
           })));
        }

        const [q, o] = await Promise.all([
           supabase.from('cnc_quotations').select('*', { count: 'exact', head: true }).eq('customer', viewTarget.company),
           supabase.from('cnc_sales_orders').select('*', { count: 'exact', head: true }).eq('customer', viewTarget.company)
        ]);
        setViewData({ enquiries: enqs?.length || 0, quotes: q.count || 0, orders: o.count || 0 });
      };
      fetchHistory();
    }
  }, [viewTarget]);
  const [quotationTarget, setQuotationTarget] = useState<any | null>(null);
  const [quoteForm, setQuoteForm] = useState<any>({
      quoteNo: '', customer: '', leadNo: '', quoteDate: '', validTill: '', salesperson: 'Admin',
      partName: '', partNumber: '', description: '', quantity: '', unitPrice: '', discount: '0', gst: '18',
      paymentTerms: '', deliveryTerms: '', remarks: ''
  });
  const [leadsData, setLeadsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);

  const resetForm = () => ({
    leadNo: `PROJ-${Math.floor(1000 + Math.random() * 9000)}`,
    customer: '', contacts: [{ person: '', phone: '', email: '' }], city: '', gst: '', enquiringFor: '', 
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
        const groupedMap = new Map();
        data.forEach((d: any) => {
          if (!groupedMap.has(d.customer)) {
            groupedMap.set(d.customer, {
              id: d.id,
              leadNo: d.lead_no || `LD-${d.enquiry_no}`,
              company: d.customer,
              contactPerson: d.contact_person || '',
              phone: d.phone || '',
              email: d.email || '',
              city: d.city || '',
              gst: d.gst || '',
              enquiringFor: d.enquiring_for || '',
              partName: d.part_name,
              partNo: d.part_no,
              quantity: d.quantity,
              expectedDate: d.expected_date,
              status: d.status || 'New',
              estimatedValue: Number(d.estimated_value),
              source: d.source || 'Direct'
            });
          }
        });
        setLeadsData(Array.from(groupedMap.values()));
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
      contacts: r.contactPerson ? r.contactPerson.split(' | ').map((p: string, i: number) => ({
        person: p,
        phone: (r.phone || '').split(' | ')[i] || '',
        email: (r.email || '').split(' | ')[i] || ''
      })) : [{ person: '', phone: '', email: '' }],
      city: r.city || '',
      gst: r.gst || '',
      enquiringFor: r.enquiring_for || '',
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
      contact_person: formData.contacts.map((c: any) => c.person).join(' | '),
      phone: formData.contacts.map((c: any) => c.phone).join(' | '),
      email: formData.contacts.map((c: any) => c.email).join(' | '),
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

  const handleCreateQuotation = async () => {
    if (!quotationTarget) return;
    setLoading(true);

    const q = Number(quoteForm.quantity) || 0; const p = Number(quoteForm.unitPrice) || 0;
    const d = Number(quoteForm.discount) || 0; const g = Number(quoteForm.gst) || 0;
    const total = q * p * (1 - d / 100) * (1 + g / 100);
    
    const { error: quoteErr } = await supabase.from('cnc_quotations').insert([{
      id: crypto.randomUUID(), quote_no: quoteForm.quoteNo, customer: quoteForm.customer, part_name: quoteForm.partName,
      contact_person: quotationTarget.contactPerson, phone: quotationTarget.phone, email: quotationTarget.email,
      part_number: quoteForm.partNumber || 'N/A', description: quoteForm.description, unit_price: p,
      quantity: q, total_value: total, valid_till: quoteForm.validTill, status: 'Sent',
      salesperson: quoteForm.salesperson, discount_percent: d, gst_percent: g,
      payment_terms: quoteForm.paymentTerms, delivery_terms: quoteForm.deliveryTerms, remarks: quoteForm.remarks, lead_id: quotationTarget.id
    }]);

    if (!quoteErr) {
      // Update lead
      await supabase.from('cnc_enquiries').update({
        status: 'Quoted',
        pipeline_stage: 'Quotation'
      }).eq('id', quotationTarget.id);
      setQuotationTarget(null);
      await fetchLeads();
    } else {
      alert("Error: " + quoteErr.message);
      setLoading(false);
    }
  };



  const handleQuickStatusChange = async (id: string, newStatus: string) => {
    await supabase.from('cnc_enquiries').update({ status: newStatus }).eq('id', id);
    setViewHistory(prev => prev.map(item => item.id === id ? { ...item, status: newStatus } : item));
    fetchLeads();
  };

  const handleRevertLost = async (id: string) => {
    setLoading(true);
    await supabase.from('cnc_enquiries').update({ status: 'New', pipeline_stage: 'Enquiry' }).eq('id', id);
    await fetchLeads();
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
              <button onClick={() => {
                const qNo = `QT-2026-${Math.floor(1000 + Math.random() * 9000)}`;
                setQuoteForm({
                  quoteNo: qNo, customer: r.company, leadNo: r.leadNo, quoteDate: new Date().toISOString().split('T')[0], validTill: r.expectedDate || '', salesperson: 'Admin',
                  partName: r.partName, partNumber: r.partNo || '', description: '', quantity: r.quantity?.toString() || '0', unitPrice: '', discount: '0', gst: '18',
                  paymentTerms: '', deliveryTerms: '', remarks: ''
                });
                setQuotationTarget(r);
              }} title="Create Quotation" className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"><ArrowRightCircle size={15} /></button>
              <button onClick={() => handleMarkLost(r.id)} title="Mark as Lost" className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><XCircle size={15} /></button>
            </>
          )}
          {r.status === 'Lost' && (
            <button onClick={() => handleRevertLost(r.id)} title="Revert to New" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><RefreshCcw size={15} /></button>
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
          <div className="col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-500 uppercase">Contact Persons</label>
              <button onClick={() => setFormData({...formData, contacts: [...formData.contacts, { person: '', phone: '', email: '' }]})} className="text-xs text-blue-600 font-bold flex items-center gap-1">+ Add Contact</button>
            </div>
            {formData.contacts.map((c: any, i: number) => (
              <div key={i} className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <input placeholder="Name" className={inputClass} value={c.person} onChange={e => { const nc = [...formData.contacts]; nc[i].person = e.target.value; setFormData({...formData, contacts: nc}); }} />
                <input placeholder="Phone" className={inputClass} value={c.phone} onChange={e => { const nc = [...formData.contacts]; nc[i].phone = e.target.value; setFormData({...formData, contacts: nc}); }} />
                <input placeholder="Email" className={inputClass} value={c.email} onChange={e => { const nc = [...formData.contacts]; nc[i].email = e.target.value; setFormData({...formData, contacts: nc}); }} />
              </div>
            ))}
          </div>
          <FormField label="City"><input className={inputClass} value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} /></FormField>
          <FormField label="GST No."><input className={inputClass} value={formData.gst} onChange={e => setFormData({...formData, gst: e.target.value})} /></FormField>
          <FormField label="Product / Part Required" required><input className={inputClass} value={formData.partName} onChange={e => setFormData({...formData, partName: e.target.value})} /></FormField>
          <FormField label="Quantity"><input type="number" className={inputClass} value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} /></FormField>
          <FormField label="Source">
            <select className={inputClass} value={formData.source} onChange={e => setFormData({...formData, source: e.target.value})}>
              <option>Direct</option><option>Website</option><option>Referral</option><option>Phone</option><option>Email</option><option>Other</option>
            </select>
          </FormField>

        </div>
      </Modal>

      <Modal open={!!quotationTarget} onClose={() => setQuotationTarget(null)} title="CREATE QUOTATION" size="lg" footer={<><Button variant="secondary" onClick={() => setQuotationTarget(null)}>Cancel</Button><Button onClick={handleCreateQuotation}>Create Quotation</Button></>}>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-4 pb-4 border-b border-slate-100">
              <FormField label="Quotation No." required><input className={inputClass} value={quoteForm.quoteNo} disabled /></FormField>
              <FormField label="Customer" required><input className={inputClass} value={quoteForm.customer} disabled /></FormField>
              <FormField label="Enquiry / Lead No." required><input className={inputClass} value={quoteForm.leadNo} disabled /></FormField>
              <FormField label="Quotation Date" required><input type="date" className={inputClass} value={quoteForm.quoteDate} onChange={e=>setQuoteForm({...quoteForm, quoteDate: e.target.value})} /></FormField>
              <FormField label="Valid Till" required><input type="date" className={inputClass} value={quoteForm.validTill} onChange={e=>setQuoteForm({...quoteForm, validTill: e.target.value})} /></FormField>
              <FormField label="Salesperson"><input className={inputClass} value={quoteForm.salesperson} onChange={e=>setQuoteForm({...quoteForm, salesperson: e.target.value})} /></FormField>
            </div>
            
            <h4 className="font-semibold text-sm text-slate-800">Item Details</h4>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Part / Product Name" required><input className={inputClass} value={quoteForm.partName} onChange={e=>setQuoteForm({...quoteForm, partName: e.target.value})} /></FormField>
              <FormField label="Part Number"><input className={inputClass} value={quoteForm.partNumber} onChange={e=>setQuoteForm({...quoteForm, partNumber: e.target.value})} /></FormField>
              <FormField label="Description"><input className={inputClass} value={quoteForm.description} onChange={e=>setQuoteForm({...quoteForm, description: e.target.value})} /></FormField>
              <FormField label="Quantity" required><input type="number" className={inputClass} value={quoteForm.quantity} onChange={e=>setQuoteForm({...quoteForm, quantity: e.target.value})} /></FormField>
              <FormField label="Unit Price" required><input type="number" className={inputClass} value={quoteForm.unitPrice} onChange={e=>setQuoteForm({...quoteForm, unitPrice: e.target.value})} /></FormField>
              <FormField label="Discount %"><input type="number" className={inputClass} value={quoteForm.discount} onChange={e=>setQuoteForm({...quoteForm, discount: e.target.value})} /></FormField>
              <FormField label="GST %"><input type="number" className={inputClass} value={quoteForm.gst} onChange={e=>setQuoteForm({...quoteForm, gst: e.target.value})} /></FormField>
              <FormField label="Total Amount (Rs.)"><input className={`${inputClass} bg-slate-100 font-bold`} value={(() => {
                const q = Number(quoteForm.quantity) || 0; const p = Number(quoteForm.unitPrice) || 0;
                const d = Number(quoteForm.discount) || 0; const g = Number(quoteForm.gst) || 0;
                return (q * p * (1 - d / 100) * (1 + g / 100)).toFixed(2);
              })()} disabled /></FormField>
            </div>
            <h4 className="font-semibold text-sm text-slate-800 border-t border-slate-100 pt-4">Additional Details</h4>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Payment Terms"><input className={inputClass} value={quoteForm.paymentTerms} onChange={e=>setQuoteForm({...quoteForm, paymentTerms: e.target.value})} /></FormField>
              <FormField label="Delivery Terms"><input className={inputClass} value={quoteForm.deliveryTerms} onChange={e=>setQuoteForm({...quoteForm, deliveryTerms: e.target.value})} /></FormField>
              <div className="col-span-2"><FormField label="Notes / Remarks"><textarea className={inputClass} rows={2} value={quoteForm.remarks} onChange={e=>setQuoteForm({...quoteForm, remarks: e.target.value})}></textarea></FormField></div>
            </div>
          </div>
      </Modal>
      
      <Modal open={!!viewTarget} onClose={() => setViewTarget(null)} title="Lead / Company History" size="lg" footer={<Button onClick={() => setViewTarget(null)}>Close</Button>}>
        {viewTarget && (
          <div className="flex flex-col gap-6">
            <div>
              <h4 className="font-bold text-slate-800 text-xl mb-1">{viewTarget.company}</h4>
              <div className="flex gap-4 text-sm text-slate-600">
                <span className="flex items-center gap-1"><FileText size={14} /> {viewTarget.leadNo}</span>
                <span>{viewTarget.city}</span>
                <span>GST: {viewTarget.gst || 'N/A'}</span>
              </div>
            </div>

            <div>
              <h5 className="font-semibold text-sm text-slate-700 mb-3 uppercase tracking-wider">Company History</h5>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-blue-700">{viewData.enquiries}</span>
                  <span className="text-xs text-blue-600 font-medium">Total Enquiries</span>
                </div>
                <div className="bg-purple-50 border border-purple-100 p-3 rounded-lg flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-purple-700">{viewData.quotes}</span>
                  <span className="text-xs text-purple-600 font-medium">Quotations</span>
                </div>
                <div className="bg-green-50 border border-green-100 p-3 rounded-lg flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-green-700">{viewData.orders}</span>
                  <span className="text-xs text-green-600 font-medium">Sales Orders</span>
                </div>
              </div>
            </div>

            <div className="mt-2">
               <h5 className="font-semibold text-sm text-slate-700 mb-3 uppercase tracking-wider">All Enquiries</h5>
               <div className="flex flex-col gap-4 max-h-[50vh] overflow-y-auto pr-2 pb-2">
                 {viewHistory.map(h => (
                    <div key={h.id} className="flex flex-col p-4 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-slate-300 transition-colors">
                      <div className="flex justify-between items-start mb-3 border-b border-slate-100 pb-3">
                        <div>
                          <h6 className="font-bold text-slate-800 text-base">{h.leadNo} - {h.partName}</h6>
                          <span className="text-xs text-slate-500 font-medium">Source: {h.source} | Expected: {h.expectedDate || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <select
                            value={h.status}
                            onChange={(e) => handleQuickStatusChange(h.id, e.target.value)}
                            className={`text-xs font-semibold pl-3 pr-7 py-1 rounded-full border outline-none cursor-pointer
                              ${h.status === 'Lost' ? 'bg-red-50 text-red-700 border-red-200' : 
                                h.status === 'Quoted' ? 'bg-purple-50 text-purple-700 border-purple-200' : 
                                h.status === 'Converted' ? 'bg-green-50 text-green-700 border-green-200' : 
                                'bg-slate-50 text-slate-700 border-slate-200'}`}
                          >
                            <option value="New">New</option>
                            <option value="Quoted">Quoted</option>
                            <option value="Converted">Converted</option>
                            <option value="Lost">Lost</option>
                          </select>
                          <button onClick={() => { setViewTarget(null); handleEditClick(h); }} title="Edit Enquiry" className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 hover:text-blue-700 rounded transition-colors"><Edit size={16}/></button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-1">
                        <div>
                          <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Part Number</p>
                          <p className="font-medium text-slate-700 truncate">{h.partNo || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Quantity</p>
                          <p className="font-medium text-slate-700">{h.quantity}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Contact Person</p>
                          <p className="font-medium text-slate-700 truncate">{h.contactPerson ? h.contactPerson.split(' | ')[0] : 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Phone</p>
                          <p className="font-medium text-slate-700 truncate">{h.phone ? h.phone.split(' | ')[0] : 'N/A'}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Enquiring For</p>
                          <p className="font-medium text-slate-700 line-clamp-2">{h.enquiringFor || 'N/A'}</p>
                        </div>
                        {h.estimatedValue > 0 && (
                          <div className="col-span-2">
                            <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Est. Value</p>
                            <p className="font-medium text-slate-700">₹{h.estimatedValue.toLocaleString()}</p>
                          </div>
                        )}
                      </div>
                    </div>
                 ))}
               </div>
            </div>

          </div>
        )}
      </Modal>
    </div>
  );
}
