const fs = require('fs');
const path = require('path');

// ---- Reuse the same data parsing from generate_clean_sql.cjs ----
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

  const timestamp = (parts[0] || '').trim();
  const code = (parts[2] || '').trim();
  let name = (parts[3] || '').replace(/[\r\n\t]/g, ' ').trim();
  let address = (parts[4] || '').replace(/[\r\n\t]/g, ' ').trim();
  let gst = (parts[5] || '').replace(/[\r\n\t]/g, ' ').trim();
  const c1 = (parts[6] || '').trim();
  const c2 = (parts[7] || '').trim();
  let email = (parts[8] || '').replace(/[\r\n\t]/g, ' ').trim();
  let contactPerson = (parts[9] || '').replace(/[\r\n\t]/g, ' ').trim();
  let allocation = (parts[10] || 'Job Work').replace(/[\r\n\t]/g, ' ').trim() || 'Job Work';

  if (contactPerson.includes('@') && !email) { email = contactPerson; contactPerson = ''; }
  const phone = [c1, c2].filter(Boolean).join(' / ');

  let receivedDate = '2026-09-29';
  if (timestamp) {
    const m = timestamp.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) receivedDate = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }

  dataRows.push({ code, name, address, gst, phone, email, contactPerson, allocation, receivedDate });
}

// ---- Build customers & enquiries with "T-" prefix for testing company ----
const PREFIX = 'T';  // T = Testing company
const customersMap = new Map();
const usedCustIds = new Set();
const enquiries = [];
let leadSeq = 5001;  // Start at 5001 to avoid any overlap with Argus Technology (2001-2370)

for (const r of dataRows) {
  let custId = r.code ? `CUST-${PREFIX}-${r.code}` : `CUST-${PREFIX}-L${leadSeq}`;
  if (usedCustIds.has(custId)) custId = `${custId}-B`;
  usedCustIds.add(custId);
  const leadNo = leadSeq.toString();
  leadSeq++;

  if (!customersMap.has(r.name)) {
    customersMap.set(r.name, {
      id: custId, name: r.name,
      contact: r.contactPerson || 'Purchase Dept',
      phone: r.phone, email: r.email,
      city: r.address || 'Coimbatore',
      gst: r.gst, status: 'Active'
    });
  } else {
    const ex = customersMap.get(r.name);
    if (!ex.gst && r.gst) ex.gst = r.gst;
    if (!ex.email && r.email) ex.email = r.email;
    if (!ex.phone && r.phone) ex.phone = r.phone;
    if (!ex.city && r.address) ex.city = r.address;
    if (!ex.contact && r.contactPerson) ex.contact = r.contactPerson;
  }

  enquiries.push({
    id: `enq-t-${leadNo}`,
    lead_no: leadNo, enquiry_no: leadNo,
    customer: r.name,
    contact_person: r.contactPerson || 'Purchase Dept',
    phone: r.phone, email: r.email,
    city: r.address, gst: r.gst,
    remarks: r.allocation,
    part_name: `${r.allocation} Machining & Supply`,
    part_no: `PART-${leadNo}`,
    quantity: r.allocation.toLowerCase().includes('job') ? 100 : 50,
    expected_date: '2026-10-30',
    received_date: r.receivedDate
  });
}

console.log(`Unique Customers: ${customersMap.size}, Enquiries: ${enquiries.length}`);

