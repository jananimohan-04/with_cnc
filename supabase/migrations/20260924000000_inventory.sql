-- =====================================================================================
-- ARGUS CNC ERP — inventory stock ledger
--
-- Run AFTER 20260923000000_multi_company_auth.sql and 20260923010000_accounting.sql.
-- One transaction: if anything fails, nothing is changed.
--
-- * Item masters stay where they are: cnc_raw_materials holds PURCHASED items (raw material,
--   bought-out, tools, consumables), cnc_parts holds MANUFACTURED items (finished goods).
-- * cnc_stock_movements becomes the stock ledger. Current stock = Σ qty_change per item;
--   stock_qty on the item tables is a cache kept in sync by the database. Nobody edits it
--   directly any more — a direct edit is recorded as an "Adjustment" movement.
-- * Rate = moving weighted average: priced receipts (goods receipts) re-average unit_price.
-- * Every movement posts to the accounts at the same rate, so inventory value on the
--   Inventory page equals the inventory accounts on the Balance Sheet.
--     Purchase Inward (goods receipt)  → posted by the goods-receipt journal (accounting mig.)
--     Production Issue                 → Dr Cost of Materials Consumed / Cr Inventory
--     Production Receipt (work order)  → Dr Finished Goods / Cr Changes in Inventories
--     Delivery (delivery challan)      → Dr Changes in Inventories / Cr Finished Goods
--     Adjustment                       → Inventory ↔ Inventory Adjustments
--     Opening (new item)               → Dr Inventory / Cr Opening Balance Equity
-- * Go-live: current stock of every item becomes an "Opening" movement (the accounting
--   migration already booked its value), so existing figures do not change.
-- =====================================================================================

begin;

-- -------------------------------------------------------------------------------------
-- 0. Generic helpers
-- -------------------------------------------------------------------------------------

-- Inserts a row from JSON, ignoring keys that are not columns and supplying an id when the
-- id column has no default (live ids are text or uuid). Internal only.
create or replace function public.erp_insert_json(p_table text, p_values jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v jsonb := '{}'::jsonb;
  k text;
  v_cols text;
  r jsonb;
begin
  for k in select jsonb_object_keys(p_values) loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = p_table and column_name = k) then
      v := v || jsonb_build_object(k, p_values -> k);
    end if;
  end loop;
  if not v ? 'id' and exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = p_table and column_name = 'id' and column_default is null) then
    v := v || jsonb_build_object('id', gen_random_uuid()::text);
  end if;
  select string_agg(format('%I', key), ', ') into v_cols from jsonb_object_keys(v) key;
  execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) returning to_jsonb(%I.*)',
                 p_table, v_cols, v_cols, p_table, p_table)
    into r using v;
  return r;
end;
$$;

-- Updates one company row from JSON (values are cast to each column's real type). Internal only.
create or replace function public.erp_update_json(p_table text, p_id text, p_company uuid, p_values jsonb)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v jsonb := '{}'::jsonb;
  k text;
  v_cols text;
  n int;
begin
  for k in select jsonb_object_keys(p_values) loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = p_table and column_name = k) then
      v := v || jsonb_build_object(k, p_values -> k);
    end if;
  end loop;
  select string_agg(format('%I', key), ', ') into v_cols from jsonb_object_keys(v) key;
  execute format('update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where id::text = $2 and company_id = $3',
                 p_table, v_cols, v_cols, p_table)
    using v, p_id, p_company;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- The single rule for stock status (used by every screen and count).
create or replace function public.erp_stock_status(p_stock numeric, p_min numeric)
returns text
language sql immutable
as $$
  select case
    when coalesce(p_stock, 0) <= 0 then 'Out of Stock'
    when coalesce(p_min, 0) > 0 and p_stock <= p_min then 'Low Stock'
    else 'In Stock'
  end
$$;

-- -------------------------------------------------------------------------------------
-- 1. Categories (master data per company) + accounts used by stock postings
-- -------------------------------------------------------------------------------------
create table if not exists public.inventory_categories (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,
  name        text not null,
  kind        text not null check (kind in ('PURCHASED', 'MANUFACTURED')),
  sort_order  int not null default 0,
  status      text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at  timestamptz not null default now()
);
select public.erp_secure_table('inventory_categories');
create unique index if not exists inventory_categories_company_code_key on public.inventory_categories (company_id, code);
revoke insert, update, delete on public.inventory_categories from authenticated;

