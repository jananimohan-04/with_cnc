import fs from 'fs';
import path from 'path';

const fp = path.resolve('src/pages/sales/SalesPipelinePage.tsx');
let code = fs.readFileSync(fp, 'utf8');

// 1. Add state variables for the new modals
const stateSearch = `const [inwardModalTarget, setInwardModalTarget] = useState<KanbanCard | null>(null);`;
const stateAdd = `const [inwardModalTarget, setInwardModalTarget] = useState<KanbanCard | null>(null);
  const [fgModalTarget, setFgModalTarget] = useState<KanbanCard | null>(null);
  const [fgForm, setFgForm] = useState<any>({});
  const [dcModalTarget, setDcModalTarget] = useState<KanbanCard | null>(null);
  const [dcForm, setDcForm] = useState<any>({});
  const [invoiceModalTarget, setInvoiceModalTarget] = useState<KanbanCard | null>(null);
  const [invoiceForm, setInvoiceForm] = useState<any>({});`;
code = code.replace(stateSearch, stateAdd);


// 2. Update handleDrop to handle the new transitions and prevent skipping
const dropSearch = `} else if (card.type === 'order' && toStage === 'Inward') {
      const iNo = \`INW-2026-\${Math.floor(1000 + Math.random() * 9000)}\`;
      setInwardForm({
        inwardNo: iNo, category: 'CUSTOMER DC', projectName: card.raw.project_name || '', salesOrderRef: card.refNo, referenceNo: '', inwardDate: new Date().toISOString().split('T')[0], partyName: card.customer, remarks: '',
        partName: card.part, partNumber: card.raw.part_number || '', quantity: card.qty?.toString() || '0', price: '', discount: '0', gst: '18',
        contacts: parseContacts(card.raw)
      });
      setInwardModalTarget(card);
    }
  };`;

const dropReplace = `} else if (card.type === 'order' && toStage === 'Inward') {
      const iNo = \`INW-2026-\${Math.floor(1000 + Math.random() * 9000)}\`;
      setInwardForm({
        inwardNo: iNo, category: 'CUSTOMER DC', projectName: card.raw.project_name || '', salesOrderRef: card.refNo, referenceNo: '', inwardDate: new Date().toISOString().split('T')[0], partyName: card.customer, remarks: '',
        partName: card.part, partNumber: card.raw.part_number || '', quantity: card.qty?.toString() || '0', price: '', discount: '0', gst: '18',
        contacts: parseContacts(card.raw)
      });
      setInwardModalTarget(card);
    } else if (card.type === 'inward' && toStage === 'Finished Goods') {
      setFgForm({
         woNo: \`WO-2026-\${Math.floor(1000 + Math.random() * 9000)}\`,
         customer: card.customer, partName: card.part, partNo: card.raw.part_number || '',
         orderQty: card.qty?.toString() || '0', completedQty: card.qty?.toString() || '0',
         date: new Date().toISOString().split('T')[0]
      });
      setFgModalTarget(card);
    } else if (card.type === 'finished_goods' && toStage === 'DC') {
      setDcForm({
         dcNo: \`DC-2026-\${Math.floor(1000 + Math.random() * 9000)}\`,
         date: new Date().toISOString().split('T')[0], partyName: card.customer,
         partName: card.part, quantity: card.qty?.toString() || '0', price: '', 
         poNumber: card.raw.wo_no || card.raw.woNo || '', vehicleNo: '', ewayBill: ''
      });
      setDcModalTarget(card);
    } else if (card.type === 'dc' && toStage === 'Invoice') {
      setInvoiceForm({
         invoiceNo: \`INV-2026-\${Math.floor(1000 + Math.random() * 9000)}\`,
         date: new Date().toISOString().split('T')[0], partyName: card.customer,
         dcNumber: card.refNo, partName: card.part, quantity: card.qty?.toString() || '0', price: '0', 
         cgst: '9', sgst: '9', igst: '0'
      });
      setInvoiceModalTarget(card);
    } else {
      if ((card.type === 'inward' && toStage === 'DC') || (card.type === 'inward' && toStage === 'Invoice') || (card.type === 'finished_goods' && toStage === 'Invoice')) {
         alert(\`Please complete \${card.type === 'inward' ? 'Finished Goods entry' : 'the Delivery Challan'} before moving to \${toStage}.\`);
      } else {
         alert(\`Cannot drag \${card.stage} directly to \${toStage}. Please follow the sequence.\`);
      }
    }
  };`;
