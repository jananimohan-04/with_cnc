-- =====================================================================================
-- ARGUS CNC ERP — Customer-portal profiles base table (local drift fix)
--
-- The hosted database has public.portal_profiles (created via the dashboard),
-- but no repo migration creates it, so `supabase db reset` fails at
-- 20260923000000_multi_company_auth.sql ("relation portal_profiles does not
-- exist"). This file runs first (timestamp just before that migration) and
-- creates the bare table; the later migration adds company_id, triggers,
-- RLS policies and grants itself.
--
-- * Additive only: IF NOT EXISTS, so it is a safe no-op on hosted.
-- * Column set mirrors what the portal frontend inserts (PortalDashboard.tsx)
--   plus created_at, which the company trigger orders by. company_id is
--   intentionally left for the later migration (it adds the FK + NOT NULL).
-- =====================================================================================

begin;

create table if not exists public.portal_profiles (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid,
  email           text,
  company_name    text,
  contact_name    text,
  phone           text,
  gst             text,
  address         text,
  city            text,
  state           text,
  country         text default 'India',
  pincode         text,
  enquiring_for   text,
  created_at      timestamptz not null default now()
);

create index if not exists portal_profiles_auth_user_idx
  on public.portal_profiles (auth_user_id);

commit;
