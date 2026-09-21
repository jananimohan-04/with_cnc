const fs = require('fs');

let content = fs.readFileSync('src/pages/sales/SalesPipelinePage.tsx', 'utf8');

// 1. Update pipelineStages
const oldStages = `    { id: 'Sales Order', title: 'SALES ORDER', description: 'Confirmed orders', color: 'border-emerald-200 bg-emerald-50' },
    { id: 'Inward', title: 'INWARD', description: 'Raw material / Purchase', color: 'border-orange-200 bg-orange-50' },`;
const newStages = `    { id: 'Sales Order', title: 'SALES ORDER', description: 'Confirmed orders', color: 'border-emerald-200 bg-emerald-50' },
    { id: 'Unavailability Parts', title: 'UNAVAILABILITY PARTS', description: 'Waiting for material', color: 'border-red-200 bg-red-50' },
    { id: 'Inward', title: 'INWARD', description: 'Raw material / Purchase', color: 'border-orange-200 bg-orange-50' },`;
content = content.replace(oldStages, newStages);

// 2. Add 'Waiting for Parts' to SQL queries for orders
content = content.replace(
  /\.in\('status', \['Draft', 'Confirmed', 'In Production'\]\)/g,
  `.in('status', ['Draft', 'Confirmed', 'Waiting for Parts', 'In Production'])`
);

// 3. Map status to new column in `orders.forEach`
const orderMapRegex = /orders\.forEach\(o => \{\n\s*newCards\.push\(\{([\s\S]*?)stage: 'Sales Order'/;
const orderMapReplace = `orders.forEach(o => {\n          let stage = 'Sales Order';\n          if (o.status === 'Waiting for Parts') stage = 'Unavailability Parts';\n\n          newCards.push({$1stage: stage`;
content = content.replace(orderMapRegex, orderMapReplace);

// 4. Update handleDrop for dragging from Unavailability Parts -> Sales Order or Sales Order -> Unavailability Parts
const oldHandleDropEnd = `} else if (card.type === 'dc' && toStage === 'Invoice') {
        setInvoiceForm({
           invoiceNo: \`INV-2026-\${Math.floor(1000 + Math.random() * 9000)}\`,
           date: new Date().toISOString().split('T')[0], partyName: card.customer,
           dcNumber: card.refNo, partName: card.part, quantity: card.qty?.toString() || '0', price: '0', 
           cgst: '9', sgst: '9', igst: '0'
        });
        setInvoiceModalTarget(card);
      } else {`;

const newHandleDropEnd = `} else if (card.type === 'dc' && toStage === 'Invoice') {
        setInvoiceForm({
           invoiceNo: \`INV-2026-\${Math.floor(1000 + Math.random() * 9000)}\`,
           date: new Date().toISOString().split('T')[0], partyName: card.customer,
           dcNumber: card.refNo, partName: card.part, quantity: card.qty?.toString() || '0', price: '0', 
           cgst: '9', sgst: '9', igst: '0'
        });
        setInvoiceModalTarget(card);
      } else if (card.type === 'order' && toStage === 'Unavailability Parts') {
        await supabase.from('cnc_sales_orders').update({ status: 'Waiting for Parts' }).eq('id', card.raw.id);
        fetchPipeline();
      } else if (card.type === 'order' && toStage === 'Sales Order') {
        await supabase.from('cnc_sales_orders').update({ status: 'Confirmed' }).eq('id', card.raw.id);
        fetchPipeline();
      } else {`;

content = content.replace(oldHandleDropEnd, newHandleDropEnd);

// 5. Allow dragging to/from Unavailability Parts in the else block
const oldElseBlock = `if ((card.type === 'inward' && toStage === 'DC') || (card.type === 'inward' && toStage === 'Invoice') || (card.type === 'finished_goods' && toStage === 'Invoice')) {
           alert(\`Please complete \${card.type === 'inward' ? 'Finished Goods entry' : 'the Delivery Challan'} before moving to \${toStage}.\`);
        } else {
           alert(\`Cannot drag \${card.stage} directly to \${toStage}. Please follow the sequence.\`);
        }`;
        
// The dragging logic is already covered by the explicit conditionals. If it hits the else block, it's invalid.
// Wait, the "Inward" button: what if stage is Unavailability Parts? The button says "Add Inward" and the stage logic is `if (stage.id === 'Inward')`.
// Unavailability Parts button should say nothing or "Awaiting Stock"
const oldButtonLogic = `else if (stage.id === 'Sales Order') {
                        setSoForm({`;
const newButtonLogic = `else if (stage.id === 'Unavailability Parts') {
                        alert("To move an item out of Unavailability Parts, either confirm stock to move it back to Sales Order, or drag it to Inward to record material.");
                      } else if (stage.id === 'Sales Order') {`;

content = content.replace(oldButtonLogic, newButtonLogic);

const oldButtonRender = `{stage.id === 'Sales Order' ? '+ Add Sales Order' : 
                     stage.id === 'Inward' ? '+ Add Inward' :`;
const newButtonRender = `{stage.id === 'Sales Order' ? '+ Add Sales Order' : 
                     stage.id === 'Unavailability Parts' ? 'Awaiting Stock' :
                     stage.id === 'Inward' ? '+ Add Inward' :`;
content = content.replace(oldButtonRender, newButtonRender);

fs.writeFileSync('src/pages/sales/SalesPipelinePage.tsx', content);
