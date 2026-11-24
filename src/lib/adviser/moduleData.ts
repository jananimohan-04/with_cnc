// The Adviser's view of the WHOLE of Argus BI, kept up to date by itself:
//  - the app map is read from the real menus (BI menu + Retail Store menu), so a module added later is known at once;
//  - the page guides are the same texts the Teaching mode uses;
//  - live data from the suites outside the main ERP tables: Retail Store orders and partners, AI Attendance,
//    scheduled tasks and operation plans, support tickets and mind maps.
// Everything is read with the signed-in person's own access; a part they cannot open is simply left out.

/* eslint-disable @typescript-eslint/no-explicit-any -- rows from many tables are read loosely */
import { supabase } from '@/lib/supabase';
import { navSections } from '@/config/navigation';
import { PAGE_TEACHINGS } from '@/lib/guides/pageTeachings';

type Row = Record<string, any>;
const str = (v: unknown): string => (v == null ? '' : String(v).trim());
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const day = (v: unknown) => str(v).slice(0, 10);
const countBy = (rows: Row[], f: (r: Row) => string, top = 8) => {
  const m = new Map<string, number>();
  rows.forEach((r) => { const k = f(r) || 'not set'; m.set(k, (m.get(k) ?? 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, n]) => `${k} ${n}`).join(', ');
};

/** Never let a slow suite hold up the answer. */
function withTimeout<T>(p: Promise<T>, ms = 6000): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

async function rows(table: string, order: string, lim = 500): Promise<Row[] | null> {
  try {
    const r = await supabase.from(table as never).select('*').order(order as never, { ascending: false }).limit(lim);
    if (!r.error) return (r.data ?? []) as Row[];
    const fb = await supabase.from(table as never).select('*').limit(lim);
    return fb.error ? null : ((fb.data ?? []) as Row[]);
  } catch { return null; }
}

/** Every menu and screen of the app as it is today (read from the menus themselves). */
export async function appMap(): Promise<string> {
  const bi = navSections.map((s) => `- ${s.label}: ${s.items.map((i) => `${i.label} (/${i.page})`).join(', ')}`).join('\n');
  let retail = '';
  try {
    const { MENU_CATALOG } = await import('@/retail/menuCatalog');
    retail = (MENU_CATALOG as any[]).map((c) => `- ${c.label}${c.description ? ` (${c.description})` : ''}: ${(c.items ?? []).map((i: any) => `${i.label} (${i.path})`).join(', ')}`).join('\n');
  } catch { /* the Retail Store menu could not be read */ }
  const guides = Object.entries(PAGE_TEACHINGS)
    .map(([path, t]) => `- ${path}: ${t.en.replace(/\s+/g, ' ').trim().slice(0, 300)}`)
    .join('\n');
  return [
    'LIVE APP MAP — read from the app\'s own menus just now, so it includes every module that exists today (also modules added recently). Use it to answer "where is", "what can Argus BI do", "how do I" about ANY module.',
    'ARGUS BI MENU (section: screen (route)):',
    bi,
    retail ? 'RETAIL STORE (opened from Retail Store /store/home; its own screens):\n' + retail : '',
    'PAGE GUIDES (what each screen is for):',
    guides,
  ].filter(Boolean).join('\n');
}

/** Live facts from the Retail Store, AI Attendance and the other suites. */
export async function suiteFacts(can: (m: string) => boolean): Promise<string[]> {
  const out: string[] = [];
  const wantProd = can('production') || can('scheduling') || can('machine-log');
  const [retail, companies, tasks, plans, tickets, maps, att] = await Promise.all([
    withTimeout(rows('retail_store_orders', 'ordered_at', 500)),
    withTimeout(rows('companies', 'company_name', 500)),
    wantProd ? withTimeout(rows('cnc_scheduled_tasks', 'task_date', 300)) : Promise.resolve(null),
    wantProd ? withTimeout(rows('cnc_operation_plans', 'plan_date', 400)) : Promise.resolve(null),
    withTimeout(rows('support_tickets', 'created_at', 200)),
    withTimeout(rows('mind_maps', 'updated_at', 100)),
    withTimeout(attendance(), 8000),
  ]);

  if (retail && retail.length) {
    const total = retail.reduce((a, r) => a + num(r.total), 0);
    const ym = new Date().toISOString().slice(0, 7);
    const month = retail.filter((r) => day(r.ordered_at).startsWith(ym));
    out.push(`RETAIL STORE ORDERS (${retail.length} orders worth ${money(total)}; this month ${month.length} worth ${money(month.reduce((a, r) => a + num(r.total), 0))}): Statuses: ${countBy(retail, (r) => str(r.status))}. By partner type: ${countBy(retail, (r) => str(r.partner_role) || 'direct')}. Top customers: ${countBy(retail, (r) => str(r.customer_company) || str(r.customer))}. Placed by: ${countBy(retail, (r) => str(r.placed_by), 6)}.`
      + ` Latest: ${retail.slice(0, 12).map((r) => `${str(r.order_no)} ${str(r.customer_company) || str(r.customer)} ${money(num(r.total))} ${day(r.ordered_at)} [${str(r.status)}]${str(r.invoice_no) ? ` inv ${str(r.invoice_no)}` : ''}`).join('; ')}.`);
  }
  const partners = (companies ?? []).filter((c) => c.partner_of);
  if (partners.length) {
    const nameOf = new Map((companies ?? []).map((c) => [String(c.id), str(c.company_name)]));
    out.push(`RETAIL SALES PARTNERS (${partners.length}; each has its own BI company and sells from the main company's Retail Store): ${partners.slice(0, 80).map((p) => `${str(p.company_name)} — ${str(p.partner_type)} partner of ${nameOf.get(String(p.partner_of)) || '?'}${p.partner_parent_id ? `, under ${nameOf.get(String(p.partner_parent_id)) || '?'}` : ''}${str(p.code) ? `, GST ${str(p.code)}` : ''}`).join('; ')}.`);
  }
  if (att) out.push(...att);
  if (tasks && tasks.length) {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = tasks.filter((t) => str(t.task_date) >= today).sort((a, b) => str(a.task_date).localeCompare(str(b.task_date)));
    out.push(`SCHEDULED TASKS FOR PEOPLE (${tasks.length}; planned vs done): By status: ${countBy(tasks, (t) => `${str(t.mode)}/${str(t.status)}`)}. By person: ${countBy(tasks, (t) => str(t.member_name))}. Coming up: ${upcoming.slice(0, 12).map((t) => `${str(t.task_date)} ${str(t.start_time).slice(0, 5)}-${str(t.end_time).slice(0, 5)} ${str(t.task_name)} (${str(t.member_name) || 'no one'})`).join('; ')}.`);
  }
  if (plans && plans.length) {
    out.push(`MACHINE OPERATION PLANS (${plans.length} planned slots): By machine: ${countBy(plans, (p) => str(p.machine))}. By operator: ${countBy(plans, (p) => str(p.operator))}. Latest: ${plans.slice(0, 10).map((p) => `${day(p.plan_date)} ${str(p.start_time).slice(0, 5)}-${str(p.end_time).slice(0, 5)} ${str(p.process_name)} on ${str(p.machine)}${str(p.operator) ? ` by ${str(p.operator)}` : ''}${p.quantity != null ? ` qty ${num(p.quantity)}` : ''}`).join('; ')}.`);
  }
  if (tickets && tickets.length) {
    out.push(`SUPPORT TICKETS (${tickets.length}): Statuses: ${countBy(tickets, (t) => str(t.status))}. Latest: ${tickets.slice(0, 8).map((t) => `${str(t.ticket_no) || str(t.id).slice(0, 8)} ${str(t.subject) || str(t.title)} [${str(t.status)}]`).join('; ')}.`);
  }
  if (maps && maps.length) {
    out.push(`MIND MAPS (${maps.length}): ${maps.slice(0, 20).map((m) => `${str(m.title)}${str(m.status) ? ` [${str(m.status)}]` : ''}`).join('; ')}.`);
  }
  return out;
}

async function attendance(): Promise<string[] | null> {
  const [recs, emps, leaves] = await Promise.all([
    rows('bi_attendance_records', 'log_date', 100),
    rows('bi_attendance_employees', 'first_name', 100),
    rows('bi_attendance_leaves', 'created_at', 50),
  ]);
  const out: string[] = [];
  if (recs && recs.length) {
    const today = new Date().toISOString().slice(0, 10);
    const todayRecs = recs.filter((r) => str(r.log_date) === today);
    const present = todayRecs.filter((r) => str(r.status) === 'PRESENT' || str(r.status) === 'LATE').length;
    out.push(`AI ATTENDANCE TODAY (${today}): ${present} present of ${todayRecs.length} recorded.`);
  }
  if (emps && emps.length) {
    out.push(`ATTENDANCE EMPLOYEES (${emps.length}): By department: ${countBy(emps, (e) => str(e.department))}.`);
  }
  if (leaves && leaves.length) {
    out.push(`LEAVE REQUESTS (${leaves.length}): By status: ${countBy(leaves, (l) => str(l.status))}.`);
  }
  return out.length ? out : null;
}