const esc = (s) => (s || '').replace(/'/g, "''");

const sql = [];
sql.push(`-- =====================================================================================`);
sql.push(`-- INSERT 370 LEADS & CUSTOMERS FOR "Argus technologies testing"`);
sql.push(`-- Uses T- prefix on customer IDs and 5001+ lead numbers to avoid any overlap`);
sql.push(`-- =====================================================================================\n`);

sql.push(`ALTER TABLE public.cnc_customers ADD COLUMN IF NOT EXISTS gst text;`);
sql.push(`ALTER TABLE public.cnc_enquiries ADD COLUMN IF NOT EXISTS gst text;`);
sql.push(`ALTER TABLE public.cnc_enquiries ADD COLUMN IF NOT EXISTS remarks text;`);
sql.push(`ALTER TABLE public.cnc_enquiries ALTER COLUMN part_no DROP NOT NULL;\n`);

sql.push(`DO $$`);
sql.push(`DECLARE`);
sql.push(`  v_company_id uuid;`);
sql.push(`BEGIN`);
sql.push(`  -- Find "Argus technologies testing" company`);
sql.push(`  SELECT id INTO v_company_id`);
sql.push(`  FROM public.companies`);
sql.push(`  WHERE lower(company_name) = 'argus technologies testing'`);
sql.push(`  LIMIT 1;\n`);
sql.push(`  IF v_company_id IS NULL THEN`);
sql.push(`    RAISE EXCEPTION 'Company "Argus technologies testing" not found!';`);
sql.push(`  END IF;\n`);
sql.push(`  RAISE NOTICE 'Target Company ID: %', v_company_id;\n`);

// Customers
sql.push(`  INSERT INTO public.cnc_customers (id, name, contact, phone, email, city, gst, status, company_id)`);
sql.push(`  VALUES`);
const custVals = Array.from(customersMap.values()).map(c =>
  `    ('${esc(c.id)}', '${esc(c.name)}', '${esc(c.contact)}', '${esc(c.phone)}', '${esc(c.email)}', '${esc(c.city)}', '${esc(c.gst)}', 'Active', v_company_id)`
);
sql.push(custVals.join(',\n'));
sql.push(`  ON CONFLICT (id) DO UPDATE SET`);
sql.push(`    name = EXCLUDED.name, contact = EXCLUDED.contact, phone = EXCLUDED.phone,`);
sql.push(`    email = EXCLUDED.email, city = EXCLUDED.city, gst = EXCLUDED.gst,`);
sql.push(`    company_id = EXCLUDED.company_id;\n`);

// Enquiries
sql.push(`  INSERT INTO public.cnc_enquiries (id, lead_no, enquiry_no, customer, contact_person, phone, email, city, gst, remarks, part_name, part_no, quantity, status, pipeline_stage, expected_date, received_date, company_id)`);
sql.push(`  VALUES`);
const enqVals = enquiries.map(e =>
  `    ('${esc(e.id)}', '${esc(e.lead_no)}', '${esc(e.enquiry_no)}', '${esc(e.customer)}', '${esc(e.contact_person)}', '${esc(e.phone)}', '${esc(e.email)}', '${esc(e.city)}', '${esc(e.gst)}', '${esc(e.remarks)}', '${esc(e.part_name)}', '${esc(e.part_no)}', ${e.quantity}, 'New', 'enquiry', '${e.expected_date}', '${e.received_date}', v_company_id)`
);
sql.push(enqVals.join(',\n'));
sql.push(`  ON CONFLICT (id) DO UPDATE SET`);
sql.push(`    customer = EXCLUDED.customer, contact_person = EXCLUDED.contact_person,`);
sql.push(`    phone = EXCLUDED.phone, email = EXCLUDED.email, city = EXCLUDED.city,`);
sql.push(`    gst = EXCLUDED.gst, remarks = EXCLUDED.remarks, part_name = EXCLUDED.part_name,`);
sql.push(`    part_no = EXCLUDED.part_no, quantity = EXCLUDED.quantity, company_id = EXCLUDED.company_id;\n`);

sql.push(`END $$;`);

const outPath = 'C:\\Users\\Janan\\Desktop\\ALL_370_ARGUS_TESTING.sql';
fs.writeFileSync(outPath, sql.join('\n'), 'utf8');
console.log('Saved to:', outPath);

// Verify no duplicate IDs
const finalSql = sql.join('\n');
const ids = [...finalSql.matchAll(/\('(CUST-T-[^']+)'/g)].map(m => m[1]);
const seen = new Set();
const dupes = ids.filter(id => { if (seen.has(id)) return true; seen.add(id); return false; });
console.log('Customer IDs:', ids.length, '| Unique:', seen.size, '| Duplicates:', dupes.length > 0 ? dupes : 'NONE');
