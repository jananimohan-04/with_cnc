const fs = require('fs');
let content = fs.readFileSync('src/pages/sales/SalesPipelinePage.tsx', 'utf8');

const handleItemActionCode = `  const handleItemAction = async (order: any, itemIndex: number, action: 'inward' | 'unavailable') => {
    if (!window.confirm(\`Are you sure you want to mark this part as \${action}?\`)) return;
    setLoading(true);
    
    const updatedItems = [...order.items];
    updatedItems[itemIndex].status = action === 'inward' ? 'Inwarded' : 'Unavailable';
    
    let newOrderStatus = order.status;
    if (action === 'unavailable') {
        newOrderStatus = 'Waiting for Parts';
    } else {
        const allInwarded = updatedItems.every(i => i.status === 'Inwarded');
        if (allInwarded) newOrderStatus = 'Confirmed';
    }
    
    if (action === 'inward') {
        const item = updatedItems[itemIndex];
        const iNo = \`INW-2026-\${Math.floor(1000 + Math.random() * 9000)}\`;
        await supabase.from('cnc_inwards').insert([{
          id: crypto.randomUUID(), inward_no: iNo, category: 'CUSTOMER DC', 
          project_name: order.project_name || order.lead_no || '', 
          sales_order_ref: order.order_no, reference_no: '', 
          inward_date: new Date().toISOString().split('T')[0], 
          party_name: order.customer || order.customer_name || '', remarks: 'Auto-generated from part-wise action',
          part_name: item.partName || '-', part_number: item.partNumber || '', 
          quantity: Number(item.quantity) || 0, total_amount: 0, status: 'Received'
        }]);
    }
    
    const { error } = await supabase.from('cnc_sales_orders').update({
        items: updatedItems,
        status: newOrderStatus
    }).eq('id', order.id);
    
    if (error) alert("Error updating item: " + error.message);
    else {
        fetchPipeline();
        setViewModalTarget(null);
    }
    setLoading(false);
  };

  const renderRecordData =`;

content = content.replace('  const renderRecordData =', handleItemActionCode);

const oldItemsTable = `<thead className="text-[10px] text-slate-500 bg-slate-50 uppercase border-b border-slate-200">
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
                  </tbody>`;

const newItemsTable = `<thead className="text-[10px] text-slate-500 bg-slate-50 uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2">Part Name / No</th>
                      <th className="px-4 py-2">Qty</th>
                      <th className="px-4 py-2">Unit Price</th>
                      <th className="px-4 py-2">Total</th>
                      {title === 'Sales Order' && <th className="px-4 py-2 text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {raw.items.map((item: any, i: number) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {item.partName || '-'} 
                          <span className="text-xs text-slate-400 block font-normal">{item.partNumber}</span>
                          {item.status && <span className={\`text-[9px] font-bold px-1.5 py-0.5 rounded \${item.status === 'Inwarded' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}\`}>{item.status}</span>}
                        </td>
                        <td className="px-4 py-3">{item.quantity}</td>
                        <td className="px-4 py-3">{formatINR(item.unitPrice || 0)}</td>
                        <td className="px-4 py-3 font-bold text-brand-600">{formatINR((item.quantity||0) * (item.unitPrice||0))}</td>
                        {title === 'Sales Order' && (
                          <td className="px-4 py-3 text-right">
                            {!item.status && (
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={() => handleItemAction(raw, i, 'inward')} className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded border border-emerald-200" title="Available (Inward)">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                </button>
                                <button onClick={() => handleItemAction(raw, i, 'unavailable')} className="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded border border-red-200" title="Unavailable">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>`;
                  
content = content.replace(oldItemsTable, newItemsTable);

fs.writeFileSync('src/pages/sales/SalesPipelinePage.tsx', content);
