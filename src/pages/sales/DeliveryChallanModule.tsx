import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Filter, Calendar, List, Kanban as KanbanIcon, ArrowLeft, FileText } from 'lucide-react';
import { Modal, FormField, inputClass } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Card';

export function DeliveryChallanModule({ onBack }: { onBack: () => void }) {
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
    let query = supabase.from('cnc_deliveries').select('*');
    if (false) {
      query = supabase.from('cnc_deliveries').select('*');
    }
    const { data } = await query.order('created_at', { ascending: false });
    if (data) setRecords(data);
    setLoading(false);
  };

  const openRecord = async (record: any) => {
    setSelectedRecord(record);
  };

  const filteredRecords = records.filter(r => 
    (r.delivery_no || '').toLowerCase().includes(search.toLowerCase()) || 
    (r.customer_name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full min-h-[500px]">
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 hover:bg-slate-200 rounded-md transition-colors text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Delivery Challans</h2>
            <p className="text-xs text-slate-500">Manage dispatches and deliveries</p>
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
                <th className="p-3 font-semibold">DC No</th>
                <th className="p-3 font-semibold">Customer</th>
                <th className="p-3 font-semibold">Part Name</th>
                <th className="p-3 font-semibold">Quantity</th>
                <th className="p-3 font-semibold">Status</th>
                <th className="p-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map(record => (
                <tr key={record.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="p-3 text-sm font-mono font-medium text-slate-800">{record.delivery_no || (record.party_name && 'delivery_no' === 'customer_name' ? record.party_name : '-')}</td>
                  <td className="p-3 text-sm font-semibold text-brand-700">{record.customer_name || (record.party_name && 'customer_name' === 'customer_name' ? record.party_name : '-')}</td>
                  <td className="p-3 text-sm text-slate-700">{record.part_name || (record.party_name && 'part_name' === 'customer_name' ? record.party_name : '-')}</td>
                  <td className="p-3 text-sm text-slate-700">{record.quantity || (record.party_name && 'quantity' === 'customer_name' ? record.party_name : '-')}</td>
                  <td className="p-3 text-sm text-slate-700">{record.status || (record.party_name && 'status' === 'customer_name' ? record.party_name : '-')}</td>
                  <td className="p-3">
                    <Button variant="secondary" size="sm" onClick={() => openRecord(record)}>View Details</Button>
                  </td>
                </tr>
              ))}
              {filteredRecords.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-slate-500">No records found.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!selectedRecord} onClose={() => setSelectedRecord(null)} title={'Delivery Challans Details: ' + (selectedRecord?.delivery_no || 'Pending')} size="3xl" footer={
        <div className="flex justify-between w-full">
          <div>
             <Button onClick={() => alert('Development Note: Conversion logic will go here.')} className="bg-emerald-600 hover:bg-emerald-700 text-white">Create Invoice</Button>
          </div>
          <Button onClick={() => setSelectedRecord(null)}>Close</Button>
        </div>
      }>
        {selectedRecord && (
          <div className="flex gap-6">
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="DC No"><input className={inputClass} value={selectedRecord.delivery_no || selectedRecord.party_name || ''} disabled /></FormField>
                <FormField label="Customer"><input className={inputClass} value={selectedRecord.customer_name || selectedRecord.party_name || ''} disabled /></FormField>
                <FormField label="Part Name"><input className={inputClass} value={selectedRecord.part_name || selectedRecord.party_name || ''} disabled /></FormField>
                <FormField label="Quantity"><input className={inputClass} value={selectedRecord.quantity || selectedRecord.party_name || ''} disabled /></FormField>
                <FormField label="Status"><input className={inputClass} value={selectedRecord.status || selectedRecord.party_name || ''} disabled /></FormField>
              </div>
            </div>

            <div className="w-64 bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col h-full">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 border-b border-slate-200 pb-2"><FileText className="w-4 h-4 text-brand-600"/> DOCUMENT FLOW</h3>
              
              <div className="flex flex-col space-y-0 relative pl-4">
                <div className="absolute left-6 top-4 bottom-4 w-0.5 bg-slate-200 z-0"></div>

                <FlowStep active={false} title="ENQUIRY" subtitle={selectedRecord.lead_no || selectedRecord.enquiry_no || 'Linked'} isFirst />
                <FlowStep active={false} title="QUOTATION" subtitle={selectedRecord.quote_no || 'Linked'} />
                <FlowStep active={'SALES ORDER' === 'DELIVERY CHALLAN'} highlight={'SALES ORDER' === 'DELIVERY CHALLAN'} title="SALES ORDER" subtitle={'SALES ORDER' === 'DELIVERY CHALLAN' ? selectedRecord.delivery_no : (selectedRecord.sales_order_no || 'Linked')} />
                <FlowStep active={'INWARD' === 'DELIVERY CHALLAN'} highlight={'INWARD' === 'DELIVERY CHALLAN'} title="INWARD" subtitle={'INWARD' === 'DELIVERY CHALLAN' ? selectedRecord.delivery_no : 'Linked'} />
                <FlowStep active={'PRODUCTION' === 'DELIVERY CHALLAN'} highlight={'PRODUCTION' === 'DELIVERY CHALLAN'} title="PRODUCTION" subtitle={'PRODUCTION' === 'DELIVERY CHALLAN' ? selectedRecord.delivery_no : 'Linked'} />
                <FlowStep active={'FINISHED GOODS' === 'DELIVERY CHALLAN'} highlight={'FINISHED GOODS' === 'DELIVERY CHALLAN'} title="FINISHED GOODS" subtitle={'FINISHED GOODS' === 'DELIVERY CHALLAN' ? selectedRecord.delivery_no : 'Linked'} />
                <FlowStep active={'DELIVERY CHALLAN' === 'DELIVERY CHALLAN'} highlight={'DELIVERY CHALLAN' === 'DELIVERY CHALLAN'} title="DELIVERY CHALLAN" subtitle={'DELIVERY CHALLAN' === 'DELIVERY CHALLAN' ? selectedRecord.delivery_no : 'Linked'} />
                <FlowStep active={'INVOICE' === 'DELIVERY CHALLAN'} highlight={'INVOICE' === 'DELIVERY CHALLAN'} title="INVOICE" subtitle={'INVOICE' === 'DELIVERY CHALLAN' ? selectedRecord.delivery_no : 'Linked'} isLast />
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
