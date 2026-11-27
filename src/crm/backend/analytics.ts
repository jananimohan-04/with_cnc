// Analytics computed from real rows. Port of backend/app/routers/analytics.py + services/analytics.py.
// Rows are fetched under the caller's session (row security applies) in pages of 1000 and aggregated here.
// All day / week / month buckets are UTC, as in the Python.

import { PERMISSIONS } from '../lib/permissions';
import { T, dbError, invalid, people, requirePerm, type Ctx, type Route } from './core';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type FieldError = { field: string; message: string };

const MAX_ROWS_FOR_ANALYSIS = 50_000;
const CHUNK = 1000;
const PIPELINE_STATUSES = ['new', 'contacted', 'follow_up', 'qualified', 'proposal', 'converted'] as const;
const TERMINAL_STATUSES = ['converted', 'lost'];
const GRANULARITIES = ['day', 'week', 'month', 'quarter'];
const DAY = 86_400_000;

const REQUEST_INVALID = 'Some of the submitted values are invalid.';
const roleError = (ctx: Ctx) => `Your role (${ctx.role || 'none'}) does not allow this action.`;

// ------------------------------------------------------------------ helpers
/** Python round(x, 4) (close enough: half-away rather than banker's on exact ties). */
const round4 = (x: number) => Math.round(x * 10_000) / 10_000;
const ratio = (a: number, b: number) => (b ? round4(a / b) : null);

