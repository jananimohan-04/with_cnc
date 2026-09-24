-- Keep Pipeline completion separate from invoice payment state. Payment status is derived
-- from bank receipts; pipeline_completed_at records only the history/archive action.
begin;

alter table public.cnc_invoices
  add column if not exists pipeline_completed_at timestamptz;

-- Keep invoice links inside the owning tenant even when the application uses a
-- SECURITY DEFINER RPC to create or edit records.
drop trigger if exists zz_erp_invoice_customer_company on public.cnc_invoices;
create trigger zz_erp_invoice_customer_company before insert or update on public.cnc_invoices
  for each row execute function public.erp_check_same_company('customer_id', 'cnc_customers');
drop trigger if exists zz_erp_invoice_sales_order_company on public.cnc_invoices;
create trigger zz_erp_invoice_sales_order_company before insert or update on public.cnc_invoices
  for each row execute function public.erp_check_same_company('sales_order_id', 'cnc_sales_orders');
drop trigger if exists zz_erp_invoice_delivery_company on public.cnc_invoices;
create trigger zz_erp_invoice_delivery_company before insert or update on public.cnc_invoices
  for each row execute function public.erp_check_same_company('delivery_id', 'cnc_deliveries');
drop trigger if exists zz_erp_invoice_quotation_company on public.cnc_invoices;
create trigger zz_erp_invoice_quotation_company before insert or update on public.cnc_invoices
  for each row execute function public.erp_check_same_company('quotation_id', 'cnc_quotations');
drop trigger if exists zz_erp_invoice_item_parent_company on public.cnc_invoice_items;
create trigger zz_erp_invoice_item_parent_company before insert or update on public.cnc_invoice_items
  for each row execute function public.erp_check_same_company('invoice_id', 'cnc_invoices');
drop trigger if exists zz_erp_bank_invoice_company on public.cnc_bank_transactions;
create trigger zz_erp_bank_invoice_company before insert or update on public.cnc_bank_transactions
  for each row execute function public.erp_check_same_company('invoice_id', 'cnc_invoices');

-- Preserve the former Pipeline "Completed" marker as history metadata before status is
-- switched to its accounting-derived value.
update public.cnc_invoices
set pipeline_completed_at = coalesce(pipeline_completed_at, created_at, now())
where status = 'Completed' and pipeline_completed_at is null;

create or replace function public.erp_sync_invoice_status()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_company uuid;
  v_invoice_id text;
  v_invoice public.cnc_invoices;
  v_status text;
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_table_name = 'cnc_invoices' then
    if tg_op = 'DELETE' then
      v_company := old.company_id;
      v_invoice_id := old.id::text;
    else
      v_company := new.company_id;
      v_invoice_id := new.id::text;
    end if;
  elsif tg_op = 'DELETE' then
    v_company := old.company_id;
    v_invoice_id := old.invoice_id;
  else
    v_company := new.company_id;
    v_invoice_id := new.invoice_id;
  end if;
  if v_invoice_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  select * into v_invoice from public.cnc_invoices
  where company_id = v_company and id::text = v_invoice_id;
  if v_invoice.id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  v_status := public.erp_invoice_status(v_company, v_invoice);
  update public.cnc_invoices
  set status = v_status, updated_at = now()
  where company_id = v_company and id::text = v_invoice_id and status is distinct from v_status;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists zzz_erp_invoice_status_on_invoice on public.cnc_invoices;
create trigger zzz_erp_invoice_status_on_invoice
after insert or update on public.cnc_invoices
for each row execute function public.erp_sync_invoice_status();

drop trigger if exists zzz_erp_invoice_status_on_receipt on public.cnc_bank_transactions;
create trigger zzz_erp_invoice_status_on_receipt
after insert or update or delete on public.cnc_bank_transactions
for each row execute function public.erp_sync_invoice_status();

revoke all on function public.erp_sync_invoice_status() from public, anon, authenticated;

-- Normalize stored status for direct Pipeline writes already on file. The invoice row IDs
-- stay intact, and its Linked History timestamp above remains separate from paid/outstanding.
update public.cnc_invoices i
set status = public.erp_invoice_status(i.company_id, i),
    updated_at = now();

-- Running bank balance for the selected page only, calculated from ledger lines. The
-- company is derived from the authenticated database context, never from a client argument.
create or replace function public.erp_bank_transaction_balances(p_transaction_ids text[])
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_company uuid := public.erp_report_company();
begin
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', bt.id::text,
      'balance', case when bt.journal_entry_id is null then null else (
        select coalesce(sum(l.debit - l.credit), 0)::text
        from public.journal_entry_lines l
        join public.journal_entries e on e.id = l.journal_entry_id
        join public.journal_entries current_entry on current_entry.id = bt.journal_entry_id
        where e.company_id = v_company and l.account_id = bt.account_id
          and (e.entry_date < current_entry.entry_date or
               (e.entry_date = current_entry.entry_date and
                 (e.created_at < current_entry.created_at or
                   (e.created_at = current_entry.created_at and e.id::text <= current_entry.id::text))))
      ) end), '[]')
    from public.cnc_bank_transactions bt
    where bt.company_id = v_company and bt.id::text = any(coalesce(p_transaction_ids, '{}'::text[]))
  );
end;
$$;

revoke all on function public.erp_bank_transaction_balances(text[]) from public, anon;
grant execute on function public.erp_bank_transaction_balances(text[]) to authenticated;

commit;
