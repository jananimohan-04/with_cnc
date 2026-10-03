-- =====================================================================================
-- ARGUS CNC ERP — live metal market rates (INR per kg)
--
-- One shared row per metal, written ONLY by the `refresh-metal-rates` Edge Function (service
-- role, which bypasses RLS) and readable by every signed-in user. Market prices are public
-- data, so they are not per-company. Additive: one new table, nothing else is touched.
-- =====================================================================================

begin;

create table if not exists public.market_rates (
  metal       text primary key check (metal in ('aluminum', 'copper', 'lead', 'nickel', 'zinc')),
  inr_per_kg  numeric not null check (inr_per_kg > 0),
  source      text not null default 'metals.dev',
  -- when the provider says the price was taken, and when we stored it
  quoted_at   timestamptz,
  fetched_at  timestamptz not null default now()
);

alter table public.market_rates enable row level security;

drop policy if exists market_rates_read on public.market_rates;
create policy market_rates_read on public.market_rates for select to authenticated using (true);

-- No insert/update/delete policy: only the service role (Edge Function) can write.
revoke all on public.market_rates from anon;
revoke insert, update, delete on public.market_rates from authenticated;
grant select on public.market_rates to authenticated;

commit;

notify pgrst, 'reload schema';
