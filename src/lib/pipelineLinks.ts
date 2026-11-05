// How the records of the Sales Pipeline belong together: an enquiry becomes a quotation, a quotation a sales order, an order an
// inward, and so on. The board uses these links so that one job is never shown in two columns at once, and so that deleting a
// record never silently pulls an earlier stage back while a later stage still stands on it.
//
// A later record points back to its enquiry by id when it can (a quotation's lead_id, an inward's enquiry_id). Otherwise it only
// carries the enquiry NUMBER (an order's lead_no "1001-02Nov26-1123AM", an inward's project name). Numbers can be used again once
// an enquiry has been deleted, so a number alone is never trusted blindly: it belongs to the newest enquiry with that number that
// already existed when the later record was made. An enquiry created AFTER a record can never be the one it came from.

/** "1001-02Nov26-1123AM" -> "1001" (the order-time stamp is only a suffix on the same unique number). */
export const baseNo = (s: unknown): string => String(s ?? '').trim().replace(/-\d{2}[A-Za-z]{3}\d{2}-\d{4}(AM|PM)$/, '');
const low = (s: unknown) => String(s ?? '').trim().toLowerCase();
const ts = (v: unknown): number => { const t = Date.parse(String(v ?? '')); return Number.isFinite(t) ? t : 0; };
/** A record made a little before the enquiry's own timestamp is still allowed (clocks, rounding). */
const SLACK_MS = 120_000;

export interface LinkRows { quotes?: any[]; orders?: any[]; inwards?: any[] }
export interface Downstream { quotes: any[]; orders: any[]; inwards: any[] }

/** Which enquiry (by id) each later record stands on. */
function owners(leads: any[], { quotes = [], orders = [], inwards = [] }: LinkRows) {
  const byId = new Map<string, any>(leads.map((l) => [low(l.id), l]));
  const byBase = new Map<string, any[]>();
  for (const l of leads) {
    for (const n of new Set([low(baseNo(l.lead_no)), low(baseNo(l.enquiry_no))])) {
      if (!n) continue;
      byBase.set(n, [...(byBase.get(n) ?? []), l]);
    }
  }
  const quoteById = new Map<string, any>(quotes.map((q) => [low(q.id), q]));

  const byNumber = (nums: unknown[], madeAt: number): string | null => {
    for (const num of nums) {
      const base = low(baseNo(num));
      if (!base) continue;
      const cands = (byBase.get(base) ?? []).filter((l) => !madeAt || !ts(l.created_at) || ts(l.created_at) <= madeAt + SLACK_MS);
      if (!cands.length) continue;
      return String(cands.reduce((best, l) => (ts(l.created_at) >= ts(best.created_at) ? l : best)).id);
    }
    return null;
  };
  const resolve = (ids: unknown[], nums: unknown[], madeAt: number): string | null => {
    for (const id of ids) { const l = byId.get(low(id)); if (l) return String(l.id); }
    return byNumber(nums, madeAt);
  };
  const ownerOfQuote = (q: any) => resolve([q.lead_id], [q.lead_no, q.enquiry_no], ts(q.created_at));

  return {
    quote: ownerOfQuote,
    order: (o: any) => { const q = quoteById.get(low(o.quotation_id)); return (q ? ownerOfQuote(q) : null) ?? resolve([], [o.lead_no], ts(o.created_at)); },
    inward: (i: any) => resolve([i.enquiry_id], [i.project_name], ts(i.created_at)),
    rows: { quotes, orders, inwards },
  };
}

/** The ids of the enquiries that a quotation, order or inward still stands on. */
export function linkedLeadIds(leads: any[], rows: LinkRows): Set<string> {
  const o = owners(leads, rows);
  const out = new Set<string>();
  for (const q of o.rows.quotes) { const id = o.quote(q); if (id) out.add(low(id)); }
  for (const x of o.rows.orders) { const id = o.order(x); if (id) out.add(low(id)); }
  for (const i of o.rows.inwards) { const id = o.inward(i); if (id) out.add(low(id)); }
  return out;
}

/** The later records that belong to one enquiry (for refusing to delete it). */
export function downstreamOfLead(lead: any, leads: any[], rows: LinkRows): Downstream {
  const o = owners(leads, rows);
  const mine = (id: string | null) => !!id && low(id) === low(lead?.id);
  return {
    quotes: o.rows.quotes.filter((q) => mine(o.quote(q))),
    orders: o.rows.orders.filter((x) => mine(o.order(x))),
    inwards: o.rows.inwards.filter((i) => mine(o.inward(i))),
  };
}

const ACTIVE = ['New', 'Contacted', 'Qualified', 'Under Review'];

/**
 * The enquiries for the Enquiry column. An enquiry belongs there while nothing later stands on it. It comes back when its quotation
 * or order is deleted, but it never shows beside an inward / quotation / order that still exists for it (that was one job in two
 * columns). A NEW enquiry is never hidden by an old record that only happens to carry the same number.
 */
export function enquiryColumnLeads(leads: any[], rows: LinkRows): any[] {
  const linked = linkedLeadIds(leads ?? [], rows);
  return (leads ?? []).filter((l) => {
    const activeStatus = ACTIVE.includes(l.status) && (l.pipeline_stage === 'Enquiry' || !l.pipeline_stage);
    const movedOn = l.status === 'Quoted' || l.pipeline_stage === 'Quotation' || l.status === 'Converted';
    if (!activeStatus && !movedOn) return false;
    return !linked.has(low(l.id));
  });
}

/** The enquiry numbers that later records still carry (so a new enquiry never takes one of them). */
export function usedProjectNumbers({ quotes = [], orders = [], inwards = [] }: LinkRows): string[] {
  const out = new Set<string>();
  const add = (v: unknown) => { const b = baseNo(v); if (b) out.add(b); };
  for (const q of quotes) { add(q.lead_no); add(q.enquiry_no); }
  for (const o of orders) add(o.lead_no);
  for (const i of inwards) add(i.project_name);
  return [...out];
}
