import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { GitBranch, GripVertical, Plus, RefreshCw, Trophy, XCircle } from "lucide-react";
import { api } from "../lib/api";
import { useAsync } from "../lib/hooks";
import { useToast } from "../providers/ToastProvider";
import { useAuth } from "../providers/AuthProvider";
import { can, mayTouchLead, PERMISSIONS } from "../lib/permissions";
import {
  PIPELINE_STATUSES,
  SOURCE_LABELS,
  STATUS_LABELS,
  type Lead,
  type LeadStatus,
} from "../lib/types";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  PriorityBadge,
  Skeleton,
  StatusBadge,
} from "../components/ui/primitives";
import { Avatar } from "../components/layout/Shell";
import { PageHeader } from "../components/ui/pagebits";
import { displayName, formatDue, formatRelative, statusLabel } from "../lib/format";

interface ListPayload {
  data: Lead[];
  pagination: { total: number; pages: number };
}

/** One kanban column's card, draggable when the role may actually move it. */
function LeadCard({
  lead,
  draggable,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  lead: Lead;
  draggable: boolean;
  onDragStart: (event: React.DragEvent) => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  const isOverdue = lead.next_follow_up_at && new Date(lead.next_follow_up_at) < new Date();

  return (
    <article
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={[
        "group relative rounded-xl border border-line bg-surface p-3.5 shadow-card transition-all duration-200",
        draggable ? "cursor-grab active:cursor-grabbing hover:border-brand-500/30 hover:shadow-card-hover hover:-translate-y-0.5" : "",
        dragging ? "opacity-30 ring-2 ring-brand-500 scale-[0.98]" : "",
      ].join(" ")}
      aria-label={`${lead.full_name}, ${statusLabel(lead.status)}`}
    >
      {draggable ? (
        <div className="absolute right-2 top-2.5 rounded p-0.5 text-ink-4 opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-ink-2">
          <GripVertical className="size-4" aria-hidden />
        </div>
      ) : null}

      <Link to={`/crm/leads/${lead.id}`} className="block min-w-0 pr-6">
        <h4 className="truncate text-sm font-semibold text-ink group-hover:text-brand-600 transition-colors">
          {lead.full_name}
        </h4>
        <p className="mt-0.5 truncate text-xs text-ink-3">
          {lead.organization || lead.email || lead.phone || "No company details"}
        </p>
      </Link>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={lead.priority} />
        <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-3 border border-line">
          {SOURCE_LABELS[lead.source] ?? lead.source}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/75 pt-2.5">
        <span className="flex items-center gap-1.5 text-xs text-ink-3 min-w-0">
          <Avatar name={lead.assignee?.full_name} email={lead.assignee?.email} size="xs" />
          <span className="truncate max-w-[90px] text-[11px] font-medium text-ink-2">
            {displayName(lead.assignee ?? null)}
          </span>
        </span>
        <span
          className={`inline-flex items-center text-[11px] font-medium ${
            isOverdue
              ? "text-rose-600 font-semibold"
              : "text-ink-3"
          }`}
          title={lead.next_follow_up_at ? `Follow-up: ${lead.next_follow_up_at}` : `Created: ${lead.created_at}`}
        >
          {lead.next_follow_up_at ? formatDue(lead.next_follow_up_at) : formatRelative(lead.created_at)}
        </span>
      </div>
    </article>
  );
}

/**
 * Kanban board: New → Contacted → Follow-up → Qualified → Proposal → Converted.
 *
 * A drop calls `POST /leads/{id}/move`, which persists both the new stage and
 * the position inside that stage. The card is only optimistically re-ordered
 * after the server confirms, so a rejected move (no permission, lead archived
 * meanwhile) leaves the board exactly as it was and says why.
 */
const STAGE_TOP_ACCENTS: Record<LeadStatus, string> = {
  new: "border-t-sky-500",
  contacted: "border-t-amber-500",
  follow_up: "border-t-violet-500",
  qualified: "border-t-emerald-500",
  proposal: "border-t-indigo-500",
  converted: "border-t-teal-500",
  lost: "border-t-rose-400",
};

export default function Pipeline() {
  const { role, user } = useAuth();
  const toast = useToast();

  const [showLost, setShowLost] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<LeadStatus | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const dragLead = useRef<Lead | null>(null);

  const canMove = can(role, PERMISSIONS.LEAD_UPDATE_ANY) || can(role, PERMISSIONS.LEAD_UPDATE_OWN);

  const query = useMemo(
    () => ({
      page: 1,
      page_size: 200,
      sort: "sort_order",
      order: "asc",
      view: "active",
      ...(showLost ? { status: [...PIPELINE_STATUSES, "lost"] } : undefined),
    }),
    [showLost],
  );

  const board = useAsync<ListPayload>(
    (signal) => api.get<ListPayload>("/leads", query, { signal }),
    [JSON.stringify(query)],
  );

  const columns = useMemo(() => {
    const map = new Map<LeadStatus, Lead[]>(PIPELINE_STATUSES.map((s) => [s, []]));
    for (const lead of board.data?.data ?? []) {
      const bucket = map.get(lead.status);
      if (bucket) bucket.push(lead);
    }
    if (showLost) map.set("lost", (board.data?.data ?? []).filter((l) => l.status === "lost"));
    return map;
  }, [board.data, showLost]);

  const totalOnBoard = PIPELINE_STATUSES.reduce(
    (sum, status) => sum + (columns.get(status)?.length ?? 0),
    0,
  );

  const moveTo = useCallback(
    async (lead: Lead, target: LeadStatus, index: number) => {
      if (lead.status === target && lead.status !== "lost") {
        // Same column: recompute the ordering from the rendered list.
        const bucket = columns.get(target) ?? [];
        const without = bucket.filter((l) => l.id !== lead.id);
        const reordered = [...without.slice(0, index), lead, ...without.slice(index)];
        const neighbours = reordered.filter((l) => l.id !== lead.id);
        const before = neighbours[index - 1]?.sort_order ?? 0;
        const after = neighbours[index]?.sort_order ?? before + 2;
        if (before === lead.sort_order && after === lead.sort_order) return;
      }

      setMovingId(lead.id);
      try {
        const sort_order =
          (() => {
            const bucket = columns.get(target) ?? [];
            const without = bucket.filter((l) => l.id !== lead.id);
            const at = Math.max(0, Math.min(index, without.length));
            const prev = without[at - 1]?.sort_order ?? 0;
            const next = without[at]?.sort_order ?? prev + 2;
            return at === 0 && without.length === 0 ? 1 : (prev + next) / 2;
          })();

        const updated = await api.post<Lead>(`/leads/${lead.id}/move`, {
          status: target,
          sort_order: Number.isFinite(sort_order) && sort_order > 0 ? sort_order : undefined,
        });

        board.setData((current) =>
          current
            ? { ...current, data: current.data.map((l) => (l.id === updated.id ? updated : l)) }
            : current,
        );
        if (lead.status !== target) {
          toast.success(
            `Moved to ${STATUS_LABELS[target]}`,
            `${lead.full_name} · an activity entry was recorded.`,
          );
        }
      } catch (error) {
        toast.fromError(error, "That move was not saved.");
        void board.refetch(); // re-sync in case the row changed underneath us
      } finally {
        setMovingId(null);
        setDraggingId(null);
        setDropTarget(null);
        dragLead.current = null;
      }
    },
    [columns, board, toast],
  );

  function onDrop(status: LeadStatus, index: number) {
    const lead = dragLead.current;
    if (!lead) return;
    void moveTo(lead, status, index);
  }

  if (board.error && !board.data) {
    return (
      <div className="mx-auto max-w-7xl">
        <ErrorState
          title="Couldn't load the board"
          description={board.errorMessage}
          onRetry={() => void board.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader
        title="Pipeline"
        subtitle={
          board.loading
            ? "Loading the board…"
            : `${totalOnBoard} active lead${totalOnBoard === 1 ? "" : "s"} across six stages${
                showLost ? ", plus Lost" : ""
              }. Drag a card to change its stage — the drop is saved before the card moves.`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={showLost ? "primary" : "secondary"}
              size="sm"
              onClick={() => setShowLost((v) => !v)}
              aria-pressed={showLost}
            >
              <XCircle className="size-4" aria-hidden />
              {showLost ? "Hiding Lost" : "Show Lost"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void board.refetch()}
              loading={board.loading && Boolean(board.data)}
              icon={<RefreshCw className="size-4" aria-hidden />}
            >
              Refresh
            </Button>
            {can(role, PERMISSIONS.LEAD_CREATE) ? (
              <Link to="/crm/leads?new=1">
                <Button variant="primary" size="sm" icon={<Plus className="size-4" aria-hidden />}>
                  New lead
                </Button>
              </Link>
            ) : null}
          </div>
        }
      />

      {!canMove ? (
        <div className="rounded-xl border border-line bg-surface-2/80 px-4 py-3 text-sm text-ink-2 shadow-xs">
          Your role can view this board but not move cards. Ask an owner, admin or manager if you
          need edit access.
        </div>
      ) : null}

      {board.loading && !board.data ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {PIPELINE_STATUSES.map((status) => (
            <div key={status} className="rounded-2xl border border-line bg-surface-2/60 p-3.5 space-y-3">
              <Skeleton className="h-5 w-24 rounded-full" />
              <div className="space-y-2.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : totalOnBoard === 0 ? (
        <Card>
          <EmptyState
            icon={<GitBranch className="size-6" />}
            title="The board is empty"
            description="Leads appear here as soon as they are created, imported, or pushed in by an integration. The six columns are New, Contacted, Follow-up, Qualified, Proposal and Converted."
            action={
              can(role, PERMISSIONS.LEAD_CREATE) ? (
                <Link to="/crm/leads?new=1">
                  <Button variant="primary" size="sm">
                    <Plus className="size-4" aria-hidden />
                    Create the first lead
                  </Button>
                </Link>
              ) : (
                <Link to="/crm/leads">
                  <Button variant="outline" size="sm">
                    Open the leads table
                  </Button>
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6 items-start">
          {[...PIPELINE_STATUSES, ...(showLost ? (["lost"] as LeadStatus[]) : [])].map((status) => {
            const items = columns.get(status) ?? [];
            const isDropTarget = dropTarget === status;
            return (
              <section
                key={status}
                aria-label={`${STATUS_LABELS[status]} column, ${items.length} leads`}
                onDragOver={(event) => {
                  if (!canMove) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropTarget(status);
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget as Node)) return;
                  setDropTarget((current) => (current === status ? null : current));
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!canMove) return;
                  onDrop(status, items.length);
                }}
                className={[
                  "flex min-h-[380px] flex-col rounded-2xl border border-t-[3px] bg-surface-2/60 backdrop-blur-xs p-3 transition-all duration-200",
                  STAGE_TOP_ACCENTS[status] || "border-t-slate-400",
                  isDropTarget ? "border-brand-500 bg-brand-50/15 ring-2 ring-brand-500/20 shadow-md" : "border-line",
                ].join(" ")}
              >
                <header className="mb-3 flex items-center justify-between gap-2 px-0.5">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={status} />
                    <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-ink-3 ring-1 ring-line">
                      {items.length}
                    </span>
                  </div>
                  {status === "converted" && items.length > 0 ? (
                    <Trophy className="size-4 text-emerald-500" aria-hidden />
                  ) : null}
                </header>

                <div className="flex-1 space-y-2.5">
                  {items.map((lead, index) => (
                    <div
                      key={lead.id}
                      onDragOver={(event) => {
                        if (!canMove) return;
                        event.preventDefault();
                        event.stopPropagation();
                        setDropTarget(status);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (!canMove) return;
                        onDrop(status, index);
                      }}
                    >
                      <LeadCard
                        lead={lead}
                        draggable={canMove && mayTouchLead(role, lead, user?.id ?? null)}
                        dragging={draggingId === lead.id}
                        onDragStart={(event) => {
                          dragLead.current = lead;
                          setDraggingId(lead.id);
                          event.dataTransfer.effectAllowed = "move";
                          // Firefox/Safari refuse to start a drag without data.
                          event.dataTransfer.setData("text/plain", lead.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDropTarget(null);
                          dragLead.current = null;
                        }}
                      />
                      {movingId === lead.id ? (
                        <p className="mt-1 text-center text-[11px] font-medium text-brand-600 animate-pulse">
                          Saving…
                        </p>
                      ) : null}
                    </div>
                  ))}

                  {items.length === 0 ? (
                    <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface/30 p-4 text-center transition-colors">
                      <p className="text-xs font-medium text-ink-3">Drop lead here</p>
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
