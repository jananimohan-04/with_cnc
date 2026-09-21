const fs = require('fs');

let content = fs.readFileSync('src/pages/production/unified/FinishedGoodsPage.tsx', 'utf8');

// Add getMockImage import
if (!content.includes('getMockImage')) {
  content = content.replace(
    `import { Modal, FormField, inputClass } from '@/components/ui/Modal';`,
    `import { Modal, FormField, inputClass } from '@/components/ui/Modal';\nimport { getMockImage } from '@/lib/mockStorage';`
  );
}

// Modify fetchData to attach mock image URL
const oldFetchData = `      // Map and enrich with stock
      const enriched = woData.map((wo: any) => {`;

const newFetchData = `      // Map and enrich with stock
      const enriched = await Promise.all(woData.map(async (wo: any) => {
        const mockImg = await getMockImage(wo.part_name);`;

content = content.replace(oldFetchData, newFetchData);

// Fix the return of enriched
const oldReturn = `        return {
          ...wo,
          orderedQty,
          completedQty,
          pendingQty,
          fgStock
        };
      });`;

const newReturn = `        return {
          ...wo,
          orderedQty,
          completedQty,
          pendingQty,
          fgStock,
          imgUrl: wo.image_url || wo.drawing_url || mockImg
        };
      }));`;

content = content.replace(oldReturn, newReturn);

// Update table render for Part No
const oldPartRender = `    { 
      key: 'part_no', 
      label: 'Part No', 
      render: (r) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
            <Package size={16} className="text-slate-400" />
          </div>
          <span className="font-semibold text-slate-700 whitespace-nowrap">{r.part_no || 'N/A'}</span>
        </div>
      )
    },`;

const newPartRender = `    { 
      key: 'part_no', 
      label: 'Part No', 
      render: (r) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0 border border-slate-200">
            {r.imgUrl ? (
              <img src={r.imgUrl} alt="Part" className="w-full h-full object-cover" />
            ) : (
              <Package size={16} className="text-slate-400" />
            )}
          </div>
          <span className="font-semibold text-slate-700 whitespace-nowrap">{r.part_no || 'N/A'}</span>
        </div>
      )
    },`;

content = content.replace(oldPartRender, newPartRender);

fs.writeFileSync('src/pages/production/unified/FinishedGoodsPage.tsx', content);
