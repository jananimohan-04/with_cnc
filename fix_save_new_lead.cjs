const fs = require('fs');

let content = fs.readFileSync('src/pages/sales/SalesPipelinePage.tsx', 'utf8');

const regex = /const saveNewLead = async \(\) => \{[\s\S]*?\}\];/g;

const newLogic = `const saveNewLead = async () => {
      if (!newLeadForm.company) return;
      setLoading(true);
      const cStr = getContactStrings(newLeadForm);
      
      const itemsToSave = (newLeadForm.items && newLeadForm.items.length > 0 && newLeadForm.items[0].partName) 
        ? newLeadForm.items 
        : [{ partName: newLeadForm.partName || 'TBD', quantity: newLeadForm.quantity || '0' }];
        
      const firstItem = itemsToSave[0];
      const multiplePartsString = itemsToSave.length > 1 ? \`Multiple Parts (\${itemsToSave.length})\` : firstItem.partName;
      const totalQty = itemsToSave.reduce((acc, i) => acc + (Number(i.quantity) || 0), 0);
      
      const { error } = await supabase.from('cnc_enquiries').insert([{
        id: crypto.randomUUID(), lead_no: newLeadForm.leadNo, enquiry_no: newLeadForm.leadNo, customer: newLeadForm.company,
        contact_person: cStr.person, phone: cStr.phone, email: cStr.email,
        city: newLeadForm.city, gst: newLeadForm.gst, 
        enquiring_for: JSON.stringify(itemsToSave), 
        part_name: multiplePartsString, part_no: newLeadForm.partNo || 'N/A', quantity: totalQty, estimated_value: Number(newLeadForm.estimatedValue) || 0, expected_date: newLeadForm.expectedDate || new Date().toISOString().split('T')[0], received_date: new Date().toISOString().split('T')[0],
        source: newLeadForm.source, status: 'New', pipeline_stage: 'Enquiry'
      }]);`;

// Since there is a lot of code in saveNewLead, let's match the exact string instead of regex to avoid blowing up the file.

const oldSaveNewLead = `const saveNewLead = async () => {
      if (!newLeadForm.company) return;
      setLoading(true);
      const cStr = getContactStrings(newLeadForm);
      const { error } = await supabase.from('cnc_enquiries').insert([{
        id: crypto.randomUUID(), lead_no: newLeadForm.leadNo, enquiry_no: newLeadForm.leadNo, customer: newLeadForm.company,
        contact_person: cStr.person, phone: cStr.phone, email: cStr.email,
        city: newLeadForm.city, gst: newLeadForm.gst, enquiring_for: newLeadForm.enquiringFor,
        part_name: newLeadForm.partName || 'TBD', part_no: newLeadForm.partNo || 'N/A', quantity: Number(newLeadForm.quantity) || 0, estimated_value: Number(newLeadForm.estimatedValue) || 0, expected_date: newLeadForm.expectedDate || new Date().toISOString().split('T')[0], received_date: new Date().toISOString().split('T')[0],
        source: newLeadForm.source, status: 'New', pipeline_stage: 'Enquiry'
      }]);`;
      
content = content.replace(oldSaveNewLead, newLogic);

fs.writeFileSync('src/pages/sales/SalesPipelinePage.tsx', content);
