import fs from 'fs';
import path from 'path';

// 1. Sidebar.tsx
const sidebarPath = path.resolve('src/components/layout/Sidebar.tsx');
let sidebarCode = fs.readFileSync(sidebarPath, 'utf8');
// Increase logo size from h-8 to h-12, add a subtle border radius to soften the white box
sidebarCode = sidebarCode.replace(
  /className="w-auto h-8 object-contain"/g,
  'className="w-auto h-12 object-contain rounded-sm"'
);
fs.writeFileSync(sidebarPath, sidebarCode, 'utf8');

// 2. LoginScreen.tsx
const loginPath = path.resolve('src/components/LoginScreen.tsx');
let loginCode = fs.readFileSync(loginPath, 'utf8');
// Increase logo size from h-10/h-12 to h-16/h-20
loginCode = loginCode.replace(
  /className="h-10 object-contain drop-shadow-xl"/g,
  'className="h-16 w-auto object-contain drop-shadow-xl rounded"'
);
loginCode = loginCode.replace(
  /className="h-12 object-contain"/g, // mobile logo
  'className="h-16 w-auto object-contain rounded"'
);
fs.writeFileSync(loginPath, loginCode, 'utf8');

console.log("Updated logo sizes in Sidebar and LoginScreen");
