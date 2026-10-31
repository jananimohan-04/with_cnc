/* Content Writer workspace — products that arrived from BI Inventory are written up
   here (copy, specs, images, PDFs, video, YouTube) and then handed to Finance.
   Nothing on this screen publishes anything to Sales: submission alone never sets visible. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, uploadFiles, imgFallback } from '../../api';
import { PageHero, PageHead, Empty, Skeleton, Pager, Field, Modal, Confirm, toast } from '../../components/ui';
import {
  ArrowLeft, CheckCircle2, CircleAlert, FileText, Film, ImageIcon,
  Loader2, MonitorPlay, Package, Plus, Save, Send, Trash2, Upload, PenLine,
  Star, ExternalLink, Eye
} from 'lucide-react';

/* ---------------------------------------------------------------- stage chips */
const STAGE_STYLE = {
  content_pending: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  content_in_progress: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  submitted_to_finance: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  finance_review: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  returned_for_correction: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  pricing_saved: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
  published: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' }
};

export function StageBadge({ stage, label }) {
  let displayLabel = label;
  let customStyle = STAGE_STYLE[stage];

  if (['submitted_to_finance', 'finance_review', 'pricing_saved'].includes(stage)) {
    displayLabel = 'Waiting for Finance';
    customStyle = { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' };
  } else if (stage === 'content_pending') {
    displayLabel = 'Needs Content';
    customStyle = { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
  } else if (stage === 'content_in_progress') {
    displayLabel = 'In Progress';
    customStyle = { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
  } else if (stage === 'published') {
    displayLabel = 'Published';
    customStyle = { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
  } else if (stage === 'returned_for_correction') {
    displayLabel = 'Needs Correction';
    customStyle = { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' };
  }

  const s = customStyle || STAGE_STYLE[stage] || { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide border whitespace-nowrap ${s.bg} ${s.text} ${s.border}`}>
      {displayLabel || String(stage || '—').replace(/_/g, ' ')}
    </span>
  );
}

/* youtube watch/shorts/embed url → video id (null when not a YouTube link) */
export const ytId = (u) => {
  const m = String(u || '').match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{5,})/i);
  return m ? m[1] : null;
};

const fmtDate = (s) => (s ? new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

/* ---------------------------------------------------------------- entry point */
export default function ContentWriter() {
  const { id } = useParams();
  return id ? <ContentEditor id={id} /> : <ContentQueue />;
}

/* ---------------------------------------------------------------- queue */
const TABS = [
  { id: 'all', label: 'All Products', stages: 'all' },
  { id: 'needs_content', label: 'Needs Content', stages: 'content_pending,returned_for_correction' },
  { id: 'content_in_progress', label: 'In Progress', stages: 'content_in_progress' },
  { id: 'published', label: 'Published', stages: 'submitted_to_finance,finance_review,pricing_saved,published' }
];

function ContentQueue() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('all');
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
    if (t.id === 'needs_content') return (counts.content_pending || 0) + (counts.returned_for_correction || 0);
    if (t.id === 'content_in_progress') return counts.content_in_progress || 0;
    if (t.id === 'published') return (counts.submitted_to_finance || 0) + (counts.finance_review || 0) + (counts.pricing_saved || 0) + (counts.published || 0);
    return 0;
  };

  return (
    <>
      <PageHero
        icon={PenLine}
        title="Content Writer Workspace"
        badgeText="Publishing Step 1"
        badgeColor="fuchsia"
        gradient="from-fuchsia-600 via-pink-600 to-purple-600"
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
                    tab === t.id ? 'bg-fuchsia-100 text-fuchsia-800 font-extrabold' : 'bg-slate-200/70 text-slate-600'
                  }`}>
                    {tabCount(t)}
                  </span>
                </button>
              ))}
            </div>
            <Link className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors whitespace-nowrap" to="/finance">
              Finance queue →
            </Link>
          </div>
        }
      />

      {busy && !data ? (
        <Skeleton h={72} count={4} />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white">
          <Empty
            icon="📦"
            title="Nothing in this queue"
            sub={tab === 'mine'
              ? 'New products appear here the moment the BI assigns them to the Retail Store warehouse.'
              : 'No products currently match this stage.'}
          />
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
                <th className="px-4 py-3">Content</th>
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
                        <div className="text-[11px] text-slate-500 font-mono truncate">{p.sku || p.id}{p.brand ? ' · ' + p.brand : ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.categoryName || p.category || '—'}</td>
                  <td className="px-4 py-3 font-mono font-bold text-slate-800">{p.stock ?? '—'}</td>
                  <td className="px-4 py-3"><StageBadge stage={p.workflow_stage} label={p.stageLabel} /></td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {p.erp_synced && <span className="mr-1.5 text-[10px] font-extrabold uppercase text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">BI</span>}
                    {(p.mediaStats?.images || 0)} img · {(p.mediaStats?.documents || 0)} pdf · {(p.mediaStats?.youtube || 0)} yt
                  </td>
                  <td className="px-4 py-3">
                    {p.contentReady
                      ? <span className="inline-flex items-center gap-1 text-emerald-700 font-bold"><CheckCircle2 className="w-3.5 h-3.5" /> Ready</span>
                      : <span className="inline-flex items-center gap-1 text-amber-700 font-bold"><CircleAlert className="w-3.5 h-3.5" /> Incomplete</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(p.workflow_updated_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link className="btn btn-ghost btn-sm" to={'/content/' + p.id}>
                      {p.workflow_stage === 'returned_for_correction' ? 'Fix & resubmit' : 'Open'}
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

function StatTile({ value, label, sub, tone, onClick, active }) {
  const tones = {
    amber: 'from-amber-500 to-orange-500',
    red: 'from-rose-500 to-red-500',
    blue: 'from-blue-500 to-indigo-500',
    emerald: 'from-emerald-500 to-teal-500'
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

/* ---------------------------------------------------------------- editor */
function ContentEditor({ id }) {
  const nav = useNavigate();
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [short, setShort] = useState('');
  const [desc, setDesc] = useState('');
  const [specs, setSpecs] = useState([]);
  const [staged, setStaged] = useState([]);   // { key, file, url, kind, title, description, alt, status, error }
  const [mediaEdits, setMediaEdits] = useState({}); // { [mId]: { title, description } }
  const [mediaFilter, setMediaFilter] = useState('all'); // 'all' | 'image' | 'document' | 'video'
  const [savingMediaId, setSavingMediaId] = useState(null);

  const [ytOpen, setYtOpen] = useState(false);
  const [ytUrl, setYtUrl] = useState('');
  const [ytTitle, setYtTitle] = useState('');
  const [ytDesc, setYtDesc] = useState('');
  const [preview, setPreview] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const load = useCallback(() => {
    api.get('/api/workflow/' + id)
      .then((d) => {
        setP(d);
        setShort(d.short || '');
        setDesc(d.desc || '');
        const sp = d.specs && typeof d.specs === 'object' ? Object.entries(d.specs) : [];
        setSpecs(sp.length ? sp.map(([k, v]) => ({ k, v })) : [{ k: '', v: '' }]);
      })
      .catch((e) => setErr(e.message));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const media = useMemo(() => (p && Array.isArray(p.media) ? p.media : []), [p]);
  const images = media.filter((m) => m.type === 'image');
  const docs = media.filter((m) => m.type === 'document');
  const videos = media.filter((m) => m.type === 'video');
  const yts = media.filter((m) => m.type === 'youtube');
  const perm = (p && p.permissions) || {};

  /* ---- local file staging (uploaded on save, not before) ---- */
  function stageFiles(fileList) {
    const next = [];
    for (const f of Array.from(fileList || [])) {
      const isImg = /^image\//.test(f.type);
      const isVid = /^video\//.test(f.type);
      const isPdf = f.type === 'application/pdf';
      if (!isImg && !isVid && !isPdf) { toast(`${f.name}: only images, videos and PDFs can be uploaded`, '⚠️'); continue; }
      if (f.size > 50 * 1024 * 1024) { toast(`${f.name}: file must be under 50 MB`, '⚠️'); continue; }
      next.push({
        key: f.name + '-' + f.size + '-' + Math.random().toString(36).slice(2, 7),
        file: f,
        url: URL.createObjectURL(f),
        kind: isPdf ? 'document' : (isVid ? 'video' : 'image'),
        title: isPdf ? f.name.replace(/\.pdf$/i, '') : '',
        description: '',
        alt: '',
        status: 'ready'
      });
    }
    setStaged((s) => [...s, ...next]);
  }

  function updateStaged(key, field, val) {
    setStaged((s) => s.map((x) => (x.key === key ? { ...x, [field]: val } : x)));
  }

  function dropStaged(key) {
    setStaged((s) => {
      const hit = s.find((x) => x.key === key);
      if (hit && hit.url.startsWith('blob:')) URL.revokeObjectURL(hit.url);
      return s.filter((x) => x.key !== key);
    });
  }

  /* ---- local edits on existing media ---- */
  function handleMediaEdit(mId, field, val) {
    setMediaEdits((prev) => ({
      ...prev,
      [mId]: {
        ...(prev[mId] || {}),
        [field]: val
      }
    }));
  }

  function getMediaVal(m, field) {
    if (mediaEdits[m.id] && mediaEdits[m.id][field] !== undefined) {
      return mediaEdits[m.id][field];
    }
    if (field === 'title') return m.title || '';
    if (field === 'description') return m.description || m.alt || '';
    return m[field] || '';
  }

  async function quickSaveMedia(m) {
    const edits = mediaEdits[m.id];
    if (!edits) return;
    setSavingMediaId(m.id);
    try {
      await api.patch('/api/media/' + m.id, {
        title: edits.title !== undefined ? edits.title : (m.title || ''),
        description: edits.description !== undefined ? edits.description : (m.description || m.alt || ''),
        alt: edits.description !== undefined ? edits.description : (m.description || m.alt || '')
      });
      toast('Media details saved', '✓');
      setMediaEdits((prev) => {
        const next = { ...prev };
        delete next[m.id];
        return next;
      });
      load();
    } catch (e) {
      toast(e.message, '⚠️');
    } finally {
      setSavingMediaId(null);
    }
  }

  async function setPrimary(m) {
    try {
      await api.patch('/api/media/' + m.id, { primary: true });
      toast('Set as primary image', '⭐');
      load();
    } catch (e) {
      toast(e.message, '⚠️');
    }
  }

  /* ---- persist content + staged uploads + modified media ---- */
  async function save({ silent } = {}) {
    setSaving(true);
    try {
      /* 1. copy + specs */
      const specObj = {};
      specs.forEach(({ k, v }) => { const key = String(k || '').trim(); if (key) specObj[key] = String(v || ''); });
      await api.put('/api/workflow/' + id + '/content', { short, desc, specs: specObj });

      /* 2. upload staged files, then register their metadata */
      const fresh = staged.filter((s) => s.status === 'ready' && s.file);
      if (fresh.length) {
        const urls = await uploadFiles(fresh.map((s) => s.file));
        for (let i = 0; i < fresh.length; i++) {
          setStaged((s) => s.map((x) => (x.key === fresh[i].key ? { ...x, status: 'uploading' } : x)));
          await api.post('/api/media', {
            productId: id,
            type: fresh[i].kind,
            url: urls[i],
            title: fresh[i].title || '',
            description: fresh[i].description || fresh[i].alt || '',
            alt: fresh[i].alt || fresh[i].description || ''
          });
          setStaged((s) => s.map((x) => (x.key === fresh[i].key ? { ...x, status: 'done' } : x)));
        }
        setStaged((s) => s.filter((x) => x.status !== 'done'));
        if (!silent) toast('Media uploaded', '📎');
      }

      /* 3. persist any modified titles/descriptions for existing media */
      const editEntries = Object.entries(mediaEdits);
      if (editEntries.length) {
        for (const [mId, edits] of editEntries) {
          await api.patch('/api/media/' + mId, {
            ...(edits.title !== undefined ? { title: edits.title } : {}),
            ...(edits.description !== undefined ? { description: edits.description, alt: edits.description } : {})
          });
        }
        setMediaEdits({});
      }

      load();
      if (!silent) toast('Draft saved (moved to In Progress)', '💾');
    } catch (e) {
      setStaged((s) => s.map((x) => (x.status === 'uploading' ? { ...x, status: 'ready', error: e.message } : x)));
      toast(e.message, '⚠️');
    } finally { setSaving(false); }
  }

  async function addYoutube() {
    const u = ytUrl.trim();
    if (!ytId(u)) return toast('Enter a valid YouTube link (youtube.com/watch?v=… or youtu.be/…)', '⚠️');
    try {
      await api.post('/api/media', {
        productId: id,
        type: 'youtube',
        url: u,
        title: ytTitle.trim(),
        description: ytDesc.trim()
      });
      setYtUrl(''); setYtTitle(''); setYtDesc(''); setYtOpen(false);
      toast('YouTube video attached', '▶️');
      load();
    } catch (e) { toast(e.message, '⚠️'); }
  }

  async function removeMedia(m) {
    try { await api.del('/api/media/' + m.id); toast('Media removed', '🗑'); load(); }
    catch (e) { toast(e.message, '⚠️'); }
  }

  async function submitToFinance() {
    setSubmitting(true);
    try {
      await save({ silent: true });
      await api.post('/api/workflow/' + id + '/submit', { note: '' });
      toast('Sent to Accounts / Finance team!', '📤');
      nav('/content');
    } catch (e) { toast(e.message, '⚠️'); }
    finally { setSubmitting(false); setConfirmSubmit(false); }
  }

  if (err) return <Empty icon="⚠️" title="Could not load product" sub={err} action={<Link className="btn btn-ghost btn-sm" to="/content">← Back to queue</Link>} />;
  if (!p) return <Skeleton h={90} count={5} />;

  const canSave = perm.canEditContent || perm.canStartContent;
  const stagedReady = staged.filter((s) => s.status === 'ready').length;

  /* Filter media items for Col 2 */
  const stagedFiltered = staged.filter((s) => {
    if (mediaFilter === 'image') return s.kind === 'image';
    if (mediaFilter === 'document') return s.kind === 'document';
    if (mediaFilter === 'video') return s.kind === 'video';
    return true;
  });

  const mediaFiltered = media.filter((m) => {
    if (mediaFilter === 'image') return m.type === 'image';
    if (mediaFilter === 'document') return m.type === 'document';
    if (mediaFilter === 'video') return m.type === 'video' || m.type === 'youtube';
    return true;
  });

  const stagedImagesCount = staged.filter((s) => s.kind === 'image').length;
  const stagedDocsCount = staged.filter((s) => s.kind === 'document').length;
  const stagedVideosCount = staged.filter((s) => s.kind === 'video').length;

  return (
    <div className="flex flex-col lg:h-[calc(100vh-76px)] lg:overflow-hidden min-h-0">
      {/* Combined Single-Line Header */}
      <div className="bg-white rounded-xl border border-slate-200/90 px-3.5 py-2 shadow-2xs mb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <Link to="/content" className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-colors" title="Back to Queue">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
            {`Content Writer · ${p.categoryName || p.category || 'Uncategorised'}`}
          </span>
          <span className="text-slate-300">•</span>
          <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight truncate max-w-xs sm:max-w-md">
            {p.name}
          </h1>
          <StageBadge stage={p.workflow_stage} label={p.stageLabel} />
          <span className="text-[10.5px] text-slate-500 hidden xl:inline">
            Last updated {fmtDate(p.workflow_updated_at)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
          <button className="btn btn-ghost btn-sm text-xs py-1 px-2.5 h-8" type="button" onClick={() => setPreview(true)}>
            <Eye className="w-3.5 h-3.5" /> Preview listing
          </button>
          {canSave && (
            <button className="btn btn-ghost btn-sm border border-slate-200 text-xs py-1 px-2.5 h-8" type="button" disabled={saving || submitting} onClick={() => save()}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Saving…' : 'Save draft'}
            </button>
          )}
          {canSave && (
            <button
              className="btn btn-primary btn-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs text-xs py-1 px-3 h-8"
              type="button"
              disabled={submitting || saving}
              onClick={() => setConfirmSubmit(true)}
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send to Accounts / Finance
            </button>
          )}
        </div>
      </div>

      {p.workflow_stage === 'returned_for_correction' && p.return_comment && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-1.5 text-xs text-red-800 mb-2 flex-shrink-0">
          <b className="font-extrabold">Finance asked for a correction ({p.returned_by || 'Finance'}):</b> {p.return_comment}
        </div>
      )}

      {/* 3-Column Balanced Dashboard Layout */}
      <div className="flex-1 min-h-0 grid lg:grid-cols-12 gap-2.5 items-stretch">
        {/* Column 1: Sales Copy & Technical Specs */}
        <div className="lg:col-span-4 flex flex-col h-full min-h-0 bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3">
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100 flex-shrink-0">
            <div>
              <h3 className="font-extrabold text-slate-900 text-xs">Sales Copy &amp; Specifications</h3>
              <p className="text-[10px] text-slate-400">Written for catalog &amp; storefront listings</p>
            </div>
          </div>

          <div className="flex-shrink-0 mb-2">
            <label className="block text-[10.5px] font-bold text-slate-700 mb-1">
              Short description <span className="text-slate-400 font-normal">(one-line summary for listings)</span>
            </label>
            <input
              value={short}
              maxLength={400}
              disabled={!canSave}
              onChange={(e) => setShort(e.target.value)}
              placeholder="e.g. O10mm 4-flute solid carbide end mill, AlCrN coated"
              className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-300 focus:outline-none transition-colors"
            />
          </div>

          <div className="flex-shrink-0 mb-2">
            <label className="block text-[10.5px] font-bold text-slate-700 mb-1">
              Sales description <span className="text-red-500">*</span> <span className="text-slate-400 font-normal">(plain text description)</span>
            </label>
            <textarea
              rows={3}
              value={desc}
              disabled={!canSave}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Describe what the product does, workpiece materials, key advantages..."
              className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-300 focus:outline-none resize-none transition-colors leading-relaxed"
            />
          </div>

          <div className="flex-1 min-h-0 flex flex-col border-t border-slate-100 pt-2">
            <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
              <span className="text-[11px] font-extrabold text-slate-800 uppercase tracking-wide">
                Technical Specs ({specs.filter((s) => s.k.trim()).length})
              </span>
              {canSave && (
                <button
                  type="button"
                  onClick={() => setSpecs((s) => [...s, { k: '', v: '' }])}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Add spec
                </button>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
              {specs.map((row, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    className="flex-1 text-[11px] px-2 py-1 rounded-md border border-slate-200 focus:border-indigo-500 focus:outline-none"
                    value={row.k}
                    disabled={!canSave}
                    placeholder="Specification"
                    onChange={(e) => setSpecs((s) => s.map((r, j) => (j === i ? { ...r, k: e.target.value } : r)))}
                  />
                  <input
                    className="flex-[1.2] text-[11px] px-2 py-1 rounded-md border border-slate-200 focus:border-indigo-500 focus:outline-none font-mono"
                    value={row.v}
                    disabled={!canSave}
                    placeholder="Value"
                    onChange={(e) => setSpecs((s) => s.map((r, j) => (j === i ? { ...r, v: e.target.value } : r)))}
                  />
                  {canSave && (
                    <button
                      className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                      type="button"
                      title="Remove spec"
                      onClick={() => setSpecs((s) => s.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Column 2: Media Center (Pictures, Documents, Videos, YouTube) */}
        <div className="lg:col-span-5 flex flex-col h-full min-h-0 bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 flex-shrink-0">
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-extrabold text-slate-900 text-xs">Media Center</h3>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700">
                  {media.length + staged.length} assets
                </span>
              </div>
              <p className="text-[10px] text-slate-400">Pictures, YouTube videos &amp; PDF datasheets</p>
            </div>
            {canSave && (
              <div className="flex items-center gap-1.5">
                <label className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 cursor-pointer flex items-center gap-1 transition-colors">
                  <Upload className="w-3 h-3" /> Upload Files
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf,video/*"
                    className="hidden"
                    onChange={(e) => { stageFiles(e.target.files); e.target.value = ''; }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setYtOpen(true)}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200/80 cursor-pointer flex items-center gap-1 transition-colors"
                >
                  <MonitorPlay className="w-3 h-3" /> + YouTube
                </button>
              </div>
            )}
          </div>

          {/* Quick Filter Tabs */}
          <div className="flex items-center gap-1 mb-2 flex-shrink-0 overflow-x-auto pb-0.5">
            {[
              { id: 'all', label: 'All', count: media.length + staged.length },
              { id: 'image', label: 'Pictures', count: images.length + stagedImagesCount },
              { id: 'document', label: 'Documents', count: docs.length + stagedDocsCount },
              { id: 'video', label: 'Videos & YT', count: videos.length + yts.length + stagedVideosCount }
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setMediaFilter(f.id)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer ${
                  mediaFilter === f.id
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{f.label}</span>
                <span className={`text-[9.5px] px-1 rounded-full ${mediaFilter === f.id ? 'bg-slate-700 text-slate-200' : 'bg-slate-200 text-slate-600'}`}>
                  {f.count}
                </span>
              </button>
            ))}
          </div>

          {/* Staged Upload Ready Banner */}
          {stagedReady > 0 && (
            <div className="mb-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between text-xs flex-shrink-0">
              <span className="font-semibold text-[11px]">{stagedReady} staged file(s) ready with title &amp; description</span>
              <button
                type="button"
                className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10.5px] transition-colors"
                disabled={saving}
                onClick={() => save()}
              >
                {saving ? 'Uploading…' : 'Upload staged'}
              </button>
            </div>
          )}

          {/* Scrollable Media List */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
            {/* Staged Items */}
            {stagedFiltered.map((s) => (
              <div key={s.key} className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50 p-2 flex gap-2.5 items-start">
                <div className="w-16 h-16 rounded-lg bg-white border border-amber-200 flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                  {s.kind === 'image' && <img src={s.url} alt="" className="w-full h-full object-cover" />}
                  {s.kind === 'document' && <FileText className="w-7 h-7 text-red-500" />}
                  {s.kind === 'video' && <Film className="w-7 h-7 text-indigo-500" />}
                  <span className="absolute bottom-0 inset-x-0 bg-amber-600 text-white text-[8px] font-extrabold uppercase text-center py-0.5">
                    {s.status === 'uploading' ? 'Uploading…' : 'Staged'}
                  </span>
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-extrabold uppercase text-amber-800 tracking-wider">
                      {s.kind === 'document' ? 'PDF Document' : (s.kind === 'video' ? 'Video' : 'Picture')}
                    </span>
                    <button
                      type="button"
                      onClick={() => dropStaged(s.key)}
                      className="text-slate-400 hover:text-red-600 p-0.5 cursor-pointer"
                      title="Discard staged file"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    className="w-full text-xs font-semibold px-2 py-0.5 rounded border border-amber-200 bg-white placeholder:font-normal placeholder:text-slate-400"
                    placeholder="Title (optional, e.g. Side Profile View)"
                    value={s.title || ''}
                    onChange={(e) => updateStaged(s.key, 'title', e.target.value)}
                  />
                  <input
                    className="w-full text-[11px] px-2 py-0.5 rounded border border-amber-200 bg-white placeholder:text-slate-400"
                    placeholder="Description / caption (optional, e.g. BT40 spindle taper)"
                    value={s.description || ''}
                    onChange={(e) => updateStaged(s.key, 'description', e.target.value)}
                  />
                </div>
              </div>
            ))}

            {/* Existing Uploaded Media */}
            {mediaFiltered.map((m) => {
              const isModified = mediaEdits[m.id] !== undefined;
              const ytVideoId = m.type === 'youtube' ? ytId(m.url) : null;
              return (
                <div key={m.id} className="rounded-xl border border-slate-200/90 bg-slate-50/60 hover:bg-slate-50 hover:border-slate-300 p-2.5 flex gap-2.5 items-start transition-all">
                  <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 overflow-hidden relative group">
                    {m.type === 'image' && (
                      <img src={m.url} alt={m.alt || m.title || ''} className="w-full h-full object-cover" />
                    )}
                    {m.type === 'youtube' && (
                      <img
                        src={ytVideoId ? `https://img.youtube.com/vi/${ytVideoId}/hqdefault.jpg` : imgFallback(m.id, 160, 160)}
                        alt={m.title || ''}
                        className="w-full h-full object-cover"
                      />
                    )}
                    {m.type === 'document' && <FileText className="w-7 h-7 text-red-500" />}
                    {m.type === 'video' && <Film className="w-7 h-7 text-slate-500" />}

                    {m.primary && (
                      <span className="absolute top-0.5 left-0.5 bg-blue-600 text-white text-[8px] font-extrabold uppercase px-1 rounded shadow-xs">
                        Primary
                      </span>
                    )}
                    {m.type === 'youtube' && (
                      <span className="absolute bottom-0.5 right-0.5 bg-red-600 text-white text-[7.5px] font-black px-1 rounded">
                        ▶ YT
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">
                          {m.type === 'document' ? 'PDF Document' : (m.type === 'youtube' ? 'YouTube' : (m.type === 'video' ? 'Video' : 'Picture'))}
                        </span>
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10.5px] text-blue-600 hover:underline truncate max-w-[150px] inline-flex items-center gap-0.5"
                          title="Open asset in new tab"
                        >
                          <ExternalLink className="w-2.5 h-2.5" /> Open
                        </a>
                      </div>

                      <div className="flex items-center gap-1">
                        {m.type === 'image' && !m.primary && canSave && (
                          <button
                            type="button"
                            onClick={() => setPrimary(m)}
                            className="text-[10px] font-bold text-slate-500 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-white border border-transparent hover:border-slate-200 cursor-pointer flex items-center gap-0.5"
                            title="Set as catalog primary photo"
                          >
                            <Star className="w-2.5 h-2.5" /> Make Primary
                          </button>
                        )}
                        {isModified && (
                          <button
                            type="button"
                            disabled={savingMediaId === m.id}
                            onClick={() => quickSaveMedia(m)}
                            className="text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded cursor-pointer flex items-center gap-0.5"
                            title="Save title and description"
                          >
                            {savingMediaId === m.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Save className="w-2.5 h-2.5" />}
                            Save
                          </button>
                        )}
                        {canSave && (
                          <button
                            type="button"
                            onClick={() => removeMedia(m)}
                            className="text-slate-400 hover:text-red-600 p-0.5 cursor-pointer transition-colors"
                            title="Remove asset"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <input
                      className="w-full text-xs font-semibold px-2 py-0.5 rounded border border-slate-200 bg-white focus:border-indigo-500 focus:outline-none placeholder:font-normal placeholder:text-slate-400"
                      placeholder="Title (optional, e.g. Spindle Clearance)"
                      value={getMediaVal(m, 'title')}
                      disabled={!canSave}
                      onChange={(e) => handleMediaEdit(m.id, 'title', e.target.value)}
                    />
                    <input
                      className="w-full text-[11px] px-2 py-0.5 rounded border border-slate-200 bg-white focus:border-indigo-500 focus:outline-none placeholder:text-slate-400"
                      placeholder="Description / caption (optional, e.g. Dual-contact BT40 taper)"
                      value={getMediaVal(m, 'description')}
                      disabled={!canSave}
                      onChange={(e) => handleMediaEdit(m.id, 'description', e.target.value)}
                    />
                  </div>
                </div>
              );
            })}

            {!mediaFiltered.length && !stagedFiltered.length && (
              <div className="py-8 text-center text-slate-400 text-xs">
                No media assets found in this filter.
              </div>
            )}
          </div>
        </div>

        {/* Column 3: BI Inventory & Status History */}
        <div className="lg:col-span-3 flex flex-col h-full min-h-0 gap-2.5">
          {/* Top Panel: From BI Inventory */}
          <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3">
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100 flex-shrink-0">
              <h3 className="font-extrabold text-slate-900 text-xs">From BI Inventory</h3>
              {p.erp_synced && (
                <span className="text-[9px] font-extrabold uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                  Synced
                </span>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 text-xs pr-1">
              <Fact k="SKU" v={p.sku || p.id} mono />
              <Fact k="Brand" v={p.brand || '—'} />
              <Fact k="MPN" v={p.mpn || '—'} mono />
              <Fact k="Category" v={p.categoryName || p.category || '—'} />
              <Fact k="Unit" v={p.uom || '—'} />
              <Fact k="MOQ" v={p.moq ?? '—'} mono />
              <Fact k="Lead time" v={p.leadTime || '—'} />
              <Fact k="Warehouse" v={p.warehouse || '—'} mono />
              <Fact k="Stock on hand" v={p.stock ?? '—'} mono strong />
              {p.erp_item_id && <Fact k="BI item ID" v={p.erp_item_id} mono />}
              {p.erp_last_synced_at && <Fact k="Last Synced" v={fmtDate(p.erp_last_synced_at)} />}
            </div>
          </div>

          {/* Bottom Panel: Status History */}
          <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3">
            <div className="pb-1.5 mb-1.5 border-b border-slate-100 flex-shrink-0">
              <h3 className="font-extrabold text-slate-900 text-xs">Workflow History</h3>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 text-xs pr-1">
              {(!p.workflow_history || !p.workflow_history.length) ? (
                <p className="text-xs text-slate-400">No recorded actions yet.</p>
              ) : (
                <ol className="space-y-2">
                  {p.workflow_history.map((h) => (
                    <li key={h.id} className="text-xs border-l-2 border-indigo-200 pl-2.5">
                      <div className="font-bold text-slate-800 text-[11px]">{h.stage || String(h.to || '').replace(/_/g, ' ')}</div>
                      <div className="text-slate-400 text-[10px]">{h.by || 'system'} · {fmtDate(h.ts)}</div>
                      {h.note && <div className="text-slate-600 text-[10.5px] mt-0.5">“{h.note}”</div>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---- Add YouTube Modal ---- */}
      {ytOpen && (
        <Modal title="▶ Attach YouTube Video" onClose={() => setYtOpen(false)}>
          <Field label="YouTube Link" req hint="youtube.com/watch?v=… , youtu.be/… or a Shorts link">
            <input value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
          </Field>
          <Field label="Video Title (optional)">
            <input value={ytTitle} onChange={(e) => setYtTitle(e.target.value)} placeholder="e.g. 5-Axis CNC Machining Demo" />
          </Field>
          <Field label="Video Description / Highlights (optional)">
            <textarea
              rows={2}
              value={ytDesc}
              onChange={(e) => setYtDesc(e.target.value)}
              placeholder="e.g. High-speed trochoidal milling of titanium alloy at 12,000 RPM."
              className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 resize-none leading-relaxed"
            />
          </Field>
          {ytId(ytUrl) && (
            <img src={`https://img.youtube.com/vi/${ytId(ytUrl)}/hqdefault.jpg`} alt="preview" className="mt-2 w-full max-w-xs rounded-xl border border-slate-200" />
          )}
          <div className="flex gap-2 justify-end mt-4">
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setYtOpen(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm bg-red-600 hover:bg-red-700 text-white" type="button" onClick={addYoutube}>Attach Video</button>
          </div>
        </Modal>
      )}

      {/* ---- Listing Preview Modal ---- */}
      {preview && (
        <ListingPreview
          p={{ ...p, short, desc, specs: Object.fromEntries(specs.filter((r) => r.k.trim()).map((r) => [r.k, r.v])) }}
          images={images}
          docs={docs}
          videos={videos}
          yts={yts}
          staged={staged}
          mediaEdits={mediaEdits}
          onClose={() => setPreview(false)}
        />
      )}

      {/* ---- Confirmation Modal ---- */}
      {confirmSubmit && (
        <Confirm
          title="Send to Accounts / Finance?"
          body={`<b>${p.name}</b> will be sent to the Finance & Accounts team for pricing and approval. It will remain hidden from the storefront until approved.`}
          okLabel="Send to Accounts / Finance"
          busy={submitting}
          onCancel={() => setConfirmSubmit(false)}
          onOk={submitToFinance}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- small pieces */
function Fact({ k, v, mono, strong }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <dt className="text-slate-500 flex-shrink-0 text-[11px]">{k}</dt>
      <dd className={`text-right text-[11px] ${mono ? 'font-mono' : ''} ${strong ? 'font-extrabold text-slate-900' : 'font-semibold text-slate-800'} truncate max-w-[140px]`}>{v}</dd>
    </div>
  );
}

/* ---------------------------------------------------------------- listing preview */
function ListingPreview({ p, images, docs, videos, yts, staged, mediaEdits = {}, onClose }) {
  const stagedImgs = staged.filter((s) => s.kind === 'image');
  const allImgs = [
    ...images.map((i) => ({ ...i, title: mediaEdits[i.id]?.title ?? i.title, description: mediaEdits[i.id]?.description ?? i.description ?? i.alt })),
    ...stagedImgs.map((s) => ({ url: s.url, title: s.title, description: s.description || s.alt }))
  ];

  const stagedDocs = staged.filter((s) => s.kind === 'document');
  const allDocs = [
    ...docs.map((d) => ({ ...d, title: mediaEdits[d.id]?.title ?? d.title, description: mediaEdits[d.id]?.description ?? d.description })),
    ...stagedDocs.map((s) => ({ url: s.url, title: s.title || s.file?.name, description: s.description, staged: true }))
  ];

  const allYts = [
    ...yts.map((y) => ({ ...y, title: mediaEdits[y.id]?.title ?? y.title, description: mediaEdits[y.id]?.description ?? y.description })),
    ...staged.filter((s) => s.kind === 'youtube')
  ];

  const [activeImgIdx, setActiveImgIdx] = useState(0);
  const [previewTab, setPreviewTab] = useState('specs');
  const activeImg = allImgs[activeImgIdx] || null;
  const specs = Object.entries(p.specs || {}).filter(([k]) => String(k).trim());

  return (
    <Modal wide title="👁 Industrial Catalog Live Preview — Customer & Sales View" onClose={onClose}>
      <div className="space-y-4 max-h-[78vh] overflow-y-auto pr-1">
        {/* Main Hero Card in Preview */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs">
          <div className="grid md:grid-cols-12 gap-5 items-start">
            {/* Left: Compact Gallery */}
            <div className="md:col-span-6 flex flex-col space-y-2.5">
              <div className="w-full h-[260px] sm:h-[280px] rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50/80 to-white overflow-hidden relative flex items-center justify-center p-2 shadow-inner">
                {activeImg ? (
                  <img src={activeImg.url} alt={activeImg.title || p.name} className="w-full h-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-slate-400 mb-2">
                      <Package className="w-7 h-7 text-slate-400 stroke-1" />
                    </div>
                    <div className="text-xs font-bold text-slate-600">Industrial Engineering Asset</div>
                    <div className="text-[10.5px] text-slate-400 mt-0.5">Primary photo or CAD drawing pending upload</div>
                  </div>
                )}
                {allImgs.length > 1 && (
                  <span className="absolute top-2 right-2 bg-slate-900/80 text-white text-[9.5px] font-mono px-2 py-0.5 rounded-full">
                    {activeImgIdx + 1} / {allImgs.length}
                  </span>
                )}
              </div>

              {/* Photo Caption */}
              {activeImg && (activeImg.title || activeImg.description) && (
                <div className="p-2.5 rounded-xl bg-slate-900 text-white shadow-xs border border-slate-800 text-xs">
                  {activeImg.title && (
                    <div className="font-bold flex items-center gap-1.5 text-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                      <span>{activeImg.title}</span>
                    </div>
                  )}
                  {activeImg.description && (
                    <div className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                      {activeImg.description}
                    </div>
                  )}
                </div>
              )}

              {/* Thumbnails */}
              {allImgs.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1 pt-0.5">
                  {allImgs.map((img, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActiveImgIdx(i)}
                      className={`w-14 h-14 rounded-lg border-2 overflow-hidden flex-shrink-0 cursor-pointer transition-all ${
                        activeImgIdx === i ? 'border-orange-500 ring-2 ring-orange-200 scale-102' : 'border-slate-200 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={img.url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Commercial & Technical Details */}
            <div className="md:col-span-6 flex flex-col space-y-2.5">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md border border-slate-200">
                    {p.categoryName || p.category || 'Industrial Catalog'}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                    ● Workflow Draft
                  </span>
                </div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight leading-snug">{p.name}</h2>
                <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 flex-wrap">
                  <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                    SKU: {p.sku || p.id}
                  </span>
                  {p.brand && (
                    <span className="bg-slate-50 border border-slate-200/80 px-2 py-0.5 rounded">
                      Brand: <b className="text-slate-800">{p.brand}</b>
                    </span>
                  )}
                  {p.mpn && (
                    <span className="font-mono bg-slate-50 border border-slate-200/80 px-2 py-0.5 rounded">
                      MPN: <b>{p.mpn}</b>
                    </span>
                  )}
                </div>
              </div>

              {p.short && p.short.trim().toLowerCase() !== p.name.trim().toLowerCase() && (
                <div className="border-l-3 border-orange-500 bg-orange-50/50 rounded-r-lg px-3 py-1 text-xs text-slate-700 leading-relaxed font-medium">
                  {p.short}
                </div>
              )}

              {/* Price Banner */}
              <div className="flex items-baseline justify-between p-2.5 rounded-xl bg-gradient-to-r from-slate-50 to-orange-50/20 border border-slate-200">
                <div>
                  <span className="text-[9.5px] font-extrabold uppercase text-slate-400 tracking-wider">Catalog Price</span>
                  <div className="text-lg font-black text-slate-900">On request</div>
                </div>
                <div className="text-right">
                  <span className="text-[9.5px] font-extrabold uppercase text-slate-400 tracking-wider">Pricing Status</span>
                  <div className="text-xs font-bold text-indigo-700">Set by Finance</div>
                </div>
              </div>

              {/* 4-Col Logistics */}
              <div className="grid grid-cols-4 gap-1.5 p-2 rounded-xl bg-slate-50/80 border border-slate-200 text-xs">
                <div><span className="text-[9px] text-slate-400 font-bold uppercase block">Unit</span><span className="font-bold text-slate-800">{p.uom || 'Pc'}</span></div>
                <div><span className="text-[9px] text-slate-400 font-bold uppercase block">MOQ</span><span className="font-mono font-bold text-slate-800">{p.moq || 1}</span></div>
                <div><span className="text-[9px] text-slate-400 font-bold uppercase block">Warehouse</span><span className="font-bold text-slate-800 truncate block">{p.warehouse || 'Central'}</span></div>
                <div><span className="text-[9px] text-slate-400 font-bold uppercase block">Lead Time</span><span className="font-bold text-slate-800 truncate block">{p.leadTime || 'Ex-stock'}</span></div>
              </div>

              {/* Mock Buy Buttons */}
              <div className="flex gap-2 pt-1 opacity-75">
                <button type="button" disabled className="btn btn-primary flex-1 py-1.5 text-xs font-bold h-8">
                  Add to Cart
                </button>
                <button type="button" disabled className="btn btn-coral flex-1 py-1.5 text-xs font-bold h-8">
                  Buy Now →
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* In-Modal Catalog Tabs */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
          <div className="flex items-center gap-1 p-1.5 bg-slate-50 border-b border-slate-200 overflow-x-auto">
            {[
              { id: 'specs', label: 'Technical Specs', count: specs.length },
              { id: 'docs', label: 'Documents & Datasheets', count: allDocs.length },
              { id: 'videos', label: 'Videos & YT', count: allYts.length },
              { id: 'overview', label: 'Overview' }
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setPreviewTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                  previewTab === t.id
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>{t.label}</span>
                {t.count !== undefined && (
                  <span className={`text-[10px] px-1.5 rounded-full font-mono ${
                    previewTab === t.id ? 'bg-orange-100 text-orange-800 font-extrabold' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="p-4">
            {previewTab === 'specs' && (
              <div>
                {specs.length > 0 ? (
                  <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                    <tbody className="divide-y divide-slate-100">
                      {specs.map(([k, v], idx) => (
                        <tr key={k} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                          <td className="px-3 py-1.5 bg-slate-50 font-bold text-slate-700 w-1/3">{k}</td>
                          <td className="px-3 py-1.5 text-slate-900 font-mono font-semibold">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-xs text-slate-400 py-4 text-center">No technical specifications entered yet.</p>
                )}
              </div>
            )}

            {previewTab === 'docs' && (
              <div>
                {allDocs.length > 0 ? (
                  <div className="grid md:grid-cols-2 gap-2.5">
                    {allDocs.map((d, idx) => (
                      <div key={idx} className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 flex items-start justify-between gap-2.5">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center flex-shrink-0 text-rose-600 font-black text-[10px]">
                            PDF
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 truncate">{d.title || 'Datasheet'}</div>
                            {d.description && <div className="text-[10.5px] text-slate-500 mt-0.5 line-clamp-1">{d.description}</div>}
                          </div>
                        </div>
                        {d.staged ? (
                          <span className="text-[9.5px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 flex-shrink-0">
                            Staged
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-blue-600 flex-shrink-0">
                            Download PDF ↓
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 py-4 text-center">No downloadable documents attached.</p>
                )}
              </div>
            )}

            {previewTab === 'videos' && (
              <div>
                {allYts.length > 0 ? (
                  <div className="grid md:grid-cols-2 gap-4">
                    {allYts.filter((y) => ytId(y.url)).map((y, idx) => (
                      <div key={idx} className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
                        <iframe className="w-full aspect-video" src={`https://www.youtube.com/embed/${ytId(y.url)}`} title={y.title || 'Product Video'} allowFullScreen />
                        <div className="p-2.5">
                          <div className="font-bold text-xs text-slate-900">{y.title || 'YouTube Demonstration'}</div>
                          {y.description && <div className="text-[11px] text-slate-600 mt-0.5">{y.description}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 py-4 text-center">No videos or YouTube attached.</p>
                )}
              </div>
            )}

            {previewTab === 'overview' && (
              <div className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed max-w-3xl">
                {p.desc || 'No description written yet.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

