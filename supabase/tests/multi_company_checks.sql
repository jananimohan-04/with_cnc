-- =====================================================================================
-- Multi-company security checks for the ARGUS CNC ERP.
--
-- Run in the Supabase SQL editor AFTER the migration 20260923000000_multi_company_auth.sql.
-- Everything happens inside one transaction that is ROLLED BACK at the end, so no test
-- users, companies or records are left behind. A failing check stops the script with
-- "FAILED Tn: ...". Success ends with the single row "ALL MULTI-COMPANY CHECKS PASSED".
--
-- Users are impersonated the same way PostgREST does it: role `authenticated` plus JWT
-- claims (sub + amr) in request.jwt.claims.
-- =====================================================================================

begin;

-- ---------- Fixtures (as postgres, no JWT) -------------------------------------------
select set_config('request.jwt.claims', '', true);

-- Test-only helper (dropped by the final ROLLBACK): inserts a row using only the columns the
-- test cares about. Any other NOT NULL column without a default gets a harmless value of the
-- right type (a parent row is created for required foreign keys), so the checks work whatever
-- extra required columns the live tables have. Runs with the caller's rights: RLS and the
-- company trigger apply exactly as for the app.
create or replace function public.erp_test_insert(p_table text, p_values jsonb)
returns jsonb
language plpgsql
as $$
declare
  c record;
  v jsonb := p_values;
  v_parent jsonb;
  v_cols text;
  r jsonb;
begin
  for c in
    select col.column_name, col.data_type, col.udt_name,
           fk.ref_table, fk.ref_column
    from information_schema.columns col
    left join lateral (
      select rt.relname::text as ref_table, ra.attname::text as ref_column
      from pg_constraint k
      join pg_class t on t.oid = k.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
      join pg_class rt on rt.oid = k.confrelid
      join pg_attribute ra on ra.attrelid = k.confrelid and ra.attnum = k.confkey[1]
      where k.contype = 'f' and n.nspname = 'public' and t.relname = p_table
        and array_length(k.conkey, 1) = 1 and a.attname = col.column_name
      limit 1
    ) fk on true
    where col.table_schema = 'public' and col.table_name = p_table
      and col.is_nullable = 'NO' and col.column_default is null
      and col.is_generated = 'NEVER' and col.identity_generation is null
      and col.column_name <> 'company_id'   -- set by the company trigger (or given by the test)
  loop
    continue when v ? c.column_name;
    if c.ref_table is not null and c.ref_table <> p_table then
      v_parent := public.erp_test_insert(c.ref_table,
        case when v ? 'company_id' then jsonb_build_object('company_id', v -> 'company_id') else '{}'::jsonb end);
      v := v || jsonb_build_object(c.column_name, v_parent -> c.ref_column);
    else
      v := v || jsonb_build_object(c.column_name, case
        when c.data_type in ('smallint', 'integer', 'bigint', 'numeric', 'real', 'double precision') then to_jsonb(0)
        when c.data_type = 'boolean' then to_jsonb(false)
        when c.data_type = 'date' then to_jsonb(current_date)
        when c.data_type like 'timestamp%' then to_jsonb(now())
        when c.data_type like 'time%' then to_jsonb('00:00'::text)
        when c.data_type = 'uuid' then to_jsonb(gen_random_uuid())
        when c.data_type in ('json', 'jsonb') then '{}'::jsonb
        when c.data_type = 'ARRAY' then '[]'::jsonb
        when c.data_type = 'USER-DEFINED' then to_jsonb((
          select e.enumlabel::text from pg_enum e join pg_type t on t.oid = e.enumtypid
          where t.typname = c.udt_name order by e.enumsortorder limit 1))
        when c.column_name like '%id' then to_jsonb(gen_random_uuid()::text)
        else to_jsonb('ERP-TEST'::text) end);
    end if;
  end loop;

  select string_agg(format('%I', k), ', ') into v_cols from jsonb_object_keys(v) k;
  execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) returning to_jsonb(%I.*)',
                 p_table, v_cols, v_cols, p_table, p_table)
    into r using v;
  return r;
end;
$$;
grant execute on function public.erp_test_insert(text, jsonb) to authenticated;


