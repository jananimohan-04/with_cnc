import uuid
import re

def parse_master_leads():
    with open('scratch/master_leads_data.txt', 'r', encoding='utf-8') as f:
        lines = [l.strip('\r\n') for l in f if l.strip()]

    header = lines[0].split('\t')
    print("Master Header:", header)

    customer_dict = {}
    enquiry_rows = []

    lead_counter = 2001

    for line in lines[1:]:
        parts = line.split('\t')
        # Ensure 11 elements
        while len(parts) < 11:
            parts.append('')

        timestamp, row_type, code, company_name, address, gst, contact1, contact2, email, contact_name, allocation = parts[:11]

        # Clean strings
        company_name = company_name.strip()
        address = address.strip()
        gst = gst.strip()
        contact1 = contact1.strip()
        contact2 = contact2.strip()
        email = email.strip()
        contact_name = contact_name.strip()
        allocation = allocation.strip() or 'Job Work'
        code = code.strip()

        if not company_name and not address and not gst and not email:
            continue

        if not company_name:
            company_name = f"Customer {code}" if code else f"Lead #{lead_counter}"

        # Combine phone numbers
        phones = [p for p in [contact1, contact2] if p]
        phone_str = ' / '.join(phones)

        cust_id = f"CUST-{code}" if code else f"CUST-L{lead_counter}"

        # Insert or update customer dictionary
        if company_name not in customer_dict:
            customer_dict[company_name] = {
                "id": cust_id,
                "name": company_name,
                "contact": contact_name or "Purchase Dept",
                "phone": phone_str,
                "email": email,
                "city": address or "Coimbatore",
                "gst": gst,
                "status": "Active"
            }
        else:
            # Update missing fields if new record has better data
            c = customer_dict[company_name]
            if not c["gst"] and gst: c["gst"] = gst
            if not c["email"] and email: c["email"] = email
            if not c["phone"] and phone_str: c["phone"] = phone_str
            if not c["city"] and address: c["city"] = address

        lead_no = str(lead_counter)
        lead_counter += 1

        # Build Enquiry (remarks stores Allocation)
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
            "remarks": allocation, # Store Allocation directly in remarks as instructed
            "part_name": f"{allocation} Component Supply",
            "quantity": 100 if allocation == "Job Work" else 50,
            "status": "New",
            "pipeline_stage": "enquiry",
            "expected_date": "2026-10-15",
            "received_date": "2026-09-29"
        }
        enquiry_rows.append(enquiry)

    print(f"Parsed {len(enquiry_rows)} total enquiries.")
    print(f"Parsed {len(customer_dict)} unique companies.")

    # Generate SQL
    sql_lines = []
    sql_lines.append("-- SQL Script to insert all leads into Supabase public.cnc_customers and public.cnc_enquiries")
    sql_lines.append("-- ALLOCATION value is saved directly in the `remarks` column of public.cnc_enquiries\n")

    # 1. Customers SQL
    sql_lines.append("\n-- 1. Insert Customers")
    sql_lines.append("INSERT INTO public.cnc_customers (id, name, contact, phone, email, city, gst, status)")
    sql_lines.append("VALUES")

    cust_values = []
    for c in customer_dict.values():
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
    sql_lines.append("\n-- 2. Insert Enquiries / Leads")
    sql_lines.append("INSERT INTO public.cnc_enquiries (id, lead_no, enquiry_no, customer, contact_person, phone, email, city, gst, remarks, part_name, quantity, status, pipeline_stage, expected_date, received_date)")
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

    print("Generated scratch/insert_leads_dataset.sql successfully.")

if __name__ == '__main__':
    parse_master_leads()
