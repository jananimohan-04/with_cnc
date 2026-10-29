/* Store orders — mirrors legacy vMyOrders: company order list with thumbs/totals/statuses. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Package, Search, Calendar, Building2, ChevronRight, 
  FileText, Plus, ShoppingBag, Truck 
} from 'lucide-react';
import { api, fmt } from '../../api';
import { Empty, Skeleton, statusBadge, PageHero } from '../../components/ui';
import { asList } from './Home';

export default function Orders() {
  const [orders, setOrders] = useState(null);
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState('');

  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => {
    api.get('/api/orders').then((d) => setOrders(asList(d))).catch(() => setOrders([]));
    api.get('/api/products').then((d) => setProducts(asList(d))).catch(() => {});
  }, []);

  if (orders === null) return <Skeleton h={280} />;
  const prodById = (id) => products.find((p) => p.id === id);

  const filtered = orders.filter((o) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (
      (o.id || '').toLowerCase().includes(s) ||
      (o.poRef || '').toLowerCase().includes(s) ||
      (o.companyName || o.customer || '').toLowerCase().includes(s) ||
      (o.status || '').toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6 w-full">
      <PageHero
        title={`My Purchase Orders (${orders.length})`}
        subtitle="Procurement purchase requisitions, dispatch timelines, and live delivery trackers."
        icon={Package}
        badgeText="Procurement Orders"
        badgeColor="orange"
        gradient="from-orange-500 via-amber-500 to-red-500"
        actions={
          <Link 
            to="/store/listing" 
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm shadow-orange-600/30 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> New Requisition
          </Link>
        }
      />

      {/* Filter Toolbar */}
      {orders.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Search by order ID, PO ref, customer..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 focus:border-blue-500 rounded-xl outline-hidden transition-all shadow-2xs"
            />
          </div>
          {q && (
            <button 
              type="button" 
              onClick={() => setQ('')} 
              className="text-xs font-bold text-slate-500 hover:text-slate-800"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Orders List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center max-w-md mx-auto shadow-xs">
          <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <ShoppingBag className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">
            {orders.length === 0 ? 'No orders placed yet' : 'No matching orders'}
          </h3>
          <p className="text-slate-500 text-xs mb-5">
            {orders.length === 0 
              ? 'Your company has not submitted any industrial purchase orders yet.' 
              : 'Try adjusting your search criteria.'}
          </p>
          <Link 
            to="/store/listing" 
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm"
          >
            Browse Catalog <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => {
            const firstItem = (o.items || [])[0];
            const p = prodById(firstItem && firstItem.pid) || { images: ['https://picsum.photos/seed/x/100/100'] };
            const totalQty = (o.items || []).reduce((a, i) => a + (i.qty || 0), 0);
            return (
              <motion.div
                key={o.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Link
                  to={'/store/orders/' + o.id}
                  className="group block bg-white hover:bg-slate-50/80 rounded-2xl border border-slate-200/80 hover:border-blue-300 p-4 transition-all shadow-2xs hover:shadow-xs"
                >
                  <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
                    {/* Thumbnail preview */}
                    <img 
                      src={(p.images || [])[0] || ''} 
                      onError={(e) => { e.currentTarget.src = 'https://picsum.photos/seed/x/100/100'; }} 
                      className="w-14 h-14 rounded-xl object-cover border border-slate-200 bg-slate-100 flex-shrink-0" 
                      alt="" 
                    />

                    {/* Order Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900 text-sm group-hover:text-blue-600 transition-colors font-mono">
                          {o.id}
                        </span>
                        {o.poRef && (
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold">
                            PO: {o.poRef}
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" /> {o.date}
                        </span>
                        <span>•</span>
                        <span>{totalQty} item(s)</span>
                        <span>•</span>
                        <span className="truncate">{o.companyName || o.customer}</span>
                      </div>
                    </div>

                    {/* Total & Status */}
                    <div className="flex items-center gap-4 justify-between sm:justify-end w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      <div className="text-left sm:text-right">
                        <div className="font-black text-slate-900 text-sm font-mono">{fmt(o.total)}</div>
                        <div className="mt-1">{statusBadge(o.status)}</div>
                      </div>
                      <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-blue-50 text-slate-400 group-hover:text-blue-600 flex items-center justify-center transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
