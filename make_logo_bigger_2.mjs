import fs from 'fs';
import path from 'path';

// 1. Sidebar.tsx
const sidebarPath = path.resolve('src/components/layout/Sidebar.tsx');
let sidebarCode = fs.readFileSync(sidebarPath, 'utf8');

// Increase the height of the sidebar header from h-16 to h-24
sidebarCode = sidebarCode.replace(
  /className="flex items-center gap-3 px-4 h-16 border-b border-navy-800 flex-shrink-0 bg-navy-950 shadow-sm relative z-10"/g,
  'className="flex items-center gap-3 px-4 h-24 border-b border-navy-800 flex-shrink-0 bg-navy-950 shadow-sm relative z-10"'
);

// Increase the logo from h-12 to h-16
sidebarCode = sidebarCode.replace(
  /className="w-auto h-12 object-contain rounded-sm"/g,
  'className="w-full h-16 object-contain rounded-sm"'
);

fs.writeFileSync(sidebarPath, sidebarCode, 'utf8');

// 2. LoginScreen.tsx
const loginPath = path.resolve('src/components/LoginScreen.tsx');
let loginCode = fs.readFileSync(loginPath, 'utf8');

// Increase logo size from h-16 to h-32 (128px tall)
loginCode = loginCode.replace(
  /className="h-16 w-auto object-contain drop-shadow-xl rounded"/g,
  'className="h-28 w-auto object-contain drop-shadow-xl rounded-md"'
);
loginCode = loginCode.replace(
  /className="h-16 w-auto object-contain rounded"/g,
  'className="h-24 w-auto object-contain rounded-md"'
);

fs.writeFileSync(loginPath, loginCode, 'utf8');

console.log("Made logos significantly bigger");
