import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { financeApi } from '@/lib/finance';
import { Button } from '@/components/ui/Card';
import { Modal, FormField, inputClass } from '@/components/ui/Modal';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { CustomerAutocomplete } from '@/components/ui/CustomerAutocomplete';
import { Plus, Trash2, Eye, UploadCloud , Edit2, Download, FileText, RefreshCcw, Copy } from 'lucide-react';
import { setMockImage, getMockImage } from '@/lib/mockStorage';
import { useAuth } from '@/contexts/AuthContext';
import { EnquiryModule } from './EnquiryModule';
import { QuotationModule } from './QuotationModule';
import { SalesOrderModule } from './SalesOrderModule';
import { InwardModule } from './InwardModule';
import { FinishedGoodsModule } from './FinishedGoodsModule';
import { DeliveryChallanModule } from './DeliveryChallanModule';
import { InvoiceModule } from './InvoiceModule';
import { FgCostingModal } from './FgCostingModal';
import { DcInvoiceModal } from './DcInvoiceModal';
import { downloadBrandedDocument, viewBrandedDocument } from '@/lib/brandedDocument';
import { generateUniqueProjectNo } from '@/lib/projectNumber';
import { resetAndSeedAllPipelineData } from '@/lib/pipelineSeeder';
import { summarizeSalesOrder, fetchOrderQty, recordProductionBatch, REJECTION_TYPES, type OrderQtySummary } from '@/lib/orderQuantities';
import { QtyProgress, QtySummaryGrid, QtyBreakdown } from '@/components/ui/QuantitySummary';

export type Stage = 'Enquiry' | 'Quotation' | 'Sales Order' | 'Inward' | 'Finished Goods' | 'DC' | 'Invoice';

async function uploadEnquiryProductFile(companyId: string, file: File) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'attachment';
  const path = `${companyId}/enquiries/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from('inventory-images').upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error(`Unable to upload ${file.name}: ${error.message}`);
  return path;
}

async function uploadInwardAttachment(companyId: string, inwardId: string, file: File) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'attachment';
  const path = `${companyId}/inwards/${inwardId}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from('inventory-images').upload(path, file, {
    contentType: file.type || 'application/octet-stream', upsert: false,
  });
  if (error) throw new Error(`Unable to upload ${file.name}: ${error.message}`);
  return { name: file.name, path, size: file.size, type: file.type || 'application/octet-stream' };
}

export function formatLeadProductDisplay(raw: any): string {
  if (!raw) return 'N/A';
  
  // 1. Check for items array (Quotation, Sales Order, etc.)
  let items: any[] = [];
  if (Array.isArray(raw.items) && raw.items.length > 0) {
    items = raw.items;
  } else if (raw.description) {
    try {
      const parsed = typeof raw.description === 'string' ? JSON.parse(raw.description) : raw.description;
      if (Array.isArray(parsed) && parsed.length > 0) items = parsed;
    } catch {}
  }
  
  if (items.length > 0) {
    const names = items.map((i: any) => String(i.partName || i.productName || i.part_name || i.description || '').trim()).filter(Boolean);
    if (names.length === 1) return names[0];
    if (names.length > 1) {
      return names.join(', ');
    }
  }

  // 2. Check for enquiring_for / enquiringFor (Enquiry / Lead)
  let enquiringItems: any[] = [];
  try {
    const ef = raw.enquiring_for ?? raw.enquiringFor;
    const parsed = typeof ef === 'string' ? JSON.parse(ef) : ef;
    if (Array.isArray(parsed) && parsed.length > 0) enquiringItems = parsed;
  } catch {}
  
  if (enquiringItems.length > 0) {
    const names = enquiringItems.map((i: any) => String(i.productName || i.product_name || i.partName || i.part_name || '').trim()).filter(Boolean);
    if (names.length === 1) return names[0];
    if (names.length > 1) {
      return names.join(', ');
    }
  }
  
  // 3. Fallback to part_name or partName string (strip any stored "(N Products)" summary suffixes)
  const pName = String(raw.part_name || raw.partName || raw.part || raw.product_name || '').trim().replace(/(\s*\(?\d+\s*products?\)?\s*)+$/i, '').trim();
  if (pName && !pName.startsWith('Multiple Products')) return pName;
  return pName || 'N/A';
}

function enquiryProductOptions(enquiries: any[], leadNo?: string) {
  // Sales-stage numbers carry a date-time stamp (1009-26Sep26-1208AM) while the
  // enquiry stores the plain number (1009) — compare base numbers so both match.
  const baseOf = (s: any) => String(s || '').replace(/-\d{2}[A-Za-z]{3}\d{2}-\d{4}(AM|PM)$/, '');
  const wantBase = baseOf(leadNo || '');
  return (enquiries || []).filter((enquiry: any) => !leadNo || enquiry.lead_no === leadNo || enquiry.enquiry_no === leadNo
      || (wantBase && (baseOf(enquiry.lead_no) === wantBase || baseOf(enquiry.enquiry_no) === wantBase)))
    .flatMap((enquiry: any) => {
      let items: any[] = [];
      try {
        const parsed = typeof enquiry.enquiring_for === 'string' ? JSON.parse(enquiry.enquiring_for) : enquiry.enquiring_for;
        if (Array.isArray(parsed)) items = parsed;
      } catch { /* older enquiry may have a plain text product name */ }
      if (!items.length && enquiry.part_name && !String(enquiry.part_name).startsWith('Multiple Products')) {
        items = [{ productName: enquiry.part_name, quantity: enquiry.quantity }];
      }
      return items.map((item: any, index: number) => ({
        key: `${enquiry.id}:${index}`,
        name: String(item.productName || item.product_name || item.partName || item.part_name || '').trim(),
        quantity: item.quantity ?? item.qty ?? '',
        enquiryId: enquiry.id,
        leadNo: enquiry.lead_no || enquiry.enquiry_no,
        customer: enquiry.customer || '',
      })).filter((item: any) => item.name);
    });
}

export interface KanbanCard {
  id: string;
  stage: Stage;
  type: string;
  refNo: string;
  customer: string;
  part: string;
  qty: string | number;
  value: number;
  date: string;
  status?: string;
  raw: any;
  /** Order quantity reconciliation (live rows) for order/FG/DC/invoice cards. */
  qtyTrack?: OrderQtySummary | null;
};

const formatINR = (value: number) => {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);
};

// renderRecordData moved inside component for inline edit support
import { CommentsModal } from './CommentsModal';
import { PipelineListView } from './PipelineListView';
import { PipelineCalendarView } from './PipelineCalendarView';

// Defined at module level so inputs keep focus between keystrokes
const ContactsList = ({ form, setForm, readOnly = false }: { form: any, setForm?: any, readOnly?: boolean }) => (
  <div className="border-t border-slate-100 pt-4 mt-2 mb-4 col-span-full">
    <div className="flex justify-between items-center mb-4">
      <h4 className="font-semibold text-sm text-slate-800">Contact Details</h4>
      {!readOnly && setForm && (
        <button type="button" onClick={() => setForm({...form, contacts: [...(form.contacts || []), { person: '', phone: '', email: '' }]})} className="flex items-center gap-1 text-xs bg-brand-100 text-brand-700 px-2 py-1 rounded hover:bg-brand-200 transition-colors">
          <Plus size={14} /> Add Contact
        </button>
      )}
    </div>
    {(form.contacts || []).map((contact: any, idx: number) => (
      <div key={idx} className="grid grid-cols-3 gap-4 mb-4 p-3 bg-slate-50 rounded border border-slate-100 relative">
        {!readOnly && setForm && (form.contacts || []).length > 1 && (
          <button type="button" onClick={() => {
            const newContacts = [...form.contacts]; newContacts.splice(idx, 1); setForm({...form, contacts: newContacts});
          }} className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-200 text-xs shadow-sm z-10 transition-colors">&times;</button>
        )}
        <FormField label="Contact Person"><input className={inputClass} value={contact.person} readOnly={readOnly} disabled={readOnly} onChange={e => {
          if(!readOnly && setForm) { const nc = [...form.contacts]; nc[idx] = { ...nc[idx], person: e.target.value }; setForm({...form, contacts: nc}); }
        }} placeholder="Name" /></FormField>
        <FormField label="Phone"><input className={inputClass} value={contact.phone} readOnly={readOnly} disabled={readOnly} onChange={e => {
          if(!readOnly && setForm) { const nc = [...form.contacts]; nc[idx] = { ...nc[idx], phone: e.target.value }; setForm({...form, contacts: nc}); }
        }} placeholder="Phone" /></FormField>
        <FormField label="Email"><input type="email" className={inputClass} value={contact.email} readOnly={readOnly} disabled={readOnly} onChange={e => {
          if(!readOnly && setForm) { const nc = [...form.contacts]; nc[idx] = { ...nc[idx], email: e.target.value }; setForm({...form, contacts: nc}); }
        }} placeholder="Email" /></FormField>
      </div>
    ))}
  </div>
);

/** Quantity Tracking section (detail view): summary + reconciliation +
 *  record-rejected entry. Rejections save as traceable batch rows (good
 *  quantity untouched) and the summary refreshes from live rows. */
