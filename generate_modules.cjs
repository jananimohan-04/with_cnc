const fs = require('fs');
const path = require('path');

const modules = [
  {
    name: 'SalesOrderModule',
    title: 'Sales Orders',
    desc: 'Manage confirmed sales orders',
    table: 'cnc_sales_orders',
    idField: 'order_no',
    dateField: 'order_date',
    stage: 'SALES ORDER',
    nextAction: 'Create Inward',
    fields: [
      { label: 'Order No', key: 'order_no' },
      { label: 'Customer', key: 'customer' },
      { label: 'Part Name', key: 'part_name' },
      { label: 'Quantity', key: 'quantity' },
      { label: 'Total Value', key: 'total_value' },
      { label: 'Delivery Date', key: 'delivery_date' },
      { label: 'Status', key: 'status' }
    ]
  },
  {
    name: 'InwardModule',
    title: 'Inwards',
    desc: 'Manage raw materials inward',
    table: 'cnc_inwards',
    idField: 'inward_no',
    dateField: 'inward_date',
    stage: 'INWARD',
    nextAction: 'Create Work Order',
    fields: [
      { label: 'Inward No', key: 'inward_no' },
      { label: 'Party', key: 'party_name' },
      { label: 'Part Name', key: 'part_name' },
      { label: 'Quantity', key: 'quantity' },
      { label: 'Status', key: 'status' }
    ]
  },
  {
    name: 'FinishedGoodsModule',
    title: 'Finished Goods',
    desc: 'Manage completed production goods',
    table: 'cnc_work_orders',
    idField: 'wo_no',
    dateField: 'updated_at',
    stage: 'FINISHED GOODS',
    nextAction: 'Create DC',
    fields: [
      { label: 'Work Order', key: 'wo_no' },
      { label: 'Customer', key: 'customer' },
      { label: 'Part Name', key: 'part_name' },
      { label: 'Completed Qty', key: 'completed' },
      { label: 'Status', key: 'status' }
    ],
    filter: ".or('status.eq.Completed,completed.gt.0')"
  },
  {
    name: 'DeliveryChallanModule',
    title: 'Delivery Challans',
    desc: 'Manage dispatches and deliveries',
    table: 'cnc_deliveries',
    idField: 'delivery_no',
    dateField: 'delivery_date',
    stage: 'DELIVERY CHALLAN',
    nextAction: 'Create Invoice',
    fields: [
      { label: 'DC No', key: 'delivery_no' },
      { label: 'Customer', key: 'customer_name' },
      { label: 'Part Name', key: 'part_name' },
      { label: 'Quantity', key: 'quantity' },
      { label: 'Status', key: 'status' }
    ]
  },
  {
    name: 'InvoiceModule',
    title: 'Invoices',
    desc: 'Manage final billing',
    table: 'cnc_invoices',
    idField: 'invoice_no',
    dateField: 'invoice_date',
    stage: 'INVOICE',
    nextAction: null,
    fields: [
      { label: 'Invoice No', key: 'invoice_no' },
      { label: 'Customer', key: 'customer_name' },
      { label: 'Part Name', key: 'part_name' },
      { label: 'Quantity', key: 'quantity' },
      { label: 'Amount', key: 'amount' },
      { label: 'Status', key: 'status' }
    ]
  }
];

