import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Card';

/** Neutral context strip (type / unique number / products / customer), shared
 *  by quotation view and edit modes so both look the same. */
export function StageStrip({ typeLabel, uniqueNo, products, customer }: {
  typeLabel: string; uniqueNo: string; products: string[]; customer: string;
}) {
  return (
    <div className="w-full rounded-xl border-2 border-brand-300 bg-brand-50 px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <div>
        <span className="block text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-0.5">Document</span>
        <span className="text-sm font-extrabold text-slate-900">{typeLabel}</span>
      </div>
      <div>
        <span className="block text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-0.5">Unique Number</span>
        <span className="text-sm font-extrabold text-slate-900">{uniqueNo || '—'}</span>
      </div>
      <div>
        <span className="block text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-0.5">Products ({products.length})</span>
        <span className="text-sm font-extrabold text-slate-900 break-words">{products.length ? products.join(', ') : '—'}</span>
      </div>
      <div>
        <span className="block text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-0.5">Customer</span>
        <span className="text-sm font-extrabold text-slate-900 break-words">{customer || '—'}</span>
      </div>
    </div>
  );
}

/** Sales-order line items: parsed `items` array, falling back to the header part name. */
export function soProductItems(order: any): any[] {
  try {
    const r = order?.items;
    const parsed = typeof r === 'string' ? JSON.parse(r) : r;
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch { /* fall through to part_name */ }
  const single = String(order?.part_name || '').trim().replace(/(\s*\(?\d+\s*products?\)?\s*)+$/i, '').trim();
  if (single && !/^multiple\s*products?/i.test(single)) {
    return [{ partName: single, quantity: order?.quantity ?? '', status: order?.status || '' }];
  }
  return [];
}

export function soProductNames(order: any, qtyTracking?: any): string[] {
  const fromTrack = Array.isArray(qtyTracking?.products)
    ? qtyTracking.products.map((p: any) => String(p?.name || '').trim()).filter(Boolean)
    : [];
  if (fromTrack.length) return Array.from(new Set(fromTrack));
  const names = soProductItems(order)
    .map((it: any) => String(it.partName || it.productName || it.part_name || it.description || '').trim())
    .filter(Boolean);
  return Array.from(new Set(names));
}

/** Sales Order view/edit box: customer + date on the first line, then one block
 *  per product (name, qty, rej qty, status). Each product carries its own
 *  status; the order status follows the products when they agree. Rej qty
 *  combines live quantity reconciliation (`qtyTracking`) with manual entries. */
export function SalesOrderSection({ order, qtyTracking, editMode, saveRef, onSaved, onInlineEdit }: {
  order: any; qtyTracking?: any; editMode: boolean;
  saveRef?: { current: (() => Promise<boolean>) | null };
  onSaved: () => void; onInlineEdit: (field: string, value: string) => void;
}) {
  const norm = (s: any) => String(s ?? '').trim().toLowerCase();
  const trackBy = new Map<string, any>();
  (Array.isArray(qtyTracking?.products) ? qtyTracking.products : []).forEach((p: any) => {
    if (p?.name) trackBy.set(norm(p.name), p);
  });
  const baseItems = soProductItems(order);
  const [customer, setCustomer] = useState(String(order?.customer || order?.customer_name || ''));
  const [orderDate, setOrderDate] = useState(String(order?.order_date || '').slice(0, 10));
  const [items, setItems] = useState<any[]>(baseItems.map((it: any) => ({
    partName: String(it.partName || it.productName || it.part_name || it.description || ''),
    quantity: it.quantity ?? it.qty ?? '',
    rejectedQty: it.rejectedQty ?? it.rejected_qty ?? it.rejected ?? '',
    itemStatus: it.status || '',
  })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const prodOf = (name: string) => trackBy.get(norm(name));

  // Scalar fields not covered above (kept visible so nothing disappears).
  // Internal id references (company_id, sales_order_id, …) stay hidden.
  const skipKeys = new Set(['id', 'items', 'customer', 'customer_name', 'customer_id', 'company_id', 'order_date', 'status',
    'part_name', 'quantity', 'value', 'total_value', 'lead_no', 'order_no', 'quote_no', 'quotation_id',
    'enquiry_no', 'created_at', 'updated_at', 'delivered', 'contact_person', 'phone', 'email',
    'part_no', 'part_number', 'partNo', 'partNumber', 'payment_terms']);
  // Delivery date stays editable even when empty so it can always be set.
  const extraEntries = Object.entries(order || {}).filter(([k, v]) => {
    if (skipKeys.has(k) || k.startsWith('_') || /_ids?$/.test(k)) return false;
    if (v === null || v === '' || typeof v === 'object') return editMode && k === 'delivery_date';
    return true;
  });
  const isDateKey = (k: string) => k === 'date' || /_date$/.test(k);

  const save = async (): Promise<boolean> => {
    const entered = items
      .map((it: any) => ({ ...it, partName: String(it.partName || '').trim() }))
      .filter((it: any) => it.partName);
    if (!customer.trim()) { setError('Enter the customer.'); return false; }
    if (!entered.length) { setError('Enter at least one product.'); return false; }
    if (entered.some((it: any) => Number(it.quantity) < 0)) { setError('Product quantities cannot be negative.'); return false; }
    if (entered.some((it: any) => Number(it.rejectedQty) < 0)) { setError('Rejected quantities cannot be negative.'); return false; }
    if (saving) return false;
    setSaving(true);
    setError('');
    try {
      const prevItems = soProductItems(order);
      const saved = entered.map((it: any, idx: number) => {
        const prev = prevItems[idx] && typeof prevItems[idx] === 'object' ? prevItems[idx] : {};
        return {
          ...prev,
          partName: it.partName,
          quantity: it.quantity === '' ? '0' : it.quantity,
          rejectedQty: it.rejectedQty === '' ? 0 : Number(it.rejectedQty) || 0,
          status: it.itemStatus || (prev as any).status || order?.status || 'Confirmed',
        };
      });
      const totalQty = saved.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0);
      const names = saved.map((i: any) => i.partName);
      // Order status follows the products when they agree, else stays as-is.
      const prodStatuses = Array.from(new Set(saved.map((i: any) => String(i.status || '').trim()).filter(Boolean)));
      let totalVal: number | null = null;
      if (saved.some((i: any) => Number(i.unitPrice))) {
        totalVal = saved.reduce((s: number, i: any) => {
          const q = Number(i.quantity) || 0; const p = Number(i.unitPrice) || 0;
          const d = Number(i.discount) || 0; const ud = Number(i.unitDiscount) || 0; const g = Number(i.gst) || 0;
          return s + q * Math.max(0, p * (1 - d / 100) - ud) * (1 + g / 100);
        }, 0);
      }
      const payload: any = {
        customer: customer.trim(),
        order_date: orderDate || null,
        status: prodStatuses.length === 1 ? prodStatuses[0] : (order?.status || 'Confirmed'),
        items: saved,
        quantity: totalQty,
        part_name: saved.length > 1 ? `${names.join(', ')} (${saved.length} Products)` : saved[0].partName,
      };
      if (totalVal !== null) {
        payload.total_value = Number(totalVal.toFixed(2));
        payload.value = payload.total_value;
      }
      const { error: updErr } = await supabase.from('cnc_sales_orders').update(payload).eq('id', order.id);
      if (updErr) throw updErr;
      onSaved();
      return true;
    } catch (e: any) {
      setError('Unable to save changes: ' + (e?.message ?? e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  // The footer "Done Editing" button triggers this save; no separate button here.
  useEffect(() => {
    if (saveRef) saveRef.current = save;
    return () => { if (saveRef && saveRef.current === save) saveRef.current = null; };
  });

  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
        <div>
          <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Customer</span>
          {editMode ? (
            <input className="w-full text-sm font-medium text-slate-800 border border-slate-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-brand-500"
              value={customer} onChange={(e) => setCustomer(e.target.value)} />
          ) : (
            <span className="text-sm text-slate-800 font-medium break-words">{customer || '—'}</span>
          )}
        </div>
        <div>
          <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Order Date</span>
          {editMode ? (
            <input type="date" className="w-full text-sm font-medium text-slate-800 border border-slate-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-brand-500"
              value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          ) : (
            <span className="text-sm text-slate-800 font-medium break-words">{orderDate || '—'}</span>
          )}
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {(editMode ? items : baseItems).length > 0 && (
          <div className="grid grid-cols-[2rem_minmax(0,1fr)_7rem_7rem_10rem] gap-2 items-center px-1">
            <span></span>
            <span className="text-[10px] font-bold text-slate-500 uppercase">Product Name</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase">Qty</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase">Rej Qty</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase">Status</span>
          </div>
        )}
        {(editMode ? items : baseItems).map((it: any, idx: number) => {
          const name = editMode
            ? String(it.partName || '')
            : String(it.partName || it.productName || it.part_name || it.description || '').trim() || '—';
          const qty = editMode ? it.quantity : (it.quantity ?? it.qty ?? '—');
          const rej = prodOf(name)?.rejected ?? 0;
          return (
            <div key={idx} className="rounded-lg border border-slate-200 bg-white px-2 py-2">
              <div className="grid grid-cols-[2rem_minmax(0,1fr)_7rem_7rem_10rem] gap-2 items-center">
                <span className="text-[11px] font-bold text-slate-400 text-center">{idx + 1}</span>
                <div>
                  {editMode ? (
                    <input className="w-full text-sm font-medium text-slate-800 border border-slate-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-brand-500"
                      placeholder="Product name" value={it.partName || ''}
                      onChange={(e) => setItems((list) => list.map((r, i) => (i === idx ? { ...r, partName: e.target.value } : r)))} />
                  ) : (
                    <span className="text-sm text-slate-800 font-medium break-words">{name}</span>
                  )}
                </div>
                <div>
                  {editMode ? (
                    <input type="number" min={0} className="w-full text-sm font-medium tabular-nums text-slate-800 border border-slate-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-brand-500"
                      value={it.quantity ?? ''} placeholder="0"
                      onChange={(e) => setItems((list) => list.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))} />
                  ) : (
                    <span className="text-sm text-slate-800 font-medium tabular-nums">{qty === '' ? '—' : String(qty)}</span>
                  )}
                </div>
                <div>
                  {editMode ? (
                    <input type="number" min={0} className="w-full text-sm font-medium tabular-nums text-slate-800 border border-slate-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-brand-500"
                      value={it.rejectedQty ?? ''} placeholder="0"
                      onChange={(e) => setItems((list) => list.map((r, i) => (i === idx ? { ...r, rejectedQty: e.target.value } : r)))} />
                  ) : (
                    <span className="text-sm text-slate-800 font-medium tabular-nums">{rej}</span>
                  )}
                </div>
                <div>
                  {editMode ? (
                    <select className="w-full text-sm font-medium text-slate-800 border border-slate-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-brand-500"
                      value={it.itemStatus || it.status || order?.status || 'Confirmed'}
                      onChange={(e) => setItems((list) => list.map((r, i) => (i === idx ? { ...r, itemStatus: e.target.value } : r)))}>
                      {Array.from(new Set(['Draft', 'Confirmed', 'Waiting for Parts', 'In Production', 'Inwarded', 'Unavailable', it.itemStatus, it.status, order?.status].filter(Boolean))).map((s: string) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-sm text-slate-800 font-medium break-words">{String(it.status || order?.status || '—')}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!(editMode ? items : baseItems).length && (
          <p className="text-xs text-slate-500 italic">No products on this sales order yet.</p>
        )}
      </div>
      {editMode && (
        <button onClick={() => setItems((list) => [...list, { partName: '', quantity: '', rejectedQty: '', itemStatus: '' }])}
          className="mt-2 text-sm text-brand-600 font-semibold hover:text-brand-700 flex items-center gap-1">
          <span className="text-lg">+</span> Add Another Product
        </button>
      )}
      {extraEntries.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 bg-slate-50 p-4 rounded-lg border border-slate-100 mt-3">
          {extraEntries.map(([key, value]) => (
            <div key={key}>
              <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                {key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
              </span>
              {editMode ? (
                <input type={isDateKey(key) ? 'date' : 'text'} className="w-full text-sm font-medium text-slate-800 border border-slate-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-brand-500"
                  defaultValue={isDateKey(key) ? String(value ?? '').slice(0, 10) : String(value ?? '')}
                  onBlur={(e) => { const cur = isDateKey(key) ? String(value ?? '').slice(0, 10) : String(value ?? ''); if (e.target.value !== cur) onInlineEdit(key, e.target.value); }} />
              ) : (
                <span className="text-sm text-slate-800 font-medium break-words">{String(value)}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {editMode && error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>
      )}
    </div>
  );
}
