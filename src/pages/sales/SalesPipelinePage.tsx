import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader, DateSelector } from '@/components/ui/PageHeader';
import { StatCard, Badge, Button } from '@/components/ui/Card';
import { Modal, FormField, inputClass } from '@/components/ui/Modal';
import { FileText, Plus, Archive, Trash2, Eye } from 'lucide-react';

type Stage = 'Enquiry' | 'Quotation' | 'Sales Order' | 'Inward';

type KanbanCard = {
  id: string;
  stage: Stage;
  type: 'lead' | 'quotation' | 'order' | 'inward';
  refNo: string;
  customer: string;
  part: string;
  qty: number;
  value: number;
  date: string;
  status: string;
  raw: any;
};

const formatINR = (value: number) => {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);
};

const renderRecordData = (title: string, raw: any) => {
  if (!raw) return null;
  return (
    <div className="mb-6">
      <h4 className="font-bold text-sm text-brand-800 border-b border-brand-100 pb-2 mb-3 uppercase">{title} Details</h4>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 bg-slate-50 p-4 rounded-lg border border-slate-100">
        {Object.entries(raw).map(([key, value]) => {
          if (key === 'id' || key.endsWith('_id') || value === null || value === '' || key === 'items' || key === 'contacts') return null;
          const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          return (
            <div key={key}>
              <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">{formattedKey}</span>
              <span className="text-sm text-slate-800 font-medium break-words">{String(value)}</span>
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
    </div>
  );
};

export function SalesPipelinePage() {
  const columns: Stage[] = ['Enquiry', 'Quotation', 'Sales Order', 'Inward'];
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [loading, setLoading] = useState(true);

  const [enquiryModalOpen, setEnquiryModalOpen] = useState(false);
  const [quotationModalTarget, setQuotationModalTarget] = useState<KanbanCard | null>(null);
  const [orderModalTarget, setOrderModalTarget] = useState<KanbanCard | null>(null);
  const [inwardModalTarget, setInwardModalTarget] = useState<KanbanCard | null>(null);
  const [viewModalTarget, setViewModalTarget] = useState<KanbanCard | null>(null);
  const [viewModalData, setViewModalData] = useState<any>(null);

  const resetEnquiryForm = () => ({
    leadNo: `PROJ-${Math.floor(1000 + Math.random() * 9000)}`,
    company: '', partName: '', partNumber: '', quantity: '', expectedDate: '', source: 'Direct',
    contacts: [{ person: '', phone: '', email: '' }]
  });
  const [enquiryForm, setEnquiryForm] = useState(resetEnquiryForm());

  const [quoteForm, setQuoteForm] = useState<any>({
    quoteNo: '', customer: '', leadNo: '', quoteDate: '', validTill: '', salesperson: 'Admin',
    contacts: [{ person: '', phone: '', email: '' }],
    partName: '', partNumber: '', description: '', quantity: '', unitPrice: '', discount: '0', gst: '18',
    paymentTerms: '', deliveryTerms: '', remarks: ''
  });

  const [orderForm, setOrderForm] = useState<any>({
    customer: '', quoteNo: '', leadNo: '',
    contacts: [{ person: '', phone: '', email: '' }],
    billingAddress: '', deliveryAddress: '', shippingContact: '', shippingPhone: '',
    orderNo: '', orderDate: '', deliveryDate: '', paymentTerms: 'Net 30',
    customerPoNo: '', customerPoDate: '',
    items: [{ partName: '', partNumber: '', description: '', quantity: 1, unitPrice: 0, discount: 0, gst: 18 }],
    specialInstructions: '', internalRemarks: ''
  });

  const [inwardForm, setInwardForm] = useState<any>({
    inwardNo: '', category: 'CUSTOMER DC', projectName: '', salesOrderRef: '', referenceNo: '', inwardDate: '', partyName: '', remarks: '',
    partName: '', partNumber: '', quantity: '', price: '', discount: '0', gst: '18',
    contacts: [{ person: '', phone: '', email: '' }]
  });

  const fetchPipeline = async () => {
    setLoading(true);
    const { data: leads } = await supabase.from('cnc_enquiries').select('*').in('status', ['New', 'Contacted', 'Qualified', 'Under Review']);
    const { data: quotes } = await supabase.from('cnc_quotations').select('*').in('status', ['Sent', 'Under Review', 'Draft', 'Accepted']);
    const { data: orders } = await supabase.from('cnc_sales_orders').select('*').in('status', ['Draft', 'Confirmed', 'In Production']);
    const { data: inwards, error: inwardErr } = await supabase.from('cnc_inwards').select('*').neq('status', 'Deleted');

    const newCards: KanbanCard[] = [];

    if (leads) leads.forEach(l => newCards.push({
      id: `lead_${l.id}`, stage: 'Enquiry', type: 'lead',
      refNo: l.lead_no || l.enquiry_no, customer: l.company || l.customer, part: l.part_name,
      qty: l.quantity, value: l.estimated_value, date: l.expected_date, status: l.status, raw: l
    }));

    if (quotes) quotes.forEach(q => newCards.push({
      id: `quote_${q.id}`, stage: 'Quotation', type: 'quotation',
      refNo: q.quote_no, customer: q.customer || q.customer_name, part: q.part_name,
      qty: q.quantity, value: q.total_value, date: q.valid_till || q.valid_until || q.quote_date, status: q.status, raw: q
    }));

    if (orders) orders.forEach(o => newCards.push({
      id: `order_${o.id}`, stage: 'Sales Order', type: 'order',
      refNo: o.order_no, customer: o.customer || o.customer_name, part: o.part_name || (o.items?.[0]?.partName),
      qty: o.quantity || (o.items?.[0]?.quantity), value: o.total_value, date: o.delivery_date, status: o.status, raw: o
    }));

    if (inwards && !inwardErr) inwards.forEach(i => newCards.push({
      id: `inward_${i.id}`, stage: 'Inward', type: 'inward',
      refNo: i.inward_no, customer: i.party_name, part: i.part_name,
      qty: i.quantity, value: i.total_amount, date: i.inward_date, status: i.status, raw: i
    }));

    setCards(newCards);
    setLoading(false);
  };

  useEffect(() => {
    fetchPipeline();
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
    let aggregated: any = { enquiry: null, quotation: null, order: null, inward: null };
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
      }
    } catch (e) {
       console.error("Error fetching lineage", e);
    }
    setViewModalData(aggregated);
    setLoading(false);
  };

  const closeViewModal = () => {
    setViewModalTarget(null);
    setViewModalData(null);
  };

  const handleDragStart = (e: React.DragEvent, card: KanbanCard) => {
    e.dataTransfer.setData('cardStr', JSON.stringify(card));
    e.dataTransfer.setData('cardId', card.id);
  };

  const handleDrop = (e: React.DragEvent, toStage: Stage) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('cardId');
    const card = cards.find(c => c.id === cardId);
    if (!card || card.stage === toStage) return;

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
      
      // Calculate derived unit price if not natively stored
      let derivedUnitPrice = card.raw.unit_price;
      if (!derivedUnitPrice && card.value && card.qty) {
        const d = Number(card.raw.discount_percent) || 0;
        const g = Number(card.raw.gst_percent) || 0;
        derivedUnitPrice = (card.value / (card.qty * (1 - d/100) * (1 + g/100))).toFixed(2);
      }

      setOrderForm({
        customer: card.customer, quoteNo: card.refNo, leadNo: card.raw.lead_no || card.raw.lead_id || '',
        contacts: parseContacts(card.raw),
        billingAddress: '', deliveryAddress: '', shippingContact: '', shippingPhone: '',
        orderNo: oNo, orderDate: new Date().toISOString().split('T')[0], deliveryDate: '', paymentTerms: card.raw.payment_terms || 'Net 30',
        customerPoNo: '', customerPoDate: '',
        items: [{
          partName: card.part, partNumber: card.raw.part_number || card.raw.part_no || '', description: card.raw.description || '',
          quantity: card.qty || 1, unitPrice: derivedUnitPrice || 0, discount: card.raw.discount_percent || 0, gst: card.raw.gst_percent || 18
        }],
        specialInstructions: '', internalRemarks: ''
      });
      setOrderModalTarget(card);
    } else if (card.type === 'order' && toStage === 'Inward') {
      const iNo = `INW-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      setInwardForm({
        inwardNo: iNo, category: 'CUSTOMER DC', projectName: card.raw.project_name || '', salesOrderRef: card.refNo, referenceNo: '', inwardDate: new Date().toISOString().split('T')[0], partyName: card.customer, remarks: '',
        partName: card.part, partNumber: card.raw.part_number || '', quantity: card.qty?.toString() || '0', price: '', discount: '0', gst: '18',
        contacts: parseContacts(card.raw)
      });
      setInwardModalTarget(card);
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
      expected_date: enquiryForm.expectedDate || null, received_date: new Date().toISOString().split('T')[0], estimated_value: 0,
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
      await supabase.from('cnc_enquiries').update({ pipeline_stage: 'Quotation' }).eq('id', quotationModalTarget.raw.id);
      setQuotationModalTarget(null); fetchPipeline();
    }
  };

  const saveOrder = async () => {
    if (!orderModalTarget) return;

    // Validation
    if (!orderForm.customer || !orderForm.deliveryAddress || !orderForm.orderNo || !orderForm.orderDate || !orderForm.deliveryDate || !orderForm.paymentTerms) {
      alert("Please fill all required fields (marked with *).");
      return;
    }
    if (orderForm.items.length === 0) {
      alert("At least one order item is required."); return;
    }
    for (const item of orderForm.items) {
      if (!item.partName || !item.quantity) { alert("Part Name and Quantity are required for all items."); return; }
      if (Number(item.quantity) <= 0) { alert("Quantity must be greater than 0."); return; }
      if (Number(item.unitPrice) < 0) { alert("Price cannot be negative."); return; }
      if (Number(item.discount) < 0 || Number(item.discount) > 100) { alert("Discount must be between 0 and 100."); return; }
      if (Number(item.gst) < 0 || Number(item.gst) > 100) { alert("GST must be between 0 and 100."); return; }
    }
    if (new Date(orderForm.deliveryDate) < new Date(orderForm.orderDate)) {
      alert("Delivery Date cannot be earlier than Order Date."); return;
    }

    const cStr = getContactStrings(orderForm);
    const totals = calculateOrderTotals();

    const { error } = await supabase.from('cnc_sales_orders').insert([{
      id: crypto.randomUUID(),
      order_no: orderForm.orderNo, customer: orderForm.customer,
      contact_person: cStr.person, phone: cStr.phone, email: cStr.email,
      billing_address: orderForm.billingAddress, delivery_address: orderForm.deliveryAddress,
      shipping_contact: orderForm.shippingContact, shipping_phone: orderForm.shippingPhone,
      lead_no: orderForm.leadNo, order_date: orderForm.orderDate,
      customer_po_no: orderForm.customerPoNo, customer_po_date: orderForm.customerPoDate || null,
      items: orderForm.items,
      
      // Keep primary part info for compatibility
      part_name: orderForm.items[0]?.partName, part_number: orderForm.items[0]?.partNumber,
      quantity: orderForm.items.reduce((acc: number, item: any) => acc + Number(item.quantity), 0), 
      total_value: totals.grandTotal, 
      
      delivery_date: orderForm.deliveryDate, status: 'Confirmed',
      payment_terms: orderForm.paymentTerms, special_instructions: orderForm.specialInstructions,
      internal_remarks: orderForm.internalRemarks,
      quotation_id: orderModalTarget.raw.id
    }]);

    if (error) {
      alert("Error: Make sure to run the SQL script to add new Sales Order columns. " + error.message);
    } else {
      await supabase.from('cnc_quotations').update({ status: 'Converted' }).eq('id', orderModalTarget.raw.id);
      setOrderModalTarget(null);
      fetchPipeline();
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
    if (error) alert("Error: Make sure to run the SQL script to create the cnc_inwards table and columns.");
    else { await supabase.from('cnc_sales_orders').update({ status: 'Inwarded' }).eq('id', inwardModalTarget.raw.id); setInwardModalTarget(null); fetchPipeline(); }
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

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full flex flex-col">
      <PageHeader title="Sales Pipeline" description="Kanban workflow for active opportunities" actions={<DateSelector />} />
      
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <StatCard label="Total Opportunities" value={cards.length.toString()} icon={<FileText size={20} />} accent="brand" />
        <StatCard label="Enquiries" value={cards.filter(c => c.stage === 'Enquiry').length.toString()} icon={<FileText size={20} />} accent="neutral" />
        <StatCard label="Quotations" value={cards.filter(c => c.stage === 'Quotation').length.toString()} icon={<FileText size={20} />} accent="accent" />
        <StatCard label="Sales Orders" value={cards.filter(c => c.stage === 'Sales Order').length.toString()} icon={<FileText size={20} />} accent="success" />
        <StatCard label="Inwards" value={cards.filter(c => c.stage === 'Inward').length.toString()} icon={<FileText size={20} />} accent="warning" />
      </div>

      <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
        {columns.map(stage => (
          <div key={stage} className="flex-1 min-w-[280px] max-w-[320px] bg-slate-100 rounded-xl p-3 flex flex-col border border-slate-200 shadow-sm" onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, stage)}>
            <div className="flex justify-between items-center mb-3 px-1">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-700 uppercase tracking-wider text-xs">{stage}</h3>
                {stage === 'Enquiry' && <button onClick={() => setEnquiryModalOpen(true)} className="bg-brand-100 text-brand-700 p-1 rounded hover:bg-brand-200 transition-colors" title="Add New Enquiry"><Plus size={14} /></button>}
              </div>
              <Badge variant="neutral">{cards.filter(c => c.stage === stage).length}</Badge>
            </div>
            <div className="flex-1 flex flex-col gap-3 overflow-y-auto scrollbar-none">
              {cards.filter(c => c.stage === stage).map(card => (
                <div key={card.id} draggable onDragStart={(e) => handleDragStart(e, card)} className="bg-white p-3.5 rounded-lg shadow-sm border border-slate-200 cursor-grab active:cursor-grabbing hover:border-brand-300 transition-all group relative">
                  <div className="absolute top-2 right-2 flex gap-1">
                    <button onClick={() => openViewModal(card)} className="text-slate-300 hover:text-brand-500 transition-colors bg-white/80 p-0.5 rounded" title="View Details"><Eye size={14} /></button>
                    {card.type === 'lead' && <button onClick={() => removeFromPipeline(card)} className="text-slate-300 hover:text-red-500 transition-colors bg-white/80 p-0.5 rounded" title="Rollback / Remove from Pipeline"><Archive size={14} /></button>}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 mb-1 pr-12">{card.refNo}</div>
                  <div className="font-semibold text-sm text-slate-800 mb-0.5 pr-4 line-clamp-1">{card.customer}</div>
                  <div className="text-xs text-slate-600 mb-3 line-clamp-1">{card.part}</div>
                  
                  <div className="flex justify-between text-xs mb-3 text-slate-500">
                    <span>Qty: <span className="font-medium text-slate-700">{card.qty}</span></span>
                    {card.type !== 'inward' && <span>Val: <span className="font-medium text-brand-600">Rs. {((Number(card.value)||0)/1000).toFixed(1)}k</span></span>}
                    {card.type === 'inward' && <span>Ref: <span className="font-medium text-brand-600">{card.raw.sales_order_ref}</span></span>}
                  </div>
                  
                  <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
                    <span className="text-[10px] text-slate-400">{card.date || 'No Date'}</span>
                    <Badge variant={stage === 'Sales Order' ? 'success' : stage === 'Inward' ? 'warning' : 'neutral'} dot>{card.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Enquiry Modal */}
      <Modal open={enquiryModalOpen} onClose={() => { setEnquiryModalOpen(false); setEnquiryForm(resetEnquiryForm()); }} title="New Enquiry" size="lg" footer={<><Button variant="secondary" onClick={() => setEnquiryModalOpen(false)}>Cancel</Button><Button onClick={saveEnquiry}>Save Enquiry</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Project Name" required><input className={inputClass} value={enquiryForm.leadNo} onChange={e => setEnquiryForm({...enquiryForm, leadNo: e.target.value})} /></FormField>
          <FormField label="Company Name" required><input className={inputClass} value={enquiryForm.company} onChange={e => setEnquiryForm({...enquiryForm, company: e.target.value})} /></FormField>
          <ContactsList form={enquiryForm} setForm={setEnquiryForm} />
          <FormField label="Part Name" required><input className={inputClass} value={enquiryForm.partName} onChange={e => setEnquiryForm({...enquiryForm, partName: e.target.value})} /></FormField>
          <FormField label="Part Number"><input className={inputClass} value={enquiryForm.partNumber} onChange={e => setEnquiryForm({...enquiryForm, partNumber: e.target.value})} /></FormField>
          <FormField label="Quantity"><input type="number" className={inputClass} value={enquiryForm.quantity} onChange={e => setEnquiryForm({...enquiryForm, quantity: e.target.value})} /></FormField>
          <FormField label="Expected Date"><input type="date" className={inputClass} value={enquiryForm.expectedDate} onChange={e => setEnquiryForm({...enquiryForm, expectedDate: e.target.value})} /></FormField>
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
            <FormField label="Part Number"><input className={inputClass} value={quoteForm.partNumber} onChange={e=>setQuoteForm({...quoteForm, partNumber: e.target.value})} /></FormField>
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

      {/* NEW SALES ORDER MODAL */}
      <Modal open={!!orderModalTarget} onClose={() => setOrderModalTarget(null)} title="CREATE SALES ORDER" size="xl" footer={<><Button variant="secondary" onClick={() => setOrderModalTarget(null)}>Cancel</Button><Button onClick={saveOrder}>Create Sales Order</Button></>}>
        <div className="flex flex-col gap-6 max-h-[75vh] overflow-y-auto pr-2">
          
          {/* Section 1: Customer Details */}
          <div>
            <h4 className="font-bold text-sm text-brand-800 border-b border-brand-100 pb-2 mb-4 uppercase">1. Customer Details</h4>
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
              <FormField label="Customer / Company Name *"><input className={`${inputClass} bg-slate-100`} value={orderForm.customer} disabled /></FormField>
              <div className="col-span-2">
                <ContactsList form={orderForm} readOnly={true} />
              </div>
            </div>
          </div>

          {/* Section 2: Billing & Delivery */}
          <div>
            <h4 className="font-bold text-sm text-brand-800 border-b border-brand-100 pb-2 mb-4 uppercase">2. Billing & Delivery Details</h4>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Billing Address"><textarea className={inputClass} rows={3} value={orderForm.billingAddress} onChange={e=>setOrderForm({...orderForm, billingAddress: e.target.value})}></textarea></FormField>
              <FormField label="Delivery Address *"><textarea className={inputClass} rows={3} value={orderForm.deliveryAddress} onChange={e=>setOrderForm({...orderForm, deliveryAddress: e.target.value})}></textarea></FormField>
              <FormField label="Shipping Contact Person"><input className={inputClass} value={orderForm.shippingContact} onChange={e=>setOrderForm({...orderForm, shippingContact: e.target.value})} /></FormField>
              <FormField label="Shipping Phone"><input className={inputClass} value={orderForm.shippingPhone} onChange={e=>setOrderForm({...orderForm, shippingPhone: e.target.value})} /></FormField>
            </div>
          </div>

          {/* Section 3: Order Details */}
          <div>
            <h4 className="font-bold text-sm text-brand-800 border-b border-brand-100 pb-2 mb-4 uppercase">3. Order Details</h4>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Sales Order Number *"><input className={`${inputClass} bg-slate-50`} value={orderForm.orderNo} disabled /></FormField>
              <FormField label="Quotation Number"><input className={`${inputClass} bg-slate-50`} value={orderForm.quoteNo} disabled /></FormField>
              <FormField label="Lead / Enquiry Number"><input className={`${inputClass} bg-slate-50`} value={orderForm.leadNo} disabled /></FormField>
              <FormField label="Order Date *"><input type="date" className={inputClass} value={orderForm.orderDate} onChange={e=>setOrderForm({...orderForm, orderDate: e.target.value})} /></FormField>
              <FormField label="Delivery Date *"><input type="date" className={inputClass} value={orderForm.deliveryDate} onChange={e=>setOrderForm({...orderForm, deliveryDate: e.target.value})} /></FormField>
              <FormField label="Payment Terms *">
                <select className={inputClass} value={orderForm.paymentTerms} onChange={e=>setOrderForm({...orderForm, paymentTerms: e.target.value})}>
                  <option>Advance</option><option>Net 15</option><option>Net 30</option><option>Net 45</option><option>Custom</option>
                </select>
              </FormField>
            </div>
          </div>

          {/* Section 4: Customer PO Details */}
          <div>
            <h4 className="font-bold text-sm text-brand-800 border-b border-brand-100 pb-2 mb-4 uppercase">4. Customer PO Details</h4>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Customer PO Number"><input className={inputClass} value={orderForm.customerPoNo} onChange={e=>setOrderForm({...orderForm, customerPoNo: e.target.value})} /></FormField>
              <FormField label="Customer PO Date"><input type="date" className={inputClass} value={orderForm.customerPoDate} onChange={e=>setOrderForm({...orderForm, customerPoDate: e.target.value})} /></FormField>
              <FormField label="Attach Document (Ref)"><input type="file" className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100" /></FormField>
            </div>
          </div>

          {/* Section 5: Order Items */}
          <div>
            <h4 className="font-bold text-sm text-brand-800 border-b border-brand-100 pb-2 mb-4 uppercase">5. Order Items</h4>
            {orderForm.items.map((item: any, idx: number) => {
              const { taxable, gstAmt, total } = calculateItemValues(item);
              return (
                <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4 relative">
                  {orderForm.items.length > 1 && (
                    <button type="button" onClick={() => {
                      const newItems = [...orderForm.items]; newItems.splice(idx, 1); setOrderForm({...orderForm, items: newItems});
                    }} className="absolute top-3 right-3 text-red-500 hover:text-red-700 bg-red-50 p-1.5 rounded-md transition-colors"><Trash2 size={16} /></button>
                  )}
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 md:col-span-4"><FormField label="Part / Product Name *"><input className={inputClass} value={item.partName} onChange={e=>updateOrderItem(idx, 'partName', e.target.value)} /></FormField></div>
                    <div className="col-span-12 md:col-span-3"><FormField label="Part Number"><input className={inputClass} value={item.partNumber} onChange={e=>updateOrderItem(idx, 'partNumber', e.target.value)} /></FormField></div>
                    <div className="col-span-12 md:col-span-5"><FormField label="Description"><input className={inputClass} value={item.description} onChange={e=>updateOrderItem(idx, 'description', e.target.value)} /></FormField></div>
                    
                    <div className="col-span-6 md:col-span-2"><FormField label="Quantity *"><input type="number" min="1" className={inputClass} value={item.quantity} onChange={e=>updateOrderItem(idx, 'quantity', e.target.value)} /></FormField></div>
                    <div className="col-span-6 md:col-span-3"><FormField label="Unit Price ₹"><input type="number" min="0" className={inputClass} value={item.unitPrice} onChange={e=>updateOrderItem(idx, 'unitPrice', e.target.value)} /></FormField></div>
                    <div className="col-span-6 md:col-span-3"><FormField label="Discount %"><input type="number" min="0" max="100" className={inputClass} value={item.discount} onChange={e=>updateOrderItem(idx, 'discount', e.target.value)} /></FormField></div>
                    <div className="col-span-6 md:col-span-4"><FormField label="GST %"><input type="number" min="0" max="100" className={inputClass} value={item.gst} onChange={e=>updateOrderItem(idx, 'gst', e.target.value)} /></FormField></div>
                    
                    <div className="col-span-12 flex justify-end gap-6 md:gap-12 mt-2 pt-3 border-t border-slate-200">
                      <div className="text-right"><span className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Taxable</span><div className="text-sm font-medium text-slate-700">{formatINR(taxable)}</div></div>
                      <div className="text-right"><span className="block text-[10px] uppercase text-slate-500 font-bold mb-1">GST</span><div className="text-sm font-medium text-slate-700">{formatINR(gstAmt)}</div></div>
                      <div className="text-right"><span className="block text-[10px] uppercase text-brand-600 font-bold mb-1">Total</span><div className="text-sm font-bold text-brand-700">{formatINR(total)}</div></div>
                    </div>
                  </div>
                </div>
              );
            })}
            <Button variant="secondary" onClick={() => setOrderForm({...orderForm, items: [...orderForm.items, { partName: '', partNumber: '', description: '', quantity: 1, unitPrice: 0, discount: 0, gst: 18 }]})}>
              <Plus size={16} className="mr-2" /> Add Item
            </Button>
          </div>

          {/* Section 6: Order Summary */}
          <div>
            <h4 className="font-bold text-sm text-brand-800 border-b border-brand-100 pb-2 mb-4 uppercase">6. Order Summary</h4>
            <div className="bg-slate-800 text-white p-5 rounded-lg">
              {(() => {
                const totals = calculateOrderTotals();
                return (
                  <div className="w-full md:w-1/2 ml-auto">
                    <div className="flex justify-between py-1 text-sm"><span className="text-slate-300">Subtotal</span><span>{formatINR(totals.subtotal)}</span></div>
                    <div className="flex justify-between py-1 text-sm"><span className="text-slate-300">Discount</span><span className="text-red-400">-{formatINR(totals.totalDiscount)}</span></div>
                    <div className="flex justify-between py-1 text-sm border-b border-slate-600 pb-2 mb-2"><span className="text-slate-300">GST</span><span>{formatINR(totals.totalGST)}</span></div>
                    <div className="flex justify-between py-1 text-lg font-bold"><span className="text-brand-300">Grand Total</span><span>{formatINR(totals.grandTotal)}</span></div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Section 7: Additional Information */}
          <div>
            <h4 className="font-bold text-sm text-brand-800 border-b border-brand-100 pb-2 mb-4 uppercase">7. Additional Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Special Instructions (Visible to Customer)"><textarea className={inputClass} rows={3} value={orderForm.specialInstructions} onChange={e=>setOrderForm({...orderForm, specialInstructions: e.target.value})}></textarea></FormField>
              <FormField label="Internal Remarks (Private)"><textarea className={inputClass} rows={3} value={orderForm.internalRemarks} onChange={e=>setOrderForm({...orderForm, internalRemarks: e.target.value})}></textarea></FormField>
            </div>
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
            <FormField label="Part Number"><input className={inputClass} value={inwardForm.partNumber} onChange={e=>setInwardForm({...inwardForm, partNumber: e.target.value})} /></FormField>
            <FormField label="Quantity" required><input type="number" className={inputClass} value={inwardForm.quantity} onChange={e=>setInwardForm({...inwardForm, quantity: e.target.value})} /></FormField>
            <FormField label="Price" required><input type="number" className={inputClass} value={inwardForm.price} onChange={e=>setInwardForm({...inwardForm, price: e.target.value})} /></FormField>
            <FormField label="Discount %"><input type="number" className={inputClass} value={inwardForm.discount} onChange={e=>setInwardForm({...inwardForm, discount: e.target.value})} /></FormField>
            <FormField label="GST %"><input type="number" className={inputClass} value={inwardForm.gst} onChange={e=>setInwardForm({...inwardForm, gst: e.target.value})} /></FormField>
            <FormField label="Total Amount (Rs.)"><input className={`${inputClass} bg-slate-100 font-bold`} value={calcInwardTotal()} disabled /></FormField>
          </div>
        </div>
      </Modal>

      {/* Generic View Modal */}
      <Modal open={!!viewModalTarget} onClose={closeViewModal} title={`Pipeline History: ${viewModalTarget?.refNo}`} size="xl" footer={<Button variant="secondary" onClick={closeViewModal}>Close</Button>}>
        {viewModalData ? (
          <div className="flex flex-col max-h-[75vh] overflow-y-auto pr-2">
             {renderRecordData('Enquiry', viewModalData.enquiry)}
             {renderRecordData('Quotation', viewModalData.quotation)}
             {renderRecordData('Sales Order', viewModalData.order)}
             {renderRecordData('Inward', viewModalData.inward)}
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500">Loading historical data...</div>
        )}
      </Modal>

    </div>
  );
}
