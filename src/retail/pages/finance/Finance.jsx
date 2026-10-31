/* Finance review — checks the content a Content Writer submitted, prices it, then
   either returns it for correction or approves & publishes it to the Sales catalog.
   Approving is the ONLY action in this system that makes a listing visible to Sales. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fmt, imgFallback } from '../../api';
import { PageHero, PageHead, Empty, Skeleton, Pager, Field, Confirm, Modal, toast } from '../../components/ui';
import {
  ArrowLeft, BadgeIndianRupee, CheckCircle2, Eye, FileText,
  Loader2, Package, RotateCcw, Save, Send, IndianRupee
} from 'lucide-react';
import { StageBadge, ytId } from '../content/ContentWriter';

const fmtDate = (s) => (s ? new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

const TABS = [
  { id: 'queue', label: 'Awaiting my review', stages: 'submitted_to_finance,finance_review' },
  { id: 'pricing_saved', label: 'Priced, not published', stages: 'pricing_saved' },
  { id: 'published', label: 'Published', stages: 'published' },
  { id: 'all', label: 'All', stages: 'all' }
];

export default function FinanceReview() {
  const { id } = useParams();
  return id ? <FinanceDetail id={id} /> : <FinanceQueue />;
}

/* ---------------------------------------------------------------- queue */
function FinanceQueue() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('queue');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(true);

  const load = useCallback(() => {
    setBusy(true);
    const stages = (TABS.find((t) => t.id === tab) || TABS[0]).stages;
    const p = new URLSearchParams({ page: String(page), limit: '10', stage: stages });
    if (q.trim()) p.set('q', q.trim());
    return api.get('/api/workflow?' + p.toString())
      .then((d) => setData(d || { rows: [], total: 0, counts: {} }))
      .catch((e) => toast(e.message, '⚠️'))
      .finally(() => setBusy(false));
  }, [page, tab, q]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const counts = (data && data.counts) || {};
  const rows = (data && data.rows) || [];
  const tabCount = (t) => {
    if (t.id === 'all') return (data && data.total) || 0;
    if (t.id === 'queue') return (counts.submitted_to_finance || 0) + (counts.finance_review || 0);
    if (t.id === 'pricing_saved') return counts.pricing_saved || 0;
    if (t.id === 'published') return counts.published || 0;
    return 0;
  };

  return (
    <>
      <PageHero
        icon={IndianRupee}
        title="Finance & Pricing Review"
        badgeText="Publishing Step 2"
        badgeColor="teal"
        gradient="from-teal-600 via-emerald-600 to-cyan-600"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 shadow-2xs">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setTab(t.id); setPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                    tab === t.id
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <span>{t.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    tab === t.id ? 'bg-teal-100 text-teal-800 font-extrabold' : 'bg-slate-200/70 text-slate-600'
                  }`}>
                    {tabCount(t)}
                  </span>
                </button>
              ))}
            </div>
            <Link className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors whitespace-nowrap" to="/content">
              ← Content queue
            </Link>
          </div>
        }
      />

      {busy && !data ? (
        <Skeleton h={72} count={4} />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white">
          <Empty icon="🧾" title="Nothing to review" sub="Products appear here as soon as a Content Writer submits them for pricing." />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Media</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3 max-w-[280px]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0 text-slate-400 overflow-hidden relative">
                        <Package className="w-5 h-5 text-slate-400" />
                        {(p.images || [])[0] && (
                          <img
                            src={p.images[0]}
                            alt=""
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">{p.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono truncate">{p.sku || p.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.categoryName || p.category || '—'}</td>
                  <td className="px-4 py-3 font-mono font-bold text-slate-800">{p.stock ?? '—'}</td>
                  <td className="px-4 py-3"><StageBadge stage={p.workflow_stage} label={p.stageLabel} /></td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{p.mediaStats?.images || 0} img · {p.mediaStats?.documents || 0} pdf · {(p.mediaStats?.videos || 0) + (p.mediaStats?.youtube || 0)} vid</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {p.price == null
                      ? <span className="text-amber-700 font-bold">Not set</span>
                      : <span className="font-mono font-bold text-slate-900">{fmt(p.price)}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(p.workflow_updated_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link className="btn btn-ghost btn-sm" to={'/finance/' + p.id}>
                      {p.workflow_stage === 'published' ? 'View' : 'Review'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 pb-3"><Pager total={data.total} page={data.page} limit={data.limit} onPage={setPage} /></div>
        </div>
      )}
    </>
  );
}

function Tile({ value, label, sub, tone, onClick, active }) {
  const tones = {
    violet: 'from-violet-500 to-purple-600',
    blue: 'from-blue-500 to-indigo-500',
    emerald: 'from-emerald-500 to-teal-500',
    red: 'from-rose-500 to-red-500'
  };
  return (
    <div
      onClick={onClick}
      className={`rounded-xl px-3 py-2 text-white bg-gradient-to-br ${tones[tone] || tones.blue} shadow-xs min-h-[56px] flex flex-col justify-between transition-all ${
        onClick ? 'cursor-pointer hover:opacity-95 hover:scale-[1.01] active:scale-[0.98]' : ''
      } ${active ? 'ring-2 ring-offset-2 ring-slate-800' : ''}`}
    >
      <div className="flex items-baseline justify-between gap-1">
        <div className="text-lg sm:text-xl font-black font-mono tracking-tight leading-none">{value}</div>
      </div>
      <div className="mt-0.5 min-w-0">
        <div className="text-[11px] font-bold opacity-95 leading-tight truncate">{label}</div>
        {sub && <div className="text-[9.5px] opacity-80 mt-0.5 leading-tight truncate">{sub}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- detail */
function FinanceDetail({ id }) {
  const nav = useNavigate();
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmReturn, setConfirmReturn] = useState(false);
  const [returnComment, setReturnComment] = useState('');
  const [roles, setRoles] = useState([
    { id: 'sales_regional_partner', markupPct: 10 },
    { id: 'sales_channel_partner', markupPct: 15 },
    { id: 'sales_referral_partner', markupPct: 5 }
  ]);

  useEffect(() => {
    api.get('/api/permissions/roles').then((r) => {
      const list = Array.isArray(r) ? r : (r && r.data) || [];
      if (list.length > 0) setRoles(list);
    }).catch(() => {});
  }, []);

  const load = useCallback(() => {
    api.get('/api/workflow/' + id)
      .then((d) => { setP(d); setPrice(d.price == null ? '' : String(d.price)); setNote(d.pricing_note || ''); })
      .catch((e) => setErr(e.message));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const media = useMemo(() => (p && Array.isArray(p.media) ? p.media : []), [p]);
  const images = media.filter((m) => m.type === 'image');
  const docs = media.filter((m) => m.type === 'document');
  const videos = media.filter((m) => m.type === 'video');
  const yts = media.filter((m) => m.type === 'youtube');
  const specs = p && p.specs && typeof p.specs === 'object' ? Object.entries(p.specs) : [];
  const perm = (p && p.permissions) || {};

  async function act(kind, body) {
    setBusy(kind);
    try {
      await api.post('/api/workflow/' + id + '/' + kind, body || {});
      load();
    } catch (e) { toast(e.message, '⚠️'); }
    finally { setBusy(''); }
  }

  async function savePricing() {
    setBusy('pricing');
    try {
      const raw = price.trim();
      await api.put('/api/workflow/' + id + '/pricing', { price: raw === '' ? null : Number(raw), note });
      toast('Price saved as draft — listing is still hidden from Sales', '💰');
      load();
    } catch (e) { toast(e.message, '⚠️'); }
    finally { setBusy(''); }
  }

  async function approve() {
    setBusy('approve');
    try {
      const raw = price.trim();
      const body = { note, ...(raw === '' ? { allow_rfq: true } : {}) };
      await api.post('/api/workflow/' + id + '/approve', body);
      toast('Approved and published to the Sales catalog', '✅');
      setConfirmApprove(false);
      load();
    } catch (e) { toast(e.message, '⚠️'); }
    finally { setBusy(''); }
  }

  async function sendBack() {
    setBusy('return');
    try {
      await api.post('/api/workflow/' + id + '/return', { comment: returnComment });
      toast('Returned to Content Writer with your comments', '↩️');
      setConfirmReturn(false);
      setReturnComment('');
      load();
    } catch (e) { toast(e.message, '⚠️'); }
    finally { setBusy(''); }
  }

  if (err) return <Empty icon="⚠️" title="Could not load product" sub={err} action={<Link className="btn btn-ghost btn-sm" to="/finance">← Back to queue</Link>} />;
  if (!p) return <Skeleton h={90} count={5} />;

  const priceEmpty = price.trim() === '';

  return (
    <>
      {/* Combined Single-Line Header */}
      <div className="bg-white rounded-xl border border-slate-200/90 px-4 py-2.5 sm:px-5 sm:py-3 shadow-xs mb-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap min-w-0">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
            {`Finance Review · ${p.categoryName || p.category || 'Uncategorised'}`}
          </span>
          <span className="text-slate-300">•</span>
          <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight truncate max-w-xs sm:max-w-md">
            {p.name}
          </h1>
          <StageBadge stage={p.workflow_stage} label={p.stageLabel} />
          <span className="text-[11px] text-slate-500 hidden md:inline">
            {p.workflow_stage === 'published'
              ? `Published ${fmtDate(p.published_at)} by ${p.approved_by || 'Finance'}`
              : `Submitted by ${p.submitted_by || 'Content Writer'} ${fmtDate(p.submitted_at)}`}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          <Link className="btn btn-ghost btn-sm" to="/finance"><ArrowLeft className="w-3.5 h-3.5" /> Queue</Link>
          {perm.canPrice && (
            <button className="btn btn-ghost btn-sm" type="button" disabled={!!busy} onClick={savePricing}>
              {busy === 'pricing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save price draft
            </button>
          )}
          {perm.canReturn && (
            <button className="btn btn-ghost btn-sm" type="button" disabled={!!busy} onClick={() => setConfirmReturn(true)}>
              <RotateCcw className="w-3.5 h-3.5" /> Return for correction
            </button>
          )}
          {perm.canStartReview && (
            <button className="btn btn-ghost btn-sm" type="button" disabled={!!busy} onClick={() => act('start-review')}>Mark as under review</button>
          )}
          {p.workflow_stage === 'published' && (
            <Link className="btn btn-ghost btn-sm" to={'/store/product/' + p.id}><Eye className="w-3.5 h-3.5" /> View in store</Link>
          )}
          {perm.canApprove && (
            <button className="btn btn-primary btn-sm" type="button" disabled={!!busy} onClick={() => setConfirmApprove(true)}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Approve &amp; publish
            </button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 items-start">
        {/* ------- content under review ------- */}
        <div className="lg:col-span-2 space-y-5">
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5">
            <h3 className="font-extrabold text-slate-900 text-sm mb-3">Product content</h3>
            <h4 className="text-lg font-black text-slate-900">{p.name}</h4>
            {p.short && <p className="text-sm text-slate-600 mt-1">{p.short}</p>}
            <div className="mt-4 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
              {p.desc || <span className="text-amber-700 font-semibold">No sales description provided.</span>}
            </div>
            {specs.length > 0 && (
              <table className="w-full text-xs mt-4 border border-slate-200 rounded-xl overflow-hidden">
                <tbody className="divide-y divide-slate-100">
                  {specs.map(([k, v]) => (
                    <tr key={k}>
                      <td className="px-3 py-2 bg-slate-50 font-bold text-slate-700 w-1/2 align-top">{k}</td>
                      <td className="px-3 py-2 text-slate-800 font-mono break-all">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5">
            <h3 className="font-extrabold text-slate-900 text-sm mb-4">Media supplied by Content Writer</h3>
            <div className="space-y-5">
              <Group label={`Images (${images.length})`}>
                {images.length
                  ? <div className="flex flex-wrap gap-3">{images.map((m) => (
                      <figure key={m.id} className="w-32">
                        <img src={m.url} alt={m.alt || m.title || ''} className="w-32 h-32 rounded-xl object-cover border border-slate-200" />
                        <figcaption className="text-[10px] text-slate-500 mt-1 truncate">{m.alt || 'No description'}</figcaption>
                      </figure>
                    ))}</div>
                  : <p className="text-xs text-amber-700 font-semibold">⚠ No images supplied.</p>}
              </Group>

              <Group label={`Documents (${docs.length})`}>
                {docs.length
                  ? <div className="flex flex-wrap gap-2">{docs.map((m) => (
                      <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50">
                        <FileText className="w-4 h-4 text-red-500" /> {m.title || 'Document'}
                      </a>
                    ))}</div>
                  : <p className="text-xs text-slate-400">No brochures or spec sheets.</p>}
              </Group>

              <Group label={`Videos (${videos.length + yts.length})`}>
                {videos.map((v) => <video key={v.id} src={v.url} controls className="w-full max-w-sm rounded-xl" />)}
                {yts.filter((y) => ytId(y.url)).map((y) => (
                  <iframe key={y.id} className="w-full max-w-sm aspect-video rounded-xl border border-slate-200" src={`https://www.youtube.com/embed/${ytId(y.url)}`} title={y.title || 'Product video'} allowFullScreen />
                ))}
                {!videos.length && !yts.length && <p className="text-xs text-slate-400">No videos.</p>}
              </Group>

              {!images.length && !docs.length && !videos.length && !yts.length && (
                <p className="text-xs text-amber-700 font-semibold">⚠ No media supplied — consider returning this product for correction.</p>
              )}
            </div>
          </section>
        </div>

        {/* ------- pricing + facts ------- */}
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5">
            <h3 className="font-extrabold text-slate-900 text-sm mb-1 flex items-center gap-1.5"><BadgeIndianRupee className="w-4 h-4" /> Pricing</h3>
            <p className="text-[11px] text-slate-500 mb-4">Only the selling price is set here — tax and margin rules are unchanged. Saving does <b>not</b> publish.</p>

            <Field label="Selling price (₹)" hint="Leave empty to publish as quotation-only (RFQ).">
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                disabled={!perm.canPrice}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g. 1000"
              />
            </Field>

            {Number(price) > 0 && (
              <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="text-[11px] font-bold text-slate-800 flex items-center justify-between">
                  <span>Live Partner Tier Pricing (Base: ₹{Number(price).toLocaleString('en-IN')})</span>
                  <span className="text-[10px] text-blue-600 font-semibold">Auto-computed</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-bold">Regional (+{roles.find((r) => r.id === 'sales_regional_partner')?.markupPct ?? 10}%)</div>
                    <div className="text-xs font-black font-mono text-blue-700 mt-0.5">
                      ₹{Math.round(Number(price) * (1 + (roles.find((r) => r.id === 'sales_regional_partner')?.markupPct ?? 10) / 100)).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-bold">Channel (+{roles.find((r) => r.id === 'sales_channel_partner')?.markupPct ?? 15}%)</div>
                    <div className="text-xs font-black font-mono text-purple-700 mt-0.5">
                      ₹{Math.round(Number(price) * (1 + (roles.find((r) => r.id === 'sales_channel_partner')?.markupPct ?? 15) / 100)).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-bold">Referral (+{roles.find((r) => r.id === 'sales_referral_partner')?.markupPct ?? 5}%)</div>
                    <div className="text-xs font-black font-mono text-emerald-700 mt-0.5">
                      ₹{Math.round(Number(price) * (1 + (roles.find((r) => r.id === 'sales_referral_partner')?.markupPct ?? 5) / 100)).toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 m-0">
                  Logged-in partners see their specific tier amount automatically. Percentages can be adjusted in Company Users &rarr; Manage Roles &amp; Tiers.
                </p>
              </div>
            )}

            <Field label="Finance note" hint="Visible to admins and in the audit trail.">
              <textarea rows={3} value={note} disabled={!perm.canPrice} onChange={(e) => setNote(e.target.value)} placeholder="Pricing rationale, discount applied, effective date…" />
            </Field>

            {perm.canPrice && (
              <button className="btn btn-ghost btn-sm w-full mt-1" type="button" disabled={!!busy} onClick={savePricing}>
                {busy === 'pricing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save price draft
              </button>
            )}

            {perm.canApprove && (
              <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                <div className="text-xs font-bold text-emerald-900 mb-1.5">Ready to publish?</div>
                <p className="text-[11px] text-emerald-800 mb-2.5">
                  {priceEmpty
                    ? 'No price set — this will publish as a quotation-only (RFQ) listing.'
                    : `Will publish at ${fmt(Number(price))} and become visible to Salespeople.`}
                </p>
                <button className="btn btn-primary btn-sm w-full" type="button" disabled={!!busy} onClick={() => setConfirmApprove(true)}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve &amp; publish
                </button>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5">
            <h3 className="font-extrabold text-slate-900 text-sm mb-3">BI facts</h3>
            <dl className="space-y-2 text-xs">
              <Row k="SKU" v={p.sku || p.id} mono />
              <Row k="Brand" v={p.brand || '—'} />
              <Row k="MPN" v={p.mpn || '—'} mono />
              <Row k="Category" v={p.categoryName || p.category || '—'} />
              <Row k="Unit" v={p.uom || '—'} />
              <Row k="Warehouse" v={p.warehouse || '—'} mono />
              <Row k="Stock" v={p.stock ?? '—'} mono strong />
              {p.erp_item_id && <Row k="BI product ID" v={p.erp_item_id} mono />}
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5">
            <h3 className="font-extrabold text-slate-900 text-sm mb-3">Status history</h3>
            {(!p.workflow_history || !p.workflow_history.length)
              ? <p className="text-xs text-slate-400">No recorded actions yet.</p>
              : (
                <ol className="space-y-3">
                  {p.workflow_history.map((h) => (
                    <li key={h.id} className="text-xs border-l-2 border-slate-200 pl-3">
                      <div className="font-bold text-slate-800">{h.stage || String(h.to || '').replace(/_/g, ' ')}</div>
                      <div className="text-slate-500">{h.by || 'system'} · {fmtDate(h.ts)}</div>
                      {h.note && <div className="text-slate-600 mt-0.5">“{h.note}”</div>}
                    </li>
                  ))}
                </ol>
              )}
          </section>
        </div>
      </div>

      {confirmApprove && (
        <Confirm
          title="Approve and publish to Sales?"
          body={`<b>${p.name}</b> will become <b>visible to Salespeople</b> at ${priceEmpty ? '<b>quotation-only (no price)</b>' : `<b>${fmt(Number(price))}</b>`}. This is the only action that publishes the listing.`}
          okLabel="Approve & publish"
          busy={busy === 'approve'}
          onCancel={() => setConfirmApprove(false)}
          onOk={approve}
        />
      )}

      {confirmReturn && (
        <Modal title="↩ Return for correction" onClose={() => setConfirmReturn(false)}>
          <p className="text-[11px] text-slate-500 mb-4">The Content Writer sees your comments and can edit and resubmit. The product is hidden from Sales while returned.</p>
          <textarea rows={4} value={returnComment} onChange={(e) => setReturnComment(e.target.value)} placeholder="e.g. Replace the first image with a clear product shot, and add the chuck size to the specs table." />
          <div className="flex gap-2 justify-end mt-4">
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setConfirmReturn(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" type="button" disabled={busy === 'return' || returnComment.trim().length < 3} onClick={sendBack}>
              {busy === 'return' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Return to Content Writer
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Group({ label, children }) {
  return (
    <div>
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mb-2">{label}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ k, v, mono, strong }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-slate-500 flex-shrink-0">{k}</dt>
      <dd className={`text-right ${mono ? 'font-mono' : ''} ${strong ? 'font-extrabold text-slate-900' : 'font-semibold text-slate-800'} break-all`}>{v}</dd>
    </div>
  );
}
