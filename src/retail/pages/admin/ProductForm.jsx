/* Product create/edit — mirrors legacy vProductForm + saveProduct exactly.
   New files get object-URL previews and are uploaded on save via uploadFiles. */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, uploadFiles } from '../../api';
import { useAuth } from '../../auth';
import { PageHead, Field, Empty, Skeleton, toast } from '../../components/ui';

const UOMS = ['Pc', 'Set', 'Pack', 'Kit', 'Drum', 'Mtr', 'Kg', 'Ltr', 'Box'];

const BLANK = { name: '', sku: '', brand: '', mpn: '', short: '', price: '', uom: 'Pc', moq: 1, leadTime: '', warehouse: '', stock: '', category: 'cutting-tools', visible: true, featured: false, desc: '', specsText: '' };

function parseSpecs(text) {
  const specs = {};
  String(text || '').split('\n').forEach((l) => { const i = l.indexOf(':'); if (i > 0) specs[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
  return specs;
}

export default function ProductForm({ edit }) {
  const { id } = useParams();
  const editId = edit ? id : '';
  const { me } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  // Super-admin flow (/admin/products/new?companyId=X from a company workspace) files the SKU under that company.
  const targetCompany = (me && me.role === 'super_admin' && sp.get('companyId')) || (me && me.companyId) || '';
  const imgIn = useRef(null);
  const vidIn = useRef(null);

  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(!!editId);
  const [missing, setMissing] = useState(false);
  const [f, setF] = useState(BLANK);
  const [imgs, setImgs] = useState([]); // {url} existing | {file, preview} new
  const [vidUrl, setVidUrl] = useState('');
  const [vidFile, setVidFile] = useState(null);
  const [vidPreview, setVidPreview] = useState('');
  const imgsRef = useRef(imgs);
  imgsRef.current = imgs;
  const vidPrevRef = useRef('');
  vidPrevRef.current = vidPreview;
  const [vidErr, setVidErr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/api/categories').then((d) => setCats(Array.isArray(d) ? d : (d.rows || []))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!editId) return;
    let on = true;
    api.get('/api/products/' + editId).then((p) => {
      if (!on) return;
      setF({
        name: p.name || '', sku: p.sku || '', brand: p.brand || '', mpn: p.mpn || '', short: p.short || '',
        price: p.price != null ? p.price : '', uom: p.uom || 'Pc', moq: p.moq != null ? p.moq : 1,
        leadTime: p.leadTime || '', warehouse: p.warehouse || '', stock: p.stock != null ? p.stock : '',
        category: p.category || 'cutting-tools', visible: p.visible !== false, featured: !!p.featured,
        desc: p.desc || '', specsText: Object.entries(p.specs || {}).map(([k, v]) => k + ': ' + v).join('\n')
      });
      setImgs((p.images || []).map((url) => ({ url })));
      setVidUrl(p.video || '');
      setLoading(false);
    }).catch(() => { if (on) { setMissing(true); setLoading(false); } });
    return () => { on = false; };
  }, [editId]);

  useEffect(() => () => {
    imgsRef.current.forEach((i) => { if (i.preview) URL.revokeObjectURL(i.preview); });
    if (vidPrevRef.current) URL.revokeObjectURL(vidPrevRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Skeleton h={320} />;
  if (missing) return <Empty icon="🔍" title="Product not found." />;

  const S = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  function pickImages(e) {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    setImgs((p) => [...p, ...files.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
    e.target.value = '';
    toast('Preview ready — stored in company media on publish', '🖼️');
  }

  function pickVideo(e) {
    const file = (e.target.files || [])[0];
    e.target.value = '';
    if (!file) return;
    if (vidPreview) URL.revokeObjectURL(vidPreview);
    setVidPreview(URL.createObjectURL(file));
    setVidFile(file);
    setVidErr(false);
    toast('Preview ready — stored in company media on publish', '🖼️');
  }

  const specPrev = parseSpecs(f.specsText);
  const vidSrc = vidFile ? vidPreview : vidUrl;

  async function save() {
    const name = (f.name || '').trim(), sku = (f.sku || '').trim();
    const price = (f.price === '' || f.price == null) ? null : Number(f.price);
    const stock = Number(f.stock || '');
    if (!name) { toast('Product name required', '⚠️'); return; }
    if (!sku) { toast('SKU required', '⚠️'); return; }
    if (price != null && !(price > 0)) { toast('Price must be > 0 or empty (quotation-only)', '⚠️'); return; }
    if (!(stock >= 0)) { toast('Valid stock required', '⚠️'); return; }
    setSaving(true);
    setErr('');
    try {
      const fresh = imgs.filter((i) => i.file);
      let urls = [];
      if (fresh.length) urls = await uploadFiles(fresh.map((i) => i.file));
      const images = [...imgs.filter((i) => !i.file).map((i) => i.url), ...urls];
      let video = vidUrl || '';
      if (vidFile) { const v = await uploadFiles([vidFile]); video = v[0] || ''; }
      const data = {
        name, sku, brand: f.brand || '', mpn: f.mpn || '', short: f.short || '', price,
        uom: f.uom || 'Pc', moq: Number(f.moq || 1), leadTime: f.leadTime || '', warehouse: f.warehouse || '',
        stock, category: f.category || 'cutting-tools', visible: !!f.visible, featured: !!f.featured,
        desc: f.desc || name, specs: specPrev, images, video
      };
      if (editId) await api.put('/api/products/' + editId, data); // never send companyId on edit
      else {
        if (!targetCompany) throw new Error('No company context — open this form from a company workspace');
        await api.post('/api/products', { ...data, companyId: targetCompany });
      }
      toast(editId ? 'SKU updated' : 'SKU published', '✅');
      nav('/admin/products');
    } catch (e) {
      setErr(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHead
        title={editId ? 'Edit SKU — ' + (f.sku || f.name || id) : 'Add industrial product'}
        actions={<Link className="btn btn-ghost btn-sm" to="/admin/products">← Catalog</Link>}
      />
      <div className="card"><div className="card-pad">
        <div className="form-grid">
          <Field label="Product name *"><input value={f.name} onChange={S('name')} placeholder="e.g. Carbide Turning Insert CNMG 120408" /></Field>
          <Field label="SKU / Item code *"><input value={f.sku} onChange={S('sku')} placeholder="e.g. TOOL-CNMG-01" /></Field>
          <Field label="Brand / Manufacturer"><input value={f.brand} onChange={S('brand')} placeholder="e.g. CarbiMax" /></Field>
          <Field label="Manufacturer part number (MPN)"><input value={f.mpn} onChange={S('mpn')} placeholder="e.g. CM-CNMG120408-MP" /></Field>
          <Field label="Category *"><select value={f.category} onChange={S('category')}>{cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></Field>
          <Field label="Specification summary"><input value={f.short} onChange={S('short')} placeholder="e.g. CNMG 120408 • CVD coated" /></Field>
          <Field label="Selling price (₹) — leave empty for quotation-only"><input type="number" value={f.price} onChange={S('price')} placeholder="Empty = Request Quotation" /></Field>
          <Field label="Unit of measurement"><select value={f.uom} onChange={S('uom')}>{UOMS.map((u) => <option key={u}>{u}</option>)}</select></Field>
          <Field label="Stock (from BI inventory) *"><input type="number" value={f.stock} onChange={S('stock')} placeholder="0" /></Field>
          <Field label="Minimum order qty (MOQ)"><input type="number" value={f.moq} onChange={S('moq')} /></Field>
          <Field label="Lead time"><input value={f.leadTime} onChange={S('leadTime')} placeholder="e.g. Ex-stock / 7 days" /></Field>
          <Field label="Warehouse"><input value={f.warehouse} onChange={S('warehouse')} placeholder="e.g. WH-Pune-01" /></Field>
          <Field full label="Technical description *"><textarea rows="3" value={f.desc} onChange={S('desc')} placeholder="Materials, compatibility, standards, warranty…" /></Field>
          <Field full label="Technical specifications (one per line: Key: Value)">
            <textarea rows="4" value={f.specsText} onChange={S('specsText')} placeholder={'Diameter: Ø10 mm\nCoating: AlCrN'} />
            {Object.keys(specPrev).length > 0 && (
              <table className="spec-table" style={{ marginTop: 8 }}>{Object.entries(specPrev).map(([k, v]) => <tr key={k}><td>{k}</td><td><b>{v}</b></td></tr>)}</table>
            )}
          </Field>
          <Field full label="Product images (multiple) *">
            <div className="upload-zone" onClick={() => imgIn.current && imgIn.current.click()}>📤 <b>Click to upload images</b><div className="hint">JPG / PNG / WEBP • first = primary • stored in company media, never in DB rows</div>
              <input type="file" ref={imgIn} accept="image/*" multiple hidden onChange={pickImages} />
            </div>
            <div className="media-row">
              {imgs.map((im, i) => (
                <span key={i} style={{ position: 'relative', display: 'inline-block' }}>
                  <img src={im.preview || im.url} alt="" />
                  <button className="btn btn-ghost btn-sm" style={{ position: 'absolute', top: 2, right: 2, padding: '0 6px' }} onClick={() => { if (im.preview) URL.revokeObjectURL(im.preview); setImgs((p) => p.filter((_, j) => j !== i)); }} title="Remove">✕</button>
                </span>
              ))}
            </div>
          </Field>
          <Field full label="Product video (demo / installation, optional)">
            <div className="upload-zone" onClick={() => vidIn.current && vidIn.current.click()}>🎬 <b>Click to upload video</b><div className="hint">MP4 / WEBM • max 50MB</div>
              <input type="file" ref={vidIn} accept="video/*" hidden onChange={pickVideo} />
            </div>
            <div className="media-row">
              {vidSrc && !vidErr && <video src={vidSrc} controls onError={() => setVidErr(true)} />}
              {vidSrc && !vidErr && <button className="btn btn-ghost btn-sm" onClick={() => { if (vidPreview) URL.revokeObjectURL(vidPreview); setVidPreview(''); setVidFile(null); setVidUrl(''); }}>Remove video</button>}
              {vidErr && <p className="hint">⚠️ Video failed to load.</p>}
            </div>
          </Field>
          <Field label="Store visibility"><select value={f.visible ? '1' : '0'} onChange={(e) => setF((p) => ({ ...p, visible: e.target.value === '1' }))}><option value="1">Visible in store</option><option value="0">Hidden</option></select></Field>
          <Field label="Featured"><select value={f.featured ? '1' : '0'} onChange={(e) => setF((p) => ({ ...p, featured: e.target.value === '1' }))}><option value="1">Featured on homepage</option><option value="0">Normal</option></select></Field>
        </div>
        {err && <p className="ferr" style={{ marginTop: 10 }}>⚠️ {err}</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button className="btn btn-primary" disabled={saving} onClick={save}>💾 {saving ? 'Saving…' : (editId ? 'Save changes' : 'Publish product')}</button>
          <Link className="btn btn-ghost" to="/admin/products">Cancel</Link>
        </div>
        <p className="hint">Reuses the BI product record: SKU unique per company • stock mirrors inventory balances • media goes to Storage buckets.</p>
      </div></div>
    </>
  );
}
