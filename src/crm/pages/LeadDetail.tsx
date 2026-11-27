import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Archive,
  ArchiveRestore,
  CalendarClock,
  History,
  Link2,
  MessageSquare,
  Pin,
  Save,
  StickyNote,
  Trash2,
} from "lucide-react";
import { api } from "../lib/api";
import { useAsync, useToggle } from "../lib/hooks";
import { useToast } from "../providers/ToastProvider";
import { useAuth } from "../providers/AuthProvider";
import { can, mayTouchLead, PERMISSIONS } from "../lib/permissions";
import {
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  PRIORITY_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  type Lead,
  type LeadActivity,
  type LeadDuplicate,
  type LeadNote,
} from "../lib/types";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageLoader,
  PriorityBadge,
  Select,
  Skeleton,
  StatusBadge,
  Textarea,
} from "../components/ui/primitives";
import { Avatar } from "../components/layout/Shell";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/pagebits";
import {
  displayName,
  formatDateTime,
  formatDue,
  formatRelative,
  fromLocalInputValue,
  toLocalInputValue,
} from "../lib/format";

const FIELD_LABELS: Record<string, string> = {
  full_name: "Name",
  email: "E-mail",
  phone: "Phone",
  organization: "Company",
  job_title: "Job title",
  website: "Website",
  status: "Status",
  priority: "Priority",
  source: "Source",
  campaign: "Campaign",
  assigned_to: "Assignee",
  tags: "Tags",
  next_follow_up_at: "Next follow-up",
  notes: "Notes",
};

interface EditState {
  full_name: string;
  email: string;
  phone: string;
  organization: string;
  job_title: string;
  website: string;
  source: string;
  campaign: string;
  status: string;
  priority: string;
  assigned_to: string;
  tags: string;
  next_follow_up_at: string;
}

function toEditState(lead: Lead): EditState {
  return {
    full_name: lead.full_name ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    organization: lead.organization ?? "",
    job_title: lead.job_title ?? "",
    website: lead.website ?? "",
    source: lead.source ?? "manual",
    campaign: lead.campaign ?? "",
    status: lead.status ?? "new",
    priority: lead.priority ?? "medium",
    assigned_to: lead.assigned_to ?? "",
    tags: (lead.tags ?? []).join(", "),
    next_follow_up_at: toLocalInputValue(lead.next_follow_up_at),
  };
}

/**
 * Lead detail: profile, activity history, notes and duplicate check.
 *
 * Editing is gated twice — `mayTouchLead` hides controls a salesperson could
 * not use (their own / assigned leads only), and the backend applies exactly
 * the same rule server-side regardless of what the UI shows.
 */
