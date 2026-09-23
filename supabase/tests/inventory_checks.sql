-- =====================================================================================
-- Inventory / stock ledger checks for the ARGUS CNC ERP.
--
-- Run in the Supabase SQL editor AFTER all three migrations. Everything is ROLLED BACK at the
-- end. A failing check stops with "FAILED Ix: ...". Success ends with the single row
-- "ALL INVENTORY CHECKS PASSED".
-- =====================================================================================

begin;

select set_config('request.jwt.claims', '', true);

-- Test-only helper (dropped by the final ROLLBACK): inserts a row using only the columns the
-- test cares about. Any other NOT NULL column without a default gets a harmless value of the
-- right type (a parent row is created for required foreign keys), so the checks work whatever
-- extra required columns the live tables have. Runs with the caller's rights: RLS and the
-- company trigger apply exactly as for the app.
create or replace function public.erp_test_insert(p_table text, p_values jsonb)
returns jsonb
language plpgsql
as $$
declare
  c record;
  v jsonb := p_values;
  v_parent jsonb;
  v_cols text;
  r jsonb;
begin
  for c in
    select col.column_name, col.data_type, col.udt_name,
           fk.ref_table, fk.ref_column
    from information_schema.columns col
    left join lateral (
      select rt.relname::text as ref_table, ra.attname::text as ref_column
      from pg_constraint k
      join pg_class t on t.oid = k.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
      join pg_class rt on rt.oid = k.confrelid
      join pg_attribute ra on ra.attrelid = k.confrelid and ra.attnum = k.confkey[1]
      where k.contype = 'f' and n.nspname = 'public' and t.relname = p_table
        and array_length(k.conkey, 1) = 1 and a.attname = col.column_name
      limit 1
    ) fk on true
    where col.table_schema = 'public' and col.table_name = p_table
      and col.is_nullable = 'NO' and col.column_default is null
      and col.is_generated = 'NEVER' and col.identity_generation is null
      and col.column_name <> 'company_id'   -- set by the company trigger (or given by the test)
  loop
    continue when v ? c.column_name;
    if c.ref_table is not null and c.ref_table <> p_table then
      v_parent := public.erp_test_insert(c.ref_table,
        case when v ? 'company_id' then jsonb_build_object('company_id', v -> 'company_id') else '{}'::jsonb end);
      v := v || jsonb_build_object(c.column_name, v_parent -> c.ref_column);
    else
      v := v || jsonb_build_object(c.column_name, case
        when c.data_type in ('smallint', 'integer', 'bigint', 'numeric', 'real', 'double precision') then to_jsonb(0)
        when c.data_type = 'boolean' then to_jsonb(false)
        when c.data_type = 'date' then to_jsonb(current_date)
        when c.data_type like 'timestamp%' then to_jsonb(now())
        when c.data_type like 'time%' then to_jsonb('00:00'::text)
        when c.data_type = 'uuid' then to_jsonb(gen_random_uuid())
        when c.data_type in ('json', 'jsonb') then '{}'::jsonb
        when c.data_type = 'ARRAY' then '[]'::jsonb
        when c.data_type = 'USER-DEFINED' then to_jsonb((
          select e.enumlabel::text from pg_enum e join pg_type t on t.oid = e.enumtypid
          where t.typname = c.udt_name order by e.enumsortorder limit 1))
        when c.column_name like '%id' then to_jsonb(gen_random_uuid()::text)
        else to_jsonb('ERP-TEST'::text) end);
    end if;
  end loop;

  select string_agg(format('%I', k), ', ') into v_cols from jsonb_object_keys(v) k;
  execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) returning to_jsonb(%I.*)',
                 p_table, v_cols, v_cols, p_table, p_table)
    into r using v;
  return r;
end;
$$;
grant execute on function public.erp_test_insert(text, jsonb) to authenticated;

-- ---------- Fixtures ------------------------------------------------------------------
insert into public.companies (id, company_name, code, status)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'INV Test Company B', 'INVTESTB', 'Active');

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email,
       '{}', '{"provider":"google","providers":["google"]}', now(), now()