create or replace function public.erp_seed_inventory_setup(p_company uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_expenses uuid;
begin
  insert into public.inventory_categories (company_id, code, name, kind, sort_order)
  select p_company, v.code, v.name, v.kind, v.sort_order
  from (values
    ('RAW',        'Raw Material',     'PURCHASED',    1),
    ('BOUGHT_OUT', 'Bought-out Items', 'PURCHASED',    2),
    ('TOOL',       'Tools',            'PURCHASED',    3),
    ('CONSUMABLE', 'Consumables',      'PURCHASED',    4),
    ('FG',         'Finished Goods',   'MANUFACTURED', 5)
  ) as v(code, name, kind, sort_order)
  where not exists (select 1 from public.inventory_categories c where c.company_id = p_company and c.code = v.code);

  select id into v_expenses from public.chart_of_accounts
  where company_id = p_company and code = '5000' and is_group;
  if v_expenses is not null then
    insert into public.chart_of_accounts (company_id, code, name, parent_id, account_type, is_group, system_key, sort_order)
    select p_company, v.code, v.name, v_expenses, 'EXPENSE', false, v.key, v.sort_order
    from (values
      ('5150', 'Changes in Inventories of Finished Goods', 'INVENTORY_CHANGE', 81),
      ('5700', 'Inventory Adjustments',                    'STOCK_ADJUSTMENT', 88)
    ) as v(code, name, key, sort_order)
    where not exists (select 1 from public.chart_of_accounts a where a.company_id = p_company and a.system_key = v.key)
      and not exists (select 1 from public.chart_of_accounts a where a.company_id = p_company and a.code = v.code);
  end if;
end;
$$;

create or replace function public.erp_seed_inventory_trigger()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.erp_seed_inventory_setup(new.id);
  return new;
end;
$$;
drop trigger if exists erp_seed_inventory_setup on public.companies;
create trigger erp_seed_inventory_setup after insert on public.companies
  for each row execute function public.erp_seed_inventory_trigger();

-- -------------------------------------------------------------------------------------
-- 2. Item master columns
-- -------------------------------------------------------------------------------------
alter table public.cnc_raw_materials add column if not exists category_id uuid references public.inventory_categories (id);
alter table public.cnc_raw_materials add column if not exists specification text;
alter table public.cnc_raw_materials add column if not exists reorder_qty numeric not null default 0;
alter table public.cnc_raw_materials add column if not exists image_url text;
alter table public.cnc_raw_materials add column if not exists updated_at timestamptz not null default now();

alter table public.cnc_parts add column if not exists category_id uuid references public.inventory_categories (id);
alter table public.cnc_parts add column if not exists specification text;
alter table public.cnc_parts add column if not exists min_stock numeric not null default 0;
alter table public.cnc_parts add column if not exists reorder_qty numeric not null default 0;
alter table public.cnc_parts add column if not exists image_url text;
alter table public.cnc_parts add column if not exists updated_at timestamptz not null default now();

drop trigger if exists zz_erp_same_company_category_id on public.cnc_raw_materials;
create trigger zz_erp_same_company_category_id before insert or update on public.cnc_raw_materials
  for each row execute function public.erp_check_same_company('category_id', 'inventory_categories');
drop trigger if exists zz_erp_same_company_category_id on public.cnc_parts;
create trigger zz_erp_same_company_category_id before insert or update on public.cnc_parts
  for each row execute function public.erp_check_same_company('category_id', 'inventory_categories');

-- -------------------------------------------------------------------------------------
-- 3. Stock ledger columns on cnc_stock_movements
-- -------------------------------------------------------------------------------------
alter table public.cnc_stock_movements add column if not exists item_kind text check (item_kind in ('RAW', 'PART'));
alter table public.cnc_stock_movements add column if not exists item_id text;
alter table public.cnc_stock_movements add column if not exists warehouse_id text;
alter table public.cnc_stock_movements add column if not exists direction text check (direction in ('IN', 'OUT', 'ADJ'));
alter table public.cnc_stock_movements add column if not exists qty_change numeric;
alter table public.cnc_stock_movements add column if not exists rate numeric;
alter table public.cnc_stock_movements add column if not exists reference_type text;
alter table public.cnc_stock_movements add column if not exists reference_id text;
alter table public.cnc_stock_movements add column if not exists reference_no text;
alter table public.cnc_stock_movements add column if not exists remarks text;
alter table public.cnc_stock_movements add column if not exists created_by text;
alter table public.cnc_stock_movements add column if not exists created_at timestamptz not null default now();
create index if not exists cnc_stock_movements_item_idx on public.cnc_stock_movements (company_id, item_kind, item_id);
create index if not exists cnc_stock_movements_ref_idx on public.cnc_stock_movements (company_id, reference_type, reference_id);

-- The ledger is written only by the database (functions/triggers below).
revoke insert, update, delete on public.cnc_stock_movements from authenticated;

-- Quantities that source documents had already produced before go-live (not re-counted).
create table if not exists public.inventory_source_baselines (
  id              uuid primary key default gen_random_uuid(),
  reference_type  text not null,
  reference_id    text not null,
  qty             numeric not null default 0,
  created_at      timestamptz not null default now()
);
select public.erp_secure_table('inventory_source_baselines');
create unique index if not exists inventory_source_baselines_key on public.inventory_source_baselines (company_id, reference_type, reference_id);
revoke insert, update, delete on public.inventory_source_baselines from authenticated;

-- -------------------------------------------------------------------------------------
-- 4. Ledger core
-- -------------------------------------------------------------------------------------

-- Current rate / stock / code / unit of an item.
create or replace function public.erp_item_info(p_company uuid, p_kind text, p_id text)
returns table (code text, name text, unit text, stock numeric, rate numeric, location_id text)
language sql stable security definer set search_path = ''
as $$
  select r.material_code::text, r.name::text, r.uom::text, coalesce(r.stock_qty, 0)::numeric, coalesce(r.unit_price, 0)::numeric, r.location_id::text
  from public.cnc_raw_materials r where p_kind = 'RAW' and r.company_id = p_company and r.id::text = p_id
  union all
  select p.part_no::text, p.part_name::text, p.unit::text, coalesce(p.stock_qty, 0)::numeric, coalesce(p.unit_price, 0)::numeric, p.location_id::text
  from public.cnc_parts p where p_kind = 'PART' and p.company_id = p_company and p.id::text = p_id
$$;

-- Writes one ledger row (also fills the legacy columns so older screens keep working).
create or replace function public.erp_insert_movement(
  p_company uuid, p_kind text, p_item_id text, p_type text, p_direction text, p_qty_change numeric,
  p_rate numeric, p_ref_type text, p_ref_id text, p_ref_no text, p_remarks text, p_date date, p_user text,
  p_warehouse_id text default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  i record;
  v_wh text := p_warehouse_id;
  r jsonb;
begin
  select * into i from public.erp_item_info(p_company, p_kind, p_item_id);
  if i.code is null then
    raise exception 'Item not found in the inventory master' using errcode = '22023';
  end if;
  if v_wh is null and i.location_id is not null then
    select z.warehouse_id::text into v_wh
    from public.cnc_warehouse_locations l join public.cnc_warehouse_zones z on z.id::text = l.zone_id::text
    where l.id::text = i.location_id;
  end if;
  r := public.erp_insert_json('cnc_stock_movements', jsonb_build_object(
    'company_id', p_company,
    'date', coalesce(p_date, public.erp_today()),
    'type', p_type,
    'material', i.code,
    'qty', abs(p_qty_change),
    'uom', coalesce(i.unit, ''),
    'from', case when p_qty_change < 0 then 'Stock' else coalesce(p_ref_type, '') end,
    'to', case when p_qty_change < 0 then coalesce(p_ref_type, '') else 'Stock' end,
    'reference', coalesce(p_ref_no, ''),
    'user', coalesce(p_user, ''),
    'item_kind', p_kind, 'item_id', p_item_id, 'warehouse_id', v_wh,
    'direction', p_direction, 'qty_change', p_qty_change, 'rate', coalesce(p_rate, i.rate),
    'reference_type', p_ref_type, 'reference_id', p_ref_id, 'reference_no', p_ref_no,
    'remarks', p_remarks, 'created_by', coalesce(p_user, '')));
  return r ->> 'id';
end;
$$;

-- Recalculates the cached stock (and, for a priced receipt, the moving-average rate).
create or replace function public.erp_apply_item_stock(p_company uuid, p_kind text, p_id text, p_new_rate numeric)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_stock numeric;
begin
  select coalesce(sum(qty_change), 0) into v_stock from public.cnc_stock_movements
  where company_id = p_company and item_kind = p_kind and item_id = p_id;
  perform set_config('erp.stock_sync', 'on', true);
  if p_kind = 'RAW' then
    update public.cnc_raw_materials set stock_qty = v_stock, unit_price = coalesce(p_new_rate, unit_price), updated_at = now()
    where company_id = p_company and id::text = p_id;
  else
    update public.cnc_parts set stock_qty = v_stock, unit_price = coalesce(p_new_rate, unit_price), updated_at = now()
    where company_id = p_company and id::text = p_id;
  end if;
  perform set_config('erp.stock_sync', 'off', true);
end;
$$;

create or replace function public.erp_sync_item_stock()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_old_stock numeric;
  v_old_rate numeric;
  v_new_rate numeric;
begin
  if current_setting('erp.stock_sync_skip', true) = 'on' then return null; end if;

  if tg_op in ('UPDATE', 'DELETE') and old.item_id is not null then
    perform public.erp_apply_item_stock(old.company_id, old.item_kind, old.item_id, null);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.item_id is not null then
    -- Moving weighted average on priced receipts from suppliers.
    if tg_op = 'INSERT' and new.reference_type = 'grn' and new.qty_change > 0 and new.rate is not null then
      select coalesce(sum(qty_change), 0) into v_old_stock from public.cnc_stock_movements
      where company_id = new.company_id and item_kind = new.item_kind and item_id = new.item_id and id::text <> new.id::text;
      select rate into v_old_rate from public.erp_item_info(new.company_id, new.item_kind, new.item_id);
      v_new_rate := case when v_old_stock <= 0 then new.rate
                         else round((v_old_stock * v_old_rate + new.qty_change * new.rate) / (v_old_stock + new.qty_change), 4) end;
    end if;
    perform public.erp_apply_item_stock(new.company_id, new.item_kind, new.item_id, v_new_rate);
  end if;
  return null;
end;
$$;

-- Keeps (upserts) the single ledger row that mirrors a source document line.
create or replace function public.erp_upsert_source_movement(
  p_company uuid, p_ref_type text, p_ref_id text, p_kind text, p_item_id text, p_type text,
  p_direction text, p_qty_change numeric, p_ref_no text, p_date date, p_remarks text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_existing record;
begin
  delete from public.cnc_stock_movements
  where company_id = p_company and reference_type = p_ref_type and reference_id = p_ref_id
    and (p_item_id is null or item_id is distinct from p_item_id or coalesce(p_qty_change, 0) = 0);
  if p_item_id is null or coalesce(p_qty_change, 0) = 0 then return; end if;

  select * into v_existing from public.cnc_stock_movements
  where company_id = p_company and reference_type = p_ref_type and reference_id = p_ref_id and item_id = p_item_id;
  if v_existing.item_id is null then
    perform public.erp_insert_movement(p_company, p_kind, p_item_id, p_type, p_direction, p_qty_change, null,
                                       p_ref_type, p_ref_id, p_ref_no, p_remarks, p_date, 'System');
  elsif v_existing.qty_change is distinct from p_qty_change then
    update public.cnc_stock_movements
    set qty_change = p_qty_change, qty = abs(p_qty_change), reference_no = p_ref_no, remarks = p_remarks
    where company_id = p_company and reference_type = p_ref_type and reference_id = p_ref_id and item_id = p_item_id;
  end if;
end;
$$;

-- -------------------------------------------------------------------------------------
-- 5. Accounting for movements (replaces the accounting migration's stock-issue posting)
-- -------------------------------------------------------------------------------------
create or replace function public.erp_post_stock_issue()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_value numeric;
  v_inv text;
  v_lines jsonb;
begin
  if tg_op = 'DELETE' then
    delete from public.journal_entries
    where company_id = old.company_id and source_type in ('stock_issue', 'stock_movement') and source_id = old.id::text;
    return old;
  end if;

  -- Only ledger rows for known items; pre-go-live rows and purchase receipts (posted by the
  -- goods-receipt journal) are not posted here.
  if new.item_id is null or coalesce(new.reference_type, '') in ('legacy', 'golive', 'grn') then
    perform public.erp_post_system_journal(new.company_id, 'stock_movement', new.id::text, public.erp_today(), 'Stock', null, null, null);
    return new;
  end if;

  v_value := round(abs(coalesce(new.qty_change, 0)) * coalesce(new.rate, 0), 2);
  v_inv := case when new.item_kind = 'PART' then 'INV_FG' else 'INV_RAW' end;
  v_lines := case
    when v_value = 0 then null
    when new.type in ('Production Issue', 'Issue') then jsonb_build_array(
      jsonb_build_object('key', 'MATERIAL_CONSUMED', 'debit', v_value), jsonb_build_object('key', v_inv, 'credit', v_value))
    when new.type = 'Production Receipt' then jsonb_build_array(
      jsonb_build_object('key', v_inv, 'debit', v_value), jsonb_build_object('key', 'INVENTORY_CHANGE', 'credit', v_value))
    when new.type = 'Delivery' then jsonb_build_array(
      jsonb_build_object('key', 'INVENTORY_CHANGE', 'debit', v_value), jsonb_build_object('key', v_inv, 'credit', v_value))
    when new.type = 'Adjustment' and new.qty_change > 0 then jsonb_build_array(
      jsonb_build_object('key', v_inv, 'debit', v_value), jsonb_build_object('key', 'STOCK_ADJUSTMENT', 'credit', v_value))
    when new.type = 'Adjustment' then jsonb_build_array(
      jsonb_build_object('key', 'STOCK_ADJUSTMENT', 'debit', v_value), jsonb_build_object('key', v_inv, 'credit', v_value))
    when new.type = 'Opening' then jsonb_build_array(
      jsonb_build_object('key', v_inv, 'debit', v_value), jsonb_build_object('key', 'OPENING_EQUITY', 'credit', v_value))
  end;

  perform public.erp_post_system_journal(new.company_id, 'stock_movement', new.id::text,
    coalesce(new.date::date, public.erp_today()), case when new.type = 'Opening' then 'Opening' else 'Stock' end,
    new.type || ': ' || coalesce(new.material, '') || coalesce(' (' || new.reference_no || ')', ''), new.reference_no, v_lines);
  return new;
end;
$$;

-- -------------------------------------------------------------------------------------
-- 6. Item-table guards
-- -------------------------------------------------------------------------------------
create or replace function public.erp_item_defaults()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.category_id is null then
    select id into new.category_id from public.inventory_categories
    where company_id = new.company_id and code = case when tg_table_name = 'cnc_parts' then 'FG' else 'RAW' end;
  end if;
  return new;
end;
$$;

-- A direct stock edit (old screens, SQL) is kept but recorded as an Adjustment movement.
create or replace function public.erp_item_stock_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_kind text := case when tg_table_name = 'cnc_parts' then 'PART' else 'RAW' end;
begin
  if current_setting('erp.stock_sync', true) = 'on' then return new; end if;
  new.updated_at := now();
  if coalesce(new.stock_qty, 0) is distinct from coalesce(old.stock_qty, 0) then
    perform set_config('erp.stock_sync_skip', 'on', true);
    perform public.erp_insert_movement(new.company_id, v_kind, new.id::text, 'Adjustment', 'ADJ',
      coalesce(new.stock_qty, 0) - coalesce(old.stock_qty, 0), coalesce(old.unit_price, 0), 'direct_edit', new.id::text,
      null, 'Stock edited directly on the item master', public.erp_today(), coalesce((public.erp_current_user()).full_name, 'System'));
    perform set_config('erp.stock_sync_skip', 'off', true);
  end if;
  return new;
end;
$$;

-- New item created with stock (old screens) → Opening movement; rate change → revaluation.
create or replace function public.erp_item_after_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_kind text := case when tg_table_name = 'cnc_parts' then 'PART' else 'RAW' end;
  v_value numeric;
  v_inv text := case when tg_table_name = 'cnc_parts' then 'INV_FG' else 'INV_RAW' end;
begin
  if current_setting('erp.stock_sync', true) = 'on' then return null; end if;
  if tg_op = 'INSERT' then
    if coalesce(new.stock_qty, 0) <> 0 then
      perform set_config('erp.stock_sync_skip', 'on', true);
      perform public.erp_insert_movement(new.company_id, v_kind, new.id::text, 'Opening', 'IN', new.stock_qty,
        coalesce(new.unit_price, 0), 'opening', new.id::text, null, 'Opening stock of new item', public.erp_today(),
        coalesce((public.erp_current_user()).full_name, 'System'));
      perform set_config('erp.stock_sync_skip', 'off', true);
    end if;
  elsif coalesce(new.unit_price, 0) is distinct from coalesce(old.unit_price, 0) and coalesce(new.stock_qty, 0) <> 0 then
    v_value := round(coalesce(new.stock_qty, 0) * (coalesce(new.unit_price, 0) - coalesce(old.unit_price, 0)), 2);
    if v_value <> 0 then
      perform public.erp_post_system_journal(new.company_id, 'inventory_reval', new.id::text || ':' || clock_timestamp()::text,
        public.erp_today(), 'Journal', 'Inventory revaluation: ' || coalesce(case when v_kind = 'RAW' then new.material_code::text end, ''),
        null, case when v_value > 0 then jsonb_build_array(
          jsonb_build_object('key', v_inv, 'debit', v_value), jsonb_build_object('key', 'STOCK_ADJUSTMENT', 'credit', v_value))
        else jsonb_build_array(
          jsonb_build_object('key', 'STOCK_ADJUSTMENT', 'debit', -v_value), jsonb_build_object('key', v_inv, 'credit', -v_value)) end);
    end if;
  end if;
  return null;
end;
$$;

-- -------------------------------------------------------------------------------------
-- 7. Source documents → ledger
-- -------------------------------------------------------------------------------------

-- Work order completed quantity → finished goods received (part matched by part code).
create or replace function public.erp_stock_from_work_order()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_part text;
  v_base numeric;
begin
  if tg_op = 'DELETE' then
    perform public.erp_upsert_source_movement(old.company_id, 'work_order', old.id::text, 'PART', null, null, null, 0, null, null, null);
    return old;
  end if;
  select p.id::text into v_part from public.cnc_parts p
  where p.company_id = new.company_id and p.part_no = new.part_no and coalesce(new.part_no, '') not in ('', 'N/A') limit 1;
  select qty into v_base from public.inventory_source_baselines
  where company_id = new.company_id and reference_type = 'work_order' and reference_id = new.id::text;
  perform public.erp_upsert_source_movement(new.company_id, 'work_order', new.id::text, 'PART', v_part,
    'Production Receipt', 'IN', coalesce(new.completed, 0)::numeric - coalesce(v_base, 0), new.wo_no, public.erp_today(),
    'Finished goods from work order ' || coalesce(new.wo_no, ''));
  return new;
end;
$$;

-- Delivery challan → finished goods out (part taken from the linked sales order).
create or replace function public.erp_stock_from_delivery()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_part_no text;
  v_part text;
  v_base numeric;
  v_qty numeric;
begin
  if tg_op = 'DELETE' then
    perform public.erp_upsert_source_movement(old.company_id, 'delivery', old.id::text, 'PART', null, null, null, 0, null, null, null);
    return old;
  end if;
  select coalesce(nullif(so.part_no::text, ''), nullif(so.part_number::text, '')) into v_part_no
  from public.cnc_sales_orders so where so.id::text = new.sales_order_id::text and so.company_id = new.company_id;
  select p.id::text into v_part from public.cnc_parts p
  where p.company_id = new.company_id and p.part_no = v_part_no and coalesce(v_part_no, '') not in ('', 'N/A') limit 1;
  select qty into v_base from public.inventory_source_baselines
  where company_id = new.company_id and reference_type = 'delivery' and reference_id = new.id::text;
  v_qty := case when new.status = 'Cancelled' then 0 else coalesce(new.dispatch_qty, new.quantity, 0)::numeric end;
  perform public.erp_upsert_source_movement(new.company_id, 'delivery', new.id::text, 'PART', v_part,
    'Delivery', 'OUT', -(v_qty - coalesce(v_base, 0)), new.delivery_no, coalesce(new.delivery_date::date, public.erp_today()),
    'Delivered to ' || coalesce(new.customer_name, 'customer'));
  return new;
end;
$$;

-- Goods receipt posting (called by the Purchasing page). Replaces the previous function:
-- stock now enters through the ledger at the purchase-order price.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, row_number() over () as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public' and p.proname = 'post_goods_receipt'
  loop
    execute format('alter function %s rename to post_goods_receipt_before_ledger_%s', f.sig, f.n);
    execute format('revoke all on function %s from public, anon, authenticated', f.sig); -- regprocedure now shows the new name
  end loop;
end;
$$;

-- Posts (or removes) the stock of one goods receipt. Driven by its status, so the ledger and
-- the accounts agree however the status was changed.
create or replace function public.erp_post_grn_stock(p_company uuid, p_grn_id text, p_user text)
returns int
language plpgsql security definer set search_path = ''
as $fn$
declare
  g record;
  gi record;
  v_kind text;
  v_item text;
  v_rate numeric;
  n int := 0;
begin
  select * into g from public.cnc_goods_receipts where id::text = p_grn_id and company_id = p_company;
  if g.id is null then return 0; end if;

  if g.status is distinct from 'Posted' then
    delete from public.cnc_stock_movements
    where company_id = p_company and reference_type = 'grn'
      and reference_id in (select gi2.id::text from public.cnc_goods_receipt_items gi2
                           where gi2.goods_receipt_id::text = p_grn_id);
    return 0;
  end if;

  for gi in select * from public.cnc_goods_receipt_items where goods_receipt_id::text = p_grn_id and company_id = p_company loop
    continue when coalesce(gi.received_qty, 0) <= 0;
    if exists (select 1 from public.cnc_stock_movements
               where company_id = p_company and reference_type = 'grn' and reference_id = gi.id::text) then
      n := n + 1; continue;   -- already in the ledger
    end if;
    v_kind := null; v_item := null;
    if gi.raw_material_id is not null then
      v_kind := 'RAW'; v_item := gi.raw_material_id::text;
    elsif gi.part_id is not null then
      v_kind := 'PART'; v_item := gi.part_id::text;
    else
      select 'RAW', r.id::text into v_kind, v_item from public.cnc_raw_materials r
      where r.company_id = p_company and r.material_code = gi.material_code limit 1;
      if v_item is null then
        select 'PART', p.id::text into v_kind, v_item from public.cnc_parts p
        where p.company_id = p_company and p.part_no = gi.material_code limit 1;
      end if;
    end if;
    if v_item is null then
      raise exception 'Item % (%) is not in the inventory master', gi.material_code, gi.material_name using errcode = '22023';
    end if;
    select poi.unit_price into v_rate from public.cnc_purchase_order_items poi where poi.id::text = gi.purchase_order_item_id::text;
    perform public.erp_insert_movement(p_company, v_kind, v_item, 'Purchase Inward', 'IN', gi.received_qty::numeric, v_rate,
      'grn', gi.id::text, g.grn_number, coalesce('Supplier invoice ' || g.supplier_invoice_no, 'Goods receipt'),
      coalesce(g.receipt_date::date, public.erp_today(p_company)), p_user, g.warehouse_id::text);
    n := n + 1;
  end loop;
  return n;
end;
$fn$;

create or replace function public.erp_stock_from_grn()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    delete from public.cnc_stock_movements
    where company_id = old.company_id and reference_type = 'grn'
      and reference_id in (select gi.id::text from public.cnc_goods_receipt_items gi
                           where gi.goods_receipt_id::text = old.id::text);
    return old;
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform public.erp_post_grn_stock(new.company_id, new.id::text,
      coalesce((public.erp_current_user()).full_name, 'System'));
  end if;
  return new;
end;
$fn$;

-- Called by the Purchasing page: validates, then marks the receipt Posted (the trigger books
-- the stock, and the goods-receipt journal books the purchase).
create or replace function public.post_goods_receipt(p_grn_id text, p_user text)
returns void
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_company uuid := public.erp_report_company();
  g record;
begin
  select * into g from public.cnc_goods_receipts where id::text = p_grn_id and company_id = v_company;
  if g.id is null then raise exception 'Goods receipt not found' using errcode = '22023'; end if;
  if g.status = 'Posted' then raise exception 'Goods receipt % is already posted', g.grn_number; end if;
  if not exists (select 1 from public.cnc_goods_receipt_items
                 where goods_receipt_id::text = p_grn_id and company_id = v_company and coalesce(received_qty, 0) > 0) then
    raise exception 'Nothing to post: the goods receipt has no received quantity';
  end if;

  update public.cnc_goods_receipts set status = 'Posted' where id::text = p_grn_id;
  begin
    execute 'update public.cnc_goods_receipts set posted_by = $1, posted_at = now() where id::text = $2' using p_user, p_grn_id;
  exception when undefined_column then null;
  end;

  -- Purchase order status from everything received against it so far.
  begin
    execute $sql$
      update public.cnc_purchase_orders po
      set status = case when not exists (
            select 1 from public.cnc_purchase_order_items poi
            where poi.purchase_order_id::text = po.id::text
              and coalesce(poi.quantity, 0) > coalesce((
                select sum(gi.received_qty) from public.cnc_goods_receipt_items gi
                join public.cnc_goods_receipts gr on gr.id::text = gi.goods_receipt_id::text
                where gr.status = 'Posted' and gi.purchase_order_item_id::text = poi.id::text), 0))
          then 'Received' else 'Partially Received' end
      where po.id::text = $1 $sql$ using g.purchase_order_id::text;
  exception when undefined_column or undefined_table then null;
  end;
end;
$fn$;

-- Material issued against a material request (Inventory → Material Requests).
create or replace function public.erp_issue_material(p_request_id text, p_lines jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid := public.erp_report_company();
  mr record;
  l record;
  n int := 0;
begin
  select * into mr from public.cnc_material_requests where id::text = p_request_id and company_id = v_company;
  if mr.id is null then raise exception 'Material request not found' using errcode = '22023'; end if;
  if mr.status = 'Issued' then raise exception 'Material request % is already issued', mr.request_no; end if;

  -- Check every line (same item on several lines is summed) before writing anything.
  for l in
    select x ->> 'raw_material_id' as item_id, sum((x ->> 'qty')::numeric) as qty
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) x group by 1
  loop
    if l.qty is null or l.qty <= 0 then raise exception 'Issue quantity must be greater than zero'; end if;
    if not exists (select 1 from public.erp_item_info(v_company, 'RAW', l.item_id)) then
      raise exception 'Material not found in the inventory master';
    end if;
    if (select stock from public.erp_item_info(v_company, 'RAW', l.item_id)) < l.qty then
      raise exception '% : requested %, only % in stock', (select code from public.erp_item_info(v_company, 'RAW', l.item_id)),
        l.qty, (select stock from public.erp_item_info(v_company, 'RAW', l.item_id));
    end if;
  end loop;

  for l in select x ->> 'raw_material_id' as item_id, (x ->> 'qty')::numeric as qty from jsonb_array_elements(p_lines) x loop
    perform public.erp_insert_movement(v_company, 'RAW', l.item_id, 'Production Issue', 'OUT', -l.qty, null,
      'material_request', mr.id::text, mr.request_no, 'Issued for work order ' || coalesce(mr.work_order_no, ''),
      public.erp_today(), me.full_name);
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Nothing to issue on this request'; end if;
  update public.cnc_material_requests set status = 'Issued' where id::text = p_request_id;
  return jsonb_build_object('issued_lines', n);
end;
$$;

-- -------------------------------------------------------------------------------------
-- 8. Go-live (existing rows are adopted into the ledger without changing any figure)
-- -------------------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in select id from public.companies loop
    perform public.erp_seed_inventory_setup(c.id);
    update public.cnc_raw_materials r set category_id = (select id from public.inventory_categories where company_id = c.id and code = 'RAW')
    where r.company_id = c.id and r.category_id is null;
    update public.cnc_parts p set category_id = (select id from public.inventory_categories where company_id = c.id and code = 'FG')
    where p.company_id = c.id and p.category_id is null;
  end loop;
end;
$$;

-- Pre-existing movement rows: link to their item where the text matches (history only).
update public.cnc_stock_movements m
set reference_type = 'legacy',
    direction = case when m.type ~* '^(issue|out|dispatch|delivery|consum)' then 'OUT' else 'IN' end,
    qty_change = case when m.type ~* '^(issue|out|dispatch|delivery|consum)' then -abs(coalesce(m.qty::numeric, 0)) else abs(coalesce(m.qty::numeric, 0)) end,
    item_kind = coalesce(
      (select 'RAW' from public.cnc_raw_materials r where r.company_id = m.company_id and (r.material_code = m.material or r.name = m.material) limit 1),
      (select 'PART' from public.cnc_parts p where p.company_id = m.company_id and (p.part_no = m.material or p.part_name = m.material) limit 1)),
    item_id = coalesce(
      (select r.id::text from public.cnc_raw_materials r where r.company_id = m.company_id and (r.material_code = m.material or r.name = m.material) limit 1),
      (select p.id::text from public.cnc_parts p where p.company_id = m.company_id and (p.part_no = m.material or p.part_name = m.material) limit 1)),
    reference_no = coalesce(m.reference_no, m.reference)
where m.reference_type is null;

-- Opening movement per item so that Σ ledger = today's stock exactly.
do $$
declare
  i record;
  v_hist numeric;
begin
  for i in
    select 'RAW' as kind, r.id::text as id, r.company_id, coalesce(r.stock_qty, 0)::numeric as stock, coalesce(r.unit_price, 0)::numeric as rate
    from public.cnc_raw_materials r
    union all
    select 'PART', p.id::text, p.company_id, coalesce(p.stock_qty, 0)::numeric, coalesce(p.unit_price, 0)::numeric
    from public.cnc_parts p
  loop
    select coalesce(sum(qty_change), 0) into v_hist from public.cnc_stock_movements
    where company_id = i.company_id and item_kind = i.kind and item_id = i.id;
    if i.stock - v_hist <> 0 then
      perform public.erp_insert_movement(i.company_id, i.kind, i.id, 'Opening', 'IN', i.stock - v_hist, i.rate,
        'golive', i.id, 'GO-LIVE', 'Stock at inventory go-live', public.erp_today(), 'System');
    end if;
  end loop;
end;
$$;

-- Goods receipts already posted before go-live are part of today's stock, so they are marked
-- as already in the ledger rather than added again.
do $$
declare rec record;
begin
  for rec in
    select gi.id::text as item_id, gi.company_id, gi.material_code, g.grn_number
    from public.cnc_goods_receipt_items gi
    join public.cnc_goods_receipts g on g.id::text = gi.goods_receipt_id::text
    where g.status = 'Posted'
      and not exists (select 1 from public.cnc_stock_movements m
                      where m.company_id = gi.company_id and m.reference_type = 'grn' and m.reference_id = gi.id::text)
  loop
    perform public.erp_insert_json('cnc_stock_movements', jsonb_build_object(
      'company_id', rec.company_id, 'date', public.erp_today(rec.company_id), 'type', 'Purchase Inward',
      'material', coalesce(rec.material_code, ''), 'qty', 0, 'qty_change', 0, 'direction', 'IN',
      'reference_type', 'grn', 'reference_id', rec.item_id, 'reference_no', rec.grn_number,
      'remarks', 'Received before inventory go-live (already included in opening stock)', 'created_by', 'System'));
  end loop;
end;
$$;

-- Work orders / deliveries already on file: their quantities are part of today's stock.
insert into public.inventory_source_baselines (company_id, reference_type, reference_id, qty)
select w.company_id, 'work_order', w.id::text, coalesce(w.completed, 0) from public.cnc_work_orders w
on conflict do nothing;
insert into public.inventory_source_baselines (company_id, reference_type, reference_id, qty)
select d.company_id, 'delivery', d.id::text, case when d.status = 'Cancelled' then 0 else coalesce(d.dispatch_qty, d.quantity, 0) end
from public.cnc_deliveries d
on conflict do nothing;

-- -------------------------------------------------------------------------------------
-- 9. Triggers (created after go-live so adopting existing rows changes nothing)
-- -------------------------------------------------------------------------------------
drop trigger if exists zz_erp_sync_item_stock on public.cnc_stock_movements;
create trigger zz_erp_sync_item_stock after insert or update or delete on public.cnc_stock_movements
  for each row execute function public.erp_sync_item_stock();

drop trigger if exists ab_erp_item_defaults on public.cnc_raw_materials;
create trigger ab_erp_item_defaults before insert on public.cnc_raw_materials for each row execute function public.erp_item_defaults();
drop trigger if exists ab_erp_item_defaults on public.cnc_parts;
create trigger ab_erp_item_defaults before insert on public.cnc_parts for each row execute function public.erp_item_defaults();
drop trigger if exists ab_erp_item_stock_guard on public.cnc_raw_materials;
create trigger ab_erp_item_stock_guard before update on public.cnc_raw_materials for each row execute function public.erp_item_stock_guard();
drop trigger if exists ab_erp_item_stock_guard on public.cnc_parts;
create trigger ab_erp_item_stock_guard before update on public.cnc_parts for each row execute function public.erp_item_stock_guard();
drop trigger if exists zz_erp_item_after_change on public.cnc_raw_materials;
create trigger zz_erp_item_after_change after insert or update on public.cnc_raw_materials for each row execute function public.erp_item_after_change();
drop trigger if exists zz_erp_item_after_change on public.cnc_parts;
create trigger zz_erp_item_after_change after insert or update on public.cnc_parts for each row execute function public.erp_item_after_change();

drop trigger if exists zz_erp_stock_from_work_order on public.cnc_work_orders;
create trigger zz_erp_stock_from_work_order after insert or update or delete on public.cnc_work_orders
  for each row execute function public.erp_stock_from_work_order();
drop trigger if exists zz_erp_stock_from_grn on public.cnc_goods_receipts;
create trigger zz_erp_stock_from_grn after insert or update or delete on public.cnc_goods_receipts
  for each row execute function public.erp_stock_from_grn();
drop trigger if exists zz_erp_stock_from_delivery on public.cnc_deliveries;
create trigger zz_erp_stock_from_delivery after insert or update or delete on public.cnc_deliveries
  for each row execute function public.erp_stock_from_delivery();

-- -------------------------------------------------------------------------------------
-- 10. Inventory page API (scoped to the current company)
-- -------------------------------------------------------------------------------------

-- Every item of a company with derived fields (internal).
create or replace function public.erp_inventory_rows(p_company uuid)
returns table (kind text, id text, code text, name text, category_id uuid, category_name text, category_code text,
               category_sort int, specification text, unit text, current_stock numeric, min_stock numeric,
               reorder_qty numeric, rate numeric, value numeric, status text, supplier_id text, supplier_name text,
               warehouse_id text, warehouse_name text, location_id text, location_name text, image_url text,
               item_status text, updated_at timestamptz, created_at timestamptz, grade text, form text)
language sql stable security definer set search_path = ''
as $$
  with items as (
    select 'RAW'::text as kind, r.id::text as id, r.material_code::text as code, r.name::text as name, r.category_id,
           coalesce(nullif(r.specification, ''), nullif(concat_ws(', ', nullif(r.grade::text, ''), nullif(r.form::text, '')), '')) as specification,
           r.uom::text as unit, coalesce(r.stock_qty, 0)::numeric as stock, coalesce(r.min_stock, 0)::numeric as min_stock,
           coalesce(r.reorder_qty, 0)::numeric as reorder_qty, coalesce(r.unit_price, 0)::numeric as rate,
           r.preferred_supplier_id::text as supplier_id, r.location_id::text as location_id, r.image_url,
           r.status::text as item_status, r.updated_at, r.created_at, r.grade::text as grade, r.form::text as form
    from public.cnc_raw_materials r where r.company_id = p_company
    union all
    select 'PART', p.id::text, p.part_no::text, p.part_name::text, p.category_id,
           coalesce(nullif(p.specification, ''), nullif(concat_ws(', ', nullif(p.drawing_no::text, ''), nullif(p.material::text, '')), '')),
           p.unit::text, coalesce(p.stock_qty, 0)::numeric, coalesce(p.min_stock, 0)::numeric, coalesce(p.reorder_qty, 0)::numeric,
           coalesce(p.unit_price, 0)::numeric, p.preferred_supplier_id::text, p.location_id::text, p.image_url,
           p.status::text, p.updated_at, p.created_at, null, null
    from public.cnc_parts p where p.company_id = p_company
  )
  select i.kind, i.id, i.code, i.name, i.category_id, c.name, c.code, c.sort_order, i.specification, i.unit,
         i.stock, i.min_stock, i.reorder_qty, i.rate, round(i.stock * i.rate, 2), public.erp_stock_status(i.stock, i.min_stock),
         i.supplier_id, s.name::text, w.id::text, w.name::text, i.location_id, l.name::text, i.image_url,
         i.item_status, i.updated_at, i.created_at, i.grade, i.form
  from items i
  left join public.inventory_categories c on c.id = i.category_id
  left join public.cnc_suppliers s on s.id::text = i.supplier_id and s.company_id = p_company
  left join public.cnc_warehouse_locations l on l.id::text = i.location_id and l.company_id = p_company
  left join public.cnc_warehouse_zones z on z.id::text = l.zone_id::text
  left join public.cnc_warehouses w on w.id::text = z.warehouse_id::text
$$;

create or replace function public.erp_inventory_filters()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_company uuid := public.erp_report_company();
  me public.company_users := public.erp_current_user();
begin
  return jsonb_build_object(
    'company', (select jsonb_build_object('id', c.id, 'company_name', c.company_name) from public.companies c where c.id = v_company),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'kind', kind, 'sort_order', sort_order)
                    order by sort_order, name), '[]') from public.inventory_categories where company_id = v_company and status = 'Active'),
    'suppliers', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id::text, 'name', s.name) order by s.name), '[]')
                  from public.cnc_suppliers s where s.company_id = v_company),
    'warehouses', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id::text, 'code', w.code, 'name', w.name) order by w.name), '[]')
                   from public.cnc_warehouses w where w.company_id = v_company),
    'locations', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id::text, 'code', l.code, 'name', l.name,
                    'warehouse_id', w.id::text, 'warehouse_name', w.name) order by w.name, l.code), '[]')
                  from public.cnc_warehouse_locations l
                  left join public.cnc_warehouse_zones z on z.id::text = l.zone_id::text
                  left join public.cnc_warehouses w on w.id::text = z.warehouse_id::text
                  where l.company_id = v_company),
    'units', (select coalesce(jsonb_agg(distinct unit order by unit), '[]') from public.erp_inventory_rows(v_company) where coalesce(unit, '') <> ''),
    'can_manage', me.role in ('SUPER_ADMIN', 'COMPANY_ADMIN'));
