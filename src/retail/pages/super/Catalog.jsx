import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Boxes } from 'lucide-react';
import { api, fmt, imgFallback } from '../../api';
import { useCompany } from '../../companyContext';
import { PageHero, DataTable, Pager, Empty, Skeleton, statusBadge } from '../../components/ui';
import { asRows } from './_shared';

const LIMIT = 8;

export default function Catalog() {
  const { activeCompany, activeCompanyObj, setActiveCompany } = useCompany();
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cid = activeCompany !== 'all' ? `&companyId=${encodeURIComponent(activeCompany)}` : '';
      const d = await api.get(`/api/catalog?page=${page}&limit=${LIMIT}${cid}`);
      const n = asRows(d);
      setData({ rows: n.rows, total: n.total });
      setErr('');
    } catch (e) {
      setErr(e.message || 'Failed to load catalog');
    } finally {
      setLoading(false);
    }
  }, [page, activeCompany]);

  useEffect(() => { setPage(1); load(); }, [load]);

  return (
    <>
      <PageHero
        icon={Boxes}
        title="Global Master Catalog"
        subtitle="Centralized industrial tooling inventory and catalog items spanning all registered companies and suppliers."
        badgeText="Master Inventory"
        badgeColor="amber"
        gradient="from-amber-500 via-orange-500 to-yellow-600"
      />
      {activeCompanyObj && (
        <div className="flex items-center justify-between gap-3 p-3.5 mb-4 bg-amber-50/90 border border-amber-200/90 rounded-2xl shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{activeCompanyObj.logo || '🏭'}</span>
            <div>
              <div className="text-xs font-bold text-slate-900">
                Active Tenant Scope: <span className="text-amber-700 font-extrabold">{activeCompanyObj.name}</span> <span className="font-mono text-slate-500">({activeCompanyObj.code || activeCompanyObj.id})</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Catalog SKUs and industrial inventory are filtered to this company
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveCompany('all')}
            className="px-3 py-1.5 rounded-xl text-xs font-bold text-amber-800 hover:text-amber-950 bg-white hover:bg-amber-100/60 border border-amber-200 transition-colors cursor-pointer shadow-2xs"
          >
            Reset to All Companies
          </button>
        </div>
      )}
      <div className="card"><div className="card-pad">
        {loading ? <Skeleton h={220} /> : err ? <Empty title={'⚠️ ' + err} /> : (
          <>
            <DataTable
              rowKey={(r) => r.id}
              empty="No SKUs match."
              cols={[
                {
                  key: 'p', label: 'Product', render: (p) => (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <img className="thumb" src={(p.images || [])[0] || ''} onError={(e) => { e.target.src = imgFallback(p.sku || p.id, 100, 100); }} alt="" />
                      <div><b>{p.name}</b><div className="hint">{p.sku || p.id}{p.mpn ? ' • MPN ' + p.mpn : ''}{p.archived ? ' • ARCHIVED' : ''}</div></div>
                    </div>
                  )
                },
                { key: 'co', label: 'Company', render: (p) => p.companyName || p.companyId },
                { key: 'b', label: 'Brand', render: (p) => p.brand || '—' },
                { key: 'pr', label: 'Price', render: (p) => p.price != null ? <b>{fmt(p.price)}</b> : <span className="status s-ready">RFQ</span> },
                { key: 's', label: 'Stock', render: (p) => p.stock },
                { key: 'v', label: 'Visibility', render: (p) => statusBadge(p.visible ? 'Delivered' : 'Cancelled') },
                { key: 'c', label: 'Created', render: (p) => <span className="hint">{p.created || '—'}</span> },
                {
                  key: 'a', label: 'Actions', render: (p) => (
                    <span style={{ whiteSpace: 'nowrap' }}>
                      <Link className="btn btn-ghost btn-sm" to={'/store/product/' + p.id}>View</Link>{' '}
                      <Link className="btn btn-ghost btn-sm" to={'/admin/products/edit/' + p.id}>Edit</Link>
                    </span>
                  )
                }
              ]}
              rows={data.rows}
            />
            <Pager total={data.total} page={page} limit={LIMIT} onPage={setPage} />
          </>
        )}
      </div></div>
    </>
  );
}
