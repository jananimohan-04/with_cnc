/* Global categories — route /super/categories.
   Global table (edit name/icon/desc/image/sortOrder/active with orphan-protection
   error display, assign-to-company, reorder) + company-scoped section per company. */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderTree } from 'lucide-react';
import { api } from '../../api';
import { useCompany } from '../../companyContext';
import { PageHero, DataTable, Field, Modal, Empty, Skeleton, statusBadge, toast } from '../../components/ui';
import { asRows, fetchCompanyOptions } from './_shared';

export default function Categories() {
  const { activeCompany, activeCompanyObj, setActiveCompany } = useCompany();
  const [cats, setCats] = useState([]);
  const [cos, setCos] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // category object
  const [creating, setCreating] = useState(null); // 'global' | companyId
  const [assigning, setAssigning] = useState(null); // category object

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.get('/api/categories'), fetchCompanyOptions().catch(() => [])])
      .then(([c, companies]) => { setCats(asRows(c).rows); setCos(companies); setErr(''); })
      .catch((e) => setErr(e.message || 'Failed to load categories'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function move(c, dir) {
    const ordered = [...cats].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const i = ordered.findIndex((x) => x.id === c.id);
    const j = i + dir;
    if (j < 0 || j >= ordered.length) return;
    try {
      await api.put('/api/categories/' + ordered[j].id, { sortOrder: c.sortOrder || 0 });
      await api.put('/api/categories/' + c.id, { sortOrder: ordered[j].sortOrder || 0 });
      load();
    } catch (e) { toast(e.message, '⚠️'); }
  }

  if (loading) return <Skeleton h={240} />;
  if (err) return <Empty title={'⚠️ ' + err} />;

  const globals = cats.filter((c) => c.scope !== 'company');
  const visibleCompanies = activeCompany !== 'all' ? cos.filter(c => c.id === activeCompany) : cos;
  const byCompany = visibleCompanies.map((co) => ({
    co,
    specific: cats.filter((c) => c.scope === 'company' && c.companyId === co.id),
    assigned: globals.filter((c) => (c.assignedTo || []).includes(co.id))
  }));

  return (
    <>
      <PageHero
        title={`Master Categories (${cats.length})`}
        subtitle="Global taxonomy classifications, SKU aggregations, and multi-tenant catalog assignments."
        icon={FolderTree}
        badgeText="Catalog Taxonomy"
        badgeColor="amber"
        gradient="from-amber-500 via-orange-500 to-yellow-500"
        actions={<button className="btn btn-primary btn-sm bg-amber-600 hover:bg-amber-700 border-none shadow-sm shadow-amber-600/30 text-white" onClick={() => setCreating('global')}>+ New category</button>}
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
                Category assignments and company-specific taxonomies are scoped to this company
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
        <div className="cat-row" style={{ flexWrap: 'wrap' }}>
          {globals.map((c) => <span key={c.id} className="cat-chip">{c.icon} {c.name} <b>• {c.productCount ?? 0}</b></span>)}
        </div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <DataTable
            rowKey={(r) => r.id}
            empty="No categories."
            cols={[
              { key: 'c', label: 'Category', render: (c) => <>{c.icon} <b>{c.name}</b><div className="hint">{c.id} • {c.scope || 'global'}</div></> },
              { key: 'd', label: 'Description', render: (c) => <span className="hint">{c.desc || ''}</span> },
              { key: 'n', label: 'SKUs', render: (c) => c.productCount ?? 0 },
              { key: 's', label: 'Sort', render: (c) => c.sortOrder ?? 0 },
              { key: 'a', label: 'Active', render: (c) => statusBadge(c.active !== false ? 'Delivered' : 'Cancelled') },
              {
                key: 'act', label: 'Actions', render: (c) => (
                  <span style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => move(c, -1)}>↑</button>{' '}
                    <button className="btn btn-ghost btn-sm" onClick={() => move(c, 1)}>↓</button>{' '}
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(c)}>Edit</button>{' '}
                    {c.scope !== 'company' && <button className="btn btn-ghost btn-sm" onClick={() => setAssigning(c)}>Assign</button>}
                  </span>
                )
              }
            ]}
            rows={cats}
          />
        </div>
        <p className="hint">Categories are per-company in production. Do not assume every company sells every category.</p>
      </div></div>

      {byCompany.map(({ co, specific, assigned }) => (
        <div className="card" key={co.id} style={{ marginTop: 14 }}><div className="card-pad">
          <div className="section-head" style={{ marginTop: 0 }}>
            <h2 style={{ fontSize: 16 }}>{co.logo || '🏭'} {co.name} <span className="hint">({co.code || co.id})</span></h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setCreating(co.id)}>+ Company category</button>
              <Link className="btn btn-ghost btn-sm" to={'/super/companies/' + co.id + '?tab=categories'}>Open →</Link>
            </div>
          </div>
          <h3 style={{ fontSize: 13 }}>Company-specific ({specific.length})</h3>
          <DataTable
            rowKey={(r) => r.id}
            empty="No company-specific categories."
            cols={[
              { key: 'c', label: 'Category', render: (c) => <>{c.icon} <b>{c.name}</b><div className="hint">{c.desc || ''}</div></> },
              { key: 'a', label: 'Active', render: (c) => statusBadge(c.active !== false ? 'Delivered' : 'Cancelled') },
              { key: 'act', label: 'Actions', render: (c) => <button className="btn btn-ghost btn-sm" onClick={() => setEditing(c)}>Edit</button> }
            ]}
            rows={specific}
          />
          <h3 style={{ fontSize: 13, marginTop: 12 }}>Assigned globals ({assigned.length})</h3>
          {assigned.length
            ? <div className="cat-row" style={{ flexWrap: 'wrap' }}>{assigned.map((c) => (
              <span key={c.id} className="cat-chip">{c.icon} {c.name} <button className="btn btn-ghost btn-sm" onClick={() => unassign(c, co.id, load)}>✕</button></span>
            ))}</div>
            : <p className="hint">No global categories assigned to this company.</p>}
        </div></div>
      ))}

      {editing && <CategoryEditModal c={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {creating && <CategoryCreateModal scope={creating} cos={cos} onClose={() => setCreating(null)} onSaved={() => { setCreating(null); load(); }} />}
      {assigning && <AssignModal c={assigning} cos={cos} onClose={() => setAssigning(null)} onSaved={() => { setAssigning(null); load(); }} />}
    </>
  );
}

