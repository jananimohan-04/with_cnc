import { Link, useSearchParams } from "react-router-dom";
import { Bell, BellOff, CheckCheck, Inbox, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useAsync } from "../lib/hooks";
import { useToast } from "../providers/ToastProvider";
import type { AppNotification } from "../lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  TableSkeleton,
} from "../components/ui/primitives";
import { PageHeader, Pagination } from "../components/ui/pagebits";
import { formatRelative } from "../lib/format";

const TYPE_TONES: Record<AppNotification["type"], "neutral" | "success" | "warning" | "danger" | "info"> = {
  system: "neutral",
  assignment: "info",
  follow_up: "warning",
  mention: "info",
  integration: "neutral",
  team: "info",
  lead: "success",
};

interface ListPayload {
  data: AppNotification[];
  pagination: { page: number; page_size: number; total: number; pages: number };
  unread_total: number;
}

/**
 * Notifications for the signed-in user only — the API cannot return anyone
 * else's rows, so there is no filter to get wrong here.
 */
export default function Notifications() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const unreadOnly = searchParams.get("unread") === "1";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);

  const query = { unread_only: unreadOnly || undefined, page, page_size: 20 };

  const list = useAsync<ListPayload>(
    (signal) => api.get<ListPayload>("/notifications", query, { signal }),
    [unreadOnly, page],
  );

  const setParam = (patch: Record<string, string | null>, resetPage = true) => {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          params.delete(key);
          if (value) params.set(key, value);
        }
        if (resetPage) params.delete("page");
        return params;
      },
      { replace: true },
    );
  };

  async function markRead(notification: AppNotification) {
    if (notification.read_at) return;
    // Optimistic: the row is personal, so a failure here is a network failure.
    list.setData((current) =>
      current
        ? {
            ...current,
            data: current.data.map((n) =>
              n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n,
            ),
            unread_total: Math.max(0, current.unread_total - 1),
          }
        : current,
    );
    try {
      await api.post(`/notifications/${notification.id}/read`);
    } catch (error) {
      toast.fromError(error, "Couldn't mark that as read.");
      void list.refetch();
    }
  }

  async function markAllRead() {
    try {
      await api.post("/notifications/read-all");
      toast.success("All caught up");
      await list.refetch();
    } catch (error) {
      toast.fromError(error, "Couldn't mark everything as read.");
    }
  }

  async function remove(notification: AppNotification) {
    try {
      await api.delete(`/notifications/${notification.id}`);
      toast.success("Notification deleted");
      await list.refetch();
    } catch (error) {
      toast.fromError(error, "Couldn't delete that notification.");
    }
  }

  const rows = list.data?.data ?? [];
  const unread = list.data?.unread_total ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Notifications"
        subtitle={
          list.loading
            ? "Loading…"
            : unread > 0
              ? `${unread} unread · ${list.data?.pagination.total ?? 0} total`
              : `${list.data?.pagination.total ?? 0} notification${(list.data?.pagination.total ?? 0) === 1 ? "" : "s"}`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={unreadOnly ? "primary" : "secondary"}
              size="sm"
              aria-pressed={unreadOnly}
              onClick={() => setParam({ unread: unreadOnly ? null : "1" })}
              icon={<BellOff className="size-4" aria-hidden />}
            >
              {unreadOnly ? "Showing unread" : "Unread only"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={unread === 0}
              onClick={() => void markAllRead()}
              icon={<CheckCheck className="size-4" aria-hidden />}
            >
              Mark all read
            </Button>
          </div>
        }
      />

      <Card>
        {list.loading && !list.data ? (
          <TableSkeleton rows={6} columns={3} />
        ) : list.error && !list.data ? (
          <ErrorState
            title="Couldn't load notifications"
            description={list.errorMessage}
            onRetry={() => void list.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Bell className="size-6" />}
            title={unreadOnly ? "No unread notifications" : "Nothing here yet"}
            description={
              unreadOnly
                ? "You have read everything. Switch back to see the history."
                : "Assignments, due follow-ups, team changes and integration events show up here as they happen."
            }
            action={
              unreadOnly ? (
                <Button variant="outline" size="sm" onClick={() => setParam({ unread: null })}>
                  Show everything
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {rows.map((notification) => {
                const isUnread = !notification.read_at;
                return (
                  <li
                    key={notification.id}
                    className={`flex gap-3 px-5 py-4 transition hover:bg-surface-2 ${
                      isUnread ? "bg-brand-50/40" : ""
                    }`}
                  >
                    <span
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${
                        isUnread ? "bg-brand-500" : "bg-line-strong"
                      }`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">{notification.title}</p>
                        <Badge tone={TYPE_TONES[notification.type] ?? "neutral"}>{notification.type}</Badge>
                        {isUnread ? <Badge tone="info">Unread</Badge> : null}
                      </div>
                      {notification.body ? (
                        <p className="mt-1 text-sm text-ink-2">{notification.body}</p>
                      ) : null}
                      <p className="mt-1.5 text-xs text-ink-3">{formatRelative(notification.created_at)}</p>
                    </div>

                    <div className="flex shrink-0 items-start gap-1.5">
                      {notification.link ? (
                        <Link
                          to={notification.link.startsWith("/crm") ? notification.link : `/crm${notification.link}`}
                          onClick={() => void markRead(notification)}
                          className="rounded-md px-2 py-1 text-sm font-semibold text-brand-600 hover:bg-surface"
                        >
                          Open
                        </Link>
                      ) : !isUnread ? null : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void markRead(notification)}
                          aria-label={`Mark "${notification.title}" as read`}
                        >
                          <Inbox className="size-3.5" aria-hidden />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void remove(notification)}
                        aria-label={`Delete "${notification.title}"`}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <Pagination
              page={list.data!.pagination.page}
              pages={list.data!.pagination.pages}
              total={list.data!.pagination.total}
              pageSize={list.data!.pagination.page_size}
              label="notifications"
              onPage={(next) => setParam({ page: String(next) }, false)}
            />
          </>
        )}
      </Card>
    </div>
  );
}
