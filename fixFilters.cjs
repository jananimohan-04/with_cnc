const fs = require('fs');

let content = fs.readFileSync('src/pages/production/unified/FinishedGoodsPage.tsx', 'utf8');

// Add states for full filter lists
const stateAdd = `
  const [filterOptions, setFilterOptions] = useState({
    projects: [] as string[],
    customers: [] as string[]
  });
`;

content = content.replace(
  `  const [statusFilter, setStatusFilter] = useState('All');`,
  `  const [statusFilter, setStatusFilter] = useState('All');\n${stateAdd}`
);

// Populate filter options in fetchData
const populateFilters = `      const activeItems = new Set(finalRecords.map((e: any) => e.part_no)).size;
      
      setFilterOptions({
        projects: Array.from(new Set(enriched.map((r: any) => r.sales_order).filter(Boolean))) as string[],
        customers: Array.from(new Set(enriched.map((r: any) => r.customer).filter(Boolean))) as string[]
      });`;

content = content.replace(
  `      const activeItems = new Set(finalRecords.map((e: any) => e.part_no)).size;`,
  populateFilters
);

// Update dropdown rendering
const oldProjectDropdown = `{Array.from(new Set(records.map(r => r.sales_order).filter(Boolean))).map(p => (`;
const newProjectDropdown = `{filterOptions.projects.map(p => (`;
content = content.replace(oldProjectDropdown, newProjectDropdown);

const oldCustomerDropdown = `{Array.from(new Set(records.map(r => r.customer).filter(Boolean))).map(c => (`;
const newCustomerDropdown = `{filterOptions.customers.map(c => (`;
content = content.replace(oldCustomerDropdown, newCustomerDropdown);

fs.writeFileSync('src/pages/production/unified/FinishedGoodsPage.tsx', content);