from (values
  ('c2222222-2222-4222-8222-222222222222', 'inv-admin-a@erp-test.invalid'),
  ('c3333333-3333-4333-8333-333333333333', 'inv-user-a@erp-test.invalid'),
  ('c5555555-5555-4555-8555-555555555555', 'inv-admin-b@erp-test.invalid')
) as u(id, email);
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'google', now(), now()
from auth.users u where u.email like 'inv-%@erp-test.invalid';
insert into public.company_users (email, full_name, role, status, company_id, auth_user_id)
select v.email, v.name, v.role, 'Active', c.id, v.auth_id::uuid
from (values
  ('inv-admin-a@erp-test.invalid', 'Inv Admin A', 'COMPANY_ADMIN', 'ARGUS',    'c2222222-2222-4222-8222-222222222222'),
  ('inv-user-a@erp-test.invalid',  'Inv User A',  'USER',          'ARGUS',    'c3333333-3333-4333-8333-333333333333'),
  ('inv-admin-b@erp-test.invalid', 'Inv Admin B', 'COMPANY_ADMIN', 'INVTESTB', 'c5555555-5555-4555-8555-555555555555')
) as v(email, name, role, company_code, auth_id)
left join public.companies c on c.code = v.company_code;

select public.erp_test_insert('cnc_suppliers', jsonb_build_object('id', 'd1000000-0000-4000-8000-000000000001', 'name', 'INV Test Steels',
  'company_id', (select id from public.companies where code = 'ARGUS')));

-- ---------- I1: go-live — ledger reproduces today's stock ----------------------------
do $$
begin
  if exists (
    select 1 from public.cnc_raw_materials r
    where coalesce(r.stock_qty, 0) <> coalesce((select sum(qty_change) from public.cnc_stock_movements m
                                                where m.company_id = r.company_id and m.item_kind = 'RAW' and m.item_id = r.id::text), 0)
    union all
    select 1 from public.cnc_parts p
    where coalesce(p.stock_qty, 0) <> coalesce((select sum(qty_change) from public.cnc_stock_movements m
                                                where m.company_id = p.company_id and m.item_kind = 'PART' and m.item_id = p.id::text), 0)) then
    raise exception 'FAILED I1: an item''s stock does not equal its ledger';
  end if;
  if exists (select 1 from public.cnc_raw_materials where category_id is null)
     or exists (select 1 from public.cnc_parts where category_id is null) then
    raise exception 'FAILED I1: existing items were not given a category';
  end if;
end $$;

-- ---------- I2: the stock chain (as Argus Company Admin) -----------------------------
select set_config('request.jwt.claims', '{"sub":"c2222222-2222-4222-8222-222222222222","role":"authenticated","amr":[{"method":"oauth","timestamp":0}]}', true);
set local role authenticated;
do $$
declare
  f jsonb; cat_raw uuid; cat_fg uuid;
  it jsonb; v_rm text; v_fg text;
  q jsonb; row_ jsonb; err boolean;
  v_stock numeric; v_rate numeric;
  fy uuid; bs jsonb; v_raw_value numeric; v_fg_value numeric;
