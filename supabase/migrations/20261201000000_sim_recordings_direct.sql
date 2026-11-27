-- SIM Calls: recordings go from the phone straight to storage (no web server in between). Some mobile networks
-- block the web server's address, while the database address (used for the call details) always works.
-- Run after 20261130000000_sim_call_recordings.sql. Idempotent.
--
--   1. sim_recording_ticket(key, call)  -> a one-time, 15-minute upload address for that call's recording
--   2. the phone uploads the file to storage bucket "sim-recordings" at that address (allowed only with a ticket)
--   3. sim_recording_done(key, call)    -> checks the file arrived and attaches it to the call

begin;

create table if not exists public.sim_upload_tickets (
  path        text primary key,              -- company/line/call-<random>.<ext>
  call_id     uuid not null references public.sim_calls (id) on delete cascade,
  expires_at  timestamptz not null
);
alter table public.sim_upload_tickets enable row level security;   -- no policies: only the functions below use it
revoke all on public.sim_upload_tickets from anon, authenticated;

-- the phone's line from its key (same check as sim_ingest)
create or replace function public.sim_line_of(p_token text)
returns public.sim_lines
language sql stable security definer set search_path = ''
as $$
  select l.* from public.sim_lines l
   where l.active and coalesce(p_token, '') <> ''
     and l.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and exists (select 1 from public.company_users cu where cu.id = l.user_id and cu.status = 'Active')
   limit 1
$$;
revoke all on function public.sim_line_of(text) from public, anon, authenticated;

create or replace function public.sim_recording_ticket(p_token text, p_call_id bigint, p_ext text, p_size bigint)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  l public.sim_lines;
  c public.sim_calls;
  v_save boolean;
  v_ext text := lower(regexp_replace(coalesce(p_ext, ''), '[^A-Za-z0-9]', '', 'g'));
  v_path text;
begin
  l := public.sim_line_of(p_token);
  if l.id is null then raise exception 'This phone is no longer connected. Choose the SIM again in the app.' using errcode = '28000'; end if;
  select coalesce((select s.save_recordings from public.sim_settings s where s.company_id = l.company_id), true) into v_save;
  if not v_save then return jsonb_build_object('skip', true); end if;   -- the company switched recordings off
  select * into c from public.sim_calls where line_id = l.id and device_call_id = p_call_id order by created_at desc limit 1;
  if c.id is null then return jsonb_build_object('missing', true); end if;   -- not in BI (made before the SIM was connected)
  if c.recording_path <> '' then return jsonb_build_object('done', true); end if;
  if v_ext not in ('m4a', 'amr', 'mp3', 'aac', 'wav', '3gp', 'ogg', 'opus', 'awb', 'mp4') or coalesce(p_size, 0) <= 0 or p_size > 52428800 then
    return jsonb_build_object('skip', true);
  end if;
  delete from public.sim_upload_tickets where expires_at < now();
  v_path := l.company_id || '/' || l.id || '/' || c.id || '-' || replace(gen_random_uuid()::text, '-', '') || '.' || v_ext;
  insert into public.sim_upload_tickets (path, call_id, expires_at) values (v_path, c.id, now() + interval '15 minutes');
  return jsonb_build_object('path', v_path);
end;
$$;
revoke all on function public.sim_recording_ticket(text, bigint, text, bigint) from public;
grant execute on function public.sim_recording_ticket(text, bigint, text, bigint) to anon, authenticated;

-- storage asks this before accepting an upload: only to a live ticket's address
create or replace function public.sim_ticket_ok(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.sim_upload_tickets t where t.path = p_name and t.expires_at > now()) $$;
revoke all on function public.sim_ticket_ok(text) from public;
grant execute on function public.sim_ticket_ok(text) to anon, authenticated;

drop policy if exists sim_recordings_upload on storage.objects;
create policy sim_recordings_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'sim-recordings' and public.sim_ticket_ok(name));

create or replace function public.sim_recording_done(p_token text, p_call_id bigint)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  l public.sim_lines;
  t public.sim_upload_tickets;
  o record;
  v_days int;
begin
  l := public.sim_line_of(p_token);
  if l.id is null then raise exception 'This phone is no longer connected. Choose the SIM again in the app.' using errcode = '28000'; end if;
  select tk.* into t from public.sim_upload_tickets tk
    join public.sim_calls c on c.id = tk.call_id
   where c.line_id = l.id and c.device_call_id = p_call_id
   order by tk.expires_at desc limit 1;
  if t.path is null then return false; end if;
  select so.name, coalesce((so.metadata ->> 'size')::bigint, 0) as size into o
    from storage.objects so where so.bucket_id = 'sim-recordings' and so.name = t.path;
  if o.name is null then return false; end if;   -- not uploaded (yet)
  select coalesce((select s.recording_days from public.sim_settings s where s.company_id = l.company_id), 90) into v_days;
  update public.sim_calls set recording_path = t.path, recording_size = o.size, recording_at = now(),
         recording_delete_after = now() + make_interval(days => v_days)
   where id = t.call_id;
  delete from public.sim_upload_tickets where call_id = t.call_id;
  return true;
end;
$$;
revoke all on function public.sim_recording_done(text, bigint) from public;
grant execute on function public.sim_recording_done(text, bigint) to anon, authenticated;

commit;
