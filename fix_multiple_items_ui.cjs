const fs = require('fs');

let content = fs.readFileSync('src/pages/sales/SalesPipelinePage.tsx', 'utf8');

const regexUI = /<FormField label="Product \/ Part Required" required>[\s\S]*?<FormField label="Quantity">[\s\S]*?<\/FormField>/g;

const newUI = `<div className="col-span-2">
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
            </div>`;

content = content.replace(regexUI, newUI);

fs.writeFileSync('src/pages/sales/SalesPipelinePage.tsx', content);
