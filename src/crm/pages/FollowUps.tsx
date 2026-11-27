import { useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CalendarClock,
  Check,
  CircleSlash,
  Clock,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { api } from "../lib/api";
import { useAsync, useDebounced, useToggle } from "../lib/hooks";
import { useToast } from "../providers/ToastProvider";
import { useAuth } from "../providers/AuthProvider";
import { can, mayTouchFollowUp, PERMISSIONS } from "../lib/permissions";
import {
  FOLLOW_UP_TYPES,
  type FollowUp,
  type FollowUpType,
} from "../lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PriorityBadge,
  Select,
  StatusBadge,
  TableSkeleton,
  Textarea,
} from "../components/ui/primitives";
import { Avatar } from "../components/layout/Shell";
import { Modal } from "../components/ui/Modal";
import { PageHeader, Pagination, TableWrap, Td, Th } from "../components/ui/pagebits";
import { displayName, formatDateTime, formatDue, formatTime, fromLocalInputValue, toLocalInputValue } from "../lib/format";

const WINDOWS = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "done", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All pending" },
] as const;

type WindowKey = (typeof WINDOWS)[number]["key"];

const TYPE_ICONS: Record<FollowUpType, string> = {
  call: "Call",
  email: "E-mail",
  meeting: "Meeting",
  demo: "Demo",
  task: "Task",
  other: "Other",
};

interface ListPayload {
  data: FollowUp[];
  pagination: { page: number; page_size: number; total: number; pages: number };
  windows?: Record<string, number>;
}

interface Draft {
  id?: string;
  lead_id: string;
  type: FollowUpType;
  title: string;
  description: string;
  scheduled_at: string;
  duration_min: string;
  assigned_to: string;
}

const EMPTY_DRAFT: Draft = {
  lead_id: "",
  type: "call",
  title: "",
  description: "",
  scheduled_at: toLocalInputValue(new Date(Date.now() + 3_600_000).toISOString()),
  duration_min: "30",
  assigned_to: "",
};

/**
 * Follow-ups screen.
 *
 * The overdue/today/upcoming chips come from the API's own window counts (the
 * same numbers the dashboard shows), so the badge and the list can never
 * disagree. Completion and cancellation are real state changes — a completed
 * item moves to the Completed tab rather than disappearing silently.
 */
