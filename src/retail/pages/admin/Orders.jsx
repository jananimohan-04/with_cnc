/* Company orders — mirrors legacy vOrdersAdmin. Server-side search + status + pagination. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Receipt, Search, Filter, Printer, ChevronLeft, 
  ChevronRight, Calendar, Building2, User, Eye 
} from 'lucide-react';
import { api, fmt } from '../../api';
import { statusBadge, Empty, Skeleton, Pager, PageHero } from '../../components/ui';

const STATUSES = ['all', 'Pending', 'Confirmed', 'Processing', 'Ready for Dispatch', 'Shipped', 'Delivered', 'Cancelled'];

function norm(d) {
  if (!d) return { rows: [], total: 0, page: 1, limit: 8 };
  if (Array.isArray(d)) return { rows: d, total: d.length, page: 1, limit: 8 };
  return { 
    rows: d.rows || [], 
    total: d.total != null ? d.total : (d.rows || []).length, 
    page: d.page || 1, 
    limit: d.limit || 8 
  };
}

export default function Orders() {
  const [q, setQ] = useState('');
  const [deb, setDeb] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => { setDeb(q); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let on = true;
    const qs = new URLSearchParams({ page, limit: 8 });
    if (deb) qs.set('q', deb);
    if (status && status !== 'all') qs.set('status', status);
    api.get('/api/orders?' + qs.toString())
      .then((d) => { if (on) setData({ ...norm(d), err: '' }); })
      .catch((e) => { if (on) setData({ rows: [], total: 0, page: 1, limit: 8, err: e.message }); });
    return () => { on = false; };
  }, [page, deb, status]);

  if (!data) return <Skeleton h={320} />;

  return (
    <div className="space-y-6">
      <PageHero
        title="Commercial Purchase Orders"
        subtitle={`${data.total} total order records • Linked to ERP sales requisition and delivery pipeline.`}
        icon={Receipt}
        badgeText="Purchase Orders"
        badgeColor="purple"
        gradient="from-purple-600 via-violet-600 to-indigo-600"
        actions={
          <button 
            type="button" 
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5" /> Print Order Register
          </button>
        }
      />

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        {/* Filters Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Search by order ID, company name, PO ref..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl outline-hidden transition-all"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select 
              value={status} 
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl outline-hidden"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Orders Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider text-[10px]">
                <th className="pb-3 font-bold">Order ID & Date</th>
                <th className="pb-3 font-bold">Sales Agent</th>
                <th className="pb-3 font-bold">Customer Organization</th>
                <th className="pb-3 font-bold text-center">Units</th>
                <th className="pb-3 font-bold">Subtotal</th>
                <th className="pb-3 font-bold">Status</th>
                <th className="pb-3 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.length ? data.rows.map((o) => {
                const totalUnits = (o.items || []).reduce((a, i) => a + (i.qty || 0), 0);
                return (
                  <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5">
                      <Link to={'/admin/orders/' + o.id} className="font-mono font-bold text-blue-600 hover:underline">
                        {o.id}
                      </Link>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {o.date}
                        {o.poRef && <span className="font-mono text-slate-600 ml-1">• PO: {o.poRef}</span>}
                      </div>
                    </td>

                    <td className="py-3.5 text-slate-600 font-medium">
                      {o.salesUser || '—'}
                    </td>

                    <td className="py-3.5">
                      <div className="font-bold text-slate-900">{o.companyName || o.customer}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{o.mobile} • {o.city}</div>
                    </td>

                    <td className="py-3.5 text-center font-bold text-slate-700">
                      {totalUnits}
                    </td>

                    <td className="py-3.5 font-mono font-bold text-slate-900 text-sm">
                      {fmt(o.total)}
                    </td>

                    <td className="py-3.5">
                      {statusBadge(o.status)}
                    </td>

                    <td className="py-3.5 text-right">
                      <Link 
                        to={'/admin/orders/' + o.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> Manage
                      </Link>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No purchase orders match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <Pager total={data.total} page={data.page} limit={data.limit} onPage={setPage} />
      </div>
    </div>
  );
}
