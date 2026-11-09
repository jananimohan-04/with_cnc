-- Digital Store: each company links its OWN e-mail account (in Business Intelligence > Digital Store > E-mail setup).
-- The order confirmation e-mails are sent from that account. The password is stored ENCRYPTED by the server and is never sent back to a browser:
-- the table has no access for signed-in users at all; only the server (service key) reads and writes it.
-- Safe to run more than once.

begin;

create table if not exists public.digital_store_mail (
  company_id uuid primary key references public.companies (id) on delete cascade,
  provider text,
  smtp_host text not null,
  smtp_port integer not null default 587,
  smtp_user text not null,
  smtp_pass_enc text not null,
  from_name text,
  bcc text,
  verified_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.digital_store_mail enable row level security;
-- deliberately no policies: nobody signed in can read or change it
revoke all on public.digital_store_mail from anon, authenticated;

commit;