code = code.replace(dropSearch, dropReplace);


// 3. Add Save Functions
const saveSearch = `  const removeFromPipeline = async (card: KanbanCard) => {`;
const saveReplace = `  const saveFinishedGoods = async () => {
    if (!fgModalTarget) return;
    const q = Number(fgForm.completedQty) || 0;
    const maxQ = Number(fgForm.orderQty) || 0;
    if (q > maxQ) {
       alert(\`Quantity cannot exceed the inwarded amount of \${maxQ} pcs.\`);
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
       alert(\`Quantity cannot exceed the finished goods stock of \${maxQ} pcs.\`);
       return;
    }
    const { error } = await supabase.from('cnc_deliveries').insert([{
       id: crypto.randomUUID(), delivery_no: dcForm.dcNo, party_name: dcForm.partyName,
       part_name: dcForm.partName, quantity: q, delivery_date: dcForm.date, status: 'Delivered',
       created_at: new Date().toISOString()
    }]);
    if (!error) {
       await supabase.from('cnc_work_orders').update({ status: 'Dispatched' }).eq('id', dcModalTarget.raw.id);
       setDcModalTarget(null); fetchPipeline();
    } else { alert("Error: " + error.message); }
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

  const removeFromPipeline = async (card: KanbanCard) => {`;
code = code.replace(saveSearch, saveReplace);


