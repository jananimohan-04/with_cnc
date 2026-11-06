-- Digital Store: a walk-through 3D store. Business Intelligence sets up the racks / rows and puts products on them;
-- the Retail Store shows it as a 3D space people can walk through, search and rotate products in.
-- One store per company. Everyone in the company can read it; only administrators change it.

begin;

create table if not exists public.digital_stores (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Digital Store',
  racks integer not null default 4 check (racks between 1 and 40),
  rows_per_rack integer not null default 4 check (rows_per_rack between 1 and 8),
  slots_per_row integer not null default 4 check (slots_per_row between 1 and 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.digital_store_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.digital_stores (id) on delete cascade,
  rack integer not null check (rack >= 1),
  row_no integer not null check (row_no >= 1),
  slot integer not null check (slot >= 1),
  name text not null,
  sku text,
  price numeric,
  description text,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, rack, row_no, slot)
);
create index if not exists digital_store_items_store_idx on public.digital_store_items (store_id);

-- company isolation (company_id column, trigger, RLS), then split read (everyone) from write (administrators)
select public.erp_secure_table('digital_stores');
select public.erp_secure_table('digital_store_items');

create unique index if not exists digital_stores_company_key on public.digital_stores (company_id);

do $$
declare t text;
begin
  foreach t in array array['digital_stores', 'digital_store_items'] loop
    execute format('drop policy if exists erp_company_isolation on public.%I', t);
    execute format('drop policy if exists digital_store_read on public.%I', t);
    execute format('drop policy if exists digital_store_write on public.%I', t);
    execute format($p$create policy digital_store_read on public.%I for select to authenticated
      using (company_id = any ((select public.erp_visible_company_ids())::uuid[]))$p$, t);
    execute format($p$create policy digital_store_write on public.%I for all to authenticated
      using (company_id = any ((select public.erp_visible_company_ids())::uuid[])
             and coalesce((select (public.erp_current_user()).role), '') in ('SUPER_ADMIN', 'COMPANY_ADMIN'))
      with check (company_id = any ((select public.erp_visible_company_ids())::uuid[])
             and coalesce((select (public.erp_current_user()).role), '') in ('SUPER_ADMIN', 'COMPANY_ADMIN'))$p$, t);
  end loop;
end $$;

commit;