function QtyTrackingSection({ q, userName, onSaved }: {
  q: OrderQtySummary; userName: string; onSaved: (q: OrderQtySummary) => void;
}) {
  const [rejQty, setRejQty] = useState('');
  const [rejProduct, setRejProduct] = useState('');
  const [rejType, setRejType] = useState('');
  const [rejReason, setRejReason] = useState('');
  const [rejNotes, setRejNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const saveRejection = async () => {
    if (!rejProduct) { setMsg('Select the product first.'); return; }
    const n = Number(rejQty);
    if (!Number.isFinite(n) || n <= 0) { setMsg('Enter how many were rejected (more than 0).'); return; }
    if (!rejType) { setMsg('Select a rejection type.'); return; }
    if (!rejReason.trim()) { setMsg('Enter a rejection reason.'); return; }
    if (saving) return;
    setSaving(true);
    setMsg('');
    try {
      const res = await recordProductionBatch({
        salesOrderId: q.soId,
        salesOrderNo: q.soNo || null,
        productName: rejProduct || null,
        batchNo: `REJ-${Date.now().toString().slice(-6)}`,
        grossQty: n,
        goodQty: 0,
        rejectedQty: n,
        reworkQty: 0,
        rejectionType: rejType,
        rejectionReason: rejReason.trim(),
        notes: rejNotes.trim() || null,
        createdBy: userName || null,
        idempotencyKey: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `rej-${Date.now()}`,
      });
      if ((res as any)?.pendingMigration) {
        setMsg('Batch storage is not provisioned — apply the production-batches migration first.');
        return;
      }
      if (!(res as any)?.saved) { setMsg('Unable to record rejection. Nothing was saved.'); return; }
      const { summary } = await fetchOrderQty(q.soId, q.soNo);
      if (summary) onSaved(summary);
      setRejQty(''); setRejProduct(''); setRejType(''); setRejReason(''); setRejNotes('');
      setMsg(`Recorded ${n} rejected${rejProduct ? ` for ${rejProduct}` : ''}.`);
    } catch (e: any) {
      setMsg('Unable to record rejection: ' + (e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full rounded-xl border-2 border-violet-200 bg-violet-50/50 px-4 py-3 mb-4">
      <h4 className="font-bold text-sm text-violet-900 uppercase mb-2">Quantity Tracking</h4>
      <QtySummaryGrid q={q} />
      <div className="mt-2"><QtyProgress q={q} /></div>
      <details className="mt-2">
        <summary className="text-xs font-semibold text-violet-700 cursor-pointer">Full reconciliation (batches · delivery · invoice)</summary>
        <div className="mt-2"><QtyBreakdown q={q} /></div>
      </details>
      <div className="mt-3 rounded-xl border border-rose-200 bg-white p-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-rose-700">Record rejected quantity</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
          <FormField label="In which product? *">
            <select className={inputClass} value={rejProduct} onChange={(e) => setRejProduct(e.target.value)}>
              <option value="">Select product…</option>
              {((q.products ?? []).some((p) => p.ordered > 0) ? (q.products ?? []).filter((p) => p.ordered > 0) : (q.products ?? [])).map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </FormField>
          <FormField label="How many rejected? *">
            <input type="number" min={0} className={inputClass} value={rejQty} onChange={(e) => setRejQty(e.target.value)} placeholder="0" />
          </FormField>
          <FormField label="Rejection Type *">
            <select className={inputClass} value={rejType} onChange={(e) => setRejType(e.target.value)}>
              <option value="">Select…</option>
              {REJECTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormField>
          <div className="col-span-2 md:col-span-2">
            <FormField label="Rejection Reason *">
              <input className={inputClass} value={rejReason} onChange={(e) => setRejReason(e.target.value)} placeholder="e.g. Oversize by 0.05mm" />
            </FormField>
          </div>
          <FormField label="Notes">
            <input className={inputClass} value={rejNotes} onChange={(e) => setRejNotes(e.target.value)} placeholder="Optional" />
          </FormField>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Button size="sm" disabled={saving} onClick={() => void saveRejection()}>{saving ? 'Saving…' : 'Save Rejection'}</Button>
          {msg && <span className="text-xs text-slate-600">{msg}</span>}
        </div>
        <p className="text-[11px] text-slate-400 mt-1">Good quantity is untouched — rejected stays traceable and never enters stock, DCs or invoices.</p>
      </div>
    </div>
  );
}

export function SalesPipelinePage() {
  const { profile, company } = useAuth();
  const userName = profile?.full_name || '';
  const [activeView, setActiveView] = useState<'pipeline' | 'enquiry_list' | 'quotation_list' | 'sales_order_list' | 'inward_list' | 'fg_list' | 'dc_list' | 'invoice_list'>('pipeline');
  const columns: Stage[] = ['Enquiry', 'Quotation', 'Sales Order', 'Inward', 'Finished Goods', 'DC', 'Invoice'];
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [draggedCard, setDraggedCard] = useState<KanbanCard | null>(null);
  const [, setLoading] = useState(true);
  const [pipelineViewMode, setPipelineViewMode] = useState<'kanban' | 'list' | 'calendar'>('kanban');
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [activeCommentTarget, setActiveCommentTarget] = useState<KanbanCard | null>(null);
  const [customerFilter, setCustomerFilter] = useState<string>('All Customers');

  const [enquiryModalOpen, setEnquiryModalOpen] = useState(false);
  // Original enquiry number when the form was opened via Duplicate.
  const [duplicateSource, setDuplicateSource] = useState<string | null>(null);
  const [quotationModalTarget, setQuotationModalTarget] = useState<KanbanCard | null>(null);
  
  const [inwardModalTarget, setInwardModalTarget] = useState<KanbanCard | null>(null);
  const [fgModalTarget, setFgModalTarget] = useState<KanbanCard | null>(null);
  const [fgForm, setFgForm] = useState<any>({});
  const [costingModalTarget, setCostingModalTarget] = useState<KanbanCard | null>(null);
  const [invoiceCostingTarget, setInvoiceCostingTarget] = useState<KanbanCard | null>(null);
  const [dcModalTarget, setDcModalTarget] = useState<KanbanCard | null>(null);
  const [dcSaving, setDcSaving] = useState(false);
  const [dcForm, setDcForm] = useState<any>({});
  const [invoiceModalTarget, setInvoiceModalTarget] = useState<KanbanCard | null>(null);
  const [soModalTarget, setSoModalTarget] = useState<KanbanCard | null>(null);
  const [soForm, setSoForm] = useState<any>({});

  const [invoiceForm, setInvoiceForm] = useState<any>({});
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [viewModalTarget, setViewModalTarget] = useState<KanbanCard | null>(null);
  const [viewModalData, setViewModalData] = useState<any>(null);
  const [viewEditMode, setViewEditMode] = useState(false);
  const [mockImages, setMockImages] = useState<Record<string, string>>({});

  const handleInlineEdit = async (title: string, id: string, field: string, value: string) => {
    const tableMap: any = {
      'Enquiry': 'cnc_enquiries',
      'Quotation': 'cnc_quotations',
      'Sales Order': 'cnc_sales_orders',
      'Inward': 'cnc_inwards',
      'Finished Goods': 'cnc_work_orders',
      'DC': 'cnc_deliveries',
      'Invoice': 'cnc_invoices'
    };
    const table = tableMap[title];
    if (!table) return;

    if (field !== 'image_url') {
      const { error } = await supabase.from(table).update({ [field]: value }).eq('id', id);
      if (error) {
         console.error("Failed to update:", error);
         alert("Failed to update field: " + error.message);
         return;
      }
    }

    setViewModalData((prev: any) => {
          if (!prev) return prev;
          const newPrev = { ...prev };
          const keyMap: any = { 'Enquiry': 'enquiry', 'Quotation': 'quotation', 'Sales Order': 'order', 'Inward': 'inward', 'Finished Goods': 'finished_goods', 'DC': 'dc', 'Invoice': 'invoice' };
          const stateKey = keyMap[title];
          if (newPrev[stateKey]) {
             newPrev[stateKey] = { ...newPrev[stateKey], [field]: value };
          }
          return newPrev;
       });
       fetchPipeline();
  };

  const handleItemAction = async (order: any, itemIndex: number, action: 'inward' | 'unavailable') => {
    if (!window.confirm(`Are you sure you want to mark this part as ${action}?`)) return;
    setLoading(true);
    
    const updatedItems = (order.items || []).map((it: any, idx: number) =>
      idx === itemIndex ? { ...it, status: action === 'inward' ? 'Inwarded' : 'Unavailable' } : it
    );
    
    let newOrderStatus = order.status;
    if (action === 'unavailable') {
        newOrderStatus = 'Waiting for Parts';
    } else {
        const allInwarded = updatedItems.every((i: any) => i.status === 'Inwarded');
        if (allInwarded) newOrderStatus = 'Confirmed';
    }
    
    if (action === 'inward') {
        const item = updatedItems[itemIndex];
        const iNo = `INW-2026-${Math.floor(1000 + Math.random() * 9000)}`;
        const { error: inwErr } = await supabase.from('cnc_inwards').insert([{
          id: crypto.randomUUID(), inward_no: iNo, category: 'CUSTOMER DC',
          project_name: order.lead_no || '', product_name: order.part_name || item.productName || item.partName || '',
          sales_order_ref: order.order_no, reference_no: '',
          inward_date: new Date().toISOString().split('T')[0],
          party_name: order.customer || '', remarks: 'Auto-generated from part-wise action',
          part_name: item.partName || '-', part_number: item.partNumber || '',
          quantity: Number(item.quantity) || 0, total_amount: 0, status: 'Received'
        }]);
        if (inwErr) {
          alert("Error creating inward: " + inwErr.message);
          setLoading(false);
          return;
        }
        // CUSTOMER DC flows to Production as a Draft work order (manual release).
        try {
          await createDraftWorkOrdersForInwards([{
            inward: {
              category: 'CUSTOMER DC',
              sales_order_ref: order.order_no,
              party_name: order.customer || '',
              part_name: item.partName || '-',
              part_number: item.partNumber || '',
              inward_date: new Date().toISOString().split('T')[0],
            },
            qty: Number(item.quantity) || 0,
            customer: order.customer || '',
          }]);
        } catch (woErr) {
          console.error('Draft work order auto-create failed:', woErr);
        }
    }
    
    const { error } = await supabase.from('cnc_sales_orders').update({
        items: updatedItems,
        status: newOrderStatus
    }).eq('id', order.id);
    
    if (error) alert("Error updating item: " + error.message);
    else {
        fetchPipeline();
        setViewModalTarget(null);
    }
    setLoading(false);
  };

  const openProductFile = async (path: string) => {
    const tab = window.open('', '_blank');
    if (!tab) { alert('Allow pop-ups to open the product attachment.'); return; }
    const { data, error } = await supabase.storage.from('inventory-images').createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { tab.close(); alert(error?.message || 'Unable to open the product attachment.'); return; }
    tab.location.href = data.signedUrl;
  };

  const getItemFileEntries = (item: any): { name: string; path: string }[] => {
    const out: { name: string; path: string }[] = [];
    (item?.filePaths || []).forEach((fp: any) => {
      if (!fp) return;
      if (typeof fp === 'string') out.push({ name: fp.split('/').pop() || fp, path: fp });
      else if (typeof fp === 'object' && (fp.path || fp.url)) out.push({ name: fp.name || String(fp.path || fp.url).split('/').pop(), path: fp.path || fp.url });
    });
    return out;
  };

  const handleItemFileUpload = async (title: string, raw: any, itemIndex: number, files: FileList | File[]) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    if (!company?.id) { alert('Select a company before uploading product files.'); return; }
    setLoading(true);
    try {
      if (title === 'Inward') {
        const uploaded = await Promise.all(list.map(f => uploadInwardAttachment(company.id!, raw.id, f)));
        const nextAttachments = [...(raw.attachments || []), ...uploaded];
        const { error } = await supabase.from('cnc_inwards').update({ attachments: nextAttachments }).eq('id', raw.id);
        if (error) throw error;
        setViewModalData((prev: any) => prev ? { ...prev, inward: { ...prev.inward, attachments: nextAttachments } } : prev);
      } else {
        const uploadedPaths = await Promise.all(list.map(f => uploadEnquiryProductFile(company.id!, f)));
        const keyMap: any = { 'Enquiry': 'enquiry', 'Quotation': 'quotation', 'Sales Order': 'order' };
        const fieldMap: any = { 'Enquiry': 'enquiring_for', 'Quotation': 'description', 'Sales Order': 'items' };
        const tableMap: any = { 'Enquiry': 'cnc_enquiries', 'Quotation': 'cnc_quotations', 'Sales Order': 'cnc_sales_orders' };
        const stateKey = keyMap[title];
        const field = fieldMap[title];
        const table = tableMap[title];
        if (!stateKey || !field || !table) { alert('File upload is supported for Enquiry, Quotation, Sales Order and Inward.'); return; }
        let currentItems: any[] = [];
        if (title === 'Sales Order') {
          currentItems = Array.isArray(raw.items) ? raw.items : [];
        } else {
          const rawVal = raw[field];
          try {
            const parsed = typeof rawVal === 'string' ? JSON.parse(rawVal) : rawVal;
            currentItems = Array.isArray(parsed) ? parsed : (Array.isArray(raw.items) ? raw.items : []);
          } catch { currentItems = Array.isArray(raw.items) ? raw.items : []; }
        }
        const nextItems = currentItems.map((it: any, idx: number) =>
          idx === itemIndex ? { ...it, filePaths: [...(it.filePaths || []), ...uploadedPaths] } : it
        );
        const payloadVal = title === 'Sales Order' ? nextItems : JSON.stringify(nextItems);
        const { error } = await supabase.from(table).update({ [field]: payloadVal }).eq('id', raw.id);
        if (error) throw error;
        setViewModalData((prev: any) => {
          if (!prev || !prev[stateKey]) return prev;
          const updated = { ...prev[stateKey], [field]: payloadVal, items: nextItems };
          return { ...prev, [stateKey]: updated };
        });
      }
      fetchPipeline();
    } catch (err: any) {
      alert(err?.message || 'File upload failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveItem = async (title: string, raw: any, itemIndex: number) => {
    const keyMap: any = { 'Enquiry': 'enquiry', 'Quotation': 'quotation', 'Sales Order': 'order' };
    const fieldMap: any = { 'Enquiry': 'enquiring_for', 'Quotation': 'description', 'Sales Order': 'items' };
    const tableMap: any = { 'Enquiry': 'cnc_enquiries', 'Quotation': 'cnc_quotations', 'Sales Order': 'cnc_sales_orders' };
    const stateKey = keyMap[title];
    const field = fieldMap[title];
    const table = tableMap[title];
    if (!stateKey || !field || !table) return;
    let currentItems: any[] = [];
    if (title === 'Sales Order') {
      currentItems = Array.isArray(raw.items) ? raw.items : [];
    } else {
      const rawVal = raw[field];
      try {
        const parsed = typeof rawVal === 'string' ? JSON.parse(rawVal) : rawVal;
        currentItems = Array.isArray(parsed) ? parsed : (Array.isArray(raw.items) ? raw.items : []);
      } catch { currentItems = Array.isArray(raw.items) ? raw.items : []; }
    }
    if (currentItems.length <= 1) { alert('A record must keep at least one product.'); return; }
    if (!window.confirm('Remove this product from the ' + title.toLowerCase() + '?')) return;
    const nextItems = currentItems.filter((_: any, idx: number) => idx !== itemIndex);
    const names = nextItems.map((it: any) => String(it.partName || it.productName || it.part_name || '').trim()).filter(Boolean);
    const summary = names.length > 1 ? `${names.join(', ')} (${names.length} Products)` : (names[0] || '');
    const totalQty = nextItems.reduce((s: number, it: any) => s + (Number(it.quantity) || 0), 0);
    const payloadVal = title === 'Sales Order' ? nextItems : JSON.stringify(nextItems);
    setLoading(true);
    try {
      const { error } = await supabase.from(table).update({ [field]: payloadVal, part_name: summary, quantity: totalQty }).eq('id', raw.id);
      if (error) throw error;
      setViewModalData((prev: any) => {
        if (!prev || !prev[stateKey]) return prev;
        const updated = { ...prev[stateKey], [field]: payloadVal, items: nextItems, part_name: summary, quantity: totalQty };
        return { ...prev, [stateKey]: updated };
      });
      fetchPipeline();
    } catch (err: any) {
      alert(err?.message || 'Failed to remove product.');
    } finally {
      setLoading(false);
    }
  };

  // Inward history reads Product Name → Part Name → Category first.
  const orderDetailEntries = (title: string, entries: [string, any][]) => {
    if (title !== 'Inward') return entries;
    const first = ['product_name', 'part_name', 'category'];
    return [
      ...entries.filter(([k]) => first.includes(k)).sort((a, b) => first.indexOf(a[0]) - first.indexOf(b[0])),
      ...entries.filter(([k]) => !first.includes(k)),
    ];
  };

  // Inward history cell (row-aware so grouped multi-line inwards stay editable).
  const inwardCellFor = (row: any, key: string, label: string) => {
    const v = row ? row[key] : undefined;
    const money = ['price', 'total_amount'].includes(key) && v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
    const text = (v === null || v === undefined || v === '') ? '—' : (money ? Number(v).toFixed(2) : String(v));
    return (
      <div>
        {label ? <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">{label}</span> : null}
        {viewEditMode ? (
          <input
            type="text"
            className="w-full text-sm font-medium text-slate-800 border border-slate-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-brand-500"
            defaultValue={v ?? ''}
            onBlur={(e) => {
              if (row && e.target.value !== String(v ?? '')) {
                handleInlineEdit('Inward', row.id, key, e.target.value);
              }
            }}
          />
        ) : (
          <span className="text-sm text-slate-800 font-medium break-words">{text}</span>
        )}
      </div>
    );
  };

  const renderRecordData = (title: string, raw: any, showItems: boolean = true, headerSuffix: string = '') => {
    if (!raw) return null;
    // Inward history mirrors the entry card: product picker row, category row, one-line part rows.
    const inwardCell = (key: string, label: string) => {
      const v = raw[key];
      const money = ['price', 'total_amount'].includes(key) && v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
      const text = (v === null || v === undefined || v === '') ? '—' : (money ? Number(v).toFixed(2) : String(v));
      return (
        <div>
          <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">{label}</span>
          {viewEditMode ? (
            <input
              type="text"
              className="w-full text-sm font-medium text-slate-800 border border-slate-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-brand-500"
              defaultValue={v ?? ''}
              onBlur={(e) => {
                if (e.target.value !== String(v ?? '')) {
                  handleInlineEdit(title, raw.id, key, e.target.value);
                }
              }}
            />
          ) : (
            <span className="text-sm text-slate-800 font-medium break-words">{text}</span>
          )}
        </div>
      );
    };
    return (
      <div className="mb-6">
        <h4 className="font-bold text-sm text-brand-800 border-b border-brand-100 pb-2 mb-3 uppercase flex justify-between items-center">
          {title} Details{headerSuffix ? ` ${headerSuffix}` : ''}
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 bg-slate-50 p-4 rounded-lg border border-slate-100">
          {title === 'Inward' ? (<>
            <div className="col-span-full">{inwardCellFor(raw, 'product_name', 'Product from Enquiry')}</div>
            <div className="col-span-full grid grid-cols-3 gap-4">
              {inwardCellFor(raw, 'category', 'Category')}
              {inwardCellFor(raw, 'reference_no', 'Reference No.')}
              {inwardCellFor(raw, 'inward_date', 'Inward Date')}
            </div>
            <div className="col-span-full">
              <div className="grid grid-cols-[minmax(0,1.5fr)_4.5rem_5.5rem_4.5rem_4.5rem_6rem] gap-2 items-center mb-1 px-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Part Name</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Quantity</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Price</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Discount</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase">GST</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Total (Rs.)</span>
              </div>
              <div className="grid grid-cols-[minmax(0,1.5fr)_4.5rem_5.5rem_4.5rem_4.5rem_6rem] gap-2 items-center bg-white rounded-lg border border-slate-200 p-2">
                {inwardCellFor(raw, 'part_name', '')}
                {inwardCellFor(raw, 'quantity', '')}
                {inwardCellFor(raw, 'price', '')}
                {inwardCellFor(raw, 'discount_percent', '')}
                {inwardCellFor(raw, 'gst_percent', '')}
                {inwardCellFor(raw, 'total_amount', '')}
              </div>
            </div>
          </>) : (
          orderDetailEntries(title, Object.entries(raw)).map(([key, value]) => {
            if (key === 'id' || key.startsWith('_') || key.endsWith('_id') || ((value === null || value === '') && !(title === 'Inward' && (key === 'product_name' || key === 'part_name' || key === 'category'))) || key === 'items' || key === 'contacts' || key === 'attachments' || key === 'quote_no' || key === 'order_no' || key === 'inward_no' || key === 'enquiry_no' || key === 'image_url' || key === 'drawing_url' || key === 'enquiring_for' || key === 'description' || key === 'status' || key === 'delivered' || key === 'contact_person' || key === 'phone' || key === 'email' || key === 'part_no' || key === 'part_number' || key === 'partNo' || key === 'partNumber') return null;
            if (title === 'Enquiry' && (key === 'status' || key === 'estimated_value' || key === 'received_date' || key === 'pipeline_stage' || key === 'expected_date' || key === 'source' || key === 'created_at' || key === 'lead_no')) return null;
            if (title === 'Sales Order' && (key === 'part_name' || key === 'quantity' || key === 'lead_no' || key === 'value' || key === 'customer' || key === 'created_at' || key === 'payment_terms' || key === 'total_value' || key === 'delivery_date')) return null;
            if (title === 'Quotation' && (key === 'customer' || key === 'part_name' || key === 'salesperson')) return null;
            if (title === 'Inward' && (key === 'project_name' || key === 'sales_order_ref' || key === 'party_name' || key === 'created_at' || key === 'updated_at')) return null;
            if (title === 'Finished Goods' && (key === 'wo_no' || key === 'part_name' || key === 'customer' || key === 'sales_order' || key === 'quantity' || key === 'rejected' || key === 'due_date' || key === 'priority' || key === 'drawing_revision' || key === 'created_at')) return null;
            if (title === 'Invoice' && (key === 'customer_name' || key === 'part_name' || key === 'quantity' || key === 'created_at' || key === 'invoice_type' || key === 'basic_value' || key === 'cancelled' || key === 'created_by' || key === 'updated_at')) return null;
            if (title === 'Quotation' && (key === 'valid_till' || key === 'valid_until' || key === 'status' || key === 'created_at' || key === 'part_number' || key === 'part_no')) return null;
            let formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            if (key === 'lead_no') formattedKey = 'Unique Number';
            if (key === 'part_name') formattedKey = 'Product Name';
            const displayVal = (key === 'part_name' && title !== 'Inward') ? formatLeadProductDisplay(raw) : value;
            return (
              <div key={key}>
                <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">{formattedKey}</span>
                {viewEditMode && key !== 'created_at' && key !== 'updated_at' ? (
                   <input 
                     type="text" 
                     className="w-full text-sm font-medium text-slate-800 border border-slate-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-brand-500"
                     defaultValue={displayVal ?? ''}
                     onBlur={(e) => {
                       if (e.target.value !== String(displayVal ?? '')) {
                         handleInlineEdit(title, raw.id, key, e.target.value);
                       }
                     }}
                   />
                ) : (
                   <span className="text-sm text-slate-800 font-medium break-words">
                     {displayVal === null || displayVal === undefined || displayVal === ''
                       ? '—'
                       : ['value', 'total_value'].includes(key) && Number.isFinite(Number(displayVal))
                         ? Number(displayVal).toFixed(2)
                         : String(displayVal)}
                   </span>
                )}
              </div>
            );
          }))}
        </div>
        {showItems && raw.items && Array.isArray(raw.items) && (
          <div className="bg-white rounded-lg border border-slate-200 mt-4">
            <h4 className="font-bold text-xs text-brand-800 border-b border-slate-200 p-2.5 bg-slate-50 rounded-t-lg uppercase">Items Breakdown</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-[10px] text-slate-500 bg-slate-50 uppercase border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2">Product Name</th>
                    <th className="px-4 py-2">Qty</th>
                    <th className="px-4 py-2">Unit Price</th>
                    <th className="px-4 py-2">Total</th>
                    {(title === 'Sales Order' || viewEditMode) && <th className="px-4 py-2 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {raw.items.map((item: any, i: number) => {
                    const fileEntries = getItemFileEntries(item);
                    return (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {item.partName || item.productName || '-'}
                        {fileEntries.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{fileEntries.map(fe => <button key={fe.path} type="button" className="inline-flex items-center gap-1 text-[10px] text-blue-700 hover:underline" onClick={e => { e.stopPropagation(); void openProductFile(fe.path); }}><FileText size={11}/>{fe.name}</button>)}</div>}
                      </td>
                      <td className="px-4 py-3">{item.quantity}</td>
                      <td className="px-4 py-3">{formatINR(item.unitPrice || 0)}</td>
                      <td className="px-4 py-3 font-bold text-brand-600">{formatINR((item.quantity||0) * (item.unitPrice||0))}</td>
                      {(title === 'Sales Order' || viewEditMode) && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {title === 'Sales Order' && !item.status && (
                              <button onClick={() => handleItemAction(raw, i, 'inward')} className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded border border-emerald-200" title="Available (Inward)">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                              </button>
                            )}
                            {viewEditMode && (title === 'Enquiry' || title === 'Quotation' || title === 'Sales Order') && (
                              <label className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-600 hover:border-brand-400 hover:text-brand-700" title="Upload image / file / PDF for this product">
                                <UploadCloud size={13} /> Upload
                                <input type="file" multiple accept="*/*" className="hidden" onChange={e => { if (e.currentTarget.files?.length) void handleItemFileUpload(title, raw, i, e.currentTarget.files); e.currentTarget.value = ''; }} />
                              </label>
                            )}
                            {viewEditMode && (title === 'Enquiry' || title === 'Quotation' || title === 'Sales Order') && (
                              <button type="button" onClick={() => void handleRemoveItem(title, raw, i)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md border border-transparent hover:border-red-200" title="Remove product">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {title === 'Inward' && Array.isArray(raw.attachments) && raw.attachments.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 mt-4">
            <h4 className="font-bold text-xs text-brand-800 border-b border-slate-200 p-2.5 bg-slate-50 rounded-t-lg uppercase">Attached Files</h4>
            <div className="p-3 flex flex-wrap gap-2">
              {raw.attachments.map((att: any, ai: number) => {
                const p = typeof att === 'string' ? att : (att.path || att.url || '');
                const n = typeof att === 'string' ? p.split('/').pop() : (att.name || p.split('/').pop() || `File ${ai + 1}`);
                if (!p) return null;
                return <button key={`${p}-${ai}`} type="button" className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-blue-700 hover:border-brand-300" onClick={() => void openProductFile(p)}><FileText size={12} />{n}</button>;
              })}
              {viewEditMode && (
                <label className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-brand-400 hover:text-brand-700">
                  <UploadCloud size={13} /> Upload image / file / PDF
                  <input type="file" multiple accept="*/*" className="hidden" onChange={e => { if (e.currentTarget.files?.length) void handleItemFileUpload(title, raw, 0, e.currentTarget.files); e.currentTarget.value = ''; }} />
                </label>
              )}
            </div>
          </div>
        )}
        {(raw.image_url || mockImages[raw.part_name || raw.id]) && (
           <div className="mt-4">
             <h4 className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Attached Files</h4>
             <img src={mockImages[raw.part_name || raw.id] || raw.image_url} alt="Attachment" className="h-24 w-auto object-contain rounded border border-slate-200 bg-white" />
           </div>
        )}
      </div>
    );
  };

  const pipelineDocumentInput = async (kind: 'dc' | 'invoice') => {
    const record = viewModalData?.[kind];
    if (!record) return null;
    const invoice = kind === 'invoice';
    if (invoice) {
      const items = Array.isArray(record.items) ? record.items : [];
      return {
        companyName: company?.company_name || 'ARGUS CNC',
        title: record.invoice_type || 'Tax Invoice',
        documentNo: record.invoice_no || record.inv_no || '',
        date: record.invoice_date || record.date,
        details: [['Bill To', record.customer_name || record.customer], ['Billing Address', record.billing_address], ['GSTIN', record.customer_gstin], ['PO No', record.po_no], ['Delivery Challan', record.dc_no], ['Payment Terms', record.payment_terms]] as [string, string | number | null | undefined][],
        columns: ['#', 'Description', 'HSN', 'Qty', 'Unit', 'Rate', 'Amount'],
        rows: items.length
          ? items.map((item: any, index: number) => [index + 1, item.description || item.partName || item.part_name || '', item.hsn || '—', item.quantity ?? item.qty ?? '', item.unit || '', formatINR(Number(item.rate ?? item.unitPrice ?? 0)), formatINR(Number(item.amount ?? (Number(item.quantity ?? item.qty ?? 0) * Number(item.rate ?? item.unitPrice ?? 0))))] as (string | number)[])
          : [[1, record.part_name || record.description || '—', record.quantity || record.dispatch_qty || '', record.unit || ''] as (string | number)[]],
        totals: [['Basic Value', formatINR(Number(record.basic_value || record.subtotal || 0))], ['CGST', formatINR(Number(record.cgst || 0))], ['SGST', formatINR(Number(record.sgst || 0))], ['IGST', formatINR(Number(record.igst || 0))], ['Total', formatINR(Number(record.total || record.total_value || record.value || 0))]] as [string, string][],
      };
    }
    // ---- Delivery Challan: gather EVERY item from the same DC object/data shown
    // in the Details screen — never just the first product or the header quantity.
    const stripSummary = (v: any) => String(v ?? '').replace(/(\s*\(?\d+\s*products?\)?\s*)+$/i, '').trim();
    const isBareId = (v: string) => /^[\d\s,.\-()]+$/.test(v);
    const docNo = String(record.delivery_no || record.dc_no || record.challan_no || '').trim();
    let siblingRows: any[] = [];
    if (docNo) {
      try {
        const { data } = await supabase.from('cnc_deliveries').select('*').eq('delivery_no', docNo).order('created_at', { ascending: true });
        if (Array.isArray(data) && data.length) siblingRows = data;
      } catch { /* single-record fallback below */ }
    }
    const orderItems: any[] = Array.isArray(viewModalData?.order?.items) ? viewModalData.order.items : [];
    let items: any[] = Array.isArray(record.items) && record.items.length ? record.items : [];
    if (!items.length && siblingRows.length > 1) {
      items = siblingRows.map(r => ({
        partName: r.part_name, productName: r.part_name, description: r.description,
        quantity: r.dispatch_qty ?? r.quantity, unit: r.unit, remarks: r.remarks,
      }));
    }
    if (!items.length && orderItems.length) items = orderItems;
    // Product ID → Product Master → Product Name (+ unit). Bare IDs are looked up
    // in finished-goods and raw-material masters, one batched query each.
    const ownNameOf = (item: any) => [item.partName, item.productName, item.part_name, item.description]
      .map(x => String(x ?? '').trim()).find(Boolean) || '';
    const idKeysOf = (item: any) => [ownNameOf(item), item.product_id, item.part_id, item.part_number]
      .map(x => String(x ?? '').trim()).filter(v => v && isBareId(v));
    const bareIds = Array.from(new Set(items.flatMap(idKeysOf)));
    const masterById = new Map<string, { name: string; unit: string }>();
    if (bareIds.length) {
      try {
        const { data } = await supabase.from('cnc_parts').select('part_no,part_name,unit').in('part_no', bareIds);
        (data || []).forEach((r: any) => { if (r.part_no) masterById.set(String(r.part_no), { name: r.part_name || '', unit: r.unit || '' }); });
      } catch { /* master unavailable — fall back below */ }
      const missing = bareIds.filter(id => !masterById.has(id));
      if (missing.length) {
        try {
          const { data } = await supabase.from('cnc_raw_materials').select('material_code,name,uom').in('material_code', missing);
          (data || []).forEach((r: any) => { if (r.material_code) masterById.set(String(r.material_code), { name: r.name || '', unit: r.uom || '' }); });
        } catch { /* fall back below */ }
      }
    }
    const masterHit = (item: any) => {
      for (const k of idKeysOf(item)) {
        const m = masterById.get(k);
        if (m && m.name) return m;
      }
      return null;
    };
    const itemName = (item: any, idx: number) => {
      const own = ownNameOf(item);
      if (own && !isBareId(own)) return stripSummary(own) || own;
      const hit = masterHit(item);
      if (hit) return stripSummary(hit.name);
      const linked = orderItems[idx];
      const linkName = linked
        ? [linked.partName, linked.productName, linked.part_name, linked.description]
            .map(x => String(x ?? '').trim()).find(v => v && !isBareId(v))
        : '';
      if (linkName) return stripSummary(linkName);
      if (linked) {
        const linkHit = masterHit(linked);
        if (linkHit) return stripSummary(linkHit.name);
      }
      const header = String(record.part_name || record.description || '').trim();
      if (!own && header && !isBareId(header)) return stripSummary(header);
      return stripSummary(own) || '—';
    };
    const itemUnit = (item: any) => {
      const hit = masterHit(item);
      if (hit && hit.unit) return hit.unit;
      const fromItem = String(item.unit || '').trim();
      if (fromItem) return fromItem;
      return String(record.unit || '').trim() || 'Nos';
    };
    const itemQty = (item: any) => Number(item.quantity ?? item.qty ?? item.dispatch_qty ?? 0) || 0;
    const rows: (string | number)[][] = items.length
      ? items.map((item: any, i: number) => [
          i + 1,
          itemName(item, i),
          itemQty(item) || '',
          itemUnit(item),
        ])
      : [[1, stripSummary(record.part_name || record.description) || '—',
          Number(record.dispatch_qty ?? record.quantity ?? 0) || '', String(record.unit || '').trim() || 'Nos']];
    const totalQty = items.length
      ? items.reduce((s: number, it: any) => s + itemQty(it), 0)
      : (Number(record.dispatch_qty ?? record.quantity ?? 0) || 0);
    const resolvedUnits = items.map((it: any) => itemUnit(it));
    const qtyUnit = (resolvedUnits.sort((a, b) =>
      resolvedUnits.filter(u => u === a).length - resolvedUnits.filter(u => u === b).length).pop()
      || String(record.unit || '').trim() || 'Nos');
    const customerName = String(record.customer_name || record.customer || '').trim();
    const soRef = String(record.sales_order_no || record.order_no || viewModalData?.order?.order_no || '').trim();
    return {
      companyName: company?.company_name || 'ARGUS CNC',
      title: 'Delivery Challan',
      documentNo: docNo,
      date: record.delivery_date || record.date,
      details: [
        ['Customer Name', customerName],
        ['Customer Address', record.billing_address || record.customer_address || record.delivery_address],
        ['Delivery Address', record.delivery_address || record.billing_address || record.customer_address],
      ] as [string, string | number | null | undefined][],
      details2: [
        ['Sales Order No.', soRef],
        ['Vehicle No.', record.vehicle_no],
        ['Transporter', record.transport || record.transporter],
        ['Delivery Date', record.delivery_date || record.date],
      ] as [string, string | number | null | undefined][],
      columns: ['S.No', 'Product / Description', 'Quantity', 'Unit'],
      rows,
      totals: [['Total Items', String(items.length || 1)], ['Total Quantity', `${totalQty} ${qtyUnit}`]] as [string, string][],
      signatures: ['Prepared By', 'Checked By', 'Received By (Customer Signature)'],
      premium: true,
    };
  };
  const downloadPipelineDocument = async (kind: 'dc' | 'invoice') => {
    const input = await pipelineDocumentInput(kind);
    try { if (input) await downloadBrandedDocument(input); }
    catch (error) { alert(error instanceof Error ? error.message : 'Unable to generate the document PDF.'); }
  };
  const viewPipelineDocument = async (kind: 'dc' | 'invoice') => {
    const input = await pipelineDocumentInput(kind);
    try { if (input) await viewBrandedDocument(input); }
    catch (error) { alert(error instanceof Error ? error.message : 'Unable to preview the document PDF.'); }
  };

  const [rawLeadsList, setRawLeadsList] = useState<any[]>([]);

  const resetEnquiryForm = (leads = rawLeadsList) => ({
    leadNo: generateUniqueProjectNo(leads),
    company: '', partName: '', partNumber: '', quantity: '', expectedDate: '', source: 'Direct',
    estimatedValue: '', receivedDate: new Date().toISOString().split('T')[0],
    contacts: [{ person: '', phone: '', email: '' }],
    remarks: '',
    items: [{ productName: '', quantity: '', files: [] as File[] }],
    files: [] as File[]
  });
  const [enquiryForm, setEnquiryForm] = useState(resetEnquiryForm());

  const [quoteForm, setQuoteForm] = useState<any>({
    quoteNo: '', customer: '', leadNo: '', quoteDate: '', validTill: '', salesperson: 'Admin',
    contacts: [{ person: '', phone: '', email: '' }],
    partName: '', partNumber: '', description: '', quantity: '', unitPrice: '', discount: '0', unitDiscount: '0', gst: '18',
    items: [{ id: crypto.randomUUID(), partName: '', partNumber: '', quantity: '', unitPrice: '', discount: '0', unitDiscount: '0', gst: '18' }],
    paymentTerms: '', deliveryTerms: '', remarks: ''
  });

  

  const emptyInwardItem = () => ({ partName: '', partNumber: '', quantity: '', price: '', discount: '0', gst: '18' });
  const emptyInwardPart = (defaults: any = {}) => ({ category: defaults.category || 'GOODS PURCHASE', referenceNo: defaults.referenceNo || '', inwardDate: defaults.inwardDate || new Date().toISOString().split('T')[0], remarks: defaults.remarks || '', files: [] as File[], productKey: defaults.productKey || '', productName: defaults.productName || '', enquiryId: defaults.enquiryId || '', projectName: defaults.projectName || '', items: [emptyInwardItem()] });
  const [inwardForm, setInwardForm] = useState<any>({
    inwardNo: '', category: 'GOODS PURCHASE', projectName: '', salesOrderRef: '', referenceNo: '', inwardDate: '', partyName: '', remarks: '',
    productName: '', productKey: '', productOptions: [], enquiryId: '', parts: [emptyInwardPart()],
    contacts: [{ person: '', phone: '', email: '' }]
  });

  const [knownCompanies, setKnownCompanies] = useState<any[]>([]);
  const [customerList, setCustomerList] = useState<any[]>([]);

  useEffect(() => {
    async function fetchCustomers() {
      const { data } = await supabase.from('cnc_customers').select('*');
      if (data) setCustomerList(data);
    }
    fetchCustomers();
  }, []);

  const allKnownCompanies = useMemo(() => {
    const map = new Map<string, { company: string; contact_person?: string; phone?: string; email?: string; city?: string; gst?: string }>();
    (knownCompanies || []).forEach((c: any) => {
      const name = c.company?.trim();
      if (!name) return;
      const key = name.toLowerCase();
      const existing = map.get(key);
      map.set(key, {
        company: name,
        contact_person: c.contact_person || existing?.contact_person || '',
        phone: c.phone || existing?.phone || '',
        email: c.email || existing?.email || '',
        city: c.city || existing?.city || '',
        gst: c.gst || existing?.gst || ''
      });
    });
    (customerList || []).forEach((c: any) => {
      const name = c.name?.trim();
      if (!name) return;
      const key = name.toLowerCase();
      const existing = map.get(key);
      map.set(key, {
        company: name,
        contact_person: existing?.contact_person || c.contact || '',
        phone: existing?.phone || c.phone || '',
        email: existing?.email || c.email || '',
        city: existing?.city || c.city || '',
        gst: existing?.gst || c.gst || c.gstin || c.gst_number || ''
      });
    });
    return Array.from(map.values()).sort((a, b) => a.company.localeCompare(b.company));
  }, [customerList, knownCompanies]);

  // Already-entered product names across enquiries — for the Product Name dropdown
  // (user can still type a brand-new product name).
  const existingProductNames = useMemo(() => {
    const map = new Map<string, string>();
    enquiryProductOptions(rawLeadsList).forEach((p: any) => {
      const n = String(p.name || '').trim();
      if (n && !map.has(n.toLowerCase())) map.set(n.toLowerCase(), n);
    });
    (rawLeadsList || []).forEach((l: any) => {
      const n = String(l.part_name || '').trim();
      if (n && !/^multiple\s*products/i.test(n) && !map.has(n.toLowerCase())) map.set(n.toLowerCase(), n);
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [rawLeadsList]);

  const fetchPipeline = async () => {
    setLoading(true);
    try {
    // Fetch all leads to build a lookup map for Unique Numbers
    const { data: allLeads, error: leadsErr } = await supabase.from('cnc_enquiries').select('id, lead_no, enquiry_no, status, pipeline_stage, customer, part_name, quantity, estimated_value, expected_date, contact_person, phone, email, enquiring_for, gst, city');
    if (leadsErr) console.error("Error fetching leads:", leadsErr);
    
    const leadMap = new Map();
    const compMap = new Map();
    
    if (allLeads) {
      setRawLeadsList(allLeads);
      allLeads.forEach(l => {
        leadMap.set(l.id, l.lead_no || l.enquiry_no);
        const comp = l.customer?.trim();
        if (comp) {
           const existing = compMap.get(comp);
           compMap.set(comp, {
             company: comp,
             contact_person: existing?.contact_person || l.contact_person || '',
             phone: existing?.phone || l.phone || '',
             email: existing?.email || l.email || '',
             gst: existing?.gst || l.gst || '',
             city: existing?.city || l.city || ''
           });
        }
      });
      setNewLeadForm((prev: any) => {
        if (!prev.leadNo || prev.leadNo.startsWith('PROJ-')) {
          return { ...prev, leadNo: generateUniqueProjectNo(allLeads) };
        }
        return prev;
      });
      setEnquiryForm((prev: any) => {
        if (!prev.leadNo || prev.leadNo.startsWith('PROJ-')) {
          return { ...prev, leadNo: generateUniqueProjectNo(allLeads) };
        }
        return prev;
      });
    }
    setKnownCompanies(Array.from(compMap.values()));

    // Load all quotes / orders for the reference maps (converted quotes and inwarded orders are still
    // needed to resolve project numbers downstream); only the active ones become cards.
    const { data: allQuotes, error: quotesErr } = await supabase.from('cnc_quotations').select('*');
    if (quotesErr) console.error("Error fetching quotations:", quotesErr);
    let resolvedQuotes: any[] = allQuotes && allQuotes.length > 0 ? allQuotes : [];
    const quoteMap = new Map();
    resolvedQuotes.forEach(q => quoteMap.set(q.id, leadMap.get(q.lead_id) || q.enquiry_no || q.quote_no));
    const quotes = resolvedQuotes.filter(q => ['Sent', 'Under Review', 'Draft'].includes(q.status));

    const { data: allOrders, error: ordersErr } = await supabase.from('cnc_sales_orders').select('*');
    if (ordersErr) console.error("Error fetching sales orders:", ordersErr);
    const orderMap = new Map();
    if (allOrders) allOrders.forEach(o => orderMap.set(o.order_no, o.lead_no || quoteMap.get(o.quotation_id) || o.order_no));
    const orders = allOrders?.filter(o => ['Draft', 'Confirmed', 'Waiting for Parts', 'In Production'].includes(o.status));

    const { data: inwards, error: inwardErr } = await supabase.from('cnc_inwards').select('*').neq('status', 'Deleted');

    const newCards: KanbanCard[] = [];

    // Filter leads for the Enquiry column
    const activeLeads = allLeads?.filter(l => ['New', 'Contacted', 'Qualified', 'Under Review'].includes(l.status) && l.pipeline_stage !== null) || [];

    activeLeads.forEach(l => newCards.push({
      id: `lead_${l.id}`, stage: 'Enquiry', type: 'lead',
      refNo: leadMap.get(l.id), customer: l.customer, part: formatLeadProductDisplay(l),
      qty: l.quantity, value: l.estimated_value, date: l.expected_date, status: l.status, raw: l
    }));

    if (quotes) quotes.forEach(q => newCards.push({
      id: `quote_${q.id}`, stage: 'Quotation', type: 'quotation',
      refNo: quoteMap.get(q.id) || q.enquiry_no || q.quote_no, customer: q.customer || q.customer_name, part: formatLeadProductDisplay(q),
      qty: q.quantity, value: q.total_value, date: q.valid_till || q.valid_until || q.date || q.quote_date, status: q.status, raw: q
    }));

    if (orders) orders.forEach(o => newCards.push({
      id: `order_${o.id}`, stage: 'Sales Order', type: 'order',
      refNo: orderMap.get(o.order_no), customer: o.customer || o.customer_name, part: formatLeadProductDisplay(o),
      qty: o.quantity || (o.items?.[0]?.quantity), value: Number(o.total_value ?? o.value) || 0, date: o.delivery_date, status: o.status, raw: o
    }));

    if (inwards && !inwardErr) {
      // Same unique number = one card (like history): group sibling inward rows.
      // Strip the order-time stamp suffix (e.g. 1010-28Sep26-0994PM -> 1010) so
      // repeat inwards for the same company + unique number land on one card.
      const baseUniqueNo = (s: any) => String(s || '').replace(/-\d{2}[A-Za-z]{3}\d{2}-\d{4}(AM|PM)$/, '');
      const groups = new Map<string, any[]>();
      inwards.forEach(i => {
        const key = baseUniqueNo(orderMap.get(i.sales_order_ref) || i.project_name || i.inward_no || i.id);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(i);
      });
      groups.forEach((list, key) => {
        const first = list[0];
        const parts = Array.from(new Set(list.map(x => x.product_name ? `${x.product_name} · ${x.part_name}` : x.part_name).filter(Boolean)));
        newCards.push({
          id: `inward_${first.id}`, stage: 'Inward', type: 'inward',
          refNo: key, customer: first.party_name,
          part: parts.slice(0, 3).join(', ') + (parts.length > 3 ? ` +${parts.length - 3} more` : ''),
          qty: list.reduce((s, x) => s + (Number(x.quantity) || 0), 0),
          value: list.reduce((s, x) => s + (Number(x.total_amount) || 0), 0),
          date: list.map(x => x.inward_date).filter(Boolean).sort().reverse()[0] || first.inward_date,
          status: first.status,
          raw: list.length > 1 ? { ...first, _groupIds: list.map(x => x.id), _groupCount: list.length } : first,
        });
      });
    }

    const { data: fgs } = await supabase.from('cnc_work_orders').select('*').in('status', ['Completed', 'In Progress']);
    const { data: dcs, error: dcErr } = await supabase.from('cnc_deliveries').select('*');
    if (dcErr) console.warn("Error fetching deliveries:", dcErr);
    let effectiveDcs: any[] = dcs && dcs.length > 0 ? dcs : [];

    let invoicesData: any[] = [];
    const { data: invs, error: invErr } = await supabase.from('cnc_invoices').select('*');
    if (invErr) console.error("Error fetching invoices:", invErr);
    else if (invs && invs.length > 0) invoicesData = invs;
    if (fgs) {
      // Same sales order = one card (like inward): group sibling FG rows so a
      // multi-product approval shows once with a per-product breakdown.
      const fgGroups = new Map<string, any[]>();
      fgs.filter(w => w.completed > 0 || w.status === 'Completed').forEach(w => {
        const key = orderMap.get(w.sales_order) || w.sales_order || w.wo_no || `WO-${w.id.substring(0, 4)}`;
        if (!fgGroups.has(key)) fgGroups.set(key, []);
        fgGroups.get(key)!.push(w);
      });
      fgGroups.forEach((list, key) => {
        const first = list[0];
        const names = Array.from(new Set(list.map(x => x.part_name).filter(Boolean)));
        // Per-product order quantities (for remaining = ordered − finished).
        const soRow = (allOrders || []).find((o: any) => String(o.order_no ?? '') !== '' && (String(o.order_no) === String(first.sales_order ?? '') || String(o.lead_no ?? '') === String(key)));
        let itemQty: Record<string, number> = {};
        try {
          const rawItems = (soRow as any)?.items;
          const parsed = typeof rawItems === 'string' ? JSON.parse(rawItems) : rawItems;
          if (Array.isArray(parsed)) parsed.forEach((it: any) => {
            const n = String(it.partName || it.productName || it.part_name || '').trim().toLowerCase();
            if (n) itemQty[n] = (itemQty[n] || 0) + (Number(it.quantity ?? it.qty) || 0);
          });
        } catch { /* per-product remaining unavailable */ }
        newCards.push({
          id: `fg_${first.id}`, stage: 'Finished Goods', type: 'finished_goods',
          refNo: key, customer: first.customer,
          part: names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3} more` : ''),
          qty: list.reduce((s, x) => s + (Number(x.completed) || 0), 0), value: 0,
          date: list.map(x => x.created_at).filter(Boolean).sort().reverse()[0]?.split('T')[0] || '',
          status: first.status,
          raw: list.length > 1 ? { ...first, _groupIds: list.map(x => x.id), _groupCount: list.length, _groupRows: list, _itemQty: itemQty } : { ...first, _itemQty: itemQty },
        });
      });
    }

    const dcMap = new Map();
    effectiveDcs.forEach(d => {
       const ref = d.delivery_no || orderMap.get(d.sales_order_no) || `DC-${d.id.substring(0,4)}`;
       if (d.delivery_no) dcMap.set(d.delivery_no, ref);
       newCards.push({ id: d.id, stage: 'DC', type: 'dc', refNo: ref, customer: d.customer_name || d.party_name || 'Customer', part: d.part_name, qty: d.dispatch_qty || d.quantity, value: 0, date: d.delivery_date, status: d.status, raw: d });
    });

    if (invoicesData && invoicesData.length > 0) {
      invoicesData.filter((inv: any) => !inv.pipeline_completed_at).forEach(inv => {
         const ref = inv.invoice_no || orderMap.get(inv.sales_order_no) || (inv.dc_no && dcMap.get(inv.dc_no)) || `INV-${inv.id.substring(0,4)}`;
         newCards.push({ id: inv.id, stage: 'Invoice', type: 'invoice', refNo: ref, customer: inv.customer_name || 'Customer', part: inv.item || inv.part_name || '-', qty: inv.quantity || 1, value: inv.amount || 0, date: inv.invoice_date || (inv.created_at ? inv.created_at.split('T')[0] : ''), status: inv.status, raw: inv });
      });
    }

    // ---- Order quantity reconciliation (single source of truth) ----
    // Summaries reconcile live rows: WO completed/rejected per sales order,
    // active deliveries, billable invoices and production batches. Rejected
    // quantity is visible for traceability, never as stock or billable qty.
    // Guarded: quantity extras must never blank the board on unexpected data.
    try {
    let batchesData: any[] = [];
    try {
      const { data: bq, error: bqErr } = await supabase.from('cnc_production_batches').select('*').limit(5000);
      if (!bqErr && bq) batchesData = bq;
    } catch { /* per-batch traceability unavailable; WO rows still reconcile */ }
    const qtyBySoNo = new Map<string, OrderQtySummary>();
    const qtyBySoId = new Map<string, OrderQtySummary>();
    (allOrders || []).forEach((o: any) => {
      const q = summarizeSalesOrder(o, fgs || [], effectiveDcs, invoicesData || [], batchesData);
      if (o.order_no) qtyBySoNo.set(String(o.order_no), q);
      if (o.id != null) qtyBySoId.set(String(o.id), q);
    });
    const qtyForDelivery = (d: any): OrderQtySummary | null => {
      if (d?.sales_order_id != null && qtyBySoId.has(String(d.sales_order_id))) return qtyBySoId.get(String(d.sales_order_id))!;
      if (d?.sales_order_no && qtyBySoNo.has(String(d.sales_order_no))) return qtyBySoNo.get(String(d.sales_order_no))!;
      return null;
    };
    const qtyForInvoice = (inv: any): OrderQtySummary | null => {
      if (inv?.sales_order_id != null && qtyBySoId.has(String(inv.sales_order_id))) return qtyBySoId.get(String(inv.sales_order_id))!;
      const dc = (effectiveDcs || []).find((dd: any) =>
        (inv?.delivery_id != null && String(dd.id) === String(inv.delivery_id)) ||
        (inv?.dc_no && String(dd.delivery_no) === String(inv.dc_no)));
      if (dc) return qtyForDelivery(dc);
      return null;
    };
    for (const c of newCards) {
      if (c.type === 'order' && c.raw?.order_no && qtyBySoNo.has(String(c.raw.order_no))) {
        c.qtyTrack = qtyBySoNo.get(String(c.raw.order_no))!;
      } else if (c.type === 'finished_goods' && c.raw?.sales_order) {
        c.qtyTrack = qtyBySoNo.get(String(c.raw.sales_order)) ?? null;
      } else if (c.type === 'dc') {
        c.qtyTrack = qtyForDelivery(c.raw);
      } else if (c.type === 'invoice') {
        c.qtyTrack = qtyForInvoice(c.raw);
      } else if (c.type === 'inward') {
        // Resolve the sales order (by ref, else by base unique number) so the
        // card uses the centralized reconciliation, not a parallel calculation.
        const rows = Array.isArray(c.raw?._groupIds) && c.raw._groupIds.length
          ? (inwards || []).filter((x: any) => c.raw._groupIds.includes(x.id))
          : [c.raw];
        const ref = String(rows.map((r: any) => r?.sales_order_ref).find(Boolean) ?? '');
        let hit: OrderQtySummary | null = ref && qtyBySoNo.has(ref) ? qtyBySoNo.get(ref)! : null;
        if (!hit) {
          const base = baseUniqueNo(rows[0]?.project_name || '');
          const o = base !== '' ? (allOrders || []).find((x: any) => baseUniqueNo(x.lead_no || '') === base) : null;
          if (o) hit = (o.order_no && qtyBySoNo.get(String(o.order_no))) || (o.id != null && qtyBySoId.get(String(o.id))) || null;
        }
        c.qtyTrack = hit;
        // Per-product inward remaining: received per part vs finished (work
        // orders scoped to the same base unique number).
        const bases = new Set([baseUniqueNo(c.refNo)]);
        const fin = new Map<string, number>();
        for (const w of (fgs || [])) {
          const rawKey = orderMap.get(w.sales_order) || w.sales_order || '';
          const b = rawKey ? baseUniqueNo(rawKey) : '';
          if (b !== '' && !bases.has(b)) continue;
          const n = String(w.part_name ?? '').trim().toLowerCase();
          if (!n) continue;
          fin.set(n, (fin.get(n) ?? 0) + (Number(w.completed) || 0));
        }
        const byName = new Map<string, { name: string; recv: number }>();
        rows.forEach((x: any) => {
          const n = String(x?.part_name || x?.product_name || '').trim() || '—';
          const e = byName.get(n.toLowerCase()) ?? { name: n, recv: 0 };
          e.recv += Number(x?.quantity) || 0;
          byName.set(n.toLowerCase(), e);
        });
        c.raw._inwardProd = [...byName.values()].map((e) => {
          const done = fin.get(e.name.toLowerCase()) ?? 0;
          return { name: e.name, recv: e.recv, done, left: Math.max(0, e.recv - done) };
        });
      }
    }
    } catch (e) {
      console.error('Quantity reconciliation failed; showing cards without quantity extras:', e);
    }

    try {
      let comms: any[] = [];
      const { data, error: commErr } = await supabase.from('cnc_pipeline_comments').select('record_id');
      if (data && !commErr) {
        comms = data;
      } else {
        comms = JSON.parse(localStorage.getItem('cnc_pipeline_comments') || '[]');
      }
      
      const counts: Record<string, number> = {};
      comms.forEach(c => {
         counts[c.record_id] = (counts[c.record_id] || 0) + 1;
      });
      setCommentCounts(counts);
    } catch {
      const comms = JSON.parse(localStorage.getItem('cnc_pipeline_comments') || '[]');
      const counts: Record<string, number> = {};
      comms.forEach((c: any) => {
         counts[c.record_id] = (counts[c.record_id] || 0) + 1;
      });
      setCommentCounts(counts);
    }

    setCards(newCards);
    } catch (err) {
      console.error("Error loading pipeline:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentActivities = async () => {
    const activities: any[] = [];
    
    const { data: recentEnq } = await supabase.from('cnc_enquiries').select('enquiry_no, customer, status, created_at').order('created_at', { ascending: false }).limit(3);
    if (recentEnq) recentEnq.forEach(r => activities.push({ type: 'enquiry', ref: r.enquiry_no, customer: r.customer, action: r.status === 'New' ? 'received' : r.status?.toLowerCase() || 'updated', time: r.created_at, color: 'bg-blue-500' }));

    const { data: recentQuotes } = await supabase.from('cnc_quotations').select('quote_no, customer, status, created_at').order('created_at', { ascending: false }).limit(3);
    if (recentQuotes) recentQuotes.forEach(r => activities.push({ type: 'quotation', ref: r.quote_no, customer: r.customer, action: (r.status === 'Converted' || r.status === 'Accepted') ? 'accepted' : 'sent', time: r.created_at, color: 'bg-purple-500' }));

    const { data: recentSO } = await supabase.from('cnc_sales_orders').select('order_no, customer, status, created_at').order('created_at', { ascending: false }).limit(3);
    if (recentSO) recentSO.forEach(r => activities.push({ type: 'sales_order', ref: r.order_no, customer: r.customer, action: 'confirmed', time: r.created_at, color: 'bg-emerald-500' }));

    const { data: recentInw } = await supabase.from('cnc_inwards').select('inward_no, party_name, status, created_at').order('created_at', { ascending: false }).limit(3);
    if (recentInw) recentInw.forEach(r => activities.push({ type: 'inward', ref: r.inward_no, customer: r.party_name, action: 'received', time: r.created_at, color: 'bg-orange-500' }));

    const { data: recentDC } = await supabase.from('cnc_deliveries').select('delivery_no, customer_name, status, created_at').order('created_at', { ascending: false }).limit(3);
    if (recentDC) recentDC.forEach(r => activities.push({ type: 'dc', ref: r.delivery_no, customer: r.customer_name, action: 'dispatched', time: r.created_at, color: 'bg-rose-500' }));

    try {
      const { data: recentInv } = await supabase.from('cnc_invoices').select('invoice_no, customer_name, status, created_at').order('created_at', { ascending: false }).limit(3);
      if (recentInv) recentInv.forEach(r => activities.push({ type: 'invoice', ref: r.invoice_no, customer: r.customer_name, action: 'generated', time: r.created_at, color: 'bg-indigo-500' }));
    } catch (err) { console.error("Error fetching recent invoices:", err); }

    // Sort all by time descending and take top 5
    activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    setRecentActivities(activities.slice(0, 5));
  };

  const [seeding, setSeeding] = useState(false);

  const handleResetAndSeed = async (silent = false) => {
    if (!silent && !window.confirm("Are you sure you want to delete all existing pipeline data and generate 5 real-time dummy records for each of the 7 stages?")) {
      return;
    }
    setSeeding(true);
    setLoading(true);
    try {
      await resetAndSeedAllPipelineData(company?.id);
      await fetchPipeline();
      await fetchRecentActivities();
      if (!silent) {
        alert("Pipeline successfully cleared and seeded with 5 real-time records per stage!");
      }
    } catch (err: any) {
      console.error("Seeder error:", err);
      if (!silent) {
        alert("Error while resetting pipeline: " + (err?.message || "Unknown error"));
      }
    } finally {
      setSeeding(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    // Auto-seed permanently disabled: it used to wipe pipeline tables and
    // re-insert dummy companies on first visit, resurrecting deleted leads.
    fetchPipeline();
    fetchRecentActivities();
  }, [company?.id]);

  const parseContacts = (raw: any) => {
    if (!raw) return [{ person: '', phone: '', email: '' }];
    const persons = (raw.contact_person || '').split(' | ').map((s: string) => s.trim());
    const phones = (raw.phone || '').split(' | ').map((s: string) => s.trim());
    const emails = (raw.email || '').split(' | ').map((s: string) => s.trim());
    const maxLen = Math.max(persons.length, phones.length, emails.length, 1);
    const parsed = Array.from({ length: maxLen }).map((_, i) => ({ person: persons[i] || '', phone: phones[i] || '', email: emails[i] || '' }));
    const hasData = parsed.some(c => c.person || c.phone || c.email);
    return hasData ? parsed : [{ person: '', phone: '', email: '' }];
  };

  const handleCompanyChange = (val: string) => {
    setEnquiryForm((prev: any) => {
      const form = { ...prev, company: val };
      const matched = allKnownCompanies.find(c => c.company.toLowerCase() === val.toLowerCase());
      if (matched) {
        form.contacts = parseContacts(matched);
      }
      return form;
    });
  };

    const handleCompleteInvoice = async (card: KanbanCard) => {
      if (!window.confirm(`Mark "${card.refNo}" as complete? This will save the full deal history under the customer's lead.`)) return;
      setLoading(true);
      try {
        // 1. Collect all the lineage data for this invoice
        const invoiceData = card.raw;
        const customer = card.customer;

        // Try to find the full chain: invoice -> DC -> FG -> Inward -> SO -> Quotation -> Enquiry
        const soRef = invoiceData.sales_order_no || '';
        let leadNo = '';
        let leadId = '';
        const totalValue = Number(invoiceData.amount) || 0;
        let parts: any[] = [];

        // Find SO
        if (soRef) {
          const { data: so } = await supabase.from('cnc_sales_orders').select('*').eq('order_no', soRef).single();
          if (so) {
            if (so.items && Array.isArray(so.items)) parts = so.items;
            leadNo = so.lead_no || '';
            if (so.quotation_id) {
              const { data: qt } = await supabase.from('cnc_quotations').select('*').eq('id', so.quotation_id).single();
              if (qt && qt.lead_id) {
                leadId = qt.lead_id;
                leadNo = qt.enquiry_no || leadNo;
              }
            }
          }
        }

        // If we still don't have a lead, try to find by customer name
        if (!leadId && customer) {
          const { data: enq } = await supabase.from('cnc_enquiries').select('id, lead_no').eq('customer', customer).order('created_at', { ascending: false }).limit(1).single();
          if (enq) { leadId = enq.id; leadNo = enq.lead_no || leadNo; }
        }

        // 2. Save purchase history record
        const historyRecord = {
          id: crypto.randomUUID(),
          customer: customer,
          lead_id: leadId || null,
          lead_no: leadNo || '',
          invoice_no: card.refNo,
          invoice_date: invoiceData.invoice_date || invoiceData.created_at || new Date().toISOString(),
          part_name: card.part || invoiceData.part_name || '',
          quantity: Number(card.qty) || 0,
          total_value: totalValue,
          parts: parts.length > 0 ? parts : null,
          sales_order_ref: soRef || '',
          completed_at: new Date().toISOString()
        };

        // Try to insert into purchase_history table, if it doesn't exist we'll store in enquiry remarks
        const { error: histErr } = await supabase.from('cnc_purchase_history').insert([historyRecord]);
        
        if (histErr) {
          // Table doesn't exist yet - store as JSON in enquiry's remarks field instead
          if (leadId) {
            const { data: existingEnq } = await supabase.from('cnc_enquiries').select('remarks').eq('id', leadId).single();
            let existingHistory: any[] = [];
            try { if (existingEnq?.remarks) existingHistory = JSON.parse(existingEnq.remarks); } catch { existingHistory = []; }
            if (!Array.isArray(existingHistory)) existingHistory = [];
            existingHistory.push(historyRecord);
            await supabase.from('cnc_enquiries').update({ remarks: JSON.stringify(existingHistory), status: 'Converted' }).eq('id', leadId);
          }
        }

        // Completion is pipeline history metadata; invoice payment status stays derived
        // from the same receipt records shown on the Invoices and Bank & Cash pages.
        const { error: completionError } = await supabase.from('cnc_invoices')
          .update({ pipeline_completed_at: new Date().toISOString() }).eq('id', card.raw.id);
        if (completionError) throw completionError;

        fetchPipeline();
      } catch (err: any) {
        alert("Error completing invoice: " + err.message);
      }
      setLoading(false);
    };

    const handleDeleteCard = async (e: React.MouseEvent, card: KanbanCard) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete this ${card.type}?`)) return;
    let table = '';
    if (card.type === 'lead') table = 'cnc_enquiries';
    if (card.type === 'quotation') table = 'cnc_quotations';
    if (card.type === 'order') table = 'cnc_sales_orders';
    if (card.type === 'inward') table = 'cnc_inwards';
    if (card.type === 'finished_goods') table = 'cnc_work_orders';
    if (card.type === 'dc') table = 'cnc_deliveries';
    if (card.type === 'invoice') table = 'cnc_invoices';

    if (table) {
      setLoading(true);
      const { error } = await supabase.from(table).delete().eq('id', card.raw.id);
      if (error) alert("Error deleting: " + error.message);
      else fetchPipeline();
      setLoading(false);
    }
  };

  const getContactStrings = (form: any) => {
    const contacts = form.contacts || [];
    return {
      person: contacts.map((c: any) => c.person).join(' | '),
      phone: contacts.map((c: any) => c.phone).join(' | '),
      email: contacts.map((c: any) => c.email).join(' | '),
    };
  };

  const openViewModal = async (card: KanbanCard) => {
    setViewModalTarget(card);
    setLoading(true);
    const aggregated: any = { enquiry: null, quotation: null, order: null, inward: null, finished_goods: null, dc: null, invoice: null };
      const parseItems = (rawObj: any, field: string) => {
        if (!rawObj || !rawObj[field]) return;
        try { const parsed = JSON.parse(rawObj[field]); if (Array.isArray(parsed)) rawObj.items = parsed; } catch { /* not JSON */ }
      };
    try {
      if (card.type === 'inward') {
        aggregated.inward = card.raw;
        if (Array.isArray((card.raw as any)._groupIds) && (card.raw as any)._groupIds.length > 1) {
          try {
            const { data: groupRows } = await supabase.from('cnc_inwards').select('*').in('id', (card.raw as any)._groupIds).order('created_at', { ascending: true });
            if (groupRows && groupRows.length > 1) aggregated.inwards = groupRows;
          } catch { /* single-record fallback below */ }
        }
        // Backfill a missing product link for display only, when unambiguous:
        // rows saved before product_name existed recover it from a single-product enquiry.
        try {
          const scope = (Array.isArray(aggregated.inwards) && aggregated.inwards.length ? aggregated.inwards : [aggregated.inward]).filter(Boolean);
          const lacking = scope.filter((r: any) => !r.product_name && r.project_name);
          if (lacking.length) {
            const baseOf = (s: any) => String(s || '').replace(/-\d{2}[A-Za-z]{3}\d{2}-\d{4}(AM|PM)$/, '');
            const bases = Array.from(new Set(lacking.map((r: any) => baseOf(r.project_name)).filter(Boolean))) as string[];
            if (bases.length) {
              const { data: enqs } = await supabase.from('cnc_enquiries').select('lead_no,enquiry_no,part_name,enquiring_for').in('lead_no', bases);
              const byBase = new Map((enqs || []).map((e: any) => [String(e.lead_no || e.enquiry_no), e]));
              lacking.forEach((r: any) => {
                const marker = /\[Product:\s*([^\]]+)\]/.exec(String(r.remarks || ''));
                if (marker && marker[1].trim()) { r.product_name = marker[1].trim(); return; }
                const e = byBase.get(baseOf(r.project_name));
                if (!e) return;
                let names: string[] = [];
                try {
                  const parsed = typeof e.enquiring_for === 'string' ? JSON.parse(e.enquiring_for) : e.enquiring_for;
                  if (Array.isArray(parsed)) names = parsed.map((it: any) => String(it.productName || it.partName || it.part_name || '').trim()).filter(Boolean);
                } catch { /* plain text */ }
                if (!names.length && e.part_name) names = [String(e.part_name).trim()];
                if (names.length === 1 && names[0]) r.product_name = names[0];
              });
            }
          }
        } catch { /* dashes stay dashes */ }
        if (card.raw.sales_order_ref) {
           const { data: ord } = await supabase.from('cnc_sales_orders').select('*').eq('order_no', card.raw.sales_order_ref).single();
           if (ord) {
             aggregated.order = ord;
             if (ord.quotation_id) {
               const { data: qt } = await supabase.from('cnc_quotations').select('*').eq('id', ord.quotation_id).single();
               if (qt) {
                 aggregated.quotation = qt;
                 if (qt.lead_id) {
                   const { data: enq } = await supabase.from('cnc_enquiries').select('*').eq('id', qt.lead_id).single();
                   if (enq) aggregated.enquiry = enq;
                 }
               }
             }
           }
        }
      } else if (card.type === 'order') {
        aggregated.order = card.raw;
        if (card.raw.quotation_id) {
           const { data: qt } = await supabase.from('cnc_quotations').select('*').eq('id', card.raw.quotation_id).single();
           if (qt) {
             aggregated.quotation = qt;
             if (qt.lead_id) {
               const { data: enq } = await supabase.from('cnc_enquiries').select('*').eq('id', qt.lead_id).single();
               if (enq) aggregated.enquiry = enq;
             }
           }
        }
      } else if (card.type === 'quotation') {
        aggregated.quotation = card.raw;
        if (card.raw.lead_id) {
           const { data: enq } = await supabase.from('cnc_enquiries').select('*').eq('id', card.raw.lead_id).single();
           if (enq) aggregated.enquiry = enq;
        }
      } else if (card.type === 'lead') {
        aggregated.enquiry = card.raw;
      } else if (card.type === 'finished_goods') {
        aggregated.finished_goods = card.raw;
        if (card.raw.sales_order) {
          try {
            const { data: ord } = await supabase.from('cnc_sales_orders').select('*').eq('order_no', card.raw.sales_order).maybeSingle();
            if (ord) aggregated.order = ord;
          } catch { /* order linkage stays empty */ }
        }
      } else if (card.type === 'dc') {
        aggregated.dc = card.raw;
        // Optionally try to fetch order if we had a sales order id
        if (card.raw.sales_order_no) {
           const { data: ord } = await supabase.from('cnc_sales_orders').select('*').eq('order_no', card.raw.sales_order_no).single();
           if (ord) aggregated.order = ord;
        }
      } else if (card.type === 'invoice') {
        aggregated.invoice = card.raw;
        try {
          const { data: invItems } = await supabase.from('cnc_invoice_items').select('description,quantity,unit,rate,hsn,gst_rate,amount').eq('invoice_id', card.raw.id).order('line_no');
          if (invItems && invItems.length) {
            aggregated.invoice = {
              ...card.raw,
              items: invItems.map((r: any) => ({
                partName: r.description, quantity: r.quantity, unit: r.unit,
                unitPrice: r.rate, rate: r.rate, hsn: r.hsn, gst_rate: r.gst_rate, amount: r.amount,
              })),
            };
          }
        } catch { /* header-only fallback */ }
        // Source lineage: Quotation → Sales Order → Finished Goods → DC → Invoice.
        try {
          let dc: any = null;
          if (card.raw.delivery_id) {
            const { data } = await supabase.from('cnc_deliveries').select('*').eq('id', card.raw.delivery_id).limit(1);
            dc = (data ?? [])[0] ?? null;
          }
          if (!dc && card.raw.dc_no) {
            const { data } = await supabase.from('cnc_deliveries').select('*').eq('delivery_no', card.raw.dc_no).limit(1);
            dc = (data ?? [])[0] ?? null;
          }
          if (dc) {
            aggregated.dc = dc;
            const soNo = dc.sales_order_no || dc.sales_order_ref;
            if (soNo) {
              const { data: ord } = await supabase.from('cnc_sales_orders').select('*').eq('order_no', soNo).limit(1);
              if ((ord ?? []).length > 0) {
                aggregated.order = ord![0];
                if (ord![0].quotation_id) {
                  const { data: qt } = await supabase.from('cnc_quotations').select('*').eq('id', ord![0].quotation_id).limit(1);
                  if ((qt ?? []).length > 0) aggregated.quotation = qt![0];
                }
              }
            }
          } else if (card.raw.sales_order_id) {
            const { data: ord } = await supabase.from('cnc_sales_orders').select('*').eq('id', card.raw.sales_order_id).limit(1);
            if ((ord ?? []).length > 0) {
              aggregated.order = ord![0];
              if (ord![0].quotation_id) {
                const { data: qt } = await supabase.from('cnc_quotations').select('*').eq('id', ord![0].quotation_id).limit(1);
                if ((qt ?? []).length > 0) aggregated.quotation = qt![0];
              }
            }
          }
        } catch { /* lineage stays empty */ }
      }
    } catch (e) {
       console.error("Error fetching lineage", e);
    }
    if (aggregated.enquiry) parseItems(aggregated.enquiry, 'enquiring_for');
      if (aggregated.quotation) parseItems(aggregated.quotation, 'description');
      // Quantity tracking: one reconciliation (good / rejected / remaining /
      // FG available / delivered / invoiced) shared by every stage view.
      try {
        const soRef = String(aggregated.order?.order_no || '');
        const soId = aggregated.order?.id != null ? String(aggregated.order.id) : null;
        if (soRef || soId) {
          const { summary } = await fetchOrderQty(soId, soRef);
          if (summary) (aggregated as any).qtyTracking = summary;
        }
      } catch { /* details stay backward-compatible */ }
      setViewModalData(aggregated);
    
    // Load mock images for all records in the pipeline history
    const loaded: Record<string, string> = {};
    for (const k of Object.keys(aggregated)) {
      const rec = aggregated[k];
      if (rec) {
        const key = rec.part_name || rec.id;
        if (key) {
          const u = await getMockImage(key);
          if (u) loaded[key] = u;
        }
      }
    }
    setMockImages(prev => ({ ...prev, ...loaded }));
    
    setLoading(false);
  };

  const closeViewModal = () => {
    setViewModalTarget(null);
    setViewModalData(null);
    setViewEditMode(false);
  };

  const handleDragStart = (e: React.DragEvent, card: KanbanCard) => {
    e.dataTransfer.setData('text/plain', String(card.id));
    setDraggedCard(card);
  };

  const handleDrop = async (e: React.DragEvent, toStage: Stage) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('text/plain');
    const card = draggedCard || cards.find(c => String(c.id) === String(cardId));
    if (!card) {
      alert("Error: Could not identify the dragged card. Please try again.");
      return;
    }
    if (card.stage === toStage) return;
    
    try {

    if (card.type === 'lead' && toStage === 'Quotation') {
      const qNo = `QT-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      // Parse individual parts from the lead's enquiring_for JSON
      let parsedParts: any[] = [];
      try {
        const raw = card.raw.enquiring_for;
        if (raw) {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (Array.isArray(parsed)) parsedParts = parsed;
        }
      } catch { /* not valid JSON */ }
      
      // Build items array with individual pricing fields per part
      const quoteItems = parsedParts.length > 0 
        ? parsedParts.map((p: any) => ({
            id: crypto.randomUUID(),
            partName: p.partName || p.part_name || '',
            partNumber: p.partNumber || p.part_number || '',
            quantity: (p.quantity || p.qty || '0').toString(),
            filePaths: Array.isArray(p.filePaths) ? p.filePaths : [],
            unitPrice: '',
            discount: '0',
            unitDiscount: '0',
            gst: '18'
          }))
        : [{
            id: crypto.randomUUID(),
            partName: card.part || '',
            partNumber: card.raw.part_no !== 'N/A' ? (card.raw.part_no || '') : '',
            quantity: card.qty?.toString() || '',
            unitPrice: '',
            discount: '0',
            unitDiscount: '0',
            gst: '18',
            files: [],
            filePaths: []
          }];

      setQuoteForm({
        quoteNo: qNo, customer: card.customer, leadNo: card.refNo, quoteDate: new Date().toISOString().split('T')[0], validTill: card.date || '', salesperson: userName,
        contacts: parseContacts(card.raw),
        items: quoteItems,
        paymentTerms: '', deliveryTerms: '', remarks: ''
      });
      setQuotationModalTarget(card);
    } else if (card.type === 'quotation' && toStage === 'Sales Order') {
      const oNo = `SO-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      
      const q = Number(card.qty) || 0;
      let p = Number(card.raw.unit_price) || 0;
      if (!p && card.value && card.qty) {
        const d = Number(card.raw.discount_percent) || 0;
        const ud = Number(card.raw.unit_discount) || 0;
        const g = Number(card.raw.gst_percent) || 0;
        p = Number(((card.value / (q * (1 + g/100)) + ud) / (1 - d/100 || 1)).toFixed(2));
      }
      
      const item = {
         id: crypto.randomUUID(),
         partName: card.part,
         partNumber: card.raw.part_number || '',
         description: card.raw.description || '',
         quantity: q.toString(),
         unitPrice: p.toString(),
         discount: (card.raw.discount_percent || 0).toString(),
         unitDiscount: (card.raw.unit_discount || 0).toString(),
         gst: (card.raw.gst_percent || 18).toString(),
         filePaths: Array.isArray((card.raw as any).filePaths) ? (card.raw as any).filePaths : []
      };
      
      let itemsArr: any[] = [];
      try { itemsArr = JSON.parse(card.raw.description); } catch { /* plain-text description */ }
      let finalItems = [];
      if (itemsArr && Array.isArray(itemsArr) && itemsArr.length > 0) {
        finalItems = itemsArr.map(i => ({
          id: crypto.randomUUID(), partName: i.partName || i.productName || '', partNumber: i.partNumber || i.part_number || '', description: '',
          quantity: i.quantity?.toString() || '0', unitPrice: (i.unitPrice || p).toString(),
          discount: (i.discount || card.raw.discount_percent || 0).toString(),
          unitDiscount: (i.unitDiscount || card.raw.unit_discount || 0).toString(),
          gst: (i.gst || card.raw.gst_percent || 18).toString(),
          filePaths: Array.isArray(i.filePaths) ? i.filePaths : []
        }));
      } else {
        finalItems = [item];
      }
      
      const totalVal = card.value || 0;

      const nowStamp = new Date();
      const monNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const stampSuffix = `${String(nowStamp.getDate()).padStart(2, '0')}${monNames[nowStamp.getMonth()]}${String(nowStamp.getFullYear()).slice(-2)}-${String(nowStamp.getHours() % 12 || 12).padStart(2, '0')}${String(nowStamp.getMinutes()).padStart(2, '0')}${nowStamp.getHours() >= 12 ? 'PM' : 'AM'}`;
      const baseUnique = (card.refNo || '').trim();
      const stampedLeadNo = baseUnique
        ? (/-\d{2}[A-Za-z]{3}\d{2}-\d{4}(AM|PM)$/.test(baseUnique) ? baseUnique : `${baseUnique}-${stampSuffix}`)
        : stampSuffix;

      const { error } = await supabase.from('cnc_sales_orders').insert([{
        id: crypto.randomUUID(),
        order_no: oNo, customer: card.customer, customer_id: card.raw.customer_id || null, quote_no: card.raw.quote_no || '',
        contact_person: card.raw.contact_person, phone: card.raw.phone, email: card.raw.email,
        billing_address: '', delivery_address: '',
        shipping_contact: '', shipping_phone: '',
        lead_no: stampedLeadNo, order_date: new Date().toISOString().split('T')[0],
        customer_po_no: '', customer_po_date: null,
        items: finalItems,

        part_name: item.partName, part_number: item.partNumber, part_no: item.partNumber,
        quantity: q, delivered: 0,
        value: totalVal, total_value: totalVal,
        
        delivery_date: new Date().toISOString().split('T')[0], status: 'Confirmed',
        payment_terms: card.raw.payment_terms || 'Net 30', special_instructions: '',
        internal_remarks: '',
        quotation_id: card.raw.id
      }]);
      
      if (!error) {
        await supabase.from('cnc_quotations').update({ status: 'Converted' }).eq('id', card.raw.id);
        fetchPipeline();
      } else {
        alert("Error creating sales order: " + error.message);
      }
    } else if (card.type === 'order' && toStage === 'Inward') {
      const products = enquiryProductOptions(rawLeadsList, card.refNo);
      const selectedProduct = products[0];
      setInwardForm({
        inwardNo: '', category: 'GOODS PURCHASE', projectName: card.refNo || '', salesOrderRef: card.raw.order_no || '', referenceNo: '', inwardDate: new Date().toISOString().split('T')[0], partyName: card.customer, remarks: '',
        productName: selectedProduct?.name || '', productKey: selectedProduct?.key || '', productOptions: products, enquiryId: selectedProduct?.enquiryId || '',
        parts: [{ ...emptyInwardPart(), productKey: selectedProduct?.key || '', productName: selectedProduct?.name || '', enquiryId: selectedProduct?.enquiryId || '', projectName: selectedProduct?.leadNo || card.refNo || '' }],
        contacts: parseContacts(card.raw)
      });
      setInwardModalTarget(card);
    } else if (card.type === 'inward' && toStage === 'Finished Goods') {
      // Costing gate: open the Finished Goods + Costing modal instead of moving.
      // Nothing is written until the user approves inside the modal; Cancel
      // leaves the card (and the database) exactly where it was.
      setCostingModalTarget(card);
    } else if (card.type === 'finished_goods' && toStage === 'DC') {
      // Prefill with the deliverable quantity: never more than the good FG
      // available for the order (good completed minus already delivered).
      // Re-validated against live rows on save.
      const avail = card.qtyTrack ? Math.max(0, card.qtyTrack.fgAvailable) : null;
      const wanted = Number(card.qty) || 0;
      setDcForm({
         dcNo: `DC-2026-${Math.floor(1000 + Math.random() * 9000)}`,
         date: new Date().toISOString().split('T')[0], partyName: card.customer,
         partName: card.part, quantity: String(avail == null ? (card.qty?.toString() || '0') : Math.min(wanted, avail)),
         availableQty: avail, price: '',
         poNumber: card.raw.sales_order || card.raw.wo_no || '', vehicleNo: '', ewayBill: ''
      });
      setDcModalTarget(card);
    } else if (card.type === 'dc' && toStage === 'Invoice') {
      // Approved-price gate: open the invoice modal backed by FG costing instead
      // of the manual-price entry form. Nothing is written until approval there.
      setInvoiceCostingTarget(card);
    } else {
      if ((card.type === 'inward' && toStage === 'DC') || (card.type === 'inward' && toStage === 'Invoice') || (card.type === 'finished_goods' && toStage === 'Invoice')) {
         alert(`Please complete ${card.type === 'inward' ? 'Finished Goods entry' : 'the Delivery Challan'} before moving to ${toStage}.`);
      } else {
         alert(`Cannot drag ${card.stage} directly to ${toStage}. Please follow the sequence.`);
      }
    }
    } catch(err: any) {
      alert("Runtime Error in handleDrop: " + err.message);
    }
  };

  // Duplicate = new enquiry using the old one as a template (new number,
  // new record, New status). Only enquiry-level fields are copied; nothing
  // downstream (quotations, orders, production, DCs, invoices) is touched.
  // Attachment paths are referenced (never moved/deleted); new uploads merge
  // on save through the existing saveEnquiry flow.
  const duplicateEnquiry = (card: KanbanCard) => {
    const raw = card.raw ?? {};
    let parsed: any[] = [];
    try {
      const ef = raw.enquiring_for;
      const p = typeof ef === 'string' ? JSON.parse(ef) : ef;
      if (Array.isArray(p)) parsed = p;
    } catch { /* fall back to part_name below */ }
    const mapped = parsed
      .map((it: any) => ({
        productName: String(it.productName || it.partName || it.part_name || '').trim(),
        partName: String(it.productName || it.partName || it.part_name || '').trim(),
        quantity: it.quantity ?? it.qty ?? '',
        remarks: it.remarks || '',
        filePaths: Array.isArray(it.filePaths) ? [...it.filePaths] : [],
        files: [] as File[],
      }))
      .filter((it: any) => it.productName);
    if (mapped.length === 0 && String(raw.part_name || '').trim()) {
      mapped.push({
        productName: String(raw.part_name).trim(),
        partName: String(raw.part_name).trim(),
        quantity: raw.quantity ?? '',
        remarks: '',
        filePaths: [],
        files: [] as File[],
      });
    }
    setEnquiryForm({
      ...resetEnquiryForm(),
      company: raw.customer || '',
      expectedDate: raw.expected_date || '',
      source: raw.source || 'Direct',
      estimatedValue: raw.estimated_value ?? '',
      receivedDate: new Date().toISOString().split('T')[0],
      contacts: [{ person: raw.contact_person || '', phone: raw.phone || '', email: raw.email || '' }],
      items: mapped.length ? mapped : [{ productName: '', quantity: '', files: [] as File[] }],
    });
    setDuplicateSource(raw.lead_no || raw.enquiry_no || card.refNo || '');
    setEnquiryModalOpen(true);
  };

  const saveEnquiry = async () => {
    if (!enquiryForm.company) { alert("Please enter a company name."); return; }
    const enteredProducts = (enquiryForm.items || []).filter((item: any) => String(item.productName || item.partName || '').trim());
    if (!enteredProducts.length) { alert('Please enter at least one product name.'); return; }
    if (enteredProducts.some((item: any) => Number(item.quantity) < 0)) { alert('Product quantities cannot be negative.'); return; }
    if (enteredProducts.some((item: any) => (item.files || []).length) && !company?.id) {
      alert('Select a company before uploading product files.');
      return;
    }
    setLoading(true);
    try {
      const itemsToSave = await Promise.all(enteredProducts.map(async (item: any) => {
        const uploadedPaths = company?.id
          ? await Promise.all((item.files || []).map((file: File) => uploadEnquiryProductFile(company.id!, file)))
          : [];
        return {
          productName: String(item.productName || item.partName).trim(),
          partName: String(item.productName || item.partName).trim(),
          quantity: item.quantity || '0',
          remarks: item.remarks || '',
          filePaths: [...(item.filePaths || []), ...uploadedPaths],
        };
      }));
      const firstItem = itemsToSave[0];
      const productNamesList = itemsToSave.map((it: any) => it.productName).join(', ');
      const multiplePartsString = itemsToSave.length > 1 ? `${productNamesList} (${itemsToSave.length} Products)` : firstItem.productName;
      const totalQty = itemsToSave.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 0), 0);
      const cStr = getContactStrings(enquiryForm);
      const payload: any = {
        id: crypto.randomUUID(), lead_no: enquiryForm.leadNo, enquiry_no: enquiryForm.leadNo, customer: enquiryForm.company,
        contact_person: cStr.person, phone: cStr.phone, email: cStr.email,
        enquiring_for: JSON.stringify(itemsToSave),
        part_name: multiplePartsString, part_no: 'N/A', quantity: totalQty,
        expected_date: enquiryForm.expectedDate || null, received_date: enquiryForm.receivedDate || new Date().toISOString().split('T')[0], estimated_value: Number(enquiryForm.estimatedValue) || 0,
        source: enquiryForm.source, status: 'New', pipeline_stage: 'Enquiry'
      };
      if (company?.id) payload.company_id = company.id;

      const { error } = await supabase.from('cnc_enquiries').insert([payload]);
      if (!error) { 
        setEnquiryModalOpen(false); 
        setEnquiryForm(resetEnquiryForm()); 
        setDuplicateSource(null);
        fetchPipeline(); 
      } else { 
        alert("Error saving enquiry: " + error.message); 
      }
    } catch (err: any) {
      alert("Error saving enquiry: " + (err?.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const saveQuotation = async () => {
    if (!quotationModalTarget) return;
    const cStr = getContactStrings(quoteForm);
    const leadId = quotationModalTarget.raw?.id || null;
    if (!quoteForm.customer) { alert("Please enter the customer."); return; }

    // Use multi-part items if available, fallback to single-part legacy fields
    const rawItems = quoteForm.items && Array.isArray(quoteForm.items) && quoteForm.items.length > 0 ? quoteForm.items : [{
      partName: quoteForm.partName || '', partNumber: quoteForm.partNumber || '',
      quantity: quoteForm.quantity || '0', unitPrice: quoteForm.unitPrice || '0',
      discount: quoteForm.discount || '0', unitDiscount: quoteForm.unitDiscount || '0', gst: quoteForm.gst || '18',
      files: [], filePaths: []
    }];

    if (rawItems.some((it: any) => (it.files || []).length) && !company?.id) {
      alert('Select a company before uploading product files.');
      return;
    }
    setLoading(true);
    let items: any[] = rawItems;
    try {
      items = await Promise.all(rawItems.map(async (it: any) => {
        const uploaded = company?.id
          ? await Promise.all((it.files || []).map((f: File) => uploadEnquiryProductFile(company.id!, f)))
          : [];
        const { files, ...rest } = it;
        return { ...rest, filePaths: [...(it.filePaths || []), ...uploaded] };
      }));
    } catch (err: any) {
      setLoading(false);
      alert(err?.message || 'File upload failed.');
      return;
    }

    const totalQty = items.reduce((sum: number, i: any) => sum + (Number(i.quantity) || 0), 0);
    const totalValue = items.reduce((sum: number, i: any) => {
      const q = Number(i.quantity) || 0; const p = Number(i.unitPrice) || 0;
      const d = Number(i.discount) || 0; const ud = Number(i.unitDiscount) || 0; const g = Number(i.gst) || 0;
      const discountedUnit = Math.max(0, p * (1 - d / 100) - ud);
      return sum + (q * discountedUnit * (1 + g / 100));
    }, 0);
    
    const firstItem = items[0];
    const itemNamesList = items.map((i: any) => String(i.partName || i.productName || i.description || '').trim()).filter(Boolean).join(', ');
    const partNameStr = items.length > 1 ? `${itemNamesList} (${items.length} Products)` : (firstItem.partName || 'TBD');

    const quotePayload: any = {
      id: crypto.randomUUID(), quote_no: quoteForm.quoteNo, customer: quoteForm.customer, part_name: partNameStr,
      enquiry_no: quotationModalTarget.raw?.enquiry_no || quotationModalTarget.raw?.lead_no || null,
      contact_person: cStr.person, phone: cStr.phone, email: cStr.email,
      part_number: firstItem.partNumber || '', description: JSON.stringify(items), unit_price: Number(firstItem.unitPrice) || 0,
      unit_discount: Number(firstItem.unitDiscount) || 0,
      quantity: totalQty, total_value: totalValue, date: quoteForm.quoteDate || null, valid_till: quoteForm.validTill || null, status: 'Sent',
      salesperson: quoteForm.salesperson, discount_percent: Number(firstItem.discount) || 0, gst_percent: Number(firstItem.gst) || 18,
      payment_terms: quoteForm.paymentTerms, delivery_terms: quoteForm.deliveryTerms, remarks: quoteForm.remarks, lead_id: leadId
    };

    let { error } = await supabase.from('cnc_quotations').insert([quotePayload]);
    if (error && (error.message?.includes('unit_discount') || error.code === '42703')) {
      const { unit_discount, ...fallbackPayload } = quotePayload;
      const retry = await supabase.from('cnc_quotations').insert([fallbackPayload]);
      error = retry.error;
    }

    if (error) { alert("Error: " + error.message); setLoading(false); }
    else {
      if (leadId) {
        const { error: enqErr } = await supabase.from('cnc_enquiries').update({ status: 'Quoted', pipeline_stage: 'Quotation' }).eq('id', leadId);
        if (enqErr) console.error("Failed to update enquiry status:", enqErr);
      }
      setQuotationModalTarget(null); fetchPipeline(); setLoading(false);
    }
  };

  // Inwards of these categories flow to Production as Draft work orders
  // (released manually there). 'NEW PROJECT' is the legacy label of NEW PART.
  const PRODUCTION_CATEGORIES = ['CUSTOMER DC', 'DC', 'NO DC', 'NEW PART', 'NEW PROJECT'];
  const isProductionCategory = (c: any) => PRODUCTION_CATEGORIES.includes(String(c || '').trim().toUpperCase());

  const createDraftWorkOrdersForInwards = async (entries: { inward: any; qty: number; customer: string }[]) => {
    const eligible = entries.filter(e => isProductionCategory(e.inward.category) && (Number(e.qty) || 0) > 0);
    if (!eligible.length) return 0;
    const { data: existing } = await supabase.from('cnc_work_orders').select('wo_no,sales_order,part_name,quantity');
    const usedNos = new Set((existing ?? []).map((w: any) => w.wo_no));
    const keyOf = (so: string, part: string, q: number) => `${so}||${part}||${q}`;
    const seen = new Set((existing ?? []).map((w: any) => keyOf(w.sales_order ?? '', w.part_name ?? '', Number(w.quantity) || 0)));
    const d = new Date();
    const prefix = `WO-${d.getFullYear().toString().slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}-`;
    const nextNo = () => {
      for (let i = 0; i < 50; i++) {
        const c = `${prefix}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
        if (!usedNos.has(c)) { usedNos.add(c); return c; }
      }
      const f = `${prefix}${Date.now().toString().slice(-3)}`;
      usedNos.add(f);
      return f;
    };
    let created = 0;
    for (const e of eligible) {
      const soRef = e.inward.sales_order_ref || '';
      const k = keyOf(soRef, e.inward.part_name || '', Number(e.qty) || 0);
      if (seen.has(k)) continue;
      seen.add(k);
      const { error } = await supabase.from('cnc_work_orders').insert([{
        id: crypto.randomUUID(), wo_no: nextNo(),
        sales_order: soRef,
        customer: e.customer || e.inward.party_name || '',
        part_name: e.inward.part_name || '-', part_no: e.inward.part_number || 'N/A',
        quantity: Number(e.qty) || 0, completed: 0, rejected: 0,
        start_date: e.inward.inward_date || null, due_date: e.inward.inward_date || null,
        status: 'Draft', priority: 'Normal',
      }]);
      if (!error) created++;
      else console.error('Failed to auto-create draft work order:', error);
    }
    return created;
  };

  const saveInward = async () => {
    if (!inwardModalTarget) return;
    const cStr = getContactStrings(inwardForm);
    const groups = (inwardForm.parts || [])
      .map((g: any) => ({ ...g, items: (g.items || []).filter((it: any) => String(it.partName || '').trim()) }))
      .filter((g: any) => g.items.length);
    if (!inwardForm.productName) { alert('Select an enquired product first.'); return; }
    if (!groups.length) { alert('Add at least one part to inward for this product.'); return; }
    if (groups.some((g: any) => !(g.productName || inwardForm.productName))) { alert('Select a product for each inward.'); return; }
    if (groups.some((g: any) => !(g.category || inwardForm.category))) { alert('Select a category for each inward.'); return; }
    if (groups.some((g: any) => !(g.inwardDate || inwardForm.inwardDate))) { alert('Select an inward date for each inward.'); return; }
    const flatItems = groups.flatMap((g: any) => g.items.map((it: any) => ({ g, it })));
    if (flatItems.some(({ it }: any) => Number(it.quantity) <= 0)) { alert('Enter a quantity greater than zero for each part.'); return; }
    const flatFiles = groups.flatMap((g: any) => g.files || []);
    if (flatFiles.some((file: File) => file.size > 50 * 1024 * 1024)) {
      alert('Each attachment must be 50 MB or smaller.');
      return;
    }
    if (flatFiles.length && !company?.id) {
      alert('Select a company before uploading attachments.');
      return;
    }

    try {
      const rows = [];
      for (const { g, it } of flatItems) {
        const inwardId = crypto.randomUUID();
        const attachments = (g.files && g.files.length && company?.id)
          ? await Promise.all((g.files || []).map((file: File) => uploadInwardAttachment(company!.id, inwardId, file)))
          : [];
        const q = Number(it.quantity) || 0;
        const p = Number(it.price) || 0;
        const d = Number(it.discount) || 0;
        const gg = Number(it.gst) || 0;
        const total = q * p * (1 - d / 100) * (1 + gg / 100);
        rows.push({
          id: inwardId,
          inward_no: `INW-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
          category: g.category || inwardForm.category, product_name: g.productName || inwardForm.productName, enquiry_id: g.enquiryId || inwardForm.enquiryId || null,
          project_name: g.projectName || inwardForm.projectName, contact_person: cStr.person, phone: cStr.phone, email: cStr.email,
          sales_order_ref: inwardForm.salesOrderRef, reference_no: g.referenceNo ?? inwardForm.referenceNo,
          inward_date: g.inwardDate || inwardForm.inwardDate || null, party_name: inwardForm.partyName, remarks: g.remarks ?? inwardForm.remarks,
          part_name: it.partName, part_number: it.partNumber || '', quantity: q, price: p,
          discount_percent: d, gst_percent: gg, total_amount: total, status: 'Pending', attachments,
        });
      }
      let payload: any[] = rows;
      const dropped: string[] = [];
      let saved = false;
      let lastError: any = null;
      for (let attempt = 0; attempt < 5 && !saved; attempt++) {
        const res = await supabase.from('cnc_inwards').insert(payload);
        if (!res.error) { saved = true; break; }
        // Cloud DB may predate newer columns: drop only the column the error
        // names and retry, so surviving columns (e.g. product_name) still save.
        const m = /Could not find the '([A-Za-z0-9_]+)' column/.exec(res.error.message || '');
        if (m && payload.length && Object.prototype.hasOwnProperty.call(payload[0], m[1])) {
          dropped.push(m[1]);
          payload = payload.map(r => { const c = { ...r }; delete c[m[1]]; return c; });
          lastError = res.error;
          continue;
        }
        throw res.error;
      }
      if (!saved) throw lastError;
      // Eligible categories (DC / NO DC / NEW PART) flow to Production as
      // Draft work orders, released manually from the Production page.
      try {
        await createDraftWorkOrdersForInwards(rows.map(r => ({
          inward: r, qty: r.quantity,
          customer: (inwardModalTarget as any)?.customer || inwardForm.partyName || '',
        })));
      } catch (woErr) {
        console.error('Draft work order auto-create failed:', woErr);
      }
      if (dropped.includes('product_name')) {
        // Preserve the product link inside remarks (parsed back on display)
        // until the migration adds the real column.
        const withProduct = rows.filter(r => String(r.product_name || '').trim());
        if (withProduct.length) {
          try {
            await Promise.all(withProduct.map(r => {
              const marker = `[Product: ${String(r.product_name).trim()}]`;
              const remarks = r.remarks ? `${marker} ${r.remarks}` : marker;
              return supabase.from('cnc_inwards').update({ remarks }).eq('id', r.id);
            }));
          } catch { /* display falls back to dashes */ }
        }
      }
      if (dropped.includes('attachments') && rows.some(r => (r.attachments || []).length > 0)) {
        alert('Inward entries saved, but file attachments were skipped (database update pending — apply the inward_attachments migration to enable files).');
      }
    } catch (error: any) {
      console.error('Create inward failed:', error);
      const msg = error?.message || error?.details || error?.hint || (typeof error === 'string' ? error : JSON.stringify(error));
      alert(`Unable to create inward entries: ${msg}`);
      return;
    }
    // Customer inward is the customer's material (job work), so it is not added to company stock.
    if (inwardModalTarget.raw?.id && inwardModalTarget.type === 'order') {
        const { error: soErr } = await supabase.from('cnc_sales_orders').update({ status: 'Inwarded' }).eq('id', inwardModalTarget.raw.id);
        if (soErr) console.error("Failed to update sales order status:", soErr);
    }
    setInwardModalTarget(null);
    fetchPipeline();
  };

  const saveFinishedGoods = async () => {
    if (!fgModalTarget) return;
    const q = Number(fgForm.completedQty) || 0;
    const maxQ = Number(fgForm.orderQty) || 0;
    if (q <= 0) {
       alert("Please enter the quantity to process.");
       return;
    }
    if (q > maxQ) {
       alert(`Quantity cannot exceed the inwarded amount of ${maxQ} pcs.`);
       return;
    }
    const fgDate = fgForm.date || new Date().toISOString().split('T')[0];
    const { error } = await supabase.from('cnc_work_orders').insert([{
       id: crypto.randomUUID(), wo_no: fgForm.woNo, customer: fgForm.customer,
       part_name: fgForm.partName, part_no: fgForm.partNo || 'N/A', completed: q, status: 'Completed',
       sales_order: fgModalTarget.raw?.sales_order_ref || '', quantity: maxQ, start_date: fgDate, due_date: fgDate, priority: 'Normal', drawing_revision: '0', description: '',
       created_at: fgDate + 'T00:00:00Z'
    }]);
    if (!error) {
       if (fgModalTarget.raw?.id) {
         const groupIds = Array.isArray(fgModalTarget.raw._groupIds) && fgModalTarget.raw._groupIds.length
           ? fgModalTarget.raw._groupIds : [fgModalTarget.raw.id];
         const inwQuery = supabase.from('cnc_inwards').update({ status: 'Processed' });
         const { error: inwErr } = groupIds.length > 1
           ? await inwQuery.in('id', groupIds)
           : await inwQuery.eq('id', groupIds[0]);
         if (inwErr) console.error("Failed to update inward status:", inwErr);
       }
       setFgModalTarget(null); fetchPipeline();
    } else { alert("Error: " + error.message); }
  };

  const saveDeliveryChallan = async () => {
    if (!dcModalTarget || dcSaving) return;
    const q = Number(dcForm.quantity) || 0;
    const fromWorkOrder = !!dcModalTarget.raw?.id;
    if (q <= 0) {
       alert("Please enter the dispatch quantity.");
       return;
    }
    if (fromWorkOrder) {
      const maxQ = Number(dcModalTarget.qty) || 0;
      if (q > maxQ) {
         alert(`Quantity cannot exceed the finished goods stock of ${maxQ} pcs.`);
         return;
      }
    }
    setDcSaving(true);
    try {
      // Duplicate guards: the same challan must never be recorded twice
      // (double-click, double drag, or re-typed manual entry).
      const dcNoTrimmed = (dcForm.dcNo || '').trim();
      if (dcNoTrimmed) {
        const { data: sameNo, error: sameNoErr } = await supabase.from('cnc_deliveries')
          .select('id,delivery_no').eq('delivery_no', dcNoTrimmed).limit(1);
        if (!sameNoErr && (sameNo ?? []).length > 0) {
          alert(`Delivery Challan ${dcNoTrimmed} already exists. A duplicate was not created.`);
          return;
        }
      }
    // Resolve the real sales order (work orders store the SO order_no in `sales_order`)
    const soNo: string = (fromWorkOrder ? dcModalTarget.raw.sales_order : '') || dcForm.poNumber || '';
    let so: any = null;
    if (soNo) {
      const { data: soRow, error: soErr } = await supabase.from('cnc_sales_orders').select('id, customer_id, quantity, delivered').eq('order_no', soNo).maybeSingle();
      if (soErr) console.error("Failed to look up sales order:", soErr);
      so = soRow;
    }
    // Authoritative DC cap: deliverable = good completed minus delivered.
    // Enforced only when production rows exist for the order (deliveries
    // without work orders keep the previous behaviour).
    let availNow: number | null = null;
    let goodTotal = 0;
    let deliveredTotal = 0;
    if (so) {
      try {
        const { summary } = await fetchOrderQty(String(so.id), soNo);
        if (summary && summary.hasProduction) {
          availNow = summary.fgAvailable;
          goodTotal = summary.good;
          deliveredTotal = summary.delivered;
          if (q > availNow) {
            alert(`Only ${availNow} pcs are available for delivery (good completed ${goodTotal} minus already delivered ${deliveredTotal}). Rejected quantity can never be dispatched.`);
            return;
          }
        }
      } catch (e) { console.error('Delivery availability check failed:', e); }
    }
    // Near-duplicate guard: same order + product + qty + date within minutes.
    if (soNo) {
      try {
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: recent } = await supabase.from('cnc_deliveries')
          .select('id,delivery_no').eq('sales_order_no', soNo)
          .eq('part_name', dcForm.partName || '').eq('dispatch_qty', q)
          .eq('delivery_date', dcForm.date || null).gte('created_at', tenMinAgo).limit(1);
        if (recent && recent.length > 0 && !window.confirm(
          `A nearly identical challan (${recent[0].delivery_no}) was created minutes ago. Create this one anyway?`)) {
          return;
        }
      } catch { /* guard is best-effort; the insert below still validates */ }
    }
    // customer_id is NOT NULL: resolve from the sales order, else match/auto-create the customer by name.
    let customerId: string | null = so?.customer_id || null;
    const partyName = (dcForm.partyName || '').trim();
    if (!customerId && partyName) {
      const match = (customerList || []).find((c: any) => String(c.name || '').trim().toLowerCase() === partyName.toLowerCase());
      if (match) {
        customerId = match.id;
      } else {
        const newId = `CUST-${Math.floor(1000 + Math.random() * 9000)}`;
        const custPayload: any = { id: newId, name: partyName, status: 'Active' };
        if (company?.id) custPayload.company_id = company.id;
        const { error: cErr } = await supabase.from('cnc_customers').insert([custPayload]);
        if (!cErr) {
          customerId = newId;
          try { setCustomerList((prev: any[]) => [...(prev || []), { id: newId, name: partyName }]); } catch {}
        }
      }
    }
    if (!customerId) { alert('Could not resolve a customer for this delivery. Add the party as a customer first.'); return; }
    const { error } = await supabase.from('cnc_deliveries').insert([{
       id: crypto.randomUUID(), delivery_no: dcForm.dcNo, customer_name: dcForm.partyName,
       customer_id: customerId, sales_order_id: so?.id || null, sales_order_no: soNo || null,
       part_name: dcForm.partName, quantity: q, dispatch_qty: q, delivery_date: dcForm.date || null,
       vehicle_no: dcForm.vehicleNo || '', status: 'Pending',
       created_at: new Date().toISOString()
    }]);
    if (!error) {
       if (fromWorkOrder) {
         // Partial DCs leave the batch open; only a fulfilling dispatch marks
         // it Dispatched. Orders without production rows keep old behaviour.
         // Grouped FG cards mark every row in the group.
         const fulfilled = availNow == null || (goodTotal > 0 && deliveredTotal + q >= goodTotal);
         if (fulfilled) {
           const woIds = Array.isArray((dcModalTarget.raw as any)?._groupIds) && (dcModalTarget.raw as any)._groupIds.length
             ? (dcModalTarget.raw as any)._groupIds : [dcModalTarget.raw.id];
           const { error: woErr } = await supabase.from('cnc_work_orders').update({ status: 'Dispatched' }).in('id', woIds.filter(Boolean));
           if (woErr) console.error("Failed to update work order status:", woErr);
         }
       }
       if (so) {
         const delivered = (Number(so.delivered) || 0) + q;
         const status = delivered >= (Number(so.quantity) || 0) ? 'Delivered' : 'Partially Delivered';
         const { error: soUpdErr } = await supabase.from('cnc_sales_orders').update({ delivered, status }).eq('id', so.id);
         if (soUpdErr) console.error("Failed to update sales order delivery:", soUpdErr);
       }
       setDcModalTarget(null); fetchPipeline();
    } else { alert("Error: " + error.message); }
    } finally {
      setDcSaving(false);
    }
  };

    const saveStandaloneSalesOrder = async () => {
    if (!soModalTarget) return;
    const q = Number(soForm.quantity) || 0;
    const p = Number(soForm.price) || 0;
    const item = {
       id: crypto.randomUUID(),
       partName: soForm.partName,
       partNumber: soForm.partNumber || '',
       description: '',
       quantity: q.toString(),
       unitPrice: p.toString(),
       discount: '0',
       gst: soForm.gst || '18'
    };
    const finalItems = [item];
    const totalVal = q * p * (1 + Number(soForm.gst||18)/100);

    const { error } = await supabase.from('cnc_sales_orders').insert([{
      id: crypto.randomUUID(),
      order_no: soForm.orderNo, customer: soForm.customer,
      contact_person: '', phone: '', email: '',
      billing_address: '', delivery_address: '',
      shipping_contact: '', shipping_phone: '',
      lead_no: '', order_date: soForm.orderDate || null,
      customer_po_no: '', customer_po_date: null,
      items: finalItems,
      part_name: item.partName, part_number: item.partNumber, part_no: item.partNumber,
      quantity: q, delivered: 0,
      value: totalVal, total_value: totalVal,
      delivery_date: soForm.deliveryDate || soForm.orderDate || null, status: 'Confirmed',
      payment_terms: 'Net 30', special_instructions: '',
      internal_remarks: '',
      quotation_id: null
    }]);
    
    if (!error) {
      fetchPipeline();
      setSoModalTarget(null);
    } else {
      alert("Error creating sales order: " + error.message);
    }
  };
  
  const saveInvoice = async () => {
    if (!invoiceModalTarget) return;
    const q = Number(invoiceForm.quantity) || 0;
    const p = Number(invoiceForm.price) || 0;
    if (!invoiceForm.partyName?.trim() || !invoiceForm.partName?.trim() || q <= 0 || p < 0) {
      alert('Customer, item, positive quantity and a valid unit price are required.');
      return;
    }
    try {
      const rates = [invoiceForm.cgst, invoiceForm.sgst, invoiceForm.igst]
        .map((value: string) => value === '' ? null : Number(value));
      const gstRate = rates.some((value: number | null) => value !== null)
        ? rates.reduce((sum: number, value: number | null) => sum + (value || 0), 0)
        : null;
      const target = invoiceModalTarget.raw || {};
      const deliveryId = invoiceModalTarget.type === 'dc' && target.id !== 'dummy' ? String(target.id) : null;
      await financeApi.saveInvoice({
        invoice_no: invoiceForm.invoiceNo || null,
        invoice_type: 'Sales Invoice',
        customer_name: invoiceForm.partyName.trim(),
        customer_id: target.customer_id || null,
        part_name: invoiceForm.partName.trim(),
        quantity: q,
        invoice_date: invoiceForm.date || null,
        dc_no: invoiceForm.dcNumber || null,
        delivery_id: deliveryId,
        sales_order_id: target.sales_order_id || null,
      }, [{ description: invoiceForm.partName.trim(), quantity: q, unit: target.unit || null, rate: p, gst_rate: gstRate }]);
      if (deliveryId) {
        const { error: dcErr } = await supabase.from('cnc_deliveries').update({ status: 'Billed' }).eq('id', deliveryId);
        if (dcErr) throw dcErr;
      }
      setInvoiceModalTarget(null);
      fetchPipeline();
    } catch (error: any) {
      alert('Error creating invoice: ' + (error?.message || 'Please try again.'));
    }
  };

  const calcQuoteTotal = () => {
    if (quoteForm.items && Array.isArray(quoteForm.items)) {
      return quoteForm.items.reduce((total: number, item: any) => {
        const q = Number(item.quantity) || 0; const p = Number(item.unitPrice) || 0;
        const d = Number(item.discount) || 0; const ud = Number(item.unitDiscount) || 0; const g = Number(item.gst) || 0;
        const discountedUnit = Math.max(0, p * (1 - d / 100) - ud);
        return total + (q * discountedUnit * (1 + g / 100));
      }, 0).toFixed(2);
    }
    const q = Number(quoteForm.quantity) || 0; const p = Number(quoteForm.unitPrice) || 0;
    const d = Number(quoteForm.discount) || 0; const ud = Number(quoteForm.unitDiscount) || 0; const g = Number(quoteForm.gst) || 0;
    const discountedUnit = Math.max(0, p * (1 - d / 100) - ud);
    return (q * discountedUnit * (1 + g / 100)).toFixed(2);
  };

  const calcItemTotal = (item: any) => {
    const q = Number(item.quantity) || 0; const p = Number(item.unitPrice) || 0;
    const d = Number(item.discount) || 0; const ud = Number(item.unitDiscount) || 0; const g = Number(item.gst) || 0;
    const discountedUnit = Math.max(0, p * (1 - d / 100) - ud);
    return (q * discountedUnit * (1 + g / 100)).toFixed(2);
  };

  const updateQuoteItem = (index: number, field: string, value: string) => {
    const newItems = [...(quoteForm.items || [])];
    newItems[index] = { ...newItems[index], [field]: value };
    setQuoteForm({ ...quoteForm, items: newItems });
  };

  const [showNewLead, setShowNewLead] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState<any>({
    leadNo: generateUniqueProjectNo(rawLeadsList),
    company: '', city: '', gst: '', enquiringFor: '', source: 'Direct', remarks: '', contacts: [{ person: '', phone: '', email: '' }],
    items: [{ productName: '', quantity: '', files: [] as File[] }], partName: '', partNo: '', quantity: '', estimatedValue: '', expectedDate: ''
  });

  // Highlighted context banner shown first in every pipeline popup:
  // what is being created + unique number + products + customer.
  const PipelineContextBanner = ({ stage, uniqueNo, products, customer }: { stage: string; uniqueNo?: any; products?: any; customer?: any }) => (
    <div className="col-span-full rounded-xl border-2 border-brand-300 bg-brand-50 px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3">
      <div>
        <span className="block text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-0.5">You are creating</span>
        <span className="text-sm font-extrabold text-brand-800 uppercase">{stage}</span>
      </div>
      <div>
        <span className="block text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-0.5">Unique Number</span>
        <span className="text-sm font-extrabold text-slate-900">{uniqueNo || '—'}</span>
      </div>
      <div>
        <span className="block text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-0.5">Products</span>
        <span className="text-sm font-extrabold text-slate-900 break-words">{products || '—'}</span>
      </div>
      <div>
        <span className="block text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-0.5">Customer</span>
        <span className="text-sm font-extrabold text-slate-900 break-words">{customer || '—'}</span>
      </div>
    </div>
  );

  const stageDetailsTitle = (stage?: string) =>
    !stage ? 'Pipeline History' : stage === 'DC' ? 'Delivery Challan Details' : `${stage} Details`;

  const openNewLeadModal = () => {
    const nextNo = generateUniqueProjectNo(rawLeadsList);
    setNewLeadForm({
      leadNo: nextNo,
      company: '', city: '', gst: '', enquiringFor: '', source: 'Direct', remarks: '', contacts: [{ person: '', phone: '', email: '' }],
      items: [{ productName: '', quantity: '', files: [] as File[] }], partName: '', partNo: '', quantity: '', estimatedValue: '', expectedDate: ''
    });
    setShowNewLead(true);
  };



  const saveNewLead = async () => {
    if (!newLeadForm.company) {
      alert("Please enter a company name.");
      return;
    }
    const enteredProducts = (newLeadForm.items || []).filter((item: any) => String(item.productName || item.partName || '').trim());
    if (!enteredProducts.length) { alert('Please enter at least one product name.'); return; }
    if (enteredProducts.some((item: any) => Number(item.quantity) < 0)) { alert('Product quantities cannot be negative.'); return; }
    if (enteredProducts.some((item: any) => (item.files || []).length) && !company?.id) {
      alert('Select a company before uploading product files.');
      return;
    }
    setLoading(true);
    try {
      const cStr = getContactStrings(newLeadForm);
      const itemsToSave = await Promise.all(enteredProducts.map(async (item: any) => {
        const uploadedPaths = company?.id
          ? await Promise.all((item.files || []).map((file: File) => uploadEnquiryProductFile(company.id!, file)))
          : [];
        return {
          productName: String(item.productName || item.partName).trim(),
          partName: String(item.productName || item.partName).trim(),
          quantity: item.quantity || '0',
          remarks: item.remarks || '',
          filePaths: [...(item.filePaths || []), ...uploadedPaths],
        };
      }));
        
      const firstItem = itemsToSave[0];
      const productNamesList = itemsToSave.map((it: any) => it.productName).join(', ');
      const multiplePartsString = itemsToSave.length > 1 ? `${productNamesList} (${itemsToSave.length} Products)` : firstItem.productName;
      const projNo = newLeadForm.leadNo?.trim() || generateUniqueProjectNo(rawLeadsList);
      const totalQty = itemsToSave.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 0), 0);
      
      const payload: any = {
        id: crypto.randomUUID(),
        lead_no: projNo,
        enquiry_no: projNo,
        customer: newLeadForm.company,
        contact_person: cStr.person,
        phone: cStr.phone,
        email: cStr.email,
        city: newLeadForm.city,
        gst: newLeadForm.gst, 
        enquiring_for: JSON.stringify(itemsToSave),
        part_name: multiplePartsString,
        part_no: newLeadForm.partNo || 'N/A',
        quantity: totalQty,
        estimated_value: Number(newLeadForm.estimatedValue) || 0,
        expected_date: newLeadForm.expectedDate || new Date().toISOString().split('T')[0],
        received_date: new Date().toISOString().split('T')[0],
        source: newLeadForm.source,
        status: 'New',
        pipeline_stage: 'Enquiry'
      };

      if (company?.id) {
        payload.company_id = company.id;
      }

      const { error } = await supabase.from('cnc_enquiries').insert([payload]);
      
      if (!error) {
        // Also auto-sync new customer to cnc_customers if not yet present
        try {
          const custExists = customerList.some(c => c.name?.toLowerCase() === newLeadForm.company.toLowerCase());
          if (!custExists) {
            const custPayload: any = {
              id: `CUST-${Math.floor(1000 + Math.random() * 9000)}`,
              name: newLeadForm.company,
              contact: cStr.person || null,
              phone: cStr.phone || null,
              email: cStr.email || null,
              city: newLeadForm.city || null,
              status: 'Active'
            };
            if (company?.id) custPayload.company_id = company.id;
            await supabase.from('cnc_customers').insert([custPayload]);
          }
        } catch (cErr) {
          console.warn('Customer auto-insert error:', cErr);
        }

        setShowNewLead(false);
        const updatedLeads = [...rawLeadsList, { lead_no: projNo, enquiry_no: projNo }];
        setRawLeadsList(updatedLeads);
        setNewLeadForm({
          leadNo: generateUniqueProjectNo(updatedLeads),
          company: '', city: '', gst: '', enquiringFor: '', source: 'Direct', remarks: '', contacts: [{ person: '', phone: '', email: '' }],
          items: [{ productName: '', quantity: '', files: [] }], partName: '', partNo: '', quantity: '', estimatedValue: '', expectedDate: ''
        });
        await fetchPipeline();
      } else {
        console.error('Failed to save lead:', error);
        alert("Failed to save lead: " + error.message);
      }
    } catch (err: any) {
      console.error('Exception in saveNewLead:', err);
      alert("Failed to save lead: " + (err?.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="p-4 lg:p-6 bg-[#F8FAFC] min-h-full flex flex-col font-sans">
      
      {/* 1. Page Header */}
      <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Simple ERP</h1>
          <p className="text-xs text-slate-500 font-medium mt-1">From Enquiry to Invoice – All in One Place</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative hidden md:block">
            <input type="text" placeholder="Search by customer, part, document no..." className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-72 focus:outline-none focus:border-brand-500 bg-slate-50" />
            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
          <button onClick={openNewLeadModal} className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm flex items-center gap-2 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
            New <svg className="w-3 h-3 ml-1 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          </button>
        </div>
      </div>

      {/* 2. Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
        {[
          { title: 'Total Enquiries', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', color: 'blue', stage: 'Enquiry' },
          { title: 'Quotations', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', color: 'purple', stage: 'Quotation' },
          { title: 'Sales Orders', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', color: 'emerald', stage: 'Sales Order' },
          { title: 'Inward', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4', color: 'orange', stage: 'Inward' },
          { title: 'Finished Goods', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', color: 'teal', stage: 'Finished Goods' },
          { title: 'Delivery Challans', icon: 'M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z', color: 'rose', stage: 'DC' },
          { title: 'Invoices', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', color: 'blue', stage: 'Invoice' }
        ].map(stat => {
           const count = cards.filter(c => c.stage === stat.stage).length;
           const stageColors: Record<string, { tile: string; icon: string }> = {
             Enquiry: { tile: 'bg-blue-50 border-blue-300 hover:border-blue-500', icon: 'bg-blue-100 text-blue-700' },
             Quotation: { tile: 'bg-violet-50 border-violet-300 hover:border-violet-500', icon: 'bg-violet-100 text-violet-700' },
             'Sales Order': { tile: 'bg-emerald-50 border-emerald-300 hover:border-emerald-500', icon: 'bg-emerald-100 text-emerald-700' },
             Inward: { tile: 'bg-amber-50 border-amber-300 hover:border-amber-500', icon: 'bg-amber-100 text-amber-700' },
             'Finished Goods': { tile: 'bg-cyan-50 border-cyan-300 hover:border-cyan-500', icon: 'bg-cyan-100 text-cyan-700' },
             DC: { tile: 'bg-rose-50 border-rose-300 hover:border-rose-500', icon: 'bg-rose-100 text-rose-700' },
             Invoice: { tile: 'bg-indigo-50 border-indigo-300 hover:border-indigo-500', icon: 'bg-indigo-100 text-indigo-700' },
           };
           const stageColor = stageColors[stat.stage] ?? stageColors.Enquiry;
           return (
             <div key={stat.title} onClick={() => { 
               if (stat.stage === 'Enquiry') setActiveView('enquiry_list'); 
               else if (stat.stage === 'Quotation') setActiveView('quotation_list'); 
               else if (stat.stage === 'Sales Order') setActiveView('sales_order_list'); 
               else if (stat.stage === 'Inward') setActiveView('inward_list'); 
               else if (stat.stage === 'Finished Goods') setActiveView('fg_list'); 
               else if (stat.stage === 'DC') setActiveView('dc_list'); 
               else if (stat.stage === 'Invoice') setActiveView('invoice_list'); 
             }} className={`${stageColor.tile} rounded-xl p-4 shadow-sm border cursor-pointer flex items-center justify-between hover:-translate-y-1 transition-transform`}>
               <div>
                 <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">{stat.title}</p>
                 <p className={`text-2xl font-bold text-${stat.color}-600`}>{count}</p>
               </div>
               <div className={`w-10 h-10 rounded-full flex items-center justify-center ${stageColor.icon}`}>
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={stat.icon}></path></svg>
               </div>
             </div>
           );
        })}
      </div>

      {/* 3. Tabs & Filters */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div className="flex p-1 bg-white rounded-lg shadow-sm border border-slate-200">
          <button 
            onClick={() => setPipelineViewMode('kanban')}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md shadow-sm transition-all ${pipelineViewMode === 'kanban' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}>Kanban Board</button>
          <button 
            onClick={() => setPipelineViewMode('list')}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md shadow-sm transition-all ${pipelineViewMode === 'list' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}>List View</button>
          <button 
            onClick={() => setPipelineViewMode('calendar')}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md shadow-sm transition-all ${pipelineViewMode === 'calendar' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}>Calendar</button>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <select 
            className="border border-slate-200 rounded-lg text-sm px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-brand-500 shadow-sm font-medium"
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
          >
            <option value="All Customers">All Customers</option>
            {Array.from(new Set(cards.map(c => c.customer))).filter(Boolean).sort().map(customer => (
              <option key={customer} value={customer}>{customer}</option>
            ))}
          </select>
          <div className="relative">
            <input type="text" placeholder="Search cards..." className="pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm w-48 focus:outline-none focus:border-brand-500 bg-white shadow-sm" />
            <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
          <button className="p-2 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 shadow-sm transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
          </button>
          <button className="p-2 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 shadow-sm transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg>
          </button>
        </div>
      </div>

      {/* 4. Kanban Pipeline (Horizontal Scroll) */}
      {activeView === 'enquiry_list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <EnquiryModule onBack={() => setActiveView('pipeline')} />
        </div>
      ) : activeView === 'quotation_list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <QuotationModule onBack={() => setActiveView('pipeline')} />
        </div>
      ) : activeView === 'sales_order_list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <SalesOrderModule onBack={() => setActiveView('pipeline')} />
        </div>
      ) : activeView === 'inward_list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <InwardModule onBack={() => setActiveView('pipeline')} />
        </div>
      ) : activeView === 'fg_list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <FinishedGoodsModule onBack={() => setActiveView('pipeline')} />
        </div>
      ) : activeView === 'dc_list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <DeliveryChallanModule onBack={() => setActiveView('pipeline')} />
        </div>
      ) : activeView === 'invoice_list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <InvoiceModule onBack={() => setActiveView('pipeline')} />
        </div>
      ) : pipelineViewMode === 'list' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <PipelineListView cards={cards} onView={openViewModal} />
        </div>
      ) : pipelineViewMode === 'calendar' ? (
        <div className="flex-1 h-full min-h-[500px] mb-4">
          <PipelineCalendarView cards={cards} onView={openViewModal} />
        </div>
      ) : (
      <div className="overflow-x-auto scrollbar-thin pb-4 mt-2">
        <div className="flex gap-4 h-[550px] items-stretch min-w-max px-1">
          {[
            { id: 'Enquiry', title: 'ENQUIRY', desc: 'New opportunities', color: 'blue', bg: 'bg-blue-50/70', border: 'border-blue-200/60', text: 'text-blue-700', card: 'bg-blue-100 border-blue-300 hover:bg-blue-100/80', code: 'bg-blue-200 text-blue-900', amount: 'text-blue-900' },
            { id: 'Quotation', title: 'QUOTATION', desc: 'Sent to customer', color: 'purple', bg: 'bg-purple-50/70', border: 'border-purple-200/60', text: 'text-purple-700', card: 'bg-violet-100 border-violet-300 hover:bg-violet-100/80', code: 'bg-violet-200 text-violet-900', amount: 'text-violet-900' },
            { id: 'Sales Order', title: 'SALES ORDER', desc: 'Confirmed orders', color: 'emerald', bg: 'bg-emerald-50/70', border: 'border-emerald-200/60', text: 'text-emerald-700', card: 'bg-emerald-100 border-emerald-300 hover:bg-emerald-100/80', code: 'bg-emerald-200 text-emerald-900', amount: 'text-emerald-900' },
            { id: 'Inward', title: 'INWARD', desc: 'Raw material / Purchase', color: 'orange', bg: 'bg-orange-50/70', border: 'border-orange-200/60', text: 'text-orange-700', card: 'bg-amber-100 border-amber-300 hover:bg-amber-100/80', code: 'bg-amber-200 text-amber-900', amount: 'text-amber-900' },
            { id: 'Finished Goods', title: 'FINISHED GOODS', desc: 'Ready for delivery', color: 'teal', bg: 'bg-teal-50/70', border: 'border-teal-200/60', text: 'text-teal-700', card: 'bg-cyan-100 border-cyan-300 hover:bg-cyan-100/80', code: 'bg-cyan-200 text-cyan-900', amount: 'text-cyan-900' },
            { id: 'DC', title: 'DELIVERY CHALLAN', desc: 'Dispatch to customer', color: 'rose', bg: 'bg-rose-50/70', border: 'border-rose-200/60', text: 'text-rose-700', card: 'bg-rose-100 border-rose-300 hover:bg-rose-100/80', code: 'bg-rose-200 text-rose-900', amount: 'text-rose-900' },
            { id: 'Invoice', title: 'INVOICE', desc: 'Billed & Completed', color: 'blue', bg: 'bg-blue-50/70', border: 'border-blue-200/60', text: 'text-blue-700', card: 'bg-indigo-100 border-indigo-300 hover:bg-indigo-100/80', code: 'bg-indigo-200 text-indigo-900', amount: 'text-indigo-900' }
          ].map(stage => {
            const stageCards = cards
              .filter(c => c.stage === stage.id && (customerFilter === 'All Customers' || c.customer === customerFilter))
              .sort((a, b) => (a.refNo || '').localeCompare(b.refNo || '', undefined, { numeric: true }));
            return (
              <div key={stage.id} 
                className={`w-[280px] flex-shrink-0 ${stage.bg} rounded-xl p-3 flex flex-col border ${stage.border} shadow-sm h-full`}
                onDragOver={(e) => e.preventDefault()} 
                onDrop={(e) => handleDrop(e, stage.id as Stage)}
              >
                <div className="flex justify-between items-start mb-3 px-1">
                  <div>
                    <h3 className={`font-bold text-sm tracking-wide ${stage.text}`}>{stage.title}</h3>
                    <p className="text-[10px] text-slate-500 font-medium">{stage.desc}</p>
                  </div>
                  <span className={`bg-white ${stage.text} text-xs font-bold px-2 py-0.5 rounded-full shadow-sm border ${stage.border}`}>{stageCards.length}</span>
                </div>
                
                {stage.id !== 'Quotation' && (
                <button className={`w-full bg-white/60 hover:bg-white border ${stage.border} border-dashed ${stage.text} text-xs font-semibold py-2 rounded-lg mb-3 shadow-sm transition-all flex items-center justify-center gap-1`}
                  onClick={() => {
                    if (stage.id === 'Enquiry') { setEnquiryForm(resetEnquiryForm()); setEnquiryModalOpen(true); }
                    else if (stage.id === 'Quotation') {
                      setQuoteForm({
                        quoteNo: `QT-2026-${Math.floor(1000 + Math.random() * 9000)}`, customer: '', leadNo: '', quoteDate: new Date().toISOString().split('T')[0], validTill: '', salesperson: userName, contacts: [{ person: '', phone: '', email: '' }], partName: '', partNumber: '', description: '', quantity: '', unitPrice: '', discount: '0', unitDiscount: '0', gst: '18',
                        items: [{ id: crypto.randomUUID(), partName: '', partNumber: '', quantity: '', unitPrice: '', discount: '0', unitDiscount: '0', gst: '18' }],
                        paymentTerms: '', deliveryTerms: '', remarks: ''
                      });
                      setQuotationModalTarget({ id: 'dummy', stage: 'Enquiry', type: 'lead', refNo: '', customer: '', part: '', qty: 1, value: 0, date: '', raw: {} });
                    } else if (stage.id === 'Sales Order') {
                      setSoForm({
                        orderNo: `SO-2026-${Math.floor(1000 + Math.random() * 9000)}`, customer: '', orderDate: new Date().toISOString().split('T')[0], deliveryDate: new Date().toISOString().split('T')[0], partName: '', partNumber: '', quantity: '', price: '', gst: '18'
                      });
                      setSoModalTarget({ id: 'dummy', stage: 'Quotation', type: 'quotation', refNo: '', customer: '', part: '', qty: 1, value: 0, date: '', raw: {} });
                    } else if (stage.id === 'Inward') {
                      setInwardForm({
                        category: 'GOODS PURCHASE', projectName: '', salesOrderRef: '', referenceNo: '', inwardDate: new Date().toISOString().split('T')[0], partyName: '', remarks: '',
                        productName: '', productOptions: enquiryProductOptions(rawLeadsList), enquiryId: '',
                        parts: [emptyInwardPart()], contacts: [{ person: '', phone: '', email: '' }]
                      });
                      setInwardModalTarget({ id: 'dummy', stage: 'Sales Order', type: 'order', refNo: '', customer: '', part: '', qty: 1, value: 0, date: '', raw: {} });
                    } else if (stage.id === 'Finished Goods') {
                      setFgForm({
                        woNo: `WO-2026-${Math.floor(1000 + Math.random() * 9000)}`, customer: '', partName: '', partNo: '', orderQty: '', completedQty: '', date: new Date().toISOString().split('T')[0]
                      });
                      setFgModalTarget({ id: 'dummy', stage: 'Inward', type: 'inward', refNo: '', customer: '', part: '', qty: 1, value: 0, date: '', raw: {} });
                    } else if (stage.id === 'DC') {
                      setDcForm({
                        dcNo: `DC-2026-${Math.floor(1000 + Math.random() * 9000)}`, partyName: '', poNumber: '', date: new Date().toISOString().split('T')[0], partName: '', quantity: '', price: '', vehicleNo: '', ewayBill: ''
                      });
                      setDcModalTarget({ id: 'dummy', stage: 'Finished Goods', type: 'finished_goods', refNo: '', customer: '', part: '', qty: 1, value: 0, date: '', raw: {} });
                    } else if (stage.id === 'Invoice') {
                      setInvoiceForm({
                        invoiceNo: '', partyName: '', dcNumber: '', date: new Date().toISOString().split('T')[0], partName: '', quantity: '', price: '', cgst: '', sgst: '', igst: ''
                      });
                      setInvoiceModalTarget({ id: 'dummy', stage: 'DC', type: 'dc', refNo: '', customer: '', part: '', qty: 1, value: 0, date: '', raw: {} });
                    }
                  }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                  Add {stage.title === 'DELIVERY CHALLAN' ? 'Delivery Challan' : stage.title === 'FINISHED GOODS' ? 'Finished Good' : stage.id}
                </button>
                )}

                <div className="flex-1 overflow-y-auto scrollbar-thin space-y-3 pb-2 pr-1">
                  {stageCards.map(card => (
                    <div 
                      key={card.id} 
                      draggable 
                      onDragStart={(e) => handleDragStart(e, card)}
                        onDragEnd={() => setDraggedCard(null)} 
                      onClick={() => openViewModal(card)}
                      className={`${stage.card} rounded-xl p-3.5 border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer group`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded font-mono ${stage.code}`}>{card.refNo}</span>
                        <span className="text-[10px] text-slate-500 font-medium">{card.date || 'No Date'}</span>
                      </div>
                      
                      <h4 className="font-bold text-[13px] text-slate-800 mb-0.5 line-clamp-1">{card.customer}</h4>
                      <p className="text-xs text-slate-600 mb-3 line-clamp-1">{card.part}</p>
                      
                      <div className="flex justify-between items-end">
                        <div>
                          {card.value > 0 ? (
                             <p className={`text-sm font-bold ${stage.amount}`}>₹{Number(card.value).toLocaleString('en-IN')}</p>
                          ) : (
                             <p className="text-xs font-medium text-slate-600">{card.qty} pcs</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {card.type === 'invoice' && (
                            <button onClick={(e) => { e.stopPropagation(); handleCompleteInvoice(card); }} className="p-1 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded border border-emerald-200 transition-colors" title="Mark Complete & Save to History">
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </button>
                          )}
                          <div className="flex -space-x-1">
                            <div className="w-5 h-5 rounded-full bg-slate-200 border border-white flex items-center justify-center text-[8px] font-bold text-slate-600" title="Assigned User">
                              {card.raw?.contact_person ? card.raw.contact_person.substring(0, 2).toUpperCase() : (card.customer ? card.customer.substring(0, 2).toUpperCase() : 'AD')}
                            </div>
                          </div>
                        </div>
                      </div>
                      {card.type === 'order' && card.qtyTrack && (
                        <div className="mt-1.5 space-y-1">
                          <QtyProgress q={card.qtyTrack} />
                          <p className="text-[10px] text-slate-500 tabular-nums leading-tight">
                            Ord {card.qtyTrack.ordered} · Good {card.qtyTrack.good} · Rej {card.qtyTrack.rejected} · Rem {card.qtyTrack.remaining} · Del {card.qtyTrack.delivered} · Inv {card.qtyTrack.invoiced}
                          </p>
                        </div>
                      )}
                      {card.type === 'finished_goods' && card.qtyTrack && (card.qtyTrack.products ?? []).length > 0 ? (
                        <div className="mt-1.5 space-y-1">
                          <div className="rounded-lg bg-emerald-600 px-2 py-1 text-center">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-50">Finished / Available</p>
                            <p className="text-sm font-extrabold tabular-nums text-white leading-tight">{card.qtyTrack.fgAvailable} pcs</p>
                          </div>
                          <p className="text-[10px] text-slate-500 tabular-nums leading-tight">
                            Order {card.qtyTrack.ordered} · Finished {card.qtyTrack.good} · Remaining {card.qtyTrack.remaining} · Delivered {card.qtyTrack.delivered} · Avail {card.qtyTrack.fgAvailable}
                          </p>
                          {card.qtyTrack.products.slice(0, 3).map((p) => (
                            <div key={p.name} className="rounded-md border border-slate-200 bg-white/70 px-1.5 py-1">
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[10px] font-bold text-slate-700 truncate">{p.name}</span>
                                {p.rejected > 0 && <span className="text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded px-1">Rej {p.rejected}</span>}
                              </div>
                              <p className="text-[10px] text-slate-500 tabular-nums leading-tight">
                                Finished {p.good} / {p.ordered} · Available {p.available}
                              </p>
                            </div>
                          ))}
                          {card.qtyTrack.products.length > 3 && <p className="text-[10px] text-slate-400">+{card.qtyTrack.products.length - 3} more products</p>}
                          <QtyProgress q={card.qtyTrack} />
                        </div>
                      ) : (
                      card.type === 'finished_goods' && (() => {
                        const rows = Array.isArray(card.raw?._groupRows) && card.raw._groupRows.length ? card.raw._groupRows : [card.raw];
                        const g = rows.reduce((s: number, x: any) => s + (Number(x?.completed) || 0), 0);
                        const rj = rows.reduce((s: number, x: any) => s + (Number(x?.rejected) || 0), 0);
                        const itemQty = (card.raw?._itemQty ?? {}) as Record<string, number>;
                        const byName = new Map<string, number>();
                        rows.forEach((x: any) => {
                          const n = String(x?.part_name ?? '').trim() || '—';
                          byName.set(n, (byName.get(n) ?? 0) + (Number(x?.completed) || 0));
                        });
                        const lines = [...byName.entries()].map(([n, done]) => {
                          const oq = itemQty[n.toLowerCase()];
                          return { n, done, left: oq != null && oq > 0 ? Math.max(0, oq - done) : null };
                        });
                        return (
                          <div className="mt-1.5 space-y-1">
                            <div className="flex flex-wrap gap-1">
                              {lines.slice(0, 3).map((l) => (
                                <span key={l.n} className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] tabular-nums">
                                  <span className="font-semibold text-slate-700">{l.n}</span>
                                  <b className="text-emerald-700">{l.done} done</b>
                                  {l.left != null && <b className="text-amber-700">· {l.left} left</b>}
                                </span>
                              ))}
                              {lines.length > 3 && <span className="text-[10px] text-slate-400">+{lines.length - 3} more</span>}
                            </div>
                            <p className="text-[10px] text-slate-500 tabular-nums leading-tight">
                              Good {g} · Rej {rj}{card.qtyTrack ? ` · Order ${card.qtyTrack.good}/${card.qtyTrack.ordered} · Avail ${card.qtyTrack.fgAvailable}` : ''}
                            </p>
                          </div>
                        );
                      })())}
                      {card.type === 'inward' && card.qtyTrack && (card.qtyTrack.products ?? []).length > 0 ? (
                        <div className="mt-1.5 space-y-1">
                          <p className="text-[10px] text-slate-500 tabular-nums leading-tight">
                            Ordered {card.qtyTrack.ordered} · Finished {card.qtyTrack.good}
                          </p>
                          {card.qtyTrack.remaining > 0 || card.qtyTrack.ordered <= 0 ? (
                            <div className="rounded-lg bg-amber-500 px-2 py-1 text-center">
                              <p className="text-[9px] font-bold uppercase tracking-widest text-amber-50">Remaining to produce</p>
                              <p className="text-sm font-extrabold tabular-nums text-white leading-tight">{card.qtyTrack.remaining} pcs</p>
                            </div>
                          ) : (
                            <div className="rounded-lg bg-emerald-600 px-2 py-1 text-center">
                              <p className="text-[10px] font-extrabold uppercase tracking-widest text-white">Production complete</p>
                            </div>
                          )}
                          {card.qtyTrack.products.slice(0, 3).map((p) => (
                            <div key={p.name} className="rounded-md border border-slate-200 bg-white/70 px-1.5 py-1">
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[10px] font-bold text-slate-700 truncate">{p.name}</span>
                                {p.rejected > 0 && <span className="text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded px-1">Rej {p.rejected}</span>}
                              </div>
                              <p className="text-[10px] text-slate-500 tabular-nums leading-tight">
                                {p.good} / {p.ordered} finished · <b className="text-amber-700">Remaining {p.remaining}</b>
                              </p>
                            </div>
                          ))}
                          {card.qtyTrack.products.length > 3 && <p className="text-[10px] text-slate-400">+{card.qtyTrack.products.length - 3} more products</p>}
                          <QtyProgress q={card.qtyTrack} />
                        </div>
                      ) : (
                      card.type === 'inward' && Array.isArray(card.raw?._inwardProd) && card.raw._inwardProd.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {card.raw._inwardProd.slice(0, 3).map((l: any) => (
                            <span key={l.name} className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] tabular-nums">
                              <span className="font-semibold text-slate-700">{l.name}</span>
                              <span className="text-slate-500">{l.recv} in</span>
                              <b className="text-amber-700">· {l.left} left</b>
                            </span>
                          ))}
                          {card.raw._inwardProd.length > 3 && <span className="text-[10px] text-slate-400">+{card.raw._inwardProd.length - 3} more</span>}
                        </div>
                      ))}
                      {card.type === 'dc' && (
                        <p className="mt-1.5 text-[10px] text-slate-500 tabular-nums leading-tight">
                          Dispatched {card.qty}{card.qtyTrack ? ` · Deliverable left ${card.qtyTrack.fgAvailable} of order ${card.qtyTrack.ordered}` : ''}
                        </p>
                      )}
                      {card.type === 'invoice' && card.qtyTrack && (
                        <p className="mt-1.5 text-[10px] text-slate-500 tabular-nums leading-tight">
                          Invoiced {card.qtyTrack.invoiced} · Invoiceable left {card.qtyTrack.invoiceable}
                        </p>
                      )}
                      <div className="mt-2 pt-2 border-t border-slate-50 flex justify-between items-center transition-opacity">
                        <span 
                          className="text-[10px] font-medium text-slate-500 flex items-center gap-1 hover:text-brand-600 transition-colors z-10 relative"
                          onClick={(e) => { e.stopPropagation(); setActiveCommentTarget(card); }}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg> 
                          {commentCounts[card.id] || 0}
                        </span>
                        <div className="flex items-center gap-3 z-20 relative">
                          <button onClick={(e) => { e.stopPropagation(); openViewModal(card); }} className="text-slate-400 hover:text-brand-600 transition-colors" title="View Details">
                            <Eye size={14} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); setViewEditMode(true); openViewModal(card); }} className="text-slate-400 hover:text-blue-600 transition-colors" title="Inline Edit">
                            <Edit2 size={14} />
                          </button>
                          {card.type === 'lead' && (
                            <button onClick={(e) => { e.stopPropagation(); duplicateEnquiry(card); }} className="text-slate-400 hover:text-brand-600 transition-colors" title="Duplicate Enquiry">
                              <Copy size={14} />
                            </button>
                          )}
                          <button onClick={(e) => handleDeleteCard(e, card)} className="text-slate-400 hover:text-red-600 transition-colors" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* 5. Bottom Section */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            Recent Activities
          </h3>
          <div className="space-y-4">
            {recentActivities.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No recent activities</p>
            ) : (
              recentActivities.map((act, i) => (
                <div key={i} className="flex gap-3">
                  <div className={`w-2 h-2 rounded-full ${act.color} mt-1.5 flex-shrink-0`}></div>
                  <div>
                    <p className="text-xs text-slate-700"><span className="font-semibold">{act.ref || 'Record'}</span> {act.action}{act.customer ? ` for ${act.customer}` : ''}</p>
                    <p className="text-[10px] text-slate-500 font-medium mt-0.5">{act.time ? new Date(act.time).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : ''}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
            Pipeline Summary
          </h3>
          <div className="space-y-3">
            {columns.map(col => {
              const count = cards.filter(c => c.stage === col).length;
              return (
                <div key={col} className="flex items-center justify-between">
                  <span className="text-xs text-slate-600 font-medium">{col}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-500 rounded-full" style={{ width: `${Math.min(100, (count / Math.max(1, cards.length)) * 100)}%` }}></div>
                    </div>
                    <span className="text-xs font-bold text-slate-700 w-6 text-right">{count}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 relative overflow-hidden">
          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2 relative z-10">
            <svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            Quick Links
          </h3>
          <div className="grid grid-cols-2 gap-2 relative z-10">
            <button onClick={() => { setEnquiryForm(resetEnquiryForm()); setEnquiryModalOpen(true); }} className="text-left text-xs font-semibold text-slate-600 hover:text-brand-600 hover:bg-brand-50 px-3 py-2 rounded-lg transition-colors border border-transparent hover:border-brand-100">New Enquiry</button>
            <button onClick={() => setActiveView('quotation_list')} className="text-left text-xs font-semibold text-slate-600 hover:text-brand-600 hover:bg-brand-50 px-3 py-2 rounded-lg transition-colors border border-transparent hover:border-brand-100">New Quotation</button>
            <button onClick={() => setActiveView('sales_order_list')} className="text-left text-xs font-semibold text-slate-600 hover:text-brand-600 hover:bg-brand-50 px-3 py-2 rounded-lg transition-colors border border-transparent hover:border-brand-100">New Sales Order</button>
            <button onClick={() => setActiveView('inward_list')} className="text-left text-xs font-semibold text-slate-600 hover:text-brand-600 hover:bg-brand-50 px-3 py-2 rounded-lg transition-colors border border-transparent hover:border-brand-100">New Inward</button>
          </div>
          
          <div className="mt-6 pt-4 border-t border-slate-100 relative z-10 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ARGUSCNC™</p>
              <p className="text-xs font-bold text-slate-800">Manufacturing Made Simple</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center text-brand-600 shadow-sm border border-brand-100">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            </div>
          </div>
        </div>
      </div>

      {/* New Lead Modal */}
      <Modal open={showNewLead} onClose={() => setShowNewLead(false)} title="Create New Lead" size="lg" footer={<><Button variant="secondary" onClick={() => setShowNewLead(false)}>Cancel</Button><Button onClick={saveNewLead}>Save Lead</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <PipelineContextBanner stage="New Lead" uniqueNo={newLeadForm.leadNo} products={(newLeadForm.items || []).map((i: any) => i.productName || i.partName).filter(Boolean).join(', ')} customer={newLeadForm.company} />
          <FormField label="Unique Number" required>
            <input 
              className={inputClass} 
              value={newLeadForm.leadNo} 
              onChange={e => setNewLeadForm({ ...newLeadForm, leadNo: e.target.value })} 
              placeholder="e.g. 1840 or Custom Unique Number" 
            />
          </FormField>
          <CustomerAutocomplete
            label="Company Name"
            required
            value={newLeadForm.company}
            onChange={val => {
              const matched = allKnownCompanies.find(c => c.company.toLowerCase() === val.trim().toLowerCase());
              setNewLeadForm(prev => ({
                ...prev,
                company: val,
                contacts: matched && (matched.contact_person || matched.phone || matched.email)
                  ? [{ person: matched.contact_person || '', phone: matched.phone || '', email: matched.email || '' }]
                  : prev.contacts,
                city: matched?.city || prev.city,
                gst: matched?.gst || prev.gst
              }));
            }}
            onSelectCustomer={c => {
              setNewLeadForm(prev => ({
                ...prev,
                company: c.company,
                contacts: (c.contact_person || c.phone || c.email)
                  ? [{ person: c.contact_person || '', phone: c.phone || '', email: c.email || '' }]
                  : prev.contacts,
                city: c.city || prev.city,
                gst: c.gst || prev.gst
              }));
            }}
            companies={allKnownCompanies}
            inputClass={inputClass}
            placeholder="e.g. Acme Corp"
          />
          <FormField label="Address"><input className={inputClass} value={newLeadForm.city} onChange={e => setNewLeadForm({...newLeadForm, city: e.target.value})} /></FormField>
          <FormField label="GST No."><input className={inputClass} value={newLeadForm.gst} onChange={e => setNewLeadForm({...newLeadForm, gst: e.target.value})} /></FormField>
          <div className="col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-500 uppercase">Contact Persons</label>
              <button type="button" onClick={() => setNewLeadForm({...newLeadForm, contacts: [...(newLeadForm.contacts || []), { person: '', phone: '', email: '' }]})} className="text-xs text-blue-600 font-bold flex items-center gap-1">+ Add Contact</button>
            </div>
            {(newLeadForm.contacts || [{ person: '', phone: '', email: '' }]).map((c: any, i: number) => (
              <div key={i} className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <input placeholder="Name" className={inputClass} value={c.person} onChange={e => { const nc = [...(newLeadForm.contacts || [])]; nc[i] = { ...nc[i], person: e.target.value }; setNewLeadForm({...newLeadForm, contacts: nc}); }} />
                <input placeholder="Phone" className={inputClass} value={c.phone} onChange={e => { const nc = [...(newLeadForm.contacts || [])]; nc[i] = { ...nc[i], phone: e.target.value }; setNewLeadForm({...newLeadForm, contacts: nc}); }} />
                <input placeholder="Email" className={inputClass} value={c.email} onChange={e => { const nc = [...(newLeadForm.contacts || [])]; nc[i] = { ...nc[i], email: e.target.value }; setNewLeadForm({...newLeadForm, contacts: nc}); }} />
              </div>
            ))}
          </div>
          <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Products Required *</label>
              <div className="space-y-2">
                {(newLeadForm.items || [{ productName: '', quantity: '', files: [] }]).map((item: any, idx: number) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_8rem_minmax(13rem,0.8fr)_auto] gap-3 items-start rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div>
                      <input className={inputClass} placeholder="Product Name" value={item.productName ?? item.partName ?? ''} onChange={e => {
                        const newItems = [...(newLeadForm.items || [])];
                        newItems[idx] = { ...newItems[idx], productName: e.target.value, partName: e.target.value };
                        setNewLeadForm({...newLeadForm, items: newItems, partName: newItems[0].productName});
                      }} />
                    </div>
                    <div>
                      <input type="number" className={inputClass} placeholder="Qty" value={item.quantity} onChange={e => {
                        const newItems = [...(newLeadForm.items || [])];
                        newItems[idx] = { ...newItems[idx], quantity: e.target.value };
                        setNewLeadForm({...newLeadForm, items: newItems, quantity: newItems[0].quantity});
                      }} />
                    </div>
                    <div>
                      <label className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-3 text-xs font-semibold text-slate-600 hover:border-brand-400 hover:text-brand-700">
                        <UploadCloud size={15}/>{(item.files || []).length ? `${item.files.length} file(s) selected` : 'Upload image / file / PDF'}
                        <input type="file" multiple accept="*/*" className="hidden" onChange={e => {
                          const selectedFiles = Array.from(e.currentTarget.files || []);
                          const newItems = [...(newLeadForm.items || [])];
                          newItems[idx] = { ...newItems[idx], files: [...(newItems[idx].files || []), ...selectedFiles] };
                          setNewLeadForm({...newLeadForm, items: newItems});
                          e.currentTarget.value = '';
                        }} />
                      </label>
                      {(item.files || []).length > 0 && <div className="mt-1 space-y-1">{item.files.map((file: File, fileIdx: number) => <div key={`${file.name}-${fileIdx}`} className="flex items-center justify-between gap-2 text-[11px] text-slate-600"><span className="truncate">{file.name}</span><button type="button" className="text-rose-600 hover:text-rose-800" onClick={() => { const newItems = [...newLeadForm.items]; newItems[idx] = {...newItems[idx], files: newItems[idx].files.filter((_: File, j: number) => j !== fileIdx)}; setNewLeadForm({...newLeadForm, items: newItems}); }}>Remove</button></div>)}</div>}
                    </div>
                    <div className="col-span-full">
                      <input className={inputClass} placeholder="Remarks for this product..." value={item.remarks || ''} onChange={e => {
                        const newItems = [...(newLeadForm.items || [])];
                        newItems[idx] = { ...newItems[idx], remarks: e.target.value };
                        setNewLeadForm({...newLeadForm, items: newItems});
                      }} />
                    </div>
                    {idx > 0 && (
                      <button type="button" className="p-2 text-red-500 hover:bg-red-50 rounded mt-1" onClick={() => {
                        const newItems = newLeadForm.items.filter((_, i) => i !== idx);
                        setNewLeadForm({...newLeadForm, items: newItems});
                      }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" className="text-xs font-medium text-brand-600 hover:text-brand-800 flex items-center gap-1 mt-2" onClick={() => {
                  setNewLeadForm({...newLeadForm, items: [...(newLeadForm.items || []), { productName: '', quantity: '', files: [] }]});
                }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  Add Another Product
                </button>
              </div>
            </div>
          <FormField label="Source">
            <select className={inputClass} value={newLeadForm.source} onChange={e => setNewLeadForm({...newLeadForm, source: e.target.value})}>
              <option>Direct</option><option>Website</option><option>Referral</option><option>Phone</option><option>Email</option><option>Other</option>
            </select>
          </FormField>
        </div>
      </Modal>

      {/* Enquiry Modal */}
      <Modal open={enquiryModalOpen} onClose={() => { setEnquiryModalOpen(false); setEnquiryForm(resetEnquiryForm()); setDuplicateSource(null); }} title={duplicateSource ? `New Enquiry — Duplicated from ${duplicateSource}` : 'New Enquiry'} size="lg" footer={<><Button variant="secondary" onClick={() => { setEnquiryModalOpen(false); setDuplicateSource(null); }}>Cancel</Button><Button onClick={saveEnquiry}>Save Enquiry</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          {duplicateSource && (
            <div className="col-span-2 rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2 text-xs font-semibold text-brand-800">
              Duplicated from: {duplicateSource} · saving creates a brand-new enquiry with its own unique number.
            </div>
          )}
          <div className="col-span-2 flex justify-end">
            <button type="button" onClick={() => { setEnquiryModalOpen(false); openNewLeadModal(); }} className="text-xs font-bold text-brand-600 hover:text-brand-800 border border-brand-200 hover:border-brand-400 rounded-lg px-3 py-1.5 bg-brand-50/50 transition-colors">+ Add New Lead</button>
          </div>
          <FormField label="Unique Number" required><input className={inputClass} value={enquiryForm.leadNo} onChange={e => setEnquiryForm({...enquiryForm, leadNo: e.target.value})} placeholder="e.g. 1840 or Custom Unique Number" /></FormField>
          <CustomerAutocomplete
            label="Company Name"
            required
            value={enquiryForm.company}
            onChange={val => handleCompanyChange(val)}
            onSelectCustomer={c => handleCompanyChange(c.company)}
            companies={allKnownCompanies}
            inputClass={inputClass}
            placeholder="Type or select company..."
          />
          
          <div className="col-span-2 border-t border-slate-100 mt-2 pt-4">
             <h4 className="font-semibold text-sm text-slate-800 mb-4">Enquiry Details</h4>
          </div>
          
          <div className="col-span-2">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Products Required *</label>
            <div className="space-y-2">
              {(enquiryForm.items || [{ productName: '', quantity: '', files: [] }]).map((item: any, idx: number) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_8rem_minmax(13rem,0.8fr)_auto] gap-3 items-start rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div>
                    <input className={inputClass} placeholder="Product Name" list="enquiry-product-list" value={item.productName ?? item.partName ?? ''} onChange={e => {
                      const newItems = [...(enquiryForm.items || [])];
                      newItems[idx] = { ...newItems[idx], productName: e.target.value, partName: e.target.value };
                      setEnquiryForm({...enquiryForm, items: newItems});
                    }} />
                  </div>
                  <div>
                    <input type="number" className={inputClass} placeholder="Qty" value={item.quantity} onChange={e => {
                      const newItems = [...(enquiryForm.items || [])];
                      newItems[idx] = { ...newItems[idx], quantity: e.target.value };
                      setEnquiryForm({...enquiryForm, items: newItems});
                    }} />
                  </div>
                  <div>
                    <label className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-3 text-xs font-semibold text-slate-600 hover:border-brand-400 hover:text-brand-700">
                      <UploadCloud size={15}/>{(item.files || []).length ? `${item.files.length} file(s) selected` : 'Upload image / file / PDF'}
                      <input type="file" multiple accept="*/*" className="hidden" onChange={e => {
                        const selectedFiles = Array.from(e.currentTarget.files || []);
                        const newItems = [...(enquiryForm.items || [])];
                        newItems[idx] = { ...newItems[idx], files: [...(newItems[idx].files || []), ...selectedFiles] };
                        setEnquiryForm({...enquiryForm, items: newItems});
                        e.currentTarget.value = '';
                      }} />
                    </label>
                    {(item.files || []).length > 0 && <div className="mt-1 space-y-1">{item.files.map((file: File, fileIdx: number) => <div key={`${file.name}-${fileIdx}`} className="flex items-center justify-between gap-2 text-[11px] text-slate-600"><span className="truncate">{file.name}</span><button type="button" className="text-rose-600 hover:text-rose-800" onClick={() => { const newItems = [...enquiryForm.items]; newItems[idx] = {...newItems[idx], files: newItems[idx].files.filter((_: File, j: number) => j !== fileIdx)}; setEnquiryForm({...enquiryForm, items: newItems}); }}>Remove</button></div>)}</div>}
                  </div>
                  <div className="col-span-full">
                    <input className={inputClass} placeholder="Remarks for this product..." value={item.remarks || ''} onChange={e => {
                      const newItems = [...(enquiryForm.items || [])];
                      newItems[idx] = { ...newItems[idx], remarks: e.target.value };
                      setEnquiryForm({...enquiryForm, items: newItems});
                    }} />
                  </div>
                  {idx > 0 && (
                    <button type="button" className="p-2 text-red-500 hover:bg-red-50 rounded mt-1" onClick={() => {
                      const newItems = enquiryForm.items.filter((_: any, i: number) => i !== idx);
                      setEnquiryForm({...enquiryForm, items: newItems});
                    }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                    </button>
                  )}
                </div>
              ))}
              <datalist id="enquiry-product-list">{existingProductNames.map(n => <option key={n} value={n} />)}</datalist>
              <button type="button" className="text-xs font-medium text-brand-600 hover:text-brand-800 flex items-center gap-1 mt-2" onClick={() => {
                setEnquiryForm({...enquiryForm, items: [...(enquiryForm.items || []), { productName: '', quantity: '', files: [] }]});
              }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                Add Another Product
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Quotation Modal */}
      <Modal open={!!quotationModalTarget} onClose={() => setQuotationModalTarget(null)} title="Create Quotation" size="xl" footer={<><Button variant="secondary" onClick={() => setQuotationModalTarget(null)}>Cancel</Button><Button onClick={saveQuotation}>Create Quotation</Button></>}>
        <div className="flex flex-col gap-4">
          <PipelineContextBanner stage="Quotation" uniqueNo={quoteForm.leadNo || quotationModalTarget?.refNo} products={(quoteForm.items || []).map((i: any) => i.partName || i.productName).filter(Boolean).join(', ') || quotationModalTarget?.part} customer={quoteForm.customer || quotationModalTarget?.customer} />
          <div className="grid grid-cols-3 gap-4 pb-4 border-b border-slate-100">
            {quotationModalTarget?.id === 'dummy' && (<>
            <CustomerAutocomplete
              label="Customer"
              required
              value={quoteForm.customer || ''}
              onChange={val => setQuoteForm((prev: any) => ({ ...prev, customer: val }))}
              onSelectCustomer={c => {
                setQuoteForm((prev: any) => ({
                  ...prev,
                  customer: c.company,
                  contacts: (c.contact_person || c.phone || c.email)
                    ? [{ person: c.contact_person || '', phone: c.phone || '', email: c.email || '' }]
                    : prev.contacts
                }));
              }}
              companies={allKnownCompanies}
              inputClass={inputClass}
              placeholder="Type or select customer..."
            />
            <FormField label="Enquiry / Lead No." required><input className={inputClass} value={quoteForm.leadNo} disabled /></FormField>
            </>)}
            <FormField label="Quotation Date" required><input type="date" className={inputClass} value={quoteForm.quoteDate} onChange={e=>setQuoteForm({...quoteForm, quoteDate: e.target.value})} /></FormField>
            {quotationModalTarget?.id === 'dummy' && (<>
            <FormField label="Valid Till" required><input type="date" className={inputClass} value={quoteForm.validTill} onChange={e=>setQuoteForm({...quoteForm, validTill: e.target.value})} /></FormField>
            <FormField label="Salesperson"><input className={inputClass} value={quoteForm.salesperson} onChange={e=>setQuoteForm({...quoteForm, salesperson: e.target.value})} /></FormField>
            </>)}
          </div>
          {/* Product-wise Items Table */}
          <div className="border-t border-slate-100 pt-4">
            <h4 className="font-semibold text-sm text-slate-800 mb-3">Products / Items Breakdown</h4>
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase w-[4%]">#</th>
                    <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase w-[20%]">Product Name</th>
                    <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase w-[10%]">Qty</th>
                    <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase w-[13%]">Unit Price (₹)</th>
                    <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase w-[9%]">Disc %</th>
                    <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase w-[12%]">Unit Disc (₹)</th>
                    <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase w-[8%]">GST %</th>
                    <th className="text-right px-3 py-2 text-[10px] font-bold text-slate-500 uppercase w-[14%]">Total (₹)</th>
                    <th className="text-center px-3 py-2 text-[10px] font-bold text-slate-500 uppercase w-[12%]">File</th>
                    <th className="text-center px-3 py-2 text-[10px] font-bold text-slate-500 uppercase w-[8%]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(quoteForm.items || []).map((item: any, idx: number) => (
                    <tr key={item.id || idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                      <td className="px-3 py-2 text-slate-400 font-medium">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <input className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-brand-500" placeholder="Product name" value={item.partName || ''} onChange={e => updateQuoteItem(idx, 'partName', e.target.value)} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" className="w-full min-w-[72px] tabular-nums text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-brand-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:m-0" placeholder="0" value={item.quantity || ''} onChange={e => updateQuoteItem(idx, 'quantity', e.target.value)} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-brand-500" placeholder="0.00" value={item.unitPrice || ''} onChange={e => updateQuoteItem(idx, 'unitPrice', e.target.value)} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-brand-500" placeholder="0" value={item.discount || ''} onChange={e => updateQuoteItem(idx, 'discount', e.target.value)} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-brand-500" placeholder="0.00" value={item.unitDiscount || ''} onChange={e => updateQuoteItem(idx, 'unitDiscount', e.target.value)} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-brand-500" placeholder="18" value={item.gst || ''} onChange={e => updateQuoteItem(idx, 'gst', e.target.value)} />
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-700">₹{calcItemTotal(item)}</td>
                      <td className="px-3 py-2 text-center">
                        <label className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-600 hover:border-brand-400 hover:text-brand-700">
                          <UploadCloud size={13} />{((item.files || []).length + (item.filePaths || []).length) ? `${(item.files || []).length + (item.filePaths || []).length} file(s)` : 'Upload'}
                          <input type="file" multiple accept="*/*" className="hidden" onChange={e => {
                            const selected = Array.from(e.currentTarget.files || []);
                            const newItems = [...(quoteForm.items || [])];
                            newItems[idx] = { ...newItems[idx], files: [...(newItems[idx].files || []), ...selected] };
                            setQuoteForm({ ...quoteForm, items: newItems });
                            e.currentTarget.value = '';
                          }} />
                        </label>
                        {((item.files || []).length > 0 || (item.filePaths || []).length > 0) && (
                          <div className="mt-1 space-y-1 text-left">
                            {(item.files || []).map((f: File, fi: number) => (
                              <div key={`n-${fi}`} className="flex items-center justify-between gap-1 text-[10px] text-slate-600"><span className="truncate">{f.name}</span><button type="button" className="text-rose-600" onClick={() => { const n = [...quoteForm.items]; n[idx] = { ...n[idx], files: n[idx].files.filter((_: File, j: number) => j !== fi) }; setQuoteForm({ ...quoteForm, items: n }); }}>x</button></div>
                            ))}
                            {(item.filePaths || []).map((p: string, pi: number) => (
                              <div key={`e-${pi}`} className="truncate text-[10px] text-emerald-700">{String(p).split('/').pop()}</div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {(quoteForm.items || []).length > 1 && (
                          <button onClick={() => { const newItems = [...quoteForm.items]; newItems.splice(idx, 1); setQuoteForm({...quoteForm, items: newItems}); }} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded" title="Remove product">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td colSpan={7} className="px-3 py-2 text-right font-bold text-sm text-slate-600 uppercase">Grand Total</td>
                    <td className="px-3 py-2 text-right font-bold text-base text-brand-700">₹{calcQuoteTotal()}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <button onClick={() => { const newItems = [...(quoteForm.items || []), { id: crypto.randomUUID(), partName: '', partNumber: '', quantity: '', unitPrice: '', discount: '0', unitDiscount: '0', gst: '18', files: [], filePaths: [] }]; setQuoteForm({...quoteForm, items: newItems}); }} className="mt-2 text-sm text-brand-600 font-semibold hover:text-brand-700 flex items-center gap-1">
              <span className="text-lg">+</span> Add Another Product
            </button>
          </div>

          <h4 className="font-semibold text-sm text-slate-800 border-t border-slate-100 pt-4">Additional Details</h4>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Payment Terms"><input className={inputClass} value={quoteForm.paymentTerms} onChange={e=>setQuoteForm({...quoteForm, paymentTerms: e.target.value})} /></FormField>
            <FormField label="Delivery Terms"><input className={inputClass} value={quoteForm.deliveryTerms} onChange={e=>setQuoteForm({...quoteForm, deliveryTerms: e.target.value})} /></FormField>
            <div className="col-span-2"><FormField label="Notes / Remarks"><textarea className={inputClass} rows={2} value={quoteForm.remarks} onChange={e=>setQuoteForm({...quoteForm, remarks: e.target.value})}></textarea></FormField></div>
          </div>
        </div>
      </Modal>

      

      {/* Inward Modal */}
      <Modal open={!!inwardModalTarget} onClose={() => setInwardModalTarget(null)} title="Create Inward Entry" size="lg" footer={<><Button variant="secondary" onClick={() => setInwardModalTarget(null)}>Cancel</Button><Button onClick={saveInward}>Create Inward</Button></>}>
        <div className="flex flex-col gap-4">
          <PipelineContextBanner stage="Inward Entry" uniqueNo={inwardForm.projectName || inwardModalTarget?.refNo} products={inwardForm.productName || inwardModalTarget?.part} customer={inwardForm.partyName || inwardModalTarget?.customer} />
          {inwardModalTarget?.id === 'dummy' && (
          <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-100">
              <CustomerAutocomplete
                label="Party / Customer"
                value={inwardForm.partyName || ''}
                onChange={val => setInwardForm((prev: any) => ({ ...prev, partyName: val, projectName: '', productKey: '', productName: '', enquiryId: '' }))}
                onSelectCustomer={c => {
                  setInwardForm((prev: any) => ({ ...prev, partyName: c.company, projectName: '', productKey: '', productName: '', enquiryId: '' }));
                }}
                companies={allKnownCompanies}
                inputClass={inputClass}
                placeholder="Type or select party / customer..."
              />
              <FormField label="Unique Number" required>
                <select className={inputClass} value={inwardForm.projectName || ''} onChange={e => {
                  const no = e.target.value;
                  const mine = (inwardForm.productOptions || []).filter((o: any) => o.leadNo === no);
                  const custs = Array.from(new Set(mine.map((o: any) => o.customer).filter(Boolean)));
                  setInwardForm((prev: any) => ({
                    ...prev, projectName: no, productKey: '', productName: '', enquiryId: '',
                    ...(custs.length === 1 && custs[0] ? { partyName: custs[0] } : {}),
                  }));
                }}>
                  <option value="">Select unique number</option>
                  {Array.from(new Set((inwardForm.productOptions || [])
                    .filter((o: any) => { const p = (inwardForm.partyName || '').trim().toLowerCase(); return !p || String(o.customer || '').trim().toLowerCase() === p; })
                    .map((o: any) => o.leadNo).filter(Boolean))).map((no: any) => <option key={no} value={no}>{no}</option>)}
                </select>
              </FormField>
          </div>)}
          
          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <div><h4 className="font-semibold text-sm text-slate-800">Parts to Buy for {inwardForm.productName || 'Selected Product'}</h4><p className="text-xs text-slate-500">Each inward can hold multiple parts — one line per part.</p></div>
            <Button variant="secondary" onClick={() => {
              const opts = inwardForm.productOptions || [];
              const m = opts.find((o: any) => o.name === inwardForm.productName) || null;
              const prev = (inwardForm.parts || []).slice(-1)[0] || {};
              setInwardForm({...inwardForm, parts: [...inwardForm.parts, { ...emptyInwardPart({ category: prev.category || 'GOODS PURCHASE', referenceNo: prev.referenceNo || '', inwardDate: prev.inwardDate || new Date().toISOString().split('T')[0] }), productKey: m?.key || '', productName: m?.name || '', enquiryId: m?.enquiryId || '', projectName: m?.leadNo || '' }]});
            }}><Plus size={14}/> Add Inward</Button>
          </div>
          <div className="space-y-4">
            {(inwardForm.parts || []).map((group: any, index: number) => {
              const setGroup = (patch: any) => { const parts=[...inwardForm.parts]; parts[index]={...group, ...patch}; setInwardForm({...inwardForm, parts}); };
              const setItem = (ii: number, patch: any) => { const items=[...(group.items || [])]; items[ii]={...items[ii], ...patch}; setGroup({ items }); };
              const lineTotal = (it: any) => (Number(it.quantity)||0)*(Number(it.price)||0)*(1-(Number(it.discount)||0)/100)*(1+(Number(it.gst)||0)/100);
              return (
              <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between"><span className="text-xs font-bold uppercase text-slate-600">Inward {index + 1}</span>{inwardForm.parts.length > 1 && <button type="button" onClick={() => setInwardForm({...inwardForm, parts: inwardForm.parts.filter((_: any, i: number) => i !== index)})} className="text-xs font-medium text-rose-600 hover:text-rose-800">Remove</button>}</div>
                <div className="mb-3">
                <FormField label="Product from Enquiry" required>
                  <select className={inputClass} value={group.productKey || ''} onChange={e=>{
                    const selected = (inwardForm.productOptions || []).find((option: any) => option.key === e.target.value);
                    const patch = { productKey: selected?.key || '', productName: selected?.name || '', enquiryId: selected?.enquiryId || '', projectName: selected?.leadNo || '' };
                    const parts=[...inwardForm.parts]; parts[index]={...group, ...patch};
                    setInwardForm({...inwardForm, parts, ...patch, partyName: selected?.customer || inwardForm.partyName});
                  }}>
                    <option value="">Select an enquired product</option>
                    {(inwardModalTarget?.id === 'dummy' ? (inwardForm.productOptions || []).filter((o: any) => { const p = (inwardForm.partyName || '').trim().toLowerCase(); const u = (inwardForm.projectName || '').trim(); const base = (s: any) => String(s||'').replace(/-\d{2}[A-Za-z]{3}\d{2}-\d{4}(AM|PM)$/, ''); return (!p || String(o.customer || '').trim().toLowerCase() === p) && (!u || base(o.leadNo) === base(u)); }) : (inwardForm.productOptions || [])).map((option: any) => <option key={option.key} value={option.key}>{option.name} — {option.customer || option.leadNo}</option>)}
                  </select>
                  {(inwardForm.productOptions || []).length === 0 && <span className="mt-1 block text-xs text-amber-700">No enquired products found. Add the product to an Enquiry first.</span>}
                </FormField>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-3">
                  <FormField label="Category" required>
                    <select className={inputClass} value={group.category || 'GOODS PURCHASE'} onChange={e=>setGroup({ category: e.target.value })}>
                      <option>EXPENSES</option>
                      <option>CUSTOMER DC</option>
                      <option>NEW PART</option>
                      <option>NO DC</option>
                      <option>GOODS PURCHASE</option>
                      <option>SERVICE PURCHASE</option>
                    </select>
                  </FormField>
                  <FormField label="Reference No."><input className={inputClass} value={group.referenceNo || ''} onChange={e=>setGroup({ referenceNo: e.target.value })} placeholder="e.g. DC/Invoice No" /></FormField>
                  <FormField label="Inward Date" required><input type="date" className={inputClass} value={group.inwardDate || ''} onChange={e=>setGroup({ inwardDate: e.target.value })} /></FormField>
                </div>
                <div className="mb-3">
                  <FormField label="Remarks"><input className={inputClass} value={group.remarks || ''} onChange={e=>setGroup({ remarks: e.target.value })} placeholder="Remarks for this inward..." /></FormField>
                </div>
                <div className="grid grid-cols-[minmax(0,1.5fr)_4.5rem_5.5rem_4.5rem_4.5rem_6rem_2rem] gap-2 items-center mb-1 px-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Part Name *</span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Quantity *</span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Price *</span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Discount</span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">GST</span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Total (Rs.)</span>
                  <span></span>
                </div>
                {(group.items || []).map((item: any, ii: number) => (
                  <div key={ii} className="grid grid-cols-[minmax(0,1.5fr)_4.5rem_5.5rem_4.5rem_4.5rem_6rem_2rem] gap-2 items-center mb-2">
                    <input className={inputClass} placeholder="Part Name" value={item.partName || ''} onChange={e=>setItem(ii, { partName: e.target.value })} />
                    <input type="number" min="0" className={inputClass} placeholder="Qty" value={item.quantity || ''} onChange={e=>setItem(ii, { quantity: e.target.value })} />
                    <input type="number" min="0" className={inputClass} placeholder="Price" value={item.price || ''} onChange={e=>setItem(ii, { price: e.target.value })} />
                    <input type="number" min="0" className={inputClass} placeholder="%" value={item.discount || ''} onChange={e=>setItem(ii, { discount: e.target.value })} />
                    <input type="number" min="0" className={inputClass} placeholder="%" value={item.gst || ''} onChange={e=>setItem(ii, { gst: e.target.value })} />
                    <input className={`${inputClass} bg-white font-bold`} value={lineTotal(item) || 0} disabled />
                    {(group.items || []).length > 1 ? (
                      <button type="button" className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded" title="Remove part" onClick={() => setGroup({ items: (group.items || []).filter((_: any, j: number) => j !== ii) })}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                      </button>
                    ) : <span></span>}
                  </div>
                ))}
                <div className="flex items-center justify-between mt-1">
                  <button type="button" className="text-xs font-medium text-brand-600 hover:text-brand-800 flex items-center gap-1" onClick={() => setGroup({ items: [...(group.items || []), emptyInwardItem()] })}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    Add part
                  </button>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600 hover:text-brand-700">
                    <span className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-2 hover:border-brand-400">Choose Files</span>
                    {(group.files || []).length ? <span className="max-w-[12rem] truncate text-slate-500">{group.files.map((f: File) => f.name).join(', ')}</span> : <span className="text-slate-400">No file chosen</span>}
                    <input type="file" multiple accept="*/*" className="hidden" onChange={e=>{ setGroup({ files: [...(group.files || []), ...Array.from(e.target.files || [])] }); e.currentTarget.value=''; }} />
                  </label>
                </div>
              </div>);
            })}
          </div>
        </div>
      </Modal>

      {/* Generic View Modal */}

      {/* Finished Goods + Costing gate (Inward drag opens this, not the entry form) */}
      {costingModalTarget && (
        <ErrorBoundary title="Finished Goods costing failed to open" onClose={() => setCostingModalTarget(null)}>
          <FgCostingModal
            card={costingModalTarget}
            onClose={() => setCostingModalTarget(null)}
            onMoved={() => { setCostingModalTarget(null); fetchPipeline(); }}
          />
        </ErrorBoundary>
      )}

      {/* Finished Goods Modal */}
      <Modal open={!!fgModalTarget} onClose={() => setFgModalTarget(null)} title="Finished Goods Entry" size="lg" footer={<><Button variant="secondary" onClick={() => setFgModalTarget(null)}>Cancel</Button><Button onClick={saveFinishedGoods}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <PipelineContextBanner stage="Finished Goods" uniqueNo={fgModalTarget?.refNo} products={fgForm.partName || fgModalTarget?.part} customer={fgForm.customer || fgModalTarget?.customer} />
          <FormField label="Category" required><select className={inputClass}><option>Finished Goods</option></select></FormField>
          <FormField label="Date" required><input type="date" className={inputClass} value={fgForm.date || ''} onChange={e=>setFgForm({...fgForm, date: e.target.value})} /></FormField>
          {fgModalTarget?.raw?.id ? (
            <FormField label="Max Available Quantity (from Inward)"><input type="number" className={`${inputClass} bg-slate-100 font-bold`} value={fgForm.orderQty || ''} disabled /></FormField>
          ) : (
            <FormField label="Order Quantity" required><input type="number" className={inputClass} value={fgForm.orderQty || ''} onChange={e=>setFgForm({...fgForm, orderQty: e.target.value})} /></FormField>
          )}
          <FormField label="Quantity to Process" required><input type="number" className={inputClass} value={fgForm.completedQty || ''} onChange={e=>setFgForm({...fgForm, completedQty: e.target.value})} /></FormField>
        </div>
      </Modal>

      {/* Delivery Challan Modal */}
      <Modal open={!!dcModalTarget} onClose={() => setDcModalTarget(null)} title="Delivery Challan Form" size="lg" footer={<><Button variant="secondary" onClick={() => setDcModalTarget(null)}>Cancel</Button><Button onClick={saveDeliveryChallan} disabled={dcSaving}>{dcSaving ? 'Saving...' : 'Save'}</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <PipelineContextBanner stage="Delivery Challan" uniqueNo={dcModalTarget?.refNo} products={dcForm.partName || dcModalTarget?.part} customer={dcForm.partyName || dcModalTarget?.customer} />
          <FormField label="Date" required><input type="date" className={inputClass} value={dcForm.date || ''} onChange={e=>setDcForm({...dcForm, date: e.target.value})} /></FormField>
          <CustomerAutocomplete
            label="Party Name"
            required
            value={dcForm.partyName || ''}
            onChange={val => setDcForm((prev: any) => ({ ...prev, partyName: val }))}
            companies={allKnownCompanies}
            inputClass={inputClass}
            placeholder="Type or select party..."
          />
          <FormField label="PO / WO Number"><input className={inputClass} value={dcForm.poNumber || ''} onChange={e=>setDcForm({...dcForm, poNumber: e.target.value})} /></FormField>
          <FormField label="Vehicle No"><input className={inputClass} value={dcForm.vehicleNo || ''} onChange={e=>setDcForm({...dcForm, vehicleNo: e.target.value})} /></FormField>
          <FormField label="E-Way Bill No"><input className={inputClass} value={dcForm.ewayBill || ''} onChange={e=>setDcForm({...dcForm, ewayBill: e.target.value})} /></FormField>
          <div className="col-span-2 border-t border-slate-100 mt-2 pt-4">
            <h4 className="font-semibold text-sm text-slate-800 mb-3">Product Details</h4>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Product Name" required><input className={inputClass} value={dcForm.partName || ''} onChange={e=>setDcForm({...dcForm, partName: e.target.value})} /></FormField>
              <FormField label="Quantity" required><input type="number" min="0" className={inputClass} value={dcForm.quantity || ''} onChange={e=>setDcForm({...dcForm, quantity: e.target.value})} /></FormField>
              <FormField label="Price"><input type="number" className={inputClass} value={dcForm.price || ''} onChange={e=>setDcForm({...dcForm, price: e.target.value})} /></FormField>
            </div>
            {dcForm.availableQty != null && (
              <p className="text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 mt-3">
                Available for Delivery: {Number(dcForm.availableQty).toLocaleString('en-IN')} pcs
                <span className="font-normal text-violet-600"> (good completed minus already delivered — rejected qty can never be dispatched)</span>
              </p>
            )}
          </div>
        </div>
      </Modal>

      {/* DC → Invoice gate (approved FG price, no manual re-entry) */}
      {invoiceCostingTarget && (
        <ErrorBoundary title="Invoice entry failed to open" onClose={() => setInvoiceCostingTarget(null)}>
          <DcInvoiceModal
            card={invoiceCostingTarget}
            onClose={() => setInvoiceCostingTarget(null)}
            onMoved={() => { setInvoiceCostingTarget(null); fetchPipeline(); }}
          />
        </ErrorBoundary>
      )}

      {/* Invoice Modal */}
      <Modal open={!!invoiceModalTarget} onClose={() => setInvoiceModalTarget(null)} title="Invoice Entry" size="lg" footer={<><Button variant="secondary" onClick={() => setInvoiceModalTarget(null)}>Cancel</Button><Button onClick={saveInvoice}>Submit</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <PipelineContextBanner stage="Invoice" uniqueNo={invoiceModalTarget?.refNo || invoiceForm.dcNumber} products={invoiceForm.partName || invoiceModalTarget?.part} customer={invoiceForm.partyName || invoiceModalTarget?.customer} />
          <FormField label="Document Type" required><select className={inputClass}><option>Tax Invoice</option></select></FormField>
          <CustomerAutocomplete
            label="Party Name"
            required
            value={invoiceForm.partyName || ''}
            onChange={val => setInvoiceForm((prev: any) => ({ ...prev, partyName: val }))}
            companies={allKnownCompanies}
            inputClass={inputClass}
            placeholder="Type or select party..."
          />
          <FormField label="DC Number"><input className={inputClass} value={invoiceForm.dcNumber || ''} onChange={e=>setInvoiceForm({...invoiceForm, dcNumber: e.target.value})} /></FormField>
          <FormField label="Date" required><input type="date" className={inputClass} value={invoiceForm.date || ''} onChange={e=>setInvoiceForm({...invoiceForm, date: e.target.value})} /></FormField>
          <div className="col-span-2 border-t border-slate-100 mt-2 pt-4">
            <h4 className="font-semibold text-sm text-slate-800 mb-3">Item Details</h4>
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-2"><FormField label="Item Name" required><input className={inputClass} value={invoiceForm.partName || ''} onChange={e=>setInvoiceForm({...invoiceForm, partName: e.target.value})} /></FormField></div>
              <FormField label="Qty" required><input type="number" className={inputClass} value={invoiceForm.quantity || ''} onChange={e=>setInvoiceForm({...invoiceForm, quantity: e.target.value})} /></FormField>
              <FormField label="Unit Price" required><input type="number" className={inputClass} value={invoiceForm.price || ''} onChange={e=>setInvoiceForm({...invoiceForm, price: e.target.value})} /></FormField>
              <FormField label="CGST (%)"><input type="number" className={inputClass} value={invoiceForm.cgst || ''} onChange={e=>setInvoiceForm({...invoiceForm, cgst: e.target.value})} /></FormField>
              <FormField label="SGST (%)"><input type="number" className={inputClass} value={invoiceForm.sgst || ''} onChange={e=>setInvoiceForm({...invoiceForm, sgst: e.target.value})} /></FormField>
              <FormField label="IGST (%)"><input type="number" className={inputClass} value={invoiceForm.igst || ''} onChange={e=>setInvoiceForm({...invoiceForm, igst: e.target.value})} /></FormField>
              <FormField label="Tax / Total"><div className={`${inputClass} bg-slate-50 text-xs`}>
              {(() => {
                const q = Number(invoiceForm.quantity) || 0;
                const p = Number(invoiceForm.price) || 0;
                const basic = q * p;
                const num = (v: any) => (v === '' || v == null ? null : Number(v) || 0);
                const c = num(invoiceForm.cgst);
                const s = num(invoiceForm.sgst);
                const ig = num(invoiceForm.igst);
                const tax = basic * ((c || 0) + (s || 0) + (ig || 0)) / 100;
                const row = (label: string, amount: number) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-medium text-slate-700">{formatINR(amount)}</span>
                  </div>
                );
                return (
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Basic</span>
                      <span className="font-semibold text-slate-800">{formatINR(basic)}</span>
                    </div>
                    {c !== null && row(`CGST (${c}%)`, basic * c / 100)}
                    {s !== null && row(`SGST (${s}%)`, basic * s / 100)}
                    {ig !== null && row(`IGST (${ig}%)`, basic * ig / 100)}
                    {c === null && s === null && ig === null && (
                      <div className="text-slate-400">GST applied from company settings on save.</div>
                    )}
                    <div className="flex justify-between border-t border-slate-200 pt-1">
                      <span className="font-bold text-slate-800">Total</span>
                      <span className="font-bold text-brand-700">{formatINR(basic + tax)}</span>
                    </div>
                  </div>
                );
              })()}
            </div></FormField>
            </div>
          </div>
        </div>
      </Modal>

      
      {/* Sales Order Modal */}
      <Modal open={!!soModalTarget} onClose={() => setSoModalTarget(null)} title="Create Sales Order" size="lg" footer={<><Button variant="secondary" onClick={() => setSoModalTarget(null)}>Cancel</Button><Button onClick={saveStandaloneSalesOrder}>Save Order</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <PipelineContextBanner stage="Sales Order" uniqueNo={soModalTarget?.refNo} products={soForm.partName || soModalTarget?.part} customer={soForm.customer || soModalTarget?.customer} />
          <CustomerAutocomplete
            label="Customer"
            required
            value={soForm.customer || ''}
            onChange={val => setSoForm((prev: any) => ({ ...prev, customer: val }))}
            companies={allKnownCompanies}
            inputClass={inputClass}
            placeholder="Type or select customer..."
          />
          <FormField label="Order Date" required><input type="date" className={inputClass} value={soForm.orderDate || ''} onChange={e=>setSoForm({...soForm, orderDate: e.target.value})} /></FormField>
          <FormField label="Delivery Date" required><input type="date" className={inputClass} value={soForm.deliveryDate || ''} onChange={e=>setSoForm({...soForm, deliveryDate: e.target.value})} /></FormField>
          <FormField label="Product Name" required><input className={inputClass} value={soForm.partName || ''} onChange={e=>setSoForm({...soForm, partName: e.target.value})} /></FormField>
          
          <FormField label="Quantity" required><input type="number" className={inputClass} value={soForm.quantity || ''} onChange={e=>setSoForm({...soForm, quantity: e.target.value})} /></FormField>
          <FormField label="Unit Price" required><input type="number" className={inputClass} value={soForm.price || ''} onChange={e=>setSoForm({...soForm, price: e.target.value})} /></FormField>
          <FormField label="GST (%)"><input type="number" className={inputClass} value={soForm.gst || ''} onChange={e=>setSoForm({...soForm, gst: e.target.value})} /></FormField>
        </div>
      </Modal>
<Modal open={!!viewModalTarget} onClose={closeViewModal} title={`${stageDetailsTitle(viewModalTarget?.stage)} — Unique Number: ${viewModalData?.order?.lead_no || viewModalData?.enquiry?.lead_no || viewModalData?.enquiry?.enquiry_no || viewModalTarget?.refNo}`} size="xl" footer={<>{viewModalData?.dc && <><Button variant="secondary" onClick={() => void viewPipelineDocument('dc')}>View DC PDF</Button><Button variant="secondary" icon={<Download size={14}/>} onClick={() => void downloadPipelineDocument('dc')}>Download DC</Button></>}{viewModalData?.invoice && <><Button variant="secondary" onClick={() => void viewPipelineDocument('invoice')}>View Invoice PDF</Button><Button variant="secondary" icon={<Download size={14}/>} onClick={() => void downloadPipelineDocument('invoice')}>Download Invoice</Button></>}<Button variant={viewEditMode ? 'primary' : 'secondary'} onClick={() => setViewEditMode(!viewEditMode)}>{viewEditMode ? 'Done Editing' : 'Enable Inline Editing'}</Button><Button variant="secondary" onClick={closeViewModal}>Close</Button></>}>
        {viewModalData ? (
          <div className="flex flex-col max-h-[75vh] overflow-y-auto pr-2">
            {(() => {
              const enq: any = viewModalData?.enquiry;
              const quo: any = viewModalData?.quotation;
              const ord: any = viewModalData?.order;
              const uniq = ord?.lead_no || enq?.lead_no || enq?.enquiry_no || viewModalTarget?.refNo || '—';
              const cust = enq?.customer || quo?.customer || ord?.customer || viewModalData?.inward?.party_name || viewModalData?.finished_goods?.customer || viewModalData?.dc?.customer_name || viewModalData?.invoice?.customer_name || viewModalTarget?.customer || '—';
              const rawNames: string[] = [];
              // Split on commas: stored summaries like "A, B (2 Products)" dissolve
              // into real product names before dedupe.
              const pushRaw = (v: any) => {
                String(v || '').split(',').forEach(fragment => {
                  const s = fragment.trim();
                  if (s) rawNames.push(s);
                });
              };
              const fromItems = (items: any) => { if (Array.isArray(items)) items.forEach((it: any) => pushRaw(it.partName || it.productName || it.part_name)); };
              fromItems(enq?.items);
              fromItems(quo?.items);
              fromItems(ord?.items);
              try { const parsed = JSON.parse(quo?.description || 'null'); fromItems(parsed); } catch { /* plain-text description */ }
              if (Array.isArray(enq?.enquiring_for)) enq.enquiring_for.forEach((e: any) => pushRaw(e.partName || e.productName || e.part_name));
              else if (typeof enq?.enquiring_for === 'string') { try { fromItems(JSON.parse(enq.enquiring_for)); } catch { /* plain text */ } }
              pushRaw(enq?.part_name); pushRaw(quo?.part_name); pushRaw(ord?.part_name);
              pushRaw(viewModalData?.inward?.product_name); pushRaw(viewModalData?.finished_goods?.part_name);
              fromItems(viewModalData?.invoice?.items); pushRaw(viewModalData?.invoice?.part_name);
              // Drop placeholders and summary labels; keep real names and dedupe across
              // stages using a normalized key (case/punctuation/whitespace-insensitive).
              const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
              const seen = new Set<string>();
              let names: string[] = [];
              for (const raw of rawNames) {
                // Strip trailing summary suffixes like "(2 Products)" so they never display.
                const s = raw.trim().replace(/\s*\(?\d+\s*products?\)?\s*$/i, '').trim().replace(/[,;\s]+$/, '');
                if (!s || s === '—' || s.toUpperCase() === 'N/A') continue;
                if (/multiple\s*products?/i.test(s)) continue;
                const key = normKey(s);
                if (!key || seen.has(key)) continue;
                seen.add(key);
                names.push(s);
              }
              // Drop combined entries (e.g. "A, B") when every fragment is listed on its own.
              names = names.filter(n => {
                const frags = n.split(',').map(f => f.trim()).filter(Boolean);
                if (frags.length < 2) return true;
                return !frags.every(f => seen.has(normKey(f)));
              });
              return (
                <div className="w-full rounded-xl border-2 border-brand-300 bg-brand-50 px-4 py-3 grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                  <div>
                    <span className="block text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-0.5">Unique Number</span>
                    <span className="text-sm font-extrabold text-slate-900">{uniq}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-0.5">Customer</span>
                    <span className="text-sm font-extrabold text-slate-900 break-words">{cust}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-0.5">Products ({names.length})</span>
                    <span className="text-sm font-extrabold text-slate-900 break-words">{names.length ? names.join(', ') : '—'}</span>
                  </div>
                </div>
              );
            })()}
            {viewModalData?.qtyTracking && (
              <QtyTrackingSection
                q={viewModalData.qtyTracking}
                userName={userName}
                onSaved={(summary) => setViewModalData((prev: any) => (prev ? { ...prev, qtyTracking: summary } : prev))}
              />
            )}
            {(() => {
              // Show the opened card's own stage details first, then the rest in pipeline order.
              const sections = [
                { key: 'Invoice', node: renderRecordData('Invoice', viewModalData?.invoice) },
                { key: 'DC', node: renderRecordData('DC', viewModalData?.dc) },
                { key: 'Finished Goods', node: renderRecordData('Finished Goods', viewModalData?.finished_goods) },
                { key: 'Inward', node: (() => {
                  // Rows saved from one inward card share product/category/ref/date:
                  // show them as one section with its part lines, like the entry card.
                  const list = (Array.isArray(viewModalData?.inwards) && viewModalData.inwards.length
                    ? viewModalData.inwards : (viewModalData.inward ? [viewModalData.inward] : []));
                  if (!list.length) return null;
                  const gkey = (r: any) => [r.product_name || '', r.category || '', r.reference_no || '', r.inward_date || ''].join('|');
                  const groups: any[][] = [];
                  list.forEach((r: any) => {
                    const k = gkey(r);
                    let g = groups.find(gg => gkey(gg[0]) === k);
                    if (!g) { g = []; groups.push(g); }
                    g.push(r);
                  });
                  const lineKeys = ['part_name', 'quantity', 'price', 'discount_percent', 'gst_percent', 'total_amount'];
                  const lineHead = ['Part Name', 'Quantity', 'Price', 'Discount', 'GST', 'Total (Rs.)'];
                  return (<>{groups.map((g, gi) => (
                    <div key={g[0].id || gi} className="mb-6">
                      <h4 className="font-bold text-sm text-brand-800 border-b border-brand-100 pb-2 mb-3 uppercase flex justify-between items-center">
                        <span>Inward Details #{gi + 1}</span>
                      </h4>
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                        <div className="mb-3">{inwardCellFor(g[0], 'product_name', 'Product from Enquiry')}</div>
                        <div className="grid grid-cols-3 gap-4 mb-3">
                          {inwardCellFor(g[0], 'category', 'Category')}
                          {inwardCellFor(g[0], 'reference_no', 'Reference No.')}
                          {inwardCellFor(g[0], 'inward_date', 'Inward Date')}
                        </div>
                        <div className="grid grid-cols-[minmax(0,1.5fr)_4.5rem_5.5rem_4.5rem_4.5rem_6rem] gap-2 items-center mb-1 px-1">
                          {lineHead.map(h => <span key={h} className="text-[10px] font-bold text-slate-500 uppercase">{h}</span>)}
                        </div>
                        {g.map((row: any, ri: number) => (
                          <div key={row.id || ri} className="grid grid-cols-[minmax(0,1.5fr)_4.5rem_5.5rem_4.5rem_4.5rem_6rem] gap-2 items-center bg-white rounded-lg border border-slate-200 p-2 mb-2">
                            {lineKeys.map(k => <div key={k} className="contents">{inwardCellFor(row, k, '')}</div>)}
                          </div>
                        ))}
                        {g.some((r: any) => Array.isArray(r.attachments) && r.attachments.length > 0) && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {g.flatMap((r: any, ri: number) => (Array.isArray(r.attachments) ? r.attachments : []).map((att: any, ai: number) => {
                              const p = typeof att === 'string' ? att : (att.path || att.url || '');
                              const n = typeof att === 'string' ? p.split('/').pop() : (att.name || p.split('/').pop() || `File ${ai + 1}`);
                              if (!p) return null;
                              return <button key={`${ri}-${ai}`} type="button" className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-blue-700 hover:border-brand-300" onClick={() => void openProductFile(p)}><FileText size={12} />{n}</button>;
                            }))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}</>);
                })() },
                { key: 'Sales Order', node: renderRecordData('Sales Order', viewModalData.order, true) },
                { key: 'Quotation', node: renderRecordData('Quotation', viewModalData.quotation, !viewModalData.order) },
                { key: 'Enquiry', node: renderRecordData('Enquiry', viewModalData.enquiry, !viewModalData.quotation && !viewModalData.order) },
              ];
              const cur = viewModalTarget?.stage || '';
              // Enquiry Details section only shows when opened from an Enquiry card.
              const visible = sections.filter(s => s.key !== 'Enquiry' || cur === 'Enquiry');
              const ordered = [...visible.filter(s => s.key === cur), ...visible.filter(s => s.key !== cur)];
              return <>{ordered.map(s => <div key={s.key} className="contents">{s.node}</div>)}</>;
            })()}
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500">Loading historical data...</div>
        )}
      </Modal>

      {activeCommentTarget && (
        <CommentsModal 
          isOpen={true} 
          onClose={() => { setActiveCommentTarget(null); fetchPipeline(); }} 
          recordId={activeCommentTarget.id} 
          recordTitle={activeCommentTarget.refNo} 
        />
      )}

    </div>
  );
}
