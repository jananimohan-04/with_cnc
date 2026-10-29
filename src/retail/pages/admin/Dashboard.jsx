/* Company admin dashboard — mirrors legacy vAdminDash exactly with modern Tailwind UI. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  LayoutDashboard, Boxes, Receipt, IndianRupee, 
  AlertTriangle, ArrowRight, Plus, ExternalLink, 
  Clock, CheckCircle2, TrendingUp, PackageCheck 
} from 'lucide-react';
import { api, fmt, imgFallback } from '../../api';
import { useAuth } from '../../auth';
import { statusBadge, Empty, Skeleton, PageHero } from '../../components/ui';

export default function Dashboard() {
  const { me } = useAuth();
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState(null);
  const [prods, setProds] = useState(null);
  const [coName, setCoName] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let on = true;
    api.get('/api/stats/company')
      .then((s) => { if (on) setStats(s); })
      .catch((e) => { if (on) setErr(e.message); });

    api.get('/api/orders?page=1&limit=5')
      .then((o) => { if (on) setOrders(Array.isArray(o) ? o : (o.rows || [])); })
      .catch((e) => { if (on) setErr(e.message); });

    api.get('/api/products')
      .then((p) => { if (on) setProds(Array.isArray(p) ? p : (p.rows || [])); })
      .catch((e) => { if (on) setErr(e.message); });

    if (me && me.companyId) {
      api.get('/api/companies/' + me.companyId)
        .then((c) => { if (on && c) setCoName(c.name || ''); })
        .catch(() => {});
    }

    return () => { on = false; };
  }, [me && me.companyId]);

  if (err && !stats && !orders && !prods) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-8 text-center max-w-lg mx-auto">
        <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <h3 className="font-bold text-slate-900 mb-1">Backend Connection Error</h3>
        <p className="text-xs text-slate-500">{err}</p>
      </div>
    );
  }

  if (!stats && !orders && !prods) return <Skeleton h={320} />;

  const ps = prods || [];
  const os = orders || [];
  const skuN = stats ? stats.products : ps.length;
  const visN = stats ? stats.visible : ps.filter((p) => p.visible).length;
  const rfqN = stats ? stats.quotationOnly : ps.filter((p) => p.price == null).length;
  const ordN = stats ? stats.orders : os.length;
  const pend = stats ? stats.pending : os.filter((o) => o.status === 'Pending').length;
  const openQ = stats ? stats.openQuotes : 0;
  const rev = stats ? stats.revenue : os.reduce((a, o) => a + (o.total || 0), 0);
  const del = stats ? stats.delivered : os.filter((o) => o.status === 'Delivered').length;

  const displayName = coName || (me && me.companyId) || 'Company';

  return (
    <div className="space-y-6">
      <PageHero
        title="Commercial Dashboard"
        subtitle={`Operations, inventory metrics, and commercial pipeline for ${displayName}.`}
        icon={LayoutDashboard}
        badgeText="Operations Hub"
        badgeColor="emerald"
        gradient="from-emerald-500 via-teal-600 to-green-600"
        actions={
          <div className="flex items-center gap-2">
            <Link 
              to="/admin/products/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm shadow-emerald-600/30 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add New Product
            </Link>
            <Link 
              to="/store/home"
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" /> View Storefront
            </Link>
          </div>
        }
      />

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* SKUs */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs hover:shadow-xs transition-all relative overflow-hidden"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Stock Library</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Boxes className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900 font-mono">{skuN}</div>
          <div className="text-xs text-slate-500 mt-2 flex items-center gap-2">
            <span className="text-emerald-600 font-bold">{visN} visible</span>
            <span>•</span>
            <span>{rfqN} RFQ-only</span>
          </div>
        </motion.div>

        {/* Orders */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.05 }}
          className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs hover:shadow-xs transition-all relative overflow-hidden"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Orders</span>
            <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <Receipt className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900 font-mono">{ordN}</div>
          <div className="text-xs text-slate-500 mt-2 flex items-center gap-2">
            <span className="text-amber-600 font-bold">{pend} pending</span>
            <span>•</span>
            <span>{openQ} open RFQs</span>
          </div>
        </motion.div>

        {/* Revenue */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.1 }}
          className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs hover:shadow-xs transition-all relative overflow-hidden"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gross Order Value</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900 font-mono">{fmt(rev)}</div>
          <div className="text-xs text-slate-500 mt-2 flex items-center gap-2">
            <span className="text-emerald-600 font-bold">{del} delivered</span>
            <span>•</span>
            <span>Live database</span>
          </div>
        </motion.div>
      </div>

      {/* Recent Orders Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-blue-600" /> Recent Purchase Orders
          </h2>
          <Link 
            to="/admin/orders" 
            className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider text-[10px]">
                <th className="pb-2.5 font-bold">Order ID</th>
                <th className="pb-2.5 font-bold">Customer Entity</th>
                <th className="pb-2.5 font-bold">Total</th>
                <th className="pb-2.5 font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {os.length ? os.slice(0, 5).map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 font-mono font-bold text-blue-600">
                    <Link to={'/admin/orders/' + o.id} className="hover:underline">
                      {o.id}
                    </Link>
                    <div className="text-[10px] text-slate-400 font-sans mt-0.5">{o.date}</div>
                  </td>
                  <td className="py-3 font-medium text-slate-800">
                    {o.companyName || o.customer}
                    {o.poRef && <span className="block text-[10px] text-slate-400 font-mono">PO: {o.poRef}</span>}
                  </td>
                  <td className="py-3 font-mono font-bold text-slate-900">{fmt(o.total)}</td>
                  <td className="py-3">{statusBadge(o.status)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400">
                    No orders placed yet for this company.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
