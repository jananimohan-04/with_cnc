-- Planned timeline: when each work-order operation is planned to run. One row per planned slot of a day, so an
-- operation can be planned over a date range with several time slots per day (e.g. 9-11 and 2-5).
begin;

create table if not exists public.cnc_operation_plans (
  id                uuid primary key default gen_random_uuid(),
  work_order_id     uuid not null,
  operation_id      uuid,
  operation_sequence integer not null default 0,
  process_name      text not null default '',
  machine           text not null default '',
  plan_date         date not null,
  start_time        time not null,
  end_time          time not null,
  notes             text,
  created_by        text,
  created_at        timestamptz not null default now(),
  constraint cnc_operation_plans_time_chk check (end_time > start_time)
);

select public.erp_secure_table('cnc_operation_plans');

create index if not exists cnc_operation_plans_wo_idx on public.cnc_operation_plans (company_id, work_order_id, operation_sequence);
create index if not exists cnc_operation_plans_date_idx on public.cnc_operation_plans (company_id, plan_date, machine);

notify pgrst, 'reload schema';
commit;
