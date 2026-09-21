const fs = require('fs');

let content = fs.readFileSync('src/pages/production/unified/SchedulingPage.tsx', 'utf8');

content = content.replace(
  `import { Badge } from '@/components/ui/Badge';\nimport { Card } from '@/components/ui/Card';`,
  `import { Card, Badge } from '@/components/ui/Card';`
);

content = content.replace(
  `import { Button } from '@/components/ui/Button';`,
  `import { Button } from '@/components/ui/Card';`
);

fs.writeFileSync('src/pages/production/unified/SchedulingPage.tsx', content);
