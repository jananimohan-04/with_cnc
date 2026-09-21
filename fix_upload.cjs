const fs = require('fs');

let content = fs.readFileSync('src/pages/sales/SalesPipelinePage.tsx', 'utf8');

content = content.replace(/accept="\.pdf,\.png,\.jpg,\.jpeg,\.svg"/g, 'accept="*"');
content = content.replace(/SVG, PNG, JPG or PDF \(max\. 10MB\)/g, 'All formats supported (CAD, 3D, PDF, Images)');
content = content.replace(/SVG, PNG, JPG or PDF/g, 'All formats supported (CAD, 3D, PDF, Images)');

fs.writeFileSync('src/pages/sales/SalesPipelinePage.tsx', content);