async function unassign(c, companyId, load) {
  try { await api.del('/api/categories/' + c.id + '/assign?companyId=' + companyId); toast('Category unassigned', '🗂️'); load(); }
  catch (e) { toast(e.message, '⚠️'); }
}

function CategoryEditModal({ c, onClose, onSaved }) {
  const [f, setF] = useState({ name: c.name || '', icon: c.icon || '🏭', desc: c.desc || '', image: c.image || '', sortOrder: c.sortOrder ?? 0, active: c.active !== false });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [orphan, setOrphan] = useState(0);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  async function save(force) {
    setBusy(true); setErr('');
    try {
      await api.put('/api/categories/' + c.id + (force ? '?force=1' : ''), { ...f, sortOrder: Number(f.sortOrder) || 0 });
      toast('Category updated', '🗂️');
      onSaved();
    } catch (e) {
      const m = /(\d+) live product/.exec(e.message || '');
      if (m && !force) { setOrphan(Number(m[1])); setErr(e.message); }
      else setErr(e.message);
      setBusy(false);
    }
  }
  return (
    <Modal title={'🗂️ Edit — ' + c.name} onClose={onClose}>
      <Field label="Name" req><input value={f.name} onChange={set('name')} /></Field>
      <div className="form-grid">
        <Field label="Icon"><input value={f.icon} onChange={set('icon')} /></Field>
        <Field label="Sort order"><input type="number" value={f.sortOrder} onChange={set('sortOrder')} /></Field>
      </div>
      <Field label="Description"><input value={f.desc} onChange={set('desc')} /></Field>
      <Field label="Image URL"><input value={f.image} onChange={set('image')} placeholder="https://…" /></Field>
      <Field label="Active"><select value={f.active ? '1' : '0'} onChange={(e) => setF((p) => ({ ...p, active: e.target.value === '1' }))}><option value="1">Active</option><option value="0">Inactive</option></select></Field>
      {err && <div className="hint" style={{ color: '#DC2626' }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        {orphan > 0 && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => save(true)}>Force deactivate ({orphan} live SKUs)</button>}
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => save(false)}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </Modal>
  );
}

function CategoryCreateModal({ scope, cos, onClose, onSaved }) {
  const isGlobal = scope === 'global';
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🏭');
  const [desc, setDesc] = useState('');
  const [companyId, setCompanyId] = useState(isGlobal ? '' : scope);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!name.trim()) { setErr('Category name is required.'); return; }
    if (!isGlobal && !companyId) { setErr('Select a company.'); return; }
    setBusy(true);
    try {
      await api.post('/api/categories', isGlobal
        ? { name: name.trim(), icon, desc, scope: 'global' }
        : { name: name.trim(), icon, desc, scope: 'company', companyId });
      toast('Category created', '🗂️');
      onSaved();
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal title={isGlobal ? '＋ New global category' : '＋ New company category'} onClose={onClose}>
      <Field label="Name" req><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tool Holders" /></Field>
      <Field label="Icon"><input value={icon} onChange={(e) => setIcon(e.target.value)} /></Field>
      <Field label="Description"><input value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
      {!isGlobal && (
        <Field label="Company" req>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">— Select company —</option>
            {cos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      )}
      {err && <div className="hint" style={{ color: '#DC2626' }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Create'}</button>
      </div>
    </Modal>
  );
}

function AssignModal({ c, cos, onClose, onSaved }) {
  const [companyId, setCompanyId] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const remaining = cos.filter((co) => !(c.assignedTo || []).includes(co.id));
  async function save() {
    if (!companyId) { setErr('Select a company.'); return; }
    setBusy(true);
    try { await api.post('/api/categories/' + c.id + '/assign', { companyId }); toast(c.name + ' assigned', '🗂️'); onSaved(); }
    catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal title={'Assign ' + c.icon + ' ' + c.name} onClose={onClose}>
      <Field label="Company" req>
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          <option value="">— Select company —</option>
          {remaining.map((co) => <option key={co.id} value={co.id}>{co.name}</option>)}
        </select>
      </Field>
      {err && <div className="hint" style={{ color: '#DC2626' }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? 'Assigning…' : 'Assign'}</button>
      </div>
    </Modal>
  );
}
