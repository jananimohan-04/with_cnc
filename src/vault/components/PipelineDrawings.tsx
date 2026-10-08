import { Fragment, useMemo, useState } from 'react';
import { Box, ChevronDown, ChevronRight, ExternalLink, FileText, FilterX, Loader2, Plus, Search, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth as useAppAuth } from '@/contexts/AuthContext';
import { groupVersions, type DrawingFile, type ProductDrawings } from '@/lib/pipelineDrawings';
import { usePipelineFiles } from '@/vault/hooks/usePipelineFiles';
import { openStoredFile, uploadStoredFile } from '@/lib/orderFiles';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/vault/components/ui/dialog';
import { Button } from '@/vault/components/ui/button';
import { Input } from '@/vault/components/ui/input';
import { Label } from '@/vault/components/ui/label';

// Parts & Drawings: the drawings and part files that were uploaded in the Sales Pipeline (enquiry products, sales-order
// products, inward attachments) listed per company and product, each upload kept as a numbered version. A new version
// can be added here at any time.

export const SOURCE_STYLE: Record<DrawingFile['source'], string> = {
  Enquiry: 'bg-sky-50 text-sky-700 border-sky-200',
  'Sales Order': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Inward: 'bg-amber-50 text-amber-700 border-amber-200',
  Upload: 'bg-indigo-50 text-indigo-700 border-indigo-200',
};
export const dmy = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); };

