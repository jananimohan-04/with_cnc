/* Platform Dashboard — route /super/dashboard. All metrics from GET /api/stats/platform. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard } from 'lucide-react';
import { api, fmt } from '../../api';
import { useCompany } from '../../companyContext';
import { PageHero, PageHead, Kpi, DataTable, Bars, Empty, Skeleton, statusBadge } from '../../components/ui';

const ST_COLORS = {
  Pending: '#D97706', Confirmed: '#2563EB', Processing: '#7C3AED', 'Ready for Dispatch': '#C026D3',
  Shipped: '#0891B2', Delivered: '#16A34A', Cancelled: '#DC2626',
  Quoted: '#2563EB', Accepted: '#16A34A', Rejected: '#DC2626'
};

export default function Dashboard() {
  const { activeCompany, activeCompanyObj, setActiveCompany } = useCompany();
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/api/stats/platform').then((d) => { setS(d); setErr(''); }).catch((e) => setErr(e.message || 'Failed to load platform stats'));
  }, []);

  if (err) return <Empty icon="⚠️" title={'⚠️ ' + err} />;
  if (!s) return <Skeleton h={320} />;

  const co = activeCompany !== 'all' ? (activeCompanyObj || (s.byCompany || []).find((c) => c.id === activeCompany)) : null;
  const companyStats = co ? ((s.byCompany || []).find((c) => c.id === activeCompany) || {}) : {};
  const companiesCount = co ? 1 : s.companies;
  const companiesSub = co ? `${co.city || ''} • ${co.plan || 'Active'}` : `${s.activeCompanies} active • ${s.suspendedCompanies} suspended`;
  const usersCount = co ? (companyStats.users ?? co.users ?? 0) : s.salesUsers;
  const productsCount = co ? (companyStats.products ?? co.products ?? 0) : s.products;
  const ordersCount = co ? (companyStats.orders ?? 0) : s.orders;
  const pendingCount = co ? (companyStats.pending ?? 0) : s.pendingOrders;
  const gmvValue = co ? (companyStats.revenue ?? 0) : s.gmv;

  return (
    <div className="dashboard-light-brown pb-6">
      <PageHero
        icon={LayoutDashboard}
        title="Platform Executive Dashboard"
        subtitle="Real-time multi-tenant health, cross-company operations, order pipeline status, and manufacturing fulfillment metrics."
        badgeText="Platform Core"
        badgeColor="amber"
        gradient="from-[#160A03] via-[#2A1408] to-[#4A2510]"
        className="bg-gradient-to-r from-[#EFE4D6] via-[#E8DCCF] to-[#DECDBE] border-[#BAA794] shadow-xs"
        actions={
          <>
            <Link className="px-3.5 py-2 rounded-xl text-xs font-bold text-[#301A0E] bg-[#E2D4C5] hover:bg-[#D5C5B4] border border-[#BFAEA0] transition-colors" to="/super/audit">
              Audit Trail
            </Link>
            <Link className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#160A03] to-[#3B1C0B] hover:from-[#0E0602] hover:to-[#2B1408] shadow-xs shadow-[#160A03]/40 transition-all" to="/super/companies/new">
              + New Company
            </Link>
          </>
        }
      />
      {co && (
        <div className="flex items-center justify-between gap-3 p-3.5 mb-4 bg-[#EDE1D3] border border-[#BAA794] rounded-2xl shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{co.logo || '🏭'}</span>
            <div>
              <div className="text-xs font-bold text-[#1A0A03]">
                Active Tenant Scope: <span className="text-[#6B3519] font-extrabold">{co.name}</span> <span className="font-mono text-[#6B503E]">({co.code || co.id})</span>
              </div>
              <div className="text-[11px] text-[#6B503E]">
                Dashboard metrics, catalog inventory, and orders are scoped to this company
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveCompany('all')}
            className="px-3 py-1.5 rounded-xl text-xs font-bold text-[#5A2C14] hover:text-[#381B0C] bg-[#E2D4C5] hover:bg-[#D5C5B4] border border-[#BFAEA0] transition-colors cursor-pointer shadow-2xs"
          >
            Reset to All Companies
          </button>
        </div>
      )}
      <div className="stat-grid">
        <Kpi to="#/super/companies?tab=companies" value={companiesCount} label={co ? "Company" : "Total companies"} sub={companiesSub} grad="linear-gradient(135deg,#160A03,#3B1C0B)" />
        <Kpi to="#/super/companies?tab=admins" value={co ? (co.admin || '1') : s.admins} label="Company admins" sub={co ? "Lead administrator" : "across all companies"} grad="linear-gradient(135deg,#6D28D9,#7C3AED)" />
        <Kpi to="#/super/companies?tab=users" value={usersCount} label="Sales users" sub={co ? "Assigned team users" : "procurement teams"} grad="linear-gradient(135deg,#0E7490,#0EA5E9)" />
        <Kpi to="#/super/categories" value={s.categories} label="Global categories" sub="CNC catalog taxonomy" grad="linear-gradient(135deg,#92400E,#D97706)" />
        <Kpi to="#/super/orders" value={ordersCount} label="Total orders" sub={`${pendingCount} pending action`} grad="linear-gradient(135deg,#14532D,#16A34A)" />
        <Kpi to="#/super/orders?status=Pending" value={pendingCount} label="Pending orders" sub="needs processing" grad="linear-gradient(135deg,#065F46,#10B981)" />
        <Kpi to="#/super/quotes" value={s.quotes} label="Quotation requests" sub={`${s.openQuotes} open RFQs`} grad="linear-gradient(135deg,#2E170B,#542C16)" />
        <Kpi to="#/super/orders" value={fmt(gmvValue)} label="Order value" sub={co ? `${co.name} gross value` : "all companies, live rows"} grad="linear-gradient(135deg,#0E0704,#26140B)" />
      </div>
      <div className="grid2" style={{ marginTop: 14 }}>
        <div className="card"><div className="card-pad">
          <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Order status distribution</h3>
          <Bars items={(s.orderStatus || []).map((o) => ({ label: o.status, value: o.count, color: ST_COLORS[o.status] || '#64748B' }))} />
        </div></div>
        <div className="card"><div className="card-pad">
          <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Products per category</h3>
          <Bars items={(s.categoryDist || []).map((c) => ({ label: (c.icon ? c.icon + ' ' : '') + c.name, value: c.products }))} color="linear-gradient(135deg,#9A3412,#F97316)" />
        </div></div>
        <div className="card"><div className="card-pad">
          <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Order activity (last 14 days)</h3>
          {(s.orderActivity || []).length
            ? <Bars items={s.orderActivity.map((o) => ({ label: String(o.date).slice(5), value: o.count }))} color="linear-gradient(135deg,#14532D,#16A34A)" />
            : <div className="empty" style={{ padding: 18 }}>No orders in this window.</div>}
        </div></div>
        <div className="card"><div className="card-pad">
          <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Company growth</h3>
          {(s.companyGrowth || []).length
            ? <Bars items={s.companyGrowth.map((o) => ({ label: o.month, value: o.count }))} color="linear-gradient(135deg,#6D28D9,#7C3AED)" />
            : <div className="empty" style={{ padding: 18 }}>Not enough data yet.</div>}
        </div></div>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-pad">
          <PageHead title="Companies" actions={<Link className="btn btn-ghost btn-sm" to="/super/companies">Manage all →</Link>} />
          <DataTable
            rowKey={(r) => r.id}
            empty="No companies yet."
            cols={[
              { key: 'co', label: 'Company', render: (c) => <><b>{c.logo} {c.name}</b><div className="hint">{c.code} • {c.city}</div></> },
              { key: 'ind', label: 'Industry', render: (c) => c.industry || '—' },
              { key: 'st', label: 'Status', render: (c) => statusBadge(c.status === 'active' ? 'Delivered' : 'Cancelled') },
              { key: 'u', label: 'Users', render: (c) => c.users },
              { key: 'p', label: 'SKUs', render: (c) => c.products },
              {
                key: 'o', label: 'Orders',
                render: (c) => <>{c.orders}{c.pending ? <span className="status s-pending"> {c.pending} pend</span> : null}</>
              },
              { key: 'rev', label: 'Revenue', render: (c) => <b>{fmt(c.revenue)}</b> },
              { key: 'open', label: '', render: (c) => <Link className="btn btn-ghost btn-sm" to={'/super/companies/' + c.id}>Open →</Link> }
            ]}
            rows={s.byCompany || []}
          />
          <p className="hint">Every metric on this page is computed from live database rows.</p>
        </div>
      </div>
    </div>
  );
}
