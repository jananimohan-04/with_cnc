// Leads CRM "backend", running in the browser.
//
// The original Argus Leads app talked to a FastAPI server. Inside BI the same REST calls the pages make
// (api.get('/leads'), api.post('/follow-ups/1/complete') ...) are answered here instead, straight against the
// database with the signed-in person's session. Security is the database's job: every crm_* table has row
// security (supabase/migrations/20261202000000_leads_crm.sql) that applies the same role rules as the original;
// the role checks in the handlers only give clearer messages first.
//
// A handler gets the company context and the request, and returns exactly the JSON the FastAPI route returned.

import { supabase } from '@/lib/supabase';
import { ApiError } from '../lib/api';
import { can, type Permission } from '../lib/permissions';
import type { Pagination, Role } from '../lib/types';

export type Db = typeof supabase;

export interface Ctx {
  db: Db;
  /** BI company id (public.companies.id) */
  companyId: string;
  /** the signed-in person's auth user id (auth.uid()); leads.assigned_to / created_by etc. hold these */
  userId: string;
  role: Role;
}

export interface Req {
  /** path parameters, e.g. { lead_id: '...' } for '/leads/:lead_id' */
  params: Record<string, string>;
  query: URLSearchParams;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  formData?: FormData;
}

export type Handler = (ctx: Ctx, req: Req) => Promise<unknown>;

export interface Route {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** company-relative path pattern, e.g. '/leads/:lead_id/notes' (the pages call it without /companies/{id}) */
  path: string;
  handler: Handler;
}

/** crm_* table names (the original names without the prefix are in comments). */
export const T = {
  members: 'crm_members',
  leads: 'crm_leads',               // leads
  notes: 'crm_lead_notes',          // lead_notes
  activities: 'crm_lead_activities',// lead_activities
  followUps: 'crm_follow_ups',      // follow_ups
  notifications: 'crm_notifications',
  imports: 'crm_csv_imports',       // csv_imports
  settings: 'crm_settings',         // company_settings
} as const;

/** Throw the same error envelope the FastAPI app used. */
export function fail(status: number, code: string, message: string, details?: Record<string, unknown>): never {
  throw new ApiError(status, { code, message, details } as never);
}

export const notFound = (what = 'Resource'): never => fail(404, 'not_found', `${what} not found.`);
export const forbidden = (message = 'You do not have permission to do this.'): never => fail(403, 'forbidden', message);
export const invalid = (message: string, fields?: { field: string; message: string }[]): never =>
  fail(422, 'validation_error', message, fields ? { fields } : undefined);

export function requirePerm(ctx: Ctx, perm: Permission, message?: string): void {
  if (!can(ctx.role, perm)) forbidden(message);
}

/** Turn a database error into the API's error envelope. */
export function dbError(error: { code?: string; message?: string; details?: string } | null | undefined): never {
  const code = error?.code ?? '';
  const message = error?.message ?? 'Database error.';
  if (code === '42501' || /row-level security|permission denied/i.test(message)) fail(403, 'forbidden', 'You do not have permission to do this.');
  if (code === '23505') fail(409, 'conflict', 'This record already exists.', { db: message });
  if (code === '23514' || code === '22023' || code === '22P02' || code === '23502') fail(422, 'validation_error', message);
  if (code === 'P0002' || code === 'PGRST116') fail(404, 'not_found', message);
  fail(500, 'internal_error', message);
}

/** data from a supabase-js result, or throw the matching API error. */
export function must<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) dbError(res.error as { code?: string; message?: string });
  return res.data as T;
}

// ------------------------------------------------------------------ pagination (same envelope as the API)
export const MAX_PAGE_SIZE = 200;

export function pageParams(query: URLSearchParams, defaultSize = 25) {
  const page = Math.max(1, parseInt(query.get('page') || '1', 10) || 1);
  const page_size = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(query.get('page_size') || String(defaultSize), 10) || defaultSize));
  const from = (page - 1) * page_size;
  return { page, page_size, from, to: from + page_size - 1 };
}

export function pageResult<T>(data: T[], total: number, page: number, page_size: number): { data: T[]; pagination: Pagination } {
  const pages = Math.max(1, Math.ceil(total / page_size));
  return { data, pagination: { page, page_size, total, pages, has_next: page < pages, has_prev: page > 1 } };
}

// ------------------------------------------------------------------ people (BI users of the company)
export interface Person {
  /** auth user id */
  id: string;
  company_user_id: string;
  full_name: string;
  email: string | null;
  bi_role: string;
  /** Leads CRM role, null = no CRM access */
  role: Role | null;
  has_signed_in: boolean;
}

const peopleCache = new Map<string, { at: number; list: Promise<Person[]> }>();

/** The company's people with their CRM role (cached for 30 s; clearPeople() after a role change). */
export function people(ctx: Pick<Ctx, 'db' | 'companyId'>): Promise<Person[]> {
  const hit = peopleCache.get(ctx.companyId);
  if (hit && Date.now() - hit.at < 30_000) return hit.list;
  const list = (async () => {
    const { data, error } = await ctx.db.rpc('crm_people', { p_company_id: ctx.companyId });
    if (error) dbError(error);
    return ((data ?? []) as { user_id: string | null; company_user_id: string; full_name: string; email: string | null; bi_role: string; role: Role | null; has_signed_in: boolean }[])
      .filter((p) => p.user_id)
      .map((p) => ({ ...p, id: p.user_id as string }));
  })();
  peopleCache.set(ctx.companyId, { at: Date.now(), list });
  list.catch(() => peopleCache.delete(ctx.companyId));
  return list;
}

export function clearPeople(companyId?: string) {
  if (companyId) peopleCache.delete(companyId); else peopleCache.clear();
}

/** { id, email, full_name, avatar_url } for an auth user id, as the API attached to rows. */
export async function personRef(ctx: Ctx, id: string | null | undefined) {
  if (!id) return null;
  const p = (await people(ctx)).find((x) => x.id === id);
  return p ? { id: p.id, email: p.email, full_name: p.full_name, avatar_url: null } : { id, email: null, full_name: null, avatar_url: null };
}

/** Map of auth user id -> PersonRef, for expanding many rows at once. */
export async function personMap(ctx: Ctx) {
  const map = new Map<string, { id: string; email: string | null; full_name: string; avatar_url: null }>();
  for (const p of await people(ctx)) map.set(p.id, { id: p.id, email: p.email, full_name: p.full_name, avatar_url: null });
  return map;
}

/** Is this auth user a CRM member of the company (any role)? Used to validate assignees. */
export async function isMember(ctx: Ctx, userId: string): Promise<boolean> {
  return (await people(ctx)).some((p) => p.id === userId && !!p.role);
}

// ------------------------------------------------------------------ small helpers
export const nowIso = () => new Date().toISOString();

/** Escape a value for use inside a PostgREST or() / ilike filter. */
export const pgLike = (s: string) => s.replace(/[%_\\]/g, (c) => '\\' + c).replace(/[,()]/g, ' ');

export function asBool(v: string | null): boolean | undefined {
  if (v === null || v === '') return undefined;
  return v === 'true' || v === '1' || v === 'yes';
}

/** Insert a notification for a colleague (best effort: never fails the main action). */
export async function notify(ctx: Ctx, n: { user_id: string; type: string; title: string; body?: string | null; link?: string | null; metadata?: Record<string, unknown> }) {
  if (!n.user_id || n.user_id === ctx.userId) return;
  await ctx.db.from(T.notifications).insert({ company_id: ctx.companyId, ...n, metadata: n.metadata ?? {} });
}
