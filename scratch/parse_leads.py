import re
import uuid
import json

def parse_leads():
    with open('scratch/raw_leads_data.txt', 'r', encoding='utf-8') as f:
        lines = f.readlines()

    header = lines[0].strip().split('\t')
    print("Header:", header)

    leads = []
    
    lead_counter = 2001
    
    customer_set = {}
    enquiry_rows = []
    
    for idx, line in enumerate(lines[1:], start=2):
        parts = [p.strip() for p in line.split('\t')]
        # Ensure parts length reaches 7 (ADDRESS, GST, CONTACT1, CONTACT2, EMAIL ID, CONTACT NAME, ALLOCATION)
        while len(parts) < 7:
            parts.append('')
            
        address, gst, contact1, contact2, email, contact_name, allocation = parts[:7]
        
        # Skip completely empty rows
        if not any([address, gst, contact1, contact2, email, contact_name, allocation]):
            continue
            
        # Combine contacts
        phones = [p for p in [contact1, contact2] if p]
        phone_str = ' / '.join(phones)
        
        # Deduce Company Name
        company_name = ""
        
        # 1. Check contact name if specific company attached
        if contact_name and ("Venkateshwara" in contact_name or "Myilsamy" in contact_name):
            company_name = "Venkateshwara Hitech"
        elif email:
            domain = email.split('@')[-1].lower() if '@' in email else ''
            domain_clean = domain.replace('.com', '').replace('.in', '').replace('.co.in', '').replace('.org', '').replace('.net', '')
            if domain_clean and domain_clean not in ['gmail', 'yahoo', 'hotmail', 'outlook', 'rediffmail', 'ymail']:
                # Clean up domain to title case
                words = [w.capitalize() for w in re.split(r'[-_.]', domain_clean) if w]
                company_name = ' '.join(words)
                if 'Industries' not in company_name and 'Tech' not in company_name and 'Metals' not in company_name and 'Group' not in company_name and 'World' not in company_name:
                    company_name += " Corp"

        # 2. Check address for explicit business names or landmarks
        if not company_name and address:
            # Look for explicit company markers in address like "ROOTS COMPANY", "VR COMPLEX", "SNMV COLLEGE"
            if "CRI PUMPS" in address:
                company_name = "CRI Pumps Partner"
            elif "AMW GROUP" in address or "GURGAON" in address:
                company_name = "AMW Group"
            elif "TFIA INDUSTRIAL ESTATE" in address:
                company_name = "TFIA Estate Engineering"
            elif "LGB NAGAR" in address or "OPP TO LGB" in address:
                company_name = "LGB Area Works"

        # 3. If contact_name exists, use contact name + " Enterprise" or similar if no company name yet
        if not company_name and contact_name:
            c_clean = contact_name.title()
            if c_clean.startswith('Mr.') or c_clean.startswith('Mr '):
                company_name = f"{c_clean} Tech"
            else:
                company_name = f"{c_clean} Enterprise"

        # 4. If GST is present, fallback to GST prefix
        if not company_name and gst:
            company_name = f"GST Company ({gst[:7]})"

        # 5. Final fallback
        if not company_name:
            company_name = f"Lead Customer #{lead_counter}"

        lead_no = str(lead_counter)
        lead_counter += 1

        cust_id = f"CUST-L{lead_no}"
        
        # Save customer
        if company_name not in customer_set:
            customer_set[company_name] = {
                "id": cust_id,
                "name": company_name,
                "contact": contact_name or "Purchase Manager",
                "phone": phone_str,
                "email": email,
                "city": address or "Coimbatore",
                "gst": gst,
                "status": "Active"
            }
            
        enquiry = {
            "id": f"enq-{lead_no}-{uuid.uuid4().hex[:6]}",
            "lead_no": lead_no,
            "enquiry_no": lead_no,
            "customer": company_name,
            "contact_person": contact_name or "Purchase Dept",
            "phone": phone_str,
            "email": email,
            "city": address,
            "gst": gst,
            "remarks": allocation or "Job Work", # Allocation stored in remarks column as required
            "part_name": f"{allocation or 'Job Work'} Machining & Component Supply",
            "quantity": 100 if allocation == "Job Work" else 50,
            "status": "New",
            "pipeline_stage": "enquiry",
            "expected_date": "2026-10-15",
            "received_date": "2026-09-29"
        }
        enquiry_rows.append(enquiry)

    print(f"Total processed rows: {len(enquiry_rows)}")
    print(f"Total unique customers: {len(customer_set)}")

    # Generate SQL
    sql_lines = []
    sql_lines.append("-- SQL Script to insert all leads into Supabase public.cnc_customers and public.cnc_enquiries\n")
    sql_lines.append("-- Allocation data is stored in the `remarks` column of cnc_enquiries\n")
    
    # 1. Customers SQL
    sql_lines.append("\n-- 1. Insert Customers\nINSERT INTO public.cnc_customers (id, name, contact, phone, email, city, gst, status)")
    sql_lines.append("VALUES")
    
    cust_values = []
    for c in customer_set.values():
        name_esc = c['name'].replace("'", "''")
        contact_esc = c['contact'].replace("'", "''")
        phone_esc = c['phone'].replace("'", "''")
        email_esc = c['email'].replace("'", "''")
        city_esc = c['city'].replace("'", "''")
        gst_esc = c['gst'].replace("'", "''")
        
        cust_values.append(f"  ('{c['id']}', '{name_esc}', '{contact_esc}', '{phone_esc}', '{email_esc}', '{city_esc}', '{gst_esc}', 'Active')")
        
    sql_lines.append(",\n".join(cust_values))
    sql_lines.append("ON CONFLICT (id) DO UPDATE SET")
    sql_lines.append("  name = EXCLUDED.name,")
    sql_lines.append("  contact = EXCLUDED.contact,")
    sql_lines.append("  phone = EXCLUDED.phone,")
    sql_lines.append("  email = EXCLUDED.email,")
    sql_lines.append("  city = EXCLUDED.city,")
    sql_lines.append("  gst = EXCLUDED.gst;\n")
    
    # 2. Enquiries SQL
    sql_lines.append("\n-- 2. Insert Enquiries / Leads\nINSERT INTO public.cnc_enquiries (id, lead_no, enquiry_no, customer, contact_person, phone, email, city, gst, remarks, part_name, quantity, status, pipeline_stage, expected_date, received_date)")
    sql_lines.append("VALUES")
    
    enq_values = []
    for e in enquiry_rows:
        id_esc = e['id'].replace("'", "''")
        lead_no_esc = e['lead_no'].replace("'", "''")
        customer_esc = e['customer'].replace("'", "''")
        contact_esc = e['contact_person'].replace("'", "''")
        phone_esc = e['phone'].replace("'", "''")
        email_esc = e['email'].replace("'", "''")
        city_esc = e['city'].replace("'", "''")
        gst_esc = e['gst'].replace("'", "''")
        remarks_esc = e['remarks'].replace("'", "''")
        part_esc = e['part_name'].replace("'", "''")
        
        enq_values.append(f"  ('{id_esc}', '{lead_no_esc}', '{lead_no_esc}', '{customer_esc}', '{contact_esc}', '{phone_esc}', '{email_esc}', '{city_esc}', '{gst_esc}', '{remarks_esc}', '{part_esc}', {e['quantity']}, 'New', 'enquiry', '{e['expected_date']}', '{e['received_date']}')")
        
    sql_lines.append(",\n".join(enq_values))
    sql_lines.append("ON CONFLICT DO NOTHING;\n")
    
    with open('scratch/insert_leads_dataset.sql', 'w', encoding='utf-8') as f:
        f.write("\n".join(sql_lines))

    print("Successfully generated scratch/insert_leads_dataset.sql")

if __name__ == '__main__':
    parse_leads()
