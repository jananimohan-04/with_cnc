import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader, DateSelector, FilterButton } from '@/components/ui/PageHeader';
import { StatCard, Badge, Button } from '@/components/ui/Card';
import { Modal, FormField, inputClass } from '@/components/ui/Modal';
import { FileText, Plus, Archive } from 'lucide-react';

type Stage = 'Enquiry' | 'Customer' | 'Quotation' | 'Sales Order';

type KanbanCard = {
  id: string;
  stage: Stage;
  type: 'lead' | 'customer' | 'quotation' | 'order';
  refNo: string;
  customer: string;
  part: string;
  qty: number;
  value: number;
  date: string;
  status: string;
  raw: any;
};

export function SalesPipelinePage() {
  const columns: Stage[] = ['Enquiry', 'Customer', 'Quotation', 'Sales Order'];
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [loading, setLoading] = useState(true);

  const [customerModalTarget, setCustomerModalTarget] = useState<KanbanCard | null>(null);
  const [quotationModalTarget, setQuotationModalTarget] = useState<KanbanCard | null>(null);
  const [orderModalTarget, setOrderModalTarget] = useState<KanbanCard | null>(null);
  const [enquiryModalOpen, setEnquiryModalOpen] = useState(false);

  const [customerForm, setCustomerForm] = useState<any>({
    projectName: '',
    name: '',
    industry: '',
    contacts: [{ person: '', number: '', email: '' }]
  });
  
  // ... (we'll update handleDrop and saveCustomer too, so let's do a wider replace)
  const [quoteForm, setQuoteForm] = useState<any>({ projectName: '' });
  const [orderForm, setOrderForm] = useState<any>({ projectName: '' });
  
  const resetEnquiryForm = () => ({
    leadNo: `PROJ-${Math.floor(1000 + Math.random() * 9000)}`,
    company: '', contactPerson: '', phone: '', email: '',
    partName: '', quantity: '', expectedDate: '', source: 'Direct'
  });
  const [enquiryForm, setEnquiryForm] = useState(resetEnquiryForm());

  const fetchPipeline = async () => {
    setLoading(true);
    // 1. Fetch Enquiries (Not converted/lost)
    const { data: leads } = await supabase.from('cnc_enquiries').select('*').in('status', ['New', 'Contacted', 'Qualified', 'Under Review']);
    
    // 2. Fetch Active Customers (recent ones to keep board clean, or all)
    const { data: customers } = await supabase.from('cnc_customers').select('*');
    
    // 3. Fetch Quotations (Active)
    const { data: quotes } = await supabase.from('cnc_quotations').select('*').in('status', ['Sent', 'Under Review', 'Draft', 'Accepted']);
    
    // 4. Fetch Sales Orders (Active)
    const { data: orders } = await supabase.from('cnc_sales_orders').select('*').in('status', ['Draft', 'Confirmed', 'In Production']);

    const newCards: KanbanCard[] = [];

    if (leads) {
      leads.forEach(l => {
        newCards.push({
          id: `lead_${l.id}`, stage: 'Enquiry', type: 'lead',
          refNo: l.lead_no || l.enquiry_no, customer: l.company || l.customer, part: l.part_name,
          qty: l.quantity, value: l.estimated_value, date: l.expected_date, status: l.status, raw: l
        });
      });
    }

    if (customers) {
      customers.forEach(c => {
        newCards.push({
          id: `cust_${c.id}`, stage: 'Customer', type: 'customer',
          refNo: c.id.slice(0, 8), customer: c.name, part: 'N/A',
          qty: 0, value: 0, date: new Date().toISOString().split('T')[0], status: c.status || 'Active', raw: c
        });
      });
    }

    if (quotes) {
      quotes.forEach(q => {
        newCards.push({
          id: `quote_${q.id}`, stage: 'Quotation', type: 'quotation',
          refNo: q.quote_no, customer: q.customer_name, part: q.part_name,
          qty: q.quantity, value: q.total_value, date: q.valid_until || q.quote_date, status: q.status, raw: q
        });
      });
    }

    if (orders) {
      orders.forEach(o => {
        newCards.push({
          id: `order_${o.id}`, stage: 'Sales Order', type: 'order',
          refNo: o.order_no, customer: o.customer_name, part: o.part_name,
          qty: o.quantity, value: o.total_value, date: o.delivery_date, status: o.status, raw: o
        });
      });
    }

    setCards(newCards);
    setLoading(false);
  };

  useEffect(() => {
    fetchPipeline();
  }, []);

  const handleDragStart = (e: React.DragEvent, card: KanbanCard) => {
    e.dataTransfer.setData('cardStr', JSON.stringify(card));
    e.dataTransfer.setData('cardId', card.id);
  };

  const handleDrop = (e: React.DragEvent, toStage: Stage) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('cardId');
    const card = cards.find(c => c.id === cardId);
    if (!card || card.stage === toStage) return;

    // Rules for converting based on Kanban column movement
    if (card.type === 'lead' && toStage === 'Customer') {
      const now = new Date();
      const timestamp = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
      const newProjectName = `${card.refNo}-${timestamp}`;
      
      setCustomerForm({
        projectName: newProjectName,
        name: card.customer,
        industry: card.raw.industry || 'Unknown',
        contacts: [{
          person: card.raw.contact_person || '',
          number: card.raw.contact_number || card.raw.phone || '',
          email: card.raw.email || ''
        }]
      });
      setCustomerModalTarget(card);
    } else if (card.type === 'customer' && toStage === 'Quotation') {
      setQuoteForm({
        projectName: 'Unknown Project', // Customer card doesn't have project name directly in this simple setup
        quoteNo: `QT-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        customer: card.customer, partName: '', quantity: '', unitPrice: '', validTill: ''
      });
      setQuotationModalTarget(card);
    } else if (card.type === 'lead' && toStage === 'Quotation') {
      // Shortcut: Lead to Quotation directly
      setQuoteForm({
        projectName: card.refNo,
        quoteNo: `QT-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        customer: card.customer, partName: card.part, quantity: card.qty?.toString() || '', unitPrice: '', validTill: ''
      });
      setQuotationModalTarget(card);
    } else if (card.type === 'quotation' && toStage === 'Sales Order') {
      setOrderForm({
        projectName: card.raw.lead_no || 'Unknown Project', // Assuming we fetch it or it's attached
        orderNo: `SO-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        customer: card.customer, partName: card.part, quantity: card.qty.toString(),
        deliveryDate: '', paymentTerms: 'Net 30'
      });
      setOrderModalTarget(card);
    }
  };

  const saveEnquiry = async () => {
    if (!enquiryForm.company || !enquiryForm.partName) return;
    setLoading(true);
    const { error } = await supabase.from('cnc_enquiries').insert([{
      lead_no: enquiryForm.leadNo,
      company: enquiryForm.company,
      contact_person: enquiryForm.contactPerson,
      phone: enquiryForm.phone,
      email: enquiryForm.email,
      part_name: enquiryForm.partName,
      quantity: Number(enquiryForm.quantity) || 0,
      expected_date: enquiryForm.expectedDate || null,
      source: enquiryForm.source,
      status: 'New',
      pipeline_stage: 'Enquiry'
    }]);

    if (!error) {
      setEnquiryModalOpen(false);
      setEnquiryForm(resetEnquiryForm());
      fetchPipeline();
    } else {
      console.error(error);
      alert("Error saving enquiry.");
      setLoading(false);
    }
  };

  const removeFromPipeline = async (card: KanbanCard) => {
    if (confirm("Are you sure you want to roll back this Enquiry to 'Lost' status? It will be removed from the pipeline but saved in All Leads.")) {
      setLoading(true);
      await supabase.from('cnc_enquiries').update({ status: 'Lost' }).eq('id', card.raw.id);
      fetchPipeline();
    }
  };

  const saveCustomer = async () => {
    if (!customerModalTarget) return;
    setLoading(true);
    
    // Join multiple contacts into strings for scalar columns
    const contactNames = customerForm.contacts.map((c: any) => c.person).filter(Boolean).join(' | ');
    const contactPhones = customerForm.contacts.map((c: any) => c.number).filter(Boolean).join(' | ');
    const contactEmails = customerForm.contacts.map((c: any) => c.email).filter(Boolean).join(' | ');

    const { data: newCust, error } = await supabase.from('cnc_customers').insert([{
      name: customerForm.name,
      contact_person: contactNames,
      contact_number: contactPhones,
      email: contactEmails,
      industry: customerForm.industry,
      status: 'Active'
    }]).select().single();

    if (!error && newCust) {
      await supabase.from('cnc_enquiries').update({
        lead_no: customerForm.projectName, // Save the updated project name with timestamp
        status: 'Converted',
        converted_customer_id: newCust.id
      }).eq('id', customerModalTarget.raw.id);
      fetchPipeline();
    } else {
      console.error(error);
    }
    setCustomerModalTarget(null);
  };

  const saveQuotation = async () => {
    if (!quotationModalTarget) return;
    const val = Number(quoteForm.unitPrice) * Number(quoteForm.quantity);
    await supabase.from('cnc_quotations').insert([{
      quote_no: quoteForm.quoteNo, customer: quoteForm.customer, part_name: quoteForm.partName,
      quantity: quoteForm.quantity, total_value: val, valid_till: quoteForm.validTill, status: 'Sent',
      lead_id: quotationModalTarget.raw.id, customer_id: quotationModalTarget.raw.converted_customer_id
    }]);
    await supabase.from('cnc_enquiries').update({ pipeline_stage: 'Quotation' }).eq('id', quotationModalTarget.raw.id);
    setQuotationModalTarget(null);
    fetchPipeline();
  };

  const saveOrder = async () => {
    if (!orderModalTarget) return;
    await supabase.from('cnc_sales_orders').insert([{
      order_no: orderForm.orderNo, customer: orderForm.customer, part_name: orderForm.partName,
      quantity: orderForm.quantity, total_value: orderModalTarget.value, delivery_date: orderForm.deliveryDate, status: 'Confirmed',
      quotation_id: orderModalTarget.raw.id, customer_id: orderModalTarget.raw.customer_id
    }]);
    await supabase.from('cnc_quotations').update({ status: 'Converted' }).eq('id', orderModalTarget.raw.id);
    setOrderModalTarget(null);
    fetchPipeline();
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full flex flex-col">
      <PageHeader title="Sales Pipeline" description="Kanban workflow for active opportunities" actions={<DateSelector />} />
      
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <StatCard label="Total Opportunities" value={cards.length.toString()} icon={<FileText size={20} />} accent="brand" />
        <StatCard label="Enquiries" value={cards.filter(c => c.stage === 'Enquiry').length.toString()} icon={<FileText size={20} />} accent="neutral" />
        <StatCard label="Customers" value={cards.filter(c => c.stage === 'Customer').length.toString()} icon={<FileText size={20} />} accent="warning" />
        <StatCard label="Quotations" value={cards.filter(c => c.stage === 'Quotation').length.toString()} icon={<FileText size={20} />} accent="accent" />
        <StatCard label="Sales Orders" value={cards.filter(c => c.stage === 'Sales Order').length.toString()} icon={<FileText size={20} />} accent="success" />
      </div>

      <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
        {columns.map(stage => (
          <div 
            key={stage} 
            className="flex-1 min-w-[280px] max-w-[320px] bg-slate-100 rounded-xl p-3 flex flex-col border border-slate-200 shadow-sm"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, stage)}
          >
            <div className="flex justify-between items-center mb-3 px-1">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-700 uppercase tracking-wider text-xs">{stage}</h3>
                {stage === 'Enquiry' && (
                  <button onClick={() => setEnquiryModalOpen(true)} className="bg-brand-100 text-brand-700 p-1 rounded hover:bg-brand-200 transition-colors" title="Add New Enquiry">
                    <Plus size={14} />
                  </button>
                )}
              </div>
              <Badge variant="neutral">{cards.filter(c => c.stage === stage).length}</Badge>
            </div>
            <div className="flex-1 flex flex-col gap-3 overflow-y-auto scrollbar-none">
              {cards.filter(c => c.stage === stage).map(card => (
                <div 
                  key={card.id} 
                  draggable 
                  onDragStart={(e) => handleDragStart(e, card)}
                  className="bg-white p-3.5 rounded-lg shadow-sm border border-slate-200 cursor-grab active:cursor-grabbing hover:border-brand-300 transition-all group relative"
                >
                  {card.type === 'lead' && (
                    <button onClick={() => removeFromPipeline(card)} className="absolute top-2 right-2 text-slate-300 hover:text-red-500 transition-colors" title="Rollback / Remove from Pipeline">
                      <Archive size={14} />
                    </button>
                  )}
                  <div className="text-[10px] font-mono text-slate-400 mb-1">{card.refNo}</div>
                  <div className="font-semibold text-sm text-slate-800 mb-0.5 pr-4">{card.customer}</div>
                  <div className="text-xs text-slate-600 mb-3 line-clamp-1">{card.part}</div>
                  
                  <div className="flex justify-between text-xs mb-3 text-slate-500">
                    <span>Qty: <span className="font-medium text-slate-700">{card.qty}</span></span>
                    <span>Val: <span className="font-medium text-brand-600">Rs. {((Number(card.value)||0)/1000).toFixed(1)}k</span></span>
                  </div>
                  
                  <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
                    <span className="text-[10px] text-slate-400">{card.date || 'No Date'}</span>
                    <Badge variant={stage === 'Sales Order' ? 'success' : 'neutral'} dot>{card.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Modals */}
      <Modal open={enquiryModalOpen} onClose={() => { setEnquiryModalOpen(false); setEnquiryForm(resetEnquiryForm()); }} title="New Enquiry" subtitle="Add a new lead to the pipeline" size="lg" footer={<><Button variant="secondary" onClick={() => setEnquiryModalOpen(false)}>Cancel</Button><Button onClick={saveEnquiry}>Save Enquiry</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Project Name" required><input className={inputClass} value={enquiryForm.leadNo} onChange={e => setEnquiryForm({...enquiryForm, leadNo: e.target.value})} /></FormField>
          <FormField label="Company Name" required><input className={inputClass} value={enquiryForm.company} onChange={e => setEnquiryForm({...enquiryForm, company: e.target.value})} /></FormField>
          <FormField label="Contact Person"><input className={inputClass} value={enquiryForm.contactPerson} onChange={e => setEnquiryForm({...enquiryForm, contactPerson: e.target.value})} /></FormField>
          <FormField label="Phone"><input className={inputClass} value={enquiryForm.phone} onChange={e => setEnquiryForm({...enquiryForm, phone: e.target.value})} /></FormField>
          <FormField label="Email"><input type="email" className={inputClass} value={enquiryForm.email} onChange={e => setEnquiryForm({...enquiryForm, email: e.target.value})} /></FormField>
          <FormField label="Part Required" required><input className={inputClass} value={enquiryForm.partName} onChange={e => setEnquiryForm({...enquiryForm, partName: e.target.value})} /></FormField>
          <FormField label="Quantity"><input type="number" className={inputClass} value={enquiryForm.quantity} onChange={e => setEnquiryForm({...enquiryForm, quantity: e.target.value})} /></FormField>
          <FormField label="Expected Date"><input type="date" className={inputClass} value={enquiryForm.expectedDate} onChange={e => setEnquiryForm({...enquiryForm, expectedDate: e.target.value})} /></FormField>
        </div>
      </Modal>

      <Modal open={!!customerModalTarget} onClose={() => setCustomerModalTarget(null)} title="Create Customer" footer={<><Button variant="secondary" onClick={() => setCustomerModalTarget(null)}>Cancel</Button><Button onClick={saveCustomer}>Create Customer</Button></>}>
        <div className="flex flex-col gap-4">
          <FormField label="Project Name"><input className={inputClass} value={customerForm.projectName} disabled /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Company Name" required><input className={inputClass} value={customerForm.name} onChange={e=>setCustomerForm({...customerForm, name: e.target.value})} /></FormField>
            <FormField label="Industry" required><input className={inputClass} value={customerForm.industry} onChange={e=>setCustomerForm({...customerForm, industry: e.target.value})} /></FormField>
          </div>
          
          <div className="border-t border-slate-200 pt-4 mt-2">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-semibold text-slate-700">Contact Persons</h4>
              <button onClick={() => setCustomerForm({...customerForm, contacts: [...customerForm.contacts, { person: '', number: '', email: '' }]})} className="flex items-center gap-1 text-xs bg-brand-100 text-brand-700 px-2 py-1 rounded hover:bg-brand-200">
                <Plus size={14} /> Add Contact
              </button>
            </div>
            
            {customerForm.contacts?.map((contact: any, idx: number) => (
              <div key={idx} className="grid grid-cols-3 gap-4 mb-4 p-3 bg-slate-50 rounded border border-slate-100 relative">
                {idx > 0 && (
                  <button onClick={() => {
                    const newContacts = [...customerForm.contacts];
                    newContacts.splice(idx, 1);
                    setCustomerForm({...customerForm, contacts: newContacts});
                  }} className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-200 text-xs shadow-sm">
                    &times;
                  </button>
                )}
                <FormField label="Contact Person"><input className={inputClass} value={contact.person} onChange={e => {
                  const newContacts = [...customerForm.contacts];
                  newContacts[idx].person = e.target.value;
                  setCustomerForm({...customerForm, contacts: newContacts});
                }} /></FormField>
                <FormField label="Contact Number"><input className={inputClass} value={contact.number} onChange={e => {
                  const newContacts = [...customerForm.contacts];
                  newContacts[idx].number = e.target.value;
                  setCustomerForm({...customerForm, contacts: newContacts});
                }} /></FormField>
                <FormField label="Email"><input className={inputClass} value={contact.email} onChange={e => {
                  const newContacts = [...customerForm.contacts];
                  newContacts[idx].email = e.target.value;
                  setCustomerForm({...customerForm, contacts: newContacts});
                }} /></FormField>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <Modal open={!!quotationModalTarget} onClose={() => setQuotationModalTarget(null)} title="Create Quotation" footer={<><Button variant="secondary" onClick={() => setQuotationModalTarget(null)}>Cancel</Button><Button onClick={saveQuotation}>Create Quotation</Button></>}>
        <div className="flex flex-col gap-4">
          <FormField label="Project Name"><input className={inputClass} value={quoteForm.projectName} disabled /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Quotation No" required><input className={inputClass} value={quoteForm.quoteNo} disabled /></FormField>
            <FormField label="Customer"><input className={inputClass} value={quoteForm.customer} disabled /></FormField>
            <FormField label="Part Name" required><input className={inputClass} value={quoteForm.partName} onChange={e=>setQuoteForm({...quoteForm, partName: e.target.value})} /></FormField>
            <FormField label="Quantity" required><input type="number" className={inputClass} value={quoteForm.quantity} onChange={e=>setQuoteForm({...quoteForm, quantity: e.target.value})} /></FormField>
            <FormField label="Unit Price (Rs.)" required><input type="number" className={inputClass} value={quoteForm.unitPrice} onChange={e=>setQuoteForm({...quoteForm, unitPrice: e.target.value})} /></FormField>
            <FormField label="Valid Till" required><input type="date" className={inputClass} value={quoteForm.validTill} onChange={e=>setQuoteForm({...quoteForm, validTill: e.target.value})} /></FormField>
          </div>
        </div>
      </Modal>

      <Modal open={!!orderModalTarget} onClose={() => setOrderModalTarget(null)} title="Create Sales Order" footer={<><Button variant="secondary" onClick={() => setOrderModalTarget(null)}>Cancel</Button><Button onClick={saveOrder}>Create Order</Button></>}>
        <div className="flex flex-col gap-4">
          <FormField label="Project Name"><input className={inputClass} value={orderForm.projectName} disabled /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Sales Order No" required><input className={inputClass} value={orderForm.orderNo} disabled /></FormField>
            <FormField label="Customer"><input className={inputClass} value={orderForm.customer} disabled /></FormField>
            <FormField label="Part Name" required><input className={inputClass} value={orderForm.partName} onChange={e=>setOrderForm({...orderForm, partName: e.target.value})} /></FormField>
            <FormField label="Quantity" required><input type="number" className={inputClass} value={orderForm.quantity} onChange={e=>setOrderForm({...orderForm, quantity: e.target.value})} /></FormField>
            <FormField label="Delivery Date" required><input type="date" className={inputClass} value={orderForm.deliveryDate} onChange={e=>setOrderForm({...orderForm, deliveryDate: e.target.value})} /></FormField>
            <FormField label="Payment Terms">
              <select className={inputClass} value={orderForm.paymentTerms} onChange={e=>setOrderForm({...orderForm, paymentTerms: e.target.value})}>
                <option>Advance</option><option>Net 30</option><option>Net 60</option>
              </select>
            </FormField>
          </div>
        </div>
      </Modal>

    </div>
  );
}
