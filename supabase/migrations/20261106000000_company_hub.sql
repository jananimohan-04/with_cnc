-- Company Hub inside Business Intelligence: the company details and the Retail Store user details now live in BI.
-- Companies get the profile fields the Retail Store company form had; users get a mobile number and an optional
-- Retail Store role (sales partner tiers, content writer, finance...). The GST No. is the existing companies.code.
alter table public.companies add column if not exists industry    text;
alter table public.companies add column if not exists email       text;
alter table public.companies add column if not exists phone       text;
alter table public.companies add column if not exists address     text;
alter table public.companies add column if not exists city        text;
alter table public.companies add column if not exists state       text;
alter table public.companies add column if not exists pin         text;
alter table public.companies add column if not exists pan         text;
alter table public.companies add column if not exists cin         text;
alter table public.companies add column if not exists plan        text;
alter table public.companies add column if not exists description text;

alter table public.company_users add column if not exists mobile            text;
alter table public.company_users add column if not exists retail_role       text;      -- Retail Store role id, null = no Retail Store access
alter table public.company_users add column if not exists terms_accepted_at timestamptz;

create or replace function public.erp_save_company_details(p_id uuid, p_data jsonb)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare me public.company_users := public.erp_current_user();
begin
  if me.role = 'COMPANY_ADMIN' then
    if me.company_id is distinct from p_id then raise exception 'You can only edit your own company' using errcode = '42501'; end if;
  elsif me.role <> 'SUPER_ADMIN' then
    raise exception 'Only administrators can edit company details' using errcode = '42501';
  end if;
  update public.companies set
    industry    = case when p_data ? 'industry'    then nullif(btrim(p_data ->> 'industry'), '')    else industry end,
    email       = case when p_data ? 'email'       then nullif(lower(btrim(p_data ->> 'email')), '') else email end,
    phone       = case when p_data ? 'phone'       then nullif(btrim(p_data ->> 'phone'), '')       else phone end,
    address     = case when p_data ? 'address'     then nullif(btrim(p_data ->> 'address'), '')     else address end,
    city        = case when p_data ? 'city'        then nullif(btrim(p_data ->> 'city'), '')        else city end,
    state       = case when p_data ? 'state'       then nullif(btrim(p_data ->> 'state'), '')       else state end,
    pin         = case when p_data ? 'pin'         then nullif(btrim(p_data ->> 'pin'), '')         else pin end,
    pan         = case when p_data ? 'pan'         then nullif(upper(btrim(p_data ->> 'pan')), '')  else pan end,
    cin         = case when p_data ? 'cin'         then nullif(upper(btrim(p_data ->> 'cin')), '')  else cin end,
    plan        = case when p_data ? 'plan'        then nullif(btrim(p_data ->> 'plan'), '')        else plan end,
    description = case when p_data ? 'description' then nullif(btrim(p_data ->> 'description'), '') else description end,
    updated_at  = now()
  where id = p_id;
end $$;
grant execute on function public.erp_save_company_details(uuid, jsonb) to authenticated;

create or replace function public.erp_save_user_details(p_id uuid, p_data jsonb)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  tgt public.company_users;
begin
  select * into tgt from public.company_users where id = p_id;
  if tgt.id is null then raise exception 'User not found'; end if;
  if me.role = 'COMPANY_ADMIN' then
    if tgt.role = 'SUPER_ADMIN' or tgt.company_id is distinct from me.company_id then
      raise exception 'You can only edit users of your own company' using errcode = '42501';
    end if;
  elsif me.role <> 'SUPER_ADMIN' then
    raise exception 'Only administrators can edit users' using errcode = '42501';
  end if;
  update public.company_users set
    mobile            = case when p_data ? 'mobile'      then nullif(btrim(p_data ->> 'mobile'), '')      else mobile end,
    retail_role       = case when p_data ? 'retail_role' then nullif(btrim(p_data ->> 'retail_role'), '') else retail_role end,
    terms_accepted_at = case when (p_data ->> 'terms_accepted') = 'true' then coalesce(terms_accepted_at, now())
                             when (p_data ->> 'terms_accepted') = 'false' then null else terms_accepted_at end,
    updated_at        = now()
  where id = p_id;
end $$;
grant execute on function public.erp_save_user_details(uuid, jsonb) to authenticated;
