const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
`    ProductionTrackingPage,
    FinishedGoodsPage
  } from './pages/production/ProductionPages';`,
`    ProductionTrackingPage
  } from './pages/production/ProductionPages';
  import { FinishedGoodsPage } from './pages/production/unified/FinishedGoodsPage';`
);

fs.writeFileSync('src/App.tsx', content);
