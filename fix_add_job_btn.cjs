const fs = require('fs');

let content = fs.readFileSync('src/pages/production/unified/SchedulingPage.tsx', 'utf8');

// Replace using more flexible regex
content = content.replace(
  /<Button[^>]*>[\s\n]*<Plus[^>]*>\s*Add Job<\/Button>/i,
  `<Button variant="primary" className="bg-brand-500 hover:bg-brand-600 text-white border-0 shadow-sm" onClick={() => setShowAddJob(true)}><Plus size={18} /> Add Job</Button>`
);

fs.writeFileSync('src/pages/production/unified/SchedulingPage.tsx', content);
