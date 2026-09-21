const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// The string was:
//     ProductionTrackingPage,
//     FinishedGoodsPage
//   } from './pages/production/ProductionPages';

// Let's just use regex to replace it
content = content.replace(/ProductionTrackingPage,\s*FinishedGoodsPage\s*\} from '\.\/pages\/production\/ProductionPages';/, "ProductionTrackingPage\n} from './pages/production/ProductionPages';\nimport { FinishedGoodsPage } from './pages/production/unified/FinishedGoodsPage';");

fs.writeFileSync('src/App.tsx', content);
