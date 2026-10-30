-- =====================================================================================
-- Pipeline lists: remember when each record was last edited
--
-- Every pipeline list (Enquiries, Quotations, Sales Orders, Inward, Finished Goods, Delivery Challans, Invoices) shows a
-- Timestamp = last edited time, next to the record's own date (Enquiry Date, Quote Date, Order Date ...).
-- Most of these tables only had created_at, so this adds updated_at and keeps it current on every update
-- (editing the record, or moving it to another stage).
--
-- Additive and safe to run twice. Existing records start with updated_at = created_at.
-- =====================================================================================

begin;

create or replace function public.erp_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'cnc_enquiries', 'cnc_quotations', 'cnc_sales_orders', 'cnc_inwards',
    'cnc_deliveries', 'cnc_work_orders', 'cnc_invoices'
  ] loop
    execute format('alter table public.%I add column if not exists updated_at timestamptz', t);
    execute format('update public.%I set updated_at = coalesce(created_at, now()) where updated_at is null', t);
    execute format('alter table public.%I alter column updated_at set default now()', t);
    execute format('alter table public.%I alter column updated_at set not null', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.erp_touch_updated_at()',
                   t || '_touch_updated_at', t);
  end loop;
end
$$;

commit;
