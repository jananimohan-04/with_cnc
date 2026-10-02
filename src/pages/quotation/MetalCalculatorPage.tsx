import { useMemo, useState } from 'react';
import { Calculator, Layers, PencilRuler, Shapes, BarChart3, RotateCcw, Info } from 'lucide-react';
import { formatINR } from '@/lib/format';
import {
  PROFILES, PROFILE_BY_ID, MATERIALS, UNITS, PRICE_UNITS, LENGTH_KEY,
  calculate, convertDims, defaultDims,
  type DimMap, type DimValue, type PriceUnit, type ProfileId, type Unit,
} from '@/lib/metalCalc';
import { ProfileGlyph, ProfilePreview } from './MetalProfilePreview';

// Metal Weight & Cost Calculator. Everything is calculated in the browser by src/lib/metalCalc.ts
// (no database, no company data), so it works for every role.

type AllDims = Record<ProfileId, DimMap>;
const initialDims = (): AllDims => Object.fromEntries(PROFILES.map(p => [p.id, defaultDims(p)])) as AllDims;

const fmt = (n: number, digits: number) => n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const kg = (n: number) => fmt(n, n >= 0.1 ? 2 : 4);
const grams = (n: number) => fmt(n, n >= 100 ? 0 : 2);

const fieldBox = (error: boolean) =>
  `flex rounded-lg border bg-slate-50 transition-colors focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-500/20 focus-within:border-brand-500 ${error ? 'border-red-400' : 'border-slate-200'}`;
const inputCls = 'flex-1 min-w-0 h-10 px-3 bg-transparent text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none';
const unitSelectCls = 'h-10 pl-2 pr-1 text-sm font-semibold text-slate-600 bg-transparent border-l border-slate-200 focus:outline-none cursor-pointer';
const labelCls = 'block text-xs text-slate-500 mb-1';
const sectionTitle = 'text-[11px] font-bold text-slate-700 uppercase tracking-wider';

const numeric = (v: string) => v.replace(/[^0-9.,-]/g, '');

function DimField({ label, v, error, onValue, onUnit }: {
  label: string; v: DimValue; error?: string; onValue: (s: string) => void; onUnit: (u: Unit) => void;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className={fieldBox(!!error)}>
        <input className={inputCls} inputMode="decimal" aria-label={label} aria-invalid={!!error} value={v.value} onChange={e => onValue(numeric(e.target.value))} />
        <select className={unitSelectCls} aria-label={`${label} unit`} value={v.unit} onChange={e => onUnit(e.target.value as Unit)}>
          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
    </div>
  );
}

