// Leads CRM inside BI: identity, company, settings and team routes (originally routers/auth.py, companies.py, team.py).
// People, companies and sign-in belong to BI, so:
//   * /auth/me and /companies describe the signed-in BI user and the BI company selected in BI;
//   * the Team page lists the company's BI people and changes only their Leads CRM role (crm_set_role);
//     there are no e-mail invitations: a person is added in BI (Access Management) first;
//   * company details and passwords are managed in BI (Google sign-in has no password).

import { can, PERMISSIONS, permissionsFor } from '../lib/permissions';
import { ROLES, type Role } from '../lib/types';
import { clearPeople, dbError, fail, must, notFound, people, requirePerm, T, type Ctx, type Route } from './core';

interface BiCompany {
  id: string; company_name: string; code: string | null; industry: string | null; phone: string | null; email: string | null;
  address: string | null; city: string | null; state: string | null; status: string | null; created_at: string | null; updated_at: string | null;
}

async function biCompany(ctx: Ctx): Promise<BiCompany> {
  const { data, error } = await ctx.db.from('companies').select('*').eq('id', ctx.companyId).maybeSingle();
  if (error) dbError(error);
  if (!data) notFound('Company');
  return data as BiCompany;
}

/** BI company in the shape of the Leads `Company` type. */
export function companyOut(c: BiCompany, role: Role) {
  const now = new Date().toISOString();
  return {
    id: c.id,
    name: c.company_name,
    slug: (c.code || c.company_name || 'company').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'company',
    owner_id: '',
    industry: c.industry ?? null,
    website: null,
    phone: c.phone ?? null,
    address: [c.address, c.city, c.state].filter(Boolean).join(', ') || null,
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    logo_url: null,
    is_active: (c.status ?? 'Active') === 'Active',
    created_at: c.created_at ?? now,
    updated_at: c.updated_at ?? c.created_at ?? now,
    role,
  };
}

async function me(ctx: Ctx) {
  const list = await people(ctx);
  const p = list.find((x) => x.id === ctx.userId);
  const { data: auth } = await ctx.db.auth.getUser();
  const email = p?.email ?? auth.user?.email ?? null;
  const now = new Date().toISOString();
  const profile = {
    id: ctx.userId, email, full_name: p?.full_name ?? (auth.user?.user_metadata?.full_name as string | undefined) ?? '',
    avatar_url: (auth.user?.user_metadata?.avatar_url as string | undefined) ?? null, phone: null,
    is_super: p?.bi_role === 'SUPER_ADMIN', created_at: auth.user?.created_at ?? now, updated_at: now,
  };
  const company = companyOut(await biCompany(ctx), ctx.role);
  return {
    id: ctx.userId, user_id: ctx.userId, email, profile, companies: [company], active_company: company, role: ctx.role,
    permissions: [...permissionsFor(ctx.role)].sort(),
  };
}

const ROLE_TEXT: Record<Role, string> = {
  owner: 'Full control (BI Super Admin / Company Admin).',
  admin: 'Manages the team, settings and every lead.',
  manager: 'Works on every lead and follow-up, manages integrations.',
  salesperson: 'Creates leads and works on their own leads and follow-ups.',
  viewer: 'Read-only access.',
};
const roleDescription = (role: Role) => ({ role, label: role[0].toUpperCase() + role.slice(1), description: ROLE_TEXT[role], permissions: [...permissionsFor(role)].sort() });

/** A BI person as a Leads `CompanyMember` row (id = their auth user id). */
function memberOut(ctx: Ctx, p: { id: string; email: string | null; full_name: string; role: Role | null }) {
  const now = new Date().toISOString();
  return {
    id: p.id, company_id: ctx.companyId, user_id: p.id, role: p.role, status: 'active', invited_by: null,
    joined_at: null, created_at: now, updated_at: now,
    profile: { id: p.id, email: p.email, full_name: p.full_name, avatar_url: null },
  };
}

