// Leads CRM inside BI: lead capture (Facebook / Instagram lead ads, LinkedIn lead-gen forms, website form) —
// originally routers/integrations.py. Everything that needs a provider secret runs on the BI server
// (server/crm/routes.cjs, /api/crm/...): these handlers forward the page's calls there with the person's sign-in
// token, so the Meta / LinkedIn secrets and the token encryption key never reach the browser. The activity log is
// read straight from crm_integration_logs (row security: owner / admin / manager).

import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/retail/api';
import { PERMISSIONS } from '../lib/permissions';
import { dbError, fail, pageParams, pageResult, requirePerm, type Ctx, type Route } from './core';

/** The BI server: same site on the web, the website itself from the desktop / phone apps. */
const SERVER = String(API_BASE || '').replace(/\/+$/, '');

const SETUP_SQL_MESSAGE = 'Lead capture is not set up in the database yet. Please ask your administrator to run the SQL file 20261203000000_crm_integrations.sql, then refresh this page.';

async function server<T>(ctx: Ctx, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) fail(401, 'unauthenticated', 'Your BI session has ended. Sign in again.');
  let res: Response;
  try {
    res = await fetch(`${SERVER}/api/crm/companies/${encodeURIComponent(ctx.companyId)}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    return fail(503, 'unavailable', 'Could not reach the BI server. Check your internet connection.');
  }
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) {
    if (!json || typeof json.message !== 'string') {
      // an HTML page or nothing at all: the server does not have lead capture yet
      fail(res.status === 404 ? 503 : res.status, 'unavailable', 'Lead capture is not available on the BI server yet. Please try again after the next update.');
    }
    if (json.code === 'setup_needed') fail(503, 'setup_needed', SETUP_SQL_MESSAGE);
    fail(res.status, String(json.code || 'error'), json.message as string, (json.details as Record<string, unknown>) || undefined);
  }
  return json as T;
}

const read = (ctx: Ctx) => requirePerm(ctx, PERMISSIONS.INTEGRATION_READ, 'Integrations are managed by owners, admins and managers.');
const manage = (ctx: Ctx) => requirePerm(ctx, PERMISSIONS.INTEGRATION_MANAGE, 'Integrations are managed by owners, admins and managers.');

export const integrationRoutes: Route[] = [
  {
    method: 'GET', path: '/integrations',
    handler: async (ctx) => { read(ctx); return server(ctx, 'GET', '/integrations'); },
  },
  {
    method: 'GET', path: '/integrations/logs',
    handler: async (ctx, req) => {
      read(ctx);
      const { page, page_size, from, to } = pageParams(req.query, 50);
      let q = ctx.db.from('crm_integration_logs')
        .select('id, company_id, connection_id, provider, level, event, message, status_code, duration_ms, payload, created_at', { count: 'exact' })
        .eq('company_id', ctx.companyId);
      const provider = req.query.get('provider');
      const level = req.query.get('level');
      if (provider) q = q.eq('provider', provider);
      if (level) q = q.eq('level', level);
      const { data, error, count } = await q.order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to);
      if (error) {
        if (/crm_integration_logs|PGRST205|42P01|schema cache|does not exist/i.test(`${error.code ?? ''} ${error.message ?? ''}`)) fail(503, 'setup_needed', SETUP_SQL_MESSAGE);
        dbError(error);
      }
      return pageResult(data ?? [], count ?? 0, page, page_size);
    },
  },
  {
    method: 'GET', path: '/integrations/:provider',
    handler: async (ctx, req) => { read(ctx); return server(ctx, 'GET', `/integrations/${encodeURIComponent(req.params.provider)}`); },
  },
  {
    method: 'POST', path: '/integrations/:provider/oauth/start',
    handler: async (ctx, req) => {
      manage(ctx);
      // after the provider sends the browser back, the server returns it to this site's /crm/integrations
      return server(ctx, 'POST', `/integrations/${encodeURIComponent(req.params.provider)}/oauth/start`, { return_origin: window.location.origin });
    },
  },
  {
    method: 'POST', path: '/integrations/:provider/disconnect',
    handler: async (ctx, req) => { manage(ctx); return server(ctx, 'POST', `/integrations/${encodeURIComponent(req.params.provider)}/disconnect`, {}); },
  },
  {
    method: 'POST', path: '/integrations/:provider/sync',
    handler: async (ctx, req) => { manage(ctx); return server(ctx, 'POST', `/integrations/${encodeURIComponent(req.params.provider)}/sync`, {}); },
  },
];
