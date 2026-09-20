import fs from 'fs';
import path from 'path';

const fp = path.resolve('src/pages/sales/SalesPipelinePage.tsx');
let code = fs.readFileSync(fp, 'utf8');

const handleDropLines = code.split('\n').filter((l, i) => i > 400 && i < 700);
console.log(handleDropLines.join('\n'));
