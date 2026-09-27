-- Store private file attachment metadata for inward records.
-- Files are uploaded to the existing company-scoped inventory-images bucket.
begin;

alter table public.cnc_inwards
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists product_name text,
  add column if not exists enquiry_id text;

comment on column public.cnc_inwards.attachments is
  'Private company-scoped Storage files attached to this inward record: name, path, size, and MIME type.';
comment on column public.cnc_inwards.product_name is
  'Enquired product this purchased part inward belongs to; used to group its inward records.';

commit;
