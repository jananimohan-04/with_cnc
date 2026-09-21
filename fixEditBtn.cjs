const fs = require('fs');

let content = fs.readFileSync('src/pages/production/unified/FinishedGoodsPage.tsx', 'utf8');

// We need to add state for editing
const stateAdd = `
  const [showAddFG, setShowAddFG] = useState(false);
  const [showViewModal, setShowViewModal] = useState<any | null>(null);
  
  // NEW STATE FOR EDIT
  const [showEditModal, setShowEditModal] = useState<any | null>(null);
  const [editQty, setEditQty] = useState('');
`;

content = content.replace(
  `  const [showAddFG, setShowAddFG] = useState(false);\n  const [showViewModal, setShowViewModal] = useState<any | null>(null);`,
  stateAdd
);

// Update Edit button onClick
content = content.replace(
  `<button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit size={15} /></button>`,
  `<button onClick={() => { setShowEditModal(r); setEditQty(r.completedQty.toString()); }} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit size={15} /></button>`
);

// Add handleEdit function
const funcAdd = `
  const handleEditFG = async () => {
    if (!showEditModal) return;
    const newQty = Number(editQty);
    if (newQty < 0) return alert("Quantity cannot be negative.");
    if (newQty > showEditModal.orderedQty) return alert("Completed quantity cannot exceed target ordered quantity.");

    let newStatus = showEditModal.status;
    if (newQty >= showEditModal.orderedQty) newStatus = 'Completed';
    else if (newQty > 0 && newStatus === 'Planned') newStatus = 'In Progress';

    const { error } = await supabase.from('cnc_work_orders').update({
      completed: newQty,
      status: newStatus
    }).eq('id', showEditModal.id);

    if (error) {
      alert("Failed to update Finished Goods: " + error.message);
    } else {
      setShowEditModal(null);
      setEditQty('');
      fetchData();
    }
  };

  const filteredRecords = records.filter(r => {`;

content = content.replace(`  const filteredRecords = records.filter(r => {`, funcAdd);

// Add Edit Modal JSX at the bottom before final </div>
const modalAdd = `
      {/* Edit Finished Goods Modal */}
      <Modal open={!!showEditModal} onClose={() => setShowEditModal(null)} title="Edit Finished Goods" size="md" footer={
        <>
          <Button variant="secondary" onClick={() => setShowEditModal(null)}>Cancel</Button>
          <Button variant="primary" onClick={handleEditFG} disabled={!editQty}>Save Changes</Button>
        </>
      }>
        {showEditModal && (
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-sm text-slate-600 space-y-2">
              <div className="flex justify-between"><span>Production Order:</span> <span className="font-medium text-slate-800">{showEditModal.wo_no}</span></div>
              <div className="flex justify-between"><span>Part:</span> <span className="font-medium text-slate-800">{showEditModal.part_no} - {showEditModal.part_name}</span></div>
              <div className="flex justify-between"><span>Target Qty:</span> <span className="font-medium text-slate-800">{showEditModal.orderedQty}</span></div>
            </div>

            <FormField label="Update Completed Quantity" required>
              <input 
                type="number" 
                className={inputClass} 
                value={editQty} 
                onChange={e => setEditQty(e.target.value)} 
                max={showEditModal.orderedQty}
                min="0"
              />
            </FormField>
          </div>
        )}
      </Modal>
    </div>
  );
}
`;

content = content.replace(`    </div>\n  );\n}\n`, modalAdd);

fs.writeFileSync('src/pages/production/unified/FinishedGoodsPage.tsx', content);
