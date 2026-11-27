import { useState } from "react";
import { BarChart3, GitBranch, PieChart, Users } from "lucide-react";
import { api } from "../lib/api";
import { useAsync } from "../lib/hooks";
import type {
  AnalyticsOverview,
  PipelineAnalytics,
  SourceAnalytics,
  TeamAnalytics,
} from "../lib/types";
import {
  LEAD_PRIORITIES,
  LEAD_STATUSES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type LeadPriority,
  type LeadStatus,
} from "../lib/types";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Skeleton,
} from "../components/ui/primitives";
import { PageHeader, TableWrap, Td, Th } from "../components/ui/pagebits";
import { formatDateTime } from "../lib/format";

const WINDOWS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
] as const;

function pct(value: number | null, digits = 1): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

/** Horizontal bar row used by every "count by X" breakdown. */
function BarRow({
  label,
  count,
  total,
  tone = "bg-brand-500",
}: {
  label: string;
  count: number;
  total: number;
  tone?: string;
}) {
  const share = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate font-medium text-ink">{label}</span>
        <span className="shrink-0 font-semibold text-ink">
          {count}
          <span className="ml-1.5 text-xs font-normal text-ink-3">{share.toFixed(0)}%</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${total > 0 ? Math.max(2, share) : 0}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Analytics.
 *
 * Four real queries, each carrying its own `generated_at`. Nothing on this
 * page is estimated: an empty company shows zeros and an explicit empty state
 * rather than a plausible-looking chart with invented data.
 */
export default function Analytics() {
  const [days, setDays] = useState<number>(30);

  const overview = useAsync<AnalyticsOverview>(
    (signal) => api.get<AnalyticsOverview>("/analytics/overview", { days, granularity: "day" }, { signal }),
    [days],
  );
  const pipeline = useAsync<PipelineAnalytics>(
    (signal) => api.get<PipelineAnalytics>("/analytics/pipeline", { days }, { signal }),
    [days],
  );
  const sources = useAsync<SourceAnalytics>(
    (signal) => api.get<SourceAnalytics>("/analytics/sources", { days }, { signal }),
    [days],
  );
  const team = useAsync<TeamAnalytics>(
    (signal) => api.get<TeamAnalytics>("/analytics/team", { days }, { signal }),
    [days],
  );

  const totals = overview.data?.totals;
  const loading = overview.loading || pipeline.loading;
  const anyError = overview.error && !overview.data;

  const funnel = pipeline.data?.funnel ?? [];
  const maxFunnel = funnel.reduce((max, step) => Math.max(max, step.reached), 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Analytics"
        subtitle={
          loading
            ? "Loading…"
            : overview.data
              ? `Real rows for the last ${days} days · generated ${formatDateTime(overview.data.generated_at)}`
              : "Every figure is computed from rows you can read."
        }
        actions={
          <div className="inline-flex rounded-xl border border-line bg-surface-2/70 p-1 shadow-xs" role="group" aria-label="Time window">
            {WINDOWS.map((win) => (
              <button
                key={win.days}
                type="button"
                onClick={() => setDays(win.days)}
                aria-pressed={days === win.days}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 ${
                  days === win.days ? "bg-surface text-ink shadow-xs ring-1 ring-black/5" : "text-ink-3 hover:text-ink hover:bg-surface/50"
                }`}
              >
                {win.label}
              </button>
            ))}
          </div>
        }
      />

      {anyError ? (
        <ErrorState
          title="Couldn't load analytics"
          description={overview.errorMessage}
          onRetry={() => void overview.refetch()}
        />
      ) : (
        <>
          {/* --------------------------------------------------------- headline */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="p-5">
                  <Skeleton className="h-3.5 w-24 rounded-full" />
                  <Skeleton className="mt-3 h-8 w-16 rounded-lg" />
                </Card>
              ))
            ) : (
              <>
                <Card className="p-5 transition hover:shadow-card-hover">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">Total Leads</p>
                    <span className="rounded-lg bg-brand-50 p-1.5 text-brand-600 ring-1 ring-brand-200/60">
                      <BarChart3 className="size-4" aria-hidden />
                    </span>
                  </div>
                  <p className="mt-2 font-display text-3xl font-extrabold text-ink tracking-tight">{totals?.leads ?? 0}</p>
                  <p className="mt-1 text-xs text-ink-3">{totals?.archived ?? 0} archived</p>
                </Card>
                <Card className="p-5 transition hover:shadow-card-hover">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">In Pipeline</p>
                    <span className="rounded-lg bg-violet-50 p-1.5 text-violet-600 ring-1 ring-violet-200/60">
                      <GitBranch className="size-4" aria-hidden />
                    </span>
                  </div>
                  <p className="mt-2 font-display text-3xl font-extrabold text-ink tracking-tight">{totals?.in_pipeline ?? 0}</p>
                  <p className="mt-1 text-xs text-emerald-600 font-medium">+{totals?.created_this_week ?? 0} this week</p>
                </Card>
                <Card className="p-5 transition hover:shadow-card-hover">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">Conversion Rate</p>
                    <span className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 ring-1 ring-emerald-200/60">
                      <PieChart className="size-4" aria-hidden />
                    </span>
                  </div>
                  <p className="mt-2 font-display text-3xl font-extrabold text-emerald-600 tracking-tight">{pct(totals?.conversion_rate ?? null)}</p>
                  <p className="mt-1 text-xs text-ink-3">
                    {totals?.converted ?? 0} converted · {totals?.lost ?? 0} lost
                  </p>
                </Card>
                <Card className="p-5 transition hover:shadow-card-hover">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">Follow-ups</p>
                    <span className="rounded-lg bg-amber-50 p-1.5 text-amber-600 ring-1 ring-amber-200/60">
                      <Users className="size-4" aria-hidden />
                    </span>
                  </div>
                  <p className="mt-2 font-display text-3xl font-extrabold text-ink tracking-tight">
                    {pct(overview.data?.follow_ups.completion_rate ?? null)}
                  </p>
                  <p className="mt-1 text-xs text-ink-3">
                    {overview.data?.follow_ups.completed ?? 0} done ·{" "}
                    <span className={overview.data?.follow_ups.overdue ? "text-rose-600 font-semibold" : ""}>
                      {overview.data?.follow_ups.overdue ?? 0} overdue
                    </span>
                  </p>
                </Card>
              </>
            )}
          </div>

          {/* ---------------------------------------------------------- timeline */}
          <Card>
            <CardHeader
              title="Created vs converted"
              subtitle="One bar pair per period, straight from the leads table."
              actions={
                <Badge tone="neutral">
                  {overview.data
                    ? `${overview.data.timeline.length} period${overview.data.timeline.length === 1 ? "" : "s"}`
                    : "—"}
                </Badge>
              }
            />
            {loading ? (
              <div className="p-5"><Skeleton className="h-40 w-full" /></div>
            ) : (overview.data?.timeline.length ?? 0) === 0 ? (
              <EmptyState
                icon={<BarChart3 className="size-6" />}
                title="No data in this window"
                description="Leads created inside the selected window will chart here."
                action={
                  <Button variant="outline" size="sm" onClick={() => setDays(365)}>
                    Widen to 1 year
                  </Button>
                }
              />
            ) : (
              <div className="p-5">
                <div className="flex h-44 items-end gap-1.5">
                  {overview.data!.timeline.map((point) => {
                    const max = overview.data!.timeline.reduce(
                      (m, p) => Math.max(m, p.created, p.converted),
                      1,
                    );
                    return (
                      <div key={point.period} className="group relative flex-1">
                        <div className="flex h-40 items-end justify-center gap-0.5">
                          <div
                            className="w-1/2 rounded-t bg-brand-400 transition group-hover:bg-brand-500"
                            style={{ height: `${(point.created / max) * 100}%` }}
                            title={`${point.period}: ${point.created} created`}
                          />
                          <div
                            className="w-1/2 rounded-t bg-converted/70 transition group-hover:bg-converted"
                            style={{ height: `${(point.converted / max) * 100}%` }}
                            title={`${point.period}: ${point.converted} converted`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-ink-3">
                  <span>{overview.data!.timeline[0]?.period}</span>
                  <span className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-sm bg-brand-400" aria-hidden /> Created
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-sm bg-converted/70" aria-hidden /> Converted
                    </span>
                  </span>
                  <span>{overview.data!.timeline[overview.data!.timeline.length - 1]?.period}</span>
                </div>
              </div>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* -------------------------------------------------------- funnel */}
            <Card>
              <CardHeader title="Pipeline funnel" subtitle={pipeline.data?.note ?? "Stage reach within the window."} />
              {pipeline.loading ? (
                <div className="space-y-3 p-5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : funnel.length === 0 ? (
                <EmptyState
                  icon={<GitBranch className="size-6" />}
                  title="Nothing to funnel yet"
                  description="Stages fill in as leads move through the board."
                />
              ) : (
                <ol className="space-y-3 p-5">
                  {funnel.map((step, index) => (
                    <li key={step.status}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium text-ink">
                          {index + 1}. {STATUS_LABELS[step.status as LeadStatus] ?? step.status}
                        </span>
                        <span className="text-ink-3">
                          {step.reached} · {pct(step.step_conversion)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-6 overflow-hidden rounded-md bg-surface-2">
                        <div
                          className="h-full rounded-md bg-brand-500"
                          style={{ width: `${maxFunnel > 0 ? (step.reached / maxFunnel) * 100 : 0}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            {/* --------------------------------------------------------- sources */}
            <Card>
              <CardHeader
                title="Sources & campaigns"
                subtitle="Which channels actually convert, not just which send volume."
              />
              {sources.loading ? (
                <div className="space-y-3 p-5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : (sources.data?.sources.length ?? 0) === 0 ? (
                <EmptyState
                  icon={<PieChart className="size-6" />}
                  title="No attributed leads"
                  description="Import a CSV or connect a form to start tracking sources."
                />
              ) : (
                <TableWrap>
                  <thead>
                    <tr>
                      <Th>Source</Th>
                      <Th>Campaign</Th>
                      <Th>Leads</Th>
                      <Th>Converted</Th>
                      <Th>Rate</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.data!.sources.slice(0, 12).map((row, i) => (
                      <tr key={`${row.source}-${row.campaign ?? i}`} className="border-b border-line">
                        <Td className="font-medium text-ink">{row.source}</Td>
                        <Td className="text-sm text-ink-2">{row.campaign ?? "—"}</Td>
                        <Td>{row.leads}</Td>
                        <Td>{row.converted}</Td>
                        <Td>
                          <Badge tone={row.conversion_rate && row.conversion_rate > 0 ? "success" : "neutral"}>
                            {pct(row.conversion_rate)}
                          </Badge>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              )}
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* ------------------------------------------------------ by status */}
            <Card>
              <CardHeader title="By stage" />
              <div className="space-y-3.5 p-5">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
                ) : (overview.data?.by_status.length ?? 0) === 0 ? (
                  <p className="text-sm text-ink-3">No leads in this window.</p>
                ) : (
                  overview.data!.by_status.map((row) => (
                    <BarRow
                      key={row.status}
                      label={STATUS_LABELS[row.status]}
                      count={row.count}
                      total={overview.data!.totals.leads}
                      tone={
                        row.status === "converted"
                          ? "bg-converted"
                          : row.status === "lost"
                            ? "bg-lost"
                            : "bg-brand-500"
                      }
                    />
                  ))
                )}
              </div>
            </Card>

            {/* ---------------------------------------------------- by priority */}
            <Card>
              <CardHeader title="By priority" />
              <div className="space-y-3.5 p-5">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
                ) : (overview.data?.by_priority.length ?? 0) === 0 ? (
                  <p className="text-sm text-ink-3">No leads in this window.</p>
                ) : (
                  overview.data!.by_priority.map((row) => (
                    <BarRow
                      key={row.priority}
                      label={PRIORITY_LABELS[row.priority as LeadPriority]}
                      count={row.count}
                      total={overview.data!.totals.leads}
                      tone={
                        row.priority === "urgent"
                          ? "bg-priority-urgent"
                          : row.priority === "high"
                            ? "bg-priority-high"
                            : "bg-brand-500"
                      }
                    />
                  ))
                )}
              </div>
              <div className="border-t border-line px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Top tags</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(overview.data?.top_tags ?? []).length === 0 ? (
                    <span className="text-sm text-ink-3">No tags yet.</span>
                  ) : (
                    overview.data!.top_tags.map((tag) => (
                      <span
                        key={tag.tag}
                        className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-ink-2 ring-1 ring-line-strong"
                      >
                        #{tag.tag} · {tag.count}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </Card>

            {/* --------------------------------------------------------- team */}
            <Card>
              <CardHeader title="By source" subtitle="Volume split across channels." />
              <div className="space-y-3.5 p-5">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
                ) : (overview.data?.by_source.length ?? 0) === 0 ? (
                  <p className="text-sm text-ink-3">No leads in this window.</p>
                ) : (
                  overview.data!.by_source.map((row) => (
                    <BarRow
                      key={row.source}
                      label={row.source}
                      count={row.count}
                      total={overview.data!.totals.leads}
                    />
                  ))
                )}
              </div>
            </Card>
          </div>

          {/* ---------------------------------------------------------- team perf */}
          <Card>
            <CardHeader
              title="Team performance"
              subtitle="Per-member assignment, conversion and follow-up completion."
              actions={<Users className="size-4 text-ink-3" aria-hidden />}
            />
            {team.loading && !team.data ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : team.error && !team.data ? (
              <ErrorState
                title="Couldn't load team performance"
                description={team.errorMessage}
                onRetry={() => void team.refetch()}
              />
            ) : (team.data?.members.length ?? 0) === 0 ? (
              <EmptyState
                icon={<Users className="size-6" />}
                title="No members with assigned work"
                description="Assign leads to see per-person numbers here."
              />
            ) : (
              <>
                <TableWrap>
                  <thead>
                    <tr>
                      <Th>Member</Th>
                      <Th>Role</Th>
                      <Th>Assigned</Th>
                      <Th>Converted</Th>
                      <Th>Conversion</Th>
                      <Th>Follow-ups</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.data!.members.map((member) => (
                      <tr key={member.user_id} className="border-b border-line hover:bg-surface-2">
                        <Td className="font-medium text-ink">{member.name || "—"}</Td>
                        <Td className="text-sm text-ink-2">{member.role}</Td>
                        <Td>{member.leads_assigned}</Td>
                        <Td>{member.converted}</Td>
                        <Td>
                          <Badge tone={member.converted > 0 ? "success" : "neutral"}>
                            {pct(member.conversion_rate)}
                          </Badge>
                        </Td>
                        <Td className="text-sm text-ink-2">
                          {member.follow_ups_completed}/{member.follow_ups_total} ·{" "}
                          {pct(member.follow_up_completion_rate)}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
                <div className="border-t border-line px-5 py-3 text-sm text-ink-2">
                  Unassigned leads: <strong className="text-ink">{team.data!.unassigned_leads}</strong>
                </div>
              </>
            )}
          </Card>
        </>
      )}

      <p className="text-center text-xs text-ink-3">
        {LEAD_STATUSES.length} stages · {LEAD_PRIORITIES.length} priorities · every number above comes
        from this company's rows only.
      </p>
    </div>
  );
}
