// Copilot actions: what each command shows for confirmation (preview) and what it saves (run).
// Writes through the signed-in person's own session with the same fields the forms write, so the database's company and
// permission rules apply exactly as if the form had been used.

import { supabase } from '@/lib/supabase';
import { generateUniqueProjectNo } from '@/lib/projectNumber';
import { recordProductionBatch, fetchOrderQty } from '@/lib/orderQuantities';
import { financeApi } from '@/lib/finance';
import type { Intent, Params } from './understand';

export interface ActionCtx {
  companyId: string | null;
  canDo: (moduleKey: string, action: 'create' | 'view' | 'edit' | 'delete' | 'export' | 'approve') => boolean;
}
export interface Preview { title: string; lines: string[]; warnings: string[]; blocked?: string }
export interface RunResult { ok: boolean; message: string; where?: { path: string; label: string } }
export interface FindResult { title: string; rows: string[] }

export interface PipelineItem {
  id: string;
  type: 'enquiry' | 'quotation' | 'sales_order' | 'dc' | 'invoice' | 'inward' | 'finished_goods' | 'rejected';
  refNo: string;
  customer: string;
  part: string;
  qty: number;
  value: number;
  stage: string;
  status: string;
  date: string;
  raw?: any;
}

const str = (v: unknown) => String(v ?? '').trim();
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const today = () => new Date().toISOString().split('T')[0];
const ilikeSafe = (s: string) => s.replace(/[%_,()]/g, ' ').trim();

