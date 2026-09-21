const fs = require('fs');

let content = fs.readFileSync('src/pages/sales/SalesPipelinePage.tsx', 'utf8');

// Replace all instances of `<FormField label="Part Number">...</FormField>`
content = content.replace(/<FormField label="Part Number">.*?<\/FormField>/g, '');

fs.writeFileSync('src/pages/sales/SalesPipelinePage.tsx', content);
