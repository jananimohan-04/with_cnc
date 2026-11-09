/* Store product detail — Professional Industrial Catalog Showcase.
   Features high-resolution studio pedestal gallery with photo captions, interactive 3D view,
   technical specs tables, PDF datasheet cards, video showcases, and fluid micro-animations. */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, BookOpen, Film, Layers, MonitorPlay, Package, ShieldCheck, Sparkles,
  Share2, FileText, Truck, BadgeCheck, ReceiptText, Maximize2, Copy, Check,
  ShoppingCart, ArrowRight, Scale, Clock, Building2
} from 'lucide-react';
import { api, fmt, imgFallback } from '../../api';
import { useAuth } from '../../auth';
import { Empty, Skeleton } from '../../components/ui';
import { ProdCard, RfqModal, addToCart, asList } from './Home';
import ProductShareModal from '../../components/ProductShareModal';
import '../../styles/catalog.css';

// documents open inside the application (no download); the PDF engine loads only when one is opened
const PdfViewer = lazy(() => import('../../components/PdfViewer'));

// the 3D engine is a separate download that only loads when the 3D view is shown
const Viewer3D = lazy(() => import('../../components/StoreScene').then((m) => ({ default: m.ProductViewer3D })));

/* probe WebGL support before enabling the 3D button */
const hasWebGL = () => {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch {
    return false;
  }
};

/* youtube watch/shorts/embed url → video id (null when not a YouTube link) */
const ytId = (u) => {
  const m = String(u || '').match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{5,})/i);
  return m ? m[1] : null;
};