insert into public.companies (id, company_name, code, status)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ERP Test Company B', 'ERPTESTB', 'Active');

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email,
       jsonb_build_object('full_name', u.name), '{"provider":"google","providers":["google"]}', now(), now()
from (values
  ('11111111-1111-4111-8111-111111111111', 'super@erp-test.invalid',    'Test Super'),
  ('22222222-2222-4222-8222-222222222222', 'admin-a@erp-test.invalid',  'Test Admin A'),
  ('33333333-3333-4333-8333-333333333333', 'user-a@erp-test.invalid',   'Test User A'),
  ('44444444-4444-4444-8444-444444444444', 'inactive@erp-test.invalid', 'Test Inactive'),
  ('55555555-5555-4555-8555-555555555555', 'admin-b@erp-test.invalid',  'Test Admin B'),
  ('66666666-6666-4666-8666-666666666666', 'unknown@erp-test.invalid',  'Test Unknown'),
  ('77777777-7777-4777-8777-777777777777', 'portal@erp-test.invalid',   'Test Portal')
) as u(id, email, name);

insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'google', now(), now()
from auth.users u where u.email like '%@erp-test.invalid';

insert into public.company_users (email, full_name, role, status, company_id, auth_user_id)
select v.email, v.name, v.role, v.status, c.id, v.auth_id::uuid
from (values
  ('super@erp-test.invalid',    'Test Super',    'SUPER_ADMIN',   'Active',   null,       '11111111-1111-4111-8111-111111111111'),
  ('admin-a@erp-test.invalid',  'Test Admin A',  'COMPANY_ADMIN', 'Active',   'ARGUS',    null),  -- linked on first login
  ('user-a@erp-test.invalid',   'Test User A',   'USER',          'Active',   'ARGUS',    '33333333-3333-4333-8333-333333333333'),
  ('inactive@erp-test.invalid', 'Test Inactive', 'USER',          'Inactive', 'ARGUS',    '44444444-4444-4444-8444-444444444444'),
  ('admin-b@erp-test.invalid',  'Test Admin B',  'COMPANY_ADMIN', 'Active',   'ERPTESTB', '55555555-5555-4555-8555-555555555555')
) as v(email, name, role, status, company_code, auth_id)
left join public.companies c on c.code = v.company_code;

-- Company B owns one customer and one enquiry.
select public.erp_test_insert('cnc_customers', '{"id":"b0000000-0000-4000-8000-0000000000c1","name":"ERP-TEST B-only customer","company_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}');
select public.erp_test_insert('cnc_enquiries', '{"id":"b0000000-0000-4000-8000-000000000001","enquiry_no":"ERP-TEST-ENQ-B","customer":"ERP-TEST B-only customer","company_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}');

-- A portal customer with one enquiry.
select public.erp_test_insert('portal_profiles', jsonb_build_object('id', 'a0000000-0000-4000-8000-000000000001',
  'auth_user_id', '77777777-7777-4777-8777-777777777777', 'email', 'portal@erp-test.invalid', 'company_name', 'Portal Co',
  'company_id', (select id from public.companies where portal_default)));
select public.erp_test_insert('cnc_enquiries', jsonb_build_object('id', 'e0000000-0000-4000-8000-000000000001',
  'enquiry_no', 'ERP-TEST-ENQ-PORTAL', 'customer', 'Portal Co', 'portal_profile_id', 'a0000000-0000-4000-8000-000000000001',
  'company_id', (select id from public.companies where portal_default)));

select set_config('erp_test.argus_id', (select id::text from public.companies where code = 'ARGUS'), true);
select set_config('erp_test.argus_customers',
  (select count(*)::text from public.cnc_customers where company_id = (select id from public.companies where code = 'ARGUS')), true);
select set_config('erp_test.admin_b_id', (select id::text from public.company_users where email = 'admin-b@erp-test.invalid'), true);

