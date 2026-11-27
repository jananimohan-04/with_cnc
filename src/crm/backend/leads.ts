// Leads CRM inside BI: lead CRUD, kanban moves, bulk actions, CSV import/export, notes and activity
// (originally backend/app/routers/leads.py with services/lead_query.py, services/csv_import.py and services/related.py).
//
// Every query runs with the signed-in person's session, so row security (crm_* policies) is the real guard; the role
// checks below give the same early messages the FastAPI routes gave. Activity rows for created / status / assignment /
// archive changes are written by database triggers, exactly as in the original.

import { can, PERMISSIONS, type Permission } from '../lib/permissions';
import {
  dbError, fail, nowIso, pageResult, personMap, isMember, T,
  type Ctx, type Req, type Route,
} from './core';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** A database row (crm_* tables are not in a generated Database type). */
type Row = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

// ====================================================================== constants (lead_query.py / csv_import.py)
const LEAD_COLUMNS =
  'id, company_id, full_name, email, phone, organization, job_title, website, ' +
  'source, campaign, external_id, status, priority, assigned_to, created_by, ' +
  'tags, notes, sort_order, next_follow_up_at, archived_at, deleted_at, ' +
  'created_at, updated_at';

const SORTABLE = [
  'created_at', 'updated_at', 'full_name', 'status', 'priority',
  'next_follow_up_at', 'sort_order', 'organization', 'email',
];

const LEAD_SOURCES = [
  'facebook', 'instagram', 'linkedin', 'website_form', 'csv_import',
  'manual', 'referral', 'email', 'phone', 'event', 'other',
] as const;
const LEAD_STATUSES = ['new', 'contacted', 'follow_up', 'qualified', 'proposal', 'converted', 'lost'] as const;
const LEAD_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const BULK_ACTIONS = ['status', 'assign', 'unassign', 'priority', 'archive', 'unarchive', 'delete', 'tag', 'untag'] as const;

const MAX_PAGE_SIZE = 200;          // settings.max_page_size
const CSV_MAX_ROWS = 20_000;        // settings.csv_max_rows
const CSV_UPLOAD_MAX_BYTES = 5 * 1024 * 1024; // settings.csv_upload_max_bytes

const NOTE_COLUMNS = 'id, lead_id, company_id, author_id, body, is_pinned, created_at, updated_at';

// ====================================================================== errors (errors.py / rbac.py)
interface FieldError { field: string; message: string }

/** Collects pydantic-style field errors; throws the same 422 envelope as RequestValidationError. */
class Check {
  errors: FieldError[] = [];
  add(field: string, message: string) { this.errors.push({ field, message }); }
  get ok() { return this.errors.length === 0; }
  done(): void {
    if (this.errors.length) fail(422, 'validation_error', 'Some of the submitted values are invalid.', { fields: this.errors });
  }
}

/** ctx.require(...) in deps.py: passes when the role holds any of the permissions. */
function need(ctx: Ctx, ...perms: Permission[]): void {
  if (perms.some((p) => can(ctx.role, p))) return;
  fail(403, 'forbidden', `Your role (${ctx.role || 'none'}) does not allow this action.`, {
    required_permissions: perms, role: ctx.role,
  });
}

/** rbac.may_touch_lead */
function mayTouchLead(ctx: Ctx, lead: Row): boolean {
  if (can(ctx.role, PERMISSIONS.LEAD_UPDATE_ANY)) return true;
  if (!can(ctx.role, PERMISSIONS.LEAD_UPDATE_OWN)) return false;
  return lead.assigned_to === ctx.userId || lead.created_by === ctx.userId;
}

function checkCanTouch(ctx: Ctx, lead: Row): void {
  if (!mayTouchLead(ctx, lead)) {
    fail(403, 'forbidden', `As a ${ctx.role} you can only change leads assigned to you or that you created.`, {
      lead_id: lead.id, role: ctx.role,
    });
  }
}

/** translate_supabase_error, for the cases where it worded things differently from core.dbError. */
function dbFail(error: { code?: string; message?: string; details?: string } | null | undefined): never {
  const code = error?.code ?? '';
  const message = error?.message ?? '';
  if (code === '23505' || /duplicate key|already exists/i.test(message)) {
    const lower = message.toLowerCase();
    const friendly = lower.includes('external_id')
      ? 'This lead has already been imported from that source (duplicate external id).'
      : lower.includes('email') ? 'That e-mail address is already in use.' : 'That record already exists.';
    fail(409, 'conflict', friendly, { database_code: code });
  }
  if (code === '23503') fail(422, 'validation_error', 'The referenced record does not exist or is not available.', { database_code: code });
  if (code === '23514') fail(422, 'validation_error', 'The submitted values are not allowed by the database schema.', { database_code: code });
  return dbError(error);
}

function run<D>(res: { data: D | null; error: unknown }): D {
  if (res.error) dbFail(res.error as { code?: string; message?: string });
  return res.data as D;
}

// ====================================================================== pydantic-like value checks
const strLen = (s: string) => [...s].length;
const isObj = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const has = (o: Row, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function literalMessage(values: readonly string[]): string {
  const q = values.map((v) => `'${v}'`);
  return `Input should be ${q.slice(0, -1).join(', ')} or ${q[q.length - 1]}`;
}

function bodyObject(c: Check, body: unknown): Row {
  if (body === undefined || body === null) { c.add('body', 'Field required'); c.done(); }
  if (!isObj(body)) { c.add('body', 'Input should be a valid dictionary or object to extract fields from'); c.done(); }
  return body as Row;
}

function vStr(c: Check, field: string, v: unknown, o: { min?: number; max?: number; nullable?: boolean } = {}): string | null | undefined {
  if (v === null && o.nullable) return null;
  if (typeof v !== 'string') { c.add(field, 'Input should be a valid string'); return undefined; }
  const n = strLen(v);
  if (o.min !== undefined && n < o.min) c.add(field, `String should have at least ${o.min} character${o.min === 1 ? '' : 's'}`);
  if (o.max !== undefined && n > o.max) c.add(field, `String should have at most ${o.max} characters`);
  return v;
}

function vLiteral<L extends string>(c: Check, field: string, v: unknown, allowed: readonly L[], nullable = false): L | null | undefined {
  if (v === null && nullable) return null;
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) { c.add(field, literalMessage(allowed)); return undefined; }
  return v as L;
}

function vBool(c: Check, field: string, v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (v === 0 || v === 1) return v === 1;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['1', 'true', 't', 'yes', 'y', 'on'].includes(s)) return true;
    if (['0', 'false', 'f', 'no', 'n', 'off'].includes(s)) return false;
  }
  c.add(field, 'Input should be a valid boolean');
  return undefined;
}

function vNumber(c: Check, field: string, v: unknown, o: { ge?: number; le?: number } = {}): number | undefined {
  let n: number | undefined;
  if (typeof v === 'number' && Number.isFinite(v)) n = v;
  else if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) n = Number(v);
  if (n === undefined) { c.add(field, 'Input should be a valid number'); return undefined; }
  if (o.ge !== undefined && n < o.ge) c.add(field, `Input should be greater than or equal to ${o.ge}`);
  if (o.le !== undefined && n > o.le) c.add(field, `Input should be less than or equal to ${o.le}`);
  return n;
}

/** EmailStr | None with the "blank string -> None" before-validator. Returns the normalised address. */
function vEmail(c: Check, field: string, v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== 'string') { c.add(field, 'Input should be a valid string'); return undefined; }
  if (!v.trim()) return null;
  const text = v.trim();
  const reason = (() => {
    const at = text.split('@');
    if (at.length < 2) return 'An email address must have an @-sign.';
    if (at.length > 2 || /\s/.test(text) || !at[0]) return 'The email address is not valid.';
    if (!at[1].includes('.') || at[1].startsWith('.') || at[1].endsWith('.')) return 'The part after the @-sign is not valid. It should have a period.';
    return null;
  })();
  if (reason) { c.add(field, `value is not a valid email address: ${reason}`); return undefined; }
  const [local, domain] = text.split('@');
  return `${local}@${domain.toLowerCase()}`;
}

const ISO_DT = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/** datetime | None. Returns an ISO string the database accepts. */
function vDateTime(c: Check, field: string, v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    // pydantic: unix seconds, or milliseconds when the number is very large
    const ms = Math.abs(v) > 2e10 ? v : v * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof v === 'string' && ISO_DT.test(v.trim()) && !Number.isNaN(Date.parse(v.trim().replace(' ', 'T').replace(',', '.')))) {
    return v.trim();
  }
  c.add(field, 'Input should be a valid datetime');
  return undefined;
}

/** LeadBase._normalise_tags */
function vTags(c: Check, field: string, v: unknown): string[] | undefined {
  if (v === null || v === undefined) return [];
  let list: unknown[];
  if (typeof v === 'string') list = v.replace(/;/g, ',').split(',');
  else if (Array.isArray(v)) list = v;
  else { c.add(field, 'Value error, tags must be a list of strings'); return undefined; }
  const seen: string[] = [];
  for (const item of list) {
    const tag = String(item).trim().toLowerCase();
    if (!tag) continue;
    if (strLen(tag) > 60) { c.add(field, 'Value error, tags must be 60 characters or fewer'); return undefined; }
    if (!seen.includes(tag)) seen.push(tag);
  }
  if (seen.length > 50) { c.add(field, 'Value error, at most 50 tags are allowed'); return undefined; }
  return seen;
}