export function cleanProductName(s: string): string {
  let name = str(s).replace(/\s+/g, ' ');
  name = name.replace(/^(?:(?:the\s+)?(?:product|part|item)\s*(?:name)?|(?:product|part|item)?\s*name)\s*(?:is|as|are|to|[:;\-=])?\s*/i, '');
  name = name.replace(/^(?:பொரு(?:ள்|ளின்)?\s*(?:பெயர்)?|பெயர்)\s*[:\-]?\s*/i, '');
  name = name.replace(/^["'`]+|["'`]+$/g, '').trim();
  return name.trim();
}

type Product = { name: string; qty?: number; price?: number; gst?: number };
const productsOf = (p: Params): Product[] => (Array.isArray(p.products) ? p.products : [])
  .map((x: any) => {
    let name = cleanProductName(str(x?.name));
    let qty = x?.qty == null || x.qty === '' ? undefined : num(x.qty);
    // If qty was missing or 0, check if the name still has embedded quantity like "flicker quantities 2"
    if (!qty) {
      const qm = /(?:x|×|\*|\b(?:qty|quantit(?:y|ies)|குவாண்டிட்டி|அளவு|எண்ணிக்கை|count)\b)\s*(?:is|are|as|to|[:\-=])?\s*(\d+(?:\.\d+)?)/i.exec(name);
      if (qm) {
        qty = num(qm[1]);
        name = cleanProductName(name.slice(0, qm.index));
      }
    }
    return {
      name,
      qty,
      price: x?.price == null || x.price === '' ? undefined : num(x.price),
      gst: x?.gst == null ? undefined : num(x.gst),
    };
  })
  .filter((x: Product) => x.name);

async function findCustomer(name: string, companyId: string | null) {
  const n = ilikeSafe(name);
  if (!n) return null;
  let q = supabase.from('cnc_customers').select('id,name,contact,phone,email,city,gst').ilike('name', n);
  if (companyId) q = q.eq('company_id', companyId);
  const { data } = await q.limit(5);
  const rows = (data ?? []) as any[];
  return rows.find((r) => str(r.name).toLowerCase() === name.trim().toLowerCase()) ?? rows[0] ?? null;
}

export async function findEnquiry(identifier: string, companyId: string | null) {
  const idStr = str(identifier);
  if (!idStr) return null;

  // 1. Exact match on lead_no or enquiry_no (with company filter if provided)
  if (companyId) {
    let q1 = supabase.from('cnc_enquiries').select('*').or(`lead_no.eq.${idStr},enquiry_no.eq.${idStr}`).eq('company_id', companyId);
    const { data: d1 } = await q1.limit(1);
    if (d1 && d1.length > 0) return d1[0];
  }
  let q1All = supabase.from('cnc_enquiries').select('*').or(`lead_no.eq.${idStr},enquiry_no.eq.${idStr}`);
  const { data: d1All } = await q1All.limit(1);
  if (d1All && d1All.length > 0) return d1All[0];

  // 2. Exact match on id
  if (idStr.length > 20) {
    let qId = supabase.from('cnc_enquiries').select('*').eq('id', idStr);
    const { data: dId } = await qId.limit(1);
    if (dId && dId.length > 0) return dId[0];
  }

  // 3. Match on customer name or part name
  const safe = ilikeSafe(idStr);
  let q2 = supabase.from('cnc_enquiries').select('*').or(`customer.ilike.%${safe}%,part_name.ilike.%${safe}%`).order('created_at', { ascending: false });
  const { data: d2 } = await q2.limit(5);
  if (d2 && d2.length > 0) return d2[0];

  return null;
}

export async function findSalesOrder(identifier: string, companyId: string | null) {
  const idStr = str(identifier);
  if (!idStr) return null;

  // 1. Exact match on order_no
  let q1 = supabase.from('cnc_sales_orders').select('*').eq('order_no', idStr);
  if (companyId) q1 = q1.eq('company_id', companyId);
  const { data: d1 } = await q1.limit(1);
  if (d1 && d1.length > 0) return d1[0];

  // 2. Exact match on id
  if (idStr.length > 20) {
    let qId = supabase.from('cnc_sales_orders').select('*').eq('id', idStr);
    if (companyId) qId = qId.eq('company_id', companyId);
    const { data: dId } = await qId.limit(1);
    if (dId && dId.length > 0) return dId[0];
  }

  // 3. Search order_no or customer
  const safe = ilikeSafe(idStr);
  let q2 = supabase.from('cnc_sales_orders').select('*').or(`order_no.ilike.%${safe}%,customer.ilike.%${safe}%`).order('created_at', { ascending: false });
  if (companyId) q2 = q2.eq('company_id', companyId);
  const { data: d2 } = await q2.limit(5);
  if (d2 && d2.length > 0) return d2[0];

  return null;
}

/**
 * The records the Co-worker can move to the next stage: what is on the Kanban board now. Every table is read on its own (a problem in
 * one never hides the others) and with all its columns, so a renamed or missing column cannot make a whole stage disappear.
 * A record that has already moved on (an enquiry that became a quotation, a quotation that became an order) is not listed again.
 */
export async function fetchPipelineSummary(companyId: string | null): Promise<PipelineItem[]> {
  const items: PipelineItem[] = [];
  const rows = async (table: string): Promise<any[]> => {
    try {
      let q: any = supabase.from(table).select('*').order('created_at', { ascending: false }).limit(300);
      if (companyId) q = q.eq('company_id', companyId);
      const { data, error } = await q;
      if (error) { console.warn(`Pipeline: ${table} could not be read:`, error.message); return []; }
      return (data ?? []) as any[];
    } catch (e) { console.warn(`Pipeline: ${table} could not be read:`, e); return []; }
  };
  const dateOf = (d: any, ...keys: string[]) => { for (const k of keys) if (d[k]) return String(d[k]).slice(0, 10); return d.created_at ? String(d.created_at).slice(0, 10) : ''; };
  const MOVED = /quot|order|inward|finish|deliver|dc\b|invoice|convert|lost|cancel|reject|closed|declin/i;
  const DEAD = /cancel|lost|reject|declin|closed|void|deleted/i;

  const [enqs, qus, sos, inws, dcs, invs] = await Promise.all([
    rows('cnc_enquiries'), rows('cnc_quotations'), rows('cnc_sales_orders'), rows('cnc_inwards'), rows('cnc_deliveries'), rows('cnc_invoices'),
  ]);

  for (const e of enqs) {
    // still an enquiry: its stage is "Enquiry" (or empty) and it has not been quoted, converted or closed
    const stage = str(e.pipeline_stage);
    if ((stage && stage.toLowerCase() !== 'enquiry' && MOVED.test(stage)) || MOVED.test(str(e.status))) continue;
    items.push({
      id: e.id, type: 'enquiry', refNo: e.lead_no || e.enquiry_no || 'ENQ', customer: e.customer || 'Unknown', part: e.part_name || '-',
      qty: num(e.quantity), value: num(e.estimated_value), stage: e.pipeline_stage || 'Enquiry', status: e.status || 'New',
      date: dateOf(e, 'received_date'), raw: e,
    });
  }
  for (const q of qus) {
    if (DEAD.test(str(q.status)) || /convert|order|won|accept/i.test(str(q.status))) continue;
    items.push({
      id: q.id, type: 'quotation', refNo: q.quote_no || 'QT', customer: q.customer || 'Unknown', part: q.part_name || '-',
      qty: num(q.quantity), value: num(q.total_value), stage: 'Quotation', status: q.status || 'Draft', date: dateOf(q, 'date', 'quotation_date'), raw: q,
    });
  }
  for (const s of sos) {
    if (DEAD.test(str(s.status))) continue;
    items.push({
      id: s.id, type: 'sales_order', refNo: s.order_no || 'SO', customer: s.customer || 'Unknown', part: s.part_name || '-',
      qty: num(s.quantity), value: num(s.total_value) || num(s.value), stage: 'Sales Order', status: s.status || 'Confirmed', date: dateOf(s, 'order_date'), raw: s,
    });
  }
  for (const iw of inws) {
    if (/delete/i.test(str(iw.status))) continue;
    items.push({
      id: iw.id, type: 'inward', refNo: iw.inward_no || 'INW', customer: iw.party_name || 'Party', part: iw.part_name || '-',
      qty: num(iw.quantity), value: 0, stage: 'Inward', status: iw.status || 'Received', date: dateOf(iw, 'inward_date'), raw: iw,
    });
  }
  for (const d of dcs) {
    items.push({
      id: d.id, type: 'dc', refNo: d.delivery_no || 'DC', customer: d.customer_name || 'Unknown', part: d.part_name || '-',
      qty: num(d.quantity), value: 0, stage: 'DC', status: d.status || 'Delivered', date: dateOf(d, 'delivery_date'), raw: d,
    });
  }
  for (const v of invs) {
    if (v.cancelled) continue;
    items.push({
      id: v.id, type: 'invoice', refNo: v.invoice_no || 'INV', customer: v.customer_name || 'Unknown', part: v.part_name || '-',
      qty: num(v.quantity), value: num(v.amount), stage: 'Invoice', status: v.status || 'Unpaid', date: dateOf(v, 'invoice_date'), raw: v,
    });
  }
  return items;
}

export function blockedReason(intent: Intent, ctx: ActionCtx): string | undefined {
  const need: Partial<Record<Intent, string>> = {
    add_company: 'companies',
    add_enquiry: 'enquiries',
    edit_enquiry: 'enquiries',
    delete_enquiry: 'enquiries',
    add_sales_order: 'sales-orders',
    edit_sales_order: 'sales-orders',
    delete_sales_order: 'sales-orders',
    move_stage: 'enquiries',
  };
  const m = need[intent];
  if (!m) return undefined;

  const actionType: 'create' | 'edit' | 'delete' =
    intent.startsWith('delete_') ? 'delete' : intent.startsWith('edit_') || intent === 'move_stage' ? 'edit' : 'create';

  if (!ctx.canDo(m, actionType)) {
    return `Your account is not allowed to ${actionType} these records. Ask your administrator for access.`;
  }
  return undefined;
}

// ------------------------------------------------------------------------------------------------ preview
export async function previewAction(intent: Intent, p: Params, ctx: ActionCtx): Promise<Preview> {
  const blocked = blockedReason(intent, ctx);
  const warnings: string[] = [];

  if (intent === 'add_company') {
    const dup = await findCustomer(str(p.name), ctx.companyId);
    if (dup && str(dup.name).toLowerCase() === str(p.name).toLowerCase()) {
      return { title: 'Add company', lines: [`Name: ${str(p.name)}`], warnings: [], blocked: `“${dup.name}” already exists in the company list.` };
    }
    const lines = [`Name: ${str(p.name)}`];
    if (str(p.address)) lines.push(`Address: ${str(p.address)}`);
    if (str(p.gst)) lines.push(`GST No.: ${str(p.gst)}`);
    if (str(p.phone)) lines.push(`Phone: ${str(p.phone)}`);
    if (str(p.email)) lines.push(`Email: ${str(p.email)}`);
    if (str(p.gst) && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(str(p.gst).toUpperCase())) {
      warnings.push('That GST number does not look like a valid 15-character GSTIN.');
    }
    return { title: 'Add company', lines, warnings, blocked };
  }

  if (intent === 'add_enquiry') {
    const co = await findCustomer(str(p.company), ctx.companyId);
    const items = productsOf(p);
    if (!co) warnings.push(`“${str(p.company)}” is not in the company list. The enquiry will be saved under this name.`);
    if (items.some((i) => i.qty != null && i.qty < 0)) return { title: 'Add enquiry', lines: [], warnings: [], blocked: 'Quantities cannot be negative.' };
    return {
      title: 'Add Enquiry',
      lines: [
        `Company: ${co?.name ?? str(p.company)}`,
        ...items.map((i) => `Product: ${i.name}${i.qty != null ? ` · Qty ${i.qty}` : ''}`),
        ...(str(p.remarks) ? [`Remarks: ${str(p.remarks)}`] : []),
      ],
      warnings,
      blocked,
    };
  }

  if (intent === 'edit_enquiry') {
    const target = await findEnquiry(str(p.identifier), ctx.companyId);
    if (!target) return { title: 'Edit enquiry', lines: [], warnings: [], blocked: `Could not find enquiry matching “${str(p.identifier)}”.` };
    const lines = [
      `Target Enquiry: ${target.lead_no || target.enquiry_no} (${target.customer})`,
      `Current Product: ${target.part_name || '-'} · Qty: ${target.quantity || 0}`,
    ];
    const up = p.updates || {};
    if (up.quantity != null) lines.push(`👉 Quantity: ${target.quantity || 0} ➔ ${up.quantity}`);
    if (up.part_name) lines.push(`👉 Part Name: "${target.part_name || '-'}" ➔ "${up.part_name}"`);
    if (up.customer) lines.push(`👉 Customer: "${target.customer}" ➔ "${up.customer}"`);
    if (up.estimated_value != null) lines.push(`👉 Value: ₹${num(target.estimated_value).toLocaleString('en-IN')} ➔ ₹${num(up.estimated_value).toLocaleString('en-IN')}`);
    if (up.status) lines.push(`👉 Status: ${target.status} ➔ ${up.status}`);
    return { title: 'Edit Enquiry', lines, warnings, blocked };
  }

  if (intent === 'delete_enquiry') {
    const target = await findEnquiry(str(p.identifier), ctx.companyId);
    if (!target) return { title: 'Delete enquiry', lines: [], warnings: [], blocked: `Could not find enquiry matching “${str(p.identifier)}”.` };
    const lines = [
      `Enquiry: ${target.lead_no || target.enquiry_no}`,
      `Customer: ${target.customer}`,
      `Product: ${target.part_name || '-'} · Qty: ${target.quantity || 0}`,
    ];
    warnings.push('This enquiry will be permanently removed from the database.');
    return { title: 'Delete Enquiry', lines, warnings, blocked };
  }

  if (intent === 'add_sales_order') {
    const co = await findCustomer(str(p.company), ctx.companyId);
    const items = productsOf(p);
    const orderDate = str(p.order_date) || today();
    if (str(p.delivery_date) && str(p.delivery_date) <= orderDate) {
      return { title: 'Create sales order', lines: [], warnings: [], blocked: 'The delivery date must be after the order date.' };
    }
    if (!co) warnings.push(`“${str(p.company)}” is not in the company list; the order will be saved under this name.`);
    if (!items.length) warnings.push('No products specified. The order will be saved without products.');
    return {
      title: 'Create Sales Order',
      lines: [
        `Company: ${co?.name ?? str(p.company)}`,
        `Order Date: ${orderDate}`,
        ...(str(p.delivery_date) ? [`Delivery Date: ${str(p.delivery_date)}`] : []),
        ...(str(p.po_no) ? [`PO No: ${str(p.po_no)}`] : []),
        ...items.map((i) => `Product: ${i.name}${i.qty != null ? ` · Qty ${i.qty}` : ''}${i.price != null ? ` · ₹${i.price}` : ''}`),
      ],
      warnings,
      blocked,
    };
  }

  if (intent === 'edit_sales_order') {
    const target = await findSalesOrder(str(p.identifier), ctx.companyId);
    if (!target) return { title: 'Edit sales order', lines: [], warnings: [], blocked: `Could not find sales order matching “${str(p.identifier)}”.` };
    const lines = [
      `Sales Order: ${target.order_no} (${target.customer})`,
      `Current Product: ${target.part_name || '-'} · Qty: ${target.quantity || 0}`,
    ];
    const up = p.updates || {};
    if (up.quantity != null) lines.push(`👉 Quantity: ${target.quantity || 0} ➔ ${up.quantity}`);
    if (up.unit_price != null) lines.push(`👉 Unit Price: ₹${up.unit_price}`);
    if (up.po_no) lines.push(`👉 PO No: ${up.po_no}`);
    if (up.delivery_date) lines.push(`👉 Delivery Date: ${up.delivery_date}`);
    return { title: 'Edit Sales Order', lines, warnings, blocked };
  }

  if (intent === 'delete_sales_order') {
    const target = await findSalesOrder(str(p.identifier), ctx.companyId);
    if (!target) return { title: 'Delete sales order', lines: [], warnings: [], blocked: `Could not find sales order matching “${str(p.identifier)}”.` };
    const lines = [
      `Sales Order: ${target.order_no}`,
      `Customer: ${target.customer}`,
      `Product: ${target.part_name || '-'} · Qty: ${target.quantity || 0}`,
    ];
    warnings.push('This sales order will be permanently removed from the database.');
    return { title: 'Delete Sales Order', lines, warnings, blocked };
  }

  if (intent === 'move_stage') {
    const target = await findEnquiry(str(p.identifier), ctx.companyId) || await findSalesOrder(str(p.identifier), ctx.companyId);
    const targetName = target ? (target.lead_no || target.order_no || target.customer) : str(p.identifier);
    const cust = target?.customer ? ` (${target.customer})` : '';
    const toStage = str(p.target_stage);
    const stageNorm = toStage.toLowerCase().includes('quot') ? 'Quotation'
      : toStage.toLowerCase().includes('order') || toStage.toLowerCase().includes('sales') ? 'Sales Order'
      : toStage.toLowerCase().includes('inward') ? 'Inward'
      : toStage.toLowerCase().includes('finish') ? 'Finished Goods'
      : toStage.toLowerCase().includes('dc') || toStage.toLowerCase().includes('deliver') ? 'DC'
      : toStage.toLowerCase().includes('invoice') ? 'Invoice'
      : toStage;

    const lines = [
      `Record: #${targetName}${cust}`,
      `Current Stage: ${target?.pipeline_stage || (target?.order_no ? 'Sales Order' : 'Enquiry')}`,
      `👉 Move To: ${stageNorm}`,
    ];

    if (stageNorm === 'Quotation') {
      if (p.price) lines.push(`👉 Unit Price: ₹${p.price}`);
      lines.push(`📋 Next: The Create Quotation form will open on your screen to enter Unit Price, Discount & Terms.`);
    } else if (stageNorm === 'Inward') {
      lines.push(`📋 Next: The Inward Entry form will open on your screen to record received materials.`);
    } else if (stageNorm === 'DC') {
      lines.push(`📋 Next: The Delivery Challan form will open on your screen to confirm delivery details.`);
    }

    return {
      title: `Move #${targetName} to ${stageNorm}`,
      lines,
      warnings: [],
      blocked,
    };
  }

  return { title: 'Action', lines: [], warnings: [], blocked: 'I cannot do that yet.' };
}

// ------------------------------------------------------------------------------------------------ run
export async function runAction(intent: Intent, p: Params, ctx: ActionCtx): Promise<RunResult> {
  const blocked = blockedReason(intent, ctx);
  if (blocked) return { ok: false, message: blocked };
  try {
    if (intent === 'add_company') return await addCompany(p, ctx);
    if (intent === 'add_enquiry') return await addEnquiry(p, ctx);
    if (intent === 'edit_enquiry') return await editEnquiry(p, ctx);
    if (intent === 'delete_enquiry') return await deleteEnquiry(p, ctx);
    if (intent === 'add_sales_order') return await addSalesOrder(p, ctx);
    if (intent === 'edit_sales_order') return await editSalesOrder(p, ctx);
    if (intent === 'delete_sales_order') return await deleteSalesOrder(p, ctx);
    if (intent === 'move_stage') return await moveStageAction(p, ctx);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
  return { ok: false, message: 'I cannot do that yet.' };
}

async function addCompany(p: Params, ctx: ActionCtx): Promise<RunResult> {
  const name = str(p.name);
  if (!name) return { ok: false, message: 'The company name is required.' };
  const dup = await findCustomer(name, ctx.companyId);
  if (dup && str(dup.name).toLowerCase() === name.toLowerCase()) return { ok: false, message: `“${dup.name}” already exists in the company list.` };
  const payload: any = {
    id: `CUST-${Math.floor(1000 + Math.random() * 9000)}`,
    name,
    contact: str(p.contact_person) || null,
    phone: str(p.phone) || null,
    email: str(p.email) || null,
    city: str(p.address) || null,
    gst: str(p.gst) || null,
    source: str(p.source) || 'Direct',
    status: 'Active',
  };
  if (ctx.companyId) payload.company_id = ctx.companyId;
  const { error } = await supabase.from('cnc_customers').insert([payload]);
  if (error) return { ok: false, message: `Could not save the company: ${error.message}` };
  return { ok: true, message: `Company “${name}” saved successfully.`, where: { path: '/sales/pipeline', label: 'Company Library' } };
}

async function addEnquiry(p: Params, ctx: ActionCtx): Promise<RunResult> {
  const items = productsOf(p);
  if (!str(p.company)) return { ok: false, message: 'The company is required.' };
  if (!items.length) return { ok: false, message: 'At least one product is required.' };
  if (items.some((i) => (i.qty ?? 0) < 0)) return { ok: false, message: 'Quantities cannot be negative.' };
  const co = await findCustomer(str(p.company), ctx.companyId);
  const { data: existing } = await supabase.from('cnc_enquiries').select('lead_no,enquiry_no');
  const leadNo = generateUniqueProjectNo((existing ?? []) as any[]);
  const toSave = items.map((i) => ({ productName: i.name, partName: i.name, quantity: String(i.qty ?? 0), remarks: '', filePaths: [] as string[] }));
  const names = toSave.map((i) => i.productName).join(', ');
  const payload: any = {
    id: crypto.randomUUID(),
    lead_no: leadNo,
    enquiry_no: leadNo,
    customer: co?.name ?? str(p.company),
    contact_person: co?.contact ?? '',
    phone: co?.phone ?? '',
    email: co?.email ?? '',
    enquiring_for: JSON.stringify(toSave),
    part_name: toSave.length > 1 ? `${names} (${toSave.length} Products)` : toSave[0].productName,
    part_no: 'N/A',
    quantity: toSave.reduce((s, i) => s + num(i.quantity), 0),
    expected_date: null,
    received_date: today(),
    estimated_value: 0,
    source: 'Direct',
    status: 'New',
    pipeline_stage: 'Enquiry',
  };
  if (str(p.remarks)) {
    toSave[0].remarks = str(p.remarks);
    payload.enquiring_for = JSON.stringify(toSave);
  }
  if (ctx.companyId) payload.company_id = ctx.companyId;
  const { error } = await supabase.from('cnc_enquiries').insert([payload]);
  if (error) return { ok: false, message: `Could not save enquiry: ${error.message}` };
  return { ok: true, message: `Enquiry ${leadNo} created for ${payload.customer}. It is now in the ENQUIRY stage.`, where: { path: '/sales/pipeline', label: 'Sales Pipeline' } };
}

async function editEnquiry(p: Params, ctx: ActionCtx): Promise<RunResult> {
  const target = await findEnquiry(str(p.identifier), ctx.companyId);
  if (!target) return { ok: false, message: `Could not find enquiry matching “${p.identifier}”.` };

  const updates: any = {};
  const up = p.updates || {};
  if (up.customer) updates.customer = str(up.customer);
  if (up.part_name) updates.part_name = cleanProductName(str(up.part_name));
  if (up.quantity != null && up.quantity !== '') updates.quantity = num(up.quantity);
  // Auto-extract quantity if part_name has it embedded
  if (updates.part_name && updates.quantity == null) {
    const qm = /(?:x|×|\*|\b(?:qty|quantit(?:y|ies)|குவாண்டிட்டி|அளவு|எண்ணிக்கை|count)\b)\s*(?:is|are|as|to|[:\-=])?\s*(\d+(?:\.\d+)?)/i.exec(updates.part_name);
    if (qm) {
      updates.quantity = num(qm[1]);
      updates.part_name = cleanProductName(updates.part_name.slice(0, qm.index));
    }
  }
  if (up.estimated_value != null && up.estimated_value !== '') updates.estimated_value = num(up.estimated_value);
  if (up.status) updates.status = str(up.status);
  if (up.pipeline_stage) updates.pipeline_stage = str(up.pipeline_stage);

  // Sync enquiring_for JSON so pipeline modals and card views display correctly
  if (updates.quantity != null || updates.part_name != null) {
    try {
      let items: any[] = [];
      if (typeof target.enquiring_for === 'string' && target.enquiring_for) {
        items = JSON.parse(target.enquiring_for);
      } else if (Array.isArray(target.enquiring_for)) {
        items = target.enquiring_for;
      }
      if (items.length > 0) {
        if (updates.quantity != null) items[0].quantity = String(updates.quantity);
        if (updates.part_name != null) {
          items[0].productName = updates.part_name;
          items[0].partName = updates.part_name;
        }
        updates.enquiring_for = JSON.stringify(items);
      }
    } catch { /* ignore parse error */ }
  }

  const { error } = await supabase.from('cnc_enquiries').update(updates).eq('id', target.id);
  if (error) return { ok: false, message: `Could not update enquiry: ${error.message}` };
  return {
    ok: true,
    message: `Enquiry ${target.lead_no || target.enquiry_no} (${target.customer}) updated successfully.`,
    where: { path: '/sales/pipeline', label: 'Sales Pipeline' },
  };
}

async function deleteEnquiry(p: Params, ctx: ActionCtx): Promise<RunResult> {
  const target = await findEnquiry(str(p.identifier), ctx.companyId);
  if (!target) return { ok: false, message: `Could not find enquiry matching “${p.identifier}”.` };

  const { error } = await supabase.from('cnc_enquiries').delete().eq('id', target.id);
  if (error) return { ok: false, message: `Could not delete enquiry: ${error.message}` };
  return {
    ok: true,
    message: `Enquiry ${target.lead_no || target.enquiry_no} for ${target.customer} deleted successfully.`,
    where: { path: '/sales/pipeline', label: 'Sales Pipeline' },
  };
}

async function addSalesOrder(p: Params, ctx: ActionCtx): Promise<RunResult> {
  if (!str(p.company)) return { ok: false, message: 'The company is required.' };
  const items = productsOf(p);
  const orderDate = str(p.order_date) || today();
  const delivery = str(p.delivery_date);
  if (delivery && delivery <= orderDate) return { ok: false, message: 'The delivery date must be after the order date.' };
  if (items.some((i) => (i.qty ?? 0) < 0)) return { ok: false, message: 'Quantities cannot be negative.' };
  const co = await findCustomer(str(p.company), ctx.companyId);
  const { attachDateTimeToProduct } = await import('@/pages/sales/SalesPipelinePage');
  const now = new Date();
  const finalItems = items.map((i) => ({
    id: crypto.randomUUID(),
    filePaths: [] as string[],
    partName: attachDateTimeToProduct(i.name, null, now),
    partNumber: '',
    description: '',
    quantity: String(i.qty ?? 0),
    rejectedQty: 0,
    status: 'Confirmed',
    unitPrice: String(i.price ?? 0),
    discount: '0',
    unitDiscount: '0',
    gst: String(i.gst ?? 18),
  }));
  const { data: orders } = await supabase.from('cnc_sales_orders').select('order_no');
  const taken = new Set((orders ?? []).map((o: any) => String(o.order_no)));
  let orderNo = '';
  for (let i = 0; i < 30 && (!orderNo || taken.has(orderNo)); i++) {
    orderNo = `SO-2026-${Math.floor(1000 + Math.random() * 9000)}`;
  }
  const names = finalItems.map((i) => i.partName);
  const totalQty = finalItems.reduce((s, i) => s + num(i.quantity), 0);
  const totalVal = finalItems.reduce((s, i) => s + num(i.quantity) * num(i.unitPrice) * (1 + num(i.gst) / 100), 0);
  const payload: any = {
    id: crypto.randomUUID(),
    order_no: orderNo,
    customer: co?.name ?? str(p.company),
    contact_person: '',
    phone: '',
    email: '',
    billing_address: '',
    delivery_address: '',
    shipping_contact: '',
    shipping_phone: '',
    lead_no: '',
    order_date: orderDate,
    customer_po_no: str(p.po_no),
    customer_po_date: null,
    items: finalItems,
    part_name: finalItems.length > 1 ? `${names.join(', ')} (${finalItems.length} Products)` : (names[0] ?? ''),
    part_number: '',
    part_no: '',
    quantity: totalQty,
    delivered: 0,
    value: totalVal,
    total_value: totalVal,
    delivery_date: delivery || orderDate || null,
    status: 'Confirmed',
    payment_terms: 'Net 30',
    special_instructions: '',
    internal_remarks: '',
    quotation_id: null,
  };
  if (ctx.companyId) payload.company_id = ctx.companyId;
  const { error } = await supabase.from('cnc_sales_orders').insert([payload]);
  if (error) return { ok: false, message: `Could not save sales order: ${error.message}` };
  return { ok: true, message: `Sales order ${orderNo} created for ${payload.customer}. It is now in the SALES ORDER stage.`, where: { path: '/sales/pipeline', label: 'Sales Pipeline' } };
}

async function editSalesOrder(p: Params, ctx: ActionCtx): Promise<RunResult> {
  const target = await findSalesOrder(str(p.identifier), ctx.companyId);
  if (!target) return { ok: false, message: `Could not find sales order matching “${p.identifier}”.` };

  const updates: any = {};
  const up = p.updates || {};
  if (up.customer) updates.customer = str(up.customer);
  if (up.po_no) updates.customer_po_no = str(up.po_no);
  if (up.delivery_date) updates.delivery_date = str(up.delivery_date);
  if (up.status) updates.status = str(up.status);

  if (up.quantity != null || up.unit_price != null) {
    let items = Array.isArray(target.items) ? [...target.items] : [];
    if (items.length > 0) {
      if (up.quantity != null) items[0].quantity = String(up.quantity);
      if (up.unit_price != null) items[0].unitPrice = String(up.unit_price);
      updates.items = items;
      const totalQty = items.reduce((s: number, i: any) => s + num(i.quantity), 0);
      const totalVal = items.reduce((s: number, i: any) => s + num(i.quantity) * num(i.unitPrice) * (1 + num(i.gst || 18) / 100), 0);
      updates.quantity = totalQty;
      updates.total_value = totalVal;
      updates.value = totalVal;
    } else {
      if (up.quantity != null) updates.quantity = num(up.quantity);
    }
  }

  const { error } = await supabase.from('cnc_sales_orders').update(updates).eq('id', target.id);
  if (error) return { ok: false, message: `Could not update sales order: ${error.message}` };
  return {
    ok: true,
    message: `Sales Order ${target.order_no} updated successfully.`,
    where: { path: '/sales/pipeline', label: 'Sales Pipeline' },
  };
}

async function deleteSalesOrder(p: Params, ctx: ActionCtx): Promise<RunResult> {
  const target = await findSalesOrder(str(p.identifier), ctx.companyId);
  if (!target) return { ok: false, message: `Could not find sales order matching “${p.identifier}”.` };

  const { error } = await supabase.from('cnc_sales_orders').delete().eq('id', target.id);
  if (error) return { ok: false, message: `Could not delete sales order: ${error.message}` };

  try {
    if (target.quotation_id) {
      await supabase.from('cnc_quotations').update({ status: 'Sent' }).eq('id', target.quotation_id);
    } else if (target.quote_no) {
      await supabase.from('cnc_quotations').update({ status: 'Sent' }).eq('quote_no', target.quote_no);
    }
    if (target.lead_no) {
      await supabase.from('cnc_quotations').update({ status: 'Sent' }).eq('lead_no', target.lead_no).eq('status', 'Converted');
      await supabase.from('cnc_enquiries').update({ status: 'New', pipeline_stage: 'Enquiry' }).eq('lead_no', target.lead_no).eq('status', 'Converted');
    }
  } catch (e) {
    console.error('Reverting quotation after sales order delete failed:', e);
  }

  return {
    ok: true,
    message: `Sales Order ${target.order_no} for ${target.customer} deleted successfully.`,
    where: { path: '/sales/pipeline', label: 'Sales Pipeline' },
  };
}

async function moveStageAction(p: Params, ctx: ActionCtx): Promise<RunResult> {
  const idStr = str(p.identifier);
  const targetStage = str(p.target_stage);
  if (!idStr) return { ok: false, message: 'Please specify which record to move.' };

  const stageNorm = targetStage.toLowerCase().includes('quot') ? 'Quotation'
    : targetStage.toLowerCase().includes('order') || targetStage.toLowerCase().includes('sales') ? 'Sales Order'
    : targetStage.toLowerCase().includes('inward') ? 'Inward'
    : targetStage.toLowerCase().includes('finish') ? 'Finished Goods'
    : targetStage.toLowerCase().includes('dc') || targetStage.toLowerCase().includes('deliver') ? 'DC'
    : targetStage.toLowerCase().includes('invoice') ? 'Invoice'
    : targetStage;

  const enq = await findEnquiry(idStr, ctx.companyId);
  const so = !enq ? await findSalesOrder(idStr, ctx.companyId) : null;
  const refNo = enq ? (enq.lead_no || enq.enquiry_no || idStr) : (so ? so.order_no : idStr);
  const customer = enq ? enq.customer : (so ? so.customer : '');

  // 1. If an enquiry is moving to Quotation
  if (enq && stageNorm === 'Quotation') {
    // Update enquiry stage in database
    await supabase.from('cnc_enquiries').update({
      pipeline_stage: 'Quotation',
      status: 'Quoted',
    }).eq('id', enq.id);

    // Create quotation row in cnc_quotations with valid database schema
    try {
      const { data: existingQ } = await supabase
        .from('cnc_quotations')
        .select('id, quote_no')
        .or(`lead_id.eq.${enq.id},enquiry_no.eq.${enq.lead_no || enq.enquiry_no}`)
        .limit(1);

      if (!existingQ || existingQ.length === 0) {
        const qNo = `QT-2026-${Math.floor(1000 + Math.random() * 9000)}`;
        let parsedParts: any[] = [];
        try {
          if (enq.enquiring_for) {
            const parsed = typeof enq.enquiring_for === 'string' ? JSON.parse(enq.enquiring_for) : enq.enquiring_for;
            if (Array.isArray(parsed)) parsedParts = parsed;
          }
        } catch { /* ignore */ }

        const lineItems = parsedParts.length > 0
          ? parsedParts.map((partItem: any) => ({
              id: crypto.randomUUID(),
              partName: partItem.partName || partItem.productName || enq.part_name || '',
              partNumber: partItem.partNumber || '',
              quantity: String(partItem.quantity || enq.quantity || 1),
              unitPrice: String(p.price || 0),
              discount: '0',
              unitDiscount: '0',
              gst: '18',
            }))
          : [{
              id: crypto.randomUUID(),
              partName: enq.part_name || '',
              partNumber: '',
              quantity: String(enq.quantity || 1),
              unitPrice: String(p.price || 0),
              discount: '0',
              unitDiscount: '0',
              gst: '18',
            }];

        const qPayload: any = {
          id: crypto.randomUUID(),
          quote_no: qNo,
          lead_id: enq.id,
          enquiry_no: enq.lead_no || enq.enquiry_no || '',
          customer: enq.customer,
          contact_person: enq.contact_person || '',
          phone: enq.phone || '',
          email: enq.email || '',
          part_name: enq.part_name || '',
          part_number: '',
          description: JSON.stringify(lineItems),
          unit_price: Number(p.price) || 0,
          quantity: Number(enq.quantity) || 1,
          total_value: (Number(p.price) || 0) * (Number(enq.quantity) || 1),
          date: today(),
          valid_till: today(),
          status: 'Draft',
          salesperson: '',
          discount_percent: 0,
          gst_percent: 18,
          payment_terms: '',
          delivery_terms: '',
          remarks: '',
        };
        if (ctx.companyId) qPayload.company_id = ctx.companyId;
        const { error: insErr } = await supabase.from('cnc_quotations').insert([qPayload]);
        if (insErr) console.warn('Could not insert quotation:', insErr);
      }
    } catch (qErr) {
      console.warn('Could not create quotation row:', qErr);
    }

    // Dispatch event so SalesPipelinePage opens the stage form modal on screen immediately!
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('argus:move-card-stage', {
        detail: {
          identifier: refNo,
          targetStage: 'Quotation',
          price: p.price,
        }
      }));
    }

    return {
      ok: true,
      message: `Enquiry #${refNo} (${customer}) moved to Quotation. Opening the Create Quotation form to enter unit price and terms.`,
      where: { path: '/sales/pipeline', label: 'Sales Pipeline' },
    };
  }

  // 2. If it is a Sales Order
  if (so) {
    const { error } = await supabase.from('cnc_sales_orders').update({
      status: targetStage,
    }).eq('id', so.id);
    if (error) return { ok: false, message: `Could not update order status: ${error.message}` };
    return {
      ok: true,
      message: `Sales Order ${so.order_no} status changed to ${targetStage}.`,
      where: { path: '/sales/pipeline', label: 'Sales Pipeline' },
    };
  }

  // Generic stage dispatch
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('argus:move-card-stage', {
      detail: {
        identifier: refNo,
        targetStage: stageNorm,
        price: p.price,
      }
    }));
  }

  if (stageNorm === 'Inward') {
    return {
      ok: true,
      message: `Opening Inward Entry form for #${refNo} (${customer}). Please record received items to complete the move.`,
      where: { path: '/sales/pipeline', label: 'Sales Pipeline' },
    };
  }

  if (stageNorm === 'DC') {
    return {
      ok: true,
      message: `Opening Delivery Challan form for #${refNo} (${customer}). Please confirm items and delivery details.`,
      where: { path: '/sales/pipeline', label: 'Sales Pipeline' },
    };
  }

  return {
    ok: true,
    message: `Opening ${stageNorm} transition form for #${refNo} (${customer}).`,
    where: { path: '/sales/pipeline', label: 'Sales Pipeline' },
  };
}