end;
$$;

create or replace function public.erp_inventory_items(
  p_category_id uuid default null, p_search text default null, p_supplier_id text default null,
  p_status text default null, p_warehouse_id text default null, p_page int default 1, p_page_size int default 10)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_company uuid := public.erp_report_company();
  v_size int := least(greatest(coalesce(p_page_size, 10), 1), 500);
  v_page int := greatest(coalesce(p_page, 1), 1);
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_total int;
  v_rows jsonb;
begin
  with f as (
    select * from public.erp_inventory_rows(v_company) r
    where (p_category_id is null or r.category_id = p_category_id)
      and (nullif(p_supplier_id, '') is null or r.supplier_id = p_supplier_id)
      and (nullif(p_status, '') is null or r.status = p_status
           or (p_status = 'Reorder' and r.status in ('Low Stock', 'Out of Stock')))
      and (nullif(p_warehouse_id, '') is null or r.warehouse_id = p_warehouse_id)
      and (v_q is null or r.code ilike '%' || v_q || '%' or r.name ilike '%' || v_q || '%'
           or r.specification ilike '%' || v_q || '%' or r.category_name ilike '%' || v_q || '%'
           or r.supplier_name ilike '%' || v_q || '%')
  )
  select (select count(*) from f),
         (select coalesce(jsonb_agg(jsonb_build_object(
            'kind', kind, 'id', id, 'code', code, 'name', name, 'category_id', category_id, 'category_name', category_name,
            'category_code', category_code, 'specification', specification, 'unit', unit,
            'current_stock', current_stock::text, 'min_stock', min_stock::text, 'reorder_qty', reorder_qty::text,
            'rate', rate::text, 'value', value::text, 'status', status, 'supplier_id', supplier_id, 'supplier_name', supplier_name,
            'warehouse_id', warehouse_id, 'warehouse_name', warehouse_name, 'location_id', location_id, 'location_name', location_name,
            'image_url', image_url, 'item_status', item_status, 'updated_at', updated_at) order by code), '[]')
          from (select * from f order by code limit v_size offset (v_page - 1) * v_size) pg)
  into v_total, v_rows;
  return jsonb_build_object('total', v_total, 'page', v_page, 'page_size', v_size, 'rows', v_rows);
