-- The operator (man) a planned slot is assigned to, next to its machine.
begin;
alter table public.cnc_operation_plans add column if not exists operator text not null default '';
create index if not exists cnc_operation_plans_operator_idx on public.cnc_operation_plans (company_id, plan_date, operator);
notify pgrst, 'reload schema';
commit;