export async function saveStageRecord(
  stageId: string,
  fields: Record<string, any>,
  ctx: ActionCtx
): Promise<RunResult> {
  const normStage = stageId.toLowerCase().replace(/[\s_-]+/g, '');

  if (normStage === 'enquiry') {
    return await addEnquiry({
      company: fields.customer || fields.company || 'Unknown Customer',
      products: [{
        name: fields.part_name || fields.part || 'Component',
        qty: Number(fields.quantity) || 1,
        price: Number(fields.price || fields.estimated_value) || 0
      }],
      remarks: fields.remarks || ''
    }, ctx);
  }

  if (normStage === 'salesorder') {
    return await addSalesOrder({
      company: fields.customer || fields.company || 'Unknown Customer',
      po_no: fields.po_no || '',
      products: [{
        name: fields.part_name || fields.part || 'Component',
        qty: Number(fields.quantity) || 1,
        price: Number(fields.price || fields.unit_price) || 0
      }],
      delivery_date: fields.delivery_date || null
    }, ctx);
  }

  if (normStage === 'quotation') {
    const cust = fields.customer || fields.company || 'Customer';
    const quoteNo = `QT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const qty = Number(fields.quantity) || 1;
    const rate = Number(fields.price || fields.unit_price || fields.rate) || 0;
    const part = fields.part_name || fields.part || 'Job Work Machining';
    const totalVal = qty * rate;

    const payload: any = {
      id: crypto.randomUUID(),
      quote_no: quoteNo,
      customer: cust,
      date: new Date().toISOString().slice(0, 10),
      valid_till: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      description: [{
        item: part,
        description: part,
        qty: String(qty),
        unitPrice: String(rate),
        total: String(totalVal)
      }],
      total_value: totalVal,
      status: 'Sent',
      created_at: new Date().toISOString()
    };
    if (ctx.companyId) payload.company_id = ctx.companyId;

    const { error } = await supabase.from('cnc_quotations').insert([payload]);
    if (error) return { ok: false, message: `Could not save quotation: ${error.message}` };
    return {
      ok: true,
      message: `Quotation ${quoteNo} created for ${cust} (${part}, Qty: ${qty}, Value: ₹${totalVal.toLocaleString('en-IN')}).`,
      where: { path: '/sales/pipeline', label: 'Sales Pipeline' }
    };
  }

  if (normStage === 'inward') {
    const party = fields.party_name || fields.customer || fields.supplier || 'Party';
    const part = fields.part_name || fields.material_name || fields.part || 'Raw Material';
    const qty = Number(fields.quantity) || 1;
    const inwNo = fields.inward_no || `INW-${Math.floor(1000 + Math.random() * 9000)}`;
    const payload: any = {
      id: crypto.randomUUID(),
      inward_no: inwNo,
      party_name: party,
      part_name: part,
      product_name: part,
      quantity: qty,
      price: Number(fields.price) || 0,
      inward_date: new Date().toISOString().slice(0, 10),
      status: 'Pending',
      created_at: new Date().toISOString()
    };
    if (ctx.companyId) payload.company_id = ctx.companyId;

    const { error } = await supabase.from('cnc_inwards').insert([payload]);
    if (error) return { ok: false, message: `Could not save inward: ${error.message}` };
    return {
      ok: true,
      message: `Inward record ${inwNo} created for ${party} (${part}, Qty: ${qty}).`,
      where: { path: '/sales/pipeline', label: 'Inward Stage' }
    };
  }

  if (normStage === 'dc' || normStage === 'deliverychallan') {
    const cust = fields.customer || fields.party || 'Customer';
    const part = fields.part_name || fields.part || 'Machined Parts';
    const qty = Number(fields.quantity) || 1;
    const dcNo = fields.dc_no || `DC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const payload: any = {
      id: crypto.randomUUID(),
      delivery_no: dcNo,
      customer_name: cust,
      part_name: part,
      quantity: qty,
      status: 'Dispatched',
      created_at: new Date().toISOString()
    };
    if (ctx.companyId) payload.company_id = ctx.companyId;

    const { error } = await supabase.from('cnc_deliveries').insert([payload]);
    if (error) return { ok: false, message: `Could not save DC: ${error.message}` };
    return {
      ok: true,
      message: `Delivery Challan ${dcNo} created for ${cust} (${part}, Qty: ${qty}).`,
      where: { path: '/sales/pipeline', label: 'Delivery Stage' }
    };
  }

  if (normStage === 'invoice') {
    const cust = fields.customer || 'Customer';
    const part = fields.part_name || 'Component';
    const qty = Number(fields.quantity) || 1;
    const amt = Number(fields.amount || fields.price) || (qty * 100);
    const invNo = fields.invoice_no || `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const payload: any = {
      id: crypto.randomUUID(),
      invoice_no: invNo,
      customer_name: cust,
      part_name: part,
      quantity: qty,
      amount: amt,
      status: 'Unpaid',
      invoice_date: new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString()
    };
    if (ctx.companyId) payload.company_id = ctx.companyId;

    const { error } = await supabase.from('cnc_invoices').insert([payload]);
    if (error) return { ok: false, message: `Could not save invoice: ${error.message}` };
    return {
      ok: true,
      message: `Invoice ${invNo} created for ${cust} (Amount: ₹${amt.toLocaleString('en-IN')}).`,
      where: { path: '/sales/pipeline', label: 'Invoices' }
    };
  }

  if (normStage === 'rejected') {
    const part = fields.part_name || 'Component';
    const qty = Number(fields.quantity) || 1;
    const reason = fields.reason || 'Visual / Dimension Defect';
    return {
      ok: true,
      message: `Rejected defect logged for ${part} (Qty: ${qty}, Reason: ${reason}).`,
      where: { path: '/sales/pipeline', label: 'Rejected Stage' }
    };
  }

  if (normStage === 'finishedgoods') {
    const part = fields.part_name || 'Component';
    const qty = Number(fields.quantity) || 1;
    return {
      ok: true,
      message: `Finished Goods logged for ${part} (Qty: ${qty}). Ready for delivery.`,
      where: { path: '/sales/pipeline', label: 'Finished Goods' }
    };
  }

  return { ok: false, message: `Unsupported stage ${stageId}.` };
}

/** "2026-11-14", "14/11/2026", "14 Nov 2026", "November 14th, 2026" -> yyyy-mm-dd ('' when it cannot be read). */
export function isoDateLoose(v: unknown): string {
  const t = String(v ?? '').trim();
  if (!t) return '';
  const ok = (y: number, mo: number, d: number) => {
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
      ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';
  };
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(t);
  if (m) return ok(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  const MON = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
  const monthNo = (x: string) => MON.split('|').indexOf(x.slice(0, 3).toLowerCase()) + 1;
  m = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MON})[a-z]*\\.?,?\\s+(\\d{4})`, 'i').exec(t);
  if (m) return ok(+m[3], monthNo(m[2]), +m[1]);
  m = new RegExp(`(${MON})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, 'i').exec(t);
  if (m) return ok(+m[3], monthNo(m[1]), +m[2]);
  return '';
}

/** The line items of a quotation / sales order row (stored as a JSON string or an array in `items` / `description`). */
function lineItemsOf(raw: any): any[] {
  for (const d of [raw?.items, raw?.description]) {
    if (Array.isArray(d)) return d.filter((x) => x && typeof x === 'object');
    if (typeof d === 'string' && d.trim().startsWith('[')) {
      try { const j = JSON.parse(d); if (Array.isArray(j)) return j.filter((x) => x && typeof x === 'object'); } catch { /* not JSON */ }
    }
  }
  return [];
}

/** "30 Days", "2 weeks", "1 month", "45" -> number of days (default 30). */
function validityDays(v: unknown): number {
  const m = /(\d+(?:\.\d+)?)\s*(day|week|month)?/i.exec(String(v ?? ''));
  if (!m) return 30;
  const n = Number(m[1]);
  const unit = (m[2] || 'day').toLowerCase();
  const days = unit === 'month' ? n * 30 : unit === 'week' ? n * 7 : n;
  return days > 0 && days <= 3650 ? Math.round(days) : 30;
}

/** The sales order a card belongs to, for the production batch rows that record finished and rejected quantity. */
function salesOrderOf(card: PipelineItem): { id: string | null; no: string | null } {
  if (card.type === 'sales_order') return { id: card.id, no: card.refNo };
  const ref = String(card.raw?.sales_order_ref ?? card.raw?.sales_order_no ?? '').trim();
  return { id: null, no: ref || null };
}

/** Inserts a row the way the pipeline's own forms do: a column an older database does not have is dropped and the save is retried. */
async function insertTolerant(table: string, row: Record<string, any>): Promise<{ error: any; skipped: string[] }> {
  const payload: Record<string, any> = { ...row };
  const skipped: string[] = [];
  for (let attempt = 0; attempt < 30; attempt++) {
    const res = await supabase.from(table).insert([payload]);
    if (!res.error) return { error: null, skipped };
    const m = /Could not find the '([A-Za-z0-9_]+)' column/.exec(res.error.message || '');
    if (m && m[1] in payload) { delete payload[m[1]]; skipped.push(m[1]); continue; }
    return { error: res.error, skipped };
  }
  return { error: { message: 'Too many missing columns.' }, skipped };
}

/** Inward categories that go on to production: they get a Draft work order (released later from Production), like the Inward form does. */
const PRODUCTION_INWARD = ['CUSTOMERDC', 'DC', 'NODC', 'NEWPART', 'NEWPROJECT'];
const isProductionInward = (cat: unknown) => PRODUCTION_INWARD.includes(String(cat ?? '').toUpperCase().replace(/[\s_-]+/g, ''));

async function createDraftWorkOrderForInward(inward: Record<string, any>, qty: number, customer: string): Promise<boolean> {
  if (!isProductionInward(inward.category) || !(qty > 0)) return false;
  const { data: existing } = await supabase.from('cnc_work_orders').select('wo_no,sales_order,part_name,quantity');
  const rows = (existing ?? []) as any[];
  const key = (so: string, part: string, q: number) => `${so}||${part}||${q}`;
  if (rows.some((w) => key(w.sales_order ?? '', w.part_name ?? '', Number(w.quantity) || 0) === key(inward.sales_order_ref || '', inward.part_name || '', qty))) return false;
  const used = new Set(rows.map((w) => w.wo_no));
  const d = new Date();
  const prefix = `WO-${d.getFullYear().toString().slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}-`;
  let woNo = '';
  for (let i = 0; i < 50 && (!woNo || used.has(woNo)); i++) woNo = `${prefix}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
  if (!woNo || used.has(woNo)) woNo = `${prefix}${Date.now().toString().slice(-3)}`;
  const { error } = await supabase.from('cnc_work_orders').insert([{
    id: crypto.randomUUID(), wo_no: woNo, sales_order: inward.sales_order_ref || '', customer: customer || inward.party_name || '',
    part_name: inward.part_name || '-', part_no: inward.part_number || 'N/A', quantity: qty, completed: 0, rejected: 0,
    start_date: inward.inward_date || null, due_date: inward.inward_date || null, status: 'Draft', priority: 'Normal',
  }]);
  if (error) console.error('Failed to auto-create draft work order:', error);
  return !error;
}

const pct = (v: unknown, dflt: number): number => (v === undefined || v === null || v === '' ? dflt : Math.min(100, Math.max(0, Number(v) || 0)));
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Moves an existing pipeline card from its current stage to the next stage
 * with extra information provided by the user via voice / form.
 */
export async function moveStageRecord(
  sourceCard: PipelineItem,
  targetStageId: string,
  extraFields: Record<string, any>,
  ctx: ActionCtx
): Promise<RunResult> {
  const norm = targetStageId.toLowerCase().replace(/[\s_-]+/g, '');

  const raw: any = sourceCard.raw ?? {};
  const orderDate = new Date().toISOString().slice(0, 10);

  // 1. Move to Quotation (source is Enquiry)
  if (norm === 'quotation') {
    const quoteNo = `QT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const unitPrice = Number(extraFields.price || extraFields.rate || 0);
    const qty = Number(extraFields.quantity) || Number(sourceCard.qty) || 1;
    const discountPct = extraFields.discount !== undefined && extraFields.discount !== '' ? Math.min(100, Math.max(0, Number(extraFields.discount) || 0)) : 0;
    const gstPct = extraFields.gst !== undefined && extraFields.gst !== '' ? Math.min(100, Math.max(0, Number(extraFields.gst) || 0)) : 18;
    // the same maths as the quotation's own line: quantity x rate, less the discount, plus GST
    const totalVal = unitPrice ? Math.round(qty * unitPrice * (1 - discountPct / 100) * (1 + gstPct / 100) * 100) / 100 : Number(sourceCard.value || 0);
    const lineItems = [{
      id: crypto.randomUUID(), partName: sourceCard.part || '', partNumber: '', quantity: String(qty),
      unitPrice: String(unitPrice), discount: String(discountPct), unitDiscount: '0', gst: String(gstPct),
    }];

    const payload: any = {
      id: crypto.randomUUID(),
      quote_no: quoteNo,
      lead_id: sourceCard.id,
      enquiry_no: sourceCard.refNo,
      customer: sourceCard.customer,
      contact_person: raw.contact_person || '',
      phone: raw.phone || '',
      email: raw.email || '',
      part_name: sourceCard.part,
      part_number: '',
      description: JSON.stringify(lineItems),
      quantity: qty,
      unit_price: unitPrice,
      total_value: totalVal,
      discount_percent: discountPct,
      gst_percent: gstPct,
      date: orderDate,
      valid_till: new Date(Date.now() + validityDays(extraFields.validity) * 86400000).toISOString().slice(0, 10),
      payment_terms: extraFields.payment_terms || '30 days net',
      remarks: extraFields.remarks || '',
      status: 'Sent',
      created_at: new Date().toISOString(),
    };
    if (ctx.companyId) payload.company_id = ctx.companyId;

    const { error } = await supabase.from('cnc_quotations').insert([payload]);
    if (error) return { ok: false, message: `Could not save Quotation: ${error.message}` };

    if (sourceCard.type === 'enquiry') {
      await supabase.from('cnc_enquiries').update({
        pipeline_stage: 'Quotation',
        status: 'Quoted',
      }).eq('id', sourceCard.id);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('argus:move-card-stage', {
        detail: { identifier: sourceCard.refNo, targetStage: 'Quotation', price: unitPrice }
      }));
      window.dispatchEvent(new CustomEvent('argus:data-changed'));
    }

    return {
      ok: true,
      message: `Enquiry #${sourceCard.refNo} (${sourceCard.customer}) moved to Quotation ${quoteNo} (Rate: ₹${unitPrice.toLocaleString('en-IN')}).`,
      where: { path: '/sales/pipeline', label: 'Sales Pipeline' },
    };
  }

  // 2. Move to Sales Order (source is Quotation or Enquiry). Same row shape as the pipeline's own Quotation -> Sales Order.
  if (norm === 'salesorder') {
    const deliveryRaw = String(extraFields.delivery_date ?? '').trim();
    const delivery = isoDateLoose(deliveryRaw);
    if (deliveryRaw && !delivery) return { ok: false, message: `I could not read the delivery date "${deliveryRaw}". Say it like 14 November 2026.` };
    const orderDayEarly = isoDateLoose(String(extraFields.order_date ?? '')) || orderDate;
    if (delivery && delivery <= orderDayEarly) return { ok: false, message: 'The delivery date must be after the order date.' };

    const { attachDateTimeToProduct } = await import('@/pages/sales/SalesPipelinePage');
    const now = new Date();
    const qty0 = Number(sourceCard.qty) || 1;
    const spokenPrice = Number(extraFields.price || 0);
    const spokenQty = Number(extraFields.quantity || 0);
    const spokenGst = extraFields.gst !== undefined && extraFields.gst !== '' ? Math.min(100, Math.max(0, Number(extraFields.gst) || 0)) : null;
    const fromRows = lineItemsOf(raw);
    const base = fromRows.length ? fromRows : [{
      partName: sourceCard.part, partNumber: '', quantity: qty0,
      unitPrice: Number(raw.unit_price) || (sourceCard.value && sourceCard.qty ? sourceCard.value / sourceCard.qty : 0),
      discount: '0', unitDiscount: '0', gst: '18',
    }];
    // a single product line takes the quantity, rate and GST said here; several lines keep the quotation's own figures
    const single = base.length === 1;
    const finalItems = base.map((i: any) => ({
      id: crypto.randomUUID(),
      filePaths: [] as string[],
      partName: attachDateTimeToProduct(String(i.partName || i.productName || i.item || sourceCard.part || ''), null, now),
      partNumber: String(i.partNumber || ''),
      description: '',
      quantity: String(single && spokenQty > 0 ? spokenQty : (Number(i.quantity ?? i.qty) || 0)),
      rejectedQty: 0,
      status: 'Confirmed',
      unitPrice: String(single && spokenPrice > 0 ? spokenPrice : (Number(i.unitPrice) || 0)),
      discount: String(i.discount ?? '0'),
      unitDiscount: String(i.unitDiscount ?? '0'),
      gst: String(single && spokenGst !== null ? spokenGst : (i.gst ?? 18)),
    }));
    const orderDay = isoDateLoose(String(extraFields.order_date ?? '')) || orderDate;

    const { data: orders } = await supabase.from('cnc_sales_orders').select('order_no');
    const taken = new Set((orders ?? []).map((o: any) => String(o.order_no)));
    let orderNo = '';
    for (let i = 0; i < 30 && (!orderNo || taken.has(orderNo)); i++) {
      orderNo = `SO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    }
    const names = finalItems.map((i) => i.partName);
    const totalQty = finalItems.reduce((t, i) => t + (Number(i.quantity) || 0), 0);
    const computed = finalItems.reduce((t, i) => t + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0) * (1 + (Number(i.gst) || 0) / 100), 0);
    const totalVal = computed > 0 ? computed : Number(sourceCard.value || 0);

    const payload: any = {
      id: crypto.randomUUID(),
      order_no: orderNo,
      quotation_id: sourceCard.type === 'quotation' ? sourceCard.id : null,
      quote_no: raw.quote_no || '',
      lead_no: raw.enquiry_no || raw.lead_no || '',
      customer: sourceCard.customer,
      customer_id: raw.customer_id || null,
      contact_person: raw.contact_person || '',
      phone: raw.phone || '',
      email: raw.email || '',
      billing_address: '',
      delivery_address: '',
      shipping_contact: '',
      shipping_phone: '',
      order_date: orderDay,
      customer_po_no: String(extraFields.po_no || ''),
      customer_po_date: null,
      items: finalItems,
      part_name: finalItems.length > 1 ? `${names.join(', ')} (${finalItems.length} Products)` : (names[0] ?? ''),
      part_number: finalItems[0]?.partNumber ?? '',
      part_no: finalItems[0]?.partNumber ?? '',
      quantity: totalQty,
      delivered: 0,
      value: totalVal,
      total_value: totalVal,
      delivery_date: delivery || orderDay,
      status: 'Confirmed',
      payment_terms: raw.payment_terms || 'Net 30',
      special_instructions: '',
      internal_remarks: String(extraFields.remarks || ''),
    };
    if (ctx.companyId) payload.company_id = ctx.companyId;

    const { error } = await supabase.from('cnc_sales_orders').insert([payload]);
    if (error) return { ok: false, message: `Could not save Sales Order: ${error.message}` };

    if (sourceCard.type === 'quotation') {
      await supabase.from('cnc_quotations').update({ status: 'Converted' }).eq('id', sourceCard.id);
    } else if (sourceCard.type === 'enquiry') {
      await supabase.from('cnc_enquiries').update({ pipeline_stage: 'Sales Order', status: 'Converted' }).eq('id', sourceCard.id);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('argus:move-card-stage', {
        detail: { identifier: sourceCard.refNo, targetStage: 'Sales Order', po_no: payload.customer_po_no }
      }));
      window.dispatchEvent(new CustomEvent('argus:data-changed'));
    }

    return {
      ok: true,
      message: `Record #${sourceCard.refNo} (${sourceCard.customer}) moved to Sales Order ${orderNo}${payload.customer_po_no ? ` with PO ${payload.customer_po_no}` : ''}${delivery ? `, delivery ${delivery}` : ''}.`,
      where: { path: '/sales/pipeline', label: 'Sales Pipeline' },
    };
  }

  // 3. Move to Inward (source is Sales Order): the same row the Inward form saves, and the same checks
  if (norm === 'inward') {
    const category = String(extraFields.category || '').trim().toUpperCase() || 'CUSTOMER DC';
    const qty = Number(extraFields.quantity) || Number(extraFields.received_qty) || Number(sourceCard.qty) || 0;
    const price = Number(extraFields.price) || 0;
    if (!(qty > 0)) return { ok: false, message: 'Enter a quantity greater than zero.' };
    if (!(price > 0)) return { ok: false, message: 'Enter the purchase price. A price is never assumed to be zero.' };
    const discount = pct(extraFields.discount, 0);
    const gst = pct(extraFields.gst, 18);
    const inwardDate = isoDateLoose(String(extraFields.inward_date ?? '')) || orderDate;
    const total = round2(qty * price * (1 - discount / 100) * (1 + gst / 100));
    const inwNo = String(extraFields.inward_no || '') || `INW-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const soNo = sourceCard.type === 'sales_order' ? sourceCard.refNo : String(raw.sales_order_ref || '');
    const row: Record<string, any> = {
      id: crypto.randomUUID(),
      inward_no: inwNo,
      category,
      product_name: sourceCard.part || '',
      project_name: raw.lead_no || '',
      sales_order_ref: soNo,
      reference_no: String(extraFields.reference_no || ''),
      inward_date: inwardDate,
      party_name: sourceCard.customer,
      remarks: String(extraFields.remarks || ''),
      part_name: sourceCard.part || '-',
      part_number: String(raw.part_number || raw.part_no || ''),
      quantity: qty,
      price,
      discount_percent: discount,
      gst_percent: gst,
      total_amount: total,
      status: 'Pending',
      created_at: new Date().toISOString(),
    };
    if (ctx.companyId) row.company_id = ctx.companyId;

    const { error } = await insertTolerant('cnc_inwards', row);
    if (error) return { ok: false, message: `Could not save Inward: ${error.message}` };

    // CUSTOMER DC / NO DC / NEW PART flow to Production as a Draft work order (released manually from the Production page).
    let draft = false;
    try { draft = await createDraftWorkOrderForInward(row, qty, sourceCard.customer); } catch (e) { console.error('Draft work order auto-create failed:', e); }

    if (sourceCard.type === 'sales_order') {
      await supabase.from('cnc_sales_orders').update({ status: 'Inwarded' }).eq('id', sourceCard.id);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('argus:move-card-stage', { detail: { identifier: sourceCard.refNo, targetStage: 'Inward', inward_no: inwNo } }));
      window.dispatchEvent(new CustomEvent('argus:data-changed'));
    }
    return {
      ok: true,
      message: `Sales Order #${sourceCard.refNo} (${sourceCard.customer}) moved to Inward ${inwNo}: ${category}, Qty ${qty}, ₹${price.toLocaleString('en-IN')} each, total ₹${total.toLocaleString('en-IN')}${draft ? '. A draft work order was created in Production.' : '.'}`,
      where: { path: '/sales/pipeline', label: 'Sales Pipeline' },
    };
  }

  // 4. Move to Finished Goods: recorded as a good-quantity production batch (the same rows the pipeline's own forms write)
  if (norm === 'finishedgoods') {
    const fgQty = Number(extraFields.quantity || extraFields.fg_qty) || sourceCard.qty || 1;
    const batchNo = String(extraFields.batch_no || `FG-${Date.now().toString().slice(-6)}`);
    const location = String(extraFields.location || '');
    const so = salesOrderOf(sourceCard);

    const res = await recordProductionBatch({
      salesOrderId: so.id, salesOrderNo: so.no, productName: sourceCard.part || null,
      batchNo, grossQty: fgQty, goodQty: fgQty, rejectedQty: 0, reworkQty: 0,
      notes: [location && `Location: ${location}`, extraFields.remarks && `QC: ${extraFields.remarks}`].filter(Boolean).join(' | ') || null,
      idempotencyKey: crypto.randomUUID(),
    });
    if (res.pendingMigration) return { ok: false, message: 'Finished goods storage is not set up in the database yet (production batches migration).' };
    if (!res.saved) return { ok: false, message: 'Could not save the finished goods. Nothing was saved.' };

    if (sourceCard.type === 'sales_order') {
      await supabase.from('cnc_sales_orders').update({ status: 'Finished Goods' }).eq('id', sourceCard.id);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('argus:move-card-stage', { detail: { identifier: sourceCard.refNo, targetStage: 'Finished Goods' } }));
      window.dispatchEvent(new CustomEvent('argus:data-changed'));
    }
    return {
      ok: true,
      message: `#${sourceCard.refNo} (${sourceCard.part}) saved as Finished Goods (Qty: ${fgQty}, Batch: ${batchNo}${location ? `, Bin: ${location}` : ''}).`,
      where: { path: '/sales/pipeline', label: 'Finished Goods' },
    };
  }

  // 5. Move to Rejected: recorded as a rejected-quantity production batch (never enters stock, DCs or invoices)
  if (norm === 'rejected') {
    const rejQty = Number(extraFields.quantity || extraFields.rejected_qty);
    if (!(rejQty > 0)) return { ok: false, message: 'How many were rejected? Tell me the rejected quantity.' };
    const reason = String(extraFields.reason || '').trim();
    if (!reason) return { ok: false, message: 'What is the defect reason? Tell me the reason for the rejection.' };
    const so = salesOrderOf(sourceCard);

    const res = await recordProductionBatch({
      salesOrderId: so.id, salesOrderNo: so.no, productName: sourceCard.part || null,
      batchNo: `REJ-${Date.now().toString().slice(-6)}`, grossQty: rejQty, goodQty: 0, rejectedQty: rejQty, reworkQty: 0,
      rejectionType: String(extraFields.disposition || '').trim() || null, rejectionReason: reason,
      idempotencyKey: crypto.randomUUID(),
    });
    if (res.pendingMigration) return { ok: false, message: 'Rejection storage is not set up in the database yet (production batches migration).' };
    if (!res.saved) return { ok: false, message: 'Could not save the rejection. Nothing was saved.' };

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('argus:move-card-stage', { detail: { identifier: sourceCard.refNo, targetStage: 'Rejected' } }));
      window.dispatchEvent(new CustomEvent('argus:data-changed'));
    }
    return {
      ok: true,
      message: `#${sourceCard.refNo} rejection saved (Part: ${sourceCard.part}, Qty: ${rejQty}, Reason: ${reason}).`,
      where: { path: '/sales/pipeline', label: 'Rejected Stage' },
    };
  }

  // 6. Move to Delivery Challan (DC): the same row the DC form saves (status Pending, the sales order's delivered quantity updated)
  if (norm === 'dc' || norm === 'deliverychallan') {
    const dcNo = String(extraFields.dc_no || '') || `DC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const qty = Number(extraFields.quantity || extraFields.dispatch_qty) || Number(sourceCard.qty) || 0;
    if (!(qty > 0)) return { ok: false, message: 'Enter the quantity being dispatched.' };

    // the sales order this delivery belongs to (a Finished Goods / Inward card knows it by its number)
    const soRef = sourceCard.type === 'sales_order' ? { id: sourceCard.id, no: sourceCard.refNo } : salesOrderOf(sourceCard);
    const { so, summary } = soRef.id || soRef.no ? await fetchOrderQty(soRef.id, soRef.no ?? '') : { so: null, summary: null };
    // an order that has production rows can only deliver what is finished and not yet delivered
    if (summary?.hasProduction && qty > summary.fgAvailable) {
      return { ok: false, message: `Only ${summary.fgAvailable} finished piece${summary.fgAvailable === 1 ? ' is' : 's are'} available to deliver for this order. Enter ${summary.fgAvailable} or less.` };
    }

    // customer_id cannot be empty: from the sales order, else the company list
    let customerId: string | null = so?.customer_id || raw.customer_id || null;
    if (!customerId && sourceCard.customer) {
      const { data: cust } = await supabase.from('cnc_customers').select('id,name').ilike('name', sourceCard.customer).limit(1);
      customerId = (cust as any[] | null)?.[0]?.id ?? null;
    }
    if (!customerId) return { ok: false, message: 'Could not find this company in the company list. Add it as a company first, then make the delivery challan.' };

    const lines = lineItemsOf(so ?? raw);
    const first: any = lines[0] ?? {};
    const unitPrice = Number(first.unitPrice ?? first.rate ?? first.price) || Number((so ?? raw).unit_price) || 0;
    const row: Record<string, any> = {
      id: crypto.randomUUID(),
      delivery_no: dcNo,
      customer_name: sourceCard.customer,
      customer_id: customerId,
      sales_order_id: so?.id ?? (sourceCard.type === 'sales_order' ? sourceCard.id : null),
      sales_order_no: so?.order_no ?? soRef.no ?? null,
      part_name: sourceCard.part,
      quantity: qty,
      dispatch_qty: qty,
      delivery_date: new Date().toISOString().slice(0, 10),
      vehicle_no: String(extraFields.vehicle_no || ''),
      status: 'Pending',
      created_at: new Date().toISOString(),
      billing_address: String((so ?? raw).billing_address || ''),
      customer_gstin: String((so ?? raw).customer_gstin || ''),
      eway_bill: String(extraFields.eway_bill || ''),
      po_no: String(extraFields.po_no || (so ?? raw).customer_po_no || (so ?? raw).po_no || ''),
      place_of_supply: String(extraFields.place_of_supply || ''),
      packaging_details: String(extraFields.packaging || ''),
      enquiry_no: String((so ?? raw).lead_no || ''),
      phone: String((so ?? raw).phone || ''),
      remarks: String(extraFields.remarks || ''),
      hsn: String(first.hsn || ''),
      unit: String(first.unit || 'Nos'),
      unit_price: unitPrice,
      total_amount: round2(qty * unitPrice),
    };
    if (ctx.companyId) row.company_id = ctx.companyId;

    const { error, skipped } = await insertTolerant('cnc_deliveries', row);
    if (error) return { ok: false, message: `Could not save DC: ${error.message}` };

    if (so) {
      const delivered = (Number(so.delivered) || 0) + qty;
      const status = delivered >= (Number(so.quantity) || 0) ? 'Delivered' : 'Partially Delivered';
      const { error: soErr } = await supabase.from('cnc_sales_orders').update({ delivered, status }).eq('id', so.id);
      if (soErr) console.error('Failed to update sales order delivery:', soErr);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('argus:move-card-stage', { detail: { identifier: sourceCard.refNo, targetStage: 'DC', dc_no: dcNo } }));
      window.dispatchEvent(new CustomEvent('argus:data-changed'));
    }
    const vehicle = String(extraFields.vehicle_no || '');
    return {
      ok: true,
      message: `#${sourceCard.refNo} (${sourceCard.customer}) moved to Delivery Challan ${dcNo} (Qty: ${qty}${vehicle ? `, Vehicle: ${vehicle}` : ''})${skipped.length ? `. Not stored (no database column yet): ${skipped.join(', ')}` : ''}.`,
      where: { path: '/sales/pipeline', label: 'Delivery Stage' },
    };
  }

  // 7. Move to Invoice: saved through the finance module (the database works out the tax and posts it to the books), like the Invoice form
  if (norm === 'invoice') {
    const docType = ['Sales Invoice', 'Proforma Invoice', 'Credit Note'].includes(String(extraFields.doc_type)) ? String(extraFields.doc_type) : 'Sales Invoice';
    const qty = Number(extraFields.quantity) || Number(sourceCard.qty) || 0;
    const rate = Number(extraFields.price) || 0;
    if (!(qty > 0)) return { ok: false, message: 'Enter the quantity to bill.' };
    if (!(rate > 0)) return { ok: false, message: 'Enter the rate per piece. An invoice is never priced silently at zero.' };
    const gst = pct(extraFields.gst, 18);
    const invDate = isoDateLoose(String(extraFields.invoice_date ?? '')) || orderDate;
    const dcId = sourceCard.type === 'dc' ? sourceCard.id : null;

    // one invoice per delivery challan (a proforma never blocks the real one)
    if (dcId && docType === 'Sales Invoice') {
      const { data: dup } = await supabase.from('cnc_invoices').select('invoice_no').eq('delivery_id', dcId).neq('invoice_type', 'Proforma Invoice').limit(1);
      if (dup && (dup as any[]).length) return { ok: false, message: `Invoice ${(dup as any[])[0].invoice_no ?? ''} already exists for this delivery challan.` };
    }
    const dueRaw = String(extraFields.due_date ?? '').trim();
    const due = dueRaw ? (isoDateLoose(dueRaw) || '') : '';
    if (dueRaw && !due) return { ok: false, message: `I could not read the due date "${dueRaw}". Say it like 30 November 2026.` };

    let res: { id: string; invoice_no: string };
    try {
      res = await financeApi.saveInvoice({
        invoice_no: null,
        invoice_type: docType,
        customer_name: sourceCard.customer,
        customer_id: raw.customer_id || null,
        part_name: sourceCard.part,
        quantity: qty,
        invoice_date: invDate,
        ...(due ? { due_date: due } : {}),
        dc_no: sourceCard.type === 'dc' ? sourceCard.refNo : null,
        delivery_id: dcId,
        sales_order_id: raw.sales_order_id || null,
        notes: 'Raised by the Co-worker',
      }, [{ description: sourceCard.part || 'Item', quantity: qty, unit: raw.unit || 'Nos', rate, gst_rate: gst }]);
    } catch (e) {
      return { ok: false, message: `Could not save the invoice: ${e instanceof Error ? e.message : String(e)}. Nothing was created.` };
    }
    if (dcId && docType === 'Sales Invoice') {
      const { error: dcErr } = await supabase.from('cnc_deliveries').update({ status: 'Billed' }).eq('id', dcId);
      if (dcErr) console.error('Failed to mark the delivery challan as billed:', dcErr);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('argus:move-card-stage', { detail: { identifier: sourceCard.refNo, targetStage: 'Invoice', invoice_no: res.invoice_no } }));
      window.dispatchEvent(new CustomEvent('argus:data-changed'));
    }
    const net = round2(qty * rate);
    return {
      ok: true,
      message: `#${sourceCard.refNo} (${sourceCard.customer}) ${docType === 'Sales Invoice' ? 'invoiced' : `saved as ${docType}`}: ${res.invoice_no}, ${qty} × ₹${rate.toLocaleString('en-IN')} = ₹${net.toLocaleString('en-IN')} plus ${gst}% GST.`,
      where: { path: '/finance/invoices', label: 'Invoices' },
    };
  }

  return { ok: false, message: `Unsupported transition to ${targetStageId}.` };
}

