import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Eye, Edit, ArrowRightCircle, XCircle, FileText, RefreshCcw, UploadCloud, Plus, Trash2 } from 'lucide-react';
import { PageHeader, DateSelector } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge, Button, StatCard, statusToVariant } from '@/components/ui/Card';
import { Modal, FormField, inputClass } from '@/components/ui/Modal';
import { useAuth } from '@/contexts/AuthContext';
import { generateUniqueProjectNo } from '@/lib/projectNumber';
import { CustomerAutocomplete } from '@/components/ui/CustomerAutocomplete';
import { formatLeadProductDisplay } from './SalesPipelinePage';

async function uploadLeadProductFile(companyId: string | undefined | null, file: File) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'attachment';
  const cId = companyId || 'general';
  const path = `${cId}/enquiries/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from('inventory-images').upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) {
    console.warn(`Storage upload warning for ${file.name}:`, error);
  }
  return path;
}

export function LeadsPage() {
  const { profile, company } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewTarget, setViewTarget] = useState<any | null>(null);
  const [viewData, setViewData] = useState({ enquiries: 0, quotes: 0, orders: 0 });
  const [viewHistory, setViewHistory] = useState<any[]>([]);
  const [purchaseHistory, setPurchaseHistory] = useState<any[]>([]);

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

        const [q, o, inv] = await Promise.all([
           supabase.from('cnc_quotations').select('*', { count: 'exact', head: true }).eq('customer', viewTarget.company),
           supabase.from('cnc_sales_orders').select('*', { count: 'exact', head: true }).eq('customer', viewTarget.company),
           supabase.from('cnc_invoices').select('*').eq('customer_name', viewTarget.company).not('pipeline_completed_at', 'is', null).order('created_at', { ascending: false })
        ]);
        setViewData({ enquiries: enqs?.length || 0, quotes: q.count || 0, orders: o.count || 0 });
        
        // Fetch purchase history from enquiry remarks (stored as JSON by handleCompleteInvoice)
        let purchaseHist: any[] = [];
        if (inv.data && inv.data.length > 0) {
          purchaseHist = inv.data.map((i: any) => ({
            invoice_no: i.invoice_no, part_name: i.part_name || i.item || '-',
            quantity: i.quantity || 0, total_value: i.amount || 0,
            date: i.invoice_date || (i.created_at ? i.created_at.split('T')[0] : '')
          }));
        }
        // Also check enquiry remarks for stored history
        if (enqs) {
          enqs.forEach((e: any) => {
            try {
              if (e.remarks) {
                const parsed = JSON.parse(e.remarks);
                if (Array.isArray(parsed)) {
                  parsed.forEach((h: any) => {
                    if (h.invoice_no) purchaseHist.push({
                      invoice_no: h.invoice_no, part_name: h.part_name || '-',
                      quantity: h.quantity || 0, total_value: h.total_value || 0,
                      date: h.completed_at ? h.completed_at.split('T')[0] : ''
                    });
                  });
                }
              }
            } catch { /* not JSON */ }
          });
        }
        // Deduplicate by invoice_no
        const seen = new Set();
        setPurchaseHistory(purchaseHist.filter(h => { if (seen.has(h.invoice_no)) return false; seen.add(h.invoice_no); return true; }));
      };
      fetchHistory();
    }
  }, [viewTarget]);
  const [quotationTarget, setQuotationTarget] = useState<any | null>(null);
  const [quoteSelectTarget, setQuoteSelectTarget] = useState<any[] | null>(null);
  const [lostSelectTarget, setLostSelectTarget] = useState<any[] | null>(null);
  const [revertSelectTarget, setRevertSelectTarget] = useState<any[] | null>(null);

  const openQuoteModal = (enq: any) => {
    const qNo = `QT-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    setQuoteForm({
        quoteNo: qNo, customer: enq.customer || enq.company, leadNo: enq.leadNo || enq.lead_no || `LD-${enq.enquiry_no}`, quoteDate: new Date().toISOString().split('T')[0], validTill: enq.expectedDate || enq.expected_date || '', salesperson: profile?.full_name || '',
        partName: enq.partName || enq.part_name, partNumber: enq.partNo || enq.part_no || '', description: '', quantity: (enq.quantity)?.toString() || '0', unitPrice: '', discount: '0', unitDiscount: '0', gst: '18',
        paymentTerms: '', deliveryTerms: '', remarks: ''
    });
    setQuotationTarget({ id: enq.id, contactPerson: enq.contactPerson || enq.contact_person, phone: enq.phone, email: enq.email, company: enq.customer || enq.company });
    setQuoteSelectTarget(null);
  };

  const [quoteForm, setQuoteForm] = useState<any>({
      quoteNo: '', customer: '', leadNo: '', quoteDate: '', validTill: '', salesperson: '',
      partName: '', partNumber: '', description: '', quantity: '', unitPrice: '', discount: '0', unitDiscount: '0', gst: '18',
      paymentTerms: '', deliveryTerms: '', remarks: ''
  });
  const [leadsData, setLeadsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);

  const resetForm = (leads = leadsData) => ({
    leadNo: generateUniqueProjectNo(leads),
    customer: '', contacts: [{ person: '', phone: '', email: '' }], city: '', gst: '', enquiringFor: '', 
    items: [{ productName: '', quantity: '', files: [] as File[], filePaths: [] as string[] }],
    partName: '', partNo: '', quantity: '', estimatedValue: '', expectedDate: '', source: 'Direct', status: 'New', notes: ''
  });
  const [formData, setFormData] = useState(resetForm());
  const [customerList, setCustomerList] = useState<any[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  useEffect(() => {
    fetchLeads();
    fetchCustomers();
  }, []);

  async function fetchCustomers() {
    const { data } = await supabase.from('cnc_customers').select('*');
    if (data) setCustomerList(data);
  }

  const allKnownCompanies = useMemo(() => {
    const map = new Map<string, { company: string; contact_person?: string; phone?: string; email?: string; city?: string; gst?: string }>();
    (leadsData || []).forEach((l: any) => {
      const name = (l.company || l.customer)?.trim();
      if (!name) return;
      const key = name.toLowerCase();
      const existing = map.get(key);
      map.set(key, {
        company: name,
        contact_person: l.contactPerson || l.contact_person || existing?.contact_person || '',
        phone: l.phone || existing?.phone || '',
        email: l.email || existing?.email || '',
        city: l.city || existing?.city || '',
        gst: l.gst || existing?.gst || ''
      });
    });
    (customerList || []).forEach((c: any) => {
      const name = c.name?.trim();
      if (!name) return;
      const key = name.toLowerCase();
      const existing = map.get(key);
      map.set(key, {
        company: name,
        contact_person: existing?.contact_person || c.contact || '',
        phone: existing?.phone || c.phone || '',
        email: existing?.email || c.email || '',
        city: existing?.city || c.city || '',
        gst: existing?.gst || c.gst || c.gstin || c.gst_number || ''
      });
    });
    return Array.from(map.values()).sort((a, b) => a.company.localeCompare(b.company));
  }, [customerList, leadsData]);

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
          const st = d.status || 'New';
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
              status: st,
              estimatedValue: Number(d.estimated_value),
              source: d.source || 'Direct',
              statusSummary: { [st]: 1 },
              allEnquiries: [d]
            });
          } else {
            const existing = groupedMap.get(d.customer);
            existing.statusSummary[st] = (existing.statusSummary[st] || 0) + 1;
            existing.allEnquiries.push(d);
          }
        });
        const leadsList = Array.from(groupedMap.values());
        setLeadsData(leadsList);
        setFormData(prev => {
          if (!prev.leadNo || prev.leadNo.startsWith('PROJ-')) {
            return { ...prev, leadNo: generateUniqueProjectNo(data) };
          }
          return prev;
        });
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      setDbError(true);
    } finally {
      setLoading(false);
    }
  }

  const openProductFile = async (path: string) => {
    if (path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('http')) {
      window.open(path, '_blank');
      return;
    }
    const tab = window.open('', '_blank');
    if (!tab) { alert('Allow pop-ups to open the attachment.'); return; }
    const { data, error } = await supabase.storage.from('inventory-images').createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      tab.close();
      alert(error?.message || 'Unable to open attachment.');
      return;
    }
    tab.location.href = data.signedUrl;
  };

  const handleEditClick = (r: any) => {
    let parsedItems = [{ productName: r.partName || '', quantity: r.quantity?.toString() || '', files: [] as File[], filePaths: [] as string[] }];
    try {
      const raw = r.enquiringFor ?? r.enquiring_for;
      if (raw) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsedItems = parsed.map((p: any) => ({
            productName: p.productName || p.partName || '',
            quantity: (p.quantity || '').toString(),
            files: [] as File[],
            filePaths: Array.isArray(p.filePaths) ? p.filePaths : []
          }));
        }
      }
    } catch {}

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
      enquiringFor: r.enquiringFor ?? r.enquiring_for ?? '',
      items: parsedItems,
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
    if (!formData.customer?.trim()) {
      alert("Please enter company name.");
      return;
    }
    const enteredProducts = (formData.items || []).filter((item: any) => String(item.productName || item.partName || '').trim());
    let finalItems = enteredProducts;
    if (!finalItems.length && formData.partName?.trim()) {
      finalItems = [{ productName: formData.partName.trim(), quantity: formData.quantity || '0', files: [], filePaths: [] }];
    }
    if (!finalItems.length) {
      alert("Please enter at least one product name.");
      return;
    }
    if (finalItems.some((item: any) => Number(item.quantity) < 0)) {
      alert("Product quantities cannot be negative.");
      return;
    }
    
    setLoading(true);
    try {
      const companyId = company?.id;
      const itemsToSave = await Promise.all(finalItems.map(async (item: any) => {
        let uploadedPaths: string[] = [];
        if ((item.files || []).length > 0) {
          try {
            uploadedPaths = await Promise.all((item.files || []).map((file: File) => uploadLeadProductFile(companyId, file)));
          } catch (upErr: any) {
            console.warn("Storage upload warning:", upErr);
          }
        }
        return {
          productName: String(item.productName || item.partName).trim(),
          partName: String(item.productName || item.partName).trim(),
          quantity: item.quantity || '0',
          filePaths: [...(item.filePaths || []), ...uploadedPaths],
        };
      }));

      const firstItem = itemsToSave[0];
      const productNamesList = itemsToSave.map((it: any) => it.productName).join(', ');
      const multiplePartsString = itemsToSave.length > 1 ? `${productNamesList} (${itemsToSave.length} Products)` : firstItem.productName;
      const totalQty = itemsToSave.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 0), 0);

      const entryData: any = {
        lead_no: formData.leadNo,
        customer: formData.customer,
        contact_person: formData.contacts.map((c: any) => c.person).join(' | '),
        phone: formData.contacts.map((c: any) => c.phone).join(' | '),
        email: formData.contacts.map((c: any) => c.email).join(' | '),
        city: formData.city,
        gst: formData.gst,
        enquiring_for: JSON.stringify(itemsToSave),
        part_name: multiplePartsString,
        part_no: formData.partNo || 'N/A',
        quantity: totalQty,
        estimated_value: Number(formData.estimatedValue) || 0,
        expected_date: formData.expectedDate || null,
        source: formData.source,
        status: formData.status
      };

      if (companyId) {
        entryData.company_id = companyId;
      }

      const { error } = editId
        ? await supabase.from('cnc_enquiries').update(entryData).eq('id', editId)
        : await supabase.from('cnc_enquiries').insert([{
            ...entryData,
            id: crypto.randomUUID(),
            enquiry_no: formData.leadNo,
            received_date: new Date().toISOString().split('T')[0],
            pipeline_stage: 'Enquiry'
          }]);
      if (error) {
        console.error('Failed to save lead:', error);
        alert('Failed to save lead: ' + error.message);
        return;
      }

      // Auto-sync customer to cnc_customers if not yet existing
      try {
        const custExists = customerList.some(c => c.name?.toLowerCase() === formData.customer.toLowerCase());
        if (!custExists) {
          const custPayload: any = {
            id: `CUST-${Math.floor(1000 + Math.random() * 9000)}`,
            name: formData.customer,
            contact: formData.contacts?.[0]?.person || null,
            phone: formData.contacts?.[0]?.phone || null,
            email: formData.contacts?.[0]?.email || null,
            city: formData.city || null,
            status: 'Active'
          };
          if (companyId) custPayload.company_id = companyId;
          await supabase.from('cnc_customers').insert([custPayload]);
        }
      } catch (cErr) {
        console.warn('Customer auto-insert error:', cErr);
      }

      await fetchLeads();
      setShowAdd(false);
      setEditId(null);
    } catch (err: any) {
      console.error('Failed to save lead:', err);
      alert('Failed to save lead: ' + (err?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateQuotation = async () => {
    if (!quotationTarget) return;
    setLoading(true);

    const q = Number(quoteForm.quantity) || 0; const p = Number(quoteForm.unitPrice) || 0;
    const d = Number(quoteForm.discount) || 0; const ud = Number(quoteForm.unitDiscount) || 0; const g = Number(quoteForm.gst) || 0;
    const discounted = Math.max(0, p * (1 - d / 100) - ud);
    const total = q * discounted * (1 + g / 100);
    
    const quotePayload: any = {
      id: crypto.randomUUID(), quote_no: quoteForm.quoteNo, customer: quoteForm.customer, part_name: quoteForm.partName,
      contact_person: quotationTarget.contactPerson, phone: quotationTarget.phone, email: quotationTarget.email,
      enquiry_no: quoteForm.leadNo || null,
      part_number: quoteForm.partNumber || 'N/A', description: quoteForm.description, unit_price: p,
      unit_discount: ud,
      quantity: q, total_value: total, date: quoteForm.quoteDate || null, valid_till: quoteForm.validTill || null, status: 'Sent',
      salesperson: quoteForm.salesperson, discount_percent: d, gst_percent: g,
      payment_terms: quoteForm.paymentTerms, delivery_terms: quoteForm.deliveryTerms, remarks: quoteForm.remarks, lead_id: quotationTarget.id
    };

    let { error: quoteErr } = await supabase.from('cnc_quotations').insert([quotePayload]);
    if (quoteErr && (quoteErr.message?.includes('unit_discount') || quoteErr.code === '42703')) {
      const { unit_discount, ...fallback } = quotePayload;
      const res = await supabase.from('cnc_quotations').insert([fallback]);
      quoteErr = res.error;
    }

    if (!quoteErr) {
      // Update lead
      const { error: enqErr } = await supabase.from('cnc_enquiries').update({
        status: 'Quoted',
        pipeline_stage: 'Quotation'
      }).eq('id', quotationTarget.id);
      if (enqErr) console.error('Failed to update lead status:', enqErr);
      setQuotationTarget(null);
      await fetchLeads();
    } else {
      alert("Error: " + quoteErr.message);
      setLoading(false);
    }
  };



  const handleQuickStatusChange = async (id: string, newStatus: string) => {
    const { error } = await supabase.from('cnc_enquiries').update({ status: newStatus }).eq('id', id);
    if (error) { alert('Failed to update status: ' + error.message); return; }
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
    { key: 'leadNo', label: 'Unique Number', sortable: true, render: (r) => <span className="font-mono text-xs text-slate-500">{r.leadNo}</span> },
    { key: 'company', label: 'Company', sortable: true, render: (r) => <span className="font-semibold text-slate-800">{r.company}</span> },
    { key: 'contactPerson', label: 'Contact', render: (r) => <div><p className="text-sm">{r.contactPerson}</p><p className="text-xs text-slate-500">{r.phone}</p></div> },
    { key: 'partName', label: 'Product Name', render: (r) => <div><p className="text-sm font-medium text-slate-700">{formatLeadProductDisplay(r)}</p><p className="text-xs text-slate-500">Qty: {r.quantity}</p></div> },
    { key: 'source', label: 'Source', render: (r) => <Badge variant="neutral">{r.source}</Badge> },
    { key: 'status', label: 'Status Summary', render: (r) => (
      <div className="flex flex-wrap gap-1 max-w-[150px]">
        {Object.entries(r.statusSummary || {}).map(([st, count]) => (
          <Badge key={st} variant={statusToVariant(st)}>{count as React.ReactNode} {st}</Badge>
        ))}
      </div>
    ) },
    { key: 'actions', label: 'Actions', align: 'right', render: (r) => {
        const activeEnqs = (r.allEnquiries || []).filter((e: any) => e.status !== 'Converted' && e.status !== 'Lost' && e.status !== 'Quoted');
        const lostEnqs = (r.allEnquiries || []).filter((e: any) => e.status === 'Lost');
        const hasActive = activeEnqs.length > 0;
        const hasLost = lostEnqs.length > 0;

        return (
        <div className="flex items-center justify-end gap-1">
          {hasActive && (
            <>
              <button onClick={() => {
                if (activeEnqs.length === 1) openQuoteModal(activeEnqs[0]);
                else setQuoteSelectTarget(activeEnqs);
              }} title="Create Quotation" className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"><ArrowRightCircle size={15} /></button>
              
              <button onClick={() => {
                if (activeEnqs.length === 1) handleMarkLost(activeEnqs[0].id);
                else setLostSelectTarget(activeEnqs);
              }} title="Mark as Lost" className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><XCircle size={15} /></button>
            </>
          )}
          {hasLost && (
            <button onClick={() => {
              if (lostEnqs.length === 1) handleRevertLost(lostEnqs[0].id);
              else setRevertSelectTarget(lostEnqs);
            }} title="Revert Lost Enquiry" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><RefreshCcw size={15} /></button>
          )}
          <button onClick={() => setViewTarget(r)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Eye size={15} /></button>
          <button onClick={() => handleEditClick(r)} title="Edit Latest Enquiry" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit size={15} /></button>
        </div>
      );
    } }
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

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={editId ? "Edit Lead" : "Add New Lead"} size="xl" footer={<><Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button><Button onClick={handleSave}>Save Lead</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Unique Number" required><input className={inputClass} value={formData.leadNo} onChange={e => setFormData({...formData, leadNo: e.target.value})} placeholder="e.g. 1840 or Custom Unique Number" /></FormField>
          <CustomerAutocomplete
            label="Company Name"
            required
            value={formData.customer}
            onChange={val => {
              const matched = allKnownCompanies.find(c => c.company.toLowerCase() === val.trim().toLowerCase());
              setFormData(prev => ({
                ...prev,
                customer: val,
                contacts: matched && (matched.contact_person || matched.phone || matched.email)
                  ? [{ person: matched.contact_person || '', phone: matched.phone || '', email: matched.email || '' }]
                  : prev.contacts,
                city: matched?.city || prev.city,
                gst: matched?.gst || prev.gst
              }));
            }}
            onSelectCustomer={c => {
              setFormData(prev => ({
                ...prev,
                customer: c.company,
                contacts: (c.contact_person || c.phone || c.email)
                  ? [{ person: c.contact_person || '', phone: c.phone || '', email: c.email || '' }]
                  : prev.contacts,
                city: c.city || prev.city,
                gst: c.gst || prev.gst
              }));
            }}
            companies={allKnownCompanies}
            inputClass={inputClass}
            placeholder="e.g. Acme Corp"
          />
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
          <FormField label="Address"><input className={inputClass} value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} /></FormField>
          <FormField label="GST No."><input className={inputClass} value={formData.gst} onChange={e => setFormData({...formData, gst: e.target.value})} /></FormField>

          {/* Multiple Products Required with Image / File upload */}
          <div className="col-span-2">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Products Required *</label>
            <div className="space-y-2">
              {(formData.items || [{ productName: '', quantity: '', files: [], filePaths: [] }]).map((item: any, idx: number) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_7rem_minmax(14rem,0.9fr)_auto] gap-3 items-start rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div>
                    <input
                      className={inputClass}
                      placeholder="Product Name *"
                      value={item.productName ?? item.partName ?? ''}
                      onChange={e => {
                        const newItems = [...(formData.items || [])];
                        newItems[idx] = { ...newItems[idx], productName: e.target.value, partName: e.target.value };
                        setFormData({ ...formData, items: newItems, partName: newItems[0].productName });
                      }}
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      min="0"
                      className={inputClass}
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={e => {
                        const newItems = [...(formData.items || [])];
                        newItems[idx] = { ...newItems[idx], quantity: e.target.value };
                        setFormData({ ...formData, items: newItems, quantity: newItems[0].quantity });
                      }}
                    />
                  </div>
                  <div>
                    <label className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-3 text-xs font-semibold text-slate-600 hover:border-brand-400 hover:text-brand-700 transition-colors">
                      <UploadCloud size={15} />
                      {(item.files || []).length || (item.filePaths || []).length
                        ? `${(item.files || []).length + (item.filePaths || []).length} file(s) selected`
                        : 'Upload image / file / PDF'}
                      <input
                        type="file"
                        multiple
                        accept="*/*"
                        className="hidden"
                        onChange={e => {
                          const selectedFiles = Array.from(e.currentTarget.files || []);
                          const newItems = [...(formData.items || [])];
                          newItems[idx] = { ...newItems[idx], files: [...(newItems[idx].files || []), ...selectedFiles] };
                          setFormData({ ...formData, items: newItems });
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                    {/* Render newly chosen files */}
                    {(item.files || []).length > 0 && (
                      <div className="mt-1 space-y-1">
                        {item.files.map((file: File, fileIdx: number) => {
                          const isImg = file.type.startsWith('image/');
                          return (
                            <div key={`${file.name}-${fileIdx}`} className="flex items-center justify-between gap-2 text-[11px] text-slate-600 bg-white p-1.5 rounded border border-slate-200">
                              <div className="flex items-center gap-1.5 truncate">
                                {isImg ? (
                                  <img src={URL.createObjectURL(file)} alt={file.name} className="w-5 h-5 object-cover rounded flex-shrink-0" />
                                ) : (
                                  <FileText size={13} className="text-slate-400 flex-shrink-0" />
                                )}
                                <span className="truncate">{file.name}</span>
                              </div>
                              <button
                                type="button"
                                className="text-rose-600 hover:text-rose-800 text-xs px-1 font-medium"
                                onClick={() => {
                                  const newItems = [...formData.items];
                                  newItems[idx] = { ...newItems[idx], files: newItems[idx].files.filter((_: File, j: number) => j !== fileIdx) };
                                  setFormData({ ...formData, items: newItems });
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Render previously uploaded filePaths */}
                    {Array.isArray(item.filePaths) && item.filePaths.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {item.filePaths.map((path: string, pIdx: number) => (
                          <span key={path} className="inline-flex items-center gap-1 text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                            <FileText size={11} />
                            <span className="truncate max-w-[120px]">{path.split('/').pop()}</span>
                            <button
                              type="button"
                              className="text-red-500 hover:text-red-700 ml-1 text-xs"
                              onClick={() => {
                                const newItems = [...formData.items];
                                newItems[idx] = { ...newItems[idx], filePaths: newItems[idx].filePaths.filter((_: string, j: number) => j !== pIdx) };
                                setFormData({ ...formData, items: newItems });
                              }}
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {idx > 0 && (
                    <button
                      type="button"
                      className="p-2 text-red-500 hover:bg-red-50 rounded mt-1 transition-colors"
                      title="Remove Product"
                      onClick={() => {
                        const newItems = formData.items.filter((_: any, i: number) => i !== idx);
                        setFormData({ ...formData, items: newItems });
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="text-xs font-semibold text-brand-600 hover:text-brand-800 flex items-center gap-1 mt-2 transition-colors py-1 px-2 rounded hover:bg-brand-50"
                onClick={() => {
                  setFormData({
                    ...formData,
                    items: [...(formData.items || []), { productName: '', quantity: '', files: [], filePaths: [] }]
                  });
                }}
              >
                <Plus size={14} /> Add Another Product
              </button>
            </div>
          </div>

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
              <CustomerAutocomplete
                label="Customer"
                required
                value={quoteForm.customer || ''}
                onChange={val => setQuoteForm((prev: any) => ({ ...prev, customer: val }))}
                onSelectCustomer={c => {
                  setQuoteForm((prev: any) => ({
                    ...prev,
                    customer: c.company
                  }));
                }}
                companies={allKnownCompanies}
                inputClass={inputClass}
                placeholder="Type or select customer..."
              />
              <FormField label="Enquiry / Lead No." required><input className={inputClass} value={quoteForm.leadNo} disabled /></FormField>
              <FormField label="Quotation Date" required><input type="date" className={inputClass} value={quoteForm.quoteDate} onChange={e=>setQuoteForm({...quoteForm, quoteDate: e.target.value})} /></FormField>
              <FormField label="Valid Till" required><input type="date" className={inputClass} value={quoteForm.validTill} onChange={e=>setQuoteForm({...quoteForm, validTill: e.target.value})} /></FormField>
              <FormField label="Salesperson"><input className={inputClass} value={quoteForm.salesperson} onChange={e=>setQuoteForm({...quoteForm, salesperson: e.target.value})} /></FormField>
            </div>
            
            <h4 className="font-semibold text-sm text-slate-800">Item Details</h4>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Product Name" required><input className={inputClass} value={quoteForm.partName} onChange={e=>setQuoteForm({...quoteForm, partName: e.target.value})} /></FormField>
              <FormField label="Product Number"><input className={inputClass} value={quoteForm.partNumber} onChange={e=>setQuoteForm({...quoteForm, partNumber: e.target.value})} /></FormField>
              <FormField label="Description"><input className={inputClass} value={quoteForm.description} onChange={e=>setQuoteForm({...quoteForm, description: e.target.value})} /></FormField>
              <FormField label="Quantity" required><input type="number" className={inputClass} value={quoteForm.quantity} onChange={e=>setQuoteForm({...quoteForm, quantity: e.target.value})} /></FormField>
              <FormField label="Unit Price" required><input type="number" className={inputClass} value={quoteForm.unitPrice} onChange={e=>setQuoteForm({...quoteForm, unitPrice: e.target.value})} /></FormField>
              <FormField label="Discount %"><input type="number" className={inputClass} value={quoteForm.discount} onChange={e=>setQuoteForm({...quoteForm, discount: e.target.value})} /></FormField>
              <FormField label="Unit Discount (₹)"><input type="number" className={inputClass} placeholder="0.00" value={quoteForm.unitDiscount || ''} onChange={e=>setQuoteForm({...quoteForm, unitDiscount: e.target.value})} /></FormField>
              <FormField label="GST %"><input type="number" className={inputClass} value={quoteForm.gst} onChange={e=>setQuoteForm({...quoteForm, gst: e.target.value})} /></FormField>
              <FormField label="Total Amount (Rs.)"><input className={`${inputClass} bg-slate-100 font-bold`} value={(() => {
                const q = Number(quoteForm.quantity) || 0; const p = Number(quoteForm.unitPrice) || 0;
                const d = Number(quoteForm.discount) || 0; const ud = Number(quoteForm.unitDiscount) || 0; const g = Number(quoteForm.gst) || 0;
                const discounted = Math.max(0, p * (1 - d / 100) - ud);
                return (q * discounted * (1 + g / 100)).toFixed(2);
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
              {/* Purchase History */}
              {purchaseHistory.length > 0 && (
                <div className="mb-6">
                  <h5 className="font-semibold text-sm text-slate-700 mb-3 uppercase tracking-wider flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path><polyline points="16 8 12 12 8 8"></polyline><line x1="12" y1="16" x2="12" y2="12"></line></svg>
                    Purchase History ({purchaseHistory.length} completed)
                  </h5>
                  <div className="bg-emerald-50/50 rounded-lg border border-emerald-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-emerald-100/50 border-b border-emerald-200">
                        <tr>
                          <th className="text-left px-4 py-2 text-[10px] font-bold text-emerald-700 uppercase">Invoice</th>
                          <th className="text-left px-4 py-2 text-[10px] font-bold text-emerald-700 uppercase">Product</th>
                          <th className="text-center px-4 py-2 text-[10px] font-bold text-emerald-700 uppercase">Qty</th>
                          <th className="text-right px-4 py-2 text-[10px] font-bold text-emerald-700 uppercase">Amount (₹)</th>
                          <th className="text-right px-4 py-2 text-[10px] font-bold text-emerald-700 uppercase">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchaseHistory.map((ph: any, idx: number) => (
                          <tr key={idx} className="border-b border-emerald-100 last:border-0">
                            <td className="px-4 py-2.5 font-semibold text-emerald-800">{ph.invoice_no}</td>
                            <td className="px-4 py-2.5 text-slate-700">{ph.part_name}</td>
                            <td className="px-4 py-2.5 text-center font-medium text-slate-700">{ph.quantity}</td>
                            <td className="px-4 py-2.5 text-right font-bold text-emerald-700">₹{Number(ph.total_value).toLocaleString('en-IN')}</td>
                            <td className="px-4 py-2.5 text-right text-slate-600 text-xs">{ph.date ? new Date(ph.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-emerald-100/50 border-t border-emerald-200">
                        <tr>
                          <td colSpan={3} className="px-4 py-2 text-right font-bold text-sm text-emerald-800 uppercase">Total Purchased</td>
                          <td className="px-4 py-2 text-right font-bold text-base text-emerald-800">₹{purchaseHistory.reduce((s: number, h: any) => s + (Number(h.total_value) || 0), 0).toLocaleString('en-IN')}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

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
                          <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Product Number</p>
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
                        <div className="col-span-4 mt-2 border-t border-slate-100 pt-2">
                          <p className="text-slate-500 text-[11px] font-bold uppercase mb-2">Products / Requirements</p>
                          {(() => {
                            let parsed: any[] = [];
                            try {
                              if (h.enquiringFor) {
                                const p = typeof h.enquiringFor === 'string' ? JSON.parse(h.enquiringFor) : h.enquiringFor;
                                if (Array.isArray(p)) parsed = p;
                              }
                            } catch {}
                            if (parsed.length > 0) {
                              return (
                                <div className="space-y-2">
                                  {parsed.map((item: any, pIdx: number) => (
                                    <div key={pIdx} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-slate-800">{item.productName || item.partName || 'Product'}</span>
                                        <span className="text-slate-500 font-medium">· Qty: {item.quantity || '-'}</span>
                                      </div>
                                      {Array.isArray(item.filePaths) && item.filePaths.length > 0 && (
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          {item.filePaths.map((fPath: string, fIdx: number) => (
                                            <button
                                              key={fIdx}
                                              type="button"
                                              onClick={() => void openProductFile(fPath)}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-200 rounded text-blue-600 hover:text-blue-800 hover:border-blue-300 font-medium transition-colors"
                                            >
                                              <FileText size={11} />
                                              <span className="truncate max-w-[120px]">{fPath.split('/').pop()}</span>
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              );
                            }
                            return <p className="font-medium text-slate-700">{h.enquiringFor || h.partName || 'N/A'}</p>;
                          })()}
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
    
      <Modal open={!!quoteSelectTarget} onClose={() => setQuoteSelectTarget(null)} title="Select Enquiry to Quote" size="sm" footer={<Button variant="secondary" onClick={() => setQuoteSelectTarget(null)}>Cancel</Button>}>
         <div className="flex flex-col gap-2">
            {quoteSelectTarget?.map(e => (
               <div key={e.id} onClick={() => openQuoteModal(e)} className="p-3 border border-slate-200 rounded-lg hover:border-brand-400 hover:bg-brand-50 cursor-pointer transition-colors">
                  <p className="font-bold text-sm">{e.lead_no || `LD-${e.enquiry_no}`} - {e.part_name}</p>
                  <p className="text-xs text-slate-500">Qty: {e.quantity}</p>
               </div>
            ))}
         </div>
      </Modal>

      <Modal open={!!lostSelectTarget} onClose={() => setLostSelectTarget(null)} title="Select Enquiry to Mark as Lost" size="sm" footer={<Button variant="secondary" onClick={() => setLostSelectTarget(null)}>Cancel</Button>}>
         <div className="flex flex-col gap-2">
            {lostSelectTarget?.map(e => (
               <div key={e.id} onClick={() => { handleMarkLost(e.id); setLostSelectTarget(null); }} className="p-3 border border-slate-200 rounded-lg hover:border-red-400 hover:bg-red-50 cursor-pointer transition-colors">
                  <p className="font-bold text-sm">{e.lead_no || `LD-${e.enquiry_no}`} - {e.part_name}</p>
                  <p className="text-xs text-slate-500">Qty: {e.quantity}</p>
               </div>
            ))}
         </div>
      </Modal>

      <Modal open={!!revertSelectTarget} onClose={() => setRevertSelectTarget(null)} title="Select Enquiry to Revert" size="sm" footer={<Button variant="secondary" onClick={() => setRevertSelectTarget(null)}>Cancel</Button>}>
         <div className="flex flex-col gap-2">
            {revertSelectTarget?.map(e => (
               <div key={e.id} onClick={() => { handleRevertLost(e.id); setRevertSelectTarget(null); }} className="p-3 border border-slate-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-colors">
                  <p className="font-bold text-sm">{e.lead_no || `LD-${e.enquiry_no}`} - {e.part_name}</p>
                  <p className="text-xs text-slate-500">Qty: {e.quantity}</p>
               </div>
            ))}
         </div>
      </Modal>

    </div>
  );
}
