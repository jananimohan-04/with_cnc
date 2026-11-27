// Follow-up scheduling: create, reschedule, complete, cancel and list.
// Port of backend/app/routers/follow_ups.py (prefix /companies/{company_id}/follow-ups) + schemas/follow_up.py.
//
// Notes on the port:
// - The "window" buckets (overdue / today / upcoming) use UTC day boundaries, exactly like the Python
//   (`datetime.now(timezone.utc).replace(hour=0, ...)`), not the browser's local day.
// - The original router never touched crm_leads.next_follow_up_at and never sent a notification for a
//   follow-up; the database trigger writes the follow_up_created / follow_up_completed activity rows.
//   Neither is added here.

import { can, PERMISSIONS } from '../lib/permissions';
import {
  T,
  fail,
  invalid,
  must,
  personMap,
  isMember,
  requirePerm,
  nowIso,
  type Ctx,
  type Route,
} from './core';

const FOLLOW_UP_SELECT =
  'id, company_id, lead_id, created_by, assigned_to, type, title, description, ' +
  'scheduled_at, duration_min, status, completed_at, cancelled_at, cancel_reason, ' +
  'created_at, updated_at';

const OUT_FIELDS = [
  'id', 'company_id', 'lead_id', 'created_by', 'assigned_to', 'type',
  'title', 'description', 'scheduled_at', 'duration_min', 'status',
  'completed_at', 'cancelled_at', 'cancel_reason', 'created_at', 'updated_at',
] as const;

const FOLLOW_UP_TYPES = ['call', 'email', 'meeting', 'demo', 'task', 'other'] as const;

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type FieldError = { field: string; message: string };

/** FastAPI's RequestValidationError message. */
const REQUEST_INVALID = 'Some of the submitted values are invalid.';

const roleError = (ctx: Ctx) => `Your role (${ctx.role || 'none'}) does not allow this action.`;

// ------------------------------------------------------------------ request validation (pydantic rules/messages)
const has = (o: Row, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function bodyObject(body: unknown, required: boolean, errors: FieldError[]): Row | null {
  if (body === undefined || body === null || body === '') {
    if (required) errors.push({ field: 'body', message: 'Field required' });
    return null;
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    errors.push({ field: 'body', message: 'Input should be a valid dictionary or object to extract fields from' });
    return null;
  }
  return body as Row;
}

/** pydantic str with optional length bounds; returns the value or undefined after recording an error. */
function checkStr(
  value: unknown, field: string, errors: FieldError[],
  opts: { nullable?: boolean; min?: number; max?: number } = {},
): string | null | undefined {
  if (value === null && opts.nullable) return null;
  if (typeof value !== 'string') {
    errors.push({ field, message: 'Input should be a valid string' });
    return undefined;
  }
  if (opts.min !== undefined && value.length < opts.min) {
    errors.push({ field, message: `String should have at least ${opts.min} character${opts.min === 1 ? '' : 's'}` });
    return undefined;
  }
  if (opts.max !== undefined && value.length > opts.max) {
    errors.push({ field, message: `String should have at most ${opts.max} characters` });
    return undefined;
  }
  return value;
}

function checkType(value: unknown, field: string, errors: FieldError[]): string | undefined {
  if (typeof value === 'string' && (FOLLOW_UP_TYPES as readonly string[]).includes(value)) return value;
  errors.push({ field, message: "Input should be 'call', 'email', 'meeting', 'demo', 'task' or 'other'" });
  return undefined;
}

/** pydantic int (lax) with ge=1, le=1440. */
function checkDuration(value: unknown, field: string, errors: FieldError[]): number | null | undefined {
  if (value === null) return null;
  let n: number;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) { errors.push({ field, message: 'Input should be a finite number' }); return undefined; }
    if (!Number.isInteger(value)) {
      errors.push({ field, message: 'Input should be a valid integer, got a number with a fractional part' });
      return undefined;
    }
    n = value;
  } else if (typeof value === 'string') {
    if (!/^\s*[+-]?\d+\s*$/.test(value)) {
      errors.push({ field, message: 'Input should be a valid integer, unable to parse string as an integer' });
      return undefined;
    }
    n = parseInt(value, 10);
  } else if (typeof value === 'boolean') {
    n = value ? 1 : 0;
  } else {
    errors.push({ field, message: 'Input should be a valid integer' });
    return undefined;
  }
  if (n < 1) { errors.push({ field, message: 'Input should be greater than or equal to 1' }); return undefined; }
  if (n > 1440) { errors.push({ field, message: 'Input should be less than or equal to 1440' }); return undefined; }
  return n;
}

