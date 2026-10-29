/* Store home — mirrors legacy vHome: hero, category cards, conditional sections. */
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Share2, Check } from 'lucide-react';
import { api, fmt, getCart, setCart } from '../../api';
import { useAuth } from '../../auth';
import { Field, Modal, Skeleton, toast } from '../../components/ui';

export const availBadge = (p, style) => {
  if (p.price == null && p.stock <= 0) return <span className="badge out" style={style}>Check availability</span>;
  if (p.stock <= 0) return <span className="badge out" style={style}>Out of stock</span>;
  return <span className="badge in" style={style}>In stock</span>;
};

export const priceHtml = (p, big) => {
  if (p.price == null) return <span className="price rfq">Request Quotation</span>;
  return <span className="price" style={big ? { fontSize: 26 } : undefined}>{fmt(p.price)} <small>/ {p.uom || 'Pc'}</small></span>;
};

export const asList = (d) => (Array.isArray(d) ? d : (d && d.rows) || []);

export function addToCart(p, qty = 1, opts = {}) {
  if (p.price == null) { toast('Quotation-only item — submit an RFQ instead', '📝'); if (opts.onRfq) opts.onRfq(p); return false; }
  if (p.stock <= 0) { toast('Out of stock — check availability via RFQ', '⚠️'); return false; }
  qty = Math.max(p.moq || 1, qty);
  const cart = getCart();
  const ex = cart.find((c) => c.pid === p.id);
  const cur = ex ? ex.qty : 0;
  if (cur + qty > p.stock) { toast(`Only ${p.stock} ${p.uom || ''} in stock`, '⚠️'); return false; }
  if (ex) ex.qty += qty; else cart.push({ pid: p.id, qty });
  setCart(cart);
  if (!opts.silent) toast(`${p.sku || p.name} × ${qty} added`, '🧾');
  return true;
}

export function RfqModal({ p, me, onClose, onDone }) {
  const [qty, setQty] = useState(p.moq || 1);
  const [co, setCo] = useState('Sharma Auto Components Pvt Ltd');
  const [contact, setContact] = useState((me && me.name) || '');
  const [mobile, setMobile] = useState('98765 43210');
  const [tech, setTech] = useState('');
  const [del, setDel] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!Number(qty) || !String(co).trim() || !String(contact).trim() || !String(mobile).trim()) {
      toast('Company, contact, mobile and qty are required', '⚠️');
      return;
    }
    setBusy(true);
    try {
      const q = await api.post('/api/quotations', { pid: p.id, qty: Number(qty), companyName: co, contact, mobile, techReq: tech, deliveryReq: del });
      toast('RFQ ' + q.id + ' submitted', '📝');
      onDone();
    } catch (e) {
      toast(e.message, '⚠️');
      setBusy(false);
    }
  };
  return (
    <Modal title={`📝 Request Quotation — ${p.sku || p.id}`} onClose={onClose}>
      <b>{p.name}</b>
      <p className="hint">{p.brand || ''}{p.mpn ? ' • MPN ' + p.mpn : ''} • {p.stock} {p.uom || ''} in {p.warehouse || 'stock'}</p>
      <div className="form-grid">
        <Field label={`Quantity (${p.uom || 'Pc'}) *`}><input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Company name *"><input value={co} onChange={(e) => setCo(e.target.value)} /></Field>
        <Field label="Contact person *"><input value={contact} onChange={(e) => setContact(e.target.value)} /></Field>
        <Field label="Mobile *"><input value={mobile} onChange={(e) => setMobile(e.target.value)} /></Field>
        <Field label="Technical requirements" full><textarea rows="2" value={tech} onChange={(e) => setTech(e.target.value)} placeholder="e.g. A6 mount, tolerance, compatible machine…" /></Field>
        <Field label="Delivery requirements" full><input value={del} onChange={(e) => setDel(e.target.value)} placeholder="e.g. Needed at Chakan plant by month-end" /></Field>
      </div>
      <button className="btn btn-coral" style={{ width: '100%' }} disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit RFQ'}</button>
      <p className="hint">Maps to the ERP Quotations module. No stock is reserved by an RFQ.</p>
    </Modal>
  );
}

