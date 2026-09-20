import fs from 'fs';
import path from 'path';

const fp = path.resolve('src/pages/sales/SalesPipelinePage.tsx');
let code = fs.readFileSync(fp, 'utf8');

code = code.replace(
  "          ))}\n        </div>\n  \n        {/* New Lead Modal */}",
  "          ))}\n        </div>\n        </div>\n  \n        {/* New Lead Modal */}"
);

// Fallback if spaces differ
code = code.replace(
  /          \}\)\}\n        <\/div>\n\s*\{\/\* New Lead Modal \*\/\}/,
  "          ))}\n        </div>\n        </div>\n  \n        {/* New Lead Modal */}"
);

fs.writeFileSync(fp, code, 'utf8');
console.log("Fixed div again");
