import fs from 'fs';

const code = `import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, statusToVariant } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Package, Search, Eye, Edit, Filter, Plus, Download, ChevronLeft, ChevronRight, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/Card';
import { Modal, FormField, inputClass } from '@/components/ui/Modal';

export function FinishedGoodsPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState('All Projects');
  const [customerFilter, setCustomerFilter] = useState('All Customers');
  const [statusFilter, setStatusFilter] = useState('All');
  
  // Modals state
  const [showAddFG, setShowAddFG] = useState(false);
  const [showViewModal, setShowViewModal] = useState<any | null>(null);

  // Add FG Form state
  const [availableWOs, setAvailableWOs] = useState<any[]>([]);
  const [selectedWO, setSelectedWO] = useState('');
  const [addQty, setAddQty] = useState('');
  
  const [stats, setStats] = useState({
    totalParts: 0,
    completedQty: 0,
    pendingQty: 0,
    totalFgStock: 0
  });

  const fetchData = async () => {
    setLoading(true);
    
    // Fetch production records
    const { data: woData } = await supabase
      .from('cnc_work_orders')
      .select('*')
      .order('created_at', { ascending: false });

    // Fetch part stock for FG stock
    const { data: partsData } = await supabase.from('cnc_parts').select('part_no, stock_qty');
    
    if (woData) {
      // Map and enrich with stock
      const enriched = woData.map((wo: any) => {
        const part = partsData?.find(p => p.part_no === wo.part_no);
        const orderedQty = Number(wo.quantity) || 0;
        const completedQty = Number(wo.completed) || 0;
        const pendingQty = Math.max(0, orderedQty - completedQty);
        const fgStock = part ? Number(part.stock_qty) || 0 : 0;
        
        return {
          ...wo,
          orderedQty,
          completedQty,
          pendingQty,
          fgStock
        };
      });

      setRecords(enriched);

      const activeItems = new Set(enriched.map(e => e.part_no)).size;
      const totalComp = enriched.reduce((sum, e) => sum + e.completedQty, 0);
      const totalPend = enriched.reduce((sum, e) => sum + e.pendingQty, 0);
      const totalStock = partsData ? partsData.reduce((sum, p) => sum + (Number(p.stock_qty)||0), 0) : 0;

      setStats({
        totalParts: activeItems,
        completedQty: totalComp,
        pendingQty: totalPend,
        totalFgStock: totalStock
      });

      // Filter for Add FG modal (only In Progress or Planned that are not fully completed)
      setAvailableWOs(enriched.filter(w => w.pendingQty > 0));
    }
    
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleStatusChange = async (order: any, newStatus: string) => {
    if (order.status === newStatus) return;
    try {
      const { error } = await supabase.from('cnc_work_orders').update({ status: newStatus }).eq('id', order.id);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert("Failed to update status: " + err.message);
    }
  };

  const handleSaveFG = async () => {
    if (!selectedWO || !addQty) return;
    const wo = availableWOs.find(w => w.id === selectedWO);
    if (!wo) return;

    const qtyToAdd = Number(addQty);
    if (qtyToAdd <= 0) return alert("Quantity must be greater than zero.");
    if (qtyToAdd > wo.pendingQty) return alert(\`Cannot add more than pending quantity (\${wo.pendingQty}).\`);

    const newCompleted = wo.completedQty + qtyToAdd;
    let newStatus = wo.status;
    if (newCompleted >= wo.orderedQty) newStatus = 'Completed';
    else if (newStatus === 'Planned') newStatus = 'In Progress';

    const { error } = await supabase.from('cnc_work_orders').update({ 
      completed: newCompleted,
      status: newStatus
    }).eq('id', wo.id);

    if (error) {
      alert("Failed to update Finished Goods: " + error.message);
    } else {
      setShowAddFG(false);
      setSelectedWO('');
      setAddQty('');
      fetchData();
    }
  };

  const filteredRecords = records.filter(r => {
    const matchesSearch = (r.part_no?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                          (r.part_name?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    const matchesProject = projectFilter === 'All Projects' || r.sales_order === projectFilter;
    const matchesCustomer = customerFilter === 'All Customers' || r.customer === customerFilter;
    const matchesStatus = statusFilter === 'All' || r.status === statusFilter;
    return matchesSearch && matchesProject && matchesCustomer && matchesStatus;
  });

  const columns: Column<any>[] = [
    { 
      key: 'part_no', 
      label: 'Part No', 
      render: (r) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
            <Package size={16} className="text-slate-400" />
          </div>
          <span className="font-semibold text-slate-700 whitespace-nowrap">{r.part_no || 'N/A'}</span>
        </div>
      )
    },
    { key: 'part_name', label: 'Part Name', render: (r) => <span className="text-slate-600 whitespace-nowrap">{r.part_name || 'N/A'}</span> },
    { 
      key: 'project', 
      label: 'Project',
      render: (r) => (
        <div className="min-w-[120px]">
          <div className="font-medium text-slate-700">{r.sales_order || 'N/A'}</div>
          <div className="text-xs text-slate-500 truncate max-w-[150px]">{r.description || 'Assembly'}</div>
        </div>
      )
    },
    { key: 'customer', label: 'Customer', render: (r) => <span className="text-slate-600 min-w-[100px] block">{r.customer || 'N/A'}</span> },
    { key: 'orderedQty', label: 'Ordered Qty', sortable: true, render: (r) => <span className="text-slate-700">{r.orderedQty}</span> },
    { 
      key: 'completedQty', 
      label: 'Completed Qty', 
      sortable: true,
      render: (r) => {
        const percent = r.orderedQty > 0 ? Math.min(100, Math.round((r.completedQty / r.orderedQty) * 100)) : 0;
        return (
          <div className="flex flex-col gap-1 min-w-[100px]">
            <div className="flex justify-between items-end">
              <span className="font-bold text-slate-800">{r.completedQty}</span>
              <span className="text-[10px] text-slate-500 font-medium">{percent}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: \`\${percent}%\` }} />
            </div>
          </div>
        );
      }
    },
    { 
      key: 'pendingQty', 
      label: 'Pending Qty', 
      sortable: true,
      render: (r) => <span className={\`font-medium \${r.pendingQty > 0 ? 'text-rose-500' : 'text-emerald-500'}\`}>{r.pendingQty}</span>
    },
    { key: 'fgStock', label: 'FG Stock', sortable: true, render: (r) => <span className="text-slate-700">{r.fgStock}</span> },
    { 
      key: 'status', 
      label: 'Status', 
      sortable: true,
      render: (r) => (
        <div className="relative inline-block min-w-[100px] text-center">
          <select 
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            value={r.status}
            onChange={(e) => handleStatusChange(r, e.target.value)}
          >
            <option value="Planned">Planned</option>
            <option value="Processing">Processing</option>
            <option value="In Production">In Production</option>
            <option value="Completed">Completed</option>
            <option value="Ready">Ready</option>
            <option value="Quality Hold">Quality Hold</option>
            <option value="Not Started">Not Started</option>
          </select>
          <Badge variant={statusToVariant(r.status)} dot>{r.status}</Badge>
        </div>
      )
    },
    { 
      key: 'last_updated', 
      label: 'Last Updated', 
      render: (r) => <span className="text-slate-500 text-sm whitespace-nowrap">{r.updated_at ? new Date(r.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}</span>
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (r) => (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => setShowViewModal(r)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Eye size={15} /></button>
          <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit size={15} /></button>
        </div>
      )
    }
  ];

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Finished Goods</h1>
          <p className="text-sm text-slate-500 mt-1">Track completed products, pending quantity and stock at a glance.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" className="gap-2 bg-white"><Filter size={16} /> Stock Report</Button>
          <Button variant="secondary" className="gap-2 bg-white"><Download size={16} /> Export</Button>
          <Button variant="primary" className="gap-2 bg-brand-600 hover:bg-brand-700 text-white shadow-sm shadow-brand-500/20" onClick={() => setShowAddFG(true)}>
            <Plus size={16} /> Add Finished Goods
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Total Parts */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <Package className="text-emerald-600" size={24} />
          </div>
          <div>
            <div className="text-sm text-slate-500 font-medium">Total Parts</div>
            <div className="text-2xl font-bold text-slate-800">{stats.totalParts}</div>
            <div className="text-xs text-slate-400 mt-0.5">Active FG Items</div>
          </div>
        </div>
        {/* Completed Qty */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
            <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold">✓</div>
          </div>
          <div>
            <div className="text-sm text-slate-500 font-medium">Completed Qty</div>
            <div className="text-2xl font-bold text-slate-800">{stats.completedQty.toLocaleString()}</div>
            <div className="text-xs text-slate-400 mt-0.5">This Month</div>
          </div>
        </div>
        {/* Pending Qty */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
            <div className="w-5 h-6 border-2 border-orange-500 rounded-sm relative flex flex-col justify-between p-0.5">
              <div className="w-full h-[2px] bg-orange-500" />
              <div className="w-full h-[2px] bg-orange-500" />
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-500 font-medium">Pending Qty</div>
            <div className="text-2xl font-bold text-slate-800">{stats.pendingQty.toLocaleString()}</div>
            <div className="text-xs text-slate-400 mt-0.5">Yet to Complete</div>
          </div>
        </div>
        {/* Total FG Stock */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Package className="text-purple-600" size={24} />
          </div>
          <div>
            <div className="text-sm text-slate-500 font-medium">Total FG Stock</div>
            <div className="text-2xl font-bold text-slate-800">{stats.totalFgStock.toLocaleString()}</div>
            <div className="text-xs text-slate-400 mt-0.5">In Hand</div>
          </div>
        </div>
      </div>

      {/* Filters & Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        {/* Filters */}
        <div className="p-4 border-b border-slate-100 grid grid-cols-1 md:grid-cols-5 gap-4 bg-white items-end">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Project</label>
            <select 
              className="w-full h-9 rounded-lg border border-slate-200 text-sm px-3 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
              value={projectFilter}
              onChange={e => setProjectFilter(e.target.value)}
            >
              <option value="All Projects">All Projects</option>
              {Array.from(new Set(records.map(r => r.sales_order).filter(Boolean))).map(p => (
                <option key={p as string} value={p as string}>{p as string}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Customer</label>
            <select 
              className="w-full h-9 rounded-lg border border-slate-200 text-sm px-3 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
              value={customerFilter}
              onChange={e => setCustomerFilter(e.target.value)}
            >
              <option value="All Customers">All Customers</option>
              {Array.from(new Set(records.map(r => r.customer).filter(Boolean))).map(c => (
                <option key={c as string} value={c as string}>{c as string}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Part Name / Part No</label>
            <input 
              type="text" 
              placeholder="Search..."
              className="w-full h-9 rounded-lg border border-slate-200 text-sm px-3 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Status</label>
            <select 
              className="w-full h-9 rounded-lg border border-slate-200 text-sm px-3 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="All">All Statuses</option>
              <option value="In Production">In Production</option>
              <option value="Completed">Completed</option>
              <option value="Processing">Processing</option>
              <option value="Not Started">Not Started</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" className="h-9 flex-1 bg-brand-500 hover:bg-brand-600 text-white">Search</Button>
            <Button variant="secondary" className="h-9 flex-1 bg-white" onClick={() => {
              setSearchTerm(''); setProjectFilter('All Projects'); setCustomerFilter('All Customers'); setStatusFilter('All');
            }}>Clear</Button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <DataTable data={filteredRecords} columns={columns} loading={loading} />
        </div>
      </div>

      {/* Add Finished Goods Modal */}
      <Modal open={showAddFG} onClose={() => setShowAddFG(false)} title="Finished Goods Entry" size="md" footer={
        <>
          <Button variant="secondary" onClick={() => setShowAddFG(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSaveFG} disabled={!selectedWO || !addQty}>Save</Button>
        </>
      }>
        <div className="space-y-4">
          <FormField label="Production Order" required>
            <select className={inputClass} value={selectedWO} onChange={e => {
              setSelectedWO(e.target.value);
              const w = availableWOs.find(wo => wo.id === e.target.value);
              if (w) setAddQty(w.pendingQty.toString());
            }}>
              <option value="">Select Production Order...</option>
              {availableWOs.map(w => (
                <option key={w.id} value={w.id}>{w.wo_no} - {w.part_name} ({w.pendingQty} pending)</option>
              ))}
            </select>
          </FormField>
          
          {selectedWO && (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-sm text-slate-600 space-y-2">
              <div className="flex justify-between"><span>Customer:</span> <span className="font-medium text-slate-800">{availableWOs.find(w=>w.id===selectedWO)?.customer}</span></div>
              <div className="flex justify-between"><span>Project:</span> <span className="font-medium text-slate-800">{availableWOs.find(w=>w.id===selectedWO)?.sales_order}</span></div>
              <div className="flex justify-between"><span>Target Qty:</span> <span className="font-medium text-slate-800">{availableWOs.find(w=>w.id===selectedWO)?.orderedQty}</span></div>
              <div className="flex justify-between"><span>Completed Qty:</span> <span className="font-medium text-slate-800">{availableWOs.find(w=>w.id===selectedWO)?.completedQty}</span></div>
            </div>
          )}

          <FormField label="Quantity to Complete" required>
            <input 
              type="number" 
              className={inputClass} 
              value={addQty} 
              onChange={e => setAddQty(e.target.value)} 
              max={availableWOs.find(w=>w.id===selectedWO)?.pendingQty}
              min="1"
            />
          </FormField>
        </div>
      </Modal>

      {/* Detail View Modal */}
      <Modal open={!!showViewModal} onClose={() => setShowViewModal(null)} title={\`Finished Goods: \${showViewModal?.wo_no}\`} size="2xl">
        {showViewModal && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Part Details</label>
                <div className="text-sm font-semibold text-slate-800">{showViewModal.part_no}</div>
                <div className="text-sm text-slate-600">{showViewModal.part_name}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Customer / Project</label>
                <div className="text-sm font-semibold text-slate-800">{showViewModal.customer}</div>
                <div className="text-sm text-slate-600">{showViewModal.sales_order}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
                <Badge variant={statusToVariant(showViewModal.status)} dot>{showViewModal.status}</Badge>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
               <div>
                 <div className="text-xs text-slate-500">Ordered Qty</div>
                 <div className="text-lg font-bold text-slate-800">{showViewModal.orderedQty}</div>
               </div>
               <div>
                 <div className="text-xs text-slate-500">Completed Qty</div>
                 <div className="text-lg font-bold text-emerald-600">{showViewModal.completedQty}</div>
               </div>
               <div>
                 <div className="text-xs text-slate-500">Pending Qty</div>
                 <div className="text-lg font-bold text-rose-500">{showViewModal.pendingQty}</div>
               </div>
               <div>
                 <div className="text-xs text-slate-500">FG Stock</div>
                 <div className="text-lg font-bold text-purple-600">{showViewModal.fgStock}</div>
               </div>
            </div>

            {/* Document Flow Visualization */}
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-3 border-b border-slate-100 pb-2">Document Flow</h3>
              <div className="flex items-center justify-between px-2 text-center text-xs">
                 <div className="flex flex-col items-center gap-1 opacity-50">
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center"><CheckCircle size={14}/></div>
                    <span>Sales Order<br/><span className="text-[10px] font-mono">{showViewModal.sales_order}</span></span>
                 </div>
                 <div className="h-px bg-slate-200 flex-1 mx-2" />
                 <div className="flex flex-col items-center gap-1 opacity-50">
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center"><CheckCircle size={14}/></div>
                    <span>Production<br/><span className="text-[10px] font-mono">{showViewModal.wo_no}</span></span>
                 </div>
                 <div className="h-px bg-slate-200 flex-1 mx-2" />
                 <div className="flex flex-col items-center gap-1">
                    <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center border-2 border-brand-500"><CheckCircle size={14}/></div>
                    <span className="font-bold text-brand-700">Finished Goods</span>
                 </div>
                 <div className="h-px bg-slate-200 flex-1 mx-2" />
                 <div className="flex flex-col items-center gap-1 opacity-50">
                    <div className="w-8 h-8 rounded-full border border-dashed border-slate-300 flex items-center justify-center"><Clock size={14} className="text-slate-400"/></div>
                    <span>Delivery<br/><span className="text-[10px] text-slate-400">Not Created</span></span>
                 </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 pt-4">
               <Button variant="secondary">View Production</Button>
               <Button variant="primary">Create Delivery Challan</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
`;

fs.writeFileSync('src/pages/production/unified/FinishedGoodsPage.tsx', code);
