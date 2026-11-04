-- =====================================================================================
-- ARGUS CNC ERP — User Job Description assignment link table
--
-- Maps company_users to their assigned Job Description (public.cnc_job_descriptions).
-- Each user can be linked to a JD, or JDs can be directly created and assigned.
-- Secured with company isolation via erp_secure_table.
-- =====================================================================================

begin;

create table if not exists public.cnc_user_job_descriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.company_users (id) on delete cascade,
  user_email  text not null,
  jd_id       uuid not null references public.cnc_job_descriptions (id) on delete cascade,
  company_id  uuid references public.companies (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists cnc_user_jd_email_unique on public.cnc_user_job_descriptions (lower(user_email));
create index if not exists cnc_user_jd_user_id_idx on public.cnc_user_job_descriptions (user_id);
create index if not exists cnc_user_jd_jdid_idx on public.cnc_user_job_descriptions (jd_id);

-- Add company isolation, RLS and policies
select public.erp_secure_table('cnc_user_job_descriptions');

commit;
