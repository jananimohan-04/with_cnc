import { useMemo, useState } from 'react';
import { Building, ChevronDown, ChevronRight, Download, ExternalLink, FileText, Folder, FolderOpen, LayoutGrid, List, Loader2, Plus, Search, FilterX } from 'lucide-react';
import { useAuth as useAppAuth } from '@/contexts/AuthContext';
import { groupAll, type ProductDrawings } from '@/lib/pipelineDrawings';
import { downloadStoredFile, openStoredFile } from '@/lib/orderFiles';
import { usePipelineFiles } from '@/vault/hooks/usePipelineFiles';
import { SOURCE_STYLE, UploadVersionDialog, dmy } from '@/vault/components/PipelineDrawings';
import { Button } from '@/vault/components/ui/button';
import { Input } from '@/vault/components/ui/input';

// Documents: the real files, company by company. Each company is a folder holding one folder per product, and each
// product folder holds its files version by version. The files are the ones attached in the Sales Pipeline (enquiries,
// sales orders, inwards) plus anything uploaded here, so nothing is typed in twice.

type FileRow = ProductDrawings['files'][number] & { company: string; product: string };
const extOf = (n: string) => (n.includes('.') ? n.split('.').pop()!.toUpperCase().slice(0, 5) : 'FILE');

export function CompanyFiles() {
  const { company, profile } = useAppAuth();
  const { files, error, tableMissing, reload } = usePipelineFiles(company?.id);
  const [view, setView] = useState<'folders' | 'list'>('folders');
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [upload, setUpload] = useState<null | { company: string; product: string }>(null);

  const folders = useMemo(() => groupAll(files ?? []), [files]);
  const companies = useMemo(() => Array.from(new Set(folders.map(f => f.company).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [folders]);
  const q = search.trim().toLowerCase();
  const visible = useMemo(() => folders
    .filter(f => !companyFilter || f.company === companyFilter)
    .map(f => ({ ...f, files: q ? f.files.filter(x => `${f.product} ${f.company} ${x.name} ${x.ref} ${x.source}`.toLowerCase().includes(q)) : f.files }))
    .filter(f => f.files.length > 0), [folders, companyFilter, q]);
  const byCompany = useMemo(() => {
    const m = new Map<string, typeof visible>();
    visible.forEach(f => m.set(f.company, [...(m.get(f.company) ?? []), f]));
    return Array.from(m.entries());
  }, [visible]);
  const flat: FileRow[] = useMemo(() => visible.flatMap(f => f.files.map(x => ({ ...x, company: f.company, product: f.product }))).sort((a, b) => b.date.localeCompare(a.date)), [visible]);
  const toggle = (k: string) => setOpen(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const total = visible.reduce((n, f) => n + f.files.length, 0);

  const actions = (f: { path: string; name: string }) => (
    <span className="inline-flex items-center gap-3">
      <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline" onClick={() => void openStoredFile(f.path)}><ExternalLink className="h-3.5 w-3.5" />Open</button>
      <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:underline" onClick={() => void downloadStoredFile(f.path, f.name)}><Download className="h-3.5 w-3.5" />Download</button>
    </span>
  );

  return (
    <div className="space-y-5" data-testid="company-files">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Documents</h2>
          <p className="text-muted-foreground mt-1">Your real files, company by company and product by product, version by version. Everything attached in the Sales Pipeline is here.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button type="button" onClick={() => setView('folders')} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${view === 'folders' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600'}`}><LayoutGrid className="h-4 w-4" />Folder View</button>
            <button type="button" onClick={() => setView('list')} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${view === 'list' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600'}`}><List className="h-4 w-4" />List View</button>
          </div>
          <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-sm" onClick={() => setUpload({ company: '', product: '' })}><Plus className="h-4 w-4 mr-2" />Upload Document</Button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input aria-label="Search documents" placeholder="Search by company, product, file name or number…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select aria-label="Company" value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} className="h-10 md:w-64 rounded-md border border-slate-200 bg-white px-3 text-sm">
          <option value="">All Companies</option>
          {companies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <Button variant="outline" onClick={() => { setSearch(''); setCompanyFilter(''); }}><FilterX className="h-4 w-4 mr-2" />Reset</Button>
      </div>

      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      {tableMissing && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Uploading here needs the latest database migration (20261008000000_drawing_versions.sql). Files from the Sales Pipeline are shown either way.</p>}
      {files === null && <div className="bg-white border rounded-xl p-10 text-center text-slate-400"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading…</div>}
      {files !== null && total === 0 && !error && (
        <div className="bg-white p-10 rounded-xl border text-center text-slate-500" data-testid="no-documents">
          <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p>{files.length ? 'No document matches the search.' : 'No documents yet.'}</p>
          {!files.length && <p className="text-xs text-slate-400 mt-1">Files attached to an enquiry, sales order or inward appear here automatically, or use Upload Document.</p>}
        </div>
      )}

      {view === 'folders' && byCompany.map(([name, items]) => (
        <div key={name} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="bg-slate-100/90 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5"><Building className="w-5 h-5 text-indigo-600" /><h3 className="font-bold text-slate-900 text-base">{name || 'No company'}</h3></div>
            <span className="text-xs font-medium text-slate-600">{items.reduce((n, f) => n + f.files.length, 0)} files · {items.length} folder{items.length === 1 ? '' : 's'}</span>
          </div>
          <div className="p-4 space-y-3 bg-slate-50/50">
            {items.map(f => {
              const isOpen = open.has(f.key);
              return (
                <div key={f.key} data-testid="folder" className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                  <div className="p-3 bg-slate-50 hover:bg-slate-100/80 cursor-pointer flex items-center justify-between border-b border-slate-100" onClick={() => toggle(f.key)}>
                    <div className="flex items-center gap-2.5">
                      {isOpen ? <FolderOpen className="w-4 h-4 text-amber-500" /> : <Folder className="w-4 h-4 text-amber-500" />}
                      <span className="font-semibold text-slate-800 text-sm">{f.product}</span>
                      <span className="rounded-full border bg-white px-2 py-0.5 text-[11px] text-slate-600">{f.files.length} {f.files.length === 1 ? 'file' : 'files'}</span>
                      <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-bold text-white">V{f.files[f.files.length - 1].version}</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-400" onClick={e => e.stopPropagation()}>
                      <button type="button" className="text-xs font-semibold text-indigo-600 hover:underline" onClick={() => setUpload({ company: f.company, product: f.product })}>New Version</button>
                      <span onClick={() => toggle(f.key)}>{isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="divide-y divide-slate-100">
                      {[...f.files].reverse().map(x => (
                        <div key={x.key} data-testid="doc-row" className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 hover:bg-slate-50/80">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="inline-flex rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-xs font-bold text-indigo-700">V{x.version}</span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{extOf(x.name)}</span>
                            <span className="truncate font-medium text-slate-800 text-sm" title={x.name}>{x.name}</span>
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SOURCE_STYLE[x.source]}`}>{x.source}{x.source !== 'Upload' && x.ref ? ` · ${x.ref}` : ''}</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-slate-500">
                            {x.notes && <span className="max-w-[200px] truncate" title={x.notes}>{x.notes}</span>}
                            <span className="whitespace-nowrap">{dmy(x.date)}{x.by ? ` · ${x.by}` : ''}</span>
                            {actions(x)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {view === 'list' && flat.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              <th className="px-3 py-3">File</th><th className="px-3 py-3">Company</th><th className="px-3 py-3">Folder (product)</th><th className="px-3 py-3">Version</th>
              <th className="px-3 py-3">From</th><th className="px-3 py-3">Date</th><th className="px-3 py-3 text-right">Actions</th></tr></thead>
            <tbody>
              {flat.map(x => (
                <tr key={x.key} data-testid="doc-row" className="border-t border-slate-100 hover:bg-slate-50/70">
                  <td className="px-3 py-2.5 font-medium text-slate-800 max-w-[260px] truncate" title={x.name}>{x.name}</td>
                  <td className="px-3 py-2.5 text-slate-700">{x.company || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-700">{x.product}</td>
                  <td className="px-3 py-2.5"><span className="rounded-full border border-indigo-200 px-2 py-0.5 text-xs font-bold text-indigo-700">V{x.version}</span></td>
                  <td className="px-3 py-2.5"><span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SOURCE_STYLE[x.source]}`}>{x.source}{x.source !== 'Upload' && x.ref ? ` · ${x.ref}` : ''}</span></td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-slate-500">{dmy(x.date)}</td>
                  <td className="px-3 py-2.5 text-right">{actions(x)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {upload && (
        <UploadVersionDialog
          start={upload} companies={companies} products={folders} companyId={company?.id ?? ''} userName={profile?.full_name ?? ''} tableMissing={tableMissing}
          onClose={() => setUpload(null)} onDone={() => { setUpload(null); void reload(); }}
        />
      )}
    </div>
  );
}
