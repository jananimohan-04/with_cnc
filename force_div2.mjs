import fs from 'fs';
const file = 'src/pages/sales/SalesPipelinePage.tsx';
let code = fs.readFileSync(file, 'utf8');

const lastParenIndex = code.lastIndexOf(');');
code = code.substring(0, lastParenIndex) + '</div>\n  ' + code.substring(lastParenIndex);

fs.writeFileSync(file, code, 'utf8');
console.log('Appended div directly');
