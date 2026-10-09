import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, ArrowLeft, FileText, Download, Plus, Receipt } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Card';
import { useAuth } from '@/contexts/AuthContext';
import { downloadBrandedDocument, viewBrandedDocument } from '@/lib/brandedDocument';

export function InwardModule({ onBack, onAddInward, refreshSignal, onEdit, onDelete, onView }: { onBack: () => void; onAddInward?: () => void; refreshSignal?: number; onEdit?: (record: any) => void; onDelete?: (record: any) => void; onView?: (record: any) => void }) {
  const { company } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Expense entries are kept out of the inward list; the Expenses button switches to them.
  const [showExpenses, setShowExpenses] = useState(false);
  const isExpense = (r: any) => String(r.category || '').trim().toUpperCase() === 'EXPENSES';

  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);

  const openAttachment = async (attachment: { path: string; name: string }) => {
    const tab = window.open('about:blank', '_blank');
    if (!tab) { alert('Allow pop-ups to open this attachment.'); return; }
    const { data, error } = await supabase.storage.from('inventory-images').createSignedUrl(attachment.path, 60);
    if (error || !data?.signedUrl) {
      tab.close();
      alert(`Unable to open ${attachment.name}: ${error?.message || 'File unavailable'}`);
      return;
    }
    tab.location.href = data.signedUrl;
  };

  useEffect(() => {
    fetchRecords();
  }, [refreshSignal]);

  const fetchRecords = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('cnc_inwards').select('*').order('created_at', { ascending: false });
    if (error) console.error('Error fetching inwards:', error);
    if (data) setRecords(data);
    setLoading(false);
  };

  const openRecord = async (record: any) => {
    setSelectedRecord(record);
  };

  // Core PDF fonts lack the ₹ glyph — always use Rs. in generated bills.
  const inr = (v: any) => 'Rs. ' + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

  const buildBillInput = () => {
    const r = selectedRecord;
    if (!r) return null;
    const q = Number(r.quantity) || 0;
    const p = Number(r.price) || 0;
    const total = r.total_amount !== null && r.total_amount !== undefined && r.total_amount !== ''
      ? Number(r.total_amount)
      : q * p * (1 - (Number(r.discount_percent) || 0) / 100) * (1 + (Number(r.gst_percent) || 0) / 100);
    return {
      companyName: company?.company_name || 'ARGUS CNC',
      title: 'Purchase Bill',
      documentNo: r.inward_no || '',
      date: r.inward_date || r.created_at,
      details: [
        ['Party Name', r.party_name || '—'],
        ['Category', r.category || '—'],
        ['Reference No.', r.reference_no || '—'],
        ['Product', r.product_name || r.project_name || '—'],
      ] as [string, string | number | null | undefined][],
      details2: [
        ['Inward Date', r.inward_date || '—'],
        ['Status', r.status || '—'],
      ] as [string, string | number | null | undefined][],
      columns: ['S.No', 'Part Name', 'Qty', 'Price (Rs.)', 'Disc %', 'GST %', 'Amount (Rs.)'],
      rows: [[
        1, r.part_name || '—', q, inr(p),
        `${Number(r.discount_percent) || 0}%`, `${Number(r.gst_percent) || 0}%`, inr(total),
      ]] as (string | number)[][],
      totals: [['Total Amount', inr(total)]] as [string, string][],
      signatures: ['Prepared By', 'Checked By', 'Received By'],
      premium: true,
    };
  };

  const previewBill = async () => {
    const input = buildBillInput();
    if (!input) return;
    try { await viewBrandedDocument(input); }
    catch (error) { alert(error instanceof Error ? error.message : 'Unable to preview the bill.'); }
  };

  const downloadBill = async () => {
    const input = buildBillInput();
    if (!input) return;
    try { await downloadBrandedDocument(input); }
    catch (error) { alert(error instanceof Error ? error.message : 'Unable to download the bill.'); }
  };

  const filteredRecords = records.filter(r => isExpense(r) === showExpenses && r.status !== 'Deleted').filter(r =>
    (r.inward_no || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.party_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.product_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.part_name || '').toLowerCase().includes(search.toLowerCase())
  );
  const productGroups: Array<{ key: string; label: string; records: any[] }> = Array.from(filteredRecords.reduce((groups: Map<string, { key: string; label: string; records: any[] }>, record: any) => {
    const product = record.product_name || record.project_name || record.part_name || 'Unassigned Product';
    const key = `${record.enquiry_id || record.project_name || ''}::${product}`;
    const group = groups.get(key) || { key, label: product, records: [] };
    group.records.push(record);
    groups.set(key, group);
    return groups;
  }, new Map<string, { key: string; label: string; records: any[] }>()).values());

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full min-h-[500px]">
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 hover:bg-slate-200 rounded-md transition-colors text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-800">{showExpenses ? 'Expenses' : 'Inwards'}</h2>
            <p className="text-xs text-slate-500">{showExpenses ? 'Expenses entered per product / project' : 'Manage raw materials inward'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowExpenses(v => !v)} title={showExpenses ? 'Back to inwards' : 'View expenses'} aria-label="Expenses"
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold border rounded-lg transition-colors whitespace-nowrap ${showExpenses ? 'bg-brand-600 text-white border-brand-600' : 'text-slate-700 border-slate-300 hover:bg-slate-100'}`}>
            <Receipt size={15} /> Expenses
          </button>
          {onAddInward && (
            <button onClick={onAddInward} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-brand-700 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors whitespace-nowrap">
              <Plus size={15} /> Add Inward
            </button>
          )}
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
                <th className="p-3 font-semibold">Inward No</th>
                <th className="p-3 font-semibold">Party</th>
                <th className="p-3 font-semibold">Part Name</th>
                <th className="p-3 font-semibold">Quantity</th>
                <th className="p-3 font-semibold">Status</th>
                <th className="p-3 font-semibold">Actions</th>
              </tr>
            </thead>
            {productGroups.map(group => <tbody key={group.key}>
              <tr className="border-b border-slate-200 bg-brand-50/70">
                <td colSpan={6} className="p-3 text-sm font-bold text-brand-800">{group.label}<span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">{group.records.length} inward{group.records.length === 1 ? '' : 's'}</span></td>
              </tr>
              {group.records.map(record => (
                <tr key={record.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="p-3 text-sm font-mono font-medium text-slate-800">{record.inward_no || '-'}</td>
                  <td className="p-3 text-sm font-semibold text-brand-700">{record.party_name || '-'}</td>
                  <td className="p-3 text-sm text-slate-700">{record.part_name || '-'}</td>
                  <td className="p-3 text-sm text-slate-700">{record.quantity ?? '-'}</td>
                  <td className="p-3 text-sm text-slate-700">{record.status || '-'}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={() => (onView ? onView(record) : openRecord(record))}>View Details</Button>{onEdit && <Button variant="secondary" size="sm" onClick={() => onEdit(record)}>Edit</Button>}{onDelete && <Button variant="secondary" size="sm" className="!text-red-600 hover:!bg-red-50" onClick={() => onDelete(record)}>Delete</Button>}</div>
                  </td>
                </tr>
              ))}
            </tbody>)}
              {filteredRecords.length === 0 && (
                <tbody>
                <tr><td colSpan={6} className="text-center py-8 text-slate-500">No records found.</td></tr>
                </tbody>
              )}
          </table>
        )}
      </div>

      <Modal open={!!selectedRecord} onClose={() => setSelectedRecord(null)} title={'Inward Details: ' + (selectedRecord?.inward_no || 'Pending')} size="lg" footer={
        <div className="flex justify-between w-full">
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => void previewBill()}>Bill Preview</Button>
            <Button variant="secondary" icon={<Download size={14} />} onClick={() => void downloadBill()}>Download Bill PDF</Button>
          </div>
          <Button onClick={() => setSelectedRecord(null)}>Close</Button>
        </div>
      }>
        {selectedRecord && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="grid grid-cols-2 md:grid-cols-[9rem_minmax(0,1fr)_9rem_9rem_auto] gap-4 mb-3">
              {([
                ['Category', selectedRecord.category],
                ['Company', selectedRecord.party_name],
                ['Inward Date', selectedRecord.inward_date],
                ['Reference No.', selectedRecord.reference_no],
              ] as [string, any][]).map(([label, v]) => (
                <div key={label}>
                  <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">{label}</span>
                  <span className="text-sm text-slate-800 font-medium break-words">{v === null || v === undefined || v === '' ? '—' : String(v)}</span>
                </div>
              ))}
              <div>
                <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Files</span>
                <div className="flex flex-wrap gap-2">
                  {Array.isArray(selectedRecord.attachments) && selectedRecord.attachments.length > 0 ? (
                    selectedRecord.attachments.map((attachment: { path: string; name: string }, index: number) => (
                      <button key={`${attachment.path}-${index}`} type="button" onClick={() => openAttachment(attachment)} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-brand-700 hover:bg-brand-50">
                        <FileText className="h-4 w-4" />{attachment.name}
                      </button>
                    ))
                  ) : (
                    <span className="text-sm text-slate-400">—</span>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_4rem_4.75rem_4rem_3.75rem_5rem_minmax(0,1fr)] gap-2 items-center mb-1 px-1">
              {['Product', 'Part Name', 'Qty', 'Price', 'Disc', 'GST', 'Total', 'Remarks'].map(h => (
                <span key={h} className="text-[10px] font-bold text-slate-500 uppercase">{h}</span>
              ))}
            </div>
            <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_4rem_4.75rem_4rem_3.75rem_5rem_minmax(0,1fr)] gap-2 items-center bg-white rounded-lg border border-slate-200 p-2">
              {[
                selectedRecord.product_name || selectedRecord.project_name || '—',
                selectedRecord.part_name || '—',
                selectedRecord.quantity ?? '—',
                selectedRecord.price !== null && selectedRecord.price !== undefined && selectedRecord.price !== '' ? inr(selectedRecord.price) : '—',
                `${Number(selectedRecord.discount_percent) || 0}%`,
                `${Number(selectedRecord.gst_percent) || 0}%`,
                selectedRecord.total_amount !== null && selectedRecord.total_amount !== undefined && selectedRecord.total_amount !== '' ? inr(selectedRecord.total_amount) : '—',
                selectedRecord.remarks || '—',
              ].map((v, i) => (
                <span key={i} className="text-sm text-slate-800 font-medium break-words tabular-nums">{String(v)}</span>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
