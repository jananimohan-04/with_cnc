-- =====================================================================================
-- ARGUS CNC ERP — market_rates: also store silver, gold, platinum and palladium
--
-- Run after 20261003000000_market_rates.sql (safe to run more than once). Only the list of
-- allowed metals changes; no data is touched.
-- =====================================================================================

begin;

alter table public.market_rates drop constraint if exists market_rates_metal_check;
alter table public.market_rates
  add constraint market_rates_metal_check
  check (metal in ('aluminum', 'copper', 'lead', 'nickel', 'zinc', 'silver', 'gold', 'platinum', 'palladium'));

commit;

notify pgrst, 'reload schema';
