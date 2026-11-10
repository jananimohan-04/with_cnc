-- Migration: Add erp_update_bank_entry RPC for editing saved bank transactions
create or replace function public.erp_update_bank_entry(p_id text, p_entry jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid := public.erp_report_company();
  v_patch jsonb := '{}'::jsonb;
  v_acc uuid;
  v_amt numeric;
begin
  if me.role not in ('SUPER_ADMIN', 'COMPANY_ADMIN') then 
    raise exception 'Only administrators can edit bank transactions' using errcode='42501'; 
  end if;

  if p_entry ? 'txn_date' then 
    v_patch := v_patch || jsonb_build_object('txn_date', nullif(p_entry->>'txn_date','')::date); 
  end if;
  if p_entry ? 'reference_no' then 
    v_patch := v_patch || jsonb_build_object('reference_no', nullif(p_entry->>'reference_no','')); 
  end if;
  if p_entry ? 'description' then 
    v_patch := v_patch || jsonb_build_object('description', nullif(p_entry->>'description','')); 
  end if;
  if p_entry ? 'kind' then 
    v_patch := v_patch || jsonb_build_object('kind', nullif(p_entry->>'kind','')); 
  end if;
  if p_entry ? 'party_name' then 
    v_patch := v_patch || jsonb_build_object('party_name', nullif(p_entry->>'party_name','')); 
  end if;
  if p_entry ? 'party_type' then 
    v_patch := v_patch || jsonb_build_object('party_type', nullif(p_entry->>'party_type','')); 
  end if;
  if p_entry ? 'account_id' then 
    v_acc := nullif(p_entry->>'account_id','')::uuid;
    if v_acc is not null and not exists (select 1 from public.chart_of_accounts where id = v_acc and company_id = v_company and not is_group) then
      raise exception 'Invalid bank account';
    end if;
    v_patch := v_patch || jsonb_build_object('account_id', v_acc); 
  end if;
  if p_entry ? 'contra_account_id' then 
    v_patch := v_patch || jsonb_build_object('contra_account_id', nullif(p_entry->>'contra_account_id','')::uuid); 
  end if;
  if p_entry ? 'amount' then 
    v_amt := round((p_entry->>'amount')::numeric, 2);
    if v_amt <= 0 then raise exception 'Amount must be greater than zero'; end if;
    v_patch := v_patch || jsonb_build_object('amount', v_amt); 
  end if;
  if p_entry ? 'direction' then 
    v_patch := v_patch || jsonb_build_object('direction', p_entry->>'direction'); 
  end if;
  if p_entry ? 'status' then 
    if p_entry->>'status' not in ('Cleared','Pending','Cancelled') then raise exception 'Invalid status'; end if;
    v_patch := v_patch || jsonb_build_object('status', p_entry->>'status'); 
  end if;

  if not public.erp_update_json('cnc_bank_transactions', p_id, v_company, v_patch) then
    raise exception 'Transaction not found or access denied';
  end if;

  return jsonb_build_object('id', p_id, 'ok', true);
end;
$$;

revoke all on function public.erp_update_bank_entry(text, jsonb) from public, anon;
grant execute on function public.erp_update_bank_entry(text, jsonb) to authenticated;
