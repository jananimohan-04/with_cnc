-- Avoid wildcard row expansion in the bank transaction API. Some hosted SQL execution
-- paths reject composite row expansion; explicit columns keep the result stable.
begin;

create or replace function public.erp_bank_transactions(p_kind text default null, p_account_id text default null,
  p_type text default null, p_party text default null, p_search text default null,
  p_from date default null, p_to date default null, p_page int default 1, p_page_size int default 10)
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
  with filtered as (
    select bt.id, bt.txn_no, bt.txn_date, bt.kind, bt.direction, bt.account_id,
           bt.party_type, bt.party_name, bt.customer_id, bt.supplier_id, bt.invoice_id,
           bt.amount, bt.mode, bt.reference_no, bt.description, bt.status,
           bt.transfer_group, bt.created_by, bt.created_at, a.name as account_name
    from public.cnc_bank_transactions bt
    join public.chart_of_accounts a on a.id = bt.account_id
    where bt.company_id = v_company
      and (nullif(p_account_id, '') is null or bt.account_id::text = p_account_id)
      and (nullif(p_type, '') is null or bt.direction = p_type
           or (p_type = 'Transfer' and bt.transfer_group is not null)
           or (p_type = 'Cash' and bt.kind like 'Cash%'))
      and (nullif(p_kind, '') is null
           or (p_kind = 'Receipts' and bt.direction = 'IN' and bt.transfer_group is null)
           or (p_kind = 'Payments' and bt.direction = 'OUT' and bt.transfer_group is null)
           or (p_kind = 'Bank Transfer' and bt.transfer_group is not null)
           or (p_kind = 'Cash Entries' and bt.kind like 'Cash%'))
      and (nullif(p_party, '') is null or bt.customer_id = p_party or bt.supplier_id = p_party or bt.party_name = p_party)
      and (p_from is null or bt.txn_date >= p_from)
      and (p_to is null or bt.txn_date <= p_to)
      and (v_q is null or bt.reference_no ilike '%' || v_q || '%'
           or bt.description ilike '%' || v_q || '%'
           or bt.party_name ilike '%' || v_q || '%'
           or a.name ilike '%' || v_q || '%')
  )
  select (select count(*) from filtered),
         (select coalesce(jsonb_agg(jsonb_build_object(
            'id', p.id::text, 'txn_no', p.txn_no, 'txn_date', p.txn_date,
            'kind', p.kind, 'direction', p.direction,
            'account_id', p.account_id::text, 'account_name', p.account_name,
            'party_type', p.party_type, 'party_name', p.party_name,
            'customer_id', p.customer_id, 'supplier_id', p.supplier_id, 'invoice_id', p.invoice_id,
            'receipt', case when p.direction = 'IN' then p.amount::text else null end,
            'payment', case when p.direction = 'OUT' then p.amount::text else null end,
            'amount', p.amount::text, 'mode', p.mode, 'reference_no', p.reference_no,
            'description', p.description, 'status', p.status,
            'transfer_group', p.transfer_group, 'created_by', p.created_by)
            order by p.txn_date desc, p.created_at desc), '[]')
          from (select f.id, f.txn_no, f.txn_date, f.kind, f.direction, f.account_id,
                       f.party_type, f.party_name, f.customer_id, f.supplier_id, f.invoice_id,
                       f.amount, f.mode, f.reference_no, f.description, f.status,
                       f.transfer_group, f.created_by, f.created_at, f.account_name
                from filtered f
                order by f.txn_date desc, f.created_at desc
                limit v_size offset (v_page - 1) * v_size) p)
  into v_total, v_rows;

  return jsonb_build_object('total', v_total, 'page', v_page, 'page_size', v_size, 'rows', v_rows);
end;
$$;

revoke all on function public.erp_bank_transactions(text, text, text, text, text, date, date, int, int) from public, anon;
grant execute on function public.erp_bank_transactions(text, text, text, text, text, date, date, int, int) to authenticated;

-- The Bank & Cash entry form loads invoices alongside its account filters. Pass the
-- invoice composite value directly; expanding it with (row).* inside jsonb_agg fails.
create or replace function public.erp_invoices(p_type text default null, p_status text default null, p_customer text default null,
  p_search text default null, p_from date default null, p_to date default null, p_page int default 1, p_page_size int default 10)
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
  with base as (
    select inv, public.erp_invoice_status(v_company, inv) as st
    from public.cnc_invoices inv
    where inv.company_id = v_company
      and (nullif(p_type, '') is null or inv.invoice_type = p_type or (p_type = 'Cancelled' and inv.cancelled))
      and (nullif(p_customer, '') is null or inv.customer_id = p_customer or inv.customer_name = p_customer)
      and (p_from is null or inv.invoice_date >= p_from)
      and (p_to is null or inv.invoice_date <= p_to)
      and (v_q is null or inv.invoice_no ilike '%' || v_q || '%'
           or inv.customer_name ilike '%' || v_q || '%'
           or inv.po_no ilike '%' || v_q || '%'
           or inv.dc_no ilike '%' || v_q || '%'
           or inv.part_name ilike '%' || v_q || '%')
  ),
  filtered as (
    select base.inv
    from base
    where nullif(p_status, '') is null or base.st = p_status
  ),
  page_rows as (
    select filtered.inv
    from filtered
    order by (filtered.inv).invoice_date desc nulls last, (filtered.inv).invoice_no desc
    limit v_size offset (v_page - 1) * v_size
  )
  select (select count(*) from filtered),
         (select coalesce(jsonb_agg(public.erp_invoice_json(page_rows.inv, v_company, false)
                    order by (page_rows.inv).invoice_date desc nulls last, (page_rows.inv).invoice_no desc), '[]')
          from page_rows)
  into v_total, v_rows;

  return jsonb_build_object('total', v_total, 'page', v_page, 'page_size', v_size, 'rows', v_rows);
end;
$$;

revoke all on function public.erp_invoices(text, text, text, text, date, date, int, int) from public, anon;
grant execute on function public.erp_invoices(text, text, text, text, date, date, int, int) to authenticated;

commit;
