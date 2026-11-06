-- Retail Store roles (sales partner tiers, content writer, finance...) are kept in BI. The Retail Store backend reads them
-- from here (and, when this table is empty on first start, fills it from the roles it already has).
create table if not exists public.retail_roles (
  id               text primary key,
  name             text not null,
  category         text not null default 'sales_partner',
  markup_pct       numeric not null default 0 check (markup_pct >= 0),
  require_terms    boolean not null default false,
  terms            text not null default '',
  description      text not null default '',
  is_system        boolean not null default false,
  active           boolean not null default true,
  menu_permissions jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists retail_roles_name_key on public.retail_roles (lower(name));
alter table public.retail_roles enable row level security;
drop policy if exists retail_roles_read on public.retail_roles;
create policy retail_roles_read on public.retail_roles for select to authenticated using (true);
revoke insert, update, delete on public.retail_roles from authenticated;

-- Super Admin creates / edits a role. p_role keys: id (to edit), name, category, markup_pct, require_terms, terms,
-- description, active, menu_permissions (array of page ids)
create or replace function public.erp_save_retail_role(p_role jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_id text := nullif(btrim(p_role ->> 'id'), '');
  v_name text := btrim(coalesce(p_role ->> 'name', ''));
  r public.retail_roles;
begin
  if me.role <> 'SUPER_ADMIN' then raise exception 'Only the Super Admin can manage Retail Store roles' using errcode = '42501'; end if;
  if v_name = '' then raise exception 'Role name is required'; end if;
  if exists (select 1 from public.retail_roles where lower(name) = lower(v_name) and id is distinct from v_id) then
    raise exception 'A role named "%" already exists', v_name;
  end if;
  if v_id is null then
    v_id := 'role_' || btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '_', 'g'), '_');
    if exists (select 1 from public.retail_roles where id = v_id) then v_id := v_id || '_' || floor(random() * 900 + 100)::int; end if;
    insert into public.retail_roles (id, name) values (v_id, v_name);
  end if;
  update public.retail_roles set
    name             = v_name,
    category         = coalesce(nullif(btrim(p_role ->> 'category'), ''), category),
    markup_pct       = case when p_role ? 'markup_pct' then greatest(0, coalesce((p_role ->> 'markup_pct')::numeric, 0)) else markup_pct end,
    require_terms    = case when p_role ? 'require_terms' then coalesce((p_role ->> 'require_terms')::boolean, false) else require_terms end,
    terms            = case when p_role ? 'terms' then coalesce(p_role ->> 'terms', '') else terms end,
    description      = case when p_role ? 'description' then coalesce(p_role ->> 'description', '') else description end,
    active           = case when p_role ? 'active' then coalesce((p_role ->> 'active')::boolean, true) else active end,
    menu_permissions = case when jsonb_typeof(p_role -> 'menu_permissions') = 'array' then p_role -> 'menu_permissions' else menu_permissions end,
    updated_at       = now()
  where id = v_id
  returning * into r;
  if r.id is null then raise exception 'Role not found'; end if;
  return to_jsonb(r);
end $$;
grant execute on function public.erp_save_retail_role(jsonb) to authenticated;

create or replace function public.erp_delete_retail_role(p_id text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare me public.company_users := public.erp_current_user();
begin
  if me.role <> 'SUPER_ADMIN' then raise exception 'Only the Super Admin can manage Retail Store roles' using errcode = '42501'; end if;
  if exists (select 1 from public.retail_roles where id = p_id and is_system) then raise exception 'A core system role cannot be deleted'; end if;
  if exists (select 1 from public.company_users where retail_role = p_id) then raise exception 'Users are still assigned to this role'; end if;
  delete from public.retail_roles where id = p_id;
end $$;
grant execute on function public.erp_delete_retail_role(text) to authenticated;
