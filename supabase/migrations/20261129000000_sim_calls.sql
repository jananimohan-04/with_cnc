-- SIM Calls: the company gives a staff member a SIM; the Android app (after sign-in) asks which SIM in the phone
-- is the company SIM, then copies every call made or received on that SIM (number, name, in/out/missed, time,
-- duration) into BI. Sales > SIM Calls, /sim-calls. Module key 'sim-calls'
-- (View = own calls, Approve = everyone's calls in the company, Export = CSV).
-- Idempotent: safe to run more than once.
--
--   sim_lines   one row per "this SIM in this phone, used by this person". The phone holds a random key for it
--               (only its sha-256 is stored here); the key is how the phone sends calls in the background.
--   sim_calls   one row per call on that SIM, copied from the phone's call history. Written only by sim_ingest().

begin;

create table if not exists public.sim_lines (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.company_users (id) on delete cascade,
  device_id     text not null,                     -- the app's own id for the phone
  device_model  text not null default '',
  sim_slot      int  not null default 0,           -- 1 = SIM 1, 2 = SIM 2
  carrier       text not null default '',
  sim_label     text not null default '',
  phone_number  text not null default '',          -- the SIM's number (read from the SIM or typed by the person)
  token_hash    text not null default '',
  active        boolean not null default true,
  last_sync_at  timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists public.sim_calls (
  id             uuid primary key default gen_random_uuid(),
  line_id        uuid not null references public.sim_lines (id) on delete cascade,
  user_id        uuid references public.company_users (id) on delete set null,
  number         text not null default '',
  number_key     text not null default '',         -- last 10 digits, for matching
  contact_name   text not null default '',         -- as saved in the phone's contacts
  direction      text not null default 'unknown' check (direction in ('incoming', 'outgoing', 'missed', 'rejected', 'blocked', 'unknown')),
  started_at     timestamptz not null,
  duration_sec   int  not null default 0,
  device_call_id bigint not null default 0,        -- the phone's call-history id
  created_at     timestamptz not null default now()
);

select public.erp_secure_table('sim_lines');
select public.erp_secure_table('sim_calls');

create unique index if not exists sim_calls_once on public.sim_calls (line_id, device_call_id, started_at);
create index if not exists sim_calls_company_time on public.sim_calls (company_id, started_at desc);
create index if not exists sim_calls_user_time on public.sim_calls (user_id, started_at desc);
create index if not exists sim_calls_number on public.sim_calls (company_id, number_key);
create index if not exists sim_lines_user on public.sim_lines (user_id);
create index if not exists sim_lines_token on public.sim_lines (token_hash) where active;

-- ---------------------------------------------------------------- who sees what
create or replace function public.sim_is_manager()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.erp_has_perm('sim-calls', 'approve'), false) $$;
revoke all on function public.sim_is_manager() from public, anon;
grant execute on function public.sim_is_manager() to authenticated;

drop policy if exists sim_lines_own on public.sim_lines;
create policy sim_lines_own on public.sim_lines as restrictive for all to authenticated
  using (public.sim_is_manager() or user_id = (select (public.erp_current_user()).id));
drop policy if exists sim_calls_own on public.sim_calls;
create policy sim_calls_own on public.sim_calls as restrictive for all to authenticated
  using (public.sim_is_manager() or user_id = (select (public.erp_current_user()).id));

-- the browser only reads; the functions below write
revoke insert, update, delete on public.sim_lines from authenticated;
revoke insert, update, delete on public.sim_calls from authenticated;
-- the device key never leaves the database
-- (a table-wide select would include it, so only the other columns are granted)
revoke select on public.sim_lines from authenticated;
grant select (id, company_id, user_id, device_id, device_model, sim_slot, carrier, sim_label, phone_number, active, last_sync_at, created_at)
  on public.sim_lines to authenticated;

-- ---------------------------------------------------------------- the phone registers its chosen SIM (signed in)
create or replace function public.sim_register(p_device_id text, p_device_model text, p_slot int, p_carrier text, p_label text, p_number text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  u public.company_users;
  v_company uuid;
  v_token text;
  v_id uuid;
begin
  u := public.erp_current_user();
  if u.id is null then raise exception 'Sign in first.'; end if;
  if not public.erp_has_perm('sim-calls', 'view') then raise exception 'You do not have access to SIM Calls. Ask your Company Admin.'; end if;
  v_company := case when u.role = 'SUPER_ADMIN' then u.active_company_id else u.company_id end;
  if v_company is null then raise exception 'Select a company first.'; end if;
  if coalesce(trim(p_device_id), '') = '' then raise exception 'Missing phone id.'; end if;

  -- one company SIM per phone: an earlier choice on this phone stops sending
  update public.sim_lines set active = false, token_hash = ''
   where company_id = v_company and device_id = p_device_id and active;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.sim_lines (company_id, user_id, device_id, device_model, sim_slot, carrier, sim_label, phone_number, token_hash)
  values (v_company, u.id, left(p_device_id, 100), left(coalesce(p_device_model, ''), 100), coalesce(p_slot, 0),
          left(coalesce(p_carrier, ''), 60), left(coalesce(p_label, ''), 60), left(coalesce(trim(p_number), ''), 20),
          encode(sha256(convert_to(v_token, 'UTF8')), 'hex'))
  returning id into v_id;

  return jsonb_build_object('line_id', v_id, 'token', v_token);
end;
$$;
revoke all on function public.sim_register(text, text, int, text, text, text) from public, anon;
grant execute on function public.sim_register(text, text, int, text, text, text) to authenticated;

-- stop a line (the person themself, or a manager)
create or replace function public.sim_disconnect(p_line_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare u public.company_users;
begin
  u := public.erp_current_user();
  if u.id is null then raise exception 'Sign in first.'; end if;
  update public.sim_lines set active = false, token_hash = ''
   where id = p_line_id
     and company_id = any (public.erp_visible_company_ids())
     and (user_id = u.id or public.sim_is_manager());
end;
$$;
revoke all on function public.sim_disconnect(uuid) from public, anon;
grant execute on function public.sim_disconnect(uuid) to authenticated;

-- ---------------------------------------------------------------- the phone sends calls (background, with its key)
-- p_calls: [{ id, number, name, type, date (ms since 1970), duration (s) }]
create or replace function public.sim_ingest(p_token text, p_calls jsonb)
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  l public.sim_lines;
  n int;
begin
  if coalesce(p_token, '') = '' then raise exception 'Missing key.'; end if;
  select * into l from public.sim_lines
   where active and token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') limit 1;
  if l.id is null then raise exception 'This phone is no longer connected. Choose the SIM again in the app.' using errcode = '28000'; end if;
  if not exists (select 1 from public.company_users cu where cu.id = l.user_id and cu.status = 'Active') then
    raise exception 'This account is not active.' using errcode = '28000';
  end if;
  if jsonb_typeof(p_calls) <> 'array' or jsonb_array_length(p_calls) > 500 then raise exception 'Send up to 500 calls at a time.'; end if;

  insert into public.sim_calls (company_id, line_id, user_id, number, number_key, contact_name, direction, started_at, duration_sec, device_call_id)
  select l.company_id, l.id, l.user_id,
         left(coalesce(c ->> 'number', ''), 30),
         right(regexp_replace(coalesce(c ->> 'number', ''), '\D', '', 'g'), 10),
         left(coalesce(c ->> 'name', ''), 100),
         case when c ->> 'type' in ('incoming', 'outgoing', 'missed', 'rejected', 'blocked') then c ->> 'type' else 'unknown' end,
         to_timestamp((c ->> 'date')::double precision / 1000),
         greatest(0, coalesce((c ->> 'duration')::int, 0)),
         coalesce((c ->> 'id')::bigint, 0)
    from jsonb_array_elements(p_calls) c
   where (c ->> 'date') ~ '^\d{10,14}$'
  on conflict (line_id, device_call_id, started_at) do nothing;
  get diagnostics n = row_count;

  update public.sim_lines set last_sync_at = now() where id = l.id;
  return n;
end;
$$;
revoke all on function public.sim_ingest(text, jsonb) from public;
-- the phone sends in the background without a signed-in session: the key is the permission
grant execute on function public.sim_ingest(text, jsonb) to anon, authenticated;

commit;