// 4. Add the Modals to the UI
const modalSearch = `{/* View/Edit Modal */}`;
const modalReplace = `{/* Finished Goods Modal */}
      <Modal open={!!fgModalTarget} onClose={() => setFgModalTarget(null)} title="Finished Goods Entry" size="lg" footer={<><Button variant="secondary" onClick={() => setFgModalTarget(null)}>Cancel</Button><Button onClick={saveFinishedGoods}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Category" required><select className={inputClass}><option>Finished Goods</option></select></FormField>
          <FormField label="Date" required><input type="date" className={inputClass} value={fgForm.date} onChange={e=>setFgForm({...fgForm, date: e.target.value})} /></FormField>
          <FormField label="Project / Customer"><input className={inputClass} value={fgForm.customer} disabled /></FormField>
          <FormField label="Part Name"><input className={inputClass} value={fgForm.partName} disabled /></FormField>
          <FormField label="Max Available Quantity (from Inward)"><input type="number" className={\`\${inputClass} bg-slate-100 font-bold\`} value={fgForm.orderQty} disabled /></FormField>
          <FormField label="Quantity to Process" required><input type="number" className={inputClass} value={fgForm.completedQty} onChange={e=>setFgForm({...fgForm, completedQty: e.target.value})} /></FormField>
        </div>
      </Modal>

      {/* Delivery Challan Modal */}
      <Modal open={!!dcModalTarget} onClose={() => setDcModalTarget(null)} title="Delivery Challan Form" size="lg" footer={<><Button variant="secondary" onClick={() => setDcModalTarget(null)}>Cancel</Button><Button onClick={saveDeliveryChallan}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="DC No" required><input className={inputClass} value={dcForm.dcNo} disabled /></FormField>
          <FormField label="Date" required><input type="date" className={inputClass} value={dcForm.date} onChange={e=>setDcForm({...dcForm, date: e.target.value})} /></FormField>
          <FormField label="Party Name" required><input className={inputClass} value={dcForm.partyName} disabled /></FormField>
          <FormField label="PO / WO Number"><input className={inputClass} value={dcForm.poNumber} onChange={e=>setDcForm({...dcForm, poNumber: e.target.value})} /></FormField>
          <FormField label="Vehicle No"><input className={inputClass} value={dcForm.vehicleNo} onChange={e=>setDcForm({...dcForm, vehicleNo: e.target.value})} /></FormField>
          <FormField label="E-Way Bill No"><input className={inputClass} value={dcForm.ewayBill} onChange={e=>setDcForm({...dcForm, ewayBill: e.target.value})} /></FormField>
          <div className="col-span-2 border-t border-slate-100 mt-2 pt-4">
            <h4 className="font-semibold text-sm text-slate-800 mb-3">Part Details</h4>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Part Name" required><input className={inputClass} value={dcForm.partName} disabled /></FormField>
              <FormField label="Quantity" required><input type="number" className={inputClass} value={dcForm.quantity} onChange={e=>setDcForm({...dcForm, quantity: e.target.value})} /></FormField>
              <FormField label="Price"><input type="number" className={inputClass} value={dcForm.price} onChange={e=>setDcForm({...dcForm, price: e.target.value})} /></FormField>
            </div>
          </div>
        </div>
      </Modal>

      {/* Invoice Modal */}
      <Modal open={!!invoiceModalTarget} onClose={() => setInvoiceModalTarget(null)} title="Billing System" size="lg" footer={<><Button variant="secondary" onClick={() => setInvoiceModalTarget(null)}>Cancel</Button><Button onClick={saveInvoice}>Submit</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Document Type" required><select className={inputClass}><option>Tax Invoice</option></select></FormField>
          <FormField label="Invoice No" required><input className={inputClass} value={invoiceForm.invoiceNo} disabled /></FormField>
          <FormField label="Party Name" required><input className={inputClass} value={invoiceForm.partyName} disabled /></FormField>
          <FormField label="DC Number"><input className={inputClass} value={invoiceForm.dcNumber} disabled /></FormField>
          <FormField label="Date" required><input type="date" className={inputClass} value={invoiceForm.date} onChange={e=>setInvoiceForm({...invoiceForm, date: e.target.value})} /></FormField>
          <div className="col-span-2 border-t border-slate-100 mt-2 pt-4">
            <h4 className="font-semibold text-sm text-slate-800 mb-3">Item Details</h4>
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-2"><FormField label="Item Name" required><input className={inputClass} value={invoiceForm.partName} disabled /></FormField></div>
              <FormField label="Qty" required><input type="number" className={inputClass} value={invoiceForm.quantity} onChange={e=>setInvoiceForm({...invoiceForm, quantity: e.target.value})} /></FormField>
              <FormField label="Unit Price" required><input type="number" className={inputClass} value={invoiceForm.price} onChange={e=>setInvoiceForm({...invoiceForm, price: e.target.value})} /></FormField>
              <FormField label="CGST (%)"><input type="number" className={inputClass} value={invoiceForm.cgst} onChange={e=>setInvoiceForm({...invoiceForm, cgst: e.target.value})} /></FormField>
              <FormField label="SGST (%)"><input type="number" className={inputClass} value={invoiceForm.sgst} onChange={e=>setInvoiceForm({...invoiceForm, sgst: e.target.value})} /></FormField>
              <FormField label="IGST (%)"><input type="number" className={inputClass} value={invoiceForm.igst} onChange={e=>setInvoiceForm({...invoiceForm, igst: e.target.value})} /></FormField>
              <FormField label="Total Amount"><input type="text" className={\`\${inputClass} bg-slate-100 font-bold\`} value={((Number(invoiceForm.quantity)||0) * (Number(invoiceForm.price)||0) * (1 + ((Number(invoiceForm.cgst)||0) + (Number(invoiceForm.sgst)||0) + (Number(invoiceForm.igst)||0))/100)).toFixed(2)} disabled /></FormField>
            </div>
          </div>
        </div>
      </Modal>

      {/* View/Edit Modal */}`;
code = code.replace(modalSearch, modalReplace);

fs.writeFileSync(fp, code, 'utf8');
console.log('Kanban workflow successfully added');
