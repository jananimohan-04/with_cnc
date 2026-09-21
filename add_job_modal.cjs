const fs = require('fs');

let content = fs.readFileSync('src/pages/production/unified/SchedulingPage.tsx', 'utf8');

// Ensure Modal and FormField are imported
if (!content.includes('Modal')) {
  content = content.replace(
    `import { Button } from '@/components/ui/Card';`,
    `import { Button } from '@/components/ui/Card';\nimport { Modal, FormField, inputClass } from '@/components/ui/Modal';`
  );
}

// Add state for modal
const stateRegex = /const \[selectedJob, setSelectedJob\] = useState<any>\(null\);/;
const stateAddition = `const [selectedJob, setSelectedJob] = useState<any>(null);
  
  const [showAddJob, setShowAddJob] = useState(false);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [newJobForm, setNewJobForm] = useState({
    workOrder: '', partName: '', partNo: '', customer: '', qty: '', 
    machine: '', operator: '', date: currentDate.toISOString().split('T')[0], startTime: '08:00',
    cycleTime: '15'
  });`;

content = content.replace(stateRegex, stateAddition);

// Add fetch for work orders
const fetchRegex = /setJobs\(jobsRes\.data \|\| \[\]\);/;
const fetchAddition = `setJobs(jobsRes.data || []);
      const woRes = await supabase.from('cnc_work_orders').select('*').neq('status', 'Completed');
      if (woRes.data) setWorkOrders(woRes.data);`;
content = content.replace(fetchRegex, fetchAddition);


// Handle WO selection
const handleAddFunc = `
  const handleWorkOrderSelect = (woId: string) => {
    const wo = workOrders.find(w => w.wo_no === woId);
    if (wo) {
      setNewJobForm(prev => ({
        ...prev,
        workOrder: wo.wo_no,
        partName: wo.part_name || '',
        partNo: wo.part_no || '',
        customer: wo.customer || '',
        qty: wo.quantity?.toString() || ''
      }));
    }
  };

  const handleAddJobSubmit = async () => {
    if (!newJobForm.workOrder || !newJobForm.machine || !newJobForm.date) return alert('Please fill required fields');
    
    // Create new job card
    const d = new Date(newJobForm.date + 'T' + newJobForm.startTime);
    
    const { error } = await supabase.from('cnc_job_cards').insert([{
      id: crypto.randomUUID(),
      job_no: \`JC-\${Math.floor(1000 + Math.random() * 9000)}\`,
      work_order: newJobForm.workOrder,
      part_name: newJobForm.partName,
      machine: newJobForm.machine,
      operator: newJobForm.operator,
      qty_planned: Number(newJobForm.qty),
      qty_completed: 0,
      qty_rejected: 0,
      cycle_time: Number(newJobForm.cycleTime),
      setup_time: 30,
      status: 'Planned',
      created_at: d.toISOString()
    }]);

    if (error) {
      alert('Error saving job: ' + error.message);
    } else {
      setShowAddJob(false);
      fetchData();
    }
  };

  const activeDates = getActiveDates();`;

content = content.replace(`const activeDates = getActiveDates();`, handleAddFunc);


// Add onClick to Button
content = content.replace(
  /<Button variant="primary" className="bg-blue-600 hover:bg-blue-700 text-white"><Plus size={18} \/> Add Job<\/Button>/,
  `<Button variant="primary" className="bg-brand-500 hover:bg-brand-600 text-white border-0 shadow-sm" onClick={() => setShowAddJob(true)}><Plus size={18} /> Add Job</Button>`
);


// Add the Modal JSX at the bottom
const modalJSX = `
      {/* Add Job Modal */}
      <Modal open={showAddJob} onClose={() => setShowAddJob(false)} title="Schedule New Job" size="lg" footer={
        <>
          <Button variant="secondary" onClick={() => setShowAddJob(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleAddJobSubmit}>Schedule Job</Button>
        </>
      }>
        <div className="space-y-4">
          <FormField label="Select Production Order" required>
            <select className={inputClass} value={newJobForm.workOrder} onChange={e => handleWorkOrderSelect(e.target.value)}>
              <option value="">-- Select Order --</option>
              {workOrders.map(wo => (
                <option key={wo.id} value={wo.wo_no}>{wo.wo_no} - {wo.part_name}</option>
              ))}
            </select>
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Customer"><input className={inputClass + ' bg-slate-50'} value={newJobForm.customer} readOnly disabled/></FormField>
            <FormField label="Part Name"><input className={inputClass + ' bg-slate-50'} value={newJobForm.partName} readOnly disabled/></FormField>
            <FormField label="Part Number"><input className={inputClass + ' bg-slate-50'} value={newJobForm.partNo} readOnly disabled/></FormField>
            <FormField label="Target Quantity" required><input type="number" className={inputClass} value={newJobForm.qty} onChange={e => setNewJobForm({...newJobForm, qty: e.target.value})} /></FormField>
          </div>

          <div className="border-t border-slate-100 my-4 pt-4 font-semibold text-slate-700">Schedule Details</div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Machine" required>
              <select className={inputClass} value={newJobForm.machine} onChange={e => setNewJobForm({...newJobForm, machine: e.target.value})}>
                <option value="">-- Select Machine --</option>
                {machines.map(m => (
                  <option key={m.id} value={m.code}>{m.code} - {m.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Operator">
              <select className={inputClass} value={newJobForm.operator} onChange={e => setNewJobForm({...newJobForm, operator: e.target.value})}>
                <option value="">-- Select Operator --</option>
                {operators.map(o => (
                  <option key={o.id} value={o.name}>{o.name} ({o.role})</option>
                ))}
              </select>
            </FormField>
            <FormField label="Start Date" required><input type="date" className={inputClass} value={newJobForm.date} onChange={e => setNewJobForm({...newJobForm, date: e.target.value})} /></FormField>
            <FormField label="Start Time" required><input type="time" className={inputClass} value={newJobForm.startTime} onChange={e => setNewJobForm({...newJobForm, startTime: e.target.value})} /></FormField>
            <FormField label="Est. Cycle Time (mins)"><input type="number" className={inputClass} value={newJobForm.cycleTime} onChange={e => setNewJobForm({...newJobForm, cycleTime: e.target.value})} /></FormField>
          </div>
        </div>
      </Modal>

    </div>
  );
}
`;

content = content.replace(/    <\/div>\n  \);\n}\n/g, modalJSX);

fs.writeFileSync('src/pages/production/unified/SchedulingPage.tsx', content);
