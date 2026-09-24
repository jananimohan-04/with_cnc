-- Migration: Add unit_discount column to public.cnc_quotations
-- Adds direct per-unit discount amount (in INR ₹) alongside percentage discount

alter table public.cnc_quotations
  add column if not exists unit_discount numeric default 0;

comment on column public.cnc_quotations.unit_discount is 'Direct per-unit discount amount in currency (₹)';
