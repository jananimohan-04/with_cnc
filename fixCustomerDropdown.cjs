const fs = require('fs');

let content = fs.readFileSync('src/pages/production/unified/FinishedGoodsPage.tsx', 'utf8');

const populateFiltersOld = `      setFilterOptions({
        projects: Array.from(new Set(enriched.map((r: any) => r.sales_order).filter(Boolean))) as string[],
        customers: Array.from(new Set(enriched.map((r: any) => r.customer).filter(Boolean))) as string[]
      });`;

const populateFiltersNew = `      // Fetch all global customers so the dropdown isn't just limited to current work orders
      const { data: globalCustomers } = await supabase.from('cnc_customers').select('name');
      const { data: globalLeads } = await supabase.from('cnc_enquiries').select('company');
      
      const allCustomers = new Set([
        ...enriched.map((r: any) => r.customer),
        ...(globalCustomers || []).map((c: any) => c.name),
        ...(globalLeads || []).map((l: any) => l.company)
      ].filter(Boolean));

      setFilterOptions({
        projects: Array.from(new Set(enriched.map((r: any) => r.sales_order).filter(Boolean))).sort() as string[],
        customers: Array.from(allCustomers).sort() as string[]
      });`;

content = content.replace(populateFiltersOld, populateFiltersNew);

fs.writeFileSync('src/pages/production/unified/FinishedGoodsPage.tsx', content);
