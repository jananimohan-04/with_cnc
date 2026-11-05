-- =====================================================================================
-- Stock Adjustment is now its own menu (module key 'stock-adjustment') with its own access.
--
-- Before: only administrators could adjust stock, from the Inventory page.
-- Now:    administrators, and any user given the EDIT right on "Stock Adjustment" in Access Management, can do it.
--         The Inventory page itself no longer changes stock counts.
--
-- Only the permission check inside erp_adjust_stock changes. Safe to re-run.
-- =====================================================================================
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

-- (the Inventory list reports can_manage = administrators; unchanged, it now only gates add / edit / delete / transfer)
