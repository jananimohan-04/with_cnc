// Live business figures for the Adviser chat, so it can answer report questions ("how much is unpaid?", "sales this month?",
// "which customer ordered most?") from the database. Read with the signed-in person's own access (sections they may not see are
// left out) and kept for two minutes so every question does not reload everything.

import { supabase } from '@/lib/supabase';
import { buildReport, reportToFacts } from './insights';

type Row = Record<string, any>;

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v: unknown): string => (v == null ? '' : String(v).trim());
const money = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;
const day = (v: unknown): string => str(v).slice(0, 10);
const first = (r: Row, keys: string[]): unknown => { for (const k of keys) if (r[k] != null && r[k] !== '') return r[k]; return undefined; };
const CLOSED = /cancel|closed|lost|reject|declin|dropped|void/i;

async function load(table: string, order = 'created_at'): Promise<Row[] | null> {
  try {
    const { data, error } = await supabase.from(table as never).select('*').order(order as never, { ascending: false }).limit(2000);
    return error ? null : ((data ?? []) as Row[]);
  } catch { return null; }
}
async function loadInvoices(): Promise<Row[] | null> {
  try {
    const { data, error } = await supabase.rpc('erp_invoices', { p_type: null, p_status: null, p_customer: null, p_search: null, p_from: null, p_to: null, p_page: 1, p_page_size: 1000 } as never);
    return error ? null : (((data as { rows?: Row[] } | null)?.rows ?? []) as Row[]);
  } catch { return null; }
}

/** Month keys: this month and last month as "YYYY-MM". */
function months() {
  const d = new Date();
  const ym = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
  const last = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return { cur: ym(d), prev: ym(last), curName: d.toLocaleString('en-IN', { month: 'long', year: 'numeric' }), prevName: last.toLocaleString('en-IN', { month: 'long', year: 'numeric' }) };
}

function countBy(rows: Row[], f: (r: Row) => string, top = 8): string {
  const m = new Map<string, number>();
  rows.forEach((r) => { const k = f(r) || 'not set'; m.set(k, (m.get(k) ?? 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, n]) => `${k} ${n}`).join(', ');
}
function sumBy(rows: Row[], f: (r: Row) => string, v: (r: Row) => number, top = 8): string {
  const m = new Map<string, number>();
  rows.forEach((r) => { const k = f(r) || 'Unnamed'; m.set(k, (m.get(k) ?? 0) + v(r)); });
  return [...m.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, n]) => `${k} ${money(n)}`).join('; ');
}
const inMonth = (rows: Row[], dateKeys: string[], ym: string) => rows.filter((r) => day(first(r, dateKeys)).startsWith(ym));

