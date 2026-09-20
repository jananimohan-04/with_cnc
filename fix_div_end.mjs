import fs from 'fs';
import path from 'path';

const fp = path.resolve('src/pages/sales/SalesPipelinePage.tsx');
let code = fs.readFileSync(fp, 'utf8');

code = code.replace(
  "      </Modal>\n\n    </div>\n  );\n}",
  "      </Modal>\n\n    </div>\n    </div>\n  );\n}"
);

fs.writeFileSync(fp, code, 'utf8');
console.log("Fixed at the end");
