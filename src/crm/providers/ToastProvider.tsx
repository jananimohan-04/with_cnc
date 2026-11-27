import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { ApiError } from "../lib/api";

type ToastKind = "success" | "error" | "info" | "warning";

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
  /** Optional inline action, e.g. "Undo" or "View". */
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id">) => number;
  success: (title: string, description?: string) => number;
  error: (title: string, description?: string) => number;
  info: (title: string, description?: string) => number;
  /** Convert any thrown value into a readable toast. Returns the toast id. */
  fromError: (error: unknown, fallback?: string) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastKind, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const STYLES: Record<ToastKind, string> = {
  success: "border-success/30 text-success",
  error: "border-danger/30 text-danger",
  info: "border-brand-200 text-brand-600",
  warning: "border-warning/40 text-warning",
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = nextId++;
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);
      // Errors stay until dismissed — a failure the user missed is worse than
      // one that lingers. Everything else auto-clears.
      if (toast.kind !== "error") {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), toast.kind === "success" ? 4000 : 6000),
        );
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      push,
      dismiss,
      success: (title, description) => push({ kind: "success", title, description }),
      error: (title, description) => push({ kind: "error", title, description }),
      info: (title, description) => push({ kind: "info", title, description }),
      fromError: (error, fallback = "Something went wrong.") => {
        if (error instanceof ApiError) {
          const fieldNotes = Object.entries(error.fieldErrors ?? {})
            .slice(0, 3)
            .map(([field, message]) => `${field}: ${message}`)
            .join(" · ");
          return push({
            kind: "error",
            title: error.message || fallback,
            description: fieldNotes || (error.requestId ? `Reference ${error.requestId}` : undefined),
          });
        }
        if (error instanceof Error) {
          return push({ kind: "error", title: error.message || fallback });
        }
        return push({ kind: "error", title: fallback });
      },
    }),
    [toasts, push, dismiss],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}

/** Renders the stacked region. Mounted once, near the root. */
export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
    >
      {toasts.map((toast) => {
        const Icon = ICONS[toast.kind];
        return (
          <div
            key={toast.id}
            role={toast.kind === "error" ? "alert" : "status"}
            className="animate-in pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-card border border-line bg-surface p-4 shadow-pop"
          >
            <Icon className={`mt-0.5 size-5 shrink-0 ${STYLES[toast.kind]}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{toast.title}</p>
              {toast.description ? (
                <p className="mt-1 text-sm break-words text-ink-2">{toast.description}</p>
              ) : null}
              {toast.action ? (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick();
                    dismiss(toast.id);
                  }}
                  className="mt-2 text-sm font-semibold text-brand-600 hover:text-brand-700"
                >
                  {toast.action.label}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="-m-1 rounded-md p-1 text-ink-3 transition hover:bg-surface-2 hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
