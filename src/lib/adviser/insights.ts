// The Adviser's automatic report: reads the company's own records and says what needs attention, in plain words, with a
// suggested action for each. No AI is needed for this part (it is simple, checkable rules over the data); the AI is only
// asked afterwards to turn these figures into improvement ideas (see AdviserReport).
//
// Everything is read through the signed-in user's own access (row level security), so a company only ever sees its own
// figures, and a section is skipped when the user has no right to that module.
import { supabase } from '@/lib/supabase';

export type Severity = 'high' | 'medium' | 'low' | 'good';

export interface Insight {
  id: string;
  severity: Severity;
  area: 'Payments' | 'Sales' | 'Delivery' | 'Billing' | 'Production' | 'Stock' | 'Customers';
  title: string;
  /** one or two sentences: what is wrong and how big it is */
  detail: string;
  /** what to do about it */
  action: string;
  /** the records behind it (customer, number, amount, days), at most ~8 */
  items: string[];
  /** screen to open to act on it (a path without the leading slash) */
  page?: string;
}

export interface Snapshot {
  outstanding: number;
  overdue: number;
  openEnquiries: number;
  pendingQuotes: number;
  lateOrders: number;
  unbilledDcs: number;
  lowStock: number;
}

export interface AdviserReport {
  generatedAt: string;
  insights: Insight[];
  snapshot: Snapshot;
  /** sections that could not be read (no access, or the table is missing) */
  skipped: string[];
}

type Row = Record<string, any>;