export function MetalCalculatorPage() {
  const [profileId, setProfileId] = useState<ProfileId>('i-beam');
  const [all, setAll] = useState<AllDims>(initialDims);
  const [unitMode, setUnitMode] = useState<'mm' | 'in'>('mm');
  const [materialId, setMaterialId] = useState('steel');
  const [density, setDensity] = useState('7.85');
  const [price, setPrice] = useState('');
  const [priceUnit, setPriceUnit] = useState<PriceUnit>('kg');
  const [qty, setQty] = useState('1');

  const profile = PROFILE_BY_ID[profileId];
  const dims = all[profileId];

  const outcome = useMemo(
    () => calculate({ profile: profileId, dims, density, qty, price, priceUnit }),
    [profileId, dims, density, qty, price, priceUnit],
  );
  const errorOf: Record<string, string> = {};
  if (outcome.status === 'error') for (const i of outcome.issues) if (i.key) errorOf[i.key] = i.message;
  const generalIssues = outcome.status === 'error' ? outcome.issues.filter(i => !i.key) : [];

  const setField = (key: string, patch: Partial<DimValue>) =>
    setAll(prev => ({ ...prev, [profileId]: { ...prev[profileId], [key]: { ...prev[profileId][key], ...patch } } }));

  // MM / IN switches every dimension of every profile, keeping the physical size.
  const switchUnits = (u: 'mm' | 'in') => {
    setUnitMode(u);
    setAll(prev => Object.fromEntries(Object.entries(prev).map(([id, d]) => [id, convertDims(d, u)])) as AllDims);
  };

  const pickMaterial = (id: string) => {
    setMaterialId(id);
    const m = MATERIALS.find(x => x.id === id);
    if (m) setDensity(String(m.density));
  };
  const onDensity = (v: string) => {
    const clean = numeric(v);
    setDensity(clean);
    setMaterialId(MATERIALS.find(m => String(m.density) === clean.trim())?.id ?? 'custom');
  };

  const clearAll = () => {
    setAll(prev => ({
      ...prev,
      [profileId]: Object.fromEntries(Object.entries(prev[profileId]).map(([k, v]) => [k, { value: '', unit: v.unit }])),
    }));
    setPrice('');
    setQty('1');
  };

  const ok = outcome.status === 'ok' ? outcome.result : null;

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 lg:p-6">
        <div className="flex items-center gap-3 pb-4 mb-5 border-b border-slate-100">
          <div className="w-9 h-9 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center flex-shrink-0"><Calculator size={20} /></div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Metal Weight &amp; Cost Calculator</h1>
            <p className="text-sm text-slate-500">Calculate metal weight and material cost quickly and accurately.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-5">
          {/* ---------------- left column ---------------- */}
          <div className="space-y-5 min-w-0">
            <section className="rounded-xl border border-orange-100 bg-orange-50/40 p-4">
              <div className="flex items-center justify-between mb-3 gap-2">
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800"><Layers size={15} className="text-violet-600" /> Select Metal Profile</h2>
                <span className="text-[11px] font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded px-2 py-0.5">{profile.chip}</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-6 gap-2">
                {PROFILES.map(p => {
                  const active = p.id === profileId;
                  return (
                    <button
                      key={p.id} type="button" aria-pressed={active} onClick={() => setProfileId(p.id)}
                      className={`flex flex-col items-center justify-center gap-1.5 h-[58px] rounded-lg border text-[11px] font-semibold px-1 text-center leading-tight transition-all ${
                        active ? 'bg-brand-600 border-brand-600 text-white shadow-md shadow-brand-600/25' : 'bg-white border-slate-200 text-slate-700 hover:border-brand-300 hover:text-brand-700'}`}
                    >
                      <ProfileGlyph id={p.id} size={22} />
                      <span>{p.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-3"><PencilRuler size={15} className="text-orange-600" /> Parameters &amp; Material</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <label className={`${labelCls} uppercase tracking-wide`}>Material presets</label>
                  <select
                    aria-label="Material presets"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 text-sm font-medium text-slate-800 focus:outline-none focus:bg-white focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    value={materialId} onChange={e => pickMaterial(e.target.value)}
                  >
                    {MATERIALS.map(m => <option key={m.id} value={m.id}>{m.name} ({m.density} g/cm³)</option>)}
                    {materialId === 'custom' && <option value="custom">Custom density</option>}
                  </select>
                </div>
                <div>
                  <label className={`${labelCls} uppercase tracking-wide`}>Density (g/cm³)</label>
                  <div className={fieldBox(!!errorOf.density)}>
                    <input className={inputCls} inputMode="decimal" aria-label="Density" aria-invalid={!!errorOf.density} value={density} onChange={e => onDensity(e.target.value)} />
                    <span className="h-10 px-3 flex items-center text-xs text-slate-400 select-none">g/cm³</span>
                  </div>
                  {errorOf.density && <p className="text-[11px] text-red-600 mt-1">{errorOf.density}</p>}
                </div>
              </div>

              <div className="flex items-center justify-between mt-5 mb-2 pb-2 border-b border-slate-100">
                <h3 className={sectionTitle}>Enter profile dimensions</h3>
                <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-[10px] font-bold" role="group" aria-label="Units">
                  {(['mm', 'in'] as const).map(u => (
                    <button key={u} type="button" aria-pressed={unitMode === u} onClick={() => switchUnits(u)}
                      className={`px-2.5 py-1 uppercase ${unitMode === u ? 'bg-orange-50 text-orange-600' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>{u}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                {profile.fields.map(f => (
                  <DimField key={f.key} label={f.label} v={dims[f.key]} error={errorOf[f.key]}
                    onValue={s => setField(f.key, { value: s })} onUnit={u => setField(f.key, { unit: u })} />
                ))}
                <DimField label={profile.lengthLabel} v={dims[LENGTH_KEY]} error={errorOf[LENGTH_KEY]}
                  onValue={s => setField(LENGTH_KEY, { value: s })} onUnit={u => setField(LENGTH_KEY, { unit: u })} />
              </div>
              {generalIssues.map(i => <p key={i.message} className="text-xs text-red-600 mt-3">{i.message}</p>)}

              <h3 className={`${sectionTitle} mt-5 mb-2 pt-4 border-t border-slate-100`}>Costing &amp; quantity</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <label className={labelCls}>Price per unit weight (optional)</label>
                  <div className={fieldBox(!!errorOf.price)}>
                    <span className="h-10 w-9 flex items-center justify-center text-sm text-slate-500 border-r border-slate-200 select-none">₹</span>
                    <input className={inputCls} inputMode="decimal" placeholder="0.00" aria-label="Price per unit weight" aria-invalid={!!errorOf.price}
                      value={price} onChange={e => setPrice(numeric(e.target.value))} />
                    <select className={unitSelectCls} aria-label="Price unit" value={priceUnit} onChange={e => setPriceUnit(e.target.value as PriceUnit)}>
                      {PRICE_UNITS.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                    </select>
                  </div>
                  {errorOf.price && <p className="text-[11px] text-red-600 mt-1">{errorOf.price}</p>}
                </div>
                <div>
                  <label className={labelCls}>Quantity (Pcs)</label>
                  <div className={fieldBox(!!errorOf.qty)}>
                    <input className={inputCls} inputMode="numeric" aria-label="Quantity" aria-invalid={!!errorOf.qty} value={qty}
                      onChange={e => setQty(e.target.value.replace(/[^0-9]/g, ''))} />
                  </div>
                  {errorOf.qty && <p className="text-[11px] text-red-600 mt-1">{errorOf.qty}</p>}
                </div>
              </div>

              <div className="flex justify-end mt-5 pt-4 border-t border-slate-100">
                <button type="button" onClick={clearAll}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <RotateCcw size={14} /> Clear
                </button>
              </div>
            </section>
          </div>

          {/* ---------------- right column ---------------- */}
          <div className="space-y-5 min-w-0">
            <section className="rounded-xl border border-slate-200 p-4">
              <h2 className="flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2"><Shapes size={14} /> Component preview</h2>
              <div className="flex items-center justify-center min-h-[210px]"><ProfilePreview profile={profile} dims={dims} /></div>
            </section>

            <section className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-white p-4">
              <h2 className="flex items-center gap-2 text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-3"><BarChart3 size={14} className="text-emerald-600" /> Calculation summary</h2>

              <div className="rounded-lg border border-slate-100 bg-white/80 text-center py-4 px-3">
                <p className="text-xs font-semibold text-slate-600">Approximate Weight (Total)</p>
                {ok ? (
                  <p className="mt-1 font-mono text-4xl font-bold text-slate-900" data-testid="total-weight">
                    {kg(ok.weightKgTotal)} <span className="text-base font-semibold text-orange-600">kg</span>
                  </p>
                ) : (
                  <p className="mt-1 font-mono text-4xl font-bold text-slate-300">—</p>
                )}
                {ok && ok.qty > 1 && <p className="text-xs text-slate-500 mt-1">{kg(ok.weightKgPiece)} kg per piece × {fmt(ok.qty, 0)} pcs</p>}
                {outcome.status === 'incomplete' && <p className="text-xs text-slate-500 mt-2">Enter {outcome.missing.join(', ')} to see the weight.</p>}
                {outcome.status === 'error' && (
                  <ul className="text-xs text-red-600 mt-2 space-y-0.5">{outcome.issues.map(i => <li key={i.message}>{i.message}</li>)}</ul>
                )}
                <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600">
                  <span data-testid="w-lbs">{ok ? `${fmt(ok.weightLbs, 2)} lbs` : '— lbs'}</span>
                  <span data-testid="w-g">{ok ? `${grams(ok.weightG)} g` : '— g'}</span>
                  <span data-testid="w-t">{ok ? `${fmt(ok.weightTonnes, 4)} tonnes` : '— tonnes'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="rounded-lg border border-slate-100 bg-white/80 p-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Volume{ok && ok.qty > 1 ? ' (total)' : ''}</p>
                  <p className="font-mono text-sm font-semibold text-slate-800 mt-1" data-testid="volume">{ok ? `${fmt(ok.volumeCm3Total, 2)} cm³` : '—'}</p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-white/80 p-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Density</p>
                  <p className="font-mono text-sm font-semibold text-slate-800 mt-1">{ok ? `${ok.density} g/cm³` : '—'}</p>
                </div>
              </div>

              {ok?.cost && (
                <div className="rounded-lg border border-orange-200 bg-orange-50/60 p-3 mt-3" data-testid="cost-block">
                  <p className="text-[10px] font-bold text-orange-700 uppercase tracking-wider">Material cost</p>
                  <p className="font-mono text-2xl font-bold text-slate-900 mt-1" data-testid="cost-total">{formatINR(ok.cost.total)}</p>
                  <p className="text-xs text-slate-600 mt-1">
                    {ok.qty > 1 && <span data-testid="cost-piece">{formatINR(ok.cost.piece)} per piece · </span>}
                    {formatINR(ok.cost.perKgRate)} / kg
                  </p>
                </div>
              )}

              <p className="flex gap-1.5 text-[11px] text-slate-500 mt-3">
                <Info size={13} className="flex-shrink-0 mt-px" />
                Theoretical weight from the cross-section area. Corner radii, mill fillets and rolling tolerances are not included, so a rolled section can weigh slightly more.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
