import React, { useState } from 'react';
import { Search, Download, Eye, Edit2, MoreVertical } from 'lucide-react';
import { KanbanCard } from './SalesPipelinePage';

interface PipelineListViewProps {
  cards: KanbanCard[];
  onView: (card: KanbanCard) => void;
}

export function PipelineListView({ cards, onView }: PipelineListViewProps) {
  const [search, setSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [processFilter, setProcessFilter] = useState('All');
  const [assignedFilter, setAssignedFilter] = useState('All');

  const customers = Array.from(new Set(cards.map(c => c.customer))).filter(Boolean).sort();
  const statuses = Array.from(new Set(cards.map(c => c.status || c.stage))).filter(Boolean).sort();
  
  // Try to extract process from raw data, fallback to stage
  const getProcess = (c: KanbanCard) => c.raw?.process || c.raw?.category || c.stage;
  const processes = Array.from(new Set(cards.map(getProcess))).filter(Boolean).sort();
  
  const getAssigned = (c: KanbanCard) => c.raw?.contact_person || c.raw?.salesperson || 'Unassigned';
  const assignees = Array.from(new Set(cards.map(getAssigned))).filter(Boolean).sort();

  const filteredCards = cards.filter(c => {
    const matchesSearch = !search || 
      (c.refNo || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.customer || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.part || '').toLowerCase().includes(search.toLowerCase());
      
    const matchesCustomer = customerFilter === 'All' || c.customer === customerFilter;
    const matchesStatus = statusFilter === 'All' || (c.status || c.stage) === statusFilter;
    const matchesProcess = processFilter === 'All' || getProcess(c) === processFilter;
    const matchesAssigned = assignedFilter === 'All' || getAssigned(c) === assignedFilter;

    return matchesSearch && matchesCustomer && matchesStatus && matchesProcess && matchesAssigned;
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full min-h-[500px]">
      <div className="p-4 border-b border-slate-200 flex flex-wrap gap-3 items-center bg-slate-50">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search enquiries, parts..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-brand-500"
          />
        </div>
        
        <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)} className="border border-slate-300 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-brand-500">
          <option value="All">All Customers</option>
          {customers.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-slate-300 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-brand-500">
          <option value="All">All Statuses</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        
        <select value={processFilter} onChange={e => setProcessFilter(e.target.value)} className="border border-slate-300 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-brand-500">
          <option value="All">All Processes</option>
          {processes.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select value={assignedFilter} onChange={e => setAssignedFilter(e.target.value)} className="border border-slate-300 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-brand-500 hidden xl:block">
          <option value="All">All Assigned</option>
          {assignees.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <button className="p-2 border border-slate-300 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors" title="Export">
          <Download className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse min-w-[1200px]">
          <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm">
            <tr className="text-slate-500 text-[11px] uppercase tracking-wider border-b border-slate-200">
              <th className="p-3 font-semibold">#</th>
              <th className="p-3 font-semibold">Enquiry No</th>
              <th className="p-3 font-semibold">Date</th>
              <th className="p-3 font-semibold">Customer</th>
              <th className="p-3 font-semibold">Part / Description</th>
              <th className="p-3 font-semibold">Process</th>
              <th className="p-3 font-semibold text-right">Qty</th>
              <th className="p-3 font-semibold text-right">Est. Value (₹)</th>
              <th className="p-3 font-semibold text-center">Status</th>
              <th className="p-3 font-semibold">Assigned To</th>
              <th className="p-3 font-semibold">Next Action</th>
              <th className="p-3 font-semibold">Remarks</th>
              <th className="p-3 font-semibold text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCards.map((card, index) => (
              <tr key={card.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors group">
                <td className="p-3 text-sm text-slate-400">{index + 1}</td>
                <td className="p-3 text-sm font-semibold text-brand-600 cursor-pointer" onClick={() => onView(card)}>{card.refNo}</td>
                <td className="p-3 text-sm text-slate-600 whitespace-nowrap">{card.date}</td>
                <td className="p-3 text-sm font-medium text-slate-800">{card.customer}</td>
                <td className="p-3 text-sm text-slate-700 max-w-[200px] truncate" title={card.part}>{card.part}</td>
                <td className="p-3 text-sm text-slate-600">{getProcess(card)}</td>
                <td className="p-3 text-sm text-slate-700 text-right font-medium">{card.qty}</td>
                <td className="p-3 text-sm text-slate-700 text-right font-mono">{card.value > 0 ? `₹${card.value.toLocaleString('en-IN')}` : '-'}</td>
                <td className="p-3 text-center">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    card.stage === 'Enquiry' ? 'bg-blue-100 text-blue-700' :
                    card.stage === 'Quotation' ? 'bg-purple-100 text-purple-700' :
                    card.stage === 'Sales Order' ? 'bg-emerald-100 text-emerald-700' :
                    card.stage === 'Invoice' ? 'bg-indigo-100 text-indigo-700' :
                    'bg-slate-100 text-slate-700'
                  }`}>
                    {card.status || card.stage}
                  </span>
                </td>
                <td className="p-3 text-sm text-slate-600">{getAssigned(card)}</td>
                <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{card.raw?.next_action || '-'}</td>
                <td className="p-3 text-xs text-slate-500 max-w-[150px] truncate">{card.raw?.remarks || card.raw?.internal_remarks || '-'}</td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onView(card)} className="p-1 text-slate-400 hover:text-brand-600 transition-colors" title="View Details">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button className="p-1 text-slate-400 hover:text-amber-600 transition-colors" title="Edit">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredCards.length === 0 && (
              <tr>
                <td colSpan={13} className="p-8 text-center text-slate-500">
                  No records found matching your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
