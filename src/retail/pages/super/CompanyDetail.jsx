/* Company workspace — route /super/companies/:id, tabs overview|users|catalog|
   categories|media|orders|settings via ?tab=. Mirrors legacy vCompanyDetail/coDetail. */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, fmt, imgFallback, uploadFiles } from '../../api';
import {
  PageHead, DataTable, Tabs, Field, Modal, Confirm, Empty, Skeleton, statusBadge, toast
} from '../../components/ui';
import { asRows, UserModal, RoleButton, SuspendConfirm, toggleUserActive } from './_shared';

const CO_TABS = [['overview', 'Overview'], ['users', 'Users'], ['catalog', 'Catalog'], ['categories', 'Categories'], ['media', 'Media'], ['orders', 'Orders'], ['settings', 'Settings']];

export default function CompanyDetail() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'overview';
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [suspend, setSuspend] = useState(false);

  const load = useCallback(() => {
    api.get('/api/companies/' + id).then((c) => { setD(c); setErr(''); }).catch((e) => setErr(e.message || 'Failed to load company'));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (err) return <Empty icon="⚠️" title={'⚠️ ' + err} />;
  if (!d) return <Skeleton h={200} />;

  const st = d.storeStatus || d.status;

  return (
    <>
      <div className="section-head">
        <div>
          <Link className="btn btn-ghost btn-sm" to="/super/companies">← Companies</Link>
          <h2 style={{ margin: '8px 0 2px' }}>{d.logo || '🏭'} {d.name}</h2>
          <p className="hint" style={{ margin: 0 }}>{d.code || d.id} • {d.industry || ''} • {d.city || ''} {statusBadge((st) === 'active' ? 'Delivered' : 'Cancelled')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn btn-ghost btn-sm" to={'/super/companies/' + id + '/edit'}>Edit</Link>
          <button className="btn btn-ghost btn-sm" onClick={() => setSuspend(true)}>Suspend / Activate</button>
        </div>
      </div>
      <Tabs tabs={CO_TABS} active={tab} onTab={(k) => setSp(k === 'overview' ? {} : { tab: k })} />
      <div className="card" style={{ marginTop: 0, borderTopLeftRadius: 0 }}>
        <div className="card-pad">
          {tab === 'overview' && <OverviewTab id={id} d={d} />}
          {tab === 'users' && <UsersTab id={id} onChanged={load} />}
          {tab === 'catalog' && <CatalogTab id={id} />}
          {tab === 'categories' && <CategoriesTab id={id} />}
          {tab === 'media' && <MediaTab id={id} />}
          {tab === 'orders' && <OrdersTab id={id} />}
          {tab === 'settings' && <SettingsTab id={id} />}
        </div>
      </div>
      {suspend && <SuspendConfirm co={d} onCancel={() => setSuspend(false)} onDone={() => { setSuspend(false); load(); }} />}
    </>
  );
}

/* ---------------- overview ---------------- */
function OverviewTab({ id, d }) {
  const [recent, setRecent] = useState([]);
  useEffect(() => {
    api.get('/api/audit?companyId=' + id + '&limit=6').then((r) => setRecent(asRows(r).rows.slice(0, 6))).catch(() => {});
  }, [id]);
  const cards = [['Users', d.userCount || 0], ['SKUs', d.productCount || 0], ['Categories', d.categoryCount || 0], ['Orders', d.orderCount || 0],
    ['Pending', d.pendingOrders || 0], ['Revenue', fmt(d.revenue || 0)], ['RFQs', d.quoteCount || 0], ['Visible', d.visibleCount || 0]];
  return (
    <>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {cards.map(([l, v]) => <div key={l} className="ind-stat"><b>{v}</b><p>{l}</p></div>)}
      </div>
      <div className="card" style={{ marginTop: 14 }}><div className="card-pad">
        <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Company information</h3>
        <div className="form-grid">
          <div><p className="hint" style={{ margin: 0 }}>Contact</p><b>{d.email || '—'}</b><div className="hint">{d.phone || ''}</div></div>
          <div><p className="hint" style={{ margin: 0 }}>Address</p><b>{d.address || '—'}</b><div className="hint">{d.city || ''} {d.state || ''} {d.pin || ''}</div></div>
        </div>
        <p style={{ fontSize: 13 }}>{d.description || ''}</p>
        <p className="hint">Plan {d.plan || ''} • Created {d.createdAt || '—'} • Updated {d.updatedAt || '—'}</p>
      </div></div>
      <div className="card" style={{ marginTop: 14 }}><div className="card-pad">
        <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Recent activity</h3>
        {recent.length
          ? recent.map((a) => <div key={a.id} style={{ display: 'flex', gap: 10, padding: '7px 0', fontSize: 12.5, borderTop: '1px solid #F1F5F9' }}><b>{a.actor}</b><span>{a.summary || a.action}</span><span className="hint" style={{ marginLeft: 'auto' }}>{String(a.ts).slice(0, 16).replace('T', ' ')}</span></div>)
          : <p className="hint">No recorded activity yet.</p>}
        <Link className="btn btn-ghost btn-sm" to="/super/audit">Full audit log →</Link>
      </div></div>
    </>
  );
}

/* ---------------- users ---------------- */
function UsersTab({ id, onChanged }) {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [modal, setModal] = useState(false);
  const load = useCallback(() => {
    api.get('/api/users?companyId=' + id).then((r) => setRows(asRows(r).rows)).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(() => { load(); }, [load]);
  if (err) return <Empty title={'⚠️ ' + err} />;
  return (
    <>
      <div className="section-head" style={{ marginTop: 0 }}>
        <h2 style={{ fontSize: 16 }}>Users ({rows.length})</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setModal(true)}>+ Create user</button>
      </div>
      <DataTable
        rowKey={(r) => r.id}
        empty="No users."
        cols={[
          { key: 'n', label: 'Name', render: (u) => <b>{u.name}</b> },
          { key: 'e', label: 'Email', render: (u) => u.email },
          {
            key: 'r', label: 'Role',
            render: (u) => <>{statusBadge(u.role === 'company_admin' ? 'Confirmed' : u.role === 'super_admin' ? 'Processing' : 'Pending')} {(u.role || '').replace('_', ' ')}</>
          },
          { key: 'm', label: 'Mobile', render: (u) => u.mobile || '—' },
          { key: 's', label: 'Status', render: (u) => statusBadge(u.active !== false ? 'Delivered' : 'Cancelled') },
          {
            key: 'a', label: 'Actions', render: (u) => (
              <span style={{ whiteSpace: 'nowrap' }}>
                <RoleButton id={u.id} role={u.role} name={u.name} company={u.companyName || id} onChanged={() => { load(); onChanged(); }} />{' '}
                <button className="btn btn-ghost btn-sm" onClick={() => toggleUserActive(u, () => { load(); onChanged(); })}>{u.active !== false ? 'Deactivate' : 'Activate'}</button>
              </span>
            )
          }
        ]}
        rows={rows}
      />
      {modal && <UserModal preset={{ companyId: id }} onClose={() => setModal(false)} onSaved={() => { setModal(false); load(); onChanged(); }} />}
    </>
  );
}

/* ---------------- catalog ---------------- */
function CatalogTab({ id }) {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const load = useCallback(() => {
    api.get('/api/products?companyId=' + id).then((r) => setRows(asRows(r).rows)).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function vis(p) {
    try { await api.patch('/api/products/' + p.id + '/visibility', { visible: !p.visible }); toast('Visibility updated', '👁️'); load(); }
    catch (e) { toast(e.message, '⚠️'); }
  }
  async function archive(p) {
    try { await api.patch('/api/products/' + p.id + '/archive', { archived: !p.archived }); toast(p.archived ? 'SKU unarchived' : 'SKU archived', '📦'); load(); }
    catch (e) { toast(e.message, '⚠️'); }
  }

  if (err) return <Empty title={'⚠️ ' + err} />;
  return (
    <>
      <div className="section-head" style={{ marginTop: 0 }}>
        <h2 style={{ fontSize: 16 }}>Catalog ({rows.length} SKUs)</h2>
        <Link className="btn btn-primary btn-sm" to={'/admin/products/new?companyId=' + id}>+ Add product</Link>
      </div>
      <DataTable
        rowKey={(r) => r.id}
        empty="No products."
        cols={[
          {
            key: 'p', label: 'Product', render: (p) => (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <img className="thumb" src={(p.images || [])[0] || ''} onError={(e) => { e.target.src = imgFallback(p.sku || p.id, 100, 100); }} alt="" />
                <div><b>{p.name}</b><div className="hint">{p.sku || p.id}{p.mpn ? ' • ' + p.mpn : ''}{p.archived ? ' • ARCHIVED' : ''}</div></div>
              </div>
            )
          },
          { key: 'b', label: 'Brand', render: (p) => p.brand || '—' },
          { key: 'pr', label: 'Price', render: (p) => p.price != null ? <b>{fmt(p.price)}</b> : <span className="status s-ready">RFQ</span> },
          { key: 's', label: 'Stock', render: (p) => p.stock },
          {
            key: 'v', label: 'Visible',
            render: (p) => <button className={'status ' + (p.visible ? 's-active' : 's-cancelled')} onClick={() => vis(p)}>{p.visible ? 'Visible' : 'Hidden'}</button>
          },
          {
            key: 'a', label: 'Actions', render: (p) => (
              <span style={{ whiteSpace: 'nowrap' }}>
                <Link className="btn btn-ghost btn-sm" to={'/store/product/' + p.id}>View</Link>{' '}
                <Link className="btn btn-ghost btn-sm" to={'/admin/products/edit/' + p.id}>Edit</Link>{' '}
                <button className="btn btn-ghost btn-sm" onClick={() => archive(p)}>{p.archived ? 'Unarchive' : 'Archive'}</button>
              </span>
            )
          }
        ]}
        rows={rows}
      />
    </>
  );
}

/* ---------------- categories ---------------- */
function CategoriesTab({ id }) {
  const [globals, setGlobals] = useState([]);
  const [mine, setMine] = useState([]);
  const [products, setProducts] = useState([]);
  const [err, setErr] = useState('');
  const [creating, setCreating] = useState(false);
  const [forceId, setForceId] = useState(null);

  const load = useCallback(() => {
    Promise.all([
      api.get('/api/categories').catch((e) => { throw e; }),
      api.get('/api/categories?companyId=' + id),
      api.get('/api/products?companyId=' + id).catch(() => [])
    ]).then(([g, m, p]) => {
      setGlobals(asRows(g).rows.filter((c) => c.scope === 'global'));
      setMine(asRows(m).rows);
      setProducts(asRows(p).rows);
    }).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function toggle(c, to) {
    setForceId(null);
    try {
      await api.put('/api/categories/' + c.id, { active: to });
      toast('Category ' + (to ? 'activated' : 'deactivated'), '🗂️');
      load();
    } catch (e) {
      if (/live product|orphan/i.test(e.message)) setForceId(c.id);
      toast(e.message, '⚠️');
    }
  }
  async function force(c) {
    try { await api.put('/api/categories/' + c.id + '?force=1', { active: false }); setForceId(null); load(); }
    catch (e) { toast(e.message, '⚠️'); }
  }
  async function assign(c) {
    try { await api.post('/api/categories/' + c.id + '/assign', { companyId: id }); toast(c.name + ' assigned to company', '🗂️'); load(); }
    catch (e) { toast(e.message, '⚠️'); }
  }

  if (err) return <Empty title={'⚠️ ' + err} />;
  const count = (cid) => products.filter((p) => p.category === cid).length;
  return (
    <>
      <div className="section-head" style={{ marginTop: 0 }}>
        <h2 style={{ fontSize: 16 }}>Categories</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ Company category</button>
      </div>
      <h3 style={{ fontSize: 14 }}>Global categories (assign to this company)</h3>
      <DataTable
        rowKey={(r) => r.id}
        empty="No global categories."
        cols={[
          { key: 'c', label: 'Category', render: (c) => <>{c.icon} <b>{c.name}</b></> },
          { key: 'n', label: 'SKUs here', render: (c) => count(c.id) },
          {
            key: 'a', label: 'Action', render: (c) => (
              (c.assignedTo || []).includes(id)
                ? <span className="hint">Assigned ✓</span>
                : <button className="btn btn-ghost btn-sm" onClick={() => assign(c)}>Assign</button>
            )
          }
        ]}
        rows={globals}
      />
      <h3 style={{ fontSize: 14, marginTop: 14 }}>Company-specific ({mine.length})</h3>
      <DataTable
        rowKey={(r) => r.id}
        empty="No company-specific categories."
        cols={[
          { key: 'c', label: 'Category', render: (c) => <>{c.icon} <b>{c.name}</b><div className="hint">{c.desc || ''}</div></> },
          { key: 'n', label: 'SKUs', render: (c) => count(c.id) },
          { key: 's', label: 'Active', render: (c) => statusBadge(c.active !== false ? 'Delivered' : 'Cancelled') },
          {
            key: 'a', label: 'Action', render: (c) => (
              <span style={{ whiteSpace: 'nowrap' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => toggle(c, !(c.active !== false))}>{c.active !== false ? 'Deactivate' : 'Activate'}</button>
                {forceId === c.id && <button className="btn btn-ghost btn-sm" onClick={() => force(c)}>Force deactivate</button>}
              </span>
            )
          }
        ]}
        rows={mine}
      />
      <p className="hint"><Link to="/super/categories">Manage globally →</Link></p>
      {creating && <CompanyCatModal companyId={id} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
    </>
  );
}

function CompanyCatModal({ companyId, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🏭');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save() {
    if (!name.trim()) { setErr('Category name is required.'); return; }
    setBusy(true);
    try { await api.post('/api/categories', { name: name.trim(), icon, scope: 'company', companyId }); toast('Category created', '🗂️'); onSaved(); }
    catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal title="＋ Company category" onClose={onClose}>
      <Field label="Name" req><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Turned Components" /></Field>
      <Field label="Icon"><input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🏭" /></Field>
      {err && <div className="hint" style={{ color: '#DC2626' }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Create'}</button>
      </div>
    </Modal>
  );
}

/* ---------------- media ---------------- */
function MediaTab({ id }) {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [err, setErr] = useState('');
  const [uploading, setUploading] = useState(false);
  const [del, setDel] = useState(null);
  const load = useCallback(() => {
    Promise.all([
      api.get('/api/media?companyId=' + id).catch((e) => { throw e; }),
      api.get('/api/products?companyId=' + id).catch(() => [])
    ]).then(([m, p]) => { setRows(asRows(m).rows); setProducts(asRows(p).rows); }).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function primary(m) {
    try { await api.patch('/api/media/' + m.id, { primary: true }); toast('Primary image updated', '🖼️'); load(); }
    catch (e) { toast(e.message, '⚠️'); }
  }
  async function remove(m) {
    try { await api.del('/api/media/' + m.id); setDel(null); toast('Media deleted', '🖼️'); load(); }
    catch (e) { toast(e.message, '⚠️'); }
  }

  if (err) return <Empty title={'⚠️ ' + err} />;
  const gallery = rows.length
    ? rows.map((m) => ({ url: m.url, type: m.type, label: (m.sku || '') + (m.primary ? ' • primary' : ''), id: m.id, vis: m.visible }))
    : products.flatMap((p) => (p.images || []).map((u, i) => ({ url: u, type: 'image', label: (p.sku || '') + (i === 0 ? ' • primary' : ''), id: null, vis: true })));
  return (
    <>
      <div className="section-head" style={{ marginTop: 0 }}>
        <h2 style={{ fontSize: 16 }}>Media ({rows.length})</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setUploading(true)}>+ Upload media</button>
      </div>
      <div className="prod-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
        {gallery.map((m, i) => (
          <div className="prod" key={m.id || i}>
            <div className="prod-img">
              {m.type === 'video'
                ? <video src={m.url} controls style={{ width: '100%', height: '100%' }} />
                : <img src={m.url} onError={(e) => { e.target.src = imgFallback('media', 400, 300); }} alt="" />}
            </div>
            <div className="prod-body">
              <b style={{ fontSize: 12 }}>{m.label}</b>
              <span className="hint">{m.type}{m.vis ? '' : ' • hidden'}</span>
              {m.id && (
                <div className="prod-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => primary(rows.find((x) => x.id === m.id))}>Primary</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDel(rows.find((x) => x.id === m.id))}>Delete</button>
                </div>
              )}
            </div>
          </div>
        )) || null}
        {!gallery.length && <div className="empty">No media yet.</div>}
      </div>
      {uploading && <MediaUploadModal companyId={id} products={products} onClose={() => setUploading(false)} onSaved={() => { setUploading(false); load(); }} />}
      {del && (
        <Confirm title="Delete media" body={`Delete this ${del.type} (${del.sku || del.productId})? The product record is updated too.`}
          okLabel="Delete" danger onCancel={() => setDel(null)} onOk={() => remove(del)} />
      )}
    </>
  );
}

export function MediaUploadModal({ companyId, products, presetProduct, onClose, onSaved }) {
  const [productId, setProductId] = useState(presetProduct || (products[0] || {}).id || '');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save() {
    if (!productId) { setErr('Select a product.'); return; }
    if (!files.length) { setErr('Choose at least one file.'); return; }
    setBusy(true);
    try {
      const urls = await uploadFiles(files);
      for (const u of urls) {
        const f = files[urls.indexOf(u)] || {};
        const isVideo = (f.type || '').startsWith('video');
        await api.post('/api/media', { companyId, productId, type: isVideo ? 'video' : 'image', url: u });
      }
      toast(urls.length + ' file(s) uploaded', '🖼️');
      onSaved();
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal title="＋ Upload media" onClose={onClose}>
      <Field label="Product" req>
        <select value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">— Select product —</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.sku || p.id} — {p.name}</option>)}
        </select>
      </Field>
      <Field label="Files" req hint="Images / video (max 50MB each). First image becomes primary when none exists.">
        <input type="file" multiple accept="image/*,video/*" onChange={(e) => setFiles([...e.target.files])} />
      </Field>
      {err && <div className="hint" style={{ color: '#DC2626' }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? 'Uploading…' : 'Upload'}</button>
      </div>
    </Modal>
  );
}

/* ---------------- orders ---------------- */
function OrdersTab({ id }) {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.get('/api/orders?companyId=' + id).then((r) => setRows(asRows(r).rows)).catch((e) => setErr(e.message));
  }, [id]);
  if (err) return <Empty title={'⚠️ ' + err} />;
  return (
    <>
      <div className="section-head" style={{ marginTop: 0 }}>
        <h2 style={{ fontSize: 16 }}>Orders ({rows.length})</h2>
        <Link className="btn btn-ghost btn-sm" to="/super/orders">All orders →</Link>
      </div>
      <DataTable
        rowKey={(r) => r.id}
        empty="No orders."
        cols={[
          { key: 'o', label: 'Order', render: (o) => <><Link to={'/admin/orders/' + o.id}><b>{o.id}</b></Link><div className="hint">{o.date}</div></> },
          { key: 'c', label: 'Customer', render: (o) => o.companyName || o.customer },
          { key: 'i', label: 'Items', render: (o) => (o.items || []).reduce((a, i) => a + i.qty, 0) },
          { key: 't', label: 'Total', render: (o) => <b>{fmt(o.total)}</b> },
          { key: 's', label: 'Status', render: (o) => statusBadge(o.status) }
        ]}
        rows={rows}
      />
    </>
  );
}

/* ---------------- settings ----------------
   Intended contract: GET /api/settings?companyId=<id>, PUT same URL.
   (Backend currently ignores companyId for super_admin — see report.) */
function SettingsTab({ id }) {
  const [f, setF] = useState({ storeName: '', taxPct: '', orderPrefix: '', quotePrefix: '', lowStockThreshold: '', announcement: '', warehouse: '' });
  const [defs, setDefs] = useState(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    Promise.all([
      api.get('/api/settings?companyId=' + id).catch(() => ({})),
      api.get('/api/settings/global').catch(() => ({}))
    ]).then(([mine, g]) => {
      setDefs(g || {});
      setF({
        storeName: mine.storeName || '', taxPct: mine.taxPct ?? '', orderPrefix: mine.orderPrefix || '',
        quotePrefix: mine.quotePrefix || mine.quotationPrefix || '', lowStockThreshold: mine.lowStockThreshold ?? '',
        announcement: mine.announcement || '', warehouse: mine.warehouse || mine.defaultWarehouse || ''
      });
    }).catch((e) => setErr(e.message));
  }, [id]);

  async function save() {
    setSaving(true); setMsg('');
    try {
      const body = { companyId: id, storeName: f.storeName, taxPct: f.taxPct === '' ? undefined : Number(f.taxPct), orderPrefix: f.orderPrefix, quotePrefix: f.quotePrefix || undefined, lowStockThreshold: f.lowStockThreshold === '' ? undefined : Number(f.lowStockThreshold), announcement: f.announcement, warehouse: f.warehouse || undefined };
      await api.put('/api/settings?companyId=' + id, body);
      setMsg('Settings published.');
      toast('Settings published', '⚙️');
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  if (err) return <Empty title={'⚠️ ' + err} />;
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const ph = (k, fb) => (defs && defs[k] != null && defs[k] !== '' ? 'Global default: ' + defs[k] : fb);
  return (
    <>
      <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200 mb-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div>
          <h4 className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
            <span>Invoice &amp; Quotation Profile (Rule 46 GST)</span>
          </h4>
          <p className="text-[11px] text-emerald-800">
            Configure Company Letterhead Logo, Registered Address, Bank RTGS, Dynamic NPCI UPI QR code, and Authorized Digital Signature for this enterprise.
          </p>
        </div>
        <Link
          to={`/retail/admin/settings?tab=invoice&companyId=${id}`}
          className="btn btn-primary btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-none flex-shrink-0 shadow-xs"
        >
          Configure Invoice Profile 🧾
        </Link>
      </div>
      <PageHead title="Store settings" desc="Company overrides — blank fields fall back to global defaults." />
      <div className="form-grid">
        <Field label="Store name"><input value={f.storeName} onChange={set('storeName')} placeholder={ph('storeName', 'e.g. Argus Industrial Store')} /></Field>
        <Field label="Default warehouse"><input value={f.warehouse} onChange={set('warehouse')} placeholder="WH-Pune-01" /></Field>
        <Field label="Tax % (GST)"><input type="number" value={f.taxPct} onChange={set('taxPct')} placeholder={ph('taxPct', '18')} /></Field>
        <Field label="Order prefix"><input value={f.orderPrefix} onChange={set('orderPrefix')} placeholder={ph('orderPrefix', 'ORD-')} /></Field>
        <Field label="Quotation prefix"><input value={f.quotePrefix} onChange={set('quotePrefix')} placeholder={ph('quotePrefix', 'Q-')} /></Field>
        <Field label="Low-stock threshold"><input type="number" value={f.lowStockThreshold} onChange={set('lowStockThreshold')} placeholder={ph('lowStockThreshold', '10')} /></Field>
        <Field label="Storefront announcement" full><input value={f.announcement} onChange={set('announcement')} placeholder={ph('announcement', 'GST invoice on all orders • Bulk pricing on request')} /></Field>
      </div>
      {msg && <p className="hint" style={{ color: '#065F46' }}>{msg}</p>}
      <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>{saving ? 'Publishing…' : 'Publish'}</button>
    </>
  );
}
