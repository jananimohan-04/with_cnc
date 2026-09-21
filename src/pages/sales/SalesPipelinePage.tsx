import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader, DateSelector } from '@/components/ui/PageHeader';
import { StatCard, Badge, Button } from '@/components/ui/Card';
import { Modal, FormField, inputClass } from '@/components/ui/Modal';
import { FileText, Plus, Archive, Trash2, Eye, UploadCloud } from 'lucide-react';
import { setMockImage, getMockImage } from '@/lib/mockStorage';
import { EnquiryModule } from './EnquiryModule';
import { QuotationModule } from './QuotationModule';
import { SalesOrderModule } from './SalesOrderModule';
import { InwardModule } from './InwardModule';
import { FinishedGoodsModule } from './FinishedGoodsModule';
import { DeliveryChallanModule } from './DeliveryChallanModule';
import { InvoiceModule } from './InvoiceModule';

export type Stage = 'Enquiry' | 'Quotation' | 'Sales Order' | 'Inward' | 'Finished Goods' | 'DC' | 'Invoice';

export interface KanbanCard {
  id: string;
  stage: Stage;
  type: string;
  refNo: string;
  customer: string;
  part: string;
  qty: string | number;
  value: number;
  date: string;
  status?: string;
  raw: any;
};

const formatINR = (value: number) => {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);
};

// renderRecordData moved inside component for inline edit support
import { CommentsModal } from './CommentsModal';
import { PipelineListView } from './PipelineListView';
import { PipelineCalendarView } from './PipelineCalendarView';

