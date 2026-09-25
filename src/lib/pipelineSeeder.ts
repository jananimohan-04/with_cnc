import { supabase } from '@/lib/supabase';

export async function resetAndSeedAllPipelineData(companyId?: string | null) {
  console.log('[Seeder] Starting complete pipeline reset and 5-records-per-stage seeding...');

  // Step 1: Delete all existing pipeline data in safe foreign-key order
  try {
    await supabase.from('cnc_pipeline_comments').delete().not('id', 'is', null);
  } catch (e) {
    console.warn('Error deleting pipeline comments:', e);
  }

  try {
    await supabase.from('cnc_invoice_items').delete().not('id', 'is', null);
  } catch (e) {
    console.warn('Error deleting invoice items:', e);
  }

  try {
    await supabase.from('cnc_invoices').delete().not('id', 'is', null);
  } catch (e) {
    console.warn('Error deleting invoices:', e);
  }

  try {
    await supabase.from('cnc_deliveries').delete().not('id', 'is', null);
  } catch (e) {
    console.warn('Error deleting deliveries:', e);
  }

  try {
    await supabase.from('cnc_work_orders').delete().not('id', 'is', null);
  } catch (e) {
    console.warn('Error deleting work orders:', e);
  }

  try {
    await supabase.from('cnc_inwards').delete().not('id', 'is', null);
  } catch (e) {
    console.warn('Error deleting inwards:', e);
  }

  try {
    await supabase.from('cnc_sales_orders').delete().not('id', 'is', null);
  } catch (e) {
    console.warn('Error deleting sales orders:', e);
  }

  try {
    await supabase.from('cnc_quotations').delete().not('id', 'is', null);
  } catch (e) {
    console.warn('Error deleting quotations:', e);
  }

  try {
    await supabase.from('cnc_enquiries').delete().not('id', 'is', null);
  } catch (e) {
    console.warn('Error deleting enquiries:', e);
  }

  // Step 2: Seed Top 5 Customers
  const dummyCustomers = [
    {
      id: 'CUST-001',
      name: 'Tata Advanced Systems Ltd',
      industry: 'Aerospace & Defense',
      contact: 'Rajesh Verma',
      email: 'r.verma@tataadvanced.com',
      phone: '+91 98450 11223',
      city: 'Hyderabad',
      total_orders: 12,
      total_value: 3850000,
      outstanding: 0,
      rating: 5,
      status: 'Active',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: 'CUST-002',
      name: 'Mahindra Aerospace Pvt Ltd',
      industry: 'Aerospace Components',
      contact: 'Ananya Sen',
      email: 'ananya.sen@mahindra-aero.com',
      phone: '+91 98201 33445',
      city: 'Bengaluru',
      total_orders: 18,
      total_value: 2950000,
      outstanding: 0,
      rating: 5,
      status: 'Active',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: 'CUST-003',
      name: 'Larsen & Toubro Precision',
      industry: 'Heavy Engineering & Marine',
      contact: 'K. Sundaram',
      email: 'k.sundaram@larsentoubro.com',
      phone: '+91 94432 55678',
      city: 'Coimbatore',
      total_orders: 24,
      total_value: 5400000,
      outstanding: 0,
      rating: 5,
      status: 'Active',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: 'CUST-004',
      name: 'Godrej Precision Engineering',
      industry: 'Industrial & Space Actuators',
      contact: 'Vikram Deshmukh',
      email: 'v.deshmukh@godrej.com',
      phone: '+91 97112 88990',
      city: 'Mumbai',
      total_orders: 9,
      total_value: 4100000,
      outstanding: 0,
      rating: 4,
      status: 'Active',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: 'CUST-005',
      name: 'Bharat Forge Advanced Technologies',
      industry: 'Automotive & Heavy Forging',
      contact: 'Amit Kulkarni',
      email: 'amit.kulkarni@bharatforge.com',
      phone: '+91 99224 44556',
      city: 'Pune',
      total_orders: 31,
      total_value: 6200000,
      outstanding: 0,
      rating: 5,
      status: 'Active',
      ...(companyId ? { company_id: companyId } : {})
    }
  ];

  await supabase.from('cnc_customers').upsert(dummyCustomers, { onConflict: 'id' });

  // Step 3: Seed Stage 1 - 5 ENQUIRIES
  const dummyEnquiries = [
    {
      id: crypto.randomUUID(),
      lead_no: '1001',
      enquiry_no: '1001',
      customer: 'Tata Advanced Systems Ltd',
      part_name: 'Titanium Turbine Impeller - 5-Axis CNC',
      part_no: 'TI-IMP-5X-01',
      quantity: 25,
      estimated_value: 425000,
      expected_date: '2026-10-15',
      received_date: '2026-09-24',
      contact_person: 'Rajesh Verma',
      phone: '+91 98450 11223',
      email: 'r.verma@tataadvanced.com',
      source: 'Direct',
      status: 'New',
      pipeline_stage: 'Enquiry',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      lead_no: '1002',
      enquiry_no: '1002',
      customer: 'Larsen & Toubro Precision',
      part_name: 'Hydraulic Manifold Block - Al 7075-T6',
      part_no: 'HMB-7075-B2',
      quantity: 50,
      estimated_value: 360000,
      expected_date: '2026-10-18',
      received_date: '2026-09-23',
      contact_person: 'K. Sundaram',
      phone: '+91 94432 55678',
      email: 'k.sundaram@larsentoubro.com',
      source: 'Email',
      status: 'Contacted',
      pipeline_stage: 'Enquiry',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      lead_no: '1003',
      enquiry_no: '1003',
      customer: 'Mahindra Aerospace Pvt Ltd',
      part_name: 'Aerospace Actuator Mounting Bracket',
      part_no: 'AERO-BRK-M4',
      quantity: 120,
      estimated_value: 580000,
      expected_date: '2026-10-22',
      received_date: '2026-09-22',
      contact_person: 'Ananya Sen',
      phone: '+91 98201 33445',
      email: 'ananya.sen@mahindra-aero.com',
      source: 'Website',
      status: 'Qualified',
      pipeline_stage: 'Enquiry',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      lead_no: '1004',
      enquiry_no: '1004',
      customer: 'Godrej Precision Engineering',
      part_name: 'High-Pressure Fuel Injection Flange',
      part_no: 'HPF-FLG-316L',
      quantity: 80,
      estimated_value: 295000,
      expected_date: '2026-10-25',
      received_date: '2026-09-21',
      contact_person: 'Vikram Deshmukh',
      phone: '+91 97112 88990',
      email: 'v.deshmukh@godrej.com',
      source: 'Referral',
      status: 'Under Review',
      pipeline_stage: 'Enquiry',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      lead_no: '1005',
      enquiry_no: '1005',
      customer: 'Bharat Forge Advanced Technologies',
      part_name: 'Precision Planetary Gear Housing',
      part_no: 'PGH-EN24-05',
      quantity: 40,
      estimated_value: 640000,
      expected_date: '2026-10-28',
      received_date: '2026-09-20',
      contact_person: 'Amit Kulkarni',
      phone: '+91 99224 44556',
      email: 'amit.kulkarni@bharatforge.com',
      source: 'Direct',
      status: 'New',
      pipeline_stage: 'Enquiry',
      ...(companyId ? { company_id: companyId } : {})
    }
  ];

  const { error: enqErr } = await supabase.from('cnc_enquiries').insert(dummyEnquiries);
  if (enqErr) console.error('[Seeder] Error inserting enquiries:', enqErr);

  // Step 4: Seed Stage 2 - 5 QUOTATIONS
  const dummyQuotations = [
    {
      id: crypto.randomUUID(),
      quote_no: 'QT-2026-501',
      customer: 'Tata Advanced Systems Ltd',
      customer_id: 'CUST-001',
      contact_person: 'Rajesh Verma',
      phone: '+91 98450 11223',
      email: 'r.verma@tataadvanced.com',
      part_name: 'CNC Milled Missile Fin Assembly',
      part_number: 'FIN-ASM-01',
      quantity: 30,
      unit_price: 17000,
      discount_percent: 0,
      unit_discount: 0,
      gst_percent: 18,
      total_value: 601800,
      quote_date: '2026-09-23',
      valid_till: '2026-10-30',
      salesperson: 'Janani Mohan',
      status: 'Sent',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      quote_no: 'QT-2026-502',
      customer: 'Larsen & Toubro Precision',
      customer_id: 'CUST-003',
      contact_person: 'K. Sundaram',
      phone: '+91 94432 55678',
      email: 'k.sundaram@larsentoubro.com',
      part_name: 'Heavy Duty CNC Spindle Housing',
      part_number: 'SPN-HSG-02',
      quantity: 15,
      unit_price: 52333,
      discount_percent: 0,
      unit_discount: 0,
      gst_percent: 18,
      total_value: 926300,
      quote_date: '2026-09-22',
      valid_till: '2026-11-05',
      salesperson: 'Janani Mohan',
      status: 'Under Review',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      quote_no: 'QT-2026-503',
      customer: 'Mahindra Aerospace Pvt Ltd',
      customer_id: 'CUST-002',
      contact_person: 'Ananya Sen',
      phone: '+91 98201 33445',
      email: 'ananya.sen@mahindra-aero.com',
      part_name: 'Titanium Bulkhead Fitting',
      part_number: 'BLK-FIT-03',
      quantity: 60,
      unit_price: 8166,
      discount_percent: 0,
      unit_discount: 0,
      gst_percent: 18,
      total_value: 578200,
      quote_date: '2026-09-24',
      valid_till: '2026-10-28',
      salesperson: 'Janani Mohan',
      status: 'Sent',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      quote_no: 'QT-2026-504',
      customer: 'Godrej Precision Engineering',
      customer_id: 'CUST-004',
      contact_person: 'Vikram Deshmukh',
      phone: '+91 97112 88990',
      email: 'v.deshmukh@godrej.com',
      part_name: 'Precision Cryogenic Valve Body',
      part_number: 'CRYO-VLV-04',
      quantity: 45,
      unit_price: 13777,
      discount_percent: 0,
      unit_discount: 0,
      gst_percent: 18,
      total_value: 731600,
      quote_date: '2026-09-25',
      valid_till: '2026-11-10',
      salesperson: 'Janani Mohan',
      status: 'Draft',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      quote_no: 'QT-2026-505',
      customer: 'Bharat Forge Advanced Technologies',
      customer_id: 'CUST-005',
      contact_person: 'Amit Kulkarni',
      phone: '+91 99224 44556',
      email: 'amit.kulkarni@bharatforge.com',
      part_name: 'Hardened Spline Shaft - EN36C',
      part_number: 'SPL-SFT-05',
      quantity: 100,
      unit_price: 3750,
      discount_percent: 0,
      unit_discount: 0,
      gst_percent: 18,
      total_value: 442500,
      quote_date: '2026-09-24',
      valid_till: '2026-11-02',
      salesperson: 'Janani Mohan',
      status: 'Sent',
      ...(companyId ? { company_id: companyId } : {})
    }
  ];

  const { error: quoteErr } = await supabase.from('cnc_quotations').insert(dummyQuotations);
  if (quoteErr) console.error('[Seeder] Error inserting quotations:', quoteErr);

  // Step 5: Seed Stage 3 - 5 SALES ORDERS
  const dummySalesOrders = [
    {
      id: crypto.randomUUID(),
      order_no: 'SO-2026-301',
      customer: 'Tata Advanced Systems Ltd',
      customer_id: 'CUST-001',
      lead_no: '1006',
      contact_person: 'Rajesh Verma',
      phone: '+91 98450 11223',
      email: 'r.verma@tataadvanced.com',
      part_name: 'Radar Gimbal Support Bracket',
      part_number: 'RDR-GMB-01',
      quantity: 50,
      value: 850000,
      total_value: 850000,
      order_date: '2026-09-20',
      delivery_date: '2026-10-20',
      status: 'Confirmed',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      order_no: 'SO-2026-302',
      customer: 'Mahindra Aerospace Pvt Ltd',
      customer_id: 'CUST-002',
      lead_no: '1007',
      contact_person: 'Ananya Sen',
      phone: '+91 98201 33445',
      email: 'ananya.sen@mahindra-aero.com',
      part_name: 'Cockpit Control Lever Assembly',
      part_number: 'CKP-LEV-02',
      quantity: 75,
      value: 435000,
      total_value: 435000,
      order_date: '2026-09-21',
      delivery_date: '2026-10-24',
      status: 'In Production',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      order_no: 'SO-2026-303',
      customer: 'Larsen & Toubro Precision',
      customer_id: 'CUST-003',
      lead_no: '1008',
      contact_person: 'K. Sundaram',
      phone: '+91 94432 55678',
      email: 'k.sundaram@larsentoubro.com',
      part_name: 'Underwater Enclosure Flange',
      part_number: 'UND-ENC-03',
      quantity: 20,
      value: 920000,
      total_value: 920000,
      order_date: '2026-09-22',
      delivery_date: '2026-10-29',
      status: 'Confirmed',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      order_no: 'SO-2026-304',
      customer: 'Godrej Precision Engineering',
      customer_id: 'CUST-004',
      lead_no: '1009',
      contact_person: 'Vikram Deshmukh',
      phone: '+91 97112 88990',
      email: 'v.deshmukh@godrej.com',
      part_name: 'Precision Sensor Housing - Inconel 718',
      part_number: 'SNS-HSG-04',
      quantity: 35,
      value: 1150000,
      total_value: 1150000,
      order_date: '2026-09-23',
      delivery_date: '2026-11-04',
      status: 'In Production',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      order_no: 'SO-2026-305',
      customer: 'Bharat Forge Advanced Technologies',
      customer_id: 'CUST-005',
      lead_no: '1010',
      contact_person: 'Amit Kulkarni',
      phone: '+91 99224 44556',
      email: 'amit.kulkarni@bharatforge.com',
      part_name: 'Drive Pinion Gear Blank',
      part_number: 'DRV-PIN-05',
      quantity: 150,
      value: 560000,
      total_value: 560000,
      order_date: '2026-09-24',
      delivery_date: '2026-10-27',
      status: 'Confirmed',
      ...(companyId ? { company_id: companyId } : {})
    }
  ];

  const { error: soErr } = await supabase.from('cnc_sales_orders').insert(dummySalesOrders);
  if (soErr) console.error('[Seeder] Error inserting sales orders:', soErr);

  // Step 6: Seed Stage 4 - 5 INWARDS
  const dummyInwards = [
    {
      id: crypto.randomUUID(),
      inward_no: 'INW-2026-201',
      sales_order_ref: 'SO-2026-301',
      category: 'CUSTOMER DC',
      project_name: '1006',
      party_name: 'Tata Advanced Systems Ltd',
      contact_person: 'Rajesh Verma',
      phone: '+91 98450 11223',
      part_name: 'Raw Forgings for Radar Gimbal',
      part_number: 'FORG-RDR-01',
      quantity: 50,
      price: 4800,
      total_amount: 240000,
      inward_date: '2026-09-22',
      status: 'Received',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      inward_no: 'INW-2026-202',
      sales_order_ref: 'SO-2026-302',
      category: 'CUSTOMER DC',
      project_name: '1007',
      party_name: 'Mahindra Aerospace Pvt Ltd',
      contact_person: 'Ananya Sen',
      phone: '+91 98201 33445',
      part_name: 'Al 6061-T6 Extruded Billet Stock',
      part_number: 'BIL-6061-02',
      quantity: 80,
      price: 2187,
      total_amount: 175000,
      inward_date: '2026-09-23',
      status: 'Inspected',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      inward_no: 'INW-2026-203',
      sales_order_ref: 'SO-2026-303',
      category: 'CUSTOMER DC',
      project_name: '1008',
      party_name: 'Larsen & Toubro Precision',
      contact_person: 'K. Sundaram',
      phone: '+91 94432 55678',
      part_name: 'Duplex SS 2205 Round Bars',
      part_number: 'RND-2205-03',
      quantity: 25,
      price: 16400,
      total_amount: 410000,
      inward_date: '2026-09-23',
      status: 'Received',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      inward_no: 'INW-2026-204',
      sales_order_ref: 'SO-2026-304',
      category: 'CUSTOMER DC',
      project_name: '1009',
      party_name: 'Godrej Precision Engineering',
      contact_person: 'Vikram Deshmukh',
      phone: '+91 97112 88990',
      part_name: 'Inconel 718 Solid Bar Stock',
      part_number: 'INC-718-04',
      quantity: 40,
      price: 17000,
      total_amount: 680000,
      inward_date: '2026-09-24',
      status: 'Inspected',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      inward_no: 'INW-2026-205',
      sales_order_ref: 'SO-2026-305',
      category: 'CUSTOMER DC',
      project_name: '1010',
      party_name: 'Bharat Forge Advanced Technologies',
      contact_person: 'Amit Kulkarni',
      phone: '+91 99224 44556',
      part_name: 'EN36C Forged Ring Blanks',
      part_number: 'RNG-EN36C-05',
      quantity: 160,
      price: 1812,
      total_amount: 290000,
      inward_date: '2026-09-25',
      status: 'Received',
      ...(companyId ? { company_id: companyId } : {})
    }
  ];

  const { error: inwErr } = await supabase.from('cnc_inwards').insert(dummyInwards);
  if (inwErr) console.error('[Seeder] Error inserting inwards:', inwErr);

  // Step 7: Seed Stage 5 - 5 FINISHED GOODS (cnc_work_orders)
  const dummyFinishedGoods = [
    {
      id: crypto.randomUUID(),
      wo_no: 'WO-2026-701',
      sales_order: 'SO-2026-301',
      customer: 'Tata Advanced Systems Ltd',
      part_name: 'Radar Gimbal Support Bracket',
      part_no: 'RDR-GMB-01',
      quantity: 50,
      completed: 50,
      status: 'Completed',
      start_date: '2026-09-21',
      due_date: '2026-09-24',
      priority: 'Normal',
      drawing_revision: '1.0',
      created_at: '2026-09-24T00:00:00Z',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      wo_no: 'WO-2026-702',
      sales_order: 'SO-2026-302',
      customer: 'Mahindra Aerospace Pvt Ltd',
      part_name: 'Cockpit Control Lever Assembly',
      part_no: 'CKP-LEV-02',
      quantity: 75,
      completed: 75,
      status: 'Completed',
      start_date: '2026-09-22',
      due_date: '2026-09-24',
      priority: 'High',
      drawing_revision: '2.1',
      created_at: '2026-09-24T00:00:00Z',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      wo_no: 'WO-2026-703',
      sales_order: 'SO-2026-303',
      customer: 'Larsen & Toubro Precision',
      part_name: 'Underwater Enclosure Flange',
      part_no: 'UND-ENC-03',
      quantity: 20,
      completed: 20,
      status: 'Completed',
      start_date: '2026-09-23',
      due_date: '2026-09-25',
      priority: 'Normal',
      drawing_revision: '1.0',
      created_at: '2026-09-25T00:00:00Z',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      wo_no: 'WO-2026-704',
      sales_order: 'SO-2026-304',
      customer: 'Godrej Precision Engineering',
      part_name: 'Precision Sensor Housing - Inconel 718',
      part_no: 'SNS-HSG-04',
      quantity: 35,
      completed: 35,
      status: 'Completed',
      start_date: '2026-09-23',
      due_date: '2026-09-25',
      priority: 'High',
      drawing_revision: '3.0',
      created_at: '2026-09-25T00:00:00Z',
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      wo_no: 'WO-2026-705',
      sales_order: 'SO-2026-305',
      customer: 'Bharat Forge Advanced Technologies',
      part_name: 'Drive Pinion Gear Blank',
      part_no: 'DRV-PIN-05',
      quantity: 150,
      completed: 150,
      status: 'Completed',
      start_date: '2026-09-24',
      due_date: '2026-09-25',
      priority: 'Normal',
      drawing_revision: '1.2',
      created_at: '2026-09-25T00:00:00Z',
      ...(companyId ? { company_id: companyId } : {})
    }
  ];

  const { error: woErr } = await supabase.from('cnc_work_orders').insert(dummyFinishedGoods);
  if (woErr) console.error('[Seeder] Error inserting finished goods:', woErr);

  // Step 8: Seed Stage 6 - 5 DELIVERY CHALLANS
  const dummyDeliveries = [
    {
      id: crypto.randomUUID(),
      delivery_no: 'DC-2026-601',
      customer_name: 'Tata Advanced Systems Ltd',
      customer_id: 'CUST-001',
      sales_order_no: 'SO-2026-301',
      part_name: 'Radar Gimbal Support Bracket',
      quantity: 50,
      dispatch_qty: 50,
      delivery_date: '2026-09-24',
      vehicle_no: 'KA-04-AB-1234',
      status: 'Pending',
      created_at: new Date().toISOString(),
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      delivery_no: 'DC-2026-602',
      customer_name: 'Mahindra Aerospace Pvt Ltd',
      customer_id: 'CUST-002',
      sales_order_no: 'SO-2026-302',
      part_name: 'Cockpit Control Lever Assembly',
      quantity: 75,
      dispatch_qty: 75,
      delivery_date: '2026-09-24',
      vehicle_no: 'KA-51-MD-9876',
      status: 'Pending',
      created_at: new Date().toISOString(),
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      delivery_no: 'DC-2026-603',
      customer_name: 'Larsen & Toubro Precision',
      customer_id: 'CUST-003',
      sales_order_no: 'SO-2026-303',
      part_name: 'Underwater Enclosure Flange',
      quantity: 20,
      dispatch_qty: 20,
      delivery_date: '2026-09-25',
      vehicle_no: 'TN-38-LT-4567',
      status: 'Pending',
      created_at: new Date().toISOString(),
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      delivery_no: 'DC-2026-604',
      customer_name: 'Godrej Precision Engineering',
      customer_id: 'CUST-004',
      sales_order_no: 'SO-2026-304',
      part_name: 'Precision Sensor Housing - Inconel 718',
      quantity: 35,
      dispatch_qty: 35,
      delivery_date: '2026-09-25',
      vehicle_no: 'MH-02-GD-3321',
      status: 'Pending',
      created_at: new Date().toISOString(),
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      delivery_no: 'DC-2026-605',
      customer_name: 'Bharat Forge Advanced Technologies',
      customer_id: 'CUST-005',
      sales_order_no: 'SO-2026-305',
      part_name: 'Drive Pinion Gear Blank',
      quantity: 150,
      dispatch_qty: 150,
      delivery_date: '2026-09-25',
      vehicle_no: 'MH-12-BF-7788',
      status: 'Pending',
      created_at: new Date().toISOString(),
      ...(companyId ? { company_id: companyId } : {})
    }
  ];

  const { error: dcErr } = await supabase.from('cnc_deliveries').insert(dummyDeliveries);
  if (dcErr) console.error('[Seeder] Error inserting deliveries:', dcErr);

  // Step 9: Seed Stage 7 - 5 INVOICES
  const dummyInvoices = [
    {
      id: crypto.randomUUID(),
      invoice_no: 'INV-2026-801',
      invoice_type: 'Sales Invoice',
      customer_name: 'Tata Advanced Systems Ltd',
      customer_id: 'CUST-001',
      part_name: 'Radar Gimbal Support Bracket',
      quantity: 50,
      amount: 1003000,
      total_amount: 1003000,
      invoice_date: '2026-09-25',
      dc_no: 'DC-2026-601',
      status: 'Issued',
      pipeline_completed_at: null,
      created_at: new Date().toISOString(),
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      invoice_no: 'INV-2026-802',
      invoice_type: 'Sales Invoice',
      customer_name: 'Mahindra Aerospace Pvt Ltd',
      customer_id: 'CUST-002',
      part_name: 'Cockpit Control Lever Assembly',
      quantity: 75,
      amount: 513300,
      total_amount: 513300,
      invoice_date: '2026-09-25',
      dc_no: 'DC-2026-602',
      status: 'Issued',
      pipeline_completed_at: null,
      created_at: new Date().toISOString(),
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      invoice_no: 'INV-2026-803',
      invoice_type: 'Sales Invoice',
      customer_name: 'Larsen & Toubro Precision',
      customer_id: 'CUST-003',
      part_name: 'Underwater Enclosure Flange',
      quantity: 20,
      amount: 1085600,
      total_amount: 1085600,
      invoice_date: '2026-09-25',
      dc_no: 'DC-2026-603',
      status: 'Issued',
      pipeline_completed_at: null,
      created_at: new Date().toISOString(),
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      invoice_no: 'INV-2026-804',
      invoice_type: 'Sales Invoice',
      customer_name: 'Godrej Precision Engineering',
      customer_id: 'CUST-004',
      part_name: 'Precision Sensor Housing - Inconel 718',
      quantity: 35,
      amount: 1357000,
      total_amount: 1357000,
      invoice_date: '2026-09-25',
      dc_no: 'DC-2026-604',
      status: 'Issued',
      pipeline_completed_at: null,
      created_at: new Date().toISOString(),
      ...(companyId ? { company_id: companyId } : {})
    },
    {
      id: crypto.randomUUID(),
      invoice_no: 'INV-2026-805',
      invoice_type: 'Sales Invoice',
      customer_name: 'Bharat Forge Advanced Technologies',
      customer_id: 'CUST-005',
      part_name: 'Drive Pinion Gear Blank',
      quantity: 150,
      amount: 660800,
      total_amount: 660800,
      invoice_date: '2026-09-25',
      dc_no: 'DC-2026-605',
      status: 'Issued',
      pipeline_completed_at: null,
      created_at: new Date().toISOString(),
      ...(companyId ? { company_id: companyId } : {})
    }
  ];

  const { error: invErr } = await supabase.from('cnc_invoices').insert(dummyInvoices);
  if (invErr) console.error('[Seeder] Error inserting invoices:', invErr);

  console.log('[Seeder] Seeding finished successfully!');
  return { success: true };
}
