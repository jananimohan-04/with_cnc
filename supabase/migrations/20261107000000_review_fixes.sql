-- Fixes found in the project review. Safe to run more than once.
--   1. The four tables the app reads/writes but no migration created (machines, routing, BOM, purchase history),
--      each with company isolation like every other business table. A table that already exists is only secured
--      when it does not have a company_id yet, so existing data is never touched.
--   2. Stock deduction for Retail orders: only administrators may call the signed-in version.
--   3. Stock adjustment and transfer: lock the item while they check and post, so two people acting at the same time
--      cannot take stock below zero.
--   4. Retail roles (partner mark-up %) are readable only by active BI users, not by portal customers.

begin;

-- -------------------------------------------------------------------------------------
-- 1. Missing tables
-- -------------------------------------------------------------------------------------
create table if not exists public.cnc_machines (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text,
  type text,
  status text not null default 'Active',
  utilization numeric not null default 0,
  spindle_hours numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.cnc_routing (
  id uuid primary key default gen_random_uuid(),
  parent_part_no text not null,
  op_no integer not null default 10,
  operation text,
  machine text,
  setup_time numeric not null default 0,
  cycle_time numeric not null default 0,
  tools text,
  description text,
  cnc_program text,
  created_at timestamptz not null default now()
);
create index if not exists cnc_routing_parent_idx on public.cnc_routing (parent_part_no, op_no);

create table if not exists public.cnc_bom (
  id uuid primary key default gen_random_uuid(),
  parent_part_no text not null,
  level integer not null default 1,
  project_name text,
  part_no text,
  part_name text,
  material text,
  quantity numeric not null default 1,
  unit text,
  make text,
  operation text,
  created_at timestamptz not null default now()
);
create index if not exists cnc_bom_parent_idx on public.cnc_bom (parent_part_no, level);

create table if not exists public.cnc_purchase_history (
  id uuid primary key default gen_random_uuid(),
  customer text,
  lead_id text,
  lead_no text,
  invoice_no text,
  invoice_date timestamptz,
  part_name text,
  quantity numeric not null default 0,
  total_value numeric not null default 0,
  parts jsonb,
  sales_order_ref text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['cnc_machines', 'cnc_routing', 'cnc_bom', 'cnc_purchase_history'] loop
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = t and column_name = 'company_id') then
      perform public.erp_secure_table(t);
    end if;
  end loop;
end $$;

-- -------------------------------------------------------------------------------------
-- 2. Retail order stock deduction: administrators only (it was open to every signed-in user)
-- -------------------------------------------------------------------------------------
create or replace function public.erp_retail_deduct_stock(p_deduction jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare me public.company_users := public.erp_current_user();
begin
  if me.id is null or me.role not in ('SUPER_ADMIN', 'COMPANY_ADMIN') then
    raise exception 'Only administrators can deduct stock for a Retail Store order' using errcode = '42501';
  end if;
  return public.erp_retail_deduct_core(public.erp_report_company(), p_deduction);
end;
$$;
revoke all on function public.erp_retail_deduct_stock(jsonb) from public, anon;
grant execute on function public.erp_retail_deduct_stock(jsonb) to authenticated;

-- -------------------------------------------------------------------------------------
-- 3. Stock adjustment / transfer: serialise per item
-- -------------------------------------------------------------------------------------
create or replace function public.erp_adjust_stock(
  p_kind text, p_id text, p_direction text, p_qty numeric, p_reason text, p_reference text, p_date date)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid := public.erp_report_company();
  v_stock numeric;
  v_id text;
begin
  if me.role not in ('SUPER_ADMIN', 'COMPANY_ADMIN') and not public.erp_has_perm('stock-adjustment', 'edit') then
    raise exception 'You do not have access to adjust stock' using errcode = '42501';
  end if;
  if p_direction not in ('IN', 'OUT') then raise exception 'Choose increase or decrease'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required for a stock adjustment'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_company::text || ':' || p_kind || ':' || p_id, 0));
  select stock into v_stock from public.erp_item_info(v_company, p_kind, p_id);
  if v_stock is null then raise exception 'Item not found'; end if;
  if p_direction = 'OUT' and p_qty > v_stock then
    raise exception 'Cannot reduce by % — only % in stock', p_qty, v_stock;
  end if;
  v_id := public.erp_insert_movement(v_company, p_kind, p_id, 'Adjustment', 'ADJ',
    case when p_direction = 'IN' then p_qty else -p_qty end, null, 'adjustment', null,
    nullif(btrim(p_reference), ''), btrim(p_reason), coalesce(p_date, public.erp_today()), me.full_name);
  return jsonb_build_object('movement_id', v_id, 'new_stock', (select stock from public.erp_item_info(v_company, p_kind, p_id))::text);
end;
$$;
revoke all on function public.erp_adjust_stock(text, text, text, numeric, text, text, date) from public, anon;
grant execute on function public.erp_adjust_stock(text, text, text, numeric, text, text, date) to authenticated;

create or replace function public.erp_transfer_stock(
  p_kind text, p_id text, p_from_warehouse text, p_to_warehouse text,
  p_qty numeric, p_reason text, p_reference text, p_date date)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid := public.erp_report_company();
  v_stock numeric;
  v_from_avail numeric;
  v_ref text;
  v_out_id text;
  v_in_id text;
begin
  if me.role not in ('SUPER_ADMIN', 'COMPANY_ADMIN') then
    raise exception 'Only administrators can transfer stock' using errcode = '42501';
  end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if p_from_warehouse is null or p_to_warehouse is null or p_from_warehouse = p_to_warehouse then
    raise exception 'Choose two different warehouses';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required for a stock transfer'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_company::text || ':' || p_kind || ':' || p_id, 0));

  select stock into v_stock from public.erp_item_info(v_company, p_kind, p_id);
  if v_stock is null then raise exception 'Item not found'; end if;

  -- Source balance: rows tagged to the source warehouse plus untagged legacy rows,
  -- which pre-date warehouse tracking and are assumed physically available.
  select coalesce(sum(qty_change), 0) into v_from_avail from public.cnc_stock_movements
  where company_id = v_company and item_kind = p_kind and item_id = p_id
    and (warehouse_id = p_from_warehouse or warehouse_id is null);
  if p_qty > v_from_avail then
    raise exception 'Cannot transfer % — only % available in the source warehouse', p_qty, v_from_avail;
  end if;

  v_ref := nullif(btrim(coalesce(p_reference, '')), '');
  if v_ref is null then
    v_ref := 'TRF-' || to_char(public.erp_today(), 'YYYYMM') || '-' || substr(gen_random_uuid()::text, 1, 6);
  end if;

  -- Idempotency: the same reference + item never posts twice (double-click / retry safe).
  if exists (select 1 from public.cnc_stock_movements
             where company_id = v_company and reference_type = 'transfer'
               and reference_no = v_ref and item_kind = p_kind and item_id = p_id) then
    return jsonb_build_object('reference_no', v_ref, 'duplicate', true,
      'new_stock', (select stock from public.erp_item_info(v_company, p_kind, p_id))::text);
  end if;

  v_out_id := public.erp_insert_movement(v_company, p_kind, p_id, 'Transfer', 'OUT', -p_qty, null,
    'transfer', null, v_ref, btrim(p_reason), coalesce(p_date, public.erp_today()), me.full_name, p_from_warehouse);
  v_in_id := public.erp_insert_movement(v_company, p_kind, p_id, 'Transfer', 'IN', p_qty, null,
    'transfer', null, v_ref, btrim(p_reason), coalesce(p_date, public.erp_today()), me.full_name, p_to_warehouse);

  return jsonb_build_object('reference_no', v_ref, 'movement_out_id', v_out_id, 'movement_in_id', v_in_id,
    'duplicate', false,
    'new_stock', (select stock from public.erp_item_info(v_company, p_kind, p_id))::text);
end;
$$;

-- -------------------------------------------------------------------------------------
-- 4. Retail roles carry the partner mark-up %: only active BI users may read them
-- -------------------------------------------------------------------------------------
drop policy if exists retail_roles_read on public.retail_roles;
create policy retail_roles_read on public.retail_roles for select to authenticated
  using (exists (select 1 from public.company_users cu where cu.auth_user_id = auth.uid() and cu.status = 'Active'));

commit;