const DAY = 86_400_000;
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v: unknown): string => (v == null ? '' : String(v).trim());
const money = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;
const toDate = (v: unknown): Date | null => {
  const s = str(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};
const today0 = (): Date => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const daysBetween = (from: Date, to: Date): number => Math.round((to.getTime() - from.getTime()) / DAY);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const key = (v: unknown) => str(v).toLowerCase();
const CLOSED = /cancel|closed|lost|reject|declin|dropped|void/i;
const DONE_QUOTE = /accept|won|convert|confirm|order|approved|processed/i;

async function load(table: string, skipped: string[], label: string, order = 'created_at'): Promise<Row[]> {
  try {
    const { data, error } = await supabase.from(table as never).select('*').order(order as never, { ascending: false }).limit(2000);
    if (error) { skipped.push(label); return []; }
    return (data ?? []) as Row[];
  } catch { skipped.push(label); return []; }
}

async function loadInvoices(skipped: string[]): Promise<Row[]> {
  try {
    const { data, error } = await supabase.rpc('erp_invoices', { p_type: null, p_status: null, p_customer: null, p_search: null, p_from: null, p_to: null, p_page: 1, p_page_size: 500 } as never);
    if (error) { skipped.push('Invoices'); return []; }
    return ((data as { rows?: Row[] } | null)?.rows ?? []) as Row[];
  } catch { skipped.push('Invoices'); return []; }
}

const sev: Record<Severity, number> = { high: 0, medium: 1, low: 2, good: 3 };

/** `can(module)` says whether the user may see a module; a section the user may not see is left out. */
export async function buildReport(can: (module: string) => boolean = () => true): Promise<AdviserReport> {
  const skipped: string[] = [];
  const t0 = today0();
  const insights: Insight[] = [];
  const snap: Snapshot = { outstanding: 0, overdue: 0, openEnquiries: 0, pendingQuotes: 0, lateOrders: 0, unbilledDcs: 0, lowStock: 0 };

  const wantInv = can('invoices') || can('menu-invoices');
  const [enquiries, quotes, orders, dcs, invoices, materials, workOrders] = await Promise.all([
    can('enquiries') ? load('cnc_enquiries', skipped, 'Enquiries') : Promise.resolve([] as Row[]),
    can('quotations') ? load('cnc_quotations', skipped, 'Quotations') : Promise.resolve([] as Row[]),
    can('sales-orders') ? load('cnc_sales_orders', skipped, 'Sales orders') : Promise.resolve([] as Row[]),
    can('delivery') ? load('cnc_deliveries', skipped, 'Delivery challans') : Promise.resolve([] as Row[]),
    wantInv ? loadInvoices(skipped) : Promise.resolve([] as Row[]),
    can('inventory') ? load('cnc_raw_materials', skipped, 'Stock') : Promise.resolve([] as Row[]),
    can('production') ? load('cnc_work_orders', skipped, 'Work orders') : Promise.resolve([] as Row[]),
  ]);

  // ---------------------------------------------------------------- payments (invoices)
  const live = invoices.filter((r) => !r.cancelled && !/credit/i.test(str(r.invoice_type)));
  if (live.length) {
    const open = live.filter((r) => num(r.balance) > 0.5);
    snap.outstanding = open.reduce((a, r) => a + num(r.balance), 0);
    const overdue = open.map((r) => {
      const due = toDate(r.due_date) ?? (() => { const d = toDate(r.invoice_date); return d ? new Date(d.getTime() + 30 * DAY) : null; })();
      return { r, days: due ? daysBetween(due, t0) : 0, hasDue: !!toDate(r.due_date) };
    }).filter((x) => x.days > 0);
    snap.overdue = overdue.reduce((a, x) => a + num(x.r.balance), 0);

    const byCustomer = new Map<string, { name: string; amount: number; maxDays: number; invoices: string[] }>();
    for (const x of overdue) {
      const name = str(x.r.customer_name) || 'Unnamed customer';
      const c = byCustomer.get(key(name)) ?? { name, amount: 0, maxDays: 0, invoices: [] };
      c.amount += num(x.r.balance);
      c.maxDays = Math.max(c.maxDays, x.days);
      c.invoices.push(`${str(x.r.invoice_no)} ${money(num(x.r.balance))} (${x.days}d)`);
      byCustomer.set(key(name), c);
    }
    const list = [...byCustomer.values()].sort((a, b) => b.amount - a.amount);
    const severe = list.filter((c) => c.maxDays > 60);
    const mid = list.filter((c) => c.maxDays > 30 && c.maxDays <= 60);
    const fresh = list.filter((c) => c.maxDays <= 30);
    const line = (c: { name: string; amount: number; maxDays: number; invoices: string[] }) => `${c.name}: ${money(c.amount)} unpaid, oldest ${c.maxDays} days past due (${c.invoices.slice(0, 3).join(', ')})`;
    if (severe.length) insights.push({
      id: 'pay-severe', severity: 'high', area: 'Payments', page: 'finance/invoices',
      title: `${plural(severe.length, 'customer')} have not paid for more than 60 days past the due date`,
      detail: `${money(severe.reduce((a, c) => a + c.amount, 0))} is stuck with ${severe.map((c) => c.name).slice(0, 3).join(', ')}${severe.length > 3 ? ' and others' : ''}. The longer it stays, the less likely it is collected.`,
      action: 'Call the accounts person today, send a written reminder with the invoice copies, and stop new dispatches to them until a part payment is received.',
      items: severe.slice(0, 8).map(line),
    });
    if (mid.length) insights.push({
      id: 'pay-mid', severity: 'medium', area: 'Payments', page: 'finance/invoices',
      title: `${plural(mid.length, 'customer')} are 30 to 60 days past the due date`,
      detail: `${money(mid.reduce((a, c) => a + c.amount, 0))} is overdue and getting older.`,
      action: 'Send a reminder this week and ask for a committed payment date; note it in the invoice remarks.',
      items: mid.slice(0, 8).map(line),
    });
    if (fresh.length) insights.push({
      id: 'pay-fresh', severity: 'low', area: 'Payments', page: 'finance/invoices',
      title: `${plural(fresh.length, 'customer')} just crossed the due date`,
      detail: `${money(fresh.reduce((a, c) => a + c.amount, 0))} is up to 30 days overdue.`,
      action: 'A friendly reminder now usually brings the payment without any dispute.',
      items: fresh.slice(0, 6).map(line),
    });
    const noDue = open.filter((r) => !toDate(r.due_date));
    if (noDue.length >= 3) insights.push({
      id: 'pay-nodue', severity: 'low', area: 'Payments', page: 'finance/invoices',
      title: `${plural(noDue.length, 'open invoice')} have no due date`,
      detail: 'Without a due date nothing can be called overdue, so reminders are easy to forget (these were counted as due 30 days after the invoice date).',
      action: 'Set payment terms on every customer so each invoice gets a due date automatically.',
      items: noDue.slice(0, 5).map((r) => `${str(r.customer_name)} ${str(r.invoice_no)} ${money(num(r.balance))}`),
    });
    // repeat late payers
    const repeat = list.filter((c) => c.invoices.length >= 3);
    if (repeat.length) insights.push({
      id: 'pay-repeat', severity: 'medium', area: 'Customers', page: 'finance/invoices',
      title: `${repeat.map((c) => c.name).slice(0, 2).join(' and ')} ${repeat.length === 1 ? 'pays' : 'pay'} late again and again`,
      detail: 'Three or more of their invoices are overdue at the same time, which points to a habit, not a one-off delay.',
      action: 'Move them to advance or part-advance payment, or shorten their credit days.',
      items: repeat.slice(0, 5).map((c) => `${c.name}: ${c.invoices.length} overdue invoices, ${money(c.amount)}`),
    });
    // dependence on one customer
    const billed = new Map<string, number>();
    live.forEach((r) => billed.set(str(r.customer_name), (billed.get(str(r.customer_name)) ?? 0) + num(r.total)));
    const totalBilled = [...billed.values()].reduce((a, v) => a + v, 0);
    const top = [...billed.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && totalBilled > 0 && top[1] / totalBilled > 0.4 && billed.size > 1) insights.push({
      id: 'cust-concentration', severity: 'medium', area: 'Customers',
      title: `${Math.round((top[1] / totalBilled) * 100)}% of your billing comes from one customer`,
      detail: `${top[0]} is ${money(top[1])} of ${money(totalBilled)} invoiced. If they slow down or delay payment, your cash flow suffers immediately.`,
      action: 'Keep this customer happy, and work on bringing two or three new customers so no one is above 30%.',
      items: [...billed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, v]) => `${n}: ${money(v)} (${Math.round((v / totalBilled) * 100)}%)`),
    });
    const received = live.reduce((a, r) => a + num(r.received), 0);
    const total = live.reduce((a, r) => a + num(r.total), 0);
    if (!overdue.length && total > 0) insights.push({
      id: 'pay-good', severity: 'good', area: 'Payments',
      title: 'No invoice is overdue',
      detail: `${money(received)} of ${money(total)} invoiced has been received (${Math.round((received / total) * 100)}%).`,
      action: 'Keep sending invoices on the day of dispatch to hold this.', items: [],
    });
  }

  // ---------------------------------------------------------------- enquiries and quotations
  const quoteForLead = new Set<string>();
  quotes.forEach((q) => { if (str(q.lead_id)) quoteForLead.add(key(q.lead_id)); if (str(q.enquiry_no)) quoteForLead.add(key(q.enquiry_no)); });
  const stale = enquiries.filter((e) => {
    if (CLOSED.test(str(e.status)) || CLOSED.test(str(e.pipeline_stage))) return false;
    if (/quot|order|inward|deliver|invoice|convert/i.test(str(e.pipeline_stage)) || /quot|convert|order/i.test(str(e.status))) return false;
    if (quoteForLead.has(key(e.id)) || (str(e.enquiry_no) && quoteForLead.has(key(e.enquiry_no)))) return false;
    return true;
  }).map((e) => {
    const d = toDate(e.received_date) ?? toDate(e.created_at);
    return { e, days: d ? daysBetween(d, t0) : 0 };
  }).filter((x) => x.days >= 3).sort((a, b) => b.days - a.days);
  snap.openEnquiries = stale.length;
  if (stale.length) {
    const worst = stale[0].days;
    insights.push({
      id: 'enq-stale', severity: worst > 7 ? 'high' : 'medium', area: 'Sales', page: 'sales/in-house',
      title: `${plural(stale.length, 'enquiry', 'enquiries')} still waiting for a quotation`,
      detail: `The oldest has been waiting ${worst} days. Customers usually go to the next supplier if they get no price within 2 to 3 days.`,
      action: 'Send a quotation (or politely decline) for each one today; assign one person to answer every new enquiry within 24 hours.',
      items: stale.slice(0, 8).map((x) => `${str(x.e.customer) || 'Unnamed'}${str(x.e.part_name) ? ` — ${str(x.e.part_name)}` : ''} — ${x.days} days${num(x.e.estimated_value) ? ` — about ${money(num(x.e.estimated_value))}` : ''}`),
    });
  }
  const orderForQuote = new Set<string>();
  orders.forEach((o) => { if (str(o.quotation_id)) orderForQuote.add(key(o.quotation_id)); if (str(o.quote_no)) orderForQuote.add(key(o.quote_no)); });
  const pendingQ = quotes.filter((q) => !CLOSED.test(str(q.status)) && !DONE_QUOTE.test(str(q.status)) && !orderForQuote.has(key(q.id)) && !(str(q.quote_no) && orderForQuote.has(key(q.quote_no))))
    .map((q) => { const d = toDate(q.date) ?? toDate(q.created_at); const v = toDate(q.valid_till); return { q, days: d ? daysBetween(d, t0) : 0, expired: !!v && v < t0 }; })
    .filter((x) => x.days >= 7 || x.expired).sort((a, b) => num(b.q.total_value) - num(a.q.total_value));
  snap.pendingQuotes = pendingQ.length;
  if (pendingQ.length) insights.push({
    id: 'quote-pending', severity: pendingQ.some((x) => x.days > 21) ? 'high' : 'medium', area: 'Sales', page: 'sales/quotations',
    title: `${plural(pendingQ.length, 'quotation')} sent but no order came`,
    detail: `${money(pendingQ.reduce((a, x) => a + num(x.q.total_value), 0))} of quoted work is waiting for a decision${pendingQ.some((x) => x.expired) ? `; ${pendingQ.filter((x) => x.expired).length} already past their validity date` : ''}.`,
    action: 'Phone each customer: ask what is holding the decision (price, lead time, or competitor), and offer a revised quote or a short extension.',
    items: pendingQ.slice(0, 8).map((x) => `${str(x.q.customer) || 'Unnamed'} — ${str(x.q.quote_no)} — ${money(num(x.q.total_value))} — ${x.days} days${x.expired ? ' (expired)' : ''}`),
  });

  // ---------------------------------------------------------------- sales orders and deliveries
  const dispatched = new Map<string, number>();
  const lastDc = new Map<string, Date>();
  dcs.forEach((d) => {
    const k = key(d.sales_order_id) || key(d.sales_order_no);
    if (!k) return;
    dispatched.set(k, (dispatched.get(k) ?? 0) + num(d.dispatch_qty ?? d.quantity));
    const dd = toDate(d.delivery_date);
    if (dd && (!lastDc.get(k) || dd > lastDc.get(k)!)) lastDc.set(k, dd);
  });
  const openOrders = orders.filter((o) => !CLOSED.test(str(o.status))).map((o) => {
    const qty = num(o.quantity);
    const got = Math.max(num(o.delivered), dispatched.get(key(o.id)) ?? 0, dispatched.get(key(o.order_no)) ?? 0);
    const due = toDate(o.delivery_date);
    const placed = toDate(o.order_date) ?? toDate(o.created_at);
    return { o, qty, remaining: qty - got, got, lateBy: due && due < t0 ? daysBetween(due, t0) : 0, age: placed ? daysBetween(placed, t0) : 0 };
  }).filter((x) => x.qty > 0 && x.remaining > 0);
  const late = openOrders.filter((x) => x.lateBy > 0).sort((a, b) => b.lateBy - a.lateBy);
  snap.lateOrders = late.length;
  if (late.length) insights.push({
    id: 'order-late', severity: 'high', area: 'Delivery', page: 'sales/orders',
    title: `${plural(late.length, 'sales order')} passed the promised delivery date`,
    detail: `The latest is ${late[0].lateBy} days late. Late deliveries are the fastest way to lose a repeat customer.`,
    action: 'Tell each customer a new realistic date today, and move these jobs to the top of the production schedule.',
    items: late.slice(0, 8).map((x) => `${str(x.o.customer) || 'Unnamed'} — ${str(x.o.order_no)} — ${x.remaining} of ${x.qty} still to deliver — ${x.lateBy} days late`),
  });
  const slow = openOrders.filter((x) => x.lateBy === 0 && x.got === 0 && x.age >= 10).sort((a, b) => b.age - a.age);
  if (slow.length) insights.push({
    id: 'order-nodc', severity: 'medium', area: 'Delivery', page: 'sales/orders',
    title: `${plural(slow.length, 'order')} placed 10 or more days ago, no delivery challan yet`,
    detail: `The oldest was placed ${slow[0].age} days ago and nothing has been dispatched.`,
    action: 'Check whether the job is waiting for material, a drawing approval or a machine slot, and fix the blocker or inform the customer.',
    items: slow.slice(0, 8).map((x) => `${str(x.o.customer) || 'Unnamed'} — ${str(x.o.order_no)} — ${x.qty} pcs — ${x.age} days`),
  });

  // ---------------------------------------------------------------- delivered but not billed
  if (dcs.length && (invoices.length || wantInv)) {
    const billedDc = new Set<string>();
    const billedSo = new Set<string>();
    invoices.forEach((r) => { if (str(r.dc_no)) billedDc.add(key(r.dc_no)); });
    // an invoice row from the list has no order id, so match by DC number only; skip the check when no invoice carries a DC number
    const canMatch = billedDc.size > 0;
    void billedSo;
    const unbilled = canMatch ? dcs.filter((d) => !CLOSED.test(str(d.status)) && !billedDc.has(key(d.delivery_no)))
      .map((d) => { const dd = toDate(d.delivery_date) ?? toDate(d.created_at); return { d, days: dd ? daysBetween(dd, t0) : 0 }; })
      .filter((x) => x.days >= 3).sort((a, b) => b.days - a.days) : [];
    snap.unbilledDcs = unbilled.length;
    if (unbilled.length) insights.push({
      id: 'dc-unbilled', severity: unbilled.some((x) => x.days > 7) ? 'high' : 'medium', area: 'Billing', page: 'finance/invoices',
      title: `${plural(unbilled.length, 'delivery challan')} delivered but not invoiced`,
      detail: `Goods left the factory up to ${unbilled[0].days} days ago without a bill, so the payment clock has not even started.`,
      action: 'Raise the invoice on the day of dispatch from the delivery challan; make it part of the dispatch checklist.',
      items: unbilled.slice(0, 8).map((x) => `${str(x.d.customer_name) || 'Unnamed'} — DC ${str(x.d.delivery_no)} — ${x.days} days ago`),
    });
  }

  // ---------------------------------------------------------------- production
  const wo = workOrders.filter((w) => !/complete|closed|cancel/i.test(str(w.status)) && num(w.completed) < num(w.quantity))
    .map((w) => { const due = toDate(w.due_date); return { w, late: due && due < t0 ? daysBetween(due, t0) : 0 }; }).filter((x) => x.late > 0).sort((a, b) => b.late - a.late);
  if (wo.length) insights.push({
    id: 'wo-late', severity: wo[0].late > 7 ? 'high' : 'medium', area: 'Production', page: 'production/planning',
    title: `${plural(wo.length, 'work order')} running past the due date`,
    detail: `The worst is ${wo[0].late} days behind.`,
    action: 'Look at the schedule for the blocking machine or material; add a shift or outsource the process if needed.',
    items: wo.slice(0, 8).map((x) => `${str(x.w.customer) || 'Unnamed'} — ${str(x.w.wo_no)} — ${num(x.w.completed)}/${num(x.w.quantity)} done — ${x.late} days late`),
  });
  const made = workOrders.reduce((a, w) => a + num(w.completed), 0);
  const bad = workOrders.reduce((a, w) => a + num(w.rejected), 0);
  if (made + bad >= 50 && bad / (made + bad) > 0.05) insights.push({
    id: 'reject-rate', severity: bad / (made + bad) > 0.1 ? 'high' : 'medium', area: 'Production', page: 'reports/production',
    title: `Rejection rate is ${(bad / (made + bad) * 100).toFixed(1)}%`,
    detail: `${bad} of ${made + bad} pieces were rejected. Each rejected piece costs material, machine time and delivery time.`,
    action: 'Open the rejected entries, group them by machine and by reason, and fix the top reason first (tool wear, offsets and programs are the usual ones).',
    items: workOrders.filter((w) => num(w.rejected) > 0).sort((a, b) => num(b.rejected) - num(a.rejected)).slice(0, 5).map((w) => `${str(w.wo_no)} ${str(w.part_name)} — ${num(w.rejected)} rejected`),
  });

  // ---------------------------------------------------------------- stock
  const low = materials.filter((m) => num(m.min_stock) > 0 && num(m.stock_qty) <= num(m.min_stock) && !CLOSED.test(str(m.status)))
    .sort((a, b) => num(a.stock_qty) / num(a.min_stock) - num(b.stock_qty) / num(b.min_stock));
  snap.lowStock = low.length;
  if (low.length) insights.push({
    id: 'stock-low', severity: low.some((m) => num(m.stock_qty) <= 0) ? 'high' : 'medium', area: 'Stock', page: 'inventory/stock',
    title: `${plural(low.length, 'material')} at or below the minimum stock`,
    detail: `${low.filter((m) => num(m.stock_qty) <= 0).length} of them are out of stock. A job that waits for material is a late delivery.`,
    action: 'Raise purchase requisitions for these today, starting with the ones that are at zero.',
    items: low.slice(0, 8).map((m) => `${str(m.name) || str(m.material_code)} — ${num(m.stock_qty)} ${str(m.uom)} in stock, minimum ${num(m.min_stock)}`),
  });

  insights.sort((a, b) => sev[a.severity] - sev[b.severity]);
  if (!insights.length || insights.every((i) => i.severity === 'good')) {
    insights.push({
      id: 'all-clear', severity: 'good', area: 'Sales',
      title: 'Nothing urgent found in the records I can see',
      detail: skipped.length ? `I could not read: ${skipped.join(', ')}.` : 'Enquiries, quotations, orders, deliveries, invoices, stock and work orders all look on track.',
      action: 'Use the time to follow up on old quotations and ask your best customers for their next requirement.', items: [],
    });
  }
  return { generatedAt: new Date().toISOString(), insights, snapshot: snap, skipped };
}

