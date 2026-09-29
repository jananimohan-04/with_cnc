-- =====================================================================================
-- ARGUS CNC ERP — Part Routing (standard manufacturing sequence per product)
--
-- New tables:
--   public.cnc_part_routings       revisioned routing headers per product
--   public.cnc_part_routing_steps  sequenced operations of one revision
--
-- A routing answers: what operations, in what order, on which machine, with
-- what standard setup/cycle time and routing-specific rates.
--
-- * Additive only: no existing table, policy or function is modified.
-- * Company isolation via public.erp_secure_table (RLS + company trigger +
--   grants), same as every other business table. The browser never sends
--   company_id.
-- * Exactly one Active revision per product (partial unique index); history
--   revisions stay untouched, so work orders keep referencing the revision
--   used at creation via cnc_work_order_operations.routing_id/revision.
-- * cnc_routing (Engineering) is left alone: the Part Routing page is the
--   versioned master; consumers read the Active revision through the app.
-- =====================================================================================

begin;

create table if not exists public.cnc_part_routings (
  id                  uuid primary key default gen_random_uuid(),
  product_code        text not null,
  product_name        text not null default '',
  revision            int not null default 1 check (revision >= 1),
  effective_from      date,
  status              text not null default 'Draft'
                      check (status in ('Draft', 'Active', 'Inactive')),
  notes               text,
  created_by          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

select public.erp_secure_table('cnc_part_routings');

-- One revision number per product (per company).
create unique index if not exists cnc_pr_code_rev_key
  on public.cnc_part_routings (company_id, product_code, revision);

-- Exactly one Active revision per product (per company).
create unique index if not exists cnc_pr_single_active
  on public.cnc_part_routings (company_id, product_code)
  where status = 'Active';

create index if not exists cnc_pr_code_idx
  on public.cnc_part_routings (product_code);

create table if not exists public.cnc_part_routing_steps (
  id                  uuid primary key default gen_random_uuid(),
  routing_id          uuid not null,
  sequence            int not null default 10 check (sequence > 0),
  process_id          uuid,
  process_code        text not null default '',
  process_name        text not null default '',
  process_category    text,
  machine             text,
  setup_time          numeric(18, 2) not null default 0 check (setup_time >= 0),
  cycle_time          numeric(18, 2) not null default 0 check (cycle_time >= 0),
  cost_per_hour       numeric(18, 2) not null default 0 check (cost_per_hour >= 0),
  cost_per_component  numeric(18, 2) not null default 0 check (cost_per_component >= 0),
  standard_qty        numeric(18, 2) not null default 1 check (standard_qty >= 0),
  instructions        text,
  created_at          timestamptz not null default now()
);

select public.erp_secure_table('cnc_part_routing_steps');

create index if not exists cnc_prs_routing_idx
  on public.cnc_part_routing_steps (routing_id);

-- Sequence is unique within one routing revision.
create unique index if not exists cnc_prs_routing_seq_key
  on public.cnc_part_routing_steps (routing_id, sequence);

-- Stable reference from a work order operation to the routing revision used
-- at creation. Nullable: older/manual operations simply carry no reference.
alter table public.cnc_work_order_operations
  add column if not exists routing_id uuid,
  add column if not exists routing_revision int;

commit;
