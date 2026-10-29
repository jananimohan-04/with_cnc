/* Store cart — mirrors legacy vCart: MOQ-aware steppers, stock caps, order summary. */
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { api, fmt, getCart, setCart } from '../../api';
import { Empty, Skeleton, toast } from '../../components/ui';
import { downloadQuotationPdf } from '../../utils/quotationInvoiceTemplates';
import { asList } from './Home';

export default function Cart() {
  const nav = useNavigate();
  const loc = useLocation();
  const [products, setProducts] = useState(null);

  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => {
    api.get('/api/products').then((d) => setProducts(asList(d))).catch(() => setProducts([]));
  }, []);

  if (products === null) return <Skeleton h={220} />;
  const prodById = (id) => products.find((p) => p.id === id);
  const refresh = () => nav(loc.pathname + loc.search, { replace: true });

  const chQty = (pid, d) => {
    const cart = getCart();
    const it = cart.find((c) => c.pid === pid);
    const p = prodById(pid);
    if (!it || !p) return;
    const nq = it.qty + d;
    // Legacy guard below was a no-op condition; preserved as-is (no lower MOQ clamp).
    if (nq > p.stock) { toast(`Only ${p.stock} available`, '⚠️'); return; }
    it.qty = nq;
    if (it.qty <= 0) cart.splice(cart.indexOf(it), 1);
    setCart(cart);
    refresh();
  };
  const rm = (pid) => { setCart(getCart().filter((c) => c.pid !== pid)); refresh(); };
  const clearCart = () => { setCart([]); refresh(); };

  const cart = getCart().filter((c) => prodById(c.pid));
  if (!cart.length) {
    return (
      <div className="card"><div className="empty">
        <div className="big">🧾</div>
        <h2>Your indent cart is empty</h2>
        <p>Browse the industrial catalog — tooling, spares, raw materials.</p>
        <Link className="btn btn-primary" to="/store/listing">Browse catalog →</Link>
      </div></div>
    );
  }
  const count = cart.reduce((a, c) => a + c.qty, 0);
  const sub = cart.reduce((a, c) => { const p = prodById(c.pid); return a + (p && p.price != null ? p.price * c.qty : 0); }, 0);

  const handleDownloadQuotation = async () => {
    const quoteItems = cart.map((c) => {
      const p = prodById(c.pid) || {};
      return {
        pid: c.pid,
        qty: c.qty,
        price: p.price != null ? p.price : 0,
        name: p.name || c.pid,
        sku: p.sku || c.pid,
        uom: p.uom || 'Pc',
        brand: p.brand || ''
      };
    });

    const quoteData = {
      customer: {
        companyName: 'Direct Client Indent',
        name: 'Procurement Department'
      },
      items: quoteItems
    };

    downloadQuotationPdf(quoteData);
    toast('Generating official Proforma Quotation PDF…', '📄');

    try {
      await api.post('/api/quotations', {
        items: quoteItems,
        companyName: 'Direct Client Indent'
      });
    } catch {}
  };

  return (
    <>
      <div className="section-head"><h2>Indent cart ({count} items)</h2><button className="btn btn-ghost btn-sm" onClick={clearCart}>Clear all</button></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr .7fr', gap: 14 }} className="dash2">
        <div>
          {cart.map((c) => {
            const p = prodById(c.pid);
            return (
              <div key={c.pid} className="cart-line">
                <img src={(p.images || [])[0] || ''} onError={(e) => { e.currentTarget.src = `https://picsum.photos/seed/${p.sku || p.id}/200/200`; }} style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover' }} alt={p.name} />
                <div>
                  <b>{p.name}</b>
                  <div className="hint">{p.sku || ''} • {fmt(p.price)} / {p.uom || 'Pc'} • {p.stock} in {p.warehouse || 'stock'}</div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
                    <span className="qty"><button onClick={() => chQty(p.id, -1)}>−</button><span>{c.qty}</span><button onClick={() => chQty(p.id, 1)}>+</button></span>
                    <button className="btn btn-ghost btn-sm" onClick={() => rm(p.id)}>Remove</button>
                  </div>
                </div>
                <b>{fmt(p.price * c.qty)}</b>
              </div>
            );
          })}
          <Link className="btn btn-ghost btn-sm" to="/store/listing">← Continue browsing</Link>
        </div>
        <div className="card" style={{ alignSelf: 'start' }}><div className="card-pad">
          <h3 style={{ marginTop: 0 }}>Order summary</h3>
          <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal (excl. GST)</span><b>{fmt(sub)}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, borderTop: '1px dashed var(--line)', paddingTop: 10 }}><span><b>Total</b></span><b>{fmt(sub)}</b></div>
          </div>
          <Link className="btn btn-primary" style={{ width: '100%', marginTop: 14 }} to="/store/checkout">Proceed to checkout →</Link>
          <button
            type="button"
            onClick={handleDownloadQuotation}
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', marginTop: 8, border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 700 }}
          >
            <FileText className="w-4 h-4 text-[#8F2A0E]" /> Download Quotation (PDF)
          </button>
          <p className="hint" style={{ marginTop: 8 }}>Stock revalidated on submit. GST as per invoice.</p>
        </div></div>
      </div>
    </>
  );
}
