import fs from 'fs';
import path from 'path';

const fp = path.resolve('src/components/LoginScreen.tsx');
let code = fs.readFileSync(fp, 'utf8');

const replacementDark = `<img src="/arguscnc-logo.jpg" alt="ARGUSCNC Logo" className="h-10 object-contain drop-shadow-xl" />`;
const replacementLight = `<img src="/arguscnc-logo.jpg" alt="ARGUSCNC Logo" className="h-12 object-contain" />`;

code = code.replace(
  /<div className="flex items-center gap-3">\s*<div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center shadow-lg shadow-brand-500\/40">\s*<Cpu size=\{24\} \/>\s*<\/div>\s*<div>\s*<h1 className="text-lg font-bold tracking-tight">ARGUSCNC<\/h1>\s*<p className="text-\[11px\] text-navy-300 font-medium tracking-widest">ERP SUITE<\/p>\s*<\/div>\s*<\/div>/m,
  replacementDark
);

code = code.replace(
  /<div className="lg:hidden flex items-center justify-center gap-3 mb-8">\s*<div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center shadow-lg">\s*<Cpu size=\{24\} className="text-white" \/>\s*<\/div>\s*<div>\s*<h1 className="text-lg font-bold text-slate-800 tracking-tight">ARGUSCNC<\/h1>\s*<p className="text-\[11px\] text-slate-400 font-medium tracking-widest">ERP SUITE<\/p>\s*<\/div>\s*<\/div>/m,
  `<div className="lg:hidden flex items-center justify-center mb-8">\n              ${replacementLight}\n            </div>`
);

fs.writeFileSync(fp, code, 'utf8');
console.log("Updated LoginScreen.tsx correctly");
