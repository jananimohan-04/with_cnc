-- Digital Store orders: also record the customer's e-mail address.
-- The order function gets one more (optional) value, p_email. Safe to run more than once.

begin;

alter table public.digital_store_orders add column if not exists customer_email text;

-- replace the 6-value version with the 7-value one (so the two cannot be mixed up)
drop function if exists public.erp_place_digital_order(uuid, numeric, text, text, text, text);

create or replace function public.erp_place_digital_order(
  p_item uuid, p_qty numeric, p_name text, p_phone text, p_address text, p_notes text, p_email text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid := public.erp_report_company();
  it public.digital_store_items;
  v_left numeric;
  v_no text;
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_addr text := btrim(coalesce(p_address, ''));
  v_mail text := lower(btrim(coalesce(p_email, '')));
begin
  if me.id is null then raise exception 'Sign in to place an order' using errcode = '42501'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Enter the quantity you want'; end if;
  if v_name = '' then raise exception 'Enter your name'; end if;
  if length(regexp_replace(v_phone, '\D', '', 'g')) < 7 then raise exception 'Enter a valid contact number'; end if;
  if v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid e-mail address'; end if;
  if length(v_addr) < 8 then raise exception 'Enter the full delivery address'; end if;

  update public.digital_store_items
     set stock_qty = stock_qty - p_qty, updated_at = now()
   where id = p_item and company_id = v_company and stock_qty >= p_qty
  returning * into it;

  if it.id is null then
    select stock_qty into v_left from public.digital_store_items where id = p_item and company_id = v_company;
    if not found then raise exception 'Product not found'; end if;
    raise exception 'Only % available in stock', v_left;
  end if;

  v_no := public.erp_next_number(v_company, 'public.digital_store_orders', 'order_no', 'DSO');
  insert into public.digital_store_orders
    (company_id, order_no, item_id, item_name, sku, qty, unit, unit_price, total, customer_name, phone, customer_email, address, notes, ordered_by, ordered_by_name)
  values
    (v_company, v_no, it.id, it.name, it.sku, p_qty, it.unit, it.price, case when it.price is null then null else round(it.price * p_qty, 2) end,
     v_name, v_phone, v_mail, v_addr, nullif(btrim(coalesce(p_notes, '')), ''), auth.uid(), me.full_name)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'order_no', v_no, 'stock_left', it.stock_qty,
    'total', case when it.price is null then null else round(it.price * p_qty, 2) end);
end;
$$;
revoke all on function public.erp_place_digital_order(uuid, numeric, text, text, text, text, text) from public, anon;
grant execute on function public.erp_place_digital_order(uuid, numeric, text, text, text, text, text) to authenticated;

commit;
