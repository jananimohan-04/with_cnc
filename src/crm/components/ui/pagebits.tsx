import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

/** Shared page-level furniture: headings, stat tiles, filter bars, tables. */

export function PageHeader({
  title,
  subtitle,
  actions,
  badge,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
            {title}
          </h1>
          {badge && <div className="shrink-0">{badge}</div>}
        </div>
        {subtitle ? <p className="mt-1 text-sm text-ink-2 leading-relaxed">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div> : null}
    </div>
  );
}

const TONES = {
  neutral: {
    text: "text-ink",
    iconBg: "bg-slate-100 text-slate-600 ring-slate-200",
  },
  success: {
    text: "text-emerald-600",
    iconBg: "bg-emerald-50 text-emerald-600 ring-emerald-200",
  },
  danger: {
    text: "text-rose-600",
    iconBg: "bg-rose-50 text-rose-600 ring-rose-200",
  },
  warning: {
    text: "text-amber-600",
    iconBg: "bg-amber-50 text-amber-600 ring-amber-200",
  },
  brand: {
    text: "text-brand-600",
    iconBg: "bg-brand-50 text-brand-600 ring-brand-200",
  },
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: keyof typeof TONES;
}) {
  const cfg = TONES[tone] ?? TONES.neutral;
  return (
    <div className="rounded-2xl border border-line/90 bg-surface p-5.5 shadow-card card-hover-lift flex flex-col justify-between">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-3">{label}</p>
        {icon ? (
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${cfg.iconBg} shadow-2xs`}>
            {icon}
          </span>
        ) : null}
      </div>
      <div className="mt-3">
        <p className={`font-display text-3xl sm:text-3.5xl font-extrabold tracking-tight ${cfg.text}`}>
          {value}
        </p>
        {hint ? <p className="mt-1.5 text-xs text-ink-3 font-medium">{hint}</p> : null}
      </div>
    </div>
  );
}

/** Horizontal scroll container that keeps tables readable with subtle border & shadow. */
export function TableWrap({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-line/90 bg-surface shadow-card ${className}`}>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          {children}
        </table>
      </div>
    </div>
  );
}

export function Th({
  children,
  sortable,
  active,
  desc,
  onSort,
  className = "",
}: {
  children: ReactNode;
  sortable?: boolean;
  active?: boolean;
  desc?: boolean;
  onSort?: () => void;
  className?: string;
}) {
  const content = (
    <span className="inline-flex items-center gap-1.5 select-none">
      {children}
      {sortable ? (
        <span aria-hidden className={active ? "text-brand-600" : "text-ink-3/70"}>
          {active ? (
            desc ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />
          ) : (
            <ArrowUpDown className="size-3.5" />
          )}
        </span>
      ) : null}
    </span>
  );

  if (!sortable) {
    return (
      <th
        scope="col"
        className={`border-b border-line/80 bg-slate-50/70 px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-ink-3 ${className}`}
      >
        {content}
      </th>
    );
  }

  return (
    <th scope="col" className={`border-b border-line/80 bg-slate-50/70 px-5 py-3.5 ${className}`}>
      <button
        type="button"
        onClick={onSort}
        aria-label={`Sort by ${typeof children === "string" ? children : "this column"}`}
        className={`text-xs font-bold uppercase tracking-wider transition hover:text-ink cursor-pointer ${
          active ? "text-brand-600 font-extrabold" : "text-ink-3"
        }`}
      >
        {content}
      </button>
    </th>
  );
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`px-5 py-3.5 align-middle border-b border-line/50 transition-colors ${className}`}>{children}</td>;
}

/** Pagination footer shared by every list endpoint's UI. */
export function Pagination({
  page,
  pages,
  total,
  pageSize,
  onPage,
  onPageSize,
  label = "results",
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
  label?: string;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/80 bg-slate-50/50 px-5 py-3.5">
      <p className="text-xs font-medium text-ink-3">
        {total === 0 ? `No ${label}` : `Showing ${from}–${to} of ${total} ${label}`}
      </p>

      <div className="flex items-center gap-4">
        {onPageSize ? (
          <label className="flex items-center gap-2 text-xs font-medium text-ink-3">
            <span className="whitespace-nowrap">Show:</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSize(Number(event.target.value))}
              className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs text-ink font-semibold focus:border-brand-500 focus:outline-none cursor-pointer"
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink-2 transition hover:bg-slate-50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            <ChevronLeft className="size-3.5" />
            Previous
          </button>
          <span className="px-2 text-xs font-semibold text-ink-3">
            {page} of {Math.max(1, pages)}
          </span>
          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={page >= pages}
            aria-label="Next page"
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink-2 transition hover:bg-slate-50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            Next
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