const ISO_RE = /^(\d{4}-\d{2}-\d{2})(?:[Tt _](\d{2}:\d{2}(?::\d{2}(?:[.,]\d{1,9})?)?))?\s*(Z|z|[+-]\d{2}(?::?\d{2})?)?$/;

/** pydantic datetime: ISO 8601 string or unix timestamp. A value without an offset is taken as UTC (as
 *  Postgres does with the naive isoformat() the Python sent). Returns an ISO string. */
function checkDatetime(value: unknown, field: string, errors: FieldError[]): string | undefined {
  let ms: number | null = null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    ms = Math.abs(value) > 2e10 ? value : value * 1000;
  } else if (typeof value === 'string') {
    const m = ISO_RE.exec(value.trim());
    if (m) {
      const time = (m[2] ?? '00:00:00').replace(',', '.');
      let tz = m[3] ?? 'Z';
      if (tz === 'z') tz = 'Z';
      else if (/^[+-]\d{2}$/.test(tz)) tz += ':00';
      else if (/^[+-]\d{4}$/.test(tz)) tz = `${tz.slice(0, 3)}:${tz.slice(3)}`;
      const t = Date.parse(`${m[1]}T${time.length === 5 ? `${time}:00` : time.slice(0, 12)}${tz}`);
      if (!Number.isNaN(t)) ms = t;
    } else if (/^\s*[+-]?\d+(\.\d+)?\s*$/.test(value)) {
      const n = Number(value);
      ms = Math.abs(n) > 2e10 ? n : n * 1000;
    }
  }
  if (ms === null || Number.isNaN(new Date(ms).getTime())) {
    errors.push({ field, message: 'Input should be a valid datetime' });
    return undefined;
  }
  return new Date(ms).toISOString();
}

/** title validator: strip, must not be blank. */
function checkTitle(value: string | null | undefined, field: string, errors: FieldError[]): string | null | undefined {
  if (value === undefined || value === null) return value;
  const text = value.trim();
  if (!text) {
    errors.push({ field, message: 'Value error, title must not be blank' });
    return undefined;
  }
  return text;
}

function raiseIfAny(errors: FieldError[]) {
  if (errors.length) invalid(REQUEST_INVALID, errors);
}

/** FollowUpCreate */
function parseCreate(raw: unknown) {
  const errors: FieldError[] = [];
  const body = bodyObject(raw, true, errors);
  raiseIfAny(errors);
  const b = body as Row;

  let lead_id: string | undefined;
  if (!has(b, 'lead_id')) errors.push({ field: 'lead_id', message: 'Field required' });
  else lead_id = checkStr(b.lead_id, 'lead_id', errors) ?? undefined;

  const type = has(b, 'type') ? checkType(b.type, 'type', errors) : 'call';

  let title: string | null | undefined;
  if (!has(b, 'title')) errors.push({ field: 'title', message: 'Field required' });
  else title = checkTitle(checkStr(b.title, 'title', errors, { min: 1, max: 300 }), 'title', errors);

  let description: string | null | undefined = null;
  if (has(b, 'description')) {
    let d: unknown = b.description;
    if (typeof d === 'string') d = d.trim() || null; // mode="before" validator
    description = checkStr(d, 'description', errors, { nullable: true, max: 5000 });
  }

  let scheduled_at: string | undefined;
  if (!has(b, 'scheduled_at')) errors.push({ field: 'scheduled_at', message: 'Field required' });
  else scheduled_at = checkDatetime(b.scheduled_at, 'scheduled_at', errors);

  const duration_min = has(b, 'duration_min') ? checkDuration(b.duration_min, 'duration_min', errors) : null;
  const assigned_to = has(b, 'assigned_to') ? checkStr(b.assigned_to, 'assigned_to', errors, { nullable: true }) : null;

  raiseIfAny(errors);
  return {
    lead_id: lead_id as string,
    type: type as string,
    title: title as string,
    description: description ?? null,
    scheduled_at: scheduled_at as string,
    duration_min: duration_min ?? null,
    assigned_to: assigned_to ?? null,
  };
}