async function setRole(ctx: Ctx, userId: string, role: string) {
  const { error } = await ctx.db.rpc('crm_set_role', { p_company_id: ctx.companyId, p_user: userId, p_role: role });
  if (error) {
    if (error.code === '42501') fail(403, 'forbidden', error.message);
    if (error.code === 'P0002') fail(404, 'not_found', error.message);
    if (error.code === '22023') fail(422, 'validation_error', error.message);
    dbError(error);
  }
  clearPeople(ctx.companyId);
  const p = (await people(ctx)).find((x) => x.id === userId);
  if (!p) return notFound('Member');
  return memberOut(ctx, p);
}

function sameCompany(ctx: Ctx, id: string) {
  if (id !== ctx.companyId) fail(404, 'not_found', 'Company not found. Switch company in BI first.');
}

export const accountRoutes: Route[] = [
  // ------------------------------------------------------------------ identity
  { method: 'GET', path: '/auth/me', handler: (ctx) => me(ctx) },
  {
    method: 'PATCH', path: '/auth/me',
    handler: async () => fail(422, 'validation_error', 'Your name is managed in BI (Access Management).'),
  },
  { method: 'POST', path: '/auth/password', handler: async () => fail(422, 'validation_error', 'You sign in to BI with Google, so there is no password to change here.') },
  { method: 'POST', path: '/auth/password/forgot', handler: async () => fail(422, 'validation_error', 'You sign in to BI with Google, so there is no password to reset.') },
  { method: 'GET', path: '/auth/roles', handler: async () => ROLES.map(roleDescription) },
  {
    method: 'GET', path: '/auth/roles/:role',
    handler: async (_c, req) => { const r = req.params.role as Role; if (!ROLES.includes(r)) notFound('Role'); return roleDescription(r); },
  },
  {
    method: 'GET', path: '/auth/companies/:company_id/membership',
    handler: async (ctx, req) => { sameCompany(ctx, req.params.company_id); return { company_id: ctx.companyId, role: ctx.role, permissions: [...permissionsFor(ctx.role)].sort() }; },
  },

  // ------------------------------------------------------------------ companies (BI's; one at a time, chosen in BI)
  { method: 'GET', path: '/companies', handler: async (ctx) => [companyOut(await biCompany(ctx), ctx.role)] },
  { method: 'POST', path: '/companies', handler: async () => fail(422, 'validation_error', 'Companies are created in BI (Company Management).') },
  {
    method: 'GET', path: '/companies/:company_id',
    handler: async (ctx, req) => { sameCompany(ctx, req.params.company_id); return companyOut(await biCompany(ctx), ctx.role); },
  },
  { method: 'PATCH', path: '/companies/:company_id', handler: async () => fail(422, 'validation_error', 'Company details are managed in BI (Company Management).') },
  { method: 'DELETE', path: '/companies/:company_id', handler: async () => fail(422, 'validation_error', 'Companies are managed in BI (Company Management).') },
  {
    method: 'GET', path: '/companies/:company_id/roles',
    handler: async (ctx, req) => {
      sameCompany(ctx, req.params.company_id);
      return { roles: ROLES.map(roleDescription), your_role: ctx.role, your_permissions: [...permissionsFor(ctx.role)].sort() };
    },
  },
  {
    method: 'GET', path: '/companies/:company_id/settings',
    handler: async (ctx, req) => {
      sameCompany(ctx, req.params.company_id);
      return must(await ctx.db.from(T.settings).select('company_id, key, value, updated_at').eq('company_id', ctx.companyId).order('key'));
    },
  },
  {
    method: 'PUT', path: '/companies/:company_id/settings/:key',
    handler: async (ctx, req) => {
      sameCompany(ctx, req.params.company_id);
      requirePerm(ctx, PERMISSIONS.SETTINGS_MANAGE, 'Your role cannot change company settings.');
      const key = req.params.key;
      if (!/^[a-z0-9_]{1,64}$/.test(key)) fail(422, 'validation_error', 'Setting keys must be lower-case letters, digits and underscores (max 64).', { key });
      const value = req.body?.value ?? null;
      const rows = must(await ctx.db.from(T.settings).upsert({ company_id: ctx.companyId, key, value, updated_by: ctx.userId }, { onConflict: 'company_id,key' }).select('key, value, updated_at'));
      return (rows as unknown[])[0] ?? { key, value };
    },
  },
  {
    method: 'DELETE', path: '/companies/:company_id/settings/:key',
    handler: async (ctx, req) => {
      sameCompany(ctx, req.params.company_id);
      if (!can(ctx.role, PERMISSIONS.SETTINGS_MANAGE)) fail(403, 'forbidden', 'Your role cannot change company settings.');
      const rows = must(await ctx.db.from(T.settings).delete().eq('company_id', ctx.companyId).eq('key', req.params.key).select('key'));
      if (!(rows as unknown[]).length) fail(404, 'not_found', 'Setting not found.', { key: req.params.key });
      return { id: req.params.key, deleted: true };
    },
  },

  // ------------------------------------------------------------------ team (BI people + their CRM role)
  {
    method: 'GET', path: '/members',
    handler: async (ctx) => (await people(ctx)).filter((p) => p.role).map((p) => memberOut(ctx, p)),
  },
  {
    method: 'POST', path: '/members/by-email',
    handler: async (ctx, req) => {
      requirePerm(ctx, PERMISSIONS.TEAM_MANAGE);
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const role = String(req.body?.role ?? 'salesperson');
      if (!email) fail(422, 'validation_error', 'Enter an e-mail address.');
      const p = (await people(ctx)).find((x) => (x.email ?? '').toLowerCase() === email);
      if (!p) fail(404, 'not_found', `${email} is not a user of this company in BI. Add them in BI (Access Management) first, then give them a role here.`);
      if (!p.has_signed_in) fail(422, 'validation_error', `${email} has not signed in to BI yet. Ask them to sign in once, then add them here.`);
      const m = await setRole(ctx, p.id, role);
      return { kind: 'member', id: m.id, user_id: m.user_id, email, role: m.role };
    },
  },
  {
    method: 'POST', path: '/members',
    handler: async (ctx, req) => {
      requirePerm(ctx, PERMISSIONS.TEAM_MANAGE);
      return setRole(ctx, String(req.body?.user_id ?? ''), String(req.body?.role ?? 'salesperson'));
    },
  },
  {
    method: 'PATCH', path: '/members/:member_id',
    handler: async (ctx, req) => { requirePerm(ctx, PERMISSIONS.TEAM_MANAGE); return setRole(ctx, req.params.member_id, String(req.body?.role ?? '')); },
  },
  {
    method: 'DELETE', path: '/members/:member_id',
    handler: async (ctx, req) => {
      if (req.params.member_id !== ctx.userId) requirePerm(ctx, PERMISSIONS.TEAM_MANAGE);
      if (req.params.member_id === ctx.userId) fail(422, 'validation_error', 'Ask an owner or admin to remove your access.');
      await setRole(ctx, req.params.member_id, 'none').catch((e) => { if ((e as { status?: number }).status !== 404) throw e; });
      return { ok: true };
    },
  },
  // invitations do not exist inside BI: people are added in BI first
  { method: 'GET', path: '/invitations', handler: async () => [] },
  { method: 'POST', path: '/invitations', handler: async () => fail(422, 'validation_error', 'Add the person in BI (Access Management) first, then give them a role here.') },
  { method: 'DELETE', path: '/invitations/:invitation_id', handler: async () => notFound('Invitation') },
  { method: 'POST', path: '/transfer-ownership', handler: async () => fail(422, 'validation_error', 'Owners are the company\'s BI admins. Change admins in BI (Access Management).') },

  // ------------------------------------------------------------------ lead capture (Facebook / Instagram / LinkedIn / website form): next update
  { method: 'GET', path: '/integrations', handler: async () => ({ integrations: [] }) },
  { method: 'GET', path: '/integrations/logs', handler: async () => ({ data: [], pagination: { page: 1, page_size: 25, total: 0, pages: 1, has_next: false, has_prev: false } }) },
];
