-- Validate finished-goods availability in the database for every delivery path
-- (Pipeline, Delivery page, and direct authenticated API writes). No data is rewritten.
begin;

create or replace function public.erp_validate_delivery_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_part_no text;
  v_stock numeric;
  v_requested numeric;
  v_old_qty numeric := 0;
begin
  if coalesce(new.status, '') = 'Cancelled' then
    return new;
  end if;

  select coalesce(nullif(so.part_no::text, ''), nullif(so.part_number::text, ''))
    into v_part_no
  from public.cnc_sales_orders so
  where so.id::text = new.sales_order_id::text
    and so.company_id = new.company_id;

  -- Older orders without a linked part master retain their existing workflow.
  if v_part_no is null then return new; end if;

  select coalesce(p.stock_qty, 0)::numeric into v_stock
  from public.cnc_parts p
  where p.company_id = new.company_id and p.part_no = v_part_no
  limit 1
  for update;

  -- If editing an existing delivery, its current ledger issue is available to replace.
  if tg_op = 'UPDATE' and coalesce(old.status, '') <> 'Cancelled' then
    v_old_qty := coalesce(old.dispatch_qty, old.quantity, 0)::numeric;
  end if;
  v_stock := coalesce(v_stock, 0) + v_old_qty;
  v_requested := coalesce(new.dispatch_qty, new.quantity, 0)::numeric;

  if v_requested < 0 then
    raise exception 'Delivery quantity cannot be negative' using errcode = '22023';
  end if;
  if v_requested > v_stock then
    raise exception 'Delivery quantity % exceeds available finished-goods stock % for part %',
      v_requested, v_stock, v_part_no using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists zz_erp_validate_delivery_stock on public.cnc_deliveries;
create trigger zz_erp_validate_delivery_stock
before insert or update
on public.cnc_deliveries
for each row execute function public.erp_validate_delivery_stock();

revoke all on function public.erp_validate_delivery_stock() from public, anon, authenticated;

commit;