const UPDATE_FIELDS = ['type', 'title', 'description', 'scheduled_at', 'duration_min', 'assigned_to'];

/** FollowUpUpdate (extra="forbid", exclude_unset). */
function parseUpdate(raw: unknown): Row {
  const errors: FieldError[] = [];
  const body = bodyObject(raw, true, errors);
  raiseIfAny(errors);
  const b = body as Row;
  const out: Row = {};

  for (const key of Object.keys(b)) {
    if (!UPDATE_FIELDS.includes(key)) errors.push({ field: key, message: 'Extra inputs are not permitted' });
  }
  if (has(b, 'type')) {
    if (b.type === null) out.type = null;
    else { const v = checkType(b.type, 'type', errors); if (v !== undefined) out.type = v; }
  }
  if (has(b, 'title')) {
    const s = checkStr(b.title, 'title', errors, { nullable: true, max: 300 });
    const v = s === undefined ? undefined : checkTitle(s, 'title', errors);
    if (v !== undefined) out.title = v;
  }
  if (has(b, 'description')) {
    const v = checkStr(b.description, 'description', errors, { nullable: true, max: 5000 });
    if (v !== undefined) out.description = v;
  }
  if (has(b, 'scheduled_at')) {
    if (b.scheduled_at === null) out.scheduled_at = null;
    else { const v = checkDatetime(b.scheduled_at, 'scheduled_at', errors); if (v !== undefined) out.scheduled_at = v; }
  }
  if (has(b, 'duration_min')) {
    const v = checkDuration(b.duration_min, 'duration_min', errors);
    if (v !== undefined) out.duration_min = v;
  }
  if (has(b, 'assigned_to')) {
    const v = checkStr(b.assigned_to, 'assigned_to', errors, { nullable: true });
    if (v !== undefined) out.assigned_to = v;
  }
  raiseIfAny(errors);
  return out;
}

// ------------------------------------------------------------------ helpers
function windowOf(record: Row): 'overdue' | 'today' | 'upcoming' | 'done' | 'cancelled' {
  if (record.status === 'cancelled') return 'cancelled';
  if (record.status === 'completed') return 'done';
  const when = record.scheduled_at;
  if (!when) return 'upcoming';
  const stamp = new Date(String(when)).getTime();
  const { start, end } = utcToday();
  if (stamp < start.getTime()) return 'overdue';
  if (stamp < end.getTime()) return 'today';
  return 'upcoming';
}

function utcToday() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end };
}

async function getFollowUp(ctx: Ctx, id: string): Promise<Row> {
  const data = must(
    await ctx.db.from(T.followUps).select(FOLLOW_UP_SELECT)
      .eq('company_id', ctx.companyId).eq('id', id).limit(1),
  ) as Row[] | null;
  const record = data?.[0];
  if (!record) fail(404, 'not_found', 'Follow-up not found.', { follow_up_id: id });
  return record as Row;
}

function mayTouch(ctx: Ctx, record: Row): boolean {
  if (can(ctx.role, PERMISSIONS.FOLLOW_UP_UPDATE_ANY)) return true;
  if (!can(ctx.role, PERMISSIONS.FOLLOW_UP_UPDATE_OWN)) return false;
  return !!ctx.userId && (record.assigned_to === ctx.userId || record.created_by === ctx.userId);
}

function checkCanTouch(ctx: Ctx, record: Row) {
  if (!mayTouch(ctx, record)) {
    fail(403, 'forbidden', `As a ${ctx.role} you can only change follow-ups assigned to you or that you created.`,
      { follow_up_id: record.id, role: ctx.role });
  }
}

