-- Adviser e-mail: each person links their OWN e-mail account (inside the Adviser chat), so the AI can write e-mails
-- that the person checks and sends from their own address. The password is stored ENCRYPTED by the server and is never sent
-- back to a browser: the table has no access for signed-in users at all; only the server (service key) reads and writes it.
-- Safe to run more than once.

begin;

create table if not exists public.adviser_user_mail (
  user_id uuid primary key,              -- the signed-in person (auth user id)
  email_owner text,                      -- their sign-in e-mail, for reference
  provider text,
  smtp_host text not null,
  smtp_port integer not null default 587,
  smtp_user text not null,
  smtp_pass_enc text not null,
  from_name text,
  verified_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.adviser_user_mail enable row level security;
-- deliberately no policies: nobody signed in can read or change it
revoke all on public.adviser_user_mail from anon, authenticated;

commit;
