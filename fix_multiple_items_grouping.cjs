const fs = require('fs');

let content = fs.readFileSync('src/pages/sales/SalesPipelinePage.tsx', 'utf8');

// 1. Update New Lead Insert Logic
const oldInsertLogic = `      const inserts = validItems.map(item => ({
        id: crypto.randomUUID(), lead_no: newLeadForm.leadNo, enquiry_no: newLeadForm.leadNo, customer: newLeadForm.company,
        contact_person: cStr.person, phone: cStr.phone, email: cStr.email,
        city: newLeadForm.city, gst: newLeadForm.gst, enquiring_for: newLeadForm.enquiringFor,
        part_name: item.partName || 'TBD', part_no: newLeadForm.partNo || 'N/A', quantity: Number(item.quantity) || 0, estimated_value: Number(newLeadForm.estimatedValue) || 0, expected_date: newLeadForm.expectedDate || new Date().toISOString().split('T')[0], received_date: new Date().toISOString().split('T')[0],
        source: newLeadForm.source, status: 'New', pipeline_stage: 'Enquiry'
      }));

      const { error } = await supabase.from('cnc_enquiries').insert(inserts);`;

const newInsertLogic = `      const firstItem = validItems[0];
      const multiplePartsString = validItems.length > 1 ? \`Multiple Parts (\${validItems.length})\` : firstItem.partName;
      const totalQty = validItems.reduce((acc, i) => acc + (Number(i.quantity) || 0), 0);
      
      const { error } = await supabase.from('cnc_enquiries').insert([{
        id: crypto.randomUUID(), lead_no: newLeadForm.leadNo, enquiry_no: newLeadForm.leadNo, customer: newLeadForm.company,
        contact_person: cStr.person, phone: cStr.phone, email: cStr.email,
        city: newLeadForm.city, gst: newLeadForm.gst, 
        enquiring_for: JSON.stringify(validItems), // Pack items as JSON here
        part_name: multiplePartsString, part_no: newLeadForm.partNo || 'N/A', quantity: totalQty, estimated_value: Number(newLeadForm.estimatedValue) || 0, expected_date: newLeadForm.expectedDate || new Date().toISOString().split('T')[0], received_date: new Date().toISOString().split('T')[0],
        source: newLeadForm.source, status: 'New', pipeline_stage: 'Enquiry'
      }]);`;

content = content.replace(oldInsertLogic, newInsertLogic);

// 2. Pass JSON through handleDrop
const oldDropToQuote = `          partName: card.part, partNumber: card.raw.part_no !== 'N/A' ? (card.raw.part_no || '') : '', description: '', quantity: card.qty?.toString() || '', unitPrice: '', discount: '0', gst: '18',`;
const newDropToQuote = `          partName: card.part, partNumber: card.raw.part_no !== 'N/A' ? (card.raw.part_no || '') : '', description: card.raw.enquiring_for || '', quantity: card.qty?.toString() || '', unitPrice: '', discount: '0', gst: '18',`;
content = content.replace(oldDropToQuote, newDropToQuote);

const oldDropToOrder = `        const item = {
           id: crypto.randomUUID(),
           partName: card.part,
           partNumber: card.raw.part_number || '',
           description: card.raw.description || '',
           quantity: q.toString(),
           unitPrice: p.toString(),
           discount: (card.raw.discount_percent || 0).toString(),
           gst: (card.raw.gst_percent || 18).toString()
        };`;
const newDropToOrder = `        let itemsArr = [];
        try { itemsArr = JSON.parse(card.raw.description); } catch(e) {}
        
        let finalItems = [];
        if (itemsArr && Array.isArray(itemsArr) && itemsArr.length > 0) {
          finalItems = itemsArr.map(i => ({
            id: crypto.randomUUID(), partName: i.partName, partNumber: i.partNumber || '', description: '',
            quantity: i.quantity?.toString() || '0', unitPrice: p.toString(), discount: (card.raw.discount_percent || 0).toString(), gst: (card.raw.gst_percent || 18).toString()
          }));
        } else {
          finalItems = [{
             id: crypto.randomUUID(), partName: card.part, partNumber: card.raw.part_number || '', description: card.raw.description || '',
             quantity: q.toString(), unitPrice: p.toString(), discount: (card.raw.discount_percent || 0).toString(), gst: (card.raw.gst_percent || 18).toString()
          }];
        }`;
content = content.replace(oldDropToOrder, newDropToOrder);

content = content.replace(/items: \[item\],/g, 'items: finalItems,');


// 3. Inject items for rendering in openViewModal
const oldAgg = `let aggregated: any = { enquiry: null, quotation: null, order: null, inward: null, finished_goods: null, dc: null, invoice: null };`;
const newAgg = `let aggregated: any = { enquiry: null, quotation: null, order: null, inward: null, finished_goods: null, dc: null, invoice: null };
      const parseItems = (rawObj: any, field: string) => {
        if (!rawObj || !rawObj[field]) return;
        try { const parsed = JSON.parse(rawObj[field]); if (Array.isArray(parsed)) rawObj.items = parsed; } catch(e) {}
      };`;
content = content.replace(oldAgg, newAgg);

const oldSetViewModal = `setViewModalData(aggregated);`;
const newSetViewModal = `if (aggregated.enquiry) parseItems(aggregated.enquiry, 'enquiring_for');
      if (aggregated.quotation) parseItems(aggregated.quotation, 'description');
      setViewModalData(aggregated);`;
content = content.replace(oldSetViewModal, newSetViewModal);

fs.writeFileSync('src/pages/sales/SalesPipelinePage.tsx', content);