end;
$$;

create or replace function public.erp_inventory_summary()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_company uuid := public.erp_report_company();
begin
  return (
    with r as (select * from public.erp_inventory_rows(v_company))
    select jsonb_build_object(
      'total_items', count(*),
      'in_stock', count(*) filter (where status = 'In Stock'),
      'low_stock', count(*) filter (where status = 'Low Stock'),
      'out_of_stock', count(*) filter (where status = 'Out of Stock'),
      'to_reorder', count(*) filter (where status in ('Low Stock', 'Out of Stock')),
      'total_value', coalesce(sum(value), 0)::text,
      'by_category', (select coalesce(jsonb_agg(jsonb_build_object('category_id', c.id, 'code', c.code, 'name', c.name,
                        'items', (select count(*) from r where r.category_id = c.id),
                        'value', (select coalesce(sum(value), 0) from r where r.category_id = c.id)::text) order by c.sort_order), '[]')
                      from public.inventory_categories c where c.company_id = v_company and c.status = 'Active'))
    from r);
end;
$$;

create or replace function public.erp_movement_json(m public.cnc_stock_movements, p_balance numeric)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id::text, 'txn_date', m.date, 'type', m.type,
    'direction', coalesce(m.direction, case when coalesce(m.qty_change, 0) < 0 then 'OUT' else 'IN' end),
    'qty', coalesce(m.qty_change, m.qty::numeric)::text, 'unit', m.uom, 'rate', m.rate::text,
    'balance', p_balance::text, 'item_kind', m.item_kind, 'item_id', m.item_id,
    'item_code', coalesce((select code from public.erp_item_info(m.company_id, m.item_kind, m.item_id)), m.material::text),
    'item_name', (select name from public.erp_item_info(m.company_id, m.item_kind, m.item_id)),
    'reference_type', m.reference_type, 'reference_id', m.reference_id,
    'reference_no', coalesce(m.reference_no, m.reference::text), 'remarks', m.remarks,
    'created_by', coalesce(m.created_by, m."user"::text), 'created_at', m.created_at)
