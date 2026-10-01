-- =====================================================================================
-- ARGUS CNC ERP — Super Admin access grants
--
-- Lets a Super Admin grant Super Admin access to another user from
-- User Management (Create User / Edit User role = Super Admin).
--
-- * Only a SUPER_ADMIN caller can assign the SUPER_ADMIN role; Company Admin
--   rules are unchanged (USER role, own company only).
-- * Super Admin accounts span all companies, so their company_id stays NULL
--   (the app already displays those rows as "All companies").
-- * A Super Admin can edit another Super Admin (name, email, status, role)
--   but can never remove their OWN Super Admin access (lockout guard).
-- * Additive: only the erp_save_user body changes; no table, policy or other
--   function is modified. `create or replace` preserves existing grants.
-- =====================================================================================

begin;

create or replace function public.erp_save_user(
  p_id uuid, p_email text, p_full_name text, p_role text, p_status text, p_company_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  target public.company_users;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_company uuid;
  saved public.company_users;
begin
  if me.id is null or me.role not in ('SUPER_ADMIN', 'COMPANY_ADMIN') then
    raise exception 'Only administrators can manage users' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid Google account email address';
  end if;
  if p_role not in ('SUPER_ADMIN', 'COMPANY_ADMIN', 'USER') then
    raise exception 'Role must be SUPER_ADMIN, COMPANY_ADMIN or USER' using errcode = '42501';
  end if;
  if p_role = 'SUPER_ADMIN' and me.role <> 'SUPER_ADMIN' then
    raise exception 'Only the Super Admin can grant Super Admin access' using errcode = '42501';
  end if;
  if p_status not in ('Active', 'Inactive') then
    raise exception 'Status must be Active or Inactive';
  end if;

  if me.role = 'COMPANY_ADMIN' then
    if p_company_id is not null and p_company_id <> me.company_id then
      raise exception 'You can only manage users of your own company' using errcode = '42501';
    end if;
    if p_role <> 'USER' then
      raise exception 'Company admins can only assign the USER role' using errcode = '42501';
    end if;
    v_company := me.company_id;
  elsif p_role = 'SUPER_ADMIN' then
    -- Super Admins span all companies: no company is stored or required.
    v_company := null;
  else
    v_company := p_company_id;
    if v_company is null or not exists (select 1 from public.companies where id = v_company) then
      raise exception 'Select a valid company';
    end if;
  end if;

  if p_id is null then
    begin
      insert into public.company_users (email, full_name, role, status, company_id, created_by)
      values (v_email, coalesce(btrim(p_full_name), ''), p_role, p_status, v_company, me.id)
      returning * into saved;
    exception when unique_violation then
      raise exception 'A user with the email % already exists', v_email;
    end;
  else
    select * into target from public.company_users where id = p_id;
    if target.id is null then
      raise exception 'User not found';
    end if;
    if target.role = 'SUPER_ADMIN' then
      if me.role <> 'SUPER_ADMIN' then
        raise exception 'Super Admin accounts cannot be changed here' using errcode = '42501';
      end if;
      if target.id = me.id and p_role <> 'SUPER_ADMIN' then
        raise exception 'You cannot remove your own Super Admin access' using errcode = '42501';
      end if;
    end if;
    if me.role = 'COMPANY_ADMIN' and (target.company_id <> me.company_id or target.role <> 'USER') then
      raise exception 'You can only edit USER accounts of your own company' using errcode = '42501';
    end if;
    begin
      update public.company_users
      set email = v_email, full_name = coalesce(btrim(p_full_name), ''), role = p_role,
          status = p_status, company_id = v_company
      where id = p_id
      returning * into saved;
    exception when unique_violation then
      raise exception 'A user with the email % already exists', v_email;
    end;
  end if;

  return to_jsonb(saved);
end;
$$;

commit;
