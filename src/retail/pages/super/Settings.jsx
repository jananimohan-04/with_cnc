/* /super/settings — global defaults form + per-company overrides (read-only). */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sliders, Receipt, ArrowRight } from 'lucide-react';
import { api } from '../../api';
import { PageHero, Field, DataTable, Empty, Skeleton, toast } from '../../components/ui';

export default function Settings() {
  const [g, setG] = useState(null);
  const [err, setErr] = useState('');
  const [ferr, setFerr] = useState('');
  const [busy, setBusy] = useState(false);
  const [cos, setCos] = useState([]);

  useEffect(() => {
    Promise.all([api.get('/api/settings/global').catch((e) => { throw e; }), api.get('/api/companies').catch(() => [])])
      .then(([gs, c]) => { setG(gs || {}); setCos(c || []); window.scrollTo({ top: 0 }); })
      .catch((e) => setErr(e.message));
  }, []);

  const set = (k, v) => setG((p) => ({ ...p, [k]: v }));
  const save = async () => {
    setBusy(true); setFerr('');
    try {
      const d = await api.put('/api/settings/global', g);
      setG(d || g);
      toast('Global settings published', '⚙️');
    } catch (e) { setFerr(e.message); }
    setBusy(false);
  };

  return (
    <div>
      <PageHero
        title="Global Store Settings"
        subtitle="Platform defaults, default currency, GST configuration, and multi-tenant override policies."
        icon={Sliders}
        badgeText="Platform Config"
        badgeColor="rose"
        gradient="from-rose-500 via-pink-600 to-rose-700"
        actions={[<button key="s" className="btn btn-primary btn-sm bg-rose-600 hover:bg-rose-700 border-none shadow-sm shadow-rose-600/30 text-white" disabled={busy || !g} onClick={save}>Publish Settings</button>]}
      />

      {/* Prominent Banner for Multi-Company Invoice & Quotation Profiles */}
      <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-amber-500/10 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shadow-sm flex-shrink-0">
            🧾
          </div>
          <div>
            <h4 className="text-sm font-black text-slate-800 dark:text-emerald-100 flex items-center gap-2">
              <span>Company Invoice &amp; Quotation Profiles</span>
              <span className="px-2 py-0.5 text-[9px] bg-emerald-100 text-emerald-800 rounded font-mono font-bold">Rule 46 GST</span>
            </h4>
            <p className="text-xs text-slate-600 dark:text-stone-300 mt-0.5">
              Configure company letterhead logo, registered address, GSTIN/PAN/CIN, bank wire details, dynamic amount UPI payment QR codes, and digital signatures.
            </p>
          </div>
        </div>
        <Link 
          to="/admin/settings?tab=invoice"
          className="btn btn-primary btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-none flex-shrink-0 flex items-center gap-1.5 shadow-sm"
        >
          <Receipt className="w-4 h-4" />
          <span>Configure Company Profiles</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {err ? <Empty icon="⚠️" title="Could not load settings" sub={err} />
        : !g ? <Skeleton h={220} />
        : (
          <><div className="card"><div className="card-pad"><div className="form-grid">
            <Field label="Currency"><input value={g.currency || ''} onChange={(e) => set('currency', e.target.value)} /></Field>
            <Field label="Tax % (GST)"><input type="number" value={g.taxPct ?? ''} onChange={(e) => set('taxPct', Number(e.target.value))} /></Field>
            <Field label="Tax display"><select value={g.taxDisplay || 'inclusive'} onChange={(e) => set('taxDisplay', e.target.value)}><option value="inclusive">Inclusive</option><option value="exclusive">Exclusive</option></select></Field>
            <Field label="Order prefix"><input value={g.orderPrefix || ''} onChange={(e) => set('orderPrefix', e.target.value)} /></Field>
            <Field label="Quotation prefix"><input value={g.quotePrefix || ''} onChange={(e) => set('quotePrefix', e.target.value)} /></Field>
            <Field label="Low-stock threshold"><input type="number" value={g.lowStockThreshold ?? ''} onChange={(e) => set('lowStockThreshold', Number(e.target.value))} /></Field>
            <Field label="Product visibility default"><select value={String(!!g.visibilityDefault)} onChange={(e) => set('visibilityDefault', e.target.value === 'true')}><option value="true">Visible</option><option value="false">Hidden</option></select></Field>
            <Field label="Quotations enabled"><select value={String(!!g.quotationEnabled)} onChange={(e) => set('quotationEnabled', e.target.value === 'true')}><option value="true">Enabled</option><option value="false">Disabled</option></select></Field>
            <Field full label="Storefront announcement"><input value={g.announcement || ''} onChange={(e) => set('announcement', e.target.value)} /></Field>
          </div>
          {ferr && <p className="ferr">{ferr}</p>}
          </div></div>
          <div className="section-head"><h2>Company overrides</h2></div>
          <div className="card"><div className="card-pad">
            <DataTable
              cols={[
                { key: 'co', label: 'Company', render: (c) => (<><b>{c.logo} {c.name}</b><div className="hint">{c.code} • {c.city}</div></>) },
                { key: 'st', label: 'Store', render: (c) => (c.storeStatus || c.status) },
                { key: 'inv', label: 'Invoice Profile', render: (c) => <a className="btn btn-primary btn-xs bg-emerald-600 hover:bg-emerald-700 text-white border-none shadow-xs" href={'#/admin/settings?tab=invoice&companyId=' + c.id}>Invoice Profile 🧾</a> },
                { key: 'act', label: '', render: (c) => <a className="btn btn-ghost btn-sm" href={'#/super/companies/' + c.id}>Open →</a> }
              ]}
              rows={cos} rowKey={(c) => c.id} empty="No companies."
            />
            <p className="hint">Per-company store settings are managed on each company's workspace (Settings tab) and always win over these defaults.</p>
          </div></div></>
        )}
    </div>
  );
}