function parse(value: unknown): Date | null {
  if (!value) return null;
  let s = String(value);
  if (!/(Z|z|[+-]\d{2}(:?\d{2})?)$/.test(s)) s += 'Z'; // naive -> UTC
  const d = new Date(s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

function bucketKey(when: Date, granularity: string): string {
  if (granularity === 'day') return ymd(when);
  if (granularity === 'week') {
    const weekday = (when.getUTCDay() + 6) % 7; // Monday = 0
    return ymd(new Date(when.getTime() - weekday * DAY));
  }
  if (granularity === 'quarter') return `${when.getUTCFullYear()}-Q${Math.floor(when.getUTCMonth() / 3) + 1}`;
  return `${when.getUTCFullYear()}-${pad(when.getUTCMonth() + 1)}`;
}

/** Counter.most_common(): count desc, ties in first-seen order. */
function mostCommon(counts: Map<string, number>, n?: number): [string, number][] {
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return n === undefined ? sorted : sorted.slice(0, n);
}

function inc(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

async function fetchAll(
  build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < MAX_ROWS_FOR_ANALYSIS; from += CHUNK) {
    const to = Math.min(from + CHUNK, MAX_ROWS_FOR_ANALYSIS) - 1;
    const { data, error } = await build(from, to);
    if (error) throw error;
    const rows = ((data ?? []) as Row[]).filter((r) => r && typeof r === 'object');
    out.push(...rows);
    if (rows.length < to - from + 1) break;
  }
  return out;
}

const since = (days: number) => new Date(Date.now() - days * DAY).toISOString();

async function fetchLeads(ctx: Ctx, days: number): Promise<Row[]> {
  const from = since(days);
  try {
    return await fetchAll((a, b) =>
      ctx.db.from(T.leads)
        .select('id, status, priority, source, campaign, assigned_to, created_by, tags, created_at, updated_at, next_follow_up_at, archived_at, organization')
        .eq('company_id', ctx.companyId).is('deleted_at', null).gte('created_at', from)
        .order('created_at', { ascending: true }).order('id', { ascending: true })
        .range(a, b));
  } catch (e) {
    return dbError(e as { code?: string; message?: string });
  }
}

async function fetchFollowUps(ctx: Ctx, days: number): Promise<Row[]> {
  const from = since(days);
  try {
    return await fetchAll((a, b) =>
      ctx.db.from(T.followUps)
        .select('id, lead_id, assigned_to, status, type, scheduled_at, completed_at, created_at')
        .eq('company_id', ctx.companyId).gte('created_at', from)
        .order('created_at', { ascending: true }).order('id', { ascending: true })
        .range(a, b));
  } catch {
    return []; // follow-ups are supplementary
  }
}

/** Active CRM members with a display name (replaces company_members + profiles). */
async function fetchMembers(ctx: Ctx): Promise<{ user_id: string; role: string; name: string }[]> {
  try {
    return (await people(ctx))
      .filter((p) => p.role)
      .map((p) => ({ user_id: p.id, role: p.role as string, name: p.full_name || p.email || 'Unknown' }));
  } catch {
    return [];
  }
}

const splitActiveArchived = (leads: Row[]) => [leads.filter((l) => !l.archived_at), leads.filter((l) => l.archived_at)];

// ------------------------------------------------------------------ services
async function overview(ctx: Ctx, days: number, granularity: string) {
  const now = new Date();
  const [leads, followUps, members] = await Promise.all([fetchLeads(ctx, days), fetchFollowUps(ctx, days), fetchMembers(ctx)]);

  const [active, archived] = splitActiveArchived(leads);
  const converted = active.filter((l) => l.status === 'converted');
  const lost = active.filter((l) => l.status === 'lost');
  const inPipeline = active.filter((l) => !TERMINAL_STATUSES.includes(l.status));
  const wonOrLost = converted.length + lost.length;

  const startToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const endToday = startToday + DAY;
  const t = (v: unknown) => parse(v)?.getTime() ?? null;

  const createdToday = active.filter((l) => { const s = t(l.created_at); return s !== null && s >= startToday && s < endToday; });
  const createdThisWeek = active.filter((l) => { const s = t(l.created_at); return s !== null && s >= startToday - 7 * DAY; });

  const pending = followUps.filter((f) => f.status === 'pending');
  const overdue = pending.filter((f) => { const s = t(f.scheduled_at); return s !== null && s < startToday; });
  const dueToday = pending.filter((f) => { const s = t(f.scheduled_at); return s !== null && s >= startToday && s < endToday; });
  const upcoming = pending.filter((f) => { const s = t(f.scheduled_at); return s !== null && s >= endToday; });
  const completed = followUps.filter((f) => f.status === 'completed');

  const byStatus = new Map<string, number>();
  const byPriority = new Map<string, number>();
  const bySource = new Map<string, number>();
  const tags = new Map<string, number>();
  const series = new Map<string, { created: number; converted: number }>();
  const bucket = (k: string) => {
    let b = series.get(k);
    if (!b) { b = { created: 0, converted: 0 }; series.set(k, b); }
    return b;
  };

  for (const lead of active) {
    inc(byStatus, lead.status || 'unknown');
    inc(byPriority, lead.priority || 'unknown');
    inc(bySource, lead.source || 'unknown');
    let stamp = parse(lead.created_at);
    if (stamp) bucket(bucketKey(stamp, granularity)).created += 1;
    if (lead.status === 'converted') {
      stamp = parse(lead.updated_at) ?? stamp;
      if (stamp) bucket(bucketKey(stamp, granularity)).converted += 1;
    }
    for (const tag of (lead.tags ?? []) as unknown[]) inc(tags, String(tag));
  }

  const timeline = [...series.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([period, v]) => ({ period, ...v }));

  return {
    window_days: days,
    generated_at: now.toISOString(),
    granularity,
    totals: {
      leads: active.length,
      archived: archived.length,
      in_pipeline: inPipeline.length,
      converted: converted.length,
      lost: lost.length,
      conversion_rate: ratio(converted.length, wonOrLost),
      created_today: createdToday.length,
      created_this_week: createdThisWeek.length,
      team_size: members.length,
    },
    by_status: ['new', 'contacted', 'follow_up', 'qualified', 'proposal', 'converted', 'lost']
      .map((status) => ({ status, count: byStatus.get(status) ?? 0 })),
    by_priority: ['urgent', 'high', 'medium', 'low'].map((priority) => ({ priority, count: byPriority.get(priority) ?? 0 })),
    by_source: mostCommon(bySource).map(([source, count]) => ({ source, count })),
    top_tags: mostCommon(tags, 20).map(([tag, count]) => ({ tag, count })),
    follow_ups: {
      overdue: overdue.length,
      due_today: dueToday.length,
      upcoming: upcoming.length,
      completed: completed.length,
      completion_rate: ratio(completed.length, followUps.length),
    },
    timeline,
  };
}

async function pipeline(ctx: Ctx, days: number) {
  const [active] = splitActiveArchived(await fetchLeads(ctx, days));
  const current = new Map<string, number>();
  for (const l of active) inc(current, l.status || 'unknown');
  const stages = [...PIPELINE_STATUSES, 'lost'].map((status) => ({ status, count: current.get(status) ?? 0 }));

  // a lead in `proposal` must have passed through `qualified`, etc.
  const reached = new Map<string, number>();
  for (const lead of active) {
    if (lead.status === 'lost') continue;
    const idx = (PIPELINE_STATUSES as readonly string[]).indexOf(lead.status);
    if (idx >= 0) for (const stage of PIPELINE_STATUSES.slice(0, idx + 1)) inc(reached, stage);
  }
  const funnel: { status: string; reached: number; step_conversion: number | null }[] = [];
  let previous: number | null = null;
  for (const stage of PIPELINE_STATUSES) {
    const count = reached.get(stage) ?? 0;
    funnel.push({ status: stage, reached: count, step_conversion: previous ? round4(count / previous) : null });
    previous = count;
  }
  return {
    window_days: days,
    generated_at: new Date().toISOString(),
    stages,
    funnel,
    note: "'reached' counts leads that have attained at least that stage. Step conversion compares each stage against the one before it.",
  };
}

async function sources(ctx: Ctx, days: number) {
  const [active] = splitActiveArchived(await fetchLeads(ctx, days));
  const grouped = new Map<string, { source: string; campaign: string; group: Row[] }>();
  for (const lead of active) {
    const source = String(lead.source || 'unknown');
    const campaign = String(lead.campaign || '');
    const key = JSON.stringify([source, campaign]);
    let g = grouped.get(key);
    if (!g) { g = { source, campaign, group: [] }; grouped.set(key, g); }
    g.group.push(lead);
  }
  const result = [...grouped.values()].map(({ source, campaign, group }) => {
    const converted = group.filter((l) => l.status === 'converted').length;
    const wonOrLost = group.filter((l) => TERMINAL_STATUSES.includes(l.status)).length;
    return { source, campaign: campaign || null, leads: group.length, converted, conversion_rate: ratio(converted, wonOrLost) };
  });
  result.sort((a, b) => b.leads - a.leads || (a.source < b.source ? -1 : a.source > b.source ? 1 : 0));
  return { window_days: days, generated_at: new Date().toISOString(), sources: result };
}

async function teamPerformance(ctx: Ctx, days: number) {
  const [leads, followUps, members] = await Promise.all([fetchLeads(ctx, days), fetchFollowUps(ctx, days), fetchMembers(ctx)]);
  const [active] = splitActiveArchived(leads);

  const byAssignee = new Map<string, Row[]>();
  for (const lead of active) {
    const k = String(lead.assigned_to || '');
    const list = byAssignee.get(k); if (list) list.push(lead); else byAssignee.set(k, [lead]);
  }
  const fuByAssignee = new Map<string, Row[]>();
  for (const fu of followUps) {
    const k = String(fu.assigned_to || '');
    const list = fuByAssignee.get(k); if (list) list.push(fu); else fuByAssignee.set(k, [fu]);
  }

  const rows = members.map((m) => {
    const owned = byAssignee.get(m.user_id) ?? [];
    const fups = fuByAssignee.get(m.user_id) ?? [];
    const converted = owned.filter((l) => l.status === 'converted').length;
    const wonOrLost = owned.filter((l) => TERMINAL_STATUSES.includes(l.status)).length;
    const completed = fups.filter((f) => f.status === 'completed').length;
    return {
      user_id: m.user_id,
      name: m.name,
      role: m.role,
      leads_assigned: owned.length,
      converted,
      conversion_rate: ratio(converted, wonOrLost),
      follow_ups_total: fups.length,
      follow_ups_completed: completed,
      follow_up_completion_rate: ratio(completed, fups.length),
    };
  });
  rows.sort((a, b) => b.leads_assigned - a.leads_assigned);

  return {
    window_days: days,
    generated_at: new Date().toISOString(),
    members: rows,
    unassigned_leads: (byAssignee.get('') ?? []).length,
  };
}

// ------------------------------------------------------------------ query parsing (FastAPI Query rules)
function parseDays(ctx: Ctx, q: URLSearchParams, def: number, withGranularity = false) {
  const errors: FieldError[] = [];
  let days = def;
  const raw = q.get('days');
  if (raw !== null) {
    if (!/^\s*[+-]?\d+\s*$/.test(raw)) {
      errors.push({ field: 'query.days', message: 'Input should be a valid integer, unable to parse string as an integer' });
    } else {
      days = parseInt(raw, 10);
      if (days < 1) errors.push({ field: 'query.days', message: 'Input should be greater than or equal to 1' });
      else if (days > 3650) errors.push({ field: 'query.days', message: 'Input should be less than or equal to 3650' });
    }
  }
  let granularity = 'day';
  if (withGranularity) {
    const g = q.get('granularity');
    if (g !== null) {
      if (GRANULARITIES.includes(g)) granularity = g;
      else errors.push({ field: 'query.granularity', message: "Input should be 'day', 'week', 'month' or 'quarter'" });
    }
  }
  if (errors.length) invalid(REQUEST_INVALID, errors);
  requirePerm(ctx, PERMISSIONS.ANALYTICS_READ, roleError(ctx));
  return { days, granularity };
}

export const analyticsRoutes: Route[] = [
  {
    method: 'GET', path: '/analytics/overview',
    handler: (ctx, req) => { const { days, granularity } = parseDays(ctx, req.query, 30, true); return overview(ctx, days, granularity); },
  },
  { method: 'GET', path: '/analytics/pipeline', handler: (ctx, req) => pipeline(ctx, parseDays(ctx, req.query, 90).days) },
  { method: 'GET', path: '/analytics/sources', handler: (ctx, req) => sources(ctx, parseDays(ctx, req.query, 90).days) },
  { method: 'GET', path: '/analytics/team', handler: (ctx, req) => teamPerformance(ctx, parseDays(ctx, req.query, 90).days) },
];
