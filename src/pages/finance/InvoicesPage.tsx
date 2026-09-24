import { useEffect, useState } from 'react';
import { ArrowLeft, Download, Eye, FileText, Plus, Printer, CreditCard, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { Badge, Button, Card, statusToVariant } from '@/components/ui/Card';
import { FormField, inputClass, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { financeApi, type InvoiceDetail, type InvoiceRow, type InvoiceSummary } from '@/lib/finance';
import { exportCsv, escapeHtml, printHtml } from '@/lib/reportExport';
import { formatDate, formatINR, todayISO } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

const PAGE = 10;
const cash = (v: string | number | null | undefined) => formatINR(v, { decimals: 'auto' });
const emptySummary: InvoiceSummary = { total_invoices: 0, total_value: '0', total_received: '0', outstanding: '0', overdue_count: 0, overdue_amount: '0', by_status: {}, ageing: { current: '0', d31_60: '0', d61_90: '0', d90_plus: '0' }, top_customers: [], monthly: [] };

export function InvoicesPage({ onBack }: { onBack?: () => void } = {}) {
  const { company } = useAuth();
  const [tab, setTab] = useState('');
  const [filters, setFilters] = useState({ from: '', to: '', customer: '', status: '', search: '' });
  const [draft, setDraft] = useState(filters);
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [stats, setStats] = useState<InvoiceSummary>(emptySummary);
  const [customers, setCustomers] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selected, setSelected] = useState<InvoiceDetail | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [form, setForm] = useState<any>({ invoice_type: 'Sales Invoice', invoice_date: todayISO(), customer_name: '', customer_id: '', due_date: '', po_no: '', dc_no: '', delivery_id: '', payment_terms: '' });
  const [lines, setLines] = useState<any[]>([{ description: '', quantity: '1', unit: '', rate: '', gst_rate: '', discount_pct: '0' }]);
  const [payment, setPayment] = useState<any>({ account_id: '', amount: '', txn_date: todayISO(), mode: '', reference_no: '' });

  const reload = async (p = page, f = filters, t = tab) => {
    setLoading(true); setError('');
    try {
      const [list, summary] = await Promise.all([
        financeApi.invoices({ type: t || null, status: f.status || null, customer: f.customer || null, search: f.search, from: f.from, to: f.to, page: p, pageSize: PAGE }),
        financeApi.invoiceSummary(f.from || undefined, f.to || undefined),
      ]);
      setRows(list.rows); setTotal(list.total); setStats(summary || emptySummary); setPage(p);
    } catch (e) { setRows([]); setTotal(0); setStats(emptySummary); setError(e instanceof Error ? e.message : 'Unable to load invoices.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(1, filters, tab); }, [company?.id, tab]);
  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from('cnc_customers').select('id,name').order('name'),
      supabase.from('cnc_deliveries').select('*').order('created_at', { ascending: false }),
      financeApi.bankFilters(),
    ]).then(([c, d, b]) => {
      if (!active) return;
      if (c.data) setCustomers(c.data as any[]);
      if (d.data) setDeliveries((d.data as any[]).filter(x => !['Billed', 'Cancelled'].includes(String(x.status))));
      setAccounts(b.accounts || []);
    }).catch(() => {});
    return () => { active = false; };
  }, [company?.id]);

  const view = async (r: InvoiceRow) => {
    setSelected(null);
    try { setSelected(await financeApi.invoice(r.id)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to open invoice.'); }
  };
  const startNew = () => {
    setEditId('');
    setForm({ invoice_type: 'Sales Invoice', invoice_date: todayISO(), customer_name: '', customer_id: '', due_date: '', po_no: '', dc_no: '', delivery_id: '', payment_terms: '' });
    setLines([{ description: '', quantity: '1', unit: '', rate: '', gst_rate: '', discount_pct: '0' }]);
    setFormOpen(true);
  };
  const startEdit = () => {
    if (!selected || Number(selected.received) !== 0 || selected.cancelled) return;
    const item = selected.items?.[0];
    setEditId(selected.id);
    setForm({ id: selected.id, invoice_no: selected.invoice_no, invoice_type: selected.invoice_type, invoice_date: selected.invoice_date || todayISO(), due_date: selected.due_date || '', customer_name: selected.customer_name || '', customer_id: selected.customer_id || '', po_no: selected.po_no || '', dc_no: selected.dc_no || '', payment_terms: selected.payment_terms || '' });
    setLines(selected.items?.length ? selected.items.map(item => ({ description: item.description, quantity: item.quantity, unit: item.unit || '', rate: item.rate, gst_rate: item.gst_rate, discount_pct: '0' })) : [{ description: selected.part_name || '', quantity: String(selected.quantity || 1), unit: '', rate: String(Number(selected.total || 0) / Math.max(1, Number(selected.quantity || 1))), gst_rate: '0', discount_pct: '0' }]);
    setFormOpen(true);
  };
  const save = async () => {
    if (!form.customer_name?.trim() || !lines.length || lines.some(line => !line.description?.trim() || Number(line.quantity) <= 0 || Number(line.rate) < 0)) { setError('Customer and at least one item with a positive quantity and valid rate are required.'); return; }
    setBusy(true); setError('');
    try {
      const items = lines.map(line => ({ ...line, quantity: Number(line.quantity), rate: Number(line.rate), gst_rate: line.gst_rate === '' ? null : Number(line.gst_rate), discount_pct: Number(line.discount_pct || 0) }));
      const result = await financeApi.saveInvoice({ ...form, quantity: items.reduce((sum, item) => sum + item.quantity, 0), part_name: items.map(item => item.description).join(', ') }, items);
      setFormOpen(false); await reload(1); setSelected(await financeApi.invoice(result.id));
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save invoice.'); }
    finally { setBusy(false); }
  };
  const chooseDelivery = (id: string) => {
    const d = deliveries.find(x => String(x.id) === id);
    setForm({ ...form, delivery_id: id, dc_no: d?.delivery_no || '', sales_order_id: d?.sales_order_id || '', customer_id: d?.customer_id || '', customer_name: d?.customer_name || form.customer_name });
    if (d) setLines(current => current.map((line, index) => index === 0 ? { ...line, description: d.part_name || '', quantity: String(d.dispatch_qty ?? d.quantity ?? 1) } : line));
  };
  const recordReceipt = async () => {
    if (!selected) return;
    try {
      const f = await financeApi.bankFilters();
      if (!f.accounts?.length) { setError('No bank or cash accounts are configured.'); return; }
      setAccounts(f.accounts);
      setPayment({ account_id: f.accounts[0].id, amount: selected.balance, txn_date: todayISO(), mode: '', reference_no: selected.invoice_no });
      setPayOpen(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load accounts.'); }
  };
  const saveReceipt = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await financeApi.addBankEntry({ direction: 'IN', account_id: payment.account_id, amount: payment.amount, txn_date: payment.txn_date, mode: payment.mode, reference_no: payment.reference_no, description: 'Receipt against ' + selected.invoice_no, party_type: 'Customer', party_name: selected.customer_name, customer_id: selected.customer_id, invoice_id: selected.id });
      setPayOpen(false); await reload(); setSelected(await financeApi.invoice(selected.id));
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to record receipt.'); }
    finally { setBusy(false); }
  };
  const exportRows = async () => {
    setBusy(true);
    try {
      const out: InvoiceRow[] = [];
      for (let p = 1; p <= Math.max(1, Math.ceil(total / 500)); p++) {
        const r = await financeApi.invoices({ type: tab || null, status: filters.status || null, customer: filters.customer || null, search: filters.search, from: filters.from, to: filters.to, page: p, pageSize: 500 });
        out.push(...r.rows); if (out.length >= r.total) break;
      }
      exportCsv('Invoices_' + todayISO(), [['Invoice No','Date','Customer','PO No','DC No','Basic Value','CGST','SGST','IGST','Total','Received','Balance','Status'], ...out.map(r => [r.invoice_no,r.invoice_date||'',r.customer_name||'',r.po_no||'',r.dc_no||'',r.basic_value,r.cgst,r.sgst,r.igst,r.total,r.received,r.balance,r.status])]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Export failed.'); }
    finally { setBusy(false); }
  };
  const printInvoice = () => {
    if (!selected) { window.print(); return; }
    const items = (selected.items || []).map((x,i) => '<tr><td>'+(i+1)+'</td><td>'+escapeHtml(x.description)+'</td><td>'+escapeHtml(x.quantity)+'</td><td>'+cash(x.rate)+'</td><td>'+cash(x.amount)+'</td></tr>').join('');
    printHtml(selected.invoice_no, '<h1>ARGUS CNC</h1><h2>Tax Invoice</h2><p>'+escapeHtml(selected.invoice_no)+' · '+escapeHtml(formatDate(selected.invoice_date))+'</p><p>Bill To: '+escapeHtml(selected.customer_name||'')+'</p><table><thead><tr><th>#</th><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>'+items+'</tbody></table><h3>Total: '+cash(selected.total)+'</h3>');
  };
  const cancelInvoice = async () => {
    if (!selected) return; const reason = window.prompt('Reason for cancellation:'); if (!reason?.trim()) return;
    setBusy(true); try { await financeApi.cancelInvoice(selected.id, reason); await reload(); setSelected(await financeApi.invoice(selected.id)); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to cancel invoice.'); } finally { setBusy(false); }
  };
  const createCreditNote = async () => {
    if (!selected) return; const reason = window.prompt('Reason for credit note:'); if (!reason?.trim()) return;
    setBusy(true); try { const r = await financeApi.creditNote(selected.id, reason); await reload(); setSelected(await financeApi.invoice(r.id)); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create credit note.'); } finally { setBusy(false); }
  };
  const pageCount = Math.max(1, Math.ceil(total / PAGE));

  return <div className="p-4 lg:p-6 space-y-4 bg-slate-50 min-h-full">
    {onBack&&<div><Button variant="secondary" size="sm" icon={<ArrowLeft size={14}/>} onClick={onBack}>Back</Button></div>}
    <PageHeader title="Invoices" description="Create, manage and track sales invoices, taxes, payment terms and outstanding amounts." actions={<><Button variant="secondary" size="sm" icon={<Download size={14}/>} onClick={() => void exportRows()} disabled={busy}>Export</Button><Button variant="secondary" size="sm" icon={<Printer size={14}/>} onClick={printInvoice}>Print</Button><Button size="sm" icon={<Plus size={14}/>} onClick={startNew}>New Invoice</Button></>}/>
    {error && <div className="rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700">{error}</div>}
    <div className="flex overflow-auto border-b">{[['','All Invoices'],['Sales Invoice','Sales Invoice'],['Proforma Invoice','Proforma Invoice'],['Credit Note','Credit Note'],['Cancelled','Cancelled']].map(([v,l])=><button key={v} onClick={()=>{setTab(v);setPage(1)}} className={'px-4 py-2 text-xs font-semibold border-b-2 whitespace-nowrap '+(tab===v?'border-brand-600 text-brand-700':'border-transparent text-slate-500')}>{l}</button>)}</div>
    <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
      <Metric title="Total Invoices" value={String(stats.total_invoices)} color="emerald"/><Metric title="Total Invoice Value" value={cash(stats.total_value)} color="blue"/><Metric title="Total Received" value={cash(stats.total_received)} color="amber"/><Metric title="Outstanding Amount" value={cash(stats.outstanding)} color="rose"/><Metric title="Overdue Invoices" value={String(stats.overdue_count)} color="violet"/>
    </div>
    <Card className="p-3"><div className="grid grid-cols-2 lg:grid-cols-7 gap-2 items-end">
      <FormField label="From Date"><input type="date" className={inputClass} value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></FormField>
      <FormField label="To Date"><input type="date" className={inputClass} value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></FormField>
      <FormField label="Customer"><select className={inputClass} value={draft.customer} onChange={e=>setDraft({...draft,customer:e.target.value})}><option value="">All</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField>
      <FormField label="Status"><select className={inputClass} value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}><option value="">All</option>{['Paid','Partially Paid','Overdue','Pending','Proforma','Credit Note','Cancelled'].map(x=><option key={x}>{x}</option>)}</select></FormField>
      <FormField label="Search"><input className={inputClass} placeholder="Invoice, customer, PO, DC, part..." value={draft.search} onChange={e=>setDraft({...draft,search:e.target.value})}/></FormField>
      <Button size="sm" onClick={()=>{setFilters(draft);void reload(1,draft,tab)}}>Apply</Button><Button size="sm" variant="secondary" onClick={()=>{const f={from:'',to:'',customer:'',status:'',search:''};setDraft(f);setFilters(f);void reload(1,f,tab)}}>Clear</Button>
    </div></Card>
    <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_330px] gap-4 items-start">
      <Card className="overflow-hidden"><div className="overflow-auto"><table className="w-full min-w-[1000px] text-left"><thead><tr className="bg-slate-50 border-b text-[10px] uppercase text-slate-500">{['#','Invoice No','Date','Customer','PO No','Basic','CGST','SGST','IGST','Total','Received','Balance','Status',''].map(x=><th key={x} className="px-2 py-2">{x}</th>)}</tr></thead><tbody>
        {loading?<tr><td colSpan={14} className="p-10 text-center">Loading invoices...</td></tr>:rows.map((r,i)=><tr key={r.id} onClick={()=>void view(r)} className="border-b hover:bg-blue-50/50 cursor-pointer text-xs"><td className="px-2 py-2">{(page-1)*PAGE+i+1}</td><td className="px-2 py-2 font-semibold text-blue-700">{r.invoice_no}</td><td className="px-2 py-2">{formatDate(r.invoice_date)}</td><td className="px-2 py-2">{r.customer_name||'-'}</td><td className="px-2 py-2">{r.po_no||'-'}</td><td className="px-2 py-2 text-right">{cash(r.basic_value)}</td><td className="px-2 py-2 text-right">{cash(r.cgst)}</td><td className="px-2 py-2 text-right">{cash(r.sgst)}</td><td className="px-2 py-2 text-right">{cash(r.igst)}</td><td className="px-2 py-2 text-right font-semibold">{cash(r.total)}</td><td className="px-2 py-2 text-right">{cash(r.received)}</td><td className="px-2 py-2 text-right">{cash(r.balance)}</td><td className="px-2 py-2"><Badge variant={statusToVariant(r.status)}>{r.status}</Badge></td><td className="px-2 py-2"><Eye size={14}/></td></tr>)}
        {!loading&&!rows.length&&<tr><td colSpan={14} className="p-10 text-center text-slate-500">No invoices found.</td></tr>}
      </tbody></table></div><div className="flex justify-between p-2 border-t text-xs text-slate-500"><span>{total?((page-1)*PAGE+1):0}-{Math.min(page*PAGE,total)} of {total}</span><div className="flex gap-2"><button disabled={page<=1} onClick={()=>void reload(page-1)}><ChevronLeft size={16}/></button>{page}/{pageCount}<button disabled={page>=pageCount} onClick={()=>void reload(page+1)}><ChevronRight size={16}/></button></div></div></Card>
      <Card className="overflow-hidden"><div className="p-3 border-b bg-slate-50"><h3 className="font-bold text-sm">Invoice Preview</h3><p className="text-[10px] text-slate-500">Selected database record</p></div>{!selected?<div className="p-10 text-center text-sm text-slate-500">Select an invoice.</div>:<div className="p-4 space-y-3 text-xs">
        <div className="flex justify-between"><b className="text-lg">ARGUS CNC</b><Badge variant={statusToVariant(selected.status)}>{selected.status}</Badge></div>
        <div className="grid grid-cols-2 gap-y-1 border-y py-2"><span>Invoice No</span><b>{selected.invoice_no}</b><span>Date</span><b>{formatDate(selected.invoice_date)}</b><span>Customer</span><b>{selected.customer_name}</b><span>PO / DC</span><b>{selected.po_no||'-'} / {selected.dc_no||'-'}</b></div>
        <table className="w-full"><thead><tr className="bg-slate-50"><th className="p-1 text-left">Item</th><th className="p-1 text-right">Qty</th><th className="p-1 text-right">Rate</th><th className="p-1 text-right">Amount</th></tr></thead><tbody>{(selected.items||[]).map(i=><tr key={i.id} className="border-t"><td className="p-1">{i.description}</td><td className="p-1 text-right">{i.quantity} {i.unit||''}</td><td className="p-1 text-right">{cash(i.rate)}</td><td className="p-1 text-right">{cash(i.amount)}</td></tr>)}</tbody></table>
        <Total label="Basic Value" value={cash(selected.basic_value)}/><Total label="CGST / SGST / IGST" value={cash(selected.cgst)+' / '+cash(selected.sgst)+' / '+cash(selected.igst)}/><Total label="Received" value={cash(selected.received)}/><Total label="Balance" value={cash(selected.balance)} bold/><Total label="Total" value={cash(selected.total)} bold/>
        <div className="flex flex-wrap gap-1.5 border-t pt-3"><Button size="sm" variant="secondary" onClick={printInvoice}><Printer size={13}/> Print</Button><Button size="sm" onClick={()=>void recordReceipt()} disabled={Number(selected.balance)<=0}><CreditCard size={13}/> Receipt</Button><Button size="sm" variant="secondary" onClick={startEdit} disabled={Number(selected.received)!==0}>Edit</Button>{selected.invoice_type==='Sales Invoice'&&(<><Button size="sm" variant="secondary" onClick={()=>void createCreditNote()}>Credit Note</Button><Button size="sm" variant="danger" onClick={()=>void cancelInvoice()}>Cancel</Button></>)}</div>
      </div>}</Card>
    </div>
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4"><Card className="p-4"><h3 className="font-bold text-sm mb-3">Invoice Activity</h3><div className="h-24 flex items-end gap-1 border-b">{stats.monthly.length?stats.monthly.map(x=><div key={x.day} title={formatDate(x.day)+' '+cash(x.invoiced)} className="flex-1 bg-blue-500 rounded-t" style={{height:Math.max(3,Number(x.invoiced)/Math.max(1,...stats.monthly.map(y=>Number(y.invoiced)))*90)}}/>):<span className="w-full text-center text-xs text-slate-400">No invoice activity.</span>}</div><p className="text-[10px] text-slate-500 mt-2">Actual invoice amounts from the selected date range</p></Card><Card className="p-4"><h3 className="font-bold text-sm mb-2">Outstanding by Ageing</h3><Total label="0-30 days" value={cash(stats.ageing.current)}/><Total label="31-60 days" value={cash(stats.ageing.d31_60)}/><Total label="61-90 days" value={cash(stats.ageing.d61_90)}/><Total label="Over 90 days" value={cash(stats.ageing.d90_plus)}/></Card><Card className="p-4"><h3 className="font-bold text-sm mb-2">Invoice Status</h3><div className="grid grid-cols-2 gap-2">{['Paid','Partially Paid','Overdue','Credit Note','Cancelled'].map(x=><div key={x} className="border rounded p-2 flex justify-between text-xs">{x}<b>{stats.by_status?.[x]||0}</b></div>)}</div><h4 className="font-semibold text-xs mt-3">Top Customers</h4>{stats.top_customers?.slice(0,4).map(x=><Total key={x.customer} label={x.customer} value={cash(x.value)}/>)}</Card></div>

    <Modal open={formOpen} onClose={()=>!busy&&setFormOpen(false)} title={editId?'Edit Invoice':'New Invoice'} subtitle="Tax totals and ledger postings are calculated by the database." size="2xl" footer={<><Button variant="secondary" onClick={()=>setFormOpen(false)}>Cancel</Button><Button onClick={()=>void save()} disabled={busy}>{busy?'Saving...':'Save Invoice'}</Button></>}>
      <div className="grid md:grid-cols-3 gap-3">
        <FormField label="Invoice Type"><select className={inputClass} value={form.invoice_type} onChange={e=>setForm({...form,invoice_type:e.target.value})}><option>Sales Invoice</option><option>Proforma Invoice</option></select></FormField>
        <FormField label="Invoice No (optional)"><input className={inputClass} value={form.invoice_no||''} onChange={e=>setForm({...form,invoice_no:e.target.value})} placeholder="Auto-number if blank"/></FormField>
        <FormField label="Delivery Challan"><select className={inputClass} value={form.delivery_id||''} onChange={e=>chooseDelivery(e.target.value)}><option value="">Not linked</option>{deliveries.map(d=><option key={d.id} value={d.id}>{d.delivery_no||d.id} · {d.customer_name||''}</option>)}</select></FormField>
        <FormField label="Customer" required><select className={inputClass} value={form.customer_id||''} onChange={e=>{const c=customers.find(x=>x.id===e.target.value);setForm({...form,customer_id:e.target.value,customer_name:c?.name||''})}}><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField>
        <FormField label="Invoice Date"><input type="date" className={inputClass} value={form.invoice_date} onChange={e=>setForm({...form,invoice_date:e.target.value})}/></FormField>
        <FormField label="Due Date"><input type="date" className={inputClass} value={form.due_date||''} onChange={e=>setForm({...form,due_date:e.target.value})}/></FormField>
        <FormField label="PO No"><input className={inputClass} value={form.po_no||''} onChange={e=>setForm({...form,po_no:e.target.value})}/></FormField>
        <FormField label="Payment Terms"><input className={inputClass} value={form.payment_terms||''} onChange={e=>setForm({...form,payment_terms:e.target.value})}/></FormField>
      </div>
      <div className="mt-4 space-y-3 border-t pt-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Invoice Items</h3><Button size="sm" variant="secondary" icon={<Plus size={13}/>} onClick={()=>setLines([...lines,{description:'',quantity:'1',unit:'',rate:'',gst_rate:'',discount_pct:'0'}])}>Add Item</Button></div>{lines.map((line,index)=><div key={index} className="grid md:grid-cols-7 gap-2 items-end rounded border p-2"><FormField label="Item"><input className={inputClass} value={line.description} onChange={e=>setLines(lines.map((x,i)=>i===index?{...x,description:e.target.value}:x))}/></FormField><FormField label="Quantity"><input type="number" min="0" className={inputClass} value={line.quantity} onChange={e=>setLines(lines.map((x,i)=>i===index?{...x,quantity:e.target.value}:x))}/></FormField><FormField label="Unit"><input className={inputClass} value={line.unit} onChange={e=>setLines(lines.map((x,i)=>i===index?{...x,unit:e.target.value}:x))}/></FormField><FormField label="Rate"><input type="number" min="0" className={inputClass} value={line.rate} onChange={e=>setLines(lines.map((x,i)=>i===index?{...x,rate:e.target.value}:x))}/></FormField><FormField label="GST %"><input type="number" min="0" className={inputClass} value={line.gst_rate} onChange={e=>setLines(lines.map((x,i)=>i===index?{...x,gst_rate:e.target.value}:x))} placeholder="Company default"/></FormField><FormField label="Discount %"><input type="number" min="0" className={inputClass} value={line.discount_pct} onChange={e=>setLines(lines.map((x,i)=>i===index?{...x,discount_pct:e.target.value}:x))}/></FormField><button type="button" aria-label="Remove item" disabled={lines.length===1} onClick={()=>setLines(lines.filter((_,i)=>i!==index))} className="h-9 rounded border text-rose-600 disabled:opacity-40"><Trash2 size={14} className="mx-auto"/></button></div>)}</div>
    </Modal>
    <Modal open={payOpen} onClose={()=>!busy&&setPayOpen(false)} title="Record Customer Receipt" subtitle={selected?.invoice_no} footer={<><Button variant="secondary" onClick={()=>setPayOpen(false)}>Cancel</Button><Button onClick={()=>void saveReceipt()} disabled={busy}>Record Receipt</Button></>}>
      <div className="grid md:grid-cols-2 gap-3"><FormField label="Bank / Cash Account"><select className={inputClass} value={payment.account_id} onChange={e=>setPayment({...payment,account_id:e.target.value})}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></FormField><FormField label="Amount"><input type="number" min="0.01" max={selected?.balance} className={inputClass} value={payment.amount} onChange={e=>setPayment({...payment,amount:e.target.value})}/></FormField><FormField label="Date"><input type="date" className={inputClass} value={payment.txn_date} onChange={e=>setPayment({...payment,txn_date:e.target.value})}/></FormField><FormField label="Mode"><input className={inputClass} value={payment.mode} onChange={e=>setPayment({...payment,mode:e.target.value})}/></FormField><FormField label="Reference"><input className={inputClass} value={payment.reference_no} onChange={e=>setPayment({...payment,reference_no:e.target.value})}/></FormField></div>
    </Modal>
  </div>;
}

function Metric({title,value,color}:{title:string;value:string;color:string}) { const styles:Record<string,string>={emerald:'bg-emerald-100 text-emerald-700',blue:'bg-blue-100 text-blue-700',amber:'bg-amber-100 text-amber-700',rose:'bg-rose-100 text-rose-700',violet:'bg-violet-100 text-violet-700'}; return <Card className="p-3"><div className="text-[10px] text-slate-500">{title}</div><div className="font-bold truncate">{value}</div><div className={'mt-2 h-1 rounded '+styles[color]}/></Card>; }
function Total({label,value,bold=false}:{label:string;value:string;bold?:boolean}) { return <div className={'flex justify-between py-1 text-xs '+(bold?'font-bold text-slate-900':'text-slate-600')}><span>{label}</span><span>{value}</span></div>; }