begin
  perform public.erp_get_session();
  f := public.erp_inventory_filters();
  if jsonb_array_length(f -> 'categories') < 5 or not (f ->> 'can_manage')::boolean then
    raise exception 'FAILED I2: filters/categories missing: %', f -> 'categories';
  end if;
  select (c ->> 'id')::uuid into cat_raw from jsonb_array_elements(f -> 'categories') c where c ->> 'code' = 'RAW';
  select (c ->> 'id')::uuid into cat_fg from jsonb_array_elements(f -> 'categories') c where c ->> 'code' = 'FG';

  -- New item with opening stock 10 @ 100, minimum 5
  it := public.erp_save_inventory_item(jsonb_build_object('id', null, 'code', 'INV-T-RM1', 'name', 'Test Bar', 'category_id', cat_raw,
    'specification', 'Ø20 EN8', 'unit', 'Kg', 'min_stock', 5, 'reorder_qty', 50, 'rate', 100,
    'supplier_id', 'd1000000-0000-4000-8000-000000000001', 'opening_qty', 10, 'status', 'Active'));
  v_rm := it ->> 'id';
  q := public.erp_inventory_items(cat_raw, 'INV-T-RM1', null, null, null, 1, 10);
  row_ := q -> 'rows' -> 0;
  if (q ->> 'total')::int <> 1 or (row_ ->> 'current_stock')::numeric <> 10 or row_ ->> 'status' <> 'In Stock'
     or (row_ ->> 'value')::numeric <> 1000 or row_ ->> 'supplier_name' <> 'INV Test Steels' then
    raise exception 'FAILED I2: new item not listed correctly: %', q;
  end if;

  err := false;
  begin perform public.erp_save_inventory_item(jsonb_build_object('code', 'inv-t-rm1', 'name', 'Dup', 'category_id', cat_raw, 'unit', 'Kg'));
  exception when others then err := true; end;
  if not err then raise exception 'FAILED I2: a duplicate item code was accepted'; end if;

  -- Adjust down 7 → 3 (Low Stock); cannot go below zero
  perform public.erp_adjust_stock('RAW', v_rm, 'OUT', 7, 'Cycle count', 'CC-1', current_date);
  row_ := public.erp_inventory_items(null, 'INV-T-RM1', null, null, null, 1, 10) -> 'rows' -> 0;
  if (row_ ->> 'current_stock')::numeric <> 3 or row_ ->> 'status' <> 'Low Stock' then
    raise exception 'FAILED I2: adjustment/low-stock rule wrong: %', row_;
  end if;
  err := false;
  begin perform public.erp_adjust_stock('RAW', v_rm, 'OUT', 5, 'too much', null, current_date);
  exception when others then err := true; end;
  if not err then raise exception 'FAILED I2: stock went below zero'; end if;

  -- Goods receipt of 10 @ 120 → 13, moving average (3×100 + 10×120) / 13
  perform public.erp_test_insert('cnc_purchase_order_items', jsonb_build_object('id', 'd1000000-0000-4000-8000-000000000002',
    'unit_price', 120, 'tax_amount', 0, 'quantity', 10));
  perform public.erp_test_insert('cnc_goods_receipts', jsonb_build_object('id', 'd1000000-0000-4000-8000-000000000003',
    'grn_number', 'INV-GRN-1', 'supplier_id', 'd1000000-0000-4000-8000-000000000001', 'receipt_date', current_date, 'status', 'Draft'));
  perform public.erp_test_insert('cnc_goods_receipt_items', jsonb_build_object('id', 'd1000000-0000-4000-8000-000000000004',
    'goods_receipt_id', 'd1000000-0000-4000-8000-000000000003', 'purchase_order_item_id', 'd1000000-0000-4000-8000-000000000002',
    'raw_material_id', v_rm, 'material_code', 'INV-T-RM1', 'received_qty', 10));
  perform public.post_goods_receipt('d1000000-0000-4000-8000-000000000003', 'Inv Admin A');
  v_stock := (public.erp_inventory_item('RAW', v_rm) -> 'item' ->> 'current_stock')::numeric;
  v_rate := (public.erp_inventory_item('RAW', v_rm) -> 'item' ->> 'rate')::numeric;
  if v_stock <> 13 or v_rate <> round(1500::numeric / 13, 4) then
    raise exception 'FAILED I2: goods receipt stock/rate wrong (stock %, rate %)', v_stock, v_rate;
  end if;
  err := false;
  begin perform public.post_goods_receipt('d1000000-0000-4000-8000-000000000003', 'again');
  exception when others then err := true; end;
  if not err then raise exception 'FAILED I2: a goods receipt was posted twice'; end if;

  -- Material issue 3 → 10
  perform public.erp_test_insert('cnc_material_requests', jsonb_build_object('id', 'd1000000-0000-4000-8000-000000000005',
    'request_no', 'INV-MR-1', 'status', 'Pending', 'work_order_no', 'WO-X'));
  perform public.erp_issue_material('d1000000-0000-4000-8000-000000000005', jsonb_build_array(jsonb_build_object('raw_material_id', v_rm, 'qty', 3)));
  err := false;
  begin perform public.erp_issue_material('d1000000-0000-4000-8000-000000000005', jsonb_build_array(jsonb_build_object('raw_material_id', v_rm, 'qty', 1)));
  exception when others then err := true; end;
  if not err then raise exception 'FAILED I2: a material request was issued twice'; end if;

  -- A direct edit of stock_qty is kept but recorded as an adjustment
  update public.cnc_raw_materials set stock_qty = 12 where id::text = v_rm;
  if not exists (select 1 from public.cnc_stock_movements where item_id = v_rm and reference_type = 'direct_edit' and qty_change = 2) then
    raise exception 'FAILED I2: a direct stock edit was not recorded in the ledger';
  end if;

  -- The ledger cannot be written from the browser
  err := false;
  begin insert into public.cnc_stock_movements (type, qty) values ('Adjustment', 1);
  exception when insufficient_privilege then err := true; end;
  if not err then raise exception 'FAILED I2: cnc_stock_movements is writable from the browser'; end if;

  -- Item history: running balance ends at current stock
  if ((public.erp_inventory_item('RAW', v_rm) -> 'movements') -> -1 ->> 'balance')::numeric <> 12 then
    raise exception 'FAILED I2: movement history balance does not end at current stock';
  end if;

  -- Finished goods: work order completion in, delivery out (partial, edited, removed)
  it := public.erp_save_inventory_item(jsonb_build_object('code', 'INV-T-FG1', 'name', 'Test Shaft', 'category_id', cat_fg,
    'unit', 'Nos', 'min_stock', 1, 'rate', 500, 'status', 'Active'));
  v_fg := it ->> 'id';
  perform public.erp_test_insert('cnc_work_orders', jsonb_build_object('id', 'd1000000-0000-4000-8000-000000000006',
    'wo_no', 'INV-WO-1', 'part_no', 'INV-T-FG1', 'quantity', 10, 'completed', 0, 'status', 'In Progress'));
  update public.cnc_work_orders set completed = 6 where id::text = 'd1000000-0000-4000-8000-000000000006';
  update public.cnc_work_orders set completed = 8 where id::text = 'd1000000-0000-4000-8000-000000000006';
  perform public.erp_test_insert('cnc_sales_orders', jsonb_build_object('id', 'd1000000-0000-4000-8000-000000000007',
    'order_no', 'INV-SO-1', 'part_no', 'INV-T-FG1', 'status', 'Confirmed'));
  perform public.erp_test_insert('cnc_deliveries', jsonb_build_object('id', 'd1000000-0000-4000-8000-000000000008',
    'delivery_no', 'INV-DC-1', 'sales_order_id', 'd1000000-0000-4000-8000-000000000007', 'dispatch_qty', 5, 'status', 'Pending'));
  if (public.erp_inventory_item('PART', v_fg) -> 'item' ->> 'current_stock')::numeric <> 3 then
    raise exception 'FAILED I2: FG stock after receipt 8 − delivery 5 should be 3';
  end if;
  update public.cnc_deliveries set dispatch_qty = 4 where id::text = 'd1000000-0000-4000-8000-000000000008';
  delete from public.cnc_deliveries where id::text = 'd1000000-0000-4000-8000-000000000008';
  if (public.erp_inventory_item('PART', v_fg) -> 'item' ->> 'current_stock')::numeric <> 8 then
    raise exception 'FAILED I2: FG stock should return to 8 after the delivery is removed';
  end if;

  -- Summary counts agree with the list
  q := public.erp_inventory_summary();
  if (q ->> 'total_items')::int <> (q ->> 'in_stock')::int + (q ->> 'low_stock')::int + (q ->> 'out_of_stock')::int
     or (q ->> 'to_reorder')::int <> (q ->> 'low_stock')::int + (q ->> 'out_of_stock')::int
     or (q ->> 'total_items')::int <> (public.erp_inventory_items(null, null, null, null, null, 1, 10) ->> 'total')::int then
    raise exception 'FAILED I2: summary counts inconsistent: %', q;
  end if;
  if jsonb_array_length(public.erp_inventory_recent(5)) = 0 then raise exception 'FAILED I2: no recent transactions'; end if;

  -- Inventory value = inventory accounts on the Balance Sheet
  select (y ->> 'id')::uuid into fy from jsonb_array_elements(public.erp_financial_years() -> 'years') y where (y ->> 'is_current')::boolean;
  bs := public.erp_balance_sheet(fy, current_date);
  select coalesce(sum((r ->> 'value')::numeric) filter (where r ->> 'kind' = 'RAW'), 0),
         coalesce(sum((r ->> 'value')::numeric) filter (where r ->> 'kind' = 'PART'), 0)
  into v_raw_value, v_fg_value
  from jsonb_array_elements(public.erp_inventory_items(null, null, null, null, null, 1, 500) -> 'rows') r;
  if abs(v_raw_value - (select (x ->> 'amount')::numeric from jsonb_array_elements(bs -> 'rows') x where x ->> 'system_key' = 'INV_RAW')) > 0.05
     or abs(v_fg_value - (select (x ->> 'amount')::numeric from jsonb_array_elements(bs -> 'rows') x where x ->> 'system_key' = 'INV_FG')) > 0.05 then
    raise exception 'FAILED I2: inventory value (raw %, FG %) differs from the Balance Sheet: %', v_raw_value, v_fg_value,
      (select jsonb_agg(x) from jsonb_array_elements(bs -> 'rows') x where x ->> 'system_key' in ('INV_RAW', 'INV_FG'));
  end if;
  if not (bs ->> 'balanced')::boolean then raise exception 'FAILED I2: Balance Sheet no longer balances'; end if;
