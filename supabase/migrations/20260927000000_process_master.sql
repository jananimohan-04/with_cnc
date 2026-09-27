-- =====================================================================================
-- ARGUS CNC ERP — Process Master (production master data)
--
-- New master table: public.cnc_processes
-- Stores manufacturing processes / machine operations and their costing rates.
-- Referenced later by Production, Work Orders, Scheduling, Machine Log, Process
-- Costing and Finished Goods via the stable process_code (unique per company).
--
-- Future costing formula (not implemented here):
--   Process Cost = (Time in Hours x Cost Per Hour) + Cost Per Component + Setup Cost
--
-- * Additive only: no existing table, policy or function is modified.
-- * Company isolation via public.erp_secure_table (RLS + company trigger + grants),
--   same as every other business table. The browser never sends company_id.
-- =====================================================================================

begin;

create table if not exists public.cnc_processes (
  id                  uuid primary key default gen_random_uuid(),
  process_code        text not null,
  process_name        text not null,
  process_category    text,
  machine_type        text,
  description         text,
  cost_per_hour       numeric(18, 2) not null default 0 check (cost_per_hour >= 0),
  cost_per_component  numeric(18, 2) not null default 0 check (cost_per_component >= 0),
  setup_cost          numeric(18, 2) not null default 0 check (setup_cost >= 0),
  minimum_charge      numeric(18, 2) not null default 0 check (minimum_charge >= 0),
  status              text not null default 'Active' check (status in ('Active', 'Inactive')),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

select public.erp_secure_table('cnc_processes');

-- Stable reference code per company (duplicate process codes are rejected).
create unique index if not exists cnc_processes_company_code_key
  on public.cnc_processes (company_id, process_code);

commit;
