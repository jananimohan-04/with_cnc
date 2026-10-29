/* Store order detail — mirrors legacy orderDetail (store variant): no admin status editor. */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Package, Printer, ArrowLeft, Building2, MapPin, 
  Clock, CheckCircle2, ShieldCheck, Receipt, User, Phone, FileText 
} from 'lucide-react';
import { api, fmt } from '../../api';
import { Empty, Skeleton, statusBadge } from '../../components/ui';
import { asList } from './Home';

export default function OrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [missing, setMissing] = useState(false);
  const [products, setProducts] = useState([]);

  useEffect(() => { window.scrollTo(0, 0); }, [id]);
  useEffect(() => {
    setOrder(null); 
    setMissing(false);
    api.get('/api/orders/' + id).then(setOrder).catch(() => setMissing(true));
    api.get('/api/products').then((d) => setProducts(asList(d))).catch(() => {});
  }, [id]);

  if (missing) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center max-w-lg mx-auto shadow-xs">
        <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Receipt className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">Order Not Found</h3>
        <p className="text-slate-500 text-sm mb-6">Order #{id} could not be located.</p>
        <Link 
          to="/store/orders" 
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back to My Orders
        </Link>
      </div>
    );
  }

  if (order === null) return <Skeleton h={320} />;
  const o = order;
  const prodById = (pid) => 
    products.find((p) => p.id === pid) || { 
      name: pid, 
      sku: pid, 
      uom: 'Pc', 
      images: ['https://picsum.photos/seed/' + pid + '/200/200'] 
    };

  const items = (o.items || []).map((i) => ({ ...i, p: prodById(i.pid) }));
  const totalUnits = items.reduce((a, i) => a + (i.qty || 0), 0);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6 w-full"
    >
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
            to="/store/orders"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Orders
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Line Items Column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" /> Line Items ({totalUnits} total units)
              </h2>
              <span className="text-xs text-slate-400 font-medium">{items.length} unique SKU(s)</span>
            </div>

            <div className="divide-y divide-slate-100">
              {items.map((i, index) => (
                <div key={index} className="py-4 flex items-center gap-4">
                  <img 
                    src={(i.p.images || [])[0] || ''} 
                    onError={(e) => { e.currentTarget.src = `https://picsum.photos/seed/${i.pid}/200/200`; }} 
                    className="w-16 h-16 rounded-xl object-cover border border-slate-200 bg-slate-50 flex-shrink-0" 
                    alt={i.p.name} 
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

            {/* Financial Summary */}
            <div className="border-t border-dashed border-slate-200 pt-4 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Taxable Subtotal</span>
                <span className="font-bold text-slate-900 font-mono">{fmt(o.total)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>GST (Goods & Services Tax)</span>
                <span className="text-slate-500">As per commercial invoice</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Freight & Handling</span>
                <span className="text-emerald-600 font-semibold">Standard Freight</span>
              </div>
              <div className="border-t border-slate-200 pt-3 flex justify-between items-baseline">
                <span className="font-black text-slate-900 text-sm">Total Payable</span>
                <span className="font-black text-blue-600 text-xl font-mono">{fmt(o.total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Info Column */}
        <div className="space-y-6">
          {/* Customer & Delivery Box */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
            <h3 className="font-bold text-slate-900 text-sm pb-3 border-b border-slate-100 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-600" /> Customer & Dispatch
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[11px] text-slate-400 block font-semibold uppercase tracking-wider">Company</span>
                <span className="font-bold text-slate-900 text-sm">{o.companyName || o.customer}</span>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 block font-semibold uppercase tracking-wider">Contact Person</span>
                <span className="text-slate-700 font-semibold">{o.contact || o.customer}</span>
                {o.mobile && <span className="text-slate-500 block">{o.mobile}</span>}
              </div>

              <div>
                <span className="text-[11px] text-slate-400 block font-semibold uppercase tracking-wider">Delivery Location</span>
                <p className="text-slate-600 leading-relaxed mt-0.5">{o.address || o.city}</p>
              </div>

              {o.poRef && (
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[11px] text-slate-400 block font-semibold uppercase tracking-wider">PO Reference</span>
                  <span className="font-mono text-blue-700 font-bold">{o.poRef}</span>
                </div>
              )}
            </div>
          </div>

          {/* Status Timeline */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
            <h3 className="font-bold text-slate-900 text-sm pb-3 border-b border-slate-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" /> Lifecycle History
            </h3>

            <div className="space-y-3 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {(o.history || [[o.status, o.date]]).map((h, i) => (
                <div key={i} className="flex items-start gap-3 relative pl-6">
                  <span className="absolute left-1 top-1 w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-white -translate-x-1/2" />
                  <div className="flex-1">
                    <span className="font-bold text-xs text-slate-900 block">{h[0]}</span>
                    <span className="text-[11px] text-slate-400 font-medium font-mono">{h[1]}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
