const fs = require('fs');

let content = fs.readFileSync('src/pages/production/unified/FinishedGoodsPage.tsx', 'utf8');

// Replace the setRecords logic
const oldSetRecords = `      setRecords(enriched);

      const activeItems = new Set(enriched.map(e => e.part_no)).size;`;

const newSetRecords = `      // Only show records in the table that actually have finished goods or are fully completed
      const finalRecords = enriched.filter((w: any) => w.completedQty > 0 || w.status === 'Completed' || w.status === 'Ready' || w.status === 'Quality Hold');
      setRecords(finalRecords);

      const activeItems = new Set(finalRecords.map((e: any) => e.part_no)).size;`;

content = content.replace(oldSetRecords, newSetRecords);

// Also need to fix stats to calculate based on finalRecords
const oldStats = `      const totalComp = enriched.reduce((sum, e) => sum + e.completedQty, 0);
      const totalPend = enriched.reduce((sum, e) => sum + e.pendingQty, 0);`;

const newStats = `      const totalComp = finalRecords.reduce((sum: any, e: any) => sum + e.completedQty, 0);
      const totalPend = finalRecords.reduce((sum: any, e: any) => sum + e.pendingQty, 0);`;

content = content.replace(oldStats, newStats);

fs.writeFileSync('src/pages/production/unified/FinishedGoodsPage.tsx', content);
