// Copilot actions: what each command shows for confirmation (preview) and what it saves (run).
// Writes through the signed-in person's own session with the same fields the forms write, so the database's company and
// permission rules apply exactly as if the form had been used.

import { supabase } from '@/lib/supabase';
import { generateUniqueProjectNo } from '@/lib/projectNumber';
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

export async function fetchPipelineSummary(companyId: string | null): Promise<PipelineItem[]> {
  const items: PipelineItem[] = [];
  try {
    let eqQ = supabase
      .from('cnc_enquiries')
      .select('id, lead_no, enquiry_no, customer, part_name, quantity, estimated_value, pipeline_stage, status, created_at, received_date')
      .order('created_at', { ascending: false })
      .limit(20);
    if (companyId) eqQ = eqQ.eq('company_id', companyId);
    const { data: enqs } = await eqQ;
    if (enqs) {
      for (const e of enqs) {
        items.push({
          id: e.id,
          type: 'enquiry',
          refNo: e.lead_no || e.enquiry_no || 'ENQ',
          customer: e.customer || 'Unknown',
          part: e.part_name || '-',
          qty: Number(e.quantity) || 0,
          value: Number(e.estimated_value) || 0,
          stage: e.pipeline_stage || 'Enquiry',
          status: e.status || 'New',
          date: e.received_date || (e.created_at ? e.created_at.slice(0, 10) : ''),
          raw: e,
        });
      }
    }

    let soQ = supabase
      .from('cnc_sales_orders')
      .select('id, order_no, customer, part_name, quantity, total_value, status, order_date, created_at')
      .order('created_at', { ascending: false })
      .limit(15);
    if (companyId) soQ = soQ.eq('company_id', companyId);
    const { data: sos } = await soQ;
    if (sos) {
      for (const s of sos) {
        items.push({
          id: s.id,
          type: 'sales_order',
          refNo: s.order_no || 'SO',
          customer: s.customer || 'Unknown',
          part: s.part_name || '-',
          qty: Number(s.quantity) || 0,
          value: Number(s.total_value) || 0,
          stage: 'Sales Order',
          status: s.status || 'Confirmed',
          date: s.order_date || (s.created_at ? s.created_at.slice(0, 10) : ''),
          raw: s,
        });
      }
    }

    let quQ = supabase
      .from('cnc_quotations')
      .select('id, quote_no, customer, part_name, total_value, status, quotation_date, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    if (companyId) quQ = quQ.eq('company_id', companyId);
    const { data: qus } = await quQ;
    if (qus) {
      for (const q of qus) {
        items.push({
          id: q.id,
          type: 'quotation',
          refNo: q.quote_no || 'QT',
          customer: q.customer || 'Unknown',
          part: q.part_name || '-',
          qty: 0,
          value: Number(q.total_value) || 0,
          stage: 'Quotation',
          status: q.status || 'Draft',
          date: q.quotation_date || (q.created_at ? q.created_at.slice(0, 10) : ''),
          raw: q,
        });
      }
    }

    let dcQ = supabase
      .from('cnc_deliveries')
      .select('id, delivery_no, customer_name, part_name, quantity, status, delivery_date, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    if (companyId) dcQ = dcQ.eq('company_id', companyId);
    const { data: dcs } = await dcQ;
    if (dcs) {
      for (const d of dcs) {
        items.push({
          id: d.id,
          type: 'dc',
          refNo: d.delivery_no || 'DC',
          customer: d.customer_name || 'Unknown',
          part: d.part_name || '-',
          qty: Number(d.quantity) || 0,
          value: 0,
          stage: 'DC',
          status: d.status || 'Delivered',
          date: d.delivery_date || (d.created_at ? d.created_at.slice(0, 10) : ''),
          raw: d,
        });
      }
    }

    let inwQ = supabase
      .from('cnc_inwards')
      .select('id, inward_no, party_name, part_name, quantity, status, inward_date, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    if (companyId) inwQ = inwQ.eq('company_id', companyId);
    const { data: inws } = await inwQ;
    if (inws) {
      for (const iw of inws) {
        items.push({
          id: iw.id,
          type: 'inward',
          refNo: iw.inward_no || 'INW',
          customer: iw.party_name || 'Party',
          part: iw.part_name || '-',
          qty: Number(iw.quantity) || 0,
          value: 0,
          stage: 'Inward',
          status: iw.status || 'Received',
          date: iw.inward_date || (iw.created_at ? iw.created_at.slice(0, 10) : ''),
          raw: iw,
        });
      }
    }
  } catch (err) {
    console.warn('Error fetching pipeline summary:', err);
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
      po_no: fields.po_no || `PO-${Math.floor(1000 + Math.random() * 9000)}`,
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

  // 1. Move to Quotation (source is Enquiry)
  if (norm === 'quotation') {
    const quoteNo = `QT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const unitPrice = Number(extraFields.price || extraFields.rate || 0);
    const qty = Number(sourceCard.qty) || 1;
    const totalVal = unitPrice ? unitPrice * qty : Number(sourceCard.value || 0);

    const payload: any = {
      id: crypto.randomUUID(),
      quote_no: quoteNo,
      lead_id: sourceCard.id,
      enquiry_no: sourceCard.refNo,
      customer: sourceCard.customer,
      part_name: sourceCard.part,
      quantity: qty,
      unit_price: unitPrice,
      total_value: totalVal,
      date: new Date().toISOString().slice(0, 10),
      valid_till: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
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

  // 2. Move to Sales Order (source is Quotation or Enquiry)
  if (norm === 'salesorder') {
    const orderNo = `SO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const poNo = extraFields.po_no || `PO-${Math.floor(1000 + Math.random() * 9000)}`;
    const qty = Number(sourceCard.qty) || 1;
    const price = Number(extraFields.price || 0) || (sourceCard.value && sourceCard.qty ? sourceCard.value / sourceCard.qty : 0);
    const totalVal = sourceCard.value || (price * qty);

    const payload: any = {
      id: crypto.randomUUID(),
      order_no: orderNo,
      po_no: poNo,
      customer: sourceCard.customer,
      part_name: sourceCard.part,
      quantity: qty,
      unit_price: price,
      total_value: totalVal,
      delivery_date: extraFields.delivery_date || null,
      status: 'Confirmed',
      order_date: new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString(),
    };
    if (ctx.companyId) payload.company_id = ctx.companyId;

    const { error } = await supabase.from('cnc_sales_orders').insert([payload]);
    if (error) return { ok: false, message: `Could not save Sales Order: ${error.message}` };

    if (sourceCard.type === 'quotation') {
      await supabase.from('cnc_quotations').update({ status: 'Ordered' }).eq('id', sourceCard.id);
    } else if (sourceCard.type === 'enquiry') {
      await supabase.from('cnc_enquiries').update({ pipeline_stage: 'Sales Order', status: 'Converted' }).eq('id', sourceCard.id);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('argus:move-card-stage', {
        detail: { identifier: sourceCard.refNo, targetStage: 'Sales Order', po_no: poNo }
      }));
      window.dispatchEvent(new CustomEvent('argus:data-changed'));
    }

    return {
      ok: true,
      message: `Record #${sourceCard.refNo} (${sourceCard.customer}) moved to Sales Order ${orderNo} with PO ${poNo}.`,
      where: { path: '/sales/pipeline', label: 'Sales Pipeline' },
    };
  }

  // 3. Move to Inward (source is Sales Order)
  if (norm === 'inward') {
    const inwNo = extraFields.inward_no || `INW-${Math.floor(1000 + Math.random() * 9000)}`;
    const qty = Number(extraFields.received_qty) || sourceCard.qty || 1;
    const payload: any = {
      id: crypto.randomUUID(),
      inward_no: inwNo,
      party_name: sourceCard.customer,
      part_name: sourceCard.part,
      product_name: sourceCard.part,
      quantity: qty,
      price: sourceCard.value || 0,
      heat_no: extraFields.heat_no || '',
      inward_date: new Date().toISOString().slice(0, 10),
      status: 'Received',
      created_at: new Date().toISOString(),
    };
    if (ctx.companyId) payload.company_id = ctx.companyId;

    const { error } = await supabase.from('cnc_inwards').insert([payload]);
    if (error) return { ok: false, message: `Could not save Inward: ${error.message}` };

    if (sourceCard.type === 'sales_order') {
      await supabase.from('cnc_sales_orders').update({ status: 'Inward' }).eq('id', sourceCard.id);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('argus:move-card-stage', {
        detail: { identifier: sourceCard.refNo, targetStage: 'Inward', inward_no: inwNo }
      }));
      window.dispatchEvent(new CustomEvent('argus:data-changed'));
    }

    return {
      ok: true,
      message: `Sales Order #${sourceCard.refNo} (${sourceCard.customer}) moved to Inward ${inwNo} (Qty: ${qty}).`,
      where: { path: '/sales/pipeline', label: 'Sales Pipeline' },
    };
  }

  // 4. Move to Finished Goods
  if (norm === 'finishedgoods') {
    const fgQty = Number(extraFields.quantity || extraFields.fg_qty) || sourceCard.qty || 1;
    const batchNo = extraFields.batch_no || 'BATCH-01';
    const location = extraFields.location || 'Rack 1';

    if (sourceCard.type === 'sales_order') {
      await supabase.from('cnc_sales_orders').update({ status: 'Finished Goods' }).eq('id', sourceCard.id);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('argus:move-card-stage', {
        detail: { identifier: sourceCard.refNo, targetStage: 'Finished Goods' }
      }));
      window.dispatchEvent(new CustomEvent('argus:data-changed'));
    }

    return {
      ok: true,
      message: `#${sourceCard.refNo} (${sourceCard.part}) moved to Finished Goods (Qty: ${fgQty}, Batch: ${batchNo}, Bin: ${location}).`,
      where: { path: '/sales/pipeline', label: 'Finished Goods' },
    };
  }

  // 5. Move to Rejected
  if (norm === 'rejected') {
    const rejQty = Number(extraFields.quantity || extraFields.rejected_qty) || 1;
    const reason = extraFields.reason || 'Dimension Defect';

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('argus:move-card-stage', {
        detail: { identifier: sourceCard.refNo, targetStage: 'Rejected' }
      }));
      window.dispatchEvent(new CustomEvent('argus:data-changed'));
    }

    return {
      ok: true,
      message: `#${sourceCard.refNo} logged to Rejection (Part: ${sourceCard.part}, Qty: ${rejQty}, Reason: ${reason}).`,
      where: { path: '/sales/pipeline', label: 'Rejected Stage' },
    };
  }

  // 6. Move to Delivery Challan (DC)
  if (norm === 'dc' || norm === 'deliverychallan') {
    const dcNo = extraFields.dc_no || `DC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const qty = Number(extraFields.quantity || extraFields.dispatch_qty) || sourceCard.qty || 1;
    const vehicle = extraFields.vehicle_no || '';

    const payload: any = {
      id: crypto.randomUUID(),
      delivery_no: dcNo,
      customer_name: sourceCard.customer,
      part_name: sourceCard.part,
      quantity: qty,
      vehicle_no: vehicle,
      status: 'Dispatched',
      delivery_date: new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString(),
    };
    if (ctx.companyId) payload.company_id = ctx.companyId;

    const { error } = await supabase.from('cnc_deliveries').insert([payload]);
    if (error) return { ok: false, message: `Could not save DC: ${error.message}` };

    if (sourceCard.type === 'sales_order') {
      await supabase.from('cnc_sales_orders').update({ status: 'Delivered' }).eq('id', sourceCard.id);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('argus:move-card-stage', {
        detail: { identifier: sourceCard.refNo, targetStage: 'DC', dc_no: dcNo }
      }));
      window.dispatchEvent(new CustomEvent('argus:data-changed'));
    }

    return {
      ok: true,
      message: `#${sourceCard.refNo} (${sourceCard.customer}) moved to Delivery Challan ${dcNo} (Qty: ${qty}${vehicle ? `, Vehicle: ${vehicle}` : ''}).`,
      where: { path: '/sales/pipeline', label: 'Delivery Stage' },
    };
  }

  // 7. Move to Invoice
  if (norm === 'invoice') {
    const invNo = extraFields.invoice_no || `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const amt = Number(extraFields.amount) || Number(sourceCard.value) || ((sourceCard.qty || 1) * 100);
    const qty = sourceCard.qty || 1;

    const payload: any = {
      id: crypto.randomUUID(),
      invoice_no: invNo,
      customer_name: sourceCard.customer,
      part_name: sourceCard.part,
      quantity: qty,
      amount: amt,
      status: 'Unpaid',
      invoice_date: new Date().toISOString().slice(0, 10),
      due_date: extraFields.due_date || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      created_at: new Date().toISOString(),
    };
    if (ctx.companyId) payload.company_id = ctx.companyId;

    const { error } = await supabase.from('cnc_invoices').insert([payload]);
    if (error) return { ok: false, message: `Could not save Invoice: ${error.message}` };

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('argus:move-card-stage', {
        detail: { identifier: sourceCard.refNo, targetStage: 'Invoice', invoice_no: invNo }
      }));
      window.dispatchEvent(new CustomEvent('argus:data-changed'));
    }

    return {
      ok: true,
      message: `#${sourceCard.refNo} (${sourceCard.customer}) moved to Invoice ${invNo} (Amount: ₹${amt.toLocaleString('en-IN')}).`,
      where: { path: '/sales/pipeline', label: 'Invoices' },
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
