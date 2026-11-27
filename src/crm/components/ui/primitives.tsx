import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import type { LeadPriority, LeadStatus, Role } from "../../lib/types";
import { PRIORITY_LABELS, ROLE_LABELS, STATUS_LABELS } from "../../lib/types";

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-brand-600 to-brand-700 text-white shadow-sm hover:from-brand-700 hover:to-brand-800 hover:shadow-brand-500/20 hover:shadow-md active:from-brand-800 active:to-brand-900 disabled:from-brand-300 disabled:to-brand-300 disabled:shadow-none",
  secondary:
    "bg-surface text-ink border border-line shadow-xs hover:bg-slate-50 hover:border-line-strong active:bg-slate-100 disabled:text-ink-3 disabled:border-line disabled:bg-surface",
  outline:
    "border border-line-strong bg-transparent text-ink hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 disabled:text-ink-3",
  ghost:
    "text-ink-2 hover:bg-slate-100/80 hover:text-ink active:bg-slate-200/80 disabled:text-ink-3",
  danger:
    "bg-gradient-to-r from-rose-600 to-rose-700 text-white shadow-sm hover:from-rose-700 hover:to-rose-800 hover:shadow-rose-600/20 hover:shadow-md active:from-rose-800 active:to-rose-900 disabled:opacity-50 disabled:shadow-none",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs font-semibold gap-1.5 rounded-lg",
  md: "h-9.5 px-4 text-sm font-semibold gap-2 rounded-xl",
  lg: "h-11 px-5 text-base font-semibold gap-2.5 rounded-xl",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  /** Full width, for forms and mobile stacks. */
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, icon, block, className = "", children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        "inline-flex items-center justify-center font-semibold select-none transition-all duration-150 cursor-pointer",
        "active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 disabled:opacity-60",
        VARIANTS[variant],
        SIZES[size],
        block ? "w-full" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin shrink-0" aria-hidden />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      {children}
    </button>
  );
});

/* -------------------------------------------------------------------------- */
/* Field wrappers                                                              */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className = "",
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  /** Layout class for the wrapper (e.g. grid column spans). */
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="block text-xs font-bold uppercase tracking-wider text-ink-2">
        {label}
        {required ? <span className="ml-1 text-danger font-bold" aria-hidden>*</span> : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-danger animate-in" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

const CONTROL =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2 text-sm text-ink placeholder:text-ink-3 " +
  "transition-all duration-150 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 " +
  "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-ink-3 shadow-xs";

function controlClass(error: boolean, className: string): string {
  return [CONTROL, error ? "border-danger/80 focus:border-danger focus:ring-danger/15 text-danger" : "", className]
    .filter(Boolean)
    .join(" ");
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ invalid, className = "", ...rest }, ref) {
    return <input ref={ref} aria-invalid={invalid || undefined} className={controlClass(Boolean(invalid), className)} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ invalid, className = "", ...rest }, ref) {
    return <textarea ref={ref} aria-invalid={invalid || undefined} className={controlClass(Boolean(invalid), `${className} min-h-24`)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ invalid, className = "", children, ...rest }, ref) {
    return (
      <select ref={ref} aria-invalid={invalid || undefined} className={controlClass(Boolean(invalid), `${className} pr-8 cursor-pointer`)} {...rest}>
        {children}
      </select>
    );
  },
);

/* -------------------------------------------------------------------------- */
/* Badges                                                                      */
/* -------------------------------------------------------------------------- */

