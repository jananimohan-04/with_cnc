-- Tele CRM: the number customers see on calls made through an agent's mobile (bridge calls).
-- Run after 20261127000000_tele_crm_bridge.sql. Idempotent.
--
--   tele_settings.bridge_caller_id   agent_mobile = the agent's own verified mobile (SIM) number (default)
--                                    business     = the company's connected business number (falls back to the
--                                                   agent's mobile when no business number is connected)

begin;

alter table public.tele_settings add column if not exists bridge_caller_id text not null default 'agent_mobile';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tele_settings_bridge_caller_id_check') then
    alter table public.tele_settings add constraint tele_settings_bridge_caller_id_check check (bridge_caller_id in ('agent_mobile', 'business'));
  end if;
end $$;

commit;
