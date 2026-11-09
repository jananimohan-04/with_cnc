/* Store listing — Professional Industrial B2B Catalog.
   Includes interactive category quick-nav, multi-selection batch exports (PDF, WhatsApp, Email),
   rich filter toolbar, and staggered micro-animations. */
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileDown, Mail, MessageSquare, Search, SlidersHorizontal, RotateCcw,
  Sparkles, Layers, ArrowUpDown, CheckCircle2, Boxes, ShieldCheck, Check
} from 'lucide-react';
import { api, getSession } from '../../api';
import { useAuth } from '../../auth';
import { Skeleton } from '../../components/ui';
import ProductShareModal from '../../components/ProductShareModal';
import { ProdCard, RfqModal, addToCart, asList } from './Home';
import '../../styles/catalog.css';

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
  const [searchInput, setSearchInput] = useState(params.get('q') || '');
  const q = params.get('q') || '';

  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    api.get('/api/products').then((d) => setProducts(asList(d))).catch(() => setProducts([]));
    api.get('/api/categories').then((d) => setCats(asList(d))).catch(() => {});
  }, []);

  useEffect(() => {
    const urlCat = params.get('cat') || 'all';
    setCat(urlCat);
    const urlQ = params.get('q') || '';
    setSearchInput(urlQ);
  }, [params]);

  const brands = useMemo(() => [...new Set((products || []).map((p) => p.brand).filter(Boolean))], [products]);

  // Total counts
  const visibleProductsTotal = useMemo(() => (products || []).filter((p) => p.visible).length, [products]);

  const onAdd = (p) => {
    if (addToCart(p)) nav(loc.pathname + loc.search, { replace: true });
  };

  const clearF = () => {
    setCat('all'); setBrand('all'); setSort('new'); setAvail('all'); setMinP(''); setMaxP(''); setSearchInput('');
    setParams({});
  };

  const handleCategorySelect = (categoryId) => {
    setCat(categoryId);
    const next = new URLSearchParams(params);
    if (categoryId === 'all') next.delete('cat');
    else next.set('cat', categoryId);
    setParams(next);
  };

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    const next = new URLSearchParams(params);
    if (searchInput.trim()) next.set('q', searchInput.trim());
    else next.delete('q');
    setParams(next);
  };

  const clearSearch = () => {
    setSearchInput('');
    const next = new URLSearchParams(params);
    next.delete('q');
    setParams(next);
  };

  if (products === null) return <Skeleton h={380} />;

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

  const hasActiveFilters = cat !== 'all' || brand !== 'all' || sort !== 'new' || avail !== 'all' || minP !== '' || maxP !== '' || !!q;

  return (
    <div className="ls-wrap">
      {/* Hero Banner with Ambient Warmth */}
      <div className="ls-hero-card">
        <div className="ls-hero-content">
          <div className="ls-hero-title-group">
            <span className="ls-hero-badge">
              <Boxes className="w-3.5 h-3.5" />
              Industrial Storefront
            </span>
            <h1 className="ls-hero-title">
              Industrial Catalog <span className="text-[#FF9A4D]">({ps.length} Products)</span>
            </h1>
            <p className="ls-hero-sub">
              Direct factory procurement for precision tooling, CNC machinery, raw materials, and verified components.
            </p>
          </div>

          <div className="ls-hero-stats">
            <div className="ls-stat-pill">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span><b>{visibleProductsTotal}</b> Items Listed</span>
            </div>
            <div className="ls-stat-pill">
              <ShieldCheck className="w-4 h-4 text-[#FF9A4D]" />
              <span>Direct Factory Dispatch</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar Card */}
      <div className="ls-toolbar-card">
        <div className="ls-toolbar-row">
          {/* Quick Search */}
          <form onSubmit={handleSearchSubmit} className="ls-input-wrap">
            <Search className="w-4 h-4" />
            <input
              type="text"
              placeholder="Search product, MPN, SKU…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="ls-search-input"
            />
            {searchInput && (
              <button type="button" onClick={clearSearch} className="ls-search-clear" title="Clear search">
                ×
              </button>
            )}
          </form>

          {/* Category Dropdown */}
          <select value={cat} onChange={(e) => handleCategorySelect(e.target.value)} className="ls-select">
            <option value="all">All categories</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Brand Dropdown */}
          <select value={brand} onChange={(e) => setBrand(e.target.value)} className="ls-select">
            <option value="all">All brands</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>

          {/* Availability Dropdown */}
          <select value={avail} onChange={(e) => setAvail(e.target.value)} className="ls-select">
            <option value="all">All availability</option>
            <option value="in">In stock (priced)</option>
            <option value="rfq">Quotation / indent</option>
          </select>

          {/* Sort Dropdown */}
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="ls-select">
            <option value="new">Recently added</option>
            <option value="name">Name A–Z</option>
            <option value="price-asc">Price: low → high</option>
            <option value="price-desc">Price: high → low</option>
            <option value="avail">Availability</option>
          </select>

          {/* Price Range */}
          <div className="ls-input-wrap">
            <span className="ls-currency-tag">₹</span>
            <input
              type="number"
              placeholder="Min"
              value={minP}
              onChange={(e) => setMinP(e.target.value)}
              className="ls-price-input"
              title="Minimum price in ₹"
            />
          </div>
          <div className="ls-input-wrap">
            <span className="ls-currency-tag">₹</span>
            <input
              type="number"
              placeholder="Max"
              value={maxP}
              onChange={(e) => setMaxP(e.target.value)}
              className="ls-price-input"
              title="Maximum price in ₹"
            />
          </div>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button type="button" onClick={clearF} className="ls-reset-btn" title="Reset all applied filters">
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          )}

          {/* Select All Visible */}
          {ps.length > 0 && (
            <label className="ls-select-all" title="Select or deselect all visible items to export or share">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAllVisible}
                className="w-4 h-4 rounded border-[#BAA794] text-[#2E1508] focus:ring-[#2E1508] cursor-pointer"
              />
              <span>Select all visible ({ps.length})</span>
            </label>
          )}
        </div>
      </div>

      {/* Multi-Select Floating / Sticky Batch Actions Toolbar */}
      <AnimatePresence>
        {selectedCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.98 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="ls-multi-bar"
          >
            <div className="ls-multi-left">
              <span className="ls-pulse-dot" />
              <span className="ls-multi-count">
                <b>{selectedCount}</b> {selectedCount === 1 ? 'product' : 'products'} selected
              </span>
              <button
                type="button"
                onClick={clearSelection}
                className="ls-multi-link"
              >
                Clear
              </button>
              <span className="text-white/20">|</span>
              <button
                type="button"
                onClick={toggleSelectAllVisible}
                className="ls-multi-link text-[#FFD9BD]"
              >
                {allVisibleSelected ? 'Deselect All Visible' : `Select All Visible (${ps.length})`}
              </button>
            </div>

            <div className="ls-multi-actions">
              <button
                type="button"
                onClick={() => openShareModal(selectedProducts, 'pdf')}
                className="ls-batch-btn pdf"
                title="Download selected products as catalog PDF"
              >
                <FileDown className="w-3.5 h-3.5" />
                Download PDF ({selectedCount})
              </button>
              <button
                type="button"
                onClick={() => openShareModal(selectedProducts, 'whatsapp')}
                className="ls-batch-btn wa"
                title="Share selected products via WhatsApp"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Send WhatsApp ({selectedCount})
              </button>
              <button
                type="button"
                onClick={() => openShareModal(selectedProducts, 'email')}
                className="ls-batch-btn mail"
                title="Share selected products via Email quotation"
              >
                <Mail className="w-3.5 h-3.5" />
                Send Email ({selectedCount})
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Product Grid */}
      {ps.length > 0 ? (
        <div className="prod-grid">
          {ps.map((p, index) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: Math.min(index * 0.04, 0.4), ease: 'easeOut' }}
            >
              <ProdCard
                p={p}
                catName={catName}
                onAdd={onAdd}
                onRfq={setRfq}
                selected={!!selectedMap[p.id]}
                onToggleSelect={toggleSelect}
                onShare={(prod) => openShareModal([prod], 'pdf')}
              />
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="pd-empty" style={{ margin: '30px 0' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔩</div>
          <b style={{ fontSize: 16, color: '#1A0A03' }}>No matching products found</b>
          <p style={{ margin: '6px 0 16px', color: '#6B503E', fontSize: 13 }}>
            Try adjusting your search terms, clearing category filters, or expanding the price range.
          </p>
          <button className="ls-reset-btn" onClick={clearF} style={{ margin: '0 auto' }}>
            <RotateCcw className="w-3.5 h-3.5" /> Reset all filters
          </button>
        </div>
      )}

      {/* RFQ Modal */}
      {rfq && (
        <RfqModal
          p={rfq}
          me={me}
          onClose={() => setRfq(null)}
          onDone={() => { setRfq(null); nav('/store/quotes'); }}
        />
      )}

      {/* Reusable Product Share & PDF Export Modal */}
      {shareModal && (
        <ProductShareModal
          products={shareModal.products}
          initialTab={shareModal.tab}
          companyInfo={{ name: companyName, email: companyEmail }}
          onClose={() => setShareModal(null)}
        />
      )}
    </div>
  );
}