export function PipelineDrawings() {
  const { company, profile } = useAppAuth();
  const { files, refs, error, tableMissing, reload: load } = usePipelineFiles(company?.id);
  const [showFinished, setShowFinished] = useState(false);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<null | { company: string; product: string }>(null);

    const products: ProductDrawings[] = useMemo(() => groupVersions(files ?? [], refs), [files, refs]);
  const finishedCount = products.filter(p => p.finished).length;
  const companies = useMemo(() => Array.from(new Set(products.map(p => p.company).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [products]);
  const shown = products.filter(p =>
    (showFinished || !p.finished) && (!companyFilter || p.company === companyFilter) &&
    (!search.trim() || `${p.product} ${p.company} ${p.files.map(f => `${f.name} ${f.ref}`).join(' ')}`.toLowerCase().includes(search.trim().toLowerCase())));
  const toggle = (k: string) => setOpen(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className="space-y-5" data-testid="pipeline-drawings">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Products &amp; Drawings</h2>
          <p className="text-muted-foreground mt-1">Every product on a sales order or inward, with its drawings kept version by version. If a drawing was not attached in the pipeline, upload it here.</p>
        </div>
        <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-sm" onClick={() => setDialog({ company: '', product: '' })}><Plus className="h-4 w-4 mr-2" />Upload Drawing</Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input aria-label="Search drawings" placeholder="Search by product, company, file name or number…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select aria-label="Company" value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} className="h-10 md:w-64 rounded-md border border-slate-200 bg-white px-3 text-sm">
          <option value="">All Companies</option>
          {companies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600 whitespace-nowrap px-1">
          <input type="checkbox" checked={showFinished} onChange={e => setShowFinished(e.target.checked)} />
          Show finished{finishedCount ? ` (${finishedCount})` : ''}
        </label>
        <Button variant="outline" onClick={() => { setSearch(''); setCompanyFilter(''); setShowFinished(false); }}><FilterX className="h-4 w-4 mr-2" />Reset</Button>
      </div>

      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      {tableMissing && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Uploading new versions needs the latest database migration (20261008000000_drawing_versions.sql). The files from the Sales Pipeline are shown either way.</p>}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50"><tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
            <th className="w-10 px-3 py-3" /><th className="px-3 py-3">Product</th><th className="px-3 py-3">Company</th>
            <th className="px-3 py-3">Latest</th><th className="px-3 py-3">Versions</th><th className="px-3 py-3">Last Updated</th><th className="px-3 py-3 text-right">Actions</th>
          </tr></thead>
          <tbody>
            {shown.map(p => {
              const latest = p.files[p.files.length - 1] as (typeof p.files)[number] | undefined;
              const isOpen = open.has(p.key);
              return (
                <Fragment key={p.key}>
                  <tr data-testid="drawing-row" className="border-t border-slate-100 hover:bg-slate-50/70 cursor-pointer" onClick={() => toggle(p.key)}>
                    <td className="px-3 py-3 text-slate-400">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                    <td className="px-3 py-3"><span className="inline-flex items-center gap-2 font-semibold text-indigo-700"><Box className="h-4 w-4" />{p.product}</span>{p.finished && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">FINISHED</span>}{p.refs.length > 0 && <div className="text-[11px] text-slate-400 mt-0.5">{p.refs.slice(0, 3).join(' · ')}{p.refs.length > 3 ? ` +${p.refs.length - 3}` : ''}</div>}</td>
                    <td className="px-3 py-3 text-slate-700">{p.company || '—'}</td>
                    <td className="px-3 py-3">{latest ? <><span className="inline-flex items-center rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">V{latest.version}</span> <span className="ml-1 text-slate-500 text-xs">{latest.name}</span></> : <span className="text-xs font-medium text-amber-600">No drawing yet</span>}</td>
                    <td className="px-3 py-3 text-slate-700"><span className="inline-flex items-center gap-1.5"><FileText className="h-4 w-4 text-indigo-500" />{p.files.length} version{p.files.length === 1 ? '' : 's'}</span></td>
                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{latest ? dmy(latest.date) : '—'}</td>
                    <td className="px-3 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <Button size="sm" variant="outline" className="text-indigo-700 border-indigo-200" onClick={() => setDialog({ company: p.company, product: p.product })}><UploadCloud className="h-4 w-4 mr-1.5" />{latest ? 'New Version' : 'Upload Drawing'}</Button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-slate-50/60"><td />
                      <td colSpan={6} className="px-3 py-3">
                        <table className="w-full text-xs">
                          <thead><tr className="text-left font-semibold uppercase tracking-wide text-slate-500"><th className="py-1.5 pr-3">Version</th><th className="py-1.5 pr-3">File</th><th className="py-1.5 pr-3">From</th><th className="py-1.5 pr-3">Date</th><th className="py-1.5 pr-3">Notes</th><th className="py-1.5 text-right" /></tr></thead>
                          <tbody>
                            {p.files.length === 0 && <tr className="border-t border-slate-200"><td colSpan={6} className="py-3 text-slate-500">No drawing was attached in the pipeline. Upload the first version with the button above.</td></tr>}
                            {[...p.files].reverse().map(f => (
                              <tr key={f.key} data-testid="version-row" className="border-t border-slate-200">
                                <td className="py-2 pr-3"><span className="inline-flex rounded-full border border-indigo-200 bg-white px-2 py-0.5 font-bold text-indigo-700">V{f.version}</span>{latest && f.version === latest.version && <span className="ml-1.5 text-[10px] font-semibold text-emerald-600">LATEST</span>}</td>
                                <td className="py-2 pr-3 font-medium text-slate-800 max-w-[260px] truncate" title={f.name}>{f.name}</td>
                                <td className="py-2 pr-3"><span className={`inline-flex rounded-full border px-2 py-0.5 font-semibold ${SOURCE_STYLE[f.source]}`}>{f.source}{f.source !== 'Upload' && f.ref ? ` · ${f.ref}` : ''}</span></td>
                                <td className="py-2 pr-3 whitespace-nowrap text-slate-500">{dmy(f.date)}{f.by ? ` · ${f.by}` : ''}</td>
                                <td className="py-2 pr-3 text-slate-500 max-w-[220px] truncate" title={f.notes}>{f.notes || '—'}</td>
                                <td className="py-2 text-right"><button type="button" className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline" onClick={() => void openStoredFile(f.path)}><ExternalLink className="h-3.5 w-3.5" />Open</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {files === null && <tr><td colSpan={7} className="px-3 py-12 text-center text-slate-400"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading…</td></tr>}
            {files !== null && shown.length === 0 && !error && (
              <tr><td colSpan={7} className="px-3 py-14 text-center text-slate-500">
                {products.length ? 'No product matches. Finished products are hidden unless “Show finished” is ticked.' : 'No products yet. Every product on a sales order or inward appears here, with its drawings.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {dialog && (
        <UploadVersionDialog
          start={dialog} companies={companies} products={products} companyId={company?.id ?? ''} userName={profile?.full_name ?? ''} tableMissing={tableMissing}
          onClose={() => setDialog(null)} onDone={() => { setDialog(null); void load(); }}
        />
      )}
    </div>
  );
}

export function UploadVersionDialog({ start, companies, products, companyId, userName, tableMissing, onClose, onDone }: {
  start: { company: string; product: string }; companies: string[]; products: ProductDrawings[]; companyId: string; userName: string; tableMissing: boolean;
  onClose: () => void; onDone: () => void;
}) {
  const [companyName, setCompanyName] = useState(start.company);
  const [product, setProduct] = useState(start.product);
  const [picked, setPicked] = useState<File[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const known = products.filter(p => !companyName.trim() || p.company.toLowerCase() === companyName.trim().toLowerCase());

  const save = async () => {
    if (!companyId) return toast.error('Select a company in the top bar first.');
    if (!companyName.trim()) return toast.error('Enter the company.');
    if (!product.trim()) return toast.error('Enter the product.');
    if (!picked.length) return toast.error('Choose at least one file.');
    setBusy(true);
    try {
      const rows: Record<string, unknown>[] = [];
      for (const f of picked) {
        const path = await uploadStoredFile(companyId, 'drawings', f);
        rows.push({ company_id: companyId, party_name: companyName.trim(), product_name: product.trim(), file_path: path, file_name: f.name, file_size: f.size, notes: notes.trim() || null, uploaded_by: userName || null });
      }
      const ins = await supabase.from('cnc_drawing_versions').insert(rows);
      if (ins.error) throw new Error(ins.error.message);
      toast.success(`${rows.length} version${rows.length === 1 ? '' : 's'} added.`);
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not upload.'); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{start.product ? `New version — ${start.product}` : 'Upload Drawing'}</DialogTitle>
          <DialogDescription>Any file type (DWG, DXF, STEP, PDF, images, ZIP …). Each file becomes the next version of the product.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Company</Label><Input aria-label="Company" list="pd-companies" value={companyName} onChange={e => setCompanyName(e.target.value)} disabled={!!start.company} /></div>
          <datalist id="pd-companies">{companies.map(c => <option key={c} value={c} />)}</datalist>
          <div><Label>Product</Label><Input aria-label="Product" list="pd-products" value={product} onChange={e => setProduct(e.target.value)} disabled={!!start.product} /></div>
          <datalist id="pd-products">{known.map(p => <option key={p.key} value={p.product} />)}</datalist>
          <div>
            <Label>Files</Label>
            <label className="mt-1 flex h-20 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 text-sm font-medium text-slate-600 hover:border-indigo-400">
              <UploadCloud className="h-5 w-5" />{picked.length ? `${picked.length} file${picked.length === 1 ? '' : 's'} chosen` : 'Choose files'}
              <input type="file" multiple accept="*/*" className="hidden" aria-label="Drawing files" onChange={e => { const f = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ''; if (f.length) setPicked(p => [...p, ...f]); }} />
            </label>
            {picked.length > 0 && <ul className="mt-2 space-y-1 text-xs text-slate-600">{picked.map((f, i) => <li key={`${f.name}-${i}`} className="flex justify-between"><span className="truncate">{f.name}</span><button type="button" className="text-rose-500" aria-label={`Remove ${f.name}`} onClick={() => setPicked(p => p.filter((_, j) => j !== i))}>×</button></li>)}</ul>}
          </div>
          <div><Label>Notes (optional)</Label><Input aria-label="Notes" placeholder="What changed in this version" value={notes} onChange={e => setNotes(e.target.value)} /></div>
          {tableMissing && <p className="text-xs text-amber-700">Run the latest database migration first (20261008000000_drawing_versions.sql).</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => void save()} disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
