-- Store private file attachment metadata for inward records.
-- Files are uploaded to the existing company-scoped inventory-images bucket.
begin;

alter table public.cnc_inwards
  add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.cnc_inwards.attachments is
  'Private company-scoped Storage files attached to this inward record: name, path, size, and MIME type.';

commit;
