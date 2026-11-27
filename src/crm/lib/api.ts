import type { ApiErrorBody, ListResponse, Pagination, Role } from "./types";
import { supabase } from "./supabase";

// Inside BI there is no Leads server: the same REST calls the pages make (api.get('/leads') ...) are answered in
// the browser by the handlers in ../backend, straight against the database with the signed-in person's session
// (row security enforces every rule). See ../backend/core.ts.

export class ApiError extends Error {
  status: number;
  code: string;
  details: ApiErrorBody["details"];
  requestId?: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message || "Request failed.");
    this.name = "ApiError";
    this.status = status;
    this.code = body.code ?? "error";
    this.details = body.details;
    this.requestId = body.request_id;
  }

  /** Field-level messages, if any. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const item of this.details?.fields ?? []) {
      out[item.field] = item.message;
    }
    return out;
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  /** Multipart upload; `body` must be a FormData instance. */
  formData?: FormData;
  signal?: AbortSignal;
  /** Kept for the pages' calls; every route runs in the BI company context. */
  withCompany?: boolean;
}

function buildParams(query?: Record<string, unknown>, extra?: string): URLSearchParams {
  const params = new URLSearchParams(extra ?? "");
  if (!query) return params;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== "") params.append(key, String(item));
      }
    } else {
      params.append(key, String(value));
    }
  }
  return params;
}

/** The active company id (BI's company, set by the AuthProvider). */
export const COMPANY_STORAGE_KEY = "argus.crm.company_id";

let session: { companyId: string | null; role: Role | null } = { companyId: null, role: null };

/** Called by the AuthProvider whenever BI's company or the person's CRM role changes. */
export function setCrmSession(next: { companyId: string | null; role: Role | null }) {
  session = next;
}

export function getStoredCompanyId(): string | null {
  return session.companyId;
}

export function setStoredCompanyId(id: string | null): void {
  session = { ...session, companyId: id };
}

function matchPath(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split("/").filter(Boolean);
  const b = path.split("/").filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, formData, signal } = options;
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const [rawPath, rawQuery] = path.split("?");
  const cleanPath = "/" + rawPath.replace(/^\/+|\/+$/g, "");
  const params = buildParams(query, rawQuery);

  const { data: auth } = await supabase.auth.getSession();
  const userId = auth.session?.user.id;
  if (!userId) throw new ApiError(401, { code: "unauthenticated", message: "Your BI session has ended. Sign in again." } as ApiErrorBody);
  if (!session.companyId || !session.role) {
    throw new ApiError(403, { code: "forbidden", message: "You do not have access to the Leads CRM in this company." } as ApiErrorBody);
  }

  const { routes } = await import("../backend/routes");
  for (const route of routes) {
    if (route.method !== method.toUpperCase()) continue;
    const found = matchPath(route.path, cleanPath);
    if (!found) continue;
    try {
      const result = await route.handler(
        { db: supabase, companyId: session.companyId, userId, role: session.role },
        { params: found, query: params, body: formData ? undefined : body, formData },
      );
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return result as T;
    } catch (err) {
      if (err instanceof ApiError || (err as Error)?.name === "AbortError") throw err;
      const message = (err as Error)?.message ?? String(err);
      if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
        throw new NetworkError("Could not reach the database. Check your internet connection.");
      }
      throw new ApiError(500, { code: "internal_error", message } as ApiErrorBody);
    }
  }
  throw new ApiError(404, { code: "not_found", message: `Not available here: ${method.toUpperCase()} ${cleanPath}` } as ApiErrorBody);
}

/** Convenience wrappers — same calls the pages make. */
export const api = {
  get: <T>(path: string, query?: RequestOptions["query"], opts?: RequestOptions) =>
    apiFetch<T>(path, { ...opts, method: "GET", query }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiFetch<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiFetch<T>(path, { ...opts, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiFetch<T>(path, { ...opts, method: "PUT", body }),
  delete: <T>(path: string, opts?: RequestOptions) =>
    apiFetch<T>(path, { ...opts, method: "DELETE" }),
  upload: <T>(path: string, formData: FormData, query?: RequestOptions["query"]) =>
    apiFetch<T>(path, { method: "POST", formData, query }),
};

export function isListResponse<T>(value: unknown): value is ListResponse<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as ListResponse<T>).data) &&
    typeof (value as ListResponse<T>).pagination === "object"
  );
}

export const emptyPagination: Pagination = {
  page: 1,
  page_size: 25,
  total: 0,
  pages: 1,
  has_next: false,
  has_prev: false,
};
