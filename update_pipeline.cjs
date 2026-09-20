const fs = require('fs');
const path = require('path');

const filePath = path.resolve('src/pages/sales/SalesPipelinePage.tsx');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Update Stage type
code = code.replace(
  /type Stage = 'Enquiry' \| 'Quotation' \| 'Sales Order' \| 'Inward';/,
  "type Stage = 'Enquiry' | 'Quotation' | 'Sales Order' | 'Inward' | 'Finished Goods' | 'DC' | 'Invoice';"
);

// 2. Update KanbanCard type
code = code.replace(
  /type: 'lead' \| 'quotation' \| 'order' \| 'inward';/,
  "type: 'lead' | 'quotation' | 'order' | 'inward' | 'finished_goods' | 'dc' | 'invoice';"
);

// 3. Update columns array
code = code.replace(
  /const columns: Stage\[\] = \['Enquiry', 'Quotation', 'Sales Order', 'Inward'\];/,
  "const columns: Stage[] = ['Enquiry', 'Quotation', 'Sales Order', 'Inward', 'Finished Goods', 'DC', 'Invoice'];"
);

// 4. Update Kanban Board classes (remove flex-1 min-w max-w logic from columns, add fixed width)
code = code.replace(
  /<div className="flex-1 flex gap-4 overflow-x-auto pb-4">/,
  '<div className="flex-1 overflow-x-auto pb-6 scrollbar-thin"><div className="flex gap-5 h-full items-start min-w-max px-2">'
);
code = code.replace(
  /<div key={stage} className="flex-1 min-w-\[280px\] max-w-\[320px\] bg-slate-100 rounded-xl p-3 flex flex-col border border-slate-200 shadow-sm"/,
  '<div key={stage} className="w-[340px] flex-shrink-0 bg-slate-50 rounded-2xl p-4 flex flex-col border border-slate-200/60 shadow-sm max-h-full"'
);

// Close the inner div for the scroll container
code = code.replace(
  /        \{\/\* Generic View Modal \*\/\}/,
  '        </div>\n        {/* Generic View Modal */}'
);

// 5. Update Card design
code = code.replace(
  /className="bg-white p-3\.5 rounded-lg shadow-sm border border-slate-200 cursor-grab active:cursor-grabbing hover:border-brand-300 transition-all group relative"/,
  'className="bg-white p-4 rounded-2xl shadow-card border border-slate-200/60 cursor-grab active:cursor-grabbing hover:shadow-card-hover hover:border-brand-300 hover:-translate-y-1 transition-all duration-300 group relative"'
);

// 6. Update tableMap for inline edit
code = code.replace(
  /'Inward': 'cnc_inwards'/,
  "'Inward': 'cnc_inwards',\n      'Finished Goods': 'cnc_work_orders',\n      'DC': 'cnc_deliveries',\n      'Invoice': 'cnc_invoices'"
);

// 7. Inject fetch logic for new stages inside fetchPipeline
const fetchInjection = `
    // Add fetching for FG, DC, Invoices
    const { data: fgs } = await supabase.from('cnc_work_orders').select('*').in('status', ['Completed', 'In Progress']);
    const { data: dcs } = await supabase.from('cnc_deliveries').select('*');
    // Safely attempt to fetch invoices if table exists
    let invoicesData = [];
    try {
       const { data: invs, error: invErr } = await supabase.from('cnc_invoices').select('*');
       if (!invErr && invs) invoicesData = invs;
    } catch(e) {}

    if (fgs) {
      fgs.filter(w => w.completed > 0 || w.status === 'Completed').forEach(w => {
         newCards.push({
            id: w.id, stage: 'Finished Goods', type: 'finished_goods',
            refNo: w.wo_no || w.woNo || \`WO-\${w.id.substring(0,4)}\`, customer: w.customer,
            part: w.part_name || w.partName, qty: w.completed, value: 0,
            date: w.updated_at ? w.updated_at.split('T')[0] : '', status: w.status, raw: w
         });
      });
    }

    if (dcs) {
      dcs.forEach(d => {
         newCards.push({
            id: d.id, stage: 'DC', type: 'dc',
            refNo: d.delivery_no || \`DC-\${d.id.substring(0,4)}\`, customer: d.customer_name || d.party_name || 'Customer',
            part: d.part_name, qty: d.quantity, value: 0,
            date: d.delivery_date, status: d.status, raw: d
         });
      });
    }

    if (invoicesData && invoicesData.length > 0) {
      invoicesData.forEach(inv => {
         newCards.push({
            id: inv.id, stage: 'Invoice', type: 'invoice',
            refNo: inv.invoice_no || \`INV-\${inv.id.substring(0,4)}\`, customer: inv.customer_name || 'Customer',
            part: inv.item || inv.part_name || '-', qty: inv.quantity || 1, value: inv.amount || 0,
            date: inv.invoice_date || inv.created_at.split('T')[0], status: inv.status, raw: inv
         });
      });
    }
`;

code = code.replace(
  /    setCards\(newCards\);\s+setLoading\(false\);/,
  fetchInjection + '\n    setCards(newCards);\n    setLoading(false);'
);

// Let's replace the Dashboard cards mapping to dynamically handle new stages
code = code.replace(
  /const stateKey = keyMap\[title\];/,
  "const keyMap: any = { 'Enquiry': 'enquiry', 'Quotation': 'quotation', 'Sales Order': 'order', 'Inward': 'inward', 'Finished Goods': 'finished_goods', 'DC': 'dc', 'Invoice': 'invoice' };\n          const stateKey = keyMap[title];"
);
code = code.replace(
  /const keyMap: any = \{ 'Enquiry': 'enquiry', 'Quotation': 'quotation', 'Sales Order': 'order', 'Inward': 'inward' \};\s+const stateKey = keyMap\[title\];/,
  "const stateKey = keyMap[title];" // avoid double
);

// We need to add standard view rendering for new stages in generic view modal
const renderInjection = `
             {renderRecordData('Finished Goods', viewModalData?.finished_goods)}
             {renderRecordData('DC', viewModalData?.dc)}
             {renderRecordData('Invoice', viewModalData?.invoice)}
`;
code = code.replace(
  /\{renderRecordData\('Inward', viewModalData\.inward\)\}/,
  "{renderRecordData('Inward', viewModalData.inward)}" + renderInjection
);

fs.writeFileSync(filePath, code, 'utf8');
console.log('Pipeline updated');
