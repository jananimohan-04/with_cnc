-- =====================================================================================
-- JD Build (job descriptions) and Scheduled Tasks (machine / team-member tasks on the Scheduling screens)
--
-- Both tables are company-isolated like every other table: each row belongs to one company and a user only ever sees
-- their own company's rows (erp_secure_table adds company_id and the row level security).
--
-- Safe to run more than once, and safe if an earlier version of this file was already run: columns are only added when
-- missing, and the old "any signed-in user can do anything" policies are replaced.
-- =====================================================================================
begin;

-- ---------------------------------------------------------------- job descriptions
create table if not exists public.cnc_job_descriptions (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.cnc_job_descriptions
  add column if not exists department      text,
  add column if not exists employment      text,
  add column if not exists workplace       text,
  add column if not exists location        text,
  add column if not exists reporting_to    text,
  add column if not exists summary         text,
  add column if not exists responsibilities jsonb not null default '[]'::jsonb,
  add column if not exists kpis            jsonb not null default '[]'::jsonb,
  add column if not exists skills_required jsonb not null default '[]'::jsonb,
  add column if not exists qualification   text,
  add column if not exists working_hours   text,
  add column if not exists salary_range    text;

-- the first version of this file had a required "stage" column that the screen no longer uses
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cnc_job_descriptions' and column_name = 'stage') then
    alter table public.cnc_job_descriptions alter column stage drop not null;
  end if;
end;
$$;

-- ---------------------------------------------------------------- scheduled tasks
create table if not exists public.cnc_scheduled_tasks (
  id          uuid primary key default gen_random_uuid(),
  task_name   text not null,
  member_name text,
  task_date   date not null,
  start_time  text not null,
  end_time    text not null,
  machine     text,
  mode        text default 'planned',
  status      text default 'Planned',
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists cnc_scheduled_tasks_date_idx on public.cnc_scheduled_tasks (task_date);

-- ---------------------------------------------------------------- company isolation
alter table public.cnc_job_descriptions add column if not exists company_id uuid references public.companies (id);
alter table public.cnc_scheduled_tasks  add column if not exists company_id uuid references public.companies (id);

-- rows written by the first version had no company: they go to Argus (like the rest of the existing data); any left over are removed
update public.cnc_job_descriptions set company_id = (select id from public.companies where code = 'ARGUS') where company_id is null;
update public.cnc_scheduled_tasks  set company_id = (select id from public.companies where code = 'ARGUS') where company_id is null;
delete from public.cnc_job_descriptions where company_id is null;
delete from public.cnc_scheduled_tasks  where company_id is null;

-- adds the company trigger and replaces every old policy with "only my company's rows"
select public.erp_secure_table('cnc_job_descriptions');
select public.erp_secure_table('cnc_scheduled_tasks');

commit;

select 'cnc_job_descriptions' as table_name, count(*) as rows from public.cnc_job_descriptions
union all
select 'cnc_scheduled_tasks', count(*) from public.cnc_scheduled_tasks;
