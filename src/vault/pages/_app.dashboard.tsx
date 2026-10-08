import { createFileRoute } from "@/vault/router-adapter";
import { useMemo } from "react";
import { useAuth as useAppAuth } from "@/contexts/AuthContext";
import { groupVersions } from "@/lib/pipelineDrawings";
import { usePipelineFiles } from "@/vault/hooks/usePipelineFiles";
import { SOURCE_STYLE, dmy } from "@/vault/components/PipelineDrawings";
import { Card, CardContent, CardHeader, CardTitle } from "@/vault/components/ui/card";
import { FileText, Building2, Layers, Upload, Box, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

function StatCard({ title, value, icon: Icon, loading }: { title: string; value: number | string; icon: typeof FileText; loading: boolean }) {
  return (
    <Card className="shadow-sm border-slate-200">
      <CardContent className="p-5">
        <div className="flex items-center justify-between text-sm text-slate-600"><span>{title}</span><Icon className="h-4 w-4 text-indigo-500" /></div>
        <div className="mt-3 text-3xl font-bold text-slate-900">{loading ? "…" : value}</div>
      </CardContent>
    </Card>
  );
}

// Overview of the real pipeline files: every number comes from the enquiries, sales orders, inwards and uploads.
function DashboardPage() {
  const { company } = useAppAuth();
  const { files, refs, error } = usePipelineFiles(company?.id);
  const loading = files === null;
  const products = useMemo(() => groupVersions(files ?? [], refs).filter(p => !p.finished), [files, refs]);
  const withFiles = products.filter(p => p.files.length > 0);
  const without = products.filter(p => p.files.length === 0);
  const companies = new Set(products.map(p => p.company).filter(Boolean)).size;
  const totalFiles = withFiles.reduce((n, p) => n + p.files.length, 0);
  const monthKey = new Date().toISOString().slice(0, 7);
  const thisMonth = (files ?? []).filter(f => f.date.startsWith(monthKey)).length;
  const recent = useMemo(() => withFiles.flatMap(p => p.files.map(f => ({ ...f, company: p.company, product: p.product }))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8), [withFiles]);

  return (
    <div className="space-y-6 flex flex-col">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h2>
        <p className="text-muted-foreground mt-1">Overview of the drawings and files on your orders and inwards.</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard title="Companies" value={companies} icon={Building2} loading={loading} />
        <StatCard title="Products" value={products.length} icon={Box} loading={loading} />
        <StatCard title="Total Files" value={totalFiles} icon={FileText} loading={loading} />
        <StatCard title="Uploads This Month" value={thisMonth} icon={Upload} loading={loading} />
        <StatCard title="Without Drawing" value={without.length} icon={Layers} loading={loading} />
      </div>

      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4 shadow-sm border-slate-200">
          <CardHeader><CardTitle className="text-lg font-semibold flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-500" />Recent Files</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 bg-slate-50 uppercase border-b border-slate-200"><tr>
                  <th className="px-4 py-3 font-medium">File</th><th className="px-4 py-3 font-medium">Company</th><th className="px-4 py-3 font-medium">Product</th><th className="px-4 py-3 font-medium">Version</th><th className="px-4 py-3 font-medium">From</th><th className="px-4 py-3 font-medium">Date</th>
                </tr></thead>
                <tbody>
                  {recent.map(f => (
                    <tr key={f.key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900 truncate max-w-[200px]" title={f.name}>{f.name}</td>
                      <td className="px-4 py-3 text-slate-600">{f.company || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{f.product}</td>
                      <td className="px-4 py-3">V{f.version}</td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SOURCE_STYLE[f.source]}`}>{f.source}</span></td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dmy(f.date)}</td>
                    </tr>
                  ))}
                  {!loading && recent.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No files yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 shadow-sm border-slate-200">
          <CardHeader><CardTitle className="text-lg font-semibold flex items-center gap-2"><AlertCircle className="w-5 h-5 text-amber-500" />Products Without a Drawing</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y divide-slate-100 max-h-80 overflow-auto">
              {without.map(p => (
                <li key={p.key} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0"><div className="font-medium text-slate-900 truncate">{p.product}</div><div className="text-xs text-slate-500 truncate">{p.company}{p.refs.length ? ` · ${p.refs.join(" · ")}` : ""}</div></div>
                </li>
              ))}
              {!loading && without.length === 0 && <li className="py-8 text-center text-slate-500 text-sm">Every product has a drawing.</li>}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