async function build(can: (m: string) => boolean): Promise<string> {
  const { cur, prev, curName, prevName } = months();
  const wantInv = can('invoices') || can('menu-invoices');
  const [enq, quo, so, dc, inv, mat, wo, report] = await Promise.all([
    can('enquiries') ? load('cnc_enquiries') : Promise.resolve(null),
    can('quotations') || can('menu-quotations') ? load('cnc_quotations') : Promise.resolve(null),
    can('sales-orders') || can('menu-sales-orders') ? load('cnc_sales_orders') : Promise.resolve(null),
    can('delivery') || can('menu-delivery') ? load('cnc_deliveries') : Promise.resolve(null),
    wantInv ? loadInvoices() : Promise.resolve(null),
    can('inventory') ? load('cnc_raw_materials') : Promise.resolve(null),
    can('production') ? load('cnc_work_orders') : Promise.resolve(null),
    buildReport(can).catch(() => null),
  ]);
  const out: string[] = [`Today is ${new Date().toISOString().slice(0, 10)}. This month = ${curName}, last month = ${prevName}.`];

  if (enq) {
    const d = ['received_date', 'enquiry_date', 'created_at'];
    const c = (r: Row) => str(first(r, ['customer', 'customer_name', 'company_name']));
    out.push(`ENQUIRIES: ${enq.length} in total; ${inMonth(enq, d, cur).length} this month, ${inMonth(enq, d, prev).length} last month. By stage: ${countBy(enq, (r) => str(first(r, ['pipeline_stage', 'status'])))}. Top customers by enquiries: ${countBy(enq, c, 6)}.`
      + ` Latest: ${enq.slice(0, 8).map((r) => `${str(first(r, ['enquiry_no', 'lead_no']))} ${c(r)}${str(r.part_name) ? ` (${str(r.part_name)})` : ''} ${day(first(r, d))} ${str(first(r, ['pipeline_stage', 'status']))}`).join('; ')}.`);
  }
  if (quo) {
    const d = ['date', 'quote_date', 'created_at'];
    const v = (r: Row) => num(first(r, ['total_value', 'grand_total', 'total', 'amount']));
    const c = (r: Row) => str(first(r, ['customer', 'customer_name', 'company_name']));
    const live = quo.filter((r) => !CLOSED.test(str(r.status)));
    out.push(`QUOTATIONS: ${quo.length} in total worth ${money(quo.reduce((a, r) => a + v(r), 0))}; this month ${inMonth(quo, d, cur).length} worth ${money(inMonth(quo, d, cur).reduce((a, r) => a + v(r), 0))}, last month ${inMonth(quo, d, prev).length} worth ${money(inMonth(quo, d, prev).reduce((a, r) => a + v(r), 0))}. Open (not cancelled / lost): ${live.length}. By status: ${countBy(quo, (r) => str(r.status))}. Biggest customers by quoted value: ${sumBy(quo, c, v, 6)}.`
      + ` Latest: ${quo.slice(0, 8).map((r) => `${str(r.quote_no)} ${c(r)} ${money(v(r))} ${day(first(r, d))} ${str(r.status)}`).join('; ')}.`);
  }
  if (so) {
    const d = ['order_date', 'created_at'];
    const v = (r: Row) => num(first(r, ['total_value', 'grand_total', 'total_amount', 'total', 'amount', 'order_value']));
    const c = (r: Row) => str(first(r, ['customer', 'customer_name', 'company_name']));
    const open = so.filter((r) => !CLOSED.test(str(r.status)) && !/complete|deliver|closed/i.test(str(r.status)));
    out.push(`SALES ORDERS: ${so.length} in total worth ${money(so.reduce((a, r) => a + v(r), 0))}; this month ${inMonth(so, d, cur).length} worth ${money(inMonth(so, d, cur).reduce((a, r) => a + v(r), 0))}, last month ${inMonth(so, d, prev).length} worth ${money(inMonth(so, d, prev).reduce((a, r) => a + v(r), 0))}. Still open: ${open.length}. By status: ${countBy(so, (r) => str(r.status))}. Top customers by order value: ${sumBy(so, c, v, 6)}.`
      + ` Latest: ${so.slice(0, 8).map((r) => `${str(r.order_no)} ${c(r)} ${num(r.quantity)} pcs ${money(v(r))} due ${day(r.delivery_date) || '-'} ${str(r.status)}`).join('; ')}.`);
  }
  if (dc) {
    const d = ['delivery_date', 'created_at'];
    const c = (r: Row) => str(first(r, ['customer_name', 'customer', 'company_name']));
    out.push(`DELIVERY CHALLANS: ${dc.length} in total; this month ${inMonth(dc, d, cur).length}, last month ${inMonth(dc, d, prev).length}. Top customers by deliveries: ${countBy(dc, c, 6)}.`
      + ` Latest: ${dc.slice(0, 6).map((r) => `${str(r.delivery_no)} ${c(r)} ${day(first(r, d))} ${str(r.status)}`).join('; ')}.`);
  }
  if (inv) {
    const live = inv.filter((r) => !r.cancelled && !/credit/i.test(str(r.invoice_type)));
    const d = ['invoice_date', 'created_at'];
    const c = (r: Row) => str(first(r, ['customer_name', 'customer']));
    const tot = (rows: Row[]) => rows.reduce((a, r) => a + num(r.total), 0);
    const open = live.filter((r) => num(r.balance) > 0.5);
    out.push(`INVOICES (sales billing): ${live.length} invoices worth ${money(tot(live))}; received ${money(live.reduce((a, r) => a + num(r.received), 0))}; unpaid ${money(open.reduce((a, r) => a + num(r.balance), 0))} on ${open.length} invoices. Billed this month ${money(tot(inMonth(live, d, cur)))} (${inMonth(live, d, cur).length} invoices), last month ${money(tot(inMonth(live, d, prev)))} (${inMonth(live, d, prev).length}). Top customers by billing: ${sumBy(live, c, (r) => num(r.total), 8)}. Unpaid by customer: ${sumBy(open, c, (r) => num(r.balance), 8)}.`
      + ` Latest: ${live.slice(0, 8).map((r) => `${str(r.invoice_no)} ${c(r)} ${money(num(r.total))} ${day(first(r, d))}${num(r.balance) > 0.5 ? ` unpaid ${money(num(r.balance))}` : ' paid'}`).join('; ')}.`);
  }
  if (mat) {
    const low = mat.filter((m) => num(m.min_stock) > 0 && num(m.stock_qty) <= num(m.min_stock));
    const value = mat.reduce((a, m) => a + num(m.stock_qty) * num(first(m, ['unit_cost', 'rate', 'unit_price', 'cost'])), 0);
    out.push(`STOCK: ${mat.length} items${value > 0 ? `, about ${money(value)} in stock value` : ''}; ${low.length} at or below minimum, ${mat.filter((m) => num(m.stock_qty) <= 0).length} at zero. Low items: ${low.slice(0, 10).map((m) => `${str(first(m, ['name', 'material_code']))} ${num(m.stock_qty)} ${str(m.uom)} (min ${num(m.min_stock)})`).join('; ') || 'none'}.`);
  }
  if (wo) {
    const open = wo.filter((w) => !/complete|closed|cancel/i.test(str(w.status)));
    const made = wo.reduce((a, w) => a + num(w.completed), 0);
    const bad = wo.reduce((a, w) => a + num(w.rejected), 0);
    out.push(`PRODUCTION (work orders): ${wo.length} in total, ${open.length} open. Pieces completed ${made}, rejected ${bad}${made + bad ? ` (${((bad / (made + bad)) * 100).toFixed(1)}% rejection)` : ''}. By status: ${countBy(wo, (w) => str(w.status))}.`);
  }
  // month by month for the last 6 months (for graphs and trends)
  const last6 = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i)); return { ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, name: d.toLocaleString('en-IN', { month: 'short', year: '2-digit' }) }; });
  const monthly = (label: string, rows: Row[] | null, dateKeys: string[], value?: (r: Row) => number) => rows
    ? `${label}: ${last6.map((m) => { const r = inMonth(rows, dateKeys, m.ym); return `${m.name} ${value ? money(r.reduce((a, x) => a + value(x), 0)) : r.length}`; }).join(', ')}`
    : '';
  const liveInv = inv ? inv.filter((r) => !r.cancelled && !/credit/i.test(str(r.invoice_type))) : null;
  const trend = [
    monthly('Enquiries received (count)', enq, ['received_date', 'enquiry_date', 'created_at']),
    monthly('Quotations (value)', quo, ['date', 'quote_date', 'created_at'], (r) => num(first(r, ['total_value', 'grand_total', 'total', 'amount']))),
    monthly('Sales orders (value)', so, ['order_date', 'created_at'], (r) => num(first(r, ['total_value', 'grand_total', 'total_amount', 'total', 'amount', 'order_value']))),
    monthly('Delivery challans (count)', dc, ['delivery_date', 'created_at']),
    monthly('Invoiced / billed (value)', liveInv, ['invoice_date', 'created_at'], (r) => num(r.total)),
    monthly('Payments received on invoices of that month (value)', liveInv, ['invoice_date', 'created_at'], (r) => num(r.received)),
  ].filter(Boolean);
  if (trend.length) out.push(`MONTH BY MONTH (last 6 months, oldest first):\n${trend.join('\n')}`);
  if (report) out.push(`PROBLEMS AND HIGHLIGHTS FOUND:\n${reportToFacts(report)}`);
  return out.join('\n').slice(0, 16000);
}

let cache: { at: number; key: string; text: Promise<string> } | null = null;

/** The figures as text for the AI (cached for two minutes per company). */
export function businessData(can: (m: string) => boolean, companyKey = ''): Promise<string> {
  if (cache && cache.key === companyKey && Date.now() - cache.at < 120_000) return cache.text;
  const text = build(can).catch(() => '');
  cache = { at: Date.now(), key: companyKey, text };
  return text;
}

/** Forget the cached figures (after records change). */
export function dropBusinessData() { cache = null; }