const STATUS_CONFIG: Record<LeadStatus, { bg: string; text: string; dot: string; ring: string }> = {
  new: { bg: "bg-slate-100", text: "text-slate-700", dot: "bg-slate-500", ring: "ring-slate-300/80" },
  contacted: { bg: "bg-sky-50", text: "text-sky-700", dot: "bg-sky-500", ring: "ring-sky-200" },
  follow_up: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", ring: "ring-amber-200" },
  qualified: { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500", ring: "ring-purple-200" },
  proposal: { bg: "bg-pink-50", text: "text-pink-700", dot: "bg-pink-500", ring: "ring-pink-200" },
  converted: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", ring: "ring-emerald-200" },
  lost: { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500", ring: "ring-rose-200" },
};

export function StatusBadge({ status, className = "" }: { status: LeadStatus; className?: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.new;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cfg.bg} ${cfg.text} ${cfg.ring} ${className}`}
    >
      <span className={`size-1.5 rounded-full ${cfg.dot}`} aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}

const PRIORITY_CONFIG: Record<LeadPriority, { bg: string; text: string; ring: string }> = {
  low: { bg: "bg-slate-100", text: "text-slate-600", ring: "ring-slate-200" },
  medium: { bg: "bg-sky-50", text: "text-sky-700", ring: "ring-sky-200" },
  high: { bg: "bg-amber-50", text: "text-amber-800", ring: "ring-amber-200" },
  urgent: { bg: "bg-rose-50", text: "text-rose-700", ring: "ring-rose-200" },
};

export function PriorityBadge({ priority, className = "" }: { priority: LeadPriority; className?: string }) {
  const cfg = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.medium;
  return (
    <span
      className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${cfg.bg} ${cfg.text} ${cfg.ring} ${className}`}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

const ROLE_CONFIG: Record<Role, { bg: string; text: string; ring: string }> = {
  owner: { bg: "bg-indigo-50", text: "text-indigo-700", ring: "ring-indigo-200" },
  admin: { bg: "bg-purple-50", text: "text-purple-700", ring: "ring-purple-200" },
  manager: { bg: "bg-sky-50", text: "text-sky-700", ring: "ring-sky-200" },
  salesperson: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200" },
  viewer: { bg: "bg-slate-100", text: "text-slate-600", ring: "ring-slate-200" },
};

export function RoleBadge({ role, className = "" }: { role: Role; className?: string }) {
  const cfg = ROLE_CONFIG[role] ?? ROLE_CONFIG.viewer;
  return (
    <span className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cfg.bg} ${cfg.text} ${cfg.ring} ${className}`}>
      {ROLE_LABELS[role]}
    </span>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  className?: string;
}) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700 ring-slate-200",
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    warning: "bg-amber-50 text-amber-800 ring-amber-200",
    danger: "bg-rose-50 text-rose-700 ring-rose-200",
    info: "bg-sky-50 text-sky-700 ring-sky-200",
  } as const;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Card / Panel                                                                */
/* -------------------------------------------------------------------------- */

export function Card({
  children,
  className = "",
  as: Tag = "section",
  hoverLift = false,
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
  hoverLift?: boolean;
}) {
  return (
    <Tag
      className={[
        "rounded-2xl border border-line/90 bg-surface shadow-card transition-all duration-200",
        hoverLift ? "card-hover-lift" : "",
        className,
      ].join(" ")}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  className = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`flex flex-wrap items-start justify-between gap-3 border-b border-line/80 px-6 py-4.5 ${className}`}>
      <div className="min-w-0">
        <h2 className="font-display text-base font-bold text-ink tracking-tight">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* States: loading / empty / error                                            */
/* -------------------------------------------------------------------------- */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-3.5 p-6" role="status" aria-label="Loading">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 items-center">
          {Array.from({ length: columns }).map((__, c) => (
            <Skeleton key={c} className={`h-4.5 rounded-lg ${c === 0 ? "w-44" : "flex-1"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-16 text-center animate-in ${className}`}>
      {icon ? (
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-50 to-slate-100 text-brand-600 ring-1 ring-brand-200/60 shadow-xs">
          {icon}
        </div>
      ) : null}
      <h3 className="font-display text-base font-bold text-ink">{title}</h3>
      {description ? <p className="mt-1.5 max-w-sm text-sm text-ink-2">{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  className = "",
}: {
  title?: string;
  description?: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-16 text-center animate-in ${className}`}>
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-200 shadow-xs">
        <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="font-display text-base font-bold text-ink">{title}</h3>
      {description ? <p className="mt-1.5 max-w-md text-sm text-ink-2">{description}</p> : null}
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-6" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Modern branded loader */
export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3" role="status">
      <div className="relative flex size-10 items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-brand-200 animate-ping opacity-25" />
        <Loader2 className="size-7 animate-spin text-brand-600" aria-hidden />
      </div>
      <span className="text-xs font-semibold text-ink-3 tracking-wide">{label}…</span>
    </div>
  );
}

