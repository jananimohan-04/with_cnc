-- Warehouse Master default + where finished goods are kept.
--  * one default warehouse per company (finished goods follow it until a warehouse is chosen for them)
--  * each work order can name the warehouse its finished goods are stored in
begin;

alter table public.cnc_warehouses add column if not exists is_default boolean not null default false;
create unique index if not exists cnc_warehouses_one_default on public.cnc_warehouses (company_id) where is_default;

alter table public.cnc_work_orders add column if not exists warehouse_id text;

notify pgrst, 'reload schema';
commit;
