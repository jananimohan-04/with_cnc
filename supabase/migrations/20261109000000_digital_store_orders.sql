-- Digital Store: stock on each product and orders placed from the 3D store.
--   * Business Intelligence sets how many of each product are available (stock_qty).
--   * Anyone signed in can place an order from the Retail Store's Digital Store: product, quantity, name, contact number, address.
--     The order and the stock reduction happen together in one function (so two people cannot both take the last item).
--   * Administrators see every order of the company and move it along (New > Confirmed > Dispatched > Delivered, or Cancelled,
--     which puts the stock back). Everyone else sees only their own orders.
-- Safe to run more than once.

begin;

alter table public.digital_store_items add column if not exists stock_qty numeric not null default 0 check (stock_qty >= 0);
alter table public.digital_store_items add column if not exists unit text not null default 'Nos';

create table if not exists public.digital_store_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null,
  item_id uuid references public.digital_store_items (id) on delete set null,
  item_name text not null,
  sku text,
  qty numeric not null check (qty > 0),
  unit text,
  unit_price numeric,
  total numeric,
  customer_name text not null,
  phone text not null,
  address text not null,
  notes text,
  status text not null default 'New' check (status in ('New', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled')),
  ordered_by uuid,
  ordered_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists digital_store_orders_created_idx on public.digital_store_orders (created_at desc);

select public.erp_secure_table('digital_store_orders');
create unique index if not exists digital_store_orders_no_key on public.digital_store_orders (company_id, order_no);

drop policy if exists erp_company_isolation on public.digital_store_orders;
drop policy if exists dso_read_admin on public.digital_store_orders;
drop policy if exists dso_read_own on public.digital_store_orders;
create policy dso_read_admin on public.digital_store_orders for select to authenticated
  using (company_id = any ((select public.erp_visible_company_ids())::uuid[])
         and coalesce((select (public.erp_current_user()).role), '') in ('SUPER_ADMIN', 'COMPANY_ADMIN'));
create policy dso_read_own on public.digital_store_orders for select to authenticated
  using (ordered_by = auth.uid());
-- no insert / update / delete policy: orders are written only by the functions below
revoke insert, update, delete on public.digital_store_orders from authenticated;

-- -------------------------------------------------------------------------------------
-- Place an order: checks the details, takes the stock and records the order in one step
-- -------------------------------------------------------------------------------------
create or replace function public.erp_place_digital_order(
  p_item uuid, p_qty numeric, p_name text, p_phone text, p_address text, p_notes text)
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
begin
  if me.id is null then raise exception 'Sign in to place an order' using errcode = '42501'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Enter the quantity you want'; end if;
  if v_name = '' then raise exception 'Enter your name'; end if;
  if length(regexp_replace(v_phone, '\D', '', 'g')) < 7 then raise exception 'Enter a valid contact number'; end if;
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
    (company_id, order_no, item_id, item_name, sku, qty, unit, unit_price, total, customer_name, phone, address, notes, ordered_by, ordered_by_name)
  values
    (v_company, v_no, it.id, it.name, it.sku, p_qty, it.unit, it.price, case when it.price is null then null else round(it.price * p_qty, 2) end,
     v_name, v_phone, v_addr, nullif(btrim(coalesce(p_notes, '')), ''), auth.uid(), me.full_name)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'order_no', v_no, 'stock_left', it.stock_qty,
    'total', case when it.price is null then null else round(it.price * p_qty, 2) end);
end;
$$;
revoke all on function public.erp_place_digital_order(uuid, numeric, text, text, text, text) from public, anon;
grant execute on function public.erp_place_digital_order(uuid, numeric, text, text, text, text) to authenticated;

-- -------------------------------------------------------------------------------------
-- Move an order along (administrators). Cancelling puts the stock back; a cancelled order stays cancelled.
-- -------------------------------------------------------------------------------------
create or replace function public.erp_digital_order_status(p_id uuid, p_status text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid := public.erp_report_company();
  o public.digital_store_orders;
begin
  if me.id is null or me.role not in ('SUPER_ADMIN', 'COMPANY_ADMIN') then
    raise exception 'Only an administrator can change an order' using errcode = '42501';
  end if;
  if p_status not in ('New', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled') then raise exception 'Invalid status'; end if;
  select * into o from public.digital_store_orders where id = p_id and company_id = v_company for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.status = 'Cancelled' then raise exception 'A cancelled order cannot be changed'; end if;
  if p_status = 'Cancelled' and o.item_id is not null then
    update public.digital_store_items set stock_qty = stock_qty + o.qty, updated_at = now() where id = o.item_id;
  end if;
  update public.digital_store_orders set status = p_status, updated_at = now() where id = o.id;
end;
$$;
revoke all on function public.erp_digital_order_status(uuid, text) from public, anon;
grant execute on function public.erp_digital_order_status(uuid, text) to authenticated;

commit;
