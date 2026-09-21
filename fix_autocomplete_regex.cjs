const fs = require('fs');

let content = fs.readFileSync('src/pages/sales/SalesPipelinePage.tsx', 'utf8');

const regex = /\/\/ Use cards which contains all pipeline leads![\s\S]*?\}\);/g;

const newKnownCompaniesLogic = `// Use knownCompanies which contains all pipeline leads (including lost/completed)
                knownCompanies.forEach(c => {
                  const k = c.company?.toLowerCase();
                  if (k && !compMap.has(k)) {
                    compMap.set(k, true);
                    const p = (c.contact_person || '').split(' | ')[0] || '';
                    const ph = (c.phone || '').split(' | ')[0] || '';
                    const em = (c.email || '').split(' | ')[0] || '';
                    combined.push({ id: k, name: c.company, contact: p, phone: ph, email: em, city: '' });
                  }
                });`;

content = content.replace(regex, newKnownCompaniesLogic);

fs.writeFileSync('src/pages/sales/SalesPipelinePage.tsx', content);
