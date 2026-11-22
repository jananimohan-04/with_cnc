-- Migration: AI Attendance v1 pages (server/retail_backend/attendanceV1.cjs, routes /api/attendance/v1/*)
-- Idempotent: safe to run more than once.
--
-- 1. Extra fields on the existing attendance tables (bank details, salary structure, punch details, leave details,
--    organisation profile / logo) are kept in one JSON column per table.
-- 2. New tables for manual overrides, salary advances, payment entries, notifications, client sites, salary payouts
--    and the kiosk live punch stream. Their ids are text (the pages use ids such as "ADV-1A2B3C").
--
-- Access: like the other bi_attendance_* tables, row level security is ON and there are no policies — only the
-- server (with its secret key) reads and writes them, and it limits every query to the signed-in person's company.
-- Salary, bank and face data therefore can never be read directly from the browser.

begin;

-- 1. existing tables ---------------------------------------------------------------------------
alter table public.bi_attendance_employees add column if not exists profile jsonb not null default '{}'::jsonb;
alter table public.bi_attendance_records   add column if not exists extra   jsonb not null default '{}'::jsonb;
alter table public.bi_attendance_leaves    add column if not exists extra   jsonb not null default '{}'::jsonb;
alter table public.bi_attendance_settings  add column if not exists org_profile jsonb not null default '{}'::jsonb;
alter table public.bi_attendance_settings  add column if not exists logo_url text;

create index if not exists bi_attendance_records_company_employee_idx on public.bi_attendance_records (company_id, employee_id, log_date);
create index if not exists bi_attendance_leaves_employee_idx on public.bi_attendance_leaves (company_id, employee_id);

-- 2. new tables (same shape: id, company, employee, the record as JSON) -------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'bi_attendance_overrides',
    'bi_attendance_advances',
    'bi_attendance_financial_entries',
    'bi_attendance_notifications',
    'bi_attendance_client_sites',
    'bi_attendance_payouts',
    'bi_attendance_events'
  ] loop
    execute format($f$
      create table if not exists public.%1$I (
        id          text primary key,
        company_id  uuid not null references public.companies (id) on delete cascade,
        employee_id text,
        doc         jsonb not null default '{}'::jsonb,
        created_at  timestamptz not null default now(),
        updated_at  timestamptz not null default now()
      )$f$, t);
    execute format('create index if not exists %1$I on public.%2$I (company_id)', t || '_company_idx', t);
    execute format('create index if not exists %1$I on public.%2$I (company_id, employee_id)', t || '_employee_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

commit;
