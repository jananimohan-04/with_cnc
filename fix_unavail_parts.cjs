const fs = require('fs');

let content = fs.readFileSync('src/pages/sales/SalesPipelinePage.tsx', 'utf8');

const oldArray = `              { id: 'Sales Order', title: 'SALES ORDER', desc: 'Confirmed orders', color: 'emerald', bg: 'bg-emerald-50/70', border: 'border-emerald-200/60', text: 'text-emerald-700' },
              { id: 'Inward', title: 'INWARD', desc: 'Raw material / Purchase', color: 'orange', bg: 'bg-orange-50/70', border: 'border-orange-200/60', text: 'text-orange-700' },`;

const newArray = `              { id: 'Sales Order', title: 'SALES ORDER', desc: 'Confirmed orders', color: 'emerald', bg: 'bg-emerald-50/70', border: 'border-emerald-200/60', text: 'text-emerald-700' },
              { id: 'Unavailability Parts', title: 'UNAVAILABILITY PARTS', desc: 'Waiting for material', color: 'red', bg: 'bg-red-50/70', border: 'border-red-200/60', text: 'text-red-700' },
              { id: 'Inward', title: 'INWARD', desc: 'Raw material / Purchase', color: 'orange', bg: 'bg-orange-50/70', border: 'border-orange-200/60', text: 'text-orange-700' },`;

content = content.replace(oldArray, newArray);

fs.writeFileSync('src/pages/sales/SalesPipelinePage.tsx', content);
