-- Retail Store orders in Business Intelligence.
-- Every order placed in the Retail Store (Buy Now / Add to Cart / Sales Order) is copied here with who ordered it:
-- customer, contact person, company, mobile, address, PO reference, the items (name, SKU, qty, price) and the total.
-- The Retail Store sends the order after it is placed and again whenever its status changes (Confirmed, Dispatched, Delivered, Cancelled).
-- Safe to run more than once.

begin;

create table if not exists public.retail_store_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null,
  customer text not null,
  contact text,
  customer_company text,
  mobile text,
  city text,
  address text,
  po_ref text,
  items jsonb not null default '[]'::jsonb,
  total numeric not null default 0,
  status text not null default 'Pending',
  placed_by text,
  partner_role text,
  invoice_no text,
  ordered_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select public.erp_secure_table('retail_store_orders');
create unique index if not exists retail_store_orders_no_key on public.retail_store_orders (company_id, order_no);
create index if not exists retail_store_orders_date_idx on public.retail_store_orders (ordered_at desc);

drop policy if exists erp_company_isolation on public.retail_store_orders;
drop policy if exists rso_read on public.retail_store_orders;
create policy rso_read on public.retail_store_orders for select to authenticated
  using (company_id = any ((select public.erp_visible_company_ids())::uuid[])
         and coalesce((select (public.erp_current_user()).role), '') in ('SUPER_ADMIN', 'COMPANY_ADMIN', 'MANAGER'));
revoke insert, update, delete on public.retail_store_orders from authenticated;

-- The Retail Store (server, service key) records an order, or updates one it already recorded.
create or replace function public.erp_retail_record_order(p_company uuid, p_order jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_no text := btrim(coalesce(p_order ->> 'order_no', ''));
  v_id uuid;
begin
  if v_no = '' then raise exception 'order_no is required'; end if;
  if not exists (select 1 from public.companies where id = p_company) then raise exception 'Unknown company'; end if;
  insert into public.retail_store_orders
    (company_id, order_no, customer, contact, customer_company, mobile, city, address, po_ref, items, total, status, placed_by, partner_role, invoice_no, ordered_at)
  values
    (p_company, v_no, coalesce(nullif(p_order ->> 'customer', ''), 'Retail customer'), p_order ->> 'contact', p_order ->> 'company_name',
     p_order ->> 'mobile', p_order ->> 'city', p_order ->> 'address', p_order ->> 'po_ref',
     coalesce(p_order -> 'items', '[]'::jsonb), coalesce((p_order ->> 'total')::numeric, 0),
     coalesce(nullif(p_order ->> 'status', ''), 'Pending'), p_order ->> 'placed_by', p_order ->> 'partner_role', p_order ->> 'invoice_no',
     coalesce((p_order ->> 'ordered_at')::timestamptz, now()))
  on conflict (company_id, order_no) do update
    set status = excluded.status, invoice_no = coalesce(excluded.invoice_no, public.retail_store_orders.invoice_no), updated_at = now()
  returning id into v_id;
  return jsonb_build_object('success', true, 'id', v_id);
end;
$$;
revoke all on function public.erp_retail_record_order(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.erp_retail_record_order(uuid, jsonb) to service_role;

commit;
