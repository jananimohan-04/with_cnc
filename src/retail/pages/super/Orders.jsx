import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Receipt } from 'lucide-react';
import { api, fmt } from '../../api';
import { useCompany } from '../../companyContext';
import { PageHero, DataTable, statusBadge, Empty, Skeleton, Pager, toast } from '../../components/ui';

const STATUSES = ['Pending', 'Confirmed', 'Processing', 'Ready for Dispatch', 'Shipped', 'Delivered', 'Cancelled'];

export default function Orders() {
  const { activeCompany, activeCompanyObj, setActiveCompany } = useCompany();
  const [sp, setSp] = useSearchParams();
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [err, setErr] = useState('');
  const [companies, setCompanies] = useState([]);
  const status = sp.get('status') || 'all';
  const company = sp.get('company') || activeCompany || 'all';
  const q = sp.get('q') || '';

  const load = useCallback(async (p) => {
    setErr('');
    try {
      const qs = new URLSearchParams({ page: p, limit: 8 });
      if (status !== 'all') qs.set('status', status);
      if (company !== 'all') qs.set('companyId', company);
      if (q) qs.set('q', q);
      const d = await api.get('/api/orders?' + qs.toString());
      setRows(d.rows || d);
      setTotal(d.total ?? (d.rows || d).length);
      setPage(d.page || 1);
    } catch (e) { setErr(e.message); setRows([]); }
  }, [status, company, q]);

  useEffect(() => {
    api.get('/api/companies').then((c) => setCompanies(c || [])).catch(() => {});
  }, []);
  useEffect(() => { setPage(1); load(1); }, [load]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, []);

  const set = (k, v) => {
    if (k === 'company') setActiveCompany(v);
    const n = new URLSearchParams(sp);
    if (!v || v === 'all') n.delete(k); else n.set(k, v);
    setSp(n);
  };

  return (
    <div>
      <PageHero
        icon={Receipt}
        title="Platform Orders Fulfillment"
        subtitle="Track, process, and inspect customer procurement purchase orders across all registered company storefronts."
        badgeText="Commerce Hub"
        badgeColor="purple"
        gradient="from-purple-600 via-violet-600 to-indigo-600"
        actions={
          <button className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer" onClick={() => window.print()}>
            🖨️ Print Report
          </button>
        }
      />
      {activeCompanyObj && (
        <div className="flex items-center justify-between gap-3 p-3.5 mb-4 bg-purple-50/90 border border-purple-200/90 rounded-2xl shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{activeCompanyObj.logo || '🏭'}</span>
            <div>
              <div className="text-xs font-bold text-slate-900">
                Active Tenant Scope: <span className="text-purple-700 font-extrabold">{activeCompanyObj.name}</span> <span className="font-mono text-slate-500">({activeCompanyObj.code || activeCompanyObj.id})</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Purchase orders and fulfillment records are filtered to this company
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setActiveCompany('all'); set('company', 'all'); }}
            className="px-3 py-1.5 rounded-xl text-xs font-bold text-purple-800 hover:text-purple-950 bg-white hover:bg-purple-100/60 border border-purple-200 transition-colors cursor-pointer shadow-2xs"
          >
            Reset to All Companies
          </button>
        </div>
      )}
      <div className="card"><div className="card-pad">
        <div className="toolbar">
          <input placeholder="🔍 Search order / company / PO…" value={q} onChange={(e) => set('q', e.target.value)} aria-label="Search orders" />
          <select value={company} onChange={(e) => set('company', e.target.value)} aria-label="Company filter">
            <option value="all">All companies</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={status} onChange={(e) => set('status', e.target.value)} aria-label="Status filter">
            <option value="all">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {err ? <Empty icon="⚠️" title="Could not load orders" sub={err} />
          : rows === null ? <Skeleton />
          : (<><DataTable
            cols={[
              { key: 'id', label: 'Order', render: (o) => (<><Link to={'/super/orders/' + o.id}><b>{o.id}</b></Link><div className="hint">{o.date}{o.poRef ? ' • ' + o.poRef : ''}</div></>) },
              { key: 'co', label: 'Company', render: (o) => o.companyName2 || o.companyId },
              { key: 'by', label: 'Sales user', render: (o) => o.salesUser },
              { key: 'cu', label: 'Customer', render: (o) => (<>{o.companyName || o.customer}<div className="hint">{o.mobile} • {o.city}</div></>) },
              { key: 'items', label: 'Items', render: (o) => (o.items || []).reduce((a, i) => a + i.qty, 0) },
              { key: 'total', label: 'Total', num: true, render: (o) => <b className="num">{fmt(o.total)}</b> },
              { key: 'st', label: 'Status', render: (o) => statusBadge(o.status) }
            ]}
            rows={rows} rowKey={(o) => o.id} empty="No orders match filters."
          /><Pager total={total} page={page} limit={8} onPage={(p) => { setPage(p); load(p); }} /></>)}
      </div></div>
    </div>
  );
}
