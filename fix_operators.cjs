const fs = require('fs');

let content = fs.readFileSync('src/pages/production/unified/SchedulingPage.tsx', 'utf8');

// 1. Remove hardcoded operators and add isNewOperator state
content = content.replace(
  /const \[operators, setOperators\] = useState<any\[\]>\(\[\{ id: 'OP-1'.*?\]\);/,
  `const [operators, setOperators] = useState<any[]>([]);\n  const [isNewOperator, setIsNewOperator] = useState(false);`
);

// 2. Update fetchData to derive unique operators from jobs
const fetchRegex = /setJobs\(jobsRes\.data \|\| \[\]\);\n\s*const woRes = await supabase.from\('cnc_work_orders'\)/;
const fetchReplacement = `const jobsData = jobsRes.data || [];
      setJobs(jobsData);
      
      // Derive unique operators from existing jobs
      const uniqueOps = Array.from(new Set(jobsData.map((j: any) => j.operator).filter(Boolean)));
      setOperators(uniqueOps.map((op: any, i) => ({ id: \`OP-\${i}\`, name: op, role: 'Operator', status: 'Available' })));
      
      const woRes = await supabase.from('cnc_work_orders')`;
content = content.replace(fetchRegex, fetchReplacement);

// 3. Update the Modal's Operator FormField
const oldOperatorField = `<FormField label="Operator">
              <select className={inputClass} value={newJobForm.operator} onChange={e => setNewJobForm({...newJobForm, operator: e.target.value})}>
                <option value="">-- Select Operator --</option>
                {operators.map(o => (
                  <option key={o.id} value={o.name}>{o.name} ({o.role})</option>
                ))}
              </select>
            </FormField>`;

const newOperatorField = `<FormField label="Operator">
              {isNewOperator ? (
                <div className="flex items-center gap-2">
                  <input 
                    autoFocus
                    type="text" 
                    className={inputClass} 
                    placeholder="Enter new operator name" 
                    value={newJobForm.operator} 
                    onChange={e => setNewJobForm({...newJobForm, operator: e.target.value})} 
                  />
                  <button type="button" className="text-xs font-medium text-slate-500 hover:text-slate-800 shrink-0 px-2 py-1 bg-slate-100 rounded" onClick={() => { setIsNewOperator(false); setNewJobForm({...newJobForm, operator: ''}); }}>Cancel</button>
                </div>
              ) : (
                <select className={inputClass} value={newJobForm.operator} onChange={e => {
                  if (e.target.value === 'ADD_NEW') {
                    setIsNewOperator(true);
                    setNewJobForm({...newJobForm, operator: ''});
                  } else {
                    setNewJobForm({...newJobForm, operator: e.target.value});
                  }
                }}>
                  <option value="">-- Select Operator --</option>
                  {operators.map(o => (
                    <option key={o.id} value={o.name}>{o.name}</option>
                  ))}
                  <option value="ADD_NEW" className="font-bold text-brand-600 bg-brand-50">+ Add New Operator...</option>
                </select>
              )}
            </FormField>`;

content = content.replace(oldOperatorField, newOperatorField);

fs.writeFileSync('src/pages/production/unified/SchedulingPage.tsx', content);
