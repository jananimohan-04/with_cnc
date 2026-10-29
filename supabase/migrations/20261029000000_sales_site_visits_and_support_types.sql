-- Migration: Sales Site Visits & Support Workflow Extension
-- Adds site visits for sales and extends support tickets for technical and on-site support.

begin;

-- 1. Extend support_tickets with technical & on-site fields
alter table if exists public.support_tickets
  add column if not exists support_type text not null default 'technical' check (support_type in ('technical', 'onsite')),
  add column if not exists customer_name text,
  add column if not exists contact_person text,
  add column if not exists contact_phone text,
  add column if not exists site_address text,
  add column if not exists assigned_to_id uuid,
  add column if not exists assigned_to_name text,
  add column if not exists scheduled_visit_date date,
  add column if not exists scheduled_visit_time text,
  add column if not exists actual_start_time timestamptz,
  add column if not exists actual_end_time timestamptz,
  add column if not exists work_performed text,
  add column if not exists observations text,
  add column if not exists completion_photo_url text,
  add column if not exists completion_photo_path text,
  add column if not exists supervisor_reviewed boolean not null default false,
  add column if not exists supervisor_name text,
  add column if not exists supervisor_notes text,
  add column if not exists supervisor_reviewed_at timestamptz;

-- Update support_tickets status check constraint to include 'Assigned', 'Scheduled', 'Completed', 'Revisit Required', 'Pending'
do $$
begin
  alter table public.support_tickets drop constraint if exists support_tickets_status_check;
  alter table public.support_tickets add constraint support_tickets_status_check
    check (status in ('Open', 'Assigned', 'Scheduled', 'In Progress', 'In Review', 'Need Information', 'Resolved', 'Closed', 'Completed', 'Revisit Required', 'Pending'));
exception
  when others then null;
end $$;

-- 2. Create sales_site_visits table
create table if not exists public.sales_site_visits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  visit_no text not null,
  customer_id text,
  customer_name text not null,
  site_address text not null default '',
  contact_person text not null default '',
  contact_phone text not null default '',
  contact_email text not null default '',
  salesperson_id text,
  salesperson_name text not null,
  visit_date date not null default current_date,
  visit_time text not null default '10:00 AM',
  purpose text not null default 'Initial Client Meeting',
  discussion_notes text not null default '',
  interested_products text not null default '',
  estimated_deal_value numeric(14,2) not null default 0,
  follow_up_date date,
  next_action text not null default '',
  related_quotation_no text,
  related_sales_order_no text,
  outcome_status text not null default 'Scheduled'
    check (outcome_status in ('Scheduled', 'In Progress', 'Completed', 'Follow-up Required', 'Deal Won', 'Deal Lost', 'Cancelled')),
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexing for performance
create index if not exists idx_support_tickets_type on public.support_tickets (support_type);
create index if not exists idx_support_tickets_status on public.support_tickets (status);
create index if not exists idx_support_tickets_assigned on public.support_tickets (assigned_to_name);
create index if not exists idx_sales_site_visits_date on public.sales_site_visits (visit_date desc);
create index if not exists idx_sales_site_visits_customer on public.sales_site_visits (customer_name);

commit;
