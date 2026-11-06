-- Accounting fixes found in the project review. Safe to run more than once.
--   1. A bank transfer posted its journal TWICE (each of the two legs posted a full Dr destination / Cr source entry),
--      so the destination was debited and the source credited double the amount. Only the OUT leg posts now, and the
--      journals the IN legs already posted are removed.
--   2. Cancelling / reinstating a transfer applies to both legs (it used to change one leg and leave the books one-sided).
--   3. Cancelling an invoice needs the invoices "edit" permission (any member could cancel any invoice).
--   4. Invoice numbers become unique per company (skipped with a notice if duplicates already exist - fix those first).

begin;

-- -------------------------------------------------------------------------------------
-- 1. Bank transaction posting: a transfer is one journal, posted by its OUT leg
-- -------------------------------------------------------------------------------------
create or replace function public.erp_post_bank_txn()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_bank uuid;
  v_other uuid;
  v_amt numeric;
  v_lines jsonb;
  v_label text;
begin
  if tg_op = 'DELETE' then
    delete from public.journal_entries where company_id = old.company_id and source_type = 'bank_txn' and source_id = old.id::text;
    return old;
  end if;

  -- The IN leg of a transfer mirrors the OUT leg, whose journal already moves the money between the two accounts.
  if new.transfer_group is not null and new.direction = 'IN' then
    delete from public.journal_entries where company_id = new.company_id and source_type = 'bank_txn' and source_id = new.id::text;
    return new;
  end if;

  if new.status = 'Cancelled' then
    perform public.erp_post_system_journal(new.company_id, 'bank_txn', new.id::text, public.erp_today(new.company_id), 'Contra', null, null, null);
    return new;
  end if;

  v_bank := new.account_id;
  v_amt := round(new.amount, 2);
  v_label := new.kind || coalesce(' — ' || new.party_name, '') || coalesce(' (' || new.reference_no || ')', '');

  -- The "other side": explicit contra account, else the receivable/payable implied by the party.
  v_other := new.contra_account_id;
  if v_other is null then
    if new.direction = 'IN' then
      v_other := public.erp_account_id(new.company_id, 'TRADE_RECEIVABLES');
    else
      v_other := public.erp_account_id(new.company_id, 'TRADE_PAYABLES');
    end if;
  end if;

  if new.direction = 'IN' then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_bank, 'debit', v_amt),
      jsonb_build_object('account_id', v_other, 'credit', v_amt, 'party', new.party_name));
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_other, 'debit', v_amt, 'party', new.party_name),
      jsonb_build_object('account_id', v_bank, 'credit', v_amt));
  end if;

  perform public.erp_post_system_journal(new.company_id, 'bank_txn', new.id::text,
    coalesce(new.txn_date, public.erp_today(new.company_id)),
    case when new.kind like 'Cash%' then 'Cash' when new.contra_account_id is not null and new.party_type is null then 'Contra'
         when new.direction = 'IN' then 'Receipt' else 'Payment' end,
    v_label, new.reference_no, v_lines);

  update public.cnc_bank_transactions set journal_entry_id = (
    select id from public.journal_entries where company_id = new.company_id and source_type = 'bank_txn' and source_id = new.id::text)
  where id = new.id and journal_entry_id is distinct from (
    select id from public.journal_entries where company_id = new.company_id and source_type = 'bank_txn' and source_id = new.id::text);
  return new;
end;
$$;

-- Repair: remove the duplicate journal each existing transfer's IN leg posted.
delete from public.journal_entries je
using public.cnc_bank_transactions bt
where je.source_type = 'bank_txn'
  and je.source_id = bt.id::text
  and je.company_id = bt.company_id
  and bt.transfer_group is not null
  and bt.direction = 'IN';

update public.cnc_bank_transactions
set journal_entry_id = null
where transfer_group is not null and direction = 'IN' and journal_entry_id is not null;

-- -------------------------------------------------------------------------------------
-- 2. Status change applies to the whole transfer
-- -------------------------------------------------------------------------------------
create or replace function public.erp_bank_set_status(p_id text, p_status text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid := public.erp_report_company();
  v_grp uuid;
  r record;
  v_any boolean := false;
begin
  if me.role not in ('SUPER_ADMIN','COMPANY_ADMIN') then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_status not in ('Cleared','Pending','Cancelled') then raise exception 'Invalid status'; end if;

  select transfer_group into v_grp from public.cnc_bank_transactions where id::text = p_id and company_id = v_company;
  if v_grp is not null then
    for r in select id from public.cnc_bank_transactions where transfer_group = v_grp and company_id = v_company loop
      perform public.erp_update_json('cnc_bank_transactions', r.id::text, v_company, jsonb_build_object('status', p_status));
      v_any := true;
    end loop;
    if not v_any then raise exception 'Transaction not found'; end if;
    return;
  end if;

  if not public.erp_update_json('cnc_bank_transactions', p_id, v_company, jsonb_build_object('status', p_status)) then
    raise exception 'Transaction not found';
  end if;
end;
$$;

-- -------------------------------------------------------------------------------------
-- 3. Cancel invoice: needs the invoices "edit" permission
-- -------------------------------------------------------------------------------------
create or replace function public.erp_cancel_invoice(p_id text, p_reason text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid := public.erp_report_company();
  inv public.cnc_invoices;
begin
  if me.id is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  if not public.erp_has_any_perm(array['invoices'], 'edit') then
    raise exception 'Invoice edit permission is required to cancel an invoice.' using errcode = '42501';
  end if;
  select * into inv from public.cnc_invoices where id::text = p_id and company_id = v_company;
  if inv.id is null then raise exception 'Invoice not found'; end if;
  if public.erp_invoice_received(v_company, p_id) <> 0 then
    raise exception 'This invoice has receipts. Reverse the receipts or raise a credit note instead of cancelling.';
  end if;
  perform public.erp_update_json('cnc_invoices', p_id, v_company,
    jsonb_build_object('cancelled', true, 'status', 'Cancelled', 'cancelled_reason', nullif(btrim(p_reason), ''), 'updated_at', now()));
end;
$$;

-- -------------------------------------------------------------------------------------
-- 4. One invoice number per company (only when no duplicates exist yet)
-- -------------------------------------------------------------------------------------
do $$
begin
  create unique index if not exists cnc_invoices_company_invoice_no_key
    on public.cnc_invoices (company_id, invoice_no) where invoice_no is not null;
exception when unique_violation then
  raise notice 'cnc_invoices has duplicate invoice numbers: the unique index was NOT created. Find them with: select company_id, invoice_no, count(*) from public.cnc_invoices group by 1,2 having count(*) > 1;';
end $$;

commit;
