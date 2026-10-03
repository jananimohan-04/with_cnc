-- =====================================================================================
-- ARGUS CNC ERP — permanent delete of a user or a company (Super Admin / Company Admin)
--
-- erp_delete_user(p_id)
--   * Super Admin: any user except themselves; Company Admin: users and other Company Admins of their own company.
--   * Never deletes the caller, and never the last Super Admin.
--   * Removes the ERP record AND the Google sign-in identity (auth.users), so the person is gone.
--
-- erp_delete_company(p_id, p_confirm_name)
--   * Super Admin only. The caller must pass the company's exact name as confirmation.
--   * Refuses the customer-portal default company (the portal needs exactly one).
--   * Deletes every row of the company in every table that has a company_id column, then its
--     users (and their Google identities), then the company. All or nothing: any failure rolls
--     the whole delete back. Files in storage buckets are NOT touched.
--   * Foreign keys decide the delete order: tables that cannot be emptied yet are retried in
--     later passes. If a pass makes no progress the delete is aborted with the blocking table.
--
-- Additive: two new functions only. Run once in the Supabase SQL editor.
-- =====================================================================================

begin;

create or replace function public.erp_delete_user(p_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  target public.company_users;
begin
  if me.id is null or me.role not in ('SUPER_ADMIN', 'COMPANY_ADMIN') then
    raise exception 'Only administrators can delete users' using errcode = '42501';
  end if;
  select * into target from public.company_users where id = p_id;
  if target.id is null then raise exception 'User not found'; end if;
  if target.id = me.id then raise exception 'You cannot delete your own account'; end if;

  if me.role = 'COMPANY_ADMIN' then
    if target.company_id is distinct from me.company_id or target.role = 'SUPER_ADMIN' then
      raise exception 'You can only delete users of your own company' using errcode = '42501';
    end if;
  elsif target.role = 'SUPER_ADMIN'
        and not exists (select 1 from public.company_users where role = 'SUPER_ADMIN' and id <> target.id) then
    raise exception 'The last Super Admin cannot be deleted';
  end if;

  delete from public.company_users where id = target.id;
  if target.auth_user_id is not null then
    delete from auth.users where id = target.auth_user_id;
  end if;
  return jsonb_build_object('deleted_user', target.email);
end;
$$;

create or replace function public.erp_delete_company(p_id uuid, p_confirm_name text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  co public.companies;
  t record;
  pending text[];
  progress boolean;
  n bigint;
  total bigint := 0;
  users_gone int;
  pass int := 0;
begin
  if not public.erp_is_super_admin() then
    raise exception 'Only the Super Admin can delete companies' using errcode = '42501';
  end if;
  select * into co from public.companies where id = p_id;
  if co.id is null then raise exception 'Company not found'; end if;
  if btrim(coalesce(p_confirm_name, '')) <> co.company_name then
    raise exception 'Confirmation name does not match the company name';
  end if;
  if co.portal_default then
    raise exception 'This is the customer-portal default company. Make another company the portal default first.';
  end if;
  if exists (select 1 from public.company_users where company_id = co.id and role = 'SUPER_ADMIN') then
    raise exception 'A Super Admin is assigned to this company; move or remove that account first';
  end if;

  -- Super Admins currently viewing this company fall back to "all companies".
  update public.company_users set active_company_id = null where active_company_id = co.id;

  -- Every table that carries company_id, except the user and company tables themselves.
  select array_agg(c.relname order by c.relname) into pending
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped
  where ns.nspname = 'public' and c.relkind = 'r' and c.relname not in ('company_users', 'companies');

  while coalesce(array_length(pending, 1), 0) > 0 loop
    pass := pass + 1;
    progress := false;
    for t in select unnest(pending) as name loop
      begin
        execute format('delete from public.%I where company_id = $1', t.name) using co.id;
        get diagnostics n = row_count;
        total := total + n;
        pending := array_remove(pending, t.name);
        progress := true;
      exception when foreign_key_violation then
        null; -- something still points at these rows; retry after other tables are emptied
      end;
    end loop;
    if not progress or pass > 25 then
      raise exception 'Could not delete company data: rows in "%" are still referenced elsewhere', pending[1];
    end if;
  end loop;

  -- The company's users and their Google identities.
  with gone as (delete from public.company_users where company_id = co.id returning auth_user_id)
  delete from auth.users where id in (select auth_user_id from gone where auth_user_id is not null);
  get diagnostics users_gone = row_count;

  delete from public.companies where id = co.id;
  return jsonb_build_object('deleted_company', co.company_name, 'rows_deleted', total, 'sign_ins_removed', users_gone);
end;
$$;

revoke all on function public.erp_delete_user(uuid) from public, anon;
revoke all on function public.erp_delete_company(uuid, text) from public, anon;
grant execute on function public.erp_delete_user(uuid) to authenticated;
grant execute on function public.erp_delete_company(uuid, text) to authenticated;

commit;
