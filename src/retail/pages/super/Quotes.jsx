import { useCallback, useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { api, fmt } from '../../api';
import { useCompany } from '../../companyContext';
import { PageHero, DataTable, Field, statusBadge, Modal, Empty, Skeleton, Pager, toast } from '../../components/ui';

const STATUSES = ['Pending', 'Quoted', 'Accepted', 'Rejected', 'Cancelled'];

export default function Quotes() {
  const { activeCompany, activeCompanyObj, setActiveCompany } = useCompany();
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [err, setErr] = useState('');
  const [companies, setCompanies] = useState([]);
  const [status, setStatus] = useState('all');
  const [company, setCompany] = useState(activeCompany || 'all');
  const [resp, setResp] = useState(null);
  const [rStatus, setRStatus] = useState('Quoted');
  const [rPrice, setRPrice] = useState('');
  const [rNote, setRNote] = useState('');
  const [rErr, setRErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (p, st, co) => {
    setErr('');
    try {
      const qs = new URLSearchParams({ page: p, limit: 8 });
      if (st && st !== 'all') qs.set('status', st);
      if (co && co !== 'all') qs.set('companyId', co);
      const d = await api.get('/api/quotations?' + qs.toString());
      setRows(d.rows || d);
      setTotal(d.total ?? (d.rows || d).length);
      setPage(d.page || 1);
    } catch (e) { setErr(e.message); setRows([]); }
  }, []);

  useEffect(() => {
    api.get('/api/companies').then((c) => setCompanies(c || [])).catch(() => {});
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    setCompany(activeCompany);
    load(1, status, activeCompany);
  }, [activeCompany, load]);

  const refilter = (st, co) => {
    if (co !== undefined) {
      setCompany(co);
      setActiveCompany(co);
    }
    setPage(1);
    load(1, st, co !== undefined ? co : company);
  };
  const openResp = (q) => { setResp(q); setRStatus('Quoted'); setRPrice(q.quotePrice ?? ''); setRNote(q.adminNote || ''); setRErr(''); };
  const saveResp = async () => {
    setBusy(true); setRErr('');
    try {
      await api.patch('/api/quotations/' + resp.id, {
        status: rStatus,
        quotePrice: rPrice === '' ? null : Number(rPrice),
        adminNote: rNote
      });
      setResp(null);
      toast(resp.id + ' → ' + rStatus, '📝');
      load(page, status, company);
    } catch (e) { setRErr(e.message); }
    setBusy(false);
  };

  return (
    <div>
      <PageHero
        icon={FileText}
        title="RFQ Commercial Quotations"
        subtitle="Review, analyze, and respond to custom pricing quotation inquiries submitted by industrial buyers."
        badgeText="RFQ Commerce"
        badgeColor="purple"
        gradient="from-violet-600 via-purple-600 to-pink-600"
      />
      {activeCompanyObj && (
        <div className="flex items-center justify-between gap-3 p-3.5 mb-4 bg-violet-50/90 border border-violet-200/90 rounded-2xl shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{activeCompanyObj.logo || '🏭'}</span>
            <div>
              <div className="text-xs font-bold text-slate-900">
                Active Tenant Scope: <span className="text-violet-700 font-extrabold">{activeCompanyObj.name}</span> <span className="font-mono text-slate-500">({activeCompanyObj.code || activeCompanyObj.id})</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Commercial RFQs and buyer inquiries are filtered to this company
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveCompany('all')}
            className="px-3 py-1.5 rounded-xl text-xs font-bold text-violet-800 hover:text-violet-950 bg-white hover:bg-violet-100/60 border border-violet-200 transition-colors cursor-pointer shadow-2xs"
          >
            Reset to All Companies
          </button>
        </div>
      )}
      <div className="card"><div className="card-pad">
        <div className="toolbar">
          <select value={company} onChange={(e) => { setCompany(e.target.value); refilter(status, e.target.value); }} aria-label="Company filter">
            <option value="all">All companies</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); refilter(e.target.value, company); }} aria-label="Status filter">
            <option value="all">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {err ? <Empty icon="⚠️" title="Could not load quotations" sub={err} />
          : rows === null ? <Skeleton />
          : (<><DataTable
            cols={[
              { key: 'id', label: 'RFQ', render: (x) => (<><b>{x.id}</b><div className="hint">{x.date}</div></>) },
              { key: 'co', label: 'Company', render: (x) => x.companyName2 || x.companyId },
              { key: 'p', label: 'Product', render: (x) => (<><b>{x.productName || x.pid}</b><div className="hint">{x.sku || ''} • {x.companyName || ''}</div><div className="hint">Tech: {x.techReq || '—'}</div></>) },
              { key: 'qty', label: 'Qty', render: (x) => x.qty },
              { key: 'by', label: 'Requested by', render: (x) => (<>{x.requestedBy}<div className="hint">{x.mobile || ''}</div></>) },
              { key: 'q', label: 'Quote', render: (x) => (<>{x.quotePrice != null ? <b>{fmt(x.quotePrice)}</b> : '—'}<div className="hint">{x.adminNote || ''}</div></>) },
              { key: 'st', label: 'Status', render: (x) => statusBadge(x.status) },
              { key: 'act', label: 'Action', render: (x) => <button className="btn btn-ghost btn-sm" onClick={() => openResp(x)}>Respond</button> }
            ]}
            rows={rows} rowKey={(x) => x.id} empty="No quotation requests."
          /><Pager total={total} page={page} limit={8} onPage={(p) => { setPage(p); load(p, status, company); }} /></>)}
      </div></div>
      {resp && (
        <Modal title={'Respond — ' + resp.id} onClose={() => setResp(null)}>
          <Field label="Status">
            <select value={rStatus} onChange={(e) => setRStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Quoted unit price (₹, optional)">
            <input type="number" value={rPrice} onChange={(e) => setRPrice(e.target.value)} />
          </Field>
          <Field label="Note for requester">
            <input value={rNote} onChange={(e) => setRNote(e.target.value)} placeholder="e.g. Imported, 3-week lead time" />
          </Field>
          {rErr && <p className="ferr">{rErr}</p>}
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy} onClick={saveResp}>Save response</button>
        </Modal>
      )}
    </div>
  );
}
