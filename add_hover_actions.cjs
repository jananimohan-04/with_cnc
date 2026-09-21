const fs = require('fs');

let content = fs.readFileSync('src/pages/sales/SalesPipelinePage.tsx', 'utf8');

// 1. Inject Edit2 into lucide imports
content = content.replace(/import {([^}]+)} from 'lucide-react';/, "import { $1, Edit2 } from 'lucide-react';");

// 2. Inject handleDeleteCard
const getContactStringsIndex = content.indexOf('const getContactStrings = (form: any) => {');
const handleDeleteCardLogic = `  const handleDeleteCard = async (e: React.MouseEvent, card: KanbanCard) => {
    e.stopPropagation();
    if (!window.confirm(\`Are you sure you want to delete this \${card.type}?\`)) return;
    let table = '';
    if (card.type === 'lead') table = 'cnc_enquiries';
    if (card.type === 'quotation') table = 'cnc_quotations';
    if (card.type === 'order') table = 'cnc_sales_orders';
    if (card.type === 'inward') table = 'cnc_inwards';
    
    if (table) {
      setLoading(true);
      const { error } = await supabase.from(table).delete().eq('id', card.raw.id);
      if (error) alert("Error deleting: " + error.message);
      else fetchPipeline();
      setLoading(false);
    }
  };

  `;
content = content.slice(0, getContactStringsIndex) + handleDeleteCardLogic + content.slice(getContactStringsIndex);


// 3. Replace the View details span with the icons row
const oldViewDetails = `<span className="text-[10px] font-bold text-brand-600">View details -></span>`;
const newHoverActions = `<div className="flex items-center gap-3 z-20 relative">
                            <button onClick={(e) => { e.stopPropagation(); openViewModal(card); }} className="text-slate-400 hover:text-brand-600 transition-colors" title="View Details">
                              <Eye size={14} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setViewEditMode(true); openViewModal(card); }} className="text-slate-400 hover:text-blue-600 transition-colors" title="Inline Edit">
                              <Edit2 size={14} />
                            </button>
                            <button onClick={(e) => handleDeleteCard(e, card)} className="text-slate-400 hover:text-red-600 transition-colors" title="Delete">
                              <Trash2 size={14} />
                            </button>
                          </div>`;
content = content.replace(oldViewDetails, newHoverActions);

fs.writeFileSync('src/pages/sales/SalesPipelinePage.tsx', content);
