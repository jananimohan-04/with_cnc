const fs = require('fs');
['ARGUS_COMPANIES_ONLY_370.sql', 'ARGUS_TESTING_COMPANIES_ONLY_370.sql', 'ALL_370_ARGUS_LEADS.sql'].forEach(f => {
  const sql = fs.readFileSync('C:/Users/Janan/Desktop/' + f, 'utf8');
  let openParen = 0, inString = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'" && sql[i + 1] === "'") { i++; continue; }
    if (c === "'") { inString = !inString; continue; }
    if (!inString) {
      if (c === '(') openParen++;
      if (c === ')') openParen--;
    }
  }
  console.log(f, '=> openParen:', openParen, 'inString:', inString);
});