async function validateAssignedTo(ctx: Ctx, userId: string | null | undefined) {
  if (!userId) return;
  if (!(await isMember(ctx, userId))) {
    fail(422, 'validation_error', 'That person is not an active member of this company.', { assigned_to: userId });
  }
}

/** Attach assignee, creator, a compact lead summary and the window bucket (FollowUpOut + window). */
async function serialise(ctx: Ctx, records: Row[]): Promise<Row[]> {
  if (!records.length) return [];
  const people = await personMap(ctx).catch(() => new Map<string, unknown>());
  const leadIds = [...new Set(records.map((r) => r.lead_id).filter(Boolean).map(String))];
  const leads = new Map<string, Row>();
  if (leadIds.length) {
    const data = must(
      await ctx.db.from(T.leads).select('id, full_name, email, phone, status, priority, organization')
        .eq('company_id', ctx.companyId).in('id', leadIds),
    ) as Row[] | null;
    for (const lead of data ?? []) leads.set(String(lead.id), lead);
  }
  return records.map((record) => {
    const out: Row = {};
    for (const k of OUT_FIELDS) out[k] = record[k] ?? null;
    out.lead = leads.get(String(record.lead_id)) ?? null;
    out.assignee = record.assigned_to ? people.get(String(record.assigned_to)) ?? null : null;
    out.creator = record.created_by ? people.get(String(record.created_by)) ?? null : null;
    out.window = windowOf(record);
    return out;
  });
}

async function updateOne(ctx: Ctx, id: string, patch: Row): Promise<Row> {
  const data = must(
    await ctx.db.from(T.followUps).update(patch)
      .eq('id', id).eq('company_id', ctx.companyId).select(FOLLOW_UP_SELECT),
  ) as Row[] | null;
  const updated = data?.[0];
  if (!updated) fail(404, 'not_found', 'Follow-up not found.', { follow_up_id: id });
  return updated as Row;
}

async function windowCounts(ctx: Ctx): Promise<Record<string, number>> {
  const { data, error } = await ctx.db.from(T.followUps).select('id, status, scheduled_at')
    .eq('company_id', ctx.companyId).in('status', ['pending'])
    .order('scheduled_at', { ascending: true }).limit(2000);
  if (error) return {};
  const counts: Record<string, number> = { overdue: 0, today: 0, upcoming: 0 };
  for (const record of (data ?? []) as Row[]) {
    const w = windowOf(record);
    counts[w] = (counts[w] ?? 0) + 1;
  }
  return counts;
}

