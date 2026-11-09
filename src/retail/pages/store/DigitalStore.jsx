/* Digital Store — a 3D store to walk through. The racks and products are set up in Business Intelligence (Inventory > Digital Store). */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, MapPin, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Footprints } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { signedImageUrls } from '@/lib/inventory';
import { fmt } from '../../api';
import { Skeleton } from '../../components/ui';
import { computeLayout, placeOf } from '../../components/storeLayout';
import SpinViewer from '../../components/SpinViewer';
import { useAuth } from '../../auth';

// three.js is large: load it only when this page is opened
const Scene = lazy(() => import('../../components/StoreScene').then((m) => ({ default: m.StoreScene })));
const Viewer = lazy(() => import('../../components/StoreScene').then((m) => ({ default: m.ProductViewer3D })));

export default function DigitalStore() {
  const [store, setStore] = useState(null);
  const [items, setItems] = useState([]);
  const [urls, setUrls] = useState({});
  const [state, setState] = useState('loading');   // loading | ready | empty | error
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [targetId, setTargetId] = useState(null);
  const [goTo, setGoTo] = useState(null);
  const [picked, setPicked] = useState(null);
  const [bodyFailed, setBodyFailed] = useState(false);
  const { me: user } = useAuth();
  // ordering from the popup
  const [ordering, setOrdering] = useState(false);
  const [form, setForm] = useState({ qty: '1', name: '', phone: '', email: '', address: '', notes: '' });
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [placed, setPlaced] = useState(null);
  useEffect(() => {
    setBodyFailed(false); setOrdering(false); setOrderError(''); setPlaced(null);
    setForm((f) => ({ qty: '1', name: f.name || user?.name || '', phone: f.phone || user?.mobile || '', email: f.email || user?.email || '', address: f.address, notes: '' }));
  }, [picked]);   // eslint-disable-line react-hooks/exhaustive-deps

  const placeOrder = async () => {
    if (orderBusy || !picked) return;
    setOrderError('');
    const qty = Number(form.qty);
    const stock = Number(picked.stock_qty ?? 0);
    if (!(qty > 0)) return setOrderError('Enter the quantity you want.');
    if (qty > stock) return setOrderError(`Only ${stock} available in stock.`);
    if (!form.name.trim()) return setOrderError('Enter your name.');
    if (form.phone.replace(/\D/g, '').length < 7) return setOrderError('Enter a valid contact number.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return setOrderError('Enter a valid e-mail address.');
    if (form.address.trim().length < 8) return setOrderError('Enter the full delivery address.');
    setOrderBusy(true);
    const res = await supabase.rpc('erp_place_digital_order', { p_item: picked.id, p_qty: qty, p_name: form.name, p_phone: form.phone, p_address: form.address, p_notes: form.notes, p_email: form.email.trim() });
    setOrderBusy(false);
    if (res.error) return setOrderError(res.error.message);
    const left = Number(res.data?.stock_left ?? 0);
    setItems((list) => list.map((i) => (i.id === picked.id ? { ...i, stock_qty: left } : i)));
    setPicked((p) => (p ? { ...p, stock_qty: left } : p));
    setPlaced({ order_no: res.data?.order_no, total: res.data?.total, qty });
    setOrdering(false);
  };
  const [companyName, setCompanyName] = useState('');
  // the reflective floor and shadows look best but need a decent graphics card: phones and small laptops start on 'fast'
  const [quality, setQuality] = useState(() => (typeof navigator !== 'undefined' && (navigator.hardwareConcurrency || 4) >= 6 && !/Mobi|Android/i.test(navigator.userAgent) ? 'high' : 'fast'));
  const [me, setMe] = useState({ x: 0, z: 0, yaw: 0 });
  const controlRef = useRef(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    (async () => {
      const s = await supabase.from('digital_stores').select('*').maybeSingle();
      if (s.error) { setError(/digital_stores/.test(s.error.message) ? 'The Digital Store is not set up on the database yet (an administrator must run the Digital Store migration).' : s.error.message); setState('error'); return; }
      if (!s.data) { setState('empty'); return; }
      const it = await supabase.from('digital_store_items').select('*').eq('store_id', s.data.id).order('rack').order('row_no').order('slot');
      if (it.error) { setError(it.error.message); setState('error'); return; }
      const list = it.data || [];
      setStore(s.data); setItems(list);
      const c = await supabase.from('companies').select('company_name').eq('id', s.data.company_id).maybeSingle();
      setCompanyName(c.data?.company_name || '');
      setUrls(await signedImageUrls(list.flatMap((i) => [i.image_path || '', i.model_path || '', ...(i.angle_paths || [])])));
      setState(list.length ? 'ready' : 'empty');
    })().catch((e) => { setError(e.message || 'Could not load the Digital Store.'); setState('error'); });
  }, []);

  const layout = useMemo(() => (store ? computeLayout(store) : null), [store]);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return items.filter((i) => `${i.name} ${i.sku || ''} ${i.description || ''}`.toLowerCase().includes(s));
  }, [items, q]);
  const matchIds = useMemo(() => new Set(matches.map((m) => m.id)), [matches]);

  const goToItem = useCallback((it) => {
    const p = placeOf(layout, store, it);
    if (!p) return;
    setTargetId(it.id);
    setGoTo({ x: p.x, z: p.z + 1.9, t: Date.now() });
  }, [layout, store]);

  const press = (k, down) => controlRef.current?.press(k, down);
  const pad = (k, Icon, label) => (
    <button type="button" aria-label={label}
      onPointerDown={(e) => { e.preventDefault(); press(k, true); }} onPointerUp={() => press(k, false)} onPointerLeave={() => press(k, false)} onPointerCancel={() => press(k, false)}
      className="w-11 h-11 rounded-xl bg-slate-900/70 text-white flex items-center justify-center active:bg-emerald-600 select-none touch-none"><Icon className="w-5 h-5" /></button>
  );

  if (state === 'loading') return <Skeleton h={420} />;
  if (state === 'error') return <div className="p-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl">{error}</div>;
  if (state === 'empty') return <div className="p-8 text-center text-slate-600 bg-white border border-slate-200 rounded-2xl">The Digital Store has no products yet. An administrator can set up the racks and add products in Business Intelligence → Inventory → Digital Store.</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-amber-700">Digital Store</div>
          <h1 className="text-xl font-black text-slate-900">{companyName || store.name}</h1>
        </div>
        <button type="button" onClick={() => setQuality((v) => (v === 'high' ? 'fast' : 'high'))} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" title="Switch if the store feels slow">
          Graphics: {quality === 'high' ? 'High' : 'Fast'}
        </button>
      </div>
      <div className="relative rounded-2xl overflow-hidden border border-slate-300 bg-slate-300" style={{ height: 'calc(100vh - 230px)', minHeight: 440 }}>
        <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center text-slate-600 text-sm">Opening the store…</div>}>
          <Scene store={store} items={items} imageUrls={urls} matchIds={matchIds} targetId={targetId} goTo={goTo} controlRef={controlRef} onMove={setMe} onPick={(it) => setPicked(it)} companyName={companyName} quality={quality} />
        </Suspense>

        {/* search */}
        <div className="absolute top-3 left-3 w-[min(340px,calc(100%-1.5rem))] space-y-2">
          <div className="flex items-center gap-2 bg-white/95 rounded-xl border border-slate-200 shadow px-3 py-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setTargetId(null); }} placeholder="Search a product to find where it is…" className="flex-1 bg-transparent outline-none text-sm text-slate-800" />
            {q && <button type="button" onClick={() => { setQ(''); setTargetId(null); }} aria-label="Clear"><X className="w-4 h-4 text-slate-400" /></button>}
          </div>
          {q.trim() && (
            <div className="bg-white/95 rounded-xl border border-slate-200 shadow max-h-64 overflow-y-auto divide-y divide-slate-100">
              {matches.length === 0 && <div className="px-3 py-3 text-xs text-slate-500">Nothing matches “{q}”.</div>}
              {matches.slice(0, 30).map((m) => (
                <div key={m.id} className={`flex items-center gap-2 px-3 py-2 ${targetId === m.id ? 'bg-emerald-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">{m.name}</div>
                    <div className="text-[11px] text-slate-500">Rack {m.rack} · Row {m.row_no} · Place {m.slot}{m.sku ? ` · ${m.sku}` : ''}{m.stock_qty !== undefined ? (Number(m.stock_qty) > 0 ? ` · ${Number(m.stock_qty)} in stock` : ' · out of stock') : ''}</div>
                  </div>
                  <button type="button" onClick={() => goToItem(m)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shrink-0"><MapPin className="w-3 h-3" /> Go there</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* minimap: racks from above, you, and the products you searched for */}
        <Minimap layout={layout} store={store} me={me} matches={matches} targetId={targetId} />

        {/* hint + touch controls */}
        <div className="absolute bottom-3 left-3 hidden sm:flex items-center gap-2 bg-slate-900/70 text-white text-[11px] px-3 py-1.5 rounded-lg"><Footprints className="w-3.5 h-3.5" /> Drag to look · W A S D or arrow keys to walk · Shift to run · click a product</div>
        <div className="absolute bottom-3 right-3 grid grid-cols-3 gap-1.5 sm:hidden">
          <span />{pad('f', ArrowUp, 'Walk forward')}<span />
          {pad('tl', ArrowLeft, 'Turn left')}{pad('b', ArrowDown, 'Walk back')}{pad('tr', ArrowRight, 'Turn right')}
        </div>
      </div>

      {picked && (
        <div className="fixed inset-0 z-[300] bg-slate-950/70 flex items-center justify-center p-4" onClick={() => setPicked(null)}>
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl grid md:grid-cols-2" onClick={(e) => e.stopPropagation()}>
            <div className="h-72 md:h-[420px] bg-slate-900">
              {picked.shape === 'spin' && (picked.angle_paths || []).filter((x) => urls[x]).length >= 4 ? (
                <SpinViewer name={picked.name} frames={picked.angle_paths.map((x) => urls[x]).filter(Boolean)} />
              ) : (
                <Suspense fallback={<div className="h-full flex items-center justify-center text-slate-400 text-sm">Loading 3D view…</div>}>
                  <Viewer item={{ ...picked, shape: picked.shape || 'round' }} imgUrl={picked.image_path ? urls[picked.image_path] : ''} modelUrl={picked.model_path ? urls[picked.model_path] : ''} onFail={() => setBodyFailed(true)} />
                </Suspense>
              )}
            </div>
            <div className="p-5 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-black text-slate-900">{picked.name}</h3>
                <button type="button" onClick={() => setPicked(null)} aria-label="Close" className="p-1 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
              </div>
              {picked.sku && <div className="text-xs font-mono text-slate-500 mt-0.5">{picked.sku}</div>}
              {picked.price != null && <div className="text-2xl font-black text-emerald-700 mt-3">{fmt(picked.price)}</div>}
              {picked.description && <p className="text-sm text-slate-600 mt-3 whitespace-pre-line">{picked.description}</p>}
              {picked.stock_qty !== undefined && (
                <div className={`mt-3 inline-flex self-start items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${Number(picked.stock_qty) > 0 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {Number(picked.stock_qty) > 0 ? `In stock: ${Number(picked.stock_qty)} ${picked.unit || ''}` : 'Out of stock'}
                </div>
              )}
              <div className="mt-3 text-xs text-slate-500">Found at Rack {picked.rack} · Row {picked.row_no} · Place {picked.slot}</div>
              {placed && (
                <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">
                  <div className="font-black">Order placed ✓</div>
                  <div>Order no. <b className="font-mono">{placed.order_no}</b> · {placed.qty} × {picked.name}{placed.total != null ? ` · ${fmt(placed.total)}` : ''}</div>
                  <div className="text-xs mt-1">We will contact you on the number you gave to confirm and arrange delivery.</div>
                </div>
              )}
              {!placed && !ordering && picked.stock_qty !== undefined && Number(picked.stock_qty) > 0 && (
                <button type="button" onClick={() => setOrdering(true)} className="mt-3 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-extrabold">Order this product</button>
              )}
              {ordering && (
                <div className="mt-3 space-y-2">
                  {orderError && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{orderError}</div>}
                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-[11px] font-bold text-slate-600 col-span-1">Quantity
                      <input className="mt-0.5 w-full px-2.5 py-2 rounded-lg border border-slate-300 text-sm" inputMode="decimal" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
                    </label>
                    <label className="text-[11px] font-bold text-slate-600 col-span-2">Your name
                      <input className="mt-0.5 w-full px-2.5 py-2 rounded-lg border border-slate-300 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </label>
                  </div>
                  <label className="block text-[11px] font-bold text-slate-600">Contact number
                    <input className="mt-0.5 w-full px-2.5 py-2 rounded-lg border border-slate-300 text-sm" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </label>
                  <label className="block text-[11px] font-bold text-slate-600">E-mail address
                    <input className="mt-0.5 w-full px-2.5 py-2 rounded-lg border border-slate-300 text-sm" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </label>
                  <label className="block text-[11px] font-bold text-slate-600">Delivery address
                    <textarea className="mt-0.5 w-full px-2.5 py-2 rounded-lg border border-slate-300 text-sm min-h-[64px]" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                  </label>
                  {picked.price != null && <div className="text-xs text-slate-600">Total: <b>{fmt((Number(form.qty) || 0) * Number(picked.price))}</b></div>}
                  <div className="flex gap-2">
                    <button type="button" disabled={orderBusy} onClick={placeOrder} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-extrabold disabled:opacity-60">{orderBusy ? 'Placing…' : 'Place order'}</button>
                    <button type="button" onClick={() => setOrdering(false)} className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700">Cancel</button>
                  </div>
                </div>
              )}
              {bodyFailed && <div className="mt-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">A 3D body could not be built from this photo, so a box is shown. Use a straight-on photo of the product on a plain background, or give it a 3D model or 360° photos in BI → Digital Store.</div>}
              <div className="mt-auto pt-4 text-[11px] text-slate-400">Drag to turn it around{picked.shape === 'spin' ? '' : ' · scroll or pinch to zoom'}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Minimap({ layout, store, me, matches, targetId }) {
  const W = 150;
  const sx = W / layout.width, H = Math.max(60, layout.depth * sx);
  const px = (x) => (x + layout.width / 2) * sx;
  const pz = (z) => (layout.zMax - z) * sx;
  const hit = new Set(matches.map((m) => m.rack));
  return (
    <svg width={W} height={H} className="absolute top-3 right-3 bg-white/90 rounded-xl border border-slate-200 shadow hidden sm:block" aria-label="Map of the store">
      {layout.racks.map((r) => (
        <g key={r.index}>
          <rect x={px(r.x - r.w / 2)} y={pz(r.z + r.d / 2)} width={r.w * sx} height={Math.max(3, r.d * sx)} rx={1.5} fill={hit.has(r.index) ? '#22c55e' : '#64748b'} />
          <text x={px(r.x)} y={pz(r.z) - 4} fontSize="7" textAnchor="middle" fill="#334155">{r.index}</text>
        </g>
      ))}
      {matches.map((m) => { const p = placeOf(layout, store, m); return p ? <circle key={m.id} cx={px(p.x)} cy={pz(p.z) + 3} r={m.id === targetId ? 3.2 : 2} fill="#16a34a" /> : null; })}
      <g transform={`translate(${px(me.x)} ${pz(me.z)}) rotate(${180 + (me.yaw * 180) / Math.PI})`}>
        <circle r="4" fill="#2563eb" /><path d="M0 -8 L3.5 -2 L-3.5 -2 Z" fill="#2563eb" />
      </g>
    </svg>
  );
}
