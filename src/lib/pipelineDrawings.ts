// Drawings and part files uploaded in the Sales Pipeline (enquiry products, sales-order products, inward attachments)
// plus the versions uploaded later on the Parts & Drawings page, gathered per company + product and numbered V1, V2 ...
// in the order they arrived. Pure functions: the page does the fetching.

import { itemFilePaths } from './filePaths';

export type DrawingSource = 'Enquiry' | 'Sales Order' | 'Inward' | 'Upload';

export interface DrawingFile {
  key: string;
  company: string;
  product: string;
  path: string;
  name: string;
  source: DrawingSource;
  /** Enquiry / order / inward number, or the person's note for an upload. */
  ref: string;
  date: string;
  by?: string;
  notes?: string;
}
export interface ProductDrawings {
  key: string;
  company: string;
  product: string;
  /** Every order for this product is finished (delivered): it belongs under Finished Goods, not on the working list. */
  finished: boolean;
  /** Where the product came from: sales order and / or inward numbers. */
  refs: string[];
  files: (DrawingFile & { version: number })[];
}
export interface ProductRef { key: string; company: string; product: string; finished: boolean; ref: string }

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const parseJson = (v: unknown): unknown[] => {
  try { const p = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(p) ? p : []; } catch { return []; }
};
const itemName = (it: Record<string, unknown>) => String(it.productName || it.partName || it.part_name || it.description || '').trim();

type Row = Record<string, unknown>;

/** Stored names carry a random id in front (uuid-name.dwg); people should see just name.dwg. */
const cleanName = (n: string) => n.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '');

export function collectDrawings(enquiries: Row[], orders: Row[], inwards: Row[], uploads: Row[]): DrawingFile[] {
  const out: DrawingFile[] = [];
  for (const e of enquiries) {
    for (const it of parseJson(e.enquiring_for) as Row[]) {
      const product = itemName(it);
      for (const f of itemFilePaths(it as { filePaths?: unknown })) {
        out.push({ key: `enq:${f.path}`, company: String(e.customer ?? ''), product: product || String(e.part_name ?? ''), path: f.path, name: cleanName(f.name), source: 'Enquiry', ref: String(e.lead_no ?? e.enquiry_no ?? ''), date: String(e.created_at ?? '') });
      }
    }
  }
  for (const o of orders) {
    for (const it of parseJson(o.items) as Row[]) {
      const product = itemName(it);
      for (const f of itemFilePaths(it as { filePaths?: unknown })) {
        out.push({ key: `so:${f.path}`, company: String(o.customer ?? ''), product, path: f.path, name: cleanName(f.name), source: 'Sales Order', ref: String(o.order_no ?? ''), date: String(o.created_at ?? '') });
      }
    }
  }
  for (const r of inwards) {
    const atts = Array.isArray(r.attachments) ? (r.attachments as unknown[]) : parseJson(r.attachments);
    for (const f of itemFilePaths({ filePaths: atts })) {
      out.push({ key: `inw:${f.path}`, company: String(r.party_name ?? ''), product: String(r.product_name || r.part_name || ''), path: f.path, name: cleanName(f.name), source: 'Inward', ref: String(r.inward_no ?? ''), date: String(r.created_at ?? r.inward_date ?? '') });
    }
  }
  for (const u of uploads) {
    out.push({
      key: `up:${String(u.id ?? u.file_path)}`, company: String(u.party_name ?? ''), product: String(u.product_name ?? ''), path: String(u.file_path ?? ''),
      name: String(u.file_name ?? ''), source: 'Upload', ref: String(u.notes ?? ''), date: String(u.created_at ?? ''), by: u.uploaded_by ? String(u.uploaded_by) : undefined, notes: u.notes ? String(u.notes) : undefined,
    });
  }
  return out.filter(f => f.path && f.product.trim());
}

const PURCHASE_CATEGORIES = new Set(['GOODS PURCHASE', 'SERVICE PURCHASE', 'EXPENSES']);
const compact = (s: string) => norm(s).replace(/[^a-z0-9]/g, '');
const productKey = (company: string, product: string) => `${norm(company)}|${compact(product)}`;