-- ---------- TEST 1: Super Admin -------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth","timestamp":0}]}', true);
set local role authenticated;
do $$
declare s jsonb := public.erp_get_session(); err boolean := false;
begin
  if s ->> 'status' <> 'authorized' or s -> 'user' ->> 'role' <> 'SUPER_ADMIN' then
    raise exception 'FAILED T1: Super Admin should be authorized, got %', s;
  end if;
  if (select count(distinct company_id) from public.cnc_customers) < 2 then
    raise exception 'FAILED T1: Super Admin (all companies) should see data of every company';
  end if;
  if (select count(*) from public.companies) < 2 then
    raise exception 'FAILED T1: Super Admin should see all companies';
  end if;
  if (select count(*) from public.company_users where email like '%@erp-test.invalid') <> 5 then
    raise exception 'FAILED T1: Super Admin should see all users';
  end if;
  perform public.erp_save_company(null, 'ERP Test Company C', 'ERPTESTC', 'Active');
  perform public.erp_save_user(null, 'admin-c@erp-test.invalid', 'Test Admin C', 'COMPANY_ADMIN', 'Active',
                               (select id from public.companies where code = 'ERPTESTC'));
  perform public.erp_set_active_company('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  if exists (select 1 from public.cnc_customers where company_id <> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') then
    raise exception 'FAILED T1: selecting a company should scope the Super Admin view';
  end if;
  perform public.erp_set_active_company(null);
  begin
    perform public.erp_save_user(null, 'x@erp-test.invalid', 'X', 'SUPER_ADMIN', 'Active', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  exception when others then err := true;
  end;
  if not err then raise exception 'FAILED T1: SUPER_ADMIN must not be assignable through erp_save_user'; end if;
end $$;
reset role;

-- ---------- TEST 2: Company Admin of Argus Technology ----------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","amr":[{"method":"oauth","timestamp":0}]}', true);
set local role authenticated;
do $$
declare s jsonb := public.erp_get_session();
begin
  if s ->> 'status' <> 'authorized' or s -> 'user' ->> 'role' <> 'COMPANY_ADMIN'
     or s -> 'company' ->> 'company_name' <> 'Argus Technology' then
    raise exception 'FAILED T2: Company Admin should be authorized for Argus Technology, got %', s;
  end if;
  if (select count(*) from public.cnc_customers) <> current_setting('erp_test.argus_customers')::bigint then
    raise exception 'FAILED T2: Company Admin should see exactly the Argus customers';
  end if;
  if exists (select 1 from public.cnc_customers where company_id <> current_setting('erp_test.argus_id')::uuid) then
    raise exception 'FAILED T2: Company Admin sees another company''s customers';
  end if;
  perform public.erp_save_user(null, 'new-user-a@erp-test.invalid', 'New User A', 'USER', 'Active', null);
  if exists (select 1 from public.company_users where company_id is distinct from current_setting('erp_test.argus_id')::uuid) then
    raise exception 'FAILED T2: Company Admin should only see users of their own company';
  end if;
  if (select company_id from public.company_users where email = 'new-user-a@erp-test.invalid') <> current_setting('erp_test.argus_id')::uuid then
    raise exception 'FAILED T2: created user should belong to Argus Technology';
  end if;
  if (select count(*) from public.companies) <> 1 then
    raise exception 'FAILED T2: Company Admin should only see their own company';
  end if;
end $$;
reset role;

-- ---------- TEST 3: unknown Google account --------------------------------------------
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated","amr":[{"method":"oauth","timestamp":0}]}', true);
set local role authenticated;
do $$
declare s jsonb := public.erp_get_session();
begin
  if s ->> 'status' <> 'not_registered' then raise exception 'FAILED T3: expected not_registered, got %', s; end if;
  if exists (select 1 from public.cnc_customers) or exists (select 1 from public.cnc_enquiries)
     or exists (select 1 from public.company_users) or exists (select 1 from public.companies) then
    raise exception 'FAILED T3: an unregistered account must not see any ERP data';
  end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$ begin
  if exists (select 1 from public.company_users where email = 'unknown@erp-test.invalid') then
    raise exception 'FAILED T3: an ERP user must not be created automatically';
  end if;
end $$;

-- ---------- TEST 4: inactive registered user ------------------------------------------
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","amr":[{"method":"oauth","timestamp":0}]}', true);
set local role authenticated;
do $$
declare s jsonb := public.erp_get_session();
begin
  if s ->> 'status' <> 'inactive' then raise exception 'FAILED T4: expected inactive, got %', s; end if;
  if exists (select 1 from public.cnc_customers) then raise exception 'FAILED T4: an inactive user must not see ERP data'; end if;
end $$;
reset role;

-- ---------- TEST 5 + 6: Company Admin vs. another company -----------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","amr":[{"method":"oauth","timestamp":0}]}', true);
set local role authenticated;
do $$
declare
  n bigint;
  v_company uuid;
  err boolean;
  b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
begin
  -- T5: cannot create users for another company or with a higher role
  err := false;
  begin perform public.erp_save_user(null, 'sneaky@erp-test.invalid', 'Sneaky', 'USER', 'Active', b);
  exception when others then err := true; end;
  if not err then raise exception 'FAILED T5: Company Admin created a user for another company'; end if;

  err := false;
  begin perform public.erp_save_user(null, 'sneaky2@erp-test.invalid', 'Sneaky', 'COMPANY_ADMIN', 'Active', null);
  exception when others then err := true; end;
  if not err then raise exception 'FAILED T5: Company Admin assigned the COMPANY_ADMIN role'; end if;

  err := false;
  begin perform public.erp_save_user(current_setting('erp_test.admin_b_id')::uuid, 'admin-b@erp-test.invalid', 'Hijacked', 'USER', 'Inactive', null);
  exception when others then err := true; end;
  if not err then raise exception 'FAILED T5: Company Admin edited a user of another company'; end if;

  -- T6: direct queries against Company B's data
  if exists (select 1 from public.cnc_customers where company_id = b) then
    raise exception 'FAILED T6: Company Admin can read Company B customers';
  end if;
  if exists (select 1 from public.cnc_enquiries where id::text = 'b0000000-0000-4000-8000-000000000001') then
    raise exception 'FAILED T6: Company Admin can read a Company B enquiry by id';
  end if;
  update public.cnc_customers set name = 'hacked' where company_id = b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAILED T6: Company Admin updated Company B rows'; end if;
  delete from public.cnc_customers where company_id = b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAILED T6: Company Admin deleted Company B rows'; end if;
  v_company := (public.erp_test_insert('cnc_customers', jsonb_build_object('id', 'b0000000-0000-4000-8000-0000000000c2', 'name', 'ERP-TEST forged', 'company_id', b)) ->> 'company_id')::uuid;
  if v_company <> current_setting('erp_test.argus_id')::uuid then
    raise exception 'FAILED T6: a client-supplied company_id was trusted';
  end if;
  update public.cnc_customers set company_id = b where name = 'ERP-TEST forged' returning company_id into v_company;
  if v_company <> current_setting('erp_test.argus_id')::uuid then
    raise exception 'FAILED T6: a record was moved to another company';
  end if;
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated","amr":[{"method":"oauth","timestamp":0}]}', true);
set local role authenticated;
do $$ begin
  if (select public.erp_get_session() ->> 'status') <> 'authorized' then raise exception 'FAILED T6: Company B admin should log in'; end if;
  if (select count(*) from public.cnc_customers) <> 1 then
    raise exception 'FAILED T6: Company B admin should see only Company B''s single customer';
  end if;
  if exists (select 1 from public.cnc_sales_orders) then
    raise exception 'FAILED T6: Company B admin can see Argus sales orders';
  end if;
end $$;
reset role;

-- ---------- TEST 7: all existing records belong to a company --------------------------
select set_config('request.jwt.claims', '', true);
do $$
declare t text; n bigint;
begin
  for t in select table_name from information_schema.columns
           where table_schema = 'public' and column_name = 'company_id'
             and table_name not in ('company_users')
  loop
    execute format('select count(*) from public.%I where company_id is null', t) into n;
    if n > 0 then raise exception 'FAILED T7: % has % rows without a company', t, n; end if;
  end loop;
end $$;

-- ---------- TEST 8: pipeline links inside one company --------------------------------
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","amr":[{"method":"oauth","timestamp":0}]}', true);
set local role authenticated;
do $$
declare
  v_enq text; v_quote text; v_so text; err boolean := false;
begin
  if (select public.erp_get_session() ->> 'status') <> 'authorized' then raise exception 'FAILED T8: USER should log in'; end if;
  v_enq := public.erp_test_insert('cnc_enquiries', '{"id":"e0000000-0000-4000-8000-000000000011","enquiry_no":"ERP-TEST-ENQ-1","customer":"Pipeline Co","status":"New"}') ->> 'id';
  v_quote := public.erp_test_insert('cnc_quotations', '{"id":"e0000000-0000-4000-8000-000000000012","quote_no":"ERP-TEST-QUO-1","customer":"Pipeline Co","lead_id":"e0000000-0000-4000-8000-000000000011","status":"Converted"}') ->> 'id';
  v_so := public.erp_test_insert('cnc_sales_orders', '{"id":"e0000000-0000-4000-8000-000000000013","order_no":"ERP-TEST-SO-1","customer":"Pipeline Co","quotation_id":"e0000000-0000-4000-8000-000000000012","status":"Confirmed"}') ->> 'id';
  perform public.erp_test_insert('cnc_work_orders', '{"id":"e0000000-0000-4000-8000-000000000014","wo_no":"ERP-TEST-WO-1","sales_order":"ERP-TEST-SO-1","status":"Planning"}');
  perform public.erp_test_insert('cnc_deliveries', '{"id":"e0000000-0000-4000-8000-000000000015","delivery_no":"ERP-TEST-DC-1","sales_order_id":"e0000000-0000-4000-8000-000000000013","status":"Pending"}');
  perform public.erp_test_insert('cnc_invoices', '{"id":"e0000000-0000-4000-8000-000000000016","invoice_no":"ERP-TEST-INV-1","status":"Sent"}');
  if (select count(*) from public.cnc_sales_orders o
        join public.cnc_quotations q on q.id::text = o.quotation_id::text
        join public.cnc_enquiries e on e.id::text = q.lead_id::text
      where o.id::text = v_so) <> 1 then
    raise exception 'FAILED T8: enquiry → quotation → sales order chain is broken';
  end if;
  begin
    perform public.erp_test_insert('cnc_quotations', '{"id":"e0000000-0000-4000-8000-000000000017","quote_no":"ERP-TEST-QUO-X","lead_id":"b0000000-0000-4000-8000-000000000001","status":"Draft"}');
  exception when others then err := true;
  end;
  if not err then raise exception 'FAILED T8: a quotation could reference another company''s enquiry'; end if;
end $$;
reset role;

-- ---------- Extra: password session for a registered email --------------------------
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","amr":[{"method":"password","timestamp":0}]}', true);
set local role authenticated;
do $$ begin
  if (select public.erp_get_session() ->> 'status') <> 'not_google' then
    raise exception 'FAILED: a non-Google session must be refused';
  end if;
  if exists (select 1 from public.cnc_customers) then raise exception 'FAILED: a non-Google session can read ERP data'; end if;
end $$;
reset role;

-- ---------- Extra: customer portal ---------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated","amr":[{"method":"oauth","timestamp":0}]}', true);
set local role authenticated;
do $$
declare err boolean := false; v_company uuid;
begin
  if (select count(*) from public.cnc_enquiries) <> 1 then
    raise exception 'FAILED portal: customer should see only their own enquiry';
  end if;
  if exists (select 1 from public.cnc_customers) or exists (select 1 from public.company_users) then
    raise exception 'FAILED portal: customer can see ERP data';
  end if;
  perform public.erp_test_insert('cnc_enquiries', '{"id":"e0000000-0000-4000-8000-000000000021","enquiry_no":"ERP-TEST-ENQ-PORTAL-2","customer":"Portal Co","portal_profile_id":"a0000000-0000-4000-8000-000000000001"}');
  begin
    perform public.erp_test_insert('cnc_enquiries', '{"id":"e0000000-0000-4000-8000-000000000022","enquiry_no":"ERP-TEST-ENQ-PORTAL-3","customer":"Portal Co"}');
  exception when others then err := true;
  end;
  if not err then raise exception 'FAILED portal: customer inserted an enquiry not tied to their profile'; end if;
end $$;
reset role;

-- ---------- Extra: anonymous key gets nothing ----------------------------------------
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
declare err boolean := false;
begin
  begin perform 1 from public.cnc_customers limit 1; exception when insufficient_privilege then err := true; end;
  if not err then raise exception 'FAILED anon: anonymous key can still read cnc_customers'; end if;
end $$;
reset role;

select 'ALL MULTI-COMPANY CHECKS PASSED' as result;

rollback;
