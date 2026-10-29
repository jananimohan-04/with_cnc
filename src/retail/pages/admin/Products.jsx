/* Company catalog — Industrial catalog with single & multi-product selection,
   PDF datasheet export, WhatsApp formatting, and Email quotation sharing. */
import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Boxes,
  FileDown,
  Mail,
  MessageSquare,
  Share2,
  Copy,
  ExternalLink,
  FileText,
  Check,
  X
} from 'lucide-react';
import { api, fmt, imgFallback, getSession } from '../../api';
import { PageHero, DataTable, Empty, Skeleton, Pager, Confirm, toast } from '../../components/ui';
import ProductShareModal from '../../components/ProductShareModal';
import {
  getProductMedia,
  exportProductsPdf
} from '../../utils/productShare';

function norm(d) {
  if (!d) return { rows: [], total: 0, page: 1, limit: 8 };
  if (Array.isArray(d)) return { rows: d, total: d.length, page: 1, limit: 8 };
  return { rows: d.rows || [], total: d.total != null ? d.total : (d.rows || []).length, page: d.page || 1, limit: d.limit || 8 };
}

export default function Products() {
  const [q, setQ] = useState('');
  const [deb, setDeb] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [tick, setTick] = useState(0);
  const [delTarget, setDelTarget] = useState(null);
  const [delBusy, setDelBusy] = useState(false);

  // Selection state (keyed by product ID to persist across search / pagination)
  const [selectedMap, setSelectedMap] = useState({});

  // Share modal state
  const [shareModal, setShareModal] = useState(null);

  const session = useMemo(() => getSession() || {}, []);
  const companyName = session.companyName || 'ARGUS CNC';
  const companyEmail = session.email || 'technologiesargus@gmail.com';

  useEffect(() => {
    const t = setTimeout(() => { setDeb(q); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let on = true;
    const qs = new URLSearchParams({ page, limit: 8 });
    if (deb) qs.set('q', deb);
    api.get('/api/products?' + qs.toString())
      .then((d) => { if (on) setData({ ...norm(d), err: '' }); })
      .catch((e) => { if (on) setData({ rows: [], total: 0, page: 1, limit: 8, err: e.message }); });
    return () => { on = false; };
  }, [page, deb, tick]);

  function toggleVis(p) {
    api.patch('/api/products/' + p.id + '/visibility', { visible: !p.visible })
      .then(() => { toast('Visibility updated', '👁️'); setTick((t) => t + 1); })
      .catch((e) => toast(e.message, '⚠️'));
  }

  // Multi-selection helpers
  const rows = data?.rows || [];
  const selectedProducts = useMemo(() => Object.values(selectedMap), [selectedMap]);
  const selectedCount = selectedProducts.length;
  const allOnPage = rows.length > 0 && rows.every((r) => !!selectedMap[r.id]);
  const someOnPage = rows.some((r) => !!selectedMap[r.id]);

  const toggleSelect = (p) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[p.id]) {
        delete next[p.id];
      } else {
        next[p.id] = p;
      }
      return next;
    });
  };

  const toggleSelectAllPage = () => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (allOnPage) {
        rows.forEach((r) => { delete next[r.id]; });
      } else {
        rows.forEach((r) => { next[r.id] = r; });
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedMap({});

  // Open share modal with 1 or more products
  const openShareModal = (targetProducts, tab = 'pdf') => {
    if (!targetProducts || !targetProducts.length) return;
    setShareModal({
      products: targetProducts,
      tab
    });
  };

  const handleExportPdfNow = (productsToExport) => {
    const list = productsToExport || (shareModal ? shareModal.products : selectedProducts);
    if (!list || !list.length) {
      toast('No products selected for PDF export', '⚠️');
      return;
    }
    exportProductsPdf(list, { name: companyName, email: companyEmail });
    toast(`Generating catalog PDF for ${list.length} SKU(s)…`, '📄');
  };

  if (!data) return <Skeleton h={220} />;
  if (data.err && !data.rows.length) return <Empty icon="⚠️" title={data.err} sub="Could not reach the backend." />;

  return (
    <>
      <PageHero
        title={'Stock Library (' + data.total + ' SKUs)'}
        subtitle="Catalog inventory, pricing, stock levels, and visibility status."
        icon={Boxes}
        badgeText="Inventory Management"
        badgeColor="emerald"
        gradient="from-emerald-500 via-teal-600 to-green-600"
        actions={
          <>
            <Link className="btn btn-ghost btn-sm" to="/admin/media">Media library</Link>
            <Link className="btn btn-primary btn-sm bg-emerald-600 hover:bg-emerald-700 border-none shadow-sm shadow-emerald-600/30 text-white" to="/admin/products/new">+ Add product</Link>
          </>
        }
      />
      <div className="card"><div className="card-pad">
        <div className="toolbar"><input placeholder="Search name, SKU, brand, MPN…" value={q} onChange={(e) => setQ(e.target.value)} /></div>

        {/* Multi-Select Floating / Sticky Batch Actions Toolbar */}
        {selectedCount > 0 && (
          <div className="mb-3.5 p-3 rounded-xl bg-[#DECDBE] border border-[#BAA794] flex flex-wrap items-center justify-between gap-3 shadow-xs">
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
                Clear selection
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
                title="Send selected SKUs via Email"
              >
                <Mail className="w-3.5 h-3.5" />
                Send Email ({selectedCount})
              </button>
            </div>
          </div>
        )}

        {data.total === 0 && !deb
          ? <div className="empty" style={{ padding: 32, textAlign: 'center' }}><div className="big">📦</div><h3>No products in catalog</h3><p className="hint">Your company catalog is empty. Click "+ Add product" above to create your first SKU.</p></div>
          : <>
            <DataTable
              empty="No products match your search."
              rowKey={(r) => r.id}
              cols={[
                {
                  key: 'select',
                  label: (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <input
                        type="checkbox"
                        checked={allOnPage}
                        ref={(el) => { if (el) el.indeterminate = someOnPage && !allOnPage; }}
                        onChange={toggleSelectAllPage}
                        className="w-4 h-4 rounded cursor-pointer accent-[#2E1508]"
                        title={allOnPage ? "Deselect all on this page" : "Select all on this page"}
                      />
                    </div>
                  ),
                  render: (p) => (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <input
                        type="checkbox"
                        checked={!!selectedMap[p.id]}
                        onChange={() => toggleSelect(p)}
                        className="w-4 h-4 rounded cursor-pointer accent-[#2E1508]"
                        title={selectedMap[p.id] ? "Deselect SKU" : "Select SKU"}
                      />
                    </div>
                  )
                },
                {
                  key: 'p', label: 'Product', render: (p) => {
                    const { images, docs } = getProductMedia(p);
                    return (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <img className="thumb" src={images[0] || ''} alt="" onError={(e) => { e.currentTarget.src = imgFallback(p.sku || p.id, 100, 100); }} />
                        <div>
                          <b>{p.name}</b>
                          <div className="hint">{p.sku || p.id}{p.mpn ? ' • MPN ' + p.mpn : ''}</div>
                          {/* Attached Media Chips */}
                          <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                            {docs.length > 0 && (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300"
                                title={`Attached PDFs: ${docs.map(d => d.title).join(', ')}`}
                              >
                                📄 {docs.length} PDF{docs.length > 1 ? 's' : ''}
                              </span>
                            )}
                            {images.length > 1 && (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#E4D5C7] text-[#2E1508]"
                                title={`${images.length} photos available`}
                              >
                                🖼️ {images.length}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }
                },
                { key: 'brand', label: 'Brand', render: (p) => p.brand || '—' },
                {
                  key: 'price', label: 'Price', render: (p) => (p.price != null
                    ? <span><b>{fmt(p.price)}</b> <span className="hint">/ {p.uom || 'Pc'}</span></span>
                    : <span className="status s-ready">RFQ</span>)
                },
                {
                  key: 'stock', label: 'Stock', render: (p) => (
                    <span>{p.stock} <span className="hint">{p.uom || ''}</span></span>)
                },
                {
                  key: 'vis', label: 'Visible', render: (p) => (
                    <button className={'status ' + (p.visible ? 's-active' : 's-cancelled')} onClick={() => toggleVis(p)}>{p.visible ? 'Visible' : 'Hidden'}</button>)
                },
                {
                  key: 'act', label: 'Actions', render: (p) => (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button
                        className="btn btn-ghost btn-sm text-[#2E1508] hover:bg-[#DECDBE] border border-[#BAA794]/60 font-semibold flex items-center gap-1 cursor-pointer"
                        onClick={() => openShareModal([p], 'pdf')}
                        title="Share or Export this SKU (PDF / WhatsApp / Email)"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        Share
                      </button>
                      <Link className="btn btn-ghost btn-sm" to={'/admin/products/edit/' + p.id}>Edit</Link>
                      <button className="btn btn-ghost btn-sm text-rose-600 hover:text-rose-700 cursor-pointer" onClick={() => setDelTarget(p)} title="Delete product">🗑️</button>
                    </div>
                  )
                }
              ]}
              rows={data.rows}
            />
            <Pager total={data.total} page={data.page} limit={data.limit} onPage={setPage} />
          </>}
      </div></div>

      {/* Delete Confirmation Modal */}
      {delTarget && (
        <Confirm
          title="Delete Product"
          body={`Are you sure you want to permanently delete SKU <b>${delTarget.sku || delTarget.id}</b> (${delTarget.name})? This cannot be undone.`}
          okLabel="Delete Permanently"
          danger
          busy={delBusy}
          onCancel={() => setDelTarget(null)}
          onOk={async () => {
            setDelBusy(true);
            try {
              await api.del('/api/products/' + delTarget.id);
              toast('Product deleted', '🗑️');
              setDelTarget(null);
              setTick((t) => t + 1);
            } catch (e) {
              toast('Delete failed: ' + e.message, '⚠️');
            } finally {
              setDelBusy(false);
            }
          }}
        />
      )}

      {/* Product Share & PDF Export Modal */}
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