const editDistance = (a: string, b: string) => {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
};
/** The same product is often typed slightly differently on the order and on the inward (spacing, a slipped letter).
 *  Names of one company whose digits match and whose letters differ by at most two characters are one product. */
function productResolver() {
  const reps: { company: string; digits: string; letters: string; key: string }[] = [];
  return (company: string, product: string) => {
    const c = norm(company); const flat = compact(product);
    const digits = flat.replace(/[^0-9]/g, ''); const letters = flat.replace(/[0-9]/g, '');
    const hit = reps.find(r => r.company === c && r.digits === digits && (r.letters === letters || (letters.length >= 6 && Math.abs(r.letters.length - letters.length) <= 2 && editDistance(r.letters, letters) <= 2)));
    if (hit) return hit.key;
    const key = `${c}|${flat}`;
    reps.push({ company: c, digits, letters, key });
    return key;
  };
}

/** The products that exist in the pipeline: the lines of every sales order and the product of every inward (material
 *  bought from a supplier is not a product with a drawing). A sales order that has been delivered counts as finished. */
export function collectProducts(orders: Row[], inwards: Row[]): ProductRef[] {
  const out: ProductRef[] = [];
  for (const o of orders) {
    const finished = ['Delivered', 'Completed', 'Cancelled'].includes(String(o.status ?? ''));
    for (const it of parseJson(o.items) as Row[]) {
      const product = itemName(it);
      if (product) out.push({ key: productKey(String(o.customer ?? ''), product), company: String(o.customer ?? '').trim(), product, finished, ref: String(o.order_no ?? '') });
    }
  }
  for (const r of inwards) {
    if (PURCHASE_CATEGORIES.has(String(r.category ?? '').trim().toUpperCase())) continue;
    const product = String(r.product_name || r.part_name || '').trim();
    if (product) out.push({ key: productKey(String(r.party_name ?? ''), product), company: String(r.party_name ?? '').trim(), product, finished: false, ref: String(r.inward_no ?? '') });
  }
  return out;
}

/** One entry per product in the pipeline (even with no drawing yet), with its files numbered V1, V2 ... by arrival order.
 *  A product is finished only when every order that has it is delivered. Files of products that are not in the pipeline are
 *  ignored, except uploads made on the Parts & Drawings page, which create their own product. The same stored file counts once. */
export function groupVersions(files: DrawingFile[], products: ProductRef[]): ProductDrawings[] {
  const groups = new Map<string, { key: string; company: string; product: string; finished: boolean; refs: Set<string>; raw: DrawingFile[] }>();
  const keyOf = productResolver();
  for (const p of products) {
    const pk = keyOf(p.company, p.product);
    const g = groups.get(pk) ?? { key: pk, company: p.company, product: p.product, finished: true, refs: new Set<string>(), raw: [] };
    g.finished = g.finished && p.finished;
    if (p.ref) g.refs.add(p.ref);
    groups.set(pk, g);
  }
  const seen = new Set<string>();
  for (const f of [...files].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key))) {
    if (seen.has(f.path)) continue;
    const key = keyOf(f.company, f.product);
    let g = groups.get(key);
    if (!g) {
      if (f.source !== 'Upload') continue;
      g = { key, company: f.company.trim(), product: f.product.trim(), finished: false, refs: new Set<string>(), raw: [] };
      groups.set(key, g);
    }
    seen.add(f.path);
    g.raw.push(f);
  }
  return Array.from(groups.values())
    .map(g => ({ key: g.key, company: g.company, product: g.product, finished: g.finished, refs: Array.from(g.refs), files: g.raw.map((f, i) => ({ ...f, version: i + 1 })) }))
    .sort((a, b) => a.company.localeCompare(b.company, undefined, { sensitivity: 'base' }) || a.product.localeCompare(b.product, undefined, { sensitivity: 'base' }));
}

/** Every file, grouped by company + product (the "folder"), numbered V1, V2 ... by arrival order, whether or not the product is on an order. */
export function groupAll(files: DrawingFile[]): ProductDrawings[] {
  const refs: ProductRef[] = files.map(f => ({ key: productKey(f.company, f.product), company: f.company.trim(), product: f.product.trim(), finished: false, ref: '' }));
  return groupVersions(files.map(f => ({ ...f, source: f.source })), refs);
}
