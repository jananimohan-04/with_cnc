const fs = require('fs');
const sql = fs.readFileSync('ALL_370_ARGUS_LEADS.sql', 'utf8');

let openParen = 0;
let inString = false;
let line = 1;
let stringStartLine = 1;

for (let i = 0; i < sql.length; i++) {
  const c = sql[i];
  if (c === '\n') line++;
  
  if (c === "'") {
    if (inString && sql[i + 1] === "'") {
      i++; // escaped quote ''
      continue;
    }
    inString = !inString;
    if (inString) stringStartLine = line;
    continue;
  }
  
  if (!inString) {
    if (c === '(') openParen++;
    if (c === ')') openParen--;
  }
}

console.log('Final openParen:', openParen);
console.log('Final inString:', inString);
if (inString) console.log('Unclosed string opened around line:', stringStartLine);
