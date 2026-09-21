const fs = require('fs');

let content = fs.readFileSync('src/pages/sales/SalesPipelinePage.tsx', 'utf8');

// Update state initialization
content = content.replace(
  /const \[newLeadForm, setNewLeadForm\] = useState\(\{([\s\S]*?)partName: '', partNo: '', quantity: '',([\s\S]*?)\}\);/,
  `const [newLeadForm, setNewLeadForm] = useState({$1items: [{ partName: '', quantity: '' }], partName: '', partNo: '', quantity: '',$2});`
);

// Update saveNewLead function to insert multiple
const oldSaveNewLeadInsert = `const { error } = await supabase.from('cnc_enquiries').insert([{
        id: crypto.randomUUID(), lead_no: newLeadForm.leadNo, enquiry_no: newLeadForm.leadNo, customer: newLeadForm.company,
        contact_person: cStr.person, phone: cStr.phone, email: cStr.email,
        city: newLeadForm.city, gst: newLeadForm.gst, enquiring_for: newLeadForm.enquiringFor,
        part_name: newLeadForm.partName || 'TBD', part_no: newLeadForm.partNo || 'N/A', quantity: Number(newLeadForm.quantity) || 0, estimated_value: Number(newLeadForm.estimatedValue) || 0, expected_date: newLeadForm.expectedDate || new Date().toISOString().split('T')[0], received_date: new Date().toISOString().split('T')[0],
        source: newLeadForm.source, status: 'New', pipeline_stage: 'Enquiry'
      }]);`;

const newSaveNewLeadInsert = `
      const itemsToInsert = newLeadForm.items && newLeadForm.items.length > 0 ? newLeadForm.items : [{ partName: newLeadForm.partName, quantity: newLeadForm.quantity }];
      const validItems = itemsToInsert.filter(i => i.partName.trim() !== '');
      if (validItems.length === 0) validItems.push({ partName: 'TBD', quantity: '0' });

      const inserts = validItems.map(item => ({
        id: crypto.randomUUID(), lead_no: newLeadForm.leadNo, enquiry_no: newLeadForm.leadNo, customer: newLeadForm.company,
        contact_person: cStr.person, phone: cStr.phone, email: cStr.email,
        city: newLeadForm.city, gst: newLeadForm.gst, enquiring_for: newLeadForm.enquiringFor,
        part_name: item.partName || 'TBD', part_no: newLeadForm.partNo || 'N/A', quantity: Number(item.quantity) || 0, estimated_value: Number(newLeadForm.estimatedValue) || 0, expected_date: newLeadForm.expectedDate || new Date().toISOString().split('T')[0], received_date: new Date().toISOString().split('T')[0],
        source: newLeadForm.source, status: 'New', pipeline_stage: 'Enquiry'
      }));

      const { error } = await supabase.from('cnc_enquiries').insert(inserts);`;

content = content.replace(oldSaveNewLeadInsert, newSaveNewLeadInsert);

// Update reset logic
content = content.replace(
  /setNewLeadForm\(\{\n          leadNo: `PROJ-\$\{Math\.floor\(1000 \+ Math\.random\(\) \* 9000\)\}`,([\s\S]*?)partName: '', partNo: '', quantity: '',([\s\S]*?)\}\);/g,
  `setNewLeadForm({\n          leadNo: \`PROJ-\${Math.floor(1000 + Math.random() * 9000)}\`,$1items: [{ partName: '', quantity: '' }], partName: '', partNo: '', quantity: '',$2});`
);

// Update UI in Modal
const oldUI = `<FormField label="Product / Part Required" required><input className={inputClass} value={newLeadForm.partName} onChange={e => setNewLeadForm({...newLeadForm, partName: e.target.value})} /></FormField>
            <FormField label="Quantity"><input type="number" className={inputClass} value={newLeadForm.quantity} onChange={e => setNewLeadForm({...newLeadForm, quantity: e.target.value})} /></FormField>`;

const newUI = `<div className="col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Products / Parts Required *</label>
              <div className="space-y-2">
                {(newLeadForm.items || [{ partName: '', quantity: '' }]).map((item, idx) => (
                  <div key={idx} className="flex gap-4 items-start">
                    <div className="flex-1">
                      <input className={inputClass} placeholder="Part Name" value={item.partName} onChange={e => {
                        const newItems = [...(newLeadForm.items || [])];
                        newItems[idx].partName = e.target.value;
                        setNewLeadForm({...newLeadForm, items: newItems, partName: newItems[0].partName}); // Keep root for backward compat
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
                      <button type="button" className="p-2.5 text-red-500 hover:bg-red-50 rounded mt-1" onClick={() => {
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
            </div>`;

content = content.replace(oldUI, newUI);

fs.writeFileSync('src/pages/sales/SalesPipelinePage.tsx', content);
