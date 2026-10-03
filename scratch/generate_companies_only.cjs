const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, 'master_leads_data.txt'), 'utf8');
const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);

const dataRows = [];
for (let i = 1; i < lines.length; i++) {
  let parts = lines[i].split('\t');
  if (parts.length === 9 && parts[2] === 'S-130') {
    parts = [parts[0], parts[1], parts[2], parts[3], parts[4], parts[5], '', '', parts[6], parts[7], parts[8]];
  } else if (parts.length === 12 && parts[2] === 'C-970') {
    parts = [parts[0], parts[1], parts[2], parts[3], parts[4], parts[5], parts[6], parts[7], parts[9], parts[10] || '', parts[11]];
  }

  const code = (parts[2] || '').trim();
  let name = (parts[3] || '').replace(/[\r\n\t]/g, ' ').trim();
  let address = (parts[4] || '').replace(/[\r\n\t]/g, ' ').trim();
  let gst = (parts[5] || '').replace(/[\r\n\t]/g, ' ').trim();
  const c1 = (parts[6] || '').trim();
  const c2 = (parts[7] || '').trim();
  let email = (parts[8] || '').replace(/[\r\n\t]/g, ' ').trim();
  let contactPerson = (parts[9] || '').replace(/[\r\n\t]/g, ' ').trim();

  if (contactPerson.includes('@') && !email) { email = contactPerson; contactPerson = ''; }
  const phone = [c1, c2].filter(Boolean).join(' / ');

  dataRows.push({ code, name, address, gst, phone, email, contactPerson });
}

// Build unique customers - keyed by name
const customersMap = new Map();
const usedCustIds = new Set();

for (const r of dataRows) {
  let custId = r.code ? `CUST-${r.code}` : `CUST-L${Math.floor(1000 + Math.random() * 9000)}`;
  if (usedCustIds.has(custId)) custId = `${custId}-B`;
  usedCustIds.add(custId);

  if (!customersMap.has(r.name)) {
    customersMap.set(r.name, {
      id: custId,
      name: r.name,
      contact: r.contactPerson || 'Purchase Dept',
      phone: r.phone,
      email: r.email,
      city: r.address || 'Coimbatore',
      gst: r.gst,
      source: 'Direct',
      status: 'Active'
    });
  } else {
    const ex = customersMap.get(r.name);
    if (!ex.gst && r.gst) ex.gst = r.gst;
    if (!ex.email && r.email) ex.email = r.email;
    if (!ex.phone && r.phone) ex.phone = r.phone;
    if ((!ex.city || ex.city === 'Coimbatore') && r.address) ex.city = r.address;
    if ((!ex.contact || ex.contact === 'Purchase Dept') && r.contactPerson) ex.contact = r.contactPerson;
  }
}

console.log(`Unique Companies: ${customersMap.size}`);

const esc = (s) => (s || '').replace(/'/g, "''");

function generateSQL(companyWhereClause, commentHeader) {
  const sql = [];
  sql.push(`-- =====================================================================================`);
  sql.push(`-- ${commentHeader}`);
  sql.push(`-- CUSTOMER / COMPANY MASTER ONLY — NO ENQUIRIES ARE CREATED`);
  sql.push(`-- Maps to the "Add New Company" modal fields:`);
  sql.push(`--   - Company Name     -> name`);
  sql.push(`--   - Address          -> city`);
  sql.push(`--   - GST No.          -> gst`);
  sql.push(`--   - Contact Persons  -> contact (name), phone, email`);
  sql.push(`--   - Source           -> source ('Direct')`);
  sql.push(`--   - Status           -> status ('Active')`);
  sql.push(`-- =====================================================================================\n`);

  sql.push(`-- Step 1: Ensure required columns exist`);
  sql.push(`ALTER TABLE public.cnc_customers ADD COLUMN IF NOT EXISTS gst text;`);
  sql.push(`ALTER TABLE public.cnc_customers ADD COLUMN IF NOT EXISTS source text;\n`);

  sql.push(`DO $$`);
  sql.push(`DECLARE`);
  sql.push(`  v_company_id uuid;`);
  sql.push(`BEGIN`);
  sql.push(`  -- Step 2: Resolve Target Company ID`);
  sql.push(`  SELECT id INTO v_company_id`);
  sql.push(`  FROM public.companies`);
  sql.push(`  WHERE ${companyWhereClause}`);
  sql.push(`  LIMIT 1;\n`);
  sql.push(`  IF v_company_id IS NULL THEN`);
  sql.push(`    RAISE EXCEPTION 'Target company not found in public.companies table!';`);
  sql.push(`  END IF;\n`);
  sql.push(`  RAISE NOTICE 'Target Company ID resolved: %', v_company_id;\n`);

  sql.push(`  -- Step 3: Insert or update all ${customersMap.size} companies into cnc_customers`);
  sql.push(`  INSERT INTO public.cnc_customers (id, name, contact, phone, email, city, gst, source, status, company_id)`);
  sql.push(`  VALUES`);

  const custVals = Array.from(customersMap.values()).map(c =>
    `    ('${esc(c.id)}', '${esc(c.name)}', '${esc(c.contact)}', '${esc(c.phone)}', '${esc(c.email)}', '${esc(c.city)}', '${esc(c.gst)}', '${esc(c.source)}', 'Active', v_company_id)`
  );
  sql.push(custVals.join(',\n'));
  sql.push(`  ON CONFLICT (id) DO UPDATE SET`);
  sql.push(`    name = EXCLUDED.name,`);
  sql.push(`    contact = EXCLUDED.contact,`);
  sql.push(`    phone = EXCLUDED.phone,`);
  sql.push(`    email = EXCLUDED.email,`);
  sql.push(`    city = EXCLUDED.city,`);
  sql.push(`    gst = EXCLUDED.gst,`);
  sql.push(`    source = EXCLUDED.source,`);
  sql.push(`    company_id = EXCLUDED.company_id;\n`);

  sql.push(`END $$;`);
  return sql.join('\n');
}

// 1. For "Argus Technologies" / "Argus Technology" (Main company)
const mainSql = generateSQL(
  `(lower(company_name) LIKE '%argus%' AND lower(company_name) NOT LIKE '%testing%') OR lower(code) = 'argus'`,
  `INSERT 370 COMPANIES INTO cnc_customers FOR "Argus Technologies"`
);
const mainPath = 'C:\\Users\\Janan\\Desktop\\ARGUS_COMPANIES_ONLY_370.sql';
fs.writeFileSync(mainPath, mainSql, 'utf8');
console.log('Saved Main SQL to:', mainPath);

// 2. For "Argus technologies testing"
const testingSql = generateSQL(
  `lower(company_name) = 'argus technologies testing' OR lower(company_name) LIKE '%testing%'`,
  `INSERT 370 COMPANIES INTO cnc_customers FOR "Argus technologies testing"`
);
const testingPath = 'C:\\Users\\Janan\\Desktop\\ARGUS_TESTING_COMPANIES_ONLY_370.sql';
fs.writeFileSync(testingPath, testingSql, 'utf8');
console.log('Saved Testing SQL to:', testingPath);
