-- Migration: Fix cnc_warehouses unique code constraint for multi-tenancy
-- Replaces table-wide unique constraint with per-company unique index so companies do not collide on warehouse codes.

begin;

-- Drop table-wide unique constraint if it exists
alter table if exists public.cnc_warehouses drop constraint if exists cnc_warehouses_code_key;
drop index if exists public.cnc_warehouses_code_key;

-- Create unique index scoped by company_id so each company can use codes like 1, 2, WH-01 independently
create unique index if not exists cnc_warehouses_company_code_key on public.cnc_warehouses (company_id, code);

commit;
