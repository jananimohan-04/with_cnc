/* Store listing — mirrors legacy vListing: filters/sort/search semantics.
   Includes multi-selection and direct SKU sharing (PDF, WhatsApp, Email). */
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ShoppingBag, FileDown, Mail, MessageSquare, Share2 } from 'lucide-react';
import { api, getSession } from '../../api';
import { useAuth } from '../../auth';
import { Skeleton, PageHero } from '../../components/ui';
import ProductShareModal from '../../components/ProductShareModal';
import { ProdCard, RfqModal, addToCart, asList } from './Home';

export default function Listing() {
  const { me } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState(null);
  const [cats, setCats] = useState([]);
  const [rfq, setRfq] = useState(null);

  // Multi-selection & Share modal state
  const [selectedMap, setSelectedMap] = useState({});
  const [shareModal, setShareModal] = useState(null);

  const selectedProducts = useMemo(() => Object.values(selectedMap), [selectedMap]);
  const selectedCount = selectedProducts.length;

  const session = useMemo(() => getSession() || {}, []);
  const companyName = session.companyName || 'ARGUS CNC';
  const companyEmail = session.email || 'technologiesargus@gmail.com';

  const [cat, setCat] = useState(params.get('cat') || 'all');
  const [brand, setBrand] = useState('all');
  const [sort, setSort] = useState('new');
  const [avail, setAvail] = useState('all');
  const [minP, setMinP] = useState('');
  const [maxP, setMaxP] = useState('');
  const q = params.get('q') || '';

  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => {
    api.get('/api/products').then((d) => setProducts(asList(d))).catch(() => setProducts([]));
    api.get('/api/categories').then((d) => setCats(asList(d))).catch(() => {});
  }, []);
  useEffect(() => {
    setCat(params.get('cat') || 'all');
  }, [params]);

  const brands = useMemo(() => [...new Set((products || []).map((p) => p.brand).filter(Boolean))], [products]);

  const onAdd = (p) => {
    if (addToCart(p)) nav(loc.pathname + loc.search, { replace: true });
  };
  const clearF = () => {
    setCat('all'); setBrand('all'); setSort('new'); setAvail('all'); setMinP(''); setMaxP('');
    setParams({});
  };

  if (products === null) return <Skeleton h={320} />;
  const catName = (id) => ((cats.find((c) => c.id === id) || {}).name || id);
  let ps = products.filter((p) => p.visible);
  const ql = q.toLowerCase();
  if (cat !== 'all') ps = ps.filter((p) => p.category === cat);
  if (brand !== 'all') ps = ps.filter((p) => p.brand === brand);
  if (avail === 'in') ps = ps.filter((p) => p.stock > 0 && p.price != null);
  if (avail === 'rfq') ps = ps.filter((p) => p.price == null || p.stock <= 0);
  if (q) ps = ps.filter((p) => [p.name, p.short, p.desc, p.sku, p.brand, p.mpn].filter(Boolean).join(' ').toLowerCase().includes(ql));
  if (minP !== '') ps = ps.filter((p) => p.price != null && p.price >= Number(minP));
  if (maxP !== '') ps = ps.filter((p) => p.price != null && p.price <= Number(maxP));
  if (sort === 'price-asc') ps.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  else if (sort === 'price-desc') ps.sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
  else if (sort === 'name') ps.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'avail') ps.sort((a, b) => ((b.stock > 0) - (a.stock > 0)));
  else ps.sort((a, b) => String(b.created).localeCompare(String(a.created)));

  // Multi-selection helpers
  const allVisibleSelected = ps.length > 0 && ps.every((p) => !!selectedMap[p.id]);

  const toggleSelect = (p) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[p.id]) delete next[p.id];
      else next[p.id] = p;
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (allVisibleSelected) {
        ps.forEach((p) => { delete next[p.id]; });
      } else {
        ps.forEach((p) => { next[p.id] = p; });
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedMap({});

  const openShareModal = (targetProducts, tab = 'pdf') => {
    if (!targetProducts || !targetProducts.length) return;
    setShareModal({ products: targetProducts, tab });
  };

  return (
    <>
      <PageHero
        title={`Industrial Catalog (${ps.length} SKUs)`}
        subtitle="Search SKU, MPN, industrial brand, technical compatibility, and inventory status."
        icon={ShoppingBag}
        badgeText="Industrial Storefront"
        badgeColor="orange"
        gradient="from-orange-500 via-amber-500 to-red-500"
      />
      <div className="card"><div className="card-pad">
        <div className="toolbar flex-wrap">
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="all">All categories</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="all">All brands</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="new">Recently added</option>
            <option value="name">Name A–Z</option>
            <option value="price-asc">Price: low → high</option>
            <option value="price-desc">Price: high → low</option>
            <option value="avail">Availability</option>
          </select>
          <select value={avail} onChange={(e) => setAvail(e.target.value)}>
            <option value="all">All availability</option>
            <option value="in">In stock (priced)</option>
            <option value="rfq">Quotation / indent</option>
          </select>
          <input type="number" placeholder="Min ₹" style={{ maxWidth: 110 }} value={minP} onChange={(e) => setMinP(e.target.value)} />
          <input type="number" placeholder="Max ₹" style={{ maxWidth: 110 }} value={maxP} onChange={(e) => setMaxP(e.target.value)} />
          {q ? <span className="hint">“{q}” <button className="btn btn-ghost btn-sm" onClick={clearF}>Clear</button></span> : null}

          {ps.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[#2E1508] cursor-pointer ml-auto bg-[#F2E5D8]/60 hover:bg-[#F2E5D8] px-2.5 py-1.5 rounded-lg border border-[#BAA794]/60">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAllVisible}
                className="w-4 h-4 rounded border-[#BAA794] text-[#2E1508] focus:ring-[#2E1508] cursor-pointer"
              />
              Select all visible ({ps.length})
            </label>
          )}
        </div>

        {/* Multi-Select Floating / Sticky Batch Actions Toolbar */}
        {selectedCount > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-[#DECDBE] border border-[#BAA794] flex flex-wrap items-center justify-between gap-3 shadow-xs sticky top-3 z-30">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse" />
              <span className="text-xs font-bold text-[#1A0A03]">
                <b>{selectedCount}</b> {selectedCount === 1 ? 'product' : 'products'} selected
              </span>
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs font-semibold text-[#78350F] hover:underline ml-2 cursor-pointer"
              >
                Clear
              </button>
              <span className="text-[#8F6A52]">|</span>
              <button
                type="button"
                onClick={toggleSelectAllVisible}
                className="text-xs font-semibold text-[#2E1508] hover:underline cursor-pointer"
              >
                {allVisibleSelected ? 'Deselect All Visible' : `Select All Visible (${ps.length})`}
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => openShareModal(selectedProducts, 'pdf')}
                className="btn btn-sm bg-[#2E1508] hover:bg-[#432311] text-white border-none shadow-xs font-bold flex items-center gap-1.5 cursor-pointer"
                title="Download selected SKUs as catalog PDF"
              >
                <FileDown className="w-3.5 h-3.5" />
                Download PDF ({selectedCount})
              </button>
              <button
                type="button"
                onClick={() => openShareModal(selectedProducts, 'whatsapp')}
                className="btn btn-sm bg-emerald-700 hover:bg-emerald-800 text-white border-none shadow-xs font-bold flex items-center gap-1.5 cursor-pointer"
                title="Share selected SKUs via WhatsApp"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Send WhatsApp ({selectedCount})
              </button>
              <button
                type="button"
                onClick={() => openShareModal(selectedProducts, 'email')}
                className="btn btn-sm bg-sky-800 hover:bg-sky-900 text-white border-none shadow-xs font-bold flex items-center gap-1.5 cursor-pointer"
                title="Share selected SKUs via Email quotation"
              >
                <Mail className="w-3.5 h-3.5" />
                Send Email ({selectedCount})
              </button>
            </div>
          </div>
        )}

        {ps.length
          ? (
            <div className="prod-grid">
              {ps.map((p) => (
                <ProdCard
                  key={p.id}
                  p={p}
                  catName={catName}
                  onAdd={onAdd}
                  onRfq={setRfq}
                  selected={!!selectedMap[p.id]}
                  onToggleSelect={toggleSelect}
                  onShare={(prod) => openShareModal([prod], 'pdf')}
                />
              ))}
            </div>
          )
          : (
            <div className="empty">
              <div className="big">🔩</div>
              <b>No matching SKUs</b>
              <p>Try a different SKU, brand or category.</p>
              <button className="btn btn-ghost btn-sm" onClick={clearF}>Clear filters</button>
            </div>
          )}
      </div></div>

      {rfq && <RfqModal p={rfq} me={me} onClose={() => setRfq(null)} onDone={() => { setRfq(null); nav('/store/quotes'); }} />}

      {/* Reusable Product Share & PDF Export Modal */}
      {shareModal && (
        <ProductShareModal
          products={shareModal.products}
          initialTab={shareModal.tab}
          companyInfo={{ name: companyName, email: companyEmail }}
          onClose={() => setShareModal(null)}
        />
      )}
    </>
  );
}