/** services.lead_query.sanitise_search */
const sanitiseSearch = (term: string) => (term || '').replace(/["\\,()%]|\s+/g, ' ').trim().slice(0, 120);

/** A plain `int` query parameter (FastAPI parsing). */
function queryInt(q: URLSearchParams, name: string, def: number, errors: FieldError[]): number {
  const raw = q.get(name);
  if (raw === null) return def;
  if (!/^\s*[+-]?\d+\s*$/.test(raw)) {
    errors.push({ field: `query.${name}`, message: 'Input should be a valid integer, unable to parse string as an integer' });
    return def;
  }
  return parseInt(raw, 10);
}

// ------------------------------------------------------------------ handlers
async function listFollowUps(ctx: Ctx, q: URLSearchParams) {
  requirePerm(ctx, PERMISSIONS.FOLLOW_UP_READ, roleError(ctx));
  const errors: FieldError[] = [];
  const page = queryInt(q, 'page', 1, errors);
  const page_size = queryInt(q, 'page_size', 50, errors);
  raiseIfAny(errors);
  if (page < 1 || page_size < 1) invalid('page and page_size must be at least 1.');

  const window = q.get('window') || null;
  const status = q.getAll('status').filter(Boolean);
  const leadId = q.get('lead_id') || null;
  const assignedTo = q.getAll('assigned_to').filter(Boolean);
  const type = q.get('type') || null;
  const search = q.get('search') || null;

  let query = ctx.db.from(T.followUps).select(FOLLOW_UP_SELECT, { count: 'exact' }).eq('company_id', ctx.companyId);

  if (status.length) query = query.in('status', status);
  else if (window && ['done', 'completed'].includes(window.toLowerCase())) query = query.eq('status', 'completed');
  else if (window && window.toLowerCase() === 'cancelled') query = query.eq('status', 'cancelled');
  else query = query.in('status', ['pending']); // default: everything that still needs doing

  if (leadId) query = query.eq('lead_id', leadId);
  if (assignedTo.length) query = query.in('assigned_to', assignedTo);
  if (type) query = query.eq('type', type);
  if (search) {
    const term = sanitiseSearch(search);
    if (term) query = query.or(`title.ilike.*${term}*,description.ilike.*${term}*`);
  }

  const normalised = (window || 'all').toLowerCase();
  if (normalised === 'overdue') query = query.lt('scheduled_at', nowIso());
  else if (normalised === 'upcoming') query = query.gte('scheduled_at', nowIso());
  else if (normalised === 'today') {
    const { start, end } = utcToday();
    query = query.gte('scheduled_at', start.toISOString()).lt('scheduled_at', end.toISOString());
  }

  query = query.order('scheduled_at', { ascending: true }).order('id', { ascending: true })
    .range((page - 1) * page_size, page * page_size - 1);

  const res = await query;
  const records = ((must(res) as Row[] | null) ?? []).filter((r) => r && typeof r === 'object');
  const total = res.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / page_size));

  return {
    data: await serialise(ctx, records),
    pagination: { page, page_size, total, pages, has_next: page < pages, has_prev: page > 1 },
    windows: await windowCounts(ctx),
  };
}

async function createFollowUp(ctx: Ctx, raw: unknown) {
  const payload = parseCreate(raw); // FastAPI validates the body before the handler runs
  requirePerm(ctx, PERMISSIONS.FOLLOW_UP_CREATE, roleError(ctx));

  const leads = must(
    await ctx.db.from(T.leads).select('id, assigned_to, created_by')
      .eq('company_id', ctx.companyId).eq('id', payload.lead_id).is('deleted_at', null).limit(1),
  ) as Row[] | null;
  const lead = leads?.[0];
  if (!lead) fail(404, 'not_found', 'Lead not found.', { lead_id: payload.lead_id });

  if (payload.assigned_to) await validateAssignedTo(ctx, payload.assigned_to);

  const body: Row = {
    ...payload,
    company_id: ctx.companyId,
    created_by: ctx.userId,
    assigned_to: payload.assigned_to || (lead as Row).assigned_to || ctx.userId,
  };
  const data = must(await ctx.db.from(T.followUps).insert(body).select(FOLLOW_UP_SELECT)) as Row[] | null;
  const record = data?.[0];
  if (!record) fail(404, 'not_found', 'Follow-up could not be saved.');
  return (await serialise(ctx, [record as Row]))[0];
}

async function patchFollowUp(ctx: Ctx, id: string, raw: unknown) {
  const body = parseUpdate(raw);
  const existing = await getFollowUp(ctx, id);
  checkCanTouch(ctx, existing);
  if (existing.status !== 'pending') {
    fail(422, 'validation_error', 'Only pending follow-ups can be edited. Reopen it first.', { status: existing.status });
  }
  if (body.assigned_to) await validateAssignedTo(ctx, body.assigned_to);
  if (!Object.keys(body).length) return (await serialise(ctx, [existing]))[0];
  return (await serialise(ctx, [await updateOne(ctx, id, body)]))[0];
}

async function rescheduleFollowUp(ctx: Ctx, id: string, raw: unknown) {
  // FollowUpReschedule (validated before the handler runs, as FastAPI does)
  const errors: FieldError[] = [];
  const b = bodyObject(raw, true, errors);
  let scheduled_at: string | undefined;
  if (b) {
    if (!has(b, 'scheduled_at')) errors.push({ field: 'scheduled_at', message: 'Field required' });
    else scheduled_at = checkDatetime(b.scheduled_at, 'scheduled_at', errors);
  }
  raiseIfAny(errors);

  const existing = await getFollowUp(ctx, id);
  checkCanTouch(ctx, existing);
  if (existing.status !== 'pending') {
    fail(422, 'validation_error', 'Only pending follow-ups can be rescheduled.', { status: existing.status });
  }
  return (await serialise(ctx, [await updateOne(ctx, id, { scheduled_at })]))[0];
}