export default function LeadDetail() {
  const { leadId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { role, user } = useAuth();

  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useToggle(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"activity" | "notes" | "duplicates">("activity");

  const lead = useAsync<Lead>(
    (signal) => api.get<Lead>(`/leads/${leadId}`, undefined, { signal }),
    [leadId],
  );

  const activity = useAsync<LeadActivity[]>(
    (signal) => api.get<LeadActivity[]>(`/leads/${leadId}/activities`, { limit: 200 }, { signal }),
    [leadId],
  );

  const notes = useAsync<LeadNote[]>(
    (signal) => api.get<LeadNote[]>(`/leads/${leadId}/notes`, undefined, { signal }),
    [leadId],
  );

  const duplicates = useAsync<LeadDuplicate[]>(
    (signal) => api.get<LeadDuplicate[]>(`/leads/${leadId}/duplicates`, undefined, { signal }),
    [leadId],
    { enabled: activeTab === "duplicates" },
  );

  const members = useAsync<{ data: { user_id: string; profile?: { full_name?: string | null; email?: string | null } | null; role: string }[] }>(
    (signal) => api.get("/members", undefined, { signal }),
    [],
    { enabled: can(role, PERMISSIONS.LEAD_UPDATE_ANY) },
  );

  // Seed the edit form whenever a fresh lead arrives (or after a save).
  useEffect(() => {
    if (lead.data && edit === null) setEdit(toEditState(lead.data));
  }, [lead.data, edit]);

  const record = lead.data;
  const touchable = record ? mayTouchLead(role, record, user?.id ?? null) : false;
  const canEdit = canAnyEdit(role) && touchable;

  function canAnyEdit(r: typeof role): boolean {
    return can(r, PERMISSIONS.LEAD_UPDATE_ANY) || can(r, PERMISSIONS.LEAD_UPDATE_OWN);
  }

  /**
   * Note actions mirror the API exactly: the author may always edit or delete
   * their own note, otherwise NOTE_UPDATE_ANY / NOTE_DELETE is required
   * (`update_note` / `delete_note` in backend/app/routers/leads.py).
   */
  function canEditNote(note: LeadNote): boolean {
    if (note.author_id && note.author_id === user?.id) return true;
    return can(role, PERMISSIONS.NOTE_UPDATE_ANY);
  }

  function canDeleteNote(note: LeadNote): boolean {
    if (note.author_id && note.author_id === user?.id) return true;
    return can(role, PERMISSIONS.NOTE_DELETE);
  }

  function setField<K extends keyof EditState>(key: K, value: EditState[K]) {
    setEdit((current) => (current ? { ...current, [key]: value } : current));
    setDirty(true);
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  const save = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      if (!record || !edit) return;

      const nextErrors: Record<string, string> = {};
      if (!edit.full_name.trim()) nextErrors.full_name = "Name is required.";
      if (edit.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(edit.email.trim()))
        nextErrors.email = "That doesn't look like an e-mail address.";
      if (edit.website.trim() && !/^https?:\/\/.+/i.test(edit.website.trim()))
        nextErrors.website = "Include https://";
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) return;

      setSaving(true);
      try {
        const payload = {
          full_name: edit.full_name.trim(),
          email: edit.email.trim() || null,
          phone: edit.phone.trim() || null,
          organization: edit.organization.trim() || null,
          job_title: edit.job_title.trim() || null,
          website: edit.website.trim() || null,
          source: edit.source,
          campaign: edit.campaign.trim() || null,
          status: edit.status,
          priority: edit.priority,
          assigned_to: edit.assigned_to || null,
          tags: edit.tags
            .split(",")
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean),
          next_follow_up_at: fromLocalInputValue(edit.next_follow_up_at),
        };

        const updated = await api.patch<Lead>(`/leads/${leadId}`, payload);
        lead.setData(updated);
        setEdit(toEditState(updated));
        setDirty(false);
        toast.success("Lead saved");
        void activity.refetch();
        void duplicates.refetch();
      } catch (error) {
        const fieldErrors = (error as { fieldErrors?: Record<string, string> }).fieldErrors;
        if (fieldErrors) setErrors(fieldErrors);
        toast.fromError(error, "Could not save this lead.");
      } finally {
        setSaving(false);
      }
    },
    [record, edit, leadId, lead, toast, activity, duplicates],
  );

  async function archiveToggle() {
    if (!record) return;
    try {
      const updated = record.archived_at
        ? await api.post<Lead>(`/leads/${leadId}/restore`)
        : await api.post<Lead>(`/leads/${leadId}/archive`);
      lead.setData(updated);
      setEdit(toEditState(updated));
      toast.success(record.archived_at ? "Lead restored" : "Lead archived");
    } catch (error) {
      toast.fromError(error, "Action failed.");
    }
  }

  async function hardDelete() {
    try {
      await api.delete(`/leads/${leadId}?hard=true`);
      toast.success("Lead permanently deleted");
      navigate("/crm/leads", { replace: true });
    } catch (error) {
      toast.fromError(error, "Could not delete this lead.");
    } finally {
      setConfirmDelete(false);
    }
  }

  async function addNote(event: FormEvent) {
    event.preventDefault();
    if (!noteBody.trim()) return;
    setNoteBusy(true);
    try {
      await api.post<LeadNote>(`/leads/${leadId}/notes`, { body: noteBody.trim() });
      setNoteBody("");
      toast.success("Note added");
      void notes.refetch();
      void activity.refetch();
    } catch (error) {
      toast.fromError(error, "Could not add the note.");
    } finally {
      setNoteBusy(false);
    }
  }

  async function deleteNote(noteId: string) {
    if (!window.confirm("Delete this note?")) return;
    try {
      await api.delete(`/leads/${leadId}/notes/${noteId}`);
      toast.success("Note deleted");
      void notes.refetch();
    } catch (error) {
      toast.fromError(error, "Could not delete the note.");
    }
  }

  if (lead.loading && !record) return <PageLoader label="Loading lead" />;

  if (lead.error && !record) {
    return (
      <div className="mx-auto max-w-6xl">
        <ErrorState
          title="Couldn't load this lead"
          description={lead.errorMessage ?? "It may have been deleted, or you may not have access."}
          onRetry={() => void lead.refetch()}
        />
        <div className="mt-4 text-center">
          <Link to="/crm/leads" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
            Back to all leads
          </Link>
        </div>
      </div>
    );
  }

  if (!record || !edit) return <PageLoader label="Loading lead" />;

  const memberOptions = members.data?.data ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to="/crm/leads"
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-2 shadow-xs transition hover:text-ink hover:bg-surface-2"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to leads
        </Link>
      </div>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span>{record.full_name}</span>
            <StatusBadge status={record.status} />
            <PriorityBadge priority={record.priority} />
            {record.archived_at ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                Archived
              </span>
            ) : null}
          </span>
        }
        subtitle={
          [
            record.organization,
            record.job_title,
            `${SOURCE_LABELS[record.source] ?? record.source}${record.campaign ? ` · ${record.campaign}` : ""}`,
          ]
            .filter(Boolean)
            .join(" · ") || "No company details yet"
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void archiveToggle()}
              disabled={!can(role, PERMISSIONS.LEAD_ARCHIVE) || !touchable}
            >
              {record.archived_at ? (
                <>
                  <ArchiveRestore className="size-4" aria-hidden /> Restore
                </>
              ) : (
                <>
                  <Archive className="size-4" aria-hidden /> Archive
                </>
              )}
            </Button>
            {can(role, PERMISSIONS.LEAD_DELETE) ? (
              <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" aria-hidden />
                Delete
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ------------------------------------------------------- edit panel */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Lead details"
            subtitle={
              canEdit
                ? dirty
                  ? "Unsaved changes exist"
                  : `Last updated ${formatRelative(record.updated_at)}`
                : canAnyEdit(role)
                  ? "You can only edit leads assigned to you or you created."
                  : "Your role has read-only access to lead details."
            }
            actions={
              canEdit && dirty ? (
                <Button variant="primary" size="sm" loading={saving} onClick={() => void save()} icon={<Save className="size-4" aria-hidden />}>
                  Save changes
                </Button>
              ) : null
            }
          />

          <form onSubmit={save} className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Full name" htmlFor="full_name" required error={errors.full_name}>
              <Input
                id="full_name"
                value={edit.full_name}
                invalid={Boolean(errors.full_name)}
                disabled={!canEdit}
                onChange={(e) => setField("full_name", e.target.value)}
              />
            </Field>

            <Field label="E-mail" htmlFor="email" error={errors.email}>
              <Input
                id="email"
                type="email"
                value={edit.email}
                invalid={Boolean(errors.email)}
                disabled={!canEdit}
                onChange={(e) => setField("email", e.target.value)}
                placeholder="not provided"
              />
            </Field>

            <Field label="Phone" htmlFor="phone" error={errors.phone}>
              <Input
                id="phone"
                type="tel"
                value={edit.phone}
                disabled={!canEdit}
                onChange={(e) => setField("phone", e.target.value)}
                placeholder="not provided"
              />
            </Field>

            <Field label="Company" htmlFor="organization">
              <Input
                id="organization"
                value={edit.organization}
                disabled={!canEdit}
                onChange={(e) => setField("organization", e.target.value)}
                placeholder="not provided"
              />
            </Field>

            <Field label="Job title" htmlFor="job_title">
              <Input
                id="job_title"
                value={edit.job_title}
                disabled={!canEdit}
                onChange={(e) => setField("job_title", e.target.value)}
                placeholder="not provided"
              />
            </Field>

            <Field label="Website" htmlFor="website" error={errors.website}>
              <Input
                id="website"
                type="url"
                value={edit.website}
                invalid={Boolean(errors.website)}
                disabled={!canEdit}
                onChange={(e) => setField("website", e.target.value)}
                placeholder="https://"
              />
            </Field>

            <Field label="Status" htmlFor="status">
              <Select
                id="status"
                value={edit.status}
                disabled={!canEdit}
                onChange={(e) => setField("status", e.target.value)}
              >
                {LEAD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Priority" htmlFor="priority">
              <Select
                id="priority"
                value={edit.priority}
                disabled={!canEdit}
                onChange={(e) => setField("priority", e.target.value)}
              >
                {LEAD_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Source" htmlFor="source">
              <Select
                id="source"
                value={edit.source}
                disabled={!canEdit}
                onChange={(e) => setField("source", e.target.value)}
              >
                {LEAD_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {SOURCE_LABELS[source]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Campaign" htmlFor="campaign" hint="Tracks which ad or channel produced this lead.">
              <Input
                id="campaign"
                value={edit.campaign}
                disabled={!canEdit}
                onChange={(e) => setField("campaign", e.target.value)}
                placeholder="e.g. spring-sale"
              />
            </Field>

            <Field label="Assignee" htmlFor="assigned_to">
              <Select
                id="assigned_to"
                value={edit.assigned_to}
                disabled={!canEdit || memberOptions.length === 0}
                onChange={(e) => setField("assigned_to", e.target.value)}
              >
                <option value="">Unassigned</option>
                {memberOptions.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {displayName(member.profile ?? null)}
                  </option>
                ))}
                {memberOptions.length === 0 && edit.assigned_to ? (
                  <option value={edit.assigned_to}>{displayName(record.assignee ?? null)}</option>
                ) : null}
              </Select>
            </Field>

            <Field
              label="Next follow-up"
              htmlFor="next_follow_up_at"
              hint={record.next_follow_up_at ? formatDue(record.next_follow_up_at) : "No follow-up scheduled"}
            >
              <Input
                id="next_follow_up_at"
                type="datetime-local"
                value={edit.next_follow_up_at}
                disabled={!canEdit}
                onChange={(e) => setField("next_follow_up_at", e.target.value)}
              />
            </Field>

            <Field
              label="Tags"
              htmlFor="tags"
              hint="Comma separated — e.g. vip, enterprise, uk"
              className="sm:col-span-2"
            >
              <Input
                id="tags"
                value={edit.tags}
                disabled={!canEdit}
                onChange={(e) => setField("tags", e.target.value)}
                placeholder="vip, enterprise"
              />
            </Field>

            <div className="sm:col-span-2">
              <Field label="Internal notes" htmlFor="lead-notes" hint="Visible to your team only.">
                <Textarea
                  id="lead-notes"
                  value={record.notes ?? ""}
                  disabled
                  readOnly
                  className="min-h-20 bg-surface-2"
                  placeholder="Notes added as entries appear in the timeline below."
                />
              </Field>
              <p className="mt-1.5 text-xs text-ink-3">
                Free-text lead notes are stored as the lead's first note — see the Notes tab to read
                and add more.
              </p>
            </div>

            {canEdit && dirty ? (
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    setEdit(toEditState(record));
                    setDirty(false);
                    setErrors({});
                  }}
                >
                  Discard
                </Button>
                <Button variant="primary" type="submit" loading={saving}>
                  Save changes
                </Button>
              </div>
            ) : null}
          </form>
        </Card>

        {/* ----------------------------------------------------- context panel */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Ownership" />
            <dl className="divide-y divide-line px-5 text-sm">
              <div className="flex items-center justify-between gap-3 py-3">
                <dt className="text-ink-3">Assigned to</dt>
                <dd className="flex items-center gap-2 font-medium text-ink">
                  {record.assignee ? (
                    <>
                      <Avatar name={record.assignee.full_name} email={record.assignee.email} size="xs" />
                      {displayName(record.assignee)}
                    </>
                  ) : (
                    "Unassigned"
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-3">
                <dt className="text-ink-3">Created by</dt>
                <dd className="font-medium text-ink">{displayName(record.creator ?? null)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-3">
                <dt className="text-ink-3">Created</dt>
                <dd className="font-medium text-ink">{formatDateTime(record.created_at)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-3">
                <dt className="text-ink-3">External ID</dt>
                <dd className="flex items-center gap-1 font-mono text-xs text-ink-2">
                  {record.external_id ? (
                    <>
                      <Link2 className="size-3.5" aria-hidden />
                      {record.external_id}
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
            {record.tags && record.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 border-t border-line px-5 py-3">
                {record.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-ink-2 ring-1 ring-line-strong"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Quick follow-up" />
            <div className="p-5">
              <p className="text-sm text-ink-2">
                {record.next_follow_up_at ? (
                  <>
                    Scheduled for <strong className="text-ink">{formatDue(record.next_follow_up_at)}</strong>
                  </>
                ) : (
                  "No follow-up scheduled for this lead yet."
                )}
              </p>
              <Link to={`/crm/follow-ups?lead=${record.id}`} className="mt-3 inline-block">
                <Button variant="secondary" size="sm">
                  <CalendarClock className="size-4" aria-hidden />
                  Manage follow-ups
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>

      {/* ------------------------------------------------------------ timeline */}
      <Card>
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-surface-2/40 px-4 pt-2.5">
          {(
            [
              { key: "activity", label: "Activity", icon: History },
              { key: "notes", label: `Notes (${notes.data?.length ?? 0})`, icon: StickyNote },
              { key: "duplicates", label: "Duplicates", icon: Link2 },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-all duration-150 ${
                  active
                    ? "border-brand-600 text-brand-700 bg-surface rounded-t-lg shadow-xs"
                    : "border-transparent text-ink-3 hover:text-ink hover:bg-surface/50 rounded-t-lg"
                }`}
              >
                <Icon className="size-3.5" aria-hidden />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === "activity" ? (
          activity.loading && !activity.data ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : activity.error && !activity.data ? (
            <ErrorState
              title="Couldn't load activity"
              description={activity.errorMessage}
              onRetry={() => void activity.refetch()}
            />
          ) : (activity.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={<History className="size-6" />}
              title="No activity yet"
              description="Status changes, reassignments and notes will appear here as this lead moves through the pipeline."
            />
          ) : (
            <ol className="divide-y divide-line/75">
              {activity.data!.map((entry) => (
                <li key={entry.id} className="flex gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2/40">
                  <Avatar name={entry.actor?.full_name} email={entry.actor?.email} size="xs" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-ink leading-relaxed">
                      <strong className="font-semibold text-ink-1">{displayName(entry.actor ?? null)}</strong> {describeAction(entry)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-4">{formatRelative(entry.created_at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )
        ) : null}

        {activeTab === "notes" ? (
          <>
            {can(role, PERMISSIONS.NOTE_CREATE) ? (
              <form onSubmit={addNote} className="border-b border-line bg-surface-2/30 p-5">
                <Field label="Add a note" htmlFor="new-note" hint="Visible to everyone in this company.">
                  <Textarea
                    id="new-note"
                    value={noteBody}
                    onChange={(event) => setNoteBody(event.target.value)}
                    placeholder="Called the prospect — they want a quote by Friday…"
                    maxLength={10_000}
                    className="min-h-24 bg-surface"
                  />
                </Field>
                <div className="mt-2.5 flex justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={noteBusy}
                    disabled={!noteBody.trim()}
                    icon={<MessageSquare className="size-3.5" aria-hidden />}
                  >
                    Add note
                  </Button>
                </div>
              </form>
            ) : null}

            {notes.loading && !notes.data ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : (notes.data?.length ?? 0) === 0 ? (
              <EmptyState
                icon={<StickyNote className="size-6" />}
                title="No notes yet"
                description={
                  can(role, PERMISSIONS.NOTE_CREATE)
                    ? "Write the first one above — it becomes part of this lead's history."
                    : "Your role can read notes but not add them."
                }
              />
            ) : (
              <ul className="divide-y divide-line/75">
                {notes.data!.map((note) => (
                  <li
                    key={note.id}
                    className={`px-5 py-4 transition-colors ${
                      note.is_pinned
                        ? "border-l-4 border-l-brand-500 bg-brand-50/20"
                        : "hover:bg-surface-2/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={note.author?.full_name} email={note.author?.email} size="xs" />
                        <span className="text-xs font-semibold text-ink">
                          {displayName(note.author ?? null)}
                        </span>
                        <span className="text-[11px] text-ink-3">{formatRelative(note.created_at)}</span>
                        {note.is_pinned ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700 ring-1 ring-brand-200">
                            <Pin className="size-2.5" aria-hidden /> Pinned
                          </span>
                        ) : null}
                      </div>
                      {/* Author-or-manager, exactly as the API and RLS decide it. */}
                      {canEditNote(note) || canDeleteNote(note) ? (
                        <div className="flex gap-1">
                          {canEditNote(note) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                void api
                                   .patch(`/leads/${leadId}/notes/${note.id}`, { is_pinned: !note.is_pinned })
                                   .then(() => void notes.refetch())
                                   .catch((error) => toast.fromError(error))
                              }
                              aria-label={note.is_pinned ? "Unpin note" : "Pin note"}
                            >
                              <Pin className="size-3.5" aria-hidden />
                            </Button>
                          ) : null}
                          {canDeleteNote(note) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void deleteNote(note.id)}
                              aria-label="Delete note"
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-xs text-ink-2 leading-relaxed">{note.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}

        {activeTab === "duplicates" ? (
          duplicates.loading && !duplicates.data ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : duplicates.error && !duplicates.data ? (
            <ErrorState
              title="Couldn't check for duplicates"
              description={duplicates.errorMessage}
              onRetry={() => void duplicates.refetch()}
            />
          ) : (duplicates.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={<Link2 className="size-6" />}
              title="No duplicates found"
              description="No other lead in this company matches on e-mail, external ID, or name + phone."
            />
          ) : (
            <ul className="divide-y divide-line">
              {duplicates.data!.map((dup) => (
                <li key={dup.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <Avatar name={dup.full_name} email={dup.email} size="sm" />
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/crm/leads/${dup.id}`}
                      className="block truncate text-sm font-semibold text-ink hover:text-brand-700"
                    >
                      {dup.full_name}
                    </Link>
                    <p className="truncate text-xs text-ink-3">
                      {dup.email || dup.phone || dup.organization || "—"}
                    </p>
                  </div>
                  <StatusBadge status={dup.status} />
                  <div className="flex flex-wrap gap-1">
                    {dup.match_on.map((match) => (
                      <span
                        key={match}
                        className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-[#b45309]"
                      >
                        matched on {match}
                      </span>
                    ))}
                  </div>
                  <Link to={`/crm/leads/${dup.id}`}>
                    <Button variant="outline" size="sm">
                      Open
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </Card>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Permanently delete this lead?"
        description={
          <>
            This removes <strong>{record.full_name}</strong> along with their notes, activity and
            follow-ups. It cannot be undone. Prefer keeping the history? Archive it instead.
          </>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={() => void archiveToggle()}>
              Archive instead
            </Button>
            <Button variant="danger" onClick={() => void hardDelete()}>
              Delete permanently
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          Only company owners can permanently delete a lead. Anyone else's delete keeps the row for
          reporting and hides it from every view.
        </p>
      </Modal>
    </div>
  );
}

function describeAction(entry: LeadActivity): string {
  const field = entry.field ? FIELD_LABELS[entry.field] ?? entry.field : null;
  switch (entry.action) {
    case "created":
      return "created this lead";
    case "status_changed":
      return `moved the status from ${entry.old_value ?? "?"} to ${entry.new_value ?? "?"}`;
    case "assigned":
      return `assigned this lead to ${entry.new_value ?? "nobody"}`;
    case "unassigned":
      return "removed the assignee";
    case "field_updated":
      return `updated ${field ?? "a field"}${
        entry.old_value || entry.new_value
          ? ` — ${entry.old_value ?? "empty"} → ${entry.new_value ?? "empty"}`
          : ""
      }`;
    case "archived":
      return "archived this lead";
    case "restored":
      return "restored this lead";
    case "note_added":
      return "added a note";
    case "follow_up_scheduled":
      return "scheduled a follow-up";
    default:
      return entry.action.replace(/_/g, " ");
  }
}
