import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ChevronRight,
  Contact,
  Plus,
  TrendingUp,
} from "lucide-react";
import { api } from "../lib/api";
import { useAsync } from "../lib/hooks";
import type { AnalyticsOverview, FollowUp, Lead } from "../lib/types";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Skeleton,
} from "../components/ui/primitives";
import { StatusBadge } from "../components/ui/primitives";
import { Avatar } from "../components/layout/Shell";
import {
  displayName,
  dueKind,
  formatDue,
  formatRelative,
  statusLabel,
} from "../lib/format";
import { useAuth } from "../providers/AuthProvider";
import { can, PERMISSIONS } from "../lib/permissions";
import { PageHeader, StatCard } from "../components/ui/pagebits";

/**
 * Dashboard.
 *
 * Every figure below is computed server-side from rows the current user can
 * actually read. When a company has no data yet the cards say `0` and the
 * lists say "nothing here" — no placeholder is ever substituted.
 */
export default function Dashboard() {
  const { currentCompany, role } = useAuth();

  const overview = useAsync<AnalyticsOverview>(
    (signal) => api.get<AnalyticsOverview>("/analytics/overview", { days: 30 }, { signal }),
    [currentCompany?.id],
  );

  const recentLeads = useAsync<{ data: Lead[]; pagination: { total: number } }>(
    (signal) =>
      api.get<{ data: Lead[]; pagination: { total: number } }>(
        "/leads",
        { page: 1, page_size: 6, sort: "created_at", order: "desc" },
        { signal },
      ),
    [currentCompany?.id],
  );

  const dueFollowUps = useAsync<{ data: FollowUp[]; windows?: Record<string, number> }>(
    (signal) =>
      api.get<{ data: FollowUp[]; windows?: Record<string, number> }>(
        "/follow-ups",
        { window: "overdue", page: 1, page_size: 50 },
        { signal },
      ),
    [currentCompany?.id],
  );

  const totals = overview.data?.totals;
  const overdue = overview.data?.follow_ups.overdue ?? dueFollowUps.data?.windows?.overdue ?? 0;

  const loading = overview.loading || recentLeads.loading;

  if (overview.error && !overview.data) {
    return (
      <div className="mx-auto max-w-7xl">
        <ErrorState
          title="Couldn't load the dashboard"
          description={overview.errorMessage}
          onRetry={() => void overview.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7 animate-in">
      <PageHeader
        title={`Welcome back${currentCompany ? `, ${currentCompany.name}` : ""}`}
        subtitle={
          loading
            ? "Loading workspace analytics…"
            : "Real-time metrics for the last 30 days — computed directly from your database."
        }
        actions={
          can(role, PERMISSIONS.LEAD_CREATE) ? (
            <Link to="/crm/leads?new=1">
              <Button variant="primary" icon={<Plus className="size-4" aria-hidden />}>
                New lead
              </Button>
            </Link>
          ) : null
        }
      />

      {/* --------------------------------------------------------- headline stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-5.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3.5 h-8 w-16" />
              <Skeleton className="mt-3 h-3 w-32" />
            </Card>
          ))
        ) : (
          <>
            <StatCard
              label="Leads in pipeline"
              value={totals?.in_pipeline ?? 0}
              hint={`${totals?.created_this_week ?? 0} added in the last 7 days`}
              icon={<Contact className="size-5" aria-hidden />}
              tone="brand"
            />
            <StatCard
              label="Converted leads"
              value={totals?.converted ?? 0}
              hint={
                totals?.conversion_rate != null
                  ? `${(totals.conversion_rate * 100).toFixed(1)}% conversion rate`
                  : "No decided leads yet"
              }
              icon={<TrendingUp className="size-5" aria-hidden />}
              tone="success"
            />
            <StatCard
              label="Follow-ups overdue"
              value={overdue}
              hint={`${overview.data?.follow_ups.due_today ?? 0} due today`}
              icon={<AlertTriangle className="size-5" aria-hidden />}
              tone={overdue > 0 ? "danger" : "neutral"}
            />
            <StatCard
              label="Team roster"
              value={totals?.team_size ?? 0}
              hint={`${totals?.archived ?? 0} archived lead${totals?.archived === 1 ? "" : "s"}`}
              icon={<CalendarClock className="size-5" aria-hidden />}
              tone="neutral"
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* --------------------------------------------------------- recent leads */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Latest leads"
            subtitle="The six most recently created records in this workspace."
            actions={
              <Link
                to="/crm/leads"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:text-brand-700 transition"
              >
                View all leads <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          {recentLeads.loading ? (
            <div className="space-y-3.5 p-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="size-9 rounded-xl" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              ))}
            </div>
          ) : recentLeads.error && !recentLeads.data ? (
            <ErrorState
              title="Couldn't load recent leads"
              description={recentLeads.errorMessage}
              onRetry={() => void recentLeads.refetch()}
            />
          ) : (recentLeads.data?.data.length ?? 0) === 0 ? (
            <EmptyState
              icon={<Contact className="size-6" />}
              title="No leads yet"
              description="Create your first lead, import a CSV, or connect a form to start filling your pipeline."
              action={
                can(role, PERMISSIONS.LEAD_CREATE) ? (
                  <Link to="/crm/leads?new=1">
                    <Button variant="primary" size="sm" icon={<Plus className="size-4" />}>
                      Add a lead
                    </Button>
                  </Link>
                ) : null
              }
            />
          ) : (
            <ul className="divide-y divide-line/70">
              {recentLeads.data!.data.map((lead) => (
                <li key={lead.id}>
                  <Link
                    to={`/crm/leads/${lead.id}`}
                    className="flex items-center gap-3.5 px-6 py-3.5 transition-colors hover:bg-slate-50/80 group"
                  >
                    <Avatar name={lead.full_name} email={lead.email} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-ink group-hover:text-brand-600 transition-colors">
                        {lead.full_name}
                      </p>
                      <p className="truncate text-[11px] text-ink-3 font-medium">
                        {lead.organization ? `${lead.organization} · ` : ""}{lead.email || lead.phone || "No contact info"}
                      </p>
                    </div>
                    <StatusBadge status={lead.status} />
                    <span className="hidden w-24 shrink-0 text-right text-[11px] text-ink-3 font-medium sm:block">
                      {formatRelative(lead.created_at)}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-ink-3 group-hover:text-brand-600 transition-colors" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* --------------------------------------------------------- follow-ups */}
        <Card>
          <CardHeader
            title="Overdue follow-ups"
            subtitle="Pending tasks that have slipped schedule."
            actions={
              <Link
                to="/crm/follow-ups"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:text-brand-700 transition"
              >
                View all <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          {dueFollowUps.loading ? (
            <div className="space-y-3.5 p-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-3 w-28" />
                </div>
              ))}
            </div>
          ) : dueFollowUps.error && !dueFollowUps.data ? (
            <ErrorState
              title="Couldn't load follow-ups"
              description={dueFollowUps.errorMessage}
              onRetry={() => void dueFollowUps.refetch()}
            />
          ) : (dueFollowUps.data?.data.length ?? 0) === 0 ? (
            <EmptyState
              icon={<CalendarClock className="size-6" />}
              title="Nothing overdue"
              description="Great job! Every scheduled follow-up is either completed or on schedule."
            />
          ) : (
            <ul className="divide-y divide-line/70">
              {dueFollowUps.data!.data.slice(0, 6).map((followUp) => {
                const kind = dueKind(followUp.scheduled_at);
                return (
                  <li key={followUp.id}>
                    <Link
                      to={`/crm/leads/${followUp.lead_id}`}
                      className="block px-6 py-3.5 transition-colors hover:bg-slate-50/80 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-xs font-bold text-ink group-hover:text-brand-600 transition-colors">
                          {followUp.title}
                        </p>
                        <Badge tone={kind === "overdue" ? "danger" : "warning"}>
                          {formatDue(followUp.scheduled_at)}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-ink-3 font-medium">
                        {followUp.lead?.full_name ?? "Unknown lead"}
                        {followUp.lead?.organization ? ` · ${followUp.lead.organization}` : ""}
                      </p>
                      <p className="mt-1 text-[11px] text-ink-3 font-medium">
                        Owner: <span className="text-ink-2 font-semibold">{displayName(followUp.assignee)}</span>
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* --------------------------------------------------------- stage breakdown */}
      <Card>
        <CardHeader
          title="Pipeline at a glance"
          subtitle={
            overview.data
              ? `Counts across all active leads in workspace · generated ${new Date(
                  overview.data.generated_at,
                ).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}.`
              : "Loading stage metrics…"
          }
          actions={
            <Link
              to="/crm/pipeline"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:text-brand-700 transition"
            >
              Open Kanban board <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          }
        />
        <div className="grid grid-cols-2 gap-3.5 p-6 sm:grid-cols-4 lg:grid-cols-7">
          {(overview.data?.by_status ?? []).map(({ status, count }) => {
            const totalLeads = overview.data?.totals.leads ?? 0;
            const share = totalLeads > 0 ? (count / totalLeads) * 100 : 0;
            return (
              <div key={status} className="rounded-xl border border-line/80 bg-slate-50/60 p-3.5 transition hover:bg-white hover:shadow-2xs">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-3">
                  {statusLabel(status)}
                </p>
                <p className="mt-1.5 font-display text-2xl font-extrabold text-ink">{count}</p>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-200/80">
                  <div
                    className="h-full rounded-full bg-brand-600 transition-all duration-300"
                    style={{
                      width: `${totalLeads > 0 ? Math.max(5, share) : 0}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
          {overview.loading &&
            Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-line p-3.5 space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-7 w-12" />
                <Skeleton className="h-1.5 w-full" />
              </div>
            ))}
        </div>
      </Card>
    </div>
  );
}
