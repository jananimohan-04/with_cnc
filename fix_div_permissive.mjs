import fs from 'fs';
import path from 'path';
const fp = path.resolve('src/pages/sales/SalesPipelinePage.tsx');
let code = fs.readFileSync(fp, 'utf8');

code = code.replace(
  /\s*\}\)\}\s*<\/div>\s*\{\/\* New Lead Modal \*\/\}/,
  "\n          ))}\n        </div>\n        </div>\n\n      {/* New Lead Modal */}"
);

fs.writeFileSync(fp, code, 'utf8');
console.log("Fixed permissive");
