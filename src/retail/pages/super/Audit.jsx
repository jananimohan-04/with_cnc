import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '../../api';
import { useCompany } from '../../companyContext';
import { PageHero, DataTable, Empty, Skeleton, Pager } from '../../components/ui';

export default function Audit() {
  const { activeCompany, activeCompanyObj, setActiveCompany } = useCompany();
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [err, setErr] = useState('');
  const [companies, setCompanies] = useState([]);
  const [company, setCompany] = useState(activeCompany || 'all');
  const [action, setAction] = useState('all');
  const [q, setQ] = useState('');
  const [actions, setActions] = useState([]);

  const load = useCallback(async (p, co, act, query) => {
    setErr('');
    try {
      const qs = new URLSearchParams({ page: p, limit: 8 });
      if (co && co !== 'all') qs.set('companyId', co);
      if (act && act !== 'all') qs.set('action', act);
      if (query) qs.set('q', query);
      const d = await api.get('/api/audit?' + qs.toString());
      setRows(d.rows || d);
      setTotal(d.total ?? (d.rows || d).length);
      setPage(d.page || 1);
    } catch (e) { setErr(e.message); setRows([]); }
  }, []);

  useEffect(() => {
    api.get('/api/companies').then((c) => setCompanies(c || [])).catch(() => {});
    api.get('/api/audit?limit=100').then((d) => {
      const r = d.rows || d;
      setActions([...new Set((r || []).map((a) => a.action).filter(Boolean))].sort());
    }).catch(() => {});
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    setCompany(activeCompany);
    load(1, activeCompany, action, q);
  }, [activeCompany, load]);

  const refilter = (co, act, query) => {
    if (co !== undefined) {
      setCompany(co);
      setActiveCompany(co);
    }
    setPage(1);
    load(1, co !== undefined ? co : company, act, query);
  };

  return (
    <div>
      <PageHero
        title="Audit Logs & Compliance Trail"
        subtitle="Acting security principal, action triggers, entity IDs, tenant scope, and immutable audit timestamps."
        icon={ShieldCheck}
        badgeText="Governance & Security"
        badgeColor="rose"
        gradient="from-rose-500 via-pink-600 to-rose-700"
      />
      {activeCompanyObj && (
        <div className="flex items-center justify-between gap-3 p-3.5 mb-4 bg-rose-50/90 border border-rose-200/90 rounded-2xl shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{activeCompanyObj.logo || '🏭'}</span>
            <div>
              <div className="text-xs font-bold text-slate-900">
                Active Tenant Scope: <span className="text-rose-700 font-extrabold">{activeCompanyObj.name}</span> <span className="font-mono text-slate-500">({activeCompanyObj.code || activeCompanyObj.id})</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Audit events, entity operations, and security logs are filtered to this company
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveCompany('all')}
            className="px-3 py-1.5 rounded-xl text-xs font-bold text-rose-800 hover:text-rose-950 bg-white hover:bg-rose-100/60 border border-rose-200 transition-colors cursor-pointer shadow-2xs"
          >
            Reset to All Companies
          </button>
        </div>
      )}
      <div className="card"><div className="card-pad">
        <div className="toolbar">
          <input placeholder="🔍 Search actor, summary, entity…" value={q} onChange={(e) => { setQ(e.target.value); refilter(company, action, e.target.value); }} aria-label="Search audit" />
          <select value={company} onChange={(e) => { refilter(e.target.value, action, q); }} aria-label="Company filter">
            <option value="all">All companies</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={action} onChange={(e) => { setAction(e.target.value); refilter(company, e.target.value, q); }} aria-label="Action filter">
            <option value="all">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {err ? <Empty icon="⚠️" title="Could not load audit log" sub={err} />
          : rows === null ? <Skeleton />
          : (<><DataTable
            cols={[
              { key: 'ts', label: 'Time', render: (a) => <span className="hint">{String(a.ts).slice(0, 16).replace('T', ' ')}</span> },
              { key: 'actor', label: 'Actor', render: (a) => (<><b>{a.actor}</b><div className="hint">{a.role}</div></>) },
              { key: 'act', label: 'Action', render: (a) => (<code style={{ fontSize: 12 }}>{a.action}</code>) },
              { key: 'en', label: 'Entity', render: (a) => (<>{a.entity}<div className="hint">{a.entityId}</div></>) },
              { key: 'co', label: 'Company', render: (a) => a.companyId || '—' },
              { key: 'sum', label: 'Summary', render: (a) => a.summary || '—' }
            ]}
            rows={rows} rowKey={(a, i) => (a.id || i)} empty="No audit records match."
          /><Pager total={total} page={page} limit={8} onPage={(p) => { setPage(p); load(p, company, action, q); }} /></>)}
      </div></div>
    </div>
  );
}
