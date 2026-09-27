-- =====================================================================================
-- ARGUS CNC ERP — inventory stock transfer + movement warehouse context
--
-- Additive only: no existing table, policy, trigger or business logic is modified.
--
-- 1. public.erp_transfer_stock(...) — atomic warehouse-to-warehouse transfer.
--    Writes exactly two ledger rows (OUT of source, IN to destination) inside one
--    function transaction, so one side can never succeed without the other.
--    * Stock moves only through the central ledger (cnc_stock_movements); the
--      cached stock_qty on the item masters is re-synced by the existing
--      zz_erp_sync_item_stock trigger, exactly like every other movement type.
--    * Idempotent: a retry with the same reference number + item returns the
--      existing posting (duplicate:true) instead of writing duplicate rows.
--    * Admin-only, like erp_adjust_stock. Validates quantity > 0, two different
--      warehouses, a reason, and sufficient balance in the source warehouse.
--    * Movement type 'Transfer' posts a neutral system journal through the
--      existing erp_post_stock_issue trigger (no dedicated accounts in Phase 1).
--
-- 2. public.erp_movement_json(...) — same output as before plus two additive
--    keys, 'warehouse_id' and 'warehouse_name', so movement history can show
--    where each movement happened. Existing callers pick fields by name and
--    are unaffected by the extra keys.
-- =====================================================================================

begin;

-- -------------------------------------------------------------------------------------
-- 1. Movement JSON gains warehouse context (additive keys only)
-- -------------------------------------------------------------------------------------
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
    'warehouse_id', m.warehouse_id,
    'warehouse_name', (select w.name from public.cnc_warehouses w where w.id::text = m.warehouse_id),
    'created_by', coalesce(m.created_by, m."user"::text), 'created_at', m.created_at)
$$;

-- -------------------------------------------------------------------------------------
-- 2. Atomic, idempotent stock transfer between two warehouses
-- -------------------------------------------------------------------------------------
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

commit;
