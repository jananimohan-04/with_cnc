const fs = require('fs');
const path = require('path');

const fullSql = fs.readFileSync('ALL_370_ARGUS_LEADS.sql', 'utf8');

// We have the clean generator in generate_clean_sql.cjs, let's export functions or split
const content = fs.readFileSync('scratch/master_leads_data.txt', 'utf8');
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
  const type = (parts[1] || '').trim();
  const code = (parts[2] || '').trim();
  let name = (parts[3] || '').replace(/[\r\n\t]/g, ' ').trim();
  let address = (parts[4] || '').replace(/[\r\n\t]/g, ' ').trim();
  let gst = (parts[5] || '').replace(/[\r\n\t]/g, ' ').trim();
  const c1 = (parts[6] || '').trim();
  const c2 = (parts[7] || '').trim();
  let email = (parts[8] || '').replace(/[\r\n\t]/g, ' ').trim();
  let contactPerson = (parts[9] || '').replace(/[\r\n\t]/g, ' ').trim();
  let allocation = (parts[10] || 'Job Work').replace(/[\r\n\t]/g, ' ').trim() || 'Job Work';

  if (contactPerson.includes('@') && !email) {
    email = contactPerson;
    contactPerson = '';
  }

  const phones = [c1, c2].filter(Boolean);
  const phone = phones.join(' / ');

  let receivedDate = '2026-09-29';
  if (timestamp) {
    const dateMatch = timestamp.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dateMatch) {
      receivedDate = `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}`;
    }
  }

  dataRows.push({ timestamp, type, code, name, address, gst, phone, email, contactPerson, allocation, receivedDate });
}

const customersMap = new Map();
const enquiries = [];
let leadSeq = 2001;

for (const r of dataRows) {
  const custId = r.code ? `CUST-${r.code}` : `CUST-L${leadSeq}`;
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
    remarks: r.allocation,
    part_name: `${r.allocation} Machining & Supply`,
    part_no: `PART-${leadNo}`,
    quantity: r.allocation.toLowerCase().includes('job') ? 100 : 50,
    status: 'New',
    pipeline_stage: 'enquiry',
    expected_date: '2026-10-30',
    received_date: r.receivedDate
  });
}

const esc = (s) => (s || '').replace(/'/g, "''");

// Helper to create wrapper
function wrapDoBlock(bodySql) {
  return `ALTER TABLE public.cnc_customers ADD COLUMN IF NOT EXISTS gst text;
ALTER TABLE public.cnc_enquiries ADD COLUMN IF NOT EXISTS gst text;
ALTER TABLE public.cnc_enquiries ADD COLUMN IF NOT EXISTS remarks text;
ALTER TABLE public.cnc_enquiries ALTER COLUMN part_no DROP NOT NULL;

DO $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT id INTO v_company_id
  FROM public.companies
  WHERE lower(company_name) LIKE '%argus%' OR lower(code) = 'argus'
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Argus Technologies company not found in public.companies table!';
  END IF;

${bodySql}

END $$;`;
}

// 1. Customers SQL
const custVals = Array.from(customersMap.values()).map(c => 
  `    ('${esc(c.id)}', '${esc(c.name)}', '${esc(c.contact)}', '${esc(c.phone)}', '${esc(c.email)}', '${esc(c.city)}', '${esc(c.gst)}', 'Active', v_company_id)`
).join(',\n');

const custSql = wrapDoBlock(`  INSERT INTO public.cnc_customers (id, name, contact, phone, email, city, gst, status, company_id)
  VALUES
${custVals}
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    contact = EXCLUDED.contact,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    city = EXCLUDED.city,
    gst = EXCLUDED.gst,
    company_id = EXCLUDED.company_id;`);

// 2. Enquiries Part 1 (Leads 2001 to 2185)
const enq1Vals = enquiries.slice(0, 185).map(e =>
  `    ('${esc(e.id)}', '${esc(e.lead_no)}', '${esc(e.enquiry_no)}', '${esc(e.customer)}', '${esc(e.contact_person)}', '${esc(e.phone)}', '${esc(e.email)}', '${esc(e.city)}', '${esc(e.gst)}', '${esc(e.remarks)}', '${esc(e.part_name)}', '${esc(e.part_no)}', ${e.quantity}, 'New', 'enquiry', '${e.expected_date}', '${e.received_date}', v_company_id)`
).join(',\n');

const enq1Sql = wrapDoBlock(`  INSERT INTO public.cnc_enquiries (id, lead_no, enquiry_no, customer, contact_person, phone, email, city, gst, remarks, part_name, part_no, quantity, status, pipeline_stage, expected_date, received_date, company_id)
  VALUES
${enq1Vals}
  ON CONFLICT (id) DO UPDATE SET
    customer = EXCLUDED.customer,
    contact_person = EXCLUDED.contact_person,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    city = EXCLUDED.city,
    gst = EXCLUDED.gst,
    remarks = EXCLUDED.remarks,
    part_name = EXCLUDED.part_name,
    part_no = EXCLUDED.part_no,
    quantity = EXCLUDED.quantity,
    company_id = EXCLUDED.company_id;`);

// 3. Enquiries Part 2 (Leads 2186 to 2370)
const enq2Vals = enquiries.slice(185).map(e =>
  `    ('${esc(e.id)}', '${esc(e.lead_no)}', '${esc(e.enquiry_no)}', '${esc(e.customer)}', '${esc(e.contact_person)}', '${esc(e.phone)}', '${esc(e.email)}', '${esc(e.city)}', '${esc(e.gst)}', '${esc(e.remarks)}', '${esc(e.part_name)}', '${esc(e.part_no)}', ${e.quantity}, 'New', 'enquiry', '${e.expected_date}', '${e.received_date}', v_company_id)`
).join(',\n');

const enq2Sql = wrapDoBlock(`  INSERT INTO public.cnc_enquiries (id, lead_no, enquiry_no, customer, contact_person, phone, email, city, gst, remarks, part_name, part_no, quantity, status, pipeline_stage, expected_date, received_date, company_id)
  VALUES
${enq2Vals}
  ON CONFLICT (id) DO UPDATE SET
    customer = EXCLUDED.customer,
    contact_person = EXCLUDED.contact_person,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    city = EXCLUDED.city,
    gst = EXCLUDED.gst,
    remarks = EXCLUDED.remarks,
    part_name = EXCLUDED.part_name,
    part_no = EXCLUDED.part_no,
    quantity = EXCLUDED.quantity,
    company_id = EXCLUDED.company_id;`);

const destDir = 'C:\\Users\\Janan\\Desktop';
fs.writeFileSync(path.join(destDir, '1_ARGUS_CUSTOMERS_370.sql'), custSql, 'utf8');
fs.writeFileSync(path.join(destDir, '2_ARGUS_LEADS_PART1_185.sql'), enq1Sql, 'utf8');
fs.writeFileSync(path.join(destDir, '3_ARGUS_LEADS_PART2_185.sql'), enq2Sql, 'utf8');

console.log('Successfully created split SQL files on Desktop!');
