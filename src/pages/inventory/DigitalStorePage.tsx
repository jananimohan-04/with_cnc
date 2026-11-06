import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, ImagePlus, Loader2, Plus, Settings2, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { signedImageUrls, uploadItemImage } from '@/lib/inventory';
import { Modal, FormField, inputClass } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';

// Digital Store setup. The administrator says how many racks, how many rows (shelves) on each rack and how many products fit
// on a row, then puts a product (name + picture) in each place. The Retail Store shows this as a 3D store people walk through.

interface Store { id: string; name: string; racks: number; rows_per_rack: number; slots_per_row: number }
type Shape = 'box' | 'round' | 'model' | 'spin';
interface Item { id: string; store_id: string; rack: number; row_no: number; slot: number; name: string; sku: string | null; price: number | null; description: string | null; image_path: string | null; shape?: Shape | null; model_path?: string | null; angle_paths?: string[] | null; stock_qty?: number | null; unit?: string | null }
interface Order { id: string; order_no: string; item_name: string; sku: string | null; qty: number; unit: string | null; total: number | null; customer_name: string; phone: string; address: string; notes: string | null; status: string; ordered_by_name: string | null; created_at: string }
const ORDER_STATUSES = ['New', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled'];
type Draft = { id?: string; rack: number; row_no: number; slot: number; name: string; sku: string; price: string; description: string; image_path: string | null; shape: Shape; model_path: string | null; angle_paths: string[]; stock: string; unit: string };
const SHAPES: { id: Shape; label: string; hint: string }[] = [
  { id: 'round', label: 'Real product shape from the photo (recommended)', hint: 'The product itself turns, not a box. Best for round / turned parts (probes, bushes, shafts). Use a straight-on photo on a plain background; a 3D body is built from it.' },
  { id: 'box', label: 'Packed product (a box with the picture)', hint: 'Only for products sold in a box: the box turns, with your picture on it.' },
  { id: 'model', label: '3D model file (.glb)', hint: 'Upload a real 3D model. The product itself turns in the viewer. Best quality.' },
  { id: 'spin', label: '360 degree photos (turntable)', hint: 'Upload photos taken all around the product (8 to 36, in order, e.g. 01.jpg, 02.jpg). Dragging turns through them.' },
];

const errText = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e));
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(n) || lo)));

