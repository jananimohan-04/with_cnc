import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Archive,
  ArchiveRestore,
  Download,
  Filter,
  Inbox,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { useAsync, useDebounced } from "../lib/hooks";
import { describeError } from "../lib/hooks";
import { useToast } from "../providers/ToastProvider";
import { useAuth } from "../providers/AuthProvider";
import { can, canAny, PERMISSIONS } from "../lib/permissions";
import {
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  PRIORITY_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  type Lead,
  type LeadPriority,
  type LeadStatus,
} from "../lib/types";
import {
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
import { Pagination, PageHeader, TableWrap, Td, Th } from "../components/ui/pagebits";
import { Modal } from "../components/ui/Modal";
import { displayName, formatRelative, fromLocalInputValue } from "../lib/format";

const VIEW_TABS = [
  { key: "active", label: "Active" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" },
] as const;

type ViewTab = (typeof VIEW_TABS)[number]["key"];
type SortField =
  | "created_at"
  | "updated_at"
  | "full_name"
  | "status"
  | "priority"
  | "next_follow_up_at"
  | "organization";

interface ListPayload {
  data: Lead[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

/** Every field `POST /leads` accepts for a new lead, as a form string. */
interface NewLeadDraft {
  full_name: string;
  email: string;
  phone: string;
  organization: string;
  job_title: string;
  website: string;
  source: string;
  campaign: string;
  status: LeadStatus;
  priority: LeadPriority;
  assigned_to: string;
  tags: string;
  notes: string;
  next_follow_up_at: string;
}

const EMPTY_NEW_LEAD: NewLeadDraft = {
  full_name: "",
  email: "",
  phone: "",
  organization: "",
  job_title: "",
  website: "",
  source: "manual",
  campaign: "",
  status: "new",
  priority: "medium",
  assigned_to: "",
  tags: "",
  notes: "",
  next_follow_up_at: "",
};

/**
 * Leads list.
 *
 * Filters, search, sort, paging and the view tab all live in the URL query
 * string, so a filtered view is shareable and survives a refresh. Bulk actions
 * are permission-gated twice — once here to hide the control, and again on the
 * server where a salesperson's rows are narrowed to their own.
 */
export default function Leads() {
  const { role, user } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkModal, setBulkModal] = useState<null | "assign" | "status">(null);
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkStatus, setBulkStatus] = useState<LeadStatus>("contacted");
  const [exporting, setExporting] = useState(false);

  // ---- URL-backed filter state -------------------------------------------
  const view = (searchParams.get("view") ?? "active") as ViewTab;
  const search = searchParams.get("q") ?? "";
  const sort = (searchParams.get("sort") ?? "created_at") as SortField;
  const order = (searchParams.get("order") ?? "desc") as "asc" | "desc";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("size") ?? 25) || 25));
  const statusFilter = searchParams.getAll("status");
  const priorityFilter = searchParams.getAll("priority");
  const sourceFilter = searchParams.getAll("source");
  const assignedFilter = searchParams.getAll("assigned_to");
  const followUpWindow = searchParams.get("follow_up") ?? "";

  const [searchDraft, setSearchDraft] = useState(search);
  const debouncedSearch = useDebounced(searchDraft, 350);

  const patchParams = useCallback(
    (patch: Record<string, string | string[] | null>, resetPage = true) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(patch)) {
            next.delete(key);
            if (value === null || value === "") continue;
            if (Array.isArray(value)) value.forEach((v) => v && next.append(key, v));
            else next.set(key, value);
          }
          if (resetPage && !("page" in patch)) next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Push the debounced search term into the URL as the user types.
  useEffect(() => {
    if (debouncedSearch !== search) patchParams({ q: debouncedSearch || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const query = useMemo(() => {
    const params: Record<string, unknown> = {
      page,
      page_size: pageSize,
      sort,
      order,
      view,
    };
    if (search) params.search = search;
    if (statusFilter.length) params.status = statusFilter;
    if (priorityFilter.length) params.priority = priorityFilter;
    if (sourceFilter.length) params.source = sourceFilter;
    // The assignee dropdown carries two UI-only sentinels. Translate them into
    // what the API really understands — a concrete user id, or the dedicated
    // `unassigned` flag — instead of sending "__me" as if it were a user id
    // (which would quietly match no rows).
    const realAssignees = assignedFilter.filter((v) => v !== "__me" && v !== "__none");
    if (assignedFilter.includes("__me") && user?.id) realAssignees.push(user.id);
    if (realAssignees.length) params.assigned_to = realAssignees;
    if (assignedFilter.includes("__none")) params.unassigned = true;
    if (followUpWindow) params.follow_up = followUpWindow;
    return params;
  }, [
    page, pageSize, sort, order, view, search,
    statusFilter, priorityFilter, sourceFilter, assignedFilter, followUpWindow, user?.id,
  ]);

  const leads = useAsync<ListPayload>(
    (signal) => api.get<ListPayload>("/leads", query, { signal }),
    [JSON.stringify(query)],
  );

  const members = useAsync<{ data: { user_id: string; profile?: { full_name?: string | null; email?: string | null } | null; role: string }[] }>(
    (signal) =>
      api.get("/members", undefined, { signal }) as Promise<
        { data: { user_id: string; profile?: { full_name?: string | null; email?: string | null } | null; role: string }[] }
      >,
    [],
    { enabled: can(role, PERMISSIONS.LEAD_BULK) },
  );

  // ---- create lead (opened by ?new=1 from the Dashboard, Pipeline and here) --
  const navigate = useNavigate();
  const newParam = searchParams.get("new");
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<NewLeadDraft>(EMPTY_NEW_LEAD);

  useEffect(() => {
    if (newParam === "1" && can(role, PERMISSIONS.LEAD_CREATE)) {
      setCreateErrors({});
      setDraft(EMPTY_NEW_LEAD);
      setCreateOpen(true);
    }
  }, [newParam, role]);

  function closeCreate() {
    setCreateOpen(false);
    setCreateErrors({});
    if (newParam !== null) patchParams({ new: null });
  }

  function setField<K extends keyof NewLeadDraft>(key: K, value: NewLeadDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setCreateErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function createLead() {
    const errors: Record<string, string> = {};
    if (!draft.full_name.trim()) errors.full_name = "A name is required.";
    if (draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()))
      errors.email = "That doesn't look like an e-mail address.";
    if (draft.website.trim() && !/^https?:\/\/.+\..+/i.test(draft.website.trim()))
      errors.website = "Include https://";
    setCreateErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setCreateBusy(true);
    try {
      const created = await api.post<Lead>("/leads", {
        full_name: draft.full_name.trim(),
        email: draft.email.trim() || null,
        phone: draft.phone.trim() || null,
        organization: draft.organization.trim() || null,
        job_title: draft.job_title.trim() || null,
        website: draft.website.trim() || null,
        source: draft.source,
        campaign: draft.campaign.trim() || null,
        status: draft.status,
        priority: draft.priority,
        assigned_to: draft.assigned_to || null,
        tags: draft.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        notes: draft.notes.trim() || null,
        next_follow_up_at: draft.next_follow_up_at
          ? fromLocalInputValue(draft.next_follow_up_at)
          : null,
      });

      closeCreate();
      toast.push({
        kind: "success",
        title: "Lead created",
        description: `${created.full_name} · ${STATUS_LABELS[created.status]}`,
        action: { label: "Open", onClick: () => navigate(`/crm/leads/${created.id}`) },
      });
      await leads.refetch();
    } catch (error) {
      const fieldErrors = (error as { fieldErrors?: Record<string, string> }).fieldErrors;
      if (fieldErrors) setCreateErrors(fieldErrors);
      toast.fromError(error, "Could not create the lead.");
    } finally {
      setCreateBusy(false);
    }
  }

  const rows = leads.data?.data ?? [];
  const pagination = leads.data?.pagination;
  const activeFilterCount =
    statusFilter.length +
    priorityFilter.length +
    sourceFilter.length +
    assignedFilter.length +
    (followUpWindow ? 1 : 0);

  // ---- selection ----------------------------------------------------------
  const allIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = allIds.some((id) => selected.has(id));

  function toggleSelect(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  // ---- sort ---------------------------------------------------------------
  function onSortClick(field: SortField) {
    if (sort === field) patchParams({ order: order === "asc" ? "desc" : "asc" });
    else patchParams({ sort: field, order: field === "full_name" || field === "organization" ? "asc" : "desc" });
  }

  function clearFilters() {
    setSearchDraft("");
    setSearchParams(
      (current) => {
        const next = new URLSearchParams();
        const v = current.get("view");
        if (v) next.set("view", v);
        return next;
      },
      { replace: true },
    );
  }

  // ---- bulk actions -------------------------------------------------------
  const bulkActions = [
    {
      key: "status",
      label: "Change status",
      allowed: canAny(role, PERMISSIONS.LEAD_UPDATE_ANY, PERMISSIONS.LEAD_UPDATE_OWN),
    },
    { key: "assign", label: "Assign to…", allowed: can(role, PERMISSIONS.LEAD_UPDATE_ANY) },
    { key: "archive", label: "Archive", allowed: can(role, PERMISSIONS.LEAD_ARCHIVE) },
    { key: "unarchive", label: "Restore", allowed: can(role, PERMISSIONS.LEAD_ARCHIVE) },
    { key: "tag", label: "Add tag", allowed: can(role, PERMISSIONS.LEAD_BULK) },
    { key: "delete", label: "Delete", allowed: can(role, PERMISSIONS.LEAD_DELETE) },
  ] as const;

  async function runBulk(action: string, extra: Record<string, unknown> = {}) {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const result = await api.post<{ requested: number; updated: number; skipped: string[] }>(
        "/leads/bulk",
        { action, lead_ids: [...selected], ...extra },
      );
      toast.success(
        `${result.updated} lead${result.updated === 1 ? "" : "s"} updated`,
        result.skipped.length
          ? `${result.skipped.length} skipped — you can only change leads assigned to you or you created.`
          : undefined,
      );
      setSelected(new Set());
      setBulkModal(null);
      await leads.refetch();
    } catch (error) {
      toast.fromError(error, "Bulk update failed.");
    } finally {
      setBulkBusy(false);
    }
  }

  // ---- CSV export ---------------------------------------------------------
  async function exportCsv() {
    setExporting(true);
    try {
      const query2: Record<string, unknown> = { ...query };
      delete query2.page;
      delete query2.page_size;
      delete query2.sort;
      delete query2.order;
      const csv = await api.get<string>("/leads/export", query2);
      const stamp = new Date().toISOString().slice(0, 10);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads-${view}-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded", "The file reflects the current filters.");
    } catch (error) {
      toast.fromError(error, "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  const memberOptions = members.data?.data ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Leads"
        subtitle={
          pagination
            ? `${pagination.total} lead${pagination.total === 1 ? "" : "s"} in this view`
            : "Loading…"
        }
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => void exportCsv()}
              loading={exporting}
              icon={<Download className="size-4" aria-hidden />}
            >
              Export CSV
            </Button>
            {can(role, PERMISSIONS.LEAD_IMPORT) ? (
              <Link to="/crm/leads/import">
                <Button variant="secondary" icon={<Upload className="size-4" aria-hidden />}>
                  Import CSV
                </Button>
              </Link>
            ) : null}
            {can(role, PERMISSIONS.LEAD_CREATE) ? (
              <Link to="/crm/leads?new=1">
                <Button variant="primary" icon={<Plus className="size-4" aria-hidden />}>
                  New lead
                </Button>
              </Link>
            ) : null}
          </>
        }
      />

      {/* ------------------------------------------------------------ view tabs */}
      {/* ------------------------------------------------------------ view tabs & search/filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex rounded-xl border border-line bg-surface-2/70 p-1 shadow-xs">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => patchParams({ view: tab.key })}
              aria-pressed={view === tab.key}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 ${
                view === tab.key
                  ? "bg-surface text-ink shadow-xs ring-1 ring-black/5"
                  : "text-ink-3 hover:text-ink hover:bg-surface/50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-4"
              aria-hidden
            />
            <Input
              id="global-search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search leads, emails, companies…"
              className="pl-9 pr-8 text-xs h-9 bg-surface"
              aria-label="Search leads"
            />
            {searchDraft ? (
              <button
                type="button"
                onClick={() => setSearchDraft("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-3 hover:text-ink"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </div>

          <Select
            aria-label="Filter by status"
            value={statusFilter[0] ?? ""}
            onChange={(event) => patchParams({ status: event.target.value ? [event.target.value] : null })}
            className="h-9 w-auto min-w-32 text-xs"
          >
            <option value="">Status: All</option>
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Filter by priority"
            value={priorityFilter[0] ?? ""}
            onChange={(event) => patchParams({ priority: event.target.value ? [event.target.value] : null })}
            className="h-9 w-auto min-w-28 text-xs"
          >
            <option value="">Priority: All</option>
            {LEAD_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Filter by source"
            value={sourceFilter[0] ?? ""}
            onChange={(event) => patchParams({ source: event.target.value ? [event.target.value] : null })}
            className="h-9 w-auto min-w-32 text-xs"
          >
            <option value="">Source: All</option>
            {LEAD_SOURCES.map((source) => (
              <option key={source} value={source}>
                {SOURCE_LABELS[source]}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Filter by follow-up"
            value={followUpWindow}
            onChange={(event) => patchParams({ follow_up: event.target.value || null })}
            className="h-9 w-auto min-w-32 text-xs"
          >
            <option value="">Follow-up: All</option>
            <option value="overdue">Overdue</option>
            <option value="today">Due today</option>
            <option value="upcoming">Upcoming</option>
            <option value="none">No follow-up</option>
          </Select>

          <Select
            aria-label="Filter by assignee"
            value={assignedFilter[0] ?? ""}
            onChange={(event) => patchParams({ assigned_to: event.target.value ? [event.target.value] : null })}
            className="h-9 w-auto min-w-36 text-xs"
          >
            <option value="">Assignee: All</option>
            <option value="__me">Assigned to me</option>
            <option value="__none">Unassigned</option>
            {memberOptions.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {displayName(member.profile ?? null)}
              </option>
            ))}
          </Select>

          {activeFilterCount > 0 || search ? (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-brand-600 hover:text-brand-700">
              <Filter className="size-3.5" aria-hidden />
              Reset {activeFilterCount > 0 ? `(${activeFilterCount})` : ""}
            </Button>
          ) : null}
        </div>
      </div>

      {/* -------------------------------------------------------- bulk action bar */}
      {selected.size > 0 ? (
        <div
          role="region"
          aria-label="Bulk actions"
          className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-brand-200/80 bg-brand-50/70 backdrop-blur-xs px-4 py-3 shadow-sm animate-scale-in"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-semibold text-white shadow-xs">
            {selected.size} selected
          </span>
          <div className="h-4 w-px bg-brand-200" aria-hidden />
          {bulkActions.map((action) =>
            action.allowed ? (
              <Button
                key={action.key}
                size="sm"
                variant={action.key === "delete" ? "danger" : "secondary"}
                onClick={() => {
                  if (action.key === "status") setBulkModal("status");
                  else if (action.key === "assign") setBulkModal("assign");
                  else if (action.key === "delete") {
                    if (window.confirm(`Permanently delete ${selected.size} lead(s)? This cannot be undone.`))
                      void runBulk("delete");
                  } else void runBulk(action.key);
                }}
                disabled={bulkBusy}
              >
                {action.key === "archive" ? <Archive className="size-3.5" aria-hidden /> : null}
                {action.key === "unarchive" ? <ArchiveRestore className="size-3.5" aria-hidden /> : null}
                {action.key === "delete" ? <Trash2 className="size-3.5" aria-hidden /> : null}
                {action.label}
              </Button>
            ) : null,
          )}
          <Button variant="ghost" size="sm" className="ml-auto text-ink-3 hover:text-ink text-xs" onClick={() => setSelected(new Set())}>
            Deselect all
          </Button>
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- table */}
      <Card>
        {leads.loading && !leads.data ? (
          <TableSkeleton rows={8} columns={6} />
        ) : leads.error && !leads.data ? (
          <ErrorState
            title="Couldn't load leads"
            description={describeError(leads.error)}
            onRetry={() => void leads.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Inbox className="size-6" />}
            title={search || activeFilterCount ? "No leads match these filters" : "No leads yet"}
            description={
              search || activeFilterCount
                ? "Try widening the search or clearing a filter."
                : "Add a lead manually, import a CSV, or connect a lead form to start filling your pipeline."
            }
            action={
              search || activeFilterCount ? (
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : can(role, PERMISSIONS.LEAD_CREATE) ? (
                <Link to="/crm/leads?new=1">
                  <Button variant="primary" size="sm">
                    <Plus className="size-4" aria-hidden />
                    Add a lead
                  </Button>
                </Link>
              ) : null
            }
          />
        ) : (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <Th className="w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = !allSelected && someSelected;
                      }}
                      onChange={toggleAll}
                      aria-label={allSelected ? "Deselect all rows" : "Select all rows"}
                      className="size-4 rounded border-line-strong accent-brand-600"
                    />
                  </Th>
                  <Th sortable active={sort === "full_name"} desc={order === "desc"} onSort={() => onSortClick("full_name")}>
                    Lead
                  </Th>
                  <Th sortable active={sort === "status"} desc={order === "desc"} onSort={() => onSortClick("status")}>
                    Status
                  </Th>
                  <Th sortable active={sort === "priority"} desc={order === "desc"} onSort={() => onSortClick("priority")}>
                    Priority
                  </Th>
                  <Th>Source</Th>
                  <Th>Assigned to</Th>
                  <Th sortable active={sort === "next_follow_up_at"} desc={order === "desc"} onSort={() => onSortClick("next_follow_up_at")}>
                    Next follow-up
                  </Th>
                  <Th sortable active={sort === "created_at"} desc={order === "desc"} onSort={() => onSortClick("created_at")}>
                    Created
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((lead) => {
                  const selectedRow = selected.has(lead.id);
                  const isOverdue = lead.next_follow_up_at && new Date(lead.next_follow_up_at) < new Date();
                  return (
                    <tr
                      key={lead.id}
                      className={`group border-b border-line/75 transition-colors duration-150 hover:bg-surface-2/70 ${
                        selectedRow ? "bg-brand-50/50" : ""
                      }`}
                    >
                      <Td>
                        <input
                          type="checkbox"
                          checked={selectedRow}
                          onChange={() => toggleSelect(lead.id)}
                          aria-label={`Select ${lead.full_name}`}
                          className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500/20"
                        />
                      </Td>
                      <Td>
                        <Link to={`/crm/leads/${lead.id}`} className="flex items-center gap-3 group/link">
                          <Avatar name={lead.full_name} email={lead.email} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-ink group-hover/link:text-brand-600 transition-colors">
                              {lead.full_name}
                            </span>
                            <span className="block truncate text-xs text-ink-3">
                              {lead.organization || lead.email || lead.phone || "—"}
                            </span>
                          </span>
                        </Link>
                      </Td>
                      <Td>
                        <StatusBadge status={lead.status} />
                      </Td>
                      <Td>
                        <PriorityBadge priority={lead.priority as LeadPriority} />
                      </Td>
                      <Td>
                        <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2 border border-line">
                          {SOURCE_LABELS[lead.source] ?? lead.source}
                        </span>
                        {lead.campaign ? (
                          <span className="block truncate text-[11px] text-ink-3 mt-0.5">{lead.campaign}</span>
                        ) : null}
                      </Td>
                      <Td>
                        {lead.assignee ? (
                          <span className="flex items-center gap-2">
                            <Avatar
                              name={lead.assignee.full_name}
                              email={lead.assignee.email}
                              size="xs"
                            />
                            <span className="truncate text-xs font-medium text-ink-2">
                              {displayName(lead.assignee)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-ink-4 italic">Unassigned</span>
                        )}
                      </Td>
                      <Td>
                        {lead.next_follow_up_at ? (
                          <span
                            className={`inline-flex items-center text-xs font-medium ${
                              isOverdue ? "text-rose-600 font-semibold" : "text-ink-2"
                            }`}
                          >
                            {formatRelative(lead.next_follow_up_at)}
                            {isOverdue ? <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-rose-500 bg-rose-50 px-1 py-0.2 rounded">Late</span> : null}
                          </span>
                        ) : (
                          <span className="text-xs text-ink-4">—</span>
                        )}
                      </Td>
                      <Td className="text-xs text-ink-3">{formatRelative(lead.created_at)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>

            {pagination ? (
              <Pagination
                page={pagination.page}
                pages={pagination.pages}
                total={pagination.total}
                pageSize={pagination.page_size}
                label="leads"
                onPage={(next) => patchParams({ page: String(next) }, false)}
                onPageSize={(size) => patchParams({ size: String(size) })}
              />
            ) : null}
          </>
        )}
      </Card>

      {/* ------------------------------------------------------------- bulk modals */}
      <Modal
        open={bulkModal === "status"}
        onClose={() => setBulkModal(null)}
        title={`Change status for ${selected.size} lead(s)`}
        description="Rows you're not allowed to edit are skipped, and reported back to you."
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkModal(null)} disabled={bulkBusy}>
              Cancel
            </Button>
            <Button variant="primary" loading={bulkBusy} onClick={() => void runBulk("status", { status: bulkStatus })}>
              Apply
            </Button>
          </>
        }
      >
        <label className="block text-sm font-semibold text-ink">
          New status
          <select
            data-autofocus
            value={bulkStatus}
            onChange={(event) => setBulkStatus(event.target.value as LeadStatus)}
            className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12"
          >
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
      </Modal>

      <Modal
        open={bulkModal === "assign"}
        onClose={() => setBulkModal(null)}
        title={`Assign ${selected.size} lead(s)`}
        description="Only active members of this company can be selected."
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkModal(null)} disabled={bulkBusy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={bulkBusy}
              disabled={!bulkAssignee}
              onClick={() =>
                void (bulkAssignee === "__clear"
                  ? runBulk("unassign")
                  : runBulk("assign", { assigned_to: bulkAssignee }))
              }
            >
              {bulkAssignee === "__clear" ? "Unassign" : "Assign"}
            </Button>
          </>
        }
      >
        <label className="block text-sm font-semibold text-ink">
          Team member
          <select
            data-autofocus
            value={bulkAssignee}
            onChange={(event) => setBulkAssignee(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12"
          >
            <option value="">Choose a teammate…</option>
            <option value="__clear">Unassign</option>
            {memberOptions.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {displayName(member.profile ?? null)} — {member.role}
              </option>
            ))}
          </select>
        </label>
        {members.error ? (
          <p className="mt-2 text-sm text-danger">Couldn't load the team list.</p>
        ) : null}
      </Modal>

      {/* -------------------------------------------------------- create lead */}
      <Modal
        open={createOpen}
        onClose={closeCreate}
        title="New lead"
        description="Saved straight to this company. Everything except the name is optional."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeCreate} disabled={createBusy}>
              Cancel
            </Button>
            <Button variant="primary" loading={createBusy} onClick={() => void createLead()}>
              Create lead
            </Button>
          </>
        }
      >
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void createLead();
          }}
        >
          <Field label="Name" htmlFor="new-name" required error={createErrors.full_name} className="sm:col-span-2">
            <Input
              id="new-name"
              data-autofocus
              value={draft.full_name}
              invalid={Boolean(createErrors.full_name)}
              onChange={(event) => setField("full_name", event.target.value)}
              placeholder="Ada Lovelace"
              maxLength={200}
            />
          </Field>

          <Field label="E-mail" htmlFor="new-email" error={createErrors.email}>
            <Input
              id="new-email"
              type="email"
              value={draft.email}
              invalid={Boolean(createErrors.email)}
              onChange={(event) => setField("email", event.target.value)}
              placeholder="ada@example.com"
            />
          </Field>

          <Field label="Phone" htmlFor="new-phone">
            <Input
              id="new-phone"
              type="tel"
              value={draft.phone}
              onChange={(event) => setField("phone", event.target.value)}
              placeholder="+44 20 7946 0000"
              maxLength={50}
            />
          </Field>

          <Field label="Company" htmlFor="new-organization">
            <Input
              id="new-organization"
              value={draft.organization}
              onChange={(event) => setField("organization", event.target.value)}
              placeholder="Analytical Engines Ltd"
              maxLength={200}
            />
          </Field>

          <Field label="Job title" htmlFor="new-job-title">
            <Input
              id="new-job-title"
              value={draft.job_title}
              onChange={(event) => setField("job_title", event.target.value)}
              placeholder="CTO"
              maxLength={200}
            />
          </Field>

          <Field label="Website" htmlFor="new-website" error={createErrors.website}>
            <Input
              id="new-website"
              type="url"
              value={draft.website}
              invalid={Boolean(createErrors.website)}
              onChange={(event) => setField("website", event.target.value)}
              placeholder="https://"
            />
          </Field>

          <Field label="Status" htmlFor="new-status">
            <Select
              id="new-status"
              value={draft.status}
              onChange={(event) => setField("status", event.target.value as LeadStatus)}
            >
              {LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Priority" htmlFor="new-priority">
            <Select
              id="new-priority"
              value={draft.priority}
              onChange={(event) => setField("priority", event.target.value as LeadPriority)}
            >
              {LEAD_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABELS[priority]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Source" htmlFor="new-source" hint="How this lead found you.">
            <Select
              id="new-source"
              value={draft.source}
              onChange={(event) => setField("source", event.target.value)}
            >
              {LEAD_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {SOURCE_LABELS[source]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Campaign" htmlFor="new-campaign">
            <Input
              id="new-campaign"
              value={draft.campaign}
              onChange={(event) => setField("campaign", event.target.value)}
              placeholder="spring-sale"
              maxLength={200}
            />
          </Field>

          <Field label="Assign to" htmlFor="new-assignee" hint="Left empty, it stays unassigned.">
            <Select
              id="new-assignee"
              value={draft.assigned_to}
              onChange={(event) => setField("assigned_to", event.target.value)}
            >
              <option value="">Unassigned</option>
              {memberOptions.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {displayName(member.profile ?? null)} — {member.role}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Next follow-up" htmlFor="new-follow-up" hint="Optional — schedules it too.">
            <Input
              id="new-follow-up"
              type="datetime-local"
              value={draft.next_follow_up_at}
              onChange={(event) => setField("next_follow_up_at", event.target.value)}
            />
          </Field>

          <Field label="Tags" htmlFor="new-tags" hint="Comma separated." className="sm:col-span-2">
            <Input
              id="new-tags"
              value={draft.tags}
              onChange={(event) => setField("tags", event.target.value)}
              placeholder="vip, enterprise"
            />
          </Field>

          <Field label="Notes" htmlFor="new-notes" className="sm:col-span-2">
            <Textarea
              id="new-notes"
              value={draft.notes}
              onChange={(event) => setField("notes", event.target.value)}
              placeholder="Context the team should see on this lead's timeline."
              maxLength={20000}
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