export function ProdCard({ p, catName, onAdd, onRfq, selected, onToggleSelect, onShare }) {
  const action = p.price == null
    ? <button className="btn btn-dark btn-sm" onClick={() => onRfq(p)}>Request Quote</button>
    : p.stock <= 0
      ? <button className="btn btn-ghost btn-sm" onClick={() => onRfq(p)}>Check Availability</button>
      : <button className="btn btn-primary btn-sm" onClick={() => onAdd(p)}>Add to Cart</button>;
  return (
    <div className={`prod relative ${selected ? 'ring-2 ring-[#2E1508] bg-[#FAF6F1]' : ''}`}>
      {onToggleSelect && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleSelect(p);
          }}
          className={`absolute top-2.5 left-2.5 z-30 w-7 h-7 rounded-lg flex items-center justify-center transition-all shadow-md border cursor-pointer ${
            selected
              ? 'bg-[#2E1508] text-white border-[#2E1508] ring-2 ring-white/90 scale-105'
              : 'bg-white hover:bg-[#FAF6F1] border-[#8C7A6B] text-transparent hover:border-[#2E1508]'
          }`}
          title={selected ? 'Deselect SKU' : 'Select SKU to share / export'}
          aria-label={selected ? 'Deselect SKU' : 'Select SKU'}
        >
          <Check className={`w-4 h-4 stroke-[3] transition-opacity ${selected ? 'text-white opacity-100' : 'opacity-0'}`} />
        </button>
      )}
      <Link className="prod-img" to={`/store/product/${p.id}`}>
        <img loading="lazy" src={(p.images || [])[0] || ''} alt={p.name} onError={(e) => { e.currentTarget.src = `https://picsum.photos/seed/${p.sku || p.id}/700/525`; }} />
        {availBadge(p, onToggleSelect ? { left: 44 } : undefined)}<span className="badge cat">{catName(p.category)}</span>
      </Link>
      <div className="prod-body">
        <span className="sku">SKU: {p.sku || p.id}</span>
        <div className="prod-name">{p.name}</div>
        <div className="prod-desc">{p.short || ''}</div>
        <div className="prod-meta">{p.brand || ''}{p.mpn ? ' • MPN ' + p.mpn : ''}{p.uom ? ' • per ' + p.uom : ''}</div>
        <div className="prod-row">{priceHtml(p)}<span className="hint">{p.warehouse || ''}</span></div>
        <div className="prod-actions">
          <Link className="btn btn-ghost btn-sm" to={`/store/product/${p.id}`}>Details</Link>
          {onShare && (
            <button
              type="button"
              className="btn btn-ghost btn-sm text-[#2E1508] hover:bg-[#DECDBE] border border-[#BAA794]/60 font-semibold flex items-center justify-center gap-1 cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onShare(p);
              }}
              title="Share or Export this SKU (PDF / WhatsApp / Email)"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </button>
          )}
          {action}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { me } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [products, setProducts] = useState(null);
  const [cats, setCats] = useState([]);
  const [rfq, setRfq] = useState(null);

  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => {
    api.get('/api/products').then((d) => setProducts(asList(d))).catch(() => setProducts([]));
    api.get('/api/categories').then((d) => setCats(asList(d))).catch(() => {});
  }, []);

  if (products === null) return <Skeleton h={320} />;
  const catName = (id) => ((cats.find((c) => c.id === id) || {}).name || id);
  const ps = products.filter((p) => p.visible);
  const feat = ps.filter((p) => p.featured);
  const freq = [...ps].filter((p) => p.price != null && p.stock > 0).sort((a, b) => (b.sold || 0) - (a.sold || 0)).slice(0, 4);
  const spares = ps.filter((p) => p.category === 'spares').slice(0, 4);
  const tools = ps.filter((p) => p.category === 'cutting-tools').slice(0, 4);
  const recent = [...ps].sort((a, b) => String(b.created).localeCompare(String(a.created))).slice(0, 4);

  const onAdd = (p) => {
    if (addToCart(p)) nav(loc.pathname + loc.search, { replace: true });
  };
  const sec = (t, arr) => arr.length ? (
    <><div className="section-head"><h2>{t}</h2><Link className="btn btn-ghost btn-sm" to="/store/listing">View all →</Link></div>
      <div className="prod-grid">{arr.map((p) => <ProdCard key={p.id} p={p} catName={catName} onAdd={onAdd} onRfq={setRfq} />)}</div></>
  ) : null;

  return (
    <>
      <div className="hero"><div className="hero-inner">
        <div>
          <span className="hero-tag">ARGUSCNC ERP • INDUSTRIAL PROCUREMENT</span>
          <h1>Precision Products for Modern Manufacturing</h1>
          <p>Discover CNC machine components, precision tooling, industrial spares, and manufacturing essentials — sourced from live ERP inventory.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="btn btn-coral" to="/store/listing">Explore Products →</Link>
            <Link className="btn btn-ghost" style={{ background: 'rgba(255,255,255,.1)', borderColor: 'rgba(255,255,255,.3)', color: '#fff' }} to="/store/listing?cat=cutting-tools">Browse Categories</Link>
          </div>
          <div className="ind-strip" style={{ margin: '20px 0 0' }}>
            <div className="ind-stat"><b>{ps.length}</b><p>Live SKUs</p></div>
            <div className="ind-stat"><b>{cats.length}</b><p>Categories</p></div>
            <div className="ind-stat"><b>{ps.filter((p) => p.stock > 0).length}</b><p>In stock</p></div>
            <div className="ind-stat"><b>{ps.filter((p) => p.price == null).length}</b><p>On quotation</p></div>
          </div>
        </div>
        <div><img src="https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?auto=format&fit=crop&w=800&q=80" onError={(e) => { e.currentTarget.src = 'https://picsum.photos/seed/cnc-hero/800/600'; }} style={{ borderRadius: 12, aspectRatio: '4/3', objectFit: 'cover', width: '100%' }} alt="CNC machining floor" /></div>
      </div></div>

      <div className="section-head"><h2>Shop by category</h2><Link className="btn btn-ghost btn-sm" to="/store/listing">All products →</Link></div>
      <div className="cat-grid">
        {cats.map((c) => {
          const n = ps.filter((p) => p.category === c.id).length;
          return (
            <Link key={c.id} className="cat-card" to={'/store/listing?cat=' + c.id}>
              <span className="cat-ico">{c.icon}</span>
              <span><b>{c.name}</b><p>{c.desc || ''}</p><p><b>{n}</b> product{n === 1 ? '' : 's'}</p></span>
            </Link>
          );
        })}
      </div>

      {sec('⭐ Featured industrial products', feat)}
      {sec('🔁 Frequently ordered', freq)}
      {sec('⚙️ Machine spare parts', spares)}
      {sec('🔩 Precision cutting tools', tools)}
      {sec('🆕 Recently added', recent)}
      {rfq && <RfqModal p={rfq} me={me} onClose={() => setRfq(null)} onDone={() => { setRfq(null); nav('/store/quotes'); }} />}
    </>
  );
}