export default function FollowUps() {
  const { role, user } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const windowKey = (searchParams.get("window") ?? "overdue") as WindowKey;
  const search = searchParams.get("q") ?? "";
  const leadFilter = searchParams.get("lead") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const pageSize = 25;

  const [searchDraft, setSearchDraft] = useState(search);
  const debounced = useDebounced(searchDraft, 350);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useToggle(false);
  const [deleteTarget, setDeleteTarget] = useState<FollowUp | null>(null);
  const [cancelTarget, setCancelTarget] = useState<FollowUp | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const patch = (next: Record<string, string | null>, resetPage = true) => {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        for (const [key, value] of Object.entries(next)) {
          params.delete(key);
          if (value) params.set(key, value);
        }
        if (resetPage) params.delete("page");
        return params;
      },
      { replace: true },
    );
  };

  if (debounced !== search) patch({ q: debounced || null });

  const query = useMemo(
    () => ({
      window: windowKey,
      page,
      page_size: pageSize,
      ...(search ? { search } : undefined),
      ...(leadFilter ? { lead_id: leadFilter } : undefined),
    }),
    [windowKey, page, search, leadFilter],
  );

  const list = useAsync<ListPayload>(
    (signal) => api.get<ListPayload>("/follow-ups", query, { signal }),
    [JSON.stringify(query)],
  );

  const leads = useAsync<{ data: { id: string; full_name: string; organization: string | null }[] }>(
    (signal) =>
      api.get("/leads", { page: 1, page_size: 200, sort: "full_name", order: "asc", view: "active" }, { signal }),
    [],
    { enabled: can(role, PERMISSIONS.FOLLOW_UP_CREATE) },
  );

  const members = useAsync<{ data: { user_id: string; profile?: { full_name?: string | null; email?: string | null } | null; role: string }[] }>(
    (signal) => api.get("/members", undefined, { signal }),
    [],
    { enabled: can(role, PERMISSIONS.FOLLOW_UP_CREATE) },
  );

  const rows = list.data?.data ?? [];
  const windows = list.data?.windows ?? {};

  const leadName = (followUp: FollowUp) =>
    followUp.lead?.full_name ?? "Unknown lead";

  function openCreate(prefillLead?: string) {
    setErrors({});
    setDraft({ ...EMPTY_DRAFT, ...(prefillLead ? { lead_id: prefillLead } : {}) });
  }

  function openEdit(followUp: FollowUp) {
    setErrors({});
    setDraft({
      id: followUp.id,
      lead_id: followUp.lead_id,
      type: followUp.type,
      title: followUp.title,
      description: followUp.description ?? "",
      scheduled_at: toLocalInputValue(followUp.scheduled_at),
      duration_min: followUp.duration_min ? String(followUp.duration_min) : "",
      assigned_to: followUp.assigned_to ?? "",
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const next: Record<string, string> = {};
    if (!draft.lead_id) next.lead_id = "Pick the lead this belongs to.";
    if (!draft.title.trim()) next.title = "Give the follow-up a title.";
    if (!draft.scheduled_at) next.scheduled_at = "Choose when it is due.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const payload = {
      lead_id: draft.lead_id,
      type: draft.type,
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      scheduled_at: fromLocalInputValue(draft.scheduled_at),
      duration_min: draft.duration_min ? Number(draft.duration_min) : null,
      assigned_to: draft.assigned_to || null,
    };

    setBusy(true);
    try {
      if (draft.id) {
        await api.patch<FollowUp>(`/follow-ups/${draft.id}`, payload);
        toast.success("Follow-up updated");
      } else {
        await api.post<FollowUp>("/follow-ups", payload);
        toast.success("Follow-up scheduled", formatDateTime(payload.scheduled_at));
      }
      setDraft(null);
      await list.refetch();
    } catch (error) {
      const fieldErrors = (error as { fieldErrors?: Record<string, string> }).fieldErrors;
      if (fieldErrors) setErrors(fieldErrors);
      toast.fromError(error, "Could not save the follow-up.");
    } finally {
      setBusy(false);
    }
  }

  async function act(followUp: FollowUp, action: "complete" | "reschedule-next") {
    try {
      if (action === "complete") {
        await api.post(`/follow-ups/${followUp.id}/complete`);
        toast.success("Marked complete", followUp.title);
      } else {
        const next = new Date(followUp.scheduled_at);
        next.setDate(next.getDate() + 1);
        await api.post(`/follow-ups/${followUp.id}/reschedule`, { scheduled_at: next.toISOString() });
        toast.success("Rescheduled to tomorrow", followUp.title);
      }
      await list.refetch();
    } catch (error) {
      toast.fromError(error, "That action failed.");
    }
  }

  async function cancelFollowUp() {
    if (!cancelTarget) return;
    setBusy(true);
    try {
      await api.post(`/follow-ups/${cancelTarget.id}/cancel`, {
        cancel_reason: cancelReason.trim() || null,
      });
      toast.success("Follow-up cancelled", cancelTarget.title);
      setCancelTarget(null);
      setCancelReason("");
      await list.refetch();
    } catch (error) {
      toast.fromError(error, "Could not cancel it.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.delete(`/follow-ups/${deleteTarget.id}`);
      toast.success("Follow-up deleted");
      setDeleteTarget(null);
      setConfirmDelete(false);
      await list.refetch();
    } catch (error) {
      toast.fromError(error, "Could not delete it.");
    } finally {
      setBusy(false);
    }
  }

  const activeLeadName = leadFilter
    ? (leads.data?.data ?? []).find((l) => l.id === leadFilter)?.full_name
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Follow-ups"
        subtitle={
          list.loading
            ? "Loading…"
            : `${list.data?.pagination.total ?? 0} item${
                (list.data?.pagination.total ?? 0) === 1 ? "" : "s"
              } in this view`
        }
        actions={
          can(role, PERMISSIONS.FOLLOW_UP_CREATE) ? (
            <Button variant="primary" onClick={() => openCreate(leadFilter || undefined)} icon={<Plus className="size-4" aria-hidden />}>
              Schedule follow-up
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-surface-2/70 p-1 shadow-xs">
          {WINDOWS.map((win) => {
            const active = windowKey === win.key;
            const count = windows[win.key];
            return (
              <button
                key={win.key}
                type="button"
                onClick={() => patch({ window: win.key })}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
                  active
                    ? "bg-surface text-ink shadow-xs ring-1 ring-black/5"
                    : "text-ink-3 hover:text-ink hover:bg-surface/50"
                }`}
              >
                {win.label}
                {typeof count === "number" ? (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      active
                        ? "bg-brand-100 text-brand-700"
                        : win.key === "overdue" && count > 0
                          ? "bg-rose-100 text-rose-700 font-bold"
                          : "bg-surface-2 text-ink-3"
                    }`}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-4" aria-hidden />
            <Input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search follow-ups…"
              className="pl-9 h-9 text-xs bg-surface"
              aria-label="Search follow-ups"
            />
          </div>

          {activeLeadName ? (
            <button
              type="button"
              onClick={() => patch({ lead: null })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors"
            >
              <span>Lead: {activeLeadName}</span>
              <span aria-hidden className="font-bold">×</span>
              <span className="sr-only">Clear lead filter</span>
            </button>
          ) : null}
        </div>
      </div>

      <Card>
        {list.loading && !list.data ? (
          <TableSkeleton rows={6} columns={5} />
        ) : list.error && !list.data ? (
          <ErrorState
            title="Couldn't load follow-ups"
            description={list.errorMessage}
            onRetry={() => void list.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="size-6" />}
            title={
              windowKey === "overdue"
                ? "Nothing overdue"
                : windowKey === "today"
                  ? "Nothing scheduled for today"
                  : windowKey === "done"
                    ? "No completed follow-ups yet"
                    : "No follow-ups in this view"
            }
            description={
              windowKey === "overdue"
                ? "Every scheduled follow-up is still ahead of you."
                : "Schedule one from a lead's page or with the button above — it is linked to the lead, so the timeline stays complete."
            }
            action={
              can(role, PERMISSIONS.FOLLOW_UP_CREATE) ? (
                <Button variant="primary" size="sm" onClick={() => openCreate()}>
                  <Plus className="size-4" aria-hidden />
                  Schedule one
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Follow-up</Th>
                  <Th>Lead</Th>
                  <Th>Type</Th>
                  <Th>Assignee</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((followUp) => {
                  const overdue = followUp.window === "overdue";
                  const touchable = mayTouchFollowUp(role, followUp, user?.id ?? null);
                  const editable =
                    touchable && can(role, PERMISSIONS.FOLLOW_UP_CREATE) && followUp.status === "pending";
                  return (
                    <tr key={followUp.id} className="border-b border-line transition hover:bg-surface-2">
                      <Td className="whitespace-nowrap">
                        <span
                          className={`block text-sm font-semibold ${
                            overdue ? "text-danger" : followUp.window === "today" ? "text-ink" : "text-ink-2"
                          }`}
                        >
                          {formatDue(followUp.scheduled_at)}
                        </span>
                        <span className="block text-xs text-ink-3">
                          {followUp.duration_min ? `${followUp.duration_min} min · ` : ""}
                          {formatTime(followUp.scheduled_at)}
                        </span>
                      </Td>
                      <Td>
                        <p className="font-semibold text-ink">{followUp.title}</p>
                        {followUp.description ? (
                          <p className="mt-0.5 max-w-md truncate text-xs text-ink-3">{followUp.description}</p>
                        ) : null}
                        {followUp.status === "completed" ? (
                          <Badge tone="success">Completed {formatDateTime(followUp.completed_at)}</Badge>
                        ) : followUp.status === "cancelled" ? (
                          <Badge tone="danger">
                            Cancelled{followUp.cancel_reason ? ` · ${followUp.cancel_reason}` : ""}
                          </Badge>
                        ) : null}
                      </Td>
                      <Td>
                        <Link
                          to={`/crm/leads/${followUp.lead_id}`}
                          className="font-medium text-ink hover:text-brand-700"
                        >
                          {leadName(followUp)}
                        </Link>
                        {followUp.lead?.organization ? (
                          <span className="block text-xs text-ink-3">{followUp.lead.organization}</span>
                        ) : null}
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-1.5 text-sm text-ink-2">
                          <Clock className="size-3.5 text-ink-3" aria-hidden />
                          {TYPE_ICONS[followUp.type]}
                        </span>
                        {followUp.lead ? (
                          <span className="mt-1 flex gap-1">
                            <StatusBadge status={followUp.lead.status} />
                            <PriorityBadge priority={followUp.lead.priority} />
                          </span>
                        ) : null}
                      </Td>
                      <Td>
                        <span className="flex items-center gap-2 text-sm text-ink-2">
                          <Avatar name={followUp.assignee?.full_name} email={followUp.assignee?.email} size="xs" />
                          {displayName(followUp.assignee ?? followUp.creator ?? null)}
                        </span>
                      </Td>
                      <Td>
                        <div className="flex justify-end gap-1.5">
                          {followUp.status === "pending" ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => void act(followUp, "complete")}
                              disabled={!editable}
                              title={editable ? "Mark as done" : "You can only complete your own follow-ups"}
                            >
                              <Check className="size-3.5" aria-hidden />
                              Done
                            </Button>
                          ) : null}
                          {editable ? (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openEdit(followUp)}
                                aria-label={`Edit ${followUp.title}`}
                              >
                                <Pencil className="size-3.5" aria-hidden />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setCancelTarget(followUp);
                                  setCancelReason("");
                                }}
                                aria-label={`Cancel ${followUp.title}`}
                              >
                                <CircleSlash className="size-3.5" aria-hidden />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setDeleteTarget(followUp);
                                  setConfirmDelete(true);
                                }}
                                aria-label={`Delete ${followUp.title}`}
                                disabled={!can(role, PERMISSIONS.FOLLOW_UP_DELETE)}
                              >
                                <Trash2 className="size-3.5" aria-hidden />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>

            <Pagination
              page={list.data!.pagination.page}
              pages={list.data!.pagination.pages}
              total={list.data!.pagination.total}
              pageSize={list.data!.pagination.page_size}
              label="follow-ups"
              onPage={(next) => patch({ page: String(next) }, false)}
            />
          </>
        )}
      </Card>

      {/* --------------------------------------------------------- create/edit */}
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit follow-up" : "Schedule a follow-up"}
        description="It is linked to the lead, so it shows on that lead's timeline too."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={(event) => void save(event as unknown as FormEvent)}>
              {draft?.id ? "Save changes" : "Schedule"}
            </Button>
          </>
        }
      >
        {draft ? (
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="Lead" htmlFor="fu-lead" required error={errors.lead_id} className="sm:col-span-2">
              <Select
                id="fu-lead"
                data-autofocus
                value={draft.lead_id}
                invalid={Boolean(errors.lead_id)}
                onChange={(event) => setDraft({ ...draft, lead_id: event.target.value })}
              >
                <option value="">Choose a lead…</option>
                {(leads.data?.data ?? []).map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.full_name}
                    {lead.organization ? ` — ${lead.organization}` : ""}
                  </option>
                ))}
                {draft.lead_id && !(leads.data?.data ?? []).some((l) => l.id === draft.lead_id) ? (
                  <option value={draft.lead_id}>Current lead</option>
                ) : null}
              </Select>
              {leads.error ? (
                <p className="mt-1 text-sm text-danger">The lead list could not be loaded.</p>
              ) : null}
            </Field>

            <Field label="Title" htmlFor="fu-title" required error={errors.title}>
              <Input
                id="fu-title"
                value={draft.title}
                invalid={Boolean(errors.title)}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="Call about the renewal"
                maxLength={300}
              />
            </Field>

            <Field label="Type" htmlFor="fu-type">
              <Select
                id="fu-type"
                value={draft.type}
                onChange={(event) => setDraft({ ...draft, type: event.target.value as FollowUpType })}
              >
                {FOLLOW_UP_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {TYPE_ICONS[type]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Due" htmlFor="fu-due" required error={errors.scheduled_at}>
              <Input
                id="fu-due"
                type="datetime-local"
                value={draft.scheduled_at}
                invalid={Boolean(errors.scheduled_at)}
                onChange={(event) => setDraft({ ...draft, scheduled_at: event.target.value })}
              />
            </Field>

            <Field label="Duration (minutes)" htmlFor="fu-duration" hint="1 – 1440">
              <Input
                id="fu-duration"
                type="number"
                min={1}
                max={1440}
                value={draft.duration_min}
                onChange={(event) => setDraft({ ...draft, duration_min: event.target.value })}
                placeholder="30"
              />
            </Field>

            <Field
              label="Assigned to"
              htmlFor="fu-assignee"
              hint="Defaults to you when left empty."
              className="sm:col-span-2"
            >
              <Select
                id="fu-assignee"
                value={draft.assigned_to}
                onChange={(event) => setDraft({ ...draft, assigned_to: event.target.value })}
              >
                <option value="">Me</option>
                {(members.data?.data ?? []).map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {displayName(member.profile ?? null)} — {member.role}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Notes" htmlFor="fu-desc" className="sm:col-span-2">
              <Textarea
                id="fu-desc"
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                placeholder="What should happen on this call?"
                maxLength={5000}
              />
            </Field>
          </form>
        ) : null}
      </Modal>

      {/* -------------------------------------------------------------- cancel */}
      <Modal
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        title="Cancel this follow-up?"
        description={cancelTarget ? cancelTarget.title : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelTarget(null)} disabled={busy}>
              Keep it
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void cancelFollowUp()}>
              Cancel follow-up
            </Button>
          </>
        }
      >
        <Field label="Reason (optional)" htmlFor="cancel-reason" hint="Kept on the record for the team.">
          <Input
            id="cancel-reason"
            data-autofocus
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="Prospect asked to be contacted next quarter"
            maxLength={500}
          />
        </Field>
      </Modal>

      {/* ------------------------------------------------------------- delete */}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this follow-up?"
        description={deleteTarget ? deleteTarget.title : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void remove()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          Deleting removes it from the lead's timeline. If you only want it out of the way, cancel it
          instead — that keeps the history.
        </p>
      </Modal>
    </div>
  );
}
