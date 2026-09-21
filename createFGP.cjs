const fs = require('fs');

const code = `import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, statusToVariant } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Package, Search, Eye, Edit, Filter, Plus, ArrowDownToLine, Download } from 'lucide-react';
import { Button } from '@/components/ui/Card';

export function FinishedGoodsPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState('All Projects');
  const [customerFilter, setCustomerFilter] = useState('All Customers');
  const [statusFilter, setStatusFilter] = useState('All');
  
  const [stats, setStats] = useState({
    totalParts: 0,
    completedQty: 0,
    pendingQty: 0,
    totalFgStock: 0
  });

  const fetchData = async () => {
    setLoading(true);
    
    // Fetch production records that have some completion or are explicitly in FG related statuses
    const { data: woData, error: woError } = await supabase
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

      // Filter only those that have started production or completed
      // We will show all work orders but they act as Finished Goods tracking
      setRecords(enriched);

      // Calc stats
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
          <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center overflow-hidden">
            <Package size={16} className="text-slate-400" />
          </div>
          <span className="font-semibold text-slate-700">{r.part_no || 'N/A'}</span>
        </div>
      )
    },
    { key: 'part_name', label: 'Part Name', render: (r) => <span className="text-slate-600">{r.part_name || 'N/A'}</span> },
    { 
      key: 'project', 
      label: 'Project',
      render: (r) => (
        <div>
          <div className="font-medium text-slate-700">{r.sales_order || 'N/A'}</div>
          <div className="text-xs text-slate-500 truncate max-w-[150px]">{r.description || 'Assembly'}</div>
        </div>
      )
    },
    { key: 'customer', label: 'Customer', render: (r) => <span className="text-slate-600">{r.customer || 'N/A'}</span> },
    { key: 'orderedQty', label: 'Ordered Qty', sortable: true, render: (r) => <span className="text-slate-700">{r.orderedQty}</span> },
    { 
      key: 'completedQty', 
      label: 'Completed Qty', 
      sortable: true,
      render: (r) => {
        const percent = r.orderedQty > 0 ? Math.min(100, Math.round((r.completedQty / r.orderedQty) * 100)) : 0;
        return (
          <div className="flex flex-col gap-1 w-32">
            <div className="flex justify-between items-end">
              <span className="font-bold text-slate-800">{r.completedQty}</span>
              <span className="text-[10px] text-slate-500 font-medium">{percent}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-emerald-500 h-full rounded-full" style={{ width: \`\${percent}%\` }} />
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
        <div className="relative inline-block w-full text-center">
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
      render: (r) => <span className="text-slate-500 text-sm">{r.due_date ? new Date(r.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}</span>
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (r) => (
        <div className="flex items-center justify-center gap-1">
          <button className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Eye size={15} /></button>
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
          <Button variant="primary" className="gap-2 bg-brand-600 hover:bg-brand-700 text-white shadow-sm shadow-brand-500/20" onClick={() => alert("Add Finished Goods modal opening...")}>
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
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
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
        <DataTable data={filteredRecords} columns={columns} loading={loading} />
      </div>
    </div>
  );
}
`;

fs.writeFileSync('src/pages/production/unified/FinishedGoodsPage.tsx', code);
