const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, 'master_leads_data.txt'), 'utf8');
const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);

console.log('Total non-empty lines in master_leads_data.txt:', lines.length);

const dataRows = [];
// Process header
const header = lines[0].split('\t');

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  let parts = line.split('\t');

  // Handle row 19: missing contact1, contact2
  // TIMESTAMP, TYPE, CODE, COMPANY NAME, ADDRESS, GST, EMAIL ID, CONTACT NAME, ALLOCATION
  if (parts.length === 9 && parts[2] === 'S-130') {
    parts = [
      parts[0], // timestamp
      parts[1], // type
      parts[2], // code
      parts[3], // name
      parts[4], // address
      parts[5], // gst
      '',       // contact1
      '',       // contact2
      parts[6], // email
      parts[7], // contact name
      parts[8]  // allocation
    ];
  } else if (parts.length === 12 && parts[2] === 'C-970') {
    // Unique measurement service had an extra tab
    parts = [
      parts[0], // timestamp
      parts[1], // type
      parts[2], // code
      parts[3], // name
      parts[4], // address
      parts[5], // gst
      parts[6], // contact1
      parts[7], // contact2
      parts[9], // email
      parts[10] || '', // contact name
      parts[11] // allocation
    ];
  }

  const timestamp = (parts[0] || '').trim();
  const type = (parts[1] || '').trim();
  const code = (parts[2] || '').trim();
  let name = (parts[3] || '').trim();
  let address = (parts[4] || '').trim();
  let gst = (parts[5] || '').trim();
  const c1 = (parts[6] || '').trim();
  const c2 = (parts[7] || '').trim();
  let email = (parts[8] || '').trim();
  let contactPerson = (parts[9] || '').trim();
  let allocation = (parts[10] || 'Job Work').trim() || 'Job Work';

  // Normalize
  name = name.replace(/[\r\n\t]/g, ' ').trim();
  address = address.replace(/[\r\n\t]/g, ' ').trim();
  gst = gst.replace(/[\r\n\t]/g, ' ').trim();
  email = email.replace(/[\r\n\t]/g, ' ').trim();
  contactPerson = contactPerson.replace(/[\r\n\t]/g, ' ').trim();
  allocation = allocation.replace(/[\r\n\t]/g, ' ').trim();

  // If email is in contactPerson or vice versa
  if (contactPerson.includes('@') && !email) {
    email = contactPerson;
    contactPerson = '';
  }

  const phones = [c1, c2].filter(Boolean);
  const phone = phones.join(' / ');

  // Parse timestamp to YYYY-MM-DD
  let receivedDate = '2026-09-29';
  if (timestamp) {
    const dateMatch = timestamp.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dateMatch) {
      const d = dateMatch[1].padStart(2, '0');
      const m = dateMatch[2].padStart(2, '0');
      const y = dateMatch[3];
      receivedDate = `${y}-${m}-${d}`;
    }
  }

  dataRows.push({
    index: i,
    timestamp,
    type,
    code,
    name,
    address,
    gst,
    phone,
    email,
    contactPerson,
    allocation,
    receivedDate
  });
}

console.log(`Parsed ${dataRows.length} data rows successfully.`);

// Deduplicate customers by name (or code)
const customersMap = new Map();
const usedCustIds = new Set();
const enquiries = [];

let leadSeq = 2001;

for (const r of dataRows) {
  let custId = r.code ? `CUST-${r.code}` : `CUST-L${leadSeq}`;
  // Handle duplicate codes (e.g. C-550 used by two different companies)
  if (usedCustIds.has(custId)) {
    custId = `${custId}-B`;
  }
  usedCustIds.add(custId);
  const leadNo = leadSeq.toString();
  leadSeq++;

  if (!customersMap.has(r.name)) {
    customersMap.set(r.name, {
      id: custId,
      name: r.name,
      contact: r.contactPerson || 'Purchase Dept',
      phone: r.phone,
      email: r.email,
      city: r.address || 'Coimbatore',
      gst: r.gst,
      status: 'Active'
    });
  } else {
    const existing = customersMap.get(r.name);
    if (!existing.gst && r.gst) existing.gst = r.gst;
    if (!existing.email && r.email) existing.email = r.email;
    if (!existing.phone && r.phone) existing.phone = r.phone;
    if (!existing.city && r.address) existing.city = r.address;
    if (!existing.contact && r.contactPerson) existing.contact = r.contactPerson;
  }

  enquiries.push({
    id: `enq-${leadNo}`,
    lead_no: leadNo,
    enquiry_no: leadNo,
    customer: r.name,
    contact_person: r.contactPerson || 'Purchase Dept',
    phone: r.phone,
    email: r.email,
    city: r.address,
    gst: r.gst,
    remarks: r.allocation, // USER DIRECTIVE: allocation stored in remarks
    part_name: `${r.allocation} Machining & Supply`,
    part_no: `PART-${leadNo}`,
    quantity: r.allocation.toLowerCase().includes('job') ? 100 : 50,
    status: 'New',
    pipeline_stage: 'enquiry',
    expected_date: '2026-10-30',
    received_date: r.receivedDate
  });
}

console.log(`Unique Customers: ${customersMap.size}`);
console.log(`Enquiries to insert: ${enquiries.length}`);