modules.forEach(mod => {
  const code = 
`import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Filter, Calendar, List, Kanban as KanbanIcon, ArrowLeft, FileText } from 'lucide-react';
import { Modal, FormField, inputClass } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Card';

export function ${mod.name}({ onBack }: { onBack: () => void }) {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'calendar'>('list');
  
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    let query = supabase.from('${mod.table}').select('*');
    if (${mod.filter ? 'true' : 'false'}) {
      query = supabase.from('${mod.table}').select('*')${mod.filter || ''};
    }
    const { data } = await query.order('created_at', { ascending: false });
    if (data) setRecords(data);
    setLoading(false);
  };

  const openRecord = async (record: any) => {
    setSelectedRecord(record);
  };

  const filteredRecords = records.filter(r => 
    (r.${mod.idField} || '').toLowerCase().includes(search.toLowerCase()) || 
    (r.${mod.fields[1].key} || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full min-h-[500px]">
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 hover:bg-slate-200 rounded-md transition-colors text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-800">${mod.title}</h2>
            <p className="text-xs text-slate-500">${mod.desc}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-brand-500"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div></div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                ${mod.fields.map(f => '<th className="p-3 font-semibold">' + f.label + '</th>').join('\n                ')}
                <th className="p-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map(record => (
                <tr key={record.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  ${mod.fields.map((f, i) => '<td className="p-3 text-sm ' + (i === 0 ? 'font-mono font-medium text-slate-800' : (i === 1 ? 'font-semibold text-brand-700' : 'text-slate-700')) + '">{record.' + f.key + ' || (record.party_name && \'' + f.key + '\' === \'customer_name\' ? record.party_name : \'-\')}</td>').join('\n                  ')}
                  <td className="p-3">
                    <Button variant="secondary" size="sm" onClick={() => openRecord(record)}>View Details</Button>
                  </td>
                </tr>
              ))}
              {filteredRecords.length === 0 && (
                <tr><td colSpan={${mod.fields.length + 1}} className="text-center py-8 text-slate-500">No records found.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!selectedRecord} onClose={() => setSelectedRecord(null)} title={'${mod.title} Details: ' + (selectedRecord?.${mod.idField} || 'Pending')} size="3xl" footer={
        <div className="flex justify-between w-full">
          <div>
             ${mod.nextAction ? '<Button onClick={() => alert(\'Development Note: Conversion logic will go here.\')} className="bg-emerald-600 hover:bg-emerald-700 text-white">' + mod.nextAction + '</Button>' : ''}
          </div>
          <Button onClick={() => setSelectedRecord(null)}>Close</Button>
        </div>
      }>
        {selectedRecord && (
          <div className="flex gap-6">
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                ${mod.fields.map(f => '<FormField label="' + f.label + '"><input className={inputClass} value={selectedRecord.' + f.key + ' || selectedRecord.party_name || \'\'} disabled /></FormField>').join('\n                ')}
              </div>
            </div>

            <div className="w-64 bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col h-full">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 border-b border-slate-200 pb-2"><FileText className="w-4 h-4 text-brand-600"/> DOCUMENT FLOW</h3>
              
              <div className="flex flex-col space-y-0 relative pl-4">
                <div className="absolute left-6 top-4 bottom-4 w-0.5 bg-slate-200 z-0"></div>

                <FlowStep active={false} title="ENQUIRY" subtitle={selectedRecord.lead_no || selectedRecord.enquiry_no || 'Linked'} isFirst />
                <FlowStep active={false} title="QUOTATION" subtitle={selectedRecord.quote_no || 'Linked'} />
                <FlowStep active={'SALES ORDER' === '${mod.stage}'} highlight={'SALES ORDER' === '${mod.stage}'} title="SALES ORDER" subtitle={'SALES ORDER' === '${mod.stage}' ? selectedRecord.${mod.idField} : (selectedRecord.sales_order_no || 'Linked')} />
                <FlowStep active={'INWARD' === '${mod.stage}'} highlight={'INWARD' === '${mod.stage}'} title="INWARD" subtitle={'INWARD' === '${mod.stage}' ? selectedRecord.${mod.idField} : 'Linked'} />
                <FlowStep active={'PRODUCTION' === '${mod.stage}'} highlight={'PRODUCTION' === '${mod.stage}'} title="PRODUCTION" subtitle={'PRODUCTION' === '${mod.stage}' ? selectedRecord.${mod.idField} : 'Linked'} />
                <FlowStep active={'FINISHED GOODS' === '${mod.stage}'} highlight={'FINISHED GOODS' === '${mod.stage}'} title="FINISHED GOODS" subtitle={'FINISHED GOODS' === '${mod.stage}' ? selectedRecord.${mod.idField} : 'Linked'} />
                <FlowStep active={'DELIVERY CHALLAN' === '${mod.stage}'} highlight={'DELIVERY CHALLAN' === '${mod.stage}'} title="DELIVERY CHALLAN" subtitle={'DELIVERY CHALLAN' === '${mod.stage}' ? selectedRecord.${mod.idField} : 'Linked'} />
                <FlowStep active={'INVOICE' === '${mod.stage}'} highlight={'INVOICE' === '${mod.stage}'} title="INVOICE" subtitle={'INVOICE' === '${mod.stage}' ? selectedRecord.${mod.idField} : 'Linked'} isLast />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function FlowStep({ active, highlight, title, subtitle, isFirst, isLast }: { active: boolean, highlight?: boolean, title: string, subtitle: string, isFirst?: boolean, isLast?: boolean }) {
  return (
    <div className="relative z-10 flex items-start gap-3 py-3">
      <div className={"mt-1 w-4 h-4 rounded-full border-2 flex-shrink-0 " + (highlight ? 'bg-brand-500 border-brand-500' : (active ? 'bg-white border-brand-400' : 'bg-white border-slate-300'))}></div>
      <div>
        <div className={"font-bold text-[11px] uppercase tracking-wider " + (highlight ? 'text-brand-700' : (active ? 'text-slate-600' : 'text-slate-400'))}>{title}</div>
        <div className={"text-[10px] font-mono " + (highlight ? 'text-slate-700' : 'text-slate-400')}>{subtitle}</div>
      </div>
    </div>
  );
}
`;
  fs.writeFileSync(path.join(__dirname, 'src', 'pages', 'sales', mod.name + '.tsx'), code);
});
console.log('Generated successfully');
