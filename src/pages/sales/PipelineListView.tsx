import React, { useState } from 'react';
import { Search, Download, Eye } from 'lucide-react';
import { KanbanCard } from './SalesPipelinePage';

interface PipelineListViewProps {
  cards: KanbanCard[];
  onView: (card: KanbanCard) => void;
}

export function PipelineListView({ cards, onView }: PipelineListViewProps) {
  const [search, setSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('All');
  const [stageFilter, setStageFilter] = useState('All');

  const customers = Array.from(new Set(cards.map(c => c.customer))).filter(Boolean).sort();

  // Pipeline stages, labelled exactly like the summary cards above the list.
  const STAGE_LABELS: Record<string, string> = {
    'Enquiry': 'Total Enquiries',
    'Quotation': 'Quotations',
    'Sales Order': 'Sales Orders',
    'Inward': 'Inward',
    'Finished Goods': 'Finished Goods',
    'DC': 'Delivery Challans',
    'Invoice': 'Invoices',
  };
  const stageOf = (c: KanbanCard) => STAGE_LABELS[c.stage] || c.stage;
  const stageOptions = ['Total Enquiries', 'Quotations', 'Sales Orders', 'Inward', 'Finished Goods', 'Delivery Challans', 'Invoices']
    .filter(label => cards.some(c => stageOf(c) === label));

  const filteredCards = cards.filter(c => {
    const matchesSearch = !search ||
      (c.refNo || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.customer || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.part || '').toLowerCase().includes(search.toLowerCase());

    const matchesCustomer = customerFilter === 'All' || c.customer === customerFilter;
    const matchesStage = stageFilter === 'All' || stageOf(c) === stageFilter;

    return matchesSearch && matchesCustomer && matchesStage;
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
          <option value="All">All Companies</option>
          {customers.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} className="border border-slate-300 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-brand-500">
          <option value="All">All Stages</option>
          {stageOptions.map(s => <option key={s} value={s}>{s}</option>)}
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
              <th className="p-3 font-semibold">Company</th>
              <th className="p-3 font-semibold">Products</th>
              <th className="p-3 font-semibold">Stage</th>
              <th className="p-3 font-semibold text-right">Qty</th>
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
                <td className="p-3 text-sm text-slate-600">{stageOf(card)}</td>
                <td className="p-3 text-sm text-slate-700 text-right font-medium">{card.qty}</td>
                <td className="p-3 text-xs text-slate-500 max-w-[150px] truncate">{card.raw?.remarks || card.raw?.internal_remarks || '-'}</td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onView(card)} className="p-1 text-slate-400 hover:text-brand-600 transition-colors" title="View Details">
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredCards.length === 0 && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-slate-500">
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
