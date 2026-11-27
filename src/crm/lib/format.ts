import type { LeadPriority, LeadStatus } from "./types";
import { PRIORITY_LABELS, STATUS_LABELS } from "./types";

/** Parse an ISO timestamp defensively; returns null rather than "Invalid Date". */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  const date = parseDate(value);
  if (!date) return "—";
  return date.toLocaleDateString(undefined, opts ?? { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "—";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "—";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** "just now" / "4m ago" / "3h ago" / "12 Mar". Never says "NaN". */
export function formatRelative(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "—";
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 0) return formatDateTime(value);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(value);
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export type DueKind = "overdue" | "today" | "upcoming" | "none";

export function dueKind(value: string | null | undefined): DueKind {
  const date = parseDate(value);
  if (!date) return "none";
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date < today) return "overdue";
  if (date < tomorrow) return "today";
  return "upcoming";
}

/** Human phrasing for a follow-up date: "Overdue", "Today 14:30", "12 Mar". */
export function formatDue(value: string | null | undefined): string {
  const kind = dueKind(value);
  if (kind === "none") return "No follow-up";
  const date = parseDate(value)!;
  if (kind === "overdue") {
    const days = Math.floor((startOfDay(new Date()).getTime() - startOfDay(date).getTime()) / 86_400_000);
    if (days <= 0) return `Overdue · ${formatTime(value)}`;
    if (days === 1) return "Overdue by 1 day";
    return `Overdue by ${days} days`;
  }
  if (kind === "today") return `Today · ${formatTime(value)}`;
  return formatDate(value);
}

export function statusLabel(status: LeadStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function priorityLabel(priority: LeadPriority): string {
  return PRIORITY_LABELS[priority] ?? priority;
}

export function initials(name: string | null | undefined, email?: string | null): string {
  const source = (name ?? "").trim() || (email ?? "").split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic hue for an avatar / chart segment, so a person never changes colour. */
export function hueFor(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return hash % 360;
}

export function displayName(person: { full_name?: string | null; email?: string | null } | null | undefined): string {
  if (!person) return "Unassigned";
  return person.full_name?.trim() || person.email || "Unknown";
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : pluralForm ?? `${singular}s`}`;
}

/** CSV cell escaping per RFC 4180, used client-side for the browser download path. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = Array.isArray(value) ? value.join(", ") : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return lines.join("\r\n");
}

/** Trigger a file download without touching the DOM permanently. */
export function downloadFile(filename: string, content: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Convert an ISO timestamp into the value a `<input type="datetime-local">` expects. */
export function toLocalInputValue(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Inverse of :func:`toLocalInputValue` — local wall time as an ISO instant. */
export function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
