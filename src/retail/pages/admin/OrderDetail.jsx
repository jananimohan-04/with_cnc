/* Order detail — mirrors legacy orderDetail. Reused by super orders via the back prop. */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Receipt, Printer, ArrowLeft, Building2, Clock, 
  CheckCircle2, RefreshCw, AlertCircle, Package, ShieldCheck 
} from 'lucide-react';
import { api, fmt, imgFallback } from '../../api';
import { statusBadge, Empty, Skeleton, toast } from '../../components/ui';

const FLOW = ['Pending', 'Confirmed', 'Processing', 'Ready for Dispatch', 'Shipped', 'Delivered', 'Cancelled'];

export default function OrderDetail({ back = '/admin/orders' }) {
  const { id } = useParams();
  const [o, setO] = useState(null);
  const [prods, setProds] = useState([]);
  const [err, setErr] = useState('');
  const [st, setSt] = useState('');
  const [busy, setBusy] = useState(false);
  const [updErr, setUpdErr] = useState('');

  function load() {
    api.get('/api/orders/' + id)
      .then((d) => { setO(d); setSt(d.status); setErr(''); })
      .catch((e) => setErr(e.message));
    api.get('/api/products')
      .then((d) => setProds(Array.isArray(d) ? d : (d.rows || [])))
      .catch(() => {});
  }

  useEffect(load, [id]);

  if (err && !o) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-8 text-center max-w-lg mx-auto">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <h3 className="font-bold text-slate-900 mb-1">Order #{id} Not Found</h3>
        <p className="text-xs text-slate-500 mb-4">{err}</p>
        <Link to={back} className="text-xs font-bold text-blue-600 hover:underline">
          Return to Orders List
        </Link>
      </div>
    );
  }

  if (!o) return <Skeleton h={320} />;

  const byId = {};
  prods.forEach((p) => { byId[p.id] = p; });
  const items = (o.items || []).map((i) => ({ 
    ...i, 
    p: byId[i.pid] || { name: i.pid, sku: i.pid, uom: 'Pc', images: [] } 
  }));
  const totalUnits = items.reduce((a, i) => a + (i.qty || 0), 0);

  function update() {
    setBusy(true);
    setUpdErr('');
    api.patch('/api/orders/' + o.id + '/status', { status: st })
      .then((d) => { 
        setO(d); 
        setSt(d.status); 
        toast(o.id + ' status updated to ' + d.status, '🧾'); 
      })
      .catch((e) => { 
        setUpdErr(e.message || 'Update failed'); 
        toast(e.message, '⚠️'); 
      })
      .finally(() => setBusy(false));
  }

  return (
    <div className="space-y-6 w-full">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-slate-200">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight font-mono">
            {o.id}
          </h1>
          {statusBadge(o.status)}
          {o.poRef && (
            <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold border border-slate-200">
              PO: {o.poRef}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button 
            type="button" 
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" /> Print Summary
          </button>
          <Link 
            to={back}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Line Items */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" /> Requisition Line Items ({totalUnits} Units)
              </h2>
              <span className="text-xs text-slate-400">{items.length} SKU(s)</span>
            </div>

            <div className="divide-y divide-slate-100">
              {items.map((i, ix) => (
                <div key={ix} className="py-4 flex items-center gap-4">
                  <img 
                    src={(i.p.images || [])[0] || ''} 
                    alt="" 
                    onError={(e) => { e.currentTarget.src = imgFallback(i.pid, 200, 200); }} 
                    className="w-16 h-16 rounded-xl object-cover border border-slate-200 bg-slate-50 flex-shrink-0" 
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 text-sm truncate">{i.p.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      SKU: <span className="font-mono text-slate-700 font-semibold">{i.p.sku || i.pid}</span>
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      Qty: <b className="text-slate-900">{i.qty} {i.p.uom || 'Pc'}</b> × {fmt(i.price)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-slate-900 text-sm font-mono">{fmt(i.qty * i.price)}</div>
                    <span className="text-[10px] text-slate-400">Excl. GST</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Subtotal Calculation */}
            <div className="border-t border-dashed border-slate-200 pt-4 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-bold text-slate-900 font-mono">{fmt(o.total)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>GST</span>
                <span className="text-slate-500">As per tax invoice</span>
              </div>
              <div className="border-t border-slate-200 pt-3 flex justify-between items-baseline">
                <span className="font-black text-slate-900 text-sm">Total Value</span>
                <span className="font-black text-blue-600 text-xl font-mono">{fmt(o.total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Status Admin & Customer Information */}
        <div className="space-y-6">
          {/* Status Update Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
            <h3 className="font-bold text-slate-900 text-sm pb-3 border-b border-slate-100 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-blue-600" /> Lifecycle Status Transition
            </h3>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">Update Current Status</label>
              <select 
                value={st} 
                onChange={(e) => setSt(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl outline-hidden"
              >
                {FLOW.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {updErr && (
              <p className="text-xs text-red-600 font-semibold bg-red-50 p-2.5 rounded-lg border border-red-200/60">
                ⚠️ {updErr}
              </p>
            )}

            <button 
              type="button" 
              disabled={busy} 
              onClick={update}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-sm cursor-pointer"
            >
              {busy ? 'Updating Status…' : 'Apply Transition'}
            </button>
          </div>

          {/* Customer & Location */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-3 text-xs">
            <h3 className="font-bold text-slate-900 text-sm pb-2 border-b border-slate-100 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-600" /> Customer & Dispatch
            </h3>

            <div>
              <span className="text-[11px] text-slate-400 block font-semibold uppercase tracking-wider">Company</span>
              <span className="font-bold text-slate-900">{o.companyName || o.customer}</span>
            </div>

            <div>
              <span className="text-[11px] text-slate-400 block font-semibold uppercase tracking-wider">Contact Person</span>
              <span className="text-slate-700 font-semibold">{o.contact || o.customer}</span>
              {o.mobile && <span className="text-slate-500 block">{o.mobile}</span>}
            </div>

            <div>
              <span className="text-[11px] text-slate-400 block font-semibold uppercase tracking-wider">Address</span>
              <p className="text-slate-600 mt-0.5">{o.address || o.city}</p>
            </div>
          </div>

          {/* Status History */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-3">
            <h3 className="font-bold text-slate-900 text-sm pb-2 border-b border-slate-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" /> Status Audit Trail
            </h3>

            <div className="space-y-3 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {(o.history || [[o.status, o.date]]).map((h, ix) => (
                <div key={ix} className="flex items-start gap-3 relative pl-6">
                  <span className="absolute left-1 top-1 w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-white -translate-x-1/2" />
                  <div className="flex-1">
                    <span className="font-bold text-xs text-slate-900 block">{h[0]}</span>
                    <span className="text-[11px] text-slate-400 font-mono">{h[1]}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