/** The figures as compact text for the AI (sums and names only; at most about 5000 characters). */
export function reportToFacts(r: AdviserReport): string {
  const s = r.snapshot;
  const head = `Today ${new Date().toISOString().slice(0, 10)}. Unpaid invoices ${money(s.outstanding)} (overdue ${money(s.overdue)}). Enquiries waiting for a quotation: ${s.openEnquiries}. Quotations without an order: ${s.pendingQuotes}. Orders past delivery date: ${s.lateOrders}. Delivery challans not invoiced: ${s.unbilledDcs}. Materials at minimum stock: ${s.lowStock}.`;
  const body = r.insights.filter((i) => i.severity !== 'good').map((i) => `[${i.severity.toUpperCase()}] ${i.title}. ${i.detail}${i.items.length ? ' Details: ' + i.items.slice(0, 5).join('; ') : ''}`).join('\n');
  return `${head}\n${body}`.slice(0, 5800);
}

/** A short spoken summary (read aloud when the person asks). */
export function reportToSpeech(r: AdviserReport): string {
  const bad = r.insights.filter((i) => i.severity === 'high' || i.severity === 'medium');
  if (!bad.length) return 'Good news. I found nothing urgent in your records today.';
  const top = bad.slice(0, 4).map((i, n) => `${n + 1}. ${i.title}. ${i.action}`).join(' ');
  return `I found ${bad.length} ${bad.length === 1 ? 'thing' : 'things'} that need attention. ${top}`;
}
