import fs from 'fs';
import path from 'path';

const fp = path.resolve('src/pages/sales/SalesPipelinePage.tsx');
let code = fs.readFileSync(fp, 'utf8');

const badBlockRegex = /const handleInlineEdit = async \([\s\S]*?fetchPipeline\(\);\s+\}\s+\};/;
const goodBlock = `const handleInlineEdit = async (title: string, id: string, field: string, value: string) => {
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

    const { error } = await supabase.from(table).update({ [field]: value }).eq('id', id);
    if (error) {
       console.error("Failed to update:", error);
       alert("Failed to update field: " + error.message);
    } else {
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
    }
  };`;

code = code.replace(badBlockRegex, goodBlock);
fs.writeFileSync(fp, code, 'utf8');
console.log("Fixed handleInlineEdit");
