// In-app notifications. Port of backend/app/routers/notifications.py (prefix /companies/{company_id}/notifications).
// Notifications are strictly per-user: row security only shows the caller's own rows; the user id filter is kept anyway.

import { PERMISSIONS } from '../lib/permissions';
import { T, fail, invalid, must, requirePerm, nowIso, type Ctx, type Route } from './core';

const NOTIFICATION_SELECT = 'id, company_id, user_id, type, title, body, link, metadata, read_at, created_at';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type FieldError = { field: string; message: string };

const REQUEST_INVALID = 'Some of the submitted values are invalid.';
const roleError = (ctx: Ctx) => `Your role (${ctx.role || 'none'}) does not allow this action.`;

/** int query parameter with FastAPI Query(ge, le) bounds. */
function queryInt(q: URLSearchParams, name: string, def: number, errors: FieldError[], ge?: number, le?: number): number {
  const raw = q.get(name);
  if (raw === null) return def;
  if (!/^\s*[+-]?\d+\s*$/.test(raw)) {
    errors.push({ field: `query.${name}`, message: 'Input should be a valid integer, unable to parse string as an integer' });
    return def;
  }
  const n = parseInt(raw, 10);
  if (ge !== undefined && n < ge) errors.push({ field: `query.${name}`, message: `Input should be greater than or equal to ${ge}` });
  else if (le !== undefined && n > le) errors.push({ field: `query.${name}`, message: `Input should be less than or equal to ${le}` });
  return n;
}

/** pydantic bool query parameter. */
function queryBool(q: URLSearchParams, name: string, def: boolean, errors: FieldError[]): boolean {
  const raw = q.get(name);
  if (raw === null) return def;
  const v = raw.trim().toLowerCase();
  if (['1', 'on', 't', 'true', 'y', 'yes'].includes(v)) return true;
  if (['0', 'off', 'f', 'false', 'n', 'no'].includes(v)) return false;
  errors.push({ field: `query.${name}`, message: 'Input should be a valid boolean, unable to interpret input' });
  return def;
}

async function unreadTotal(ctx: Ctx): Promise<number> {
  const { count, error } = await ctx.db.from(T.notifications).select('id', { count: 'exact', head: true })
    .eq('company_id', ctx.companyId).eq('user_id', ctx.userId).is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

async function listNotifications(ctx: Ctx, q: URLSearchParams) {
  const errors: FieldError[] = [];
  const unreadOnly = queryBool(q, 'unread_only', false, errors);
  const page = queryInt(q, 'page', 1, errors, 1);
  const page_size = queryInt(q, 'page_size', 20, errors, 1, 100);
  if (errors.length) invalid(REQUEST_INVALID, errors);
  requirePerm(ctx, PERMISSIONS.NOTIFICATION_READ, roleError(ctx));
  const type = q.get('type') || null;

  let query = ctx.db.from(T.notifications).select(NOTIFICATION_SELECT, { count: 'exact' })
    .eq('company_id', ctx.companyId).eq('user_id', ctx.userId);
  if (unreadOnly) query = query.is('read_at', null);
  if (type) query = query.eq('type', type);
  query = query.order('created_at', { ascending: false }).order('id', { ascending: true })
    .range((page - 1) * page_size, page * page_size - 1);

  const res = await query;
  const data = ((must(res) as Row[] | null) ?? []).filter((r) => r && typeof r === 'object');
  const total = res.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / page_size));

  let unread_total = 0;
  try { unread_total = await unreadTotal(ctx); } catch { unread_total = 0; }

  return {
    data,
    pagination: { page, page_size, total, pages, has_next: page < pages, has_prev: page > 1 },
    unread_total,
  };
}

async function markRead(ctx: Ctx, id: string) {
  requirePerm(ctx, PERMISSIONS.NOTIFICATION_READ, roleError(ctx));
  const found = must(
    await ctx.db.from(T.notifications).select(NOTIFICATION_SELECT)
      .eq('company_id', ctx.companyId).eq('user_id', ctx.userId).eq('id', id).limit(1),
  ) as Row[] | null;
  const record = found?.[0];
  if (!record) fail(404, 'not_found', 'Notification not found.', { notification_id: id });
  if ((record as Row).read_at) return record; // already read; idempotent

  const updated = must(
    await ctx.db.from(T.notifications).update({ read_at: nowIso() })
      .eq('id', id).eq('user_id', ctx.userId).select(NOTIFICATION_SELECT),
  ) as Row[] | null;
  return updated?.[0] ?? record;
}

export const notificationRoutes: Route[] = [
  { method: 'GET', path: '/notifications', handler: (ctx, req) => listNotifications(ctx, req.query) },
  {
    method: 'GET', path: '/notifications/unread-count',
    handler: async (ctx) => {
      requirePerm(ctx, PERMISSIONS.NOTIFICATION_READ, roleError(ctx));
      const { count, error } = await ctx.db.from(T.notifications).select('id', { count: 'exact', head: true })
        .eq('company_id', ctx.companyId).eq('user_id', ctx.userId).is('read_at', null);
      must({ data: null, error });
      return { unread: count ?? 0 };
    },
  },
  {
    method: 'POST', path: '/notifications/read-all',
    handler: async (ctx) => {
      requirePerm(ctx, PERMISSIONS.NOTIFICATION_READ, roleError(ctx));
      must(
        await ctx.db.from(T.notifications).update({ read_at: nowIso() })
          .eq('company_id', ctx.companyId).eq('user_id', ctx.userId).is('read_at', null),
      );
      return { ok: true, message: 'All notifications marked as read.' };
    },
  },
  { method: 'POST', path: '/notifications/:notification_id/read', handler: (ctx, req) => markRead(ctx, req.params.notification_id) },
  {
    method: 'DELETE', path: '/notifications/:notification_id',
    handler: async (ctx, req) => {
      requirePerm(ctx, PERMISSIONS.NOTIFICATION_READ, roleError(ctx));
      const id = req.params.notification_id;
      const data = must(
        await ctx.db.from(T.notifications).delete()
          .eq('company_id', ctx.companyId).eq('user_id', ctx.userId).eq('id', id).select('id'),
      ) as Row[] | null;
      if (!data?.length) fail(404, 'not_found', 'Notification not found.', { notification_id: id });
      return { ok: true, message: 'Notification deleted.' };
    },
  },
];