end $$;
reset role;

-- ---------- I3: a normal USER cannot adjust stock or import --------------------------
select set_config('request.jwt.claims', '{"sub":"c3333333-3333-4333-8333-333333333333","role":"authenticated","amr":[{"method":"oauth","timestamp":0}]}', true);
set local role authenticated;
do $$
declare err boolean := false; v_id text;
begin
  perform public.erp_get_session();
  v_id := public.erp_inventory_items(null, 'INV-T-RM1', null, null, null, 1, 10) -> 'rows' -> 0 ->> 'id';
  begin perform public.erp_adjust_stock('RAW', v_id, 'IN', 1, 'x', null, current_date);
  exception when others then err := true; end;
  if not err then raise exception 'FAILED I3: a USER adjusted stock'; end if;
  err := false;
  begin perform public.erp_import_inventory_items('[]'::jsonb);
  exception when others then err := true; end;
  if not err then raise exception 'FAILED I3: a USER imported items'; end if;
end $$;
reset role;

-- ---------- I4: company isolation -----------------------------------------------------
select set_config('request.jwt.claims', '', true);
select set_config('inv_test.rm', (select id::text from public.cnc_raw_materials where material_code = 'INV-T-RM1'), true);
select set_config('request.jwt.claims', '{"sub":"c5555555-5555-4555-8555-555555555555","role":"authenticated","amr":[{"method":"oauth","timestamp":0}]}', true);
set local role authenticated;
do $$
declare err boolean; q jsonb;
begin
  perform public.erp_get_session();
  q := public.erp_inventory_items(null, null, null, null, null, 1, 50);
  if (q ->> 'total')::int <> 0 or (public.erp_inventory_summary() ->> 'total_value')::numeric <> 0
     or jsonb_array_length(public.erp_inventory_recent(10)) <> 0 then
    raise exception 'FAILED I4: Company B sees Argus inventory';
  end if;
  err := false;
  begin perform public.erp_inventory_item('RAW', current_setting('inv_test.rm'));
  exception when others then err := true; end;
  if not err then raise exception 'FAILED I4: Company B opened an Argus item'; end if;
  err := false;
  begin perform public.erp_adjust_stock('RAW', current_setting('inv_test.rm'), 'IN', 1, 'x', null, current_date);
  exception when others then err := true; end;
  if not err then raise exception 'FAILED I4: Company B adjusted Argus stock'; end if;
  -- Import: valid row saved, duplicate and bad rows reported
  q := public.erp_import_inventory_items(jsonb_build_array(
    jsonb_build_object('code', 'B-1', 'name', 'B item', 'category', 'Tools', 'unit', 'Nos', 'opening_qty', 4, 'rate', 10),
    jsonb_build_object('code', 'B-1', 'name', 'dup', 'category', 'Tools', 'unit', 'Nos'),
    jsonb_build_object('code', 'B-2', 'name', 'bad', 'category', 'Nope', 'unit', 'Nos')));
  if (q ->> 'created')::int <> 1 or jsonb_array_length(q -> 'errors') <> 2 then
    raise exception 'FAILED I4: import result wrong: %', q;
  end if;
  if (public.erp_inventory_items(null, 'B-1', null, null, null, 1, 10) -> 'rows' -> 0 ->> 'current_stock')::numeric <> 4 then
    raise exception 'FAILED I4: imported opening stock missing';
  end if;
end $$;
reset role;

select 'ALL INVENTORY CHECKS PASSED' as result;

rollback;