// ------------------------------------------------------------------------------------------------ find (read only)
const FIND: Record<string, { table: string; cols: string; who: string; line: (r: any) => string; label: string }> = {
  enquiry: { table: 'cnc_enquiries', cols: 'lead_no,enquiry_no,customer,part_name,status,received_date', who: 'customer', label: 'Enquiries', line: (r) => `${r.lead_no || r.enquiry_no} · ${r.customer} · ${r.part_name ?? ''} · ${r.status ?? ''}` },
  quotation: { table: 'cnc_quotations', cols: 'quote_no,customer,part_name,total_value,status', who: 'customer', label: 'Quotations', line: (r) => `${r.quote_no} · ${r.customer} · ${r.part_name ?? ''} · ₹${num(r.total_value).toLocaleString('en-IN')} · ${r.status ?? ''}` },
  sales_order: { table: 'cnc_sales_orders', cols: 'order_no,customer,part_name,total_value,status', who: 'customer', label: 'Sales orders', line: (r) => `${r.order_no} · ${r.customer} · ${r.part_name ?? ''} · ₹${num(r.total_value).toLocaleString('en-IN')} · ${r.status ?? ''}` },
  invoice: { table: 'cnc_invoices', cols: 'invoice_no,customer_name,amount,status', who: 'customer_name', label: 'Invoices', line: (r) => `${r.invoice_no} · ${r.customer_name} · ₹${num(r.amount).toLocaleString('en-IN')} · ${r.status ?? ''}` },
  company: { table: 'cnc_customers', cols: 'name,city,gst,phone', who: 'name', label: 'Companies', line: (r) => `${r.name}${r.city ? ' · ' + r.city : ''}${r.gst ? ' · ' + r.gst : ''}${r.phone ? ' · ' + r.phone : ''}` },
  inward: { table: 'cnc_inwards', cols: 'inward_no,party_name,part_name,status', who: 'party_name', label: 'Inwards', line: (r) => `${r.inward_no} · ${r.party_name} · ${r.part_name ?? ''} · ${r.status ?? ''}` },
  delivery: { table: 'cnc_deliveries', cols: 'delivery_no,customer_name,part_name,status', who: 'customer_name', label: 'Delivery challans', line: (r) => `${r.delivery_no} · ${r.customer_name} · ${r.part_name ?? ''} · ${r.status ?? ''}` },
};
export const FIND_MODULE: Record<string, string> = { enquiry: 'enquiries', quotation: 'quotations', sales_order: 'sales-orders', invoice: 'invoices', company: 'companies', inward: 'inward', delivery: 'delivery' };