/** full_name with the strip / not-blank before-validator. */
function vFullName(c: Check, v: unknown, nullable: boolean): string | null | undefined {
  if (v === null && nullable) return null;
  if (typeof v === 'string') {
    const text = v.trim();
    if (!text) { c.add('full_name', 'Value error, full_name must not be blank'); return undefined; }
    return vStr(c, 'full_name', text, { min: nullable ? undefined : 1, max: 200 });
  }
  c.add('full_name', 'Input should be a valid string');
  return undefined;
}

// ---- query parameters (FastAPI coercion; loc "query.<name>")
function qInt(c: Check, q: URLSearchParams, name: string, def: number, o: { ge?: number; le?: number } = {}): number {
  const raw = q.get(name);
  if (raw === null || raw === '') return def;
  if (!/^\s*[+-]?\d+\s*$/.test(raw)) { c.add(`query.${name}`, 'Input should be a valid integer, unable to parse string as an integer'); return def; }
  const n = parseInt(raw, 10);
  if (o.ge !== undefined && n < o.ge) c.add(`query.${name}`, `Input should be greater than or equal to ${o.ge}`);
  if (o.le !== undefined && n > o.le) c.add(`query.${name}`, `Input should be less than or equal to ${o.le}`);
  return n;
}

function qBool(c: Check, q: URLSearchParams, name: string): boolean | undefined {
  const raw = q.get(name);
  if (raw === null || raw === '') return undefined;
  const s = raw.trim().toLowerCase();
  if (['1', 'true', 't', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'f', 'no', 'n', 'off'].includes(s)) return false;
  c.add(`query.${name}`, 'Input should be a valid boolean, unable to interpret input');
  return undefined;
}

const qList = (q: URLSearchParams, name: string) => q.getAll(name).filter((v) => v);
const qStr = (q: URLSearchParams, name: string) => q.get(name) ?? undefined;

// ====================================================================== lead query (lead_query.py)
interface LeadFilters {
  search?: string;
  status: string[];
  priority: string[];
  source: string[];
  campaign?: string;
  assigned_to: string[];
  created_by?: string;
  tags: string[];
  view: string;
  follow_up?: string;
  created_from?: string;
  created_to?: string;
  unassigned?: boolean;
}

function emptyFilters(view = 'active'): LeadFilters {
  return { status: [], priority: [], source: [], assigned_to: [], tags: [], view };
}