const esc = (s) => (s || '').replace(/'/g, "''");

// Build SQL
const sql = [];
sql.push(`-- =====================================================================================`);
sql.push(`-- COMPLETE INSERTION SCRIPT FOR ALL 370 LEADS & CUSTOMERS (ARGUS TECHNOLOGIES)`);
sql.push(`-- Total Rows: ${enquiries.length} Enquiries, ${customersMap.size} Unique Customers`);
sql.push(`-- Allocation stored directly in the \`remarks\` column of cnc_enquiries`);
sql.push(`-- =====================================================================================\n`);

sql.push(`-- Step 1: Ensure required columns exist and part_no is not strictly constrained`);
sql.push(`ALTER TABLE public.cnc_customers ADD COLUMN IF NOT EXISTS gst text;`);
sql.push(`ALTER TABLE public.cnc_enquiries ADD COLUMN IF NOT EXISTS gst text;`);
sql.push(`ALTER TABLE public.cnc_enquiries ADD COLUMN IF NOT EXISTS remarks text;`);
sql.push(`ALTER TABLE public.cnc_enquiries ALTER COLUMN part_no DROP NOT NULL;\n`);

sql.push(`DO $$`);
sql.push(`DECLARE`);
sql.push(`  v_company_id uuid;`);
sql.push(`BEGIN`);
sql.push(`  -- Step 2: Resolve Argus Technologies Company ID`);
sql.push(`  SELECT id INTO v_company_id`);
sql.push(`  FROM public.companies`);
sql.push(`  WHERE lower(company_name) LIKE '%argus%' OR lower(code) = 'argus'`);
sql.push(`  LIMIT 1;\n`);
sql.push(`  IF v_company_id IS NULL THEN`);
sql.push(`    RAISE EXCEPTION 'Argus Technologies company not found in public.companies table!';`);
sql.push(`  END IF;\n`);
sql.push(`  RAISE NOTICE 'Target Company ID resolved: %', v_company_id;\n`);

sql.push(`  -- Step 3: Remove only the 8 temporary preview test rows if they exist`);
sql.push(`  DELETE FROM public.cnc_enquiries`);
sql.push(`  WHERE id IN (`);
sql.push(`    'enq-2001-a1b2c3', 'enq-2002-b2c3d4', 'enq-2003-c3d4e5', 'enq-2004-d4e5f6',`);
sql.push(`    'enq-2005-e5f6a7', 'enq-2006-f6a7b8', 'enq-2007-a7b8c9', 'enq-2008-b8c9d0'`);
sql.push(`  );\n`);

sql.push(`  -- Step 4: Insert all ${customersMap.size} unique Customers`);
sql.push(`  INSERT INTO public.cnc_customers (id, name, contact, phone, email, city, gst, status, company_id)`);
sql.push(`  VALUES`);

const custValues = Array.from(customersMap.values()).map(c => {
  return `    ('${esc(c.id)}', '${esc(c.name)}', '${esc(c.contact)}', '${esc(c.phone)}', '${esc(c.email)}', '${esc(c.city)}', '${esc(c.gst)}', 'Active', v_company_id)`;
});
sql.push(custValues.join(',\n'));
sql.push(`  ON CONFLICT (id) DO UPDATE SET`);
sql.push(`    name = EXCLUDED.name,`);
sql.push(`    contact = EXCLUDED.contact,`);
sql.push(`    phone = EXCLUDED.phone,`);
sql.push(`    email = EXCLUDED.email,`);
sql.push(`    city = EXCLUDED.city,`);
sql.push(`    gst = EXCLUDED.gst,`);
sql.push(`    company_id = EXCLUDED.company_id;\n`);

sql.push(`  -- Step 5: Insert all ${enquiries.length} Enquiries`);
sql.push(`  INSERT INTO public.cnc_enquiries (id, lead_no, enquiry_no, customer, contact_person, phone, email, city, gst, remarks, part_name, part_no, quantity, status, pipeline_stage, expected_date, received_date, company_id)`);
sql.push(`  VALUES`);

const enqValues = enquiries.map(e => {
  return `    ('${esc(e.id)}', '${esc(e.lead_no)}', '${esc(e.enquiry_no)}', '${esc(e.customer)}', '${esc(e.contact_person)}', '${esc(e.phone)}', '${esc(e.email)}', '${esc(e.city)}', '${esc(e.gst)}', '${esc(e.remarks)}', '${esc(e.part_name)}', '${esc(e.part_no)}', ${e.quantity}, 'New', 'enquiry', '${e.expected_date}', '${e.received_date}', v_company_id)`;
});
sql.push(enqValues.join(',\n'));
sql.push(`  ON CONFLICT (id) DO UPDATE SET`);
sql.push(`    customer = EXCLUDED.customer,`);
sql.push(`    contact_person = EXCLUDED.contact_person,`);
sql.push(`    phone = EXCLUDED.phone,`);
sql.push(`    email = EXCLUDED.email,`);
sql.push(`    city = EXCLUDED.city,`);
sql.push(`    gst = EXCLUDED.gst,`);
sql.push(`    remarks = EXCLUDED.remarks,`);
sql.push(`    part_name = EXCLUDED.part_name,`);
sql.push(`    part_no = EXCLUDED.part_no,`);
sql.push(`    quantity = EXCLUDED.quantity,`);
sql.push(`    company_id = EXCLUDED.company_id;\n`);

sql.push(`END $$;`);

const finalSql = sql.join('\n');
const outProject = path.join(__dirname, '..', 'ALL_370_ARGUS_LEADS.sql');
const outScratch = path.join(__dirname, 'insert_argus_leads.sql');
fs.writeFileSync(outProject, finalSql, 'utf8');
fs.writeFileSync(outScratch, finalSql, 'utf8');

console.log('Saved to:', outProject);
console.log('Saved to:', outScratch);
console.log('Total characters:', finalSql.length);
