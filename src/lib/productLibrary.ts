// Product & pricing library for quotations. Stored in this browser, per company (there is no
// quotation table in the database yet), so every function tolerates missing / blocked storage.

export const PRODUCT_UNITS = ['PCS', 'NOS', 'KG', 'SET', 'MTR', 'FT', 'SQ.FT', 'LTR', 'LOT', 'HRS'] as const;

export interface LibraryProduct {
  id: string;
  name: string;
  hsn: string;
  unit: string;
  /** Rate per unit, in rupees (kept as the typed text so nothing is re-rounded). */
  price: string;
  qty: string;
  description: string;
  createdAt: string;
}

export type ProductDraft = Omit<LibraryProduct, 'id' | 'createdAt'>;
export type ProductSort = 'newest' | 'oldest' | 'name' | 'price-high' | 'price-low';

const key = (companyId: string | null | undefined) => `argus.products.${companyId ?? 'all'}`;

export function loadProducts(companyId: string | null | undefined): LibraryProduct[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key(companyId)) || '[]');
    return Array.isArray(raw) ? raw.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string') : [];
  } catch { return []; }
}

export function saveProducts(companyId: string | null | undefined, list: LibraryProduct[]): boolean {
  try { localStorage.setItem(key(companyId), JSON.stringify(list)); return true; } catch { return false; }
}

const num = (s: string) => { const n = Number((s ?? '').trim().replace(/,/g, '')); return s.trim() === '' ? NaN : n; };
export const priceOf = (p: Pick<LibraryProduct, 'price'>) => { const n = num(p.price); return Number.isFinite(n) ? n : 0; };

export type DraftErrors = Partial<Record<'name' | 'price' | 'qty', string>>;
export function validateDraft(d: ProductDraft, existing: LibraryProduct[], editingId?: string): DraftErrors {
  const e: DraftErrors = {};
  const name = d.name.trim();
  if (!name) e.name = 'Product name is required';
  else if (existing.some(p => p.id !== editingId && p.name.trim().toLowerCase() === name.toLowerCase() && p.hsn.trim() === d.hsn.trim()))
    e.name = 'A product with this name and HSN already exists';
  if (d.price.trim() !== '' && !(num(d.price) >= 0)) e.price = 'Enter a valid rate';
  if (!(num(d.qty) > 0)) e.qty = 'Quantity must be greater than 0';
  return e;
}

export const emptyDraft = (): ProductDraft => ({ name: '', hsn: '', unit: 'PCS', price: '', qty: '1', description: '' });

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `p${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

export function searchSort(list: LibraryProduct[], q: string, sort: ProductSort): LibraryProduct[] {
  const t = q.trim().toLowerCase();
  const out = t ? list.filter(p => [p.name, p.hsn, p.description].some(s => s.toLowerCase().includes(t))) : [...list];
  const by: Record<ProductSort, (a: LibraryProduct, b: LibraryProduct) => number> = {
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
    oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
    name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    'price-high': (a, b) => priceOf(b) - priceOf(a),
    'price-low': (a, b) => priceOf(a) - priceOf(b),
  };
  return out.sort(by[sort]);
}
