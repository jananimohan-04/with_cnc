import fs from 'fs';
import path from 'path';
const fp = path.resolve('src/pages/sales/SalesPipelinePage.tsx');
let code = fs.readFileSync(fp, 'utf8');

code = code.replace(
  /\s*\}\)\;\n\}/,
  "\n    </div>\n  );\n}"
);

fs.writeFileSync(fp, code, 'utf8');
console.log("Forced extra div at EOF");
