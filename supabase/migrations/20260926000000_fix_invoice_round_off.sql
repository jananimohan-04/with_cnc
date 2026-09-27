-- Fix invoice journal imbalance when GST splits leave paise amounts.
--
-- erp_save_invoice rounds the invoice total to the rupee (v_total := round(v_total))
-- while the CGST/SGST/IGST legs keep paise. erp_post_invoice then posted
--   Dr Trade Receivables = rounded total
--   Cr Sales            = taxable, Cr GST legs = exact paise splits
-- so any fractional tax (e.g. debit 731011.00 vs credit 731010.56)tripped the
-- "Journal entry is not balanced" check and blocked invoice creation.
--
-- Fix: the Sales credit absorbs the sub-rupee round-off
-- (sales = total - cgst - sgst - igst), so the journal balances by construction.
-- Apply: Supabase Dashboard -> SQL Editor -> paste this file -> Run,
-- or `supabase db push` from the repo root.

create or replace function public.erp_post_invoice()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_total numeric;
  v_taxable numeric;
  v_cgst numeric;
  v_sgst numeric;
  v_igst numeric;
  v_sales_credit numeric;
  v_sign int;
  v_date date;
  v_label text;
  v_lines jsonb;
begin
  if tg_op = 'DELETE' then
    delete from public.journal_entries
    where company_id = old.company_id and source_type in ('invoice', 'invoice_receipt') and source_id = old.id::text;
    return old;
  end if;

  -- Proforma invoices are quotations in effect: no accounting entry.
  if new.invoice_type = 'Proforma Invoice' or new.cancelled then
    perform public.erp_post_system_journal(new.company_id, 'invoice', new.id::text, public.erp_today(new.company_id), 'Sales', null, null, null);
    return new;
  end if;

  v_total := round(coalesce(new.amount, 0), 2);
  v_taxable := round(coalesce(nullif(new.taxable_value, 0), new.basic_value - new.discount_amount, v_total), 2);
  v_cgst := round(coalesce(new.cgst, 0), 2);
  v_sgst := round(coalesce(new.sgst, 0), 2);
  v_igst := round(coalesce(new.igst, 0), 2);
  if v_taxable + v_cgst + v_sgst + v_igst = 0 then v_taxable := v_total; end if;   -- untaxed / legacy invoice
  -- The rounded total minus the exact paise tax legs: the Sales credit absorbs
  -- the sub-rupee round-off so debit always equals credit.
  v_sales_credit := v_total - v_cgst - v_sgst - v_igst;
  -- A Credit Note reverses the sale: same accounts, opposite sign.
  v_sign := case when new.invoice_type = 'Credit Note' then -1 else 1 end;
  v_date := coalesce(new.invoice_date::date, new.created_at::date, public.erp_today(new.company_id));
  v_label := coalesce(new.invoice_type, 'Invoice') || ' ' || coalesce(new.invoice_no, '') || coalesce(' — ' || new.customer_name, '');

  v_lines := jsonb_build_array(
    jsonb_build_object('key', 'TRADE_RECEIVABLES', 'debit', v_sign * v_total, 'party', new.customer_name),
    jsonb_build_object('key', 'SALES', 'credit', v_sign * v_sales_credit));
  if v_cgst <> 0 then v_lines := v_lines || jsonb_build_array(jsonb_build_object('key', 'GST_OUTPUT', 'credit', v_sign * v_cgst)); end if;
  if v_sgst <> 0 then v_lines := v_lines || jsonb_build_array(jsonb_build_object('key', 'GST_OUTPUT', 'credit', v_sign * v_sgst)); end if;
  if v_igst <> 0 then v_lines := v_lines || jsonb_build_array(jsonb_build_object('key', 'GST_OUTPUT', 'credit', v_sign * v_igst)); end if;

  -- Negative debits/credits are flipped so every line stays non-negative on its correct side.
  perform public.erp_post_system_journal(new.company_id, 'invoice', new.id::text, v_date, 'Sales',
    'Sales: ' || v_label, new.invoice_no, public.erp_normalize_lines(v_lines));
  return new;
end;
$$;
