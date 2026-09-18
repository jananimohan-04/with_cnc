import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getDashboardStats, listAuditLogs, listNotifications, listDocuments } from "@/lib/api";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Building2, Layers, Upload, Users, FileType, Activity } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { isSuperAdmin, isCompanyAdmin, isNormalUser, userPartyId, profile } = usePermissions();
  const effectivePartyId = userPartyId || undefined;

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard-stats", effectivePartyId, isNormalUser, profile?.full_name],
    queryFn: () => getDashboardStats(effectivePartyId, isNormalUser, profile?.full_name || undefined),
  });

  const { data: recentDocsData, isLoading: docsLoading } = useQuery({
    queryKey: ["dashboard-recent-docs", effectivePartyId],
    queryFn: () => listDocuments({ partyId: effectivePartyId, pageSize: 20 }),
  });

  const recentDocsList = useMemo(() => {
    if (!recentDocsData?.rows) return [];
    if (isSuperAdmin || isCompanyAdmin) return recentDocsData.rows.slice(0, 5);
    return recentDocsData.rows.filter(doc =>
      doc.status === "Approved" ||
      doc.status === "Released" ||
      doc.updated_by_name === profile?.full_name
    ).slice(0, 5);
  }, [recentDocsData, isSuperAdmin, isCompanyAdmin, profile]);

  const { data: recentActivity, isLoading: activityLoading } = useQuery({
    queryKey: ["dashboard-recent-activity"],
    queryFn: () => listAuditLogs({ limit: 5 }),
  });

  const { data: notifications, isLoading: notificationsLoading } = useQuery({
    queryKey: ["dashboard-notifications"],
    queryFn: listNotifications,
  });

  return (
    <div className="space-y-6 flex flex-col">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h2>
        <p className="text-muted-foreground mt-1">
          Overview of your engineering document control vault.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Total Documents"
          value={stats?.documents ?? "-"}
          icon={FileText}
          loading={statsLoading}
        />
        <StatCard
          title="Total Drawings"
          value={stats?.drawings ?? "-"}
          icon={FileType}
          loading={statsLoading}
        />
        <StatCard
          title="Total Parties"
          value={stats?.parties ?? "-"}
          icon={Building2}
          loading={statsLoading}
        />
        <StatCard
          title="Total Versions"
          value={stats?.versions ?? "-"}
          icon={Layers}
          loading={statsLoading}
        />
        <StatCard
          title="Uploads This Month"
          value={stats?.thisMonth ?? "-"}
          icon={Upload}
          loading={statsLoading}
        />
        <StatCard
          title="Active Users"
          value={stats?.activeUsers ?? "-"}
          icon={Users}
          loading={statsLoading}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4 shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-500" />
              Recent Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {docsLoading ? (
              <div className="h-48 flex items-center justify-center text-slate-400">Loading...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 bg-slate-50 uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-medium">Document Number</th>
                      <th className="px-4 py-3 font-medium">Party</th>
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Version</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDocsList.map((doc) => (
                      <tr key={doc.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-indigo-600">{doc.document_number}</td>
                        <td className="px-4 py-3 text-slate-600">{doc.parties?.name || "-"}</td>
                        <td className="px-4 py-3 text-slate-900 truncate max-w-[200px]">{doc.document_name}</td>
                        <td className="px-4 py-3">V{doc.current_version}</td>
                        <td className="px-4 py-3">
                          <Badge variant={doc.status === "Approved" || doc.status === "Released" ? "default" : "secondary"}>
                            {doc.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {(!recentDocsList || recentDocsList.length === 0) && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                          No recent documents found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-500" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <div className="h-48 flex items-center justify-center text-slate-400">Loading...</div>
            ) : (
              <div className="space-y-4">
                {recentActivity?.map((log) => (
                  <div key={log.id} className="flex gap-4">
                    <div className="mt-1 h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none text-slate-900">
                        {log.user_name} <span className="font-normal text-slate-500">{log.action.toLowerCase()}</span> {log.document_number}
                      </p>
                      <p className="text-xs text-slate-500">
                        {format(new Date(log.created_at), "MMM d, yyyy h:mm a")}
                      </p>
                    </div>
                  </div>
                ))}
                {(!recentActivity || recentActivity.length === 0) && (
                  <div className="text-center text-slate-500 py-4">No recent activity.</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, loading }: { title: string; value: number | string; icon: any; loading: boolean }) {
  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-indigo-500" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-8 w-16 bg-slate-100 animate-pulse rounded" />
        ) : (
          <div className="text-2xl font-bold text-slate-900">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}
