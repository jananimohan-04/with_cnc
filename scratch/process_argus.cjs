const fs = require('fs');
const path = require('path');

// Simple CSV parser that handles quotes
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  const rows = [];
  
  for (const line of lines) {
    const row = [];
    let inQuotes = false;
    let currentField = '';
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          currentField += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(currentField.trim());
        currentField = '';
      } else {
        currentField += char;
      }
    }
    row.push(currentField.trim());
    rows.push(row);
  }
  return rows;
}

const csvContent = fs.readFileSync(path.join(__dirname, 'argus_leads_raw.csv'), 'utf8');
const rows = parseCSV(csvContent);

if (rows.length === 0) {
  console.error("Empty CSV file!");
  process.exit(1);
}

const header = rows[0];
console.log("Parsed header:", header.slice(0, 11));

const dataRows = rows.slice(1);
const customers = new Map();
const enquiries = [];

let leadSeq = 2001;

for (const r of dataRows) {
  // TIMESTAMP, TYPE, CODE, COMPANY NAME, ADDRESS, GST, CONTACT1, CONTACT2, EMAIL ID, CONTACT NAME, ALLOCATION
  const timestamp = r[0] || '';
  const type = r[1] || '';
  const code = r[2] || '';
  let companyName = r[3] || '';
  let address = r[4] || '';
  let gst = r[5] || '';
  const contact1 = r[6] || '';
  const contact2 = r[7] || '';
  let email = r[8] || '';
  let contactPerson = r[9] || '';
  let allocation = r[10] || 'Job Work';

  companyName = companyName.replace(/[\r\n\t]/g, ' ').trim();
  address = address.replace(/[\r\n\t]/g, ' ').trim();
  gst = gst.replace(/[\r\n\t]/g, ' ').trim();
  email = email.replace(/[\r\n\t]/g, ' ').trim();
  contactPerson = contactPerson.replace(/[\r\n\t]/g, ' ').trim();
  allocation = allocation.replace(/[\r\n\t]/g, ' ').trim() || 'Job Work';

  if (!companyName && !address && !gst && !email && !contact1) {
    continue;
  }

  if (!companyName) {
    companyName = code ? `Customer ${code}` : `Lead #${leadSeq}`;
  }

  // Combine contacts
  const phones = [contact1, contact2].map(p => p.trim()).filter(Boolean);
  const phone = phones.join(' / ');

  const custId = code ? `CUST-${code}` : `CUST-L${leadSeq}`;
  const leadNo = leadSeq.toString();
  leadSeq++;

  if (!customers.has(companyName)) {
    customers.set(companyName, {
      id: custId,
      name: companyName,
      contact: contactPerson || 'Purchase Dept',
      phone: phone,
      email: email,
      city: address || 'Coimbatore',
      gst: gst,
      status: 'Active'
    });
  } else {
    // Fill any missing details
    const existing = customers.get(companyName);
    if (!existing.gst && gst) existing.gst = gst;
    if (!existing.email && email) existing.email = email;
    if (!existing.phone && phone) existing.phone = phone;
    if (!existing.city && address) existing.city = address;
    if (!existing.contact && contactPerson) existing.contact = contactPerson;
  }

  enquiries.push({
    id: `enq-${leadNo}-${Math.random().toString(36).substring(2, 8)}`,
    lead_no: leadNo,
    enquiry_no: leadNo,
    customer: companyName,
    contact_person: contactPerson || 'Purchase Dept',
    phone: phone,
    email: email,
    city: address,
    gst: gst,
    remarks: allocation, // ALLOCATION stored in remarks
    part_name: `${allocation} Machining & Supply`,
    part_no: `PART-${leadNo}`,
    quantity: allocation.toLowerCase().includes('job') ? 100 : 50,
    status: 'New',
    pipeline_stage: 'enquiry',
    expected_date: '2026-10-30',
    received_date: '2026-09-29'
  });
}

console.log(`Processed ${enquiries.length} enquiries.`);
console.log(`Processed ${customers.size} unique customers.`);

