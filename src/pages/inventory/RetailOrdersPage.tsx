import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';

// Orders customers placed in the Retail Store: who ordered, contact, address and the items. The Retail Store sends each order here
// when it is placed and again whenever its status changes.

interface Line { name: string; sku?: string; qty: number; uom?: string; price: number }
interface RetailOrder {
  id: string; order_no: string; customer: string; contact: string | null; customer_company: string | null; mobile: string | null;
  city: string | null; address: string | null; po_ref: string | null; items: Line[]; total: number; status: string;
  placed_by: string | null; partner_role: string | null; invoice_no: string | null; ordered_at: string;
}

const money = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const STATUS_STYLE: Record<string, string> = {
  Pending: 'bg-amber-500/15 text-amber-300', Confirmed: 'bg-sky-500/15 text-sky-300', Dispatched: 'bg-violet-500/15 text-violet-300',
  Delivered: 'bg-emerald-500/15 text-emerald-300', Cancelled: 'bg-rose-500/15 text-rose-300',
};

export function RetailOrdersPage() {
  const { company } = useAuth();
  const [orders, setOrders] = useState<RetailOrder[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await supabase.from('retail_store_orders').select('*').order('ordered_at', { ascending: false }).limit(500);
    if (r.error) {
      setNote(/retail_store_orders/.test(r.error.message) ? 'Retail orders are not set up yet. Run the migration 20261110000000_retail_store_orders.sql in Supabase.' : r.error.message);
      setOrders([]); return;
    }
    setNote(null); setOrders((r.data as RetailOrder[]) ?? []);
  }, []);
  useEffect(() => { void load(); }, [load, company?.id]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (orders ?? []).filter(o => (status === 'all' || o.status === status)
      && (!t || [o.order_no, o.customer, o.contact, o.customer_company, o.mobile, o.city, o.address, o.po_ref, ...o.items.map(i => i.name + ' ' + (i.sku ?? ''))].join(' ').toLowerCase().includes(t)));
  }, [orders, q, status]);

  return (
    <div className="space-y-4">
      <PageHeader title="Retail Orders" subtitle="Orders placed in the Retail Store, with who ordered and where to deliver." />
      {note && <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{note}</div>}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative" style={{ width: 300 }}>
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search order, customer, mobile, product…" className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white" />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)} className="py-2 px-3 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white" style={{ width: 160 }}>
          <option value="all">All statuses</option>
          {Object.keys(STATUS_STYLE).map(s => <option key={s}>{s}</option>)}
        </select>
        <button type="button" onClick={() => void load()} className="py-2 px-3 rounded-lg bg-slate-700 text-sm text-white hover:bg-slate-600">Refresh</button>
      </div>
      {orders === null ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : list.length === 0 ? (
        <div className="text-center text-slate-400 text-sm py-12">No Retail orders yet.</div>
      ) : (
        <div className="rounded-xl border border-slate-700 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-800 text-slate-300 text-xs uppercase">
              <tr><th className="px-3 py-2">Order</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Mobile</th><th className="px-3 py-2">Items</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">Status</th></tr>
            </thead>
            <tbody>
              {list.map(o => (
                <Fragment key={o.id}>
                  <tr onClick={() => setOpen(open === o.id ? null : o.id)} className="border-t border-slate-800 hover:bg-slate-800/60 cursor-pointer text-slate-200">
                    <td className="px-3 py-2 font-semibold">{o.order_no}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(o.ordered_at).toLocaleDateString('en-IN')}</td>
                    <td className="px-3 py-2">{o.customer}{o.customer_company ? <div className="text-xs text-slate-400">{o.customer_company}</div> : null}</td>
                    <td className="px-3 py-2">{o.mobile}</td>
                    <td className="px-3 py-2">{o.items.length} item{o.items.length === 1 ? '' : 's'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(o.total)}</td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[o.status] ?? 'bg-slate-600/30 text-slate-200'}`}>{o.status}</span></td>
                  </tr>
                  {open === o.id && (
                    <tr key={o.id + 'd'} className="bg-slate-900/60 text-slate-300">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="space-y-0.5">
                            <div className="text-xs uppercase text-slate-400 font-bold mb-1">Ordered by</div>
                            <div><b>{o.customer}</b>{o.contact && o.contact !== o.customer ? ` (contact: ${o.contact})` : ''}</div>
                            {o.customer_company && <div>{o.customer_company}</div>}
                            <div>Mobile: {o.mobile || '—'}</div>
                            <div>Address: {o.address || '—'}{o.city ? ', ' + o.city : ''}</div>
                            {o.po_ref && <div>PO reference: {o.po_ref}</div>}
                            {o.invoice_no && <div>Invoice: {o.invoice_no}</div>}
                            {o.placed_by && <div className="text-xs text-slate-400 pt-1">Placed by {o.placed_by}{o.partner_role ? ` (${o.partner_role.replace(/_/g, ' ')})` : ''}</div>}
                          </div>
                          <div>
                            <div className="text-xs uppercase text-slate-400 font-bold mb-1">Items</div>
                            {o.items.map((i, k) => (
                              <div key={k} className="flex justify-between gap-3"><span>{i.name}{i.sku ? <span className="text-slate-500"> · {i.sku}</span> : null}</span><span className="tabular-nums whitespace-nowrap">{i.qty} {i.uom ?? ''} × {money(i.price)}</span></div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