export async function findRecords(kind: string, query: string, ctx: ActionCtx): Promise<FindResult> {
  const def = FIND[kind];
  if (!def) return { title: 'Nothing to look for', rows: [] };
  if (!ctx.canDo(FIND_MODULE[kind], 'view')) return { title: `You cannot view ${def.label.toLowerCase()}.`, rows: [] };
  let q = supabase.from(def.table).select(def.cols).order('created_at', { ascending: false }).limit(6);
  const s = ilikeSafe(query);
  if (s) q = q.ilike(def.who, `%${s}%`);
  const { data, error } = await q;
  if (error) return { title: `Could not search: ${error.message}`, rows: [] };
  const rows = ((data ?? []) as any[]).map(def.line);
  return { title: rows.length ? `${def.label}${s ? ` for “${s}”` : ''} (latest ${rows.length})` : `No ${def.label.toLowerCase()} found${s ? ` for “${s}”` : ''}.`, rows };
}

export async function explainRecordStage(identifier: string, companyId: string | null): Promise<string> {
  const enq = await findEnquiry(identifier, companyId);
  if (enq) {
    const leadNo = enq.lead_no || enq.enquiry_no || identifier;
    const customer = enq.customer || 'Customer';
    const stage = enq.pipeline_stage || 'Enquiry';
    const status = enq.status || 'New';

    // Auto-fix if part_name absorbed quantity phrase (e.g. "name is flicker quantities 2" with qty 0)
    const rawPart = enq.part_name || '';
    const embeddedQtyMatch = /(?:x|×|\*|\b(?:qty|quantit(?:y|ies)|குவாண்டிட்டி|அளவு|எண்ணிக்கை|count)\b)\s*(?:is|are|as|to|[:\-=])?\s*(\d+(?:\.\d+)?)/i.exec(rawPart);
    if (embeddedQtyMatch && (!enq.quantity || Number(enq.quantity) === 0)) {
      const fixedQty = Number(embeddedQtyMatch[1]);
      const fixedPart = cleanProductName(rawPart.slice(0, embeddedQtyMatch.index)) || 'Product';
      const toSave = [{ productName: fixedPart, partName: fixedPart, quantity: String(fixedQty), remarks: '', filePaths: [] }];
      await supabase.from('cnc_enquiries').update({
        part_name: fixedPart,
        quantity: fixedQty,
        enquiring_for: JSON.stringify(toSave),
      }).eq('id', enq.id);
      return `✓ Auto-corrected Enquiry #${leadNo} (${customer})! Product name updated to "${fixedPart}" and Quantity updated to ${fixedQty}.`;
    }

    if (stage === 'Quotation' || status === 'Quoted') {
      const { data: q } = await supabase
        .from('cnc_quotations')
        .select('quote_no')
        .or(`lead_id.eq.${enq.id},lead_no.eq.${leadNo},enquiry_no.eq.${leadNo}`)
        .limit(1);
      const qRef = q && q.length > 0 && q[0].quote_no ? ` (${q[0].quote_no})` : '';
      return `Enquiry #${leadNo} for ${customer} has been converted to the Quotation stage${qRef}. On the Kanban board, look under the Quotation column for #${leadNo}.`;
    }

    if (stage === 'Sales Order' || status === 'Ordered') {
      return `Record #${leadNo} for ${customer} has moved to the Sales Order stage.`;
    }

    return `Record #${leadNo} for ${customer} is currently in the ${stage} stage (Status: ${status}).`;
  }

  const so = await findSalesOrder(identifier, companyId);
  if (so) {
    return `Sales Order ${so.order_no} for ${so.customer} is in the Sales Order stage (Status: ${so.status}).`;
  }

  return `I could not locate record #${identifier} in the pipeline. Please check the reference number.`;
}