export function SalesPipelinePage() {
  const [activeView, setActiveView] = useState<'pipeline' | 'enquiry_list' | 'quotation_list' | 'sales_order_list' | 'inward_list' | 'fg_list' | 'dc_list' | 'invoice_list'>('pipeline');
  const columns: Stage[] = ['Enquiry', 'Quotation', 'Sales Order', 'Inward', 'Finished Goods', 'DC', 'Invoice'];
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [draggedCard, setDraggedCard] = useState<KanbanCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [pipelineViewMode, setPipelineViewMode] = useState<'kanban' | 'list' | 'calendar'>('kanban');
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [activeCommentTarget, setActiveCommentTarget] = useState<KanbanCard | null>(null);
  const [customerFilter, setCustomerFilter] = useState<string>('All Customers');

  const [enquiryModalOpen, setEnquiryModalOpen] = useState(false);
  const [quotationModalTarget, setQuotationModalTarget] = useState<KanbanCard | null>(null);
  
  const [inwardModalTarget, setInwardModalTarget] = useState<KanbanCard | null>(null);
  const [fgModalTarget, setFgModalTarget] = useState<KanbanCard | null>(null);
  const [fgForm, setFgForm] = useState<any>({});
  const [dcModalTarget, setDcModalTarget] = useState<KanbanCard | null>(null);
  const [dcForm, setDcForm] = useState<any>({});
  const [invoiceModalTarget, setInvoiceModalTarget] = useState<KanbanCard | null>(null);
  const [soModalTarget, setSoModalTarget] = useState<KanbanCard | null>(null);
  const [soForm, setSoForm] = useState<any>({});

  const [invoiceForm, setInvoiceForm] = useState<any>({});
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [viewModalTarget, setViewModalTarget] = useState<KanbanCard | null>(null);
  const [viewModalData, setViewModalData] = useState<any>(null);
  const [viewEditMode, setViewEditMode] = useState(false);
  const [mockImages, setMockImages] = useState<Record<string, string>>({});

  const handleInlineEdit = async (title: string, id: string, field: string, value: string) => {
    const tableMap: any = {
      'Enquiry': 'cnc_enquiries',
      'Quotation': 'cnc_quotations',
      'Sales Order': 'cnc_sales_orders',
      'Inward': 'cnc_inwards',
      'Finished Goods': 'cnc_work_orders',
      'DC': 'cnc_deliveries',
      'Invoice': 'cnc_invoices'
    };
    const table = tableMap[title];
    if (!table) return;

    if (field !== 'image_url') {
      const { error } = await supabase.from(table).update({ [field]: value }).eq('id', id);
      if (error) {
         console.error("Failed to update:", error);
         alert("Failed to update field: " + error.message);
         return;
      }
    }

    setViewModalData((prev: any) => {
          if (!prev) return prev;
          const newPrev = { ...prev };
          const keyMap: any = { 'Enquiry': 'enquiry', 'Quotation': 'quotation', 'Sales Order': 'order', 'Inward': 'inward', 'Finished Goods': 'finished_goods', 'DC': 'dc', 'Invoice': 'invoice' };
          const stateKey = keyMap[title];
          if (newPrev[stateKey]) {
             newPrev[stateKey] = { ...newPrev[stateKey], [field]: value };
          }
          return newPrev;
       });
       fetchPipeline();
  };

  const renderRecordData = (title: string, raw: any) => {
    if (!raw) return null;
    return (
      <div className="mb-6">
        <h4 className="font-bold text-sm text-brand-800 border-b border-brand-100 pb-2 mb-3 uppercase flex justify-between items-center">
          {title} Details
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 bg-slate-50 p-4 rounded-lg border border-slate-100">
          {Object.entries(raw).map(([key, value]) => {
            if (key === 'id' || key.endsWith('_id') || value === null || value === '' || key === 'items' || key === 'contacts' || key === 'quote_no' || key === 'order_no' || key === 'inward_no' || key === 'enquiry_no' || key === 'image_url' || key === 'drawing_url' || ((key === 'part_no' || key === 'part_number') && value === 'N/A')) return null;
            let formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            if (key === 'lead_no') formattedKey = 'Project Name';
            return (
              <div key={key}>
                <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">{formattedKey}</span>
                {viewEditMode && key !== 'created_at' && key !== 'updated_at' ? (
                   <input 
                     type="text" 
                     className="w-full text-sm font-medium text-slate-800 border border-slate-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-brand-500"
                     defaultValue={String(value)}
                     onBlur={(e) => {
                       if (e.target.value !== String(value)) {
                         handleInlineEdit(title, raw.id, key, e.target.value);
                       }
                     }}
                   />
                ) : (
                   <span className="text-sm text-slate-800 font-medium break-words">{String(value)}</span>
                )}
              </div>
            );
          })}
        </div>
        {raw.items && Array.isArray(raw.items) && (
          <div className="bg-white rounded-lg border border-slate-200 mt-4">
            <h4 className="font-bold text-xs text-brand-800 border-b border-slate-200 p-2.5 bg-slate-50 rounded-t-lg uppercase">Items Breakdown</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-[10px] text-slate-500 bg-slate-50 uppercase border-b border-slate-200">
                  <tr><th className="px-4 py-2">Part Name / No</th><th className="px-4 py-2">Qty</th><th className="px-4 py-2">Unit Price</th><th className="px-4 py-2">Total</th></tr>
                </thead>
                <tbody>
                  {raw.items.map((item: any, i: number) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-800">{item.partName} <span className="text-xs text-slate-400 block font-normal">{item.partNumber}</span></td>
                      <td className="px-4 py-3">{item.quantity}</td>
                      <td className="px-4 py-3">{formatINR(item.unitPrice || 0)}</td>
                      <td className="px-4 py-3 font-bold text-brand-600">{formatINR((item.quantity||0) * (item.unitPrice||0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {(raw.image_url || mockImages[raw.part_name || raw.id]) && (
           <div className="mt-4">
             <h4 className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Attached Files</h4>
             <img src={mockImages[raw.part_name || raw.id] || raw.image_url} alt="Attachment" className="h-24 w-auto object-contain rounded border border-slate-200 bg-white" />
           </div>
        )}
        {viewEditMode && (
          <div className="mt-4">
            <h4 className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Attach Drawings / PDF / Images</h4>
            <div 
              className="border-2 border-dashed border-slate-300 rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors cursor-pointer bg-white" 
              onClick={() => document.getElementById(`inline-upload-${raw.id}`)?.click()}
            >
              <UploadCloud size={24} className="text-slate-400 mb-2" />
              <span className="text-sm font-medium text-slate-700">Click to upload or drag and drop</span>
              <span className="text-xs text-slate-500 mt-1">All formats supported (CAD, 3D, PDF, Images)</span>
              <input type="file" id={`inline-upload-${raw.id}`} className="hidden" multiple accept="*" onChange={async (e) => {
                 if (e.target.files && e.target.files.length > 0) {
                    const file = e.target.files[0];
                    const key = raw.part_name || raw.id;
                    const objectUrl = await setMockImage(key, file);
                    setMockImages(prev => ({ ...prev, [key]: objectUrl }));
                    alert(`Successfully uploaded ${file.name}!`);
                 }
              }} />
            </div>
          </div>
        )}
      </div>
    );
  };

  const resetEnquiryForm = () => ({
    leadNo: `PROJ-${Math.floor(1000 + Math.random() * 9000)}`,
    company: '', partName: '', partNumber: '', quantity: '', expectedDate: '', source: 'Direct',
    estimatedValue: '', receivedDate: new Date().toISOString().split('T')[0],
    contacts: [{ person: '', phone: '', email: '' }],
    files: [] as File[]
  });
  const [enquiryForm, setEnquiryForm] = useState(resetEnquiryForm());

  const [quoteForm, setQuoteForm] = useState<any>({
    quoteNo: '', customer: '', leadNo: '', quoteDate: '', validTill: '', salesperson: 'Admin',
    contacts: [{ person: '', phone: '', email: '' }],
    partName: '', partNumber: '', description: '', quantity: '', unitPrice: '', discount: '0', gst: '18',
    paymentTerms: '', deliveryTerms: '', remarks: ''
  });

  

  const [inwardForm, setInwardForm] = useState<any>({
    inwardNo: '', category: 'CUSTOMER DC', projectName: '', salesOrderRef: '', referenceNo: '', inwardDate: '', partyName: '', remarks: '',
    partName: '', partNumber: '', quantity: '', price: '', discount: '0', gst: '18',
    contacts: [{ person: '', phone: '', email: '' }]
  });

  const [knownCompanies, setKnownCompanies] = useState<any[]>([]);
  const [companySearchFocused, setCompanySearchFocused] = useState(false);

  const fetchPipeline = async () => {
    setLoading(true);
    // Fetch all leads to build a lookup map for Project Names (PROJ-XXXX)
    const { data: allLeads, error: leadsErr } = await supabase.from('cnc_enquiries').select('id, lead_no, enquiry_no, status, pipeline_stage, customer, part_name, quantity, estimated_value, expected_date, contact_person, phone, email');
    if (leadsErr) console.error("Error fetching leads:", leadsErr);
    
    const leadMap = new Map();
    const compMap = new Map();
    
    if (allLeads) {
      allLeads.forEach(l => {
        leadMap.set(l.id, l.lead_no || l.enquiry_no);
        const comp = l.customer;
        if (comp && !compMap.has(comp)) {
           compMap.set(comp, { company: comp, contact_person: l.contact_person, phone: l.phone, email: l.email });
        }
      });
    }
    setKnownCompanies(Array.from(compMap.values()));

    const { data: quotes } = await supabase.from('cnc_quotations').select('*').in('status', ['Sent', 'Under Review', 'Draft', 'Accepted']);
    const quoteMap = new Map();
    if (quotes) quotes.forEach(q => quoteMap.set(q.id, leadMap.get(q.lead_id) || q.quote_no));

    const { data: orders } = await supabase.from('cnc_sales_orders').select('*').in('status', ['Draft', 'Confirmed', 'Waiting for Parts', 'In Production']);
    const orderMap = new Map();
    if (orders) orders.forEach(o => orderMap.set(o.order_no, quoteMap.get(o.quotation_id) || o.order_no));

    const { data: inwards, error: inwardErr } = await supabase.from('cnc_inwards').select('*').neq('status', 'Deleted');

    const newCards: KanbanCard[] = [];

    // Filter leads for the Enquiry column
    const activeLeads = allLeads?.filter(l => ['New', 'Contacted', 'Qualified', 'Under Review'].includes(l.status) && l.pipeline_stage !== null) || [];

    activeLeads.forEach(l => newCards.push({
      id: `lead_${l.id}`, stage: 'Enquiry', type: 'lead',
      refNo: leadMap.get(l.id), customer: l.company || l.customer, part: l.part_name,
      qty: l.quantity, value: l.estimated_value, date: l.expected_date, status: l.status, raw: l
    }));

    if (quotes) quotes.forEach(q => newCards.push({
      id: `quote_${q.id}`, stage: 'Quotation', type: 'quotation',
      refNo: quoteMap.get(q.id), customer: q.customer || q.customer_name, part: q.part_name,
      qty: q.quantity, value: q.total_value, date: q.valid_till || q.valid_until || q.quote_date, status: q.status, raw: q
    }));

    if (orders) orders.forEach(o => newCards.push({
      id: `order_${o.id}`, stage: 'Sales Order', type: 'order',
      refNo: orderMap.get(o.order_no), customer: o.customer || o.customer_name, part: o.part_name || (o.items?.[0]?.partName),
      qty: o.quantity || (o.items?.[0]?.quantity), value: o.total_value, date: o.delivery_date, status: o.status, raw: o
    }));

    if (inwards && !inwardErr) inwards.forEach(i => newCards.push({
      id: `inward_${i.id}`, stage: 'Inward', type: 'inward',
      refNo: orderMap.get(i.sales_order_ref) || i.inward_no, customer: i.party_name, part: i.part_name,
      qty: i.quantity, value: i.total_amount, date: i.inward_date, status: i.status, raw: i
    }));


    const { data: fgs } = await supabase.from('cnc_work_orders').select('*').in('status', ['Completed', 'In Progress']);
    const { data: dcs } = await supabase.from('cnc_deliveries').select('*');
    let invoicesData = [];
    try { const { data: invs, error: invErr } = await supabase.from('cnc_invoices').select('*'); if (!invErr && invs) invoicesData = invs; } catch(e) {}

    if (fgs) {
      fgs.filter(w => w.completed > 0 || w.status === 'Completed').forEach(w => {
         newCards.push({ id: w.id, stage: 'Finished Goods', type: 'finished_goods', refNo: w.wo_no || w.woNo || `WO-${w.id.substring(0,4)}`, customer: w.customer, part: w.part_name || w.partName, qty: w.completed, value: 0, date: w.updated_at ? w.updated_at.split('T')[0] : '', status: w.status, raw: w });
      });
    }

    if (dcs) {
      dcs.forEach(d => {
         newCards.push({ id: d.id, stage: 'DC', type: 'dc', refNo: d.delivery_no || `DC-${d.id.substring(0,4)}`, customer: d.customer_name || d.party_name || 'Customer', part: d.part_name, qty: d.quantity, value: 0, date: d.delivery_date, status: d.status, raw: d });
      });
    }

    if (invoicesData && invoicesData.length > 0) {
      invoicesData.forEach(inv => {
         newCards.push({ id: inv.id, stage: 'Invoice', type: 'invoice', refNo: inv.invoice_no || `INV-${inv.id.substring(0,4)}`, customer: inv.customer_name || 'Customer', part: inv.item || inv.part_name || '-', qty: inv.quantity || 1, value: inv.amount || 0, date: inv.invoice_date || inv.created_at.split('T')[0], status: inv.status, raw: inv });
      });
    }

    try {
      let comms: any[] = [];
      const { data, error: commErr } = await supabase.from('cnc_pipeline_comments').select('record_id');
      if (data && !commErr) {
        comms = data;
      } else {
        comms = JSON.parse(localStorage.getItem('cnc_pipeline_comments') || '[]');
      }
      
      const counts: Record<string, number> = {};
      comms.forEach(c => {
         counts[c.record_id] = (counts[c.record_id] || 0) + 1;
      });
      setCommentCounts(counts);
    } catch(e) {
      const comms = JSON.parse(localStorage.getItem('cnc_pipeline_comments') || '[]');
      const counts: Record<string, number> = {};
      comms.forEach((c: any) => {
         counts[c.record_id] = (counts[c.record_id] || 0) + 1;
      });
      setCommentCounts(counts);
    }

    setCards(newCards);
    setLoading(false);
  };

  const fetchRecentActivities = async () => {
    const activities: any[] = [];
    
    const { data: recentEnq } = await supabase.from('cnc_enquiries').select('enquiry_no, customer, status, created_at').order('created_at', { ascending: false }).limit(3);
    if (recentEnq) recentEnq.forEach(r => activities.push({ type: 'enquiry', ref: r.enquiry_no, customer: r.customer, action: r.status === 'New' ? 'received' : r.status?.toLowerCase() || 'updated', time: r.created_at, color: 'bg-blue-500' }));

    const { data: recentQuotes } = await supabase.from('cnc_quotations').select('quote_no, customer, status, created_at').order('created_at', { ascending: false }).limit(3);
    if (recentQuotes) recentQuotes.forEach(r => activities.push({ type: 'quotation', ref: r.quote_no, customer: r.customer, action: r.status === 'Accepted' ? 'accepted' : 'sent', time: r.created_at, color: 'bg-purple-500' }));

    const { data: recentSO } = await supabase.from('cnc_sales_orders').select('order_no, customer, status, created_at').order('created_at', { ascending: false }).limit(3);
    if (recentSO) recentSO.forEach(r => activities.push({ type: 'sales_order', ref: r.order_no, customer: r.customer, action: 'confirmed', time: r.created_at, color: 'bg-emerald-500' }));

    const { data: recentInw } = await supabase.from('cnc_inwards').select('inward_no, party_name, status, created_at').order('created_at', { ascending: false }).limit(3);
    if (recentInw) recentInw.forEach(r => activities.push({ type: 'inward', ref: r.inward_no, customer: r.party_name, action: 'received', time: r.created_at, color: 'bg-orange-500' }));

    const { data: recentDC } = await supabase.from('cnc_deliveries').select('delivery_no, customer_name, status, created_at').order('created_at', { ascending: false }).limit(3);
    if (recentDC) recentDC.forEach(r => activities.push({ type: 'dc', ref: r.delivery_no, customer: r.customer_name, action: 'dispatched', time: r.created_at, color: 'bg-rose-500' }));

    try {
      const { data: recentInv } = await supabase.from('cnc_invoices').select('invoice_no, customer_name, status, created_at').order('created_at', { ascending: false }).limit(3);
      if (recentInv) recentInv.forEach(r => activities.push({ type: 'invoice', ref: r.invoice_no, customer: r.customer_name, action: 'generated', time: r.created_at, color: 'bg-indigo-500' }));
    } catch(e) {}

    // Sort all by time descending and take top 5
    activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    setRecentActivities(activities.slice(0, 5));
  };

  useEffect(() => {
    fetchPipeline();
    fetchRecentActivities();
  }, []);

  const parseContacts = (raw: any) => {
    if (!raw) return [{ person: '', phone: '', email: '' }];
    const persons = (raw.contact_person || '').split(' | ').map((s: string) => s.trim());
    const phones = (raw.phone || '').split(' | ').map((s: string) => s.trim());
    const emails = (raw.email || '').split(' | ').map((s: string) => s.trim());
    const maxLen = Math.max(persons.length, phones.length, emails.length, 1);
    const parsed = Array.from({ length: maxLen }).map((_, i) => ({ person: persons[i] || '', phone: phones[i] || '', email: emails[i] || '' }));
    const hasData = parsed.some(c => c.person || c.phone || c.email);
    return hasData ? parsed : [{ person: '', phone: '', email: '' }];
  };

  const handleCompanyChange = (val: string) => {
    setEnquiryForm((prev: any) => {
      const form = { ...prev, company: val };
      const matched = knownCompanies.find(c => c.company === val);
      if (matched) {
        form.contacts = parseContacts(matched);
      }
      return form;
    });
  };

  const getContactStrings = (form: any) => {
    const contacts = form.contacts || [];
    return {
      person: contacts.map((c: any) => c.person).join(' | '),
      phone: contacts.map((c: any) => c.phone).join(' | '),
      email: contacts.map((c: any) => c.email).join(' | '),
    };
  };

  const openViewModal = async (card: KanbanCard) => {
    setViewModalTarget(card);
    setLoading(true);
    let aggregated: any = { enquiry: null, quotation: null, order: null, inward: null, finished_goods: null, dc: null, invoice: null };
    try {
      if (card.type === 'inward') {
        aggregated.inward = card.raw;
        if (card.raw.sales_order_ref) {
           const { data: ord } = await supabase.from('cnc_sales_orders').select('*').eq('order_no', card.raw.sales_order_ref).single();
           if (ord) {
             aggregated.order = ord;
             if (ord.quotation_id) {
               const { data: qt } = await supabase.from('cnc_quotations').select('*').eq('id', ord.quotation_id).single();
               if (qt) {
                 aggregated.quotation = qt;
                 if (qt.lead_id) {
                   const { data: enq } = await supabase.from('cnc_enquiries').select('*').eq('id', qt.lead_id).single();
                   if (enq) aggregated.enquiry = enq;
                 }
               }
             }
           }
        }
      } else if (card.type === 'order') {
        aggregated.order = card.raw;
        if (card.raw.quotation_id) {
           const { data: qt } = await supabase.from('cnc_quotations').select('*').eq('id', card.raw.quotation_id).single();
           if (qt) {
             aggregated.quotation = qt;
             if (qt.lead_id) {
               const { data: enq } = await supabase.from('cnc_enquiries').select('*').eq('id', qt.lead_id).single();
               if (enq) aggregated.enquiry = enq;
             }
           }
        }
      } else if (card.type === 'quotation') {
        aggregated.quotation = card.raw;
        if (card.raw.lead_id) {
           const { data: enq } = await supabase.from('cnc_enquiries').select('*').eq('id', card.raw.lead_id).single();
           if (enq) aggregated.enquiry = enq;
        }
      } else if (card.type === 'lead') {
        aggregated.enquiry = card.raw;
      } else if (card.type === 'finished_goods') {
        aggregated.finished_goods = card.raw;
      } else if (card.type === 'dc') {
        aggregated.dc = card.raw;
        // Optionally try to fetch order if we had a sales order id
        if (card.raw.sales_order_no) {
           const { data: ord } = await supabase.from('cnc_sales_orders').select('*').eq('order_no', card.raw.sales_order_no).single();
           if (ord) aggregated.order = ord;
        }
      } else if (card.type === 'invoice') {
        aggregated.invoice = card.raw;
      }
    } catch (e) {
       console.error("Error fetching lineage", e);
    }
    setViewModalData(aggregated);
    
    // Load mock images for all records in the pipeline history
    const loaded: Record<string, string> = {};
    for (const k of Object.keys(aggregated)) {
      const rec = aggregated[k];
      if (rec) {
        const key = rec.part_name || rec.id;
        if (key) {
          const u = await getMockImage(key);
          if (u) loaded[key] = u;
        }
      }
    }
    setMockImages(prev => ({ ...prev, ...loaded }));
    
    setLoading(false);
  };

  const closeViewModal = () => {
    setViewModalTarget(null);
    setViewModalData(null);
    setViewEditMode(false);
  };

  const handleDragStart = (e: React.DragEvent, card: KanbanCard) => {
    e.dataTransfer.setData('text/plain', String(card.id));
    setDraggedCard(card);
  };

  const handleDrop = async (e: React.DragEvent, toStage: Stage) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('text/plain');
    let card = draggedCard || cards.find(c => String(c.id) === String(cardId));
    if (!card) {
      alert("Error: Could not identify the dragged card. Please try again.");
      return;
    }
    if (card.stage === toStage) return;
    
    try {

    if (card.type === 'lead' && toStage === 'Quotation') {
      const qNo = `QT-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      setQuoteForm({
        quoteNo: qNo, customer: card.customer, leadNo: card.refNo, quoteDate: new Date().toISOString().split('T')[0], validTill: card.date || '', salesperson: 'Admin',
        contacts: parseContacts(card.raw),
        partName: card.part, partNumber: card.raw.part_no !== 'N/A' ? (card.raw.part_no || '') : '', description: '', quantity: card.qty?.toString() || '', unitPrice: '', discount: '0', gst: '18',
        paymentTerms: '', deliveryTerms: '', remarks: ''
      });
      setQuotationModalTarget(card);
    } else if (card.type === 'quotation' && toStage === 'Sales Order') {
      const oNo = `SO-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      
      const q = Number(card.qty) || 0;
      let p = Number(card.raw.unit_price) || 0;
      if (!p && card.value && card.qty) {
        const d = Number(card.raw.discount_percent) || 0;
        const g = Number(card.raw.gst_percent) || 0;
        p = Number((card.value / (card.qty * (1 - d/100) * (1 + g/100))).toFixed(2));
      }
      
      const item = {
         id: crypto.randomUUID(),
         partName: card.part,
         partNumber: card.raw.part_number || '',
         description: card.raw.description || '',
         quantity: q.toString(),
         unitPrice: p.toString(),
         discount: (card.raw.discount_percent || 0).toString(),
         gst: (card.raw.gst_percent || 18).toString()
      };
      const totalVal = card.value || 0;

      const { error } = await supabase.from('cnc_sales_orders').insert([{
        id: crypto.randomUUID(),
        order_no: oNo, customer: card.customer,
        contact_person: card.raw.contact_person, phone: card.raw.phone, email: card.raw.email,
        billing_address: '', delivery_address: '',
        shipping_contact: '', shipping_phone: '',
        lead_no: card.raw.lead_no || card.raw.lead_id || '', order_date: new Date().toISOString().split('T')[0],
        customer_po_no: '', customer_po_date: null,
        items: [item],
        
        part_name: item.partName, part_number: item.partNumber,
        quantity: q, 
        total_value: totalVal, 
        
        delivery_date: new Date().toISOString().split('T')[0], status: 'Confirmed',
        payment_terms: card.raw.payment_terms || 'Net 30', special_instructions: '',
        internal_remarks: '',
        quotation_id: card.raw.id
      }]);
      
      if (!error) {
        await supabase.from('cnc_quotations').update({ status: 'Converted' }).eq('id', card.raw.id);
        fetchPipeline();
      } else {
        alert("Error creating sales order: " + error.message);
      }
    } else if (card.type === 'order' && toStage === 'Inward') {
      const iNo = `INW-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      setInwardForm({
        inwardNo: iNo, category: 'CUSTOMER DC', projectName: card.raw.project_name || '', salesOrderRef: card.refNo, referenceNo: '', inwardDate: new Date().toISOString().split('T')[0], partyName: card.customer, remarks: '',
        partName: card.part, partNumber: card.raw.part_number || '', quantity: card.qty?.toString() || '0', price: '', discount: '0', gst: '18',
        contacts: parseContacts(card.raw)
      });
      setInwardModalTarget(card);
    } else if (card.type === 'inward' && toStage === 'Finished Goods') {
      setFgForm({
         woNo: `WO-2026-${Math.floor(1000 + Math.random() * 9000)}`,
         customer: card.customer, partName: card.part, partNo: card.raw.part_number || '',
         orderQty: card.qty?.toString() || '0', completedQty: card.qty?.toString() || '0',
         date: new Date().toISOString().split('T')[0]
      });
      setFgModalTarget(card);
    } else if (card.type === 'finished_goods' && toStage === 'DC') {
      setDcForm({
         dcNo: `DC-2026-${Math.floor(1000 + Math.random() * 9000)}`,
         date: new Date().toISOString().split('T')[0], partyName: card.customer,
         partName: card.part, quantity: card.qty?.toString() || '0', price: '', 
         poNumber: card.raw.wo_no || card.raw.woNo || '', vehicleNo: '', ewayBill: ''
      });
      setDcModalTarget(card);
    } else if (card.type === 'dc' && toStage === 'Invoice') {
      setInvoiceForm({
         invoiceNo: `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`,
         date: new Date().toISOString().split('T')[0], partyName: card.customer,
         dcNumber: card.refNo, partName: card.part, quantity: card.qty?.toString() || '0', price: '0', 
         cgst: '9', sgst: '9', igst: '0'
      });
      setInvoiceModalTarget(card);
    } else {
      if ((card.type === 'inward' && toStage === 'DC') || (card.type === 'inward' && toStage === 'Invoice') || (card.type === 'finished_goods' && toStage === 'Invoice')) {
         alert(`Please complete ${card.type === 'inward' ? 'Finished Goods entry' : 'the Delivery Challan'} before moving to ${toStage}.`);
      } else {
         alert(`Cannot drag ${card.stage} directly to ${toStage}. Please follow the sequence.`);
      }
    }
    } catch(err: any) {
      alert("Runtime Error in handleDrop: " + err.message);
    }
  };

  const saveEnquiry = async () => {
    if (!enquiryForm.company || !enquiryForm.partName) return;
    setLoading(true);
    const cStr = getContactStrings(enquiryForm);
    const { error } = await supabase.from('cnc_enquiries').insert([{
      id: crypto.randomUUID(), lead_no: enquiryForm.leadNo, enquiry_no: enquiryForm.leadNo, customer: enquiryForm.company,
      contact_person: cStr.person, phone: cStr.phone, email: cStr.email,
      part_name: enquiryForm.partName, part_no: enquiryForm.partNumber || 'N/A', quantity: Number(enquiryForm.quantity) || 0,
      expected_date: enquiryForm.expectedDate || null, received_date: enquiryForm.receivedDate || new Date().toISOString().split('T')[0], estimated_value: Number(enquiryForm.estimatedValue) || 0,
      source: enquiryForm.source, status: 'New', pipeline_stage: 'Enquiry'
    }]);
    if (!error) { setEnquiryModalOpen(false); setEnquiryForm(resetEnquiryForm()); fetchPipeline(); } 
    else { alert("Error: " + error.message); setLoading(false); }
  };

  const saveQuotation = async () => {
    if (!quotationModalTarget) return;
    const q = Number(quoteForm.quantity) || 0; const p = Number(quoteForm.unitPrice) || 0;
    const d = Number(quoteForm.discount) || 0; const g = Number(quoteForm.gst) || 0;
    const total = q * p * (1 - d / 100) * (1 + g / 100);
    const cStr = getContactStrings(quoteForm);

    const { error } = await supabase.from('cnc_quotations').insert([{
      id: crypto.randomUUID(), quote_no: quoteForm.quoteNo, customer: quoteForm.customer, part_name: quoteForm.partName,
      contact_person: cStr.person, phone: cStr.phone, email: cStr.email,
      part_number: quoteForm.partNumber, description: quoteForm.description, unit_price: p,
      quantity: q, total_value: total, valid_till: quoteForm.validTill, status: 'Sent',
      salesperson: quoteForm.salesperson, discount_percent: d, gst_percent: g,
      payment_terms: quoteForm.paymentTerms, delivery_terms: quoteForm.deliveryTerms, remarks: quoteForm.remarks, lead_id: quotationModalTarget.raw.id
    }]);
    
    if (error) alert("Error: " + error.message);
    else {
      await supabase.from('cnc_enquiries').update({ status: 'Quoted', pipeline_stage: 'Quotation' }).eq('id', quotationModalTarget.raw.id);
      setQuotationModalTarget(null); fetchPipeline();
    }
  };

  const saveInward = async () => {
    if (!inwardModalTarget) return;
    const q = Number(inwardForm.quantity) || 0; const p = Number(inwardForm.price) || 0;
    const d = Number(inwardForm.discount) || 0; const g = Number(inwardForm.gst) || 0;
    const total = q * p * (1 - d / 100) * (1 + g / 100);
    const cStr = getContactStrings(inwardForm);

    const { error } = await supabase.from('cnc_inwards').insert([{
        id: crypto.randomUUID(), inward_no: inwardForm.inwardNo, category: inwardForm.category, project_name: inwardForm.projectName,
        contact_person: cStr.person, phone: cStr.phone, email: cStr.email,
        sales_order_ref: inwardForm.salesOrderRef, reference_no: inwardForm.referenceNo, inward_date: inwardForm.inwardDate,
        party_name: inwardForm.partyName, remarks: inwardForm.remarks, part_name: inwardForm.partName,
        part_number: inwardForm.partNumber, quantity: q, price: p, discount_percent: d, gst_percent: g, total_amount: total, status: 'Pending'
      }]);
      
      if (!error) {
         // Log stock movement
         await supabase.from('cnc_stock_movements').insert([{
            date: inwardForm.inwardDate || new Date().toISOString().split('T')[0],
            type: 'Receipt',
            material: inwardForm.partName,
            qty: q,
            uom: 'Nos',
            from: inwardForm.partyName,
            to: 'Main Warehouse',
            reference: inwardForm.inwardNo,
            user: 'Admin'
         }]);
      }
    if (error) alert("Error: Make sure to run the SQL script to create the cnc_inwards table and columns.");
    else { await supabase.from('cnc_sales_orders').update({ status: 'Inwarded' }).eq('id', inwardModalTarget.raw.id); setInwardModalTarget(null); fetchPipeline(); }
  };

  const saveFinishedGoods = async () => {
    if (!fgModalTarget) return;
    const q = Number(fgForm.completedQty) || 0;
    const maxQ = Number(fgForm.orderQty) || 0;
    if (q > maxQ) {
       alert(`Quantity cannot exceed the inwarded amount of ${maxQ} pcs.`);
       return;
    }
    const { error } = await supabase.from('cnc_work_orders').insert([{
       id: crypto.randomUUID(), wo_no: fgForm.woNo, customer: fgForm.customer,
       part_name: fgForm.partName, completed: q, status: 'Completed',
       updated_at: fgForm.date + 'T00:00:00Z'
    }]);
    if (!error) {
       await supabase.from('cnc_inwards').update({ status: 'Processed' }).eq('id', fgModalTarget.raw.id);
       setFgModalTarget(null); fetchPipeline();
    } else { alert("Error: " + error.message); }
  };

  const saveDeliveryChallan = async () => {
    if (!dcModalTarget) return;
    const q = Number(dcForm.quantity) || 0;
    const maxQ = Number(dcModalTarget.qty) || 0;
    if (q > maxQ) {
       alert(`Quantity cannot exceed the finished goods stock of ${maxQ} pcs.`);
       return;
    }
    const { error } = await supabase.from('cnc_deliveries').insert([{
       id: crypto.randomUUID(), delivery_no: dcForm.dcNo, customer_name: dcForm.partyName,
       customer_id: crypto.randomUUID(), sales_order_id: crypto.randomUUID(), sales_order_no: dcForm.poNumber || 'N/A',
       part_name: dcForm.partName, quantity: q, delivery_date: dcForm.date, status: 'Delivered',
       created_at: new Date().toISOString()
    }]);
    if (!error) {
       await supabase.from('cnc_work_orders').update({ status: 'Dispatched' }).eq('id', dcModalTarget.raw.id);
       setDcModalTarget(null); fetchPipeline();
    } else { alert("Error: " + error.message); }
  };

    const saveStandaloneSalesOrder = async () => {
    if (!soModalTarget) return;
    const q = Number(soForm.quantity) || 0;
    const p = Number(soForm.price) || 0;
    const item = {
       id: crypto.randomUUID(),
       partName: soForm.partName,
       partNumber: soForm.partNumber || '',
       description: '',
       quantity: q.toString(),
       unitPrice: p.toString(),
       discount: '0',
       gst: soForm.gst || '18'
    };
    const totalVal = q * p * (1 + Number(soForm.gst||18)/100);

    const { error } = await supabase.from('cnc_sales_orders').insert([{
      id: crypto.randomUUID(),
      order_no: soForm.orderNo, customer: soForm.customer,
      contact_person: '', phone: '', email: '',
      billing_address: '', delivery_address: '',
      shipping_contact: '', shipping_phone: '',
      lead_no: '', order_date: soForm.orderDate,
      customer_po_no: '', customer_po_date: null,
      items: [item],
      part_name: item.partName, part_number: item.partNumber,
      quantity: q, 
      total_value: totalVal, 
      delivery_date: soForm.deliveryDate || soForm.orderDate, status: 'Confirmed',
      payment_terms: 'Net 30', special_instructions: '',
      internal_remarks: '',
      quotation_id: null
    }]);
    
    if (!error) {
      fetchPipeline();
      setSoModalTarget(null);
    } else {
      alert("Error creating sales order: " + error.message);
    }
  };
  
  const saveInvoice = async () => {
    if (!invoiceModalTarget) return;
    const q = Number(invoiceForm.quantity) || 0;
    const p = Number(invoiceForm.price) || 0;
    const cg = Number(invoiceForm.cgst) || 0;
    const sg = Number(invoiceForm.sgst) || 0;
    const ig = Number(invoiceForm.igst) || 0;
    const amt = q * p * (1 + (cg+sg+ig)/100);
    const { error } = await supabase.from('cnc_invoices').insert([{
       id: crypto.randomUUID(), invoice_no: invoiceForm.invoiceNo, customer_name: invoiceForm.partyName,
       part_name: invoiceForm.partName, quantity: q, amount: amt, invoice_date: invoiceForm.date, status: 'Paid',
       created_at: new Date().toISOString()
    }]);
    if (!error) {
       await supabase.from('cnc_deliveries').update({ status: 'Billed' }).eq('id', invoiceModalTarget.raw.id);
       setInvoiceModalTarget(null); fetchPipeline();
    } else { alert("Error: " + error.message); }
  };

  const removeFromPipeline = async (card: KanbanCard) => {
    if (confirm("Are you sure you want to roll back this Enquiry to 'Lost'? It will be removed from the pipeline but saved in All Leads.")) {
      setLoading(true); await supabase.from('cnc_enquiries').update({ status: 'Lost' }).eq('id', card.raw.id); fetchPipeline();
    }
  };

  const calcQuoteTotal = () => {
    const q = Number(quoteForm.quantity) || 0; const p = Number(quoteForm.unitPrice) || 0;
    const d = Number(quoteForm.discount) || 0; const g = Number(quoteForm.gst) || 0;
    return (q * p * (1 - d / 100) * (1 + g / 100)).toFixed(2);
  };

  const calcInwardTotal = () => {
    const q = Number(inwardForm.quantity) || 0; const p = Number(inwardForm.price) || 0;
    const d = Number(inwardForm.discount) || 0; const g = Number(inwardForm.gst) || 0;
    return (q * p * (1 - d / 100) * (1 + g / 100)).toFixed(2);
  };

  const calculateItemValues = (item: any) => {
    const q = Number(item.quantity) || 0;
    const p = Number(item.unitPrice) || 0;
    const d = Number(item.discount) || 0;
    const g = Number(item.gst) || 0;
    const base = q * p;
    const taxable = base * (1 - d / 100);
    const gstAmt = taxable * (g / 100);
    const total = taxable + gstAmt;
    return { taxable, gstAmt, total };
  };

  const calculateOrderTotals = () => {
    let subtotal = 0; let totalDiscount = 0; let totalGST = 0; let grandTotal = 0;
    (orderForm.items || []).forEach((item: any) => {
      const q = Number(item.quantity) || 0; const p = Number(item.unitPrice) || 0;
      const d = Number(item.discount) || 0; const g = Number(item.gst) || 0;
      const base = q * p; const discountAmt = base * (d / 100);
      const taxable = base - discountAmt; const gstAmt = taxable * (g / 100);
      const total = taxable + gstAmt;
      subtotal += base; totalDiscount += discountAmt; totalGST += gstAmt; grandTotal += total;
    });
    return { subtotal, totalDiscount, totalGST, grandTotal };
  };

  const updateOrderItem = (idx: number, field: string, value: any) => {
    const newItems = [...orderForm.items];
    newItems[idx][field] = value;
    setOrderForm({...orderForm, items: newItems});
  };

  const ContactsList = ({ form, setForm, readOnly = false }: { form: any, setForm?: any, readOnly?: boolean }) => (
    <div className="border-t border-slate-100 pt-4 mt-2 mb-4 col-span-full">
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-semibold text-sm text-slate-800">Contact Details</h4>
        {!readOnly && setForm && (
          <button type="button" onClick={() => setForm({...form, contacts: [...(form.contacts || []), { person: '', phone: '', email: '' }]})} className="flex items-center gap-1 text-xs bg-brand-100 text-brand-700 px-2 py-1 rounded hover:bg-brand-200 transition-colors">
            <Plus size={14} /> Add Contact
          </button>
        )}
      </div>
      {(form.contacts || []).map((contact: any, idx: number) => (
        <div key={idx} className="grid grid-cols-3 gap-4 mb-4 p-3 bg-slate-50 rounded border border-slate-100 relative">
          {!readOnly && setForm && (form.contacts || []).length > 1 && (
            <button type="button" onClick={() => {
              const newContacts = [...form.contacts]; newContacts.splice(idx, 1); setForm({...form, contacts: newContacts});
            }} className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-200 text-xs shadow-sm z-10 transition-colors">&times;</button>
          )}
          <FormField label="Contact Person"><input className={inputClass} value={contact.person} readOnly={readOnly} disabled={readOnly} onChange={e => {
            if(!readOnly && setForm) { const nc = [...form.contacts]; nc[idx].person = e.target.value; setForm({...form, contacts: nc}); }
          }} placeholder="Name" /></FormField>
          <FormField label="Phone"><input className={inputClass} value={contact.phone} readOnly={readOnly} disabled={readOnly} onChange={e => {
            if(!readOnly && setForm) { const nc = [...form.contacts]; nc[idx].phone = e.target.value; setForm({...form, contacts: nc}); }
          }} placeholder="Phone" /></FormField>
          <FormField label="Email"><input type="email" className={inputClass} value={contact.email} readOnly={readOnly} disabled={readOnly} onChange={e => {
            if(!readOnly && setForm) { const nc = [...form.contacts]; nc[idx].email = e.target.value; setForm({...form, contacts: nc}); }
          }} placeholder="Email" /></FormField>
        </div>
      ))}
    </div>
  );

  const [showNewLead, setShowNewLead] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({
    leadNo: `PROJ-${Math.floor(1000 + Math.random() * 9000)}`,
    company: '', city: '', gst: '', enquiringFor: '', source: 'Direct', contacts: [{ person: '', phone: '', email: '' }],
    items: [{ partName: '', quantity: '' }], partName: '', partNo: '', quantity: '', estimatedValue: '', expectedDate: '', files: [] as File[]
  });

  const [customerList, setCustomerList] = useState<any[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  useEffect(() => {
    async function fetchCustomers() {
      const { data } = await supabase.from('cnc_customers').select('*');
      if (data) setCustomerList(data);
    }
    fetchCustomers();
  }, []);

  const saveNewLead = async () => {
    if (!newLeadForm.company) return;
    setLoading(true);
    const cStr = getContactStrings(newLeadForm);
    const { error } = await supabase.from('cnc_enquiries').insert([{
      id: crypto.randomUUID(), lead_no: newLeadForm.leadNo, enquiry_no: newLeadForm.leadNo, customer: newLeadForm.company,
      contact_person: cStr.person, phone: cStr.phone, email: cStr.email,
      city: newLeadForm.city, gst: newLeadForm.gst, enquiring_for: newLeadForm.enquiringFor,
      part_name: newLeadForm.partName || 'TBD', part_no: newLeadForm.partNo || 'N/A', quantity: Number(newLeadForm.quantity) || 0, estimated_value: Number(newLeadForm.estimatedValue) || 0, expected_date: newLeadForm.expectedDate || new Date().toISOString().split('T')[0], received_date: new Date().toISOString().split('T')[0],
      source: newLeadForm.source, status: 'New', pipeline_stage: 'Enquiry'
    }]);
    if (!error) {
      setShowNewLead(false);
      setNewLeadForm({
        leadNo: `PROJ-${Math.floor(1000 + Math.random() * 9000)}`,
        company: '', city: '', gst: '', enquiringFor: '', source: 'Direct', contacts: [{ person: '', phone: '', email: '' }], partName: '', partNo: '', quantity: '', estimatedValue: '', expectedDate: '', files: []
      });
      fetchPipeline();
    } else {
      console.error(error);
      alert("Failed to save lead: " + error.message);
      setLoading(false);
    }
  };


  return (
    <div className="p-4 lg:p-6 bg-[#F8FAFC] min-h-full flex flex-col font-sans">
      
      {/* 1. Page Header */}
      <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Simple ERP</h1>
          <p className="text-xs text-slate-500 font-medium mt-1">From Enquiry to Invoice – All in One Place</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative hidden md:block">
            <input type="text" placeholder="Search by customer, part, document no..." className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-72 focus:outline-none focus:border-brand-500 bg-slate-50" />
            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
          <button onClick={() => setShowNewLead(true)} className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm flex items-center gap-2 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
            New <svg className="w-3 h-3 ml-1 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          </button>
        </div>
      </div>

      {/* 2. Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
        {[
          { title: 'Total Enquiries', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', color: 'blue', stage: 'Enquiry' },
          { title: 'Quotations', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', color: 'purple', stage: 'Quotation' },
          { title: 'Sales Orders', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', color: 'emerald', stage: 'Sales Order' },
          { title: 'Inward', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4', color: 'orange', stage: 'Inward' },
          { title: 'Finished Goods', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', color: 'teal', stage: 'Finished Goods' },
          { title: 'Delivery Challans', icon: 'M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z', color: 'rose', stage: 'DC' },
          { title: 'Invoices', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', color: 'blue', stage: 'Invoice' }
        ].map(stat => {
           const count = cards.filter(c => c.stage === stat.stage).length;
           return (
             <div key={stat.title} onClick={() => { 
               if (stat.stage === 'Enquiry') setActiveView('enquiry_list'); 
               else if (stat.stage === 'Quotation') setActiveView('quotation_list'); 
               else if (stat.stage === 'Sales Order') setActiveView('sales_order_list'); 
               else if (stat.stage === 'Inward') setActiveView('inward_list'); 
               else if (stat.stage === 'Finished Goods') setActiveView('fg_list'); 
               else if (stat.stage === 'DC') setActiveView('dc_list'); 
               else if (stat.stage === 'Invoice') setActiveView('invoice_list'); 
             }} className={`bg-white rounded-xl p-4 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-brand-300 cursor-pointer hover:border-brand-500 flex items-center justify-between hover:-translate-y-1 transition-transform`}>
               <div>
                 <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">{stat.title}</p>
                 <p className={`text-2xl font-bold text-${stat.color}-600`}>{count}</p>
               </div>
               <div className={`w-10 h-10 rounded-full bg-${stat.color}-50 flex items-center justify-center text-${stat.color}-500`}>
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={stat.icon}></path></svg>
               </div>
             </div>
           );
        })}
      </div>

      {/* 3. Tabs & Filters */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div className="flex p-1 bg-white rounded-lg shadow-sm border border-slate-200">
          <button 
            onClick={() => setPipelineViewMode('kanban')}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md shadow-sm transition-all ${pipelineViewMode === 'kanban' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}>Kanban Board</button>
          <button 
            onClick={() => setPipelineViewMode('list')}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md shadow-sm transition-all ${pipelineViewMode === 'list' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}>List View</button>
          <button 
            onClick={() => setPipelineViewMode('calendar')}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md shadow-sm transition-all ${pipelineViewMode === 'calendar' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}>Calendar</button>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <select 
            className="border border-slate-200 rounded-lg text-sm px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-brand-500 shadow-sm font-medium"
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
          >
            <option value="All Customers">All Customers</option>
            {Array.from(new Set(cards.map(c => c.customer))).filter(Boolean).sort().map(customer => (
              <option key={customer} value={customer}>{customer}</option>
            ))}
          </select>
          <div className="relative">
            <input type="text" placeholder="Search cards..." className="pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm w-48 focus:outline-none focus:border-brand-500 bg-white shadow-sm" />
            <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
          <button className="p-2 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 shadow-sm transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
          </button>
          <button className="p-2 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 shadow-sm transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg>
          </button>
        </div>
      </div>

      {/* 4. Kanban Pipeline (Horizontal Scroll) */}
      {activeView === 'enquiry_list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <EnquiryModule onBack={() => setActiveView('pipeline')} />
        </div>
      ) : activeView === 'quotation_list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <QuotationModule onBack={() => setActiveView('pipeline')} />
        </div>
      ) : activeView === 'sales_order_list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <SalesOrderModule onBack={() => setActiveView('pipeline')} />
        </div>
      ) : activeView === 'inward_list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <InwardModule onBack={() => setActiveView('pipeline')} />
        </div>
      ) : activeView === 'fg_list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <FinishedGoodsModule onBack={() => setActiveView('pipeline')} />
        </div>
      ) : activeView === 'dc_list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <DeliveryChallanModule onBack={() => setActiveView('pipeline')} />
        </div>
      ) : activeView === 'invoice_list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <InvoiceModule onBack={() => setActiveView('pipeline')} />
        </div>
      ) : pipelineViewMode === 'list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <PipelineListView cards={cards} onView={openViewModal} />
        </div>
      ) : pipelineViewMode === 'calendar' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <PipelineCalendarView cards={cards} onView={openViewModal} />
        </div>
      ) : (
      <div className="overflow-x-auto scrollbar-thin pb-4 mt-2">
        <div className="flex gap-4 h-[550px] items-stretch min-w-max px-1">
          {[
            { id: 'Enquiry', title: 'ENQUIRY', desc: 'New opportunities', color: 'blue', bg: 'bg-blue-50/70', border: 'border-blue-200/60', text: 'text-blue-700' },
            { id: 'Quotation', title: 'QUOTATION', desc: 'Sent to customer', color: 'purple', bg: 'bg-purple-50/70', border: 'border-purple-200/60', text: 'text-purple-700' },
            { id: 'Sales Order', title: 'SALES ORDER', desc: 'Confirmed orders', color: 'emerald', bg: 'bg-emerald-50/70', border: 'border-emerald-200/60', text: 'text-emerald-700' },
            { id: 'Inward', title: 'INWARD', desc: 'Raw material / Purchase', color: 'orange', bg: 'bg-orange-50/70', border: 'border-orange-200/60', text: 'text-orange-700' },
            { id: 'Finished Goods', title: 'FINISHED GOODS', desc: 'Ready for delivery', color: 'teal', bg: 'bg-teal-50/70', border: 'border-teal-200/60', text: 'text-teal-700' },
            { id: 'DC', title: 'DELIVERY CHALLAN', desc: 'Dispatch to customer', color: 'rose', bg: 'bg-rose-50/70', border: 'border-rose-200/60', text: 'text-rose-700' },
            { id: 'Invoice', title: 'INVOICE', desc: 'Billed & Completed', color: 'blue', bg: 'bg-blue-50/70', border: 'border-blue-200/60', text: 'text-blue-700' }
          ].map(stage => {
            const stageCards = cards.filter(c => c.stage === stage.id && (customerFilter === 'All Customers' || c.customer === customerFilter));
            return (
              <div key={stage.id} 
                className={`w-[280px] flex-shrink-0 ${stage.bg} rounded-xl p-3 flex flex-col border ${stage.border} shadow-sm h-full`}
                onDragOver={(e) => e.preventDefault()} 
                onDrop={(e) => handleDrop(e, stage.id as Stage)}
              >
                <div className="flex justify-between items-start mb-3 px-1">
                  <div>
                    <h3 className={`font-bold text-sm tracking-wide ${stage.text}`}>{stage.title}</h3>
                    <p className="text-[10px] text-slate-500 font-medium">{stage.desc}</p>
                  </div>
                  <span className={`bg-white ${stage.text} text-xs font-bold px-2 py-0.5 rounded-full shadow-sm border ${stage.border}`}>{stageCards.length}</span>
                </div>
                
                <button className={`w-full bg-white/60 hover:bg-white border ${stage.border} border-dashed ${stage.text} text-xs font-semibold py-2 rounded-lg mb-3 shadow-sm transition-all flex items-center justify-center gap-1`}
                  onClick={() => {
                    if (stage.id === 'Enquiry') setShowNewLead(true);
                    else if (stage.id === 'Quotation') {
                      setQuoteForm({
                        quoteNo: `QT-2026-${Math.floor(1000 + Math.random() * 9000)}`, customer: '', leadNo: '', quoteDate: new Date().toISOString().split('T')[0], validTill: '', salesperson: 'Admin', contacts: [], partName: '', partNumber: '', description: '', quantity: '', unitPrice: '', discount: '0', gst: '18', paymentTerms: '', deliveryTerms: '', remarks: ''
                      });
                      setQuotationModalTarget({ id: 'dummy', stage: 'Enquiry', type: 'lead', refNo: '', customer: '', part: '', qty: 1, value: 0, date: '', raw: {} });
                    } else if (stage.id === 'Sales Order') {
                      setSoForm({
                        orderNo: `SO-2026-${Math.floor(1000 + Math.random() * 9000)}`, customer: '', orderDate: new Date().toISOString().split('T')[0], deliveryDate: new Date().toISOString().split('T')[0], partName: '', partNumber: '', quantity: '', price: '', gst: '18'
                      });
                      setSoModalTarget({ id: 'dummy', stage: 'Quotation', type: 'quotation', refNo: '', customer: '', part: '', qty: 1, value: 0, date: '', raw: {} });
                    } else if (stage.id === 'Inward') {
                      setInwardForm({
                        inwardNo: `INW-2026-${Math.floor(1000 + Math.random() * 9000)}`, category: 'CUSTOMER DC', projectName: '', salesOrderRef: '', referenceNo: '', inwardDate: new Date().toISOString().split('T')[0], partyName: '', remarks: ''
                      });
                      setInwardModalTarget({ id: 'dummy', stage: 'Sales Order', type: 'order', refNo: '', customer: '', part: '', qty: 1, value: 0, date: '', raw: {} });
                    } else if (stage.id === 'Finished Goods') {
                      setFgForm({
                        woNo: `WO-2026-${Math.floor(1000 + Math.random() * 9000)}`, customer: '', partName: '', quantity: '', date: new Date().toISOString().split('T')[0]
                      });
                      setFgModalTarget({ id: 'dummy', stage: 'Inward', type: 'inward', refNo: '', customer: '', part: '', qty: 1, value: 0, date: '', raw: {} });
                    } else if (stage.id === 'DC') {
                      setDcForm({
                        dcNo: `DC-2026-${Math.floor(1000 + Math.random() * 9000)}`, partyName: '', poNumber: '', date: new Date().toISOString().split('T')[0], partName: '', quantity: ''
                      });
                      setDcModalTarget({ id: 'dummy', stage: 'Finished Goods', type: 'finished_goods', refNo: '', customer: '', part: '', qty: 1, value: 0, date: '', raw: {} });
                    } else if (stage.id === 'Invoice') {
                      setInvoiceForm({
                        invoiceNo: `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`, partyName: '', date: new Date().toISOString().split('T')[0], partName: '', quantity: '', amount: ''
                      });
                      setInvoiceModalTarget({ id: 'dummy', stage: 'DC', type: 'dc', refNo: '', customer: '', part: '', qty: 1, value: 0, date: '', raw: {} });
                    }
                  }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                  Add {stage.title === 'DELIVERY CHALLAN' ? 'Delivery Challan' : stage.title === 'FINISHED GOODS' ? 'Finished Good' : stage.id}
                </button>

                <div className="flex-1 overflow-y-auto scrollbar-thin space-y-3 pb-2 pr-1">
                  {stageCards.map(card => (
                    <div 
                      key={card.id} 
                      draggable 
                      onDragStart={(e) => handleDragStart(e, card)}
                        onDragEnd={() => setDraggedCard(null)} 
                      onClick={() => openViewModal(card)}
                      className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer group"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[11px] font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded font-mono">{card.refNo}</span>
                        <span className="text-[10px] text-slate-500 font-medium">{card.date || 'No Date'}</span>
                      </div>
                      
                      <h4 className="font-bold text-[13px] text-slate-800 mb-0.5 line-clamp-1">{card.customer}</h4>
                      <p className="text-xs text-slate-600 mb-3 line-clamp-1">{card.part}</p>
                      
                      <div className="flex justify-between items-end">
                        <div>
                          {card.value > 0 ? (
                             <p className="text-sm font-bold text-slate-800">₹{Number(card.value).toLocaleString('en-IN')}</p>
                          ) : (
                             <p className="text-xs font-medium text-slate-600">{card.qty} pcs</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${stage.bg} ${stage.text} border ${stage.border}`}>
                            {card.status || stage.id}
                          </span>
                          <div className="flex -space-x-1">
                            <div className="w-5 h-5 rounded-full bg-slate-200 border border-white flex items-center justify-center text-[8px] font-bold text-slate-600" title="Assigned User">
                              {card.raw?.contact_person ? card.raw.contact_person.substring(0, 2).toUpperCase() : (card.customer ? card.customer.substring(0, 2).toUpperCase() : 'AD')}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-slate-50 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span 
                          className="text-[10px] font-medium text-slate-500 flex items-center gap-1 hover:text-brand-600 transition-colors z-10 relative"
                          onClick={(e) => { e.stopPropagation(); setActiveCommentTarget(card); }}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg> 
                          {commentCounts[card.id] || 0}
                        </span>
                        <span className="text-[10px] font-bold text-brand-600">View details →</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* 5. Bottom Section */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            Recent Activities
          </h3>
          <div className="space-y-4">
            {recentActivities.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No recent activities</p>
            ) : (
              recentActivities.map((act, i) => (
                <div key={i} className="flex gap-3">
                  <div className={`w-2 h-2 rounded-full ${act.color} mt-1.5 flex-shrink-0`}></div>
                  <div>
                    <p className="text-xs text-slate-700"><span className="font-semibold">{act.ref || 'Record'}</span> {act.action}{act.customer ? ` for ${act.customer}` : ''}</p>
                    <p className="text-[10px] text-slate-500 font-medium mt-0.5">{act.time ? new Date(act.time).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : ''}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
            Pipeline Summary
          </h3>
          <div className="space-y-3">
            {columns.map(col => {
              const count = cards.filter(c => c.stage === col).length;
              return (
                <div key={col} className="flex items-center justify-between">
                  <span className="text-xs text-slate-600 font-medium">{col}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-500 rounded-full" style={{ width: `${Math.min(100, (count / Math.max(1, cards.length)) * 100)}%` }}></div>
                    </div>
                    <span className="text-xs font-bold text-slate-700 w-6 text-right">{count}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 relative overflow-hidden">
          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2 relative z-10">
            <svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            Quick Links
          </h3>
          <div className="grid grid-cols-2 gap-2 relative z-10">
            <button onClick={() => setShowNewLead(true)} className="text-left text-xs font-semibold text-slate-600 hover:text-brand-600 hover:bg-brand-50 px-3 py-2 rounded-lg transition-colors border border-transparent hover:border-brand-100">New Enquiry</button>
            <button onClick={() => setActiveView('quotation_list')} className="text-left text-xs font-semibold text-slate-600 hover:text-brand-600 hover:bg-brand-50 px-3 py-2 rounded-lg transition-colors border border-transparent hover:border-brand-100">New Quotation</button>
            <button onClick={() => setActiveView('sales_order_list')} className="text-left text-xs font-semibold text-slate-600 hover:text-brand-600 hover:bg-brand-50 px-3 py-2 rounded-lg transition-colors border border-transparent hover:border-brand-100">New Sales Order</button>
            <button onClick={() => setActiveView('inward_list')} className="text-left text-xs font-semibold text-slate-600 hover:text-brand-600 hover:bg-brand-50 px-3 py-2 rounded-lg transition-colors border border-transparent hover:border-brand-100">New Inward</button>
          </div>
          
          <div className="mt-6 pt-4 border-t border-slate-100 relative z-10 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ARGUSCNC™</p>
              <p className="text-xs font-bold text-slate-800">Manufacturing Made Simple</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center text-brand-600 shadow-sm border border-brand-100">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            </div>
          </div>
        </div>
      </div>

      {/* New Lead Modal */}
      <Modal open={showNewLead} onClose={() => setShowNewLead(false)} title="Create New Lead" size="lg" footer={<><Button variant="secondary" onClick={() => setShowNewLead(false)}>Cancel</Button><Button onClick={saveNewLead}>Save Lead</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Project Name" required><input className={inputClass} value={newLeadForm.leadNo} disabled /></FormField>
          <div className="relative">
            <FormField label="Company Name" required>
              <input 
                className={inputClass} 
                value={newLeadForm.company} 
                onChange={e => {
                  setNewLeadForm({...newLeadForm, company: e.target.value});
                  setShowCustomerDropdown(true);
                }} 
                onFocus={() => setShowCustomerDropdown(true)}
                onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                placeholder="e.g. Acme Corp"
                autoComplete="off"
              />
            </FormField>
            {(() => {
              const compMap = new Map();
              const combined: any[] = [];
              customerList.forEach(c => {
                const k = c.name?.toLowerCase();
                if (k && !compMap.has(k)) {
                  compMap.set(k, true);
                  combined.push({ id: c.id, name: c.name, contact: c.contact, phone: c.phone, email: c.email, city: c.city });
                }
              });
              // Use cards which contains all pipeline leads!
              cards.forEach(card => {
                const k = card.customer?.toLowerCase();
                if (k && !compMap.has(k)) {
                  compMap.set(k, true);
                  // parse contacts from card.raw
                  const p = (card.raw.contact_person || '').split(' | ')[0] || '';
                  const ph = (card.raw.phone || '').split(' | ')[0] || '';
                  const em = (card.raw.email || '').split(' | ')[0] || '';
                  combined.push({ id: card.id, name: card.customer, contact: p, phone: ph, email: em, city: card.raw.city || '' });
                }
              });
              const matches = newLeadForm.company ? combined.filter(c => c.name.toLowerCase().includes(newLeadForm.company.toLowerCase())) : [];
              
              if (!showCustomerDropdown || !newLeadForm.company) return null;
              
              return (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  {matches.length > 0 ? (
                    matches.map(c => (
                      <div 
                        key={c.id} 
                        className="px-4 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0"
                        onMouseDown={(e) => {
                          e.preventDefault(); 
                          setNewLeadForm({
                            ...newLeadForm,
                            company: c.name,
                            contacts: [{ person: c.contact || '', phone: c.phone || '', email: c.email || '' }],
                            city: c.city || ''
                          });
                          setShowCustomerDropdown(false);
                        }}
                      >
                        <div className="font-semibold text-sm text-slate-800">{c.name}</div>
                        <div className="text-xs text-slate-500">{c.city ? `${c.city} • ` : ''}{c.contact || 'No contact info'}</div>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-sm text-slate-500 italic">No matching companies</div>
                  )}
                </div>
              );
            })()}
          </div>
          <div className="col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-500 uppercase">Contact Persons</label>
              <button onClick={() => setNewLeadForm({...newLeadForm, contacts: [...newLeadForm.contacts, { person: '', phone: '', email: '' }]})} className="text-xs text-blue-600 font-bold flex items-center gap-1">+ Add Contact</button>
            </div>
            {newLeadForm.contacts.map((c: any, i: number) => (
              <div key={i} className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <input placeholder="Name" className={inputClass} value={c.person} onChange={e => { const nc = [...newLeadForm.contacts]; nc[i].person = e.target.value; setNewLeadForm({...newLeadForm, contacts: nc}); }} />
                <input placeholder="Phone" className={inputClass} value={c.phone} onChange={e => { const nc = [...newLeadForm.contacts]; nc[i].phone = e.target.value; setNewLeadForm({...newLeadForm, contacts: nc}); }} />
                <input placeholder="Email" className={inputClass} value={c.email} onChange={e => { const nc = [...newLeadForm.contacts]; nc[i].email = e.target.value; setNewLeadForm({...newLeadForm, contacts: nc}); }} />
              </div>
            ))}
          </div>
          <FormField label="Address"><input className={inputClass} value={newLeadForm.city} onChange={e => setNewLeadForm({...newLeadForm, city: e.target.value})} /></FormField>
          <FormField label="GST No."><input className={inputClass} value={newLeadForm.gst} onChange={e => setNewLeadForm({...newLeadForm, gst: e.target.value})} /></FormField>
          <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Products / Parts Required *</label>
              <div className="space-y-2">
                {(newLeadForm.items || [{ partName: '', quantity: '' }]).map((item, idx) => (
                  <div key={idx} className="flex gap-4 items-start">
                    <div className="flex-1">
                      <input className={inputClass} placeholder="Part Name" value={item.partName} onChange={e => {
                        const newItems = [...(newLeadForm.items || [])];
                        newItems[idx].partName = e.target.value;
                        setNewLeadForm({...newLeadForm, items: newItems, partName: newItems[0].partName});
                      }} />
                    </div>
                    <div className="w-32">
                      <input type="number" className={inputClass} placeholder="Qty" value={item.quantity} onChange={e => {
                        const newItems = [...(newLeadForm.items || [])];
                        newItems[idx].quantity = e.target.value;
                        setNewLeadForm({...newLeadForm, items: newItems, quantity: newItems[0].quantity});
                      }} />
                    </div>
                    {idx > 0 && (
                      <button type="button" className="p-2 text-red-500 hover:bg-red-50 rounded mt-1" onClick={() => {
                        const newItems = newLeadForm.items.filter((_, i) => i !== idx);
                        setNewLeadForm({...newLeadForm, items: newItems});
                      }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" className="text-xs font-medium text-brand-600 hover:text-brand-800 flex items-center gap-1 mt-2" onClick={() => {
                  setNewLeadForm({...newLeadForm, items: [...(newLeadForm.items || []), { partName: '', quantity: '' }]});
                }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  Add Another Part
                </button>
              </div>
            </div>
          <FormField label="Source">
            <select className={inputClass} value={newLeadForm.source} onChange={e => setNewLeadForm({...newLeadForm, source: e.target.value})}>
              <option>Direct</option><option>Website</option><option>Referral</option><option>Phone</option><option>Email</option><option>Other</option>
            </select>
          </FormField>
          <div className="col-span-2 mt-2">
            <FormField label="Attach Drawings / PDF / Images">
              <div>
                <div 
                  className="border-2 border-dashed border-slate-300 rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors cursor-pointer" 
                  onClick={() => document.getElementById('lead-upload')?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    if (e.dataTransfer.files) {
                      setNewLeadForm({...newLeadForm, files: [...newLeadForm.files, ...Array.from(e.dataTransfer.files)]});
                    }
                  }}
                >
                  <UploadCloud size={24} className="text-slate-400 mb-2" />
                  <span className="text-sm font-medium text-slate-700">Click to upload or drag and drop</span>
                  <span className="text-xs text-slate-500 mt-1">All formats supported (CAD, 3D, PDF, Images)</span>
                  <input type="file" id="lead-upload" className="hidden" multiple accept="*" onChange={(e) => {
                    if (e.target.files) {
                      setNewLeadForm({...newLeadForm, files: [...newLeadForm.files, ...Array.from(e.target.files)]});
                    }
                  }} />
                </div>
                {newLeadForm.files.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2">
                    {newLeadForm.files.map((f: File, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 border border-slate-200 rounded text-sm bg-white">
                        <span className="truncate">{f.name}</span>
                        <button className="text-red-500 hover:text-red-700 px-2" onClick={(e) => {
                          e.stopPropagation();
                          setNewLeadForm({...newLeadForm, files: newLeadForm.files.filter((_, idx) => idx !== i)});
                        }}>Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </FormField>
          </div>
        </div>
      </Modal>

      {/* Enquiry Modal */}
      <Modal open={enquiryModalOpen} onClose={() => { setEnquiryModalOpen(false); setEnquiryForm(resetEnquiryForm()); }} title="New Enquiry" size="lg" footer={<><Button variant="secondary" onClick={() => setEnquiryModalOpen(false)}>Cancel</Button><Button onClick={saveEnquiry}>Save Enquiry</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Project Name" required><input className={inputClass} value={enquiryForm.leadNo} onChange={e => setEnquiryForm({...enquiryForm, leadNo: e.target.value})} /></FormField>
          <div className="relative">
            <FormField label="Company Name" required>
              <input 
                className={inputClass} 
                value={enquiryForm.company} 
                onChange={e => handleCompanyChange(e.target.value)}
                onFocus={() => setCompanySearchFocused(true)}
                onBlur={() => setTimeout(() => setCompanySearchFocused(false), 200)}
                placeholder="Type or select company..." 
              />
              {companySearchFocused && knownCompanies.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-[100%] mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {knownCompanies.filter(c => c.company.toLowerCase().includes(enquiryForm.company.toLowerCase())).map((c, i) => (
                    <div 
                      key={i} 
                      className="px-3 py-2 text-sm text-slate-700 hover:bg-brand-50 cursor-pointer"
                      onClick={() => {
                        handleCompanyChange(c.company);
                        setCompanySearchFocused(false);
                      }}
                    >
                      {c.company}
                    </div>
                  ))}
                  {knownCompanies.filter(c => c.company.toLowerCase().includes(enquiryForm.company.toLowerCase())).length === 0 && (
                     <div className="px-3 py-2 text-sm text-slate-500 italic">Press enter to add new</div>
                  )}
                </div>
              )}
            </FormField>
          </div>
          
          <div className="col-span-2 mt-2 pt-2">
             <ContactsList form={enquiryForm} setForm={setEnquiryForm} />
          </div>

          <div className="col-span-2 border-t border-slate-100 mt-2 pt-4">
             <h4 className="font-semibold text-sm text-slate-800 mb-4">Enquiry Details</h4>
          </div>
          
          <FormField label="Part Name" required><input className={inputClass} value={enquiryForm.partName} onChange={e => setEnquiryForm({...enquiryForm, partName: e.target.value})} /></FormField>
          
          <FormField label="Quantity"><input type="number" className={inputClass} value={enquiryForm.quantity} onChange={e => setEnquiryForm({...enquiryForm, quantity: e.target.value})} /></FormField>
          <FormField label="Estimated Value (Rs.)"><input type="number" className={inputClass} value={enquiryForm.estimatedValue} onChange={e => setEnquiryForm({...enquiryForm, estimatedValue: e.target.value})} /></FormField>
          <FormField label="Expected Date"><input type="date" className={inputClass} value={enquiryForm.expectedDate} onChange={e => setEnquiryForm({...enquiryForm, expectedDate: e.target.value})} /></FormField>
          <FormField label="Received Date"><input type="date" className={inputClass} value={enquiryForm.receivedDate} onChange={e => setEnquiryForm({...enquiryForm, receivedDate: e.target.value})} /></FormField>
          <FormField label="Source">
            <select className={inputClass} value={enquiryForm.source} onChange={e => setEnquiryForm({...enquiryForm, source: e.target.value})}>
               <option value="Direct">Direct</option>
               <option value="Email">Email</option>
               <option value="Phone">Phone</option>
               <option value="Website">Website</option>
               <option value="Referral">Referral</option>
            </select>
          </FormField>
          <div className="col-span-2 mt-2">
            <FormField label="Attach Drawings / PDF / Images">
              <div>
                <div 
                  className="border-2 border-dashed border-slate-300 rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors cursor-pointer" 
                  onClick={() => document.getElementById('enquiry-upload')?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    if (e.dataTransfer.files) {
                      setEnquiryForm({...enquiryForm, files: [...enquiryForm.files, ...Array.from(e.dataTransfer.files)]});
                    }
                  }}
                >
                  <UploadCloud size={24} className="text-slate-400 mb-2" />
                  <span className="text-sm font-medium text-slate-700">Click to upload or drag and drop</span>
                  <span className="text-xs text-slate-500 mt-1">All formats supported (CAD, 3D, PDF, Images)</span>
                  <input type="file" id="enquiry-upload" className="hidden" multiple accept="*" onChange={(e) => {
                    if (e.target.files) {
                      setEnquiryForm({...enquiryForm, files: [...enquiryForm.files, ...Array.from(e.target.files)]});
                    }
                  }} />
                </div>
                {enquiryForm.files.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2">
                    {enquiryForm.files.map((f: File, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 border border-slate-200 rounded text-sm bg-white">
                        <span className="truncate">{f.name}</span>
                        <button className="text-red-500 hover:text-red-700 px-2" onClick={(e) => {
                          e.stopPropagation();
                          setEnquiryForm({...enquiryForm, files: enquiryForm.files.filter((_, idx) => idx !== i)});
                        }}>Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </FormField>
          </div>
        </div>
      </Modal>

      {/* Quotation Modal */}
      <Modal open={!!quotationModalTarget} onClose={() => setQuotationModalTarget(null)} title="Create Quotation" size="lg" footer={<><Button variant="secondary" onClick={() => setQuotationModalTarget(null)}>Cancel</Button><Button onClick={saveQuotation}>Create Quotation</Button></>}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-4 pb-4 border-b border-slate-100">
            <FormField label="Quotation No." required><input className={inputClass} value={quoteForm.quoteNo} disabled /></FormField>
            <FormField label="Customer" required><input className={inputClass} value={quoteForm.customer} disabled /></FormField>
            <FormField label="Enquiry / Lead No." required><input className={inputClass} value={quoteForm.leadNo} disabled /></FormField>
            <FormField label="Quotation Date" required><input type="date" className={inputClass} value={quoteForm.quoteDate} onChange={e=>setQuoteForm({...quoteForm, quoteDate: e.target.value})} /></FormField>
            <FormField label="Valid Till" required><input type="date" className={inputClass} value={quoteForm.validTill} onChange={e=>setQuoteForm({...quoteForm, validTill: e.target.value})} /></FormField>
            <FormField label="Salesperson"><input className={inputClass} value={quoteForm.salesperson} onChange={e=>setQuoteForm({...quoteForm, salesperson: e.target.value})} /></FormField>
          </div>
          <ContactsList form={quoteForm} setForm={setQuoteForm} />
          <h4 className="font-semibold text-sm text-slate-800">Item Details</h4>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Part / Product Name" required><input className={inputClass} value={quoteForm.partName} onChange={e=>setQuoteForm({...quoteForm, partName: e.target.value})} /></FormField>
            
            <FormField label="Description"><input className={inputClass} value={quoteForm.description} onChange={e=>setQuoteForm({...quoteForm, description: e.target.value})} /></FormField>
            <FormField label="Quantity" required><input type="number" className={inputClass} value={quoteForm.quantity} onChange={e=>setQuoteForm({...quoteForm, quantity: e.target.value})} /></FormField>
            <FormField label="Unit Price" required><input type="number" className={inputClass} value={quoteForm.unitPrice} onChange={e=>setQuoteForm({...quoteForm, unitPrice: e.target.value})} /></FormField>
            <FormField label="Discount %"><input type="number" className={inputClass} value={quoteForm.discount} onChange={e=>setQuoteForm({...quoteForm, discount: e.target.value})} /></FormField>
            <FormField label="GST %"><input type="number" className={inputClass} value={quoteForm.gst} onChange={e=>setQuoteForm({...quoteForm, gst: e.target.value})} /></FormField>
            <FormField label="Total Amount (Rs.)"><input className={`${inputClass} bg-slate-100 font-bold`} value={calcQuoteTotal()} disabled /></FormField>
          </div>
          <h4 className="font-semibold text-sm text-slate-800 border-t border-slate-100 pt-4">Additional Details</h4>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Payment Terms"><input className={inputClass} value={quoteForm.paymentTerms} onChange={e=>setQuoteForm({...quoteForm, paymentTerms: e.target.value})} /></FormField>
            <FormField label="Delivery Terms"><input className={inputClass} value={quoteForm.deliveryTerms} onChange={e=>setQuoteForm({...quoteForm, deliveryTerms: e.target.value})} /></FormField>
            <div className="col-span-2"><FormField label="Notes / Remarks"><textarea className={inputClass} rows={2} value={quoteForm.remarks} onChange={e=>setQuoteForm({...quoteForm, remarks: e.target.value})}></textarea></FormField></div>
          </div>
        </div>
      </Modal>

      

      {/* Inward Modal */}
      <Modal open={!!inwardModalTarget} onClose={() => setInwardModalTarget(null)} title="Create Inward Entry" size="lg" footer={<><Button variant="secondary" onClick={() => setInwardModalTarget(null)}>Cancel</Button><Button onClick={saveInward}>Create Inward</Button></>}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-4 pb-4 border-b border-slate-100">
            <FormField label="Inward No." required><input className={inputClass} value={inwardForm.inwardNo} disabled /></FormField>
            <FormField label="Category" required>
              <select className={inputClass} value={inwardForm.category} onChange={e=>setInwardForm({...inwardForm, category: e.target.value})}>
                <option>EXPENSES</option>
                <option>CUSTOMER DC</option>
                <option>NEW PROJECT</option>
                <option>NO DC</option>
                <option>GOODS PURCHASE</option>
                <option>SERVICE PURCHASE</option>
              </select>
            </FormField>
            <FormField label="Project Name"><input className={inputClass} value={inwardForm.projectName} onChange={e=>setInwardForm({...inwardForm, projectName: e.target.value})} /></FormField>
            <FormField label="Sales Order Reference"><input className={inputClass} value={inwardForm.salesOrderRef} disabled /></FormField>
            <FormField label="Reference No."><input className={inputClass} value={inwardForm.referenceNo} onChange={e=>setInwardForm({...inwardForm, referenceNo: e.target.value})} placeholder="e.g. DC/Invoice No" /></FormField>
            <FormField label="Inward Date" required><input type="date" className={inputClass} value={inwardForm.inwardDate} onChange={e=>setInwardForm({...inwardForm, inwardDate: e.target.value})} /></FormField>
            <FormField label="Party / Customer"><input className={inputClass} value={inwardForm.partyName} disabled /></FormField>
            <FormField label="Upload Ref Image"><input type="file" className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100" /></FormField>
            <div className="col-span-3">
              <FormField label="Remarks"><input className={inputClass} value={inwardForm.remarks} onChange={e=>setInwardForm({...inwardForm, remarks: e.target.value})} /></FormField>
            </div>
          </div>
          
          <ContactsList form={inwardForm} setForm={setInwardForm} />

          <h4 className="font-semibold text-sm text-slate-800">Part Details</h4>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Part Name" required><input className={inputClass} value={inwardForm.partName} onChange={e=>setInwardForm({...inwardForm, partName: e.target.value})} /></FormField>
            
            <FormField label="Quantity" required><input type="number" className={inputClass} value={inwardForm.quantity} onChange={e=>setInwardForm({...inwardForm, quantity: e.target.value})} /></FormField>
            <FormField label="Price" required><input type="number" className={inputClass} value={inwardForm.price} onChange={e=>setInwardForm({...inwardForm, price: e.target.value})} /></FormField>
            <FormField label="Discount %"><input type="number" className={inputClass} value={inwardForm.discount} onChange={e=>setInwardForm({...inwardForm, discount: e.target.value})} /></FormField>
            <FormField label="GST %"><input type="number" className={inputClass} value={inwardForm.gst} onChange={e=>setInwardForm({...inwardForm, gst: e.target.value})} /></FormField>
            <FormField label="Total Amount (Rs.)"><input className={`${inputClass} bg-slate-100 font-bold`} value={calcInwardTotal()} disabled /></FormField>
          </div>
        </div>
      </Modal>

      {/* Generic View Modal */}

      {/* Finished Goods Modal */}
      <Modal open={!!fgModalTarget} onClose={() => setFgModalTarget(null)} title="Finished Goods Entry" size="lg" footer={<><Button variant="secondary" onClick={() => setFgModalTarget(null)}>Cancel</Button><Button onClick={saveFinishedGoods}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Category" required><select className={inputClass}><option>Finished Goods</option></select></FormField>
          <FormField label="Date" required><input type="date" className={inputClass} value={fgForm.date || ''} onChange={e=>setFgForm({...fgForm, date: e.target.value})} /></FormField>
          <FormField label="Project / Customer"><input className={inputClass} value={fgForm.customer || ''} onChange={e=>setFgForm({...fgForm, customer: e.target.value})} /></FormField>
          <FormField label="Part Name"><input className={inputClass} value={fgForm.partName || ''} onChange={e=>setFgForm({...fgForm, partName: e.target.value})} /></FormField>
          <FormField label="Max Available Quantity (from Inward)"><input type="number" className={`${inputClass} bg-slate-100 font-bold`} value={fgForm.orderQty || ''} disabled /></FormField>
          <FormField label="Quantity to Process" required><input type="number" className={inputClass} value={fgForm.completedQty || ''} onChange={e=>setFgForm({...fgForm, completedQty: e.target.value})} /></FormField>
        </div>
      </Modal>

      {/* Delivery Challan Modal */}
      <Modal open={!!dcModalTarget} onClose={() => setDcModalTarget(null)} title="Delivery Challan Form" size="lg" footer={<><Button variant="secondary" onClick={() => setDcModalTarget(null)}>Cancel</Button><Button onClick={saveDeliveryChallan}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="DC No" required><input className={inputClass} value={dcForm.dcNo || ''} onChange={e=>setDcForm({...dcForm, dcNo: e.target.value})} /></FormField>
          <FormField label="Date" required><input type="date" className={inputClass} value={dcForm.date || ''} onChange={e=>setDcForm({...dcForm, date: e.target.value})} /></FormField>
          <FormField label="Party Name" required><input className={inputClass} value={dcForm.partyName || ''} onChange={e=>setDcForm({...dcForm, partyName: e.target.value})} /></FormField>
          <FormField label="PO / WO Number"><input className={inputClass} value={dcForm.poNumber || ''} onChange={e=>setDcForm({...dcForm, poNumber: e.target.value})} /></FormField>
          <FormField label="Vehicle No"><input className={inputClass} value={dcForm.vehicleNo || ''} onChange={e=>setDcForm({...dcForm, vehicleNo: e.target.value})} /></FormField>
          <FormField label="E-Way Bill No"><input className={inputClass} value={dcForm.ewayBill || ''} onChange={e=>setDcForm({...dcForm, ewayBill: e.target.value})} /></FormField>
          <div className="col-span-2 border-t border-slate-100 mt-2 pt-4">
            <h4 className="font-semibold text-sm text-slate-800 mb-3">Part Details</h4>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Part Name" required><input className={inputClass} value={dcForm.partName || ''} onChange={e=>setDcForm({...dcForm, partName: e.target.value})} /></FormField>
              <FormField label="Quantity" required><input type="number" className={inputClass} value={dcForm.quantity || ''} onChange={e=>setDcForm({...dcForm, quantity: e.target.value})} /></FormField>
              <FormField label="Price"><input type="number" className={inputClass} value={dcForm.price || ''} onChange={e=>setDcForm({...dcForm, price: e.target.value})} /></FormField>
            </div>
          </div>
        </div>
      </Modal>

      {/* Invoice Modal */}
      <Modal open={!!invoiceModalTarget} onClose={() => setInvoiceModalTarget(null)} title="Billing System" size="lg" footer={<><Button variant="secondary" onClick={() => setInvoiceModalTarget(null)}>Cancel</Button><Button onClick={saveInvoice}>Submit</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Document Type" required><select className={inputClass}><option>Tax Invoice</option></select></FormField>
          <FormField label="Invoice No" required><input className={inputClass} value={invoiceForm.invoiceNo || ''} onChange={e=>setInvoiceForm({...invoiceForm, invoiceNo: e.target.value})} /></FormField>
          <FormField label="Party Name" required><input className={inputClass} value={invoiceForm.partyName || ''} onChange={e=>setInvoiceForm({...invoiceForm, partyName: e.target.value})} /></FormField>
          <FormField label="DC Number"><input className={inputClass} value={invoiceForm.dcNumber || ''} onChange={e=>setInvoiceForm({...invoiceForm, dcNumber: e.target.value})} /></FormField>
          <FormField label="Date" required><input type="date" className={inputClass} value={invoiceForm.date || ''} onChange={e=>setInvoiceForm({...invoiceForm, date: e.target.value})} /></FormField>
          <div className="col-span-2 border-t border-slate-100 mt-2 pt-4">
            <h4 className="font-semibold text-sm text-slate-800 mb-3">Item Details</h4>
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-2"><FormField label="Item Name" required><input className={inputClass} value={invoiceForm.partName || ''} onChange={e=>setInvoiceForm({...invoiceForm, partName: e.target.value})} /></FormField></div>
              <FormField label="Qty" required><input type="number" className={inputClass} value={invoiceForm.quantity || ''} onChange={e=>setInvoiceForm({...invoiceForm, quantity: e.target.value})} /></FormField>
              <FormField label="Unit Price" required><input type="number" className={inputClass} value={invoiceForm.price || ''} onChange={e=>setInvoiceForm({...invoiceForm, price: e.target.value})} /></FormField>
              <FormField label="CGST (%)"><input type="number" className={inputClass} value={invoiceForm.cgst || ''} onChange={e=>setInvoiceForm({...invoiceForm, cgst: e.target.value})} /></FormField>
              <FormField label="SGST (%)"><input type="number" className={inputClass} value={invoiceForm.sgst || ''} onChange={e=>setInvoiceForm({...invoiceForm, sgst: e.target.value})} /></FormField>
              <FormField label="IGST (%)"><input type="number" className={inputClass} value={invoiceForm.igst || ''} onChange={e=>setInvoiceForm({...invoiceForm, igst: e.target.value})} /></FormField>
              <FormField label="Total Amount"><input type="text" className={`${inputClass} bg-slate-100 font-bold`} value={((Number(invoiceForm.quantity)||0) * (Number(invoiceForm.price)||0) * (1 + ((Number(invoiceForm.cgst)||0) + (Number(invoiceForm.sgst)||0) + (Number(invoiceForm.igst)||0))/100)).toFixed(2)} disabled /></FormField>
            </div>
          </div>
        </div>
      </Modal>

      
      {/* Sales Order Modal */}
      <Modal open={!!soModalTarget} onClose={() => setSoModalTarget(null)} title="Create Sales Order" size="lg" footer={<><Button variant="secondary" onClick={() => setSoModalTarget(null)}>Cancel</Button><Button onClick={saveStandaloneSalesOrder}>Save Order</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Order No" required><input className={inputClass} value={soForm.orderNo || ''} onChange={e=>setSoForm({...soForm, orderNo: e.target.value})} /></FormField>
          <FormField label="Customer" required><input className={inputClass} value={soForm.customer || ''} onChange={e=>setSoForm({...soForm, customer: e.target.value})} /></FormField>
          <FormField label="Order Date" required><input type="date" className={inputClass} value={soForm.orderDate || ''} onChange={e=>setSoForm({...soForm, orderDate: e.target.value})} /></FormField>
          <FormField label="Delivery Date" required><input type="date" className={inputClass} value={soForm.deliveryDate || ''} onChange={e=>setSoForm({...soForm, deliveryDate: e.target.value})} /></FormField>
          <FormField label="Part Name" required><input className={inputClass} value={soForm.partName || ''} onChange={e=>setSoForm({...soForm, partName: e.target.value})} /></FormField>
          
          <FormField label="Quantity" required><input type="number" className={inputClass} value={soForm.quantity || ''} onChange={e=>setSoForm({...soForm, quantity: e.target.value})} /></FormField>
          <FormField label="Unit Price" required><input type="number" className={inputClass} value={soForm.price || ''} onChange={e=>setSoForm({...soForm, price: e.target.value})} /></FormField>
          <FormField label="GST (%)"><input type="number" className={inputClass} value={soForm.gst || ''} onChange={e=>setSoForm({...soForm, gst: e.target.value})} /></FormField>
        </div>
      </Modal>
<Modal open={!!viewModalTarget} onClose={closeViewModal} title={`Pipeline History: ${viewModalData?.enquiry?.lead_no || viewModalData?.enquiry?.enquiry_no || viewModalTarget?.refNo}`} size="xl" footer={<><Button variant={viewEditMode ? 'primary' : 'secondary'} onClick={() => setViewEditMode(!viewEditMode)}>{viewEditMode ? 'Done Editing' : 'Enable Inline Editing'}</Button><Button variant="secondary" onClick={closeViewModal}>Close</Button></>}>
        {viewModalData ? (
          <div className="flex flex-col max-h-[75vh] overflow-y-auto pr-2">
             {renderRecordData('Enquiry', viewModalData.enquiry)}
             {renderRecordData('Quotation', viewModalData.quotation)}
             {renderRecordData('Sales Order', viewModalData.order)}
             {renderRecordData('Inward', viewModalData.inward)}
             {renderRecordData('Finished Goods', viewModalData?.finished_goods)}
             {renderRecordData('DC', viewModalData?.dc)}
             {renderRecordData('Invoice', viewModalData?.invoice)}
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500">Loading historical data...</div>
        )}
      </Modal>

      {activeCommentTarget && (
        <CommentsModal 
          isOpen={true} 
          onClose={() => { setActiveCommentTarget(null); fetchPipeline(); }} 
          recordId={activeCommentTarget.id} 
          recordTitle={activeCommentTarget.refNo} 
        />
      )}

    </div>
  );
}
