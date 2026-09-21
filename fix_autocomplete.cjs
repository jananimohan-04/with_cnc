const fs = require('fs');

let content = fs.readFileSync('src/pages/sales/SalesPipelinePage.tsx', 'utf8');

const oldCardsLogic = `                // Use cards which contains all pipeline leads!
                cards.forEach(card => {
                  const k = card.customer?.toLowerCase();
                  if (k && !compMap.has(k)) {
                    compMap.set(k, true);
                    // parse contacts from card.raw
                    const p = (card.raw.contact_person || '').split(' | ')[0] || '';
                    const ph = (card.raw.phone || '').split(' | ')[0] || '';
                    const em = (card.raw.email || '').split(' | ')[0] || '';
                    combined.push({ id: card.id, name: card.customer, contact: p, phone: ph, email: em, city: card.raw.city || '' });
                  }
                });`;

const newKnownCompaniesLogic = `                // Use knownCompanies which contains all pipeline leads (including lost/completed)
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

content = content.replace(oldCardsLogic, newKnownCompaniesLogic);

fs.writeFileSync('src/pages/sales/SalesPipelinePage.tsx', content);