async function completeFollowUp(ctx: Ctx, id: string) {
  const existing = await getFollowUp(ctx, id);
  checkCanTouch(ctx, existing);
  if (existing.status !== 'pending') {
    fail(422, 'validation_error', 'This follow-up is not pending.', { status: existing.status });
  }
  const updated = await updateOne(ctx, id, { status: 'completed', completed_at: nowIso(), cancel_reason: null });
  return (await serialise(ctx, [updated]))[0];
}

async function cancelFollowUp(ctx: Ctx, id: string, raw: unknown) {
  // FollowUpCancel | None (validated before the handler runs)
  const errors: FieldError[] = [];
  const b = bodyObject(raw, false, errors);
  let cancel_reason: string | null = null;
  if (b && has(b, 'cancel_reason')) {
    cancel_reason = checkStr(b.cancel_reason, 'cancel_reason', errors, { nullable: true, max: 500 }) ?? null;
  }
  raiseIfAny(errors);

  const existing = await getFollowUp(ctx, id);
  checkCanTouch(ctx, existing);
  if (existing.status !== 'pending') {
    fail(422, 'validation_error', 'This follow-up is not pending.', { status: existing.status });
  }
  const updated = await updateOne(ctx, id, { status: 'cancelled', cancelled_at: nowIso(), cancel_reason });
  return (await serialise(ctx, [updated]))[0];
}

async function deleteFollowUp(ctx: Ctx, id: string) {
  const existing = await getFollowUp(ctx, id);
  if (!can(ctx.role, PERMISSIONS.FOLLOW_UP_DELETE) && existing.created_by !== ctx.userId) {
    fail(403, 'forbidden', 'You can only delete follow-ups you created.', { follow_up_id: id });
  }
  const data = must(
    await ctx.db.from(T.followUps).delete().eq('id', id).eq('company_id', ctx.companyId).select('id'),
  ) as Row[] | null;
  // Row security only lets an owner / admin delete; the original API reported success even when nothing was
  // removed. Say so instead of pretending.
  if (!data?.length) fail(403, 'forbidden', 'You do not have permission to perform this action.', { follow_up_id: id });
  return { ok: true, message: 'Follow-up deleted.' };
}

export const followUpRoutes: Route[] = [
  { method: 'GET', path: '/follow-ups', handler: (ctx, req) => listFollowUps(ctx, req.query) },
  { method: 'POST', path: '/follow-ups', handler: (ctx, req) => createFollowUp(ctx, req.body) },
  {
    method: 'GET', path: '/follow-ups/:follow_up_id',
    handler: async (ctx, req) => {
      requirePerm(ctx, PERMISSIONS.FOLLOW_UP_READ, roleError(ctx));
      return (await serialise(ctx, [await getFollowUp(ctx, req.params.follow_up_id)]))[0];
    },
  },
  { method: 'PATCH', path: '/follow-ups/:follow_up_id', handler: (ctx, req) => patchFollowUp(ctx, req.params.follow_up_id, req.body) },
  { method: 'POST', path: '/follow-ups/:follow_up_id/reschedule', handler: (ctx, req) => rescheduleFollowUp(ctx, req.params.follow_up_id, req.body) },
  { method: 'POST', path: '/follow-ups/:follow_up_id/complete', handler: (ctx, req) => completeFollowUp(ctx, req.params.follow_up_id) },
  { method: 'POST', path: '/follow-ups/:follow_up_id/cancel', handler: (ctx, req) => cancelFollowUp(ctx, req.params.follow_up_id, req.body) },
  { method: 'DELETE', path: '/follow-ups/:follow_up_id', handler: (ctx, req) => deleteFollowUp(ctx, req.params.follow_up_id) },
];