export function DigitalStorePage() {
  const { profile, company } = useAuth();
  const isAdmin = profile?.role === 'SUPER_ADMIN' || profile?.role === 'COMPANY_ADMIN';
  const [store, setStore] = useState<Store | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState({ name: 'Digital Store', racks: 4, rows: 4, slots: 4 });
  const [editSize, setEditSize] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [angleFiles, setAngleFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [tab, setTab] = useState<'racks' | 'orders'>('racks');
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [orderNote, setOrderNote] = useState<string | null>(null);
  const loadOrders = useCallback(async () => {
    const o = await supabase.from('digital_store_orders').select('*').order('created_at', { ascending: false }).limit(300);
    if (o.error) { setOrderNote(/digital_store_orders/.test(o.error.message) ? 'Orders are not set up yet. Run the migration 20261109000000_digital_store_orders.sql in Supabase.' : o.error.message); setOrders([]); return; }
    setOrderNote(null); setOrders((o.data as Order[]) ?? []);
  }, []);
  useEffect(() => { if (tab === 'orders') void loadOrders(); }, [tab, loadOrders]);
  const setOrderStatus = async (o: Order, status: string) => {
    if (status === 'Cancelled' && !window.confirm(`Cancel order ${o.order_no}? The stock goes back to the shelf.`)) return;
    const res = await supabase.rpc('erp_digital_order_status', { p_id: o.id, p_status: status });
    if (res.error) { setOrderNote(res.error.message); return; }
    await loadOrders(); await load();
  };

  const load = useCallback(async () => {
    setLoading(true);
    const s = await supabase.from('digital_stores').select('*').maybeSingle();
    if (s.error) { setError(/digital_stores/.test(s.error.message) ? 'The Digital Store tables are not created yet. Run the migration 20261108000000_digital_store.sql in Supabase.' : s.error.message); setLoading(false); return; }
    setError(null);
    const st = (s.data as Store | null) ?? null;
    setStore(st);
    if (st) {
      setSize({ name: st.name, racks: st.racks, rows: st.rows_per_rack, slots: st.slots_per_row });
      const it = await supabase.from('digital_store_items').select('*').eq('store_id', st.id).order('rack').order('row_no').order('slot');
      if (it.error) setError(it.error.message);
      const list = (it.data as Item[] | null) ?? [];
      setItems(list);
      setUrls(await signedImageUrls(list.map(i => i.image_path ?? '')));
    } else { setItems([]); setUrls({}); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load, company?.id]);

  const byPlace = useMemo(() => {
    const m = new Map<string, Item>();
    items.forEach(i => m.set(`${i.rack}:${i.row_no}:${i.slot}`, i));
    return m;
  }, [items]);

  const saveStore = async () => {
    setBusy(true); setFormError(null);
    const payload = { name: size.name.trim() || 'Digital Store', racks: clamp(size.racks, 1, 40), rows_per_rack: clamp(size.rows, 1, 8), slots_per_row: clamp(size.slots, 1, 8), updated_at: new Date().toISOString() };
    try {
      if (store) {
        const outside = items.filter(i => i.rack > payload.racks || i.row_no > payload.rows_per_rack || i.slot > payload.slots_per_row);
        if (outside.length && !window.confirm(`${outside.length} product(s) are in places that will no longer exist. They will be removed. Continue?`)) { setBusy(false); return; }
        if (outside.length) {
          const del = await supabase.from('digital_store_items').delete().in('id', outside.map(i => i.id));
          if (del.error) throw del.error;
        }
        const up = await supabase.from('digital_stores').update(payload).eq('id', store.id);
        if (up.error) throw up.error;
      } else {
        const ins = await supabase.from('digital_stores').insert(payload);
        if (ins.error) throw ins.error;
      }
      setEditSize(false);
      await load();
    } catch (e) { setFormError(errText(e)); }
    setBusy(false);
  };

  const openSlot = (rack: number, row_no: number, slot: number) => {
    if (!isAdmin) return;
    const it = byPlace.get(`${rack}:${row_no}:${slot}`);
    setFile(null); setModelFile(null); setAngleFiles([]); setFormError(null);
    setDraft(it
      ? { id: it.id, rack, row_no, slot, name: it.name, sku: it.sku ?? '', price: it.price != null ? String(it.price) : '', description: it.description ?? '', image_path: it.image_path, shape: (it.shape ?? 'round') as Shape, model_path: it.model_path ?? null, angle_paths: it.angle_paths ?? [], stock: String(it.stock_qty ?? 0), unit: it.unit ?? 'Nos' }
      : { rack, row_no, slot, name: '', sku: '', price: '', description: '', image_path: null, shape: 'round', model_path: null, angle_paths: [], stock: '', unit: 'Nos' });
  };

  const saveItem = async () => {
    if (!draft || !store) return;
    if (!draft.name.trim()) { setFormError('Enter the product name.'); return; }
    const price = draft.price.trim() === '' ? null : Number(draft.price);
    const stock = draft.stock.trim() === '' ? 0 : Number(draft.stock);
    if (!Number.isFinite(stock) || stock < 0) { setFormError('Stock must be a number of zero or more.'); return; }
    if (price !== null && (!Number.isFinite(price) || price < 0)) { setFormError('Price must be a number of zero or more.'); return; }
    setBusy(true); setFormError(null);
    try {
      let image_path = draft.image_path;
      let model_path = draft.model_path;
      let angle_paths = draft.angle_paths;
      if ((file || modelFile || angleFiles.length) && !company?.id) throw new Error('Choose a company first (top bar), then upload the files.');
      if (file) image_path = await uploadItemImage(company!.id, file);
      if (modelFile) {
        if (!/\.glb$/i.test(modelFile.name)) throw new Error('The 3D model must be a .glb file.');
        model_path = await uploadItemImage(company!.id, modelFile);
      }
      if (angleFiles.length) {
        const sorted = [...angleFiles].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        angle_paths = [];
        for (const f of sorted) angle_paths.push(await uploadItemImage(company!.id, f));
        if (!image_path) image_path = angle_paths[0];
      }
      if (draft.shape === 'model' && !model_path) throw new Error('Upload the .glb 3D model file for this product.');
      if (draft.shape === 'spin' && angle_paths.length < 4) throw new Error('Upload at least 4 photos taken around the product (8 to 36 is best).');
      if ((draft.shape === 'box' || draft.shape === 'round') && !image_path) throw new Error('Upload the product picture.');
      const row = { store_id: store.id, rack: draft.rack, row_no: draft.row_no, slot: draft.slot, name: draft.name.trim(), sku: draft.sku.trim() || null, price, description: draft.description.trim() || null, image_path, stock_qty: stock, unit: draft.unit.trim() || 'Nos', shape: draft.shape, model_path: draft.shape === 'model' ? model_path : null, angle_paths: draft.shape === 'spin' ? angle_paths : [], updated_at: new Date().toISOString() };
      const res = draft.id ? await supabase.from('digital_store_items').update(row).eq('id', draft.id) : await supabase.from('digital_store_items').insert(row);
      if (res.error) throw res.error;
      setDraft(null);
      await load();
    } catch (e) { setFormError(errText(e)); }
    setBusy(false);
  };

  const removeItem = async () => {
    if (!draft?.id || !window.confirm('Remove this product from the rack?')) return;
    setBusy(true);
    const res = await supabase.from('digital_store_items').delete().eq('id', draft.id);
    setBusy(false);
    if (res.error) { setFormError(res.error.message); return; }
    setDraft(null);
    await load();
  };

  if (loading) return <div className="p-8 flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin" size={16} /> Loading the Digital Store…</div>;

  return (
    <div className="p-3 sm:p-4 lg:px-4 lg:pt-1.5 lg:pb-4 bg-grid min-h-full space-y-3">
      <PageHeader title="Digital Store" description="Set up the racks and rows, then put a product (name and picture) in each place. The Retail Store shows it as a 3D store people can walk through." />
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {!error && !store && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-xl space-y-4">
          <h3 className="font-semibold text-slate-800">Create the store</h3>
          {!isAdmin && <p className="text-sm text-slate-500">The store has not been set up yet. An administrator can create it here.</p>}
          {isAdmin && <SizeForm size={size} setSize={setSize} />}
          {formError && <p className="text-sm text-red-700">{formError}</p>}
          {isAdmin && <Button onClick={saveStore} disabled={busy}>{busy ? 'Creating…' : 'Create store'}</Button>}
        </div>
      )}

      {store && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold text-slate-800 flex items-center gap-1.5"><Box size={15} /> {store.name}</span>
            <span className="text-slate-500">{store.racks} racks · {store.rows_per_rack} rows each · {store.slots_per_row} products per row · {items.length} of {store.racks * store.rows_per_rack * store.slots_per_row} places filled</span>
            {isAdmin && <Button variant="secondary" size="sm" icon={<Settings2 size={13} />} onClick={() => { setEditSize(true); setFormError(null); }}>Rack settings</Button>}
          </div>
          <div className="flex gap-1 border-b border-slate-200">
            {([['racks', 'Racks & products'], ['orders', 'Orders']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 ${tab === k ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}{k === 'orders' && orders ? ` (${orders.filter(o => o.status === 'New').length} new)` : ''}</button>
            ))}
          </div>
          {tab === 'orders' ? (
            <div className="space-y-2">
              {orderNote && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{orderNote}</p>}
              {orders && orders.length === 0 && !orderNote && <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">No orders yet. Orders placed from the Retail Store's Digital Store appear here.</p>}
              {(orders ?? []).map(o => (
                <div key={o.id} className="bg-white border border-slate-200 rounded-xl p-3 grid gap-2 md:grid-cols-[1.2fr_1.6fr_auto] items-start">
                  <div>
                    <div className="font-mono text-xs font-bold text-slate-700">{o.order_no} <span className="font-sans font-normal text-slate-400">· {new Date(o.created_at).toLocaleString('en-IN')}</span></div>
                    <div className="text-sm font-semibold text-slate-900 mt-0.5">{o.item_name}{o.sku ? <span className="text-slate-400 font-normal"> · {o.sku}</span> : null}</div>
                    <div className="text-sm text-slate-700">Qty <b>{Number(o.qty)}</b> {o.unit ?? ''}{o.total != null ? <> · <b>₹{Number(o.total).toLocaleString('en-IN')}</b></> : null}</div>
                  </div>
                  <div className="text-sm text-slate-700">
                    <div><b>{o.customer_name}</b> · {o.phone}</div>
                    <div className="text-slate-600 whitespace-pre-line">{o.address}</div>
                    {o.notes && <div className="text-xs text-slate-500 mt-0.5">Note: {o.notes}</div>}
                    {o.ordered_by_name && <div className="text-[11px] text-slate-400">Placed by {o.ordered_by_name}</div>}
                  </div>
                  <div>
                    {isAdmin && o.status !== 'Cancelled' ? (
                      <select className={inputClass} value={o.status} onChange={e => void setOrderStatus(o, e.target.value)}>
                        {ORDER_STATUSES.map(st => <option key={st}>{st}</option>)}
                      </select>
                    ) : <span className={`inline-block px-2 py-1 rounded-md text-xs font-bold ${o.status === 'Cancelled' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'}`}>{o.status}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (<>
          <p className="text-xs text-slate-500">{isAdmin ? 'Click a place to add or change its product.' : 'Only an administrator can change the store.'} Row 1 is the bottom shelf. The small number on a product is its stock.</p>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: store.racks }, (_, r) => r + 1).map(rack => (
              <div key={rack} className="bg-white border border-slate-200 rounded-xl p-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Rack {rack}</div>
                <div className="space-y-1.5">
                  {Array.from({ length: store.rows_per_rack }, (_, i) => store.rows_per_rack - i).map(row => (
                    <div key={row} className="flex items-center gap-1.5">
                      <span className="w-10 text-[10px] text-slate-400 shrink-0">Row {row}</span>
                      <div className="grid gap-1.5 flex-1" style={{ gridTemplateColumns: `repeat(${store.slots_per_row}, minmax(0, 1fr))` }}>
                        {Array.from({ length: store.slots_per_row }, (_, s) => s + 1).map(slot => {
                          const it = byPlace.get(`${rack}:${row}:${slot}`);
                          const img = it?.image_path ? urls[it.image_path] : '';
                          return (
                            <button key={slot} type="button" onClick={() => openSlot(rack, row, slot)} disabled={!isAdmin && !it}
                              title={it ? it.name : `Rack ${rack}, row ${row}, place ${slot} (empty)`}
                              className={`aspect-square rounded-md border text-[9px] leading-tight overflow-hidden flex items-center justify-center p-0.5 text-center ${it ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-dashed border-slate-300 text-slate-300 hover:border-brand-400 hover:text-brand-500'}`}>
                              {it ? (
                                <span className="relative block w-full h-full">
                                  {img ? <img src={img} alt={it.name} className="w-full h-full object-cover rounded" /> : <span className="line-clamp-3">{it.name}</span>}
                                  <span className={`absolute bottom-0 right-0 px-1 rounded-tl text-[8px] font-bold ${Number(it.stock_qty ?? 0) > 0 ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>{Number(it.stock_qty ?? 0) > 0 ? Number(it.stock_qty) : '0'}</span>
                                </span>
                              ) : <Plus size={12} />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          </>)}
        </>
      )}

      {editSize && store && (
        <Modal open onClose={() => setEditSize(false)} title="Rack settings" footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setEditSize(false)}>Cancel</Button><Button onClick={saveStore} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></div>}>
          {formError && <p className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
          <SizeForm size={size} setSize={setSize} />
        </Modal>
      )}

      {draft && (
        <Modal open onClose={() => setDraft(null)} title={`Rack ${draft.rack} · Row ${draft.row_no} · Place ${draft.slot}`}
          footer={<div className="flex justify-between w-full">{draft.id ? <Button variant="danger" icon={<Trash2 size={13} />} onClick={removeItem} disabled={busy}>Remove</Button> : <span />}<div className="flex gap-2"><Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button><Button onClick={saveItem} disabled={busy}>{busy ? 'Saving…' : 'Save product'}</Button></div></div>}>
          {formError && <p className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Product name" required><input className={inputClass} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></FormField>
            <FormField label="Code / SKU"><input className={inputClass} value={draft.sku} onChange={e => setDraft({ ...draft, sku: e.target.value })} /></FormField>
            <FormField label="Price (₹)"><input className={inputClass} inputMode="decimal" value={draft.price} onChange={e => setDraft({ ...draft, price: e.target.value })} /></FormField>
            <FormField label="Stock available" hint="How many can be ordered from the 3D store. 0 = sold out."><input className={inputClass} inputMode="decimal" value={draft.stock} onChange={e => setDraft({ ...draft, stock: e.target.value })} /></FormField>
            <FormField label="Unit"><input className={inputClass} value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value })} placeholder="Nos" /></FormField>
            <FormField label="Picture" hint="PNG or JPG. Use a straight-on photo on a plain background.">
              <label className="flex items-center gap-2 text-sm cursor-pointer text-brand-600 font-semibold"><ImagePlus size={16} /> {file ? file.name : draft.image_path ? 'Replace picture' : 'Upload picture'}
                <input type="file" accept="image/*" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="How should it turn in 3D?" hint={SHAPES.find(x => x.id === draft.shape)?.hint}>
                <select className={inputClass} value={draft.shape} onChange={e => setDraft({ ...draft, shape: e.target.value as Shape })}>
                  {SHAPES.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
              </FormField>
            </div>
            {draft.shape === 'model' && (
              <div className="sm:col-span-2"><FormField label="3D model (.glb)" hint="Export it from your CAD / 3D software as GLB, or take one from the supplier.">
                <label className="flex items-center gap-2 text-sm cursor-pointer text-brand-600 font-semibold"><Box size={16} /> {modelFile ? modelFile.name : draft.model_path ? 'Replace the 3D model' : 'Upload the 3D model'}
                  <input type="file" accept=".glb,model/gltf-binary" className="hidden" onChange={e => setModelFile(e.target.files?.[0] ?? null)} /></label>
              </FormField></div>
            )}
            {draft.shape === 'spin' && (
              <div className="sm:col-span-2"><FormField label="Photos around the product" hint={`${angleFiles.length ? angleFiles.length + ' new photos chosen' : draft.angle_paths.length ? draft.angle_paths.length + ' photos saved' : 'none yet'}. They are used in file-name order.`}>
                <label className="flex items-center gap-2 text-sm cursor-pointer text-brand-600 font-semibold"><ImagePlus size={16} /> Choose the photos
                  <input type="file" accept="image/*" multiple className="hidden" onChange={e => setAngleFiles(Array.from(e.target.files ?? []))} /></label>
              </FormField></div>
            )}
            <div className="sm:col-span-2"><FormField label="Description"><textarea className={`${inputClass} min-h-[70px]`} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></FormField></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SizeForm({ size, setSize }: { size: { name: string; racks: number; rows: number; slots: number }; setSize: (s: { name: string; racks: number; rows: number; slots: number }) => void }) {
  const num = (k: 'racks' | 'rows' | 'slots') => (e: React.ChangeEvent<HTMLInputElement>) => setSize({ ...size, [k]: Number(e.target.value) });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2"><FormField label="Store name"><input className={inputClass} value={size.name} onChange={e => setSize({ ...size, name: e.target.value })} /></FormField></div>
      <FormField label="Number of racks" hint="1 to 40"><input className={inputClass} type="number" min={1} max={40} value={size.racks} onChange={num('racks')} /></FormField>
      <FormField label="Rows on each rack" hint="1 to 8 shelves"><input className={inputClass} type="number" min={1} max={8} value={size.rows} onChange={num('rows')} /></FormField>
      <FormField label="Products on each row" hint="1 to 8"><input className={inputClass} type="number" min={1} max={8} value={size.slots} onChange={num('slots')} /></FormField>
    </div>
  );
}