/* fade/slide a block in when it scrolls into view */
function Reveal({ children, className = '', delay = 0 }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setOn(true); return undefined; }
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`pd-rv ${on ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

/* the price counts up to its value when the page opens */
function CountUp({ value }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf; const t0 = performance.now(); const dur = 850;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      setV(value * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{fmt(Math.round(v))}</>;
}

export default function Product() {
  const { id } = useParams();
  const { me } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  const [p, setP] = useState(null);
  const [missing, setMissing] = useState(false);
  const [cats, setCats] = useState([]);
  const [companyProds, setCompanyProds] = useState([]);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [viewDoc, setViewDoc] = useState(null);
  const [qty, setQty] = useState(1);
  const [rfq, setRfq] = useState(null);
  const [activeTab, setActiveTab] = useState('specs'); // 'specs' | 'docs' | 'videos' | 'overview'
  const [shareOpen, setShareOpen] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [view3d, setView3d] = useState(() => hasWebGL());
  const [bodyFailed, setBodyFailed] = useState(false);
  const [copiedSku, setCopiedSku] = useState(false);
  const buyRef = useRef(null);

  useEffect(() => { window.scrollTo(0, 0); }, [id]);

  /* the phone buy bar slides up once the main buy buttons have scrolled out of view */
  useEffect(() => {
    const el = buyRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((e) => setStuck(!e[0].isIntersecting && e[0].boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, [p]);

  useEffect(() => {
    setP(null);
    setMissing(false);
    setActiveMediaIndex(0);
    api.get('/api/products/' + id).then((d) => {
      setP(d);
      setQty(Math.min(d.moq || 1, 10));
    }).catch(() => setMissing(true));
    api.get('/api/products').then((d) => setCompanyProds(asList(d))).catch(() => {});
    api.get('/api/categories').then((d) => setCats(asList(d))).catch(() => {});
  }, [id]);

  /* Reconcile media assets */
  const { images, docs, videos, yts, allVisualMedia } = useMemo(() => {
    if (!p) return { images: [], docs: [], videos: [], yts: [], allVisualMedia: [] };
    const rawMedia = Array.isArray(p.media) ? p.media : [];

    /* Images */
    let imgs = rawMedia.filter((m) => m.type === 'image');
    if (!imgs.length && Array.isArray(p.images) && p.images.length) {
      imgs = p.images.map((u, i) => ({
        id: `img-${i}`,
        type: 'image',
        url: u,
        title: '',
        description: '',
        alt: p.name
      }));
    }

    /* Documents */
    const dc = rawMedia.filter((m) => m.type === 'document');

    /* Local Videos */
    let vids = rawMedia.filter((m) => m.type === 'video');
    if (!vids.length && p.video) {
      vids = [{ id: 'video-main', type: 'video', url: p.video, title: 'Product Video', description: '' }];
    }

    /* YouTube Videos */
    let ytList = rawMedia.filter((m) => m.type === 'youtube');
    if (!ytList.length && p.youtube) {
      ytList = [{ id: 'yt-main', type: 'youtube', url: p.youtube, title: 'YouTube Video', description: '' }];
    }

    /* Visual media list for the top gallery (images first, then videos, then youtube) */
    const visual = [...imgs, ...vids, ...ytList];
    return { images: imgs, docs: dc, videos: vids, yts: ytList, allVisualMedia: visual };
  }, [p]);

  if (missing) return <Empty icon="🔍" title="Product not found in catalog." />;
  if (p === null) return <Skeleton h={420} />;

  const catName = (cid) => ((cats.find((c) => c.id === cid) || {}).name || cid);
  const rel = companyProds.filter((x) => x.category === p.category && x.id !== p.id && x.visible).slice(0, 4);
  const stepQty = (d) => setQty((v) => Math.max(1, Math.min(99, v + d)));
  const refresh = () => nav(loc.pathname + loc.search, { replace: true });

  const activeMedia = allVisualMedia[activeMediaIndex] || allVisualMedia[0] || null;
  const specs = Object.entries(p.specs || {}).filter(([k]) => String(k).trim());

  const inStock = p.price != null && p.stock > 0;
  const canBuy = inStock;
  const cap = Math.max(100, p.stock);

  const keyTiles = [
    { label: 'Unit', value: p.uom || 'Nos', icon: Scale },
    { label: 'MOQ', value: `${p.moq || 1} ${p.uom || 'Nos'}`, icon: Layers },
    { label: 'Warehouse', value: p.warehouse || 'Central Hub', icon: Building2 },
    { label: 'Lead Time', value: p.leadTime || 'Ex-stock', icon: Clock },
  ];

  const go = (d) => setActiveMediaIndex((i) => (i + d + allVisualMedia.length) % allVisualMedia.length);
  const zoomMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--zx', `${((e.clientX - r.left) / r.width) * 100}%`);
    e.currentTarget.style.setProperty('--zy', `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  const photo3d = (images[0] && images[0].url) || '';
  const show3d = view3d && !!photo3d;
  const embed = show3d || (activeMedia && (activeMedia.type === 'video' || (activeMedia.type === 'youtube' && ytId(activeMedia.url))));

  const copyText = (text) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopiedSku(true);
    setTimeout(() => setCopiedSku(false), 2000);
  };

  const buyBox = p.price == null
    ? (
      <div className="pd-note">
        <b><Sparkles className="w-4 h-4" />Industrial quotation required</b>
        <p>Priced on request based on quantity, tolerances, and batch availability.</p>
        <button className="pd-btn buy" type="button" onClick={() => setRfq(p)}>
          Request technical quotation <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    )
    : p.stock <= 0
      ? (
        <div className="pd-note">
          <b>Currently out of stock</b>
          <p>Check production lead times or submit an indent request with your company requirements.</p>
          <button className="pd-btn cart" type="button" onClick={() => setRfq(p)}>
            Check batch availability
          </button>
        </div>
      )
      : (
        <>
          <span className="pd-qty">
            <button type="button" onClick={() => stepQty(-1)} aria-label="Decrease quantity">−</button>
            <span>{qty}</span>
            <button type="button" onClick={() => stepQty(1)} aria-label="Increase quantity">+</button>
          </span>
          <button
            className="pd-btn cart"
            type="button"
            onClick={() => { if (addToCart(p, qty)) refresh(); }}
          >
            <ShoppingCart className="w-4 h-4" /> Add to cart
          </button>
          <button
            className="pd-btn buy"
            type="button"
            onClick={() => { if (addToCart(p, qty, { silent: true })) nav('/store/cart'); }}
          >
            Buy now <ArrowRight className="w-4 h-4" />
          </button>
        </>
      );

  const tabs = [
    { id: 'specs', label: 'Specifications', count: specs.length, icon: Layers },
    { id: 'docs', label: 'Documents', count: docs.length, icon: FileText },
    { id: 'videos', label: 'Videos', count: videos.length + yts.length, icon: MonitorPlay },
    { id: 'overview', label: 'Overview', icon: BookOpen },
  ];

  return (
    <div className="pd-wrap">
      {/* Top Breadcrumb & Share Bar */}
      <div className="pd-bar">
        <Link className="pd-crumb" to="/store/listing">
          <ArrowLeft className="w-4 h-4 text-[#ea580c]" />
          <span>Back to catalog</span>
        </Link>
        <button
          type="button"
          className="pd-share"
          onClick={() => setShareOpen(true)}
          title="Share this product with images, video and datasheets"
        >
          <Share2 className="w-4 h-4" />
          <span>Share product</span>
        </button>
      </div>

      {/* Main Showcase Hero */}
      <div className="pd-hero">
        <div className="pd-grid">
          {/* Gallery Column */}
          <div>
            <div className="pd-gal">
              {allVisualMedia.length > 1 && (
                <div className="pd-rail">
                  {allVisualMedia.map((m, idx) => {
                    const isYt = m.type === 'youtube';
                    const yid = isYt ? ytId(m.url) : null;
                    const thumb = isYt && yid ? `https://img.youtube.com/vi/${yid}/hqdefault.jpg` : m.url;
                    return (
                      <button
                        key={m.id || idx}
                        type="button"
                        className={`pd-th ${idx === activeMediaIndex && !show3d ? 'on' : ''}`}
                        onClick={() => { setActiveMediaIndex(idx); setView3d(false); }}
                        title={m.title || ''}
                      >
                        {m.type === 'video' ? (
                          <div className="pd-vth"><Film className="w-5 h-5" />VIDEO</div>
                        ) : (
                          <img src={thumb} alt="" />
                        )}
                        {isYt && <span className="pd-tag">▶ YT</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              <div>
                {photo3d && (
                  <div className="pd-switch" role="tablist" aria-label="View mode">
                    <button type="button" className={!show3d ? 'on' : ''} onClick={() => setView3d(false)}>
                      📷 Photos
                    </button>
                    <button type="button" className={show3d ? 'on' : ''} onClick={() => setView3d(true)}>
                      🧊 3D view <i>NEW</i>
                    </button>
                  </div>
                )}

                <div
                  className={`pd-stage ${embed ? 'is-embed' : ''} ${show3d ? 'is-3d' : ''}`}
                  onMouseMove={embed ? undefined : zoomMove}
                  onClick={() => { if (!show3d && activeMedia?.type === 'image' && activeMedia.url) setLightbox(true); }}
                >
                  {show3d ? (
                    <Suspense fallback={<div className="pd-3dload"><span />Loading 3D view…</div>}>
                      <Viewer3D item={{ name: p.name, shape: 'round' }} imgUrl={photo3d} modelUrl="" onFail={() => setBodyFailed(true)} />
                    </Suspense>
                  ) : activeMedia?.type === 'youtube' && ytId(activeMedia.url) ? (
                    <iframe
                      key={activeMedia.url}
                      src={`https://www.youtube.com/embed/${ytId(activeMedia.url)}?autoplay=1`}
                      title={activeMedia.title || 'Product video'}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : activeMedia?.type === 'video' ? (
                    <video key={activeMedia.url} src={activeMedia.url} controls autoPlay />
                  ) : activeMedia?.url ? (
                    <img
                      key={activeMedia.url}
                      className="pd-main"
                      src={activeMedia.url}
                      onError={(e) => { e.currentTarget.src = imgFallback(p.sku || p.id, 700, 525); }}
                      alt={activeMedia.title || activeMedia.alt || p.name}
                    />
                  ) : (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#8a6c58' }}>
                      <Package className="w-14 h-14" />
                      <div style={{ fontWeight: 800, marginTop: 8 }}>Photo coming soon</div>
                    </div>
                  )}

                  {show3d && (
                    <div className="pd-how">
                      <span>👆 Drag to turn it</span>
                      <span>🔍 Scroll to zoom</span>
                      <span>🔄 Spins automatically</span>
                    </div>
                  )}

                  {show3d && bodyFailed && (
                    <div className="pd-warn">
                      A true 3D shape could not be built from this photo, so a boxed view is shown. Use a straight-on photo on a plain background.
                    </div>
                  )}

                  {!show3d && allVisualMedia.length > 1 && (
                    <span className="pd-count">{activeMediaIndex + 1} / {allVisualMedia.length}</span>
                  )}

                  {!show3d && activeMedia?.type === 'image' && activeMedia?.url && (
                    <button
                      type="button"
                      className="pd-lightbox-trigger"
                      onClick={(e) => { e.stopPropagation(); setLightbox(true); }}
                      title="Fullscreen preview"
                      aria-label="Fullscreen preview"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  )}

                  {allVisualMedia.length > 1 && !show3d && (
                    <>
                      <button type="button" className="pd-nav l" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous">‹</button>
                      <button type="button" className="pd-nav r" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next">›</button>
                    </>
                  )}

                  {!embed && !show3d && activeMedia?.url && (
                    <span className="pd-hint">Hover to zoom · click for full screen</span>
                  )}
                </div>

                {activeMedia && (activeMedia.title || activeMedia.description) && (
                  <div className="pd-cap" key={activeMedia.url}>
                    {activeMedia.title && <b>{activeMedia.title}</b>}
                    {activeMedia.description && <p>{activeMedia.description}</p>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Details & Purchase Column */}
          <div>
            <div className="pd-chips">
              <span className="pd-chip">{catName(p.category)}</span>
              {p.price == null && p.stock <= 0 ? (
                <span className="pd-chip no">Check availability</span>
              ) : p.stock <= 0 ? (
                <span className="pd-chip no">Out of stock</span>
              ) : (
                <span className="pd-chip ok">
                  <i />In stock
                </span>
              )}
            </div>

            <h1 className="pd-title">{p.name}</h1>

            <div className="pd-meta">
              {p.brand && <span>Brand <b>{p.brand}</b></span>}
              {p.mpn && <span>MPN <b>{p.mpn}</b></span>}
              {p.sku && (
                <span>
                  SKU <b>{p.sku}</b>
                  <button
                    type="button"
                    className="copy-sku"
                    onClick={() => copyText(p.sku)}
                    title={copiedSku ? 'Copied SKU!' : 'Copy SKU'}
                  >
                    {copiedSku ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </span>
              )}
            </div>

            {p.short && p.short.trim().toLowerCase() !== p.name.trim().toLowerCase() && (
              <p className="pd-short">{p.short}</p>
            )}

            {/* Price & Availability Meter Card */}
            <div className="pd-price">
              <div>
                <div className="pd-lbl">Catalog price</div>
                {p.price == null ? (
                  <div className="pd-amt rfq">Request quotation</div>
                ) : (
                  <div className="pd-amt">
                    <CountUp value={Number(p.price)} />
                    <small>/ {p.uom || 'Nos'}</small>
                  </div>
                )}
                {p.price != null && <div className="pd-gst">GST invoice included</div>}
              </div>

              <div className="pd-stock">
                <div className="pd-lbl">Availability</div>
                <div className={`t ${p.stock > 0 ? '' : 'out'}`}>
                  <i />
                  {p.stock > 0 ? `${p.stock} ${p.uom || 'units'} in stock` : 'Quotation required'}
                </div>
                {p.stock > 0 && (
                  <div className="pd-meter">
                    <span style={{ '--w': `${Math.min(100, Math.max(8, (p.stock / cap) * 100))}%` }} />
                  </div>
                )}
              </div>
            </div>

            {/* Key Technical Highlights */}
            <div className="pd-keys">
              {keyTiles.map((tile, i) => {
                const IconComponent = tile.icon;
                return (
                  <div className="pd-key" key={tile.label} style={{ animationDelay: `${0.25 + i * 0.06}s` }}>
                    <span>{tile.label}</span>
                    <b className="flex items-center gap-1.5">
                      <IconComponent className="w-3.5 h-3.5 text-[#ff9a4d] flex-shrink-0" />
                      {tile.value}
                    </b>
                  </div>
                );
              })}
            </div>

            {/* Purchase CTA Buttons */}
            <div className="pd-buy" ref={buyRef}>{buyBox}</div>

            {/* Industrial Trust Badges */}
            <div className="pd-trust">
              <div><ShieldCheck className="w-4 h-4" /> Live stock from BI</div>
              <div><ReceiptText className="w-4 h-4" /> GST invoice</div>
              <div><Truck className="w-4 h-4" /> Direct dispatch</div>
              <div><BadgeCheck className="w-4 h-4" /> Genuine product</div>
            </div>
          </div>
        </div>
      </div>

      {/* Details Tabs Section */}
      <Reveal>
        <div className="pd-sec">
          <div className="pd-tabs" role="tablist">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`pd-tab ${activeTab === tab.id ? 'on' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                >
                  <Icon className="w-5 h-5" />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && <em>{tab.count}</em>}
                </button>
              );
            })}
          </div>

          {activeTab === 'specs' && (
            <div className="pd-pane" key="specs">
              <h3 className="pd-h">Engineering specifications</h3>
              <p className="pd-sub">Dimensions, material grades, tolerances and industrial standards.</p>
              {specs.length > 0 ? (
                <div className="pd-specs">
                  {specs.map(([k, v], i) => (
                    <div className="pd-spec" key={k} style={{ animationDelay: `${i * 0.04}s` }}>
                      <span>{k}</span>
                      <b>{v}</b>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="pd-empty">
                  No technical specifications listed yet. Request a quotation for the full engineering drawing.
                </div>
              )}
            </div>
          )}

          {activeTab === 'docs' && (
            <div className="pd-pane" key="docs">
              <h3 className="pd-h">Technical documents</h3>
              <p className="pd-sub">Brochures, drawings and certificates. Open a document to inspect it right here.</p>
              {docs.length > 0 ? (
                <div className="pd-docs">
                  {docs.map((d, i) => (
                    <div key={d.id} className="pd-doc" style={{ animationDelay: `${i * 0.06}s` }}>
                      <div className="pd-cover">PDF</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <h4>{d.title || 'Technical datasheet'}</h4>
                        <p>{d.description || 'Complete technical specification sheet'}</p>
                        <button type="button" className="pd-open" onClick={() => setViewDoc(d)}>
                          <BookOpen className="w-3.5 h-3.5" /> View document
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="pd-empty">No documents attached to this product yet.</div>
              )}
            </div>
          )}

          {activeTab === 'videos' && (
            <div className="pd-pane" key="videos">
              <h3 className="pd-h">Videos &amp; demonstrations</h3>
              <p className="pd-sub">Machining trials, setup tutorials and operation demonstrations.</p>
              {(yts.length > 0 || videos.length > 0) ? (
                <div className="pd-vids">
                  {yts.filter((y) => ytId(y.url)).map((y, i) => (
                    <div key={y.id} className="pd-vid" style={{ animationDelay: `${i * 0.06}s` }}>
                      <iframe
                        src={`https://www.youtube.com/embed/${ytId(y.url)}`}
                        title={y.title || 'Product video'}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                      <div>
                        <b>{y.title || 'Application demonstration'}</b>
                        {y.description && <p>{y.description}</p>}
                      </div>
                    </div>
                  ))}
                  {videos.map((v) => (
                    <div key={v.id} className="pd-vid">
                      <video src={v.url} controls />
                      <div>
                        <b>{v.title || 'Product demonstration'}</b>
                        {v.description && <p>{v.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="pd-empty">No video demonstrations attached yet.</div>
              )}
            </div>
          )}

          {activeTab === 'overview' && (
            <div className="pd-pane" key="overview">
              <h3 className="pd-h">Description &amp; applications</h3>
              <div className="pd-desc">{p.desc || 'No detailed description provided.'}</div>
            </div>
          )}
        </div>
      </Reveal>

      {/* Embedded In-App PDF Viewer Modal */}
      {viewDoc && (
        <Suspense fallback={null}>
          <PdfViewer url={viewDoc.url} title={viewDoc.title || 'Technical Datasheet'} onClose={() => setViewDoc(null)} />
        </Suspense>
      )}

      {/* Fullscreen Lightbox Modal */}
      {lightbox && activeMedia?.type === 'image' && (
        <div className="pd-lb" onClick={() => setLightbox(false)}>
          <img src={activeMedia.url} alt={activeMedia.title || p.name} />
          <button type="button" aria-label="Close" onClick={() => setLightbox(false)}>×</button>
        </div>
      )}

      {/* Sticky Bottom Buy Bar on Mobile */}
      {canBuy && (
        <div className={`pd-sticky ${stuck ? 'show' : ''}`}>
          <div className="n">
            <b>{p.name}</b>
            <span>{fmt(p.price)}</span>
          </div>
          <button
            className="pd-btn buy"
            type="button"
            onClick={() => { if (addToCart(p, qty, { silent: true })) nav('/store/cart'); }}
          >
            Buy now →
          </button>
        </div>
      )}

      {/* Related Products in Category */}
      {rel.length > 0 && (
        <Reveal className="pd-rel">
          <div className="head">
            <h2>More in {catName(p.category)}</h2>
            <Link className="all" to={`/store/listing?cat=${p.category}`}>
              View all in category →
            </Link>
          </div>
          <div className="prod-grid">
            {rel.map((r) => (
              <ProdCard
                key={r.id}
                p={r}
                catName={catName}
                onAdd={(x) => { if (addToCart(x)) refresh(); }}
                onRfq={setRfq}
              />
            ))}
          </div>
        </Reveal>
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

      {/* Share Modal */}
      {shareOpen && (
        <ProductShareModal
          products={[p]}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}
