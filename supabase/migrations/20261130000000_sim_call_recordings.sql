-- SIM Calls: call recordings. The phone's own dialer records the call (Android does not let other apps record calls);
-- the Argus app finds that recording file, uploads it to the private storage bucket "sim-recordings" and attaches it
-- to the call. Run after 20261129000000_sim_calls.sql. Idempotent.
--
--   sim_calls.recording_*      where the recording is stored and when it is deleted
--   sim_settings               per company: save recordings yes/no, keep them N days (managers change it)
--   storage "sim-recordings"   private; a person can open a recording only if they can see its call

begin;

alter table public.sim_calls add column if not exists recording_path text not null default '';
alter table public.sim_calls add column if not exists recording_size bigint not null default 0;
alter table public.sim_calls add column if not exists recording_at timestamptz;
alter table public.sim_calls add column if not exists recording_delete_after timestamptz;
create index if not exists sim_calls_recording_due on public.sim_calls (recording_delete_after) where recording_path <> '';
create index if not exists sim_calls_recording_path on public.sim_calls (recording_path) where recording_path <> '';

create table if not exists public.sim_settings (
  id               uuid primary key default gen_random_uuid(),
  save_recordings  boolean not null default true,
  recording_days   int not null default 90 check (recording_days between 1 and 3650),
  updated_at       timestamptz not null default now()
);
select public.erp_secure_table('sim_settings');
create unique index if not exists sim_settings_company on public.sim_settings (company_id);

-- everyone in the company may read the settings; only SIM Calls managers change them
drop policy if exists sim_settings_manage on public.sim_settings;
create policy sim_settings_manage on public.sim_settings as restrictive for all to authenticated
  using (true) with check (public.sim_is_manager());

-- ---------------------------------------------------------------- private storage for the audio files
insert into storage.buckets (id, name, public, file_size_limit)
values ('sim-recordings', 'sim-recordings', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- read: only when the person can see the call (the sim_calls row rules apply inside this check);
-- writes happen only through the server, which uses its own key
drop policy if exists sim_recordings_read on storage.objects;
create policy sim_recordings_read on storage.objects for select to authenticated
  using (bucket_id = 'sim-recordings'
         and exists (select 1 from public.sim_calls c where c.recording_path = storage.objects.name));

commit;