// Generate SQL
const sql = [];
sql.push(`-- =====================================================================================`);
sql.push(`-- INSERT LEADS & CUSTOMERS FOR "ARGUS TECHNOLOGIES"`);
sql.push(`-- Allocation is stored directly in the \`remarks\` column of cnc_enquiries`);
sql.push(`-- Automatically finds Argus Technologies company_id`);
sql.push(`-- =====================================================================================\n`);

sql.push(`-- 1. Ensure required columns exist and relax part_no constraint`);
sql.push(`ALTER TABLE public.cnc_customers ADD COLUMN IF NOT EXISTS gst text;`);
sql.push(`ALTER TABLE public.cnc_enquiries ADD COLUMN IF NOT EXISTS gst text;`);
sql.push(`ALTER TABLE public.cnc_enquiries ADD COLUMN IF NOT EXISTS remarks text;`);
sql.push(`ALTER TABLE public.cnc_enquiries ALTER COLUMN part_no DROP NOT NULL;\n`);

sql.push(`DO $$`);
sql.push(`DECLARE`);
sql.push(`  v_company_id uuid;`);
sql.push(`BEGIN`);
sql.push(`  -- 2. Find the company_id for Argus Technologies`);
sql.push(`  SELECT id INTO v_company_id`);
sql.push(`  FROM public.companies`);
sql.push(`  WHERE lower(company_name) LIKE '%argus%' OR lower(code) = 'argus'`);
sql.push(`  LIMIT 1;\n`);
sql.push(`  IF v_company_id IS NULL THEN`);
sql.push(`    RAISE NOTICE 'Argus Technologies company not found, proceeding without company_id';`);
sql.push(`  ELSE`);
sql.push(`    RAISE NOTICE 'Target Company ID resolved: %', v_company_id;`);
sql.push(`  END IF;\n`);

// Customers
sql.push(`  -- 3. Insert or update Customers`);
sql.push(`  INSERT INTO public.cnc_customers (id, name, contact, phone, email, city, gst, status, company_id)`);
sql.push(`  VALUES`);

const custEntries = Array.from(customers.values());
const custSqlValues = custEntries.map(c => {
  const esc = (s) => (s || '').replace(/'/g, "''");
  return `    ('${esc(c.id)}', '${esc(c.name)}', '${esc(c.contact)}', '${esc(c.phone)}', '${esc(c.email)}', '${esc(c.city)}', '${esc(c.gst)}', 'Active', v_company_id)`;
});
sql.push(custSqlValues.join(',\n'));
sql.push(`  ON CONFLICT (id) DO UPDATE SET`);
sql.push(`    name = EXCLUDED.name,`);
sql.push(`    contact = EXCLUDED.contact,`);
sql.push(`    phone = EXCLUDED.phone,`);
sql.push(`    email = EXCLUDED.email,`);
sql.push(`    city = EXCLUDED.city,`);
sql.push(`    gst = EXCLUDED.gst,`);
sql.push(`    company_id = COALESCE(EXCLUDED.company_id, cnc_customers.company_id);\n`);

// Enquiries
sql.push(`  -- 4. Insert Enquiries (Allocation stored in remarks)`);
sql.push(`  INSERT INTO public.cnc_enquiries (id, lead_no, enquiry_no, customer, contact_person, phone, email, city, gst, remarks, part_name, part_no, quantity, status, pipeline_stage, expected_date, received_date, company_id)`);
sql.push(`  VALUES`);

const enqSqlValues = enquiries.map(e => {
  const esc = (s) => (s || '').replace(/'/g, "''");
  return `    ('${esc(e.id)}', '${esc(e.lead_no)}', '${esc(e.enquiry_no)}', '${esc(e.customer)}', '${esc(e.contact_person)}', '${esc(e.phone)}', '${esc(e.email)}', '${esc(e.city)}', '${esc(e.gst)}', '${esc(e.remarks)}', '${esc(e.part_name)}', '${esc(e.part_no)}', ${e.quantity}, 'New', 'enquiry', '${e.expected_date}', '${e.received_date}', v_company_id)`;
});
sql.push(enqSqlValues.join(',\n'));
sql.push(`  ON CONFLICT DO NOTHING;\n`);

sql.push(`END $$;`);

const outPath = path.join(__dirname, 'insert_argus_leads.sql');
fs.writeFileSync(outPath, sql.join('\n'), 'utf8');
console.log('Saved to:', outPath);