$$;

create or replace function public.erp_inventory_recent(p_limit int default 5)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_company uuid := public.erp_report_company();
begin
  return (select coalesce(jsonb_agg(public.erp_movement_json(q.mv, null) order by q.ca desc, q.d desc), '[]')
          from (select mv, mv.created_at as ca, mv.date as d from public.cnc_stock_movements mv
                where mv.company_id = v_company and coalesce(mv.reference_type, '') <> 'golive'
                order by mv.created_at desc, mv.date desc limit least(greatest(coalesce(p_limit, 5), 1), 100)) q);
end;
$$;

create or replace function public.erp_inventory_item(p_kind text, p_id text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_company uuid := public.erp_report_company();
  v_item jsonb;
begin
  select jsonb_build_object(
    'kind', kind, 'id', id, 'code', code, 'name', name, 'category_id', category_id, 'category_name', category_name,
    'category_code', category_code, 'specification', specification, 'unit', unit,
    'current_stock', current_stock::text, 'min_stock', min_stock::text, 'reorder_qty', reorder_qty::text,
    'rate', rate::text, 'value', value::text, 'status', status, 'supplier_id', supplier_id, 'supplier_name', supplier_name,
    'warehouse_id', warehouse_id, 'warehouse_name', warehouse_name, 'location_id', location_id, 'location_name', location_name,
    'image_url', image_url, 'item_status', item_status, 'updated_at', updated_at, 'created_at', created_at, 'grade', grade, 'form', form)
  into v_item
  from public.erp_inventory_rows(v_company) where kind = p_kind and id = p_id;
  if v_item is null then raise exception 'Item not found' using errcode = '22023'; end if;

  return jsonb_build_object('item', v_item, 'movements', (
    select coalesce(jsonb_agg(public.erp_movement_json(q.mv, q.bal) order by q.d, q.ca, q.i), '[]')
    from (select mv, mv.date as d, mv.created_at as ca, mv.id::text as i,
                 sum(coalesce(mv.qty_change, 0)) over (order by mv.date, mv.created_at, mv.id::text) as bal
          from public.cnc_stock_movements mv
          where mv.company_id = v_company and mv.item_kind = p_kind and mv.item_id = p_id) q));
end;
$$;

-- Create / edit an item. Stock is never set here (opening quantity becomes an Opening movement).
create or replace function public.erp_save_inventory_item(p_item jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid := public.erp_report_company();
  v_cat public.inventory_categories;
  v_kind text;
  v_id text := nullif(p_item ->> 'id', '');
  v_code text := btrim(coalesce(p_item ->> 'code', ''));
  v_name text := btrim(coalesce(p_item ->> 'name', ''));
  v_unit text := btrim(coalesce(p_item ->> 'unit', ''));
  v_min numeric; v_reorder numeric; v_rate numeric; v_open numeric;
  v_loc_name text;
  v_row jsonb;
begin
  if v_code = '' or v_name = '' or v_unit = '' then raise exception 'Item code, name and unit are required'; end if;
  begin
    v_min := coalesce(nullif(p_item ->> 'min_stock', '')::numeric, 0);
    v_reorder := coalesce(nullif(p_item ->> 'reorder_qty', '')::numeric, 0);
    v_rate := coalesce(nullif(p_item ->> 'rate', '')::numeric, 0);
    v_open := coalesce(nullif(p_item ->> 'opening_qty', '')::numeric, 0);
  exception when others then
    raise exception 'Minimum stock, reorder quantity, rate and opening quantity must be numbers';
  end;
  if v_min < 0 or v_reorder < 0 or v_rate < 0 or v_open < 0 then raise exception 'Quantities and rate cannot be negative'; end if;

  select * into v_cat from public.inventory_categories where id = nullif(p_item ->> 'category_id', '')::uuid and company_id = v_company;
  if v_cat.id is null then raise exception 'Choose a category'; end if;
  v_kind := case when v_cat.kind = 'MANUFACTURED' then 'PART' else 'RAW' end;

  if nullif(p_item ->> 'supplier_id', '') is not null and not exists (
       select 1 from public.cnc_suppliers where id::text = p_item ->> 'supplier_id' and company_id = v_company) then
    raise exception 'Supplier not found';
  end if;
  if nullif(p_item ->> 'location_id', '') is not null then
    select name::text into v_loc_name from public.cnc_warehouse_locations where id::text = p_item ->> 'location_id' and company_id = v_company;
    if v_loc_name is null then raise exception 'Location not found'; end if;
  end if;

  if exists (select 1 from public.cnc_raw_materials where company_id = v_company and lower(material_code) = lower(v_code)
               and (v_id is null or v_kind <> 'RAW' or id::text <> v_id))
     or exists (select 1 from public.cnc_parts where company_id = v_company and lower(part_no) = lower(v_code)
               and (v_id is null or v_kind <> 'PART' or id::text <> v_id)) then
    raise exception 'Item code % already exists', v_code using errcode = '23505';
  end if;

  if v_id is not null then
    if coalesce(p_item ->> 'kind', '') <> v_kind then
      raise exception 'An item cannot move between purchased and manufactured categories';
    end if;
    if not public.erp_update_json(case when v_kind = 'RAW' then 'cnc_raw_materials' else 'cnc_parts' end, v_id, v_company,
         jsonb_build_object(
           case when v_kind = 'RAW' then 'material_code' else 'part_no' end, v_code,
           case when v_kind = 'RAW' then 'name' else 'part_name' end, v_name,
           case when v_kind = 'RAW' then 'uom' else 'unit' end, v_unit,
           'category_id', v_cat.id, 'specification', nullif(btrim(p_item ->> 'specification'), ''),
           'min_stock', v_min, 'reorder_qty', v_reorder, 'unit_price', v_rate,
           'preferred_supplier_id', nullif(p_item ->> 'supplier_id', ''), 'location_id', nullif(p_item ->> 'location_id', ''),
           'image_url', nullif(p_item ->> 'image_url', ''), 'status', coalesce(nullif(p_item ->> 'status', ''), 'Active'))
         || case when v_kind = 'RAW' and v_loc_name is not null then jsonb_build_object('location', v_loc_name) else '{}'::jsonb end) then
      raise exception 'Item not found';
    end if;
    return jsonb_build_object('kind', v_kind, 'id', v_id);
  end if;

  if v_kind = 'RAW' then
    v_row := public.erp_insert_json('cnc_raw_materials', jsonb_build_object(
      'company_id', v_company, 'material_code', v_code, 'name', v_name, 'category_id', v_cat.id,
      'specification', nullif(btrim(p_item ->> 'specification'), ''), 'grade', '', 'form', '', 'uom', v_unit,
      'stock_qty', 0, 'min_stock', v_min, 'reorder_qty', v_reorder, 'unit_price', v_rate,
      'preferred_supplier_id', nullif(p_item ->> 'supplier_id', ''), 'location_id', nullif(p_item ->> 'location_id', ''),
      'location', coalesce(v_loc_name, ''), 'image_url', nullif(p_item ->> 'image_url', ''),
      'status', coalesce(nullif(p_item ->> 'status', ''), 'Active')));
  else
    v_row := public.erp_insert_json('cnc_parts', jsonb_build_object(
      'company_id', v_company, 'part_no', v_code, 'part_name', v_name, 'category_id', v_cat.id,
      'specification', nullif(btrim(p_item ->> 'specification'), ''), 'drawing_no', '', 'revision', '', 'material', '',
      'unit', v_unit, 'stock_qty', 0, 'min_stock', v_min, 'reorder_qty', v_reorder, 'unit_price', v_rate,
      'preferred_supplier_id', nullif(p_item ->> 'supplier_id', ''), 'location_id', nullif(p_item ->> 'location_id', ''),
      'image_url', nullif(p_item ->> 'image_url', ''), 'status', coalesce(nullif(p_item ->> 'status', ''), 'Active')));
  end if;

  if v_open > 0 then
    perform public.erp_insert_movement(v_company, v_kind, v_row ->> 'id', 'Opening', 'IN', v_open, v_rate, 'opening', v_row ->> 'id',
      null, 'Opening stock', coalesce(nullif(p_item ->> 'opening_date', '')::date, public.erp_today()), me.full_name);
  end if;
  return jsonb_build_object('kind', v_kind, 'id', v_row ->> 'id');
end;
$$;

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
  if me.role not in ('SUPER_ADMIN', 'COMPANY_ADMIN') then
    raise exception 'Only administrators can adjust stock' using errcode = '42501';
  end if;
  if p_direction not in ('IN', 'OUT') then raise exception 'Choose increase or decrease'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required for a stock adjustment'; end if;
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

create or replace function public.erp_import_inventory_items(p_rows jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid := public.erp_report_company();
  r jsonb;
  n int := 0;
  v_created int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_cat uuid;
  v_sup text;
  v_loc text;
begin
  if me.role not in ('SUPER_ADMIN', 'COMPANY_ADMIN') then
    raise exception 'Only administrators can import items' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Nothing to import'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'Import at most 5000 rows at a time'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    n := n + 1;
    begin
      select id into v_cat from public.inventory_categories
      where company_id = v_company and (lower(name) = lower(btrim(r ->> 'category')) or lower(code) = lower(btrim(r ->> 'category')));
      if v_cat is null then raise exception 'Unknown category "%"', coalesce(r ->> 'category', ''); end if;
      v_sup := null; v_loc := null;
      if nullif(btrim(r ->> 'supplier'), '') is not null then
        select id::text into v_sup from public.cnc_suppliers where company_id = v_company and lower(name) = lower(btrim(r ->> 'supplier')) limit 1;
        if v_sup is null then raise exception 'Unknown supplier "%"', r ->> 'supplier'; end if;
      end if;
      if nullif(btrim(r ->> 'location'), '') is not null then
        select id::text into v_loc from public.cnc_warehouse_locations
        where company_id = v_company and (lower(code) = lower(btrim(r ->> 'location')) or lower(name) = lower(btrim(r ->> 'location'))) limit 1;
        if v_loc is null then raise exception 'Unknown location "%"', r ->> 'location'; end if;
      end if;
      perform public.erp_save_inventory_item(jsonb_build_object(
        'id', null, 'code', r ->> 'code', 'name', r ->> 'name', 'category_id', v_cat, 'specification', r ->> 'specification',
        'unit', r ->> 'unit', 'min_stock', r ->> 'min_stock', 'reorder_qty', r ->> 'reorder_qty', 'rate', r ->> 'rate',
        'supplier_id', v_sup, 'location_id', v_loc, 'opening_qty', r ->> 'opening_qty', 'status', 'Active'));
      v_created := v_created + 1;
    exception when others then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('row', n, 'code', r ->> 'code', 'message', sqlerrm));
    end;
  end loop;
  return jsonb_build_object('created', v_created, 'errors', v_errors);
end;
$$;

-- -------------------------------------------------------------------------------------
-- 11. Item images (private bucket; files live under <company_id>/...)
-- -------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public) values ('inventory-images', 'inventory-images', false)
    on conflict (id) do nothing;
    drop policy if exists inventory_images_read on storage.objects;
    drop policy if exists inventory_images_write on storage.objects;
    drop policy if exists inventory_images_update on storage.objects;
    drop policy if exists inventory_images_delete on storage.objects;
    create policy inventory_images_read on storage.objects for select to authenticated
      using (bucket_id = 'inventory-images' and (storage.foldername(name))[1] = any (
        select unnest((select public.erp_visible_company_ids()))::text));
    create policy inventory_images_write on storage.objects for insert to authenticated
      with check (bucket_id = 'inventory-images' and (storage.foldername(name))[1] = any (
        select unnest((select public.erp_visible_company_ids()))::text));
    create policy inventory_images_update on storage.objects for update to authenticated
      using (bucket_id = 'inventory-images' and (storage.foldername(name))[1] = any (
        select unnest((select public.erp_visible_company_ids()))::text));
    create policy inventory_images_delete on storage.objects for delete to authenticated
      using (bucket_id = 'inventory-images' and (storage.foldername(name))[1] = any (
        select unnest((select public.erp_visible_company_ids()))::text));
  end if;
end;
$$;

-- -------------------------------------------------------------------------------------
-- 12. Privileges
-- -------------------------------------------------------------------------------------
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'erp_insert_json', 'erp_update_json', 'erp_seed_inventory_setup', 'erp_seed_inventory_trigger', 'erp_item_info', 'erp_insert_movement',
      'erp_apply_item_stock', 'erp_sync_item_stock', 'erp_upsert_source_movement', 'erp_post_stock_issue',
      'erp_item_defaults', 'erp_item_stock_guard', 'erp_item_after_change', 'erp_stock_from_work_order',
      'erp_stock_from_delivery', 'erp_post_grn_stock', 'erp_stock_from_grn', 'erp_inventory_rows', 'erp_movement_json')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'post_goods_receipt', 'erp_issue_material', 'erp_inventory_filters', 'erp_inventory_items', 'erp_inventory_summary',
      'erp_inventory_recent', 'erp_inventory_item', 'erp_save_inventory_item', 'erp_adjust_stock', 'erp_import_inventory_items',
      'erp_stock_status')
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- Report: ledger must reproduce today's stock for every item.
select
  (select count(*) from public.cnc_stock_movements where reference_type = 'golive') as opening_movements,
  (select count(*) from (
     select r.id from public.cnc_raw_materials r
     where coalesce(r.stock_qty, 0) <> coalesce((select sum(qty_change) from public.cnc_stock_movements m
                                                 where m.company_id = r.company_id and m.item_kind = 'RAW' and m.item_id = r.id::text), 0)
     union all
     select p.id from public.cnc_parts p
     where coalesce(p.stock_qty, 0) <> coalesce((select sum(qty_change) from public.cnc_stock_movements m
                                                 where m.company_id = p.company_id and m.item_kind = 'PART' and m.item_id = p.id::text), 0)
   ) x) as items_not_matching_ledger;

commit;
