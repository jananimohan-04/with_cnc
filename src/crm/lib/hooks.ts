import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, NetworkError } from "../lib/api";
import { useToast } from "../providers/ToastProvider";
import { useAuth } from "../providers/AuthProvider";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: unknown;
  /** Message safe to render: API message, network message, or null. */
  errorMessage: string | null;
  refetch: () => Promise<void>;
  setData: (updater: T | ((current: T | null) => T | null)) => void;
}

interface Options {
  /** Skip the fetch (e.g. no company selected yet). */
  enabled?: boolean;
  /** Surface a toast when the initial load fails. Default false — the page
   *  usually renders an inline error state instead, which is less noisy. */
  toastOnError?: boolean;
}

/**
 * Small data-fetching hook used by every page.
 *
 * Behaviour that matters:
 *  - stale responses are discarded when the company (or deps) change, so
 *    switching company never paints the previous tenant's numbers;
 *  - `setData` supports an updater so concurrent mutations don't clobber;
 *  - errors are normalised to a human message, distinguishing "the API said
 *    no" (ApiError) from "the API is unreachable" (NetworkError).
 */
export function useAsync<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  options: Options = {},
): AsyncState<T> {
  const { enabled = true, toastOnError = false } = options;
  const toast = useToast();
  const { companyId } = useAuth();

  const [data, setDataState] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<unknown>(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const requestId = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current(controller.signal);
      if (id !== requestId.current || !mounted.current) return; // stale
      setDataState(result);
      setError(null);
    } catch (err) {
      if (id !== requestId.current || !mounted.current) return;
      if ((err as Error)?.name === "AbortError") return;
      setError(err);
      if (toastOnError) toast.fromError(err, "Could not load this page.");
    } finally {
      if (id === requestId.current && mounted.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, toastOnError, ...deps]);

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, companyId]);

  const setData = useCallback((updater: T | ((current: T | null) => T | null)) => {
    setDataState((current) =>
      typeof updater === "function" ? (updater as (c: T | null) => T | null)(current) : updater,
    );
  }, []);

  const errorMessage = error ? describeError(error) : null;

  return { data, loading, error, errorMessage, refetch: run, setData };
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const fieldNotes = Object.entries(error.fieldErrors ?? {})
      .slice(0, 3)
      .map(([field, message]) => `${field}: ${message}`)
      .join(" · ");
    return fieldNotes ? `${error.message} (${fieldNotes})` : error.message;
  }
  if (error instanceof NetworkError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

/** Debounce a rapidly-changing value (search boxes). */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Boolean toggle with a stable setter, for modals and drawers.
 *
 * The second element is an *explicit* setter that also accepts a value:
 * `setOpen(true)` / `setOpen(false)` set the state, `setOpen()` flips it, and
 * `onClick={setOpen}` still flips it (the click event is not a boolean). This
 * avoids the classic footgun where `setOpen(false)` merely flips the flag and
 * silently re-opens a dialog that was already closed.
 */
export function useToggle(initial = false): [boolean, (next?: boolean) => void, (value: boolean) => void] {
  const [value, setValue] = useState(initial);
  const toggle = useCallback(
    (next?: boolean) => setValue((current) => (typeof next === "boolean" ? next : !current)),
    [],
  );
  const set = useCallback((next: boolean) => setValue(next), []);
  return [value, toggle, set];
}
