import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, X } from "lucide-react";
import { Button } from "./primitives";

/**
 * Accessible modal dialog.
 *
 * Implements the bits that matter: focus is moved into the dialog on open and
 * restored to the trigger on close, Escape closes, clicking the backdrop
 * closes, focus is trapped inside while open, and background scrolling is
 * locked. Rendered in a portal so it is never clipped by an ancestor.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  closeOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  closeOnBackdrop?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const sizes = {
    sm: "max-w-md",
    md: "max-w-xl",
    lg: "max-w-3xl",
    xl: "max-w-5xl",
  } as const;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!open) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const root = dialogRef.current;
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [open, onClose],
  );

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the first meaningful control, or the dialog itself.
    const raf = requestAnimationFrame(() => {
      const root = dialogRef.current;
      if (!root) return;
      const target =
        root.querySelector<HTMLElement>("[data-autofocus]") ??
        root.querySelector<HTMLElement>(
          'input:not([type="hidden"]), textarea, select, button:not([aria-label="Close"])',
        );
      (target ?? root).focus();
    });

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity animate-in" aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`animate-scale-in relative w-full ${sizes[size]} rounded-2xl border border-line bg-surface shadow-pop outline-none my-auto`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line/80 px-6 py-5">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-ink tracking-tight">{title}</h2>
            {description ? <p className="mt-1 text-xs text-ink-2 leading-relaxed">{description}</p> : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-1.5 -mt-1.5 rounded-xl p-2 text-ink-3 transition-colors hover:bg-slate-100 hover:text-ink cursor-pointer"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>
        <div className="px-6 py-5 max-h-[calc(85vh-130px)] overflow-y-auto scroll-thin">{children}</div>
        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2.5 border-t border-line/80 bg-slate-50/80 px-6 py-4 rounded-b-2xl">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Confirmation dialog for destructive actions.
 *
 * When `confirmText` is given the user must type it exactly — used for the
 * genuinely irreversible ones (deleting a company, permanently deleting a
 * lead), mirroring the backend's own confirmation requirement.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  confirmText,
  tone = "danger",
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  /** When set, the user must type this string to enable the confirm button. */
  confirmText?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
}) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  const satisfied = !confirmText || typed.trim() === confirmText.trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      closeOnBackdrop={!loading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={() => void onConfirm()}
            disabled={!satisfied}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3.5 items-start">
        {tone === "danger" ? (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-200">
            <AlertCircle className="size-5" aria-hidden />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          {description ? <div className="text-sm text-ink-2 leading-relaxed">{description}</div> : null}
          {confirmText ? (
            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-2">
                Type <code className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-rose-700 font-semibold ring-1 ring-slate-200">{confirmText}</code> to confirm:
              </span>
              <input
                data-autofocus
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                className="w-full rounded-xl border border-line bg-surface px-3.5 py-2 text-sm text-ink focus:border-rose-500 focus:outline-none focus:ring-4 focus:ring-rose-500/15"
                autoComplete="off"
              />
            </label>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
