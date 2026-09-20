import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Filter, Calendar, List, Kanban as KanbanIcon, ArrowLeft, FileText } from 'lucide-react';
import { Modal, FormField, inputClass } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Card';

export function SalesOrderModule({ onBack }: { onBack: () => void }) {
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
    let query = supabase.from('cnc_sales_orders').select('*');
    if (false) {
      query = supabase.from('cnc_sales_orders').select('*');
    }
    const { data } = await query.order('created_at', { ascending: false });
    if (data) setRecords(data);
    setLoading(false);
  };

  const openRecord = async (record: any) => {
    setSelectedRecord(record);
  };

  const filteredRecords = records.filter(r => 
    (r.order_no || '').toLowerCase().includes(search.toLowerCase()) || 
    (r.customer || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full min-h-[500px]">
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 hover:bg-slate-200 rounded-md transition-colors text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Sales Orders</h2>
            <p className="text-xs text-slate-500">Manage confirmed sales orders</p>
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
                <th className="p-3 font-semibold">Order No</th>
                <th className="p-3 font-semibold">Customer</th>
                <th className="p-3 font-semibold">Part Name</th>
                <th className="p-3 font-semibold">Quantity</th>
                <th className="p-3 font-semibold">Total Value</th>
                <th className="p-3 font-semibold">Delivery Date</th>
                <th className="p-3 font-semibold">Status</th>
                <th className="p-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map(record => (
                <tr key={record.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="p-3 text-sm font-mono font-medium text-slate-800">{record.order_no || (record.party_name && 'order_no' === 'customer_name' ? record.party_name : '-')}</td>
                  <td className="p-3 text-sm font-semibold text-brand-700">{record.customer || (record.party_name && 'customer' === 'customer_name' ? record.party_name : '-')}</td>
                  <td className="p-3 text-sm text-slate-700">{record.part_name || (record.party_name && 'part_name' === 'customer_name' ? record.party_name : '-')}</td>
                  <td className="p-3 text-sm text-slate-700">{record.quantity || (record.party_name && 'quantity' === 'customer_name' ? record.party_name : '-')}</td>
                  <td className="p-3 text-sm text-slate-700">{record.total_value || (record.party_name && 'total_value' === 'customer_name' ? record.party_name : '-')}</td>
                  <td className="p-3 text-sm text-slate-700">{record.delivery_date || (record.party_name && 'delivery_date' === 'customer_name' ? record.party_name : '-')}</td>
                  <td className="p-3 text-sm text-slate-700">{record.status || (record.party_name && 'status' === 'customer_name' ? record.party_name : '-')}</td>
                  <td className="p-3">
                    <Button variant="secondary" size="sm" onClick={() => openRecord(record)}>View Details</Button>
                  </td>
                </tr>
              ))}
              {filteredRecords.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-slate-500">No records found.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!selectedRecord} onClose={() => setSelectedRecord(null)} title={'Sales Orders Details: ' + (selectedRecord?.order_no || 'Pending')} size="3xl" footer={
        <div className="flex justify-between w-full">
          <div>
             <Button onClick={() => alert('Development Note: Conversion logic will go here.')} className="bg-emerald-600 hover:bg-emerald-700 text-white">Create Inward</Button>
          </div>
          <Button onClick={() => setSelectedRecord(null)}>Close</Button>
        </div>
      }>
        {selectedRecord && (
          <div className="flex gap-6">
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Order No"><input className={inputClass} value={selectedRecord.order_no || selectedRecord.party_name || ''} disabled /></FormField>
                <FormField label="Customer"><input className={inputClass} value={selectedRecord.customer || selectedRecord.party_name || ''} disabled /></FormField>
                <FormField label="Part Name"><input className={inputClass} value={selectedRecord.part_name || selectedRecord.party_name || ''} disabled /></FormField>
                <FormField label="Quantity"><input className={inputClass} value={selectedRecord.quantity || selectedRecord.party_name || ''} disabled /></FormField>
                <FormField label="Total Value"><input className={inputClass} value={selectedRecord.total_value || selectedRecord.party_name || ''} disabled /></FormField>
                <FormField label="Delivery Date"><input className={inputClass} value={selectedRecord.delivery_date || selectedRecord.party_name || ''} disabled /></FormField>
                <FormField label="Status"><input className={inputClass} value={selectedRecord.status || selectedRecord.party_name || ''} disabled /></FormField>
              </div>
            </div>

            <div className="w-64 bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col h-full">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 border-b border-slate-200 pb-2"><FileText className="w-4 h-4 text-brand-600"/> DOCUMENT FLOW</h3>
              
              <div className="flex flex-col space-y-0 relative pl-4">
                <div className="absolute left-6 top-4 bottom-4 w-0.5 bg-slate-200 z-0"></div>

                <FlowStep active={false} title="ENQUIRY" subtitle={selectedRecord.lead_no || selectedRecord.enquiry_no || 'Linked'} isFirst />
                <FlowStep active={false} title="QUOTATION" subtitle={selectedRecord.quote_no || 'Linked'} />
                <FlowStep active={'SALES ORDER' === 'SALES ORDER'} highlight={'SALES ORDER' === 'SALES ORDER'} title="SALES ORDER" subtitle={'SALES ORDER' === 'SALES ORDER' ? selectedRecord.order_no : (selectedRecord.sales_order_no || 'Linked')} />
                <FlowStep active={'INWARD' === 'SALES ORDER'} highlight={'INWARD' === 'SALES ORDER'} title="INWARD" subtitle={'INWARD' === 'SALES ORDER' ? selectedRecord.order_no : 'Linked'} />
                <FlowStep active={'PRODUCTION' === 'SALES ORDER'} highlight={'PRODUCTION' === 'SALES ORDER'} title="PRODUCTION" subtitle={'PRODUCTION' === 'SALES ORDER' ? selectedRecord.order_no : 'Linked'} />
                <FlowStep active={'FINISHED GOODS' === 'SALES ORDER'} highlight={'FINISHED GOODS' === 'SALES ORDER'} title="FINISHED GOODS" subtitle={'FINISHED GOODS' === 'SALES ORDER' ? selectedRecord.order_no : 'Linked'} />
                <FlowStep active={'DELIVERY CHALLAN' === 'SALES ORDER'} highlight={'DELIVERY CHALLAN' === 'SALES ORDER'} title="DELIVERY CHALLAN" subtitle={'DELIVERY CHALLAN' === 'SALES ORDER' ? selectedRecord.order_no : 'Linked'} />
                <FlowStep active={'INVOICE' === 'SALES ORDER'} highlight={'INVOICE' === 'SALES ORDER'} title="INVOICE" subtitle={'INVOICE' === 'SALES ORDER' ? selectedRecord.order_no : 'Linked'} isLast />
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