/** sanitise_search */
function sanitiseSearch(term: string): string {
  return term.replace(/["\\,()%]|\s+/g, ' ').trim().slice(0, 120);
}

/** quote(): a double-quoted PostgREST literal. */
const pgQuote = (value: unknown) => `"${String(value).replace(/"/g, '').replace(/\\/g, '')}"`;

function leadSelect(ctx: Ctx, columns: string, count: boolean) {
  return ctx.db.from(T.leads).select(columns, count ? { count: 'exact' } : undefined);
}
type LeadQuery = ReturnType<typeof leadSelect>;

/** _apply_follow_up: date windows in UTC, as the API computed them. */
function applyFollowUp(q: LeadQuery, window: string | undefined): LeadQuery {
  if (!window) return q;
  const now = new Date();
  const startToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endToday = new Date(startToday.getTime() + 86_400_000);
  const w = window.toLowerCase();
  if (w === 'overdue') return q.not('next_follow_up_at', 'is', null).lt('next_follow_up_at', startToday.toISOString());
  if (w === 'today') return q.gte('next_follow_up_at', startToday.toISOString()).lt('next_follow_up_at', endToday.toISOString());
  if (w === 'upcoming') return q.gte('next_follow_up_at', endToday.toISOString());
  if (w === 'none') return q.is('next_follow_up_at', null);
  return fail(422, 'validation_error', 'follow_up must be one of: overdue, today, upcoming, none.', { value: w });
}

/** build_lead_query */
function applyLeadFilters(ctx: Ctx, q: LeadQuery, f: LeadFilters): LeadQuery {
  q = q.eq('company_id', ctx.companyId);
  const view = (f.view || 'active').toLowerCase();
  if (view === 'archived') q = q.not('archived_at', 'is', null);
  else if (view !== 'all') q = q.is('archived_at', null).is('deleted_at', null);

  if (f.search) {
    const term = sanitiseSearch(f.search);
    if (term) {
      const pattern = `*${term}*`;
      q = q.or(['full_name', 'email', 'phone', 'organization', 'job_title', 'campaign'].map((col) => `${col}.ilike.${pattern}`).join(','));
    }
  }
  if (f.status.length) q = q.in('status', f.status);
  if (f.priority.length) q = q.in('priority', f.priority);
  if (f.source.length) q = q.in('source', f.source);
  if (f.campaign) q = q.eq('campaign', f.campaign);
  if (f.assigned_to.length) q = q.in('assigned_to', f.assigned_to);
  if (f.created_by) q = q.eq('created_by', f.created_by);
  if (f.unassigned === true) q = q.is('assigned_to', null);
  else if (f.unassigned === false) q = q.not('assigned_to', 'is', null);
  if (f.tags.length) q = q.contains('tags', f.tags);
  if (f.view !== 'archived') q = applyFollowUp(q, f.follow_up);
  if (f.created_from) q = q.gte('created_at', f.created_from);
  if (f.created_to) q = q.lte('created_at', f.created_to);
  return q;
}

interface Paging { page: number; page_size: number; sort: string; order: 'asc' | 'desc' }

/** make_pagination */
function makePagination(page: number, pageSize: number, sort: string, order: string): Paging {
  if (page < 1) fail(422, 'validation_error', 'page must be >= 1.', { page });
  if (pageSize < 1) fail(422, 'validation_error', 'page_size must be >= 1.', { page_size: pageSize });
  const orderNorm = order.trim().toLowerCase();
  if (orderNorm !== 'asc' && orderNorm !== 'desc') fail(422, 'validation_error', "order must be 'asc' or 'desc'.", { order });
  const sortNorm = (sort || 'created_at').trim();
  if (!SORTABLE.includes(sortNorm)) fail(422, 'validation_error', `Cannot sort by '${sortNorm}'.`, { allowed: [...SORTABLE].sort() });
  return { page, page_size: Math.min(pageSize, MAX_PAGE_SIZE), sort: sortNorm, order: orderNorm as 'asc' | 'desc' };
}

/** fetch_leads */
async function fetchLeads(ctx: Ctx, f: LeadFilters, p: Paging): Promise<{ rows: Row[]; total: number }> {
  const from = (p.page - 1) * p.page_size;
  const res = await applyLeadFilters(ctx, leadSelect(ctx, LEAD_COLUMNS, true), f)
    .order(p.sort, { ascending: p.order === 'asc' })
    .order('id', { ascending: true }) // deterministic tie-breaker so paging never skips or repeats a row
    .range(from, Math.max(from + p.page_size - 1, 0));
  if (res.error) dbFail(res.error);
  return { rows: ((res.data ?? []) as unknown as Row[]).filter(isObj), total: res.count ?? 0 };
}

/** fetch_all_leads (CSV export) */
async function fetchAllLeads(ctx: Ctx, f: LeadFilters, limit: number): Promise<Row[]> {
  const out: Row[] = [];
  const batch = 500;
  let offset = 0;
  while (out.length < Math.min(limit, CSV_MAX_ROWS)) {
    const res = await applyLeadFilters(ctx, leadSelect(ctx, LEAD_COLUMNS, false), f)
      .order('created_at', { ascending: true })
      .range(offset, offset + batch - 1);
    if (res.error) dbFail(res.error);
    const chunk = (res.data ?? []) as unknown as Row[];
    if (!chunk.length) break;
    out.push(...chunk);
    if (chunk.length < batch) break;
    offset += batch;
  }
  return out.slice(0, limit);
}

/** find_existing_duplicates */
async function findExistingDuplicates(
  ctx: Ctx,
  o: { email?: string | null; phone?: string | null; full_name?: string | null; external_id?: string | null; exclude_lead_id?: string },
): Promise<Row[]> {
  const conditions: string[] = [];
  if (o.email) conditions.push(`email.eq.${pgQuote(o.email.toLowerCase())}`);
  if (o.external_id) conditions.push(`external_id.eq.${pgQuote(o.external_id)}`);
  if (o.phone && o.full_name) conditions.push(`and(full_name.ilike.${pgQuote(o.full_name)},phone.eq.${pgQuote(o.phone)})`);
  if (!conditions.length) return [];
  let q = ctx.db.from(T.leads).select(LEAD_COLUMNS).eq('company_id', ctx.companyId).is('deleted_at', null);
  if (o.exclude_lead_id) q = q.neq('id', o.exclude_lead_id);
  const res = await q.or(conditions.join(',')).limit(50);
  if (res.error) dbFail(res.error);
  return ((res.data ?? []) as unknown as Row[]).filter(isObj);
}

/** match_on */
function matchOn(existing: Row, o: { email?: string | null; phone?: string | null; full_name?: string | null; external_id?: string | null }): string[] {
  const hits: string[] = [];
  if (o.email && existing.email && String(existing.email).toLowerCase() === String(o.email).toLowerCase()) hits.push('email');
  if (o.external_id && existing.external_id && String(existing.external_id) === String(o.external_id)) hits.push('external_id');
  if (o.phone && o.full_name
      && existing.phone && String(existing.phone).toLowerCase() === String(o.phone).toLowerCase()
      && existing.full_name && String(existing.full_name).toLowerCase() === String(o.full_name).toLowerCase()) hits.push('name+phone');
  return hits;
}

/** next_sort_order: place a lead at the end of its kanban column. */
async function nextSortOrder(ctx: Ctx, status: string): Promise<number> {
  try {
    const res = await ctx.db.from(T.leads).select('sort_order')
      .eq('company_id', ctx.companyId).eq('status', status)
      .order('sort_order', { ascending: false }).limit(1);
    const top = (res.data ?? []) as Row[];
    if (!res.error && top.length && top[0].sort_order !== null && top[0].sort_order !== undefined) return Number(top[0].sort_order) + 1;
  } catch { /* a missing value just means "start at zero" */ }
  return 0;
}

// ====================================================================== shared helpers (router)
type PersonOut = { id: string; email: string | null; full_name: string; avatar_url: null };

async function safePersonMap(ctx: Ctx): Promise<Map<string, PersonOut>> {
  try { return await personMap(ctx); } catch { return new Map(); } // never fail a list view because a name is missing
}

/** _enrich: attach assignee / creator person refs. */
async function enrich(ctx: Ctx, records: Row[]): Promise<Row[]> {
  if (!records.length) return records;
  const map = await safePersonMap(ctx);
  for (const r of records) {
    r.assignee = r.assigned_to ? map.get(String(r.assigned_to)) ?? null : null;
    r.creator = r.created_by ? map.get(String(r.created_by)) ?? null : null;
  }
  return records;
}

/** LeadOut: the row with its person refs (missing optional fields default as pydantic did). */
function leadOut(r: Row): Row {
  return { ...r, tags: r.tags ?? [], sort_order: r.sort_order ?? 0, assignee: r.assignee ?? null, creator: r.creator ?? null };
}

/** _get_lead: RLS decides visibility. */
async function getLead(ctx: Ctx, leadId: string, includeDeleted = false): Promise<Row> {
  let q = ctx.db.from(T.leads).select(LEAD_COLUMNS).eq('company_id', ctx.companyId).eq('id', leadId);
  if (!includeDeleted) q = q.is('deleted_at', null);
  const rows = run(await q.limit(1)) as unknown as Row[] | null;
  const lead = rows?.[0];
  if (!lead) return fail(404, 'not_found', 'Lead not found.', { lead_id: leadId });
  return lead;
}

/** _validate_assigned_to: the assignee must be a CRM member of this company. */
async function validateAssignedTo(ctx: Ctx, userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  if (!(await isMember(ctx, userId))) {
    fail(422, 'validation_error', 'That person is not an active member of this company.', { assigned_to: userId });
  }
}

/** update ... returning the lead row (or undefined when RLS / filters matched nothing). */
async function updateLead(ctx: Ctx, leadId: string, values: Row): Promise<Row | undefined> {
  const rows = run(await ctx.db.from(T.leads).update(values).eq('id', leadId).eq('company_id', ctx.companyId).select(LEAD_COLUMNS)) as unknown as Row[] | null;
  return rows?.[0];
}

async function leadResponse(ctx: Ctx, row: Row | undefined, leadId: string): Promise<Row> {
  if (!row) return fail(404, 'not_found', 'Lead not found.', { lead_id: leadId });
  return leadOut((await enrich(ctx, [row]))[0]);
}

const ok = (message: string) => ({ ok: true, message });

// ====================================================================== body schemas (schemas/lead.py)
/** LeadCreate -> insert payload (company_id and notes excluded) plus the free-text notes. */
function parseLeadCreate(raw: unknown): { body: Row; notes: string | null } {
  const c = new Check();
  const b = bodyObject(c, raw);
  const clean = (v: unknown) => (typeof v === 'string' ? (v.trim() || null) : v); // _strip_optional

  const full_name = has(b, 'full_name') ? vFullName(c, b.full_name, false) : (c.add('full_name', 'Field required'), undefined);
  const email = has(b, 'email') ? vEmail(c, 'email', b.email) : null;
  const opt = (key: string, max: number) => (has(b, key) ? vStr(c, key, clean(b[key]), { max, nullable: true }) : null);
  const phone = opt('phone', 50);
  const organization = opt('organization', 200);
  const job_title = opt('job_title', 200);
  const website = opt('website', 500);
  const campaign = opt('campaign', 200);
  const external_id = opt('external_id', 255);
  const notes = opt('notes', 20_000);
  const source = has(b, 'source') ? vLiteral(c, 'source', b.source, LEAD_SOURCES) : 'manual';
  const status = has(b, 'status') ? vLiteral(c, 'status', b.status, LEAD_STATUSES) : 'new';
  const priority = has(b, 'priority') ? vLiteral(c, 'priority', b.priority, LEAD_PRIORITIES) : 'medium';
  const assigned_to = has(b, 'assigned_to') ? vStr(c, 'assigned_to', b.assigned_to, { nullable: true }) : null;
  const tags = has(b, 'tags') ? vTags(c, 'tags', b.tags) : [];
  const next_follow_up_at = has(b, 'next_follow_up_at') ? vDateTime(c, 'next_follow_up_at', b.next_follow_up_at) : null;
  c.done();

  return {
    body: {
      full_name, email, phone, organization, job_title, website, source, campaign, external_id,
      status, priority, assigned_to, tags, next_follow_up_at,
    },
    notes: notes ?? null,
  };
}

const UPDATE_FIELDS = [
  'full_name', 'email', 'phone', 'organization', 'job_title', 'website', 'source', 'campaign',
  'external_id', 'status', 'priority', 'assigned_to', 'tags', 'notes', 'next_follow_up_at',
];

/** LeadUpdate (exclude_unset): only supplied fields; extra fields are rejected. */
function parseLeadUpdate(raw: unknown): Row {
  const c = new Check();
  const b = bodyObject(c, raw);
  const out: Row = {};
  for (const key of Object.keys(b)) {
    if (!UPDATE_FIELDS.includes(key)) { c.add(key, 'Extra inputs are not permitted'); continue; }
    const v = b[key];
    switch (key) {
      case 'full_name': out[key] = vFullName(c, v, true); break;
      case 'email': out[key] = vEmail(c, key, v); break;
      case 'phone': out[key] = vStr(c, key, v, { max: 50, nullable: true }); break;
      case 'organization': case 'job_title': case 'campaign': out[key] = vStr(c, key, v, { max: 200, nullable: true }); break;
      case 'website': out[key] = vStr(c, key, v, { max: 500, nullable: true }); break;
      case 'external_id': out[key] = vStr(c, key, v, { max: 255, nullable: true }); break;
      case 'notes': out[key] = vStr(c, key, v, { max: 20_000, nullable: true }); break;
      case 'source': out[key] = vLiteral(c, key, v, LEAD_SOURCES, true); break;
      case 'status': out[key] = vLiteral(c, key, v, LEAD_STATUSES, true); break;
      case 'priority': out[key] = vLiteral(c, key, v, LEAD_PRIORITIES, true); break;
      case 'assigned_to': out[key] = vStr(c, key, v, { nullable: true }); break;
      case 'tags': out[key] = v === null ? null : vTags(c, key, v); break;
      case 'next_follow_up_at': out[key] = vDateTime(c, key, v); break;
    }
  }
  c.done();
  if (!Object.keys(out).length) { c.add('body', 'Value error, at least one field must be supplied'); c.done(); }
  return out;
}

// ====================================================================== CSV (services/csv_import.py)
const CANONICAL_COLUMNS = [
  'full_name', 'email', 'phone', 'organization', 'job_title', 'website',
  'source', 'campaign', 'external_id', 'status', 'priority',
  'assigned_to', 'tags', 'notes', 'next_follow_up_at',
];

const HEADER_ALIASES: Record<string, string[]> = {
  full_name: ['full_name', 'fullname', 'name', 'lead_name', 'contact_name', 'contact name', 'contact person', 'contact',
    'full name', 'lead name', 'customer name', 'first name'],
  email: ['email', 'e-mail', 'email address', 'mail', 'email_address', 'primary email'],
  phone: ['phone', 'phone number', 'mobile', 'telephone', 'tel', 'phone_no', 'cell'],
  organization: ['organization', 'organisation', 'company', 'account', 'business', 'org', 'company name', 'account name'],
  job_title: ['job_title', 'job title', 'title', 'designation', 'position', 'role'],
  website: ['website', 'web', 'url', 'site', 'company website', 'web site'],
  source: ['source', 'lead source', 'channel', 'origin', 'lead_source'],
  campaign: ['campaign', 'campaign name', 'utm_campaign', 'ad campaign'],
  external_id: ['external_id', 'external id', 'id', 'lead id', 'leadgen_id', 'external id ', 'source id', 'reference', 'ref'],
  status: ['status', 'lead status', 'stage', 'pipeline stage'],
  priority: ['priority', 'lead priority', 'urgency'],
  assigned_to: ['assigned_to', 'assigned to', 'owner', 'assignee', 'salesperson', 'assigned_owner', 'rep'],
  tags: ['tags', 'tag', 'labels', 'segments'],
  notes: ['notes', 'note', 'comments', 'comment', 'description', 'remark'],
  next_follow_up_at: ['next_follow_up_at', 'next follow up', 'follow up date', 'follow_up_date', 'due date', 'next_followup', 'followup'],
};

const VALID_SOURCES = new Set<string>(LEAD_SOURCES);
const SOURCE_ALIASES: Record<string, string> = {
  fb: 'facebook', meta: 'facebook', 'facebook lead ads': 'facebook',
  ig: 'instagram', 'meta instagram': 'instagram',
  li: 'linkedin', 'linkedin ads': 'linkedin',
  web: 'website_form', website: 'website_form', webform: 'website_form',
  'website form': 'website_form', form: 'website_form', 'landing page': 'website_form',
  csv: 'csv_import', import: 'csv_import',
  'word of mouth': 'referral', ref: 'referral',
  outbound: 'phone', 'cold call': 'phone',
};
const VALID_STATUSES = new Set<string>(LEAD_STATUSES);
const STATUS_ALIASES: Record<string, string> = {
  contacted: 'contacted', contact: 'contacted',
  'follow up': 'follow_up', 'follow-up': 'follow_up', followup: 'follow_up',
  follow_up: 'follow_up', 'in progress': 'follow_up',
  qualified: 'qualified', qualify: 'qualified',
  proposal: 'proposal', proposed: 'proposal',
  converted: 'converted', won: 'converted', closed: 'converted',
  'closed won': 'converted', customer: 'converted',
  lost: 'lost', dead: 'lost', unqualified: 'lost', 'closed lost': 'lost',
  new: 'new', open: 'new', inbox: 'new',
};
const VALID_PRIORITIES = new Set<string>(LEAD_PRIORITIES);
const PRIORITY_ALIASES: Record<string, string> = {
  low: 'low', med: 'medium', medium: 'medium', normal: 'medium',
  high: 'high', hot: 'urgent', urgent: 'urgent', critical: 'urgent',
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type CsvValue = string | string[] | null;
interface ParsedRow { index: number; values: Record<string, CsvValue>; errors: string[]; duplicate_of: string | null }
interface ParsedFile {
  filename: string; headers: string[]; mapping: Record<string, string>; rows: ParsedRow[];
  unmapped: string[]; suggestions: string[];
}

function normHeader(header: string): string {
  return header.trim().toLowerCase().replace(/^\uFEFF+/, '').replace(/\s+/g, ' ');
}

/** detect_mapping */
function detectMapping(headers: string[]): { mapping: Record<string, string>; unmapped: string[] } {
  const normToCanonical = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) { const n = normHeader(alias); if (!normToCanonical.has(n)) normToCanonical.set(n, canonical); }
  }
  const mapping: Record<string, string> = {};
  const unmapped: string[] = [];
  const taken = new Set<string>();
  for (const header of headers) {
    let canonical = normToCanonical.get(normHeader(header));
    if (canonical === undefined && CANONICAL_COLUMNS.includes(header.trim())) canonical = header.trim();
    if (canonical && !taken.has(canonical)) { mapping[header] = canonical; taken.add(canonical); }
    else unmapped.push(header);
  }
  return { mapping, unmapped };
}

/** Python str.title() */
function pyTitle(s: string): string {
  let out = '';
  let prevCased = false;
  for (const ch of s) {
    const lower = ch.toLowerCase();
    const upper = ch.toUpperCase();
    const cased = lower !== upper;
    out += cased ? (prevCased ? lower : upper) : ch;
    prevCased = cased;
  }
  return out;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const monthAbbr = (name: string) => MONTHS.findIndex((m) => m.slice(0, 3) === name.toLowerCase()) + 1;
const monthFull = (name: string) => MONTHS.indexOf(name.toLowerCase()) + 1;
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** A UTC datetime as Python's isoformat() writes it, or null when the parts are not a real date. */
function utcIso(y: number, m: number, d: number, H = 0, M = 0, S = 0): string | null {
  if (m < 1 || m > 12 || d < 1 || H > 23 || M > 59 || S > 59) return null;
  const dt = new Date(Date.UTC(y, m - 1, d, H, M, S));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}T${pad(H)}:${pad(M)}:${pad(S)}+00:00`;
}

/** _parse_when: the strptime formats in order, then ISO 8601. */
function parseWhen(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  const n = Number;
  const tries: (() => string | null)[] = [
    () => { const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text); return m ? utcIso(n(m[1]), n(m[2]), n(m[3])) : null; },          // %Y-%m-%d
    () => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text); return m ? utcIso(n(m[3]), n(m[2]), n(m[1])) : null; },        // %d/%m/%Y
    () => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text); return m ? utcIso(n(m[3]), n(m[1]), n(m[2])) : null; },        // %m/%d/%Y
    () => { const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(text); return m ? utcIso(n(m[1]), n(m[2]), n(m[3])) : null; },        // %Y/%m/%d
    () => { const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(text); return m ? utcIso(n(m[3]), n(m[2]), n(m[1])) : null; },          // %d-%m-%Y
    () => { const m = /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2})$/.exec(text); return m ? utcIso(n(m[1]), n(m[2]), n(m[3]), n(m[4]), n(m[5])) : null; }, // %Y-%m-%d %H:%M
    () => { const m = /^(\d{4})-(\d{1,2})-(\d{1,2})T(\d{1,2}):(\d{1,2}):(\d{1,2})$/.exec(text); return m ? utcIso(n(m[1]), n(m[2]), n(m[3]), n(m[4]), n(m[5]), n(m[6])) : null; }, // %Y-%m-%dT%H:%M:%S
    () => { const m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(text); return m && monthAbbr(m[2]) && m[2].length === 3 ? utcIso(n(m[3]), monthAbbr(m[2]), n(m[1])) : null; }, // %d %b %Y
    () => { const m = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(text); return m && m[1].length === 3 && monthAbbr(m[1]) ? utcIso(n(m[3]), monthAbbr(m[1]), n(m[2])) : null; }, // %b %d, %Y
    () => { const m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(text); return m && monthFull(m[2]) ? utcIso(n(m[3]), monthFull(m[2]), n(m[1])) : null; }, // %d %B %Y
  ];
  for (const t of tries) { const r = t(); if (r) return r; }
  // ISO 8601, with or without an offset (naive -> UTC)
  if (ISO_DT.test(text)) {
    const hasZone = /(Z|[+-]\d{2}(:?\d{2})?)$/i.test(text) && text.length > 10;
    const ms = Date.parse(text.replace(' ', 'T').replace(',', '.') + (hasZone || text.length === 10 ? '' : 'Z'));
    if (!Number.isNaN(ms)) return new Date(ms).toISOString().replace(/\.000Z$/, '+00:00').replace(/Z$/, '+00:00');
  }
  return null;
}

/** normalise_row: one raw CSV record -> a validated crm_leads payload. */
function normaliseRow(mapping: Record<string, string>, raw: Record<string, string | null>): { values: Record<string, CsvValue>; errors: string[] } {
  const values: Record<string, CsvValue> = {};
  const errors: string[] = [];
  const get = (column: string): string => {
    const header = Object.keys(mapping).find((h) => mapping[h] === column);
    return header ? (raw[header] ?? '').trim() : '';
  };

  let name = get('full_name');
  if (!name) {
    const em = get('email');
    name = em ? pyTitle(em.split('@')[0].replace(/\./g, ' ').replace(/_/g, ' ')) : '';
  }
  if (!name) errors.push('full_name is required (no name or e-mail supplied)');
  else if (strLen(name) > 200) errors.push('full_name must be 200 characters or fewer');
  values.full_name = name ? name.slice(0, 200) : null;

  const email = get('email');
  if (email && !EMAIL_RE.test(email)) errors.push(`invalid e-mail address: ${email}`);
  values.email = email ? email.slice(0, 320) : null;

  const phone = get('phone');
  if (strLen(phone) > 50) errors.push('phone must be 50 characters or fewer');
  values.phone = phone ? phone.slice(0, 50) : null;

  for (const [column, limit] of [['organization', 200], ['job_title', 200], ['website', 500], ['campaign', 200], ['external_id', 255]] as const) {
    const text = get(column);
    if (strLen(text) > limit) errors.push(`${column} must be ${limit} characters or fewer`);
    values[column] = text ? text.slice(0, limit) : null;
  }

  const notes = get('notes');
  if (strLen(notes) > 20_000) errors.push('notes must be 20000 characters or fewer');
  values.notes = notes ? notes.slice(0, 20_000) : null;

  const sourceRaw = get('source');
  const sourceKey = normHeader(sourceRaw);
  if (!sourceRaw) values.source = 'csv_import';
  else if (VALID_SOURCES.has(sourceKey)) values.source = sourceKey;
  else if (sourceKey in SOURCE_ALIASES) values.source = SOURCE_ALIASES[sourceKey];
  else values.source = 'other';

  const statusRaw = get('status');
  if (!statusRaw) values.status = 'new';
  else {
    const key = normHeader(statusRaw).replace(/_/g, ' ');
    if (VALID_STATUSES.has(key)) values.status = key;
    else if (key in STATUS_ALIASES) values.status = STATUS_ALIASES[key];
    else errors.push(`unknown status: ${statusRaw}`);
  }

  const priorityRaw = get('priority');
  if (!priorityRaw) values.priority = 'medium';
  else {
    const key = normHeader(priorityRaw);
    if (VALID_PRIORITIES.has(key)) values.priority = key;
    else if (key in PRIORITY_ALIASES) values.priority = PRIORITY_ALIASES[key];
    else errors.push(`unknown priority: ${priorityRaw}`);
  }

  const tagsRaw = get('tags');
  const tags: string[] = [];
  if (tagsRaw) {
    for (const part of tagsRaw.split(/[;,|]/)) {
      const tag = part.trim().toLowerCase();
      if (tag && strLen(tag) <= 60 && !tags.includes(tag)) tags.push(tag);
    }
    if (tags.length > 50) errors.push('at most 50 tags are allowed');
  }
  values.tags = tags.slice(0, 50);

  const whenRaw = get('next_follow_up_at');
  if (whenRaw) {
    const iso = parseWhen(whenRaw);
    if (iso === null) errors.push(`could not read follow-up date: ${whenRaw}`);
    values.next_follow_up_at = iso;
  } else values.next_follow_up_at = null;

  return { values, errors };
}

/** Decode like the API: utf-8 (BOM stripped), falling back to cp1252. */
function decodeCsv(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return text.replace(/^\uFEFF/, '');
  } catch { /* not UTF-8 */ }
  try { return new TextDecoder('windows-1252').decode(bytes); } catch { return null; }
}

/** csv.Sniffer (delimiters ",;\t|"), simplified: the delimiter that splits the first lines most consistently. */
function sniffDelimiter(sample: string): string {
  const lines = sample.split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 20);
  if (sample.length >= 4096 && lines.length > 1) lines.pop(); // the last line of a cut sample is partial
  let best = ',';
  let bestScore = 0;
  for (const d of [',', '\t', ';', '|']) {
    const counts = lines.map((line) => {
      let inQ = false;
      let n = 0;
      for (const ch of line) {
        if (ch === '"') inQ = !inQ;
        else if (ch === d && !inQ) n++;
      }
      return n;
    });
    if (!counts.length || counts[0] === 0) continue;
    const consistent = counts.filter((n) => n === counts[0]).length / counts.length;
    const score = consistent * 1000 + counts[0];
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

/** Python's csv reader (excel dialect, given delimiter). A blank line yields []. */
function readCsv(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let quotedField = false;
  let lineHasData = false;
  const endField = () => { row.push(field); field = ''; quotedField = false; };
  const endRow = () => {
    if (lineHasData) { endField(); rows.push(row); } else rows.push([]);
    row = []; field = ''; quotedField = false; lineHasData = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '' && !quotedField) { inQuotes = true; quotedField = true; lineHasData = true; continue; }
    if (ch === delim) { lineHasData = true; endField(); continue; }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
      continue;
    }
    lineHasData = true;
    field += ch;
  }
  if (lineHasData || inQuotes) { endField(); rows.push(row); }
  return rows;
}

function importInvalid(message: string, details?: Record<string, unknown>): never {
  return fail(422, 'validation_error', message, details);
}

/** parse_csv */
function parseCsv(bytes: Uint8Array, filename: string): ParsedFile {
  if (bytes.length > CSV_UPLOAD_MAX_BYTES) {
    importInvalid(`File is larger than ${Math.floor(CSV_UPLOAD_MAX_BYTES / (1024 * 1024))} MB.`, { limit_bytes: CSV_UPLOAD_MAX_BYTES });
  }
  const text = decodeCsv(bytes);
  if (text === null) importInvalid('The file could not be decoded as text. Save it as UTF-8 CSV.');
  const records = readCsv(text as string, sniffDelimiter((text as string).slice(0, 4096)));
  const fieldnames = records.shift() ?? [];
  const headers = fieldnames.map((h) => h.trim()).filter((h) => h);
  if (!headers.length) importInvalid('The file has no header row.');

  const { mapping, unmapped } = detectMapping(headers);
  const mapped = Object.values(mapping);
  if (!mapped.includes('full_name') && !mapped.includes('email')) {
    importInvalid("Could not find a name or e-mail column. Expected headers such as 'name', 'full_name', 'email', 'phone'.", {
      headers, detected: mapping,
    });
  }

  const rows: ParsedRow[] = [];
  let index = 1; // row 1 is the header
  for (const rec of records) {
    if (!rec.length) continue; // csv.DictReader skips empty lines without counting them
    index++;
    if (rows.length >= CSV_MAX_ROWS) importInvalid(`Too many rows. The limit is ${CSV_MAX_ROWS}.`, { limit: CSV_MAX_ROWS });
    const raw: Record<string, string | null> = {};
    fieldnames.forEach((h, i) => { const key = h.trim(); if (key) raw[key] = i < rec.length ? rec[i] : null; });
    if (!Object.values(raw).some((v) => v !== null && v.trim())) continue; // skip blank lines
    const { values, errors } = normaliseRow(mapping, raw);
    rows.push({ index, values, errors, duplicate_of: null });
  }
  if (!rows.length) importInvalid('The file contains no data rows.');

  const suggestions: string[] = [];
  if (unmapped.length) suggestions.push('Ignored columns: ' + unmapped.join(', '));
  if (mapped.includes('assigned_to')) suggestions.push("'assigned_to' is applied by e-mail or user id lookup on import.");
  return { filename, headers, mapping, rows, unmapped, suggestions };
}

/** duplicate_key: spots duplicates within the uploaded file. */
function duplicateKey(row: ParsedRow): string | null {
  const s = (k: string) => (typeof row.values[k] === 'string' ? (row.values[k] as string) : '').toLowerCase();
  const email = s('email');
  if (email) return `email:${email}`;
  const external = s('external_id');
  if (external) return `external:${external}`;
  const name = s('full_name');
  const phone = s('phone');
  if (name && phone) return `person:${name}|${phone}`;
  if (name) return `name:${name}`;
  return null;
}

/** to_csv: csv.writer (QUOTE_MINIMAL, "\n" line endings). */
function toCsv(records: Row[]): string {
  const cols = [
    'full_name', 'email', 'phone', 'organization', 'job_title', 'website',
    'source', 'campaign', 'external_id', 'status', 'priority',
    'assigned_to_email', 'tags', 'notes', 'next_follow_up_at',
    'created_at', 'updated_at',
  ];
  const cell = (value: unknown): string => {
    const s = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(',')];
  for (const record of records) {
    lines.push(cols.map((col) => {
      const value = record[col];
      if (col === 'tags' && Array.isArray(value)) return cell(value.join(', '));
      return cell(value);
    }).join(','));
  }
  return lines.join('\n') + '\n';
}

// ====================================================================== handlers
async function listLeads(ctx: Ctx, req: Req) {
  const q = req.query;
  const c = new Check();
  const page = qInt(c, q, 'page', 1);
  const pageSize = qInt(c, q, 'page_size', 25);
  const unassigned = qBool(c, q, 'unassigned');
  c.done();
  need(ctx, PERMISSIONS.LEAD_READ);
  const paging = makePagination(page, pageSize, qStr(q, 'sort') ?? 'created_at', qStr(q, 'order') ?? 'desc');
  const filters: LeadFilters = {
    search: qStr(q, 'search'),
    status: qList(q, 'status'), priority: qList(q, 'priority'), source: qList(q, 'source'),
    campaign: qStr(q, 'campaign'), assigned_to: qList(q, 'assigned_to'), created_by: qStr(q, 'created_by'),
    tags: qList(q, 'tags'), view: (qStr(q, 'view') || 'active').toLowerCase(), follow_up: qStr(q, 'follow_up'),
    created_from: qStr(q, 'created_from'), created_to: qStr(q, 'created_to'), unassigned,
  };
  if (!['active', 'archived', 'all'].includes(filters.view)) {
    fail(422, 'validation_error', 'view must be one of: active, archived, all.', { value: filters.view });
  }
  const { rows, total } = await fetchLeads(ctx, filters, paging);
  await enrich(ctx, rows);
  return pageResult(rows, total, paging.page, paging.page_size);
}

/** GET /leads/export -> the CSV text (Leads.tsx turns the string into a Blob download). */
async function exportLeads(ctx: Ctx, req: Req): Promise<string> {
  const q = req.query;
  const c = new Check();
  const limit = qInt(c, q, 'limit', 50_000, { ge: 1, le: 200_000 });
  c.done();
  need(ctx, PERMISSIONS.LEAD_EXPORT);
  const filters: LeadFilters = {
    ...emptyFilters((qStr(q, 'view') || 'active').toLowerCase()),
    search: qStr(q, 'search'),
    status: qList(q, 'status'), priority: qList(q, 'priority'), source: qList(q, 'source'),
    campaign: qStr(q, 'campaign'), assigned_to: qList(q, 'assigned_to'), tags: qList(q, 'tags'),
    follow_up: qStr(q, 'follow_up'),
  };
  const records = await fetchAllLeads(ctx, filters, limit);
  const map = await safePersonMap(ctx);
  return toCsv(records.map((r) => ({
    ...r,
    assigned_to_email: (r.assigned_to ? map.get(String(r.assigned_to))?.email : '') || '',
  })));
}

async function importLeads(ctx: Ctx, req: Req) {
  const c = new Check();
  const dryRun = qBool(c, req.query, 'dry_run') ?? true;
  const skipDuplicates = qBool(c, req.query, 'skip_duplicates') ?? true;
  const updateExisting = qBool(c, req.query, 'update_existing') ?? false;
  const file = req.formData?.get('file');
  if (!(file instanceof Blob)) c.add('file', 'Field required');
  c.done();
  need(ctx, PERMISSIONS.LEAD_IMPORT);
  const upload = file as File;
  const parsed = parseCsv(new Uint8Array(await upload.arrayBuffer()), upload.name || 'upload.csv');

  // duplicates inside the file
  const seen = new Map<string, number>();
  for (const row of parsed.rows) {
    const key = duplicateKey(row);
    if (!key) continue;
    if (seen.has(key)) row.duplicate_of = `row ${seen.get(key)}`;
    else seen.set(key, row.index);
  }

  // cross-check against leads that already exist in this company
  const str = (v: CsvValue | undefined) => (typeof v === 'string' ? v : '');
  const existingByEmail = new Map<string, string>();
  const existingByExternal = new Map<string, string>();
  const emails = [...new Set(parsed.rows.filter((r) => str(r.values.email)).map((r) => str(r.values.email).toLowerCase()))];
  const externals = [...new Set(parsed.rows.filter((r) => str(r.values.external_id)).map((r) => str(r.values.external_id)))];
  for (const [column, bucket, values] of [['email', existingByEmail, emails], ['external_id', existingByExternal, externals]] as const) {
    for (let start = 0; start < values.length; start += 100) {
      const chunk = values.slice(start, start + 100);
      let found: Row[] = [];
      try {
        const res = await ctx.db.from(T.leads).select(`id, ${column}`).eq('company_id', ctx.companyId).in(column, chunk);
        if (!res.error) found = (res.data ?? []) as unknown as Row[];
      } catch { found = []; }
      for (const f of found) bucket.set(String(f[column] ?? '').toLowerCase(), String(f.id));
    }
  }
  for (const row of parsed.rows) {
    const email = str(row.values.email).toLowerCase();
    const external = str(row.values.external_id);
    if (row.duplicate_of) continue;
    if (email && existingByEmail.has(email)) row.duplicate_of = existingByEmail.get(email) as string;
    else if (external && existingByExternal.has(external)) row.duplicate_of = existingByExternal.get(external) as string;
  }

  const validRows = parsed.rows.filter((r) => !r.errors.length);
  const errorRows = parsed.rows.filter((r) => r.errors.length);
  const duplicateOfExisting = parsed.rows.filter((r) => r.duplicate_of && !r.errors.length && !r.duplicate_of.startsWith('row '));

  const report: Row = {
    filename: parsed.filename,
    dry_run: dryRun,
    headers: parsed.headers,
    detected_mapping: parsed.mapping,
    ignored_columns: parsed.unmapped,
    suggestions: parsed.suggestions,
    total_rows: parsed.rows.length,
    valid_rows: validRows.length,
    invalid_rows: errorRows.length,
    duplicates_in_file: parsed.rows.filter((r) => r.duplicate_of && !r.errors.length).length,
    duplicates_of_existing: duplicateOfExisting.length,
    errors: errorRows.slice(0, 200).map((r) => ({ row: r.index, messages: r.errors })),
    preview: parsed.rows.slice(0, 20).map((r) => ({ row: r.index, values: r.values, errors: r.errors, duplicate_of: r.duplicate_of })),
  };
  if (dryRun) return report;

  // ---------------------------------------------------------------- commit
  const toCreate: Row[] = [];
  const toUpdate: { id: string; values: Row }[] = [];
  const skipped: number[] = [];
  const sortCursor = new Map<string, number>(); // end of each kanban column, advanced per imported row

  for (const row of parsed.rows) {
    if (row.errors.length) { skipped.push(row.index); continue; }
    if (row.duplicate_of && skipDuplicates && !updateExisting) { skipped.push(row.index); continue; }

    const payload: Row = {};
    for (const [k, v] of Object.entries(row.values)) if (v !== null || k === 'next_follow_up_at') payload[k] = v;
    const rawAssignee = String(payload.assigned_to ?? '').trim();
    delete payload.assigned_to;
    if (rawAssignee) payload.assigned_to = rawAssignee;

    if (updateExisting && row.duplicate_of && !row.duplicate_of.startsWith('row ')) {
      payload.source = payload.source || 'csv_import';
      delete payload.external_id; // keep the original source link
      toUpdate.push({ id: row.duplicate_of, values: payload });
    } else {
      const status = String(payload.status ?? 'new');
      if (!sortCursor.has(status)) sortCursor.set(status, await nextSortOrder(ctx, status));
      const sortOrder = sortCursor.get(status) as number;
      sortCursor.set(status, sortOrder + 1);
      toCreate.push({
        ...payload,
        company_id: ctx.companyId,
        created_by: ctx.userId,
        source: payload.source || 'csv_import',
        sort_order: sortOrder,
      });
    }
  }

  let created = 0;
  let updated = 0;
  const failed: { row: string; message: string }[] = [];

  for (let start = 0; start < toCreate.length; start += 100) {
    const chunk = toCreate.slice(start, start + 100);
    const res = await ctx.db.from(T.leads).insert(chunk);
    if (!res.error) { created += chunk.length; continue; }
    // a batch can fail on one bad row: retry one by one
    for (const item of chunk) {
      const one = await ctx.db.from(T.leads).insert(item);
      if (one.error) failed.push({ row: String(item.full_name ?? ''), message: one.error.message });
      else created += 1;
    }
  }

  for (const item of toUpdate) {
    const res = await ctx.db.from(T.leads).update(item.values).eq('id', item.id).eq('company_id', ctx.companyId).select('id');
    if (res.error) failed.push({ row: item.id, message: res.error.message });
    else if ((res.data ?? []).length) updated += 1;
    else failed.push({ row: item.id, message: 'not found' });
  }

  // record the run (best effort: logging must never fail the request)
  try {
    const imported = created + updated;
    await ctx.db.from(T.imports).insert({
      company_id: ctx.companyId,
      filename: (parsed.filename || 'upload.csv').slice(0, 300),
      status: 'completed',
      total_rows: parsed.rows.length,
      imported_rows: imported,
      duplicate_rows: Math.max(0, skipped.length - errorRows.length),
      error_rows: errorRows.length,
      mapping: parsed.mapping,
      errors: failed.slice(0, 100),
      created_by: ctx.userId,
      completed_at: nowIso(),
    });
  } catch { /* ignore */ }

  return { ...report, dry_run: false, created, updated, skipped: skipped.length, failed: failed.slice(0, 100) };
}

/** GET /leads/duplicates: company duplicate report grouped by e-mail, then name+phone. */
async function duplicateGroups(ctx: Ctx) {
  need(ctx, PERMISSIONS.LEAD_READ);
  // make_pagination(page_size=5000) is capped at the API's max page size, as it was in the original
  const { rows: records } = await fetchLeads(ctx, emptyFilters('active'), makePagination(1, 5000, 'created_at', 'desc'));

  const groups = new Map<string, Row[]>();
  const noEmail: Row[] = [];
  for (const r of records) {
    const email = String(r.email ?? '').trim().toLowerCase();
    if (email) { if (!groups.has(email)) groups.set(email, []); (groups.get(email) as Row[]).push(r); }
    else noEmail.push(r);
  }
  const namePhone = new Map<string, Row[]>();
  for (const r of noEmail) {
    const key = `${String(r.full_name ?? '').trim().toLowerCase()}|${String(r.phone ?? '').trim().toLowerCase()}`;
    if (r.phone) { if (!namePhone.has(key)) namePhone.set(key, []); (namePhone.get(key) as Row[]).push(r); }
  }

  const result: { match_on: string; value: string; leads: Row[] }[] = [];
  for (const [key, group] of groups) if (group.length > 1) result.push({ match_on: 'email', value: key, leads: await enrich(ctx, group) });
  for (const [key, group] of namePhone) if (group.length > 1) result.push({ match_on: 'name+phone', value: key, leads: await enrich(ctx, group) });
  result.sort((a, b) => b.leads.length - a.leads.length);
  return { groups: result, total_leads: records.length, duplicate_leads: result.reduce((s, g) => s + g.leads.length, 0) };
}

async function leadDuplicates(ctx: Ctx, req: Req) {
  need(ctx, PERMISSIONS.LEAD_READ);
  const leadId = req.params.lead_id;
  const lead = await getLead(ctx, leadId);
  const probe = { email: lead.email, phone: lead.phone, full_name: lead.full_name, external_id: lead.external_id };
  const found = await findExistingDuplicates(ctx, { ...probe, exclude_lead_id: leadId });
  const out: Row[] = [];
  for (const r of found) {
    const hits = matchOn(r, probe);
    if (hits.length) {
      out.push({
        id: r.id, full_name: r.full_name, email: r.email ?? null, phone: r.phone ?? null,
        organization: r.organization ?? null, status: r.status, source: r.source, created_at: r.created_at, match_on: hits,
      });
    }
  }
  return out;
}

async function bulkUpdate(ctx: Ctx, req: Req) {
  // BulkUpdateRequest
  const c = new Check();
  const b = bodyObject(c, req.body);
  for (const key of Object.keys(b)) {
    if (!['lead_ids', 'action', 'status', 'priority', 'assigned_to', 'tag'].includes(key)) c.add(key, 'Extra inputs are not permitted');
  }
  let leadIds: string[] = [];
  if (!has(b, 'lead_ids')) c.add('lead_ids', 'Field required');
  else if (!Array.isArray(b.lead_ids)) c.add('lead_ids', 'Input should be a valid list');
  else {
    const list = b.lead_ids as unknown[];
    list.forEach((v, i) => { if (typeof v !== 'string') c.add(`lead_ids.${i}`, 'Input should be a valid string'); });
    if (list.length < 1) c.add('lead_ids', `List should have at least 1 item after validation, not ${list.length}`);
    if (list.length > 500) c.add('lead_ids', `List should have at most 500 items after validation, not ${list.length}`);
    leadIds = list.filter((v): v is string => typeof v === 'string');
  }
  const action = has(b, 'action') ? vLiteral(c, 'action', b.action, BULK_ACTIONS) : (c.add('action', 'Field required'), undefined);
  const status = b.status === undefined ? null : vLiteral(c, 'status', b.status, LEAD_STATUSES, true);
  const priority = b.priority === undefined ? null : vLiteral(c, 'priority', b.priority, LEAD_PRIORITIES, true);
  const assignedTo = b.assigned_to === undefined ? null : vStr(c, 'assigned_to', b.assigned_to, { nullable: true });
  const tagIn = b.tag === undefined ? null : vStr(c, 'tag', b.tag, { max: 60, nullable: true });
  c.done();
  const required: Partial<Record<string, unknown>> = { status, priority, assign: assignedTo, tag: tagIn, untag: tagIn };
  if (action && action in required && (required[action] === null || required[action] === undefined)) {
    c.add('body', `Value error, action '${action}' requires its matching field`);
    c.done();
  }
  const act = action as (typeof BULK_ACTIONS)[number];
  need(ctx, PERMISSIONS.LEAD_BULK);

  // per-action permission: "any", or the salesperson's "own" variant (narrowed per row below and by RLS)
  const UPDATE: [Permission, Permission | null] = [PERMISSIONS.LEAD_UPDATE_ANY, PERMISSIONS.LEAD_UPDATE_OWN];
  const actionPermission: Record<(typeof BULK_ACTIONS)[number], [Permission, Permission | null]> = {
    status: UPDATE, assign: UPDATE, unassign: UPDATE, priority: UPDATE, tag: UPDATE, untag: UPDATE,
    archive: [PERMISSIONS.LEAD_ARCHIVE, null],
    unarchive: [PERMISSIONS.LEAD_ARCHIVE, null],
    delete: [PERMISSIONS.LEAD_DELETE, null],
  };
  const [anyPerm, ownPerm] = actionPermission[act];
  if (!can(ctx.role, anyPerm) && (ownPerm === null || !can(ctx.role, ownPerm))) need(ctx, anyPerm);

  if (act === 'assign') await validateAssignedTo(ctx, assignedTo);

  const targets = run(await ctx.db.from(T.leads).select('id, assigned_to, created_by, status, tags')
    .eq('company_id', ctx.companyId).in('id', leadIds).is('deleted_at', null)) as unknown as Row[] | null ?? [];
  if (!targets.length) fail(404, 'not_found', 'None of those leads were found.');

  const allowedIds: string[] = [];
  const skipped: string[] = [];
  for (const t of targets) (mayTouchLead(ctx, t) ? allowedIds : skipped).push(String(t.id));
  if (!allowedIds.length) {
    fail(403, 'forbidden', 'You may only change leads assigned to you or that you created.', { role: ctx.role });
  }

  const now = nowIso();
  const values: Row = {};
  if (act === 'status') values.status = status;
  else if (act === 'assign') values.assigned_to = assignedTo;
  else if (act === 'unassign') values.assigned_to = null;
  else if (act === 'priority') values.priority = priority;
  else if (act === 'archive') values.archived_at = now;
  else if (act === 'unarchive') values.archived_at = null;

  let updated = 0;
  if (act === 'delete') {
    // soft delete; crm_leads_not_archived_and_deleted forbids archived_at and deleted_at both being set
    run(await ctx.db.from(T.leads).update({ deleted_at: now, archived_at: null }).eq('company_id', ctx.companyId).in('id', allowedIds));
    updated = allowedIds.length;
  } else if (act === 'tag' || act === 'untag') {
    const tag = (tagIn ?? '').trim().toLowerCase();
    for (const t of targets) {
      if (!allowedIds.includes(String(t.id))) continue;
      const current: string[] = Array.isArray(t.tags) ? [...t.tags] : [];
      if (act === 'tag' && !current.includes(tag)) current.push(tag);
      else if (act === 'untag' && current.includes(tag)) current.splice(current.indexOf(tag), 1);
      else continue;
      run(await ctx.db.from(T.leads).update({ tags: current }).eq('id', t.id).eq('company_id', ctx.companyId));
      updated += 1;
    }
  } else {
    run(await ctx.db.from(T.leads).update(values).eq('company_id', ctx.companyId).in('id', allowedIds));
    updated = allowedIds.length;
  }

  return { requested: leadIds.length, updated, skipped, errors: [] };
}

async function createLead(ctx: Ctx, req: Req) {
  const { body, notes } = parseLeadCreate(req.body);
  need(ctx, PERMISSIONS.LEAD_CREATE);
  if (body.assigned_to) await validateAssignedTo(ctx, body.assigned_to as string);

  body.company_id = ctx.companyId;
  body.created_by = ctx.userId;
  body.sort_order = await nextSortOrder(ctx, String(body.status ?? 'new'));

  const rows = run(await ctx.db.from(T.leads).insert(body).select(LEAD_COLUMNS)) as unknown as Row[] | null;
  const lead = rows?.[0];
  if (!lead) return fail(409, 'conflict', 'The lead could not be saved.');

  // the free-text `notes` of the create form becomes the lead's first note
  if (notes) {
    run(await ctx.db.from(T.notes).insert({
      lead_id: lead.id, company_id: ctx.companyId, author_id: ctx.userId, body: [...notes].slice(0, 10_000).join(''),
    }));
  }
  return leadOut((await enrich(ctx, [lead]))[0]);
}

async function getLeadRoute(ctx: Ctx, req: Req) {
  need(ctx, PERMISSIONS.LEAD_READ);
  const lead = await getLead(ctx, req.params.lead_id);
  return leadOut((await enrich(ctx, [lead]))[0]);
}

async function patchLead(ctx: Ctx, req: Req) {
  const leadId = req.params.lead_id;
  const body = parseLeadUpdate(req.body);
  const existing = await getLead(ctx, leadId);
  checkCanTouch(ctx, existing);

  if (body.assigned_to) await validateAssignedTo(ctx, body.assigned_to as string);
  // keep the kanban column ordering sane when a lead changes status by edit
  if (body.status && body.status !== existing.status) body.sort_order = await nextSortOrder(ctx, body.status as string);

  return leadResponse(ctx, await updateLead(ctx, leadId, body), leadId);
}

async function deleteLead(ctx: Ctx, req: Req) {
  const leadId = req.params.lead_id;
  const c = new Check();
  const hard = qBool(c, req.query, 'hard') ?? false;
  c.done();
  need(ctx, PERMISSIONS.LEAD_DELETE);
  await getLead(ctx, leadId);
  if (hard && ctx.role !== 'owner') {
    fail(403, 'forbidden', 'Only the company owner can permanently delete a lead.', { lead_id: leadId });
  }
  if (hard) {
    run(await ctx.db.from(T.leads).delete().eq('id', leadId).eq('company_id', ctx.companyId));
    return ok('Lead permanently deleted.');
  }
  // soft delete; crm_leads_not_archived_and_deleted forbids archived_at and deleted_at both being set
  run(await ctx.db.from(T.leads).update({ deleted_at: nowIso(), archived_at: null }).eq('id', leadId).eq('company_id', ctx.companyId));
  return ok('Lead deleted. It is kept out of every view but retained for reporting.');
}

async function archiveLead(ctx: Ctx, req: Req) {
  need(ctx, PERMISSIONS.LEAD_ARCHIVE);
  const leadId = req.params.lead_id;
  checkCanTouch(ctx, await getLead(ctx, leadId));
  return leadResponse(ctx, await updateLead(ctx, leadId, { archived_at: nowIso() }), leadId);
}

async function restoreLead(ctx: Ctx, req: Req) {
  need(ctx, PERMISSIONS.LEAD_ARCHIVE);
  const leadId = req.params.lead_id;
  checkCanTouch(ctx, await getLead(ctx, leadId, true));
  return leadResponse(ctx, await updateLead(ctx, leadId, { archived_at: null, deleted_at: null }), leadId);
}

/** Kanban drag-and-drop: persists status and column position. */
async function moveLead(ctx: Ctx, req: Req) {
  const leadId = req.params.lead_id;

  // LeadMove
  const c = new Check();
  const b = bodyObject(c, req.body);
  const status = has(b, 'status') ? vLiteral(c, 'status', b.status, LEAD_STATUSES) : (c.add('status', 'Field required'), undefined);
  const sortOrder = b.sort_order === undefined || b.sort_order === null ? null : vNumber(c, 'sort_order', b.sort_order, { ge: 0, le: 1_000_000_000 });
  c.done();
  need(ctx, PERMISSIONS.LEAD_UPDATE_ANY, PERMISSIONS.LEAD_UPDATE_OWN);

  const lead = await getLead(ctx, leadId);
  checkCanTouch(ctx, lead);

  const body: Row = { status };
  if (sortOrder !== null && sortOrder !== undefined) body.sort_order = sortOrder;
  else if (status !== lead.status) body.sort_order = await nextSortOrder(ctx, status as string);

  return leadResponse(ctx, await updateLead(ctx, leadId, body), leadId);
}

async function listActivities(ctx: Ctx, req: Req) {
  const leadId = req.params.lead_id;
  const c = new Check();
  const limit = qInt(c, req.query, 'limit', 100, { ge: 1, le: 500 });
  c.done();
  need(ctx, PERMISSIONS.ACTIVITY_READ);
  await getLead(ctx, leadId);
  const records = (run(await ctx.db.from(T.activities)
    .select('id, lead_id, actor_id, action, field, old_value, new_value, metadata, created_at')
    .eq('company_id', ctx.companyId).eq('lead_id', leadId)
    .order('created_at', { ascending: false }).limit(limit)) as unknown as Row[] | null) ?? [];
  const map = records.some((r) => r.actor_id) ? await safePersonMap(ctx) : new Map<string, PersonOut>();
  return records.map((r) => {
    const actor = r.actor_id ? map.get(String(r.actor_id)) : undefined;
    return {
      id: r.id, lead_id: r.lead_id, actor_id: r.actor_id ?? null, action: r.action, field: r.field ?? null,
      old_value: r.old_value ?? null, new_value: r.new_value ?? null, created_at: r.created_at,
      metadata: r.metadata || {},
      actor: actor ? { id: actor.id, full_name: actor.full_name || '', email: actor.email, avatar_url: actor.avatar_url } : null,
    };
  });
}

async function listNotes(ctx: Ctx, req: Req) {
  need(ctx, PERMISSIONS.LEAD_READ);
  const leadId = req.params.lead_id;
  await getLead(ctx, leadId);
  const records = (run(await ctx.db.from(T.notes).select(NOTE_COLUMNS)
    .eq('company_id', ctx.companyId).eq('lead_id', leadId)
    .order('is_pinned', { ascending: false }).order('created_at', { ascending: false })) as unknown as Row[] | null) ?? [];
  const map = records.some((r) => r.author_id) ? await safePersonMap(ctx) : new Map<string, PersonOut>();
  return records.map((r) => {
    const p = r.author_id ? map.get(String(r.author_id)) : undefined;
    return {
      id: r.id, lead_id: r.lead_id, company_id: r.company_id, author_id: r.author_id ?? null, body: r.body,
      is_pinned: r.is_pinned, created_at: r.created_at, updated_at: r.updated_at,
      author: p ? { id: p.id, full_name: p.full_name || '', email: p.email, avatar_url: p.avatar_url } : null,
    };
  });
}

async function createNote(ctx: Ctx, req: Req) {
  const leadId = req.params.lead_id;

  // NoteCreate
  const c = new Check();
  const b = bodyObject(c, req.body);
  let body = has(b, 'body') ? vStr(c, 'body', b.body, { min: 1, max: 10_000 }) : (c.add('body', 'Field required'), undefined);
  if (typeof body === 'string' && c.ok) {
    body = body.trim();
    if (!body) c.add('body', 'Value error, note body must not be blank');
  }
  const isPinned = has(b, 'is_pinned') ? vBool(c, 'is_pinned', b.is_pinned) : false;
  c.done();
  need(ctx, PERMISSIONS.NOTE_CREATE);

  await getLead(ctx, leadId);
  const rows = run(await ctx.db.from(T.notes)
    .insert({ lead_id: leadId, company_id: ctx.companyId, author_id: ctx.userId, body, is_pinned: isPinned })
    .select(NOTE_COLUMNS)) as unknown as Row[] | null;
  const record = rows?.[0];
  if (!record) return fail(409, 'conflict', 'The note could not be saved.');

  // the author is the signed-in user, described from the session as the API did
  const { data } = await ctx.db.auth.getSession();
  const user = data.session?.user;
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = (typeof meta.full_name === 'string' && meta.full_name) || (typeof meta.name === 'string' && meta.name) || '';
  return { ...record, author: { id: ctx.userId, full_name: fullName, email: user?.email ?? null, avatar_url: null } };
}

async function updateNote(ctx: Ctx, req: Req) {
  const noteId = req.params.note_id;

  // NoteUpdate
  const c = new Check();
  const b = bodyObject(c, req.body);
  // body is optional when only pinning / unpinning (the pin button sends just { is_pinned })
  const isPinned = b.is_pinned === undefined || b.is_pinned === null ? null : vBool(c, 'is_pinned', b.is_pinned);
  const body = has(b, 'body') ? vStr(c, 'body', b.body, { min: 1, max: 10_000 })
    : isPinned === null ? (c.add('body', 'Field required'), undefined) : undefined;
  c.done();

  const found = run(await ctx.db.from(T.notes).select('id, lead_id, company_id, author_id, body, is_pinned')
    .eq('id', noteId).eq('company_id', ctx.companyId).limit(1)) as unknown as Row[] | null;
  const existing = found?.[0];
  if (!existing) return fail(404, 'not_found', 'Note not found.', { note_id: noteId });
  if (existing.author_id !== ctx.userId && !can(ctx.role, PERMISSIONS.NOTE_UPDATE_ANY)) {
    fail(403, 'forbidden', 'Only the author can edit this note.', { note_id: noteId });
  }

  const values: Row = body === undefined ? {} : { body };
  if (isPinned !== null && isPinned !== undefined) values.is_pinned = isPinned;
  const rows = run(await ctx.db.from(T.notes).update(values).eq('id', noteId).eq('company_id', ctx.companyId).select(NOTE_COLUMNS)) as unknown as Row[] | null;
  return { ...(rows?.[0] ?? existing), author: null };
}

async function deleteNote(ctx: Ctx, req: Req) {
  const noteId = req.params.note_id;
  const found = run(await ctx.db.from(T.notes).select('id, author_id').eq('id', noteId).eq('company_id', ctx.companyId).limit(1)) as unknown as Row[] | null;
  const existing = found?.[0];
  if (!existing) return fail(404, 'not_found', 'Note not found.', { note_id: noteId });
  if (existing.author_id !== ctx.userId && !can(ctx.role, PERMISSIONS.NOTE_DELETE)) {
    fail(403, 'forbidden', 'You cannot delete this note.', { note_id: noteId });
  }
  run(await ctx.db.from(T.notes).delete().eq('id', noteId).eq('company_id', ctx.companyId));
  return ok('Note deleted.');
}

// ====================================================================== routes (specific paths before /leads/:lead_id)
export const leadRoutes: Route[] = [
  { method: 'GET', path: '/leads', handler: listLeads },
  { method: 'POST', path: '/leads', handler: createLead },
  { method: 'GET', path: '/leads/export', handler: exportLeads },
  { method: 'POST', path: '/leads/import', handler: importLeads },
  { method: 'GET', path: '/leads/duplicates', handler: (ctx) => duplicateGroups(ctx) },
  { method: 'POST', path: '/leads/bulk', handler: bulkUpdate },
  { method: 'PATCH', path: '/leads/notes/:note_id', handler: updateNote },
  { method: 'DELETE', path: '/leads/notes/:note_id', handler: deleteNote },
  { method: 'GET', path: '/leads/:lead_id/duplicates', handler: leadDuplicates },
  { method: 'GET', path: '/leads/:lead_id/activities', handler: listActivities },
  { method: 'GET', path: '/leads/:lead_id/notes', handler: listNotes },
  { method: 'POST', path: '/leads/:lead_id/notes', handler: createNote },
  { method: 'PATCH', path: '/leads/:lead_id/notes/:note_id', handler: updateNote },
  { method: 'DELETE', path: '/leads/:lead_id/notes/:note_id', handler: deleteNote },
  { method: 'POST', path: '/leads/:lead_id/archive', handler: archiveLead },
  { method: 'POST', path: '/leads/:lead_id/restore', handler: restoreLead },
  { method: 'POST', path: '/leads/:lead_id/move', handler: moveLead },
  { method: 'GET', path: '/leads/:lead_id', handler: getLeadRoute },
  { method: 'PATCH', path: '/leads/:lead_id', handler: patchLead },
  { method: 'DELETE', path: '/leads/:lead_id', handler: deleteLead },
];
