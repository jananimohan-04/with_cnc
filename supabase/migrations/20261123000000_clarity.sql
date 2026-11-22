-- Clarity: Vision -> Mission -> Goals -> To Do List -> Today's List (Overview > Clarity, route /clarity).
-- Idempotent: safe to run more than once.
--
--   clarity_statements  one Vision statement and one Mission statement per person (with the target year)
--   clarity_lines       the "3 years vision" points and the "goals for this year" points
--   clarity_goals       up to 7 goals at a time, each with an owner and a start / end date
--   clarity_tasks       to-do items (a goal's steps are tasks with that goal); "today" puts a task on Today's List
--
-- Every table is limited to the company (erp_secure_table: company_id is filled in automatically and only people of
-- that company can read or change the rows). owner_id = the person (company_users.id) the vision / goal belongs to.

begin;

create table if not exists public.clarity_statements (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.company_users (id) on delete cascade,
  kind         text not null check (kind in ('vision', 'mission')),
  body         text not null default '',
  target_year  int,
  updated_at   timestamptz not null default now()
);

create table if not exists public.clarity_lines (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.company_users (id) on delete cascade,
  kind         text not null check (kind in ('vision3y', 'year_goal')),
  body         text not null default '',
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists public.clarity_goals (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.company_users (id) on delete cascade,
  title        text not null default '',
  assignee     text not null default '',
  start_date   date,
  end_date     date,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists public.clarity_tasks (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.company_users (id) on delete cascade,
  goal_id      uuid references public.clarity_goals (id) on delete set null,
  title        text not null default '',
  assignee     text not null default '',
  due_date     date,
  today        date,              -- the day it was put on Today's List
  done         boolean not null default false,
  done_at      timestamptz,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

select public.erp_secure_table('clarity_statements');
select public.erp_secure_table('clarity_lines');
select public.erp_secure_table('clarity_goals');
select public.erp_secure_table('clarity_tasks');

create unique index if not exists clarity_statements_owner_kind_key on public.clarity_statements (company_id, owner_id, kind);
create index if not exists clarity_lines_owner_idx on public.clarity_lines (company_id, owner_id, kind, sort_order);
create index if not exists clarity_goals_owner_idx on public.clarity_goals (company_id, owner_id, sort_order);
create index if not exists clarity_tasks_goal_idx on public.clarity_tasks (company_id, goal_id);
create index if not exists clarity_tasks_today_idx on public.clarity_tasks (company_id, today);

commit;
