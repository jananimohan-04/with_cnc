import fs from 'fs';
const code = fs.readFileSync('src/pages/sales/SalesPipelinePage.tsx', 'utf8');
const open = (code.match(/<div/g) || []).length;
const close = (code.match(/<\/div>/g) || []).length;
console.log('open:', open, 'close:', close, 'diff:', open - close);
