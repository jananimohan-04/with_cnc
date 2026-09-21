const fs = require('fs');

let content = fs.readFileSync('src/pages/sales/SalesPipelinePage.tsx', 'utf8');

// Use a simple regex to replace the exact line
content = content.replace(
  /\{ id: 'Sales Order', title: 'SALES ORDER', desc: 'Confirmed orders', color: 'emerald', bg: 'bg-emerald-50\/70', border: 'border-emerald-200\/60', text: 'text-emerald-700' \},/g,
  `{ id: 'Sales Order', title: 'SALES ORDER', desc: 'Confirmed orders', color: 'emerald', bg: 'bg-emerald-50/70', border: 'border-emerald-200/60', text: 'text-emerald-700' },
              { id: 'Unavailability Parts', title: 'UNAVAILABILITY PARTS', desc: 'Waiting for material', color: 'red', bg: 'bg-red-50/70', border: 'border-red-200/60', text: 'text-red-700' },`
);

fs.writeFileSync('src/pages/sales/SalesPipelinePage.tsx', content);
