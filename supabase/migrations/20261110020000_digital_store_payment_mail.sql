-- Digital Store: payment link (set in Business Intelligence) and the confirmation e-mail sent to the customer.
-- The link may contain {amount} and {order_no}, which are replaced for each order. Safe to run more than once.

begin;

alter table public.digital_stores add column if not exists payment_link text;
alter table public.digital_stores add column if not exists payment_note text;

alter table public.digital_store_orders add column if not exists mail_sent_at timestamptz;
alter table public.digital_store_orders add column if not exists mail_error text;

commit;
