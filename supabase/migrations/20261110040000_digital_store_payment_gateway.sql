-- Each company links its OWN Razorpay account (Business Intelligence > Digital Store > Payment).
-- Payment links for Digital Store orders, quotations and invoices are created with that account.
-- The key secret is stored ENCRYPTED by the server and never sent back to a browser:
-- the table has no access for signed-in users at all; only the server (service key) reads and writes it.
-- Safe to run more than once.

begin;

create table if not exists public.digital_store_payment (
  company_id uuid primary key references public.companies (id) on delete cascade,
  provider text not null default 'razorpay',
  key_id text not null,
  key_secret_enc text not null,
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.digital_store_payment enable row level security;
-- deliberately no policies: nobody signed in can read or change it
revoke all on public.digital_store_payment from anon, authenticated;

commit;
